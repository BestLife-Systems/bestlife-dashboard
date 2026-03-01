import { createContext, useContext, useState, useEffect, useRef } from 'react'
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

    // Detect auth callback in URL (magic link or OAuth redirect).
    // Supabase uses either hash params (#access_token=...) or search params (?code=...)
    // depending on the flow. We must NOT set loading=false until Supabase processes these.
    const hash = window.location.hash
    const search = window.location.search
    const hasAuthCallback =
      hash.includes('access_token') || hash.includes('type=magiclink') ||
      hash.includes('type=recovery') || search.includes('code=')

    async function initSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session && hasAuthCallback) {
          // Auth callback in progress — Supabase is processing URL tokens async.
          // Keep loading=true and let onAuthStateChange handle it below.
          // Safety timeout: if callback processing stalls, stop loading after 8s.
          setTimeout(() => { if (!cancelled) setLoading(false) }, 8000)
          return
        }

        if (!session) {
          if (!cancelled) setLoading(false)
          return
        }

        // Refresh to ensure we have valid tokens.
        // refreshSession() handles expired access tokens gracefully by using
        // the refresh token, whereas getUser() would reject them.
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()

        if (refreshError || !refreshed?.session) {
          console.info('Session expired, clearing auth state')
          clearAuthStorage()
          if (!cancelled) setLoading(false)
          return
        }

        if (!cancelled) {
          setUser(refreshed.session.user)
          await fetchProfile(refreshed.session.user.id)
        }
      } catch (err) {
        console.warn('initSession error:', err)
        clearAuthStorage()
        if (!cancelled) setLoading(false)
      }
    }

    initSession()

    // Listen for auth state changes (sign-in, sign-out, token refresh, magic link callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return

        if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }

        if (session?.user) {
          setUser(session.user)
          await fetchProfile(session.user.id)
        } else {
          setUser(null)
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => {
      cancelled = true
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
        // Auth-level errors mean the session is bad
        if (error.code === 'PGRST301' || error.message?.includes('JWT') || error.code === '401') {
          console.warn('Profile fetch auth error — clearing session')
          clearAuthStorage()
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
