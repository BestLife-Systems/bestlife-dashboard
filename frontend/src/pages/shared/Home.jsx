import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import { fetchMyInstances } from '../../lib/tasksApi'
import { supabase } from '../../lib/supabase'

// Brain icon component
function BrainIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  )
}

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

// Weather condition code → icon + label
function weatherInfo(code) {
  if (code <= 0) return { icon: '☀️', label: 'Clear' }
  if (code <= 3) return { icon: '⛅', label: 'Partly Cloudy' }
  if (code <= 48) return { icon: '🌫️', label: 'Foggy' }
  if (code <= 57) return { icon: '🌦️', label: 'Drizzle' }
  if (code <= 67) return { icon: '🌧️', label: 'Rain' }
  if (code <= 77) return { icon: '🌨️', label: 'Snow' }
  if (code <= 82) return { icon: '🌧️', label: 'Showers' }
  if (code <= 86) return { icon: '🌨️', label: 'Snow Showers' }
  if (code <= 99) return { icon: '⛈️', label: 'Thunderstorm' }
  return { icon: '🌤️', label: 'Fair' }
}

export default function Home() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [kbSearch, setKbSearch] = useState('')
  const [weather, setWeather] = useState(null)
  const verb = useLoadingVerb(loadingTasks)

  const firstName = profile?.first_name || 'there'

  // Greeting based on time of day
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    loadTasks()
    loadWeather()
  }, [])

  async function loadTasks() {
    setLoadingTasks(true)
    try {
      const data = await fetchMyInstances()
      // Filter to non-done, sort by due_date, take first 10
      const upcoming = (data || [])
        .filter(t => t.status !== 'done' && t.status !== 'skipped')
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
        .slice(0, 10)
      setTasks(upcoming)
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }

  async function loadWeather() {
    try {
      // Default: Phoenix, AZ area — override via geolocation if available
      let lat = 33.45, lon = -112.07, city = 'Phoenix'
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
          )
          lat = pos.coords.latitude
          lon = pos.coords.longitude
          // Reverse-geocode city name
          try {
            const geoRes = await fetch(
              `https://geocoding-api.open-meteo.com/v1/search?name=_&count=1&latitude=${lat}&longitude=${lon}`
            )
            // Use a simpler reverse lookup via nominatim-style approach
            // Actually Open-Meteo doesn't have reverse geocoding. We'll use the timezone as a rough label.
          } catch {}
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

  function handleKbSearch(e) {
    e.preventDefault()
    navigate(`/knowledge-base${kbSearch.trim() ? `?q=${encodeURIComponent(kbSearch.trim())}` : ''}`)
  }

  return (
    <div>
      {/* Header */}
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
                <span className="weather-meta">💧 {weather.humidity}%  ·  💨 {weather.wind} mph</span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Widget grid */}
      <div className="home-widgets">

        {/* ── Widget 1: My Upcoming Tasks ── */}
        <div className="card home-widget">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="card-title" style={{ margin: 0 }}>
              <span style={{ marginRight: '0.375rem' }}>✅</span> My Upcoming Tasks
            </div>
            <button className="btn btn--ghost btn--small" onClick={() => navigate('/my-work')}>
              View all →
            </button>
          </div>

          {loadingTasks ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.5rem 0', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <div className="loading-spinner loading-spinner--small" />
              {verb}…
            </div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              🎉 You're all caught up — no pending tasks!
            </div>
          ) : (
            <div className="home-task-list">
              {tasks.map(task => (
                <div
                  key={task.id}
                  className="home-task-item"
                  onClick={() => navigate('/my-work')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    <span className={`task-priority task-priority--${task.priority}`}>
                      {task.priority === 'high' ? '!' : task.priority === 'medium' ? '–' : '·'}
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
                    {isOverdue(task.due_date, task.status) && '⚠ '}
                    {isToday(task.due_date) ? 'Today' : formatDate(task.due_date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Widget 2: Knowledge Base Search ── */}
        <div className="card home-widget">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ color: 'var(--accent)', flexShrink: 0 }}>
              <BrainIcon size={28} color="var(--accent)" />
            </div>
            <div className="card-title" style={{ margin: 0 }}>Knowledge Base</div>
          </div>

          <form onSubmit={handleKbSearch}>
            <div className="kb-search" style={{ margin: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search articles…"
                value={kbSearch}
                onChange={e => setKbSearch(e.target.value)}
                className="kb-search-input"
              />
              <button type="submit" className="btn btn--primary btn--small">Search</button>
            </div>
          </form>

          <div style={{ marginTop: '0.75rem' }}>
            <button
              className="btn btn--ghost btn--small"
              onClick={() => navigate('/knowledge-base')}
              style={{ width: '100%' }}
            >
              Browse all articles →
            </button>
          </div>
        </div>

        {/* ── Widget 3: Announcements ── */}
        <div className="card home-widget">
          <div className="card-title">
            <span style={{ marginRight: '0.375rem' }}>📢</span> Announcements
          </div>

          <div className="home-announcement">
            <div className="home-announcement-dot" />
            <div>
              <div style={{ fontWeight: 500, color: 'var(--text-bright)', fontSize: '0.875rem', marginBottom: '0.125rem' }}>
                BestLife Hub v2 is live!
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                New features: recurring tasks, My Work board, Knowledge Base search, and Ask Betty. Explore the sidebar to check them out.
              </div>
            </div>
          </div>

          <div className="home-announcement">
            <div className="home-announcement-dot" style={{ background: 'var(--text-muted)', opacity: 0.4 }} />
            <div>
              <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: '0.875rem', marginBottom: '0.125rem' }}>
                More announcements coming soon
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                This section will display team updates, reminders, and practice-wide news.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
