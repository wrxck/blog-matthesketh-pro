import { mount } from '@matthesketh/utopia-runtime'
import { createRouter } from '@matthesketh/utopia-router'
import App from './App.utopia'
import './global.css'

createRouter([
  { path: '/admin', component: () => import('./pages/+page.utopia') },
  { path: '/admin/posts', component: () => import('./pages/posts/+page.utopia') },
  { path: '/admin/posts/new', component: () => import('./pages/posts/new/+page.utopia') },
  { path: '/admin/posts/:slug', component: () => import('./pages/posts/[slug]/+page.utopia') },
])

mount(App, '#app')
