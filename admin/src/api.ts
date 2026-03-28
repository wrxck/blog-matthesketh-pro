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
  get: (slug: string) => api<PostFull>(`/posts/${slug}`),
  create: (data: { slug: string; title: string; description: string; date: string; tags: string[]; draft: boolean; body: string }) =>
    api<{ ok: true; slug: string }>('/posts', { method: 'POST', body: data }),
  update: (slug: string, data: Partial<PostFull>) =>
    api(`/posts/${slug}`, { method: 'PUT', body: data }),
  delete: (slug: string) =>
    api(`/posts/${slug}`, { method: 'DELETE' }),
  publish: (slug: string) =>
    api(`/posts/${slug}/publish`, { method: 'POST' }),
  rebuild: () => api('/posts/rebuild', { method: 'POST' }),
}
