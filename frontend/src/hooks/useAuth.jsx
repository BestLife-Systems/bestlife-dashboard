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
    let resolved = false  // tracks whether ANY auth event set loading=false

    const markResolved = () => { resolved = true }

    // Detect auth callback in URL (magic link / password recovery).
    const hash = window.location.hash
    const search = window.location.search
    const hasAuthCallback =
      hash.includes('access_token') || hash.includes('type=magiclink') ||
      hash.includes('type=recovery') || search.includes('code=')

    // CRITICAL: We do NOT call refreshSession() manually. Supabase's internal
    // _initialize() already refreshes expired tokens before firing INITIAL_SESSION.
    // Calling refreshSession() ourselves races with that internal refresh, and
    // with refresh token rotation enabled (Supabase default), the second refresh
    // sees an already-rotated token and fails — killing the session every time.
    let subscription
    try {
      const result = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (cancelled) return

          if (event === 'INITIAL_SESSION') {
            markResolved()
            if (session?.user) {
              setUser(session.user)
              await fetchProfile(session.user.id)
            } else if (!hasAuthCallback) {
              setLoading(false)
            }
            return
          }

          if (event === 'SIGNED_IN') {
            markResolved()
            if (session?.user) {
              setUser(session.user)
              await fetchProfile(session.user.id)
            }
            return
          }

          if (event === 'TOKEN_REFRESHED') {
            if (session?.user) {
              setUser(session.user)
            } else {
              setUser(null)
              setProfile(null)
              setLoading(false)
            }
            return
          }

          if (event === 'SIGNED_OUT') {
            setUser(null)
            setProfile(null)
            setLoading(false)
            return
          }
        }
      )
      subscription = result.data.subscription
    } catch (err) {
      console.error('Auth listener registration failed:', err)
      setLoading(false)
      return
    }

    // Fallback: if no auth event fires within 5s (Supabase _initialize() hung,
    // slow network, etc.), check the session directly via getSession() and
    // force loading=false. Without this, the app shows an infinite spinner.
    const fallbackTimer = setTimeout(async () => {
      if (cancelled || resolved) return
      console.warn('Auth: no event after 5s — falling back to getSession()')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled || resolved) return
        if (session?.user) {
          setUser(session.user)
          await fetchProfile(session.user.id)
        } else {
          setLoading(false)
        }
      } catch (err) {
        console.error('Auth fallback getSession failed:', err)
        if (!cancelled) setLoading(false)
      }
    }, 5000)

    // Hard safety net: NEVER let loading stay true for more than 10s, period.
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        console.warn('Auth: 10s safety timeout — forcing loading=false')
        setLoading(false)
      }
    }, 10000)

    return () => {
      cancelled = true
      clearTimeout(fallbackTimer)
      clearTimeout(safetyTimer)
      if (subscription) subscription.unsubscribe()
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
