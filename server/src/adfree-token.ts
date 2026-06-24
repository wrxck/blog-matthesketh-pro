// stateless ad-free identity: a signed cookie marks a device ad-free, a
// short-lived magic-link token re-establishes it elsewhere. both are hmac over
// the (lower-cased) email, domain-separated, keyed by config.adfreeSecret — no
// reader-session table. callers still check live subscription status, so a valid
// signature only proves which email, not that the subscription is current.

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { FastifyReply } from 'fastify'

import { config } from './config.js'

const MAGIC_TTL_MS = 30 * 60 * 1000
const COOKIE_MAX_AGE_S = 180 * 24 * 60 * 60

export const normalise = (email: string) => email.trim().toLowerCase()

function sign(domain: string, payload: string): string {
  return createHmac('sha256', config.adfreeSecret).update(`${domain}:${payload}`).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export function makeCookie(email: string): string {
  const e = Buffer.from(normalise(email)).toString('base64url')
  return `${e}.${sign('cookie', e)}`
}

export function readCookie(value: string | undefined): string | null {
  if (!value || !config.adfreeSecret) return null
  const [e, mac] = value.split('.')
  if (!e || !mac || !safeEqual(mac, sign('cookie', e))) return null
  try {
    return Buffer.from(e, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

export function makeMagic(email: string): string {
  const body = Buffer.from(JSON.stringify({ e: normalise(email), x: Date.now() + MAGIC_TTL_MS })).toString(
    'base64url',
  )
  return `${body}.${sign('magic', body)}`
}

export function readMagic(token: string | undefined): string | null {
  if (!token || !config.adfreeSecret) return null
  const [body, mac] = token.split('.')
  if (!body || !mac || !safeEqual(mac, sign('magic', body))) return null
  try {
    const { e, x } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { e: string; x: number }
    if (typeof x !== 'number' || Date.now() > x) return null
    return e
  } catch {
    return null
  }
}

export function setAdfreeCookie(reply: FastifyReply, email: string): void {
  reply.setCookie(config.adfreeCookieName, makeCookie(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // lax so the cookie survives the cross-site magic-link click + the stripe
    // redirect back to the success page.
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_S,
  })
}
