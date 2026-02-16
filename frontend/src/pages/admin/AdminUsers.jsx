import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { apiPost, apiPatch } from '../../lib/api'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'clinical_leader', label: 'Clinical Leader' },
  { value: 'therapist', label: 'Therapist' },
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'ba', label: 'Billing Admin' },
  { value: 'medical_biller', label: 'Medical Biller' },
]

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', role: 'therapist' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      await apiPost('/admin/invite-user', {
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        role: form.role,
      })
      setShowAdd(false)
      setForm({ first_name: '', last_name: '', email: '', role: 'therapist' })
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
      const { error: err } = await supabase
        .from('users')
        .update({ role: editUser.role })
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
            <div className="modal-section">
              <div className="modal-label">Name</div>
              <div className="modal-value">{editUser.first_name} {editUser.last_name}</div>
            </div>
            <div className="modal-section">
              <div className="modal-label">Email</div>
              <div className="modal-value">{editUser.email}</div>
            </div>
            <div className="form-field">
              <label>Role</label>
              <select value={editUser.role} onChange={e => setEditUser({ ...editUser, role: e.target.value })}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
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
