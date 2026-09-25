/*
 * Service worker: makes the app work with no connection.
 *
 * The app shell is cached on install and served from the cache first, because
 * none of it changes between requests and none of it depends on a network.
 * A copy is fetched in the background so a deployed update is picked up on the
 * next visit.
 */

const CACHE = 'formatmytext-v1'

const SHELL = [
  './',
  'index.html',
  'styles/app.css',
  'manifest.webmanifest',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/apple-touch-icon.png',
  'src/main.js',
  'src/core/chars.js',
  'src/core/cleaner.js',
  'src/core/pipeline.js',
  'src/core/scan.js',
  'src/core/stats.js',
  'src/core/ops/repair.js',
  'src/core/ops/markup.js',
  'src/core/ops/lines.js',
  'src/core/ops/whitespace.js',
  'src/core/ops/casing.js',
  'src/core/ops/transform.js',
  'src/ui/dom.js',
  'src/ui/reveal.js',
  'src/ui/sample.js',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // A single missing file must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(path))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached ?? caches.match('index.html'))

      return cached ?? network
    }),
  )
})
