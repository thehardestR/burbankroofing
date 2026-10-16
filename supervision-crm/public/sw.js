// Self-destroying service worker (kept in the build so every deploy ships it). Unregisters the old
// /crm PWA and clears its caches so the new CRM always loads instead of a stale cached page.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
        await self.registration.unregister()
        const clients = await self.clients.matchAll({ type: 'window' })
        clients.forEach((c) => c.navigate(c.url))
      } catch {
        /* ignore */
      }
    })(),
  )
})
