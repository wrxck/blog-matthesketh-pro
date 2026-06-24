import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// the token module reads config.adfreeSecret at import time, so set it before the
// (hoisted) import of config runs.
vi.hoisted(() => {
  process.env.ADFREE_SECRET = 'test-secret-value-for-the-suite'
})

const { makeCookie, readCookie, makeMagic, readMagic } = await import('./adfree-token.js')

describe('ad-free cookie', () => {
  it('round-trips the (lower-cased) email', () => {
    expect(readCookie(makeCookie('Reader@Example.com'))).toBe('reader@example.com')
  })

  it('rejects a tampered or garbage cookie', () => {
    const good = makeCookie('reader@example.com')
    const tampered = good.slice(0, -2) + (good.endsWith('a') ? 'bb' : 'aa')
    expect(readCookie(tampered)).toBeNull()
    expect(readCookie('not-a-cookie')).toBeNull()
    expect(readCookie(undefined)).toBeNull()
  })

  it('rejects a payload swapped under a forged signature', () => {
    const forged = `${Buffer.from('attacker@evil.com').toString('base64url')}.deadbeef`
    expect(readCookie(forged)).toBeNull()
  })
})

describe('magic-link token', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('round-trips within the ttl', () => {
    expect(readMagic(makeMagic('reader@example.com'))).toBe('reader@example.com')
  })

  it('expires after 30 minutes', () => {
    const token = makeMagic('reader@example.com')
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(readMagic(token)).toBeNull()
  })

  it('rejects a tampered token', () => {
    const good = makeMagic('reader@example.com')
    expect(readMagic(good.slice(0, -2) + 'zz')).toBeNull()
  })
})
