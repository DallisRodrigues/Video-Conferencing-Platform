import { io } from 'socket.io-client'
import { API_BASE, api, tokenStore } from '../api'
import { getInitialTracks, getTrack, stopTrack } from '../media'
import { EVENTS } from './events'

const FALLBACK_ICE = [{ urls: ['stun:stun.l.google.com:19302'] }]
const PREFS_KEY = 'vcp:media-prefs'
const MAX_ICE_RESTARTS = 3

export function loadMediaPrefs() {
  try {
    return { audio: true, video: true, audioDevice: '', videoDevice: '', ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch {
    return { audio: true, video: true, audioDevice: '', videoDevice: '' }
  }
}

function saveMediaPrefs(patch) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadMediaPrefs(), ...patch }))
  } catch {
    /* storage unavailable */
  }
}

// Owns local media, the Socket.IO connection and one RTCPeerConnection per remote participant.
// To avoid offer glare, the newcomer always sends the offers and existing members only answer.
// Each peer has one fixed audio and one video transceiver, so mute, camera switches and screen
// sharing use replaceTrack() and never renegotiate; only the initiator renegotiates (ICE restart).
export class MeetingClient {
  constructor() {
    this.listeners = new Set()
    this.peers = new Map()
    this.socket = null
    this.iceServers = FALLBACK_ICE
    this.audioTrack = null
    this.cameraTrack = null
    this.screenTrack = null
    this.prefs = loadMediaPrefs()
    this.busy = { audio: false, video: false }
    this.state = {
      status: 'idle', // idle | connecting | joined | reconnecting | left | removed | error
      error: null,
      code: null,
      selfId: null,
      self: null,
      room: { locked: false, maxParticipants: 6 },
      participants: [],
      messages: [],
      reactions: [],
      notice: null,
      local: {
        audio: false,
        video: false,
        screen: false,
        previewStream: null,
        audioStream: null,
        audioError: null,
        videoError: null,
        ready: false,
      },
    }
  }

  subscribe = (fn) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => this.state

  set(patch) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  setLocal(patch) {
    this.set({ local: { ...this.state.local, ...patch } })
  }

  notify(text, tone = 'info') {
    this.set({ notice: { id: crypto.randomUUID(), text, tone } })
  }

