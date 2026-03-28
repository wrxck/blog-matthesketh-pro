# Blog Admin Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a passkey-authenticated admin panel at `/admin` where Matt can write, edit, and publish blog posts via a split-pane markdown editor — without touching the existing static blog architecture.

**Architecture:** Fastify replaces nginx inside the Docker container. It serves the existing static blog from `dist/`, a new admin SPA from `dist-admin/`, and exposes API routes under `/api/admin/*`. Publishing writes a markdown file and triggers `utopia build` to regenerate the static output. Auth uses WebAuthn passkeys with session cookies.

**Tech Stack:** Fastify, @simplewebauthn/server, @simplewebauthn/browser, CodeMirror 6 (markdown editor), marked (preview renderer), gray-matter (frontmatter), UtopiaJS (admin SPA)

**Design spec:** `docs/superpowers/specs/2026-03-27-blog-admin-panel-design.md`

> **Note:** The spec mentions Milkdown for the editor. We're using CodeMirror 6 instead because the user chose option A (split-pane with raw markdown on the left, rendered preview on the right). CodeMirror is the right tool for a source-code-style markdown editing experience. Milkdown is WYSIWYG, which was option B.

---

## File Structure

```
blog-matthesketh-pro/
  server/                         # NEW — Fastify backend
    package.json
    tsconfig.json
    src/
      index.ts                    # Entry: Fastify setup, static serving, route registration
      config.ts                   # Environment config (paths, port)
      session.ts                  # In-memory session store + cookie middleware
      auth.ts                     # WebAuthn passkey registration/login routes
      posts.ts                    # Post CRUD routes (read/write markdown files)
      build.ts                    # Utopia build trigger (child process)
  admin/                          # NEW — Admin SPA (UtopiaJS)
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      main.ts                     # Mount + router setup
      App.utopia                  # Shell layout (header, main, no footer)
      global.css                  # Blog-matching theme (copied + adapted from src/global.css)
      api.ts                      # Fetch wrapper for /api/admin/* endpoints
      pages/
        +page.utopia              # Auth page (passkey login/register)
        posts/
          +page.utopia            # Post list (dashboard)
          new/
            +page.utopia          # New post (editor + form)
          [slug]/
            +page.utopia          # Edit post (editor + form)
      components/
        Editor.utopia             # CodeMirror markdown editor (left pane)
        Preview.utopia            # Live HTML preview (right pane)
        PostForm.utopia           # Frontmatter fields + action buttons
  data/                           # NEW — persisted via Docker volume
    .gitkeep
  Dockerfile                      # MODIFIED — multi-stage: blog + admin + server
  docker-compose.yml              # MODIFIED — volumes for data/ and content/
  content/blog/                   # EXISTING — markdown posts (unchanged)
  src/                            # EXISTING — blog frontend (unchanged)
```

---

