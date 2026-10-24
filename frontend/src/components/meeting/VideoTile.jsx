import { memo, useEffect, useRef } from 'react'
import { Crown, Hand, Loader2, MicOff, MonitorUp, MonitorX, Pin, PinOff, WifiOff } from 'lucide-react'
import Avatar from '../ui/Avatar'
import { SPEAKING_THRESHOLD, useAudioLevel } from '../../hooks/useAudioLevel'

const CONNECTION_LABEL = {
  new: 'Connecting…',
  connecting: 'Connecting…',
  disconnected: 'Connection unstable…',
  failed: 'Could not connect',
}

function VideoTile({
  stream,
  audioStream,
  name,
  isLocal = false,
  audio,
  video,
  screen,
  hand,
  isHost,
  connection,
  pinned,
  onPin,
  onAutoplayBlocked,
  onStopPresenting,
}) {
  const videoRef = useRef(null)
  const level = useAudioLevel(audioStream || stream, audio)
  const speaking = audio && level > SPEAKING_THRESHOLD

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (el.srcObject !== stream) el.srcObject = stream || null
    if (stream) {
      el.play().catch((err) => {
        if (err.name === 'NotAllowedError') onAutoplayBlocked?.()
      })
    }
  }, [stream, onAutoplayBlocked])

  useEffect(() => {
    const el = videoRef.current
    return () => {
      if (el) el.srcObject = null
    }
  }, [])

  const showVideo = Boolean(stream) && (video || screen) && stream.getVideoTracks().length > 0
  const status = !isLocal && connection && connection !== 'connected' ? CONNECTION_LABEL[connection] : null
  const label = isLocal ? `${name} (You)` : name

  return (
    <figure
      className={`tile ${speaking ? 'is-speaking' : ''} ${screen ? 'is-screen' : ''} ${pinned ? 'is-pinned' : ''}`}
      data-testid={isLocal ? 'tile-local' : 'tile-remote'}
      data-participant={name}
      aria-label={`${label}${audio ? '' : ', muted'}${speaking ? ', speaking' : ''}`}
    >
      {/* Remote audio plays through this element even when video is off, so it stays mounted. */}
      <video
        ref={videoRef}
        className={`tile-video ${isLocal && !screen ? 'is-mirrored' : ''}`}
        style={{ visibility: showVideo ? 'visible' : 'hidden' }}
        autoPlay
        playsInline
        muted={isLocal}
      />
      {!showVideo && (
        <div className="tile-placeholder">
          <div className="tile-avatar-wrap" style={{ '--level': level }}>
            <Avatar name={name} size={72} />
          </div>
        </div>
      )}

      {isLocal && screen && onStopPresenting && (
        <div className="tile-presenting">
          <MonitorUp size={28} aria-hidden="true" />
          <strong>You're presenting to everyone</strong>
          <button type="button" className="btn btn-sm" onClick={onStopPresenting}>
            <MonitorX size={16} aria-hidden="true" />
            Stop presenting
          </button>
        </div>
      )}

      {status && (
        <div className={`tile-status ${connection === 'failed' ? 'is-failed' : ''}`}>
          {connection === 'failed' ? <WifiOff size={16} aria-hidden="true" /> : <Loader2 size={16} className="spin" aria-hidden="true" />}
          {status}
        </div>
      )}

      {hand && (
        <span className="tile-hand" title="Hand raised">
          <Hand size={16} aria-hidden="true" />
          <span className="sr-only">Hand raised</span>
        </span>
      )}

      {onPin && (
        <button type="button" className="tile-pin" onClick={onPin} aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`} aria-pressed={pinned}>
          {pinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
      )}

      <figcaption className="tile-label">
        {!audio && <MicOff size={14} className="tile-muted" aria-hidden="true" />}
        {isHost && <Crown size={13} className="tile-host" aria-label="Host" />}
        {screen && <MonitorUp size={14} aria-hidden="true" />}
        <span className="tile-name">{screen ? `${label} · presenting` : label}</span>
      </figcaption>
    </figure>
  )
}

export default memo(VideoTile)
