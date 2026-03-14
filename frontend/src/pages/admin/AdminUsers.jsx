import React, { useState, useEffect } from 'react'
import { supabase, safeSb } from '../../lib/supabase'
import { apiPost, apiGet, apiPatch } from '../../lib/api'
import Modal from '../../components/Modal'

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'clinical_leader', label: 'Clinical Leader' },
  { value: 'therapist', label: 'Therapist' },
  { value: 'apn', label: 'APN' },
  { value: 'ba', label: 'Behavioral Assistant' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'intern', label: 'Intern' },
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'medical_biller', label: 'Medical Biller' },
]

// Display order for role grouping
const ROLE_ORDER = ['admin', 'clinical_leader', 'therapist', 'apn', 'ba', 'supervisor', 'front_desk', 'intern', 'medical_biller']
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.value, r.label]))

const EMPLOYMENT_STATUSES = [
  { value: 'full_time', label: 'Full-Time' },
  { value: 'part_time', label: 'Part-Time' },
  { value: '1099', label: '1099 Contractor' },
]

// ── Pay rate helpers ──────────────────────────────────────────────

const HIDDEN_RATE_TYPES = new Set([
  'ADOS In Home', 'ADOS At Office',
  'ADOS Assessment (In Home)', 'ADOS Assessment (In Office)',
  'IIC', 'APN 30 Min', 'Other (Hourly)', 'Other (Day)', 'APN Other (Custom)',
])

const RATE_DISPLAY_NAMES = {
  'Community Event (Day)': 'Community Event',
}

const RATE_GROUPS = [
  { label: 'IIC', patterns: ['IIC-LC', 'IIC-MA', 'IIC-BA'] },
  { label: 'Outpatient', patterns: ['OP-LC', 'OP-MA'] },
  { label: 'SBYS', patterns: ['SBYS'] },
  { label: 'ADOS', patterns: ['ADOS Assessment'] },
  { label: 'APN', patterns: ['APN Session', 'APN Intake'] },
  { label: 'General', patterns: ['Administration', 'PTO', 'Sick Leave', 'Community Event', 'OP Cancellation'] },
]

function groupRateTypes(rateTypes) {
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
  const remaining = visible.filter(rt => !used.has(rt.id))
  if (remaining.length > 0) {
    const general = grouped.find(g => g.label === 'General')
    if (general) remaining.forEach(r => { general.items.push(r); used.add(r.id) })
    else grouped.push({ label: 'General', items: remaining })
  }
  return grouped
}

// ── Phone helpers ─────────────────────────────────────────────────

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

// ── Section divider for modal ─────────────────────────────────────

