import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

function clearAuthStorage() {
  try {
    Object.keys(localStorage).forEach(key => {
      if (key === 'bestlife-auth-v') return
      if (key.startsWith('bestlife-auth') || key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key)
      }
    })
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // Detect auth callback in URL (magic link / password recovery).
    // Supabase processes these async AFTER INITIAL_SESSION fires,
    // so we must keep loading=true until SIGNED_IN arrives.
    const hash = window.location.hash
    const search = window.location.search
    const hasAuthCallback =
      hash.includes('access_token') || hash.includes('type=magiclink') ||
      hash.includes('type=recovery') || search.includes('code=')

    // Single source of truth: let Supabase handle ALL session management.
    //
    // CRITICAL: We do NOT call refreshSession() manually. Supabase's internal
    // _initialize() already refreshes expired tokens before firing INITIAL_SESSION.
    // Calling refreshSession() ourselves races with that internal refresh, and
    // with refresh token rotation enabled (Supabase default), the second refresh
    // sees an already-rotated token and fails — killing the session every time.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return

        // INITIAL_SESSION: fires once on startup, after Supabase loads and
        // refreshes the stored session (if any). This is our "is user logged in?" check.
        if (event === 'INITIAL_SESSION') {
          if (session?.user) {
            setUser(session.user)
            await fetchProfile(session.user.id)
          } else if (!hasAuthCallback) {
            // No session and not returning from a magic link — not logged in.
            setLoading(false)
          }
          // If hasAuthCallback, stay in loading state — SIGNED_IN will fire next.
          return
        }

        // SIGNED_IN: fires on login (password, magic link, OAuth).
        // Also fires when magic link tokens in URL are processed.
        if (event === 'SIGNED_IN') {
          if (session?.user) {
            setUser(session.user)
            await fetchProfile(session.user.id)
          }
          return
        }

        // TOKEN_REFRESHED: Supabase auto-refreshed the access token.
        // Update user in case anything changed, but don't re-fetch profile.
        if (event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            setUser(session.user)
          } else {
            // Refresh produced no session — treat as sign out
            setUser(null)
            setProfile(null)
            setLoading(false)
          }
          return
        }

        // SIGNED_OUT: user logged out or session was invalidated.
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }
      }
    )

    // Safety timeout: if auth callback processing stalls, stop loading after 8s
    let safetyTimer
    if (hasAuthCallback) {
      safetyTimer = setTimeout(() => { if (!cancelled) setLoading(false) }, 8000)
    }

    return () => {
      cancelled = true
      if (safetyTimer) clearTimeout(safetyTimer)
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(authId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', authId)
        .single()

      if (error) {
        if (error.code === 'PGRST301' || error.message?.includes('JWT') || error.code === '401') {
          // Don't clear localStorage here! Nuking storage kills the refresh token,
          // making it impossible for Supabase's auto-refresh to recover the session.
          // Just reset React state — user will be redirected to login naturally.
          console.warn('Profile fetch auth error:', error.message)
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }
        throw error
      }
      setProfile(data)
    } catch (err) {
      console.error('Error fetching profile:', err)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signInWithMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) throw error
  }

  async function signOut() {
    clearAuthStorage()
    supabase.auth.signOut().catch(() => {})
    window.location.href = '/login'
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }

  async function updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }

  const value = {
    user,
    profile,
    loading,
    signIn,
    signInWithMagicLink,
    signOut,
    resetPassword,
    updatePassword,
    isAdmin: profile?.role === 'admin',
    isClinicalLeader: profile?.role === 'clinical_leader',
    isTherapist: profile?.role === 'therapist',
    isApn: profile?.role === 'apn',
    isBa: profile?.role === 'ba',
    isIntern: profile?.role === 'intern',
    isFrontDesk: profile?.role === 'front_desk',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
