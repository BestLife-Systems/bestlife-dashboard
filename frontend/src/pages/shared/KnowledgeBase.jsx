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

// ── Category SVG icons (larger: 28x28) ──
const CAT_ICONS = {
  Onboarding: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Policies: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  // Cool money sign — stylized $ with sparkle lines, money green
  Billing: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1v22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      <line x1="4" y1="3" x2="5" y2="4" opacity="0.6" />
      <line x1="19" y1="3" x2="20" y2="2" opacity="0.6" />
      <line x1="20" y1="19" x2="21" y2="20" opacity="0.6" />
    </svg>
  ),
  Clinical: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  'HR & Benefits': (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Technology: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="14" y1="4" x2="10" y2="20" />
    </svg>
  ),
  Templates: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
  Training: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
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
    let w, h, animId

    // Stars
    const stars = []
    const STAR_COUNT = 200
    // Shooting stars
    const shooters = []
    // Constellation lines
    const constellations = []

    function resize() {
      w = canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1)
      h = canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1)
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1)
    }

    function initStars() {
      stars.length = 0
      const cw = canvas.offsetWidth
      const ch = canvas.offsetHeight
      for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
          x: Math.random() * cw,
          y: Math.random() * ch,
          r: Math.random() * 1.5 + 0.3,
          alpha: Math.random() * 0.7 + 0.3,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
          twinkleOffset: Math.random() * Math.PI * 2,
          // Some stars are colored
          hue: Math.random() < 0.15 ? (Math.random() < 0.5 ? 195 : 270) : 0,
        })
      }

      // Build 4-5 constellations from nearby star clusters
      constellations.length = 0
      for (let c = 0; c < 5; c++) {
        const cx = Math.random() * cw * 0.8 + cw * 0.1
        const cy = Math.random() * ch * 0.8 + ch * 0.1
        const nearby = stars
          .map((s, idx) => ({ idx, dist: Math.hypot(s.x - cx, s.y - cy) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, Math.floor(Math.random() * 3) + 3)
        for (let i = 0; i < nearby.length - 1; i++) {
          constellations.push([nearby[i].idx, nearby[i + 1].idx])
        }
      }
    }

    function spawnShooter() {
      const cw = canvas.offsetWidth
      const ch = canvas.offsetHeight
      shooters.push({
        x: Math.random() * cw * 0.6 + cw * 0.1,
        y: Math.random() * ch * 0.3,
        vx: (Math.random() * 3 + 3) * (Math.random() < 0.5 ? 1 : -1),
        vy: Math.random() * 2 + 1.5,
        life: 1,
        decay: Math.random() * 0.015 + 0.01,
        len: Math.random() * 60 + 40,
      })
    }

    resize()
    initStars()
    window.addEventListener('resize', () => { resize(); initStars() })

    let lastShooter = 0

    function draw(now) {
      const cw = canvas.offsetWidth
      const ch = canvas.offsetHeight
      ctx.clearRect(0, 0, cw, ch)

      // Milky way band — diagonal gradient stripe
      const grd = ctx.createLinearGradient(0, 0, cw, ch)
      grd.addColorStop(0, 'rgba(0,0,0,0)')
      grd.addColorStop(0.3, 'rgba(60,50,120,0.04)')
      grd.addColorStop(0.45, 'rgba(80,60,160,0.07)')
      grd.addColorStop(0.55, 'rgba(40,80,180,0.06)')
      grd.addColorStop(0.7, 'rgba(60,50,120,0.04)')
      grd.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, cw, ch)

      // Draw constellation lines
      ctx.strokeStyle = 'rgba(100,160,255,0.08)'
      ctx.lineWidth = 0.8
      for (const [a, b] of constellations) {
        if (!stars[a] || !stars[b]) continue
        ctx.beginPath()
        ctx.moveTo(stars[a].x, stars[a].y)
        ctx.lineTo(stars[b].x, stars[b].y)
        ctx.stroke()
      }

      // Draw stars
      const t = now * 0.001
      for (const s of stars) {
        const flicker = Math.sin(t * s.twinkleSpeed * 60 + s.twinkleOffset) * 0.3 + 0.7
        const a = s.alpha * flicker
        if (s.hue) {
          ctx.fillStyle = `hsla(${s.hue}, 70%, 75%, ${a})`
        } else {
          ctx.fillStyle = `rgba(255,255,255,${a})`
        }
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // Shooting stars
      if (now - lastShooter > 2500 + Math.random() * 4000) {
        spawnShooter()
        lastShooter = now
      }

      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i]
        s.x += s.vx
        s.y += s.vy
        s.life -= s.decay
        if (s.life <= 0) { shooters.splice(i, 1); continue }

        const tailX = s.x - s.vx * s.len * 0.3
        const tailY = s.y - s.vy * s.len * 0.3
        const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y)
        grad.addColorStop(0, `rgba(255,255,255,0)`)
        grad.addColorStop(1, `rgba(200,220,255,${s.life * 0.8})`)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(tailX, tailY)
        ctx.lineTo(s.x, s.y)
        ctx.stroke()

        // Bright head
        ctx.fillStyle = `rgba(220,240,255,${s.life})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="kb-space-canvas" />
}

// ── Curved label via SVG textPath ──
function CurvedLabel({ text, color, isHovered }) {
  // Arc below the icon circle — 56px icon, label arcs beneath
  const r = 42 // arc radius for text
  const id = `arc-${text.replace(/\s+/g, '')}`
  return (
    <svg
      width="100"
      height="32"
      viewBox="0 0 100 32"
      className={`kb-curved-label ${isHovered ? 'kb-curved-label--hovered' : ''}`}
    >
      <defs>
        <path
          id={id}
          d={`M ${50 - r} 4 A ${r} ${r} 0 0 1 ${50 + r} 4`}
        />
      </defs>
      <text
        fill={isHovered ? '#ffffff' : (color || '#7d8a82')}
        fontSize="10"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="500"
        letterSpacing="0.03em"
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
  if (typeof window === 'undefined') return 235
  if (window.innerWidth <= 480) return 120
  if (window.innerWidth <= 768) return 155
  return 235
}

// ── Orbital component: JS-driven rotation ──
function OrbitTrack({ categories, hoveredCat, setHoveredCat, onCategoryClick }) {
  const angleRef = useRef(0)
  const rafRef = useRef(null)
  const pausedRef = useRef(false)
  const nodesRef = useRef([])
  const lastTimeRef = useRef(null)
  const radiusRef = useRef(getOrbitRadius())

  useEffect(() => {
    pausedRef.current = hoveredCat !== null
  }, [hoveredCat])

  useEffect(() => {
    function onResize() { radiusRef.current = getOrbitRadius() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    function tick(now) {
      if (!lastTimeRef.current) lastTimeRef.current = now
      const dt = now - lastTimeRef.current
      lastTimeRef.current = now

      if (!pausedRef.current) {
        angleRef.current = (angleRef.current + (dt / 1000) * 10) % 360
      }

      const total = categories.length
      const r = radiusRef.current
      nodesRef.current.forEach((el, i) => {
        if (!el) return
        const nodeAngle = angleRef.current + (360 / total) * i
        const rad = (nodeAngle * Math.PI) / 180
        const x = Math.sin(rad) * r
        const y = -Math.cos(rad) * r
        el.style.transform = `translate(${x}px, ${y}px)`
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

// ── Main component ──
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
      let query = supabase
        .from('kb_articles')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false })

      if (search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,body_markdown.ilike.%${search.trim()}%`)
      }

      if (selectedTag) {
        query = query.contains('tags', [selectedTag])
      }

      const { data, error } = await query
      if (error) throw error
      setArticles(data || [])
    } catch (err) {
      console.error('KB fetch error:', err)
      setArticles([])
    } finally {
      setLoading(false)
    }
  }, [search, selectedTag])

  useEffect(() => {
    const t = setTimeout(() => { fetchArticles() }, 300)
    return () => clearTimeout(t)
  }, [fetchArticles])

  function handleCategoryClick(name) {
    setSelectedTag(name)
  }

  function clearFilters() {
    setSearch('')
    setSelectedTag(null)
  }

  // ── Article detail ──
  if (selectedArticle) {
    return (
      <div>
        <div className="page-header">
          <h2 className="page-title">Knowledge Base</h2>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <button className="btn btn--ghost btn--small" onClick={() => setSelectedArticle(null)}>← Back</button>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-bright)', fontWeight: 400 }}>
              {selectedArticle.title}
            </h3>
          </div>
          <div className="kb-article-meta" style={{ marginBottom: '1rem' }}>
            {(selectedArticle.tags || []).map(tag => (
              <span key={tag} className="kb-article-tag">{tag}</span>
            ))}
          </div>
          <div className="kb-article-body">{selectedArticle.body_markdown}</div>
        </div>
      </div>
    )
  }

  // ── Main view ──
  const showResults = search.trim() || selectedTag

  return (
    <div className="kb-page">
      {/* Canvas space background */}
      <SpaceCanvas />

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: '0.5rem', position: 'relative', zIndex: 1 }}>
        <h2 className="page-title">Knowledge Base</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          Explore categories or search for articles
        </p>
      </div>

      {/* Orbital */}
      <div className="kb-orbit-container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="kb-orbit-ring" />
        <div className="kb-orbit-ring kb-orbit-ring--inner" />

        <div className="kb-orbit-center">
          <div className="kb-orbit-brain-glow" />
          <img src={bettyBrain} alt="Betty Brain" className="kb-orbit-betty" />
        </div>

        <OrbitTrack
          categories={CATEGORIES}
          hoveredCat={hoveredCat}
          setHoveredCat={setHoveredCat}
          onCategoryClick={handleCategoryClick}
        />
      </div>

      {/* Search — below orbital */}
      <div style={{ maxWidth: 520, margin: '1.5rem auto 0', position: 'relative', zIndex: 1 }}>
        <div className="kb-search" style={{ margin: 0, background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search articles…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="kb-search-input"
          />
          {showResults && (
            <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }} onClick={clearFilters}>✕</button>
          )}
        </div>
        {selectedTag && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Filtered by: <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{selectedTag}</span>
            <button
              onClick={clearFilters}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '0.5rem', fontSize: '0.8rem', textDecoration: 'underline' }}
            >
              clear
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {showResults && (
        <div style={{ maxWidth: 680, margin: '1.5rem auto 0', position: 'relative', zIndex: 1 }}>
          {loading ? (
            <div className="page-loading"><div className="loading-spinner" /><p>{verb}…</p></div>
          ) : articles.length > 0 ? (
            <>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                {articles.length} article{articles.length !== 1 ? 's' : ''} found
              </div>
              {articles.map(article => (
                <div key={article.id} className="kb-article" onClick={() => setSelectedArticle(article)}>
                  <div className="kb-article-title">{article.title}</div>
                  <div className="kb-article-meta">
                    {(article.tags || []).map(tag => (
                      <span key={tag} className="kb-article-tag">{tag}</span>
                    ))}
                  </div>
                  {article.body_markdown && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.375rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {article.body_markdown}
                    </div>
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
