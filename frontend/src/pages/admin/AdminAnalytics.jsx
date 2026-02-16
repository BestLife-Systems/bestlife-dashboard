import { useState, useEffect } from 'react'
import { apiGet } from '../../lib/api'

export default function AdminAnalytics() {
  const [therapists, setTherapists] = useState([])
  const [selected, setSelected] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
    try {
      setLoading(true)
      const data = await apiGet('/analytics/summary')
      setTherapists(data.therapists || [])
      setAnalytics(data)
      if (data.therapists?.length > 0) {
        setSelected(data.therapists[0])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>Loading analytics...</p></div>
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <h3>No Analytics Data</h3>
        <p>{error}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          Upload a TherapyNotes file in Settings to generate analytics.
        </p>
      </div>
    )
  }

  const selectedData = analytics?.therapist_details?.[selected?.name] || {}

  return (
    <div className="analytics-layout">
      {/* Therapist Sidebar */}
      <div className="therapist-sidebar">
        <h3 className="therapist-sidebar-title">Therapists</h3>
        <div className="therapist-list">
          {therapists.map((t) => (
            <button
              key={t.name}
              className={`therapist-card ${selected?.name === t.name ? 'therapist-card--active' : ''}`}
              onClick={() => setSelected(t)}
            >
              <div className="therapist-card-name">{t.name}</div>
              <div className="therapist-card-stats">
                <span>{t.client_count} clients</span>
                <span>${(t.ltv_contribution || 0).toLocaleString()}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail View */}
      <div className="analytics-detail">
        {selected ? (
          <>
            <div className="detail-header">
              <h2 className="detail-name">{selected.name}</h2>
              {selected.is_apn && <span className="badge badge--info">APN</span>}
            </div>

            {/* Metric Cards */}
            <div className="metric-grid">
              <MetricCard
                label="Avg LTV / Client"
                value={`$${(selectedData.avg_ltv || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                sub="Lifetime value per client"
              />
              <MetricCard
                label="Client Count"
                value={selectedData.client_count || selected.client_count || 0}
                sub="Active clients"
              />
              <MetricCard
                label="Avg Appts / Client"
                value={(selectedData.avg_appointments || 0).toFixed(1)}
                sub="Client engagement"
              />
              <MetricCard
                label="Total Revenue"
                value={`$${(selectedData.total_revenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                sub="LTV contribution"
              />
            </div>

            {/* Engagement Comparison */}
            {analytics?.practice_avg && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <h3 className="card-title">vs Practice Average</h3>
                <div className="comparison-bars">
                  <ComparisonBar
                    label="Avg Appts/Client"
                    value={selectedData.avg_appointments || 0}
                    avg={analytics.practice_avg.avg_appointments || 0}
                  />
                  <ComparisonBar
                    label="Avg LTV"
                    value={selectedData.avg_ltv || 0}
                    avg={analytics.practice_avg.avg_ltv || 0}
                    prefix="$"
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>Select a therapist to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub }) {
  return (
    <div className="metric-card">
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value">{value}</div>
      <div className="metric-card-sub">{sub}</div>
    </div>
  )
}

function ComparisonBar({ label, value, avg, prefix = '' }) {
  const max = Math.max(value, avg) * 1.2 || 1
  const valuePct = (value / max) * 100
  const avgPct = (avg / max) * 100
  const isAbove = value >= avg

  return (
    <div className="comparison-bar">
      <div className="comparison-bar-label">{label}</div>
      <div className="comparison-bar-tracks">
        <div className="comparison-bar-track">
          <div
            className={`comparison-bar-fill ${isAbove ? 'comparison-bar-fill--good' : 'comparison-bar-fill--below'}`}
            style={{ width: `${valuePct}%` }}
          />
          <span className="comparison-bar-value">
            {prefix}{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : value}
          </span>
        </div>
        <div className="comparison-bar-track comparison-bar-track--avg">
          <div className="comparison-bar-fill comparison-bar-fill--avg" style={{ width: `${avgPct}%` }} />
          <span className="comparison-bar-value">
            {prefix}{typeof avg === 'number' ? avg.toLocaleString(undefined, { maximumFractionDigits: 1 }) : avg} avg
          </span>
        </div>
      </div>
    </div>
  )
}
