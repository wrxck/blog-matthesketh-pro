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

  // public origin of the reader-facing blog (NOT the admin host) — used for
  // stripe success/cancel/return urls and magic-link urls.
  publicUrl: process.env.PUBLIC_URL || 'https://blog.matthesketh.pro',

  // ad-free subscription (all dormant until set; every code path no-ops when the
  // relevant secret is empty, so the blog runs unchanged before stripe is wired).
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripePriceId: process.env.STRIPE_PRICE_ID || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  // one secret, domain-separated, signs both the ad-free cookie and the
  // magic-link token (stateless hmac — no extra session table).
  adfreeSecret: process.env.ADFREE_SECRET || '',
  // generic smtp for the magic-link email; empty => email sending is disabled
  // (the subscribing device is still made ad-free directly from checkout).
  smtpUrl: process.env.SMTP_URL || '',
  mailFrom: process.env.MAIL_FROM || 'Matt Hesketh <hello@matthesketh.pro>',
  adfreeCookieName: 'blog_adfree',
}
