import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AlertTriangle, Copy, Lock, UserPlus, Volume2, WifiOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/Toast'
import { BrandMark, APP_NAME } from '../components/ui/Brand'
import Dialog from '../components/ui/Dialog'
import Lobby from '../components/meeting/Lobby'
import VideoTile from '../components/meeting/VideoTile'
import ControlBar from '../components/meeting/ControlBar'
import ChatPanel from '../components/meeting/ChatPanel'
import ParticipantsPanel from '../components/meeting/ParticipantsPanel'
import DeviceSelect from '../components/meeting/DeviceSelect'
import { useMeetingClient } from '../hooks/useMeetingClient'
import { meetingLink, parseMeetingInput } from '../lib/meetingCode'
import NotFound from './notFound'
import '../styles/meeting.css'

export default function VideoMeetComponent() {
  const { url } = useParams()
  const code = parseMeetingInput(url)
  const [attempt, setAttempt] = useState(0)

  if (!code) {
    return <NotFound title="That isn't a valid meeting link" message="Meeting codes use letters, numbers and dashes, like abc-defg-hij. Check the link and try again." />
  }
  if (code !== url) return <Navigate to={`/${code}`} replace />
  return <Meeting key={`${code}:${attempt}`} code={code} onRestart={() => setAttempt((n) => n + 1)} />
}

function useCopyInvite(code) {
  const toast = useToast()
  return useCallback(async () => {
    try {
      await navigator.clipboard.writeText(meetingLink(code))
      toast('Invite link copied', 'success')
    } catch {
      toast(`Couldn't copy automatically. Share this link: ${meetingLink(code)}`, 'error')
    }
  }, [code, toast])
}