function ModalSection({ label }) {
  return (
    <div style={{
      fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.05em', color: 'var(--text-muted)',
      margin: '1.25rem 0 0.5rem',
      paddingBottom: '0.25rem',
      borderBottom: '1px solid var(--border)',
    }}>
      {label}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

function displayPhone(raw) {
  if (!raw) return '—'
  const digits = raw.replace(/^\+1/, '').replace(/\D/g, '')
  return digits.length >= 10 ? formatPhone(digits) : raw
}

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('active')
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [editUserRates, setEditUserRates] = useState({})
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', role: 'therapist', employment_status: 'full_time', phone_number: '', sms_enabled: true, supervision_required: false, clinical_supervisor_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sendingLoginTo, setSendingLoginTo] = useState(null)

  // Pay rates step (shown after adding a new user)
  const [payRateStep, setPayRateStep] = useState(false)
  const [newUserId, setNewUserId] = useState(null)
  const [newUserName, setNewUserName] = useState('')
  const [editRates, setEditRates] = useState({})
  const [savingRates, setSavingRates] = useState(false)

  // Shared rate catalog + all user pay rates
  const [rateTypes, setRateTypes] = useState([])
  const [allPayRates, setAllPayRates] = useState([])

  const clinicalLeaders = users.filter(u => u.role === 'clinical_leader' && u.is_active)

  // Filter by active/inactive tab, then group by role
  const filteredUsers = users.filter(u => tab === 'active' ? u.is_active : !u.is_active)
  const activeCount = users.filter(u => u.is_active).length
  const inactiveCount = users.filter(u => !u.is_active).length

  const groupedByRole = ROLE_ORDER
    .map(role => ({
      role,
      label: ROLE_LABEL[role] || role,
      users: filteredUsers.filter(u => u.role === role).sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '')),
    }))
    .filter(g => g.users.length > 0)

  useEffect(() => { loadUsers(); loadRateData() }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const { data, error } = await safeSb(supabase.from('users').select('*').order('last_name'))
      if (error) throw error
      setUsers(data || [])
    } catch (err) {
      console.error('Error loading users:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadRateData() {
    try {
      const [ratesData, payRatesData] = await Promise.all([
        apiGet('/payroll/rate-catalog'),
        apiGet('/payroll/user-pay-rates'),
      ])
      setRateTypes(ratesData.rate_types || [])
      setAllPayRates(payRatesData || [])
    } catch (err) {
      console.error('Error loading rate data:', err)
    }
  }

  // Open edit modal and pre-load this user's pay rates
  function openEditUser(user) {
    const userRates = allPayRates.filter(r => r.user_id === user.id)
    const rateMap = {}
    rateTypes.forEach(rt => {
      const existing = userRates.find(r => r.rate_type_id === rt.id)
      rateMap[rt.id] = existing ? String(existing.pay_rate) : ''
    })
    setEditUserRates(rateMap)
    setEditUser({ ...user })
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
      if (result.user_id && form.employment_status !== 'full_time') {
        await safeSb(supabase.from('users').update({ employment_status: form.employment_status }).eq('id', result.user_id))
      }
      setNewUserId(result.user_id)
      setNewUserName(`${form.first_name} ${form.last_name}`)
      setShowAdd(false)
      setForm({ first_name: '', last_name: '', email: '', role: 'therapist', employment_status: 'full_time', phone_number: '', sms_enabled: true, supervision_required: false, clinical_supervisor_id: '' })
      setEditRates({})
      setPayRateStep(true)
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
      await apiPatch(`/admin/users/${editUser.id}`, {
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

      // Save pay rates
      const rateEntries = Object.entries(editUserRates)
        .filter(([, val]) => val !== '' && val !== null && val !== undefined)
        .map(([rateTypeId, payRate]) => ({ rate_type_id: rateTypeId, pay_rate: parseFloat(payRate) }))
      if (rateEntries.length > 0) {
        await apiPost(`/payroll/user-pay-rates/${editUser.id}`, { rates: rateEntries })
      }

      setEditUser(null)
      loadUsers()
      loadRateData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(user) {
    try {
      const { error } = await safeSb(supabase.from('users').update({ is_active: !user.is_active }).eq('id', user.id))
      if (error) throw error
      loadUsers()
    } catch (err) {
      alert('Error updating user: ' + err.message)
    }
  }

  async function handleSendLogin(user) {
    setSendingLoginTo(user.id)
    try {
      await apiPost(`/admin/send-welcome-email/${user.id}`, {})
      alert(`Login email sent to ${user.email}`)
    } catch (err) {
      alert('Error sending login email: ' + (err.message || err))
    } finally {
      setSendingLoginTo(null)
    }
  }

  const groupedRateTypes = groupRateTypes(rateTypes)

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Users</h2>
        <button className="btn btn--primary" onClick={() => setShowAdd(true)}>
          + Add User
        </button>
      </div>

      {/* Active / Inactive tabs */}
      <div className="filter-tabs" style={{ marginBottom: '1rem' }}>
        {[
          { key: 'active', label: 'Active', count: activeCount },
          { key: 'inactive', label: 'Inactive', count: inactiveCount },
        ].map(t => (
          <button
            key={t.key}
            className={`filter-tab ${tab === t.key ? 'filter-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count > 0 && <span className="filter-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loading"><div className="loading-spinner" /></div>
      ) : groupedByRole.length === 0 ? (
        <div className="empty-state">
          <p>No {tab} users.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="table-wrapper hide-mobile">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Employment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {groupedByRole.map(group => (
                  <React.Fragment key={group.role}>
                    <tr>
                      <td colSpan={5} style={{
                        background: 'var(--bg-elevated)',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--accent)',
                        padding: '0.625rem 0.75rem',
                        borderBottom: '2px solid var(--accent)',
                      }}>
                        {group.label}
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.75rem', textTransform: 'none' }}>
                          ({group.users.length})
                        </span>
                      </td>
                    </tr>
                    {group.users.map(u => (
                      <tr key={u.id} className="data-table-row">
                        <td className="data-table-primary">{u.first_name} {u.last_name}</td>
                        <td>{u.email}</td>
                        <td>{displayPhone(u.phone_number)}</td>
                        <td>{EMPLOYMENT_STATUSES.find(s => s.value === u.employment_status)?.label || u.employment_status || '—'}</td>
                        <td>
                          <div className="table-actions">
                            <button className="btn btn--small btn--ghost" onClick={() => openEditUser(u)}>Edit</button>
                            {u.is_active && (
                              <button
                                className="btn btn--small btn--ghost"
                                onClick={() => handleSendLogin(u)}
                                disabled={sendingLoginTo === u.id}
                              >
                                {sendingLoginTo === u.id ? 'Sending...' : 'Send Login'}
                              </button>
                            )}
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
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="card-list show-mobile">
            {groupedByRole.map(group => (
              <React.Fragment key={group.role}>
                <div style={{
                  fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase',
                  letterSpacing: '0.04em', color: 'var(--accent)',
                  padding: '0.5rem 0', marginTop: '0.5rem',
                  borderBottom: '2px solid var(--accent)',
                }}>
                  {group.label} ({group.users.length})
                </div>
                {group.users.map(u => (
                  <div key={u.id} className="card">
                    <div className="card-row">
                      <span className="card-label">{u.first_name} {u.last_name}</span>
                      <span className="card-value">{displayPhone(u.phone_number)}</span>
                    </div>
                    <div className="card-row">
                      <span className="card-muted">{u.email}</span>
                    </div>
                    <div className="card-actions">
                      <button className="btn btn--small btn--ghost" onClick={() => openEditUser(u)}>Edit</button>
                      {u.is_active && (
                        <button
                          className="btn btn--small btn--ghost"
                          onClick={() => handleSendLogin(u)}
                          disabled={sendingLoginTo === u.id}
                        >
                          {sendingLoginTo === u.id ? 'Sending...' : 'Send Login'}
                        </button>
                      )}
                      <button className={`btn btn--small ${u.is_active ? 'btn--danger-ghost' : 'btn--ghost'}`} onClick={() => handleToggleActive(u)}>
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {/* ── Add User Modal ── */}
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
              <input type="checkbox" checked={form.sms_enabled} onChange={e => setForm({ ...form, sms_enabled: e.target.checked })} />
              SMS Enabled
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.supervision_required} onChange={e => setForm({ ...form, supervision_required: e.target.checked })} />
              Supervision Required
            </label>
          </div>
          {form.supervision_required && (
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Clinical Supervisor</label>
              <select value={form.clinical_supervisor_id} onChange={e => setForm({ ...form, clinical_supervisor_id: e.target.value })}>
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

      {/* ── Pay Rates Step (after adding new user) ── */}
      <Modal open={payRateStep} onClose={() => { setPayRateStep(false); setNewUserId(null); loadUsers() }} title={`Pay Rates — ${newUserName}`} wide>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Set the pay rate per unit for each rate type. Leave blank if not applicable. You can update these any time by editing the user.
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
              loadRateData()
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

      {/* ── Edit User Modal ── */}
      <Modal open={!!editUser} onClose={() => { setEditUser(null); setError('') }} title="Edit User" wide>
        {editUser && (
          <form onSubmit={handleEditUser}>
            {error && <div className="form-error">{error}</div>}

            {/* ── Basic Info ── */}
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
                <input type="checkbox" checked={editUser.sms_enabled ?? true} onChange={e => setEditUser({ ...editUser, sms_enabled: e.target.checked })} />
                SMS Enabled
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={editUser.supervision_required ?? false} onChange={e => setEditUser({ ...editUser, supervision_required: e.target.checked })} />
                Supervision Required
              </label>
            </div>
            {editUser.supervision_required && (
              <div className="form-field" style={{ marginTop: '0.75rem' }}>
                <label>Clinical Supervisor</label>
                <select value={editUser.clinical_supervisor_id || ''} onChange={e => setEditUser({ ...editUser, clinical_supervisor_id: e.target.value || null })}>
                  <option value="">— None —</option>
                  {clinicalLeaders.map(cl => (
                    <option key={cl.id} value={cl.id}>{cl.first_name} {cl.last_name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Pay Rates ── */}
            {groupedRateTypes.length > 0 && (
              <>
                <ModalSection label="Pay Rates" />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                  Pay rate per unit for each service type. Leave blank if not applicable.
                </p>
                {groupedRateTypes.map(group => (
                  <div key={group.label} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {group.items.map(rt => (
                        <div key={rt.id} className="form-row" style={{ alignItems: 'center' }}>
                          <label style={{ fontSize: '0.85rem', color: 'var(--text)', flex: 1 }}>
                            {RATE_DISPLAY_NAMES[rt.name] || rt.name}
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.3rem' }}>({rt.unit})</span>
                          </label>
                          <div style={{ width: '110px' }}>
                            <input
                              type="number"
                              step="0.01"
                              className="form-input"
                              placeholder="$ rate"
                              value={editUserRates[rt.id] || ''}
                              onChange={e => setEditUserRates(prev => ({ ...prev, [rt.id]: e.target.value }))}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
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
