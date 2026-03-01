import { useState, useEffect } from 'react'
import { apiGet } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import { formatDateFull as formatDate } from '../../lib/utils'

function fmtDollar(v) {
  return '$' + Math.round(v || 0).toLocaleString()
}

function fmtPct(v) {
  return (v || 0).toFixed(1) + '%'
}

// Service type colors for detail view
const SVC_COLORS = {
  'IIC-LC': '#00bbee',
  'IIC-MA': '#0ea5e9',
  'IIC-BA': '#38bdf8',
  OP: '#4ade80',
  'OP Cancellation': '#86efac',
  SBYS: '#a78bfa',
  'ADOS In Home': '#fbbf24',
  'ADOS At Office': '#f59e0b',
  'APN 30 Min': '#f97316',
  'APN Intake': '#fb923c',
  PTO: '#e879f9',
  'Sick Leave': '#f87171',
}

const OP_KEYS = new Set(['OP', 'OP Cancellation'])
const ADOS_KEYS = new Set(['ADOS In Home', 'ADOS At Office'])
const APN_KEYS = new Set(['APN 30 Min', 'APN Intake'])

// ── Detail View ──
export default function PeriodDetail({ periodId, period, onBack }) {
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

  // Combine OP + OP Cancellation into one section
  const opRegSec = sections.find(s => s.service === 'OP')
  const opCancelSec = sections.find(s => s.service === 'OP Cancellation')
  const hasOpSplit = opRegSec && opCancelSec  // only combine if both exist

  // Combine ADOS In Home + ADOS At Office into one section
  const adosHomeSec = sections.find(s => s.service === 'ADOS In Home')
  const adosOfficeSec = sections.find(s => s.service === 'ADOS At Office')
  const hasAdos = adosHomeSec || adosOfficeSec

  // Combine APN 30 Min + APN Intake into one section
  const apn30Sec = sections.find(s => s.service === 'APN 30 Min')
  const apnIntakeSec = sections.find(s => s.service === 'APN Intake')
  const hasApn = apn30Sec || apnIntakeSec

  // Build final display sections: filter out combined subsections, then add combined
  const displaySections = sections.filter(s =>
    !(hasOpSplit && OP_KEYS.has(s.service)) &&
    !ADOS_KEYS.has(s.service) &&
    !APN_KEYS.has(s.service)
  )

  if (hasOpSplit) {
    const opSubsections = []
    if (opRegSec) {
      opSubsections.push({ label: 'Sessions', rows: opRegSec.rows, totals: opRegSec })
    }
    if (opCancelSec) {
      opSubsections.push({ label: 'Cancellations', rows: opCancelSec.rows, totals: opCancelSec })
    }
    const totalHours = (opRegSec?.total_hours || 0) + (opCancelSec?.total_hours || 0)
    const totalRevenue = (opRegSec?.total_revenue || 0) + (opCancelSec?.total_revenue || 0)
    const totalPay = (opRegSec?.total_pay || 0) + (opCancelSec?.total_pay || 0)
    const totalProfit = (opRegSec?.total_profit || 0) + (opCancelSec?.total_profit || 0)
    const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0

    // Insert OP combined at the position where OP was (keep ordering natural)
    const opIdx = displaySections.findIndex(s => s.service && s.service.startsWith('IIC'))
    displaySections.splice(opIdx >= 0 ? opIdx + 1 : displaySections.length, 0, {
      service: 'OP',
      _isCombined: true,
      _combinedLabel: 'OP Combined Total',
      _subsections: opSubsections,
      total_hours: totalHours,
      total_revenue: totalRevenue,
      total_pay: totalPay,
      total_profit: totalProfit,
      total_margin: totalMargin,
    })
  }

  if (hasAdos) {
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
      _isCombined: true,
      _combinedLabel: 'ADOS Combined Total',
      _subsections: adosSubsections,
      total_hours: totalHours,
      total_revenue: totalRevenue,
      total_pay: totalPay,
      total_profit: totalProfit,
      total_margin: totalMargin,
    })
  }

  if (hasApn) {
    const apnSubsections = []
    if (apn30Sec) {
      apnSubsections.push({ label: '30 Min', rows: apn30Sec.rows, totals: apn30Sec })
    }
    if (apnIntakeSec) {
      apnSubsections.push({ label: 'Intake (60 Min)', rows: apnIntakeSec.rows, totals: apnIntakeSec })
    }
    const totalHours = (apn30Sec?.total_hours || 0) + (apnIntakeSec?.total_hours || 0)
    const totalRevenue = (apn30Sec?.total_revenue || 0) + (apnIntakeSec?.total_revenue || 0)
    const totalPay = (apn30Sec?.total_pay || 0) + (apnIntakeSec?.total_pay || 0)
    const totalProfit = (apn30Sec?.total_profit || 0) + (apnIntakeSec?.total_profit || 0)
    const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0

    displaySections.push({
      service: 'APN',
      _isCombined: true,
      _combinedLabel: 'APN Combined Total',
      _subsections: apnSubsections,
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
            {section._isCombined ? (
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
                    {/* Combined Total — inside same table so columns align */}
                    <tr style={{ fontWeight: 700, background: 'var(--bg-elevated)' }}>
                      <td style={{ color: 'var(--text-bright)', fontSize: '0.95rem', padding: '0.75rem 0.75rem', borderTop: `3px solid ${color}` }}>{section._combinedLabel || 'Combined Total'}</td>
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