## Task 1: Server Project Setup

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/config.ts`
- Create: `server/src/index.ts`

- [ ] **Step 1: Create server/package.json**

```json
{
  "name": "blog-admin-server",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/static": "^8.0.0",
    "@fastify/cookie": "^11.0.0",
    "@fastify/cors": "^10.0.0",
    "@simplewebauthn/server": "^11.0.0",
    "gray-matter": "^4.0.3"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "lib": ["ES2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create server/src/config.ts**

```typescript
import { resolve } from 'node:path'

export const config = {
  port: parseInt(process.env.PORT || '60612', 10),
  host: process.env.HOST || '0.0.0.0',
  distDir: resolve(process.env.DIST_DIR || './dist'),
  distAdminDir: resolve(process.env.DIST_ADMIN_DIR || './dist-admin'),
  contentDir: resolve(process.env.CONTENT_DIR || './content'),
  dataDir: resolve(process.env.DATA_DIR || './data'),
  blogDir: resolve(process.env.BLOG_DIR || './blog'),
  rpId: process.env.RP_ID || 'blog.matthesketh.pro',
  rpName: process.env.RP_NAME || 'Matt Hesketh Blog',
  origin: process.env.ORIGIN || 'https://blog.matthesketh.pro',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  cookieName: 'blog_admin_session',
}
```

- [ ] **Step 4: Create server/src/index.ts — minimal Fastify server with static serving**

```typescript
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import { config } from './config.js'

const app = Fastify({ logger: true })

await app.register(fastifyCookie)

// Serve blog static files
await app.register(fastifyStatic, {
  root: config.distDir,
  prefix: '/',
  decorateReply: false,
})

// Serve admin SPA
await app.register(fastifyStatic, {
  root: config.distAdminDir,
  prefix: '/admin/',
  decorateReply: false,
})

// Admin SPA fallback — all /admin/* routes serve the admin index.html
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/admin')) {
    return reply.sendFile('index.html', config.distAdminDir)
  }
  // Blog SPA fallback
  return reply.sendFile('index.html', config.distDir)
})

try {
  await app.listen({ port: config.port, host: config.host })
  console.log(`Server listening on ${config.host}:${config.port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

export { app }
```

- [ ] **Step 5: Install dependencies and verify the server starts**

```bash
cd server && pnpm install
```

Create placeholder directories so static serving doesn't error:

```bash
mkdir -p ../dist ../dist-admin
echo '<html><body>blog placeholder</body></html>' > ../dist/index.html
echo '<html><body>admin placeholder</body></html>' > ../dist-admin/index.html
```

```bash
pnpm dev
# Expected: "Server listening on 0.0.0.0:60612"
# Ctrl+C to stop
```

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/pnpm-lock.yaml server/tsconfig.json server/src/config.ts server/src/index.ts
git commit -m "feat(admin): scaffold Fastify server with static file serving"
```

---

## Task 2: Session Middleware

**Files:**
- Create: `server/src/session.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Write session tests**

Create `server/src/session.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && pnpm test
# Expected: FAIL — module './session.js' not found
```

- [ ] **Step 3: Create server/src/session.ts**

```typescript
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
  reply.setCookie(config.cookieName, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && pnpm test
# Expected: all 5 tests PASS
```

- [ ] **Step 5: Commit**

```bash
git add server/src/session.ts server/src/session.test.ts
git commit -m "feat(admin): add in-memory session store with cookie helpers"
```

---

## Task 3: Posts API

**Files:**
- Create: `server/src/posts.ts`
- Create: `server/src/posts.test.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Write posts module tests**

Create `server/src/posts.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PostsService } from './posts.js'

const TEST_DIR = join(import.meta.dirname, '../.test-content/blog')

describe('PostsService', () => {
  let posts: PostsService

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    posts = new PostsService(join(import.meta.dirname, '../.test-content'))
  })

  afterEach(() => {
    rmSync(join(import.meta.dirname, '../.test-content'), { recursive: true, force: true })
  })

  it('lists posts from markdown files', async () => {
    writeFileSync(join(TEST_DIR, 'hello.md'), [
      '---',
      'title: "Hello"',
      'description: "A post"',
      'date: 2026-03-21',
      'tags: ["test"]',
      'draft: false',
      '---',
      '',
      'Body text here.',
    ].join('\n'))

    const list = await posts.list()
    expect(list).toHaveLength(1)
    expect(list[0].slug).toBe('hello')
    expect(list[0].title).toBe('Hello')
    expect(list[0].draft).toBe(false)
  })

  it('gets a single post with body', async () => {
    writeFileSync(join(TEST_DIR, 'test-post.md'), [
      '---',
      'title: "Test"',
      'description: "Desc"',
      'date: 2026-03-21',
      'tags: []',
      'draft: true',
      '---',
      '',
      '## Heading',
      '',
      'Some content.',
    ].join('\n'))

    const post = await posts.get('test-post')
    expect(post).not.toBeNull()
    expect(post!.title).toBe('Test')
    expect(post!.body).toContain('## Heading')
    expect(post!.body).toContain('Some content.')
  })

  it('returns null for non-existent post', async () => {
    const post = await posts.get('nope')
    expect(post).toBeNull()
  })

  it('creates a new post', async () => {
    await posts.create({
      slug: 'new-post',
      title: 'New Post',
      description: 'A new one',
      date: '2026-03-28',
      tags: ['test'],
      draft: false,
      body: 'Hello world.',
    })

    const filePath = join(TEST_DIR, 'new-post.md')
    expect(existsSync(filePath)).toBe(true)

    const post = await posts.get('new-post')
    expect(post!.title).toBe('New Post')
    expect(post!.body).toBe('Hello world.')
  })

  it('rejects slugs with path traversal', async () => {
    await expect(posts.create({
      slug: '../evil',
      title: 'Evil',
      description: '',
      date: '2026-03-28',
      tags: [],
      draft: false,
      body: 'pwned',
    })).rejects.toThrow('Invalid slug')
  })

  it('updates an existing post', async () => {
    writeFileSync(join(TEST_DIR, 'existing.md'), [
      '---',
      'title: "Old Title"',
      'description: "Old desc"',
      'date: 2026-03-21',
      'tags: []',
      'draft: true',
      '---',
      '',
      'Old body.',
    ].join('\n'))

    await posts.update('existing', { title: 'New Title', body: 'New body.' })
    const post = await posts.get('existing')
    expect(post!.title).toBe('New Title')
    expect(post!.body).toBe('New body.')
  })

  it('deletes a post', async () => {
    writeFileSync(join(TEST_DIR, 'delete-me.md'), [
      '---',
      'title: "Delete Me"',
      'description: ""',
      'date: 2026-03-28',
      'tags: []',
      'draft: false',
      '---',
      '',
      'Gone.',
    ].join('\n'))

    await posts.delete('delete-me')
    expect(existsSync(join(TEST_DIR, 'delete-me.md'))).toBe(false)
  })

  it('lists posts sorted by date descending', async () => {
    writeFileSync(join(TEST_DIR, 'old.md'), '---\ntitle: "Old"\ndescription: ""\ndate: 2026-01-01\ntags: []\ndraft: false\n---\n\nOld.')
    writeFileSync(join(TEST_DIR, 'new.md'), '---\ntitle: "New"\ndescription: ""\ndate: 2026-03-28\ntags: []\ndraft: false\n---\n\nNew.')

    const list = await posts.list()
    expect(list[0].slug).toBe('new')
    expect(list[1].slug).toBe('old')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && pnpm test
# Expected: FAIL — cannot resolve './posts.js'
```

- [ ] **Step 3: Create server/src/posts.ts**

```typescript
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'

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

export interface CreatePostInput {
  slug: string
  title: string
  description: string
  date: string
  tags: string[]
  draft: boolean
  body: string
}

export interface UpdatePostInput {
  title?: string
  description?: string
  date?: string
  tags?: string[]
  draft?: boolean
  body?: string
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid slug: "${slug}". Must be lowercase alphanumeric with hyphens.`)
  }
}

export class PostsService {
  private blogDir: string

  constructor(contentDir: string) {
    this.blogDir = join(contentDir, 'blog')
  }

  async list(): Promise<PostSummary[]> {
    const files = await readdir(this.blogDir)
    const mdFiles = files.filter((f) => f.endsWith('.md'))

    const posts: PostSummary[] = []
    for (const file of mdFiles) {
      const raw = await readFile(join(this.blogDir, file), 'utf-8')
      const { data } = matter(raw)
      posts.push({
        slug: file.replace(/\.md$/, ''),
        title: data.title || '',
        description: data.description || '',
        date: data.date ? String(data.date instanceof Date ? data.date.toISOString().split('T')[0] : data.date) : '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        draft: Boolean(data.draft),
      })
    }

    posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return posts
  }

  async get(slug: string): Promise<PostFull | null> {
    validateSlug(slug)
    const filePath = join(this.blogDir, `${slug}.md`)
    let raw: string
    try {
      raw = await readFile(filePath, 'utf-8')
    } catch {
      return null
    }
    const { data, content } = matter(raw)
    return {
      slug,
      title: data.title || '',
      description: data.description || '',
      date: data.date ? String(data.date instanceof Date ? data.date.toISOString().split('T')[0] : data.date) : '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      draft: Boolean(data.draft),
      body: content.trim(),
    }
  }

  async create(input: CreatePostInput): Promise<void> {
    validateSlug(input.slug)
    const filePath = join(this.blogDir, `${input.slug}.md`)
    const content = matter.stringify(input.body + '\n', {
      title: input.title,
      description: input.description,
      date: input.date,
      tags: input.tags,
      draft: input.draft,
    })
    await writeFile(filePath, content, 'utf-8')
  }

  async update(slug: string, input: UpdatePostInput): Promise<void> {
    validateSlug(slug)
    const existing = await this.get(slug)
    if (!existing) throw new Error(`Post not found: ${slug}`)

    const merged = {
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      date: input.date ?? existing.date,
      tags: input.tags ?? existing.tags,
      draft: input.draft ?? existing.draft,
    }
    const body = input.body ?? existing.body
    const content = matter.stringify(body + '\n', merged)
    await writeFile(join(this.blogDir, `${slug}.md`), content, 'utf-8')
  }

  async delete(slug: string): Promise<void> {
    validateSlug(slug)
    await unlink(join(this.blogDir, `${slug}.md`))
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && pnpm test
# Expected: all 8 tests PASS
```

- [ ] **Step 5: Register post routes on the Fastify server**

Add to `server/src/index.ts`, before the `setNotFoundHandler` call:

```typescript
import { PostsService } from './posts.js'
import { requireAuth } from './session.js'

const posts = new PostsService(config.contentDir)

// --- Post API routes ---

app.get('/api/admin/posts', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  return posts.list()
})

app.get('/api/admin/posts/:slug', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const { slug } = req.params as { slug: string }
  const post = await posts.get(slug)
  if (!post) return reply.code(404).send({ error: 'Post not found' })
  return post
})

app.post('/api/admin/posts', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const body = req.body as {
    slug: string; title: string; description: string
    date: string; tags: string[]; draft: boolean; body: string
  }
  try {
    await posts.create(body)
    return reply.code(201).send({ ok: true, slug: body.slug })
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})

app.put('/api/admin/posts/:slug', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const { slug } = req.params as { slug: string }
  try {
    await posts.update(slug, req.body as any)
    return { ok: true }
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})

app.delete('/api/admin/posts/:slug', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const { slug } = req.params as { slug: string }
  try {
    await posts.delete(slug)
    return { ok: true }
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})
```

- [ ] **Step 6: Commit**

```bash
git add server/src/posts.ts server/src/posts.test.ts server/src/index.ts
git commit -m "feat(admin): add posts CRUD service with filesystem markdown storage"
```

---

## Task 4: Passkey Auth Routes

**Files:**
- Create: `server/src/auth.ts`
- Create: `server/src/auth.test.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Write auth credential storage tests**

Create `server/src/auth.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && pnpm test -- src/auth.test.ts
# Expected: FAIL — cannot resolve './auth.js'
```

- [ ] **Step 3: Create server/src/auth.ts**

```typescript
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
} from '@simplewebauthn/server'
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
        credentialId: Buffer.from(credential.id).toString('base64url'),
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
        id: Buffer.from(c.credentialId, 'base64url'),
        type: 'public-key' as const,
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
      return reply.code(400).send({ error: 'Unknown credential' })
    }

    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        credential: {
          id: Buffer.from(storedCred.credentialId, 'base64url'),
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && pnpm test
# Expected: all credential store tests PASS
```

- [ ] **Step 5: Register auth routes in server/src/index.ts**

Add these imports and calls to `server/src/index.ts`:

```typescript
import { CredentialStore, registerAuthRoutes } from './auth.js'

const credentialStore = new CredentialStore(config.dataDir)
registerAuthRoutes(app, credentialStore)
```

- [ ] **Step 6: Commit**

```bash
git add server/src/auth.ts server/src/auth.test.ts server/src/index.ts
git commit -m "feat(admin): add WebAuthn passkey auth with credential storage"
```

---

## Task 5: Build Trigger

**Files:**
- Create: `server/src/build.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create server/src/build.ts**

```typescript
import { spawn } from 'node:child_process'
import { config } from './config.js'

interface BuildState {
  status: 'idle' | 'building' | 'success' | 'error'
  startedAt: number | null
  completedAt: number | null
  error: string | null
}

const state: BuildState = {
  status: 'idle',
  startedAt: null,
  completedAt: null,
  error: null,
}

export function getBuildStatus(): BuildState {
  return { ...state }
}

export function triggerBuild(): Promise<BuildState> {
  if (state.status === 'building') {
    return Promise.resolve({ ...state })
  }

  state.status = 'building'
  state.startedAt = Date.now()
  state.completedAt = null
  state.error = null

  return new Promise((resolve) => {
    // Build from blog source dir, output to the dist dir the server serves
    const child = spawn('npx', ['utopia', 'build', '--outDir', config.distDir], {
      cwd: config.blogDir,
      env: { ...process.env },
      stdio: 'pipe',
    })

    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      state.completedAt = Date.now()
      if (code === 0) {
        state.status = 'success'
        state.error = null
      } else {
        state.status = 'error'
        state.error = stderr || `Build exited with code ${code}`
      }
      resolve({ ...state })
    })

    child.on('error', (err) => {
      state.completedAt = Date.now()
      state.status = 'error'
      state.error = err.message
      resolve({ ...state })
    })
  })
}
```

- [ ] **Step 2: Register build routes in server/src/index.ts**

Add to `server/src/index.ts`:

```typescript
import { triggerBuild, getBuildStatus } from './build.js'

