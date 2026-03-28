import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCookie from '@fastify/cookie'
import { config } from './config.js'
import { PostsService } from './posts.js'
import { requireAuth } from './session.js'

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
