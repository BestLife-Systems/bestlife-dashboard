import { useState, useEffect } from 'react'
import {
  fetchMeetingTemplates, createMeetingTemplate, updateMeetingTemplate, deleteMeetingTemplate,
  fetchMeetingInstances, generateMeetings, deleteMeetingInstance,
} from '../../lib/meetingsApi'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import Modal from '../../components/Modal'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ROLES = ['admin', 'clinical_leader', 'therapist', 'front_desk', 'ba', 'medical_biller']

const CADENCE_LABELS = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  monthly_interval: 'Monthly Interval',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

const DEFAULT_FORM = {
  title: '',
  cadence: 'weekly',
  day_of_week: 0,
  skip_last: false,
  nth: 1,
  day_of_month: 1,
  every_n_months: 2,
  anchor: '',
  month_of_quarter: 1,
  q_months: '',
  q_day: 15,
  year_month: 1,
  year_day: 1,
  audience_roles: [],
  meeting_time: '',
  active: true,
}

function buildScheduleRule(form) {
  if (form.cadence === 'weekly') {
    const rule = { day_of_week: Number(form.day_of_week) }
    if (form.skip_last) rule.skip_last = true
    return rule
  }
  if (form.cadence === 'monthly') {
    return { nth: Number(form.nth), day_of_week: Number(form.day_of_week) }
  }
  if (form.cadence === 'monthly_interval') {
    return {
      day_of_month: Number(form.day_of_month),
      every_n_months: Number(form.every_n_months),
      anchor: form.anchor || new Date().toISOString().split('T')[0],
    }
  }
  if (form.cadence === 'quarterly') {
    if (form.q_months) {
      return {
        months: form.q_months.split(',').map(m => Number(m.trim())).filter(Boolean),
        day: Number(form.q_day),
      }
    }
    return {
      month_of_quarter: Number(form.month_of_quarter),
      nth: Number(form.nth),
      day_of_week: Number(form.day_of_week),
    }
  }
  if (form.cadence === 'yearly') {
    return { month: Number(form.year_month), day: Number(form.year_day) }
  }
  return {}
}

function parseScheduleRule(tmpl) {
  const rule = tmpl.schedule_rule || {}
  return {
    day_of_week: rule.day_of_week ?? 0,
    skip_last: rule.skip_last ?? false,
    nth: rule.nth ?? 1,
    day_of_month: rule.day_of_month ?? 1,
    every_n_months: rule.every_n_months ?? 2,
    anchor: rule.anchor ?? '',
    month_of_quarter: rule.month_of_quarter ?? 1,
    q_months: rule.months ? rule.months.join(', ') : '',
    q_day: rule.day ?? 15,
    year_month: rule.month ?? 1,
    year_day: rule.day ?? 1,
  }
}

