import { useState, useEffect, useRef } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'

const STATUS_OPTIONS = ['draft', 'open', 'closed']

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PayPeriods() {
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [detailPeriod, setDetailPeriod] = useState(null)
  const [recipients, setRecipients] = useState([])
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [copied, setCopied] = useState(null)
  const verb = useLoadingVerb(loading)

  // Undo close state
  const [pendingClose, setPendingClose] = useState(null) // { id, label, countdown }
  const closeTimerRef = useRef(null)
  const countdownRef = useRef(null)

  // Delete mode state
  const [deleteMode, setDeleteMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // period to confirm

  useEffect(() => { loadPeriods() }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  async function loadPeriods() {
    setLoading(true)
    try {
      const data = await apiGet('/payroll/pay-periods')
      setPeriods(data || [])
    } catch (err) {
      console.error('Failed to load pay periods:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(type) {
    setCreating(true)
    setError('')
    try {
      await apiPost('/payroll/pay-periods', { period_type: type })
      setShowCreate(false)
      loadPeriods()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleOpen(id) {
    try {
      const result = await apiPost(`/payroll/pay-periods/${id}/open`)
      loadPeriods()
      // Auto-open the detail view after opening
      loadRecipients(id)
      const period = periods.find(p => p.id === id)
      setDetailPeriod({ ...period, status: 'open', id })
    } catch (err) {
      alert('Error opening pay period: ' + err.message)
    }
  }

  function initiateClose(id) {
    // Start the 5-second undo timer
    const period = periods.find(p => p.id === id)
    const label = period?.label || 'this period'
    setPendingClose({ id, label, countdown: 5 })

    // Countdown ticker
    countdownRef.current = setInterval(() => {
      setPendingClose(prev => {
        if (!prev) return null
        const next = prev.countdown - 1
        if (next <= 0) return prev // let the timeout handle final
        return { ...prev, countdown: next }
      })
    }, 1000)

    // Actually close after 5 seconds
    closeTimerRef.current = setTimeout(async () => {
      clearInterval(countdownRef.current)
      countdownRef.current = null
      try {
        await apiPost(`/payroll/pay-periods/${id}/close`)
        loadPeriods()
        setDetailPeriod(null)
      } catch (err) {
        alert('Error closing pay period: ' + err.message)
      } finally {
        setPendingClose(null)
      }
    }, 5000)
  }

  function undoClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    closeTimerRef.current = null
    countdownRef.current = null
    setPendingClose(null)
  }

  async function handleDelete(id) {
    try {
      await apiDelete(`/payroll/pay-periods/${id}`)
      setConfirmDelete(null)
      setDeleteMode(false)
      loadPeriods()
    } catch (err) {
      alert('Error deleting pay period: ' + err.message)
    }
  }

  async function loadRecipients(periodId) {
    setLoadingRecipients(true)
    try {
      const data = await apiGet(`/payroll/pay-periods/${periodId}/recipients`)
      setRecipients(data || [])
    } catch (err) {
      console.error('Failed to load recipients:', err)
      setRecipients([])
    } finally {
      setLoadingRecipients(false)
    }
  }

  function viewDetail(period) {
    if (deleteMode) return // don't navigate in delete mode
    setDetailPeriod(period)
    loadRecipients(period.id)
  }

  function getInvoiceUrl(draftToken) {
    const base = window.location.origin
    return `${base}/invoice/${draftToken}`
  }

  async function copyLink(url, id) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  // Detail view for a specific period
  if (detailPeriod) {
    return (
      <div>
        <div className="page-header">
          <div>
            <button className="btn btn--ghost btn--small" onClick={() => setDetailPeriod(null)} style={{ marginBottom: '0.5rem' }}>← Back to Pay Periods</button>
            <h2 className="page-title">{detailPeriod.label || `${formatDate(detailPeriod.start_date)} – ${formatDate(detailPeriod.end_date)}`}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {formatDate(detailPeriod.start_date)} – {formatDate(detailPeriod.end_date)} · Due: {formatDate(detailPeriod.due_date)} · <StatusBadge status={detailPeriod.status} />
            </p>
          </div>
        </div>

        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {detailPeriod.status === 'open' && !pendingClose && (
            <button className="btn btn--small btn--secondary" onClick={() => initiateClose(detailPeriod.id)}>Close Period</button>
          )}
          {pendingClose && pendingClose.id === detailPeriod.id && (
            <div className="undo-close-bar">
              <span>Closing in {pendingClose.countdown}s…</span>
              <button className="btn btn--small btn--primary" onClick={undoClose}>Undo</button>
            </div>
          )}
        </div>

        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Recipients ({recipients.length})</h3>

        {loadingRecipients ? (
          <div className="page-loading"><div className="loading-spinner" /></div>
        ) : recipients.length === 0 ? (
          <div className="empty-state">
            <p>No recipients for this period yet. Open the period to auto-generate the recipient list.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Invoice Link</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map(r => (
                  <tr key={r.id} className="data-table-row">
                    <td className="data-table-primary">{r.user_name || 'Unknown'}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>
                      {r.draft_token ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '0.2rem 0.4rem', borderRadius: '4px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                            {getInvoiceUrl(r.draft_token)}
                          </code>
                          <button
                            className="btn btn--small btn--ghost"
                            onClick={() => copyLink(getInvoiceUrl(r.draft_token), r.id)}
                          >
                            {copied === r.id ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                      ) : '—'}
                    </td>
                    <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Pay Periods</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className={`btn ${deleteMode ? 'btn--secondary' : 'btn--danger-ghost'}`}
            onClick={() => { setDeleteMode(m => !m); setConfirmDelete(null) }}
          >
            {deleteMode ? 'Done' : '- Delete'}
          </button>
          <button className="btn btn--primary" onClick={() => setShowCreate(true)}>+ New Pay Period</button>
        </div>
      </div>

      {/* Undo close banner (list view) */}
      {pendingClose && (
        <div className="undo-close-bar" style={{ marginBottom: '1rem' }}>
          <span>Closing "{pendingClose.label}" in {pendingClose.countdown}s…</span>
          <button className="btn btn--small btn--primary" onClick={undoClose}>Undo</button>
        </div>
      )}

      {periods.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h3>No pay periods yet</h3>
          <p>Create your first pay period to start accepting invoices.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                {deleteMode && <th style={{ width: 40 }}></th>}
                <th>Period</th>
                <th>Date Range</th>
                <th>Recipients</th>
                <th>Received</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {periods.map(p => (
                <tr key={p.id} className={`data-table-row ${p.status === 'open' ? 'data-table-row--open' : ''} ${p.status === 'closed' ? 'data-table-row--closed' : ''}`} style={{ cursor: deleteMode ? 'default' : 'pointer' }} onClick={() => viewDetail(p)}>
                  {deleteMode && (
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        className="pp-delete-x"
                        onClick={() => setConfirmDelete(p)}
                        title="Delete this pay period"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                  <td className="data-table-primary">{p.label || `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`}</td>
                  <td>{formatDate(p.start_date)} – {formatDate(p.end_date)}</td>
                  <td>{p.recipient_count || 0}</td>
                  <td>{p.received_count || 0}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    <div className="table-actions" onClick={e => e.stopPropagation()}>
                      {p.status === 'draft' && (
                        <button className="btn btn--small btn--primary" onClick={() => handleOpen(p.id)}>Open & Send</button>
                      )}
                      {p.status === 'open' && !pendingClose && (
                        <button className="btn btn--small btn--secondary" onClick={() => initiateClose(p.id)}>Close</button>
                      )}
                      {p.status === 'open' && pendingClose && pendingClose.id === p.id && (
                        <button className="btn btn--small btn--primary" onClick={undoClose}>Undo ({pendingClose.countdown})</button>
                      )}
                      {!deleteMode && <button className="btn btn--small btn--ghost" onClick={() => viewDetail(p)}>View</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Pay Period">
        {confirmDelete && (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Are you sure you want to permanently delete this pay period?
            </p>
            <div style={{ padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-bright)' }}>
                {confirmDelete.label || `${formatDate(confirmDelete.start_date)} – ${formatDate(confirmDelete.end_date)}`}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {confirmDelete.recipient_count || 0} recipients · {confirmDelete.received_count || 0} received
              </div>
            </div>
            <div style={{ padding: '0.625rem 0.875rem', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.825rem', color: '#f87171', marginBottom: '1.25rem' }}>
              ⚠️ This will permanently delete the pay period and all associated recipient data. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn--secondary btn--small" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn--danger btn--small" onClick={() => handleDelete(confirmDelete.id)}>Delete Permanently</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setError('') }} title="Create Pay Period">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Select the pay period type. The system will auto-calculate the date range for the current month.
        </p>
        {error && <div className="form-error">{error}</div>}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => handleCreate('first_half')} disabled={creating}>
            1st – 15th
          </button>
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => handleCreate('second_half')} disabled={creating}>
            16th – End of Month
          </button>
        </div>
      </Modal>
    </div>
  )
}
