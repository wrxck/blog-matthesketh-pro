import { defineConfig } from '@matthesketh/utopia-vite-plugin'

export default defineConfig({
  base: '/admin/',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
})
