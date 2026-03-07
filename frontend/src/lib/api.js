import { supabase, clearAndRedirect } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function getAuthHeaders() {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 5000)),
    ])
    const session = result?.data?.session
    if (!session?.access_token) return {}
    return { 'Authorization': `Bearer ${session.access_token}` }
  } catch (e) {
    console.warn('getAuthHeaders failed:', e.message)
    return {}
  }
}

// Central fetch wrapper: 401 retry (no manual refreshSession!) + hard redirect on dead session
//
// CRITICAL: We never call refreshSession() here. Supabase's autoRefreshToken handles
// token rotation internally. Calling refreshSession() ourselves races with that internal
// refresh, and with refresh-token-rotation enabled (Supabase default), the second refresh
// sees an already-rotated token → kills the session permanently.
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

  // On 401, Supabase's auto-refresh may have just rotated the token in the background.
  // Wait progressively, then retry twice with the updated session.
  if (res.status === 401) {
    await new Promise(r => setTimeout(r, 2000))
    res = await doFetch()
  }
  if (res.status === 401) {
    await new Promise(r => setTimeout(r, 3000))
    res = await doFetch()
  }

  // Still 401 after retries — session is truly dead, clear storage and redirect
  if (res.status === 401) {
    clearAndRedirect()
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
