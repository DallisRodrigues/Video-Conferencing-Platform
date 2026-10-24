import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { Meeting } from "../src/models/meeting.model.js";
import { emitAck, nextEvent, noEvent, startTestStack } from "./helpers.js";

let stack;
before(async () => {
    stack = await startTestStack({ maxParticipants: 3 });
});
after(async () => {
    await stack.stop();
});

const join = (socket, room, name = "Tester", extra = {}) => emitAck(socket, "join-call", { room, name, ...extra });

describe("origin check", () => {
    it("rejects WebSocket connections from foreign browser origins", async () => {
        const { io: ioClient } = await import("socket.io-client");
        const s = ioClient(stack.url, {
            transports: ["websocket"],
            extraHeaders: { Origin: "https://evil.example" },
            forceNew: true,
            reconnection: false,
        });
        const err = await new Promise((resolve) => {
            s.once("connect", () => resolve(null));
            s.once("connect_error", resolve);
        });
        s.disconnect();
        assert.ok(err, "connection should be refused");
    });
});

describe("joining", () => {
    it("rejects invalid codes and missing names", async () => {
        const s = await stack.connect();
        assert.equal((await join(s, "bad code!")).code, "INVALID_ROOM");
        assert.equal((await join(s, "good-room", "   ")).code, "INVALID_NAME");
    });

    it("returns the room snapshot and notifies existing members", async () => {
        const a = await stack.connect();
        const b = await stack.connect();
        const ra = await join(a, "Join-Room", "Alice");
        assert.equal(ra.ok, true);
        assert.equal(ra.room.code, "join-room");
        assert.equal(ra.room.participants[0].isHost, true);

        const joined = nextEvent(a, "user-joined");
        const rb = await join(b, "join-room", "Bob", { audio: false });
        assert.equal(rb.room.participants.length, 2);
        const p = await joined;
        assert.equal(p.id, rb.selfId);
        assert.equal(p.name, "Bob");
        assert.equal(p.audio, false);
        assert.equal(p.isHost, false);
    });

    it("enforces capacity", async () => {
        const sockets = await Promise.all([1, 2, 3, 4].map(() => stack.connect()));
        for (const s of sockets.slice(0, 3)) assert.equal((await join(s, "full-room")).ok, true);
        assert.equal((await join(sockets[3], "full-room")).code, "ROOM_FULL");
    });
});

describe("signaling", () => {
    it("relays to the target with a server-assigned sender and drops cross-room or spoofed targets", async () => {
        const a = await stack.connect();
        const b = await stack.connect();
        const outsider = await stack.connect();
        await join(a, "signal-room", "A");
        await join(b, "signal-room", "B");
        await join(outsider, "other-room", "O");

        const got = nextEvent(b, "signal");
        a.emit("signal", { to: b.id, from: "spoofed", description: { type: "offer", sdp: "v=0" } });
        const msg = await got;
        assert.equal(msg.from, a.id);
        assert.deepEqual(msg.description, { type: "offer", sdp: "v=0" });

        const outsiderSilent = noEvent(outsider, "signal");
        a.emit("signal", { to: outsider.id, description: { type: "offer", sdp: "v=0" } });
        outsider.emit("signal", { to: b.id, candidate: { candidate: "x" } });
        assert.equal(await outsiderSilent, true);
        assert.equal(await noEvent(b, "signal"), true);
    });

    it("does not relay for sockets that never joined", async () => {
        const a = await stack.connect();
        const b = await stack.connect();
        await join(b, "lonely-room", "B");
        a.emit("signal", { to: b.id, candidate: null });
        assert.equal(await noEvent(b, "signal"), true);
    });
});

