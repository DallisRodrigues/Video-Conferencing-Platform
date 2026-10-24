import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'

export default function NotFound({ title = 'Page not found', message = "The page you're looking for doesn't exist or has moved." }) {
  return (
    <div className="page">
      <AppHeader />
      <main className="container not-found">
        <p className="eyebrow">404</p>
        <h1>{title}</h1>
        <p className="muted">{message}</p>
        <Link to="/" className="btn btn-primary">
          Back to home
        </Link>
      </main>
    </div>
  )
}
