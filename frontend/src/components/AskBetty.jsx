import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const PAGE_LABELS = {
  '/home': 'Home',
  '/admin/analytics': 'Analytics',
  '/admin/payroll': 'Payroll',
  '/admin/users': 'Users',
  '/admin/knowledge-base': 'Knowledge Base',
  '/admin/settings': 'Settings',
  '/admin/task-templates': 'Task Templates',
  '/admin/tasks': 'All Tasks',
  '/therapist/stats': 'My Stats',
  '/therapist/invoices': 'Invoices',
  '/therapist/time-off': 'Time Off',
  '/therapist/knowledge-base': 'Knowledge Base',
  '/clinical/stats': 'My Stats',
  '/clinical/supervisees': 'Supervisees',
  '/clinical/supervision': 'Supervision',
  '/clinical/invoices': 'Invoices',
  '/clinical/time-off': 'Time Off',
  '/clinical/knowledge-base': 'Knowledge Base',
  '/knowledge-base': 'Knowledge Base',
  '/my-work': 'My Work',
}

const ROLE_LABELS = {
  admin: 'Admin',
  clinical_leader: 'Clinical Leader',
  therapist: 'Therapist',
  front_desk: 'Front Desk',
  ba: 'Billing Admin',
  medical_biller: 'Medical Biller',
}

export default function AskBetty() {
  const { profile } = useAuth()
  const location = useLocation()
  const [prompt, setPrompt] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [submittedPrompt, setSubmittedPrompt] = useState('')

  const pageName = PAGE_LABELS[location.pathname] || 'Dashboard'
  const roleName = ROLE_LABELS[profile?.role] || profile?.role || 'User'

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!prompt.trim()) return
    setSubmittedPrompt(prompt.trim())
    setPrompt('')
    setModalOpen(true)
  }

  return (
    <>
      {/* Fixed bottom bar */}
      <div className="betty-bar">
        <form className="betty-form" onSubmit={handleSubmit}>
          <div className="betty-brain">
            {/* Inline brain SVG */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
            </svg>
          </div>
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
                <div style={{
                  marginTop: '0.5rem',
                  padding: '1.25rem',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    AI Integration Coming Soon
                  </div>
                  Betty is not connected to an AI provider yet. To enable Betty, an OpenAI (or other LLM) API key needs to be configured in the backend environment settings.
                  <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', opacity: 0.7 }}>
                    Once configured, Betty will be able to answer questions about your dashboard, tasks, meetings, and more.
                  </div>
                </div>
              </div>
              <div className="modal-section" style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Context: {pageName} · {roleName}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
