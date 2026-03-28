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
