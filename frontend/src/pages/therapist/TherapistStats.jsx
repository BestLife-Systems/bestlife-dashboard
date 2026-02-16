import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { apiGet } from '../../lib/api'

export default function TherapistStats() {
  const { profile } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStats()
  }, [profile])

  async function loadStats() {
    try {
      setLoading(true)
      const data = await apiGet(`/analytics/therapist/${profile.id}`)
      setStats(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>Loading your stats...</p></div>
  }

  if (error || !stats) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <h3>No Stats Available Yet</h3>
        <p>Your performance metrics will appear here once analytics data has been uploaded by an admin.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">My Stats</h2>
      </div>

      {/* Summary Cards */}
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-card-label">Avg LTV / Client</div>
          <div className="metric-card-value">${(stats.avg_ltv || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <CompareIndicator value={stats.avg_ltv} avg={stats.practice_avg_ltv} prefix="$" />
        </div>
        <div className="metric-card">
          <div className="metric-card-label">Client Count</div>
          <div className="metric-card-value">{stats.client_count || 0}</div>
          <div className="metric-card-sub">Active clients</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">Avg Sessions / Client</div>
          <div className="metric-card-value">{(stats.avg_appointments || 0).toFixed(1)}</div>
          <CompareIndicator value={stats.avg_appointments} avg={stats.practice_avg_appointments} />
        </div>
        <div className="metric-card">
          <div className="metric-card-label">Total Revenue</div>
          <div className="metric-card-value">${(stats.total_revenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="metric-card-sub">LTV contribution</div>
        </div>
      </div>

      {/* Retention Insight */}
      {stats.retention_rate != null && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3 className="card-title">Client Retention</h3>
          <div className="retention-bar-container">
            <div className="retention-bar">
              <div className="retention-bar-fill" style={{ width: `${Math.min(stats.retention_rate, 100)}%` }} />
            </div>
            <div className="retention-bar-labels">
              <span>{stats.retention_rate?.toFixed(0)}% retention</span>
              <span className="card-muted">Practice avg: {stats.practice_avg_retention?.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Trend */}
      {stats.monthly_trend && stats.monthly_trend.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3 className="card-title">Monthly Appointments</h3>
          <div className="mini-chart">
            {stats.monthly_trend.map((m, i) => {
              const max = Math.max(...stats.monthly_trend.map(x => x.count)) || 1
              return (
                <div key={i} className="mini-chart-bar-wrapper">
                  <div className="mini-chart-bar" style={{ height: `${(m.count / max) * 100}%` }} />
                  <div className="mini-chart-label">{m.month}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function CompareIndicator({ value, avg, prefix = '' }) {
  if (avg == null || value == null) return <div className="metric-card-sub">—</div>
  const diff = value - avg
  const pct = avg > 0 ? ((diff / avg) * 100).toFixed(0) : 0
  const isGood = diff >= 0

  return (
    <div className={`metric-card-compare ${isGood ? 'metric-card-compare--good' : 'metric-card-compare--below'}`}>
      {isGood ? '↑' : '↓'} {Math.abs(pct)}% vs practice avg
    </div>
  )
}
