import { lazy, Suspense } from 'react'
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import LandingPage from './pages/landing'
import Authentication from './pages/authentication'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './components/ui/Toast'
import HomeComponent from './pages/home'
import History from './pages/history'
import NotFound from './pages/notFound'
import './styles/pages.css'

const VideoMeetComponent = lazy(() => import('./pages/VideoMeet'))

function App() {
  return (
    <Router>
      <ToastProvider>
        <AuthProvider>
          <Suspense
            fallback={
              <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                <span className="spinner" aria-label="Loading" />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<Authentication />} />
              <Route path="/home" element={<HomeComponent />} />
              <Route path="/history" element={<History />} />
              <Route path="/:url" element={<VideoMeetComponent />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </Router>
  )
}

export default App
