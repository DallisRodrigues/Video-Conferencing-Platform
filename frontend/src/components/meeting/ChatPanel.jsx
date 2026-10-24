import { useEffect, useRef, useState } from 'react'
import { SendHorizontal, X } from 'lucide-react'
import { formatTime } from '../../utils/format'

const MAX_LENGTH = 1000

export default function ChatPanel({ client, state, onClose }) {
  const { messages, selfId } = state
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = async (e) => {
    e?.preventDefault()
    const value = text.trim()
    if (!value || sending) return
    setSending(true)
    const res = await client.sendChat(value)
    setSending(false)
    if (res?.ok) {
      setText('')
      setError('')
    } else {
      setError(res?.error || 'Message not sent.')
    }
  }

  return (
    <aside className="side-panel" aria-labelledby="chat-title">
      <header className="side-panel-head">
        <h2 id="chat-title">In-call messages</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close chat">
          <X size={18} />
        </button>
      </header>
      <p className="side-panel-note">Messages are visible to everyone in the call and disappear when the meeting ends.</p>

      <ol className="chat-list" ref={listRef} aria-live="polite" data-testid="chat-list">
        {messages.length === 0 && <li className="chat-empty">No messages yet. Say hello 👋</li>}
        {messages.map((m, i) => {
          const mine = m.from === selfId
          const grouped = i > 0 && messages[i - 1].from === m.from && m.ts - messages[i - 1].ts < 60_000
          return (
            <li key={m.id} className={`chat-msg ${mine ? 'is-mine' : ''} ${grouped ? 'is-grouped' : ''}`}>
              {!grouped && (
                <div className="chat-meta">
                  <strong>{mine ? 'You' : m.name}</strong>
                  <time dateTime={new Date(m.ts).toISOString()}>{formatTime(m.ts)}</time>
                </div>
              )}
              <p className="chat-text">{m.text}</p>
            </li>
          )
        })}
      </ol>

      <form className="chat-form" onSubmit={send}>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="chat-input-row">
          <label htmlFor="chat-input" className="sr-only">
            Send a message
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            className="input chat-input"
            rows={1}
            maxLength={MAX_LENGTH}
            placeholder="Send a message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button type="submit" className="icon-btn chat-send" disabled={!text.trim() || sending} aria-label="Send message">
            <SendHorizontal size={18} />
          </button>
        </div>
      </form>
    </aside>
  )
}
