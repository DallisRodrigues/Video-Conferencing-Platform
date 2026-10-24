import { Hand, Lock, MessageSquare, MonitorUp, ShieldCheck, SlidersHorizontal, Video } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import JoinMeetingForm from '../components/JoinMeetingForm'
import { APP_NAME } from '../components/ui/Brand'
import { useAuth } from '../contexts/AuthContext'

const YEAR = new Date().getFullYear()

const FEATURES = [
  { icon: Video, title: 'Peer-to-peer HD video', text: 'Audio and video travel directly between browsers over WebRTC. The server only helps you find each other.' },
  { icon: MonitorUp, title: 'Screen sharing', text: 'Present a tab, window or your whole screen, then switch back to your camera with one click.' },
  { icon: MessageSquare, title: 'In-call chat', text: 'Send links and notes to everyone in the room. Messages last only as long as the meeting.' },
  { icon: Lock, title: 'Host controls', text: 'The host can lock the room, ask people to mute, and remove anyone who should not be there.' },
  { icon: Hand, title: 'Raise hand & reactions', text: 'Get a word in without interrupting, or answer with a quick reaction.' },
  { icon: SlidersHorizontal, title: 'Pre-join lobby', text: 'Check how you look and sound and pick your camera and microphone before you go in.' },
]

const PEOPLE = [
  { name: 'Ana', hue: 18, speaking: true },
  { name: 'Kofi', hue: 205 },
  { name: 'Mei', hue: 280 },
  { name: 'You', hue: 150, muted: true },
]

function HeroIllustration() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="hero-stage">
        {PEOPLE.map((p) => (
          <div key={p.name} className={`hero-tile ${p.speaking ? 'is-speaking' : ''}`} style={{ '--h': p.hue }}>
            <div className="hero-figure">
              <span className="hero-head" />
              <span className="hero-body" />
            </div>
            <span className="hero-name">
              {p.muted && <span className="hero-muted" />}
              {p.name}
            </span>
          </div>
        ))}
      </div>
      <div className="hero-controls">
        <span className="hero-ctrl" />
        <span className="hero-ctrl" />
        <span className="hero-ctrl" />
        <span className="hero-ctrl hero-ctrl-end" />
      </div>
      <div className="hero-bubble">
        <strong>Kofi</strong>
        <span>Sharing the deck now 👋</span>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="page landing">
      <AppHeader />

      <main>
        <section className="container hero">
          <div className="hero-copy">
            <p className="eyebrow">Browser-based video meetings</p>
            <h1>
              Meet face to face.
              <br />
              <span className="accent-text">Just share a link.</span>
            </h1>
            <p className="hero-lede">
              {APP_NAME} gives you instant rooms for small teams, classes and catch-ups. Nothing to install: open the link, check your camera,
              and join.
            </p>
            <JoinMeetingForm />
            <p className="hero-note">
              <ShieldCheck size={16} aria-hidden="true" />
              {user ? `Signed in as ${user.name}. Meetings you join are saved to your history.` : 'Guests join with just a name. Sign in to keep your meeting history.'}
            </p>
          </div>
          <HeroIllustration />
        </section>

        <section className="container features" aria-labelledby="features-title">
          <div className="section-head">
            <p className="eyebrow">What's inside</p>
            <h2 id="features-title">Everything a small meeting needs</h2>
          </div>
          <ul className="feature-grid">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="feature">
                <span className="feature-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="container steps" aria-labelledby="steps-title">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2 id="steps-title">From link to call in three steps</h2>
          </div>
          <ol className="step-list">
            <li>
              <span className="step-num">1</span>
              <h3>Start a room</h3>
              <p className="muted">Click New meeting to get a private code. Copy the invite link from inside the room.</p>
            </li>
            <li>
              <span className="step-num">2</span>
              <h3>Check your setup</h3>
              <p className="muted">The lobby previews your camera and microphone so you can fix things before anyone sees you.</p>
            </li>
            <li>
              <span className="step-num">3</span>
              <h3>Talk</h3>
              <p className="muted">Rooms fit up to six people, which keeps peer-to-peer calls smooth on ordinary connections.</p>
            </li>
          </ol>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container site-footer-inner">
          <span>© {YEAR} {APP_NAME}</span>
          <span className="muted">Built with MongoDB, Express, React, Node.js, Socket.IO and WebRTC</span>
        </div>
      </footer>
    </div>
  )
}
