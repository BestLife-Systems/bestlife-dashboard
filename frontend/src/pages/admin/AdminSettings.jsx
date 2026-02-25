import { useState, useEffect } from 'react'
import { apiUpload, apiGet } from '../../lib/api'
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate, generateInstances } from '../../lib/tasksApi'
import { fetchMeetingTemplates, createMeetingTemplate, updateMeetingTemplate, deleteMeetingTemplate, generateMeetings } from '../../lib/meetingsApi'
import Modal from '../../components/Modal'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ROLES = ['admin', 'clinical_leader', 'therapist', 'front_desk', 'ba', 'medical_biller']

const MEETING_CADENCES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

// ── Task Template Helpers ──

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

// ── Meeting Template Helpers ──

function parseMeetingScheduleRule(tmpl) {
  try {
    const rule = typeof tmpl.schedule_rule === 'string' ? JSON.parse(tmpl.schedule_rule) : (tmpl.schedule_rule || {})
    return {
      day_of_week: rule.day_of_week ?? 1,
      day_of_month: rule.day_of_month ?? 1,
      month: rule.month ?? 1,
      week_of_month: rule.week_of_month ?? 1,
    }
  } catch {
    return { day_of_week: 1, day_of_month: 1, month: 1, week_of_month: 1 }
  }
}

const DEFAULT_TASK_FORM = {
  title: '', description: '', tags: '', priority: 'medium',
  assigned_to_role: '', assigned_to_user_id: null,
  schedule_type: 'weekly', weekdays: [0, 1, 2, 3, 4],
  every_n_days: 1, day_of_month: 1, timezone: 'America/New_York',
  default_due_offset_days: 0, active: true,
}

const DEFAULT_MEETING_FORM = {
  title: '', cadence: 'weekly', meeting_time: '',
  audience_roles: [], active: true,
  day_of_week: 1, day_of_month: 1, month: 1, week_of_month: 1,
}

