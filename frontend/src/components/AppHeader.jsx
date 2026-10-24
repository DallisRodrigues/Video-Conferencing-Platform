import { Link, NavLink, useNavigate } from 'react-router-dom'
import { History, LogOut } from 'lucide-react'
import Brand from './ui/Brand'
import Avatar from './ui/Avatar'
import { useAuth } from '../contexts/AuthContext'

export default function AppHeader() {
  const { user, handleLogout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Brand to={user ? '/home' : '/'} />
        <nav className="site-nav" aria-label="Main">
          {user ? (
            <>
              <NavLink to="/history" className="btn btn-ghost btn-sm nav-link">
                <History size={16} aria-hidden="true" />
                <span className="hide-sm">History</span>
              </NavLink>
              <span className="user-chip" title={`Signed in as @${user.username}`}>
                <Avatar name={user.name} size={28} />
                <span className="hide-sm">{user.name}</span>
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => {
                  handleLogout()
                  navigate('/', { replace: true })
                }}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link to="/auth" className="btn btn-ghost btn-sm">
                Sign in
              </Link>
              <Link to="/auth?mode=signup" className="btn btn-primary btn-sm hide-xxs">
                Create account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
