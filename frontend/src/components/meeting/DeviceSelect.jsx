import { useEffect, useState } from 'react'
import { listDevices } from '../../lib/media'

export default function DeviceSelect({ client, local }) {
  const [devices, setDevices] = useState({ audioinput: [], videoinput: [] })

  useEffect(() => {
    let active = true
    const refresh = () => listDevices().then((d) => active && setDevices(d))
    refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => {
      active = false
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
    }
    // Device labels are hidden until permission is granted, so re-list once tracks exist.
  }, [local.ready, local.audio, local.video])

  const current = (kind) => {
    const track = kind === 'audio' ? local.audioStream?.getAudioTracks()[0] : !local.screen && local.previewStream?.getVideoTracks()[0]
    return track?.getSettings?.().deviceId || client.prefs[kind === 'audio' ? 'audioDevice' : 'videoDevice'] || ''
  }

  const select = (kind, list, label) => (
    <div className="field">
      <label htmlFor={`device-${kind}`}>{label}</label>
      <select
        id={`device-${kind}`}
        className="select"
        value={current(kind)}
        disabled={list.length === 0}
        onChange={(e) => client.switchDevice(kind, e.target.value)}
      >
        {list.length === 0 && <option value="">No {label.toLowerCase()} found</option>}
        {list.length > 0 && !list.some((d) => d.deviceId === current(kind)) && <option value="">System default</option>}
        {list.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="device-select">
      {select('audio', devices.audioinput, 'Microphone')}
      {select('video', devices.videoinput, 'Camera')}
    </div>
  )
}
