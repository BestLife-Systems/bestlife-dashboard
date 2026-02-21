import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import bettyBrain from '../../assets/betty-brain.png'

// Brain SVG fallback
function BrainIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  )
}

// ── Futuristic category icons — geometric, angular, circuit-style ──
const sz = { width: 38, height: 38, viewBox: '0 0 32 32', fill: 'none', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }

const CAT_ICONS = {
  Onboarding: (
    <svg {...sz} stroke="currentColor">
      <path d="M16 2L28 9v14l-12 7L4 23V9z" opacity="0.3" />
      <path d="M16 4L26 10v12l-10 6L6 22V10z" />
      <polyline points="11 16 14.5 19.5 21 13" strokeWidth="2" />
    </svg>
  ),
  Policies: (
    <svg {...sz} stroke="currentColor">
      <path d="M16 3L27 8v10c0 7-11 11-11 11S5 25 5 18V8z" />
      <line x1="16" y1="13" x2="16" y2="19" strokeWidth="1.8" />
      <circle cx="16" cy="21" r="0.8" fill="currentColor" stroke="none" />
      <line x1="10" y1="10" x2="12" y2="12" opacity="0.3" />
      <line x1="22" y1="10" x2="20" y2="12" opacity="0.3" />
    </svg>
  ),
  Billing: (
    <svg {...sz} stroke="#34d399">
      <rect x="6" y="6" width="20" height="20" rx="3" transform="rotate(45 16 16)" opacity="0.2" />
      <path d="M16 8v16" strokeWidth="1.8" />
      <path d="M20 12h-5.5a2.5 2.5 0 0 0 0 5h3a2.5 2.5 0 0 1 0 5H11" strokeWidth="1.8" />
      <circle cx="8" cy="8" r="1" fill="#34d399" stroke="none" opacity="0.5" />
      <circle cx="24" cy="24" r="1" fill="#34d399" stroke="none" opacity="0.5" />
    </svg>
  ),
  Clinical: (
    <svg {...sz} stroke="currentColor">
      <rect x="4" y="6" width="24" height="20" rx="10" opacity="0.15" />
      <polyline points="4 16 10 16 12.5 10 16 22 19.5 16 22 16 28 16" strokeWidth="1.8" />
    </svg>
  ),
  'HR & Benefits': (
    <svg {...sz} stroke="currentColor">
      <circle cx="16" cy="10" r="3.5" />
      <circle cx="7" cy="22" r="2.5" />
      <circle cx="25" cy="22" r="2.5" />
      <line x1="16" y1="13.5" x2="7" y2="19.5" opacity="0.4" />
      <line x1="16" y1="13.5" x2="25" y2="19.5" opacity="0.4" />
      <line x1="9.5" y1="22" x2="22.5" y2="22" opacity="0.2" strokeDasharray="2 2" />
    </svg>
  ),
  Technology: (
    <svg {...sz} stroke="currentColor">
      <rect x="9" y="9" width="14" height="14" rx="2" />
      <line x1="12" y1="9" x2="12" y2="5" /><line x1="16" y1="9" x2="16" y2="5" /><line x1="20" y1="9" x2="20" y2="5" />
      <line x1="12" y1="23" x2="12" y2="27" /><line x1="16" y1="23" x2="16" y2="27" /><line x1="20" y1="23" x2="20" y2="27" />
      <line x1="9" y1="13" x2="5" y2="13" /><line x1="9" y1="19" x2="5" y2="19" />
      <line x1="23" y1="13" x2="27" y2="13" /><line x1="23" y1="19" x2="27" y2="19" />
      <rect x="13" y="13" width="6" height="6" rx="1" opacity="0.3" fill="currentColor" stroke="none" />
    </svg>
  ),
  Templates: (
    <svg {...sz} stroke="currentColor">
      <rect x="5" y="5" width="22" height="22" rx="3" />
      <line x1="5" y1="12" x2="27" y2="12" />
      <line x1="13" y1="12" x2="13" y2="27" />
      <circle cx="9" cy="8.5" r="1" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="20" cy="8.5" r="1" fill="currentColor" stroke="none" opacity="0.4" />
    </svg>
  ),
  Training: (
    <svg {...sz} stroke="currentColor">
      <path d="M4 6h10a2 2 0 0 1 2 2v18a1.5 1.5 0 0 0-1.5-1.5H4z" />
      <path d="M28 6H18a2 2 0 0 0-2 2v18a1.5 1.5 0 0 1 1.5-1.5H28z" />
      <line x1="24" y1="2" x2="24" y2="5" strokeWidth="1.2" opacity="0.5" />
      <line x1="22.5" y1="3" x2="25.5" y2="3" strokeWidth="1.2" opacity="0.5" />
    </svg>
  ),
}