  updateParticipant(id, patch) {
    if (!this.state.participants.some((p) => p.id === id)) return
    this.set({ participants: this.state.participants.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }

  currentVideoTrack() {
    return this.screenTrack || this.cameraTrack
  }

  refreshPreview() {
    const video = this.currentVideoTrack()
    this.setLocal({
      previewStream: video ? new MediaStream([video]) : null,
      audioStream: this.audioTrack ? new MediaStream([this.audioTrack]) : null,
    })
  }

  async startPreview() {
    if (this.previewStarted) return
    this.previewStarted = true
    const { audio, video, audioDevice, videoDevice } = this.prefs
    const res = await getInitialTracks({ audio, video, audioDeviceId: audioDevice, videoDeviceId: videoDevice })
    if (this.state.status === 'left') {
      stopTrack(res.audioTrack)
      stopTrack(res.videoTrack)
      return
    }
    this.audioTrack = res.audioTrack
    this.cameraTrack = res.videoTrack
    if (this.cameraTrack) this.watchCamera(this.cameraTrack)
    this.setLocal({
      audio: Boolean(this.audioTrack),
      video: Boolean(this.cameraTrack),
      audioError: res.audioError,
      videoError: res.videoError,
      ready: true,
    })
    this.refreshPreview()
  }

  watchCamera(track) {
    track.onended = () => {
      if (this.cameraTrack === track) this.setVideoEnabled(false)
    }
  }

  replaceOutgoing(kind, track) {
    for (const peer of this.peers.values()) {
      const tx = peer.transceivers[kind]
      if (tx && peer.pc.signalingState !== 'closed') {
        tx.sender
          .replaceTrack(track)
          .then(() => kind === 'video' && this.applyVideoPreference(peer))
          .catch((err) => console.warn('[webrtc] replaceTrack failed', err.message))
      }
    }
  }

  // Keep screen shares sharp (drop frames, not resolution); keep camera video smooth.
  applyVideoPreference(peer) {
    const sender = peer.transceivers.video?.sender
    if (!sender?.getParameters) return
    try {
      const params = sender.getParameters()
      if (!params.encodings?.length) return
      params.degradationPreference = this.screenTrack ? 'maintain-resolution' : 'balanced'
      sender.setParameters(params).catch(() => {})
    } catch {
    }
  }

  async setAudioEnabled(on) {
    if (this.busy.audio) return
    this.busy.audio = true
    try {
      if (on && !this.audioTrack) {
        const { track, error } = await getTrack('audio', this.prefs.audioDevice)
        if (error) {
          this.setLocal({ audioError: error, audio: false })
          return
        }
        this.audioTrack = track
        this.replaceOutgoing('audio', track)
      }
      if (this.audioTrack) this.audioTrack.enabled = on
      this.prefs.audio = on
      saveMediaPrefs({ audio: on })
      this.setLocal({ audio: on && Boolean(this.audioTrack), audioError: on ? null : this.state.local.audioError })
      this.refreshPreview()
      this.emitMediaState()
    } finally {
      this.busy.audio = false
    }
  }

  async setVideoEnabled(on) {
    if (this.busy.video) return
    this.busy.video = true
    try {
      if (on && !this.cameraTrack) {
        const { track, error } = await getTrack('video', this.prefs.videoDevice)
        if (error) {
          this.setLocal({ videoError: error, video: false })
          return
        }
        this.cameraTrack = track
        this.watchCamera(track)
      }
      if (!on && this.cameraTrack) {
        // Stop the track (not just disable it) so the camera light turns off.
        stopTrack(this.cameraTrack)
        this.cameraTrack = null
      }
      if (!this.screenTrack) this.replaceOutgoing('video', this.cameraTrack)
      this.prefs.video = on
      saveMediaPrefs({ video: on })
      this.setLocal({ video: Boolean(this.cameraTrack), videoError: on ? null : this.state.local.videoError })
      this.refreshPreview()
      this.emitMediaState()
    } finally {
      this.busy.video = false
    }
  }

  async switchDevice(kind, deviceId) {
    this.prefs[kind === 'audio' ? 'audioDevice' : 'videoDevice'] = deviceId
    saveMediaPrefs({ [kind === 'audio' ? 'audioDevice' : 'videoDevice']: deviceId })
    if (kind === 'audio' && this.audioTrack) {
      const { track, error } = await getTrack('audio', deviceId)
      if (error) return this.setLocal({ audioError: error })
      track.enabled = this.state.local.audio
      stopTrack(this.audioTrack)
      this.audioTrack = track
      this.replaceOutgoing('audio', track)
    }
    if (kind === 'video' && this.cameraTrack) {
      // Release the old camera first; many phones can't open two at once.
      stopTrack(this.cameraTrack)
      const { track, error } = await getTrack('video', deviceId)
      this.cameraTrack = track || null
      if (track) this.watchCamera(track)
      if (!this.screenTrack) this.replaceOutgoing('video', this.cameraTrack)
      this.setLocal({ video: Boolean(track), videoError: error || null })
      this.emitMediaState()
    }
    this.refreshPreview()
  }

  async startScreenShare() {
    if (this.screenTrack) return
    let stream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
        // Chromium hints: don't offer this tab (avoids a hall-of-mirrors effect).
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      })
    } catch (err) {
      if (err?.name !== 'NotAllowedError') this.notify('Screen sharing could not start.', 'error')
      return
    }
    const track = stream.getVideoTracks()[0]
    if ('contentHint' in track) track.contentHint = 'detail'
    track.onended = () => this.stopScreenShare()
    this.screenTrack = track
    this.replaceOutgoing('video', track)
    this.setLocal({ screen: true })
    this.refreshPreview()
    this.emitMediaState()
  }

  stopScreenShare() {
    if (!this.screenTrack) return
    this.screenTrack.onended = null
    stopTrack(this.screenTrack)
    this.screenTrack = null
    this.replaceOutgoing('video', this.cameraTrack)
    this.setLocal({ screen: false })
    this.refreshPreview()
    this.emitMediaState()
  }

  stopLocalMedia() {
    stopTrack(this.audioTrack)
    stopTrack(this.cameraTrack)
    stopTrack(this.screenTrack)
    this.audioTrack = this.cameraTrack = this.screenTrack = null
    this.setLocal({ audio: false, video: false, screen: false, previewStream: null, audioStream: null })
  }

  async join({ code, name }) {
    if (this.socket) return
    this.code = code
    this.name = name
    this.set({ status: 'connecting', error: null, code })

    try {
      const { iceServers } = await api('/api/v1/ice-servers', { auth: false })
      if (Array.isArray(iceServers) && iceServers.length) this.iceServers = iceServers
    } catch {
    }
    if (this.state.status === 'left') return

    const socket = io(API_BASE || undefined, {
      auth: { token: tokenStore.get() || undefined },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 5000,
    })
    this.socket = socket

    socket.on('connect', () => this.emitJoin())
    socket.on('connect_error', () => {
      if (this.isTerminal()) return
      this.set({ status: 'reconnecting', error: "Can't reach the meeting server. Retrying…" })
    })
    socket.on('disconnect', (reason) => {
      if (this.isTerminal()) return
      // The server has already dropped us from the room, so rebuild every peer on reconnect.
      this.teardownPeers()
      this.set({ status: 'reconnecting', participants: [], error: null })
      if (reason === 'io server disconnect') socket.connect()
    })

    socket.on(EVENTS.USER_JOINED, (p) => this.addParticipant(p))
    socket.on(EVENTS.USER_LEFT, ({ id, reason }) => {
      const p = this.state.participants.find((x) => x.id === id)
      this.removeParticipant(id)
      if (p && reason === 'removed') this.notify(`${p.name} was removed from the meeting`)
    })
    socket.on(EVENTS.PARTICIPANT_UPDATED, (p) => {
      if (p.id === this.state.selfId) {
        if (p.isHost && !this.state.self?.isHost) this.notify('You are now the host')
        this.set({ self: p })
      } else {
        this.updateParticipant(p.id, p)
      }
    })
    socket.on(EVENTS.ROOM_UPDATED, (room) => this.set({ room: { ...this.state.room, ...room } }))
    socket.on(EVENTS.SIGNAL, (msg) => this.handleSignal(msg))
    socket.on(EVENTS.CHAT, (m) => this.set({ messages: [...this.state.messages, m].slice(-200) }))
    socket.on(EVENTS.REACTION, (r) => this.pushReaction(r))
    socket.on(EVENTS.MUTE_REQUEST, ({ by }) => {
      this.setAudioEnabled(false)
      this.notify(`${by} muted your microphone`)
    })
    socket.on(EVENTS.REMOVED, () => {
      this.set({ status: 'removed' })
      this.cleanup()
    })
  }

  isTerminal() {
    return ['left', 'removed', 'error'].includes(this.state.status)
  }

  emitJoin() {
    const { local } = this.state
    this.socket.timeout(10_000).emit(
      EVENTS.JOIN,
      { room: this.code, name: this.name, audio: local.audio, video: local.video || local.screen },
      (err, res) => {
        if (this.isTerminal()) return
        if (err) return this.set({ status: 'reconnecting', error: 'The server did not respond. Retrying…' })
        if (!res?.ok) {
          this.set({ status: 'error', error: res?.error || 'Could not join the meeting.', errorCode: res?.code })
          this.cleanup()
          return
        }
        const others = res.room.participants.filter((p) => p.id !== res.selfId)
        this.set({
          status: 'joined',
          error: null,
          selfId: res.selfId,
          self: res.room.participants.find((p) => p.id === res.selfId),
          room: { locked: res.room.locked, maxParticipants: res.room.maxParticipants },
          messages: res.room.messages,
          participants: others.map((p) => ({ ...p, stream: null, connection: 'new' })),
        })
        if (local.screen) this.emitMediaState()
        // We are the newcomer: offer to everyone already in the room.
        for (const p of others) this.createPeer(p.id, true)
      }
    )
  }

  emitMediaState() {
    if (this.state.status !== 'joined') return
    const { audio, video, screen } = this.state.local
    this.socket?.emit(EVENTS.MEDIA_STATE, { audio, video, screen })
  }

  addParticipant(p) {
    if (p.id === this.state.selfId) return
    if (this.state.participants.some((x) => x.id === p.id)) return this.updateParticipant(p.id, p)
    this.set({ participants: [...this.state.participants, { ...p, stream: null, connection: 'new' }] })
  }

  removeParticipant(id) {
    this.closePeer(id)
    this.set({ participants: this.state.participants.filter((p) => p.id !== id) })
  }

  createPeer(id, initiator) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    const peer = { id, pc, initiator, transceivers: {}, pending: [], queue: Promise.resolve(), stream: new MediaStream(), restarts: 0 }
    this.peers.set(id, peer)

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.socket?.emit(EVENTS.SIGNAL, { to: id, candidate: candidate.toJSON() })
    }

    pc.ontrack = ({ track }) => {
      peer.stream.addTrack(track)
      this.updateParticipant(id, { stream: new MediaStream(peer.stream.getTracks()) })
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      this.updateParticipant(id, { connection: state })
      if (state === 'connected') {
        peer.restarts = 0
        this.applyVideoPreference(peer)
      }
      if (state === 'failed' && peer.initiator && peer.restarts < MAX_ICE_RESTARTS) {
        peer.restarts += 1
        pc.restartIce()
      }
    }

    if (initiator) {
      peer.transceivers.audio = pc.addTransceiver(this.audioTrack || 'audio', { direction: 'sendrecv' })
      peer.transceivers.video = pc.addTransceiver(this.currentVideoTrack() || 'video', { direction: 'sendrecv' })
      pc.onnegotiationneeded = () =>
        this.enqueue(peer, async () => {
          await pc.setLocalDescription()
          this.sendDescription(id, pc.localDescription)
        })
    }
    this.updateParticipant(id, { connection: 'connecting' })
    return peer
  }

  sendDescription(to, description) {
    this.socket?.emit(EVENTS.SIGNAL, { to, description: { type: description.type, sdp: description.sdp } })
  }

  /** Serialises async signaling work per peer so SDP steps never interleave. */
  enqueue(peer, task) {
    peer.queue = peer.queue.then(task).catch((err) => console.warn('[webrtc]', err.message))
    return peer.queue
  }

  handleSignal({ from, description, candidate }) {
    let peer = this.peers.get(from)
    if (!peer) {
      if (description?.type !== 'offer') return
      peer = this.createPeer(from, false)
    }
    this.enqueue(peer, async () => {
      const { pc } = peer
      if (pc.signalingState === 'closed') return

      if (description?.type === 'offer' && !peer.initiator) {
        await pc.setRemoteDescription(description)
        if (!peer.attached) {
          // Reuse the offerer's transceivers so our media flows on the same m-lines.
          for (const tx of pc.getTransceivers()) {
            const kind = tx.receiver.track.kind
            if (peer.transceivers[kind]) continue
            peer.transceivers[kind] = tx
            tx.direction = 'sendrecv'
            await tx.sender.replaceTrack(kind === 'audio' ? this.audioTrack : this.currentVideoTrack())
          }
          peer.attached = true
        }
        await pc.setLocalDescription()
        this.sendDescription(from, pc.localDescription)
      } else if (description?.type === 'answer' && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(description)
      }

      if (description) {
        // ICE candidates that arrived before the remote description.
        for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {})
      }
      if (candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {})
        else peer.pending.push(candidate)
      }
    })
  }

  closePeer(id) {
    const peer = this.peers.get(id)
    if (!peer) return
    this.peers.delete(id)
    const { pc } = peer
    pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = pc.onnegotiationneeded = null
    pc.close()
    peer.stream.getTracks().forEach((t) => t.stop())
  }

  teardownPeers() {
    for (const id of [...this.peers.keys()]) this.closePeer(id)
  }

  request(event, payload) {
    return new Promise((resolve) => {
      if (!this.socket?.connected || this.state.status !== 'joined') {
        return resolve({ ok: false, error: 'You are offline. Wait for the connection to come back.' })
      }
      this.socket.timeout(5000).emit(event, payload, (err, res) =>
        resolve(err ? { ok: false, error: 'No response from the server. Try again.' } : res)
      )
    })
  }

  sendChat(text) {
    return this.request(EVENTS.CHAT, { text })
  }

  setHandRaised(raised) {
    this.socket?.emit(EVENTS.RAISE_HAND, { raised })
  }

  react(emoji) {
    this.socket?.emit(EVENTS.REACTION, { emoji })
  }

  pushReaction({ from, emoji }) {
    const id = crypto.randomUUID()
    const name = from === this.state.selfId ? 'You' : this.state.participants.find((p) => p.id === from)?.name || 'Someone'
    this.set({ reactions: [...this.state.reactions, { id, from, emoji, name }].slice(-12) })
    setTimeout(() => this.set({ reactions: this.state.reactions.filter((r) => r.id !== id) }), 4000)
  }

  setLocked(locked) {
    return this.request(EVENTS.HOST_LOCK, { locked })
  }

  askToMute(id) {
    return this.request(EVENTS.HOST_MUTE, { id })
  }

  removeParticipantAsHost(id) {
    return this.request(EVENTS.HOST_REMOVE, { id })
  }

  cleanup() {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
    this.teardownPeers()
    this.stopLocalMedia()
    this.set({ participants: [] })
  }

  leave() {
    if (this.state.status === 'left') return
    this.socket?.emit(EVENTS.LEAVE)
    this.set({ status: 'left' })
    this.cleanup()
  }
}
