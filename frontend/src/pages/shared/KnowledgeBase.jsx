import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'

// Inline brain SVG component
function BrainIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  )
}

const CATEGORIES = [
  { name: 'Onboarding', icon: '🚀' },
  { name: 'Policies', icon: '📋' },
  { name: 'Billing', icon: '💳' },
  { name: 'Clinical', icon: '🩺' },
  { name: 'HR & Benefits', icon: '🏥' },
  { name: 'Technology', icon: '💻' },
  { name: 'Templates', icon: '📝' },
  { name: 'Training', icon: '🎓' },
]

export default function KnowledgeBase() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState(null)
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState(null)
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

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Knowledge Base</h2>
      </div>

      {/* Brain icon search card */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ color: 'var(--accent)', flexShrink: 0 }}>
            <BrainIcon size={36} color="var(--accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-bright)', marginBottom: '0.375rem' }}>Search Knowledge Base</div>
            <div className="kb-search" style={{ margin: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search articles by title or content…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="kb-search-input"
              />
              {search && (
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.1rem' }}
                  onClick={() => setSearch('')}
                >✕</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tag / Category filter */}
      <div className="kb-grid" style={{ marginBottom: '1.25rem' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.name}
            className={`kb-card ${selectedTag === cat.name ? 'kb-card--selected' : ''}`}
            onClick={() => setSelectedTag(selectedTag === cat.name ? null : cat.name)}
          >
            <span className="kb-card-icon">{cat.icon}</span>
            <span className="kb-card-name">{cat.name}</span>
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="page-loading">
          <div className="loading-spinner" />
          <p>{verb}…</p>
        </div>
      ) : articles.length > 0 ? (
        <div>
          {selectedArticle ? (
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
          ) : (
            <>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                {articles.length} article{articles.length !== 1 ? 's' : ''} found
              </div>
              {articles.map(article => (
                <div
                  key={article.id}
                  className="kb-article"
                  onClick={() => setSelectedArticle(article)}
                >
                  <div className="kb-article-title">{article.title}</div>
                  <div className="kb-article-meta">
                    {(article.tags || []).map(tag => (
                      <span key={tag} className="kb-article-tag">{tag}</span>
                    ))}
                    {article.audience_roles?.length > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                        · {article.audience_roles.join(', ')}
                      </span>
                    )}
                  </div>
                  {article.body_markdown && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.375rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {article.body_markdown}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="kb-banner">
          <div className="kb-banner-icon" style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}>
            <BrainIcon size={48} color="var(--accent)" />
          </div>
          <h3 className="kb-banner-title" style={{ marginTop: '0.75rem' }}>
            {search || selectedTag ? 'No articles found' : 'Knowledge Base'}
          </h3>
          <p className="kb-banner-text">
            {search || selectedTag
              ? 'Try a different search term or clear the filter.'
              : 'Articles will appear here once published. Use the search or browse by category above.'}
          </p>
        </div>
      )}
    </div>
  )
}
