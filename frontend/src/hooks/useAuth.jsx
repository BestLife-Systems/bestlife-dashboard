import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

// Pages where we should NOT hard-redirect on auth failure
const PUBLIC_PATHS = ['/login', '/reset-password', '/invoice', '/unauthorized']

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const loadingRef = useRef(true)
  const nukingRef = useRef(false)

  function setLoadingState(val) {
    loadingRef.current = val
    setLoading(val)
  }

  // Nuclear option: clear all auth data and redirect to login
  // Uses hard redirect (window.location) instead of React state to guarantee
  // the Supabase client, React tree, and localStorage are ALL fully reset.
  function nukeSession() {
    if (nukingRef.current) return
    nukingRef.current = true
    try {
      Object.keys(localStorage).forEach(key => {
        if (key === 'bestlife-auth-v') return
        if (key.startsWith('bestlife-auth') || key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key)
        }
      })
    } catch {}
    // On protected pages: hard redirect (full page reload = fresh Supabase client)
    const isPublic = PUBLIC_PATHS.some(p => window.location.pathname.startsWith(p))
    if (!isPublic) {
      window.location.href = '/login'
      return
    }
    // On public pages (login, reset-password, etc.): just reset React state
    setUser(null)
    setProfile(null)
    setLoadingState(false)
    setTimeout(() => { nukingRef.current = false }, 500)
  }

  useEffect(() => {
    let cancelled = false

    async function initSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          if (!cancelled) setLoadingState(false)
          return
        }

        // Validate with the server (not local token checks — let the server decide)
        let { data: { user: validUser }, error: userError } = await supabase.auth.getUser()

        // If access token was rejected, try one refresh
        if (userError) {
          console.info('Token rejected, attempting refresh…')
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
          if (refreshError || !refreshed?.session) {
            console.warn('Refresh failed:', refreshError?.message)
            nukeSession()
            return
          }
          // Re-validate with fresh token
          const retry = await supabase.auth.getUser()
          if (retry.error || !retry.data?.user) {
            console.warn('Still rejected after refresh')
            nukeSession()
            return
          }
          validUser = retry.data.user
        }

        if (!cancelled && validUser) {
          setUser(validUser)
          fetchProfile(validUser.id)
        } else if (!cancelled) {
          setLoadingState(false)
        }
      } catch (err) {
        console.warn('initSession error:', err)
        nukeSession()
      }
    }
    initSession()

    // Safety net: if loading is still true after 15 seconds, force recovery
    const safetyTimeout = setTimeout(() => {
      if (loadingRef.current) {
        console.warn('Auth loading timed out after 15s — forcing recovery')
        nukeSession()
      }
    }, 15000)

    // Listen for auth changes (auto-refresh success/failure, sign-in, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
          setUser(null)
          setProfile(null)
          setLoadingState(false)
          return
        }
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
          setLoadingState(false)
        }
      }
    )

    // Re-validate session when tab becomes visible again (debounced)
    let focusTimer = null
    const handleVisibility = () => {
      if (document.hidden) return
      if (focusTimer) clearTimeout(focusTimer)
      focusTimer = setTimeout(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) return
          // Always refresh when returning — token may have expired while backgrounded
          const { error } = await supabase.auth.refreshSession()
          if (error) {
            console.warn('Refresh failed on tab focus:', error.message)
            nukeSession()
          }
        } catch {}
      }, 500)
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      clearTimeout(safetyTimeout)
      if (focusTimer) clearTimeout(focusTimer)
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', userId)
        .single()

      if (error) {
        if (error.code === 'PGRST301' || error.message?.includes('JWT') || error.code === '401') {
          console.warn('Profile fetch auth error:', error.message)
          nukeSession()
          return
        }
        throw error
      }
      setProfile(data)
    } catch (err) {
      console.error('Error fetching profile:', err)
      setProfile(null)
    } finally {
      setLoadingState(false)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key === 'bestlife-auth-v') return
        if (key.startsWith('bestlife-auth') || key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key)
        }
      })
    } catch {}
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
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (error) throw error
  }

  const value = {
    user,
    profile,
    loading,
    signIn,
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
