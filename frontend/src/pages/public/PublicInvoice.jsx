import { useState, useEffect } from 'react'
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

// ── IIC valid hours ──
const IIC_HOUR_OPTIONS = ['.25', '.5', '.75', '1', '1.25', '1.5', '1.75', '2', '2.25', '2.5', '2.75', '3']

const IIC_CODES = [
  { code: 'IICLC-H0036TJU1', label: 'LPC/LCSW' },
  { code: 'IICMA-H0036TJU2', label: 'LAC/LSW' },
  { code: 'BA-H2014TJ', label: 'Behavioral Assistant' },
]

const SICK_LEAVE_SUMMARY = `• Accrual: 0.0333 hrs per hour worked (max 40 hrs/year)
• Use: Personal illness, injury, medical appointments, or care for immediate family
• Minimum increment: 1 hour
• Documentation required if absent 3+ consecutive days
• Unused hours carry over (up to 40 hrs), no payout upon separation
• Rate calculated as the average of your combined pay types`

const SICK_LEAVE_FULL_POLICY = `Sick Leave Policy

Purpose: This policy provides guidelines for employees to utilize sick leave benefits when unable to work due to illness or injury, supporting employee well-being and ensuring continuity of quality services.

Eligibility: All regular full-time and part-time employees are eligible. Temporary employees, independent contractors, interns, and consultants are not eligible.

Accrual: Employees accrue sick leave at 0.0333 hours per hour worked, on a pro-rata basis beginning on the first day of employment.

Maximum Accrual: Employees may accrue up to 40 hours per calendar year. Once the limit is reached, no further accrual occurs until existing balance is used.

Requesting Sick Leave Pay: Submit a sick leave request on your invoice form with dates and hours requested.

Notification: Notify your immediate supervisor or designated contact as early as possible. If illness prevents prior notice, notify as soon as reasonably possible.

Documentation: Absences exceeding 3 consecutive work days may require a medical certificate. BestLife reserves the right to request documentation for any absence.

Use: Accrued sick leave may be used for personal illness, injury, medical appointments, or to care for immediate family (spouse, domestic partner, child, parent, sibling, grandparent, or household member).

Usage Increment: Minimum of 1 hour, up to available balance.

Carryover & Payout: Unused hours carry over up to 40 hours. No payout upon termination, resignation, or retirement. Rate is calculated as the average of combined pay types.

Abuse: BestLife reserves the right to investigate suspected abuse. Confirmed abuse may result in disciplinary action up to termination.

Compliance: This policy complies with all applicable federal, state, and local laws.`

