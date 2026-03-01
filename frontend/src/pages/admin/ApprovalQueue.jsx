import { useState, useEffect } from 'react'
import { apiGet } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import { formatDate } from '../../lib/utils'
import StatusBadge from '../../components/StatusBadge'
import ReviewPage from './ReviewPage'

// ── Main Queue List ──
export default function ApprovalQueue() {
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('received')
  const [selected, setSelected] = useState(null)
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

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  if (selected) {
    return <ReviewPage recipient={selected} onBack={() => setSelected(null)} onUpdate={loadRecipients} />
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Approval Queue</h2>
      </div>

      <div className="filter-tabs">
        {['received', 'approved', 'rejected', 'all'].map(f => (
          <button key={f} className={`filter-tab ${filter === f ? 'filter-tab--active' : ''}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
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
                <tr key={r.id} className="data-table-row" style={{ cursor: 'pointer' }} onClick={() => setSelected(r)}>
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
    </div>
  )
}
