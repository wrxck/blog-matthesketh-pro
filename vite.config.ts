import { resolve } from 'path'
import { defineConfig } from '@matthesketh/utopia-vite-plugin'
import content from '@matthesketh/utopia-content/vite'
import { htmlConfig } from './vite-plugin-html-config'
import { config } from './site.config'

const nodeStub = resolve(__dirname, 'src/stubs/node.js')

export default defineConfig({
  build: {
    target: 'es2022',
  },
  plugins: [
    htmlConfig(),
    content({
      contentDir: 'content',
      embedHtml: true,
      embedBody: true,
      feed: {
        title: config.name,
        description: config.description,
        siteUrl: config.url,
        author: config.author.name,
        language: config.locale.split('_')[0],
        collection: 'blog',
        filterDrafts: true,
      },
      seo: {
        author: { name: config.author.name, url: config.author.url },
        locale: config.locale,
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
