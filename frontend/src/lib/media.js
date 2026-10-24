export const MEDIA_ERRORS = {
  denied: 'Permission was blocked. Click the camera icon in the address bar, allow access, then try again.',
  notfound: 'No device was found. Plug one in or check your system settings.',
  inuse: 'The device is busy. Close other apps or tabs that might be using it.',
  insecure: 'Camera and microphone need a secure (https) page.',
  unknown: 'The device could not be started.',
}

export function classifyMediaError(err) {
  if (!navigator.mediaDevices?.getUserMedia) return 'insecure'
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'notfound'
    case 'NotReadableError':
    case 'AbortError':
      return 'inuse'
    default:
      return 'unknown'
  }
}

const videoConstraints = (deviceId) => ({
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
})

const audioConstraints = (deviceId) => ({
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
})

export async function getTrack(kind, deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) return { error: 'insecure' }
  try {
    const constraints = kind === 'video' ? { video: videoConstraints(deviceId) } : { audio: audioConstraints(deviceId) }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    const track = kind === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0]
    return { track }
  } catch (err) {
    // A remembered device may have been unplugged; fall back to the default.
    if (deviceId && err?.name === 'OverconstrainedError') return getTrack(kind)
    return { error: classifyMediaError(err) }
  }
}

// One combined request means one permission prompt; fall back per device so one failure doesn't block the other.
export async function getInitialTracks({ audio, video, audioDeviceId, videoDeviceId }) {
  const result = { audioTrack: null, videoTrack: null, audioError: null, videoError: null }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ...result, audioError: audio ? 'insecure' : null, videoError: video ? 'insecure' : null }
  }
  if (audio && video) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(audioDeviceId),
        video: videoConstraints(videoDeviceId),
      })
      return { ...result, audioTrack: stream.getAudioTracks()[0] || null, videoTrack: stream.getVideoTracks()[0] || null }
    } catch {
      // Diagnose each device separately below.
    }
  }
  if (audio) {
    const { track, error } = await getTrack('audio', audioDeviceId)
    result.audioTrack = track || null
    result.audioError = error || null
  }
  if (video) {
    const { track, error } = await getTrack('video', videoDeviceId)
    result.videoTrack = track || null
    result.videoError = error || null
  }
  return result
}

export async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return { audioinput: [], videoinput: [], audiooutput: [] }
  const devices = await navigator.mediaDevices.enumerateDevices()
  const pick = (kind) => devices.filter((d) => d.kind === kind && d.deviceId)
  return { audioinput: pick('audioinput'), videoinput: pick('videoinput'), audiooutput: pick('audiooutput') }
}

export const canShareScreen = () => Boolean(navigator.mediaDevices?.getDisplayMedia) && !/Mobi|Android/i.test(navigator.userAgent)

export const stopTrack = (track) => {
  if (track && track.readyState !== 'ended') track.stop()
}