app.post('/api/admin/posts/:slug/publish', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const { slug } = req.params as { slug: string }
  try {
    await posts.update(slug, { draft: false })
    const buildResult = await triggerBuild()
    return { ok: true, build: buildResult }
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})

app.post('/api/admin/posts/rebuild', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const buildResult = await triggerBuild()
  return { ok: true, build: buildResult }
})

app.get('/api/admin/build/status', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  return getBuildStatus()
})
```

- [ ] **Step 3: Commit**

```bash
git add server/src/build.ts server/src/index.ts
git commit -m "feat(admin): add build trigger for utopia rebuild on publish"
```

---

## Task 6: Admin App Scaffolding

**Files:**
- Create: `admin/package.json`
- Create: `admin/tsconfig.json`
- Create: `admin/vite.config.ts`
- Create: `admin/index.html`
- Create: `admin/src/main.ts`
- Create: `admin/src/App.utopia`
- Create: `admin/src/global.css`
- Create: `admin/src/api.ts`

- [ ] **Step 1: Create admin/package.json**

```json
{
  "name": "blog-admin",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "utopia dev --port 5174",
    "build": "utopia build",
    "preview": "utopia preview"
  },
  "dependencies": {
    "@matthesketh/utopia-core": "^0.7.0",
    "@matthesketh/utopia-runtime": "^0.7.2",
    "@matthesketh/utopia-router": "^0.7.7",
    "@simplewebauthn/browser": "^11.0.0",
    "codemirror": "^6.0.0",
    "@codemirror/lang-markdown": "^6.0.0",
    "@codemirror/language-data": "^6.0.0",
    "@codemirror/theme-one-dark": "^6.0.0",
    "marked": "^15.0.0"
  },
  "devDependencies": {
    "@matthesketh/utopia-cli": "^0.7.3",
    "@matthesketh/utopia-vite-plugin": "^0.7.2",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create admin/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create admin/vite.config.ts**

```typescript
import { defineConfig } from '@matthesketh/utopia-vite-plugin'

export default defineConfig({
  base: '/admin/',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
})
```

- [ ] **Step 4: Create admin/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin — Matt Hesketh</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="/admin/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Create admin/src/api.ts**

```typescript
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
```

- [ ] **Step 6: Create admin/src/global.css**

Copy the blog's `src/global.css` exactly, then add admin-specific utilities at the end:

```css
:root {
  --font-heading: 'DM Mono', monospace;
  --font-body: 'DM Mono', monospace;

  --color-bg: #ffffff;
  --color-text: #000000;
  --color-text-muted: #333333;
  --color-accent: #000000;
  --color-border: #000000;

  --border-radius-lg: 0px;
  --border-radius-md: 0px;
  --border-radius-sm: 0px;
  --transition-smooth: none;
}

[data-theme="dark"] {
  --color-bg: #000000;
  --color-text: #ffffff;
  --color-text-muted: #cccccc;
  --color-accent: #ffffff;
  --color-border: #ffffff;
}

*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: var(--font-body);
  background-color: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-size: 14px;
  line-height: 1.6;
  overflow-x: hidden;
}

::selection {
  background: var(--color-text);
  color: var(--color-bg);
}

a {
  color: var(--color-text);
}

/* Admin form elements */
input, textarea, select {
  font-family: var(--font-body);
  font-size: 0.9rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
  width: 100%;
}

input:focus, textarea:focus, select:focus {
  border-width: 2px;
}

input::placeholder, textarea::placeholder {
  color: var(--color-text-muted);
}

button {
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.5rem 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 0;
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
}

button:hover {
  background: var(--color-text);
  color: var(--color-bg);
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

button:disabled:hover {
  background: var(--color-bg);
  color: var(--color-text);
}

/* Prose styles for preview pane (same as blog) */
.prose {
  max-width: 72ch;
  line-height: 1.8;
}
.prose h1, .prose h2, .prose h3, .prose h4 {
  font-family: var(--font-heading);
  color: var(--color-text);
  margin: 2rem 0 1rem;
  line-height: 1.3;
}
.prose h2 {
  font-size: 1.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}
.prose h3 {
  font-size: 1.25rem;
}
.prose p {
  margin: 0 0 1.25rem;
}
.prose ul, .prose ol {
  padding-left: 1.5rem;
  margin: 0 0 1.25rem;
}
.prose li {
  margin-bottom: 0.5rem;
}
.prose code {
  font-family: var(--font-body);
  background: var(--color-text);
  color: var(--color-bg);
  padding: 0.15rem 0.4rem;
  font-size: 0.9em;
}
.prose pre {
  background: var(--color-text);
  color: var(--color-bg);
  padding: 1.5rem;
  overflow-x: auto;
  margin: 0 0 1.5rem;
  border: 1px solid var(--color-border);
}
.prose pre code {
  background: none;
  padding: 0;
  font-size: 0.85rem;
}
.prose blockquote {
  border-left: 2px solid var(--color-border);
  margin: 0 0 1.5rem;
  padding: 0.5rem 0 0.5rem 1.5rem;
  color: var(--color-text-muted);
}
.prose img {
  max-width: 100%;
  border: 1px solid var(--color-border);
}
.prose a {
  color: var(--color-text);
  text-decoration: underline;
}
.prose a:hover {
  background: var(--color-text);
  color: var(--color-bg);
}
.prose hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 2rem 0;
}
```

- [ ] **Step 7: Create admin/src/main.ts**

```typescript
import { mount } from '@matthesketh/utopia-runtime'
import { createRouter } from '@matthesketh/utopia-router'
import App from './App.utopia'
import './global.css'

createRouter([
  { path: '/admin', component: () => import('./pages/+page.utopia') },
  { path: '/admin/posts', component: () => import('./pages/posts/+page.utopia') },
  { path: '/admin/posts/new', component: () => import('./pages/posts/new/+page.utopia') },
  { path: '/admin/posts/:slug', component: () => import('./pages/posts/[slug]/+page.utopia') },
])

mount(App, '#app')
```

- [ ] **Step 8: Create admin/src/App.utopia**

```html
<template>
  <div class="admin-container">
    <header class="admin-header">
      <div class="header-inner">
        <a href="/admin/posts" class="site-name">Matt Hesketh <span class="admin-badge">ADMIN</span></a>
        <nav class="admin-nav">
          <a href="/" class="nav-link" target="_blank">View Blog</a>
          <button class="nav-link theme-toggle" @click="toggleTheme">
            {{ isDark() ? 'light' : 'dark' }}
          </button>
          <button class="nav-link" @click="handleLogout" u-if="isAuthed()">Logout</button>
        </nav>
      </div>
    </header>

    <main class="admin-main">
      <RouterView />
    </main>
  </div>
</template>

<script>
import { signal } from '@matthesketh/utopia-core'
import { createRouterView as RouterView, navigate } from '@matthesketh/utopia-router'
import { authApi } from './api'

const isAuthed = signal(false)
const isDark = signal(localStorage.getItem('theme') === 'dark')

if (isDark()) {
  document.documentElement.setAttribute('data-theme', 'dark')
}

// Check auth status on load
authApi.status().then((s) => isAuthed.set(s.authenticated)).catch(() => {})

function toggleTheme() {
  const next = !isDark()
  isDark.set(next)
  document.documentElement.setAttribute('data-theme', next ? 'dark' : '')
  localStorage.setItem('theme', next ? 'dark' : 'light')
}

async function handleLogout() {
  await authApi.logout()
  isAuthed.set(false)
  navigate('/admin')
}
</script>

<style scoped>
.admin-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.admin-header {
  border-bottom: 1px solid var(--color-border);
}
.header-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.site-name {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-text);
  text-decoration: none;
}
.site-name:hover {
  background: var(--color-text);
  color: var(--color-bg);
}
.admin-badge {
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--color-border);
  margin-left: 0.5rem;
  vertical-align: middle;
  letter-spacing: 2px;
}
.site-name:hover .admin-badge {
  border-color: var(--color-bg);
}
.admin-nav {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.nav-link {
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--color-text);
  text-decoration: none;
  font-weight: 600;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.nav-link:hover {
  border-bottom: 1px solid var(--color-border);
}
.theme-toggle {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--color-border) !important;
}
.theme-toggle:hover {
  background: var(--color-text);
  color: var(--color-bg);
}
.admin-main {
  flex: 1;
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  width: 100%;
}
</style>
```

- [ ] **Step 9: Install dependencies and verify admin dev server starts**

```bash
cd admin && pnpm install
pnpm dev
# Expected: dev server on http://localhost:5174/admin/
# Ctrl+C to stop
```

- [ ] **Step 10: Commit**

```bash
git add admin/package.json admin/pnpm-lock.yaml admin/tsconfig.json admin/vite.config.ts admin/index.html admin/src/main.ts admin/src/App.utopia admin/src/global.css admin/src/api.ts
git commit -m "feat(admin): scaffold admin SPA with UtopiaJS, routing, and API client"
```

---

## Task 7: Auth Page

**Files:**
- Create: `admin/src/pages/+page.utopia`

- [ ] **Step 1: Create admin/src/pages/+page.utopia**

```html
<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">{{ isRegistered() ? 'LOGIN' : 'SETUP' }}</h1>

      <div class="auth-status" u-if="loading()">
        <p class="status-text">Checking...</p>
      </div>

      <div class="auth-form" u-if="!loading() && !isRegistered()">
        <p class="auth-desc">No passkey registered. Set up your admin account.</p>
        <input
          type="text"
          class="auth-input"
          placeholder="display name (e.g. Matt)"
          :value="displayName()"
          @input="(e) => displayName.set(e.target.value)"
        />
        <button class="auth-btn" @click="handleRegister" :disabled="!displayName() || busy()">
          {{ busy() ? 'Registering...' : 'Register Passkey' }}
        </button>
      </div>

      <div class="auth-form" u-if="!loading() && isRegistered()">
        <p class="auth-desc">Authenticate with your passkey to continue.</p>
        <button class="auth-btn" @click="handleLogin" :disabled="busy()">
          {{ busy() ? 'Authenticating...' : 'Login with Passkey' }}
        </button>
      </div>

      <p class="auth-error" u-if="error()">{{ error() }}</p>
    </div>
  </div>
</template>

<script>
import { signal } from '@matthesketh/utopia-core'
import { navigate } from '@matthesketh/utopia-router'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { authApi } from '../api'

const loading = signal(true)
const isRegistered = signal(false)
const displayName = signal('')
const busy = signal(false)
const error = signal('')

// Check auth status on mount
authApi.status().then((s) => {
  isRegistered.set(s.registered)
  if (s.authenticated) {
    navigate('/admin/posts')
  }
  loading.set(false)
}).catch((err) => {
  error.set(err.message)
  loading.set(false)
})

async function handleRegister() {
  busy.set(true)
  error.set('')
  try {
    const options = await authApi.registerOptions(displayName())
    const attResp = await startRegistration({ optionsJSON: options })
    await authApi.register(attResp, options.user.id, displayName())
    navigate('/admin/posts')
  } catch (err) {
    error.set(err instanceof Error ? err.message : 'Registration failed')
  } finally {
    busy.set(false)
  }
}

async function handleLogin() {
  busy.set(true)
  error.set('')
  try {
    const options = await authApi.loginOptions()
    const { challengeKey, ...optionsJSON } = options
    const assertionResp = await startAuthentication({ optionsJSON })
    await authApi.login(assertionResp, challengeKey)
    navigate('/admin/posts')
  } catch (err) {
    error.set(err instanceof Error ? err.message : 'Login failed')
  } finally {
    busy.set(false)
  }
}
</script>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}
.auth-card {
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--color-border);
  padding: 2.5rem;
}
.auth-title {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 0 1.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
  text-transform: uppercase;
  letter-spacing: 2px;
}
.auth-desc {
  color: var(--color-text-muted);
  margin: 0 0 1.5rem;
  font-size: 0.9rem;
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.auth-input {
  padding: 0.75rem 1rem;
}
.auth-btn {
  padding: 0.75rem 1.5rem;
  font-weight: 700;
  letter-spacing: 1px;
}
.auth-error {
  color: #c00;
  margin: 1rem 0 0;
  font-size: 0.85rem;
}
.status-text {
  color: var(--color-text-muted);
}
</style>
```

- [ ] **Step 2: Verify the page renders in the admin dev server**

```bash
cd admin && pnpm dev
# Visit http://localhost:5174/admin/ — should show the auth card
# Ctrl+C to stop
```

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/+page.utopia
git commit -m "feat(admin): add passkey auth page with register and login flows"
```

---

## Task 8: Post List Page

**Files:**
- Create: `admin/src/pages/posts/+page.utopia`

- [ ] **Step 1: Create admin/src/pages/posts/+page.utopia**

```html
<template>
  <div class="posts-page">
    <div class="page-header">
      <h1 class="page-title">POSTS</h1>
      <a href="/admin/posts/new" class="new-btn">+ New Post</a>
    </div>

    <div class="search-container">
      <input
        type="text"
        class="search-input"
        placeholder="search posts..."
        :value="query()"
        @input="(e) => query.set(e.target.value)"
      />
    </div>

    <p class="loading-text" u-if="loading()">Loading posts...</p>
    <p class="error-text" u-if="error()">{{ error() }}</p>

    <div class="posts-list" u-if="!loading() && !error()">
      <a
        u-for="post in filteredPosts()"
        :href="'/admin/posts/' + post.slug"
        class="post-row"
      >
        <div class="post-info">
          <span class="post-title">{{ post.title || '(untitled)' }}</span>
          <span class="post-date">{{ formatDate(post.date) }}</span>
        </div>
        <div class="post-meta-row">
          <span :class="'status-pill ' + (post.draft ? 'draft' : 'published')">
            {{ post.draft ? 'DRAFT' : 'PUBLISHED' }}
          </span>
          <span class="post-tags-inline" u-if="post.tags.length > 0">
            {{ post.tags.join(', ') }}
          </span>
        </div>
      </a>

      <p class="no-results" u-if="filteredPosts().length === 0">No posts found.</p>
    </div>
  </div>
</template>

<script>
import { signal, computed } from '@matthesketh/utopia-core'
import { postsApi } from '../../api'

const posts = signal([])
const loading = signal(true)
const error = signal('')
const query = signal('')

postsApi.list().then((data) => {
  posts.set(data)
  loading.set(false)
}).catch((err) => {
  error.set(err.message)
  loading.set(false)
})

const filteredPosts = computed(() => {
  const q = query().toLowerCase().trim()
  const all = posts()
  if (!q) return all
  return all.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
  )
})

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<style scoped>
.posts-page {
  max-width: 800px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}
