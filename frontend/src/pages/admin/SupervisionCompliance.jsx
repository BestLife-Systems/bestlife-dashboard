import { useState, useEffect } from 'react'
import { apiGet } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import StatusBadge from '../../components/StatusBadge'

export default function SupervisionCompliance() {
  const { profile, isAdmin } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const result = await apiGet('/analytics/supervision-compliance')
      setData(result || [])
    } catch (err) {
      console.error('Failed to load supervision data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Supervision Compliance</h2>
      </div>

      {data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛡️</div>
          <h3>No supervision data yet</h3>
          <p>Compliance tracking will populate once supervision assignments and sessions are configured.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Supervisee</th>
                <th>Supervisor</th>
                <th>Required</th>
                <th>Completed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="data-table-row">
                  <td className="data-table-primary">{row.supervisee_name}</td>
                  <td>{row.supervisor_name || '—'}</td>
                  <td>{row.sessions_required || '—'}</td>
                  <td>{row.sessions_completed || 0}</td>
                  <td><StatusBadge status={row.compliant ? 'active' : 'overdue'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
