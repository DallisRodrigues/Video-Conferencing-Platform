import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const withAuth = (WrappedComponent) => {
  const AuthComponent = (props) => {
    const { user, status } = useAuth()
    const location = useLocation()

    if (status === 'loading') {
      return (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }} aria-busy="true">
          <span className="spinner" aria-label="Loading" />
        </div>
      )
    }
    if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />
    return <WrappedComponent {...props} />
  }

  return AuthComponent
}

export default withAuth
