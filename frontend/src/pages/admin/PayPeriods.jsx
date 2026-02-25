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
      await apiPost(`/payroll/pay-periods/${id}/open`)
      loadPeriods()
    } catch (err) {
      alert('Error opening pay period: ' + err.message)
    }
  }

  async function handleClose(id) {
    try {
      await apiPost(`/payroll/pay-periods/${id}/close`)
      loadPeriods()
    } catch (err) {
      alert('Error closing pay period: ' + err.message)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
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
                <tr key={p.id} className="data-table-row">
                  <td className="data-table-primary">{p.label || `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`}</td>
                  <td>{formatDate(p.start_date)} – {formatDate(p.end_date)}</td>
                  <td>{p.recipient_count || 0}</td>
                  <td>{p.received_count || 0}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    <div className="table-actions">
                      {p.status === 'draft' && (
                        <button className="btn btn--small btn--primary" onClick={() => handleOpen(p.id)}>Open & Send</button>
                      )}
                      {p.status === 'open' && (
                        <button className="btn btn--small btn--secondary" onClick={() => handleClose(p.id)}>Close</button>
                      )}
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
