import { mount } from '@matthesketh/utopia-runtime'
import { createRouter } from '@matthesketh/utopia-router'
import App from './App.utopia'
import './global.css'

createRouter([
  { path: '/', component: () => import('./pages/+page.utopia') },
  { path: '/blog/:slug', component: () => import('./pages/blog/+page.utopia') },
  { path: '/tags', component: () => import('./pages/tags/+page.utopia') },
  { path: '/tags/:tag', component: () => import('./pages/tags/+page.utopia') },
])

mount(App, '#app')
