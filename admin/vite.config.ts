import { defineConfig } from '@matthesketh/utopia-vite-plugin'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/',
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
