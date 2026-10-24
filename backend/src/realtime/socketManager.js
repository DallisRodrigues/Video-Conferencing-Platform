import { Server } from "socket.io";
import { config } from "../config/env.js";
import { corsOrigin } from "../app.js";
import { Meeting } from "../models/meeting.model.js";
import { findUserByToken } from "../utils/sessions.js";
import { createLimiter } from "../utils/rateLimiter.js";
import { logger } from "../utils/logger.js";
import { cleanMultiline, normalizeDisplayName, normalizeMeetingCode } from "../utils/validation.js";
import { RoomManager, publicParticipant } from "./roomManager.js";
import { ERRORS, EVENTS, REACTIONS } from "./events.js";

const MAX_SDP_LENGTH = 64 * 1024;
const MAX_CANDIDATE_LENGTH = 1024;
const MAX_CHAT_LENGTH = 1000;

const channel = (code) => `room:${code}`;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function sanitizeSignal(payload) {
    if (!isObject(payload) || typeof payload.to !== "string") return null;
    const out = {};
    if (payload.description !== undefined) {
        const d = payload.description;
        if (!isObject(d) || !["offer", "answer"].includes(d.type)) return null;
        if (typeof d.sdp !== "string" || d.sdp.length > MAX_SDP_LENGTH) return null;
        out.description = { type: d.type, sdp: d.sdp };
    }
    if (payload.candidate !== undefined) {
        const c = payload.candidate;
        if (c === null) {
            out.candidate = null;
        } else {
            if (!isObject(c) || typeof c.candidate !== "string" || c.candidate.length > MAX_CANDIDATE_LENGTH) return null;
            out.candidate = {
                candidate: c.candidate,
                sdpMid: typeof c.sdpMid === "string" ? c.sdpMid.slice(0, 64) : null,
                sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null,
                usernameFragment: typeof c.usernameFragment === "string" ? c.usernameFragment.slice(0, 256) : null,
            };
        }
    }
    if (!("description" in out) && !("candidate" in out)) return null;
    return { to: payload.to, ...out };
}

async function recordHistory(userId, meetingCode) {
    try {
        await Meeting.updateOne(
            { user: userId, meetingCode },
            { $set: { date: new Date() }, $inc: { joinCount: 1 } },
            { upsert: true }
        );
    } catch (err) {
        logger.warn("Could not record meeting history:", err.message);
    }
}

