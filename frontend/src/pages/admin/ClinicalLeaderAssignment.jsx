import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'

export default function ClinicalLeaderAssignment() {
  const [users, setUsers] = useState([])
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, role, clinical_supervisor_id, supervision_required, is_active')
        .eq('is_active', true)
        .order('last_name')
      if (error) throw error
      setUsers(data || [])
      setLeaders((data || []).filter(u => u.role === 'clinical_leader'))
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAssign(userId, supervisorId) {
    setSaving(userId)
    try {
      const { error } = await supabase
        .from('users')
        .update({ clinical_supervisor_id: supervisorId || null })
        .eq('id', userId)
      if (error) throw error
      loadData()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  async function handleToggleSupervision(userId, current) {
    setSaving(userId)
    try {
      const { error } = await supabase
        .from('users')
        .update({ supervision_required: !current })
        .eq('id', userId)
      if (error) throw error
      loadData()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  const assignable = users.filter(u => u.role !== 'admin' && u.role !== 'front_desk')

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Clinical Leader Assignment</h2>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Supervision Required</th>
              <th>Clinical Supervisor</th>
            </tr>
          </thead>
          <tbody>
            {assignable.map(u => (
              <tr key={u.id} className="data-table-row">
                <td className="data-table-primary">{u.first_name} {u.last_name}</td>
                <td>{u.role}</td>
                <td>
                  <button
                    className={`btn btn--small ${u.supervision_required ? 'btn--primary' : 'btn--ghost'}`}
                    onClick={() => handleToggleSupervision(u.id, u.supervision_required)}
                    disabled={saving === u.id}
                  >
                    {u.supervision_required ? 'Yes' : 'No'}
                  </button>
                </td>
                <td>
                  <select
                    className="form-input"
                    style={{ maxWidth: '200px', padding: '0.375rem 0.5rem', fontSize: '0.85rem' }}
                    value={u.clinical_supervisor_id || ''}
                    onChange={e => handleAssign(u.id, e.target.value)}
                    disabled={saving === u.id}
                  >
                    <option value="">— None —</option>
                    {leaders.map(l => (
                      <option key={l.id} value={l.id}>{l.first_name} {l.last_name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