.page-title {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 2px;
}
.new-btn {
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.5rem 1.25rem;
  border: 1px solid var(--color-border);
  text-decoration: none;
  color: var(--color-text);
}
.new-btn:hover {
  background: var(--color-text);
  color: var(--color-bg);
}
.search-container {
  margin-bottom: 2rem;
}
.search-input {
  width: 100%;
  padding: 0.75rem 1rem;
}
.posts-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.post-row {
  display: block;
  text-decoration: none;
  color: var(--color-text);
  padding: 1.25rem 1rem;
  border: 1px solid var(--color-border);
  border-bottom: none;
}
.post-row:last-child {
  border-bottom: 1px solid var(--color-border);
}
.post-row:hover {
  background: var(--color-text);
  color: var(--color-bg);
}
.post-row:hover .post-date,
.post-row:hover .post-tags-inline,
.post-row:hover .status-pill {
  color: var(--color-bg);
}
.post-row:hover .status-pill {
  border-color: var(--color-bg);
}
.post-info {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 0.4rem;
}
.post-title {
  font-weight: 700;
  font-size: 1rem;
}
.post-date {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.post-meta-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.8rem;
}
.status-pill {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 0.15rem 0.6rem;
  border: 1px solid var(--color-border);
}
.status-pill.draft {
  color: var(--color-text-muted);
}
.status-pill.published {
  color: var(--color-text);
}
.post-tags-inline {
  color: var(--color-text-muted);
}
.no-results {
  color: var(--color-text-muted);
  font-style: italic;
  padding: 1rem;
}
.loading-text, .error-text {
  color: var(--color-text-muted);
}
.error-text {
  color: #c00;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add admin/src/pages/posts/+page.utopia
git commit -m "feat(admin): add post list dashboard with search and status pills"
```

---

## Task 9: Editor and Preview Components

**Files:**
- Create: `admin/src/components/Editor.utopia`
- Create: `admin/src/components/Preview.utopia`

- [ ] **Step 1: Create admin/src/components/Editor.utopia**

This wraps CodeMirror 6 with markdown support, themed to match the blog.

```html
<template>
  <div class="editor-wrapper">
    <div class="editor-toolbar">
      <button class="toolbar-btn" @click="insertMarkdown('**', '**')" title="Bold">B</button>
      <button class="toolbar-btn" @click="insertMarkdown('*', '*')" title="Italic"><em>I</em></button>
      <button class="toolbar-btn" @click="insertLine('## ')" title="H2">H2</button>
      <button class="toolbar-btn" @click="insertLine('### ')" title="H3">H3</button>
      <button class="toolbar-btn" @click="insertMarkdown('`', '`')" title="Inline code">&lt;/&gt;</button>
      <button class="toolbar-btn" @click="insertCodeBlock()" title="Code block">```</button>
      <button class="toolbar-btn" @click="insertMarkdown('[', '](url)')" title="Link">Link</button>
      <button class="toolbar-btn" @click="insertLine('> ')" title="Blockquote">"</button>
      <button class="toolbar-btn" @click="insertLine('- ')" title="List">-</button>
      <button class="toolbar-btn" @click="insertLine('1. ')" title="Ordered list">1.</button>
      <button class="toolbar-btn" @click="insertLine('---')" title="Horizontal rule">---</button>
    </div>
    <div id="cm-editor" class="editor-container"></div>
  </div>
</template>

<script>
import { onMount, onDestroy } from '@matthesketh/utopia-runtime'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching } from '@codemirror/language'

// Props received from parent: initialValue (string), onChange (fn)
export let initialValue = ''
export let onChange = (_value) => {}

let view = null

const blogTheme = EditorView.theme({
  '&': {
    fontFamily: "'DM Mono', monospace",
    fontSize: '14px',
    lineHeight: '1.6',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
    height: '100%',
  },
  '.cm-content': {
    padding: '1rem',
    caretColor: 'var(--color-text)',
    fontFamily: "'DM Mono', monospace",
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--color-text)',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--color-text)',
    color: 'var(--color-bg)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text-muted)',
    border: 'none',
    borderRight: '1px solid var(--color-border)',
    fontFamily: "'DM Mono', monospace",
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '&.cm-focused': {
    outline: 'none',
  },
}, { dark: false })

onMount(() => {
  const container = document.getElementById('cm-editor')
  if (!container) return

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      onChange(update.state.doc.toString())
    }
  })

  view = new EditorView({
    state: EditorState.create({
      doc: initialValue,
      extensions: [
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        bracketMatching(),
        markdown({ codeLanguages: languages }),
        blogTheme,
        updateListener,
        cmPlaceholder('Start writing...'),
        EditorView.lineWrapping,
      ],
    }),
    parent: container,
  })
})

onDestroy(() => {
  if (view) {
    view.destroy()
    view = null
  }
})

function insertMarkdown(before, after) {
  if (!view) return
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  view.dispatch({
    changes: { from, to, insert: before + selected + after },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  })
  view.focus()
}

function insertLine(prefix) {
  if (!view) return
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
  })
  view.focus()
}

function insertCodeBlock() {
  if (!view) return
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  const block = '```\n' + selected + '\n```'
  view.dispatch({
    changes: { from, to, insert: block },
    selection: { anchor: from + 4 },
  })
  view.focus()
}
</script>

<style scoped>
.editor-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--color-border);
}
.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  padding: 0.25rem;
}
.toolbar-btn {
  font-family: var(--font-body);
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
  border: none;
  background: none;
  color: var(--color-text);
  cursor: pointer;
}
.toolbar-btn:hover {
  background: var(--color-text);
  color: var(--color-bg);
}
.editor-container {
  flex: 1;
  overflow: auto;
}
</style>
```

- [ ] **Step 2: Create admin/src/components/Preview.utopia**

```html
<template>
  <div class="preview-wrapper">
    <div class="preview-header">
      <span class="preview-label">PREVIEW</span>
    </div>
    <div class="preview-content prose" u-html="html()"></div>
  </div>
</template>

<script>
import { computed } from '@matthesketh/utopia-core'
import { marked } from 'marked'

export let markdown = () => ''

// Configure marked for GFM
marked.setOptions({
  gfm: true,
  breaks: false,
})

const html = computed(() => {
  const md = typeof markdown === 'function' ? markdown() : markdown
  if (!md) return '<p style="color: var(--color-text-muted); font-style: italic;">Start writing to see a preview...</p>'
  try {
    return marked.parse(md)
  } catch {
    return '<p style="color: #c00;">Preview error</p>'
  }
})
</script>

<style scoped>
.preview-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--color-border);
  overflow: hidden;
}
.preview-header {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--color-border);
}
.preview-label {
  font-family: var(--font-heading);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--color-text-muted);
}
.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}
</style>
```

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/Editor.utopia admin/src/components/Preview.utopia
git commit -m "feat(admin): add CodeMirror markdown editor and live preview components"
```

---

## Task 10: Post Form Component

**Files:**
- Create: `admin/src/components/PostForm.utopia`

- [ ] **Step 1: Create admin/src/components/PostForm.utopia**

This handles frontmatter fields + the split-pane editor layout + action buttons. Used by both new and edit pages.

```html
<template>
  <div class="post-form">
    <div class="form-header">
      <a href="/admin/posts" class="back-link">&larr; Posts</a>
      <div class="form-actions">
        <button class="action-btn" @click="handleSaveDraft" :disabled="saving()">
          {{ saving() ? 'Saving...' : 'Save Draft' }}
        </button>
        <button class="action-btn publish-btn" @click="handlePublish" :disabled="saving()">
          {{ saving() ? 'Publishing...' : 'Publish' }}
        </button>
        <button class="action-btn delete-btn" @click="handleDelete" u-if="isEditing" :disabled="saving()">
          Delete
        </button>
      </div>
    </div>

    <p class="form-error" u-if="formError()">{{ formError() }}</p>
    <p class="form-success" u-if="formSuccess()">{{ formSuccess() }}</p>

    <div class="meta-fields">
      <div class="field-row">
        <div class="field">
          <label class="field-label">Title</label>
          <input type="text" :value="title()" @input="(e) => title.set(e.target.value)" placeholder="Post title" />
        </div>
        <div class="field field-sm">
          <label class="field-label">Slug</label>
          <input type="text" :value="slug()" @input="(e) => slug.set(e.target.value)" placeholder="post-slug" :disabled="isEditing" />
        </div>
      </div>
      <div class="field">
        <label class="field-label">Description</label>
        <input type="text" :value="description()" @input="(e) => description.set(e.target.value)" placeholder="Short description" />
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Tags</label>
          <input type="text" :value="tags()" @input="(e) => tags.set(e.target.value)" placeholder="tag1, tag2, tag3" />
        </div>
        <div class="field field-sm">
          <label class="field-label">Date</label>
          <input type="date" :value="date()" @input="(e) => date.set(e.target.value)" />
        </div>
      </div>
    </div>

    <div class="editor-split">
      <div class="editor-pane">
        <Editor :initialValue="body()" :onChange="onBodyChange" />
      </div>
      <div class="preview-pane">
        <Preview :markdown="body" />
      </div>
    </div>
  </div>
</template>

<script>
import { signal } from '@matthesketh/utopia-core'
import { navigate } from '@matthesketh/utopia-router'
import Editor from './Editor.utopia'
import Preview from './Preview.utopia'
import { postsApi } from '../api'

// Props from parent
export let isEditing = false
export let initialData = null // { slug, title, description, date, tags, draft, body }

const title = signal(initialData?.title || '')
const slug = signal(initialData?.slug || '')
const description = signal(initialData?.description || '')
const date = signal(initialData?.date || new Date().toISOString().split('T')[0])
const tags = signal(initialData?.tags?.join(', ') || '')
const body = signal(initialData?.body || '')
const saving = signal(false)
const formError = signal('')
const formSuccess = signal('')

function onBodyChange(value) {
  body.set(value)
}

function getPostData(draft) {
  return {
    slug: slug(),
    title: title(),
    description: description(),
    date: date(),
    tags: tags().split(',').map((t) => t.trim()).filter(Boolean),
    draft,
    body: body(),
  }
}

async function handleSaveDraft() {
  saving.set(true)
  formError.set('')
  formSuccess.set('')
  try {
    const data = getPostData(true)
    if (isEditing) {
      await postsApi.update(data.slug, data)
    } else {
      await postsApi.create(data)
    }
    formSuccess.set('Draft saved.')
    if (!isEditing) {
      navigate('/admin/posts/' + data.slug)
    }
  } catch (err) {
    formError.set(err instanceof Error ? err.message : 'Save failed')
  } finally {
    saving.set(false)
  }
}

async function handlePublish() {
  saving.set(true)
  formError.set('')
  formSuccess.set('')
  try {
    const data = getPostData(false)
    if (isEditing) {
      await postsApi.update(data.slug, data)
      await postsApi.publish(data.slug)
    } else {
      await postsApi.create(data)
      await postsApi.publish(data.slug)
    }
    formSuccess.set('Published! Blog is rebuilding...')
  } catch (err) {
    formError.set(err instanceof Error ? err.message : 'Publish failed')
  } finally {
    saving.set(false)
  }
}

async function handleDelete() {
  if (!confirm('Delete this post? This cannot be undone.')) return
  saving.set(true)
  formError.set('')
  try {
    await postsApi.delete(slug())
    navigate('/admin/posts')
  } catch (err) {
    formError.set(err instanceof Error ? err.message : 'Delete failed')
    saving.set(false)
  }
}
</script>

<style scoped>
.post-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: calc(100vh - 120px);
}
.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.back-link {
  font-size: 0.9rem;
  color: var(--color-text);
  text-decoration: none;
  font-weight: 600;
}
.back-link:hover {
  border-bottom: 1px solid var(--color-border);
}
.form-actions {
  display: flex;
  gap: 0.5rem;
}
.action-btn {
  font-size: 0.8rem;
  padding: 0.5rem 1rem;
}
.publish-btn {
  font-weight: 700;
}
.delete-btn {
  color: #c00;
  border-color: #c00;
}
.delete-btn:hover {
  background: #c00;
  color: #fff;
}
.form-error {
  color: #c00;
  font-size: 0.85rem;
  margin: 0;
}
.form-success {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin: 0;
}
.meta-fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.field-row {
  display: flex;
  gap: 0.75rem;
}
.field {
  flex: 1;
}
.field-sm {
  flex: 0 0 200px;
}
.field-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 0.3rem;
  color: var(--color-text-muted);
}
.editor-split {
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}
.editor-pane {
  flex: 1;
  min-width: 0;
}
.preview-pane {
  flex: 1;
  min-width: 0;
}

