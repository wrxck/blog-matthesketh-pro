// client-side ad-free state + the google adsense loader. the device's ad-free
// status is fetched once from the server (which reads the signed cookie);
// failures leave ads on (fail safe). the adsense script is injected lazily and
// ONLY when an ad is actually shown, so ad-free readers load zero ad javascript.

import { signal } from '@matthesketh/utopia-core'

import { config } from '../../site.config'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

export const adFree = signal(false)
let statusStarted = false

export function loadAdFree(): void {
  if (statusStarted || typeof window === 'undefined') return
  statusStarted = true
  fetch('/api/adfree/status', { credentials: 'same-origin' })
    .then((r) => r.json())
    .then((d: { adFree?: boolean }) => adFree(!!d.adFree))
    .catch(() => undefined)
}

const client = config.ads?.adsenseClient || ''

let scriptPromise: Promise<void> | null = null
function ensureScript(): Promise<void> {
  if (typeof window === 'undefined' || !client) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement('script')
    s.async = true
    s.crossOrigin = 'anonymous'
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`
    s.onload = () => resolve()
    s.onerror = () => resolve()
    document.head.appendChild(s)
  })
  return scriptPromise
}

// ensure the adsense script is present, then activate any ad slot that was just
// rendered. deferred a frame so the <ins> is in the dom first; only un-filled
// slots are pushed (adsense throws if a slot already holds an ad), which keeps
// spa route changes safe.
export function refreshAds(): void {
  if (typeof window === 'undefined' || !client) return
  requestAnimationFrame(() => {
    void ensureScript().then(() => {
      document.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])').forEach(() => {
        try {
          ;(window.adsbygoogle = window.adsbygoogle || []).push({})
        } catch {
          /* slot already filled — ignore */
        }
      })
    })
  })
}
