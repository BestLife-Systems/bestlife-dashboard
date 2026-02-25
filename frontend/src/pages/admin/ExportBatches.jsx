import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import StatusBadge from '../../components/StatusBadge'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ExportBatches() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [approvedCount, setApprovedCount] = useState(0)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadBatches() }, [])

  async function loadBatches() {
    setLoading(true)
    try {
      const data = await apiGet('/payroll/export-batches')
      setBatches(data.batches || [])
      setApprovedCount(data.exportable_count || 0)
    } catch (err) {
      console.error('Failed to load export batches:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const result = await apiPost('/payroll/export-batches/generate')
      if (result.csv_text) {
        const blob = new Blob([result.csv_text], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = result.filename || `payroll-export-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
      loadBatches()
    } catch (err) {
      alert('Error generating export: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleDownload(batch) {
    try {
      const data = await apiGet(`/payroll/export-batches/${batch.id}/download`)
      const blob = new Blob([data.csv_text], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.filename || `export-${batch.id}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Error downloading: ' + err.message)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Export Batches</h2>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={handleGenerate} disabled={generating || approvedCount === 0}>
            {generating ? 'Generating…' : `Export ${approvedCount} Approved`}
          </button>
        </div>
      </div>

      {batches.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <h3>No exports yet</h3>
          <p>Approve invoices first, then generate export batches here.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Created</th>
                <th>Records</th>
                <th>Total Pay</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id} className="data-table-row">
                  <td className="data-table-primary">{b.label || `Batch #${b.batch_number}`}</td>
                  <td>{formatDate(b.created_at)}</td>
                  <td>{b.record_count || 0}</td>
                  <td>${(b.total_pay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>
                    <button className="btn btn--small btn--ghost" onClick={() => handleDownload(b)}>Download CSV</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
