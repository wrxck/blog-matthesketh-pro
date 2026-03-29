import { defineConfig } from '@matthesketh/utopia-vite-plugin'
import { resolve } from 'node:path'
import { htmlConfig } from '../vite-plugin-html-config'

export default defineConfig({
  base: '/',
  plugins: [htmlConfig()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
})
