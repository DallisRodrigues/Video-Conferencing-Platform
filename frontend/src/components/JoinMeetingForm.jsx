import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Keyboard, Plus } from 'lucide-react'
import { generateMeetingCode, parseMeetingInput } from '../lib/meetingCode'

export default function JoinMeetingForm({ compact = false }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const join = (e) => {
    e.preventDefault()
    const code = parseMeetingInput(value)
    if (!code) {
      setError('Enter a meeting code like abc-defg-hij, or paste an invite link.')
      return
    }
    navigate(`/${code}`)
  }

  return (
    <div className={`join-form ${compact ? 'join-form-compact' : ''}`}>
      <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate(`/${generateMeetingCode()}`)}>
        <Plus size={18} aria-hidden="true" />
        New meeting
      </button>
      <form className="join-code" onSubmit={join} noValidate>
        <div className="join-code-field">
          <Keyboard size={18} aria-hidden="true" className="join-code-icon" />
          <label htmlFor="join-code" className="sr-only">
            Meeting code or link
          </label>
          <input
            id="join-code"
            className="input"
            placeholder="Code or link"
            value={value}
            autoComplete="off"
            spellCheck="false"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'join-code-error' : undefined}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
          />
        </div>
        <button type="submit" className="btn btn-lg" disabled={!value.trim()}>
          Join
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </form>
      {error && (
        <p id="join-code-error" className="field-error join-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
