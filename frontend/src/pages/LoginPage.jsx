import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('login') // login | forgot | sent
  const { signIn, resetPassword } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message === 'Invalid login credentials' 
        ? 'Invalid email or password' 
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email)
      setMode('sent')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <span className="login-logo">✦</span>
          <h1 className="login-title">BestLife Hub</h1>
          <p className="login-subtitle">
            {mode === 'login' && 'Sign in to your account'}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'sent' && 'Check your email'}
          </p>
        </div>

        {error && <div className="login-error">{error}</div>}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@bestlifecounseling.com"
                required
                autoFocus
              />
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <button type="button" className="btn btn--ghost btn--full" onClick={() => { setMode('forgot'); setError('') }}>
              Forgot password?
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="login-form">
            <div className="form-field">
              <label htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@bestlifecounseling.com"
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <button type="button" className="btn btn--ghost btn--full" onClick={() => { setMode('login'); setError('') }}>
              Back to sign in
            </button>
          </form>
        )}

        {mode === 'sent' && (
          <div className="login-form">
            <p style={{ color: 'var(--text)', textAlign: 'center', marginBottom: '1.5rem' }}>
              We sent a password reset link to <strong>{email}</strong>. Check your inbox and follow the instructions.
            </p>
            <button className="btn btn--ghost btn--full" onClick={() => { setMode('login'); setError('') }}>
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
