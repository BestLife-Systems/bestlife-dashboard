import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import { fetchMyInstances, updateInstanceStatus } from '../../lib/tasksApi'
import { fetchMeetingInstances, generateMeetings } from '../../lib/meetingsApi'
import { supabase } from '../../lib/supabase'
import AskBetty from '../../components/AskBetty'

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

// Weather condition code to icon + label
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

// ── Add Win Modal ────────────────────────────────────────────────

function AddWinModal({ profile, onClose, onSaved }) {
  const [category, setCategory] = useState('business')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!body.trim()) return
    setSaving(true)
    try {
      await supabase.from('wins').insert({
        user_id: profile.id,
        category,
        body: body.trim(),
      })
      onSaved()
      onClose()
    } catch (err) {
      console.error('Failed to save win:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="win-modal-overlay" onClick={onClose}>
      <div className="win-modal" onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 1rem', color: 'var(--text-bright)', fontSize: '1.1rem' }}>Add a Win</h3>

        <div className="win-category-toggle">
          <button
            className={`win-cat-btn ${category === 'business' ? 'win-cat-btn--active win-cat-btn--business' : ''}`}
            onClick={() => setCategory('business')}
          >
            Business
          </button>
          <button
            className={`win-cat-btn ${category === 'personal' ? 'win-cat-btn--active win-cat-btn--personal' : ''}`}
            onClick={() => setCategory('personal')}
          >
            Personal
          </button>
        </div>

        <textarea
          className="win-textarea"
          placeholder="What's the win?"
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          autoFocus
        />

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn btn--ghost btn--small" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary btn--small" onClick={handleSave} disabled={saving || !body.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
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
  const [showWinModal, setShowWinModal] = useState(false)
  const [showAllWins, setShowAllWins] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [birthdayAnnouncements, setBirthdayAnnouncements] = useState([])
  const [undoTask, setUndoTask] = useState(null) // { task, timerId }
  const undoTimerRef = useRef(null)

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
        .filter(t => !t.due_date || t.due_date <= sevenDaysStr) // next 7 days + overdue
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
      setTasks(upcoming)
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }

  // ── Task completion with undo ──

  const handleCompleteTask = useCallback(async (task) => {
    // Optimistically remove from list
    setTasks(prev => prev.filter(t => t.id !== task.id))

    // Clear any existing undo timer
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)

    // Set up undo state
    setUndoTask({ task })

    // Auto-commit after 5 seconds
    undoTimerRef.current = setTimeout(async () => {
      try {
        await updateInstanceStatus(task.id, 'done')
      } catch (err) {
        console.error('Failed to complete task:', err)
      }
      setUndoTask(null)
      undoTimerRef.current = null
    }, 5000)
  }, [])

  const handleUndoTask = useCallback(() => {
    if (!undoTask) return
    // Cancel the pending API call
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    // Restore the task to the list
    setTasks(prev => {
      const restored = [...prev, undoTask.task]
      return restored.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    })
    setUndoTask(null)
  }, [undoTask])

  // Cleanup undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    }
  }, [])

  async function loadWins() {
    setLoadingWins(true)
    try {
      const { data, error } = await supabase
        .from('wins')
        .select('*, users(first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      setWins(data || [])
    } catch (err) {
      console.error('Failed to load wins:', err)
      setWins([])
    } finally {
      setLoadingWins(false)
    }
  }

  async function loadMeetings() {
    setLoadingMeetings(true)
    try {
      const data = await fetchMeetingInstances()
      const all = data || []
      // Separate birthdays from regular meetings
      const regular = all.filter(m => !m.title.includes('Birthday')).slice(0, 6)
      setMeetings(regular)
      // Birthdays within the next 30 days go into announcements
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const thirtyDays = new Date(today)
      thirtyDays.setDate(thirtyDays.getDate() + 30)
      const bdays = all
        .filter(m => m.title.includes('Birthday'))
        .filter(m => {
          const d = new Date(m.meeting_date + 'T00:00:00')
          return d >= today && d <= thirtyDays
        })
      setBirthdayAnnouncements(bdays.map(b => ({
        id: 'bday-' + b.id,
        title: b.title,
        body: null,
        category: 'celebration',
        effective_date: b.meeting_date,
        _isBirthday: true,
      })))
    } catch (err) {
      console.error('Failed to load meetings:', err)
      setMeetings([])
      setBirthdayAnnouncements([])
    } finally {
      setLoadingMeetings(false)
    }
  }

  async function loadAnnouncements() {
    setLoadingAnnouncements(true)
    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .lte('effective_date', todayStr)
        .or(`expiration_date.is.null,expiration_date.gte.${todayStr}`)
        .order('effective_date', { ascending: false })
        .limit(10)
      if (error) throw error
      setAnnouncements(data || [])
    } catch (err) {
      console.error('Failed to load announcements:', err)
      setAnnouncements([])
    } finally {
      setLoadingAnnouncements(false)
    }
  }

  async function loadWeather() {
    try {
      let lat = 39.08, lon = -74.82, city = 'Cape May Court House'
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
          )
          lat = pos.coords.latitude
          lon = pos.coords.longitude
          city = ''
        } catch {
          // geolocation denied or timed out — keep defaults
        }
      }

      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
      )
      const data = await res.json()
      if (data.current) {
        setWeather({
          temp: Math.round(data.current.temperature_2m),
          code: data.current.weather_code,
          wind: Math.round(data.current.wind_speed_10m),
          humidity: data.current.relative_humidity_2m,
          city: city || data.timezone?.split('/').pop()?.replace(/_/g, ' ') || '',
        })
      }
    } catch (err) {
      console.error('Weather fetch failed:', err)
    }
  }

  async function handleGenerateMeetings() {
    setGenerating(true)
    try {
      const result = await generateMeetings(120)
      console.log('Meetings generated:', result)
      await loadMeetings()
    } catch (err) {
      console.error('Failed to generate meetings:', err)
    } finally {
      setGenerating(false)
    }
  }

  // ── Render helpers ──

  function renderLoading(msg) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.5rem 0', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <div className="loading-spinner loading-spinner--small" />
        {msg || verb + '\u2026'}
      </div>
    )
  }

  return (
    <div>
      {/* ── Ask Betty (very top) ── */}
      <AskBetty />

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h2 className="page-title">{greeting}, {firstName}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Here's what's on your plate today.
          </p>
        </div>
        {weather && (() => {
          const w = weatherInfo(weather.code)
          return (
            <div className="weather-widget">
              <div className="weather-main">
                <span className="weather-icon">{w.icon}</span>
                <span className="weather-temp">{weather.temp}°F</span>
              </div>
              <div className="weather-details">
                <span className="weather-label">{w.label}</span>
                {weather.city && <span className="weather-city">{weather.city}</span>}
                <span className="weather-meta">{'\uD83D\uDCA7'} {weather.humidity}%  ·  {'\uD83D\uDCA8'} {weather.wind} mph</span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Widgets ── */}
      <div className="home-widgets">

        {/* ═══ 1. WINS (full width) ═══ */}
        <div className="card home-widget">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="card-title" style={{ margin: 0 }}>
              <span style={{ marginRight: '0.375rem' }}>🏆</span> Wins
            </div>
            <button className="btn btn--primary btn--small" onClick={() => setShowWinModal(true)}>
              + Add a Win
            </button>
          </div>

          {loadingWins ? renderLoading() : wins.length === 0 ? (
            <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No wins yet — be the first to share one!
            </div>
          ) : (
            <>
              <div className="home-wins-feed">
                {wins.slice(0, showAllWins ? wins.length : 4).map(win => (
                  <div key={win.id} className={`home-win-bar home-win-bar--${win.category}`}>
                    <div className="home-win-bar-text">{win.body}</div>
                    <div className="home-win-bar-meta">
                      {win.users ? `${win.users.first_name} ${win.users.last_name}` : ''}
                      {' · '}
                      {relativeTime(win.created_at)}
                    </div>
                  </div>
                ))}
              </div>
              {wins.length > 4 && !showAllWins && (
                <button
                  className="btn btn--ghost btn--small"
                  onClick={() => setShowAllWins(true)}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  View all {wins.length} wins →
                </button>
              )}
              {showAllWins && wins.length > 4 && (
                <button
                  className="btn btn--ghost btn--small"
                  onClick={() => setShowAllWins(false)}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  Show less
                </button>
              )}
            </>
          )}
        </div>

        {/* ═══ 2. TASKS + MEETINGS (two columns) ═══ */}
        <div className="home-two-col">

          {/* ── Tasks ── */}
          <div className="card home-widget">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="card-title" style={{ margin: 0 }}>
                <span style={{ marginRight: '0.375rem' }}>✅</span> My Tasks
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>Next 7 days</span>
              </div>
              <button className="btn btn--ghost btn--small" onClick={() => navigate('/my-work')}>
                View all →
              </button>
            </div>

            {loadingTasks ? renderLoading() : tasks.length === 0 ? (
              <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                🎉 You're all caught up — no pending tasks!
              </div>
            ) : (
              <div className="home-task-list">
                {tasks.map(task => (
                  <div
                    key={task.id}
                    className="home-task-item"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                      <span className={`task-priority task-priority--${task.priority}`}>
                        {task.priority === 'high' ? '!' : task.priority === 'medium' ? '\u2013' : '\u00B7'}
                      </span>
                      <span className="home-task-title">{task.title}</span>
                    </div>
                    <span
                      className="home-task-due"
                      style={{
                        color: isOverdue(task.due_date, task.status)
                          ? 'var(--danger)'
                          : isToday(task.due_date)
                            ? 'var(--accent)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {isOverdue(task.due_date, task.status) && '\u26A0 '}
                      {isToday(task.due_date) ? 'Today' : formatDate(task.due_date)}
                    </span>
                    <button
                      className="home-task-check"
                      onClick={(e) => { e.stopPropagation(); handleCompleteTask(task) }}
                      title="Mark as done"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Meetings ── */}
          <div className="card home-widget">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="card-title" style={{ margin: 0 }}>
                <span style={{ marginRight: '0.375rem' }}>📅</span> Upcoming Meetings
              </div>
              {isAdmin && (
                <button
                  className="btn btn--ghost btn--small"
                  onClick={handleGenerateMeetings}
                  disabled={generating}
                  title="Generate meeting instances for the next 120 days"
                >
                  {generating ? 'Generating...' : '⚙ Generate'}
                </button>
              )}
            </div>

            {loadingMeetings ? renderLoading() : meetings.length === 0 ? (
              <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No upcoming meetings scheduled.
              </div>
            ) : (
              <div className="home-meetings-list">
                {meetings.map(mtg => (
                  <div
                    key={mtg.id}
                    className={`home-meeting-item ${isToday(mtg.meeting_date) ? 'home-meeting-item--today' : isThisWeek(mtg.meeting_date) ? 'home-meeting-item--week' : ''}`}
                  >
                    <span className="home-meeting-date">
                      {isToday(mtg.meeting_date) ? 'Today' : formatDate(mtg.meeting_date)}
                    </span>
                    <span className="home-meeting-title">{mtg.title}</span>
                    {mtg.meeting_time && (
                      <span className="home-meeting-time">{mtg.meeting_time}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ 3. ANNOUNCEMENTS (full width) ═══ */}
        <div className="card home-widget">
          <div className="card-title" style={{ marginBottom: '1rem' }}>
            <span style={{ marginRight: '0.375rem' }}>📢</span> Announcements
          </div>

          {(() => {
            // Merge real announcements + upcoming birthdays, sorted by date
            const allAnn = [...announcements, ...birthdayAnnouncements]
              .sort((a, b) => (a.effective_date || '').localeCompare(b.effective_date || ''))
            if (loadingAnnouncements && loadingMeetings) return renderLoading()
            if (allAnn.length === 0) return (
              <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No announcements right now.
              </div>
            )
            return (
              <div>
                {allAnn.map(ann => (
                  <div key={ann.id} className="home-announcement">
                    <span
                      className="home-announcement-badge"
                      style={{ background: ANNOUNCEMENT_COLORS[ann.category] || ANNOUNCEMENT_COLORS.general }}
                    >
                      {ann.category}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-bright)', fontSize: '0.875rem', marginBottom: '0.125rem' }}>
                        {ann.title}
                      </div>
                      {ann.body && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {ann.body.length > 200 ? ann.body.slice(0, 200) + '\u2026' : ann.body}
                        </div>
                      )}
                    </div>
                    <span className="home-announcement-date">
                      {formatDate(ann.effective_date)}
                    </span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

      </div>

      {/* ── Undo Toast ── */}
      {undoTask && (
        <div className="undo-toast">
          <span>Completed "<strong>{undoTask.task.title}</strong>"</span>
          <button className="undo-toast-btn" onClick={handleUndoTask}>Undo</button>
        </div>
      )}

      {/* ── Win Modal ── */}
      {showWinModal && (
        <AddWinModal
          profile={profile}
          onClose={() => setShowWinModal(false)}
          onSaved={loadWins}
        />
      )}
    </div>
  )
}
