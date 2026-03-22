import { createContent, defineCollection } from '@matthesketh/utopia-content'
import { createVirtualAdapter } from '@matthesketh/utopia-content'
// @ts-ignore — virtual module provided by vite plugin
import { collections as virtualCollections } from 'virtual:utopia-content'

const adapter = createVirtualAdapter(virtualCollections)

createContent({ contentDir: 'content', adapter })

export const blog = defineCollection({
  name: 'blog',
  directory: 'blog',
})