export default function AdminSettings() {
  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [error, setError] = useState('')
  const [lastUpload, setLastUpload] = useState(null)

  // Task Templates
  const [taskTemplates, setTaskTemplates] = useState([])
  const [loadingTaskTmpl, setLoadingTaskTmpl] = useState(true)
  const [taskTmplModal, setTaskTmplModal] = useState(false)
  const [editingTaskTmpl, setEditingTaskTmpl] = useState(null)
  const [taskTmplForm, setTaskTmplForm] = useState(DEFAULT_TASK_FORM)
  const [taskTmplSaving, setTaskTmplSaving] = useState(false)
  const [taskTmplError, setTaskTmplError] = useState(null)

  // Meeting Templates
  const [meetingTemplates, setMeetingTemplates] = useState([])
  const [loadingMeetingTmpl, setLoadingMeetingTmpl] = useState(true)
  const [meetingTmplModal, setMeetingTmplModal] = useState(false)
  const [editingMeetingTmpl, setEditingMeetingTmpl] = useState(null)
  const [meetingTmplForm, setMeetingTmplForm] = useState(DEFAULT_MEETING_FORM)
  const [meetingTmplSaving, setMeetingTmplSaving] = useState(false)
  const [meetingTmplError, setMeetingTmplError] = useState(null)

  useEffect(() => {
    apiGet('/settings/last-upload').then(setLastUpload).catch(() => {})
    loadTaskTemplates()
    loadMeetingTemplates()
  }, [])

  // ── Upload ──

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please upload an .xlsx or .xls file')
      return
    }
    setError('')
    setUploadResult(null)
    setUploading(true)
    try {
      const result = await apiUpload('/upload/therapynotes', file)
      setUploadResult(result)
      setLastUpload({ uploaded_at: new Date().toISOString(), filename: file.name })
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // ── Task Templates ──

  async function loadTaskTemplates() {
    setLoadingTaskTmpl(true)
    try {
      const data = await fetchTemplates()
      setTaskTemplates(data)
    } catch (err) {
      setTaskTmplError('Could not load task templates: ' + err.message)
    } finally {
      setLoadingTaskTmpl(false)
    }
  }

  function openNewTaskTmpl() {
    setEditingTaskTmpl(null)
    setTaskTmplForm(DEFAULT_TASK_FORM)
    setTaskTmplModal(true)
    setTaskTmplError(null)
  }

  function openEditTaskTmpl(tmpl) {
    const rule = parseScheduleRule(tmpl)
    setEditingTaskTmpl(tmpl)
    setTaskTmplForm({
      title: tmpl.title || '', description: tmpl.description || '',
      tags: (tmpl.tags || []).join(', '), priority: tmpl.priority || 'medium',
      assigned_to_role: tmpl.assigned_to_role || '', assigned_to_user_id: tmpl.assigned_to_user_id || null,
      schedule_type: tmpl.schedule_type || 'weekly', weekdays: rule.weekdays,
      every_n_days: rule.every_n_days, day_of_month: rule.day_of_month,
      timezone: tmpl.timezone || 'America/New_York',
      default_due_offset_days: tmpl.default_due_offset_days ?? 0, active: tmpl.active ?? true,
    })
    setTaskTmplModal(true)
    setTaskTmplError(null)
  }

  function setTaskField(key, value) {
    setTaskTmplForm(f => ({ ...f, [key]: value }))
  }

  function toggleWeekday(idx) {
    setTaskTmplForm(f => {
      const days = f.weekdays.includes(idx) ? f.weekdays.filter(d => d !== idx) : [...f.weekdays, idx].sort()
      return { ...f, weekdays: days }
    })
  }

  async function handleSaveTaskTmpl(e) {
    e.preventDefault()
    if (!taskTmplForm.title.trim()) { setTaskTmplError('Title is required'); return }
    setTaskTmplSaving(true)
    setTaskTmplError(null)
    try {
      const payload = {
        title: taskTmplForm.title.trim(),
        description: taskTmplForm.description.trim() || null,
        tags: taskTmplForm.tags ? taskTmplForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        priority: taskTmplForm.priority,
        assigned_to_role: taskTmplForm.assigned_to_role || null,
        assigned_to_user_id: taskTmplForm.assigned_to_user_id || null,
        schedule_type: taskTmplForm.schedule_type,
        schedule_rule: buildScheduleRule(taskTmplForm),
        timezone: taskTmplForm.timezone,
        default_due_offset_days: Number(taskTmplForm.default_due_offset_days),
        active: taskTmplForm.active,
      }
      if (editingTaskTmpl) {
        await updateTemplate(editingTaskTmpl.id, payload)
      } else {
        await createTemplate(payload)
      }
      setTaskTmplModal(false)
      loadTaskTemplates()
      // Auto-regenerate instances after template change
      generateInstances(30).catch(() => {})
    } catch (err) {
      setTaskTmplError(err.message)
    } finally {
      setTaskTmplSaving(false)
    }
  }

  async function handleDeleteTaskTmpl(tmpl) {
    if (!confirm(`Deactivate "${tmpl.title}"?`)) return
    try {
      await deleteTemplate(tmpl.id)
      loadTaskTemplates()
    } catch (err) {
      setTaskTmplError('Delete failed: ' + err.message)
    }
  }

  // ── Meeting Templates ──

  async function loadMeetingTemplates() {
    setLoadingMeetingTmpl(true)
    try {
      const data = await fetchMeetingTemplates()
      setMeetingTemplates(data)
    } catch (err) {
      setMeetingTmplError('Could not load meeting templates: ' + err.message)
    } finally {
      setLoadingMeetingTmpl(false)
    }
  }

  function openNewMeetingTmpl() {
    setEditingMeetingTmpl(null)
    setMeetingTmplForm(DEFAULT_MEETING_FORM)
    setMeetingTmplModal(true)
    setMeetingTmplError(null)
  }

  function openEditMeetingTmpl(tmpl) {
    const rule = parseMeetingScheduleRule(tmpl)
    setEditingMeetingTmpl(tmpl)
    setMeetingTmplForm({
      title: tmpl.title || '', cadence: tmpl.cadence || 'weekly',
      meeting_time: tmpl.meeting_time || '',
      audience_roles: tmpl.audience_roles || [], active: tmpl.active ?? true,
      day_of_week: rule.day_of_week, day_of_month: rule.day_of_month,
      month: rule.month, week_of_month: rule.week_of_month,
    })
    setMeetingTmplModal(true)
    setMeetingTmplError(null)
  }

  function setMeetingField(key, value) {
    setMeetingTmplForm(f => ({ ...f, [key]: value }))
  }

  async function handleSaveMeetingTmpl(e) {
    e.preventDefault()
    if (!meetingTmplForm.title.trim()) { setMeetingTmplError('Title is required'); return }
    setMeetingTmplSaving(true)
    setMeetingTmplError(null)
    try {
      const scheduleRule = {}
      if (meetingTmplForm.cadence === 'weekly') scheduleRule.day_of_week = Number(meetingTmplForm.day_of_week)
      if (meetingTmplForm.cadence === 'monthly') scheduleRule.day_of_month = Number(meetingTmplForm.day_of_month)
      if (meetingTmplForm.cadence === 'quarterly') { scheduleRule.month = Number(meetingTmplForm.month); scheduleRule.day_of_month = Number(meetingTmplForm.day_of_month) }
      if (meetingTmplForm.cadence === 'yearly') { scheduleRule.month = Number(meetingTmplForm.month); scheduleRule.day_of_month = Number(meetingTmplForm.day_of_month) }

      const payload = {
        title: meetingTmplForm.title.trim(),
        cadence: meetingTmplForm.cadence,
        schedule_rule: scheduleRule,
        audience_roles: meetingTmplForm.audience_roles,
        meeting_time: meetingTmplForm.meeting_time || null,
        active: meetingTmplForm.active,
      }
      if (editingMeetingTmpl) {
        await updateMeetingTemplate(editingMeetingTmpl.id, payload)
      } else {
        await createMeetingTemplate(payload)
      }
      setMeetingTmplModal(false)
      loadMeetingTemplates()
      // Auto-regenerate instances
      generateMeetings(120).catch(() => {})
    } catch (err) {
      setMeetingTmplError(err.message)
    } finally {
      setMeetingTmplSaving(false)
    }
  }

  async function handleDeleteMeetingTmpl(tmpl) {
    if (!confirm(`Delete "${tmpl.title}"?`)) return
    try {
      await deleteMeetingTemplate(tmpl.id)
      loadMeetingTemplates()
    } catch (err) {
      setMeetingTmplError('Delete failed: ' + err.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Settings</h2>
      </div>

      {/* ── Task Templates ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 className="card-title" style={{ margin: 0 }}>Task Templates</h3>
          <button className="btn btn--primary btn--small" onClick={openNewTaskTmpl}>+ New Template</button>
        </div>
        <p className="card-description" style={{ marginBottom: '0.75rem' }}>
          Recurring task templates auto-generate task instances. Changes take effect on next generation.
        </p>
        {taskTmplError && <div className="form-error" style={{ marginBottom: '0.5rem' }}>{taskTmplError}</div>}
        {loadingTaskTmpl ? (
          <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</div>
        ) : taskTemplates.length === 0 ? (
          <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No task templates yet.</div>
        ) : (
          <div className="card-list">
            {taskTemplates.map(tmpl => (
              <div key={tmpl.id} className="card" style={{ padding: '0.75rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-bright)' }}>{tmpl.title}</span>
                      <span className={`task-priority task-priority--${tmpl.priority}`}>{tmpl.priority}</span>
                      {!tmpl.active && <span className="badge badge--muted">inactive</span>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      {scheduleLabel(tmpl)}
                      {tmpl.assigned_to_role && ` · ${tmpl.assigned_to_role}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    <button className="btn btn--ghost btn--small" onClick={() => openEditTaskTmpl(tmpl)}>Edit</button>
                    <button className="btn btn--danger-ghost btn--small" onClick={() => handleDeleteTaskTmpl(tmpl)}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Meeting Templates ── */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 className="card-title" style={{ margin: 0 }}>Meeting Templates</h3>
          <button className="btn btn--primary btn--small" onClick={openNewMeetingTmpl}>+ New Template</button>
        </div>
        <p className="card-description" style={{ marginBottom: '0.75rem' }}>
          Recurring meeting templates auto-generate meeting instances on the Home page.
        </p>
        {meetingTmplError && <div className="form-error" style={{ marginBottom: '0.5rem' }}>{meetingTmplError}</div>}
        {loadingMeetingTmpl ? (
          <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</div>
        ) : meetingTemplates.length === 0 ? (
          <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No meeting templates yet.</div>
        ) : (
          <div className="card-list">
            {meetingTemplates.map(tmpl => (
              <div key={tmpl.id} className="card" style={{ padding: '0.75rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-bright)' }}>{tmpl.title}</span>
                      <span className="badge badge--info">{tmpl.cadence}</span>
                      {!tmpl.active && <span className="badge badge--muted">inactive</span>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      {tmpl.meeting_time && `@ ${tmpl.meeting_time}`}
                      {(tmpl.audience_roles || []).length > 0 && ` · ${tmpl.audience_roles.join(', ')}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    <button className="btn btn--ghost btn--small" onClick={() => openEditMeetingTmpl(tmpl)}>Edit</button>
                    <button className="btn btn--danger-ghost btn--small" onClick={() => handleDeleteMeetingTmpl(tmpl)}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── API Connections ── */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className="card-title">API Connections</h3>
        <p className="card-description" style={{ marginBottom: '1rem' }}>
          Connect external services to extend BestLife Hub's capabilities. API keys are stored securely in your backend environment.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* OpenAI / Claude */}
          <div className="card" style={{ padding: '0.875rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, #10a37f, #1a7f64)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2z" /><path d="M8 12h8M12 8v8" /></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-bright)' }}>AI Assistant (Betty)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OpenAI GPT or Anthropic Claude · Powers Ask Betty</div>
                </div>
              </div>
              <span className="badge badge--muted">Not Connected</span>
            </div>
          </div>

          {/* QuickBooks Online */}
          <div className="card" style={{ padding: '0.875rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, #2ca01c, #1a8a0e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>QB</span>
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-bright)' }}>QuickBooks Online</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Accounting & invoicing · Payroll sync</div>
                </div>
              </div>
              <span className="badge badge--muted">Not Connected</span>
            </div>
          </div>

          {/* Google Workspace */}
          <div className="card" style={{ padding: '0.875rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, #4285f4, #3367d6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>G</span>
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-bright)' }}>Google Workspace</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Calendar, Drive, Gmail · Team scheduling</div>
                </div>
              </div>
              <span className="badge badge--muted">Not Connected</span>
            </div>
          </div>

          {/* Meta / Facebook */}
          <div className="card" style={{ padding: '0.875rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, #0668e1, #0553b8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>M</span>
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-bright)' }}>Meta Business</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Facebook & Instagram · Marketing & analytics</div>
                </div>
              </div>
              <span className="badge badge--muted">Not Connected</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          💡 To connect a service, add the required API keys to your backend environment variables on Railway, then redeploy. Integration endpoints will be built as each service is connected.
        </div>
      </div>

      {/* ── TherapyNotes Upload ── */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className="card-title">TherapyNotes Data Upload</h3>
        <p className="card-description">
          Upload a TherapyNotes Billing Transactions export (.xlsx) to update analytics data.
        </p>

        {lastUpload && (
          <div className="settings-info">
            <div className="settings-info-row">
              <span className="settings-info-label">Last Upload</span>
              <span className="settings-info-value">
                {new Date(lastUpload.uploaded_at).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>
            {lastUpload.filename && (
              <div className="settings-info-row">
                <span className="settings-info-label">File</span>
                <span className="settings-info-value">{lastUpload.filename}</span>
              </div>
            )}
          </div>
        )}

        <div className="upload-zone">
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} disabled={uploading} id="therapynotes-upload" className="upload-input" />
          <label htmlFor="therapynotes-upload" className={`upload-label ${uploading ? 'upload-label--disabled' : ''}`}>
            {uploading ? (
              <><div className="loading-spinner loading-spinner--small" /><span>Processing file...</span></>
            ) : (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Click to upload TherapyNotes .xlsx file</span>
              </>
            )}
          </label>
        </div>

        {error && <div className="form-error" style={{ marginTop: '1rem' }}>{error}</div>}

        {uploadResult && (
          <div className="upload-result">
            <div className="upload-result-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Upload Complete
            </div>
            <div className="settings-info">
              <div className="settings-info-row">
                <span className="settings-info-label">Transactions Processed</span>
                <span className="settings-info-value">{uploadResult.transactions_count?.toLocaleString()}</span>
              </div>
              <div className="settings-info-row">
                <span className="settings-info-label">Therapists Found</span>
                <span className="settings-info-value">{uploadResult.therapist_count}</span>
              </div>
              <div className="settings-info-row">
                <span className="settings-info-label">Date Range</span>
                <span className="settings-info-value">{uploadResult.date_range}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* System Info */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className="card-title">System Info</h3>
        <div className="settings-info">
          <div className="settings-info-row">
            <span className="settings-info-label">Platform</span>
            <span className="settings-info-value">BestLife Hub v1.0</span>
          </div>
          <div className="settings-info-row">
            <span className="settings-info-label">Backend</span>
            <span className="settings-info-value">FastAPI + Supabase</span>
          </div>
          <div className="settings-info-row">
            <span className="settings-info-label">Hosting</span>
            <span className="settings-info-value">Railway</span>
          </div>
        </div>
      </div>

      {/* ── Task Template Modal ── */}
      <Modal open={taskTmplModal} onClose={() => setTaskTmplModal(false)} title={editingTaskTmpl ? 'Edit Task Template' : 'New Task Template'} wide>
        <form onSubmit={handleSaveTaskTmpl}>
          {taskTmplError && <div className="form-error">{taskTmplError}</div>}

          <div className="form-field">
            <label>Title *</label>
            <input value={taskTmplForm.title} onChange={e => setTaskField('title', e.target.value)} placeholder="e.g. Weekly Team Standup" />
          </div>

          <div className="form-field" style={{ marginTop: '0.75rem' }}>
            <label>Description</label>
            <textarea value={taskTmplForm.description} onChange={e => setTaskField('description', e.target.value)} placeholder="Optional details..." />
          </div>

          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <div className="form-field">
              <label>Priority</label>
              <select value={taskTmplForm.priority} onChange={e => setTaskField('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="form-field">
              <label>Assign to Role</label>
              <select value={taskTmplForm.assigned_to_role} onChange={e => setTaskField('assigned_to_role', e.target.value)}>
                <option value="">— All / None —</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="form-field" style={{ marginTop: '0.75rem' }}>
            <label>Tags (comma-separated)</label>
            <input value={taskTmplForm.tags} onChange={e => setTaskField('tags', e.target.value)} placeholder="e.g. clinical, admin, weekly" />
          </div>

          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <div className="form-field">
              <label>Schedule Type</label>
              <select value={taskTmplForm.schedule_type} onChange={e => setTaskField('schedule_type', e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="form-field">
              <label>Due Offset (days)</label>
              <input type="number" min="0" max="30" value={taskTmplForm.default_due_offset_days} onChange={e => setTaskField('default_due_offset_days', e.target.value)} />
            </div>
          </div>

          {taskTmplForm.schedule_type === 'weekly' && (
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Repeat on</label>
              <div className="weekday-picker">
                {WEEKDAYS.map((day, idx) => (
                  <button key={day} type="button" className={`weekday-btn ${taskTmplForm.weekdays.includes(idx) ? 'weekday-btn--active' : ''}`} onClick={() => toggleWeekday(idx)}>
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {taskTmplForm.schedule_type === 'daily' && (
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Repeat every N days</label>
              <input type="number" min="1" max="90" value={taskTmplForm.every_n_days} onChange={e => setTaskField('every_n_days', e.target.value)} />
            </div>
          )}

          {taskTmplForm.schedule_type === 'monthly' && (
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Day of month</label>
              <input type="number" min="1" max="28" value={taskTmplForm.day_of_month} onChange={e => setTaskField('day_of_month', e.target.value)} />
            </div>
          )}

          <div className="modal-actions">
            <button type="submit" className="btn btn--primary" disabled={taskTmplSaving}>
              {taskTmplSaving ? 'Saving...' : editingTaskTmpl ? 'Save Changes' : 'Create Template'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setTaskTmplModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* ── Meeting Template Modal ── */}
      <Modal open={meetingTmplModal} onClose={() => setMeetingTmplModal(false)} title={editingMeetingTmpl ? 'Edit Meeting Template' : 'New Meeting Template'} wide>
        <form onSubmit={handleSaveMeetingTmpl}>
          {meetingTmplError && <div className="form-error">{meetingTmplError}</div>}

          <div className="form-field">
            <label>Title *</label>
            <input value={meetingTmplForm.title} onChange={e => setMeetingField('title', e.target.value)} placeholder="e.g. All Hands Meeting" />
          </div>

          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <div className="form-field">
              <label>Cadence</label>
              <select value={meetingTmplForm.cadence} onChange={e => setMeetingField('cadence', e.target.value)}>
                {MEETING_CADENCES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Time (optional)</label>
              <input type="time" value={meetingTmplForm.meeting_time} onChange={e => setMeetingField('meeting_time', e.target.value)} />
            </div>
          </div>

          {meetingTmplForm.cadence === 'weekly' && (
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Day of Week</label>
              <select value={meetingTmplForm.day_of_week} onChange={e => setMeetingField('day_of_week', e.target.value)}>
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}

          {(meetingTmplForm.cadence === 'monthly' || meetingTmplForm.cadence === 'quarterly' || meetingTmplForm.cadence === 'yearly') && (
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>Day of Month</label>
              <input type="number" min="1" max="28" value={meetingTmplForm.day_of_month} onChange={e => setMeetingField('day_of_month', e.target.value)} />
            </div>
          )}

          <div className="modal-actions">
            <button type="submit" className="btn btn--primary" disabled={meetingTmplSaving}>
              {meetingTmplSaving ? 'Saving...' : editingMeetingTmpl ? 'Save Changes' : 'Create Template'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setMeetingTmplModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
