import { useState, useEffect } from 'react'
import { apiGet, apiPost, apiPatch } from '../../lib/api'
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

  useEffect(() => { loadPeriods() }, [])

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

  async function handleClose(id) {
    try {
      await apiPost(`/payroll/pay-periods/${id}/close`)
      loadPeriods()
      setDetailPeriod(null)
    } catch (err) {
      alert('Error closing pay period: ' + err.message)
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
          {detailPeriod.status === 'open' && (
            <button className="btn btn--small btn--secondary" onClick={() => handleClose(detailPeriod.id)}>Close Period</button>
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
        <button className="btn btn--primary" onClick={() => setShowCreate(true)}>+ New Pay Period</button>
      </div>

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
                <tr key={p.id} className={`data-table-row ${p.status === 'open' ? 'data-table-row--open' : ''} ${p.status === 'closed' ? 'data-table-row--closed' : ''}`} style={{ cursor: 'pointer' }} onClick={() => viewDetail(p)}>
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
                      {p.status === 'open' && (
                        <button className="btn btn--small btn--secondary" onClick={() => handleClose(p.id)}>Close</button>
                      )}
                      <button className="btn btn--small btn--ghost" onClick={() => viewDetail(p)}>View</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
