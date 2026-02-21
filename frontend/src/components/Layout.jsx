import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import AskBetty from './AskBetty'

export default function Layout({ children, tabs }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const roleBadge = {
    admin: 'Admin',
    clinical_leader: 'Clinical Leader',
    therapist: 'Therapist',
    front_desk: 'Front Desk',
    ba: 'Billing Admin',
    medical_biller: 'Medical Biller',
  }

  return (
    <div className="layout">
      {/* Top Bar */}
      <header className="topbar">
        <div className="topbar-left">
          <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="logo" onClick={() => navigate('/home')} style={{ cursor: 'pointer' }}>
            <span className="logo-icon">✦</span>
            <span className="logo-text">BestLife Hub</span>
          </div>
        </div>
        <div className="topbar-right">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <div className="user-menu-container">
            <button className="user-menu-trigger" onClick={() => setUserMenuOpen(!userMenuOpen)}>
              <div className="user-avatar">
                {profile?.first_name?.[0]}{profile?.last_name?.[0]}
              </div>
              <div className="user-info">
                <span className="user-name">{profile?.first_name} {profile?.last_name}</span>
                <span className="user-role">{roleBadge[profile?.role] || profile?.role}</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}>
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            {userMenuOpen && (
              <>
                <div className="user-menu-backdrop" onClick={() => setUserMenuOpen(false)} />
                <div className="user-menu-dropdown">
                  <button onClick={handleSignOut}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="main-container">
        {/* Sidebar */}
        <nav className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
          <div className="sidebar-nav">
            {tabs.map((tab, i) => {
              // Section label / divider
              if (tab.section) {
                return (
                  <div key={`section-${tab.section}`} className="sidebar-section">
                    {i > 0 && <div className="sidebar-divider" />}
                    <span className="sidebar-section-label">{tab.section}</span>
                  </div>
                )
              }

              // Normal nav link
              return (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="sidebar-icon">{tab.icon}</span>
                  <span className="sidebar-label">{tab.label}</span>
                </NavLink>
              )
            })}
          </div>
        </nav>

        {/* Sidebar overlay for mobile */}
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

        {/* Main Content */}
        <main className="content">
          {children}
        </main>
      </div>

      {/* Global Ask Betty Bar */}
      <AskBetty />
    </div>
  )
}
