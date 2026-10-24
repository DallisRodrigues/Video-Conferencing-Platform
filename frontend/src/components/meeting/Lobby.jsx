import { useEffect, useState } from 'react'
import { AlertTriangle, Mic, MicOff, Video, VideoOff } from 'lucide-react'
import VideoTile from './VideoTile'
import DeviceSelect from './DeviceSelect'
import { MEDIA_ERRORS } from '../../lib/media'
import { useAudioLevel } from '../../hooks/useAudioLevel'

const NAME_KEY = 'vcp:display-name'

function MicMeter({ stream, enabled }) {
  const level = useAudioLevel(stream, enabled)
  return (
    <div className="mic-meter" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className={level * 8 > i ? 'on' : ''} />
      ))}
    </div>
  )
}

export default function Lobby({ client, state, code, user, onJoin }) {
  const { local } = state
  const [name, setName] = useState(() => {
    if (user?.name) return user.name
    try {
      return localStorage.getItem(NAME_KEY) || ''
    } catch {
      return ''
    }
  })
  const [nameError, setNameError] = useState('')
  const joining = state.status === 'connecting'

  useEffect(() => {
    client.startPreview()
  }, [client])

  const submit = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Enter the name others will see.')
      return
    }
    try {
      localStorage.setItem(NAME_KEY, trimmed)
    } catch {
      /* ignore */
    }
    onJoin(trimmed)
  }

  const mediaIssues = [
    local.videoError && { kind: 'Camera', text: MEDIA_ERRORS[local.videoError], retry: () => client.setVideoEnabled(true) },
    local.audioError && { kind: 'Microphone', text: MEDIA_ERRORS[local.audioError], retry: () => client.setAudioEnabled(true) },
  ].filter(Boolean)

  return (
    <main className="lobby container">
      <section className="lobby-preview" aria-label="Your preview">
        <div className="lobby-video">
          <VideoTile
            stream={local.previewStream}
            audioStream={local.audioStream}
            name={name.trim() || 'You'}
            isLocal
            audio={local.audio}
            video={local.video}
            screen={false}
          />
          {!local.ready && (
            <div className="lobby-starting">
              <span className="spinner" aria-hidden="true" />
              Starting camera…
            </div>
          )}
          <div className="lobby-toggles">
            <button
              type="button"
              className={`ctrl ${local.audio ? '' : 'is-off'}`}
              onClick={() => client.setAudioEnabled(!local.audio)}
              aria-pressed={!local.audio}
              aria-label={local.audio ? 'Turn off microphone' : 'Turn on microphone'}
              disabled={!local.ready}
            >
              {local.audio ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button
              type="button"
              className={`ctrl ${local.video ? '' : 'is-off'}`}
              onClick={() => client.setVideoEnabled(!local.video)}
              aria-pressed={!local.video}
              aria-label={local.video ? 'Turn off camera' : 'Turn on camera'}
              disabled={!local.ready}
            >
              {local.video ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
          </div>
        </div>
        <div className="lobby-meter-row">
          <span className="muted">Mic check</span>
          <MicMeter stream={local.audioStream} enabled={local.audio} />
        </div>
      </section>

      <section className="lobby-panel card">
        <div>
          <p className="eyebrow">Ready to join?</p>
          <h1 className="lobby-title">
            <span className="meeting-code">{code}</span>
          </h1>
        </div>

        {mediaIssues.map((issue) => (
          <div key={issue.kind} className="alert alert-warning" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <div style={{ display: 'grid', gap: 6 }}>
              <strong>{issue.kind} unavailable.</strong>
              <span>{issue.text}</span>
              <button type="button" className="btn btn-sm" style={{ justifySelf: 'start' }} onClick={issue.retry}>
                Try again
              </button>
            </div>
          </div>
        ))}

        <form className="lobby-form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="display-name">Your name</label>
            <input
              id="display-name"
              className="input"
              value={name}
              maxLength={40}
              autoComplete="name"
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? 'display-name-error' : undefined}
              onChange={(e) => {
                setName(e.target.value)
                setNameError('')
              }}
            />
            {nameError ? (
              <span id="display-name-error" className="field-error">
                {nameError}
              </span>
            ) : (
              <span className="field-hint">{user ? `Signed in as @${user.username}` : 'Joining as a guest'}</span>
            )}
          </div>

          <DeviceSelect client={client} local={local} />

          {state.status === 'reconnecting' && state.error && (
            <div className="alert alert-error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{state.error}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={joining || state.status === 'reconnecting' || !local.ready}>
            {(joining || state.status === 'reconnecting') && <span className="spinner" aria-hidden="true" />}
            {joining ? 'Joining…' : state.status === 'reconnecting' ? 'Connecting…' : 'Join meeting'}
          </button>
          {!local.audio && !local.video && local.ready && (
            <p className="field-hint" style={{ textAlign: 'center' }}>
              You'll join with your camera and microphone off.
            </p>
          )}
        </form>
      </section>
    </main>
  )
}
