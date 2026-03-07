import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jvtwvrqityxzcnsbrilk.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2dHd2cnFpdHl4emNuc2JyaWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTYzMzgsImV4cCI6MjA4NjgzMjMzOH0.uHTBDuBlBvtlK2gPHHAAbL4hJTkqWCoMn0a1V-LYtQg'

// Clean up old Supabase auth keys from before storageKey change
// This runs once on app load, before the client reads localStorage
try {
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sb-') && key.includes('auth-token')) {
      localStorage.removeItem(key)
    }
  })
} catch {}

// Pre-flight: clear stale/corrupt sessions before Supabase client reads them
// Bump this version on deploys that change auth behavior to force a clean session
const AUTH_VERSION = '9'
try {
  if (localStorage.getItem('bestlife-auth-v') !== AUTH_VERSION) {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('bestlife-auth') || key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key)
      }
    })
    localStorage.setItem('bestlife-auth-v', AUTH_VERSION)
  }
} catch {}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'bestlife-auth',
    // Disable navigator.locks — it causes signInWithPassword to hang indefinitely
    // when _initialize() holds the lock during a slow/stale token refresh.
    // A no-op lock is safe for a single-org dashboard; the only trade-off is
    // two tabs could race on a token refresh, which is far less harmful than
    // a permanently stuck login screen.
    lock: async (name, acquireTimeout, fn) => await fn(),
  },
})

// ── Session health recovery ─────────────────────────────────────────
// When the browser tab regains focus (user returns after locking phone,
// switching apps, etc.), verify the session is still alive. If broken,
// clear storage and redirect to login instead of leaving the UI frozen.
function clearAndRedirect() {
  try {
    Object.keys(localStorage).forEach(key => {
      if (key === 'bestlife-auth-v') return
      if (key.startsWith('bestlife-auth') || key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key)
      }
    })
  } catch {}
  window.location.href = '/login'
}

let lastHealthCheck = Date.now()
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return
  // Skip if we checked less than 30s ago
  if (Date.now() - lastHealthCheck < 30000) return
  // Skip if on login/reset pages
  if (window.location.pathname.startsWith('/login') || window.location.pathname.startsWith('/reset')) return
  lastHealthCheck = Date.now()
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
    if (!result?.data?.session) {
      console.warn('Session expired on tab refocus — redirecting to login')
      clearAndRedirect()
    }
  } catch {
    console.warn('Session health check failed — redirecting to login')
    clearAndRedirect()
  }
})

// ── Safe wrapper for direct Supabase client calls ───────────────────
// Wraps any Promise (e.g. supabase.from('x').select()) with a timeout.
// If the call hangs (broken auth state), it clears storage and redirects
// to login instead of freezing the UI.
export async function safeSb(promise, timeoutMs = 10000) {
  const result = await Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase call timed out')), timeoutMs)),
  ]).catch(err => {
    if (err.message === 'Supabase call timed out') {
      console.warn('Direct Supabase call hung — clearing session')
      clearAndRedirect()
    }
    throw err
  })
  return result
}

// Export the recovery function for use in api.js
export { clearAndRedirect }
