import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { apiPost, apiPatch } from '../../lib/api'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'clinical_leader', label: 'Clinical Leader' },
  { value: 'therapist', label: 'Therapist' },
  { value: 'apn', label: 'APN' },
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'ba', label: 'Billing Admin' },
  { value: 'medical_biller', label: 'Medical Biller' },
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

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', role: 'therapist', phone_number: '', sms_enabled: true, supervision_required: false, clinical_supervisor_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      await apiPost('/admin/invite-user', {
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        role: form.role,
        phone_number: phoneE164 || null,
        sms_enabled: form.sms_enabled,
        supervision_required: form.supervision_required,
        clinical_supervisor_id: form.clinical_supervisor_id || null,
      })
      setShowAdd(false)
      setForm({ first_name: '', last_name: '', email: '', role: 'therapist', phone_number: '', sms_enabled: true, supervision_required: false, clinical_supervisor_id: '' })
      loadUsers()
    } catch (err) {
      setError(err.message)
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
        <button className="btn btn--primary" onClick={() => setShowAdd(true)}>
          + Add User
        </button>
      </div>

      {loading ? (
        <div className="page-loading"><div className="loading-spinner" /></div>
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
          <div className="form-field">
            <label>Role</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
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
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Role</label>
              <select value={editUser.role} onChange={e => setEditUser({ ...editUser, role: e.target.value })}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
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
