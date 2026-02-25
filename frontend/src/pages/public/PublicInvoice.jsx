import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function pubGet(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

async function pubPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

function emptyLine(rt) {
  const line = { rate_type_id: rt.id, rate_name: rt.name, unit: rt.unit }
  if (rt.unit === 'hourly') line.hours = ''
  if (rt.unit === 'session') line.quantity = 1
  if (rt.unit === 'day') line.days = ''
  if (rt.unit === 'event') line.quantity = ''
  if (rt.name.startsWith('OP ') && rt.name !== 'OP Cancellation') line.client_initials = ''
  if (rt.name.startsWith('APN') && !rt.default_duration_minutes) line.duration_minutes = ''
  if (rt.default_duration_minutes) line.duration_minutes = rt.default_duration_minutes
  return line
}

export default function PublicInvoice() {
  const { draftToken } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [lines, setLines] = useState([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)

  useEffect(() => {
    loadInvoice()
  }, [draftToken])

  async function loadInvoice() {
    setLoading(true)
    setError('')
    try {
      const result = await pubGet(`/public/invoice/${draftToken}`)
      if (result.already_submitted) {
        setSubmitted(true)
        setData(result)
      } else {
        setData(result)
        // Restore draft or start fresh
        if (result.draft_data?.lines) {
          setLines(result.draft_data.lines)
          setNotes(result.draft_data.notes || '')
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function addLine(rateType) {
    setLines([...lines, emptyLine(rateType)])
    setDraftSaved(false)
  }

  function updateLine(index, field, value) {
    const updated = [...lines]
    updated[index] = { ...updated[index], [field]: value }
    setLines(updated)
    setDraftSaved(false)
  }

  function removeLine(index) {
    setLines(lines.filter((_, i) => i !== index))
    setDraftSaved(false)
  }

  async function handleSaveDraft() {
    setSaving(true)
    setError('')
    try {
      await pubPost(`/public/invoice/${draftToken}/save-draft`, {
        invoice_data: { lines, notes },
      })
      setDraftSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (!lines.length) {
      setError('Add at least one line item before submitting.')
      return
    }
    // Validate required fields
    for (const line of lines) {
      if (line.unit === 'hourly' && (!line.hours || parseFloat(line.hours) <= 0)) {
        setError(`Enter hours for ${line.rate_name}`)
        return
      }
      if (line.unit === 'day' && (!line.days || parseFloat(line.days) <= 0)) {
        setError(`Enter days for ${line.rate_name}`)
        return
      }
      if (line.unit === 'event' && (!line.quantity || parseInt(line.quantity) <= 0)) {
        setError(`Enter quantity for ${line.rate_name}`)
        return
      }
      if ('client_initials' in line && !line.client_initials?.trim()) {
        setError(`Client initials required for ${line.rate_name}`)
        return
      }
      if ('duration_minutes' in line && !line.duration_minutes) {
        setError(`Duration required for ${line.rate_name}`)
        return
      }
    }

    setSubmitting(true)
    setError('')
    try {
      await pubPost(`/public/invoice/${draftToken}/submit`, {
        submit_token: data.submit_token,
        invoice_data: { lines, notes },
      })
      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Group rate types by unit for the add-line menu
  const grouped = (data?.rate_types || []).reduce((acc, rt) => {
    const g = rt.unit
    if (!acc[g]) acc[g] = []
    acc[g].push(rt)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="public-invoice-page">
        <div className="public-invoice-card">
          <div className="loading-spinner" style={{ margin: '2rem auto' }} />
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="public-invoice-page">
        <div className="public-invoice-card">
          <div className="public-invoice-header">
            <h1>BestLife Hub</h1>
          </div>
          <div className="public-invoice-success">
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>&#10003;</div>
            <h2>Invoice Submitted</h2>
            <p>Your hours have been submitted successfully. You can close this page.</p>
            {data?.submitted_at && (
              <p className="public-invoice-muted">Submitted {new Date(data.submitted_at).toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="public-invoice-page">
        <div className="public-invoice-card">
          <div className="public-invoice-header">
            <h1>BestLife Hub</h1>
          </div>
          <div className="public-invoice-error">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="public-invoice-page">
      <div className="public-invoice-card">
        <div className="public-invoice-header">
          <h1>BestLife Hub</h1>
          <p className="public-invoice-subtitle">
            {data.user_name} &mdash; {data.period_label}
          </p>
          {data.due_date && (
            <p className="public-invoice-muted">Due: {new Date(data.due_date + 'T00:00:00').toLocaleDateString()}</p>
          )}
        </div>

        {error && <div className="public-invoice-error">{error}</div>}

        {/* Line Items */}
        <div className="public-invoice-lines">
          {lines.length === 0 && (
            <p className="public-invoice-muted" style={{ textAlign: 'center', padding: '1rem' }}>
              No line items yet. Use the buttons below to add entries.
            </p>
          )}
          {lines.map((line, i) => (
            <div key={i} className="public-invoice-line">
              <div className="public-invoice-line-header">
                <strong>{line.rate_name}</strong>
                <span className="public-invoice-unit">{line.unit}</span>
                <button type="button" className="btn btn--small btn--danger-ghost" onClick={() => removeLine(i)}>Remove</button>
              </div>
              <div className="public-invoice-line-fields">
                {line.unit === 'hourly' && (
                  <div className="form-field">
                    <label>Hours</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={line.hours}
                      onChange={e => updateLine(i, 'hours', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                )}
                {line.unit === 'session' && (
                  <div className="form-field">
                    <label>Sessions</label>
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={e => updateLine(i, 'quantity', e.target.value)}
                    />
                  </div>
                )}
                {line.unit === 'day' && (
                  <div className="form-field">
                    <label>Days</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={line.days}
                      onChange={e => updateLine(i, 'days', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                )}
                {line.unit === 'event' && (
                  <div className="form-field">
                    <label>Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={e => updateLine(i, 'quantity', e.target.value)}
                      placeholder="1"
                    />
                  </div>
                )}
                {'client_initials' in line && (
                  <div className="form-field">
                    <label>Client Initials</label>
                    <input
                      type="text"
                      maxLength={5}
                      value={line.client_initials}
                      onChange={e => updateLine(i, 'client_initials', e.target.value.toUpperCase())}
                      placeholder="AB"
                    />
                  </div>
                )}
                {'duration_minutes' in line && !line.duration_minutes && (
                  <div className="form-field">
                    <label>Duration (min)</label>
                    <input
                      type="number"
                      min="1"
                      value={line.duration_minutes || ''}
                      onChange={e => updateLine(i, 'duration_minutes', e.target.value)}
                      placeholder="30"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add Line Buttons */}
        <div className="public-invoice-add">
          <p className="public-invoice-add-label">Add line item:</p>
          <div className="public-invoice-add-groups">
            {Object.entries(grouped).map(([unit, types]) => (
              <div key={unit} className="public-invoice-add-group">
                <span className="public-invoice-add-unit">{unit}</span>
                {types.map(rt => (
                  <button key={rt.id} type="button" className="btn btn--small btn--ghost" onClick={() => addLine(rt)}>
                    + {rt.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="form-field" style={{ marginTop: '1rem' }}>
          <label>Notes (optional)</label>
          <textarea
            rows={3}
            value={notes}
            onChange={e => { setNotes(e.target.value); setDraftSaved(false) }}
            placeholder="Any notes for the admin..."
          />
        </div>

        {/* Actions */}
        <div className="public-invoice-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleSaveDraft}
            disabled={saving}
          >
            {saving ? 'Saving...' : draftSaved ? 'Draft Saved' : 'Save Draft'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}
