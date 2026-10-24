// Mirror of backend/src/realtime/events.js. Keep both files in sync.
export const EVENTS = {
  JOIN: 'join-call',
  LEAVE: 'leave-call',
  SIGNAL: 'signal',
  CHAT: 'chat-message',
  MEDIA_STATE: 'media-state',
  RAISE_HAND: 'raise-hand',
  REACTION: 'reaction',
  HOST_LOCK: 'host:lock',
  HOST_REMOVE: 'host:remove',
  HOST_MUTE: 'host:mute',

  USER_JOINED: 'user-joined',
  USER_LEFT: 'user-left',
  PARTICIPANT_UPDATED: 'participant-updated',
  ROOM_UPDATED: 'room-updated',
  MUTE_REQUEST: 'mute-request',
  REMOVED: 'removed',
}

export const REACTIONS = ['👍', '👏', '😂', '❤️', '🎉', '😮']