export const connectToSocket = (server, { maxParticipants = config.maxParticipants, clientOrigins = config.clientOrigins } = {}) => {
    const io = new Server(server, {
        cors: { origin: corsOrigin(clientOrigins), methods: ["GET", "POST"] },
        // CORS does not cover WebSocket upgrades, so check Origin here as well.
        allowRequest: (req, callback) => {
            const origin = req.headers.origin;
            if (!origin || clientOrigins.includes(origin)) return callback(null, true);
            let sameHost = false;
            try {
                sameHost = new URL(origin).host === req.headers.host;
            } catch {
                sameHost = false;
            }
            callback(null, sameHost);
        },
        maxHttpBufferSize: 100_000,
        pingInterval: 20_000,
        pingTimeout: 20_000,
    });
    const rooms = new RoomManager({ maxParticipants });
    io.rooms = rooms;

    // A valid session token marks the socket as signed in; identity is never read from payloads.
    io.use(async (socket, next) => {
        socket.data.user = null;
        const token = socket.handshake.auth?.token;
        if (token) {
            try {
                const user = await findUserByToken(token);
                if (user) socket.data.user = { id: user._id.toString(), name: user.name };
            } catch {
            }
        }
        next();
    });

    io.on("connection", (socket) => {
        const limits = {
            join: createLimiter(10, 60_000),
            signal: createLimiter(400, 10_000),
            chat: createLimiter(8, 5_000),
            state: createLimiter(30, 10_000),
            reaction: createLimiter(10, 10_000),
            host: createLimiter(20, 10_000),
        };
        const reply = (ack, body) => typeof ack === "function" && ack(body);
        const fail = (ack, code) => reply(ack, { ok: false, code, error: ERRORS[code] });

        const leaveRoom = (reason) => {
            const result = rooms.leave(socket.id);
            if (!result) return;
            socket.leave(channel(result.code));
            socket.to(channel(result.code)).emit(EVENTS.USER_LEFT, { id: socket.id, reason });
            if (result.newHost) {
                io.to(channel(result.code)).emit(EVENTS.PARTICIPANT_UPDATED, publicParticipant(result.newHost));
            }
        };

        socket.on(EVENTS.JOIN, (payload, ack) => {
            if (!limits.join()) return fail(ack, "RATE_LIMITED");
            const code = normalizeMeetingCode(payload?.room);
            if (!code) return fail(ack, "INVALID_ROOM");
            const name = normalizeDisplayName(payload?.name) || socket.data.user?.name;
            if (!name) return fail(ack, "INVALID_NAME");

            const result = rooms.join(code, socket.id, { name, userId: socket.data.user?.id ?? null });
            if (result.error) return fail(ack, result.error);

            const { participant } = result;
            if (payload && typeof payload.audio === "boolean") participant.audio = payload.audio;
            if (payload && typeof payload.video === "boolean") participant.video = payload.video;

            socket.join(channel(code));
            socket.to(channel(code)).emit(EVENTS.USER_JOINED, publicParticipant(participant));
            reply(ack, { ok: true, selfId: socket.id, room: rooms.snapshot(code) });

            if (socket.data.user) recordHistory(socket.data.user.id, code);
        });

        socket.on(EVENTS.SIGNAL, (payload) => {
            if (!limits.signal()) return;
            const signal = sanitizeSignal(payload);
            // Only relay to a peer that is in the same room as the sender.
            if (!signal || signal.to === socket.id || !rooms.sameRoom(socket.id, signal.to)) return;
            const { to, ...data } = signal;
            io.to(to).emit(EVENTS.SIGNAL, { from: socket.id, ...data });
        });

        socket.on(EVENTS.CHAT, (payload, ack) => {
            if (!rooms.roomOf(socket.id)) return fail(ack, "NOT_IN_ROOM");
            if (!limits.chat()) return fail(ack, "RATE_LIMITED");
            const text = cleanMultiline(payload?.text, MAX_CHAT_LENGTH);
            if (!text) return fail(ack, "INVALID_PAYLOAD");
            const { code, message } = rooms.addMessage(socket.id, text);
            io.to(channel(code)).emit(EVENTS.CHAT, message);
            reply(ack, { ok: true, id: message.id });
        });

        const broadcastState = (patch) => {
            const found = rooms.roomOf(socket.id);
            if (!found) return;
            const p = rooms.updateState(socket.id, patch);
            io.to(channel(found.code)).emit(EVENTS.PARTICIPANT_UPDATED, publicParticipant(p));
        };

        socket.on(EVENTS.MEDIA_STATE, (payload) => {
            if (!limits.state() || !isObject(payload)) return;
            const { audio, video, screen } = payload;
            broadcastState({ audio, video, screen });
        });

        socket.on(EVENTS.RAISE_HAND, (payload) => {
            if (!limits.state() || !isObject(payload)) return;
            broadcastState({ hand: Boolean(payload.raised) });
        });

        socket.on(EVENTS.REACTION, (payload) => {
            const found = rooms.roomOf(socket.id);
            if (!found || !limits.reaction() || !REACTIONS.includes(payload?.emoji)) return;
            io.to(channel(found.code)).emit(EVENTS.REACTION, { from: socket.id, emoji: payload.emoji });
        });

        socket.on(EVENTS.HOST_LOCK, (payload, ack) => {
            if (!limits.host()) return fail(ack, "RATE_LIMITED");
            const found = rooms.setLocked(socket.id, Boolean(payload?.locked));
            if (!found) return fail(ack, "FORBIDDEN");
            io.to(channel(found.code)).emit(EVENTS.ROOM_UPDATED, { locked: found.room.locked });
            reply(ack, { ok: true });
        });

        socket.on(EVENTS.HOST_MUTE, (payload, ack) => {
            if (!limits.host()) return fail(ack, "RATE_LIMITED");
            const target = rooms.hostTarget(socket.id, payload?.id);
            if (!target) return fail(ack, "FORBIDDEN");
            // The browser owns the microphone; the host can only ask it to mute.
            io.to(target.id).emit(EVENTS.MUTE_REQUEST, { by: rooms.participant(socket.id).name });
            reply(ack, { ok: true });
        });

        socket.on(EVENTS.HOST_REMOVE, (payload, ack) => {
            if (!limits.host()) return fail(ack, "RATE_LIMITED");
            const target = rooms.hostTarget(socket.id, payload?.id);
            if (!target) return fail(ack, "FORBIDDEN");
            const targetSocket = io.sockets.sockets.get(target.id);
            const found = rooms.roomOf(target.id);
            rooms.leave(target.id);
            if (targetSocket) {
                targetSocket.emit(EVENTS.REMOVED, { by: rooms.participant(socket.id)?.name });
                targetSocket.leave(channel(found.code));
            }
            io.to(channel(found.code)).emit(EVENTS.USER_LEFT, { id: target.id, reason: "removed" });
            reply(ack, { ok: true });
        });

        socket.on(EVENTS.LEAVE, (_payload, ack) => {
            leaveRoom("left");
            reply(ack, { ok: true });
        });

        socket.on("disconnect", () => leaveRoom("disconnected"));
    });

    return io;
};
