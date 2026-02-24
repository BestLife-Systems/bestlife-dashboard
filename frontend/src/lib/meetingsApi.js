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

export async function fetchMeetingTemplates() {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/meetings/templates`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createMeetingTemplate(data) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/meetings/templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateMeetingTemplate(id, data) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/meetings/templates/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteMeetingTemplate(id) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/meetings/templates/${id}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteMeetingInstance(id) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/meetings/instances/${id}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
