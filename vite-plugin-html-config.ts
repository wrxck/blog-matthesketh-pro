import { config } from './site.config'
import type { Plugin } from 'vite'

export function htmlConfig(): Plugin {
  return {
    name: 'html-config',
    transformIndexHtml(html: string) {
      return html.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path: string) => {
        const value = path.split('.').reduce((obj: any, key: string) => obj?.[key], config)
        return value != null ? String(value) : ''
      })
    },
  }
}
