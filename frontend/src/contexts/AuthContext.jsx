import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, tokenStore } from '../lib/api'

export const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'loading' : 'ready'))

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
    setUser(data.user)
    return data.user
  }, [])

  const handleRegister = useCallback(async (name, username, password) => {
    const data = await api('/api/v1/users/register', { method: 'POST', body: { name, username, password }, auth: false })
    return data.message
  }, [])

  const handleLogout = useCallback(async () => {
    await api('/api/v1/users/logout', { method: 'POST' }).catch(() => {})
    tokenStore.clear()
    setUser(null)
  }, [])

  const getHistoryOfUser = useCallback(() => api('/api/v1/users/get_all_activity'), [])
  const deleteHistoryEntry = useCallback((id) => api(`/api/v1/users/activity/${id}`, { method: 'DELETE' }), [])

  const value = useMemo(
    () => ({ user, status, handleLogin, handleRegister, handleLogout, getHistoryOfUser, deleteHistoryEntry }),
    [user, status, handleLogin, handleRegister, handleLogout, getHistoryOfUser, deleteHistoryEntry]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export const useAuth = () => useContext(AuthContext)