function scheduleLabel(tmpl) {
  const rule = tmpl.schedule_rule || {}
  if (tmpl.cadence === 'weekly') {
    const day = WEEKDAYS[rule.day_of_week ?? 0]
    return `Every ${day}${rule.skip_last ? ' (skip last)' : ''}`
  }
  if (tmpl.cadence === 'monthly') {
    const nth = rule.nth === -1 ? 'Last' : `${rule.nth}${rule.nth === 1 ? 'st' : rule.nth === 2 ? 'nd' : rule.nth === 3 ? 'rd' : 'th'}`
    return `${nth} ${WEEKDAYS[rule.day_of_week ?? 0]} of month`
  }
  if (tmpl.cadence === 'monthly_interval') {
    return `Every ${rule.every_n_months} months on day ${rule.day_of_month}`
  }
  if (tmpl.cadence === 'quarterly') {
    if (rule.months) return `Quarterly: months ${rule.months.join(', ')}, day ${rule.day}`
    return `Quarterly: month ${rule.month_of_quarter} of quarter`
  }
  if (tmpl.cadence === 'yearly') {
    const mo = new Date(2000, (rule.month || 1) - 1).toLocaleString('en', { month: 'short' })
    return `Yearly: ${mo} ${rule.day}`
  }
  return tmpl.cadence
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function AdminMeetings() {
  const [tab, setTab] = useState('templates')
  const [templates, setTemplates] = useState([])
  const [instances, setInstances] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [t, i] = await Promise.all([fetchMeetingTemplates(), fetchMeetingInstances()])
      setTemplates(t)
      setInstances(i)
    } catch (err) {
      setError('Could not load data: ' + err.message)
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
      cadence: tmpl.cadence || 'weekly',
      ...rule,
      audience_roles: tmpl.audience_roles || [],
      meeting_time: tmpl.meeting_time || '',
      active: tmpl.active ?? true,
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
        cadence: form.cadence,
        schedule_rule: buildScheduleRule(form),
        audience_roles: form.audience_roles,
        meeting_time: form.meeting_time || null,
        active: form.active,
      }
      if (editingTemplate) {
        await updateMeetingTemplate(editingTemplate.id, payload)
      } else {
        await createMeetingTemplate(payload)
      }
      setModalOpen(false)
      loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(tmpl) {
    if (!confirm(`Deactivate "${tmpl.title}"?`)) return
    try {
      await deleteMeetingTemplate(tmpl.id)
      loadData()
    } catch (err) {
      setError('Delete failed: ' + err.message)
    }
  }

  async function handleDeleteInstance(inst) {
    if (!confirm(`Remove "${inst.title}" on ${formatDate(inst.meeting_date)}?`)) return
    try {
      await deleteMeetingInstance(inst.id)
      setInstances(prev => prev.filter(i => i.id !== inst.id))
    } catch (err) {
      setError('Delete failed: ' + err.message)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const result = await generateMeetings(120)
      setGenerateResult(result)
      const i = await fetchMeetingInstances()
      setInstances(i)
    } catch (err) {
      setError('Generation failed: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Meetings</h2>
        <div className="page-actions">
          <button
            className="btn btn--secondary btn--small"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generating…' : '⚡ Generate Next 120 Days'}
          </button>
          <button className="btn btn--primary btn--small" onClick={openNew}>+ New Template</button>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {generateResult && (
        <div className="upload-result" style={{ marginBottom: '1rem' }}>
          <div className="upload-result-header">
            Generated {generateResult.generated} instances
            {generateResult.skipped > 0 && ` (${generateResult.skipped} already existed)`}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {generateResult.templates_processed} templates processed
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="tab-bar" style={{ marginBottom: '1rem' }}>
        <button className={`tab-btn ${tab === 'templates' ? 'tab-btn--active' : ''}`} onClick={() => setTab('templates')}>
          Templates ({templates.length})
        </button>
        <button className={`tab-btn ${tab === 'instances' ? 'tab-btn--active' : ''}`} onClick={() => setTab('instances')}>
          Upcoming ({instances.length})
        </button>
      </div>

      {/* Templates Tab */}
      {tab === 'templates' && (
        templates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <h3>No meeting templates yet</h3>
            <p>Create a recurring meeting template to get started.</p>
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
                      <span className="badge badge--muted">{CADENCE_LABELS[tmpl.cadence] || tmpl.cadence}</span>
                      {!tmpl.active && <span className="badge badge--muted">inactive</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span>{scheduleLabel(tmpl)}</span>
                      {tmpl.meeting_time && <span>@ {tmpl.meeting_time}</span>}
                      {(tmpl.audience_roles || []).length > 0 && (
                        <span>Audience: {tmpl.audience_roles.join(', ')}</span>
                      )}
                      {(tmpl.audience_roles || []).length === 0 && (
                        <span>All staff</span>
                      )}
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
        )
      )}

      {/* Instances Tab */}
      {tab === 'instances' && (
        instances.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <h3>No upcoming meetings</h3>
            <p>Click "Generate" to create meeting instances from your templates.</p>
          </div>
        ) : (
          <div className="card-list">
            {instances.map(inst => (
              <div key={inst.id} className="card" style={{ padding: '0.75rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-bright)', marginRight: '0.75rem' }}>{inst.title}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {formatDate(inst.meeting_date)}
                      {inst.meeting_time && ` @ ${inst.meeting_time}`}
                    </span>
                  </div>
                  <button className="btn btn--danger-ghost btn--small" onClick={() => handleDeleteInstance(inst)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Create/Edit Template Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingTemplate ? 'Edit Meeting Template' : 'New Meeting Template'} wide>
        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <div className="form-field">
            <label>Title *</label>
            <input value={form.title} onChange={e => setField('title', e.target.value)} placeholder="e.g. Staff Sync, Birthday: Jane" />
          </div>

          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <div className="form-field">
              <label>Cadence</label>
              <select value={form.cadence} onChange={e => setField('cadence', e.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly (Nth weekday)</option>
                <option value="monthly_interval">Monthly Interval</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="form-field">
              <label>Time (optional)</label>
              <input value={form.meeting_time} onChange={e => setField('meeting_time', e.target.value)} placeholder="e.g. 10:00 AM" />
            </div>
          </div>

          {/* Cadence-specific fields */}
          {form.cadence === 'weekly' && (
            <div className="form-row" style={{ marginTop: '0.75rem' }}>
              <div className="form-field">
                <label>Day of Week</label>
                <select value={form.day_of_week} onChange={e => setField('day_of_week', Number(e.target.value))}>
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="form-field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
                <input type="checkbox" checked={form.skip_last} onChange={e => setField('skip_last', e.target.checked)} id="skip_last" />
                <label htmlFor="skip_last" style={{ margin: 0 }}>Skip last occurrence of month</label>
              </div>
            </div>
          )}

          {form.cadence === 'monthly' && (
            <div className="form-row" style={{ marginTop: '0.75rem' }}>
              <div className="form-field">
                <label>Which occurrence</label>
                <select value={form.nth} onChange={e => setField('nth', Number(e.target.value))}>
                  <option value={1}>1st</option>
                  <option value={2}>2nd</option>
                  <option value={3}>3rd</option>
                  <option value={4}>4th</option>
                  <option value={-1}>Last</option>
                </select>
              </div>
              <div className="form-field">
                <label>Day of Week</label>
                <select value={form.day_of_week} onChange={e => setField('day_of_week', Number(e.target.value))}>
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            </div>
          )}

          {form.cadence === 'monthly_interval' && (
            <div className="form-row" style={{ marginTop: '0.75rem' }}>
              <div className="form-field">
                <label>Day of Month</label>
                <input type="number" min="1" max="28" value={form.day_of_month} onChange={e => setField('day_of_month', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Every N Months</label>
                <input type="number" min="1" max="12" value={form.every_n_months} onChange={e => setField('every_n_months', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Anchor Date</label>
                <input type="date" value={form.anchor} onChange={e => setField('anchor', e.target.value)} />
              </div>
            </div>
          )}

          {form.cadence === 'quarterly' && (
            <div style={{ marginTop: '0.75rem' }}>
              <div className="form-row">
                <div className="form-field">
                  <label>Month of Quarter (1-3)</label>
                  <input type="number" min="1" max="3" value={form.month_of_quarter} onChange={e => setField('month_of_quarter', e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Which occurrence</label>
                  <select value={form.nth} onChange={e => setField('nth', Number(e.target.value))}>
                    <option value={1}>1st</option>
                    <option value={2}>2nd</option>
                    <option value={3}>3rd</option>
                    <option value={4}>4th</option>
                    <option value={-1}>Last</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Day of Week</label>
                  <select value={form.day_of_week} onChange={e => setField('day_of_week', Number(e.target.value))}>
                    {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {form.cadence === 'yearly' && (
            <div className="form-row" style={{ marginTop: '0.75rem' }}>
              <div className="form-field">
                <label>Month</label>
                <select value={form.year_month} onChange={e => setField('year_month', Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2000, i).toLocaleString('en', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Day</label>
                <input type="number" min="1" max="31" value={form.year_day} onChange={e => setField('year_day', e.target.value)} />
              </div>
            </div>
          )}

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
              {submitting ? 'Saving…' : editingTemplate ? 'Save Changes' : 'Create Template'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
