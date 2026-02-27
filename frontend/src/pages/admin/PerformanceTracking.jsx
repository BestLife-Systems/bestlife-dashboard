import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import { useAuth } from '../../hooks/useAuth'

const TIMEFRAMES = [
  { value: 'pay_period', label: 'Pay Period' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

const EMP_LABELS = { full_time: 'FT', part_time: 'PT', '1099': '1099' }

export default function PerformanceTracking() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState('monthly')
  const [period, setPeriod] = useState('')
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadData() }, [timeframe, period])

  async function loadData() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ timeframe })
      if (period) params.set('period', period)
      const result = await apiGet(`/analytics/performance?${params}`)
      setData(result)
    } catch (err) {
      console.error('Failed to load performance data:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleTimeframeChange(tf) {
    setTimeframe(tf)
    setPeriod('')
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  const thresholds = data?.thresholds || {}

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Performance Tracking</h2>
      </div>

      {/* Controls row */}
      <div className="perf-controls">
        <div className="perf-timeframe-btns">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              className={`tab-btn ${timeframe === tf.value ? 'tab-btn--active' : ''}`}
              onClick={() => handleTimeframeChange(tf.value)}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {(data?.available_periods || []).length > 0 && (
          <select
            className="form-input perf-period-select"
            value={period}
            onChange={e => setPeriod(e.target.value)}
          >
            {data.available_periods.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        )}

        <div className="perf-thresholds-legend">
          <span>FT: {thresholds.full_time || 80}hrs/mo</span>
          <span className="perf-legend-sep">·</span>
          <span>PT: {thresholds.part_time || 40}hrs/mo</span>
          <span className="perf-legend-sep">·</span>
          <span>1099: {thresholds['1099'] || 20}hrs/mo</span>
        </div>
      </div>

      {!data || !data.groups || data.groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📈</div>
          <h3>No performance data yet</h3>
          <p>Performance metrics will populate from approved rollup data.</p>
        </div>
      ) : (
        <div className="perf-teams">
          {data.groups.map(group => (
            <TeamSection
              key={group.leader_id || '__unassigned'}
              group={group}
              thresholds={thresholds}
              isAdmin={isAdmin}
              isSingleUser={!isAdmin && profile?.role !== 'clinical_leader'}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}


function TeamSection({ group, thresholds, isAdmin, isSingleUser, navigate }) {
  // For single-user view (therapist/apn), just show the rows without team header
  if (isSingleUser) {
    return (
      <div className="perf-team-section">
        <div className="table-wrapper">
          <table className="data-table perf-table">
            <PerfTableHead />
            <tbody>
              {group.therapists.map(row => (
                <StaffRow key={row.user_id} row={row} thresholds={thresholds} navigate={navigate} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="perf-team-section">
      <div className="perf-team-header">
        <span className="perf-team-leader-name">
          {group.leader_name}
          {group.leader_name === 'Unassigned' && <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>No Leader</span>}
        </span>
      </div>
      <div className="table-wrapper">
        <table className="data-table perf-table">
          <PerfTableHead />
          <tbody>
            {group.therapists.map(row => (
              <StaffRow key={row.user_id} row={row} thresholds={thresholds} isLeader={row.is_leader} navigate={navigate} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function PerfTableHead() {
  return (
    <thead>
      <tr>
        <th>Name</th>
        <th>Emp</th>
        <th className="num">IIC</th>
        <th className="num">OP</th>
        <th className="num">SBYS</th>
        <th className="num">ADOS</th>
        <th className="num">Sick</th>
        <th className="num">PTO</th>
        <th className="num">Total</th>
        <th className="num">Avg/Pd</th>
      </tr>
    </thead>
  )
}


function StaffRow({ row, thresholds, isLeader, navigate }) {
  const threshold = thresholds[row.employment_status] || thresholds.full_time || 80
  const avgPerPd = row.avg_per_period || 0
  const onTrack = row.status === 'on_track'

  return (
    <tr className={`data-table-row perf-staff-row ${isLeader ? 'perf-staff-row--leader' : ''}`}>
      <td className="perf-staff-name">
        {isLeader && <span className="perf-leader-badge">CL</span>}
        <button
          className="perf-name-link"
          onClick={() => navigate(`/admin/analytics/performance/${row.user_id}`)}
          title="View month-over-month detail"
        >
          {row.name}
        </button>
      </td>
      <td>
        <span className="badge badge--muted">{EMP_LABELS[row.employment_status] || 'FT'}</span>
      </td>
      <td className="num">{row.iic || '—'}</td>
      <td className="num">{row.op || '—'}</td>
      <td className="num">{row.sbys || '—'}</td>
      <td className="num">{row.ados || '—'}</td>
      <td className="num">{row.sick || '—'}</td>
      <td className="num">{row.pto || '—'}</td>
      <td className="num perf-total-bold">{row.total_hours || '—'}</td>
      <td className={`num perf-avg ${onTrack ? 'perf-avg--on-track' : 'perf-avg--off-track'}`}>
        {avgPerPd}
      </td>
    </tr>
  )
}
