import { useState, useEffect } from 'react'
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate, generateInstances } from '../../lib/tasksApi'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import Modal from '../../components/Modal'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ROLES = ['admin', 'clinical_leader', 'therapist', 'front_desk', 'ba', 'medical_biller']

const DEFAULT_FORM = {
  title: '',
  description: '',
  tags: '',
  priority: 'medium',
  assigned_to_role: '',
  assigned_to_user_id: null,
  schedule_type: 'weekly',
  weekdays: [0, 1, 2, 3, 4],
  every_n_days: 1,
  day_of_month: 1,
  timezone: 'America/New_York',
  default_due_offset_days: 0,
  active: true,
}

function buildScheduleRule(form) {
  if (form.schedule_type === 'weekly') return JSON.stringify({ weekdays: form.weekdays })
  if (form.schedule_type === 'daily') return JSON.stringify({ every_n_days: Number(form.every_n_days) })
  if (form.schedule_type === 'monthly') return JSON.stringify({ day_of_month: Number(form.day_of_month) })
  return '{}'
}

function parseScheduleRule(template) {
  try {
    const rule = JSON.parse(template.schedule_rule || '{}')
    return {
      weekdays: rule.weekdays ?? [0, 1, 2, 3, 4],
      every_n_days: rule.every_n_days ?? 1,
      day_of_month: rule.day_of_month ?? 1,
    }
  } catch {
    return { weekdays: [0, 1, 2, 3, 4], every_n_days: 1, day_of_month: 1 }
  }
}

