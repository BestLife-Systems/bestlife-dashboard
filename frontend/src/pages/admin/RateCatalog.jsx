import { useState, useEffect } from 'react'
import { apiGet, apiPost, apiPatch } from '../../lib/api'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import Modal from '../../components/Modal'

export default function RateCatalog() {
  const [rateTypes, setRateTypes] = useState([])
  const [billDefaults, setBillDefaults] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', unit: 'hourly', default_duration_minutes: '', default_bill_rate: '' })
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadRates() }, [])

  async function loadRates() {
    setLoading(true)
    try {
      const data = await apiGet('/payroll/rate-catalog')
      setRateTypes(data.rate_types || [])
      setBillDefaults(data.bill_rate_defaults || [])
    } catch (err) {
      console.error('Failed to load rate catalog:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editItem) {
        await apiPatch(`/payroll/rate-types/${editItem.id}`, form)
      } else {
        await apiPost('/payroll/rate-types', form)
      }
      setShowAdd(false)
      setEditItem(null)
      setForm({ name: '', unit: 'hourly', default_duration_minutes: '', default_bill_rate: '' })
      loadRates()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function openEdit(rt) {
    const bd = billDefaults.find(d => d.rate_type_id === rt.id)
    setForm({
      name: rt.name,
      unit: rt.unit,
      default_duration_minutes: rt.default_duration_minutes || '',
      default_bill_rate: bd?.default_bill_rate || '',
    })
    setEditItem(rt)
    setShowAdd(true)
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  const grouped = {
    hourly: rateTypes.filter(r => r.unit === 'hourly'),
    session: rateTypes.filter(r => r.unit === 'session'),
    day: rateTypes.filter(r => r.unit === 'day'),
    event: rateTypes.filter(r => r.unit === 'event'),
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Rate Catalog</h2>
        <button className="btn btn--primary" onClick={() => { setForm({ name: '', unit: 'hourly', default_duration_minutes: '', default_bill_rate: '' }); setEditItem(null); setShowAdd(true) }}>+ Add Rate Type</button>
      </div>

      {rateTypes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💰</div>
          <h3>No rate types configured</h3>
          <p>Rate types will be seeded automatically when the payroll system initializes.</p>
        </div>
      ) : (
        Object.entries(grouped).filter(([, items]) => items.length > 0).map(([unit, items]) => (
          <div key={unit} style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              {unit === 'hourly' ? 'Hourly Rates' : unit === 'session' ? 'Session-Based' : unit === 'day' ? 'Day Rates' : 'Event-Based'}
            </h3>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Unit</th>
                    <th>Duration</th>
                    <th>Default Bill Rate</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(rt => {
                    const bd = billDefaults.find(d => d.rate_type_id === rt.id)
                    return (
                      <tr key={rt.id} className="data-table-row">
                        <td className="data-table-primary">{rt.name}</td>
                        <td>{rt.unit}</td>
                        <td>{rt.default_duration_minutes ? `${rt.default_duration_minutes} min` : '—'}</td>
                        <td>{bd?.default_bill_rate ? `$${bd.default_bill_rate}` : '—'}</td>
                        <td><button className="btn btn--small btn--ghost" onClick={() => openEdit(rt)}>Edit</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditItem(null); setError('') }} title={editItem ? 'Edit Rate Type' : 'Add Rate Type'}>
        <form onSubmit={handleSave}>
          {error && <div className="form-error">{error}</div>}
          <div className="form-field">
            <label>Name</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <div className="form-field">
              <label>Unit</label>
              <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                <option value="hourly">Hourly</option>
                <option value="session">Session</option>
                <option value="day">Day</option>
                <option value="event">Event</option>
              </select>
            </div>
            <div className="form-field">
              <label>Duration (minutes)</label>
              <input type="number" value={form.default_duration_minutes} onChange={e => setForm({ ...form, default_duration_minutes: e.target.value })} placeholder="Optional" />
            </div>
          </div>
          <div className="form-field" style={{ marginTop: '0.75rem' }}>
            <label>Default Bill Rate ($)</label>
            <input type="number" step="0.01" value={form.default_bill_rate} onChange={e => setForm({ ...form, default_bill_rate: e.target.value })} placeholder="Optional" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={() => { setShowAdd(false); setEditItem(null) }}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : editItem ? 'Save Changes' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
