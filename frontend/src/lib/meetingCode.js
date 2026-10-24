// Must match backend/src/utils/validation.js MEETING_CODE_RE.
const MEETING_CODE_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
const LETTERS = 'abcdefghijkmnopqrstuvwxyz'

export function generateMeetingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  const chars = [...bytes].map((b) => LETTERS[b % LETTERS.length])
  return `${chars.slice(0, 3).join('')}-${chars.slice(3, 7).join('')}-${chars.slice(7).join('')}`
}

export function parseMeetingInput(input) {
  if (typeof input !== 'string') return null
  let value = input.trim()
  try {
    if (/^https?:\/\//i.test(value)) value = new URL(value).pathname.split('/').filter(Boolean).pop() || ''
  } catch {
    return null
  }
  value = value.toLowerCase().replace(/\s+/g, '-')
  return MEETING_CODE_RE.test(value) ? value : null
}

export const meetingLink = (code) => `${window.location.origin}/${code}`
