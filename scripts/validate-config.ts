import { config } from '../site.config.js'

const PLACEHOLDERS = ['Your Name', 'Your Blog Title', 'yourdomain.com', 'yourusername']
const errors: string[] = []

function check(path: string, value: unknown) {
  if (value === undefined || value === null || value === '') {
    errors.push(`'${path}' is empty`)
    return
  }
  if (typeof value === 'string') {
    for (const p of PLACEHOLDERS) {
      if (value.toLowerCase().includes(p.toLowerCase())) {
        errors.push(`'${path}' is still set to placeholder value '${value}'`)
        return
      }
    }
  }
}

check('name', config.name)
check('title', config.title)
check('description', config.description)
check('url', config.url)
check('author.name', config.author.name)
check('author.url', config.author.url)
check('nav.cv', config.nav.cv)
check('nav.github', config.nav.github)
check('admin.hostname', config.admin.hostname)
check('admin.rpId', config.admin.rpId)
check('admin.origin', config.admin.origin)

if (errors.length > 0) {
  console.error('\nERROR: site.config.ts validation failed:\n')
  for (const err of errors) {
    console.error(`  - ${err}`)
  }
  console.error('\nEdit site.config.ts with your details before building.\n')
  process.exit(1)
}

console.log('site.config.ts validated OK')
