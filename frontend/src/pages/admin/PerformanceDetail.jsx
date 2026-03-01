import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiGet } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'

const EMP_LABELS = { full_time: 'FT', part_time: 'PT', '1099': '1099' }
const EMP_COLORS = { full_time: '#4ade80', part_time: '#facc15', '1099': '#f97316' }

export default function PerformanceDetail() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('monthly') // 'monthly' | 'quarterly'
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadData() }, [userId])

  async function loadData() {
    setLoading(true)
    try {
      const result = await apiGet(`/analytics/performance/${userId}`)
      setData(result)
    } catch (err) {
      console.error('Failed to load performance detail:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  if (!data) {
    return (
      <div>
        <div className="page-header">
          <h2 className="page-title">Performance Detail</h2>
          <button className="btn btn--ghost btn--small" onClick={() => navigate(-1)}>← Back</button>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">📈</div>
          <h3>No data found</h3>
        </div>
      </div>
    )
  }

  const { user, threshold, months, quarters } = data
  const empColor = EMP_COLORS[user.employment_status] || EMP_COLORS.full_time

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{user.name}</h2>
          <div className="page-header-sub">
            <span className="perf-emp-badge" style={{ borderColor: empColor, color: empColor }}>
              {EMP_LABELS[user.employment_status] || 'FT'}
            </span>
            <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Threshold: {threshold} hrs/mo
            </span>
          </div>
        </div>
        <button className="btn btn--ghost btn--small" onClick={() => navigate(-1)}>← Back</button>
      </div>

      <div className="perf-detail-toggle">
        <button
          className={`tab-btn ${view === 'monthly' ? 'tab-btn--active' : ''}`}
          onClick={() => setView('monthly')}
        >Monthly</button>
        <button
          className={`tab-btn ${view === 'quarterly' ? 'tab-btn--active' : ''}`}
          onClick={() => setView('quarterly')}
        >Quarterly</button>
      </div>

      {view === 'monthly' ? (
        <div className="table-wrapper" style={{ marginTop: '1rem' }}>
          <table className="data-table perf-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">IIC</th>
                <th className="num">OP</th>
                <th className="num">OP Cancel</th>
                <th className="num">SBYS</th>
                <th className="num">ADOS</th>
                <th className="num">APN</th>
                <th className="num">Sup</th>
                <th className="num">Sick</th>
                <th className="num">PTO</th>
                <th className="num">Total</th>
                <th className="num">Status</th>
              </tr>
            </thead>
            <tbody>
              {months.map(row => (
                <tr key={row.month} className="data-table-row">
                  <td className="data-table-primary">{row.label}</td>
                  <td className="num">{row.iic || '—'}</td>
                  <td className="num">{row.op || '—'}</td>
                  <td className="num">{row.op_cancel || '—'}</td>
                  <td className="num">{row.sbys || '—'}</td>
                  <td className="num">{row.ados || '—'}</td>
                  <td className="num">{row.apn || '—'}</td>
                  <td className="num">{row.sup || '—'}</td>
                  <td className="num">{row.sick || '—'}</td>
                  <td className="num">{row.pto || '—'}</td>
                  <td className="num perf-total-bold">{row.total_hours || '—'}</td>
                  <td className={`num perf-avg ${row.on_track ? 'perf-avg--on-track' : 'perf-avg--off-track'}`}>
                    {row.total_hours}{row.on_track ? ' ✓' : ' ✗'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="perf-quarters" style={{ marginTop: '1rem' }}>
          {quarters.map(q => (
            <div key={q.quarter} className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-bright)' }}>{q.quarter}</span>
                <span className={`perf-avg ${q.on_track ? 'perf-avg--on-track' : 'perf-avg--off-track'}`} style={{ fontSize: '0.85rem' }}>
                  Avg: {q.avg_per_month} hrs/mo
                </span>
              </div>
              <div className="table-wrapper">
                <table className="data-table perf-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="num">IIC</th>
                      <th className="num">OP</th>
                      <th className="num">OP Cancel</th>
                      <th className="num">SBYS</th>
                      <th className="num">ADOS</th>
                      <th className="num">APN</th>
                      <th className="num">Sup</th>
                      <th className="num">Sick</th>
                      <th className="num">PTO</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.months.map(row => (
                      <tr key={row.month} className="data-table-row">
                        <td className="data-table-primary">{row.label}</td>
                        <td className="num">{row.iic || '—'}</td>
                        <td className="num">{row.op || '—'}</td>
                        <td className="num">{row.op_cancel || '—'}</td>
                        <td className="num">{row.sbys || '—'}</td>
                        <td className="num">{row.ados || '—'}</td>
                        <td className="num">{row.apn || '—'}</td>
                        <td className="num">{row.sup || '—'}</td>
                        <td className="num">{row.sick || '—'}</td>
                        <td className="num">{row.pto || '—'}</td>
                        <td className={`num perf-total-bold ${row.on_track ? 'perf-avg--on-track' : 'perf-avg--off-track'}`}>{row.total_hours || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 600 }}>
                      <td>Quarter Total</td>
                      <td className="num" colSpan="9"></td>
                      <td className="num perf-total-bold">{q.total_hours}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
