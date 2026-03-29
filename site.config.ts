export const config = {
  // Meta (used in index.html)
  name: 'Your Name',
  title: 'Your Blog Title',
  description: 'What your blog is about.',
  locale: 'en_GB',
  themeColor: '#ffffff',
  url: 'https://blog.yourdomain.com',

  // Author info (structured data and feeds)
  author: {
    name: 'Your Name',
    url: 'https://yourdomain.com',
  },

  // Navigation links in header/footer
  nav: {
    cv: 'https://cv.yourdomain.com',
    github: 'https://github.com/yourusername',
  },

  // Admin panel config (for WebAuthn authentication)
  admin: {
    hostname: 'admin.yourdomain.com',
    rpId: 'yourdomain.com',
    origin: 'https://admin.yourdomain.com',
  },
}