@media (max-width: 900px) {
  .editor-split {
    flex-direction: column;
  }
  .field-row {
    flex-direction: column;
  }
  .field-sm {
    flex: 1;
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add admin/src/components/PostForm.utopia
git commit -m "feat(admin): add PostForm component with frontmatter fields and split-pane layout"
```

---

## Task 11: New Post and Edit Post Pages

**Files:**
- Create: `admin/src/pages/posts/new/+page.utopia`
- Create: `admin/src/pages/posts/[slug]/+page.utopia`

- [ ] **Step 1: Create admin/src/pages/posts/new/+page.utopia**

```html
<template>
  <PostForm />
</template>

<script>
import { useHead } from '@matthesketh/utopia-runtime'
import PostForm from '../../../components/PostForm.utopia'

useHead({ title: 'New Post — Admin' })
</script>
```

- [ ] **Step 2: Create admin/src/pages/posts/[slug]/+page.utopia**

```html
<template>
  <div u-if="loading()">
    <p class="loading-text">Loading post...</p>
  </div>
  <div u-if="error()">
    <p class="error-text">{{ error() }}</p>
    <a href="/admin/posts" class="back-link">&larr; Back to posts</a>
  </div>
  <PostForm u-if="post()" :isEditing="true" :initialData="post()" />
</template>

<script>
import { signal, computed } from '@matthesketh/utopia-core'
import { currentRoute } from '@matthesketh/utopia-router'
import { useHead } from '@matthesketh/utopia-runtime'
import PostForm from '../../../../components/PostForm.utopia'
import { postsApi } from '../../../../api'

const loading = signal(true)
const error = signal('')
const post = signal(null)

const slug = computed(() => {
  const route = currentRoute()
  return route ? route.params.slug : ''
})

// Fetch post data
const currentSlug = slug()
if (currentSlug) {
  postsApi.get(currentSlug).then((data) => {
    post.set(data)
    useHead({ title: `Edit: ${data.title} — Admin` })
    loading.set(false)
  }).catch((err) => {
    error.set(err.message)
    loading.set(false)
  })
} else {
  error.set('No slug provided')
  loading.set(false)
}
</script>

<style scoped>
.loading-text {
  color: var(--color-text-muted);
}
.error-text {
  color: #c00;
  margin-bottom: 1rem;
}
.back-link {
  color: var(--color-text);
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px solid var(--color-border);
}
</style>
```

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/posts/new/+page.utopia admin/src/pages/posts/\[slug\]/+page.utopia
git commit -m "feat(admin): add new post and edit post pages"
```

---

## Task 12: CORS for Development

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add CORS support for dev mode**

In development, the admin runs on port 5174 and the server on 60612. Add CORS to `server/src/index.ts`:

```typescript
import fastifyCors from '@fastify/cors'

// Register CORS (allows admin dev server to reach API)
await app.register(fastifyCors, {
  origin: process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:5174', 'http://localhost:5173'],
  credentials: true,
})
```

Also update the session cookie for dev mode in `server/src/session.ts` — change `setSessionCookie`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add server/src/index.ts server/src/session.ts
git commit -m "feat(admin): add CORS support for local development"
```

---

## Task 13: Data Directory and Gitkeep

**Files:**
- Create: `data/.gitkeep`

- [ ] **Step 1: Create data directory**

```bash
mkdir -p data
touch data/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add data/.gitkeep
git commit -m "chore: add data directory for credential storage"
```

---

## Task 14: Dockerfile and Docker Compose

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Rewrite the Dockerfile**

Replace the existing Dockerfile with a multi-stage build:

```dockerfile
# --- Stage 1: Build blog static output ---
FROM node:20-alpine AS blog-builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY src/ ./src/
COPY public/ ./public/
COPY content/ ./content/
COPY index.html vite.config.ts tsconfig.json ./
RUN pnpm build

# --- Stage 2: Build admin SPA ---
FROM node:20-alpine AS admin-builder
WORKDIR /app
RUN corepack enable
COPY admin/package.json admin/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY admin/src/ ./src/
COPY admin/index.html admin/vite.config.ts admin/tsconfig.json ./
RUN pnpm build

# --- Stage 3: Build server ---
FROM node:20-alpine AS server-builder
WORKDIR /app
RUN corepack enable
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/src/ ./src/
COPY server/tsconfig.json ./
RUN pnpm build

# --- Stage 4: Runtime ---
FROM node:20-alpine
WORKDIR /app
RUN corepack enable

# Server runtime deps
COPY server/package.json server/pnpm-lock.yaml ./server/
RUN cd server && pnpm install --frozen-lockfile --prod

# Server compiled output
COPY --from=server-builder /app/dist ./server/dist/

# Blog static output (initial build, may be overwritten by volume)
COPY --from=blog-builder /app/dist ./dist/

# Admin static output
COPY --from=admin-builder /app/dist ./dist-admin/

# Blog source + deps for in-container rebuilds
COPY package.json pnpm-lock.yaml ./blog/
RUN cd blog && pnpm install --frozen-lockfile
COPY src/ ./blog/src/
COPY public/ ./blog/public/
COPY content/ ./blog/content/
COPY index.html vite.config.ts tsconfig.json ./blog/

# Data directory for credentials
RUN mkdir -p data

ENV NODE_ENV=production
ENV PORT=60612
ENV DIST_DIR=/app/dist
ENV DIST_ADMIN_DIR=/app/dist-admin
ENV CONTENT_DIR=/app/blog/content
ENV DATA_DIR=/app/data
ENV BLOG_DIR=/app/blog

EXPOSE 60612

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:60612/ || exit 1

USER node
CMD ["node", "server/dist/index.js"]
```

- [ ] **Step 2: Update docker-compose.yml**

```yaml
services:
  blog-matthesketh-pro:
    build:
      context: .
    container_name: blog-matthesketh-pro
    ports:
      - "127.0.0.1:60612:60612"
    volumes:
      - blog-data:/app/data
      - blog-content:/app/blog/content
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 512M

volumes:
  blog-data:
  blog-content:
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat(admin): update Dockerfile and compose for Fastify server with admin panel"
```

---

## Task 15: Final Server Index Assembly

**Files:**
- Rewrite: `server/src/index.ts` (final version with all routes registered)

- [ ] **Step 1: Write the final server/src/index.ts**

Assemble the complete server entry point with all imports and route registrations in the correct order:

```typescript
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import { config } from './config.js'
import { PostsService } from './posts.js'
import { CredentialStore, registerAuthRoutes } from './auth.js'
import { requireAuth } from './session.js'
import { triggerBuild, getBuildStatus } from './build.js'

const app = Fastify({ logger: true })

// --- Plugins ---
await app.register(fastifyCookie)
await app.register(fastifyCors, {
  origin: process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:5174', 'http://localhost:5173'],
  credentials: true,
})

// --- Services ---
const posts = new PostsService(config.contentDir)
const credentialStore = new CredentialStore(config.dataDir)

// --- Auth routes ---
registerAuthRoutes(app, credentialStore)

// --- Post CRUD routes ---
app.get('/api/admin/posts', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  return posts.list()
})

app.get('/api/admin/posts/:slug', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const { slug } = req.params as { slug: string }
  const post = await posts.get(slug)
  if (!post) return reply.code(404).send({ error: 'Post not found' })
  return post
})

