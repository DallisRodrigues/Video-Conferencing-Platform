import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestStack } from "./helpers.js";

let stack;
before(async () => {
    stack = await startTestStack();
});
after(async () => {
    await stack.stop();
});

const register = (body) => request(stack.app).post("/api/v1/users/register").send(body);
const login = (body) => request(stack.app).post("/api/v1/users/login").send(body);

describe("health", () => {
    it("reports database readiness", async () => {
        const res = await request(stack.app).get("/health");
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { status: "ok", database: "connected" });
    });

    it("returns JSON 404 for unknown API routes", async () => {
        const res = await request(stack.app).get("/api/v1/nope");
        assert.equal(res.status, 404);
        assert.match(res.body.message, /not found/i);
    });

    it("exposes STUN config without TURN secrets", async () => {
        const res = await request(stack.app).get("/api/v1/ice-servers");
        assert.equal(res.status, 200);
        assert.ok(res.body.iceServers[0].urls.length > 0);
    });
});

describe("registration and login", () => {
    it("validates registration input", async () => {
        const res = await register({ name: "", username: "a", password: "short" });
        assert.equal(res.status, 400);
        assert.ok(res.body.details.name && res.body.details.username && res.body.details.password);
    });

    it("rejects NoSQL operator injection", async () => {
        const res = await login({ username: { $ne: null }, password: { $ne: null } });
        assert.equal(res.status, 400);
    });

    it("registers, normalises the username and rejects duplicates with 409", async () => {
        const ok = await register({ name: "Ada Lovelace", username: "Ada_L", password: "correct horse" });
        assert.equal(ok.status, 201);
        const dup = await register({ name: "Other", username: "ada_l", password: "another pass" });
        assert.equal(dup.status, 409);
    });

    it("rejects a wrong password with 401 and the same message as an unknown user", async () => {
        const wrong = await login({ username: "ada_l", password: "wrong password" });
        const unknown = await login({ username: "nobody_here", password: "wrong password" });
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.equal(wrong.body.message, unknown.body.message);
    });

    it("logs in, returns a token and never exposes the password hash", async () => {
        const res = await login({ username: "ADA_L", password: "correct horse" });
        assert.equal(res.status, 200);
        assert.ok(res.body.token.length >= 40);
        assert.equal(res.body.user.username, "ada_l");
        assert.equal(res.body.user.password, undefined);
    });
});

describe("authenticated routes and history", () => {
    let tokenA;
    let tokenB;
    before(async () => {
        await register({ name: "User A", username: "user_a", password: "password-a" });
        await register({ name: "User B", username: "user_b", password: "password-b" });
        tokenA = (await login({ username: "user_a", password: "password-a" })).body.token;
        tokenB = (await login({ username: "user_b", password: "password-b" })).body.token;
    });

    const auth = (req, token) => req.set("Authorization", `Bearer ${token}`);

    it("requires a valid bearer token", async () => {
        assert.equal((await request(stack.app).get("/api/v1/users/me")).status, 401);
        assert.equal((await auth(request(stack.app).get("/api/v1/users/me"), "x".repeat(43))).status, 401);
        const me = await auth(request(stack.app).get("/api/v1/users/me"), tokenA);
        assert.equal(me.status, 200);
        assert.equal(me.body.user.name, "User A");
    });

    it("validates meeting codes", async () => {
        const res = await auth(request(stack.app).post("/api/v1/users/add_to_activity"), tokenA).send({ meeting_code: "../../etc" });
        assert.equal(res.status, 400);
    });

    it("de-duplicates history and isolates it per user", async () => {
        for (const code of ["abc-defg-hij", "ABC-defg-hij", "team-sync"]) {
            const res = await auth(request(stack.app).post("/api/v1/users/add_to_activity"), tokenA).send({ meeting_code: code });
            assert.equal(res.status, 201);
        }
        const a = await auth(request(stack.app).get("/api/v1/users/get_all_activity"), tokenA);
        assert.equal(a.body.length, 2);
        assert.equal(a.body.find((m) => m.meetingCode === "abc-defg-hij").joinCount, 2);

        const b = await auth(request(stack.app).get("/api/v1/users/get_all_activity"), tokenB);
        assert.equal(b.body.length, 0);

        // User B cannot delete user A's entry.
        const id = a.body[0].id;
        assert.equal((await auth(request(stack.app).delete(`/api/v1/users/activity/${id}`), tokenB)).status, 404);
        assert.equal((await auth(request(stack.app).delete(`/api/v1/users/activity/${id}`), tokenA)).status, 204);
        assert.equal((await auth(request(stack.app).delete("/api/v1/users/activity/not-an-id"), tokenA)).status, 400);
    });

    it("invalidates the token on logout", async () => {
        assert.equal((await auth(request(stack.app).post("/api/v1/users/logout"), tokenB)).status, 204);
        assert.equal((await auth(request(stack.app).get("/api/v1/users/me"), tokenB)).status, 401);
    });
});
