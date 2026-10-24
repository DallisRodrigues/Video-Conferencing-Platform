import { useEffect, useRef, useState } from 'react'
import { Hand, MessageSquare, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Settings, Smile, Users, Video, VideoOff } from 'lucide-react'
import { REACTIONS } from '../../lib/meeting/events'
import { canShareScreen } from '../../lib/media'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

function Ctrl({ label, shortcut, active, off, onClick, children, badge, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`ctrl ${off ? 'is-off' : ''} ${active ? 'is-active' : ''} ${className}`}
      onClick={onClick}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      {...rest}
    >
      {children}
      {badge > 0 && (
        <span className="ctrl-badge" aria-hidden="true">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

function ReactionPicker({ onPick }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="reaction-picker" ref={ref}>
      <Ctrl label="Send a reaction" active={open} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
        <Smile size={20} />
      </Ctrl>
      {open && (
        <div className="reaction-menu" role="menu" aria-label="Reactions">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              onClick={() => {
                onPick(emoji)
                setOpen(false)
              }}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ControlBar({ client, state, panel, setPanel, unread, onLeave, onSettings }) {
  const { local, self, participants } = state
  const hand = Boolean(self?.hand)

  return (
    <div className="control-bar" role="toolbar" aria-label="Meeting controls">
      <div className="control-group">
        <Ctrl
          label={local.audio ? 'Mute microphone' : 'Unmute microphone'}
          shortcut={`${mod}+D`}
          off={!local.audio}
          onClick={() => client.setAudioEnabled(!local.audio)}
          aria-pressed={!local.audio}
          data-testid="toggle-mic"
        >
          {local.audio ? <Mic size={20} /> : <MicOff size={20} />}
        </Ctrl>
        <Ctrl
          label={local.video ? 'Turn camera off' : 'Turn camera on'}
          shortcut={`${mod}+E`}
          off={!local.video}
          onClick={() => client.setVideoEnabled(!local.video)}
          aria-pressed={!local.video}
          data-testid="toggle-camera"
        >
          {local.video ? <Video size={20} /> : <VideoOff size={20} />}
        </Ctrl>
        {canShareScreen() && (
          <Ctrl
            label={local.screen ? 'Stop presenting' : 'Present your screen'}
            active={local.screen}
            onClick={() => (local.screen ? client.stopScreenShare() : client.startScreenShare())}
            aria-pressed={local.screen}
            className="hide-xs"
            data-testid="toggle-screen"
          >
            {local.screen ? <MonitorX size={20} /> : <MonitorUp size={20} />}
          </Ctrl>
        )}
        <Ctrl label={hand ? 'Lower hand' : 'Raise hand'} active={hand} onClick={() => client.setHandRaised(!hand)} aria-pressed={hand} className="hide-xs">
          <Hand size={20} />
        </Ctrl>
        <ReactionPicker onPick={(emoji) => client.react(emoji)} />
        <Ctrl label="Leave meeting" className="ctrl-leave" onClick={onLeave} data-testid="leave">
          <PhoneOff size={20} />
        </Ctrl>
      </div>

      <div className="control-group control-group-side">
        <Ctrl
          label="Chat"
          active={panel === 'chat'}
          onClick={() => setPanel(panel === 'chat' ? null : 'chat')}
          aria-pressed={panel === 'chat'}
          badge={panel === 'chat' ? 0 : unread}
          data-testid="toggle-chat"
        >
          <MessageSquare size={20} />
        </Ctrl>
        <Ctrl
          label={`People (${participants.length + 1})`}
          active={panel === 'people'}
          onClick={() => setPanel(panel === 'people' ? null : 'people')}
          aria-pressed={panel === 'people'}
          data-testid="toggle-people"
        >
          <Users size={20} />
          <span className="ctrl-count">{participants.length + 1}</span>
        </Ctrl>
        <Ctrl label="Settings" onClick={onSettings}>
          <Settings size={20} />
        </Ctrl>
      </div>
    </div>
  )
}
