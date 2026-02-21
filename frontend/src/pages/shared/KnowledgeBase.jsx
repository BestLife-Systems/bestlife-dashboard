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
const sz = { width: 34, height: 34, viewBox: '0 0 32 32', fill: 'none', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }

const CAT_ICONS = {
  // Onboarding: hexagonal badge with check
  Onboarding: (
    <svg {...sz} stroke="currentColor">
      <path d="M16 2L28 9v14l-12 7L4 23V9z" opacity="0.3" />
      <path d="M16 4L26 10v12l-10 6L6 22V10z" />
      <polyline points="11 16 14.5 19.5 21 13" strokeWidth="2" />
    </svg>
  ),
  // Policies: angular shield with circuit lines
  Policies: (
    <svg {...sz} stroke="currentColor">
      <path d="M16 3L27 8v10c0 7-11 11-11 11S5 25 5 18V8z" />
      <line x1="16" y1="13" x2="16" y2="19" strokeWidth="1.8" />
      <circle cx="16" cy="21" r="0.8" fill="currentColor" stroke="none" />
      <line x1="10" y1="10" x2="12" y2="12" opacity="0.3" />
      <line x1="22" y1="10" x2="20" y2="12" opacity="0.3" />
    </svg>
  ),
  // Billing: neon $ in a diamond frame, money green
  Billing: (
    <svg {...sz} stroke="#34d399">
      <rect x="6" y="6" width="20" height="20" rx="3" transform="rotate(45 16 16)" opacity="0.2" />
      <path d="M16 8v16" strokeWidth="1.8" />
      <path d="M20 12h-5.5a2.5 2.5 0 0 0 0 5h3a2.5 2.5 0 0 1 0 5H11" strokeWidth="1.8" />
      <circle cx="8" cy="8" r="1" fill="#34d399" stroke="none" opacity="0.5" />
      <circle cx="24" cy="24" r="1" fill="#34d399" stroke="none" opacity="0.5" />
    </svg>
  ),
  // Clinical: heartbeat in a rounded hex
  Clinical: (
    <svg {...sz} stroke="currentColor">
      <rect x="4" y="6" width="24" height="20" rx="10" opacity="0.15" />
      <polyline points="4 16 10 16 12.5 10 16 22 19.5 16 22 16 28 16" strokeWidth="1.8" />
    </svg>
  ),
  // HR: connected nodes (people network)
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
  // Technology: circuit board / chip
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
  // Templates: grid with corner accents
  Templates: (
    <svg {...sz} stroke="currentColor">
      <rect x="5" y="5" width="22" height="22" rx="3" />
      <line x1="5" y1="12" x2="27" y2="12" />
      <line x1="13" y1="12" x2="13" y2="27" />
      <circle cx="9" cy="8.5" r="1" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="20" cy="8.5" r="1" fill="currentColor" stroke="none" opacity="0.4" />
    </svg>
  ),
  // Training: open book with spark
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

// ── Canvas space background ──
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
    const constellations = []

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
      constellations.length = 0
      for (let c = 0; c < 5; c++) {
        const cx = Math.random() * cw * 0.8 + cw * 0.1
        const cy = Math.random() * ch * 0.8 + ch * 0.1
        const nearby = stars.map((s, idx) => ({ idx, d: Math.hypot(s.x - cx, s.y - cy) }))
          .sort((a, b) => a.d - b.d).slice(0, 3 + Math.floor(Math.random() * 3))
        for (let i = 0; i < nearby.length - 1; i++) constellations.push([nearby[i].idx, nearby[i + 1].idx])
      }
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

      // Constellation lines
      ctx.strokeStyle = 'rgba(100,160,255,0.08)'; ctx.lineWidth = 0.7
      for (const [a, b] of constellations) {
        if (!stars[a] || !stars[b]) continue
        ctx.beginPath(); ctx.moveTo(stars[a].x, stars[a].y)
        ctx.lineTo(stars[b].x, stars[b].y); ctx.stroke()
      }

      // Stars
      const t = now * 0.001
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

// ── Curved label — arcs OUTSIDE/below the icon circle ──
function CurvedLabel({ text, color, isHovered }) {
  const r = 52
  const id = `arc-${text.replace(/[^a-zA-Z]/g, '')}`
  return (
    <svg
      width="120"
      height="30"
      viewBox="0 0 120 30"
      className={`kb-curved-label ${isHovered ? 'kb-curved-label--hovered' : ''}`}
    >
      <defs>
        <path id={id} d={`M ${60 - r} 6 A ${r} ${r} 0 0 1 ${60 + r} 6`} />
      </defs>
      <text
        fill={isHovered ? '#ffffff' : (color || '#7d8a82')}
        fontSize="11.5"
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
  if (typeof window === 'undefined') return 260
  if (window.innerWidth <= 480) return 125
  if (window.innerWidth <= 768) return 170
  return 260
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

// ── Main ──
export default function KnowledgeBase() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState(null)
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [hoveredCat, setHoveredCat] = useState(null)
  const verb = useLoadingVerb(loading)

  const fetchArticles = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase.from('kb_articles').select('*').eq('status', 'published').order('created_at', { ascending: false })
      if (search.trim()) query = query.or(`title.ilike.%${search.trim()}%,body_markdown.ilike.%${search.trim()}%`)
      if (selectedTag) query = query.contains('tags', [selectedTag])
      const { data, error } = await query
      if (error) throw error
      setArticles(data || [])
    } catch (err) { console.error('KB fetch error:', err); setArticles([]) }
    finally { setLoading(false) }
  }, [search, selectedTag])

  useEffect(() => { const t = setTimeout(fetchArticles, 300); return () => clearTimeout(t) }, [fetchArticles])

  const clearFilters = () => { setSearch(''); setSelectedTag(null) }

  if (selectedArticle) {
    return (
      <div>
        <div className="page-header"><h2 className="page-title">Knowledge Base</h2></div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <button className="btn btn--ghost btn--small" onClick={() => setSelectedArticle(null)}>← Back</button>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-bright)', fontWeight: 400 }}>{selectedArticle.title}</h3>
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

      {/* Title — bigger */}
      <div className="kb-hero">
        <h2 className="kb-hero-title">Knowledge Base</h2>
        <p className="kb-hero-sub">Explore categories or search for articles</p>
      </div>

      {/* Orbital — always centered, no ring borders */}
      <div className="kb-orbit-container">
        <div className="kb-orbit-center">
          <div className="kb-orbit-brain-glow" />
          <img src={bettyBrain} alt="Ask Betty" className="kb-orbit-betty" />
        </div>
        <OrbitTrack
          categories={CATEGORIES}
          hoveredCat={hoveredCat}
          setHoveredCat={setHoveredCat}
          onCategoryClick={(name) => setSelectedTag(name)}
        />
      </div>

      {/* Search */}
      <div className="kb-search-wrap">
        <div className="kb-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search articles…" value={search} onChange={e => setSearch(e.target.value)} className="kb-search-input" />
          {showResults && <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }} onClick={clearFilters}>✕</button>}
        </div>
        {selectedTag && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Filtered by: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{selectedTag}</span>
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '0.5rem', fontSize: '0.85rem', textDecoration: 'underline' }}>clear</button>
          </div>
        )}
      </div>

      {showResults && (
        <div style={{ maxWidth: 680, margin: '1.5rem auto 0', position: 'relative', zIndex: 1 }}>
          {loading ? (
            <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
          ) : articles.length > 0 ? (
            <>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                {articles.length} article{articles.length !== 1 ? 's' : ''} found
              </div>
              {articles.map(article => (
                <div key={article.id} className="kb-article" onClick={() => setSelectedArticle(article)}>
                  <div className="kb-article-title">{article.title}</div>
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