describe("chat, state and reactions", () => {
    it("broadcasts sanitised chat with the server-known name", async () => {
        const a = await stack.connect();
        const b = await stack.connect();
        await join(a, "chat-room", "Alice");
        await join(b, "chat-room", "Bob");
        const got = nextEvent(b, "chat-message");
        const ack = await emitAck(a, "chat-message", { text: "  hi\u0007 <b>there</b>  ", name: "Mallory" });
        assert.equal(ack.ok, true);
        const msg = await got;
        assert.equal(msg.name, "Alice");
        assert.equal(msg.text, "hi <b>there</b>");

        assert.equal((await emitAck(a, "chat-message", { text: "   " })).code, "INVALID_PAYLOAD");
    });

    it("rate-limits chat floods", async () => {
        const a = await stack.connect();
        await join(a, "flood-room", "A");
        const results = [];
        for (let i = 0; i < 12; i++) results.push(await emitAck(a, "chat-message", { text: `m${i}` }));
        assert.ok(results.some((r) => r.code === "RATE_LIMITED"));
    });

    it("rejects chat from sockets outside a room", async () => {
        const a = await stack.connect();
        assert.equal((await emitAck(a, "chat-message", { text: "hello" })).code, "NOT_IN_ROOM");
    });

    it("broadcasts media state and hand raises", async () => {
        const a = await stack.connect();
        const b = await stack.connect();
        await join(a, "state-room", "A");
        await join(b, "state-room", "B");
        const update = nextEvent(b, "participant-updated");
        a.emit("media-state", { audio: false, video: true, screen: true, isHost: true });
        const p = await update;
        assert.equal(p.id, a.id);
        assert.equal(p.audio, false);
        assert.equal(p.screen, true);

        const hand = nextEvent(b, "participant-updated");
        a.emit("raise-hand", { raised: true });
        assert.equal((await hand).hand, true);

        const reaction = nextEvent(b, "reaction");
        a.emit("reaction", { emoji: "🎉" });
        assert.deepEqual(await reaction, { from: a.id, emoji: "🎉" });
        a.emit("reaction", { emoji: "<script>" });
        assert.equal(await noEvent(b, "reaction"), true);
    });
});

describe("host controls and lifecycle", () => {
    it("lets only the host lock, mute-request and remove", async () => {
        const host = await stack.connect();
        const guest = await stack.connect();
        await join(host, "host-room", "Host");
        await join(guest, "host-room", "Guest");

        assert.equal((await emitAck(guest, "host:lock", { locked: true })).code, "FORBIDDEN");
        assert.equal((await emitAck(guest, "host:remove", { id: host.id })).code, "FORBIDDEN");

        const muteReq = nextEvent(guest, "mute-request");
        assert.equal((await emitAck(host, "host:mute", { id: guest.id })).ok, true);
        assert.equal((await muteReq).by, "Host");

        const locked = nextEvent(guest, "room-updated");
        assert.equal((await emitAck(host, "host:lock", { locked: true })).ok, true);
        assert.equal((await locked).locked, true);
        const late = await stack.connect();
        assert.equal((await join(late, "host-room", "Late")).code, "ROOM_LOCKED");

        const removed = nextEvent(guest, "removed");
        const left = nextEvent(host, "user-left");
        assert.equal((await emitAck(host, "host:remove", { id: guest.id })).ok, true);
        await removed;
        assert.deepEqual(await left, { id: guest.id, reason: "removed" });

        // The removed socket can no longer signal into the room.
        guest.emit("signal", { to: host.id, candidate: null });
        assert.equal(await noEvent(host, "signal"), true);
    });

    it("cleans up on disconnect, transfers host and frees capacity", async () => {
        const a = await stack.connect();
        const b = await stack.connect();
        await join(a, "life-room", "A");
        await join(b, "life-room", "B");

        const aId = a.id;
        const left = nextEvent(b, "user-left");
        const promoted = nextEvent(b, "participant-updated");
        a.disconnect();
        assert.deepEqual(await left, { id: aId, reason: "disconnected" });
        const p = await promoted;
        assert.equal(p.id, b.id);
        assert.equal(p.isHost, true);

        // A reconnecting client gets a fresh id and a correct participant list.
        const a2 = await stack.connect();
        const res = await join(a2, "life-room", "A");
        assert.deepEqual(res.room.participants.map((x) => x.name).sort(), ["A", "B"]);
    });

    it("identifies signed-in users from the session token and records history", async () => {
        await request(stack.app).post("/api/v1/users/register").send({ name: "Sock User", username: "sock_user", password: "password-1" });
        const { token } = (await request(stack.app).post("/api/v1/users/login").send({ username: "sock_user", password: "password-1" })).body;

        const s = await stack.connect({ token });
        const res = await join(s, "history-room", "");
        assert.equal(res.ok, true);
        const me = res.room.participants.find((p) => p.id === res.selfId);
        assert.equal(me.name, "Sock User");
        assert.equal(me.signedIn, true);

        await new Promise((r) => setTimeout(r, 100));
        assert.equal(await Meeting.countDocuments({ meetingCode: "history-room" }), 1);

        const fake = await stack.connect({ token: "f".repeat(43) });
        const fr = await join(fake, "history-room", "Guest");
        assert.equal(fr.room.participants.find((p) => p.id === fr.selfId).signedIn, false);
    });
});
