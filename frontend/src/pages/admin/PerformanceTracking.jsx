import { useState, useEffect } from 'react'
import { apiGet, apiPatch } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import { useAuth } from '../../hooks/useAuth'

const TIMEFRAMES = [
  { value: 'pay_period', label: 'Pay Period' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

const EMP_LABELS = { full_time: 'FT', part_time: 'PT', '1099': '1099' }

function StatusBadge({ status }) {
  if (status === 'on_track') return <span className="badge badge--success">On Track</span>
  if (status === 'warning') return <span className="badge badge--warning">Warning</span>
  if (status === 'action_required') return <span className="badge badge--danger">Action Required</span>
  return <span className="badge badge--muted">—</span>
}

function QuarterTrend({ trend }) {
  if (!trend || !trend.length) return null
  return (
    <span className="perf-trend">
      {trend.map((met, i) => (
        <span key={i} className={met ? 'perf-trend-met' : 'perf-trend-miss'}>
          {met ? '✓' : '✗'}
        </span>
      ))}
    </span>
  )
}

function CapacityCell({ row, isAdmin, onSave }) {
  const [editing, setEditing] = useState(false)
  const [iic, setIic] = useState(row.iic_capacity || 0)
  const [op, setOp] = useState(row.op_capacity || 0)
  const [saving, setSaving] = useState(false)

  if (!isAdmin) {
    if (!row.iic_capacity && !row.op_capacity) return <span className="text-muted">—</span>
    return <span>{row.iic_capacity}/{row.op_capacity}</span>
  }

  if (!editing) {
    return (
      <button
        className="perf-cap-btn"
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        title="Edit capacity"
      >
        {row.iic_capacity || row.op_capacity ? `${row.iic_capacity}/${row.op_capacity}` : 'Set'}
      </button>
    )
  }

  async function handleSave(e) {
    e.stopPropagation()
    setSaving(true)
    try {
      await onSave(row.user_id, { iic_capacity: parseInt(iic) || 0, op_capacity: parseInt(op) || 0 })
      setEditing(false)
    } catch (err) {
      console.error('Failed to save capacity:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="perf-cap-edit" onClick={e => e.stopPropagation()}>
      <input type="number" min="0" value={iic} onChange={e => setIic(e.target.value)} className="perf-cap-input" placeholder="IIC" />
      <span className="perf-cap-sep">/</span>
      <input type="number" min="0" value={op} onChange={e => setOp(e.target.value)} className="perf-cap-input" placeholder="OP" />
      <button className="btn btn--xs btn--primary" onClick={handleSave} disabled={saving}>
        {saving ? '…' : '✓'}
      </button>
      <button className="btn btn--xs btn--ghost" onClick={(e) => { e.stopPropagation(); setEditing(false) }}>✗</button>
    </span>
  )
}

export default function PerformanceTracking() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState('monthly')
  const [period, setPeriod] = useState('')
  const [collapsed, setCollapsed] = useState({})
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
    setPeriod('')  // Reset period when switching timeframes
  }

  function toggleGroup(leaderId) {
    setCollapsed(prev => ({ ...prev, [leaderId || '__unassigned']: !prev[leaderId || '__unassigned'] }))
  }

  async function handleCapacitySave(userId, caps) {
    await apiPatch(`/analytics/therapist-capacity/${userId}`, caps)
    await loadData()
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  if (!data || !data.groups || data.groups.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h2 className="page-title">Performance Tracking</h2>
        </div>
        <Controls
          timeframe={timeframe}
          period={period}
          availablePeriods={data?.available_periods || []}
          thresholds={data?.thresholds || {}}
          periodLabel={data?.period_label || ''}
          onTimeframeChange={handleTimeframeChange}
          onPeriodChange={setPeriod}
        />
        <div className="empty-state">
          <div className="empty-state-icon">📈</div>
          <h3>No performance data yet</h3>
          <p>Performance metrics will populate from approved rollup data.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Performance Tracking</h2>
        <span className="page-header-sub">{data.period_label}</span>
      </div>

      <Controls
        timeframe={timeframe}
        period={period}
        availablePeriods={data.available_periods}
        thresholds={data.thresholds}
        periodLabel={data.period_label}
        onTimeframeChange={handleTimeframeChange}
        onPeriodChange={setPeriod}
      />

      <div className="table-wrapper">
        <table className="data-table perf-table">
          <thead>
            <tr>
              <th>Status</th>
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
              <th>Capacity</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.map(group => {
              const key = group.leader_id || '__unassigned'
              const isCollapsed = collapsed[key]
              return (
                <GroupRows
                  key={key}
                  group={group}
                  isCollapsed={isCollapsed}
                  onToggle={() => toggleGroup(group.leader_id)}
                  isAdmin={isAdmin}
                  onCapacitySave={handleCapacitySave}
                  isSingleUser={!isAdmin && profile?.role !== 'clinical_leader'}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function Controls({ timeframe, period, availablePeriods, thresholds, onTimeframeChange, onPeriodChange }) {
  return (
    <div className="perf-controls">
      <div className="perf-timeframe-btns">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.value}
            className={`tab-btn ${timeframe === tf.value ? 'tab-btn--active' : ''}`}
            onClick={() => onTimeframeChange(tf.value)}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {availablePeriods.length > 0 && (
        <select
          className="form-input perf-period-select"
          value={period}
          onChange={e => onPeriodChange(e.target.value)}
        >
          {availablePeriods.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      )}

      <div className="perf-thresholds-legend">
        <span>FT: {thresholds.full_time || 40}hrs/mo</span>
        <span className="perf-legend-sep">·</span>
        <span>PT: {thresholds.part_time || 20}hrs/mo</span>
        <span className="perf-legend-sep">·</span>
        <span>1099: {thresholds['1099'] || 10}hrs/mo</span>
      </div>
    </div>
  )
}


function GroupRows({ group, isCollapsed, onToggle, isAdmin, onCapacitySave, isSingleUser }) {
  const t = group.team_totals

  // If this is a single-user view (therapist/apn), skip the leader row
  if (isSingleUser) {
    return (
      <>
        {group.therapists.map(row => (
          <TherapistRow key={row.user_id} row={row} isAdmin={isAdmin} onCapacitySave={onCapacitySave} />
        ))}
      </>
    )
  }

  return (
    <>
      {/* Leader / group header row */}
      <tr className="perf-leader-row" onClick={onToggle}>
        <td>
          <span className="perf-leader-pct">
            {group.pct_meeting_threshold}% on track
          </span>
        </td>
        <td className="data-table-primary">
          <span className="perf-collapse-icon">{isCollapsed ? '▸' : '▾'}</span>
          {group.leader_name}
          {group.leader_name === 'Unassigned' && <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>No Leader</span>}
        </td>
        <td>{group.leader_employment_status ? EMP_LABELS[group.leader_employment_status] : '—'}</td>
        <td className="num">{t.iic || '—'}</td>
        <td className="num">{t.op || '—'}</td>
        <td className="num">{t.sbys || '—'}</td>
        <td className="num">{t.ados || '—'}</td>
        <td className="num">{t.sick || '—'}</td>
        <td className="num">{t.pto || '—'}</td>
        <td className="num perf-total-bold">{t.total_hours || '—'}</td>
        <td className="num">{t.avg_per_period || '—'}</td>
        <td>—</td>
      </tr>

      {/* Therapist detail rows */}
      {!isCollapsed && group.therapists.map(row => (
        <TherapistRow key={row.user_id} row={row} isAdmin={isAdmin} onCapacitySave={onCapacitySave} />
      ))}
    </>
  )
}


function TherapistRow({ row, isAdmin, onCapacitySave }) {
  return (
    <tr className="data-table-row perf-therapist-row">
      <td>
        <StatusBadge status={row.status} />
        <QuarterTrend trend={row.quarter_trend} />
      </td>
      <td className="perf-therapist-name">{row.name}</td>
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
      <td className="num">{row.avg_per_period || '—'}</td>
      <td>
        <CapacityCell row={row} isAdmin={isAdmin} onSave={onCapacitySave} />
      </td>
    </tr>
  )
}
