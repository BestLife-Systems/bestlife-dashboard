import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// Check if a JWT is expired (with 60s buffer)
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 < Date.now() - 60000
  } catch { return true }
}

async function getAuthHeaders() {
  let { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return {}

  // If the cached token is already expired, proactively refresh before using it
  if (isTokenExpired(session.access_token)) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) {
      return { 'Authorization': `Bearer ${refreshed.session.access_token}` }
    }
    // Refresh failed — return empty, server will 401 and apiFetch will handle it
    return {}
  }

  return { 'Authorization': `Bearer ${session.access_token}` }
}

// Central fetch wrapper: proactive refresh + 401 retry + hard redirect on dead session
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`

  const doFetch = async () => {
    const auth = await getAuthHeaders()
    return fetch(url, {
      ...options,
      headers: { ...auth, ...(options.headers || {}) },
    })
  }

  let res = await doFetch()

  // On 401, attempt one token refresh + retry
  if (res.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session) {
      res = await doFetch()
    }
  }

  // Still 401 after retry — session is dead, redirect to login
  // Don't nuke localStorage here — let useAuth handle cleanup on next mount
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  return res
}

function parseError(err) {
  const detail = err.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(d => d.msg || JSON.stringify(d)).join('; ')
  return JSON.stringify(detail) || 'Request failed'
}

export async function apiGet(path) {
  const res = await apiFetch(path)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(parseError(err))
  }
  return res.json()
}

export async function apiPost(path, body) {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(parseError(err))
  }
  return res.json()
}

export async function apiUpload(path, file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiFetch(path, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
}

export async function apiPatch(path, body) {
  const res = await apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export async function apiDelete(path) {
  const res = await apiFetch(path, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  if (res.status === 204) return null
  return res.json()
}
