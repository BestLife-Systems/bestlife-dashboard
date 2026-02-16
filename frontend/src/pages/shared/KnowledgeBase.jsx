import { useState } from 'react'

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
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState(null)

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Knowledge Base</h2>
      </div>

      {/* Search Bar */}
      <div className="kb-search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4 }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search knowledge base..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="kb-search-input"
        />
      </div>

      {/* Coming Soon Banner */}
      <div className="kb-banner">
        <div className="kb-banner-icon">📚</div>
        <h3 className="kb-banner-title">Coming Soon</h3>
        <p className="kb-banner-text">
          The knowledge base is being set up. Content will be imported from Tawk.to and organized into searchable categories.
        </p>
      </div>

      {/* Category Grid */}
      <div className="kb-grid">
        {CATEGORIES.map(cat => (
          <button
            key={cat.name}
            className={`kb-card ${selectedCat === cat.name ? 'kb-card--selected' : ''}`}
            onClick={() => setSelectedCat(selectedCat === cat.name ? null : cat.name)}
          >
            <span className="kb-card-icon">{cat.icon}</span>
            <span className="kb-card-name">{cat.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
