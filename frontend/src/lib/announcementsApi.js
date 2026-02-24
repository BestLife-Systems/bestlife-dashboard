import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || ''

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || ''}`,
  }
}

export async function fetchAnnouncements() {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/announcements`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createAnnouncement(data) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/announcements`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateAnnouncement(id, data) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/announcements/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteAnnouncement(id) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/announcements/${id}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