// ── Collapsible Section Component ──
function Section({ title, total, totalLabel, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="invoice-section">
      <button type="button" className="invoice-section-header" onClick={() => setOpen(!open)}>
        <span className="invoice-section-title">{title}</span>
        {total !== undefined && total !== null && (
          <span className="invoice-section-total">{total} {totalLabel || 'hrs'}</span>
        )}
        <svg className={`invoice-section-chevron ${open ? 'invoice-section-chevron--open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && <div className="invoice-section-body">{children}</div>}
    </div>
  )
}

// ── Main Component ──
export default function PublicInvoice() {
  const { draftToken } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)

  // ── Section state ──
  const [iic, setIic] = useState({ 'IICLC-H0036TJU1': [], 'IICMA-H0036TJU2': [], 'BA-H2014TJ': [] })
  const [op, setOp] = useState([])
  const [opCount, setOpCount] = useState('')
  const [opGenerated, setOpGenerated] = useState(false)
  const [sbys, setSbys] = useState([])
  const [ados, setAdos] = useState([])
  const [adosCount, setAdosCount] = useState('')
  const [adosGenerated, setAdosGenerated] = useState(false)
  const [adminEntries, setAdminEntries] = useState([])
  const [supervisionIndiv, setSupervisionIndiv] = useState([])
  const [supervisionGroup, setSupervisionGroup] = useState([])
  const [sickLeave, setSickLeave] = useState({ date: '', hours: '', policyAck: false })
  const [pto, setPto] = useState({ hours: '' })
  const [notes, setNotes] = useState('')
  const [showFullPolicy, setShowFullPolicy] = useState(false)

  // ── IIC hours validation ──
  const [iicHoursError, setIicHoursError] = useState({})

  useEffect(() => { loadInvoice() }, [draftToken])

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
        // Restore draft
        if (result.draft_data) {
          const d = result.draft_data
          if (d.iic) setIic(prev => ({ ...prev, ...d.iic }))
          if (d.op?.sessions) { setOp(d.op.sessions); setOpGenerated(true) }
          if (d.sbys) setSbys(d.sbys)
          if (d.ados) { setAdos(d.ados); setAdosGenerated(true) }
          if (d.admin) setAdminEntries(d.admin)
          if (d.supervision?.individual) setSupervisionIndiv(d.supervision.individual)
          if (d.supervision?.group) setSupervisionGroup(d.supervision.group)
          if (d.sick_leave) setSickLeave(d.sick_leave)
          if (d.pto) setPto(d.pto)
          if (d.notes) setNotes(d.notes)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function markDirty() { setDraftSaved(false) }

  // ── Build submit data ──
  function buildInvoiceData() {
    return {
      iic,
      op: { sessions: op },
      sbys,
      ados,
      admin: adminEntries,
      supervision: { individual: supervisionIndiv, group: supervisionGroup },
      sick_leave: sickLeave,
      pto,
      notes,
    }
  }

  // ── Totals ──
  function iicTotal() {
    return Object.values(iic).flat().reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)
  }
  function opTotal() { return op.length }
  function opSessionCount() { return op.filter(e => !e.cancel_fee).length }
  function opCancelCount() { return op.filter(e => e.cancel_fee).length }
  function sbysTotal() { return sbys.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0) }
  function adosTotal() { return ados.length }
  function adosInHomeCount() { return ados.filter(e => e.location === 'In home').length }
  function adosAtOfficeCount() { return ados.filter(e => e.location === 'At office').length }
  function adminTotal() { return adminEntries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0) }
  function supervisionTotal() { return supervisionIndiv.length + supervisionGroup.length }
  function sickTotal() { return parseFloat(sickLeave.hours) || 0 }
  function ptoTotal() { return parseFloat(pto.hours) || 0 }
  function grandTotal() {
    return iicTotal() + sbysTotal() + adminTotal() + supervisionTotal() + sickTotal() + ptoTotal()
  }

  // ── IIC helpers ──
  function addIicClient(code) {
    setIic(prev => ({ ...prev, [code]: [...prev[code], { cyber_initials: '', date: '', hours: '' }] }))
    markDirty()
  }
  function updateIicClient(code, idx, field, value) {
    setIic(prev => {
      const arr = [...prev[code]]
      arr[idx] = { ...arr[idx], [field]: value }
      return { ...prev, [code]: arr }
    })
    markDirty()
    if (field === 'hours') {
      const key = `${code}-${idx}`
      setIicHoursError(prev => ({ ...prev, [key]: false }))
    }
  }
  function removeIicClient(code, idx) {
    setIic(prev => ({ ...prev, [code]: prev[code].filter((_, i) => i !== idx) }))
    markDirty()
  }
  function validateIicHours(code, idx, value) {
    const key = `${code}-${idx}`
    if (value && !IIC_HOUR_OPTIONS.includes(value)) {
      setIicHoursError(prev => ({ ...prev, [key]: true }))
    }
  }

  // ── OP helpers ──
  function generateOpRows() {
    const count = parseInt(opCount) || 0
    if (count <= 0) return
    setOp(Array.from({ length: count }, () => ({ client_initials: '', date: '', cancel_fee: false })))
    setOpGenerated(true)
    markDirty()
  }
  function addOpRow() {
    setOp(prev => [...prev, { client_initials: '', date: '', cancel_fee: false }])
    markDirty()
  }
  function updateOp(idx, field, value) {
    setOp(prev => { const a = [...prev]; a[idx] = { ...a[idx], [field]: value }; return a })
    markDirty()
  }
  function removeOp(idx) { setOp(prev => prev.filter((_, i) => i !== idx)); markDirty() }

  // ── SBYS helpers ──
  function addSbys() { setSbys(prev => [...prev, { date: '', hours: '' }]); markDirty() }
  function updateSbys(idx, field, value) {
    setSbys(prev => { const a = [...prev]; a[idx] = { ...a[idx], [field]: value }; return a })
    markDirty()
  }
  function removeSbys(idx) { setSbys(prev => prev.filter((_, i) => i !== idx)); markDirty() }

  // ── ADOS helpers ──
  function generateAdosRows() {
    const count = parseInt(adosCount) || 0
    if (count <= 0) return
    setAdos(Array.from({ length: count }, () => ({ client_initials: '', location: 'In home', id_number: '', date: '' })))
    setAdosGenerated(true)
    markDirty()
  }
  function addAdosRow() {
    setAdos(prev => [...prev, { client_initials: '', location: 'In home', id_number: '', date: '' }])
    markDirty()
  }
  function updateAdos(idx, field, value) {
    setAdos(prev => { const a = [...prev]; a[idx] = { ...a[idx], [field]: value }; return a })
    markDirty()
  }
  function removeAdos(idx) { setAdos(prev => prev.filter((_, i) => i !== idx)); markDirty() }

  // ── Admin helpers ──
  function addAdmin() { setAdminEntries(prev => [...prev, { date: '', hours: '' }]); markDirty() }
  function updateAdmin(idx, field, value) {
    setAdminEntries(prev => { const a = [...prev]; a[idx] = { ...a[idx], [field]: value }; return a })
    markDirty()
  }
  function removeAdmin(idx) { setAdminEntries(prev => prev.filter((_, i) => i !== idx)); markDirty() }

  // ── Supervision helpers ──
  function addSupervisionIndiv() {
    setSupervisionIndiv(prev => [...prev, { date: '', supervisee_id: '', supervisee_name: '' }])
    markDirty()
  }
  function updateSupervisionIndiv(idx, field, value) {
    setSupervisionIndiv(prev => {
      const a = [...prev]; a[idx] = { ...a[idx], [field]: value }
      // Auto-fill name when selecting from dropdown
      if (field === 'supervisee_id' && data?.supervisees) {
        const s = data.supervisees.find(s => s.id === value)
        if (s) a[idx].supervisee_name = s.name
      }
      return a
    })
    markDirty()
  }
  function removeSupervisionIndiv(idx) { setSupervisionIndiv(prev => prev.filter((_, i) => i !== idx)); markDirty() }

  function addSupervisionGroup() {
    setSupervisionGroup(prev => [...prev, { date: '', supervisee_ids: [], supervisee_names: [] }])
    markDirty()
  }
  function updateSupervisionGroupDate(idx, value) {
    setSupervisionGroup(prev => { const a = [...prev]; a[idx] = { ...a[idx], date: value }; return a })
    markDirty()
  }
  function toggleGroupSupervisee(idx, supervisee) {
    setSupervisionGroup(prev => {
      const a = [...prev]
      const entry = { ...a[idx] }
      const ids = [...(entry.supervisee_ids || [])]
      const names = [...(entry.supervisee_names || [])]
      const sIdx = ids.indexOf(supervisee.id)
      if (sIdx >= 0) {
        ids.splice(sIdx, 1)
        names.splice(sIdx, 1)
      } else {
        ids.push(supervisee.id)
        names.push(supervisee.name)
      }
      entry.supervisee_ids = ids
      entry.supervisee_names = names
      a[idx] = entry
      return a
    })
    markDirty()
  }
  function removeSupervisionGroup(idx) { setSupervisionGroup(prev => prev.filter((_, i) => i !== idx)); markDirty() }

  // ── Save & Submit ──
  async function handleSaveDraft() {
    setSaving(true)
    setError('')
    try {
      await pubPost(`/public/invoice/${draftToken}/save-draft`, { invoice_data: buildInvoiceData() })
      setDraftSaved(true)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function handleSubmit() {
    setError('')
    // Validate IIC
    for (const [code, entries] of Object.entries(iic)) {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]
        if (!e.cyber_initials?.trim()) { setError(`IIC ${code}: Cyber # / Initials required for entry ${i + 1}`); return }
        if (!e.date) { setError(`IIC ${code}: Date required for entry ${i + 1}`); return }
        if (!e.hours || !IIC_HOUR_OPTIONS.includes(String(e.hours))) { setError(`IIC ${code}: Valid hours required for entry ${i + 1} (${IIC_HOUR_OPTIONS.join(', ')})`); return }
      }
    }
    // Validate OP
    for (let i = 0; i < op.length; i++) {
      if (!op[i].client_initials?.trim()) { setError(`OP: Client initials required for session ${i + 1}`); return }
      if (!op[i].date) { setError(`OP: Date required for session ${i + 1}`); return }
    }
    // Validate SBYS
    for (let i = 0; i < sbys.length; i++) {
      if (!sbys[i].date) { setError(`SBYS: Date required for entry ${i + 1}`); return }
      if (!sbys[i].hours || parseFloat(sbys[i].hours) <= 0) { setError(`SBYS: Hours required for entry ${i + 1}`); return }
    }
    // Validate ADOS
    for (let i = 0; i < ados.length; i++) {
      if (!ados[i].client_initials?.trim()) { setError(`ADOS: Client initials required for entry ${i + 1}`); return }
      if (!ados[i].date) { setError(`ADOS: Date required for entry ${i + 1}`); return }
    }
    // Validate Admin
    for (let i = 0; i < adminEntries.length; i++) {
      if (!adminEntries[i].date) { setError(`Administration: Date required for entry ${i + 1}`); return }
      if (!adminEntries[i].hours || parseFloat(adminEntries[i].hours) <= 0) { setError(`Administration: Hours required for entry ${i + 1}`); return }
    }
    // Validate Supervision
    for (let i = 0; i < supervisionIndiv.length; i++) {
      if (!supervisionIndiv[i].date) { setError(`Supervision: Date required for individual session ${i + 1}`); return }
      if (!supervisionIndiv[i].supervisee_id) { setError(`Supervision: Supervisee required for individual session ${i + 1}`); return }
    }
    for (let i = 0; i < supervisionGroup.length; i++) {
      if (!supervisionGroup[i].date) { setError(`Supervision: Date required for group session ${i + 1}`); return }
      if (!supervisionGroup[i].supervisee_ids?.length) { setError(`Supervision: Select attendees for group session ${i + 1}`); return }
    }
    // Validate Sick Leave
    if (sickLeave.hours && parseFloat(sickLeave.hours) > 0) {
      if (!sickLeave.date) { setError('Sick Leave: Date required'); return }
      if (!sickLeave.policyAck) { setError('Sick Leave: You must acknowledge the sick leave policy'); return }
    }
    // Check at least something was entered
    const hasData = Object.values(iic).some(a => a.length > 0) || op.length > 0 || sbys.length > 0 ||
      ados.length > 0 || adminEntries.length > 0 || supervisionIndiv.length > 0 || supervisionGroup.length > 0 ||
      (sickLeave.hours && parseFloat(sickLeave.hours) > 0) || (pto.hours && parseFloat(pto.hours) > 0)
    if (!hasData) { setError('Please add at least one entry before submitting.'); return }

    setSubmitting(true)
    try {
      await pubPost(`/public/invoice/${draftToken}/submit`, {
        submit_token: data.submit_token,
        invoice_data: buildInvoiceData(),
      })
      setSubmitted(true)
    } catch (err) { setError(err.message) }
    finally { setSubmitting(false) }
  }

  // ── Render ──
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
            <h1>Payroll Invoice</h1>
          </div>
          <div className="public-invoice-success">
            <div className="invoice-success-checkmark">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="22" stroke="var(--accent)" strokeWidth="3" fill="rgba(0,187,238,0.1)" />
                <polyline points="14,25 21,32 34,18" stroke="var(--accent)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 style={{ color: 'var(--accent)' }}>Invoice Submitted</h2>
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
          <div className="public-invoice-header"><h1>Payroll Invoice</h1></div>
          <div className="public-invoice-error">{error}</div>
        </div>
      </div>
    )
  }

  const isCliLeader = data?.user_role === 'clinical_leader'

  return (
    <div className="public-invoice-page">
      <div className="public-invoice-card">
        <div className="public-invoice-header">
          <h1>Payroll Invoice</h1>
          <p className="public-invoice-subtitle">{data.user_name} &mdash; {data.period_label}</p>
          {data.due_date && <p className="public-invoice-muted">Due: {new Date(data.due_date + 'T00:00:00').toLocaleDateString()}</p>}
        </div>

        {error && <div className="public-invoice-error">{error}</div>}

        {/* ═══ IIC Section ═══ */}
        <Section title="IIC Sessions" total={iicTotal()} totalLabel="hrs">
          {IIC_CODES.map(({ code, label }) => (
            <div key={code} className="invoice-subgroup">
              <div className="invoice-subgroup-header">
                <span className="invoice-subgroup-title">{label}</span>
                <span className="invoice-subgroup-code">{code}</span>
                {iic[code].length > 0 && (
                  <span className="invoice-section-total">
                    {iic[code].reduce((s, e) => s + (parseFloat(e.hours) || 0), 0)} hrs
                  </span>
                )}
              </div>
              {iic[code].map((entry, idx) => (
                <div key={idx} className="invoice-entry">
                  <div className="invoice-entry-fields">
                    <div className="form-field invoice-field-md">
                      <label>Cyber # / Initials</label>
                      <input type="text" value={entry.cyber_initials} onChange={e => updateIicClient(code, idx, 'cyber_initials', e.target.value)} placeholder="12345/AD" />
                    </div>
                    <div className="form-field invoice-field-md">
                      <label>Date</label>
                      <input type="date" value={entry.date} onChange={e => updateIicClient(code, idx, 'date', e.target.value)} />
                    </div>
                    <div className="form-field invoice-field-sm">
                      <label>Hours</label>
                      <input
                        list={`iic-hours-${code}-${idx}`}
                        type="text"
                        value={entry.hours}
                        onChange={e => updateIicClient(code, idx, 'hours', e.target.value)}
                        onBlur={e => validateIicHours(code, idx, e.target.value)}
                        placeholder="1"
                        className={iicHoursError[`${code}-${idx}`] ? 'input-error' : ''}
                      />
                      <datalist id={`iic-hours-${code}-${idx}`}>
                        {IIC_HOUR_OPTIONS.map(h => <option key={h} value={h} />)}
                      </datalist>
                      {iicHoursError[`${code}-${idx}`] && <span className="field-error">Use: {IIC_HOUR_OPTIONS.join(', ')}</span>}
                    </div>
                    <button type="button" className="invoice-remove-btn" onClick={() => removeIicClient(code, idx)} title="Remove">&times;</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn--small btn--ghost invoice-add-btn" onClick={() => addIicClient(code)}>+ Add Client</button>
            </div>
          ))}
        </Section>

        {/* ═══ OP Section ═══ */}
        <Section title="OP Sessions" total={opTotal()} totalLabel="sessions">
          {!opGenerated ? (
            <div className="invoice-generate-row">
              <label>Total # of completed OP sessions:</label>
              <input type="number" min="1" value={opCount} onChange={e => setOpCount(e.target.value)} placeholder="0" style={{ width: '80px' }} />
              <button type="button" className="btn btn--small btn--primary" onClick={generateOpRows} disabled={!opCount || parseInt(opCount) <= 0}>Generate</button>
            </div>
          ) : (
            <>
              <div className="invoice-disclaimer">
                <strong>Outpatient Cancellations</strong> * This ONLY pertains to no call / no shows that gave less than 24hr notice, and is at your discretion. Clients added to this list are CHARGED the cancellation fee - $50.00. Do not add clients you do not wish to charge.
              </div>
              {op.map((entry, idx) => (
                <div key={idx} className="invoice-entry">
                  <div className="invoice-entry-fields">
                    <div className="form-field invoice-field-sm">
                      <label>Client Initials</label>
                      <input type="text" maxLength={5} value={entry.client_initials} onChange={e => updateOp(idx, 'client_initials', e.target.value.toUpperCase())} placeholder="AB" />
                    </div>
                    <div className="form-field invoice-field-md">
                      <label>Date</label>
                      <input type="date" value={entry.date} onChange={e => updateOp(idx, 'date', e.target.value)} />
                    </div>
                    <div className="form-field">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={entry.cancel_fee} onChange={e => updateOp(idx, 'cancel_fee', e.target.checked)} />
                        Charge Cancellation Fee
                      </label>
                    </div>
                    <button type="button" className="invoice-remove-btn" onClick={() => removeOp(idx)} title="Remove">&times;</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn--small btn--ghost invoice-add-btn" onClick={addOpRow}>+ Add Session</button>
            </>
          )}
        </Section>

        {/* ═══ SBYS Section ═══ */}
        <Section title="School Based Youth Services" total={sbysTotal()} totalLabel="hrs">
          {sbys.map((entry, idx) => (
            <div key={idx} className="invoice-entry">
              <div className="invoice-entry-fields">
                <div className="form-field invoice-field-md">
                  <label>Date Worked</label>
                  <input type="date" value={entry.date} onChange={e => updateSbys(idx, 'date', e.target.value)} />
                </div>
                <div className="form-field invoice-field-sm">
                  <label>Hours</label>
                  <input type="number" step="0.25" min="0" value={entry.hours} onChange={e => updateSbys(idx, 'hours', e.target.value)} placeholder="0" />
                </div>
                <button type="button" className="invoice-remove-btn" onClick={() => removeSbys(idx)} title="Remove">&times;</button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn--small btn--ghost invoice-add-btn" onClick={addSbys}>+ Add Day</button>
        </Section>

        {/* ═══ ADOS Section ═══ */}
        <Section title="ADOS Assessments" total={adosTotal()} totalLabel="assessments">
          {!adosGenerated ? (
            <div className="invoice-generate-row">
              <label>Total # of completed ADOS Assessments:</label>
              <input type="number" min="1" value={adosCount} onChange={e => setAdosCount(e.target.value)} placeholder="0" style={{ width: '80px' }} />
              <button type="button" className="btn btn--small btn--primary" onClick={generateAdosRows} disabled={!adosCount || parseInt(adosCount) <= 0}>Generate</button>
            </div>
          ) : (
            <>
              {ados.map((entry, idx) => (
                <div key={idx} className="invoice-entry">
                  <div className="invoice-entry-fields invoice-entry-fields--wrap">
                    <div className="form-field invoice-field-sm">
                      <label>Client Initials</label>
                      <input type="text" maxLength={5} value={entry.client_initials} onChange={e => updateAdos(idx, 'client_initials', e.target.value.toUpperCase())} placeholder="AB" />
                    </div>
                    <div className="form-field invoice-field-md">
                      <label>Location</label>
                      <select value={entry.location} onChange={e => updateAdos(idx, 'location', e.target.value)}>
                        <option value="In home">In home</option>
                        <option value="At office">At office</option>
                      </select>
                    </div>
                    <div className="form-field invoice-field-sm">
                      <label>ID #</label>
                      <input type="text" value={entry.id_number} onChange={e => updateAdos(idx, 'id_number', e.target.value)} placeholder="Optional" />
                    </div>
                    <div className="form-field invoice-field-md">
                      <label>Date</label>
                      <input type="date" value={entry.date} onChange={e => updateAdos(idx, 'date', e.target.value)} />
                    </div>
                    <button type="button" className="invoice-remove-btn" onClick={() => removeAdos(idx)} title="Remove">&times;</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn--small btn--ghost invoice-add-btn" onClick={addAdosRow}>+ Add Assessment</button>
            </>
          )}
        </Section>

        {/* ═══ Administration Section ═══ */}
        <Section title="Administration" total={adminTotal()} totalLabel="hrs">
          {adminEntries.map((entry, idx) => (
            <div key={idx} className="invoice-entry">
              <div className="invoice-entry-fields">
                <div className="form-field invoice-field-md">
                  <label>Date Worked</label>
                  <input type="date" value={entry.date} onChange={e => updateAdmin(idx, 'date', e.target.value)} />
                </div>
                <div className="form-field invoice-field-sm">
                  <label>Hours</label>
                  <input type="number" step="0.25" min="0" value={entry.hours} onChange={e => updateAdmin(idx, 'hours', e.target.value)} placeholder="0" />
                </div>
                <button type="button" className="invoice-remove-btn" onClick={() => removeAdmin(idx)} title="Remove">&times;</button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn--small btn--ghost invoice-add-btn" onClick={addAdmin}>+ Add Day</button>
        </Section>

        {/* ═══ Clinical Supervision (clinical leaders only) ═══ */}
        {isCliLeader && (
          <Section title="Clinical Supervision" total={supervisionTotal()} totalLabel="hrs">
            {/* Individual */}
            <div className="invoice-subgroup">
              <div className="invoice-subgroup-header">
                <span className="invoice-subgroup-title">Individual Supervision</span>
                <span className="invoice-subgroup-code">1 hr per session</span>
              </div>
              {supervisionIndiv.map((entry, idx) => (
                <div key={idx} className="invoice-entry">
                  <div className="invoice-entry-fields">
                    <div className="form-field invoice-field-md">
                      <label>Date</label>
                      <input type="date" value={entry.date} onChange={e => updateSupervisionIndiv(idx, 'date', e.target.value)} />
                    </div>
                    <div className="form-field invoice-field-lg">
                      <label>Supervisee</label>
                      <select value={entry.supervisee_id} onChange={e => updateSupervisionIndiv(idx, 'supervisee_id', e.target.value)}>
                        <option value="">Select...</option>
                        {(data?.supervisees || []).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className="invoice-remove-btn" onClick={() => removeSupervisionIndiv(idx)} title="Remove">&times;</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn--small btn--ghost invoice-add-btn" onClick={addSupervisionIndiv}>+ Add Individual Session</button>
            </div>

            {/* Group */}
            <div className="invoice-subgroup">
              <div className="invoice-subgroup-header">
                <span className="invoice-subgroup-title">Group Supervision</span>
                <span className="invoice-subgroup-code">1 hr per session</span>
              </div>
              {supervisionGroup.map((entry, idx) => (
                <div key={idx} className="invoice-entry">
                  <div className="invoice-entry-fields invoice-entry-fields--wrap">
                    <div className="form-field invoice-field-md">
                      <label>Date</label>
                      <input type="date" value={entry.date} onChange={e => updateSupervisionGroupDate(idx, e.target.value)} />
                    </div>
                    <div className="form-field invoice-field-full">
                      <label>Supervisees Attended</label>
                      <div className="invoice-multi-select">
                        {(data?.supervisees || []).map(s => (
                          <label key={s.id} className="checkbox-label invoice-checkbox-item">
                            <input
                              type="checkbox"
                              checked={(entry.supervisee_ids || []).includes(s.id)}
                              onChange={() => toggleGroupSupervisee(idx, s)}
                            />
                            {s.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    <button type="button" className="invoice-remove-btn" onClick={() => removeSupervisionGroup(idx)} title="Remove">&times;</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn--small btn--ghost invoice-add-btn" onClick={addSupervisionGroup}>+ Add Group Session</button>
            </div>
          </Section>
        )}

        {/* ═══ Sick Leave Section ═══ */}
        <Section title="Sick Leave" total={sickTotal()} totalLabel="hrs">
          <div className="invoice-disclaimer invoice-disclaimer--info">
            <strong>Sick Leave Policy</strong>
            <pre className="invoice-policy-text">{showFullPolicy ? SICK_LEAVE_FULL_POLICY : SICK_LEAVE_SUMMARY}</pre>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}
              onClick={() => setShowFullPolicy(prev => !prev)}
            >
              {showFullPolicy ? 'Hide Full Policy' : 'View Full Policy'}
            </button>
          </div>
          <div className="invoice-entry">
            <div className="invoice-entry-fields invoice-entry-fields--wrap">
              <div className="form-field invoice-field-md">
                <label>Date Missed</label>
                <input type="date" value={sickLeave.date} onChange={e => { setSickLeave(prev => ({ ...prev, date: e.target.value })); markDirty() }} />
              </div>
              <div className="form-field invoice-field-sm">
                <label>Hours Requested</label>
                <input type="number" step="0.5" min="0" value={sickLeave.hours} onChange={e => { setSickLeave(prev => ({ ...prev, hours: e.target.value })); markDirty() }} placeholder="0" />
              </div>
              <div className="form-field invoice-field-full">
                <label className="checkbox-label">
                  <input type="checkbox" checked={sickLeave.policyAck} onChange={e => { setSickLeave(prev => ({ ...prev, policyAck: e.target.checked })); markDirty() }} />
                  I confirm I meet the eligibility criteria for sick leave
                </label>
              </div>
            </div>
          </div>
        </Section>

        {/* ═══ PTO Section ═══ */}
        <Section title="Paid Time Off" total={ptoTotal()} totalLabel="hrs">
          <div className="invoice-entry">
            <div className="invoice-entry-fields">
              <div className="form-field invoice-field-sm">
                <label>Total Hours Requested</label>
                <input type="number" step="0.5" min="0" value={pto.hours} onChange={e => { setPto({ hours: e.target.value }); markDirty() }} placeholder="0" />
              </div>
            </div>
          </div>
        </Section>

        {/* ═══ Grand Total ═══ */}
        <div className="invoice-grand-total">
          <div className="invoice-grand-total-title">Summary</div>
          <div className="invoice-grand-total-rows">
            {iicTotal() > 0 && <div className="invoice-total-row"><span>IIC</span><span>{iicTotal()} hrs</span></div>}
            {opSessionCount() > 0 && <div className="invoice-total-row"><span>OP Sessions</span><span>{opSessionCount()}</span></div>}
            {opCancelCount() > 0 && <div className="invoice-total-row"><span>OP Cancellations</span><span>{opCancelCount()}</span></div>}
            {sbysTotal() > 0 && <div className="invoice-total-row"><span>SBYS</span><span>{sbysTotal()} hrs</span></div>}
            {adosInHomeCount() > 0 && <div className="invoice-total-row"><span>ADOS (In home)</span><span>{adosInHomeCount()}</span></div>}
            {adosAtOfficeCount() > 0 && <div className="invoice-total-row"><span>ADOS (At office)</span><span>{adosAtOfficeCount()}</span></div>}
            {adminTotal() > 0 && <div className="invoice-total-row"><span>Administration</span><span>{adminTotal()} hrs</span></div>}
            {isCliLeader && supervisionTotal() > 0 && <div className="invoice-total-row"><span>Supervision</span><span>{supervisionTotal()} hrs</span></div>}
            {sickTotal() > 0 && <div className="invoice-total-row"><span>Sick Leave</span><span>{sickTotal()} hrs</span></div>}
            {ptoTotal() > 0 && <div className="invoice-total-row"><span>PTO</span><span>{ptoTotal()} hrs</span></div>}
          </div>
          <div className="invoice-total-row invoice-total-row--grand">
            <span>Total Hours</span>
            <span>{grandTotal()}</span>
          </div>
        </div>

        {/* ═══ Notes ═══ */}
        <div className="form-field" style={{ marginTop: '1rem' }}>
          <label>Notes (optional)</label>
          <textarea rows={3} value={notes} onChange={e => { setNotes(e.target.value); markDirty() }} placeholder="Any notes for the admin..." />
        </div>

        {/* ═══ Actions ═══ */}
        <div className="public-invoice-actions">
          <button type="button" className="btn btn--ghost" onClick={handleSaveDraft} disabled={saving}>
            {saving ? 'Saving...' : draftSaved ? 'Draft Saved' : 'Save Draft'}
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}
