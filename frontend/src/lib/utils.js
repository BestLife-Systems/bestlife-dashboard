// ── Shared utility functions ─────────────────────────────────────
// Centralized helpers used across multiple pages.
// Import what you need:  import { formatDate, isOverdue } from '../lib/utils'

// ── Date formatting ──────────────────────────────────────────────

/** "Mar 5"  — month + day */
export function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Thu, Mar 5"  — weekday + month + day */
export function formatDateWeekday(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Mar 5, 2025"  — month + day + year */
export function formatDateFull(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Mar 5, 2:30 PM"  — month + day + time (for timestamps, not date-only strings) */
export function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** "3m ago", "2h ago", "Mar 5" — human-friendly relative time */
export function relativeTime(isoStr) {
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

// ── Date checks ──────────────────────────────────────────────────

/** Is the given date-string before today? (Skips done/skipped tasks) */
export function isOverdue(dateStr, status) {
  if (!dateStr || status === 'done' || status === 'skipped') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dateStr + 'T00:00:00') < today
}

/** Is the given date-string today? */
export function isToday(dateStr) {
  if (!dateStr) return false
  const today = new Date()
  const d = new Date(dateStr + 'T00:00:00')
  return d.toDateString() === today.toDateString()
}

/** Is the given date-string within the next 7 days? */
export function isThisWeek(dateStr) {
  if (!dateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  const diff = (d - today) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff < 7
}

/** Today as "YYYY-MM-DD" */
export function todayStr() {
  return new Date().toISOString().split('T')[0]
}
