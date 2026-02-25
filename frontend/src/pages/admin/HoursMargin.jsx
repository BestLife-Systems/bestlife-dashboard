import { useState, useEffect } from 'react'
import { apiGet } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'

export default function HoursMargin() {
  const [data, setData] = useState(null)
  const [view, setView] = useState('pay_period')
  const [loading, setLoading] = useState(true)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadData() }, [view])

  async function loadData() {
    setLoading(true)
    try {
      const result = await apiGet(`/analytics/hours-margin?view=${view}`)
      setData(result)
    } catch (err) {
      console.error('Failed to load hours/margin data:', err)
      setData(null)
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
        <h2 className="page-title">Hours & Margin</h2>
      </div>

      <div className="filter-tabs">
        <button className={`filter-tab ${view === 'pay_period' ? 'filter-tab--active' : ''}`} onClick={() => setView('pay_period')}>Pay Period</button>
        <button className={`filter-tab ${view === 'monthly' ? 'filter-tab--active' : ''}`} onClick={() => setView('monthly')}>Monthly</button>
      </div>

      {!data || (!data.rows?.length) ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h3>No rollup data yet</h3>
          <p>Hours and margin data will appear here after invoices are approved and rollups are generated.</p>
        </div>
      ) : (
        <div className="table-wrapper" style={{ marginTop: '1rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Total Hours</th>
                <th>Est. Bill</th>
                <th>Est. Pay</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {(data.rows || []).map((row, i) => (
                <tr key={i} className="data-table-row">
                  <td className="data-table-primary">{row.user_name}</td>
                  <td>{(row.total_hours || 0).toFixed(1)}</td>
                  <td>${(row.est_bill || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>${(row.est_pay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td style={{ color: (row.margin || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    ${(row.margin || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