app.post('/api/admin/posts', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const body = req.body as {
    slug: string; title: string; description: string
    date: string; tags: string[]; draft: boolean; body: string
  }
  try {
    await posts.create(body)
    return reply.code(201).send({ ok: true, slug: body.slug })
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})

app.put('/api/admin/posts/:slug', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const { slug } = req.params as { slug: string }
  try {
    await posts.update(slug, req.body as any)
    return { ok: true }
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})

app.delete('/api/admin/posts/:slug', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const { slug } = req.params as { slug: string }
  try {
    await posts.delete(slug)
    return { ok: true }
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})

// --- Publish + rebuild routes ---
app.post('/api/admin/posts/:slug/publish', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const { slug } = req.params as { slug: string }
  try {
    await posts.update(slug, { draft: false })
    const buildResult = await triggerBuild()
    return { ok: true, build: buildResult }
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})

app.post('/api/admin/posts/rebuild', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  const buildResult = await triggerBuild()
  return { ok: true, build: buildResult }
})

app.get('/api/admin/build/status', async (req, reply) => {
  if (!requireAuth(req, reply)) return
  return getBuildStatus()
})

// --- Static file serving ---
await app.register(fastifyStatic, {
  root: config.distDir,
  prefix: '/',
  decorateReply: false,
})

