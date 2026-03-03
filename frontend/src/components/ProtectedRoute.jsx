import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useLoadingVerb } from '../hooks/useLoadingVerb'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth()
  const verb = useLoadingVerb(loading)
  const [profileWaitElapsed, setProfileWaitElapsed] = useState(false)

  // If auth done, user exists, but profile is null for 6s — show error with escape hatch
  useEffect(() => {
    if (!loading && user && !profile) {
      const timer = setTimeout(() => setProfileWaitElapsed(true), 6000)
      return () => clearTimeout(timer)
    }
    if (profile) setProfileWaitElapsed(false)
  }, [loading, user, profile])

  const handleRetry = useCallback(() => window.location.reload(), [])
  const handleLogout = useCallback(() => {
    supabase.auth.signOut().catch(() => {})
    window.location.href = '/login'
  }, [])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>{verb}…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!profile && !profileWaitElapsed) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading your profile…</p>
      </div>
    )
  }

  if (!profile && profileWaitElapsed) {
    return (
      <div className="loading-screen">
        <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Couldn't load your profile</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          This usually means a temporary connection issue.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn--primary" onClick={handleRetry}>Try Again</button>
          <button className="btn btn--ghost" onClick={handleLogout}>Sign Out</button>
        </div>
      </div>
    )
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
