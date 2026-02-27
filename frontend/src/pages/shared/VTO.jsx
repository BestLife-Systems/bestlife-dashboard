import { useState, useEffect } from 'react'
import { apiGet, apiPatch } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'

export default function VTO() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState(null)
  const [saving, setSaving] = useState(false)
  const verb = useLoadingVerb(loading)

  useEffect(() => { loadVTO() }, [])

  async function loadVTO() {
    setLoading(true)
    try {
      const result = await apiGet('/vto')
      setData(result)
    } catch (err) {
      console.error('Failed to load VTO:', err)
    } finally {
      setLoading(false)
    }
  }

  function startEditing() {
    setEditData(JSON.parse(JSON.stringify(data)))
    setEditing(true)
  }

  async function saveChanges() {
    setSaving(true)
    try {
      await apiPatch('/vto', editData)
      setData(editData)
      setEditing(false)
    } catch (err) {
      console.error('Failed to save VTO:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
  }

  if (!data) {
    return (
      <div>
        <div className="page-header"><h2 className="page-title">Vision / Traction Organizer</h2></div>
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>VTO not configured</h3>
          <p>The VTO will be available once it's set up.</p>
        </div>
      </div>
    )
  }

  const d = editing ? editData : data

  return (
    <div className="vto-page">
      <div className="page-header">
        <h2 className="page-title">Vision / Traction Organizer</h2>
        {isAdmin && (
          <div className="page-actions">
            {editing ? (
              <>
                <button className="btn btn--primary btn--small" onClick={saveChanges} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn btn--secondary btn--small" onClick={() => setEditing(false)}>Cancel</button>
              </>
            ) : (
              <button className="btn btn--primary btn--small" onClick={startEditing}>Edit</button>
            )}
          </div>
        )}
      </div>

      <div className="vto-grid">
        {/* ── VISION SIDE ── */}
        <div className="vto-col">
          <div className="vto-section-label">Vision</div>

          {/* Core Values */}
          <div className="vto-card">
            <div className="vto-card-title">Core Values</div>
            {editing ? (
              <EditableList
                items={d.vision.core_values}
                onChange={items => setEditData(prev => ({ ...prev, vision: { ...prev.vision, core_values: items } }))}
              />
            ) : (
              <ol className="vto-list">{d.vision.core_values.map((v, i) => <li key={i}>{v}</li>)}</ol>
            )}
          </div>

          {/* Core Focus */}
          <div className="vto-card">
            <div className="vto-card-title">Core Focus</div>
            {editing ? (
              <>
                <div className="form-field vto-field"><label>Passion</label><input value={d.vision.core_focus.passion} onChange={e => setEditData(prev => ({ ...prev, vision: { ...prev.vision, core_focus: { ...prev.vision.core_focus, passion: e.target.value } } }))} /></div>
                <div className="form-field vto-field"><label>Our Niche</label><input value={d.vision.core_focus.niche} onChange={e => setEditData(prev => ({ ...prev, vision: { ...prev.vision, core_focus: { ...prev.vision.core_focus, niche: e.target.value } } }))} /></div>
              </>
            ) : (
              <>
                <div className="vto-kv"><span className="vto-kv-label">Passion:</span> {d.vision.core_focus.passion}</div>
                <div className="vto-kv"><span className="vto-kv-label">Our Niche:</span> {d.vision.core_focus.niche}</div>
              </>
            )}
          </div>

          {/* 10-Year Target */}
          <div className="vto-card">
            <div className="vto-card-title">10-Year Target</div>
            {editing ? (
              <div className="form-field vto-field"><input value={d.vision.ten_year_target} onChange={e => setEditData(prev => ({ ...prev, vision: { ...prev.vision, ten_year_target: e.target.value } }))} /></div>
            ) : (
              <div className="vto-big-target">{d.vision.ten_year_target}</div>
            )}
          </div>

          {/* Marketing Strategy */}
          <div className="vto-card">
            <div className="vto-card-title">Marketing Strategy</div>
            <div className="vto-sub-label">Target Market / "The List"</div>
            {editing ? (
              <EditableList
                items={d.vision.marketing_strategy.target_market}
                onChange={items => setEditData(prev => ({ ...prev, vision: { ...prev.vision, marketing_strategy: { ...prev.vision.marketing_strategy, target_market: items } } }))}
              />
            ) : (
              <ol className="vto-list">{d.vision.marketing_strategy.target_market.map((v, i) => <li key={i}>{v}</li>)}</ol>
            )}
            <div className="vto-sub-label" style={{ marginTop: '0.75rem' }}>3 Uniques</div>
            {editing ? (
              <EditableList
                items={d.vision.marketing_strategy.three_uniques}
                onChange={items => setEditData(prev => ({ ...prev, vision: { ...prev.vision, marketing_strategy: { ...prev.vision.marketing_strategy, three_uniques: items } } }))}
              />
            ) : (
              <ol className="vto-list">{d.vision.marketing_strategy.three_uniques.map((v, i) => <li key={i}>{v}</li>)}</ol>
            )}
            <div className="vto-sub-label" style={{ marginTop: '0.75rem' }}>Proven Process</div>
            {editing ? (
              <div className="form-field vto-field"><input value={d.vision.marketing_strategy.proven_process} onChange={e => setEditData(prev => ({ ...prev, vision: { ...prev.vision, marketing_strategy: { ...prev.vision.marketing_strategy, proven_process: e.target.value } } }))} /></div>
            ) : (
              <div className="vto-kv">{d.vision.marketing_strategy.proven_process}</div>
            )}
          </div>

          {/* 3-Year Picture */}
          <div className="vto-card">
            <div className="vto-card-title">3-Year Picture</div>
            {editing ? (
              <>
                <div className="vto-metrics-row">
                  <div className="form-field vto-field"><label>Future Date</label><input value={d.vision.three_year_picture.future_date} onChange={e => setEditData(prev => ({ ...prev, vision: { ...prev.vision, three_year_picture: { ...prev.vision.three_year_picture, future_date: e.target.value } } }))} /></div>
                  <div className="form-field vto-field"><label>Revenue</label><input value={d.vision.three_year_picture.revenue} onChange={e => setEditData(prev => ({ ...prev, vision: { ...prev.vision, three_year_picture: { ...prev.vision.three_year_picture, revenue: e.target.value } } }))} /></div>
                </div>
                <div className="vto-metrics-row">
                  <div className="form-field vto-field"><label>Profit</label><input value={d.vision.three_year_picture.profit} onChange={e => setEditData(prev => ({ ...prev, vision: { ...prev.vision, three_year_picture: { ...prev.vision.three_year_picture, profit: e.target.value } } }))} /></div>
                  <div className="form-field vto-field"><label>Measurables</label><input value={d.vision.three_year_picture.measurables} onChange={e => setEditData(prev => ({ ...prev, vision: { ...prev.vision, three_year_picture: { ...prev.vision.three_year_picture, measurables: e.target.value } } }))} /></div>
                </div>
                <div className="vto-sub-label" style={{ marginTop: '0.75rem' }}>What does it look like?</div>
                <EditableList
                  items={d.vision.three_year_picture.what_does_it_look_like}
                  onChange={items => setEditData(prev => ({ ...prev, vision: { ...prev.vision, three_year_picture: { ...prev.vision.three_year_picture, what_does_it_look_like: items } } }))}
                />
              </>
            ) : (
              <>
                <div className="vto-metrics-row">
                  <div className="vto-metric"><span className="vto-metric-label">Future Date</span><span className="vto-metric-value">{d.vision.three_year_picture.future_date}</span></div>
                  <div className="vto-metric"><span className="vto-metric-label">Revenue</span><span className="vto-metric-value">{d.vision.three_year_picture.revenue}</span></div>
                  <div className="vto-metric"><span className="vto-metric-label">Profit</span><span className="vto-metric-value">{d.vision.three_year_picture.profit}</span></div>
                  <div className="vto-metric"><span className="vto-metric-label">Measurables</span><span className="vto-metric-value">{d.vision.three_year_picture.measurables}</span></div>
                </div>
                <div className="vto-sub-label" style={{ marginTop: '0.75rem' }}>What does it look like?</div>
                <ul className="vto-checklist">{d.vision.three_year_picture.what_does_it_look_like.map((v, i) => <li key={i}>{v}</li>)}</ul>
              </>
            )}
          </div>
        </div>

        {/* ── TRACTION SIDE ── */}
        <div className="vto-col">
          <div className="vto-section-label">Traction</div>

          {/* 1-Year Plan */}
          <div className="vto-card">
            <div className="vto-card-title">1-Year Plan</div>
            {editing ? (
              <>
                <div className="vto-metrics-row">
                  <div className="form-field vto-field"><label>Future Date</label><input value={d.traction.one_year_plan.future_date} onChange={e => setEditData(prev => ({ ...prev, traction: { ...prev.traction, one_year_plan: { ...prev.traction.one_year_plan, future_date: e.target.value } } }))} /></div>
                  <div className="form-field vto-field"><label>Revenue</label><input value={d.traction.one_year_plan.revenue} onChange={e => setEditData(prev => ({ ...prev, traction: { ...prev.traction, one_year_plan: { ...prev.traction.one_year_plan, revenue: e.target.value } } }))} /></div>
                </div>
                <div className="vto-metrics-row">
                  <div className="form-field vto-field"><label>Profit</label><input value={d.traction.one_year_plan.profit} onChange={e => setEditData(prev => ({ ...prev, traction: { ...prev.traction, one_year_plan: { ...prev.traction.one_year_plan, profit: e.target.value } } }))} /></div>
                  <div className="form-field vto-field"><label>Measurables</label><input value={d.traction.one_year_plan.measurables} onChange={e => setEditData(prev => ({ ...prev, traction: { ...prev.traction, one_year_plan: { ...prev.traction.one_year_plan, measurables: e.target.value } } }))} /></div>
                </div>
                <div className="vto-sub-label" style={{ marginTop: '0.75rem' }}>Goals for the Year</div>
                <EditableList
                  items={d.traction.one_year_plan.goals}
                  onChange={items => setEditData(prev => ({ ...prev, traction: { ...prev.traction, one_year_plan: { ...prev.traction.one_year_plan, goals: items } } }))}
                />
              </>
            ) : (
              <>
                <div className="vto-metrics-row">
                  <div className="vto-metric"><span className="vto-metric-label">Future Date</span><span className="vto-metric-value">{d.traction.one_year_plan.future_date}</span></div>
                  <div className="vto-metric"><span className="vto-metric-label">Revenue</span><span className="vto-metric-value">{d.traction.one_year_plan.revenue}</span></div>
                  <div className="vto-metric"><span className="vto-metric-label">Profit</span><span className="vto-metric-value">{d.traction.one_year_plan.profit}</span></div>
                  <div className="vto-metric"><span className="vto-metric-label">Measurables</span><span className="vto-metric-value">{d.traction.one_year_plan.measurables}</span></div>
                </div>
                <div className="vto-sub-label" style={{ marginTop: '0.75rem' }}>Goals for the Year</div>
                <ol className="vto-list">{d.traction.one_year_plan.goals.map((v, i) => <li key={i}>{v}</li>)}</ol>
              </>
            )}
          </div>

          {/* Rocks */}
          <div className="vto-card">
            <div className="vto-card-title">Rocks</div>
            {editing ? (
              <EditableRocks
                rocks={d.traction.rocks}
                onChange={rocks => setEditData(prev => ({ ...prev, traction: { ...prev.traction, rocks } }))}
              />
            ) : (
              d.traction.rocks.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No rocks set for this quarter.</div>
              ) : (
                <div className="vto-rocks-list">
                  {d.traction.rocks.map((rock, i) => (
                    <div key={i} className="vto-rock">
                      <span className="vto-rock-num">{i + 1}.</span>
                      <span className="vto-rock-title">{rock.title}</span>
                      {rock.who && <span className="vto-rock-who">{rock.who}</span>}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Issues */}
          <div className="vto-card">
            <div className="vto-card-title">Issues List</div>
            {editing ? (
              <EditableList
                items={d.traction.issues}
                onChange={items => setEditData(prev => ({ ...prev, traction: { ...prev.traction, issues: items } }))}
              />
            ) : (
              d.traction.issues.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No issues logged.</div>
              ) : (
                <ol className="vto-list">{d.traction.issues.map((v, i) => <li key={i}>{v}</li>)}</ol>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


function EditableList({ items, onChange }) {
  function updateItem(idx, value) {
    const copy = [...items]
    copy[idx] = value
    onChange(copy)
  }
  function removeItem(idx) {
    onChange(items.filter((_, i) => i !== idx))
  }
  function addItem() {
    onChange([...items, ''])
  }

  return (
    <div className="vto-editable-list">
      {items.map((item, i) => (
        <div key={i} className="vto-editable-item">
          <input value={item} onChange={e => updateItem(i, e.target.value)} className="form-input" />
          <button className="btn btn--xs btn--ghost" onClick={() => removeItem(i)} title="Remove">✗</button>
        </div>
      ))}
      <button className="btn btn--xs btn--ghost" onClick={addItem} style={{ marginTop: '0.25rem' }}>+ Add</button>
    </div>
  )
}


function EditableRocks({ rocks, onChange }) {
  function updateRock(idx, field, value) {
    const copy = [...rocks]
    copy[idx] = { ...copy[idx], [field]: value }
    onChange(copy)
  }
  function removeRock(idx) {
    onChange(rocks.filter((_, i) => i !== idx))
  }
  function addRock() {
    onChange([...rocks, { title: '', who: '' }])
  }

  return (
    <div className="vto-editable-list">
      {rocks.map((rock, i) => (
        <div key={i} className="vto-editable-item">
          <input value={rock.title} onChange={e => updateRock(i, 'title', e.target.value)} className="form-input" placeholder="Rock title" style={{ flex: 2 }} />
          <input value={rock.who || ''} onChange={e => updateRock(i, 'who', e.target.value)} className="form-input" placeholder="Who" style={{ width: '5rem' }} />
          <button className="btn btn--xs btn--ghost" onClick={() => removeRock(i)} title="Remove">✗</button>
        </div>
      ))}
      <button className="btn btn--xs btn--ghost" onClick={addRock} style={{ marginTop: '0.25rem' }}>+ Add Rock</button>
    </div>
  )
}
