import { useState, useEffect } from 'react'
import { apiGet } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'

function ThresholdBadge({ hours }) {
  if (hours >= 20) return <span className="badge badge--success">20+ hrs (benefit eligible)</span>
  if (hours >= 10) return <span className="badge badge--warning">10+ hrs (part-time)</span>
  return <span className="badge badge--danger">&lt;10 hrs</span>
}

export default function PerformanceTracking() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const result = await apiGet('/analytics/performance')
      setData(result || [])
    } catch (err) {
      console.error('Failed to load performance data:', err)
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
        <h2 className="page-title">Performance Tracking</h2>
      </div>

      {data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📈</div>
          <h3>No performance data yet</h3>
          <p>Performance metrics will populate from approved rollup data.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Avg Weekly Hours</th>
                <th>Threshold</th>
                <th>Total Clients</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="data-table-row">
                  <td className="data-table-primary">{row.user_name}</td>
                  <td>{row.role}</td>
                  <td>{(row.avg_weekly_hours || 0).toFixed(1)}</td>
                  <td><ThresholdBadge hours={row.avg_weekly_hours || 0} /></td>
                  <td>{row.client_count || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
