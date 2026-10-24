// Socket.IO event contract shared by server and client (mirrored in
// frontend/src/lib/meeting/events.js). Keep both files in sync.
export const EVENTS = {
    // client -> server
    JOIN: "join-call",
    LEAVE: "leave-call",
    SIGNAL: "signal",
    CHAT: "chat-message",
    MEDIA_STATE: "media-state",
    RAISE_HAND: "raise-hand",
    REACTION: "reaction",
    HOST_LOCK: "host:lock",
    HOST_REMOVE: "host:remove",
    HOST_MUTE: "host:mute",

    // server -> client
    USER_JOINED: "user-joined",
    USER_LEFT: "user-left",
    PARTICIPANT_UPDATED: "participant-updated",
    ROOM_UPDATED: "room-updated",
    MUTE_REQUEST: "mute-request",
    REMOVED: "removed",
};

export const ERRORS = {
    INVALID_ROOM: "That meeting code is not valid.",
    INVALID_NAME: "Please enter a display name.",
    ROOM_FULL: "This meeting is full.",
    ROOM_LOCKED: "The host has locked this meeting.",
    ALREADY_IN_ROOM: "You are already in a meeting on this connection.",
    NOT_IN_ROOM: "You are not in this meeting.",
    RATE_LIMITED: "You're doing that too often. Slow down a little.",
    INVALID_PAYLOAD: "Invalid request.",
    FORBIDDEN: "Only the host can do that.",
};

export const REACTIONS = ["👍", "👏", "😂", "❤️", "🎉", "😮"];
