import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import { config } from './config.js'
import { PostsService } from './posts.js'
import { CredentialStore, registerAuthRoutes } from './auth.js'
import { requireAuth, initSessionStore } from './session.js'
import { triggerBuild, getBuildStatus } from './build.js'
import { db, SESSION_MIGRATION, POSTS_MIGRATION } from './db.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const app = Fastify({ logger: true })

// --- Plugins ---
await app.register(fastifyCookie)
await app.register(fastifyCors, {
  origin: process.env.NODE_ENV === 'production'
    ? [`https://${config.adminHost}`]
    : ['http://localhost:5174', 'http://localhost:5173'],
  credentials: true,
})

// --- Services ---
const posts = new PostsService(db)
const credentialStore = new CredentialStore(config.dataDir)

// --- db + session init ---
await db.connect()
await db.migrate([SESSION_MIGRATION, POSTS_MIGRATION])
initSessionStore(db)

// --- auth routes ---
registerAuthRoutes(app, credentialStore)

// --- Post CRUD routes ---
app.get('/api/admin/posts', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return reply.code(401).send({ error: 'Unauthorized' })
  return posts.list()
})

app.get('/api/admin/posts/:id', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return reply.code(401).send({ error: 'Unauthorized' })
  const { id } = req.params as { id: string }
  const slug = await posts.getSlugById(id)
  if (!slug) return reply.code(404).send({ error: 'Post not found' })
  const post = await posts.get(slug)
  if (!post) return reply.code(404).send({ error: 'Post not found' })
  return post
})

app.post('/api/admin/posts', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return reply.code(401).send({ error: 'Unauthorized' })
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

app.put('/api/admin/posts/:id', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return reply.code(401).send({ error: 'Unauthorized' })
  const { id } = req.params as { id: string }
  const slug = await posts.getSlugById(id)
  if (!slug) return reply.code(404).send({ error: 'Post not found' })
  try {
    await posts.update(slug, req.body as any)
    return { ok: true }
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})

app.delete('/api/admin/posts/:id', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return reply.code(401).send({ error: 'Unauthorized' })
  const { id } = req.params as { id: string }
  const slug = await posts.getSlugById(id)
  if (!slug) return reply.code(404).send({ error: 'Post not found' })
  try {
    await posts.delete(slug)
    return { ok: true }
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})

// --- Publish + rebuild routes ---
app.post('/api/admin/posts/:id/publish', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return reply.code(401).send({ error: 'Unauthorized' })
  const { id } = req.params as { id: string }
  const slug = await posts.getSlugById(id)
  if (!slug) return reply.code(404).send({ error: 'Post not found' })
  try {
    await posts.update(slug, { draft: false })
    const buildResult = await triggerBuild(posts)
    return { ok: true, build: buildResult }
  } catch (err: any) {
    return reply.code(400).send({ error: err.message })
  }
})

app.post('/api/admin/posts/rebuild', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return reply.code(401).send({ error: 'Unauthorized' })
  const buildResult = await triggerBuild(posts)
  return { ok: true, build: buildResult }
})

// --- Public API endpoints (no auth required) ---
app.get('/api/posts', async (_req, reply) => {
  const allPosts = await posts.list()
  // Only return published (non-draft) posts for public API
  const publishedPosts = allPosts.filter((p) => !p.draft)
  return publishedPosts
})

app.get('/api/posts/:slug', async (req, reply) => {
  const { slug } = req.params as { slug: string }
  const post = await posts.get(slug)
  if (!post) return reply.code(404).send({ error: 'Post not found' })
  if (post.draft) return reply.code(404).send({ error: 'Post not found' })
  return post
})

app.get('/api/admin/build/status', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return reply.code(401).send({ error: 'Unauthorized' })
  return getBuildStatus()
})

// --- Static file serving ---
await app.register(fastifyStatic, {
  root: config.distDir,
  prefix: '/',
  decorateReply: true,
})

// Host-based routing: serve admin assets for admin subdomain
app.addHook('onRequest', async (req, reply) => {
  if (req.hostname !== config.adminHost) return
  if (req.url.startsWith('/api/') || req.url.startsWith('/.well-known/')) return
  const urlPath = req.url.split('?')[0]
  if (urlPath === '/' || urlPath === '') {
    return reply.sendFile('index.html', config.distAdminDir)
  }
  const filePath = join(config.distAdminDir, urlPath)
  if (existsSync(filePath)) {
    return reply.sendFile(urlPath, config.distAdminDir)
  }
  // SPA fallback for admin routes
  return reply.sendFile('index.html', config.distAdminDir)
})

// --- Blog SPA fallback ---
app.setNotFoundHandler((req, reply) => {
  return reply.sendFile('index.html', config.distDir)
})

// --- start ---
try {
  await app.listen({ port: config.port, host: config.host })
  app.log.info(`server listening on ${config.host}:${config.port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

setInterval(() => {
  import('./session.js').then(({ sessionStore }) => {
    sessionStore.cleanup().catch((err: unknown) => app.log.error(err, 'session cleanup failed'))
  })
}, 60 * 60 * 1000)

export { app }
