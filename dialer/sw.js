// Caches the app shell so the dialer opens instantly and survives brief drops.
// Data calls (Supabase) always hit the network — they are cross-origin/POST and
// are intentionally never cached.
const CACHE = "dialer-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/dialer.css",
  "./js/config.js",
  "./js/app.js",
  "./js/owner.js",
  "./js/rep.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // never cache Supabase writes
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // CDN libs + Supabase go to network
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    )
  );
});
