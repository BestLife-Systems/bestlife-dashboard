import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { apiPost } from '../../lib/api'
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

// ── Futuristic category icons ──
const sz = { width: 40, height: 40, viewBox: '0 0 32 32', fill: 'none', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }

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
      <rect x="8" y="4" width="18" height="20" rx="2" opacity="0.2" />
      <rect x="5" y="7" width="18" height="20" rx="2" />
      <line x1="10" y1="13" x2="18" y2="13" strokeWidth="1.2" opacity="0.5" />
      <line x1="10" y1="17" x2="18" y2="17" strokeWidth="1.2" opacity="0.5" />
      <line x1="10" y1="21" x2="15" y2="21" strokeWidth="1.2" opacity="0.5" />
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

// ── Canvas background: real-time sky based on Eastern Time ──
// Nighttime = shooting stars; daytime = drifting clouds; smooth dawn/dusk blend.
function SpaceCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId

    // Returns 0 (full night) → 1 (full day) based on Eastern Time.
    // Dawn 6–7:30 AM, dusk 7:30–9 PM, smooth sine-eased transition.
    function getDaylight() {
      const now = new Date()
      const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const h = et.getHours() + et.getMinutes() / 60
      if (h >= 7.5 && h < 19.5) return 1             // full day
      if (h >= 19.5 && h < 21) return (21 - h) / 1.5  // dusk
      if (h >= 6 && h < 7.5) return (h - 6) / 1.5     // dawn
      return 0                                          // full night
    }

    // Lerp between two [r,g,b] colors
    function lerpRGB(a, b, t) {
      return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
      ]
    }

    // ── Night elements ──
    const stars = []
    const STAR_COUNT = 220
    const shooters = []

    // ── Day elements ──
    const clouds = []
    const CLOUD_COUNT = 14

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
    }

    function initClouds() {
      clouds.length = 0
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight
      for (let i = 0; i < CLOUD_COUNT; i++) {
        const baseY = Math.random() * ch * 0.85
        const scale = Math.random() * 0.6 + 0.5
        const puffs = []
        const puffCount = Math.floor(Math.random() * 4) + 3
        for (let p = 0; p < puffCount; p++) {
          puffs.push({
            dx: (p - puffCount / 2) * 35 * scale + (Math.random() - 0.5) * 20,
            dy: (Math.random() - 0.5) * 18 * scale,
            rx: (Math.random() * 25 + 35) * scale,
            ry: (Math.random() * 12 + 18) * scale,
          })
        }
        clouds.push({
          x: Math.random() * (cw + 400) - 200,
          y: baseY,
          speed: (Math.random() * 0.15 + 0.05) * (Math.random() < 0.3 ? -1 : 1),
          alpha: Math.random() * 0.25 + 0.12,
          puffs,
          scale,
        })
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

    resize(); initStars(); initClouds()
    const onResize = () => { resize(); initStars(); initClouds() }
    window.addEventListener('resize', onResize)
    let lastShoot = 0

    // Sky color palettes
    const nightTop = [10, 14, 26], nightBot = [18, 24, 42]
    const dayTop = [135, 195, 235], dayBot = [210, 232, 248]
    const dawnTop = [45, 30, 60], dawnBot = [200, 130, 90]  // purple-orange horizon

    function drawSky(daylight, cw, ch) {
      // Blend sky gradient: night → dawn tint → day
      // Use a peaked dawn tint at daylight ≈ 0.3–0.5
      const dawnStrength = daylight < 0.5
        ? daylight * 2               // 0→1 as daylight goes 0→0.5
        : (1 - daylight) * 2         // 1→0 as daylight goes 0.5→1
      const clampedDawn = Math.max(0, Math.min(1, dawnStrength))

      let topC, botC
      if (daylight <= 0.5) {
        // Night → dawn
        const t = daylight * 2
        topC = lerpRGB(nightTop, lerpRGB(dawnTop, dayTop, t), t)
        botC = lerpRGB(nightBot, lerpRGB(dawnBot, dayBot, t), t)
      } else {
        // Dawn → day
        const t = (daylight - 0.5) * 2
        topC = lerpRGB(lerpRGB(dawnTop, dayTop, 0.5 + t * 0.5), dayTop, t)
        botC = lerpRGB(lerpRGB(dawnBot, dayBot, 0.5 + t * 0.5), dayBot, t)
      }

      const sky = ctx.createLinearGradient(0, 0, 0, ch)
      sky.addColorStop(0, `rgb(${topC[0]},${topC[1]},${topC[2]})`)
      sky.addColorStop(1, `rgb(${botC[0]},${botC[1]},${botC[2]})`)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, cw, ch)

      // Warm horizon glow at dawn/dusk
      if (clampedDawn > 0.05) {
        const glow = ctx.createRadialGradient(cw * 0.5, ch * 1.1, 0, cw * 0.5, ch * 1.1, ch * 0.9)
        glow.addColorStop(0, `rgba(255,160,60,${clampedDawn * 0.25})`)
        glow.addColorStop(0.4, `rgba(255,100,50,${clampedDawn * 0.1})`)
        glow.addColorStop(1, 'rgba(255,80,40,0)')
        ctx.fillStyle = glow
        ctx.fillRect(0, 0, cw, ch)
      }
    }

    function drawStars(now, opacity) {
      if (opacity < 0.01) return
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight
      const t = now * 0.001

      // Milky way glow
      ctx.globalAlpha = opacity
      const g = ctx.createLinearGradient(0, 0, cw, ch)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(0.3, 'rgba(60,50,120,0.06)')
      g.addColorStop(0.45, 'rgba(80,60,180,0.1)')
      g.addColorStop(0.55, 'rgba(40,80,200,0.08)')
      g.addColorStop(0.7, 'rgba(60,50,120,0.05)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch)

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
      ctx.globalAlpha = 1
    }

    function drawClouds(now, opacity) {
      if (opacity < 0.01) return
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight
      ctx.globalAlpha = opacity
      for (const c of clouds) {
        c.x += c.speed
        const totalW = c.scale * 200
        if (c.speed > 0 && c.x > cw + totalW) c.x = -totalW
        if (c.speed < 0 && c.x < -totalW) c.x = cw + totalW

        for (const p of c.puffs) {
          const px = c.x + p.dx, py = c.y + p.dy
          const grad = ctx.createRadialGradient(px, py, 0, px, py, p.rx)
          grad.addColorStop(0, `rgba(255,255,255,${c.alpha})`)
          grad.addColorStop(0.5, `rgba(255,255,255,${c.alpha * 0.6})`)
          grad.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.ellipse(px, py, p.rx, p.ry, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    function draw(now) {
      const cw = canvas.offsetWidth, ch = canvas.offsetHeight
      ctx.clearRect(0, 0, cw, ch)

      const daylight = getDaylight()

      // Full opaque sky gradient (night → dawn → day blend)
      drawSky(daylight, cw, ch)

      // Stars fade out as daylight rises; clouds fade in
      if (daylight < 1) drawStars(now, 1 - daylight)
      if (daylight > 0) drawClouds(now, daylight)

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize) }
  }, [])

  return <canvas ref={canvasRef} className="kb-space-canvas" />
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

  // The SVG arc label traces the outside-bottom of the icon circle.
  // Icon is 80px (r=40). We want text on a circle of r=54 (14px outside the icon edge).
  // The SVG is 160x160 centered on the icon. The arc center is at (80,80).
  const arcR = 54 // radius for text path (outside the 40px icon radius)
  const svgSize = 160
  const cx = svgSize / 2
  const cy = svgSize / 2

  return (
    <div className="kb-orbit-track-js">
      {categories.map((cat, i) => {
        const isHovered = hoveredCat === i
        const arcId = `arc-${cat.name.replace(/[^a-zA-Z]/g, '')}`
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
            <div className="kb-orbit-node-inner">
              <div className="kb-orbit-node-glow" style={{ '--node-color': cat.color }} />
              <div className="kb-orbit-node-icon-js">
                {CAT_ICONS[cat.name]}
              </div>
              {/* SVG arc label — positioned absolutely over the icon, text on outside-bottom arc */}
              <svg
                className="kb-orbit-arc-label"
                width={svgSize}
                height={svgSize}
                viewBox={`0 0 ${svgSize} ${svgSize}`}
              >
                <defs>
                  <path
                    id={arcId}
                    d={`M ${cx - arcR} ${cy} A ${arcR} ${arcR} 0 0 1 ${cx + arcR} ${cy}`}
                  />
                  <filter id={`shadow-${arcId}`} x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.5" />
                  </filter>
                </defs>
                {/* White stroke outline behind colored text for contrast on any sky */}
                <text
                  fill="none"
                  stroke="#fff"
                  strokeWidth="3.5"
                  strokeLinejoin="round"
                  fontSize="13.5"
                  fontFamily="'DM Sans', sans-serif"
                  fontWeight="600"
                  letterSpacing="0.04em"
                  opacity="0.85"
                >
                  <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
                    {cat.name}
                  </textPath>
                </text>
                <text
                  fill={isHovered ? '#ffffff' : (cat.color || '#7d8a82')}
                  fontSize="13.5"
                  fontFamily="'DM Sans', sans-serif"
                  fontWeight="600"
                  letterSpacing="0.04em"
                  filter={`url(#shadow-${arcId})`}
                >
                  <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
                    {cat.name}
                  </textPath>
                </text>
              </svg>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Add Article Panel ──
function AddArticlePanel({ categories, onClose, onSaved }) {
  const { profile } = useAuth()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [showAiAssist, setShowAiAssist] = useState(false)
  const aiVerb = useLoadingVerb(aiLoading)

  const handleSave = async (status) => {
    if (!title.trim()) { setError('Title is required'); return }
    if (!category) { setError('Please select a category'); return }
    setSaving(true); setError(null)
    try {
      const { error: err } = await supabase.from('kb_articles').insert({
        title: title.trim(),
        body_markdown: body.trim() || null,
        tags: [category],
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

  const handleAiAssist = async () => {
    const prompt = aiPrompt.trim() || `Write a knowledge base article titled "${title.trim()}" for a behavioral health practice.`
    if (!prompt && !title.trim()) { setError('Enter a title or AI prompt first'); return }
    setAiLoading(true); setError(null)
    try {
      const result = await apiPost('/ai/kb-assist', {
        prompt,
        context: category || 'General',
        max_tokens: 2048,
      })
      setBody(prev => prev ? prev + '\n\n' + result.response : result.response)
      setShowAiAssist(false)
      setAiPrompt('')
    } catch (e) {
      setError(e.message || 'AI assist failed')
    } finally { setAiLoading(false) }
  }

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
      <div className="form-field" style={{ marginBottom: '1rem' }}>
        <label>Category</label>
        <select
          className="form-input"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          <option value="">Select a category...</option>
          {categories.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="form-field" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <label style={{ margin: 0 }}>Content</label>
          <button
            type="button"
            className="btn btn--ghost btn--small kb-ai-assist-toggle"
            onClick={() => setShowAiAssist(!showAiAssist)}
            style={{ fontSize: '0.75rem', gap: '0.35rem', display: 'flex', alignItems: 'center' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
            </svg>
            AI Assist
          </button>
        </div>
        {showAiAssist && (
          <div className="kb-ai-assist-box">
            <input
              className="form-input"
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder={title.trim() ? `Describe what to write about "${title.trim()}"...` : 'Describe the article content...'}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAiAssist() } }}
            />
            <button
              className="btn btn--primary btn--small"
              onClick={handleAiAssist}
              disabled={aiLoading}
              style={{ flexShrink: 0 }}
            >
              {aiLoading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  {aiVerb}...
                </span>
              ) : 'Generate'}
            </button>
          </div>
        )}
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
  // Add kb-active class to root so sidebar/topbar can go translucent
  useEffect(() => {
    document.documentElement.classList.add('kb-active')
    return () => document.documentElement.classList.remove('kb-active')
  }, [])

  const { profile, isAdmin } = useAuth()
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState(null)
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [hoveredCat, setHoveredCat] = useState(null)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const verb = useLoadingVerb(loading)
  const searchRef = useRef(null)

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

  // Autocomplete suggestions
  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    const t = setTimeout(async () => {
      try {
        let query = supabase.from('kb_articles').select('id,title,tags')
        if (!isAdmin) query = query.eq('status', 'published')
        query = query.ilike('title', `%${search.trim()}%`).limit(6)
        const { data } = await query
        setSuggestions(data || [])
        setShowSuggestions((data || []).length > 0)
      } catch { setSuggestions([]); setShowSuggestions(false) }
    }, 150)
    return () => clearTimeout(t)
  }, [search, isAdmin])

  // Close autocomplete on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const clearFilters = () => { setSearch(''); setSelectedTag(null); setShowSuggestions(false) }

  const selectSuggestion = (article) => {
    setShowSuggestions(false)
    setSelectedArticle(article)
  }

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

      <div className="kb-hero">
        <h2 className="kb-hero-title">Betty's Brain</h2>
        <p className="kb-hero-sub">Explore categories or search for articles</p>
      </div>

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

      {/* Search + Autocomplete + Add button */}
      <div className="kb-search-wrap" ref={searchRef}>
        <div className="kb-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search articles..."
            value={search}
            onChange={e => { setSearch(e.target.value); setShowSuggestions(true) }}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
            className="kb-search-input"
          />
          {showResults && <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }} onClick={clearFilters}>&#10005;</button>}
          {isAdmin && (
            <button className="btn btn--primary btn--small" style={{ flexShrink: 0 }} onClick={() => setShowAddPanel(true)}>
              + Article
            </button>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="kb-autocomplete">
            {suggestions.map(s => (
              <div key={s.id} className="kb-autocomplete-item" onClick={() => selectSuggestion(s)}>
                <div className="kb-autocomplete-title">{s.title}</div>
                {s.tags && s.tags.length > 0 && (
                  <div className="kb-autocomplete-tags">
                    {s.tags.map(tag => <span key={tag} className="kb-article-tag">{tag}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {selectedTag && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Filtered by: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{selectedTag}</span>
            <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '0.5rem', fontSize: '0.85rem', textDecoration: 'underline' }}>clear</button>
          </div>
        )}
      </div>

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
