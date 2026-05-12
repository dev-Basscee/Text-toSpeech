// =====================================================
// LexaRead Service Worker
// Strategy:
//   • App shell (HTML/CSS/JS) → Cache-first
//   • CDN assets (PDF.js, Google Fonts) → Stale-while-revalidate
//   • PDF files → Network only (too large to cache)
// =====================================================

const CACHE_NAME    = 'lexaread-v5';
const CDN_CACHE     = 'lexaread-cdn-v1';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const CDN_ORIGINS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── Install: pre-cache the app shell ──────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CDN_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ───────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // CDN assets: stale-while-revalidate
  if (CDN_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(staleWhileRevalidate(event.request, CDN_CACHE));
    return;
  }

  // App shell: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // Everything else (PDF fetches etc): network only
  event.respondWith(fetch(event.request));
});

// ── Cache strategies ──────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback: return the cached root page
    return caches.match('/', { ignoreSearch: true }) || new Response('LexaRead is offline. Please reconnect.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// ── Push notifications (future use) ──────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
