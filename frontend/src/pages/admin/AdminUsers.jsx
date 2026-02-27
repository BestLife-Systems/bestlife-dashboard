import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { apiPost, apiPatch, apiGet } from '../../lib/api'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'
import UserPayRates from './UserPayRates'
import ClinicalLeaderAssignment from './ClinicalLeaderAssignment'

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'clinical_leader', label: 'Clinical Leader' },
  { value: 'therapist', label: 'Therapist' },
  { value: 'apn', label: 'APN' },
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'medical_biller', label: 'Medical Biller' },
]

const EMPLOYMENT_STATUSES = [
  { value: 'full_time', label: 'Full-Time' },
  { value: 'part_time', label: 'Part-Time' },
  { value: '1099', label: '1099 Contractor' },
]

function formatPhone(val) {
  const digits = val.replace(/\D/g, '')
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6,10)}`
}

function toE164(val) {
  const digits = val.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

const TABS = [
  { id: 'users', label: 'All Users' },
  { id: 'pay-rates', label: 'Pay Rates' },
  { id: 'clinical', label: 'Clinical Leader Assignment' },
]

export default function AdminUsers() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'users'
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', role: 'therapist', employment_status: 'full_time', phone_number: '', sms_enabled: true, supervision_required: false, clinical_supervisor_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Pay rates step
  const [payRateStep, setPayRateStep] = useState(false)
  const [newUserId, setNewUserId] = useState(null)
  const [newUserName, setNewUserName] = useState('')
  const [rateTypes, setRateTypes] = useState([])
  const [editRates, setEditRates] = useState({})
  const [savingRates, setSavingRates] = useState(false)

  const clinicalLeaders = users.filter(u => u.role === 'clinical_leader' && u.is_active)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('last_name')

      if (error) throw error
      setUsers(data || [])
    } catch (err) {
      console.error('Error loading users:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddUser(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const phoneE164 = form.phone_number ? toE164(form.phone_number) : null
      if (form.phone_number && !phoneE164) {
        setError('Phone number must be 10 digits (US)')
        setSaving(false)
        return
      }
      const result = await apiPost('/admin/invite-user', {
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        role: form.role,
        employment_status: form.employment_status,
        phone_number: phoneE164 || null,
        sms_enabled: form.sms_enabled,
        supervision_required: form.supervision_required,
        clinical_supervisor_id: form.clinical_supervisor_id || null,
      })
      // Set employment_status directly (backend invite may not support it yet)
      if (result.user_id && form.employment_status !== 'full_time') {
        await supabase.from('users').update({ employment_status: form.employment_status }).eq('id', result.user_id)
      }
      // Transition to pay rates step
      setNewUserId(result.user_id)
      setNewUserName(`${form.first_name} ${form.last_name}`)
      setShowAdd(false)
      setForm({ first_name: '', last_name: '', email: '', role: 'therapist', employment_status: 'full_time', phone_number: '', sms_enabled: true, supervision_required: false, clinical_supervisor_id: '' })
      // Load rate types for pay rates step
      try {
        const ratesData = await apiGet('/payroll/rate-catalog')
        setRateTypes(ratesData.rate_types || [])
        setEditRates({})
        setPayRateStep(true)
      } catch {
        // If rate catalog fails, just skip to done
        loadUsers()
      }
    } catch (err) {
      setError(typeof err?.message === 'string' ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleEditUser(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const phoneE164 = editUser.phone_number ? toE164(editUser.phone_number) : null
      if (editUser.phone_number && !phoneE164) {
        setError('Phone number must be 10 digits (US)')
        setSaving(false)
        return
      }
      const { error: err } = await supabase
        .from('users')
        .update({
          first_name: editUser.first_name,
          last_name: editUser.last_name,
          email: editUser.email,
          role: editUser.role,
          employment_status: editUser.employment_status || 'full_time',
          phone_number: phoneE164 || null,
          sms_enabled: editUser.sms_enabled ?? true,
          supervision_required: editUser.supervision_required ?? false,
          clinical_supervisor_id: editUser.clinical_supervisor_id || null,
        })
        .eq('id', editUser.id)

      if (err) throw err
      setEditUser(null)
      loadUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(user) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !user.is_active })
        .eq('id', user.id)

      if (error) throw error
      loadUsers()
    } catch (err) {
      alert('Error updating user: ' + err.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Users</h2>
        {activeTab === 'users' && (
          <button className="btn btn--primary" onClick={() => setShowAdd(true)}>
            + Add User
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div className="page-tabs" style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSearchParams(tab.id === 'users' ? {} : { tab: tab.id })}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Pay Rates */}
      {activeTab === 'pay-rates' && <UserPayRates />}

      {/* Tab: Clinical Leader Assignment */}
      {activeTab === 'clinical' && <ClinicalLeaderAssignment />}

      {/* Tab: All Users */}
      {activeTab === 'users' && loading ? (
        <div className="page-loading"><div className="loading-spinner" /></div>
      ) : activeTab === 'users' && (
        <>
          {/* Desktop Table */}
          <div className="table-wrapper hide-mobile">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="data-table-row">
                    <td className="data-table-primary">{u.first_name} {u.last_name}</td>
                    <td>{u.email}</td>
                    <td>{u.phone_number || '—'}</td>
                    <td>{ROLES.find(r => r.value === u.role)?.label || u.role}</td>
                    <td><StatusBadge status={u.is_active ? 'active' : 'inactive'} /></td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn--small btn--ghost" onClick={() => setEditUser({ ...u })}>Edit</button>
                        <button
                          className={`btn btn--small ${u.is_active ? 'btn--danger-ghost' : 'btn--ghost'}`}
                          onClick={() => handleToggleActive(u)}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="card-list show-mobile">
            {users.map(u => (
              <div key={u.id} className="card">
                <div className="card-row">
                  <span className="card-label">{u.first_name} {u.last_name}</span>
                  <StatusBadge status={u.is_active ? 'active' : 'inactive'} />
                </div>
                <div className="card-row">
                  <span className="card-muted">{u.email}</span>
                  <span className="card-value">{ROLES.find(r => r.value === u.role)?.label || u.role}</span>
                </div>
                <div className="card-actions">
                  <button className="btn btn--small btn--ghost" onClick={() => setEditUser({ ...u })}>Edit</button>
                  <button className={`btn btn--small ${u.is_active ? 'btn--danger-ghost' : 'btn--ghost'}`} onClick={() => handleToggleActive(u)}>
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add User Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setError('') }} title="Add User">
        <form onSubmit={handleAddUser}>
          {error && <div className="form-error">{error}</div>}
          <div className="form-row">
            <div className="form-field">
              <label>First Name</label>
              <input required value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Last Name</label>
              <input required value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div className="form-field">
            <label>Email</label>
            <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Role</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Employment Status</label>
              <select value={form.employment_status} onChange={e => setForm({ ...form, employment_status: e.target.value })}>
                {EMPLOYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-field" style={{ marginTop: '0.75rem' }}>
            <label>Phone Number</label>
            <input
              type="tel"
              placeholder="(555) 123-4567"
              value={form.phone_number ? formatPhone(form.phone_number) : ''}
              onChange={e => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                setForm({ ...form, phone_number: digits })
              }}
            />
          </div>
          <div className="form-row" style={{ marginTop: '0.75rem', gap: '1.5rem' }}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.sms_enabled}
                onChange={e => setForm({ ...form, sms_enabled: e.target.checked })}
              />
              SMS Enabled
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.supervision_required}
                onChange={e => setForm({ ...form, supervision_required: e.target.checked })}
              />
              Supervision Required
            </label>
          </div>
          {form.supervision_required && (
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Clinical Supervisor</label>
              <select
                value={form.clinical_supervisor_id}
                onChange={e => setForm({ ...form, clinical_supervisor_id: e.target.value })}
              >
                <option value="">— None —</option>
                {clinicalLeaders.map(cl => (
                  <option key={cl.id} value={cl.id}>{cl.first_name} {cl.last_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Sending Invite...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pay Rates Step Modal */}
      <Modal open={payRateStep} onClose={() => { setPayRateStep(false); setNewUserId(null); loadUsers() }} title={`Pay Rates — ${newUserName}`} wide>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Set the pay rate per unit for each rate type. Leave blank if not applicable. You can always update these later in Users &rarr; Pay Rates.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rateTypes
            .filter(rt => {
              const hide = ['Other (Hourly)', 'APN Other (Custom)', 'Other (Day)']
              return !hide.includes(rt.name)
            })
            .map(rt => {
              const nameMap = {
                'ADOS Assessment (In Home)': 'ADOS Assessment - In Home',
                'ADOS Assessment (In Office)': 'ADOS Assessment - At Office',
                'APN Session (30)': 'APN Session - 30 minute',
                'APN Intake (60)': 'APN Session - Intake',
                'Community Event (Day)': 'Community Event',
              }
              const displayName = nameMap[rt.name] || rt.name
              return (
                <div key={rt.id} className="form-row" style={{ alignItems: 'center' }}>
                  <label style={{ fontSize: '0.875rem', color: 'var(--text)', flex: 1 }}>{displayName} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({rt.unit})</span></label>
                  <div style={{ width: '120px' }}>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="$ rate"
                      value={editRates[rt.id] || ''}
                      onChange={e => setEditRates(prev => ({ ...prev, [rt.id]: e.target.value }))}
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-focus)', color: 'var(--text-bright)', fontSize: '0.95rem', padding: '0.5rem 0.625rem' }}
                    />
                  </div>
                </div>
              )
            })}
        </div>
        <div className="modal-actions">
          <button className="btn btn--ghost" onClick={() => { setPayRateStep(false); setNewUserId(null); loadUsers() }}>Skip</button>
          <button className="btn btn--primary" onClick={async () => {
            setSavingRates(true)
            try {
              const entries = Object.entries(editRates)
                .filter(([, val]) => val !== '' && val !== null)
                .map(([rateTypeId, payRate]) => ({ rate_type_id: rateTypeId, pay_rate: parseFloat(payRate) }))
              if (entries.length > 0) {
                await apiPost(`/payroll/user-pay-rates/${newUserId}`, { rates: entries })
              }
              setPayRateStep(false)
              setNewUserId(null)
              loadUsers()
            } catch (err) {
              alert('Error saving rates: ' + err.message)
            } finally {
              setSavingRates(false)
            }
          }} disabled={savingRates}>
            {savingRates ? 'Saving...' : 'Save Rates'}
          </button>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal open={!!editUser} onClose={() => { setEditUser(null); setError('') }} title="Edit User">
        {editUser && (
          <form onSubmit={handleEditUser}>
            {error && <div className="form-error">{error}</div>}
            <div className="form-row">
              <div className="form-field">
                <label>First Name</label>
                <input value={editUser.first_name} onChange={e => setEditUser({ ...editUser, first_name: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Last Name</label>
                <input value={editUser.last_name} onChange={e => setEditUser({ ...editUser, last_name: e.target.value })} />
              </div>
            </div>
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Email</label>
              <input type="email" value={editUser.email} onChange={e => setEditUser({ ...editUser, email: e.target.value })} />
            </div>
            <div className="form-row" style={{ marginTop: '0.75rem' }}>
              <div className="form-field">
                <label>Role</label>
                <select value={editUser.role} onChange={e => setEditUser({ ...editUser, role: e.target.value })}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Employment Status</label>
                <select value={editUser.employment_status || 'full_time'} onChange={e => setEditUser({ ...editUser, employment_status: e.target.value })}>
                  {EMPLOYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Phone Number</label>
              <input
                type="tel"
                placeholder="(555) 123-4567"
                value={editUser.phone_number ? formatPhone(editUser.phone_number.replace('+1', '')) : ''}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                  setEditUser({ ...editUser, phone_number: digits })
                }}
              />
            </div>
            <div className="form-row" style={{ marginTop: '0.75rem', gap: '1.5rem' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editUser.sms_enabled ?? true}
                  onChange={e => setEditUser({ ...editUser, sms_enabled: e.target.checked })}
                />
                SMS Enabled
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editUser.supervision_required ?? false}
                  onChange={e => setEditUser({ ...editUser, supervision_required: e.target.checked })}
                />
                Supervision Required
              </label>
            </div>
            {editUser.supervision_required && (
              <div className="form-field" style={{ marginTop: '0.75rem' }}>
                <label>Clinical Supervisor</label>
                <select
                  value={editUser.clinical_supervisor_id || ''}
                  onChange={e => setEditUser({ ...editUser, clinical_supervisor_id: e.target.value || null })}
                >
                  <option value="">— None —</option>
                  {clinicalLeaders.map(cl => (
                    <option key={cl.id} value={cl.id}>{cl.first_name} {cl.last_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setEditUser(null)}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
