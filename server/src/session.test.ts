import { describe, it, expect, beforeEach } from 'vitest'
import { SessionStore } from './session.js'

describe('SessionStore', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore()
  })

  it('creates a session and returns a token', () => {
    const token = store.create('user-1')
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(20)
  })

  it('validates a valid session', () => {
    const token = store.create('user-1')
    const session = store.get(token)
    expect(session).not.toBeNull()
    expect(session!.userId).toBe('user-1')
  })

  it('returns null for invalid token', () => {
    expect(store.get('bogus')).toBeNull()
  })

  it('destroys a session', () => {
    const token = store.create('user-1')
    store.destroy(token)
    expect(store.get(token)).toBeNull()
  })

  it('expires sessions after maxAge', () => {
    store = new SessionStore(100) // 100ms
    const token = store.create('user-1')
    expect(store.get(token)).not.toBeNull()

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(store.get(token)).toBeNull()
        resolve()
      }, 150)
    })
  })
})
