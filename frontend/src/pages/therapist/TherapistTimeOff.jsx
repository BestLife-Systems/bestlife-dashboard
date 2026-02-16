import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function TherapistTimeOff() {
  const { profile } = useAuth()
  const [balances, setBalances] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBalances()
  }, [profile])

  async function loadBalances() {
    try {
      const { data, error } = await supabase
        .from('pto_balances')
        .select('*')
        .eq('user_id', profile.id)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      setBalances(data)
    } catch (err) {
      console.error('Error loading PTO balances:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /></div>
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Time Off</h2>
      </div>

      <div className="pto-grid">
        <div className="pto-card">
          <div className="pto-card-icon">🏖️</div>
          <div className="pto-card-label">PTO Balance</div>
          <div className="pto-card-value">{balances?.pto_hours?.toFixed(2) ?? '0.00'}</div>
          <div className="pto-card-unit">hours</div>
        </div>
        <div className="pto-card">
          <div className="pto-card-icon">🏥</div>
          <div className="pto-card-label">Sick Leave</div>
          <div className="pto-card-value">{balances?.sick_hours?.toFixed(2) ?? '0.00'}</div>
          <div className="pto-card-unit">hours</div>
        </div>
      </div>

      {!balances && (
        <div className="card" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <p className="card-muted">
            PTO balances haven't been set up yet. Contact your admin if you believe this is an error.
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className="card-title">Request Time Off</h3>
        <p className="card-description" style={{ color: 'var(--text-muted)' }}>
          Time off requests will be available in a future update. For now, please coordinate with your supervisor directly.
        </p>
      </div>
    </div>
  )
}
