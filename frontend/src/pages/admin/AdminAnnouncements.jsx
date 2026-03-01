import { useState, useEffect } from 'react'
import { fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../lib/announcementsApi'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import { formatDateFull as formatDate } from '../../lib/utils'
import Modal from '../../components/Modal'

const CATEGORIES = ['general', 'policy', 'celebration', 'outing']
const ROLES = ['admin', 'clinical_leader', 'therapist', 'front_desk', 'ba', 'medical_biller']

const CATEGORY_COLORS = {
  policy: '#60a5fa',
  celebration: '#fbbf24',
  outing: '#22c55e',
  general: 'var(--text-muted)',
}

const DEFAULT_FORM = {
  title: '',
  body: '',
  category: 'general',
  audience_roles: [],
  effective_date: new Date().toISOString().split('T')[0],
  expiration_date: '',
}

function isExpired(ann) {
  if (!ann.expiration_date) return false
  const today = new Date().toISOString().split('T')[0]
  return ann.expiration_date < today
}

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const data = await fetchAnnouncements()
      setAnnouncements(data)
    } catch (err) {
      setError('Could not load announcements: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditing(null)
    setForm(DEFAULT_FORM)
    setModalOpen(true)
    setError(null)
  }

  function openEdit(ann) {
    setEditing(ann)
    setForm({
      title: ann.title || '',
      body: ann.body || '',
      category: ann.category || 'general',
      audience_roles: ann.audience_roles || [],
      effective_date: ann.effective_date || new Date().toISOString().split('T')[0],
      expiration_date: ann.expiration_date || '',
    })
    setModalOpen(true)
    setError(null)
  }

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function toggleRole(role) {
    setForm(f => {
      const roles = f.audience_roles.includes(role)
        ? f.audience_roles.filter(r => r !== role)
        : [...f.audience_roles, role]
      return { ...f, audience_roles: roles }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim() || null,
        category: form.category,
        audience_roles: form.audience_roles,
        effective_date: form.effective_date,
        expiration_date: form.expiration_date || null,
      }
      if (editing) {
        await updateAnnouncement(editing.id, payload)
      } else {
        await createAnnouncement(payload)
      }
      setModalOpen(false)
      loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(ann) {
    if (!confirm(`Delete "${ann.title}"?`)) return
    try {
      await deleteAnnouncement(ann.id)
      loadData()
    } catch (err) {
      setError('Delete failed: ' + err.message)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Announcements</h2>
        <div className="page-actions">
          <button className="btn btn--primary btn--small" onClick={openNew}>+ New Announcement</button>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {announcements.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📢</div>
          <h3>No announcements yet</h3>
          <p>Create an announcement to share with your team.</p>
          <button className="btn btn--primary" style={{ marginTop: '1rem' }} onClick={openNew}>Create Announcement</button>
        </div>
      ) : (
        <div className="card-list">
          {announcements.map(ann => (
            <div key={ann.id} className="card" style={{ opacity: isExpired(ann) ? 0.5 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span
                      className="home-announcement-badge"
                      style={{ background: CATEGORY_COLORS[ann.category] || CATEGORY_COLORS.general }}
                    >
                      {ann.category}
                    </span>
                    <span className="card-title" style={{ margin: 0 }}>{ann.title}</span>
                    {isExpired(ann) && <span className="badge badge--muted">expired</span>}
                  </div>
                  {ann.body && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
                      {ann.body.length > 150 ? ann.body.slice(0, 150) + '…' : ann.body}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>From: {formatDate(ann.effective_date)}</span>
                    <span>To: {ann.expiration_date ? formatDate(ann.expiration_date) : 'No expiry'}</span>
                    {(ann.audience_roles || []).length > 0 ? (
                      <span>Audience: {ann.audience_roles.join(', ')}</span>
                    ) : (
                      <span>All staff</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                  <button className="btn btn--ghost btn--small" onClick={() => openEdit(ann)}>Edit</button>
                  <button className="btn btn--danger-ghost btn--small" onClick={() => handleDelete(ann)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Announcement' : 'New Announcement'} wide>
        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <div className="form-field">
            <label>Title *</label>
            <input value={form.title} onChange={e => setField('title', e.target.value)} placeholder="e.g. Office Closed Friday" />
          </div>

          <div className="form-field" style={{ marginTop: '0.75rem' }}>
            <label>Body</label>
            <textarea value={form.body} onChange={e => setField('body', e.target.value)} placeholder="Optional details…" rows={3} />
          </div>

          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <div className="form-field">
              <label>Category</label>
              <select value={form.category} onChange={e => setField('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Effective Date</label>
              <input type="date" value={form.effective_date} onChange={e => setField('effective_date', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Expiration Date (optional)</label>
              <input type="date" value={form.expiration_date} onChange={e => setField('expiration_date', e.target.value)} />
            </div>
          </div>

          {/* Audience roles */}
          <div className="form-field" style={{ marginTop: '0.75rem' }}>
            <label>Audience (empty = all staff)</label>
            <div className="weekday-picker">
              {ROLES.map(role => (
                <button
                  key={role}
                  type="button"
                  className={`weekday-btn ${form.audience_roles.includes(role) ? 'weekday-btn--active' : ''}`}
                  onClick={() => toggleRole(role)}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Announcement'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
