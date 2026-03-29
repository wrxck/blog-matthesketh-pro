import { signal } from '@matthesketh/utopia-core'

// Shared auth state — updated by App.utopia and auth page
export const isAuthed = signal(false)

const API_BASE = import.meta.env.DEV
  ? 'http://localhost:60612/api/admin'
  : '/api/admin'

interface ApiOptions {
  method?: string
  body?: unknown
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) {
    if (res.status === 401 && window.location.pathname !== '/') {
      isAuthed.set(false)
      window.location.href = '/'
      throw new Error('Not authenticated')
    }
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const authApi = {
  status: () => api<{ registered: boolean; authenticated: boolean }>('/auth/status'),
  registerOptions: (displayName: string) =>
    api('/auth/register-options', { method: 'POST', body: { displayName } }),
  register: (response: unknown, userId: string, displayName: string) =>
    api('/auth/register', { method: 'POST', body: { response, userId, displayName } }),
  loginOptions: () =>
    api<any>('/auth/login-options', { method: 'POST' }),
  login: (response: unknown, challengeKey: string) =>
    api('/auth/login', { method: 'POST', body: { response, challengeKey } }),
  logout: () => api('/auth/logout', { method: 'POST' }),
}

export interface PostSummary {
  id: string
  slug: string
  title: string
  description: string
  date: string
  tags: string[]
  draft: boolean
}

export interface PostFull extends PostSummary {
  body: string
}

export const postsApi = {
  list: () => api<PostSummary[]>('/posts'),
  get: (id: string) => api<PostFull>(`/posts/${id}`),
  create: (data: { slug: string; title: string; description: string; date: string; tags: string[]; draft: boolean; body: string }) =>
    api<{ ok: true; slug: string }>('/posts', { method: 'POST', body: data }),
  update: (id: string, data: Partial<PostFull>) =>
    api(`/posts/${id}`, { method: 'PUT', body: data }),
  delete: (id: string) =>
    api(`/posts/${id}`, { method: 'DELETE' }),
  publish: (id: string) =>
    api(`/posts/${id}/publish`, { method: 'POST' }),
  rebuild: () => api('/posts/rebuild', { method: 'POST' }),
}
