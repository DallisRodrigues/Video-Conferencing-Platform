import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import Brand, { APP_NAME } from '../components/ui/Brand'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/Toast'

export default function Authentication() {
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'signup' ? 'signup' : 'signin'
  const { user, status, handleLogin, handleRegister } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const [form, setForm] = useState({ name: '', username: '', password: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  if (status === 'ready' && user) return <Navigate to={location.state?.from || '/home'} replace />

  const setMode = (next) => {
    setParams(next === 'signup' ? { mode: 'signup' } : {}, { replace: true })
    setErrors({})
    setError('')
  }

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((errs) => ({ ...errs, [key]: undefined }))
  }

  const validate = () => {
    const next = {}
    if (mode === 'signup' && !form.name.trim()) next.name = 'Enter your name.'
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(form.username.trim())) next.username = 'Use 3–30 letters, numbers, dots, dashes or underscores.'
    if (mode === 'signup' ? form.password.length < 8 : !form.password) {
      next.password = mode === 'signup' ? 'Use at least 8 characters.' : 'Enter your password.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    if (submitting || !validate()) return
    setSubmitting(true)
    setError('')
    try {
      if (mode === 'signin') {
        await handleLogin(form.username.trim(), form.password)
        navigate(location.state?.from || '/home', { replace: true })
      } else {
        const message = await handleRegister(form.name.trim(), form.username.trim(), form.password)
        toast(message || 'Account created. Sign in to continue.', 'success')
        setForm((f) => ({ ...f, password: '' }))
        setMode('signin')
      }
    } catch (err) {
      setError(err.message)
      if (err.details) setErrors(err.details)
    } finally {
      setSubmitting(false)
    }
  }

  const fieldProps = (key) => ({
    id: key,
    className: 'input',
    value: form[key],
    onChange: update(key),
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `${key}-error` : undefined,
  })

  return (
    <div className="page auth-page">
      <div className="auth-side" aria-hidden="true">
        <Brand />
        <div className="auth-side-copy">
          <h2>Good conversations start with showing up.</h2>
          <p>Create an account to keep a record of the meetings you've joined and rejoin them in one click.</p>
        </div>
        <div className="auth-orbs">
          <span />
          <span />
          <span />
        </div>
      </div>

      <main className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-card">
          <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="muted">{mode === 'signin' ? `Sign in to ${APP_NAME}.` : 'It takes less than a minute.'}</p>

          <div className="segmented" role="tablist" aria-label="Choose sign in or sign up">
            <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => setMode('signin')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>
              Sign up
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuth} noValidate>
            {error && (
              <div className="alert alert-error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {mode === 'signup' && (
              <div className="field">
                <label htmlFor="name">Full name</label>
                <input {...fieldProps('name')} autoComplete="name" maxLength={50} autoFocus />
                {errors.name && (
                  <span id="name-error" className="field-error">
                    {errors.name}
                  </span>
                )}
              </div>
            )}

            <div className="field">
              <label htmlFor="username">Username</label>
              <input {...fieldProps('username')} autoComplete="username" autoCapitalize="none" spellCheck="false" maxLength={30} autoFocus={mode === 'signin'} />
              {errors.username && (
                <span id="username-error" className="field-error">
                  {errors.username}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  {...fieldProps('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  maxLength={128}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password ? (
                <span id="password-error" className="field-error">
                  {errors.password}
                </span>
              ) : (
                mode === 'signup' && <span className="field-hint">At least 8 characters.</span>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
              {submitting && <span className="spinner" aria-hidden="true" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="auth-footnote muted">
            Just joining a call? <Link to="/">You don't need an account.</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
