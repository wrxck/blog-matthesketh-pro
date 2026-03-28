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