await app.register(fastifyStatic, {
  root: config.distAdminDir,
  prefix: '/admin/',
  decorateReply: false,
})

// --- SPA fallbacks ---
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/admin')) {
    return reply.sendFile('index.html', config.distAdminDir)
  }
  return reply.sendFile('index.html', config.distDir)
})

// --- Start ---
try {
  await app.listen({ port: config.port, host: config.host })
  console.log(`Server listening on ${config.host}:${config.port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

export { app }
```

- [ ] **Step 2: Run server tests**

```bash
cd server && pnpm test
# Expected: all tests PASS
```

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(admin): assemble final server entry point with all routes"
```

---

## Task 16: End-to-End Smoke Test

- [ ] **Step 1: Start the server in dev mode**

```bash
cd server && mkdir -p ../data
NODE_ENV=development pnpm dev
```

- [ ] **Step 2: Verify API endpoints respond**

In another terminal:

```bash
# Auth status (should work without auth)
curl -s http://localhost:60612/api/admin/auth/status | jq
# Expected: { "registered": false, "authenticated": false }

# Posts list (should require auth)
curl -s http://localhost:60612/api/admin/posts
# Expected: 401 response
```

- [ ] **Step 3: Start admin dev server**

```bash
cd admin && pnpm dev
# Visit http://localhost:5174/admin/ in browser
# Should see the SETUP page (no passkey registered yet)
```

- [ ] **Step 4: Test passkey registration flow in browser**

1. Enter display name, click "Register Passkey"
2. Browser prompts for passkey creation
3. Should redirect to `/admin/posts`
4. Post list should show existing posts from `content/blog/`

- [ ] **Step 5: Test creating a new post**

1. Click "+ New Post"
2. Fill in title, slug, description, tags, date
3. Write some markdown in the editor
4. Verify preview updates in real-time
5. Click "Save Draft"
6. Verify the markdown file was created in `content/blog/`

- [ ] **Step 6: Document any issues found and fix them**

---

## Development Workflow Reference

For local development, run these in separate terminals:

```bash
# Terminal 1: API server
cd server && NODE_ENV=development pnpm dev

# Terminal 2: Admin SPA (hot reload)
cd admin && pnpm dev

# Terminal 3: Blog (if needed for testing blog output)
pnpm dev
```

The admin SPA at `http://localhost:5174/admin/` calls the API at `http://localhost:60612/api/admin/*` via CORS.

For production (Docker), a single `docker compose up --build` builds everything and runs the Fastify server which serves both the blog and admin from one container.
