import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'

// Brain SVG
function BrainIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  )
}

// Category SVG icons (small, line-art, futuristic)
const CAT_ICONS = {
  Onboarding: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Policies: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Billing: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  Clinical: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  'HR & Benefits': (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Technology: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="14" y1="4" x2="10" y2="20" />
    </svg>
  ),
  Templates: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
  Training: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
}

const CATEGORIES = [
  { name: 'Onboarding', color: '#00bbee' },
  { name: 'Policies', color: '#60a5fa' },
  { name: 'Billing', color: '#fbbf24' },
  { name: 'Clinical', color: '#f87171' },
  { name: 'HR & Benefits', color: '#a78bfa' },
  { name: 'Technology', color: '#34d399' },
  { name: 'Templates', color: '#fb923c' },
  { name: 'Training', color: '#f472b6' },
]

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

  // Show article detail
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

  // Show search results
  if (search.trim() || selectedTag) {
    return (
      <div>
        <div className="page-header">
          <h2 className="page-title">Knowledge Base</h2>
          <button className="btn btn--ghost btn--small" onClick={() => { setSearch(''); setSelectedTag(null); }}>
            ← Back to explore
          </button>
        </div>

        {/* Search bar */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="kb-search" style={{ margin: 0 }}>
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
            {(search || selectedTag) && (
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => { setSearch(''); setSelectedTag(null); }}>✕</button>
            )}
          </div>
          {selectedTag && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Filtered by: <span style={{ color: 'var(--accent)' }}>{selectedTag}</span>
            </div>
          )}
        </div>

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
    )
  }

  // ── Default view: Orbital brain layout ──
  return (
    <div>
      <div className="page-header" style={{ justifyContent: 'center', textAlign: 'center', marginBottom: '0.5rem' }}>
        <div>
          <h2 className="page-title">Knowledge Base</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Explore categories or search for articles
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ maxWidth: 480, margin: '0 auto 2rem' }}>
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
        </div>
      </div>

      {/* Orbital layout */}
      <div className="kb-orbit-container">
        {/* Orbit ring */}
        <div className="kb-orbit-ring" />
        <div className="kb-orbit-ring kb-orbit-ring--inner" />

        {/* Center brain */}
        <div className="kb-orbit-center">
          <div className="kb-orbit-brain-glow" />
          <BrainIcon size={48} color="var(--accent)" />
        </div>

        {/* Orbiting category nodes */}
        <div className={`kb-orbit-track ${hoveredCat !== null ? 'kb-orbit-track--paused' : ''}`}>
          {CATEGORIES.map((cat, i) => {
            const isHovered = hoveredCat === i
            return (
              <div
                key={cat.name}
                className={`kb-orbit-node ${isHovered ? 'kb-orbit-node--hovered' : ''}`}
                style={{
                  '--i': i,
                  '--total': CATEGORIES.length,
                  '--node-color': cat.color,
                }}
                onMouseEnter={() => setHoveredCat(i)}
                onMouseLeave={() => setHoveredCat(null)}
                onClick={() => setSelectedTag(cat.name)}
              >
                <div className="kb-orbit-node-icon">
                  {CAT_ICONS[cat.name]}
                </div>
                <div className="kb-orbit-node-label">{cat.name}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