const CATEGORIES = [
  { name: 'Onboarding', color: '#00bbee' },
  { name: 'Policies', color: '#60a5fa' },
  { name: 'Billing', color: '#34d399' },
  { name: 'Clinical', color: '#f87171' },
  { name: 'HR & Benefits', color: '#a78bfa' },
  { name: 'Technology', color: '#34d399' },
  { name: 'Templates', color: '#fb923c' },
  { name: 'Training', color: '#f472b6' },
]

// ── Canvas space background with Big Dipper + Blue Man constellations ──
function SpaceCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId

    const stars = []
    const STAR_COUNT = 220
    const shooters = []

    // Named constellation definitions (as fractions of canvas)
    // Big Dipper — 7 stars in the classic pattern
    const BIG_DIPPER = [
      { x: 0.12, y: 0.15 }, // Dubhe (front of bowl top)
      { x: 0.08, y: 0.22 }, // Merak (front of bowl bottom)
      { x: 0.16, y: 0.26 }, // Phecda (back of bowl bottom)
      { x: 0.20, y: 0.18 }, // Megrez (back of bowl top)
      { x: 0.27, y: 0.14 }, // Alioth (first handle)
      { x: 0.33, y: 0.11 }, // Mizar (mid handle)
      { x: 0.38, y: 0.08 }, // Alkaid (end handle)
    ]
    const BIG_DIPPER_LINES = [[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]]

    // Blue Man mascot — simplified stick figure sitting with arms on hips
    const BLUE_MAN = [
      { x: 0.82, y: 0.60 }, // 0  head top
      { x: 0.82, y: 0.65 }, // 1  chin/neck
      { x: 0.82, y: 0.74 }, // 2  torso center
      { x: 0.82, y: 0.82 }, // 3  waist
      { x: 0.76, y: 0.70 }, // 4  left hand (arm on hip)
      { x: 0.88, y: 0.70 }, // 5  right hand (arm on hip)
      { x: 0.77, y: 0.92 }, // 6  left foot
      { x: 0.87, y: 0.92 }, // 7  right foot
    ]
    const BLUE_MAN_LINES = [[0,1],[1,2],[2,3],[1,4],[1,5],[4,3],[5,3],[3,6],[3,7]]

    let constellationStars = [] // {x, y, r, alpha} for constellation-specific stars
    let constellationLines = [] // [[starIdx, starIdx]]

    function resize() {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function initStars() {
      stars.length = 0
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight
      for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
          x: Math.random() * cw, y: Math.random() * ch,
          r: Math.random() * 1.8 + 0.2,
          alpha: Math.random() * 0.7 + 0.3,
          speed: Math.random() * 0.02 + 0.005,
          offset: Math.random() * Math.PI * 2,
          hue: Math.random() < 0.12 ? (Math.random() < 0.5 ? 195 : 270) : 0,
        })
      }
      // Build named constellations
      constellationStars = []
      constellationLines = []
      const buildConstellation = (points, lines, color) => {
        const base = constellationStars.length
        points.forEach(p => {
          constellationStars.push({
            x: p.x * cw, y: p.y * ch,
            r: 2.2, alpha: 0.9, color
          })
        })
        lines.forEach(([a, b]) => constellationLines.push([base + a, base + b, color]))
      }
      buildConstellation(BIG_DIPPER, BIG_DIPPER_LINES, 'rgba(180,210,255,0.4)')
      buildConstellation(BLUE_MAN, BLUE_MAN_LINES, 'rgba(100,190,255,0.35)')
    }

    function spawnShooter() {
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight
      shooters.push({
        x: Math.random() * cw * 0.7 + cw * 0.1, y: Math.random() * ch * 0.3,
        vx: (Math.random() * 4 + 3) * (Math.random() < 0.5 ? 1 : -1),
        vy: Math.random() * 2.5 + 1.5, life: 1,
        decay: Math.random() * 0.015 + 0.008, len: Math.random() * 80 + 40,
      })
    }

    resize(); initStars()
    const onResize = () => { resize(); initStars() }
    window.addEventListener('resize', onResize)
    let lastShoot = 0

    function draw(now) {
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight
      ctx.clearRect(0, 0, cw, ch)

      // Milky way
      const g = ctx.createLinearGradient(0, 0, cw, ch)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(0.3, 'rgba(60,50,120,0.05)')
      g.addColorStop(0.45, 'rgba(80,60,180,0.08)')
      g.addColorStop(0.55, 'rgba(40,80,200,0.07)')
      g.addColorStop(0.7, 'rgba(60,50,120,0.04)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch)

      // Named constellation lines (Big Dipper + Blue Man)
      for (const [a, b, color] of constellationLines) {
        const sa = constellationStars[a], sb = constellationStars[b]
        if (!sa || !sb) continue
        ctx.strokeStyle = color; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke()
      }
      // Constellation stars (brighter, slightly larger)
      const t = now * 0.001
      for (const s of constellationStars) {
        const fl = Math.sin(t * 0.8 + s.x) * 0.15 + 0.85
        ctx.fillStyle = s.color.replace(/[\d.]+\)$/, `${s.alpha * fl})`)
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
        // Small glow
        ctx.fillStyle = s.color.replace(/[\d.]+\)$/, `${0.15 * fl})`)
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2); ctx.fill()
      }

      // Background stars
      for (const s of stars) {
        const fl = Math.sin(t * s.speed * 60 + s.offset) * 0.3 + 0.7
        const a = s.alpha * fl
        ctx.fillStyle = s.hue ? `hsla(${s.hue},70%,75%,${a})` : `rgba(255,255,255,${a})`
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
      }

      // Shooting stars
      if (now - lastShoot > 2000 + Math.random() * 5000) { spawnShooter(); lastShoot = now }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i]; s.x += s.vx; s.y += s.vy; s.life -= s.decay
        if (s.life <= 0) { shooters.splice(i, 1); continue }
        const tx = s.x - s.vx * s.len * 0.3, ty = s.y - s.vy * s.len * 0.3
        const sg = ctx.createLinearGradient(tx, ty, s.x, s.y)
        sg.addColorStop(0, 'rgba(255,255,255,0)')
        sg.addColorStop(1, `rgba(200,220,255,${s.life * 0.8})`)
        ctx.strokeStyle = sg; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke()
        ctx.fillStyle = `rgba(220,240,255,${s.life})`
        ctx.beginPath(); ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2); ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize) }
  }, [])

  return <canvas ref={canvasRef} className="kb-space-canvas" />
}

