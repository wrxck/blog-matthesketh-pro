import { resolve } from 'path'
import { defineConfig } from '@matthesketh/utopia-vite-plugin'
import content from '@matthesketh/utopia-content/vite'

const nodeStub = resolve(__dirname, 'src/stubs/node.js')

export default defineConfig({
  build: {
    target: 'es2022',
  },
  plugins: [
    content({
      contentDir: 'content',
      embedHtml: true,
      embedBody: true,
      feed: {
        title: 'Matt Hesketh',
        description: 'Software engineering, mainframes, and building things.',
        siteUrl: 'https://blog.matthesketh.pro',
        author: 'Matt Hesketh',
        language: 'en',
        collection: 'blog',
        filterDrafts: true,
      },
      seo: {
        author: { name: 'Matt Hesketh', url: 'https://matthesketh.pro' },
        locale: 'en_GB',
      },
    }),
  ],
  resolve: {
    alias: {
      'fs/promises': nodeStub,
      'node:fs/promises': nodeStub,
      path: nodeStub,
      'node:path': nodeStub,
      fs: nodeStub,
      'node:fs': nodeStub,
    },
  },
})
