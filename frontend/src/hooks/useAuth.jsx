import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Hard-clear all Supabase auth data from localStorage
  function nukeSession() {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('bestlife-auth') || key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key)
        }
      })
    } catch {}
    supabase.auth.signOut().catch(() => {})
    setUser(null)
    setProfile(null)
    setLoading(false)
  }

  // Check if a JWT is expired (with 60s buffer)
  function isTokenExpired(token) {
    if (!token) return true
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.exp * 1000 < Date.now() - 60000
    } catch { return true }
  }

  useEffect(() => {
    // Get initial session — validate server-side to catch revoked tokens
    async function initSession() {
      try {
        let { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          console.warn('Session recovery failed:', error.message)
          nukeSession()
          return
        }
        // If access token is expired, try refreshing before giving up
        if (session?.access_token && isTokenExpired(session.access_token)) {
          console.info('Access token expired locally, attempting refresh…')
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
          if (refreshError || !refreshed?.session) {
            console.warn('Token refresh failed, clearing session:', refreshError?.message)
            nukeSession()
            return
          }
          session = refreshed.session
        }
        if (session?.user) {
          // Server-side validation: catches tokens that decode fine locally but are revoked
          const { error: userError } = await supabase.auth.getUser()
          if (userError) {
            console.warn('Server rejected token, clearing session:', userError.message)
            nukeSession()
            return
          }
          setUser(session.user)
          fetchProfile(session.user.id)
        } else {
          setLoading(false)
        }
      } catch (err) {
        console.warn('initSession threw:', err)
        nukeSession()
      }
    }
    initSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          nukeSession()
          return
        }
        if (event === 'TOKEN_REFRESHED' && !session) {
          console.warn('Token refresh failed, nuking session')
          nukeSession()
          return
        }
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    // Re-validate session when tab regains focus (catches expiry while backgrounded)
    const handleFocus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        if (session.access_token && isTokenExpired(session.access_token)) {
          // Try refresh before nuking — token may have expired while tab was in background
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
          if (refreshError || !refreshed?.session) {
            console.warn('Session expired and refresh failed after refocus')
            nukeSession()
            return
          }
          // Refresh succeeded, session is valid
          return
        }
        const { error } = await supabase.auth.getUser()
        if (error) {
          console.warn('Session invalid after refocus:', error.message)
          nukeSession()
        }
      } catch {}
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('focus', handleFocus)
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
        // If it's an auth error (401/403), the session is stale — nuke it
        if (error.code === 'PGRST301' || error.message?.includes('JWT') || error.code === '401') {
          console.warn('Profile fetch auth error, clearing session:', error.message)
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
      setLoading(false)
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
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null)
    setProfile(null)
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
