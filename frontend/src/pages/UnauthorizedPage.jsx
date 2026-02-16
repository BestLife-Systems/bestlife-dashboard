import { useNavigate } from 'react-router-dom'

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <span className="login-logo" style={{ fontSize: '2.5rem' }}>🚫</span>
          <h1 className="login-title">Access Denied</h1>
          <p className="login-subtitle">You don't have permission to view this page.</p>
        </div>
        <button className="btn btn--primary btn--full" onClick={() => navigate('/')}>
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}
