import { Link } from 'react-router-dom'

export const APP_NAME = 'Video Conferencing Platform'

export function BrandMark({ className = 'brand-mark' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1e222a" />
      <rect x="11" y="18" width="30" height="28" rx="8" fill="#ff8a3d" />
      <path d="M43 27l10-6v22l-10-6z" fill="#ff8a3d" />
      <circle cx="26" cy="32" r="5" fill="#1e222a" />
    </svg>
  )
}

export default function Brand({ to = '/' }) {
  return (
    <Link to={to} className="brand" aria-label={`${APP_NAME} home`}>
      <BrandMark />
      <span>{APP_NAME}</span>
    </Link>
  )
}
