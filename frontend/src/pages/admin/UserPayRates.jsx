import { useState, useEffect } from 'react'
import { apiGet, apiPost, apiPatch } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import Modal from '../../components/Modal'

export default function UserPayRates() {
  const [users, setUsers] = useState([])
  const [rateTypes, setRateTypes] = useState([])
  const [payRates, setPayRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [editRates, setEditRates] = useState({})
  const [saving, setSaving] = useState(false)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [usersData, ratesData, payRatesData] = await Promise.all([
        apiGet('/admin/users'),
        apiGet('/payroll/rate-catalog'),
        apiGet('/payroll/user-pay-rates'),
      ])
      setUsers(usersData || [])
      setRateTypes(ratesData.rate_types || [])
      setPayRates(payRatesData || [])
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  function openUserRates(user) {
    const userRates = payRates.filter(r => r.user_id === user.id)
    const rateMap = {}
    rateTypes.forEach(rt => {
      const existing = userRates.find(r => r.rate_type_id === rt.id)
      rateMap[rt.id] = existing?.pay_rate || ''
    })
    setEditRates(rateMap)
    setSelectedUser(user)
  }

  async function handleSaveRates() {
    setSaving(true)
    try {
      const entries = Object.entries(editRates)
        .filter(([, val]) => val !== '' && val !== null)
        .map(([rateTypeId, payRate]) => ({
          rate_type_id: rateTypeId,
          pay_rate: parseFloat(payRate),
        }))
      await apiPost(`/payroll/user-pay-rates/${selectedUser.id}`, { rates: entries })
      setSelectedUser(null)
      loadData()
    } catch (err) {
      alert('Error saving rates: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Pay Rates</h2>
      </div>

      {users.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💵</div>
          <h3>No users found</h3>
          <p>Add users first to configure pay rates.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Rates Configured</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.filter(u => u.is_active).map(u => {
                const rateCount = payRates.filter(r => r.user_id === u.id).length
                return (
                  <tr key={u.id} className="data-table-row">
                    <td className="data-table-primary">{u.first_name} {u.last_name}</td>
                    <td>{u.role}</td>
                    <td>{rateCount} / {rateTypes.length}</td>
                    <td><button className="btn btn--small btn--ghost" onClick={() => openUserRates(u)}>Edit Rates</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!selectedUser} onClose={() => setSelectedUser(null)} title={`Pay Rates — ${selectedUser?.first_name} ${selectedUser?.last_name}`} wide>
        {selectedUser && (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Set the pay rate per unit for each rate type. Leave blank if not applicable.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {rateTypes.map(rt => (
                <div key={rt.id} className="form-row" style={{ alignItems: 'center' }}>
                  <label style={{ fontSize: '0.875rem', color: 'var(--text)', flex: 1 }}>{rt.name} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({rt.unit})</span></label>
                  <div style={{ width: '120px' }}>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="$ rate"
                      value={editRates[rt.id] || ''}
                      onChange={e => setEditRates(prev => ({ ...prev, [rt.id]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn--ghost" onClick={() => setSelectedUser(null)}>Cancel</button>
              <button className="btn btn--primary" onClick={handleSaveRates} disabled={saving}>
                {saving ? 'Saving…' : 'Save Rates'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
