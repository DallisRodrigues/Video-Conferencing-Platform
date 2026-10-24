import { useEffect, useState, useSyncExternalStore } from 'react'
import { MeetingClient } from '../lib/meeting/MeetingClient'

const emptyStore = { subscribe: () => () => {}, getSnapshot: () => null }

// Created inside an effect so StrictMode's mount/unmount/mount never reuses a torn-down client.
export function useMeetingClient(code) {
  const [client, setClient] = useState(null)

  useEffect(() => {
    if (!code) return
    const c = new MeetingClient()
    setClient(c)
    const onPageHide = () => c.leave()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      c.leave()
    }
  }, [code])

  const store = client || emptyStore
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return [client, state]
}
