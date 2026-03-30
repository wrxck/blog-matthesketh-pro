export const config = {
  // Meta (used in index.html)
  name: 'Matt Hesketh',
  title: 'Matt Hesketh — Blog',
  description: 'Software engineering, infrastructure, and web development.',
  locale: 'en_GB',
  themeColor: '#ffffff',
  url: 'https://blog.matthesketh.pro',

  // Author info (structured data and feeds)
  author: {
    name: 'Matt Hesketh',
    url: 'https://matthesketh.pro',
  },

  // Navigation links in header/footer
  nav: {
    cv: 'https://cv.matthesketh.pro',
    github: 'https://github.com/wrxck',
  },

  // Admin panel config (for WebAuthn authentication)
  admin: {
    hostname: 'admin.matthesketh.pro',
    rpId: 'matthesketh.pro',
    origin: 'https://admin.matthesketh.pro',
  },
}
