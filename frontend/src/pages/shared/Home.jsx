import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import { fetchMyInstances, updateInstanceStatus } from '../../lib/tasksApi'
import { fetchMeetingInstances, deleteMeetingInstance } from '../../lib/meetingsApi'
import { fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../lib/announcementsApi'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/Modal'

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isOverdue(dateStr, status) {
  if (!dateStr || status === 'done' || status === 'skipped') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dateStr + 'T00:00:00') < today
}

function isToday(dateStr) {
  if (!dateStr) return false
  const today = new Date()
  const d = new Date(dateStr + 'T00:00:00')
  return d.toDateString() === today.toDateString()
}

function isThisWeek(dateStr) {
  if (!dateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  const diff = (d - today) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff < 7
}

function relativeTime(isoStr) {
  if (!isoStr) return ''
  const now = new Date()
  const d = new Date(isoStr)
  const diffMs = now - d
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function weatherInfo(code) {
  if (code <= 0) return { icon: '\u2600\uFE0F', label: 'Clear' }
  if (code <= 3) return { icon: '\u26C5', label: 'Partly Cloudy' }
  if (code <= 48) return { icon: '\uD83C\uDF2B\uFE0F', label: 'Foggy' }
  if (code <= 57) return { icon: '\uD83C\uDF26\uFE0F', label: 'Drizzle' }
  if (code <= 67) return { icon: '\uD83C\uDF27\uFE0F', label: 'Rain' }
  if (code <= 77) return { icon: '\uD83C\uDF28\uFE0F', label: 'Snow' }
  if (code <= 82) return { icon: '\uD83C\uDF27\uFE0F', label: 'Showers' }
  if (code <= 86) return { icon: '\uD83C\uDF28\uFE0F', label: 'Snow Showers' }
  if (code <= 99) return { icon: '\u26C8\uFE0F', label: 'Thunderstorm' }
  return { icon: '\uD83C\uDF24\uFE0F', label: 'Fair' }
}

const ANNOUNCEMENT_COLORS = {
  policy: '#60a5fa',
  celebration: '#fbbf24',
  outing: '#22c55e',
  general: 'var(--text-muted)',
}

const ANN_CATEGORIES = ['general', 'policy', 'celebration', 'outing']

// ── Inline icon components ──

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ── Section Header with action buttons ──────────────────────────

function SectionHeader({ icon, title, subtitle, showButtons, onAdd, onEdit, onRemove, editLabel, removeLabel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
      <div className="card-title" style={{ margin: 0 }}>
        <span style={{ marginRight: '0.375rem' }}>{icon}</span> {title}
        {subtitle && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>{subtitle}</span>}
      </div>
      {showButtons && (
        <div className="home-section-actions">
          {onAdd && <button className="btn btn--primary btn--small home-action-btn" onClick={onAdd}>+ Add</button>}
          {onEdit && <button className="btn btn--primary btn--small home-action-btn" onClick={onEdit}>{editLabel || 'Edit'}</button>}
          {onRemove && <button className="btn btn--primary btn--small home-action-btn" onClick={onRemove}>{removeLabel || '- Remove'}</button>}
        </div>
      )}
    </div>
  )
}

// ── Main Home Component ──────────────────────────────────────────

export default function Home() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()

  // State
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [wins, setWins] = useState([])
  const [loadingWins, setLoadingWins] = useState(true)
  const [meetings, setMeetings] = useState([])
  const [loadingMeetings, setLoadingMeetings] = useState(true)
  const [announcements, setAnnouncements] = useState([])
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true)
  const [weather, setWeather] = useState(null)
  const [showAllWins, setShowAllWins] = useState(false)
  const [birthdayAnnouncements, setBirthdayAnnouncements] = useState([])
  const [undoTask, setUndoTask] = useState(null)
  const undoTimerRef = useRef(null)

  // Modal / toggle states
  const [winModal, setWinModal] = useState({ open: false, editing: null })
  const [winForm, setWinForm] = useState({ category: 'business', body: '' })
  const [winSaving, setWinSaving] = useState(false)
  const [winEditMode, setWinEditMode] = useState(false)
  const [winRemoveMode, setWinRemoveMode] = useState(false)

  const [meetingModal, setMeetingModal] = useState({ open: false, editing: null })
  const [meetingForm, setMeetingForm] = useState({ title: '', meeting_date: todayStr(), meeting_time: '' })
  const [meetingSaving, setMeetingSaving] = useState(false)
  const [meetingEditMode, setMeetingEditMode] = useState(false)
  const [meetingRemoveMode, setMeetingRemoveMode] = useState(false)

  const [annModal, setAnnModal] = useState({ open: false, editing: null })
  const [annForm, setAnnForm] = useState({ title: '', body: '', category: 'general', effective_date: todayStr(), expiration_date: '' })
  const [annSaving, setAnnSaving] = useState(false)
  const [annEditMode, setAnnEditMode] = useState(false)
  const [annRemoveMode, setAnnRemoveMode] = useState(false)

  const verb = useLoadingVerb(loadingTasks || loadingWins || loadingMeetings)
  const firstName = profile?.first_name || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    loadTasks()
    loadWins()
    loadMeetings()
    loadAnnouncements()
    loadWeather()
  }, [])

  // ── Data loaders ──

  async function loadTasks() {
    setLoadingTasks(true)
    try {
      const data = await fetchMyInstances()
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const sevenDays = new Date(today)
      sevenDays.setDate(sevenDays.getDate() + 7)
      const sevenDaysStr = sevenDays.toISOString().split('T')[0]
      const upcoming = (data || [])
        .filter(t => t.status !== 'done' && t.status !== 'skipped')
        .filter(t => !t.due_date || t.due_date <= sevenDaysStr)
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
      // Deduplicate by title + due_date
      const seen = new Set()
      const deduped = upcoming.filter(t => {
        const key = `${t.title}|${t.due_date}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setTasks(deduped)
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }

  const handleCompleteTask = useCallback(async (task) => {
    setTasks(prev => prev.filter(t => t.id !== task.id))
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoTask({ task })
    undoTimerRef.current = setTimeout(async () => {
      try { await updateInstanceStatus(task.id, 'done') } catch {}
      setUndoTask(null)
      undoTimerRef.current = null
    }, 5000)
  }, [])

  const handleUndoTask = useCallback(() => {
    if (!undoTask) return
    if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null }
    setTasks(prev => [...prev, undoTask.task].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')))
    setUndoTask(null)
  }, [undoTask])

  useEffect(() => { return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) } }, [])

  async function loadWins() {
    setLoadingWins(true)
    try {
      const { data, error } = await supabase.from('wins').select('*, users(first_name, last_name)').order('created_at', { ascending: false }).limit(20)
      if (error) throw error
      setWins(data || [])
    } catch (err) { console.error('Failed to load wins:', err); setWins([]) } finally { setLoadingWins(false) }
  }

  async function loadMeetings() {
    setLoadingMeetings(true)
    try {
      const data = await fetchMeetingInstances()
      const all = data || []
      setMeetings(all.filter(m => !m.title.includes('Birthday')).slice(0, 6))
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const thirtyDays = new Date(today); thirtyDays.setDate(thirtyDays.getDate() + 30)
      setBirthdayAnnouncements(
        all.filter(m => m.title.includes('Birthday')).filter(m => { const d = new Date(m.meeting_date + 'T00:00:00'); return d >= today && d <= thirtyDays })
          .map(b => ({ id: 'bday-' + b.id, title: b.title, body: null, category: 'celebration', effective_date: b.meeting_date, _isBirthday: true }))
      )
    } catch (err) { console.error('Failed to load meetings:', err); setMeetings([]); setBirthdayAnnouncements([]) } finally { setLoadingMeetings(false) }
  }

  async function loadAnnouncements() {
    setLoadingAnnouncements(true)
    try { const data = await fetchAnnouncements(); setAnnouncements(data || []) }
    catch (err) { console.error('Failed to load announcements:', err); setAnnouncements([]) }
    finally { setLoadingAnnouncements(false) }
  }

  async function loadWeather() {
    try {
      let lat = 39.08, lon = -74.82, city = 'Cape May Court House'
      if (navigator.geolocation) { try { const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 })); lat = pos.coords.latitude; lon = pos.coords.longitude; city = '' } catch {} }
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`)
      const data = await res.json()
      if (data.current) setWeather({ temp: Math.round(data.current.temperature_2m), code: data.current.weather_code, wind: Math.round(data.current.wind_speed_10m), humidity: data.current.relative_humidity_2m, city: city || data.timezone?.split('/').pop()?.replace(/_/g, ' ') || '' })
    } catch {}
  }

  // ── Win handlers ──
  function openAddWin() { setWinForm({ category: 'business', body: '' }); setWinModal({ open: true, editing: null }) }
  function openEditWin(win) { setWinForm({ category: win.category, body: win.body }); setWinModal({ open: true, editing: win }); setWinEditMode(false) }
  async function saveWin() {
    if (!winForm.body.trim()) return
    setWinSaving(true)
    try {
      if (winModal.editing) await supabase.from('wins').update({ category: winForm.category, body: winForm.body.trim() }).eq('id', winModal.editing.id)
      else await supabase.from('wins').insert({ user_id: profile.id, category: winForm.category, body: winForm.body.trim() })
      setWinModal({ open: false, editing: null }); loadWins()
    } catch (err) { console.error('Failed to save win:', err) } finally { setWinSaving(false) }
  }
  async function removeWin(win) { try { await supabase.from('wins').delete().eq('id', win.id); loadWins() } catch (err) { console.error(err) } }

  // ── Meeting handlers ──
  function openAddMeeting() { setMeetingForm({ title: '', meeting_date: todayStr(), meeting_time: '' }); setMeetingModal({ open: true, editing: null }) }
  function openEditMeeting(mtg) { setMeetingForm({ title: mtg.title || '', meeting_date: mtg.meeting_date || todayStr(), meeting_time: mtg.meeting_time || '' }); setMeetingModal({ open: true, editing: mtg }); setMeetingEditMode(false) }
  async function saveMeeting() {
    if (!meetingForm.title.trim()) return
    setMeetingSaving(true)
    try {
      if (meetingModal.editing) await supabase.from('meeting_instances').update({ title: meetingForm.title.trim(), meeting_date: meetingForm.meeting_date, meeting_time: meetingForm.meeting_time || null }).eq('id', meetingModal.editing.id)
      else await supabase.from('meeting_instances').insert({ title: meetingForm.title.trim(), meeting_date: meetingForm.meeting_date, meeting_time: meetingForm.meeting_time || null })
      setMeetingModal({ open: false, editing: null }); loadMeetings()
    } catch (err) { console.error('Failed to save meeting:', err) } finally { setMeetingSaving(false) }
  }
  async function removeMeeting(mtg) { try { await deleteMeetingInstance(mtg.id); loadMeetings() } catch (err) { console.error(err) } }

  // ── Announcement handlers ──
  function openAddAnn() { setAnnForm({ title: '', body: '', category: 'general', effective_date: todayStr(), expiration_date: '' }); setAnnModal({ open: true, editing: null }) }
  function openEditAnn(ann) { setAnnForm({ title: ann.title || '', body: ann.body || '', category: ann.category || 'general', effective_date: ann.effective_date || todayStr(), expiration_date: ann.expiration_date || '' }); setAnnModal({ open: true, editing: ann }); setAnnEditMode(false) }
  async function saveAnn() {
    if (!annForm.title.trim()) return
    setAnnSaving(true)
    try {
      const payload = { title: annForm.title.trim(), body: annForm.body.trim() || null, category: annForm.category, audience_roles: [], effective_date: annForm.effective_date, expiration_date: annForm.expiration_date || null }
      if (annModal.editing) await updateAnnouncement(annModal.editing.id, payload)
      else await createAnnouncement(payload)
      setAnnModal({ open: false, editing: null }); loadAnnouncements()
    } catch (err) { console.error('Failed to save announcement:', err) } finally { setAnnSaving(false) }
  }
  async function removeAnn(ann) { try { await deleteAnnouncement(ann.id); loadAnnouncements() } catch (err) { console.error(err) } }

  // ── Render helpers ──
  function renderLoading(msg) {
    return (<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.5rem 0', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}><div className="loading-spinner loading-spinner--small" />{msg || verb + '\u2026'}</div>)
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h2 className="page-title">{greeting}, {firstName}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>Here's what's on your plate today.</p>
        </div>
        {weather && (() => {
          const w = weatherInfo(weather.code)
          return (
            <div className="weather-widget">
              <div className="weather-main"><span className="weather-icon">{w.icon}</span><span className="weather-temp">{weather.temp}°F</span></div>
              <div className="weather-details">
                <span className="weather-label">{w.label}</span>
                {weather.city && <span className="weather-city">{weather.city}</span>}
                <span className="weather-meta">{'\uD83D\uDCA7'} {weather.humidity}%  ·  {'\uD83D\uDCA8'} {weather.wind} mph</span>
              </div>
            </div>
          )
        })()}
      </div>

      <div className="home-widgets">

        {/* ═══ 1. WINS ═══ */}
        <div className="card home-widget">
          <SectionHeader icon="🏆" title="Wins" showButtons={true}
            onAdd={openAddWin}
            onEdit={isAdmin ? () => setWinEditMode(m => !m) : null}
            onRemove={isAdmin ? () => setWinRemoveMode(m => !m) : null}
            editLabel={winEditMode ? 'Done' : 'Edit'}
            removeLabel={winRemoveMode ? 'Done' : '- Remove'}
          />
          {loadingWins ? renderLoading() : wins.length === 0 ? (
            <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No wins yet — be the first to share one!</div>
          ) : (
            <>
              <div className="home-wins-feed">
                {wins.slice(0, showAllWins ? wins.length : 4).map(win => (
                  <div key={win.id} className={`home-win-bar home-win-bar--${win.category}`} style={{ position: 'relative' }}>
                    <div className="home-win-bar-text" style={{ paddingRight: (winEditMode || winRemoveMode) ? '2rem' : 0 }}>{win.body}</div>
                    <div className="home-win-bar-meta">{win.users ? `${win.users.first_name} ${win.users.last_name}` : ''}{' · '}{relativeTime(win.created_at)}</div>
                    {winEditMode && <button className="home-inline-action home-inline-edit" onClick={() => openEditWin(win)} title="Edit"><PencilIcon /></button>}
                    {winRemoveMode && <button className="home-inline-action home-inline-remove" onClick={() => removeWin(win)} title="Remove"><XIcon /></button>}
                  </div>
                ))}
              </div>
              {wins.length > 4 && !showAllWins && <button className="btn btn--ghost btn--small" onClick={() => setShowAllWins(true)} style={{ width: '100%', marginTop: '0.5rem' }}>View all {wins.length} wins →</button>}
              {showAllWins && wins.length > 4 && <button className="btn btn--ghost btn--small" onClick={() => setShowAllWins(false)} style={{ width: '100%', marginTop: '0.5rem' }}>Show less</button>}
            </>
          )}
        </div>

        {/* ═══ 2. TASKS + MEETINGS ═══ */}
        <div className="home-two-col">

          {/* ── Tasks (no action buttons — managed via Task Management in sidebar) ── */}
          <div className="card home-widget">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="card-title" style={{ margin: 0 }}>
                <span style={{ marginRight: '0.375rem' }}>✅</span> My Tasks
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>Next 7 days</span>
              </div>
              <button className="btn btn--ghost btn--small" onClick={() => navigate('/my-work')}>View all →</button>
            </div>
            {loadingTasks ? renderLoading() : tasks.length === 0 ? (
              <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>You're all caught up — no pending tasks!</div>
            ) : (
              <div className="home-task-list">
                {tasks.map(task => (
                  <div key={task.id} className="home-task-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                      <span className={`task-priority task-priority--${task.priority}`}>{task.priority === 'high' ? '!' : task.priority === 'medium' ? '\u2013' : '\u00B7'}</span>
                      <span className="home-task-title">{task.title}</span>
                    </div>
                    <span className="home-task-due" style={{ color: isOverdue(task.due_date, task.status) ? 'var(--danger)' : isToday(task.due_date) ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {isOverdue(task.due_date, task.status) && '\u26A0 '}{isToday(task.due_date) ? 'Today' : formatDate(task.due_date)}
                    </span>
                    <button className="home-task-check" onClick={(e) => { e.stopPropagation(); handleCompleteTask(task) }} title="Mark as done">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Meetings ── */}
          <div className="card home-widget">
            <SectionHeader icon="📅" title="Upcoming Meetings" showButtons={isAdmin}
              onAdd={openAddMeeting}
              onEdit={() => setMeetingEditMode(m => !m)}
              onRemove={() => setMeetingRemoveMode(m => !m)}
              editLabel={meetingEditMode ? 'Done' : 'Edit'}
              removeLabel={meetingRemoveMode ? 'Done' : '- Remove'}
            />
            {loadingMeetings ? renderLoading() : meetings.length === 0 ? (
              <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No upcoming meetings scheduled.</div>
            ) : (
              <div className="home-meetings-list">
                {meetings.map(mtg => (
                  <div key={mtg.id} className={`home-meeting-item ${isToday(mtg.meeting_date) ? 'home-meeting-item--today' : isThisWeek(mtg.meeting_date) ? 'home-meeting-item--week' : ''}`}>
                    <span className="home-meeting-date">{isToday(mtg.meeting_date) ? 'Today' : formatDate(mtg.meeting_date)}</span>
                    <span className="home-meeting-title">{mtg.title}</span>
                    {mtg.meeting_time && !(meetingEditMode || meetingRemoveMode) && <span className="home-meeting-time">{mtg.meeting_time}</span>}
                    {meetingEditMode && (
                      <button onClick={() => openEditMeeting(mtg)} title="Edit" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--accent-glow)', color: 'var(--accent)', marginLeft: 'auto' }}><PencilIcon /></button>
                    )}
                    {meetingRemoveMode && (
                      <button onClick={() => removeMeeting(mtg)} title="Remove" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--danger-bg)', color: 'var(--danger)', marginLeft: 'auto' }}><XIcon /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ 3. ANNOUNCEMENTS ═══ */}
        <div className="card home-widget">
          <SectionHeader icon="📢" title="Announcements" showButtons={isAdmin}
            onAdd={openAddAnn}
            onEdit={() => setAnnEditMode(m => !m)}
            onRemove={() => setAnnRemoveMode(m => !m)}
            editLabel={annEditMode ? 'Done' : 'Edit'}
            removeLabel={annRemoveMode ? 'Done' : '- Remove'}
          />
          {(() => {
            const allAnn = [...announcements.filter(a => { const td = todayStr(); if (a.effective_date && a.effective_date > td) return false; if (a.expiration_date && a.expiration_date < td) return false; return true }), ...birthdayAnnouncements].sort((a, b) => (a.effective_date || '').localeCompare(b.effective_date || ''))
            if (loadingAnnouncements && loadingMeetings) return renderLoading()
            if (allAnn.length === 0) return <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No announcements right now.</div>
            return (
              <div>
                {allAnn.map(ann => (
                  <div key={ann.id} className="home-announcement">
                    <span className="home-announcement-badge" style={{ background: ANNOUNCEMENT_COLORS[ann.category] || ANNOUNCEMENT_COLORS.general }}>{ann.category}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-bright)', fontSize: '0.875rem', marginBottom: '0.125rem' }}>{ann.title}</div>
                      {ann.body && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{ann.body.length > 200 ? ann.body.slice(0, 200) + '\u2026' : ann.body}</div>}
                    </div>
                    {!(annEditMode || annRemoveMode) && <span className="home-announcement-date">{formatDate(ann.effective_date)}</span>}
                    {annEditMode && !ann._isBirthday && (
                      <button className="home-inline-action-flow home-inline-edit-flow" onClick={() => openEditAnn(ann)} title="Edit"><PencilIcon /></button>
                    )}
                    {annRemoveMode && !ann._isBirthday && (
                      <button className="home-inline-action-flow home-inline-remove-flow" onClick={() => removeAnn(ann)} title="Remove"><XIcon /></button>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

      </div>

      {/* ── Undo Toast ── */}
      {undoTask && <div className="undo-toast"><span>Completed "<strong>{undoTask.task.title}</strong>"</span><button className="undo-toast-btn" onClick={handleUndoTask}>Undo</button></div>}

      {/* ── Win Modal ── */}
      <Modal open={winModal.open} onClose={() => setWinModal({ open: false, editing: null })} title={winModal.editing ? 'Edit Win' : 'Add a Win'}>
        <div className="win-category-toggle">
          <button className={`win-cat-btn ${winForm.category === 'business' ? 'win-cat-btn--active win-cat-btn--business' : ''}`} onClick={() => setWinForm(f => ({ ...f, category: 'business' }))}>Business</button>
          <button className={`win-cat-btn ${winForm.category === 'personal' ? 'win-cat-btn--active win-cat-btn--personal' : ''}`} onClick={() => setWinForm(f => ({ ...f, category: 'personal' }))}>Personal</button>
        </div>
        <textarea className="win-textarea" placeholder="What's the win?" value={winForm.body} onChange={e => setWinForm(f => ({ ...f, body: e.target.value }))} rows={3} autoFocus />
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={saveWin} disabled={winSaving || !winForm.body.trim()}>{winSaving ? 'Saving...' : winModal.editing ? 'Save Changes' : 'Add Win'}</button>
          <button className="btn btn--secondary" onClick={() => setWinModal({ open: false, editing: null })}>Cancel</button>
        </div>
      </Modal>

      {/* ── Meeting Modal ── */}
      <Modal open={meetingModal.open} onClose={() => setMeetingModal({ open: false, editing: null })} title={meetingModal.editing ? 'Edit Meeting' : 'Add Meeting'}>
        <div className="form-field"><label>Title *</label><input value={meetingForm.title} onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Team Standup" autoFocus /></div>
        <div className="form-row" style={{ marginTop: '0.75rem' }}>
          <div className="form-field"><label>Date</label><input type="date" value={meetingForm.meeting_date} onChange={e => setMeetingForm(f => ({ ...f, meeting_date: e.target.value }))} /></div>
          <div className="form-field"><label>Time (optional)</label><input type="time" value={meetingForm.meeting_time} onChange={e => setMeetingForm(f => ({ ...f, meeting_time: e.target.value }))} /></div>
        </div>
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={saveMeeting} disabled={meetingSaving || !meetingForm.title.trim()}>{meetingSaving ? 'Saving...' : meetingModal.editing ? 'Save Changes' : 'Add Meeting'}</button>
          <button className="btn btn--secondary" onClick={() => setMeetingModal({ open: false, editing: null })}>Cancel</button>
        </div>
      </Modal>

      {/* ── Announcement Modal ── */}
      <Modal open={annModal.open} onClose={() => setAnnModal({ open: false, editing: null })} title={annModal.editing ? 'Edit Announcement' : 'Add Announcement'} wide>
        <div className="form-field"><label>Title *</label><input value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Office Closed Friday" autoFocus /></div>
        <div className="form-field" style={{ marginTop: '0.75rem' }}><label>Body</label><textarea value={annForm.body} onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))} placeholder="Optional details..." rows={3} /></div>
        <div className="form-row" style={{ marginTop: '0.75rem' }}>
          <div className="form-field"><label>Category</label><select value={annForm.category} onChange={e => setAnnForm(f => ({ ...f, category: e.target.value }))}>{ANN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="form-field"><label>Effective Date</label><input type="date" value={annForm.effective_date} onChange={e => setAnnForm(f => ({ ...f, effective_date: e.target.value }))} /></div>
          <div className="form-field"><label>Expires (optional)</label><input type="date" value={annForm.expiration_date} onChange={e => setAnnForm(f => ({ ...f, expiration_date: e.target.value }))} /></div>
        </div>
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={saveAnn} disabled={annSaving || !annForm.title.trim()}>{annSaving ? 'Saving...' : annModal.editing ? 'Save Changes' : 'Add Announcement'}</button>
          <button className="btn btn--secondary" onClick={() => setAnnModal({ open: false, editing: null })}>Cancel</button>
        </div>
      </Modal>
    </div>
  )
}
