import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || ''

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || ''}`,
  }
}

export async function fetchMyInstances() {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/tasks/instances`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateInstanceStatus(id, status) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/tasks/instances/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchTemplates() {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/tasks/templates`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createTemplate(data) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/tasks/templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateTemplate(id, data) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/tasks/templates/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteTemplate(id) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/tasks/templates/${id}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function generateInstances(days = 30) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/api/tasks/generate?days=${days}`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
