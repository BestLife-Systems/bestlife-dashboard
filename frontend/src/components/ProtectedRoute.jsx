import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useLoadingVerb } from '../hooks/useLoadingVerb'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth()
  const verb = useLoadingVerb(loading)

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

  if (!profile) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>conjuring your profile…</p>
      </div>
    )
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
