import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ApprovalQueue() {
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('received')
  const [selected, setSelected] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [overrides, setOverrides] = useState({})
  const [rejectReason, setRejectReason] = useState('')
  const [zeroReason, setZeroReason] = useState('')
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadRecipients() }, [filter])

  async function loadRecipients() {
    setLoading(true)
    try {
      const data = await apiGet(`/payroll/approval-queue?status=${filter}`)
      setRecipients(data || [])
    } catch (err) {
      console.error('Failed to load approval queue:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(recipient) {
    setProcessing(true)
    try {
      await apiPost(`/payroll/recipients/${recipient.id}/approve`, {
        overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      })
      setSelected(null)
      setOverrides({})
      loadRecipients()
    } catch (err) {
      alert('Error approving: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleReject(recipient) {
    if (!rejectReason.trim()) { alert('Please provide a reason'); return }
    setProcessing(true)
    try {
      await apiPost(`/payroll/recipients/${recipient.id}/reject`, { reason: rejectReason })
      setSelected(null)
      setRejectReason('')
      loadRecipients()
    } catch (err) {
      alert('Error rejecting: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleZeroHours(recipient) {
    if (!zeroReason.trim()) { alert('Please provide a reason'); return }
    setProcessing(true)
    try {
      await apiPost(`/payroll/recipients/${recipient.id}/zero-hours`, { reason: zeroReason })
      setSelected(null)
      setZeroReason('')
      loadRecipients()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Approval Queue</h2>
      </div>

      <div className="filter-tabs">
        {['received', 'approved', 'rejected', 'zero_hours', 'all'].map(f => (
          <button key={f} className={`filter-tab ${filter === f ? 'filter-tab--active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'zero_hours' ? 'Zero Hours' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {recipients.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No {filter !== 'all' ? filter : ''} submissions</h3>
          <p>Submitted invoices will appear here for review.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Pay Period</th>
                <th>Submitted</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recipients.map(r => (
                <tr key={r.id} className="data-table-row" onClick={() => setSelected(r)}>
                  <td className="data-table-primary">{r.user_name || `${r.first_name || ''} ${r.last_name || ''}`}</td>
                  <td>{formatDate(r.period_start)} – {formatDate(r.period_end)}</td>
                  <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td><button className="btn btn--small btn--ghost" onClick={e => { e.stopPropagation(); setSelected(r) }}>Review</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!selected} onClose={() => { setSelected(null); setRejectReason(''); setZeroReason(''); setOverrides({}) }} title="Review Submission" wide>
        {selected && (
          <div>
            <div className="modal-section">
              <div className="modal-label">Recipient</div>
              <div className="modal-value">{selected.user_name || `${selected.first_name || ''} ${selected.last_name || ''}`}</div>
            </div>
            <div className="modal-section">
              <div className="modal-label">Status</div>
              <StatusBadge status={selected.status} />
            </div>

            {selected.invoice_data && (
              <div className="hours-grid" style={{ marginTop: '1rem' }}>
                {Object.entries(selected.invoice_data).filter(([k]) => k !== 'notes' && k !== 'op_sessions').map(([key, val]) => (
                  <div key={key} className="hours-grid-row">
                    <span className="hours-grid-label">{key.replace(/_/g, ' ')}</span>
                    <span className="hours-grid-value">{val}</span>
                  </div>
                ))}
              </div>
            )}

            {selected.status === 'received' && (
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button className="btn btn--primary" onClick={() => handleApprove(selected)} disabled={processing}>
                  {processing ? 'Processing…' : 'Approve'}
                </button>
                <div>
                  <input className="form-input" placeholder="Rejection reason (required)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                  <button className="btn btn--danger btn--small" style={{ marginTop: '0.375rem' }} onClick={() => handleReject(selected)} disabled={processing}>Reject</button>
                </div>
                <div>
                  <input className="form-input" placeholder="Zero hours reason (required)" value={zeroReason} onChange={e => setZeroReason(e.target.value)} />
                  <button className="btn btn--secondary btn--small" style={{ marginTop: '0.375rem' }} onClick={() => handleZeroHours(selected)} disabled={processing}>Mark Zero Hours</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
