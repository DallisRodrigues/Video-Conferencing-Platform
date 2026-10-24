import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_CHAT_HISTORY, RoomManager } from "../src/realtime/roomManager.js";
import { sanitizeSignal } from "../src/realtime/socketManager.js";
import { buildMongoUri } from "../src/config/env.js";
import { buildIceServers } from "../src/utils/ice.js";

describe("RoomManager", () => {
    it("makes the first joiner host and enforces capacity", () => {
        const rooms = new RoomManager({ maxParticipants: 2 });
        assert.equal(rooms.join("room-a", "s1", { name: "A" }).participant.isHost, true);
        assert.equal(rooms.join("room-a", "s2", { name: "B" }).participant.isHost, false);
        assert.equal(rooms.join("room-a", "s3", { name: "C" }).error, "ROOM_FULL");
    });

    it("rejects joining two rooms from one socket", () => {
        const rooms = new RoomManager();
        rooms.join("room-a", "s1", { name: "A" });
        assert.equal(rooms.join("room-b", "s1", { name: "A" }).error, "ALREADY_IN_ROOM");
    });

    it("promotes the earliest remaining participant when the host leaves and deletes empty rooms", () => {
        const rooms = new RoomManager();
        rooms.join("room-a", "s1", { name: "A" });
        rooms.join("room-a", "s2", { name: "B" });
        rooms.join("room-a", "s3", { name: "C" });
        const { newHost } = rooms.leave("s1");
        assert.equal(newHost.id, "s2");
        rooms.leave("s2");
        rooms.leave("s3");
        assert.equal(rooms.rooms.size, 0);
        assert.equal(rooms.leave("s3"), null, "double leave is a no-op");
    });

    it("only lets the host lock or target others", () => {
        const rooms = new RoomManager();
        rooms.join("room-a", "s1", { name: "A" });
        rooms.join("room-a", "s2", { name: "B" });
        rooms.join("room-b", "s9", { name: "Z" });
        assert.equal(rooms.setLocked("s2", true), null);
        assert.ok(rooms.setLocked("s1", true));
        assert.equal(rooms.join("room-a", "s3", { name: "C" }).error, "ROOM_LOCKED");
        assert.equal(rooms.hostTarget("s2", "s1"), null);
        assert.equal(rooms.hostTarget("s1", "s9"), null, "cannot target another room");
        assert.equal(rooms.hostTarget("s1", "s2").id, "s2");
    });

    it("caps chat history", () => {
        const rooms = new RoomManager();
        rooms.join("room-a", "s1", { name: "A" });
        for (let i = 0; i < MAX_CHAT_HISTORY + 5; i++) rooms.addMessage("s1", `m${i}`);
        const { messages } = rooms.snapshot("room-a");
        assert.equal(messages.length, MAX_CHAT_HISTORY);
        assert.equal(messages[0].text, "m5");
    });

    it("only accepts boolean state fields", () => {
        const rooms = new RoomManager();
        rooms.join("room-a", "s1", { name: "A" });
        const p = rooms.updateState("s1", { audio: false, isHost: true, video: "yes" });
        assert.equal(p.audio, false);
        assert.equal(p.video, true);
    });
});

describe("sanitizeSignal", () => {
    it("keeps only known fields", () => {
        const s = sanitizeSignal({ to: "x", from: "spoof", description: { type: "offer", sdp: "v=0", extra: 1 } });
        assert.deepEqual(s, { to: "x", description: { type: "offer", sdp: "v=0" } });
    });

    it("rejects malformed and oversized payloads", () => {
        assert.equal(sanitizeSignal(null), null);
        assert.equal(sanitizeSignal({ to: "x" }), null);
        assert.equal(sanitizeSignal({ to: "x", description: { type: "pranswer", sdp: "" } }), null);
        assert.equal(sanitizeSignal({ to: "x", description: { type: "offer", sdp: "a".repeat(70_000) } }), null);
        assert.equal(sanitizeSignal({ to: "x", candidate: { candidate: 5 } }), null);
    });

    it("accepts end-of-candidates", () => {
        assert.deepEqual(sanitizeSignal({ to: "x", candidate: null }), { to: "x", candidate: null });
    });
});

describe("config helpers", () => {
    it("leaves a URI that already has credentials untouched", () => {
        const uri = "mongodb+srv://u:p@cluster.example.mongodb.net/";
        assert.equal(buildMongoUri({ uri, username: "other", password: "x" }), uri);
    });

    it("fills Atlas placeholders with URI-encoded credentials", () => {
        const out = buildMongoUri({ uri: "mongodb+srv://<username>:<db_password>@c.mongodb.net/", username: "me", password: "p@ss/word" });
        assert.equal(out, "mongodb+srv://me:p%40ss%2Fword@c.mongodb.net/");
    });

    it("injects credentials when the URI has none", () => {
        assert.equal(buildMongoUri({ uri: "mongodb://localhost:27017", username: "a", password: "b" }), "mongodb://a:b@localhost:27017");
    });

    it("issues short-lived TURN credentials without exposing the secret", () => {
        const servers = buildIceServers({ stunUrls: ["stun:s"], turnUrls: ["turn:t"], turnSecret: "s3cret", turnTtlSeconds: 60 });
        const turn = servers[1];
        assert.match(turn.username, /^\d+:guest$/);
        assert.ok(!JSON.stringify(servers).includes("s3cret"));
    });
});
