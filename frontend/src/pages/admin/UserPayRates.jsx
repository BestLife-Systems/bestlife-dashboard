import { useState, useEffect } from 'react'
import { apiGet, apiPost, apiPatch } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import Modal from '../../components/Modal'

// Display name overrides for cleaner labels
const DISPLAY_NAMES = {
  'Community Event (Day)': 'Community Event',
}

// Rate types to hide (deprecated / redundant)
const HIDDEN_RATE_TYPES = new Set([
  'ADOS In Home', 'ADOS At Office',
  'ADOS Assessment (In Home)', 'ADOS Assessment (In Office)',
  'IIC', 'APN 30 Min', 'Other (Hourly)', 'Other (Day)', 'APN Other (Custom)',
])

// Define display groups for rate types in the Pay Rates modal
const RATE_GROUPS = [
  { label: 'IIC', patterns: ['IIC-LC', 'IIC-MA', 'IIC-BA'] },
  { label: 'Outpatient', patterns: ['OP-LC', 'OP-MA'] },
  { label: 'SBYS', patterns: ['SBYS'] },
  { label: 'ADOS', patterns: ['ADOS Assessment'] },
  { label: 'APN', patterns: ['APN Session', 'APN Intake'] },
  { label: 'General', patterns: ['Administration', 'PTO', 'Sick Leave', 'Community Event', 'OP Cancellation'] },
]

function groupRateTypes(rateTypes) {
  // Filter out hidden/deprecated types first
  const visible = rateTypes.filter(rt => !HIDDEN_RATE_TYPES.has(rt.name))

  const grouped = []
  const used = new Set()

  for (const group of RATE_GROUPS) {
    const items = visible.filter(rt => {
      if (used.has(rt.id)) return false
      return group.patterns.some(p => rt.name.startsWith(p) || rt.name.includes(p))
    })
    if (items.length > 0) {
      items.forEach(i => used.add(i.id))
      grouped.push({ label: group.label, items })
    }
  }

  // Any remaining go into General
  const remaining = visible.filter(rt => !used.has(rt.id))
  if (remaining.length > 0) {
    const general = grouped.find(g => g.label === 'General')
    if (general) {
      remaining.forEach(r => { general.items.push(r); used.add(r.id) })
    } else {
      grouped.push({ label: 'General', items: remaining })
    }
  }

  return grouped
}

function displayName(rt) {
  return DISPLAY_NAMES[rt.name] || rt.name
}

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

  const grouped = groupRateTypes(rateTypes)

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {grouped.map(group => (
                <div key={group.label}>
                  <div style={{
                    fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: 'var(--text-muted)',
                    marginBottom: '0.375rem', paddingBottom: '0.25rem',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {group.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {group.items.map(rt => (
                      <div key={rt.id} className="form-row" style={{ alignItems: 'center' }}>
                        <label style={{ fontSize: '0.875rem', color: 'var(--text)', flex: 1 }}>
                          {displayName(rt)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({rt.unit})</span>
                        </label>
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
