import { useState } from 'react'
import { Crown, Hand, Lock, LockOpen, Mic, MicOff, UserMinus, Video, VideoOff, X } from 'lucide-react'
import Avatar from '../ui/Avatar'
import Dialog from '../ui/Dialog'
import { useToast } from '../ui/Toast'

export default function ParticipantsPanel({ client, state, onClose }) {
  const { self, participants, room, local } = state
  const isHost = Boolean(self?.isHost)
  const toast = useToast()
  const [removing, setRemoving] = useState(null)

  const run = async (promise, success) => {
    const res = await promise
    if (res?.ok) {
      if (success) toast(success, 'success')
    } else {
      toast(res?.error || 'That did not work.', 'error')
    }
  }

  const everyone = [
    { ...self, name: self?.name, isSelf: true, audio: local.audio, video: local.video, screen: local.screen },
    ...[...participants].sort((a, b) => Number(b.hand) - Number(a.hand) || a.joinedAt - b.joinedAt),
  ]

  return (
    <aside className="side-panel" aria-labelledby="people-title">
      <header className="side-panel-head">
        <h2 id="people-title">People · {everyone.length}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close people panel">
          <X size={18} />
        </button>
      </header>

      {isHost ? (
        <label className="lock-toggle">
          <span>
            {room.locked ? <Lock size={16} aria-hidden="true" /> : <LockOpen size={16} aria-hidden="true" />}
            <span>
              <strong>Lock meeting</strong>
              <small className="muted">No one new can join while locked</small>
            </span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={room.locked}
            onChange={(e) => run(client.setLocked(e.target.checked), e.target.checked ? 'Meeting locked' : 'Meeting unlocked')}
          />
        </label>
      ) : (
        room.locked && (
          <p className="side-panel-note">
            <Lock size={14} aria-hidden="true" /> The host has locked this meeting.
          </p>
        )
      )}

      <ul className="people-list" data-testid="people-list">
        {everyone.map((p) => (
          <li key={p.id || 'self'}>
            <Avatar name={p.name} size={36} />
            <div className="people-info">
              <span className="people-name">
                {p.name}
                {p.isSelf && <span className="muted"> (You)</span>}
              </span>
              <span className="people-sub">
                {p.isHost && (
                  <span className="badge badge-accent">
                    <Crown size={11} aria-hidden="true" /> Host
                  </span>
                )}
                {p.screen && <span className="badge">Presenting</span>}
                {!p.isSelf && p.connection === 'failed' && <span className="badge badge-danger">No media connection</span>}
              </span>
            </div>
            <div className="people-icons">
              {p.hand && <Hand size={16} className="people-hand" aria-label="Hand raised" />}
              {p.audio ? <Mic size={16} aria-label="Microphone on" /> : <MicOff size={16} className="people-off" aria-label="Muted" />}
              {p.video ? <Video size={16} aria-label="Camera on" /> : <VideoOff size={16} className="people-off" aria-label="Camera off" />}
            </div>
            {isHost && !p.isSelf && (
              <div className="people-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!p.audio}
                  onClick={() => run(client.askToMute(p.id), `Asked ${p.name} to mute`)}
                >
                  Mute
                </button>
                <button type="button" className="icon-btn" onClick={() => setRemoving(p)} aria-label={`Remove ${p.name}`} title="Remove from meeting">
                  <UserMinus size={16} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        labelledBy="remove-title"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setRemoving(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                run(client.removeParticipantAsHost(removing.id), `${removing.name} was removed`)
                setRemoving(null)
              }}
            >
              Remove
            </button>
          </>
        }
      >
        <p className="muted">They'll be disconnected from the call. They can rejoin with the link unless you lock the meeting.</p>
      </Dialog>
    </aside>
  )
}
