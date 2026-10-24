import { useEffect, useState } from 'react'

let sharedContext = null
function audioContext() {
  if (!sharedContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    sharedContext = new Ctx()
  }
  if (sharedContext.state === 'suspended') sharedContext.resume().catch(() => {})
  return sharedContext
}

export function useAudioLevel(stream, enabled = true) {
  const [level, setLevel] = useState(0)
  const track = stream?.getAudioTracks()[0]
  const trackId = track?.id

  useEffect(() => {
    if (!enabled || !track || track.readyState === 'ended') {
      setLevel(0)
      return
    }
    const ctx = audioContext()
    if (!ctx) return
    let source
    try {
      source = ctx.createMediaStreamSource(new MediaStream([track]))
    } catch {
      return
    }
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.5
    source.connect(analyser)
    const data = new Uint8Array(analyser.fftSize)

    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const v of data) {
        const x = (v - 128) / 128
        sum += x * x
      }
      const rms = Math.sqrt(sum / data.length)
      setLevel((prev) => {
        const next = Math.min(1, rms * 4)
        return Math.abs(next - prev) < 0.02 ? prev : next
      })
    }, 120)

    return () => {
      clearInterval(timer)
      source.disconnect()
      analyser.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, enabled])

  return level
}

export const SPEAKING_THRESHOLD = 0.08
