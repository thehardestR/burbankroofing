// Self-destroying service worker. The old /crm PWA registered a service worker here; this version
// unregisters it and clears its caches so browsers always load the new React CRM instead of a
// stale cached page. Safe no-op for visitors who never had the old app.
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
