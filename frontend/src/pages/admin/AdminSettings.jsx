import { useState, useEffect } from 'react'
import { apiUpload, apiGet, apiPost, apiPatch } from '../../lib/api'
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

const ChevronIcon = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

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

  // Collapse states
  const [taskTmplOpen, setTaskTmplOpen] = useState(false)
  const [meetingTmplOpen, setMeetingTmplOpen] = useState(false)
  const [schedulerOpen, setSchedulerOpen] = useState(false)

  // AI status
  const [aiConfigured, setAiConfigured] = useState(null)

  // Scheduler
  const [schedulerStatus, setSchedulerStatus] = useState(null)
  const [schedulerLoading, setSchedulerLoading] = useState(false)
  const [schedulerError, setSchedulerError] = useState(null)
  const [cadenceWindowDays, setCadenceWindowDays] = useState(2)
  const [cadenceDeadlineDays, setCadenceDeadlineDays] = useState(4)
  const [cadenceSaving, setCadenceSaving] = useState(false)
  const [cadenceSaved, setCadenceSaved] = useState(false)

  useEffect(() => {
    apiGet('/settings/last-upload').then(setLastUpload).catch(() => {})
    apiGet('/ai/status').then(r => setAiConfigured(r.configured)).catch(() => setAiConfigured(false))
    loadTaskTemplates()
    loadMeetingTemplates()
    loadSchedulerStatus()
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

  // ── Scheduler ──

  async function loadSchedulerStatus() {
    setSchedulerLoading(true)
    try {
      const data = await apiGet('/scheduler/status')
      setSchedulerStatus(data)
      if (data.cadence_config) {
        setCadenceWindowDays(data.cadence_config.window_open_days)
        setCadenceDeadlineDays(data.cadence_config.deadline_days)
      }
      setSchedulerError(null)
    } catch (err) {
      setSchedulerError('Could not load scheduler status: ' + err.message)
    } finally {
      setSchedulerLoading(false)
    }
  }

  async function handleSaveCadence() {
    setCadenceSaving(true)
    setCadenceSaved(false)
    try {
      await apiPatch('/scheduler/cadence', {
        window_open_days: cadenceWindowDays,
        deadline_days: cadenceDeadlineDays,
      })
      setCadenceSaved(true)
      setTimeout(() => setCadenceSaved(false), 3000)
      loadSchedulerStatus()
    } catch (err) {
      setSchedulerError('Failed to save cadence: ' + err.message)
    } finally {
      setCadenceSaving(false)
    }
  }

  const ACTION_LABELS = {
    open: 'Open & Notify',
    remind_3: '3-Day Reminder',
    remind_1: '1-Day Reminder',
    due_today: 'Due Today Alert',
    admin_summary: 'Admin Summary',
  }

  const ACTION_COLORS = {
    open: '#0082b4',
    remind_3: '#e67e22',
    remind_1: '#e67e22',
    due_today: '#e74c3c',
    admin_summary: '#8b5cf6',
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Settings</h2>
      </div>

      {/* ── Task Templates (collapsible) ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setTaskTmplOpen(o => !o)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ChevronIcon open={taskTmplOpen} />
            <h3 className="card-title" style={{ margin: 0 }}>Task Templates</h3>
            <span className="badge badge--muted" style={{ fontSize: '0.7rem' }}>{taskTemplates.length}</span>
          </div>
          <button className="btn btn--primary btn--small" onClick={e => { e.stopPropagation(); openNewTaskTmpl() }}>+ New</button>
        </div>
        {taskTmplOpen && (
          <div style={{ marginTop: '0.75rem' }}>
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
        )}
      </div>

      {/* ── Meeting Templates (collapsible) ── */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setMeetingTmplOpen(o => !o)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ChevronIcon open={meetingTmplOpen} />
            <h3 className="card-title" style={{ margin: 0 }}>Meeting Templates</h3>
            <span className="badge badge--muted" style={{ fontSize: '0.7rem' }}>{meetingTemplates.length}</span>
          </div>
          <button className="btn btn--primary btn--small" onClick={e => { e.stopPropagation(); openNewMeetingTmpl() }}>+ New</button>
        </div>
        {meetingTmplOpen && (
          <div style={{ marginTop: '0.75rem' }}>
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
        )}
      </div>

      {/* ── Invoice Scheduler (collapsible) ── */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setSchedulerOpen(o => !o)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ChevronIcon open={schedulerOpen} />
            <h3 className="card-title" style={{ margin: 0 }}>Invoice Scheduler</h3>
            {schedulerStatus && (
              <span className={`badge ${schedulerStatus.scheduler_running ? 'badge--success' : 'badge--danger'}`} style={{ fontSize: '0.7rem' }}>
                {schedulerStatus.scheduler_running ? 'Running' : 'Stopped'}
              </span>
            )}
          </div>
        </div>
        {schedulerOpen && (
          <div style={{ marginTop: '0.75rem' }}>
            <p className="card-description" style={{ marginBottom: '0.75rem' }}>
              Automated pay period management — creates periods, sends reminders, and notifies admin on the configured cadence.
            </p>
            {schedulerError && <div className="form-error" style={{ marginBottom: '0.5rem' }}>{schedulerError}</div>}
            {schedulerLoading ? (
              <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</div>
            ) : schedulerStatus ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Status + Config */}
                <div className="settings-info">
                  <div className="settings-info-row">
                    <span className="settings-info-label">Daily Run Time</span>
                    <span className="settings-info-value">{schedulerStatus.scheduler_hour}:00 AM ET</span>
                  </div>
                  <div className="settings-info-row">
                    <span className="settings-info-label">Last Run</span>
                    <span className="settings-info-value">{schedulerStatus.last_run_date || 'Not yet (waiting for first run)'}</span>
                  </div>
                  <div className="settings-info-row">
                    <span className="settings-info-label">SMS Notifications</span>
                    <span className="settings-info-value">
                      {schedulerStatus.sms_enabled ? (
                        <span className="badge badge--success" style={{ fontSize: '0.7rem' }}>Enabled</span>
                      ) : (
                        <span className="badge badge--muted" style={{ fontSize: '0.7rem' }}>Disabled</span>
                      )}
                    </span>
                  </div>
                  <div className="settings-info-row">
                    <span className="settings-info-label">App URL</span>
                    <span className="settings-info-value" style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>{schedulerStatus.app_url}</span>
                  </div>
                  <div className="settings-info-row">
                    <span className="settings-info-label">Today (ET)</span>
                    <span className="settings-info-value">{schedulerStatus.today}</span>
                  </div>
                </div>

                {/* Submission Window Config */}
                <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-bright)', marginBottom: '0.5rem' }}>Submission Window</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      <span>Opens</span>
                      <input
                        type="number" min="1" max="7"
                        value={cadenceWindowDays}
                        onChange={e => setCadenceWindowDays(parseInt(e.target.value) || 2)}
                        style={{ width: '50px', padding: '0.3rem 0.4rem', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-bright)', textAlign: 'center' }}
                      />
                      <span>days before period ends</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      <span>Deadline</span>
                      <input
                        type="number" min="2" max="10"
                        value={cadenceDeadlineDays}
                        onChange={e => setCadenceDeadlineDays(parseInt(e.target.value) || 4)}
                        style={{ width: '50px', padding: '0.3rem 0.4rem', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-bright)', textAlign: 'center' }}
                      />
                      <span>days after period ends</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button className="btn btn--primary btn--small" onClick={handleSaveCadence} disabled={cadenceSaving}>
                        {cadenceSaving ? 'Saving...' : 'Save'}
                      </button>
                      {cadenceSaved && <span style={{ fontSize: '0.78rem', color: '#16a34a' }}>Saved</span>}
                    </div>
                  </div>
                </div>

                {/* Current & Recent Periods */}
                {schedulerStatus.recent_periods && schedulerStatus.recent_periods.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-bright)', marginBottom: '0.5rem' }}>Current & Recent Periods</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {schedulerStatus.recent_periods.map((p, i) => (
                        <div key={i} className="card" style={{ padding: '0.5rem 0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-bright)' }}>{p.label || `${p.start_date} – ${p.end_date}`}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span className={`badge ${p.status === 'open' ? 'badge--success' : p.status === 'closed' ? 'badge--muted' : 'badge--muted'}`} style={{ fontSize: '0.68rem' }}>
                                {p.status}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Due: {p.due_date}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming Cadence */}
                {schedulerStatus.cadence_preview && schedulerStatus.cadence_preview.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-bright)', marginBottom: '0.5rem' }}>Upcoming Cadence</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {schedulerStatus.cadence_preview.map((p, i) => (
                        <div key={i} className="card" style={{ padding: '0.6rem 0.75rem' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-bright)', marginBottom: '0.35rem' }}>{p.label}</div>
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                            <span>Window: {p.window_open}</span>
                            <span>Deadline: {p.deadline}</span>
                            <span>Pay: {p.pay_date}</span>
                          </div>
                          {Object.keys(p.actions).length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {Object.entries(p.actions).map(([dateStr, acts]) => (
                                acts.map((act, j) => (
                                  <span key={`${dateStr}-${j}`} style={{
                                    display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 500,
                                    background: (ACTION_COLORS[act] || '#888') + '18', color: ACTION_COLORS[act] || '#888', border: `1px solid ${(ACTION_COLORS[act] || '#888')}30`,
                                  }}>
                                    {dateStr.slice(5)} — {ACTION_LABELS[act] || act}
                                  </span>
                                ))
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
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
          {/* Anthropic Claude */}
          <div className="card" style={{ padding: '0.875rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, #d4a574, #c08b5c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-bright)' }}>AI Assistant (Betty)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Anthropic Claude Sonnet · Powers Ask Betty & KB Assist</div>
                </div>
              </div>
              {aiConfigured === true ? (
                <span className="badge badge--success">Connected</span>
              ) : aiConfigured === false ? (
                <span className="badge badge--danger">Not Configured</span>
              ) : (
                <span className="badge badge--muted">Checking...</span>
              )}
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
