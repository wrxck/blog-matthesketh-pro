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

  // tech display ads (google adsense). the client + slot are public — they ship
  // in the client bundle. empty means no ads render (the integration is dormant).
  ads: {
    adsenseClient: 'ca-pub-9199227429999584',
    adsenseSlot: '', // a display ad-unit id created in adsense
  },

  // "go ad-free" subscription. price is display-only copy for the /adfree page;
  // the real charge is the stripe price configured server-side.
  adfree: {
    price: '£3/month',
  },
}
