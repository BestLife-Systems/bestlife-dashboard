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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'bestlife-auth',
  },
})
