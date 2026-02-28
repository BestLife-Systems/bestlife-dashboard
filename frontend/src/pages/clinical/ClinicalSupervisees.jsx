import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { apiGet } from '../../lib/api'

export default function ClinicalSupervisees() {
  const { profile } = useAuth()
  const [supervisees, setSupervisees] = useState([])
  const [selected, setSelected] = useState(null)
  const [selectedStats, setSelectedStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    loadSupervisees()
  }, [profile])

  async function loadSupervisees() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('clinical_supervisor_id', profile.id)
        .eq('is_active', true)
        .order('last_name')

      if (error) throw error
      setSupervisees(data || [])
    } catch (err) {
      console.error('Error loading supervisees:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadSuperviseeStats(supervisee) {
    setSelected(supervisee)
    setStatsLoading(true)
    try {
      const data = await apiGet(`/analytics/therapist/${supervisee.id}`)
      setSelectedStats(data)
    } catch (err) {
      setSelectedStats(null)
    } finally {
      setStatsLoading(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /></div>
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Supervisees</h2>
      </div>

      {supervisees.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👨‍⚕️</div>
          <h3>No Supervisees</h3>
          <p>You don't have any supervisees assigned yet. Contact an admin to set up supervision relationships.</p>
        </div>
      ) : (
        <div className="supervisees-layout">
          {/* Supervisee List */}
          <div className="supervisee-list">
            {supervisees.map(s => (
              <button
                key={s.id}
                className={`therapist-card ${selected?.id === s.id ? 'therapist-card--active' : ''}`}
                onClick={() => loadSuperviseeStats(s)}
              >
                <div className="therapist-card-name">{s.first_name} {s.last_name}</div>
                <div className="therapist-card-stats">
                  <span className="card-muted">{{ therapist: 'Therapist', ba: 'Behavioral Assistant', apn: 'APN', clinical_leader: 'Clinical Leader' }[s.role] || s.role}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Detail Panel */}
          <div className="supervisee-detail">
            {!selected ? (
              <div className="empty-state">
                <p>Select a supervisee to view their stats</p>
              </div>
            ) : statsLoading ? (
              <div className="page-loading"><div className="loading-spinner" /></div>
            ) : !selectedStats ? (
              <div className="empty-state">
                <h3>{selected.first_name} {selected.last_name}</h3>
                <p>No analytics data available yet.</p>
              </div>
            ) : (
              <>
                <h3 className="detail-name">{selected.first_name} {selected.last_name}</h3>
                <div className="metric-grid">
                  <div className="metric-card">
                    <div className="metric-card-label">Avg LTV / Client</div>
                    <div className="metric-card-value">${(selectedStats.avg_ltv || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Client Count</div>
                    <div className="metric-card-value">{selectedStats.client_count || 0}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Avg Sessions / Client</div>
                    <div className="metric-card-value">{(selectedStats.avg_appointments || 0).toFixed(1)}</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-card-label">Total Revenue</div>
                    <div className="metric-card-value">${(selectedStats.total_revenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
