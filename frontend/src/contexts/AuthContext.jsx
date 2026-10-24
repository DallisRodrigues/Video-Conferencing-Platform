import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, tokenStore } from '../lib/api'

export const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'loading' : 'ready'))
  // True after an explicit sign-out, so protected pages send the user home instead of to /auth.
  const [signedOut, setSignedOut] = useState(false)

  useEffect(() => {
    if (!tokenStore.get()) return
    const controller = new AbortController()
    api('/api/v1/users/me', { signal: controller.signal })
      .then((data) => setUser(data.user))
      .catch((err) => {
        if (err.name === 'AbortError') return
        if (err.status === 401) tokenStore.clear()
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatus('ready')
      })
    return () => controller.abort()
  }, [])

  const handleLogin = useCallback(async (username, password) => {
    const data = await api('/api/v1/users/login', { method: 'POST', body: { username, password }, auth: false })
    tokenStore.set(data.token)
    setSignedOut(false)
    setUser(data.user)
    return data.user
  }, [])

  const handleRegister = useCallback(async (name, username, password) => {
    const data = await api('/api/v1/users/register', { method: 'POST', body: { name, username, password }, auth: false })
    return data.message
  }, [])

  const handleLogout = useCallback(async () => {
    // Sign out locally first so a reload or navigation can't race the network;
    // keepalive lets the server-side revocation finish even if the page unloads.
    const token = tokenStore.get()
    tokenStore.clear()
    setSignedOut(true)
    setUser(null)
    if (token) await api('/api/v1/users/logout', { method: 'POST', token, keepalive: true }).catch(() => {})
  }, [])

  const getHistoryOfUser = useCallback(() => api('/api/v1/users/get_all_activity'), [])
  const deleteHistoryEntry = useCallback((id) => api(`/api/v1/users/activity/${id}`, { method: 'DELETE' }), [])

  const value = useMemo(
    () => ({ user, status, signedOut, handleLogin, handleRegister, handleLogout, getHistoryOfUser, deleteHistoryEntry }),
    [user, status, signedOut, handleLogin, handleRegister, handleLogout, getHistoryOfUser, deleteHistoryEntry]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export const useAuth = () => useContext(AuthContext)
