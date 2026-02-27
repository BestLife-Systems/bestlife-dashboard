import { useState, useEffect } from 'react'
import { apiGet, apiPatch } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import Modal from '../../components/Modal'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMonth(ym) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

function fmtDollar(v) {
  return '$' + Math.round(v || 0).toLocaleString()
}

function fmtPct(v) {
  return (v || 0).toFixed(1) + '%'
}

// Grouped pill categories (what shows on main page)
const PILL_GROUPS = [
  { key: 'IIC', label: 'IIC', members: ['IIC-LC', 'IIC-MA', 'IIC-BA'], color: '#00bbee', unit: 'h' },
  { key: 'OP', label: 'OP', members: ['OP'], color: '#4ade80', unit: 'h' },
  { key: 'SBYS', label: 'SBYS', members: ['SBYS'], color: '#a78bfa', unit: 'h' },
  { key: 'ADOS', label: 'ADOS', members: ['ADOS In Home', 'ADOS At Office'], color: '#fbbf24', unit: 'assessments' },
  { key: 'PTO', label: 'PTO', members: ['PTO'], color: '#e879f9', unit: 'h' },
  { key: 'Sick', label: 'Sick Leave', members: ['Sick Leave'], color: '#f87171', unit: 'h' },
]

// Service type colors for detail view
const SVC_COLORS = {
  'IIC-LC': '#00bbee',
  'IIC-MA': '#0ea5e9',
  'IIC-BA': '#38bdf8',
  OP: '#4ade80',
  SBYS: '#a78bfa',
  'ADOS In Home': '#fbbf24',
  'ADOS At Office': '#f59e0b',
  'APN 30 Min': '#f97316',
  'APN Intake': '#fb923c',
  PTO: '#e879f9',
  'Sick Leave': '#f87171',
}

// Revenue rate labels for the modal (ADOS labeled "per assessment")
const RATE_LABELS = {
  'IIC-LC': 'IIC — LPC/LCSW',
  'IIC-MA': 'IIC — LAC/LSW',
  'IIC-BA': 'IIC — Behavioral Assistant',
  OP: 'Outpatient',
  SBYS: 'School Based Youth Services',
  'ADOS In Home': 'ADOS — In Home',
  'ADOS At Office': 'ADOS — At Office',
  'APN 30 Min': 'APN — 30 Min',
  'APN Intake': 'APN — Intake (60 Min)',
}

const ADOS_KEYS = new Set(['ADOS In Home', 'ADOS At Office'])

