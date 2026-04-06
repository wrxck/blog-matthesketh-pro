import { randomBytes } from 'node:crypto'

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Database } from '@matthesketh/utopia-database'

import { config } from './config.js'

interface Session {
  userId: string
  token: string
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export class SessionStore {
  private db: Database
  private maxAge: number

  constructor(db: Database, maxAge = SEVEN_DAYS_MS) {
    this.db = db
    this.maxAge = maxAge
  }

  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex')
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + this.maxAge).toISOString()
    await this.db.query('sessions').insert({
      token,
      user_id: userId,
      created_at: now,
      last_active_at: now,
      expires_at: expiresAt,
    })
    return token
  }

  async get(token: string): Promise<Session | null> {
    const now = new Date().toISOString()
    const row = await this.db.query('sessions')
      .select('token', 'user_id')
      .where({ token })
      .where('expires_at', '>', now)
      .first()
    if (!row) return null
    return { token: row.token as string, userId: row.user_id as string }
  }

  async touch(token: string): Promise<void> {
    const now = new Date().toISOString()
    await this.db.query('sessions')
      .where({ token })
      .update({ last_active_at: now })
  }

  async destroy(token: string): Promise<void> {
    await this.db.query('sessions').where({ token }).delete()
  }

  async cleanup(): Promise<void> {
    const now = new Date().toISOString()
    await this.db.query('sessions').where('expires_at', '<=', now).delete()
  }
}

let _sessionStore: SessionStore | null = null

export function initSessionStore(db: Database, maxAge?: number): void {
  _sessionStore = new SessionStore(db, maxAge)
}

export const sessionStore = new Proxy({} as SessionStore, {
  get(_target, prop) {
    if (!_sessionStore) {
      throw new Error('SessionStore not initialised. Call initSessionStore(db) first.')
    }
    return (_sessionStore as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export function setSessionCookie(reply: FastifyReply, token: string): void {
  const isDev = process.env.NODE_ENV !== 'production'
  reply.setCookie(config.cookieName, token, {
    httpOnly: true,
    secure: !isDev,
    sameSite: isDev ? 'lax' : 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.cookieName, { path: '/' })
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<Session | null> {
  const token = req.cookies[config.cookieName]
  if (!token) {
    reply.code(401).send({ error: 'Not authenticated' })
    return null
  }
  const session = await sessionStore.get(token)
  if (!session) {
    reply.code(401).send({ error: 'Session expired' })
    return null
  }
  // fire-and-forget touch
  sessionStore.touch(token).catch(() => undefined)
  return session
}
