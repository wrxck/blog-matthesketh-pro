import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types'
import type { FastifyInstance } from 'fastify'
import { config } from './config.js'
import { sessionStore, setSessionCookie, clearSessionCookie, requireAuth } from './session.js'

export interface StoredCredential {
  credentialId: string
  publicKey: string
  counter: number
  transports: string[]
  userId: string
  displayName: string
}

export class CredentialStore {
  private filePath: string
  private credentials: StoredCredential[] | null = null

  constructor(dataDir: string) {
    this.filePath = join(dataDir, 'credentials.json')
  }

  private async load(): Promise<StoredCredential[]> {
    if (this.credentials !== null) return this.credentials
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      this.credentials = JSON.parse(raw)
      return this.credentials!
    } catch {
      this.credentials = []
      return this.credentials
    }
  }

  private async save(): Promise<void> {
    const dir = join(this.filePath, '..')
    await mkdir(dir, { recursive: true })
    await writeFile(this.filePath, JSON.stringify(this.credentials, null, 2), 'utf-8')
  }

  async isRegistered(): Promise<boolean> {
    const creds = await this.load()
    return creds.length > 0
  }

  async getCredentials(): Promise<StoredCredential[]> {
    return this.load()
  }

  async getCredentialById(id: string): Promise<StoredCredential | null> {
    const creds = await this.load()
    return creds.find((c) => c.credentialId === id) || null
  }

  async saveCredential(cred: StoredCredential): Promise<void> {
    const creds = await this.load()
    creds.push(cred)
    await this.save()
  }

  async updateCounter(credentialId: string, counter: number): Promise<void> {
    const creds = await this.load()
    const cred = creds.find((c) => c.credentialId === credentialId)
    if (cred) {
      cred.counter = counter
      await this.save()
    }
  }
}

// In-memory challenge store (short-lived, per-request)
const challenges = new Map<string, string>()

export function registerAuthRoutes(app: FastifyInstance, credentialStore: CredentialStore): void {
  // --- Auth status ---
  app.get('/api/admin/auth/status', async (req) => {
    const registered = await credentialStore.isRegistered()
    const token = req.cookies[config.cookieName]
    const authenticated = token ? sessionStore.get(token) !== null : false
    return { registered, authenticated }
  })

  // --- Registration ---
  app.post('/api/admin/auth/register-options', async (req, reply) => {
    if (await credentialStore.isRegistered()) {
      return reply.code(403).send({ error: 'Already registered' })
    }
    const { displayName } = req.body as { displayName: string }
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpId,
      userName: displayName,
      userDisplayName: displayName,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    })
    // Store challenge keyed by the userID from options
    challenges.set(options.user.id, options.challenge)
    return options
  })

  app.post('/api/admin/auth/register', async (req, reply) => {
    if (await credentialStore.isRegistered()) {
      return reply.code(403).send({ error: 'Already registered' })
    }
    const { response, userId, displayName } = req.body as {
      response: RegistrationResponseJSON
      userId: string
      displayName: string
    }
    const expectedChallenge = challenges.get(userId)
    if (!expectedChallenge) {
      return reply.code(400).send({ error: 'No pending challenge' })
    }
    challenges.delete(userId)

    try {
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
      })

      if (!verification.verified || !verification.registrationInfo) {
        return reply.code(400).send({ error: 'Verification failed' })
      }

      const { credential } = verification.registrationInfo
      await credentialStore.saveCredential({
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: response.response.transports || [],
        userId,
        displayName,
      })

      const token = sessionStore.create(userId)
      setSessionCookie(reply, token)
      return { ok: true }
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // --- Authentication ---
  app.post('/api/admin/auth/login-options', async (req, reply) => {
    const creds = await credentialStore.getCredentials()
    if (creds.length === 0) {
      return reply.code(400).send({ error: 'No credentials registered' })
    }
    const options = await generateAuthenticationOptions({
      rpID: config.rpId,
      userVerification: 'required',
      allowCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
    })
    // Store challenge keyed by a random session-id
    const challengeKey = `auth-${Date.now()}`
    challenges.set(challengeKey, options.challenge)
    return { ...options, challengeKey }
  })

  app.post('/api/admin/auth/login', async (req, reply) => {
    const { response, challengeKey } = req.body as {
      response: AuthenticationResponseJSON
      challengeKey: string
    }
    const expectedChallenge = challenges.get(challengeKey)
    if (!expectedChallenge) {
      return reply.code(400).send({ error: 'No pending challenge' })
    }
    challenges.delete(challengeKey)

    const credentialId = response.id
    const storedCred = await credentialStore.getCredentialById(credentialId)
    if (!storedCred) {
      // Log for debugging credential ID mismatches
      const allCreds = await credentialStore.getCredentials()
      app.log.warn({
        msg: 'Unknown credential',
        receivedId: credentialId,
        storedIds: allCreds.map((c) => c.credentialId),
      })
      return reply.code(400).send({ error: 'Unknown credential' })
    }

    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        credential: {
          id: storedCred.credentialId,
          publicKey: Buffer.from(storedCred.publicKey, 'base64url'),
          counter: storedCred.counter,
          transports: storedCred.transports as AuthenticatorTransportFuture[],
        },
      })

      if (!verification.verified) {
        return reply.code(400).send({ error: 'Verification failed' })
      }

      await credentialStore.updateCounter(
        storedCred.credentialId,
        verification.authenticationInfo.newCounter
      )

      const token = sessionStore.create(storedCred.userId)
      setSessionCookie(reply, token)
      return { ok: true }
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // --- Logout ---
  app.post('/api/admin/auth/logout', async (req, reply) => {
    const session = requireAuth(req, reply)
    if (!session) return
    sessionStore.destroy(session.token)
    clearSessionCookie(reply)
    return { ok: true }
  })
}
