import crypto from "node:crypto";

export const MAX_CHAT_HISTORY = 100;

// In-memory, single-process room state; it is lost on restart and clients rejoin.
export class RoomManager {
    constructor({ maxParticipants = 6 } = {}) {
        this.maxParticipants = maxParticipants;
        this.rooms = new Map();
        this.socketRoom = new Map();
    }

    roomOf(socketId) {
        const code = this.socketRoom.get(socketId);
        return code ? { code, room: this.rooms.get(code) } : null;
    }

    participant(socketId) {
        return this.roomOf(socketId)?.room.participants.get(socketId) ?? null;
    }

    sameRoom(a, b) {
        const code = this.socketRoom.get(a);
        return Boolean(code) && code === this.socketRoom.get(b);
    }

    join(code, socketId, { name, userId = null }) {
        if (this.socketRoom.has(socketId)) return { error: "ALREADY_IN_ROOM" };

        let room = this.rooms.get(code);
        if (room?.locked) return { error: "ROOM_LOCKED" };
        if (room && room.participants.size >= this.maxParticipants) return { error: "ROOM_FULL" };

        if (!room) {
            room = { code, participants: new Map(), messages: [], locked: false, createdAt: Date.now() };
            this.rooms.set(code, room);
        }

        const participant = {
            id: socketId,
            name,
            userId,
            isHost: room.participants.size === 0,
            audio: true,
            video: true,
            screen: false,
            hand: false,
            joinedAt: Date.now(),
        };
        room.participants.set(socketId, participant);
        this.socketRoom.set(socketId, code);
        return { room, participant };
    }

    leave(socketId) {
        const found = this.roomOf(socketId);
        if (!found) return null;
        const { code, room } = found;
        const participant = room.participants.get(socketId);
        room.participants.delete(socketId);
        this.socketRoom.delete(socketId);

        let newHost = null;
        if (room.participants.size === 0) {
            this.rooms.delete(code);
        } else if (participant.isHost) {
            newHost = [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
            newHost.isHost = true;
        }
        return { code, participant, newHost };
    }

    updateState(socketId, patch) {
        const p = this.participant(socketId);
        if (!p) return null;
        for (const key of ["audio", "video", "screen", "hand"]) {
            if (typeof patch[key] === "boolean") p[key] = patch[key];
        }
        return p;
    }

    addMessage(socketId, text) {
        const found = this.roomOf(socketId);
        if (!found) return null;
        const sender = found.room.participants.get(socketId);
        const message = { id: crypto.randomUUID(), from: socketId, name: sender.name, text, ts: Date.now() };
        found.room.messages.push(message);
        if (found.room.messages.length > MAX_CHAT_HISTORY) found.room.messages.shift();
        return { code: found.code, message };
    }

    setLocked(hostId, locked) {
        const found = this.roomOf(hostId);
        if (!found || !found.room.participants.get(hostId)?.isHost) return null;
        found.room.locked = Boolean(locked);
        return found;
    }

    hostTarget(hostId, targetId) {
        if (hostId === targetId || !this.sameRoom(hostId, targetId)) return null;
        if (!this.participant(hostId)?.isHost) return null;
        return this.participant(targetId);
    }

    snapshot(code) {
        const room = this.rooms.get(code);
        if (!room) return null;
        return {
            code,
            locked: room.locked,
            maxParticipants: this.maxParticipants,
            participants: [...room.participants.values()].map(publicParticipant),
            messages: [...room.messages],
        };
    }
}

export const publicParticipant = ({ id, name, isHost, audio, video, screen, hand, joinedAt, userId }) => ({
    id,
    name,
    isHost,
    audio,
    video,
    screen,
    hand,
    joinedAt,
    signedIn: Boolean(userId),
});
