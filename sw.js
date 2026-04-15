// Mradi HQ — Production Service Worker
// Deploy this file to the Vercel root alongside index.html (or mradi-hq-live.html).
// Cache version — bump this string whenever you want all clients to re-fetch assets.
const CACHE = 'mradi-v2';

const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
];

// ── Install: pre-cache CDN assets + app shell ─────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all([
        // CDN scripts — cache-first forever
        ...CDN.map(url =>
          fetch(url, { mode: 'no-cors' })
            .then(r => c.put(url, r))
            .catch(() => {})
        ),
        // App shell — the single HTML file served at /
        fetch('/', { cache: 'reload' })
          .then(r => c.put('/', r))
          .catch(() => {}),
      ])
    )
  );
  // Activate immediately — don't wait for old SW to be idle
  self.skipWaiting();
});

// ── Activate: delete stale caches ────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ───────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // 1. CDN assets — cache-first (these URLs are immutable/versioned)
  if (
    CDN.some(u => url === u) ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('cdn.jsdelivr.net') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return resp;
        });
      })
    );
    return;
  }

  // 2. App shell navigation — cache-first, network fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/').then(cached => cached || fetch(e.request))
    );
    return;
  }

  // 3. Supabase API — network-only (real-time data must always be fresh)
  if (url.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // 4. Paystack / analytics — network-only, silent fail
  if (
    url.includes('paystack.co') ||
    url.includes('googletagmanager.com') ||
    url.includes('google-analytics.com')
  ) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 204 }))
    );
    return;
  }

  // 5. Default — network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// ── Background sync: flush Mradi offline queue ───────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'mradi-sync') {
    e.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'MRADI_FLUSH_SYNC' }))
      )
    );
  }
});

// ── Push notifications (future use) ──────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json().catch(() => ({ title: 'Mradi HQ', body: e.data.text() }));
  e.waitUntil(
    data.then(d =>
      self.registration.showNotification(d.title || 'Mradi HQ', {
        body: d.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'mradi-push',
        renotify: true,
      })
    )
  );
});
