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
  return '$' + (v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(v) {
  return (v || 0).toFixed(1) + '%'
}

// Service type colors
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

// Short labels for pills
const SVC_SHORT = {
  'IIC-LC': 'IIC-LC',
  'IIC-MA': 'IIC-MA',
  'IIC-BA': 'IIC-BA',
  OP: 'OP',
  SBYS: 'SBYS',
  'ADOS In Home': 'ADOS Home',
  'ADOS At Office': 'ADOS Office',
  'APN 30 Min': 'APN 30',
  'APN Intake': 'APN Intake',
  PTO: 'PTO',
  'Sick Leave': 'Sick',
}

// Revenue rate labels for the modal
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

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn btn--ghost btn--small" onClick={onBack} style={{ marginBottom: '0.5rem' }}>← Back to Billing Summary</button>
          <h2 className="page-title">{period?.label || `${formatDate(period?.start_date)} – ${formatDate(period?.end_date)}`}</h2>
        </div>
      </div>

      {sections.map(section => {
        const color = SVC_COLORS[section.service] || 'var(--accent)'
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

// ── Service pills for period cards ──
function ServicePills({ services }) {
  if (!services || services.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
      {services.map(s => {
        const color = SVC_COLORS[s.service] || 'var(--accent)'
        const label = SVC_SHORT[s.service] || s.service
        // Show assessments count for ADOS, hours for others
        const display = s.assessments != null ? `${s.assessments}` : `${s.hours}h`
        const suffix = s.revenue > 0 ? ` · ${fmtDollar(s.revenue)}` : ''
        return (
          <span key={s.service} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.7rem',
            fontWeight: 500, fontVariantNumeric: 'tabular-nums',
            background: `${color}15`, color, border: `1px solid ${color}30`,
          }}>
            {label}: {display}{suffix}
          </span>
        )
      })}
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
      setShowRatesModal(false)
      loadData()
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

  // Group periods by month
  const periodsByMonth = {}
  for (const p of periods) {
    const mk = p.start_date?.slice(0, 7) || 'unknown'
    if (!periodsByMonth[mk]) periodsByMonth[mk] = []
    periodsByMonth[mk].push(p)
  }
  const monthKeys = Object.keys(periodsByMonth).sort().reverse()

  // Helper to find a service entry
  const getSvc = (services, name) => (services || []).find(s => s.service === name)
  const getSvcHours = (services, name) => getSvc(services, name)?.hours || 0
  const getSvcRevenue = (services, name) => getSvc(services, name)?.revenue || 0
  const getSvcAssessments = (services, name) => getSvc(services, name)?.assessments || 0
  const getIicTotal = (services) => getSvcHours(services, 'IIC-LC') + getSvcHours(services, 'IIC-MA') + getSvcHours(services, 'IIC-BA')
  const getIicRevenue = (services) => getSvcRevenue(services, 'IIC-LC') + getSvcRevenue(services, 'IIC-MA') + getSvcRevenue(services, 'IIC-BA')
  const getAdosCount = (services) => getSvcAssessments(services, 'ADOS In Home') + getSvcAssessments(services, 'ADOS At Office')

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Billing Summary</h2>
        <button className="btn btn--primary btn--small" onClick={() => setShowRatesModal(true)}>
          Revenue Rates
        </button>
      </div>

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
                  <div key={p.id} className="card" style={{
                    padding: '1rem 1.25rem', marginBottom: '0.5rem', cursor: 'pointer',
                  }} onClick={() => setSelectedPeriod(p)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-bright)' }}>
                          {formatDate(p.start_date)} – {formatDate(p.end_date)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Gross Margin</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: p.total_profit >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtPct(p.margin_pct)}
                          </div>
                        </div>
                        <button className="btn btn--ghost btn--small" onClick={e => { e.stopPropagation(); setSelectedPeriod(p) }}>View</button>
                      </div>
                    </div>

                    {/* Key metrics grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.625rem' }}>
                      <div style={{ background: 'var(--bg-elevated)', padding: '0.5rem 0.625rem', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Hours</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-bright)', fontVariantNumeric: 'tabular-nums' }}>{p.total_hours}</div>
                      </div>
                      <div style={{ background: 'var(--bg-elevated)', padding: '0.5rem 0.625rem', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Revenue</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{fmtDollar(p.total_revenue)}</div>
                      </div>
                      <div style={{ background: 'var(--bg-elevated)', padding: '0.5rem 0.625rem', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gross Margin</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: p.total_profit >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{fmtDollar(p.total_profit)}</div>
                      </div>
                    </div>

                    {/* Service breakdown pills */}
                    <ServicePills services={p.services} />
                  </div>
                ))}

                {/* ── Monthly Total (stands out) ── */}
                {monthSummary && (
                  <div style={{
                    padding: '1rem 1.25rem', marginTop: '0.375rem',
                    background: 'var(--bg-card)',
                    border: '2px solid var(--accent)',
                    borderRadius: 'var(--radius)',
                    borderLeft: '6px solid var(--accent)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
                        {formatMonth(mk)} — Monthly Total
                      </span>
                    </div>

                    {/* Big metric row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div style={{ background: 'var(--accent-glow)', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,187,238,0.15)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Hours</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-bright)', fontVariantNumeric: 'tabular-nums' }}>{monthSummary.total_hours}</div>
                      </div>
                      <div style={{ background: 'var(--accent-glow)', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,187,238,0.15)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Revenue</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{fmtDollar(monthSummary.total_revenue)}</div>
                      </div>
                      <div style={{ background: 'var(--accent-glow)', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,187,238,0.15)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Profit</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: monthSummary.total_profit >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{fmtDollar(monthSummary.total_profit)}</div>
                      </div>
                      <div style={{ background: 'var(--accent-glow)', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,187,238,0.15)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Margin</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-bright)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(monthSummary.margin_pct)}</div>
                      </div>
                    </div>

                    {/* Service breakdown pills */}
                    <ServicePills services={monthSummary.services} />
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* Revenue Rates Modal — only revenue-generating types */}
      <Modal open={showRatesModal} onClose={() => setShowRatesModal(false)} title="Projected Revenue Rates">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Set the projected revenue per hour for each service type. Used to calculate "$ Amount Submitted."
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {Object.entries(RATE_LABELS).map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: SVC_COLORS[key] || 'var(--accent)',
              }}></span>
              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-bright)' }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>$</span>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editRates[key] || ''}
                  onChange={e => setEditRates(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                  style={{ width: '100px', textAlign: 'right', fontSize: '0.85rem' }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>/hr</span>
              </div>
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
