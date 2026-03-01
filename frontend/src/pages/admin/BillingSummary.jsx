import { useState, useEffect } from 'react'
import { apiGet, apiPatch } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import { formatDateFull as formatDate } from '../../lib/utils'
import Modal from '../../components/Modal'
import PeriodDetail from './PeriodDetail'

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
  { key: 'OP Cancel', label: 'OP Cancel', members: ['OP Cancellation'], color: '#f87171', unit: 'h' },
  { key: 'SBYS', label: 'SBYS', members: ['SBYS'], color: '#a78bfa', unit: 'h' },
  { key: 'ADOS', label: 'ADOS', members: ['ADOS In Home', 'ADOS At Office'], color: '#fbbf24', unit: 'assessments' },
  { key: 'APN', label: 'APN', members: ['APN 30 Min', 'APN Intake'], color: '#f97316', unit: 'h' },
  { key: 'PTO', label: 'PTO', members: ['PTO'], color: '#e879f9', unit: 'h' },
  { key: 'Sick', label: 'Sick Leave', members: ['Sick Leave'], color: '#f87171', unit: 'h' },
]

// Revenue rate labels for the modal (ADOS labeled "per assessment")
const RATE_LABELS = {
  'IIC-LC': 'IIC — LPC/LCSW',
  'IIC-MA': 'IIC — LAC/LSW',
  'IIC-BA': 'IIC — Behavioral Assistant',
  OP: 'Outpatient',
  'OP Cancellation': 'OP — Cancellation',
  SBYS: 'School Based Youth Services',
  'ADOS In Home': 'ADOS — In Home',
  'ADOS At Office': 'ADOS — At Office',
  'APN 30 Min': 'APN — 30 Min',
  'APN Intake': 'APN — Intake (60 Min)',
}

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

const ADOS_KEYS = new Set(['ADOS In Home', 'ADOS At Office'])

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
  const monthKeys = Object.keys(periodsByMonth).sort()

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
