import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { CredentialStore } from './auth.js'

const TEST_DATA_DIR = join(import.meta.dirname, '../.test-data')

describe('CredentialStore', () => {
  let store: CredentialStore

  beforeEach(() => {
    mkdirSync(TEST_DATA_DIR, { recursive: true })
    store = new CredentialStore(TEST_DATA_DIR)
  })

  afterEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  })

  it('starts with no credentials', async () => {
    expect(await store.isRegistered()).toBe(false)
    expect(await store.getCredentials()).toEqual([])
  })

  it('saves and retrieves a credential', async () => {
    await store.saveCredential({
      credentialId: 'abc123',
      publicKey: 'key-data',
      counter: 0,
      transports: ['internal'],
      userId: 'matt',
      displayName: 'Matt',
    })
    expect(await store.isRegistered()).toBe(true)
    const creds = await store.getCredentials()
    expect(creds).toHaveLength(1)
    expect(creds[0].credentialId).toBe('abc123')
  })

  it('retrieves credential by id', async () => {
    await store.saveCredential({
      credentialId: 'abc123',
      publicKey: 'key-data',
      counter: 0,
      transports: ['internal'],
      userId: 'matt',
      displayName: 'Matt',
    })
    const cred = await store.getCredentialById('abc123')
    expect(cred).not.toBeNull()
    expect(cred!.publicKey).toBe('key-data')
  })

  it('updates counter', async () => {
    await store.saveCredential({
      credentialId: 'abc123',
      publicKey: 'key-data',
      counter: 0,
      transports: ['internal'],
      userId: 'matt',
      displayName: 'Matt',
    })
    await store.updateCounter('abc123', 5)
    const cred = await store.getCredentialById('abc123')
    expect(cred!.counter).toBe(5)
  })

  it('persists to disk', async () => {
    await store.saveCredential({
      credentialId: 'abc123',
      publicKey: 'key-data',
      counter: 0,
      transports: ['internal'],
      userId: 'matt',
      displayName: 'Matt',
    })
    expect(existsSync(join(TEST_DATA_DIR, 'credentials.json'))).toBe(true)

    // Create a new store instance reading from same dir
    const store2 = new CredentialStore(TEST_DATA_DIR)
    expect(await store2.isRegistered()).toBe(true)
  })
})
