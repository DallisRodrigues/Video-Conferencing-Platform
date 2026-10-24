import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import request from "supertest";
import { emitAck, startTestStack } from "./helpers.js";

const SECRET = "test-turn-secret";
const TURN_URL = "turn:turn.example.test:3478";
const iceConfig = (overrides = {}) => ({
    stunUrls: ["stun:stun.example.test:3478"],
    turnUrls: [TURN_URL],
    turnUsername: "",
    turnCredential: "",
    turnSecret: "",
    turnTtlSeconds: 600,
    ...overrides,
});

const join = (socket, room, name = "Tester") => emitAck(socket, "join-call", { room, name });
const turnEntry = (servers) => servers.find((s) => s.urls.includes(TURN_URL));

describe("ICE servers with a TURN shared secret", () => {
    let stack;
    before(async () => {
        stack = await startTestStack({ ice: iceConfig({ turnSecret: SECRET }) });
    });
    after(() => stack.stop());

    it("serves only public STUN over unauthenticated HTTP", async () => {
        const res = await request(stack.app).get("/api/v1/ice-servers");
        assert.equal(res.status, 200);
        assert.equal(res.headers["cache-control"], "no-store");
        assert.deepEqual(res.body, { iceServers: [{ urls: ["stun:stun.example.test:3478"] }] });
    });

    it("gives room members short-lived TURN credentials in the join ack, never the secret", async () => {
        const s = await stack.connect();
        const before = Math.floor(Date.now() / 1000);
        const res = await join(s, "ice-room");
        assert.equal(res.ok, true);

        const turn = turnEntry(res.iceServers);
        assert.ok(turn, "TURN entry present");
        const [expiry, identity] = turn.username.split(":");
        assert.equal(identity, "guest");
        assert.ok(Number(expiry) >= before + 600 && Number(expiry) <= before + 602);
        assert.equal(turn.credential, crypto.createHmac("sha1", SECRET).update(turn.username).digest("base64"));
        assert.ok(!JSON.stringify(res).includes(SECRET));
    });

    it("gives rejected joins no ICE configuration", async () => {
        const s = await stack.connect();
        const res = await join(s, "bad code!");
        assert.equal(res.ok, false);
        assert.equal(res.iceServers, undefined);
    });
});

describe("ICE servers with static TURN credentials", () => {
    let stack;
    before(async () => {
        stack = await startTestStack({ ice: iceConfig({ turnUsername: "static-user", turnCredential: "static-pass" }) });
    });
    after(() => stack.stop());

    it("never sends reusable credentials to unauthenticated HTTP callers", async () => {
        const res = await request(stack.app).get("/api/v1/ice-servers");
        assert.ok(!JSON.stringify(res.body).includes("static-pass"));
        assert.equal(turnEntry(res.body.iceServers), undefined);
    });

    it("sends them only to sockets that joined a room", async () => {
        const host = await stack.connect();
        await join(host, "locked-ice-room", "Host");
        await emitAck(host, "host:lock", { locked: true });
        const late = await stack.connect();
        const denied = await join(late, "locked-ice-room", "Late");
        assert.equal(denied.code, "ROOM_LOCKED");
        assert.equal(denied.iceServers, undefined);

        const member = await stack.connect();
        const ok = await join(member, "open-ice-room", "Member");
        assert.deepEqual(turnEntry(ok.iceServers), { urls: [TURN_URL], username: "static-user", credential: "static-pass" });
    });
});

describe("ICE servers with incomplete TURN configuration", () => {
    let stack;
    before(async () => {
        stack = await startTestStack({ ice: iceConfig() });
    });
    after(() => stack.stop());

    it("falls back to STUN only when TURN_URLS has no credentials", async () => {
        const s = await stack.connect();
        const res = await join(s, "stun-only-room");
        assert.deepEqual(res.iceServers, [{ urls: ["stun:stun.example.test:3478"] }]);
    });
});
