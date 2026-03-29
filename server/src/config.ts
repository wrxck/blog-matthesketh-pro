import { resolve } from 'node:path'

export const config = {
  port: parseInt(process.env.PORT || '60612', 10),
  host: process.env.HOST || '0.0.0.0',
  distDir: resolve(process.env.DIST_DIR || './dist'),
  distAdminDir: resolve(process.env.DIST_ADMIN_DIR || './dist-admin'),
  contentDir: resolve(process.env.CONTENT_DIR || './content'),
  dataDir: resolve(process.env.DATA_DIR || './data'),
  blogDir: resolve(process.env.BLOG_DIR || './blog'),
  rpId: process.env.RP_ID || 'localhost',
  rpName: process.env.RP_NAME || 'Blog Admin',
  origin: process.env.ORIGIN || 'http://admin.localhost',
  adminHost: process.env.ADMIN_HOST || 'admin.localhost',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  cookieName: 'blog_admin_session',
}
