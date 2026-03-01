import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { formatDate } from '../../lib/utils'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'

export default function TherapistInvoices() {
  const { profile } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSubmit, setShowSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Get current pay period (1st-15th or 16th-end of month)
  const today = new Date()
  const day = today.getDate()
  const year = today.getFullYear()
  const month = today.getMonth()
  const defaultStart = day <= 15
    ? new Date(year, month, 1).toISOString().slice(0, 10)
    : new Date(year, month, 16).toISOString().slice(0, 10)
  const defaultEnd = day <= 15
    ? new Date(year, month, 15).toISOString().slice(0, 10)
    : new Date(year, month + 1, 0).toISOString().slice(0, 10)

  const [form, setForm] = useState({
    pay_period_start: defaultStart,
    pay_period_end: defaultEnd,
    hours_iic: '',
    hours_op: '',
    hours_sbys: '',
    hours_ado: '',
    hours_sick: '',
    hours_pto: '',
    hours_apn: '',
    notes: '',
  })

  useEffect(() => { loadInvoices() }, [])

  async function loadInvoices() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('therapist_id', profile.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setInvoices(data || [])
    } catch (err) {
      console.error('Error loading invoices:', err)
    } finally {
      setLoading(false)
    }
  }

  const totalHours = ['hours_iic', 'hours_op', 'hours_sbys', 'hours_ado', 'hours_sick', 'hours_pto', 'hours_apn']
    .reduce((sum, key) => sum + (parseFloat(form[key]) || 0), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { error: err } = await supabase
        .from('invoices')
        .insert({
          therapist_id: profile.id,
          pay_period_start: form.pay_period_start,
          pay_period_end: form.pay_period_end,
          hours_iic: parseFloat(form.hours_iic) || 0,
          hours_op: parseFloat(form.hours_op) || 0,
          hours_sbys: parseFloat(form.hours_sbys) || 0,
          hours_ado: parseFloat(form.hours_ado) || 0,
          hours_sick: parseFloat(form.hours_sick) || 0,
          hours_pto: parseFloat(form.hours_pto) || 0,
          hours_apn: parseFloat(form.hours_apn) || 0,
          total_hours: totalHours,
          notes: form.notes || null,
          status: 'pending',
        })

      if (err) throw err
      setShowSubmit(false)
      setForm({ ...form, hours_iic: '', hours_op: '', hours_sbys: '', hours_ado: '', hours_sick: '', hours_pto: '', hours_apn: '', notes: '' })
      loadInvoices()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Invoices</h2>
        <button className="btn btn--primary" onClick={() => setShowSubmit(true)}>
          + Submit Invoice
        </button>
      </div>

      {loading ? (
        <div className="page-loading"><div className="loading-spinner" /></div>
      ) : invoices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💼</div>
          <h3>No Invoices Yet</h3>
          <p>Submit your first invoice to track your hours.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="table-wrapper hide-mobile">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pay Period</th>
                  <th>Total Hours</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="data-table-row">
                    <td className="data-table-primary">{formatDate(inv.pay_period_start)} — {formatDate(inv.pay_period_end)}</td>
                    <td>{inv.total_hours}</td>
                    <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="card-list show-mobile">
            {invoices.map(inv => (
              <div key={inv.id} className="card">
                <div className="card-row">
                  <span className="card-label">{formatDate(inv.pay_period_start)} — {formatDate(inv.pay_period_end)}</span>
                  <StatusBadge status={inv.status} />
                </div>
                <div className="card-row">
                  <span className="card-muted">Submitted {new Date(inv.created_at).toLocaleDateString()}</span>
                  <span className="card-value">{inv.total_hours} hrs</span>
                </div>
                {inv.rejection_reason && (
                  <div className="card-row" style={{ color: 'var(--danger)' }}>
                    <span>Reason: {inv.rejection_reason}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Submit Invoice Modal */}
      <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title="Submit Invoice" wide>
        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <div className="modal-section">
            <div className="modal-label">Therapist</div>
            <div className="modal-value">{profile.first_name} {profile.last_name}</div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Pay Period Start</label>
              <input type="date" required value={form.pay_period_start} onChange={e => setForm({ ...form, pay_period_start: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Pay Period End</label>
              <input type="date" required value={form.pay_period_end} onChange={e => setForm({ ...form, pay_period_end: e.target.value })} />
            </div>
          </div>

          <div className="invoice-hours-grid">
            {[
              { key: 'hours_iic', label: 'IIC Hours' },
              { key: 'hours_op', label: 'OP Hours' },
              { key: 'hours_sbys', label: 'SBYS Hours' },
              { key: 'hours_ado', label: 'ADO Hours' },
              { key: 'hours_sick', label: 'Sick Hours' },
              { key: 'hours_pto', label: 'PTO Hours' },
              { key: 'hours_apn', label: 'APN Hours' },
            ].map(({ key, label }) => (
              <div key={key} className="form-field">
                <label>{label}</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  placeholder="0"
                  value={form[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="invoice-total">
            <span>Total Hours</span>
            <span className="invoice-total-value">{totalHours.toFixed(2)}</span>
          </div>

          <div className="form-field">
            <label>Notes (optional)</label>
            <textarea
              rows={3}
              placeholder="Any notes about this pay period..."
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setShowSubmit(false)}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={submitting || totalHours === 0}>
              {submitting ? 'Submitting...' : 'Submit Invoice'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