// ── Detail View ──
function PeriodDetail({ periodId, period, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const verb = useLoadingVerb(loading)

  useEffect(() => {
    setLoading(true)
    apiGet(`/analytics/billing-summary/${periodId}`)
      .then(setData)
      .catch(err => console.error('Failed to load detail:', err))
      .finally(() => setLoading(false))
  }, [periodId])

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}...</p></div>
  }

  if (!data || !data.sections?.length) {
    return (
      <div>
        <button className="btn btn--ghost btn--small" onClick={onBack} style={{ marginBottom: '0.5rem' }}>← Back to Billing Summary</button>
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h3>No billing data yet</h3>
          <p>Approved invoices for this period will appear here.</p>
        </div>
      </div>
    )
  }

  const { sections, grand_total } = data

  // Combine ADOS In Home + ADOS At Office into one section
  const adosHomeSec = sections.find(s => s.service === 'ADOS In Home')
  const adosOfficeSec = sections.find(s => s.service === 'ADOS At Office')
  const hasAdos = adosHomeSec || adosOfficeSec

  // Build final display sections: non-ADOS sections first, then combined ADOS
  const displaySections = sections.filter(s => !ADOS_KEYS.has(s.service))

  if (hasAdos) {
    // Combine ADOS rows under one section
    const combinedRows = []
    const adosSubsections = []
    if (adosHomeSec) {
      adosSubsections.push({ label: 'In Home', rows: adosHomeSec.rows, totals: adosHomeSec })
    }
    if (adosOfficeSec) {
      adosSubsections.push({ label: 'At Office', rows: adosOfficeSec.rows, totals: adosOfficeSec })
    }
    const totalHours = (adosHomeSec?.total_hours || 0) + (adosOfficeSec?.total_hours || 0)
    const totalRevenue = (adosHomeSec?.total_revenue || 0) + (adosOfficeSec?.total_revenue || 0)
    const totalPay = (adosHomeSec?.total_pay || 0) + (adosOfficeSec?.total_pay || 0)
    const totalProfit = (adosHomeSec?.total_profit || 0) + (adosOfficeSec?.total_profit || 0)
    const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0

    displaySections.push({
      service: 'ADOS Assessments',
      _isAdosCombined: true,
      _subsections: adosSubsections,
      total_hours: totalHours,
      total_revenue: totalRevenue,
      total_pay: totalPay,
      total_profit: totalProfit,
      total_margin: totalMargin,
    })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn btn--ghost btn--small" onClick={onBack} style={{ marginBottom: '0.5rem' }}>← Back to Billing Summary</button>
          <h2 className="page-title">{period?.label || `${formatDate(period?.start_date)} – ${formatDate(period?.end_date)}`}</h2>
        </div>
      </div>

      {displaySections.map(section => {
        const color = SVC_COLORS[section.service] || '#fbbf24'
        return (
          <div key={section.service} className="card" style={{ marginBottom: '1rem' }}>
            {/* Section header with accent border */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: `2px solid ${color}` }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-bright)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }}></span>
                {section.service}
              </h3>
              <span style={{ fontWeight: 600, color, fontSize: '0.85rem' }}>{section.total_hours} hrs</span>
            </div>

            {/* Combined ADOS: one table with subsections + combined total */}
            {section._isAdosCombined ? (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th style={{ textAlign: 'right' }}># Hrs Billed</th>
                      <th style={{ textAlign: 'right' }}>$ Submitted</th>
                      <th style={{ textAlign: 'right' }}>Paid to Therapist</th>
                      <th style={{ textAlign: 'right' }}>Profit</th>
                      <th style={{ textAlign: 'right' }}>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section._subsections.map(sub => (
                      <>
                        {/* Subsection label row */}
                        <tr key={`label-${sub.label}`}>
                          <td colSpan={6} style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0.75rem 0.75rem 0.25rem', background: 'transparent', border: 'none' }}>
                            {sub.label}
                          </td>
                        </tr>
                        {/* Therapist rows */}
                        {sub.rows.map((row, i) => (
                          <tr key={`${sub.label}-${i}`} className="data-table-row">
                            <td style={{ fontSize: '0.85rem' }}>{row.name}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.hours}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDollar(row.revenue)}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDollar(row.pay)}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtDollar(row.profit)}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(row.margin)}</td>
                          </tr>
                        ))}
                        {/* Subsection total row */}
                        <tr key={`total-${sub.label}`} style={{ fontWeight: 700, background: 'var(--bg-elevated)' }}>
                          <td style={{ color: 'var(--text-bright)', fontSize: '0.9rem', padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}` }}>{sub.label} Total</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-bright)', padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}`, fontSize: '0.95rem' }}>{sub.totals.total_hours}</td>
                          <td style={{ textAlign: 'right', color, padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}`, fontSize: '0.95rem' }}>{fmtDollar(sub.totals.total_revenue)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-bright)', padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}` }}>{fmtDollar(sub.totals.total_pay)}</td>
                          <td style={{ textAlign: 'right', color: sub.totals.total_profit >= 0 ? 'var(--success)' : 'var(--danger)', padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}`, fontSize: '0.95rem' }}>{fmtDollar(sub.totals.total_profit)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}`, fontSize: '0.95rem' }}>{fmtPct(sub.totals.total_margin)}</td>
                        </tr>
                      </>
                    ))}
                    {/* ADOS Combined Total — inside same table so columns align */}
                    <tr style={{ fontWeight: 700, background: 'var(--bg-elevated)' }}>
                      <td style={{ color: 'var(--text-bright)', fontSize: '0.95rem', padding: '0.75rem 0.75rem', borderTop: `3px solid ${color}` }}>ADOS Combined Total</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-bright)', padding: '0.75rem 0.75rem', borderTop: `3px solid ${color}`, fontSize: '0.95rem' }}>{section.total_hours}</td>
                      <td style={{ textAlign: 'right', color, padding: '0.75rem 0.75rem', borderTop: `3px solid ${color}`, fontSize: '0.95rem' }}>{fmtDollar(section.total_revenue)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-bright)', padding: '0.75rem 0.75rem', borderTop: `3px solid ${color}`, fontSize: '0.95rem' }}>{fmtDollar(section.total_pay)}</td>
                      <td style={{ textAlign: 'right', color: section.total_profit >= 0 ? 'var(--success)' : 'var(--danger)', padding: '0.75rem 0.75rem', borderTop: `3px solid ${color}`, fontSize: '0.95rem' }}>{fmtDollar(section.total_profit)}</td>
                      <td style={{ textAlign: 'right', padding: '0.75rem 0.75rem', borderTop: `3px solid ${color}`, fontSize: '0.95rem' }}>{fmtPct(section.total_margin)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              /* Normal (non-ADOS) sections */
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th style={{ textAlign: 'right' }}># Hrs Billed</th>
                      <th style={{ textAlign: 'right' }}>$ Submitted</th>
                      <th style={{ textAlign: 'right' }}>Paid to Therapist</th>
                      <th style={{ textAlign: 'right' }}>Profit</th>
                      <th style={{ textAlign: 'right' }}>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, i) => (
                      <tr key={i} className="data-table-row">
                        <td style={{ fontSize: '0.85rem' }}>{row.name}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.hours}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDollar(row.revenue)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDollar(row.pay)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtDollar(row.profit)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(row.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Bold total row with background to stand out */}
                  <tfoot>
                    <tr style={{ fontWeight: 700, background: 'var(--bg-elevated)' }}>
                      <td style={{ color: 'var(--text-bright)', fontSize: '0.9rem', padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}` }}>{section.service} Total</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-bright)', padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}`, fontSize: '0.95rem' }}>{section.total_hours}</td>
                      <td style={{ textAlign: 'right', color, padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}`, fontSize: '0.95rem' }}>{fmtDollar(section.total_revenue)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-bright)', padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}` }}>{fmtDollar(section.total_pay)}</td>
                      <td style={{ textAlign: 'right', color: section.total_profit >= 0 ? 'var(--success)' : 'var(--danger)', padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}`, fontSize: '0.95rem' }}>{fmtDollar(section.total_profit)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, padding: '0.625rem 0.75rem', borderTop: `2px solid ${color}`, fontSize: '0.95rem' }}>{fmtPct(section.total_margin)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {/* Grand total */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem',
        padding: '1.25rem', background: 'var(--bg-card)', border: '2px solid var(--accent)',
        borderRadius: 'var(--radius)', marginTop: '0.5rem',
      }}>
        {[
          { label: 'Total Hours', value: grand_total.hours, color: 'var(--text-bright)' },
          { label: 'Revenue', value: fmtDollar(grand_total.revenue), color: 'var(--accent)' },
          { label: 'Paid Out', value: fmtDollar(grand_total.pay), color: 'var(--text-bright)' },
          { label: 'Profit', value: fmtDollar(grand_total.profit), color: grand_total.profit >= 0 ? 'var(--success)' : 'var(--danger)' },
          { label: 'Margin', value: fmtPct(grand_total.margin), color: 'var(--text-bright)' },
        ].map(m => (
          <div key={m.label}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Service pills for period cards (grouped) ──
function ServicePills({ services }) {
  if (!services || services.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</span>

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
      {PILL_GROUPS.map(g => {
        // Sum hours + revenue across members
        const memberData = g.members.map(m => services.find(s => s.service === m)).filter(Boolean)
        if (memberData.length === 0) return null

        const totalHours = memberData.reduce((sum, s) => sum + (s.hours || 0), 0)
        const totalRevenue = memberData.reduce((sum, s) => sum + (s.revenue || 0), 0)
        const totalAssessments = memberData.reduce((sum, s) => sum + (s.assessments || 0), 0)

        // ADOS shows assessment count, others show hours
        const display = g.unit === 'assessments' ? `${totalAssessments}` : `${totalHours}h`
        const revStr = totalRevenue > 0 ? ` · ${fmtDollar(totalRevenue)}` : ''

        return (
          <span key={g.key} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.7rem',
            fontWeight: 500, fontVariantNumeric: 'tabular-nums',
            background: `${g.color}15`, color: g.color, border: `1px solid ${g.color}30`,
          }}>
            {g.label}: {display}{revStr}
          </span>
        )
      })}
    </div>
  )
}

// ── Totals row for top section of card ──
function TotalsRow({ data, isMonthly }) {
  const metrics = [
    { label: 'Total Hours', value: data.total_hours, fmt: v => v },
    { label: 'Total Revenue', value: data.total_revenue, fmt: fmtDollar, color: 'var(--accent)' },
    { label: 'Paid to Therapists', value: data.total_pay, fmt: fmtDollar },
    { label: 'Profit', value: data.total_profit, fmt: fmtDollar, color: (data.total_profit || 0) >= 0 ? 'var(--success)' : 'var(--danger)' },
    { label: 'Gross Margin', value: data.margin_pct, fmt: fmtPct },
  ]

  const bgStyle = isMonthly
    ? { background: 'var(--accent-glow)', border: '1px solid rgba(0,187,238,0.15)' }
    : { background: 'var(--bg-elevated)' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginBottom: '0.625rem' }}>
      {metrics.map(m => (
        <div key={m.label} style={{ padding: '0.5rem 0.625rem', borderRadius: 'var(--radius-sm)', ...bgStyle }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</div>
          <div style={{ fontSize: isMonthly ? '1.2rem' : '1rem', fontWeight: 700, color: m.color || 'var(--text-bright)', fontVariantNumeric: 'tabular-nums' }}>{m.fmt(m.value)}</div>
        </div>
      ))}
    </div>
  )
}

// ── Service pay breakdown for monthly totals ──
function ServicePayBreakdown({ services }) {
  if (!services || services.length === 0) return null

  // Group into PILL_GROUPS to combine IIC, ADOS etc.
  const rows = PILL_GROUPS
    .map(g => {
      const memberData = g.members.map(m => services.find(s => s.service === m)).filter(Boolean)
      if (memberData.length === 0) return null
      const totalPay = memberData.reduce((sum, s) => sum + (s.pay || 0), 0)
      if (totalPay === 0) return null
      return { label: g.label, pay: totalPay, color: g.color }
    })
    .filter(Boolean)

  if (rows.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', alignSelf: 'center', marginRight: '0.25rem' }}>
        Paid to Staff:
      </span>
      {rows.map(r => (
        <span key={r.label} style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
          padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.7rem',
          fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          background: `${r.color}15`, color: r.color, border: `1px solid ${r.color}30`,
        }}>
          {r.label}: {fmtDollar(r.pay)}
        </span>
      ))}
    </div>
  )
}

// ── Main Component ──
export default function BillingSummary() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [showRatesModal, setShowRatesModal] = useState(false)
  const [editRates, setEditRates] = useState({})
  const [savingRates, setSavingRates] = useState(false)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const result = await apiGet('/analytics/billing-summary')
      setData(result)
      setEditRates(result.bill_rates || {})
    } catch (err) {
      console.error('Failed to load billing summary:', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveRates() {
    setSavingRates(true)
    try {
      await apiPatch('/analytics/billing-rates', editRates)
      // Reload to confirm saved values
      const result = await apiGet('/analytics/billing-summary')
      setData(result)
      setEditRates(result.bill_rates || {})
      setShowRatesModal(false)
    } catch (err) {
      alert('Failed to save rates: ' + err.message)
    } finally {
      setSavingRates(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}...</p></div>
  }

  if (selectedPeriod) {
    return (
      <PeriodDetail
        periodId={selectedPeriod.id}
        period={selectedPeriod}
        onBack={() => { setSelectedPeriod(null); loadData() }}
      />
    )
  }

  const periods = data?.periods || []
  const monthly = data?.monthly || []
  const openPeriods = data?.open_periods || []

  // Group periods by month
  const periodsByMonth = {}
  for (const p of periods) {
    const mk = p.start_date?.slice(0, 7) || 'unknown'
    if (!periodsByMonth[mk]) periodsByMonth[mk] = []
    periodsByMonth[mk].push(p)
  }
  const monthKeys = Object.keys(periodsByMonth).sort().reverse()

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Billing Summary</h2>
        <button className="btn btn--primary btn--small" onClick={() => setShowRatesModal(true)}>
          Revenue Rates
        </button>
      </div>

      {openPeriods.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
          background: 'var(--warning-bg, #451a03)', border: '1px solid var(--warning-border, #92400e)',
          borderRadius: '0.5rem', padding: '0.875rem 1rem', marginBottom: '1.25rem',
          color: 'var(--warning-text, #fbbf24)', fontSize: '0.875rem', lineHeight: 1.5,
        }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
          <div>
            <strong>
              {openPeriods.length === 1
                ? `Pay period "${openPeriods[0].label || formatDate(openPeriods[0].start_date)}" is still open`
                : `${openPeriods.length} pay periods are still open`}
            </strong>
            {' — close and approve them in '}
            <strong>Payroll → Pay Periods</strong>
            {' for their data to appear here.'}
          </div>
        </div>
      )}

      {periods.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h3>No billing data yet</h3>
          <p>Billing summary data will appear here after pay periods are closed and invoices are approved.</p>
        </div>
      ) : (
        <>
          {monthKeys.map(mk => {
            const monthPeriods = periodsByMonth[mk]
            const monthSummary = monthly.find(m => m.month === mk)
            return (
              <div key={mk} style={{ marginBottom: '2.5rem' }}>
                {/* Month header */}
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-bright)', marginBottom: '0.75rem', fontFamily: 'var(--font-display)' }}>
                  {formatMonth(mk)}
                </h3>

                {/* Pay period cards */}
                {monthPeriods.map(p => (
                  <div key={p.id} className="card" style={{ padding: 0, marginBottom: '0.5rem', cursor: 'pointer' }} onClick={() => setSelectedPeriod(p)}>
                    {/* TOP: date + totals */}
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-bright)' }}>
                          {formatDate(p.start_date)} – {formatDate(p.end_date)}
                        </div>
                        <button className="btn btn--ghost btn--small" onClick={e => { e.stopPropagation(); setSelectedPeriod(p) }}>View</button>
                      </div>
                      <TotalsRow data={p} />
                    </div>

                    {/* BOTTOM: service pills */}
                    <div style={{ padding: '0.75rem 1.25rem' }}>
                      <ServicePills services={p.services} />
                    </div>
                  </div>
                ))}

                {/* ── Monthly Total (stands out) ── */}
                {monthSummary && (
                  <div style={{
                    padding: 0, marginTop: '0.375rem',
                    background: 'var(--bg-card)',
                    border: '2px solid var(--accent)',
                    borderRadius: 'var(--radius)',
                    borderLeft: '6px solid var(--accent)',
                  }}>
                    {/* TOP: title + totals */}
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--accent)' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent)', fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>
                        {formatMonth(mk)} — Monthly Total
                      </div>
                      <TotalsRow data={monthSummary} isMonthly />
                    </div>

                    {/* BOTTOM: service pills + pay breakdown */}
                    <div style={{ padding: '0.75rem 1.25rem' }}>
                      <ServicePills services={monthSummary.services} />
                      <ServicePayBreakdown services={monthSummary.services} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* Revenue Rates Modal */}
      <Modal open={showRatesModal} onClose={() => setShowRatesModal(false)} title="Projected Revenue Rates">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Set the projected revenue rate for each service type. ADOS rates are per assessment.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {Object.entries(RATE_LABELS).map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: SVC_COLORS[key] || 'var(--accent)',
              }}></span>
              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-bright)' }}>{label}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', width: '10px', textAlign: 'right', flexShrink: 0 }}>$</span>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                value={editRates[key] ?? ''}
                onChange={e => setEditRates(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                style={{ width: '100px', textAlign: 'right', fontSize: '0.85rem', flexShrink: 0 }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', width: '50px', flexShrink: 0 }}>
                {ADOS_KEYS.has(key) ? '/assess' : '/hr'}
              </span>
            </div>
          ))}
        </div>
        <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
          <button className="btn btn--primary" onClick={handleSaveRates} disabled={savingRates}>
            {savingRates ? 'Saving...' : 'Save Rates'}
          </button>
          <button className="btn btn--secondary" onClick={() => setShowRatesModal(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  )
}
