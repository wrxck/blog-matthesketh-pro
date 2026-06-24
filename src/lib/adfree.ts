// client-side ad-free state + the ethicalads loader. the device's ad-free status
// is fetched once from the server (which reads the signed cookie); failures leave
// ads on (fail safe). the ethicalads script is injected lazily and ONLY when an
// ad is actually shown, so ad-free readers load zero ad javascript.

import { signal } from '@matthesketh/utopia-core'

declare global {
  interface Window {
    ethicalads?: { load: () => void }
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

let scriptPromise: Promise<void> | null = null
function ensureScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.ethicalads) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://media.ethicalads.io/media/client/ethicalads.min.js'
    s.onload = () => resolve()
    s.onerror = () => resolve()
    document.head.appendChild(s)
  })
  return scriptPromise
}

// ensure the script is present, then (re)scan for placement divs — the spa-safe
// way to fill an ad slot that was just rendered. deferred a frame so the slot is
// in the dom first.
export function refreshAds(): void {
  if (typeof window === 'undefined') return
  requestAnimationFrame(() => {
    void ensureScript().then(() => window.ethicalads?.load())
  })
}
