import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'

export default function AdminPayroll() {
  const { profile } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => { loadInvoices() }, [filter])

  async function loadInvoices() {
    setLoading(true)
    try {
      let query = supabase
        .from('invoices')
        .select('*, users!invoices_therapist_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query
      if (error) throw error
      setInvoices(data || [])
    } catch (err) {
      console.error('Error loading invoices:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(invoice) {
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', invoice.id)

      if (error) throw error
      setSelectedInvoice(null)
      loadInvoices()
    } catch (err) {
      alert('Error approving invoice: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleReject(invoice) {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection')
      return
    }
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'rejected',
          rejection_reason: rejectReason,
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', invoice.id)

      if (error) throw error
      setSelectedInvoice(null)
      setRejectReason('')
      loadInvoices()
    } catch (err) {
      alert('Error rejecting invoice: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  function exportCSV() {
    const filtered = invoices.filter(i => filter === 'all' || i.status === filter)
    if (!filtered.length) return

    const headers = ['Therapist', 'Pay Period Start', 'Pay Period End', 'IIC Hours', 'OP Hours', 'SBYS Hours', 'ADO Hours', 'Sick Hours', 'PTO Hours', 'APN Hours', 'Total Hours', 'Status', 'Submitted']
    const rows = filtered.map(inv => [
      `${inv.users?.first_name} ${inv.users?.last_name}`,
      inv.pay_period_start,
      inv.pay_period_end,
      inv.hours_iic || 0,
      inv.hours_op || 0,
      inv.hours_sbys || 0,
      inv.hours_ado || 0,
      inv.hours_sick || 0,
      inv.hours_pto || 0,
      inv.hours_apn || 0,
      inv.total_hours || 0,
      inv.status,
      new Date(inv.created_at).toLocaleDateString(),
    ])

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${filter}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Payroll</h2>
        <div className="page-actions">
          <button className="btn btn--secondary" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        {['pending', 'approved', 'all'].map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'filter-tab--active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && invoices.length > 0 && filter === 'pending' && (
              <span className="filter-tab-count">{invoices.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loading"><div className="loading-spinner" /></div>
      ) : invoices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💰</div>
          <h3>No {filter !== 'all' ? filter : ''} invoices</h3>
          <p>Invoices submitted by therapists will appear here.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="table-wrapper hide-mobile">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Therapist</th>
                  <th>Pay Period</th>
                  <th>Total Hours</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="data-table-row" onClick={() => setSelectedInvoice(inv)}>
                    <td className="data-table-primary">{inv.users?.first_name} {inv.users?.last_name}</td>
                    <td>{formatDate(inv.pay_period_start)} — {formatDate(inv.pay_period_end)}</td>
                    <td>{inv.total_hours}</td>
                    <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td>
                      <button className="btn btn--small btn--ghost" onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv) }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="card-list show-mobile">
            {invoices.map(inv => (
              <div key={inv.id} className="card card--clickable" onClick={() => setSelectedInvoice(inv)}>
                <div className="card-row">
                  <span className="card-label">{inv.users?.first_name} {inv.users?.last_name}</span>
                  <StatusBadge status={inv.status} />
                </div>
                <div className="card-row">
                  <span className="card-muted">{formatDate(inv.pay_period_start)} — {formatDate(inv.pay_period_end)}</span>
                  <span className="card-value">{inv.total_hours} hrs</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Invoice Detail Modal */}
      <Modal
        open={!!selectedInvoice}
        onClose={() => { setSelectedInvoice(null); setRejectReason('') }}
        title="Invoice Details"
        wide
      >
        {selectedInvoice && (
          <div>
            <div className="modal-section">
              <div className="modal-label">Therapist</div>
              <div className="modal-value">{selectedInvoice.users?.first_name} {selectedInvoice.users?.last_name}</div>
            </div>
            <div className="modal-section">
              <div className="modal-label">Pay Period</div>
              <div className="modal-value">{formatDate(selectedInvoice.pay_period_start)} — {formatDate(selectedInvoice.pay_period_end)}</div>
            </div>

            <div className="hours-grid">
              <HourRow label="IIC" value={selectedInvoice.hours_iic} />
              <HourRow label="OP" value={selectedInvoice.hours_op} />
              <HourRow label="SBYS" value={selectedInvoice.hours_sbys} />
              <HourRow label="ADOs" value={selectedInvoice.hours_ado} />
              <HourRow label="Sick" value={selectedInvoice.hours_sick} />
              <HourRow label="PTO" value={selectedInvoice.hours_pto} />
              <HourRow label="APN" value={selectedInvoice.hours_apn} />
              <div className="hours-grid-total">
                <span>Total Hours</span>
                <span>{selectedInvoice.total_hours}</span>
              </div>
            </div>

            {selectedInvoice.notes && (
              <div className="modal-section">
                <div className="modal-label">Notes</div>
                <div className="modal-value">{selectedInvoice.notes}</div>
              </div>
            )}

            {selectedInvoice.rejection_reason && (
              <div className="modal-section">
                <div className="modal-label" style={{ color: 'var(--danger)' }}>Rejection Reason</div>
                <div className="modal-value">{selectedInvoice.rejection_reason}</div>
              </div>
            )}

            {selectedInvoice.status === 'pending' && (
              <div className="modal-actions">
                <button className="btn btn--primary" onClick={() => handleApprove(selectedInvoice)} disabled={processing}>
                  {processing ? 'Processing...' : 'Approve'}
                </button>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Rejection reason (required to reject)"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    className="form-input"
                    style={{ marginBottom: '0.5rem' }}
                  />
                  <button className="btn btn--danger" onClick={() => handleReject(selectedInvoice)} disabled={processing}>
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function HourRow({ label, value }) {
  return (
    <div className="hours-grid-row">
      <span className="hours-grid-label">{label}</span>
      <span className="hours-grid-value">{value || 0}</span>
    </div>
  )
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