// ── Curved label — arcs OUTSIDE below the icon circle ──
function CurvedLabel({ text, color, isHovered }) {
  // Arc sits entirely below the icon. The arc center is at the top of this SVG,
  // curving downward so text follows the outside bottom curve of the icon circle.
  const r = 48
  const id = `arc-${text.replace(/[^a-zA-Z]/g, '')}`
  return (
    <svg
      width="130"
      height="28"
      viewBox="0 0 130 28"
      className={`kb-curved-label ${isHovered ? 'kb-curved-label--hovered' : ''}`}
    >
      <defs>
        <path id={id} d={`M ${65 - r} 2 A ${r} ${r} 0 0 1 ${65 + r} 2`} />
      </defs>
      <text
        fill={isHovered ? '#ffffff' : (color || '#7d8a82')}
        fontSize="11"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="600"
        letterSpacing="0.04em"
      >
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
          {text}
        </textPath>
      </text>
    </svg>
  )
}

// ── Orbit radius — responsive ──
function getOrbitRadius() {
  if (typeof window === 'undefined') return 280
  if (window.innerWidth <= 480) return 125
  if (window.innerWidth <= 768) return 180
  return 280
}

// ── Orbital component ──
function OrbitTrack({ categories, hoveredCat, setHoveredCat, onCategoryClick }) {
  const angleRef = useRef(0)
  const rafRef = useRef(null)
  const pausedRef = useRef(false)
  const nodesRef = useRef([])
  const lastTimeRef = useRef(null)
  const radiusRef = useRef(getOrbitRadius())

  useEffect(() => { pausedRef.current = hoveredCat !== null }, [hoveredCat])

  useEffect(() => {
    const fn = () => { radiusRef.current = getOrbitRadius() }
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    function tick(now) {
      if (!lastTimeRef.current) lastTimeRef.current = now
      const dt = now - lastTimeRef.current; lastTimeRef.current = now
      if (!pausedRef.current) angleRef.current = (angleRef.current + (dt / 1000) * 9) % 360
      const total = categories.length, r = radiusRef.current
      nodesRef.current.forEach((el, i) => {
        if (!el) return
        const a = angleRef.current + (360 / total) * i
        const rad = (a * Math.PI) / 180
        el.style.transform = `translate(${Math.sin(rad) * r}px, ${-Math.cos(rad) * r}px)`
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [categories.length])

  return (
    <div className="kb-orbit-track-js">
      {categories.map((cat, i) => {
        const isHovered = hoveredCat === i
        return (
          <div
            key={cat.name}
            ref={el => (nodesRef.current[i] = el)}
            className={`kb-orbit-node-js ${isHovered ? 'kb-orbit-node-js--hovered' : ''}`}
            style={{ '--node-color': cat.color }}
            onMouseEnter={() => setHoveredCat(i)}
            onMouseLeave={() => setHoveredCat(null)}
            onClick={() => onCategoryClick(cat.name)}
          >
            <div className="kb-orbit-node-icon-js">
              {CAT_ICONS[cat.name]}
            </div>
            <CurvedLabel text={cat.name} color={cat.color} isHovered={isHovered} />
          </div>
        )
      })}
    </div>
  )
}

// ── Add Article Panel — QuickBooks-style category picker ──
function AddArticlePanel({ categories, onClose, onSaved }) {
  const { profile } = useAuth()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState([])
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const tagRef = useRef(null)

  const allCategoryNames = categories.map(c => c.name)
  const filtered = tagInput.trim()
    ? allCategoryNames.filter(c => c.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(c))
    : allCategoryNames.filter(c => !tags.includes(c))
  const exactMatch = allCategoryNames.some(c => c.toLowerCase() === tagInput.trim().toLowerCase())

  const addTag = (t) => {
    if (!tags.includes(t)) setTags([...tags, t])
    setTagInput('')
    setShowTagDropdown(false)
  }
  const removeTag = (t) => setTags(tags.filter(x => x !== t))

  const handleSave = async (status) => {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true); setError(null)
    try {
      const { error: err } = await supabase.from('kb_articles').insert({
        title: title.trim(),
        body_markdown: body.trim() || null,
        tags,
        status,
        created_by_user_id: profile?.id || null,
      })
      if (err) throw err
      onSaved?.()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally { setSaving(false) }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (tagRef.current && !tagRef.current.contains(e.target)) setShowTagDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="kb-add-panel">
      <div className="kb-add-panel-header">
        <h3 className="kb-add-panel-title">Add Article</h3>
        <button className="kb-add-panel-close" onClick={onClose}>&times;</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-field" style={{ marginBottom: '1rem' }}>
        <label>Title</label>
        <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Article title..." />
      </div>
      <div className="form-field" style={{ marginBottom: '1rem' }} ref={tagRef}>
        <label>Categories</label>
        <div className="kb-tag-chips">
          {tags.map(t => (
            <span key={t} className="kb-tag-chip">
              {t}
              <button onClick={() => removeTag(t)}>&times;</button>
            </span>
          ))}
        </div>
        <input
          className="form-input"
          value={tagInput}
          onChange={e => { setTagInput(e.target.value); setShowTagDropdown(true) }}
          onFocus={() => setShowTagDropdown(true)}
          placeholder="Type a category..."
        />
        {showTagDropdown && (
          <div className="kb-tag-dropdown">
            {filtered.map(c => (
              <div key={c} className="kb-tag-dropdown-item" onClick={() => addTag(c)}>{c}</div>
            ))}
            {tagInput.trim() && !exactMatch && (
              <div className="kb-tag-dropdown-item kb-tag-dropdown-add" onClick={() => addTag(tagInput.trim())}>
                + Add "{tagInput.trim()}"
              </div>
            )}
            {!tagInput.trim() && filtered.length === 0 && (
              <div className="kb-tag-dropdown-empty">All categories added</div>
            )}
          </div>
        )}
      </div>
      <div className="form-field" style={{ marginBottom: '1.25rem' }}>
        <label>Content</label>
        <textarea className="form-input" rows="6" value={body} onChange={e => setBody(e.target.value)} placeholder="Article content (markdown supported)..." style={{ resize: 'vertical', minHeight: '120px' }} />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button className="btn btn--secondary btn--small" onClick={() => handleSave('draft')} disabled={saving}>Save Draft</button>
        <button className="btn btn--primary btn--small" onClick={() => handleSave('published')} disabled={saving}>Publish</button>
      </div>
    </div>
  )
}

// ── Main ──
export default function KnowledgeBase() {
  const { profile, isAdmin } = useAuth()
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState(null)
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [hoveredCat, setHoveredCat] = useState(null)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const verb = useLoadingVerb(loading)

  const fetchArticles = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase.from('kb_articles').select('*')
      if (!isAdmin) query = query.eq('status', 'published')
      query = query.order('created_at', { ascending: false })
      if (search.trim()) query = query.or(`title.ilike.%${search.trim()}%,body_markdown.ilike.%${search.trim()}%`)
      if (selectedTag) query = query.contains('tags', [selectedTag])
      const { data, error } = await query
      if (error) throw error
      setArticles(data || [])
    } catch (err) { console.error('KB fetch error:', err); setArticles([]) }
    finally { setLoading(false) }
  }, [search, selectedTag, isAdmin])

  useEffect(() => { const t = setTimeout(fetchArticles, 300); return () => clearTimeout(t) }, [fetchArticles])

  const clearFilters = () => { setSearch(''); setSelectedTag(null) }

  if (selectedArticle) {
    return (
      <div>
        <div className="page-header"><h2 className="page-title">Betty's Brain</h2></div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <button className="btn btn--ghost btn--small" onClick={() => setSelectedArticle(null)}>&#8592; Back</button>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-bright)', fontWeight: 400 }}>{selectedArticle.title}</h3>
            {selectedArticle.status === 'draft' && <span className="badge badge--warning">Draft</span>}
          </div>
          <div className="kb-article-meta" style={{ marginBottom: '1rem' }}>
            {(selectedArticle.tags || []).map(tag => <span key={tag} className="kb-article-tag">{tag}</span>)}
          </div>
          <div className="kb-article-body">{selectedArticle.body_markdown}</div>
        </div>
      </div>
    )
  }

  const showResults = search.trim() || selectedTag

  return (
    <div className="kb-page">
      <SpaceCanvas />

      {/* Title */}
      <div className="kb-hero">
        <h2 className="kb-hero-title">Betty's Brain</h2>
        <p className="kb-hero-sub">Explore categories or search for articles</p>
      </div>

      {/* Orbital */}
      <div className="kb-orbit-container">
        <div className="kb-orbit-center">
          <div className="kb-orbit-brain-glow" />
          <img src={bettyBrain} alt="Betty's Brain" className="kb-orbit-betty" />
        </div>
        <OrbitTrack
          categories={CATEGORIES}
          hoveredCat={hoveredCat}
          setHoveredCat={setHoveredCat}
          onCategoryClick={(name) => setSelectedTag(name)}
        />
      </div>

      {/* Search + Add button */}
      <div className="kb-search-wrap">
        <div className="kb-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search articles..." value={search} onChange={e => setSearch(e.target.value)} className="kb-search-input" />
          {showResults && <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }} onClick={clearFilters}>&#10005;</button>}
          {isAdmin && (
            <button className="btn btn--primary btn--small" style={{ flexShrink: 0 }} onClick={() => setShowAddPanel(true)}>
              + Article
            </button>
          )}
        </div>
        {selectedTag && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Filtered by: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{selectedTag}</span>
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '0.5rem', fontSize: '0.85rem', textDecoration: 'underline' }}>clear</button>
          </div>
        )}
      </div>

      {/* Add Article Panel */}
      {showAddPanel && (
        <div className="kb-add-overlay">
          <AddArticlePanel
            categories={CATEGORIES}
            onClose={() => setShowAddPanel(false)}
            onSaved={fetchArticles}
          />
        </div>
      )}

      {showResults && (
        <div style={{ maxWidth: 680, width: '100%', margin: '1.5rem auto 0', position: 'relative', zIndex: 1 }}>
          {loading ? (
            <div className="page-loading"><div className="loading-spinner" /><p>{verb}...</p></div>
          ) : articles.length > 0 ? (
            <>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                {articles.length} article{articles.length !== 1 ? 's' : ''} found
              </div>
              {articles.map(article => (
                <div key={article.id} className="kb-article" onClick={() => setSelectedArticle(article)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="kb-article-title">{article.title}</div>
                    {article.status === 'draft' && <span className="badge badge--warning" style={{ fontSize: '0.65rem' }}>Draft</span>}
                  </div>
                  <div className="kb-article-meta">{(article.tags || []).map(tag => <span key={tag} className="kb-article-tag">{tag}</span>)}</div>
                  {article.body_markdown && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.375rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{article.body_markdown}</div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon" style={{ color: 'var(--accent)' }}><BrainIcon size={40} color="var(--accent)" /></div>
              <h3>No articles found</h3>
              <p>Try a different search term or clear the filter.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