export default function AdminTaskTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadTemplates() }, [])

  async function loadTemplates() {
    setLoading(true)
    try {
      const data = await fetchTemplates()
      setTemplates(data)
    } catch (err) {
      setError('Could not load templates: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditingTemplate(null)
    setForm(DEFAULT_FORM)
    setModalOpen(true)
    setError(null)
  }

  function openEdit(tmpl) {
    const rule = parseScheduleRule(tmpl)
    setEditingTemplate(tmpl)
    setForm({
      title: tmpl.title || '',
      description: tmpl.description || '',
      tags: (tmpl.tags || []).join(', '),
      priority: tmpl.priority || 'medium',
      assigned_to_role: tmpl.assigned_to_role || '',
      assigned_to_user_id: tmpl.assigned_to_user_id || null,
      schedule_type: tmpl.schedule_type || 'weekly',
      weekdays: rule.weekdays,
      every_n_days: rule.every_n_days,
      day_of_month: rule.day_of_month,
      timezone: tmpl.timezone || 'America/New_York',
      default_due_offset_days: tmpl.default_due_offset_days ?? 0,
      active: tmpl.active ?? true,
    })
    setModalOpen(true)
    setError(null)
  }

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function toggleWeekday(idx) {
    setForm(f => {
      const days = f.weekdays.includes(idx)
        ? f.weekdays.filter(d => d !== idx)
        : [...f.weekdays, idx].sort()
      return { ...f, weekdays: days }
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
        description: form.description.trim() || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        priority: form.priority,
        assigned_to_role: form.assigned_to_role || null,
        assigned_to_user_id: form.assigned_to_user_id || null,
        schedule_type: form.schedule_type,
        schedule_rule: buildScheduleRule(form),
        timezone: form.timezone,
        default_due_offset_days: Number(form.default_due_offset_days),
        active: form.active,
      }
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, payload)
      } else {
        await createTemplate(payload)
      }
      setModalOpen(false)
      loadTemplates()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(tmpl) {
    if (!confirm(`Deactivate "${tmpl.title}"?`)) return
    try {
      await deleteTemplate(tmpl.id)
      loadTemplates()
    } catch (err) {
      setError('Delete failed: ' + err.message)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const result = await generateInstances(30)
      setGenerateResult(result)
    } catch (err) {
      setError('Generation failed: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  function scheduleLabel(tmpl) {
    try {
      const rule = JSON.parse(tmpl.schedule_rule || '{}')
      if (tmpl.schedule_type === 'weekly') {
        const days = (rule.weekdays || []).map(d => WEEKDAYS[d]).join(', ')
        return `Weekly: ${days || 'no days'}`
      }
      if (tmpl.schedule_type === 'daily') return `Every ${rule.every_n_days || 1} day(s)`
      if (tmpl.schedule_type === 'monthly') return `Monthly on day ${rule.day_of_month || 1}`
    } catch {}
    return tmpl.schedule_type
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Task Templates</h2>
        <div className="page-actions">
          <button
            className="btn btn--secondary btn--small"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'generating…' : '⚡ Generate Next 30 Days'}
          </button>
          <button className="btn btn--primary btn--small" onClick={openNew}>+ New Template</button>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {generateResult && (
        <div className="upload-result" style={{ marginBottom: '1rem' }}>
          <div className="upload-result-header">
            ✅ Generated {generateResult.generated} instances
            {generateResult.skipped > 0 && ` (${generateResult.skipped} already existed)`}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {generateResult.templates_processed} templates processed · {generateResult.window_days}-day window
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗓️</div>
          <h3>No templates yet</h3>
          <p>Create your first recurring task template to get started.</p>
          <button className="btn btn--primary" style={{ marginTop: '1rem' }} onClick={openNew}>Create Template</button>
        </div>
      ) : (
        <div className="card-list">
          {templates.map(tmpl => (
            <div key={tmpl.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span className="card-title" style={{ margin: 0 }}>{tmpl.title}</span>
                    <span className={`task-priority task-priority--${tmpl.priority}`}>{tmpl.priority}</span>
                    {!tmpl.active && <span className="badge badge--muted">inactive</span>}
                  </div>
                  {tmpl.description && (
                    <div className="card-muted" style={{ marginBottom: '0.375rem' }}>{tmpl.description}</div>
                  )}
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>🗓 {scheduleLabel(tmpl)}</span>
                    {tmpl.assigned_to_role && <span>👤 {tmpl.assigned_to_role}</span>}
                    {(tmpl.tags || []).map(tag => (
                      <span key={tag} className="kb-article-tag">{tag}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                  <button className="btn btn--ghost btn--small" onClick={() => openEdit(tmpl)}>Edit</button>
                  <button className="btn btn--danger-ghost btn--small" onClick={() => handleDelete(tmpl)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingTemplate ? 'Edit Template' : 'New Task Template'} wide>
        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <div className="form-field">
            <label>Title *</label>
            <input value={form.title} onChange={e => setField('title', e.target.value)} placeholder="e.g. Weekly Team Standup" />
          </div>

          <div className="form-field" style={{ marginTop: '0.75rem' }}>
            <label>Description</label>
            <textarea value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Optional details…" />
          </div>

          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <div className="form-field">
              <label>Priority</label>
              <select value={form.priority} onChange={e => setField('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="form-field">
              <label>Assign to Role</label>
              <select value={form.assigned_to_role} onChange={e => setField('assigned_to_role', e.target.value)}>
                <option value="">— All / None —</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="form-field" style={{ marginTop: '0.75rem' }}>
            <label>Tags (comma-separated)</label>
            <input value={form.tags} onChange={e => setField('tags', e.target.value)} placeholder="e.g. clinical, admin, weekly" />
          </div>

          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <div className="form-field">
              <label>Schedule Type</label>
              <select value={form.schedule_type} onChange={e => setField('schedule_type', e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="form-field">
              <label>Due Offset (days after generation)</label>
              <input type="number" min="0" max="30" value={form.default_due_offset_days} onChange={e => setField('default_due_offset_days', e.target.value)} />
            </div>
          </div>

          {/* Schedule-specific options */}
          {form.schedule_type === 'weekly' && (
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Repeat on</label>
              <div className="weekday-picker">
                {WEEKDAYS.map((day, idx) => (
                  <button
                    key={day}
                    type="button"
                    className={`weekday-btn ${form.weekdays.includes(idx) ? 'weekday-btn--active' : ''}`}
                    onClick={() => toggleWeekday(idx)}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.schedule_type === 'daily' && (
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Repeat every N days</label>
              <input type="number" min="1" max="90" value={form.every_n_days} onChange={e => setField('every_n_days', e.target.value)} />
            </div>
          )}

          {form.schedule_type === 'monthly' && (
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Day of month</label>
              <input type="number" min="1" max="28" value={form.day_of_month} onChange={e => setField('day_of_month', e.target.value)} />
            </div>
          )}

          <div className="modal-actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'saving…' : editingTemplate ? 'Save Changes' : 'Create Template'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
