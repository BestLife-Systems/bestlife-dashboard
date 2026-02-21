import { useState, useEffect } from 'react'
import { fetchMyInstances, updateInstanceStatus } from '../../lib/tasksApi'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'

const COLUMNS = [
  { key: 'backlog',     label: 'Backlog',     color: 'var(--text-muted)' },
  { key: 'in_progress', label: 'In Progress', color: 'var(--warning)' },
  { key: 'done',        label: 'Done',        color: 'var(--success)' },
]

const NEXT_STATUS = {
  backlog:     'in_progress',
  in_progress: 'done',
  done:        'backlog',
}

const STATUS_ACTION = {
  backlog:     'Start',
  in_progress: 'Complete',
  done:        'Reopen',
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isOverdue(dateStr, status) {
  if (!dateStr || status === 'done' || status === 'skipped') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dateStr + 'T00:00:00') < today
}

export default function MyWork() {
  const [instances, setInstances] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updating, setUpdating] = useState(null)
  const verb = useLoadingVerb(loading)

  useEffect(() => {
    loadInstances()
  }, [])

  async function loadInstances() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMyInstances()
      setInstances(data)
    } catch (err) {
      setError('Could not load tasks. ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(instance, nextStatus) {
    setUpdating(instance.id)
    try {
      await updateInstanceStatus(instance.id, nextStatus)
      setInstances(prev =>
        prev.map(i => i.id === instance.id ? { ...i, status: nextStatus } : i)
      )
    } catch (err) {
      console.error('Status update failed:', err)
    } finally {
      setUpdating(null)
    }
  }

  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.key] = instances.filter(i => i.status === col.key)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner" />
        <p>{verb}…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">My Work</h2>
        <div className="page-actions">
          <button className="btn btn--secondary btn--small" onClick={loadInstances}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      {instances.length === 0 && !error ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <h3>All clear!</h3>
          <p>No tasks assigned to you right now. Check back later or ask an admin to generate tasks.</p>
        </div>
      ) : (
        <div className="task-board">
          {COLUMNS.map(col => (
            <div key={col.key} className="task-column">
              <div className="task-column-header">
                <span style={{ color: col.color }}>●</span>
                {col.label}
                <span className="task-column-count">{grouped[col.key].length}</span>
              </div>

              {grouped[col.key].length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.5rem 0', textAlign: 'center' }}>
                  Nothing here
                </div>
              ) : (
                grouped[col.key].map(instance => (
                  <div key={instance.id} className="task-card">
                    <div className="task-card-title">{instance.title}</div>
                    {instance.description && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.375rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {instance.description}
                      </div>
                    )}
                    <div className="task-card-meta">
                      <span className={`task-priority task-priority--${instance.priority}`}>
                        {instance.priority}
                      </span>
                      {instance.due_date && (
                        <span style={{ color: isOverdue(instance.due_date, instance.status) ? 'var(--danger)' : 'var(--text-muted)' }}>
                          {isOverdue(instance.due_date, instance.status) ? '⚠ ' : ''}
                          Due {formatDate(instance.due_date)}
                        </span>
                      )}
                      {(instance.tags || []).slice(0, 2).map(tag => (
                        <span key={tag} className="kb-article-tag">{tag}</span>
                      ))}
                    </div>
                    <div style={{ marginTop: '0.625rem' }}>
                      <button
                        className="task-status-btn"
                        disabled={updating === instance.id}
                        onClick={() => handleStatusChange(instance, NEXT_STATUS[instance.status])}
                      >
                        {updating === instance.id ? '…' : STATUS_ACTION[instance.status]}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
