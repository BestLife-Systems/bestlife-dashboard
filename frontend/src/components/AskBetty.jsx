import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useLoadingVerb } from '../hooks/useLoadingVerb'
import { apiPost } from '../lib/api'

const ROLE_LABELS = {
  admin: 'Admin',
  clinical_leader: 'Clinical Leader',
  therapist: 'Therapist',
  ba: 'Behavioral Assistant',
  front_desk: 'Front Desk',
  medical_biller: 'Medical Biller',
  apn: 'APN',
}

export default function AskBetty() {
  const { profile } = useAuth()
  const location = useLocation()
  const [prompt, setPrompt] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [submittedPrompt, setSubmittedPrompt] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const pageName = location.pathname.split('/').filter(Boolean).join(' > ') || 'Home'
  const roleName = ROLE_LABELS[profile?.role] || profile?.role || 'User'
  const verb = useLoadingVerb(loading)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!prompt.trim()) return
    const q = prompt.trim()
    setSubmittedPrompt(q)
    setPrompt('')
    setModalOpen(true)
    setLoading(true)
    setError(null)
    setResponse('')

    try {
      const result = await apiPost('/ai/chat', {
        prompt: q,
        context: `User role: ${roleName}. Current page: ${pageName}.`,
        max_tokens: 1024,
      })
      setResponse(result.response)
    } catch (err) {
      setError(err.message || 'Failed to get response')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Global fixed bottom bar */}
      <div className="betty-global-bar">
        <form className="betty-form" onSubmit={handleSubmit}>
          <div className="betty-brain">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
            </svg>
          </div>
          <span className="betty-label">Go ahead</span>
          <input
            className="betty-input"
            type="text"
            placeholder="Ask Betty anything…"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <button className="betty-submit btn btn--primary btn--small" type="submit">Ask</button>
        </form>
      </div>

      {/* Response modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
                  <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
                </svg>
                <span className="modal-title">Ask Betty</span>
              </div>
              <button className="modal-close" onClick={() => setModalOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <div className="modal-label">Your question</div>
                <div className="modal-value" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>"{submittedPrompt}"</div>
              </div>
              <div className="modal-section" style={{ marginTop: '1.25rem' }}>
                <div className="modal-label">Betty says</div>
                <div className="betty-response-box">
                  {loading ? (
                    <div className="betty-loading">
                      <span className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                      <span>{verb}...</span>
                    </div>
                  ) : error ? (
                    <div className="betty-error">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                      {error}
                    </div>
                  ) : (
                    <div className="betty-answer">{response}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
