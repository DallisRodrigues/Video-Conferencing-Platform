import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Clock } from 'lucide-react'
import withAuth from '../utils/withAuth'
import AppHeader from '../components/AppHeader'
import JoinMeetingForm from '../components/JoinMeetingForm'
import { useAuth } from '../contexts/AuthContext'
import { formatRelative } from '../utils/format'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function HomeComponent() {
  const navigate = useNavigate()
  const { user, getHistoryOfUser } = useAuth()
  const [recent, setRecent] = useState(null)

  useEffect(() => {
    let active = true
    getHistoryOfUser()
      .then((list) => active && setRecent(list.slice(0, 4)))
      .catch(() => active && setRecent([]))
    return () => {
      active = false
    }
  }, [getHistoryOfUser])

  return (
    <div className="page">
      <AppHeader />
      <main className="container dashboard">
        <section className="dash-hero">
          <p className="eyebrow">{greeting()}</p>
          <h1>{user.name.split(' ')[0]}, ready to meet?</h1>
          <p className="muted dash-lede">Start an instant room or join one with a code. Anyone with the link can join as a guest.</p>
          <JoinMeetingForm compact />
        </section>

        <section className="card dash-recent" aria-labelledby="recent-title">
          <div className="dash-recent-head">
            <h2 id="recent-title">Recent meetings</h2>
            <Link to="/history" className="btn btn-ghost btn-sm">
              View all
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          {recent === null ? (
            <div className="list-skeleton" aria-busy="true" aria-label="Loading recent meetings">
              <span />
              <span />
              <span />
            </div>
          ) : recent.length === 0 ? (
            <div className="empty">
              <Clock size={22} aria-hidden="true" />
              <p>No meetings yet. Rooms you join while signed in will show up here.</p>
            </div>
          ) : (
            <ul className="meeting-list">
              {recent.map((m) => (
                <li key={m.id}>
                  <div>
                    <span className="meeting-code">{m.meetingCode}</span>
                    <span className="muted meeting-when">{formatRelative(m.date)}</span>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => navigate(`/${m.meetingCode}`)}>
                    Rejoin
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

export default withAuth(HomeComponent)
