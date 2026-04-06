import { existsSync } from 'node:fs'
import { join } from 'node:path'

import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'

import { config } from './config.js'
import { PostsService } from './posts.js'
import { CredentialStore, registerAuthRoutes } from './auth.js'
import { requireAuth, initSessionStore, sessionStore } from './session.js'
import { triggerBuild, getBuildStatus } from './build.js'
import { db, SESSION_MIGRATION } from './db.js'

const app = Fastify({ logger: true })

// plugins
await app.register(fastifyCookie)
await app.register(fastifyCors, {
  origin: process.env.NODE_ENV === 'production'
    ? [`https://${config.adminHost}`]
    : ['http://localhost:5174', 'http://localhost:5173'],
  credentials: true,
})

// database + session init
await db.connect()
await db.migrate([SESSION_MIGRATION])
initSessionStore(db)

// services
const posts = new PostsService(config.contentDir, config.dataDir)
const credentialStore = new CredentialStore(config.dataDir)

// auth routes
registerAuthRoutes(app, credentialStore)

// post crud routes
app.get('/api/admin/posts', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return
  return posts.list()
})

app.get('/api/admin/posts/:id', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return
  const { id } = req.params as { id: string }
  const slug = await posts.getSlugById(id)
  if (!slug) return reply.code(404).send({ error: 'Post not found' })
  const post = await posts.get(slug)
  if (!post) return reply.code(404).send({ error: 'Post not found' })
  return post
})

app.post('/api/admin/posts', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return
  const body = req.body as {
    slug: string; title: string; description: string
    date: string; tags: string[]; draft: boolean; body: string
  }
  try {
    await posts.create(body)
    return reply.code(201).send({ ok: true, slug: body.slug })
  } catch (err: unknown) {
    return reply.code(400).send({ error: (err as Error).message })
  }
})

app.put('/api/admin/posts/:id', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return
  const { id } = req.params as { id: string }
  const slug = await posts.getSlugById(id)
  if (!slug) return reply.code(404).send({ error: 'Post not found' })
  try {
    await posts.update(slug, req.body as Record<string, unknown>)
    return { ok: true }
  } catch (err: unknown) {
    return reply.code(400).send({ error: (err as Error).message })
  }
})

app.delete('/api/admin/posts/:id', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return
  const { id } = req.params as { id: string }
  const slug = await posts.getSlugById(id)
  if (!slug) return reply.code(404).send({ error: 'Post not found' })
  try {
    await posts.delete(slug)
    return { ok: true }
  } catch (err: unknown) {
    return reply.code(400).send({ error: (err as Error).message })
  }
})

// publish + rebuild routes
app.post('/api/admin/posts/:id/publish', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return
  const { id } = req.params as { id: string }
  const slug = await posts.getSlugById(id)
  if (!slug) return reply.code(404).send({ error: 'Post not found' })
  try {
    await posts.update(slug, { draft: false })
    const buildResult = await triggerBuild()
    return { ok: true, build: buildResult }
  } catch (err: unknown) {
    return reply.code(400).send({ error: (err as Error).message })
  }
})

app.post('/api/admin/posts/rebuild', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return
  const buildResult = await triggerBuild()
  return { ok: true, build: buildResult }
})

app.get('/api/admin/build/status', async (req, reply) => {
  if (!(await requireAuth(req, reply))) return
  return getBuildStatus()
})

// static file serving
await app.register(fastifyStatic, {
  root: config.distDir,
  prefix: '/',
  decorateReply: true,
})

// host-based routing: serve admin assets for admin subdomain
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
  return reply.sendFile('index.html', config.distAdminDir)
})

// blog spa fallback
app.setNotFoundHandler((req, reply) => {
  return reply.sendFile('index.html', config.distDir)
})

// start
try {
  await app.listen({ port: config.port, host: config.host })
  app.log.info(`server listening on ${config.host}:${config.port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// cleanup expired sessions every hour
setInterval(() => {
  sessionStore.cleanup().catch((err: unknown) => app.log.error(err, 'session cleanup failed'))
}, 60 * 60 * 1000)

export { app }
