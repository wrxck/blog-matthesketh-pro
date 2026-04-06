import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createDatabase } from '@matthesketh/utopia-database'
import { createSqliteAdapter } from '@matthesketh/utopia-database/sqlite'

import { SessionStore } from './session.js'

const CREATE_SESSIONS_SQLITE = `CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
)`

function makeStore(maxAge?: number) {
  const db = createDatabase(createSqliteAdapter({ filename: ':memory:' }))
  return { db, store: new SessionStore(db, maxAge) }
}

describe('SessionStore', () => {
  let db: ReturnType<typeof createDatabase>
  let store: SessionStore

  beforeEach(async () => {
    const result = makeStore()
    db = result.db
    store = result.store
    await db.connect()
    await db.raw(CREATE_SESSIONS_SQLITE, [])
  })

  afterEach(async () => {
    await db.disconnect()
  })

  it('creates a session and returns a token', async () => {
    const token = await store.create('user-1')
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(20)
  })

  it('validates a valid session', async () => {
    const token = await store.create('user-1')
    const session = await store.get(token)
    expect(session).not.toBeNull()
    expect(session!.userId).toBe('user-1')
  })

  it('returns null for invalid token', async () => {
    expect(await store.get('bogus')).toBeNull()
  })

  it('destroys a session', async () => {
    const token = await store.create('user-1')
    await store.destroy(token)
    expect(await store.get(token)).toBeNull()
  })

  it('expires sessions after maxAge', async () => {
    const { db: db2, store: store2 } = makeStore(100)
    await db2.connect()
    await db2.raw(CREATE_SESSIONS_SQLITE, [])

    const token = await store2.create('user-1')
    expect(await store2.get(token)).not.toBeNull()

    await new Promise<void>((resolve) => setTimeout(resolve, 150))

    expect(await store2.get(token)).toBeNull()
    await db2.disconnect()
  })

  it('touch updates last_active_at', async () => {
    const token = await store.create('user-1')
    await store.touch(token)
    const row = await db.raw(`SELECT last_active_at FROM sessions WHERE token = ?`, [token])
    expect(row.rows[0]).toBeDefined()
  })

  it('cleanup removes expired sessions', async () => {
    const { db: db3, store: store3 } = makeStore(100)
    await db3.connect()
    await db3.raw(CREATE_SESSIONS_SQLITE, [])

    const token = await store3.create('user-1')
    await new Promise<void>((resolve) => setTimeout(resolve, 150))
    await store3.cleanup()

    const row = await db3.raw(`SELECT token FROM sessions WHERE token = ?`, [token])
    expect(row.rows).toHaveLength(0)
    await db3.disconnect()
  })
})
