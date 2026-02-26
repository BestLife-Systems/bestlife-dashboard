import { useState, useEffect } from 'react'
import { apiGet, apiPost, apiPatch } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import StatusBadge from '../../components/StatusBadge'
import Modal from '../../components/Modal'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Section labels for display
const SECTION_LABELS = {
  iic: 'IIC Sessions',
  op: 'OP Sessions',
  sbys: 'School Based Youth Services',
  ados: 'ADOS Assessments',
  admin: 'Administration',
  supervision: 'Supervision',
  sick_leave: 'Sick Leave',
  pto: 'Paid Time Off',
  notes: 'Notes',
}

const IIC_CODE_LABELS = {
  'IICLC-H0036TJU1': 'LPC/LCSW',
  'IICMA-H0036TJU2': 'LAC/LSW',
  'BA-H2014TJ': 'Behavioral Assistant',
}

// ── Review Page (full-page detail) ──
function ReviewPage({ recipient, onBack, onUpdate }) {
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [zeroReason, setZeroReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showZero, setShowZero] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [sendingNote, setSendingNote] = useState(false)
  const [adminNotes, setAdminNotes] = useState(recipient.admin_notes || [])
  const [error, setError] = useState(null)

  const data = editMode ? editData : (recipient.invoice_data || {})
  const isReceived = recipient.status === 'received'

  function startEdit() {
    setEditData(JSON.parse(JSON.stringify(recipient.invoice_data || {})))
    setEditMode(true)
  }

  async function saveEdits() {
    setProcessing(true); setError(null)
    try {
      await apiPatch(`/payroll/recipients/${recipient.id}/invoice-data`, { invoice_data: editData })
      recipient.invoice_data = editData
      setEditMode(false)
      onUpdate?.()
    } catch (err) {
      setError(err.message)
    } finally { setProcessing(false) }
  }

  async function handleApprove() {
    setProcessing(true); setError(null)
    try {
      await apiPost(`/payroll/recipients/${recipient.id}/approve`, {})
      onUpdate?.()
      onBack()
    } catch (err) {
      setError(err.message)
    } finally { setProcessing(false) }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setError('Please provide a rejection reason'); return }
    setProcessing(true); setError(null)
    try {
      await apiPost(`/payroll/recipients/${recipient.id}/reject`, { reason: rejectReason })
      onUpdate?.()
      onBack()
    } catch (err) {
      setError(err.message)
    } finally { setProcessing(false) }
  }

  async function handleZeroHours() {
    if (!zeroReason.trim()) { setError('Please provide a reason'); return }
    setProcessing(true); setError(null)
    try {
      await apiPost(`/payroll/recipients/${recipient.id}/zero-hours`, { reason: zeroReason })
      onUpdate?.()
      onBack()
    } catch (err) {
      setError(err.message)
    } finally { setProcessing(false) }
  }

  async function sendNote() {
    if (!noteText.trim()) return
    setSendingNote(true)
    try {
      const result = await apiPost(`/payroll/recipients/${recipient.id}/admin-note`, { note: noteText.trim() })
      setAdminNotes(result.notes || [...adminNotes, { text: noteText.trim(), at: new Date().toISOString() }])
      setNoteText('')
    } catch (err) {
      setError(err.message)
    } finally { setSendingNote(false) }
  }

  // ── IIC rendering ──
  function renderIIC() {
    const iic = data.iic
    if (!iic) return null
    const codes = Object.entries(iic)
    const hasData = codes.some(([, entries]) => entries && entries.length > 0)
    if (!hasData) return null

    return (
      <div className="review-section">
        <h4 className="review-section-title">IIC Sessions</h4>
        {codes.map(([code, entries]) => {
          if (!entries || entries.length === 0) return null
          return (
            <div key={code} className="review-subsection">
              <div className="review-subsection-label">{IIC_CODE_LABELS[code] || code} — <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{code}</span></div>
              <table className="review-table">
                <thead><tr><th>Initials</th><th>Date</th><th>Hours</th></tr></thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i}>
                      <td>{e.cyber_initials || '—'}</td>
                      <td>{e.date || '—'}</td>
                      <td className="review-number">{e.hours || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="review-subtotal">{entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)} hrs</div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── OP rendering ──
  function renderOP() {
    const op = data.op
    if (!op || !op.sessions || op.sessions.length === 0) return null
    const sessions = op.sessions.filter(e => !e.cancel_fee)
    const cancellations = op.sessions.filter(e => e.cancel_fee)
    return (
      <div className="review-section">
        <h4 className="review-section-title">OP Sessions</h4>
        {sessions.length > 0 && (
          <>
            <table className="review-table">
              <thead><tr><th>Initials</th><th>Date</th><th>Duration</th></tr></thead>
              <tbody>
                {sessions.map((e, i) => (
                  <tr key={i}>
                    <td>{e.cyber_initials || '—'}</td>
                    <td>{e.date || '—'}</td>
                    <td>{e.duration || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="review-subtotal">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</div>
          </>
        )}
        {cancellations.length > 0 && (
          <>
            <div className="review-subsection-label" style={{ marginTop: '0.75rem', color: 'var(--danger, #f87171)' }}>Cancellations</div>
            <table className="review-table">
              <thead><tr><th>Initials</th><th>Date</th><th>Fee</th></tr></thead>
              <tbody>
                {cancellations.map((e, i) => (
                  <tr key={i}>
                    <td>{e.cyber_initials || '—'}</td>
                    <td>{e.date || '—'}</td>
                    <td>{e.cancel_fee || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="review-subtotal" style={{ color: 'var(--danger, #f87171)' }}>{cancellations.length} cancellation{cancellations.length !== 1 ? 's' : ''}</div>
          </>
        )}
      </div>
    )
  }

  // ── SBYS rendering ──
  function renderSBYS() {
    const sbys = data.sbys
    if (!sbys || sbys.length === 0) return null
    return (
      <div className="review-section">
        <h4 className="review-section-title">School Based Youth Services</h4>
        <table className="review-table">
          <thead><tr><th>Date</th><th>Hours</th></tr></thead>
          <tbody>
            {sbys.map((e, i) => (
              <tr key={i}><td>{e.date || '—'}</td><td className="review-number">{e.hours || '—'}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="review-subtotal">{sbys.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)} hrs</div>
      </div>
    )
  }

  // ── ADOS rendering ──
  function renderADOS() {
    const ados = data.ados
    if (!ados || ados.length === 0) return null
    const inHome = ados.filter(e => e.location === 'In home').length
    const atOffice = ados.filter(e => e.location === 'At office').length
    return (
      <div className="review-section">
        <h4 className="review-section-title">ADOS Assessments</h4>
        <table className="review-table">
          <thead><tr><th>Initials</th><th>Location</th><th>ID #</th><th>Date</th></tr></thead>
          <tbody>
            {ados.map((e, i) => (
              <tr key={i}>
                <td>{e.client_initials || '—'}</td>
                <td>{e.location || '—'}</td>
                <td>{e.id_number || '—'}</td>
                <td>{e.date || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="review-subtotal">
          {ados.length} assessment{ados.length !== 1 ? 's' : ''}
          {inHome > 0 && <span> · {inHome} in home</span>}
          {atOffice > 0 && <span> · {atOffice} at office</span>}
          <span> · {ados.length * 3} hrs toward time worked</span>
        </div>
      </div>
    )
  }

  // ── Admin rendering ──
  function renderAdmin() {
    const admin = data.admin
    if (!admin || admin.length === 0) return null
    return (
      <div className="review-section">
        <h4 className="review-section-title">Administration</h4>
        <table className="review-table">
          <thead><tr><th>Date</th><th>Hours</th></tr></thead>
          <tbody>
            {admin.map((e, i) => (
              <tr key={i}><td>{e.date || '—'}</td><td className="review-number">{e.hours || '—'}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="review-subtotal">{admin.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)} hrs</div>
      </div>
    )
  }

  // ── Supervision rendering ──
  function renderSupervision() {
    const sup = data.supervision
    if (!sup) return null
    const indiv = sup.individual || []
    const group = sup.group || []
    if (indiv.length === 0 && group.length === 0) return null
    return (
      <div className="review-section">
        <h4 className="review-section-title">Supervision</h4>
        {indiv.length > 0 && (
          <div className="review-subsection">
            <div className="review-subsection-label">Individual</div>
            <table className="review-table">
              <thead><tr><th>Date</th><th>Supervisor</th></tr></thead>
              <tbody>
                {indiv.map((e, i) => (
                  <tr key={i}><td>{e.date || '—'}</td><td>{e.supervisor_name || '—'}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="review-subtotal">{indiv.length} session{indiv.length !== 1 ? 's' : ''}</div>
          </div>
        )}
        {group.length > 0 && (
          <div className="review-subsection">
            <div className="review-subsection-label">Group</div>
            <table className="review-table">
              <thead><tr><th>Date</th><th>Supervisees</th></tr></thead>
              <tbody>
                {group.map((e, i) => (
                  <tr key={i}>
                    <td>{e.date || '—'}</td>
                    <td>{(e.supervisee_names || []).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="review-subtotal">{group.length} session{group.length !== 1 ? 's' : ''}</div>
          </div>
        )}
      </div>
    )
  }

  // ── Sick / PTO ──
  function renderLeave() {
    const sick = data.sick_leave
    const pto = data.pto
    const hasSick = sick && parseFloat(sick.hours) > 0
    const hasPto = pto && parseFloat(pto.hours) > 0
    if (!hasSick && !hasPto) return null
    return (
      <div className="review-section">
        {hasSick && (
          <div className="review-subsection">
            <h4 className="review-section-title">Sick Leave</h4>
            <div className="review-leave-row">
              <span className="review-leave-label">Date:</span>
              <span>{sick.date || '—'}</span>
              <span className="review-leave-label" style={{ marginLeft: '1.5rem' }}>Hours:</span>
              <span className="review-number">{sick.hours}</span>
            </div>
            {sick.reason && <div className="review-leave-note">Reason: {sick.reason}</div>}
          </div>
        )}
        {hasPto && (
          <div className="review-subsection">
            <h4 className="review-section-title">Paid Time Off</h4>
            <div className="review-leave-row">
              <span className="review-leave-label">Date:</span>
              <span>{pto.date || '—'}</span>
              <span className="review-leave-label" style={{ marginLeft: '1.5rem' }}>Hours:</span>
              <span className="review-number">{pto.hours}</span>
            </div>
            {pto.reason && <div className="review-leave-note">Reason: {pto.reason}</div>}
          </div>
        )}
      </div>
    )
  }

  // ── Grand total calc ──
  function calcGrandTotal() {
    let total = 0
    const iic = data.iic || {}
    Object.values(iic).forEach(entries => {
      (entries || []).forEach(e => { total += parseFloat(e.hours) || 0 })
    })
    const sbys = data.sbys || []
    sbys.forEach(e => { total += parseFloat(e.hours) || 0 })
    const ados = data.ados || []
    total += ados.length * 3 // 3 hrs per assessment
    const admin = data.admin || []
    admin.forEach(e => { total += parseFloat(e.hours) || 0 })
    const sup = data.supervision || {}
    total += (sup.individual || []).length + (sup.group || []).length
    total += parseFloat(data.sick_leave?.hours) || 0
    total += parseFloat(data.pto?.hours) || 0
    return total
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <button className="btn btn--ghost btn--small" onClick={onBack} style={{ marginBottom: '0.5rem' }}>← Back to Approval Queue</button>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {recipient.user_name || `${recipient.first_name || ''} ${recipient.last_name || ''}`}
            <StatusBadge status={recipient.status} />
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {recipient.period_label || `${formatDate(recipient.period_start)} – ${formatDate(recipient.period_end)}`}
            {recipient.submitted_at && <> · Submitted {formatDateTime(recipient.submitted_at)}</>}
          </p>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Action bar */}
      {isReceived && (
        <div className="review-action-bar">
          <button className="btn btn--primary" onClick={handleApprove} disabled={processing}>
            {processing ? 'Processing…' : '✓ Approve'}
          </button>
          {!editMode ? (
            <button className="btn btn--ghost" onClick={startEdit}>Edit Line Items</button>
          ) : (
            <>
              <button className="btn btn--primary" onClick={saveEdits} disabled={processing}>Save Changes</button>
              <button className="btn btn--ghost" onClick={() => { setEditMode(false); setEditData(null) }}>Cancel Edit</button>
            </>
          )}
          <button className="btn btn--danger-ghost" onClick={() => setShowReject(true)}>Reject</button>
          <button className="btn btn--ghost" onClick={() => setShowZero(true)} style={{ color: 'var(--text-muted)' }}>Zero Hours</button>
        </div>
      )}

      {/* Invoice sections */}
      <div className="review-grid">
        <div className="review-main">
          {renderIIC()}
          {renderOP()}
          {renderSBYS()}
          {renderADOS()}
          {renderAdmin()}
          {renderSupervision()}
          {renderLeave()}

          {/* Notes */}
          {data.notes && (
            <div className="review-section">
              <h4 className="review-section-title">Notes</h4>
              <div className="review-notes-text">{data.notes}</div>
            </div>
          )}

          {/* Grand Total */}
          <div className="review-grand-total">
            <span>Total Hours Worked</span>
            <span className="review-grand-total-value">{calcGrandTotal()}</span>
          </div>
        </div>

        {/* Sidebar — admin notes/questions */}
        <div className="review-sidebar">
          <div className="review-sidebar-card">
            <h4 className="review-sidebar-title">Admin Notes</h4>
            <p className="review-sidebar-hint">Send a question or note to the provider about this submission.</p>

            {adminNotes.length > 0 && (
              <div className="review-notes-list">
                {adminNotes.map((n, i) => (
                  <div key={i} className="review-note-item">
                    <div className="review-note-text">{n.text}</div>
                    <div className="review-note-meta">{n.by || 'Admin'} · {formatDateTime(n.at)}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="review-note-input-wrap">
              <textarea
                className="form-input"
                rows="3"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Type a note or question…"
                style={{ resize: 'vertical', fontSize: '0.825rem' }}
              />
              <button
                className="btn btn--primary btn--small"
                onClick={sendNote}
                disabled={sendingNote || !noteText.trim()}
                style={{ alignSelf: 'flex-end', marginTop: '0.5rem' }}
              >
                {sendingNote ? 'Sending…' : 'Send Note'}
              </button>
            </div>
          </div>

          {/* Quick info */}
          <div className="review-sidebar-card">
            <h4 className="review-sidebar-title">Submission Info</h4>
            <div className="review-info-row">
              <span className="review-info-label">Status</span>
              <StatusBadge status={recipient.status} />
            </div>
            <div className="review-info-row">
              <span className="review-info-label">Pay Period</span>
              <span>{recipient.period_label || `${formatDate(recipient.period_start)} – ${formatDate(recipient.period_end)}`}</span>
            </div>
            <div className="review-info-row">
              <span className="review-info-label">Submitted</span>
              <span>{formatDateTime(recipient.submitted_at)}</span>
            </div>
            <div className="review-info-row">
              <span className="review-info-label">Total Hours</span>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{calcGrandTotal()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reject modal */}
      <Modal open={showReject} onClose={() => { setShowReject(false); setRejectReason('') }} title="Reject Submission">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          This will send the invoice back to the provider. Please provide a reason.
        </p>
        <textarea
          className="form-input"
          rows="3"
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="Reason for rejection…"
          style={{ resize: 'vertical', marginBottom: '1rem' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn--secondary" onClick={() => setShowReject(false)}>Cancel</button>
          <button className="btn btn--danger" onClick={handleReject} disabled={processing}>Reject</button>
        </div>
      </Modal>

      {/* Zero hours modal */}
      <Modal open={showZero} onClose={() => { setShowZero(false); setZeroReason('') }} title="Mark Zero Hours">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          This marks the provider as having zero billable hours for this period. Please provide a reason.
        </p>
        <textarea
          className="form-input"
          rows="3"
          value={zeroReason}
          onChange={e => setZeroReason(e.target.value)}
          placeholder="Reason for zero hours…"
          style={{ resize: 'vertical', marginBottom: '1rem' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn--secondary" onClick={() => setShowZero(false)}>Cancel</button>
          <button className="btn btn--primary" onClick={handleZeroHours} disabled={processing}>Confirm</button>
        </div>
      </Modal>
    </div>
  )
}

// ── Main Queue List ──
export default function ApprovalQueue() {
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('received')
  const [selected, setSelected] = useState(null)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadRecipients() }, [filter])

  async function loadRecipients() {
    setLoading(true)
    try {
      const data = await apiGet(`/payroll/approval-queue?status=${filter}`)
      setRecipients(data || [])
    } catch (err) {
      console.error('Failed to load approval queue:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  // Full-page review
  if (selected) {
    return (
      <ReviewPage
        recipient={selected}
        onBack={() => setSelected(null)}
        onUpdate={loadRecipients}
      />
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Approval Queue</h2>
      </div>

      <div className="filter-tabs">
        {['received', 'approved', 'rejected', 'zero_hours', 'all'].map(f => (
          <button key={f} className={`filter-tab ${filter === f ? 'filter-tab--active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'zero_hours' ? 'Zero Hours' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {recipients.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No {filter !== 'all' ? filter : ''} submissions</h3>
          <p>Submitted invoices will appear here for review.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Pay Period</th>
                <th>Submitted</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recipients.map(r => (
                <tr key={r.id} className="data-table-row" style={{ cursor: 'pointer' }} onClick={() => setSelected(r)}>
                  <td className="data-table-primary">{r.user_name || `${r.first_name || ''} ${r.last_name || ''}`}</td>
                  <td>{formatDate(r.period_start)} – {formatDate(r.period_end)}</td>
                  <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td><button className="btn btn--small btn--ghost" onClick={e => { e.stopPropagation(); setSelected(r) }}>Review</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
