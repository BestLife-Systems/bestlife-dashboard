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
    // Get initial session — handle stale/expired sessions gracefully
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('Session recovery failed, clearing stale session:', error.message)
        nukeSession()
        return
      }
      // Check if the access token is actually expired
      if (session?.access_token && isTokenExpired(session.access_token)) {
        console.warn('Access token expired, clearing stale session')
        nukeSession()
        return
      }
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    }).catch((err) => {
      console.warn('getSession threw, clearing state:', err)
      nukeSession()
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'TOKEN_REFRESHED' && !session) {
          // Token refresh failed — stale session
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

    return () => subscription.unsubscribe()
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
    isFrontDesk: profile?.role === 'front_desk',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
