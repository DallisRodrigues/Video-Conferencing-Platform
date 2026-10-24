const PALETTE = ['#ff8a3d', '#f2b84b', '#7ad3a8', '#7aa7ff', '#c79bff', '#ff8fa3', '#5fd4d4']

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function colorFor(name = '') {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

export default function Avatar({ name, size = 40 }) {
  return (
    <span className="avatar" style={{ '--size': `${size}px`, background: colorFor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
