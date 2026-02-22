import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || ''

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || ''}`,
  }
}

export async function fetchMeetingInstances() {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/meetings/instances`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function generateMeetings(days = 120) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/meetings/generate?days=${days}`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
