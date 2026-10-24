import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Clock, Copy, Trash2 } from 'lucide-react'
import withAuth from '../utils/withAuth'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/Toast'
import { formatDateTime, formatRelative } from '../utils/format'
import { meetingLink } from '../lib/meetingCode'

function History() {
  const { getHistoryOfUser, deleteHistoryEntry } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [meetings, setMeetings] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getHistoryOfUser()
      .then((list) => active && setMeetings(list))
      .catch((err) => {
        if (!active) return
        setMeetings([])
        setError(err.message)
      })
    return () => {
      active = false
    }
  }, [getHistoryOfUser])

  const remove = async (id) => {
    try {
      await deleteHistoryEntry(id)
      setMeetings((list) => list.filter((m) => m.id !== id))
      toast('Removed from history', 'success')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(meetingLink(code))
      toast('Invite link copied', 'success')
    } catch {
      toast("Couldn't copy. Select the code and copy it manually.", 'error')
    }
  }

  return (
    <div className="page">
      <AppHeader />
      <main className="container history">
        <div className="history-head">
          <h1>Meeting history</h1>
          <p className="muted">The last 50 rooms you joined while signed in. Chat and media are never stored.</p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {meetings === null ? (
          <div className="list-skeleton" aria-busy="true" aria-label="Loading history">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : meetings.length === 0 && !error ? (
          <div className="card empty empty-lg">
            <Clock size={28} aria-hidden="true" />
            <h2>No meetings yet</h2>
            <p className="muted">Start or join a room and it will show up here.</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/home')}>
              Go to dashboard
            </button>
          </div>
        ) : (
          <ul className="card meeting-list meeting-list-full">
            {meetings.map((m) => (
              <li key={m.id}>
                <div>
                  <span className="meeting-code">{m.meetingCode}</span>
                  <span className="muted meeting-when" title={formatDateTime(m.date)}>
                    {formatRelative(m.date)}
                    {m.joinCount > 1 && ` · joined ${m.joinCount} times`}
                  </span>
                </div>
                <div className="meeting-actions">
                  <button type="button" className="icon-btn" onClick={() => copy(m.meetingCode)} aria-label={`Copy invite link for ${m.meetingCode}`} title="Copy invite link">
                    <Copy size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => remove(m.id)} aria-label={`Remove ${m.meetingCode} from history`} title="Remove from history">
                    <Trash2 size={16} />
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => navigate(`/${m.meetingCode}`)}>
                    Rejoin
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

export default withAuth(History)