function Meeting({ code, onRestart }) {
  const { user, status: authStatus } = useAuth()
  const [client, state] = useMeetingClient(code)
  const toast = useToast()

  useEffect(() => {
    document.title = `${code} · ${APP_NAME}`
    return () => {
      document.title = APP_NAME
    }
  }, [code])

  const noticeId = state?.notice?.id
  useEffect(() => {
    if (noticeId) toast(state.notice.text, state.notice.tone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeId])

  if (!client || !state || authStatus === 'loading') {
    return (
      <div className="meeting-loading">
        <span className="spinner" aria-label="Loading" />
      </div>
    )
  }

  const everJoined = Boolean(state.selfId)

  if (state.status === 'left' || state.status === 'removed' || state.status === 'error') {
    return <EndScreen state={state} onRestart={onRestart} user={user} />
  }

  if (!everJoined) {
    return (
      <div className="page meeting-lobby-page">
        <header className="meeting-lobby-header container">
          <Link to={user ? '/home' : '/'} className="brand">
            <BrandMark />
            <span>{APP_NAME}</span>
          </Link>
        </header>
        <Lobby client={client} state={state} code={code} user={user} onJoin={(name) => client.join({ code, name })} />
      </div>
    )
  }

  return <Room client={client} state={state} code={code} />
}

function Room({ client, state, code }) {
  const toast = useToast()
  const copyInvite = useCopyInvite(code)
  const [panel, setPanel] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pinned, setPinned] = useState(null)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [seenCount, setSeenCount] = useState(state.messages.length)
  const toasted = useRef(state.messages.length)

  const { participants, local, self, room, messages, selfId } = state
  const reconnecting = state.status === 'reconnecting'
  const unread = panel === 'chat' ? 0 : messages.slice(seenCount).filter((m) => m.from !== selfId).length
  const pinnedId = pinned === 'self' || participants.some((p) => p.id === pinned) ? pinned : null

  const changePanel = (next) => {
    if (panel === 'chat' && next !== 'chat') setSeenCount(messages.length)
    setPanel(next)
  }

  useEffect(() => {
    const fresh = messages.slice(toasted.current).filter((m) => m.from !== selfId)
    toasted.current = messages.length
    if (panel !== 'chat' && fresh.length) {
      const last = fresh[fresh.length - 1]
      toast(`${last.name}: ${last.text.length > 80 ? `${last.text.slice(0, 80)}…` : last.text}`)
    }
  }, [messages, panel, selfId, toast])

  // Keyboard shortcuts: Ctrl/⌘+D microphone, Ctrl/⌘+E camera.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const key = e.key.toLowerCase()
      if (key === 'd') {
        e.preventDefault()
        client.setAudioEnabled(!client.state.local.audio)
      } else if (key === 'e') {
        e.preventDefault()
        client.setVideoEnabled(!client.state.local.video)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [client])

  const onAutoplayBlocked = useCallback(() => setAutoplayBlocked(true), [])
  const stopPresenting = useCallback(() => client.stopScreenShare(), [client])

  const tiles = [
    {
      key: 'self',
      props: {
        stream: local.previewStream,
        audioStream: local.audioStream,
        name: self?.name || 'You',
        isLocal: true,
        audio: local.audio,
        video: local.video,
        screen: local.screen,
        hand: self?.hand,
        isHost: self?.isHost,
        onStopPresenting: stopPresenting,
      },
    },
    ...participants.map((p) => ({
      key: p.id,
      props: {
        stream: p.stream,
        name: p.name,
        audio: p.audio,
        video: p.video,
        screen: p.screen,
        hand: p.hand,
        isHost: p.isHost,
        connection: p.connection,
        onAutoplayBlocked,
      },
    })),
  ]

  const spotlightKey = pinnedId || participants.find((p) => p.screen)?.id || null
  const spotlight = tiles.find((t) => t.key === spotlightKey)
  const rest = spotlight ? tiles.filter((t) => t !== spotlight) : tiles

  const renderTile = (t) => (
    <VideoTile
      key={t.key}
      {...t.props}
      pinned={pinnedId === t.key}
      onPin={tiles.length > 1 ? () => setPinned(pinnedId === t.key ? null : t.key) : undefined}
    />
  )

  return (
    <div className={`meeting ${panel ? 'has-panel' : ''}`}>
      <header className="meeting-top">
        <div className="meeting-id">
          <BrandMark className="brand-mark brand-mark-sm" />
          <span className="meeting-code" data-testid="meeting-code">
            {code}
          </span>
          <button type="button" className="icon-btn" onClick={copyInvite} aria-label="Copy invite link" title="Copy invite link">
            <Copy size={16} />
          </button>
          {room.locked && (
            <span className="badge badge-warning">
              <Lock size={12} aria-hidden="true" /> Locked
            </span>
          )}
        </div>
        <div className="meeting-status" role="status" aria-live="polite">
          {reconnecting ? (
            <span className="badge badge-warning">
              <WifiOff size={12} aria-hidden="true" /> Reconnecting…
            </span>
          ) : (
            <span className="badge badge-success" data-testid="connection-status">
              <span className="dot" aria-hidden="true" /> Connected
            </span>
          )}
          <span className="badge hide-xs" data-testid="participant-count">
            {participants.length + 1} / {room.maxParticipants}
          </span>
        </div>
      </header>

      {autoplayBlocked && (
        <div className="meeting-banner" role="alert">
          <Volume2 size={16} aria-hidden="true" />
          <span>Your browser paused incoming audio.</span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              document.querySelectorAll('video').forEach((v) => v.play().catch(() => {}))
              setAutoplayBlocked(false)
            }}
          >
            Enable audio
          </button>
        </div>
      )}

      <div className="meeting-body">
        <section className={`stage ${spotlight ? 'stage-spotlight' : ''}`} data-count={Math.min(rest.length + (participants.length === 0 ? 1 : 0), 6)} aria-label="Participants">
          {spotlight ? (
            <>
              <div className="stage-main">{renderTile(spotlight)}</div>
              <div className="stage-strip">{rest.map(renderTile)}</div>
            </>
          ) : (
            <>
              {tiles.map(renderTile)}
              {participants.length === 0 && (
                <div className="invite-card" data-testid="invite-card">
                  <UserPlus size={28} aria-hidden="true" />
                  <h2>You're the only one here</h2>
                  <p className="muted">Share this link with the people you want to meet.</p>
                  <code className="invite-link">{meetingLink(code)}</code>
                  <button type="button" className="btn btn-primary" onClick={copyInvite}>
                    <Copy size={16} aria-hidden="true" /> Copy invite link
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {panel === 'chat' && <ChatPanel client={client} state={state} onClose={() => changePanel(null)} />}
        {panel === 'people' && <ParticipantsPanel client={client} state={state} onClose={() => changePanel(null)} />}
      </div>

      <div className="reactions" aria-live="polite">
        {state.reactions.map((r) => (
          <div key={r.id} className="reaction">
            <span className="reaction-emoji" aria-hidden="true">
              {r.emoji}
            </span>
            <span className="reaction-name">
              {r.name}
              <span className="sr-only"> reacted {r.emoji}</span>
            </span>
          </div>
        ))}
      </div>

      <ControlBar
        client={client}
        state={state}
        panel={panel}
        setPanel={changePanel}
        unread={unread}
        onLeave={() => client.leave()}
        onSettings={() => setSettingsOpen(true)}
      />

      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
        labelledBy="settings-title"
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setSettingsOpen(false)}>
            Done
          </button>
        }
      >
        <DeviceSelect client={client} local={local} />
        <div className="shortcut-list">
          <h3>Keyboard shortcuts</h3>
          <dl>
            <dt>
              <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>D</kbd>
            </dt>
            <dd>Mute / unmute microphone</dd>
            <dt>
              <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>E</kbd>
            </dt>
            <dd>Turn camera on / off</dd>
          </dl>
        </div>
      </Dialog>
    </div>
  )
}

function EndScreen({ state, onRestart, user }) {
  const content = {
    left: { title: 'You left the meeting', text: 'Your camera and microphone are off.', retry: 'Rejoin' },
    removed: { title: 'You were removed from the meeting', text: 'The host removed you from this call.', retry: 'Try to rejoin' },
    error: {
      title: state.errorCode === 'ROOM_FULL' ? 'This meeting is full' : state.errorCode === 'ROOM_LOCKED' ? 'This meeting is locked' : "Couldn't join the meeting",
      text: state.error || 'Something went wrong.',
      retry: 'Try again',
    },
  }[state.status]

  return (
    <div className="page meeting-end">
      <main className="end-card card" data-testid="end-screen">
        {state.status === 'left' ? <BrandMark className="brand-mark end-mark" /> : <AlertTriangle size={36} className="end-alert" aria-hidden="true" />}
        <h1>{content.title}</h1>
        <p className="muted">{content.text}</p>
        <div className="end-actions">
          <button type="button" className="btn" onClick={onRestart}>
            {content.retry}
          </button>
          <Link to={user ? '/home' : '/'} className="btn btn-primary">
            Return to home
          </Link>
        </div>
      </main>
    </div>
  )
}
