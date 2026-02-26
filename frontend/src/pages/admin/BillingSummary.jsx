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
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

function fmtDollar(v) {
  return '$' + (v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(v) {
  return (v || 0).toFixed(1) + '%'
}

// Service type colors for visual grouping
const SVC_COLORS = {
  IIC: '#00bbee',
  OP: '#4ade80',
  SBYS: '#a78bfa',
  ADOS: '#fbbf24',
  APN: '#f97316',
  Admin: '#60a5fa',
  Supervision: '#94a3b8',
  PTO: '#e879f9',
  'Sick Leave': '#f87171',
}

// ── Detail View (emulating billing master sheet) ──
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

      {sections.map(section => (
        <div key={section.service} className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: SVC_COLORS[section.service] || 'var(--accent)', display: 'inline-block' }}></span>
              {section.service}
            </h3>
            <span style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '0.85rem' }}>{section.total_hours} hrs</span>
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
                    <td className="data-table-primary">{row.name}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.hours}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDollar(row.revenue)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtDollar(row.pay)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtDollar(row.profit)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(row.margin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td style={{ color: 'var(--text-bright)' }}>{section.service} Total</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-bright)' }}>{section.total_hours}</td>
                  <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{fmtDollar(section.total_revenue)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-bright)' }}>{fmtDollar(section.total_pay)}</td>
                  <td style={{ textAlign: 'right', color: section.total_profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtDollar(section.total_profit)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtPct(section.total_margin)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* Grand total bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem',
        padding: '1.25rem', background: 'var(--bg-card)', border: '2px solid var(--accent)',
        borderRadius: 'var(--radius)', marginTop: '0.5rem',
      }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Hours</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>{grand_total.hours}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{fmtDollar(grand_total.revenue)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid Out</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>{fmtDollar(grand_total.pay)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profit</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: grand_total.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtDollar(grand_total.profit)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Margin</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>{fmtPct(grand_total.margin)}</div>
        </div>
      </div>
    </div>
  )
}

// ── Mini totals row for a period or monthly summary ──
function ServiceMiniRow({ services, billRates }) {
  if (!services || services.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
      {services.map(s => (
        <span key={s.service} style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
          padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.72rem',
          fontWeight: 500, fontVariantNumeric: 'tabular-nums',
          background: `${SVC_COLORS[s.service] || 'var(--accent)'}18`,
          color: SVC_COLORS[s.service] || 'var(--accent)',
          border: `1px solid ${SVC_COLORS[s.service] || 'var(--accent)'}33`,
        }}>
          {s.service}: {s.hours}h
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

  // Detail view
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

  // Group periods by month for display
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
        <button className="btn btn--ghost" onClick={() => setShowRatesModal(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.35rem' }}>
            <circle cx="12" cy="12" r="3" /><path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
          </svg>
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
              <div key={mk} style={{ marginBottom: '2rem' }}>
                {/* Month header */}
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-bright)', marginBottom: '0.75rem', fontFamily: 'var(--font-display)' }}>
                  {formatMonth(mk)}
                </h3>

                {/* Pay period rows */}
                {monthPeriods.map(p => (
                  <div key={p.id} className="card" style={{
                    padding: '1rem 1.25rem', marginBottom: '0.5rem', cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }} onClick={() => setSelectedPeriod(p)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-bright)' }}>
                          {formatDate(p.start_date)} – {formatDate(p.end_date)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          {p.total_hours} hrs · {fmtDollar(p.total_revenue)} revenue · {fmtPct(p.margin_pct)} margin
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: p.total_profit >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtDollar(p.total_profit)}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>profit</div>
                        </div>
                        <button className="btn btn--ghost btn--small" onClick={e => { e.stopPropagation(); setSelectedPeriod(p) }}>View</button>
                      </div>
                    </div>
                    <ServiceMiniRow services={p.services} />
                  </div>
                ))}

                {/* Monthly totals bar */}
                {monthSummary && (
                  <div style={{
                    padding: '0.875rem 1.25rem', marginTop: '0.25rem',
                    background: 'linear-gradient(135deg, rgba(0,187,238,0.06), rgba(0,187,238,0.02))',
                    border: '1px solid rgba(0,187,238,0.15)', borderRadius: 'var(--radius)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent)' }}>
                        {formatMonth(mk)} Total
                      </span>
                      <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                        <span><span style={{ color: 'var(--text-muted)' }}>Hours:</span> <span style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{monthSummary.total_hours}</span></span>
                        <span><span style={{ color: 'var(--text-muted)' }}>Revenue:</span> <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmtDollar(monthSummary.total_revenue)}</span></span>
                        <span><span style={{ color: 'var(--text-muted)' }}>Pay:</span> <span style={{ fontWeight: 600 }}>{fmtDollar(monthSummary.total_pay)}</span></span>
                        <span><span style={{ color: 'var(--text-muted)' }}>Profit:</span> <span style={{ fontWeight: 600, color: monthSummary.total_profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtDollar(monthSummary.total_profit)}</span></span>
                        <span><span style={{ color: 'var(--text-muted)' }}>Margin:</span> <span style={{ fontWeight: 600 }}>{fmtPct(monthSummary.margin_pct)}</span></span>
                      </div>
                    </div>
                    <ServiceMiniRow services={monthSummary.services} />
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
          Set the projected revenue rate per hour for each service type. These are used to calculate "$ Amount Submitted" in the billing summary.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {Object.entries(editRates).map(([service, rate]) => (
            <div key={service} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: SVC_COLORS[service] || 'var(--accent)',
              }}></span>
              <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-bright)' }}>{service}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>$</span>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={rate || ''}
                  onChange={e => setEditRates(prev => ({ ...prev, [service]: parseFloat(e.target.value) || 0 }))}
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
