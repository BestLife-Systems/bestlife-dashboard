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

const IIC_CODE_LABELS = {
  'IICLC-H0036TJU1': 'LPC/LCSW',
  'IICMA-H0036TJU2': 'LAC/LSW',
  'BA-H2014TJ': 'Behavioral Assistant',
}

// Inline SVG icons
const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
)
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

// ── Review Page (full-page detail) ──
function ReviewPage({ recipient, onBack, onUpdate }) {
  const [editMode, setEditMode] = useState(false)
  const [removeMode, setRemoveMode] = useState(false)
  const [editData, setEditData] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [showZeroPrompt, setShowZeroPrompt] = useState(false)
  const [zeroReason, setZeroReason] = useState('')
  // Sick leave: null = undecided, 'approve' or 'disapprove'
  const [sickDecision, setSickDecision] = useState(null)
  const [sickDisapproveReason, setSickDisapproveReason] = useState('')
  const [showSickDisapprove, setShowSickDisapprove] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [sendingNote, setSendingNote] = useState(false)
  const [adminNotes, setAdminNotes] = useState(recipient.admin_notes || [])
  const [error, setError] = useState(null)

  const liveData = editData || recipient.invoice_data || {}
  const data = liveData
  const isReceived = recipient.status === 'received'

  function ensureAllSections(base) {
    if (!base.iic) base.iic = {}
    if (!base.iic['IICLC-H0036TJU1']) base.iic['IICLC-H0036TJU1'] = []
    if (!base.iic['IICMA-H0036TJU2']) base.iic['IICMA-H0036TJU2'] = []
    if (!base.iic['BA-H2014TJ']) base.iic['BA-H2014TJ'] = []
    if (!base.op) base.op = { sessions: [] }
    if (!base.op.sessions) base.op.sessions = []
    if (!base.sbys) base.sbys = []
    if (!base.ados) base.ados = []
    if (!base.apn) base.apn = []
    if (!base.admin) base.admin = []
    if (!base.supervision) base.supervision = {}
    if (!base.supervision.individual) base.supervision.individual = []
    if (!base.supervision.group) base.supervision.group = []
    if (!base.sick_leave) base.sick_leave = { date: '', hours: '', reason: '' }
    if (!base.pto) base.pto = { hours: '' }
    return base
  }

  function startEdit() {
    const base = ensureAllSections(JSON.parse(JSON.stringify(recipient.invoice_data || {})))
    setEditData(base)
    setEditMode(true)
    setRemoveMode(false)
  }

  function startRemove() {
    const base = ensureAllSections(JSON.parse(JSON.stringify(recipient.invoice_data || {})))
    setEditData(base)
    setRemoveMode(true)
    setEditMode(false)
  }

  function cancelEditRemove() {
    setEditMode(false)
    setRemoveMode(false)
    setEditData(null)
  }

  async function saveEdits() {
    setProcessing(true); setError(null)
    try {
      await apiPatch(`/payroll/recipients/${recipient.id}/invoice-data`, { invoice_data: editData })
      recipient.invoice_data = JSON.parse(JSON.stringify(editData))
      setEditMode(false)
      setRemoveMode(false)
      setEditData(null)
      onUpdate?.()
    } catch (err) {
      setError(err.message)
    } finally { setProcessing(false) }
  }

  // Remove helpers for editData
  function removeIicEntry(code, idx) {
    setEditData(prev => {
      const next = { ...prev, iic: { ...prev.iic } }
      next.iic[code] = next.iic[code].filter((_, i) => i !== idx)
      return next
    })
  }
  function removeOpEntry(idx) {
    setEditData(prev => {
      const next = { ...prev, op: { ...prev.op } }
      next.op.sessions = next.op.sessions.filter((_, i) => i !== idx)
      return next
    })
  }
  function removeSbysEntry(idx) {
    setEditData(prev => ({ ...prev, sbys: prev.sbys.filter((_, i) => i !== idx) }))
  }
  function removeAdosEntry(idx) {
    setEditData(prev => ({ ...prev, ados: prev.ados.filter((_, i) => i !== idx) }))
  }
  function removeAdminEntry(idx) {
    setEditData(prev => ({ ...prev, admin: prev.admin.filter((_, i) => i !== idx) }))
  }

  // Edit helpers for editData cells
  function editIicField(code, idx, field, value) {
    setEditData(prev => {
      const next = { ...prev, iic: { ...prev.iic } }
      next.iic[code] = [...next.iic[code]]
      next.iic[code][idx] = { ...next.iic[code][idx], [field]: value }
      return next
    })
  }
  function editOpField(idx, field, value) {
    setEditData(prev => {
      const next = { ...prev, op: { ...prev.op } }
      next.op.sessions = [...next.op.sessions]
      next.op.sessions[idx] = { ...next.op.sessions[idx], [field]: value }
      return next
    })
  }
  function editSbysField(idx, field, value) {
    setEditData(prev => {
      const next = { ...prev, sbys: [...prev.sbys] }
      next.sbys[idx] = { ...next.sbys[idx], [field]: value }
      return next
    })
  }
  function editAdosField(idx, field, value) {
    setEditData(prev => {
      const next = { ...prev, ados: [...prev.ados] }
      next.ados[idx] = { ...next.ados[idx], [field]: value }
      return next
    })
  }
  function editAdminField(idx, field, value) {
    setEditData(prev => {
      const next = { ...prev, admin: [...prev.admin] }
      next.admin[idx] = { ...next.admin[idx], [field]: value }
      return next
    })
  }

  // ── APN edit/remove helpers ──
  function editApnField(idx, field, value) {
    setEditData(prev => {
      const next = { ...prev, apn: [...(prev.apn || [])] }
      next.apn[idx] = { ...next.apn[idx], [field]: value }
      return next
    })
  }
  function removeApnEntry(idx) {
    setEditData(prev => ({ ...prev, apn: (prev.apn || []).filter((_, i) => i !== idx) }))
  }

  // ── Supervision edit/remove helpers ──
  function editSupIndivField(idx, field, value) {
    setEditData(prev => {
      const next = { ...prev, supervision: { ...prev.supervision } }
      next.supervision.individual = [...(next.supervision.individual || [])]
      next.supervision.individual[idx] = { ...next.supervision.individual[idx], [field]: value }
      return next
    })
  }
  function editSupGroupField(idx, field, value) {
    setEditData(prev => {
      const next = { ...prev, supervision: { ...prev.supervision } }
      next.supervision.group = [...(next.supervision.group || [])]
      next.supervision.group[idx] = { ...next.supervision.group[idx], [field]: value }
      return next
    })
  }
  function removeSupIndivEntry(idx) {
    setEditData(prev => {
      const next = { ...prev, supervision: { ...prev.supervision } }
      next.supervision.individual = (next.supervision.individual || []).filter((_, i) => i !== idx)
      return next
    })
  }
  function removeSupGroupEntry(idx) {
    setEditData(prev => {
      const next = { ...prev, supervision: { ...prev.supervision } }
      next.supervision.group = (next.supervision.group || []).filter((_, i) => i !== idx)
      return next
    })
  }

  // ── Sick leave / PTO edit helpers ──
  function editSickField(field, value) {
    setEditData(prev => ({ ...prev, sick_leave: { ...(prev.sick_leave || {}), [field]: value } }))
  }
  function editPtoField(field, value) {
    setEditData(prev => ({ ...prev, pto: { ...(prev.pto || {}), [field]: value } }))
  }

  // ── Add-row helpers (used in edit mode) ──
  function addIicEntry(code) {
    setEditData(prev => {
      const next = { ...prev, iic: { ...(prev.iic || {}) } }
      next.iic[code] = [...(next.iic[code] || []), { cyber_initials: '', date: '', hours: '' }]
      return next
    })
  }
  function addOpEntry(isCancel = false) {
    setEditData(prev => {
      const next = { ...prev, op: { ...(prev.op || {}) } }
      next.op.sessions = [...(next.op.sessions || []), { client_initials: '', date: '', ...(isCancel ? { cancel_fee: true } : {}) }]
      return next
    })
  }
  function addSbysEntry() {
    setEditData(prev => ({ ...prev, sbys: [...(prev.sbys || []), { date: '', hours: '' }] }))
  }
  function addAdosEntry() {
    setEditData(prev => ({ ...prev, ados: [...(prev.ados || []), { client_initials: '', location: 'In home', id_number: '', date: '' }] }))
  }
  function addApnEntry() {
    setEditData(prev => ({ ...prev, apn: [...(prev.apn || []), { date: '', hours: '', type: '30min' }] }))
  }
  function addAdminEntry() {
    setEditData(prev => ({ ...prev, admin: [...(prev.admin || []), { date: '', hours: '' }] }))
  }
  function addSupervisionEntry(kind) {
    setEditData(prev => {
      const next = { ...prev, supervision: { ...(prev.supervision || {}) } }
      if (kind === 'individual') {
        next.supervision.individual = [...(next.supervision.individual || []), { supervisor_name: '', date: '' }]
      } else {
        next.supervision.group = [...(next.supervision.group || []), { supervisee_names: [], date: '' }]
      }
      return next
    })
  }

  // ── Quick-add: enter edit mode + add a row in one click ──
  function quickAdd(setupFn) {
    const base = ensureAllSections(JSON.parse(JSON.stringify(editData || recipient.invoice_data || {})))
    setupFn(base)
    setEditData(base)
    setEditMode(true)
    setRemoveMode(false)
  }

  async function handleApprove() {
    // Check sick leave decision — only require approve/disapprove if the ORIGINAL submission had sick leave
    const hasSick = data.sick_leave && parseFloat(data.sick_leave.hours) > 0
    const originalHadSick = recipient.invoice_data?.sick_leave && parseFloat(recipient.invoice_data.sick_leave.hours) > 0
    if (hasSick && originalHadSick && sickDecision === null) {
      setError('Please approve or disapprove the sick leave request before approving')
      return
    }
    if (calcGrandTotal() === 0) {
      setShowZeroPrompt(true)
      return
    }
    setProcessing(true); setError(null)
    try {
      await apiPost(`/payroll/recipients/${recipient.id}/approve`, {})
      onUpdate?.()
      onBack()
    } catch (err) {
      setError(err.message)
    } finally { setProcessing(false) }
  }

  async function handleZeroApprove() {
    if (!zeroReason.trim()) { setError('Please provide a reason for zero hours'); return }
    setProcessing(true); setError(null)
    try {
      await apiPost(`/payroll/recipients/${recipient.id}/zero-hours`, { reason: zeroReason })
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

  async function handleUnapprove() {
    if (!confirm('Revert this approval? Time entries and rollups for this submission will be deleted so you can re-edit and re-approve.')) return
    setProcessing(true); setError(null)
    try {
      await apiPost(`/payroll/recipients/${recipient.id}/unapprove`, {})
      recipient.status = 'received'
      onUpdate?.()
    } catch (err) {
      setError(err.message)
    } finally { setProcessing(false) }
  }

  function handleSickDisapprove() {
    setSickDecision('disapprove')
    setShowSickDisapprove(true)
  }

  async function confirmSickDisapprove() {
    if (!sickDisapproveReason.trim()) { setError('Please provide a reason for disapproving sick leave'); return }
    // Send as admin note
    setSendingNote(true)
    try {
      const result = await apiPost(`/payroll/recipients/${recipient.id}/admin-note`, {
        note: `Sick Leave Disapproved: ${sickDisapproveReason.trim()}`,
      })
      setAdminNotes(result.notes || [...adminNotes, { text: `Sick Leave Disapproved: ${sickDisapproveReason.trim()}`, at: new Date().toISOString() }])
      setShowSickDisapprove(false)
    } catch (err) {
      setError(err.message)
    } finally { setSendingNote(false) }
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

  const isEditing = editMode || removeMode

  // ── IIC rendering (always shows all 3 billing codes) ──
  function renderIIC() {
    const iic = data.iic || {}
    const allCodes = ['IICLC-H0036TJU1', 'IICMA-H0036TJU2', 'BA-H2014TJ']

    return (
      <div className="review-section">
        <h4 className="review-section-title">IIC Sessions</h4>
        {allCodes.map(code => {
          const entries = iic[code] || []
          const subtotal = entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)
          return (
            <div key={code} className="review-subsection">
              <div className="review-subsection-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{IIC_CODE_LABELS[code] || code} — <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{code}</span></span>
                {isReceived && !isEditing && (
                  <button className="btn btn--ghost btn--small" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', lineHeight: 1 }}
                    onClick={() => quickAdd(b => { if (!b.iic) b.iic = {}; if (!b.iic[code]) b.iic[code] = []; b.iic[code].push({ cyber_initials: '', date: '', hours: '' }) })}>
                    <PlusIcon /> Add
                  </button>
                )}
              </div>
              {entries.length > 0 ? (
                <>
                  <table className="review-table">
                    <thead><tr>{removeMode && <th style={{ width: 30 }}></th>}<th>Cyber # / Initials</th><th>Date</th><th>Hours</th>{editMode && <th style={{ width: 20 }}></th>}</tr></thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={i}>
                          {removeMode && <td><button className="review-remove-x" onClick={() => removeIicEntry(code, i)}><XIcon /></button></td>}
                          <td>{editMode ? <input className="review-edit-input" value={e.cyber_initials || ''} onChange={ev => editIicField(code, i, 'cyber_initials', ev.target.value)} /> : (e.cyber_initials || '—')}</td>
                          <td>{editMode ? <input className="review-edit-input" type="date" value={e.date || ''} onChange={ev => editIicField(code, i, 'date', ev.target.value)} /> : formatDate(e.date)}</td>
                          <td className="review-number">{editMode ? <input className="review-edit-input review-edit-input--narrow" value={e.hours || ''} onChange={ev => editIicField(code, i, 'hours', ev.target.value)} /> : (e.hours || '—')}</td>
                          {editMode && <td><PencilIcon /></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {editMode && (
                    <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                      onClick={() => addIicEntry(code)}><PlusIcon /> Add Row</button>
                  )}
                  <div className="review-subtotal">{subtotal} hrs</div>
                </>
              ) : isEditing ? (
                <>
                  <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                    onClick={() => addIicEntry(code)}><PlusIcon /> Add Row</button>
                  <div className="review-subtotal" style={{ color: 'var(--text-muted)' }}>0 hrs</div>
                </>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.25rem 0' }}>No entries · 0 hrs</div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── OP rendering (always shown) ──
  function renderOP() {
    const op = data.op || {}
    const allSessions = op.sessions || []
    const sessions = allSessions.filter(e => !e.cancel_fee)
    const cancellations = allSessions.filter(e => e.cancel_fee)
    const sessionIndices = []; const cancelIndices = []
    allSessions.forEach((e, i) => { if (!e.cancel_fee) sessionIndices.push(i); else cancelIndices.push(i) })
    const hasData = allSessions.length > 0

    return (
      <div className="review-section">
        <div className="review-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h4 style={{ margin: 0 }}>OP Sessions</h4>
          {isReceived && !isEditing && (
            <button className="btn btn--ghost btn--small" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', lineHeight: 1 }}
              onClick={() => quickAdd(b => { if (!b.op) b.op = {}; if (!b.op.sessions) b.op.sessions = []; b.op.sessions.push({ client_initials: '', date: '' }) })}>
              <PlusIcon /> Add
            </button>
          )}
        </div>
        {hasData ? (
          <>
            {sessions.length > 0 && (
              <>
                <table className="review-table">
                  <thead><tr>{removeMode && <th style={{ width: 30 }}></th>}<th>Initials</th><th>Date</th><th>Hours</th>{editMode && <th style={{ width: 20 }}></th>}</tr></thead>
                  <tbody>
                    {sessions.map((e, i) => (
                      <tr key={i}>
                        {removeMode && <td><button className="review-remove-x" onClick={() => removeOpEntry(sessionIndices[i])}><XIcon /></button></td>}
                        <td>{editMode ? <input className="review-edit-input" value={e.client_initials || ''} onChange={ev => editOpField(sessionIndices[i], 'client_initials', ev.target.value)} /> : (e.client_initials || '—')}</td>
                        <td>{editMode ? <input className="review-edit-input" type="date" value={e.date || ''} onChange={ev => editOpField(sessionIndices[i], 'date', ev.target.value)} /> : formatDate(e.date)}</td>
                        <td className="review-number">1</td>
                        {editMode && <td><PencilIcon /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="review-subtotal">{sessions.length} hrs</div>
              </>
            )}
            {cancellations.length > 0 && (
              <>
                <div className="review-subsection-label" style={{ marginTop: '0.75rem', color: 'var(--danger, #f87171)' }}>Cancellations</div>
                <table className="review-table">
                  <thead><tr>{removeMode && <th style={{ width: 30 }}></th>}<th>Initials</th><th>Date</th><th>Hours</th>{editMode && <th style={{ width: 20 }}></th>}</tr></thead>
                  <tbody>
                    {cancellations.map((e, i) => (
                      <tr key={i}>
                        {removeMode && <td><button className="review-remove-x" onClick={() => removeOpEntry(cancelIndices[i])}><XIcon /></button></td>}
                        <td>{editMode ? <input className="review-edit-input" value={e.client_initials || ''} onChange={ev => editOpField(cancelIndices[i], 'client_initials', ev.target.value)} /> : (e.client_initials || '—')}</td>
                        <td>{editMode ? <input className="review-edit-input" type="date" value={e.date || ''} onChange={ev => editOpField(cancelIndices[i], 'date', ev.target.value)} /> : formatDate(e.date)}</td>
                        <td className="review-number">1</td>
                        {editMode && <td><PencilIcon /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="review-subtotal" style={{ color: 'var(--danger, #f87171)' }}>{cancellations.length} hrs</div>
              </>
            )}
            {editMode && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button className="btn btn--ghost btn--small" style={{ fontSize: '0.75rem' }}
                  onClick={() => addOpEntry(false)}><PlusIcon /> Add Session</button>
                <button className="btn btn--ghost btn--small" style={{ fontSize: '0.75rem' }}
                  onClick={() => addOpEntry(true)}><PlusIcon /> Add Cancellation</button>
              </div>
            )}
          </>
        ) : isEditing ? (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button className="btn btn--ghost btn--small" style={{ fontSize: '0.75rem' }}
                onClick={() => addOpEntry(false)}><PlusIcon /> Add Session</button>
              <button className="btn btn--ghost btn--small" style={{ fontSize: '0.75rem' }}
                onClick={() => addOpEntry(true)}><PlusIcon /> Add Cancellation</button>
            </div>
            <div className="review-subtotal" style={{ color: 'var(--text-muted)' }}>0 hrs</div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.25rem 0' }}>No entries · 0 hrs</div>
        )}
      </div>
    )
  }

  // ── SBYS rendering (always shown) ──
  function renderSBYS() {
    const sbys = data.sbys || []
    const total = sbys.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)
    return (
      <div className="review-section">
        <div className="review-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h4 style={{ margin: 0 }}>School Based Youth Services</h4>
          {isReceived && !isEditing && (
            <button className="btn btn--ghost btn--small" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', lineHeight: 1 }}
              onClick={() => quickAdd(b => { if (!b.sbys) b.sbys = []; b.sbys.push({ date: '', hours: '' }) })}>
              <PlusIcon /> Add
            </button>
          )}
        </div>
        {sbys.length > 0 ? (
          <>
            <table className="review-table">
              <thead><tr>{removeMode && <th style={{ width: 30 }}></th>}<th>Date</th><th>Hours</th>{editMode && <th style={{ width: 20 }}></th>}</tr></thead>
              <tbody>
                {sbys.map((e, i) => (
                  <tr key={i}>
                    {removeMode && <td><button className="review-remove-x" onClick={() => removeSbysEntry(i)}><XIcon /></button></td>}
                    <td>{editMode ? <input className="review-edit-input" type="date" value={e.date || ''} onChange={ev => editSbysField(i, 'date', ev.target.value)} /> : formatDate(e.date)}</td>
                    <td className="review-number">{editMode ? <input className="review-edit-input review-edit-input--narrow" value={e.hours || ''} onChange={ev => editSbysField(i, 'hours', ev.target.value)} /> : (e.hours || '—')}</td>
                    {editMode && <td><PencilIcon /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {editMode && (
              <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                onClick={addSbysEntry}><PlusIcon /> Add Row</button>
            )}
            <div className="review-subtotal">{total} hrs</div>
          </>
        ) : isEditing ? (
          <>
            <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
              onClick={addSbysEntry}><PlusIcon /> Add Row</button>
            <div className="review-subtotal" style={{ color: 'var(--text-muted)' }}>0 hrs</div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.25rem 0' }}>No entries · 0 hrs</div>
        )}
      </div>
    )
  }

  // ── ADOS rendering (always shown) ──
  function renderADOS() {
    const ados = data.ados || []
    const inHome = ados.filter(e => e.location === 'In home').length
    const atOffice = ados.filter(e => e.location === 'At office').length
    return (
      <div className="review-section">
        <div className="review-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h4 style={{ margin: 0 }}>ADOS Assessments</h4>
          {isReceived && !isEditing && (
            <button className="btn btn--ghost btn--small" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', lineHeight: 1 }}
              onClick={() => quickAdd(b => { if (!b.ados) b.ados = []; b.ados.push({ client_initials: '', location: 'In home', id_number: '', date: '' }) })}>
              <PlusIcon /> Add
            </button>
          )}
        </div>
        {ados.length > 0 ? (
          <>
            <table className="review-table">
              <thead><tr>{removeMode && <th style={{ width: 30 }}></th>}<th>Initials</th><th>Location</th><th>ID #</th><th>Date</th>{editMode && <th style={{ width: 20 }}></th>}</tr></thead>
              <tbody>
                {ados.map((e, i) => (
                  <tr key={i}>
                    {removeMode && <td><button className="review-remove-x" onClick={() => removeAdosEntry(i)}><XIcon /></button></td>}
                    <td>{editMode ? <input className="review-edit-input" value={e.client_initials || ''} onChange={ev => editAdosField(i, 'client_initials', ev.target.value)} /> : (e.client_initials || '—')}</td>
                    <td>{editMode ? <select className="review-edit-input" value={e.location || ''} onChange={ev => editAdosField(i, 'location', ev.target.value)}><option value="In home">In home</option><option value="At office">At office</option></select> : (e.location || '—')}</td>
                    <td>{editMode ? <input className="review-edit-input review-edit-input--narrow" value={e.id_number || ''} onChange={ev => editAdosField(i, 'id_number', ev.target.value)} /> : (e.id_number || '—')}</td>
                    <td>{editMode ? <input className="review-edit-input" type="date" value={e.date || ''} onChange={ev => editAdosField(i, 'date', ev.target.value)} /> : formatDate(e.date)}</td>
                    {editMode && <td><PencilIcon /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {editMode && (
              <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                onClick={addAdosEntry}><PlusIcon /> Add Row</button>
            )}
            <div className="review-subtotal">
              {ados.length} assessment{ados.length !== 1 ? 's' : ''}
              {inHome > 0 && <span> · {inHome} in home</span>}
              {atOffice > 0 && <span> · {atOffice} at office</span>}
              <span> · {ados.length * 3} hrs toward time worked</span>
            </div>
          </>
        ) : isEditing ? (
          <>
            <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
              onClick={addAdosEntry}><PlusIcon /> Add Row</button>
            <div className="review-subtotal" style={{ color: 'var(--text-muted)' }}>0 assessments · 0 hrs</div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.25rem 0' }}>No entries · 0 hrs</div>
        )}
      </div>
    )
  }

  // ── APN rendering (always shown) ──
  function renderAPN() {
    const apn = data.apn || []
    const total = apn.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)
    return (
      <div className="review-section">
        <div className="review-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h4 style={{ margin: 0 }}>APN</h4>
          {isReceived && !isEditing && (
            <button className="btn btn--ghost btn--small" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', lineHeight: 1 }}
              onClick={() => quickAdd(b => { if (!b.apn) b.apn = []; b.apn.push({ date: '', hours: '', type: '30min' }) })}>
              <PlusIcon /> Add
            </button>
          )}
        </div>
        {apn.length > 0 ? (
          <>
            <table className="review-table">
              <thead><tr>{removeMode && <th style={{ width: 30 }}></th>}<th>Type</th><th>Date</th><th>Hours</th>{editMode && <th style={{ width: 20 }}></th>}</tr></thead>
              <tbody>
                {apn.map((e, i) => (
                  <tr key={i}>
                    {removeMode && <td><button className="review-remove-x" onClick={() => removeApnEntry(i)}><XIcon /></button></td>}
                    <td>{editMode ? (
                      <select className="review-edit-input" value={e.type || '30min'} onChange={ev => editApnField(i, 'type', ev.target.value)}>
                        <option value="30min">30 Min</option>
                        <option value="intake">Intake</option>
                      </select>
                    ) : (e.type === 'intake' ? 'Intake' : '30 Min')}</td>
                    <td>{editMode ? <input className="review-edit-input" type="date" value={e.date || ''} onChange={ev => editApnField(i, 'date', ev.target.value)} /> : formatDate(e.date)}</td>
                    <td className="review-number">{editMode ? <input className="review-edit-input review-edit-input--narrow" value={e.hours || ''} onChange={ev => editApnField(i, 'hours', ev.target.value)} /> : (e.hours || '—')}</td>
                    {editMode && <td><PencilIcon /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {editMode && (
              <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                onClick={addApnEntry}><PlusIcon /> Add Row</button>
            )}
            <div className="review-subtotal">{total} hrs</div>
          </>
        ) : isEditing ? (
          <>
            <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
              onClick={addApnEntry}><PlusIcon /> Add Row</button>
            <div className="review-subtotal" style={{ color: 'var(--text-muted)' }}>0 hrs</div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.25rem 0' }}>No entries · 0 hrs</div>
        )}
      </div>
    )
  }

  // ── Admin rendering (always shown) ──
  function renderAdmin() {
    const admin = data.admin || []
    const total = admin.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)
    return (
      <div className="review-section">
        <div className="review-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h4 style={{ margin: 0 }}>Administration</h4>
          {isReceived && !isEditing && (
            <button className="btn btn--ghost btn--small" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', lineHeight: 1 }}
              onClick={() => quickAdd(b => { if (!b.admin) b.admin = []; b.admin.push({ date: '', hours: '' }) })}>
              <PlusIcon /> Add
            </button>
          )}
        </div>
        {admin.length > 0 ? (
          <>
            <table className="review-table">
              <thead><tr>{removeMode && <th style={{ width: 30 }}></th>}<th>Date</th><th>Hours</th>{editMode && <th style={{ width: 20 }}></th>}</tr></thead>
              <tbody>
                {admin.map((e, i) => (
                  <tr key={i}>
                    {removeMode && <td><button className="review-remove-x" onClick={() => removeAdminEntry(i)}><XIcon /></button></td>}
                    <td>{editMode ? <input className="review-edit-input" type="date" value={e.date || ''} onChange={ev => editAdminField(i, 'date', ev.target.value)} /> : formatDate(e.date)}</td>
                    <td className="review-number">{editMode ? <input className="review-edit-input review-edit-input--narrow" value={e.hours || ''} onChange={ev => editAdminField(i, 'hours', ev.target.value)} /> : (e.hours || '—')}</td>
                    {editMode && <td><PencilIcon /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {editMode && (
              <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                onClick={addAdminEntry}><PlusIcon /> Add Row</button>
            )}
            <div className="review-subtotal">{total} hrs</div>
          </>
        ) : isEditing ? (
          <>
            <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
              onClick={addAdminEntry}><PlusIcon /> Add Row</button>
            <div className="review-subtotal" style={{ color: 'var(--text-muted)' }}>0 hrs</div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.25rem 0' }}>No entries · 0 hrs</div>
        )}
      </div>
    )
  }

  // ── Supervision rendering (always shown, with edit/add) ──
  function renderSupervision() {
    const sup = data.supervision || {}
    const indiv = sup.individual || []
    const group = sup.group || []
    const totalSessions = indiv.length + group.length
    return (
      <div className="review-section">
        <div className="review-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h4 style={{ margin: 0 }}>Supervision</h4>
          {isReceived && !isEditing && (
            <button className="btn btn--ghost btn--small" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', lineHeight: 1 }}
              onClick={() => quickAdd(b => { if (!b.supervision) b.supervision = {}; if (!b.supervision.individual) b.supervision.individual = []; b.supervision.individual.push({ supervisor_name: '', date: '' }) })}>
              <PlusIcon /> Add
            </button>
          )}
        </div>
        {/* Individual */}
        <div className="review-subsection">
          <div className="review-subsection-label">Individual</div>
          {indiv.length > 0 ? (
            <>
              <table className="review-table">
                <thead><tr>{removeMode && <th style={{ width: 30 }}></th>}<th>Date</th><th>Supervisor</th>{editMode && <th style={{ width: 20 }}></th>}</tr></thead>
                <tbody>
                  {indiv.map((e, i) => (
                    <tr key={i}>
                      {removeMode && <td><button className="review-remove-x" onClick={() => removeSupIndivEntry(i)}><XIcon /></button></td>}
                      <td>{editMode ? <input className="review-edit-input" type="date" value={e.date || ''} onChange={ev => editSupIndivField(i, 'date', ev.target.value)} /> : formatDate(e.date)}</td>
                      <td>{editMode ? <input className="review-edit-input" value={e.supervisor_name || ''} onChange={ev => editSupIndivField(i, 'supervisor_name', ev.target.value)} /> : (e.supervisor_name || '—')}</td>
                      {editMode && <td><PencilIcon /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {editMode && (
                <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                  onClick={() => addSupervisionEntry('individual')}><PlusIcon /> Add Row</button>
              )}
              <div className="review-subtotal">{indiv.length} session{indiv.length !== 1 ? 's' : ''}</div>
            </>
          ) : isEditing ? (
            <>
              <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                onClick={() => addSupervisionEntry('individual')}><PlusIcon /> Add Row</button>
              <div className="review-subtotal" style={{ color: 'var(--text-muted)' }}>0 sessions</div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.25rem 0' }}>No entries · 0 sessions</div>
          )}
        </div>
        {/* Group */}
        <div className="review-subsection">
          <div className="review-subsection-label">Group</div>
          {group.length > 0 ? (
            <>
              <table className="review-table">
                <thead><tr>{removeMode && <th style={{ width: 30 }}></th>}<th>Date</th><th>Supervisees</th>{editMode && <th style={{ width: 20 }}></th>}</tr></thead>
                <tbody>
                  {group.map((e, i) => (
                    <tr key={i}>
                      {removeMode && <td><button className="review-remove-x" onClick={() => removeSupGroupEntry(i)}><XIcon /></button></td>}
                      <td>{editMode ? <input className="review-edit-input" type="date" value={e.date || ''} onChange={ev => editSupGroupField(i, 'date', ev.target.value)} /> : formatDate(e.date)}</td>
                      <td>{editMode ? <input className="review-edit-input" value={(e.supervisee_names || []).join(', ')} onChange={ev => editSupGroupField(i, 'supervisee_names', ev.target.value.split(',').map(s => s.trim()).filter(Boolean))} /> : ((e.supervisee_names || []).join(', ') || '—')}</td>
                      {editMode && <td><PencilIcon /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {editMode && (
                <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                  onClick={() => addSupervisionEntry('group')}><PlusIcon /> Add Row</button>
              )}
              <div className="review-subtotal">{group.length} session{group.length !== 1 ? 's' : ''}</div>
            </>
          ) : isEditing ? (
            <>
              <button className="btn btn--ghost btn--small" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                onClick={() => addSupervisionEntry('group')}><PlusIcon /> Add Row</button>
              <div className="review-subtotal" style={{ color: 'var(--text-muted)' }}>0 sessions</div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.25rem 0' }}>No entries · 0 sessions</div>
          )}
        </div>
      </div>
    )
  }

  // ── Sick Leave (always shown, editable) ──
  function renderSickLeave() {
    const sick = data.sick_leave || {}
    const hrs = parseFloat(sick.hours) || 0
    const hasSickHours = hrs > 0
    const originalHadSick = recipient.invoice_data?.sick_leave && parseFloat(recipient.invoice_data.sick_leave.hours) > 0
    // Sick leave counts if: admin approved the request, OR admin added it themselves (not in original)
    const sickCounts = hasSickHours && (sickDecision === 'approve' || !originalHadSick)
    return (
      <div className="review-section">
        <h4 className="review-section-title" style={{ marginBottom: '0.5rem' }}>Sick Leave</h4>
        {editMode ? (
          <div className="review-leave-detail">
            <div className="review-leave-row">
              <span className="review-leave-label">Date:</span>
              <input className="review-edit-input" type="date" value={sick.date || ''} onChange={ev => editSickField('date', ev.target.value)} style={{ width: 160 }} />
            </div>
            <div className="review-leave-row" style={{ marginTop: '0.375rem' }}>
              <span className="review-leave-label">Hours:</span>
              <input className="review-edit-input review-edit-input--narrow" value={sick.hours || ''} onChange={ev => editSickField('hours', ev.target.value)} />
            </div>
            <div className="review-leave-row" style={{ marginTop: '0.375rem' }}>
              <span className="review-leave-label">Reason:</span>
              <input className="review-edit-input" value={sick.reason || ''} onChange={ev => editSickField('reason', ev.target.value)} style={{ width: 250 }} />
            </div>
          </div>
        ) : hasSickHours ? (
          <div className="review-leave-detail">
            <div className="review-leave-row">
              <span className="review-leave-label">Date:</span>
              <span>{formatDate(sick.date)}</span>
            </div>
            <div className="review-leave-row" style={{ marginTop: '0.375rem' }}>
              <span className="review-leave-label">Hours requested:</span>
              <span className="review-number">{hrs}</span>
            </div>
            {sick.reason && <div className="review-leave-note" style={{ marginTop: '0.5rem' }}>Reason: {sick.reason}</div>}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.25rem 0' }}>
            No sick leave · 0 hrs
            {isReceived && !isEditing && (
              <button className="btn btn--ghost btn--small" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', lineHeight: 1, marginLeft: '0.5rem' }}
                onClick={() => quickAdd(b => { b.sick_leave = { date: '', hours: '', reason: '' } })}>
                <PlusIcon /> Add
              </button>
            )}
          </div>
        )}
        {hasSickHours && originalHadSick && isReceived && (
          <div className="review-sick-choices">
            <label className={`review-sick-choice ${sickDecision === 'approve' ? 'review-sick-choice--active' : ''}`}>
              <input type="radio" name="sick_decision" checked={sickDecision === 'approve'} onChange={() => setSickDecision('approve')} />
              <span>Approve</span>
            </label>
            <label className={`review-sick-choice review-sick-choice--deny ${sickDecision === 'disapprove' ? 'review-sick-choice--active-deny' : ''}`}>
              <input type="radio" name="sick_decision" checked={sickDecision === 'disapprove'} onChange={handleSickDisapprove} />
              <span>Disapprove</span>
            </label>
          </div>
        )}
        <div className="review-subtotal">{sickCounts ? <>{hrs} hrs</> : <span style={{ color: 'var(--text-muted)' }}>{hasSickHours ? 'Pending decision' : '0 hrs'}</span>}</div>
      </div>
    )
  }

  // ── PTO (always shown, editable) ──
  function renderPTO() {
    const pto = data.pto || {}
    const hrs = parseFloat(pto.hours) || 0
    return (
      <div className="review-section">
        <h4 className="review-section-title">Paid Time Off</h4>
        {editMode ? (
          <div className="review-leave-detail">
            <div className="review-leave-row">
              <span className="review-leave-label">Hours:</span>
              <input className="review-edit-input review-edit-input--narrow" value={pto.hours || ''} onChange={ev => editPtoField('hours', ev.target.value)} />
            </div>
          </div>
        ) : hrs > 0 ? (
          <div className="review-leave-detail">
            <div className="review-leave-row">
              <span className="review-leave-label">Hours:</span>
              <span className="review-number">{hrs}</span>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.25rem 0' }}>
            No PTO · 0 hrs
            {isReceived && !isEditing && (
              <button className="btn btn--ghost btn--small" style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', lineHeight: 1, marginLeft: '0.5rem' }}
                onClick={() => quickAdd(b => { b.pto = { hours: '' } })}>
                <PlusIcon /> Add
              </button>
            )}
          </div>
        )}
        <div className="review-subtotal">{hrs} hrs</div>
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
    const op = data.op || {}
    total += (op.sessions || []).length
    const sbys = data.sbys || []
    sbys.forEach(e => { total += parseFloat(e.hours) || 0 })
    const ados = data.ados || []
    total += ados.length * 3
    // APN
    const apn = data.apn || []
    apn.forEach(e => { total += parseFloat(e.hours) || 0 })
    const admin = data.admin || []
    admin.forEach(e => { total += parseFloat(e.hours) || 0 })
    const sup = data.supervision || {}
    total += (sup.individual || []).length + (sup.group || []).length
    // Sick leave: counts if admin approved OR if admin added it (not in original submission)
    const sickHrs = parseFloat(data.sick_leave?.hours) || 0
    const originalHadSick = recipient.invoice_data?.sick_leave && parseFloat(recipient.invoice_data.sick_leave.hours) > 0
    if (sickHrs > 0 && (sickDecision === 'approve' || !originalHadSick)) total += sickHrs
    total += parseFloat(data.pto?.hours) || 0
    return total
  }

  return (
    <div>
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

      {isReceived && (
        <div className="review-action-bar">
          <button className="btn btn--primary" onClick={handleApprove} disabled={processing}>
            {processing ? 'Processing…' : '✓ Approve'}
          </button>
          {!isEditing ? (
            <>
              <button className="btn btn--ghost" onClick={startEdit}>Edit / Add Items</button>
              <button className="btn btn--ghost" onClick={startRemove}>Remove Line Items</button>
            </>
          ) : (
            <>
              <button className="btn btn--primary" onClick={saveEdits} disabled={processing}>Save Changes</button>
              <button className="btn btn--ghost" onClick={cancelEditRemove}>Cancel</button>
            </>
          )}
          <button className="btn btn--danger-ghost" onClick={() => setShowReject(true)}>Reject</button>
        </div>
      )}

      {recipient.status === 'approved' && (
        <div className="review-action-bar">
          <button className="btn btn--ghost" onClick={handleUnapprove} disabled={processing} style={{ color: 'var(--warning-text, #fbbf24)' }}>
            {processing ? 'Processing…' : '↩ Revert to Received'}
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reverts approval so you can re-edit and re-approve</span>
        </div>
      )}

      <div className="review-grid">
        <div className="review-main">
          {renderIIC()}
          {renderOP()}
          {renderSBYS()}
          {renderADOS()}
          {renderAPN()}
          {renderAdmin()}
          {renderSupervision()}
          {renderSickLeave()}
          {renderPTO()}

          {data.notes && (
            <div className="review-section">
              <h4 className="review-section-title">Notes</h4>
              <div className="review-notes-text">{data.notes}</div>
            </div>
          )}

          <div className="review-grand-total">
            <span>Total Hours Worked</span>
            <span className="review-grand-total-value">{calcGrandTotal()}</span>
          </div>
        </div>

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
              <textarea className="form-input" rows="3" value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Type a note or question…" style={{ resize: 'vertical', fontSize: '0.825rem' }} />
              <button className="btn btn--primary btn--small" onClick={sendNote} disabled={sendingNote || !noteText.trim()} style={{ alignSelf: 'flex-end', marginTop: '0.5rem' }}>
                {sendingNote ? 'Sending…' : 'Send Note'}
              </button>
            </div>
          </div>

          <div className="review-sidebar-card">
            <h4 className="review-sidebar-title">Submission Info</h4>
            <div className="review-info-row"><span className="review-info-label">Status</span><StatusBadge status={recipient.status} /></div>
            <div className="review-info-row"><span className="review-info-label">Pay Period</span><span>{recipient.period_label || `${formatDate(recipient.period_start)} – ${formatDate(recipient.period_end)}`}</span></div>
            <div className="review-info-row"><span className="review-info-label">Submitted</span><span>{formatDateTime(recipient.submitted_at)}</span></div>
            <div className="review-info-row"><span className="review-info-label">Total Hours</span><span style={{ fontWeight: 600, color: 'var(--accent)' }}>{calcGrandTotal()}</span></div>
          </div>
        </div>
      </div>

      <Modal open={showReject} onClose={() => { setShowReject(false); setRejectReason('') }} title="Reject Submission">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>This will send the invoice back to the provider. Please provide a reason.</p>
        <textarea className="form-input" rows="3" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection…" style={{ resize: 'vertical', marginBottom: '1rem' }} />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn--secondary" onClick={() => setShowReject(false)}>Cancel</button>
          <button className="btn btn--danger" onClick={handleReject} disabled={processing}>Reject</button>
        </div>
      </Modal>

      <Modal open={showZeroPrompt} onClose={() => { setShowZeroPrompt(false); setZeroReason('') }} title="Zero Hours Detected">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>This invoice has zero total hours. To approve it, please provide a reason.</p>
        <textarea className="form-input" rows="3" value={zeroReason} onChange={e => setZeroReason(e.target.value)} placeholder="Reason for zero hours…" style={{ resize: 'vertical', marginBottom: '1rem' }} />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn--secondary" onClick={() => setShowZeroPrompt(false)}>Cancel</button>
          <button className="btn btn--primary" onClick={handleZeroApprove} disabled={processing}>Approve as Zero Hours</button>
        </div>
      </Modal>

      <Modal open={showSickDisapprove} onClose={() => { setShowSickDisapprove(false); setSickDisapproveReason(''); setSickDecision(null) }} title="Disapprove Sick Leave">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>Please provide a reason. This will be sent back to the provider.</p>
        <textarea className="form-input" rows="3" value={sickDisapproveReason} onChange={e => setSickDisapproveReason(e.target.value)} placeholder="Reason for disapproval…" style={{ resize: 'vertical', marginBottom: '1rem' }} />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn--secondary" onClick={() => { setShowSickDisapprove(false); setSickDecision(null) }}>Cancel</button>
          <button className="btn btn--danger" onClick={confirmSickDisapprove} disabled={sendingNote}>Disapprove</button>
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

  if (selected) {
    return <ReviewPage recipient={selected} onBack={() => setSelected(null)} onUpdate={loadRecipients} />
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Approval Queue</h2>
      </div>

      <div className="filter-tabs">
        {['received', 'approved', 'rejected', 'all'].map(f => (
          <button key={f} className={`filter-tab ${filter === f ? 'filter-tab--active' : ''}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
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
