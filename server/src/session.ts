import { randomBytes } from 'node:crypto'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { config } from './config.js'

interface Session {
  userId: string
  createdAt: number
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export class SessionStore {
  private sessions = new Map<string, Session>()
  private maxAge: number

  constructor(maxAge = SEVEN_DAYS_MS) {
    this.maxAge = maxAge
  }

  create(userId: string): string {
    const token = randomBytes(32).toString('hex')
    this.sessions.set(token, { userId, createdAt: Date.now() })
    return token
  }

  get(token: string): (Session & { token: string }) | null {
    const session = this.sessions.get(token)
    if (!session) return null
    if (Date.now() - session.createdAt > this.maxAge) {
      this.sessions.delete(token)
      return null
    }
    return { ...session, token }
  }

  destroy(token: string): void {
    this.sessions.delete(token)
  }
}

export const sessionStore = new SessionStore()

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

export function requireAuth(req: FastifyRequest, reply: FastifyReply): Session & { token: string } | null {
  const token = req.cookies[config.cookieName]
  if (!token) {
    reply.code(401).send({ error: 'Not authenticated' })
    return null
  }
  const session = sessionStore.get(token)
  if (!session) {
    reply.code(401).send({ error: 'Session expired' })
    return null
  }
  return session
}
