/* ─────────────────────────────────────────────────────────────────────────────
   Mradi HQ — Service Worker  (sw.js)
   Deploy this file in the SAME DIRECTORY as your HTML file.

   e.g. on Vercel/Netlify your deployment folder should contain:
     mradi-hq.html   ← or index.html
     sw.js           ← this file

   FIX #1: This replaces the broken blob: URL SW registration in the original
   HTML. Blob-URL SWs cannot have a scope covering https:// pages, so the
   beforeinstallprompt event never fired and the PWA install button never showed.
───────────────────────────────────────────────────────────────────────────── */

const CACHE_NAME = 'mradi-hq-v2';

// ── INSTALL: cache the app shell ────────────────────────────────────────────
self.addEventListener('install', e => {
  const shellUrl = self.registration.scope; // the HTML file
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([shellUrl]).catch(() => {})
    )
  );
  self.skipWaiting();
});

// ── ACTIVATE: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH: network-first with offline fallback ───────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (
          res.ok &&
          (e.request.url.startsWith(self.location.origin) ||
           e.request.url.includes('cdnjs.cloudflare.com'))
        ) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = {
    title: 'Mradi HQ',
    body:  'You have a new alert.',
    tag:   'mradi-alert',
    icon:  '/icon-192.png',
  };
  try { data = { ...data, ...e.data.json() }; } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:               data.body,
      tag:                data.tag,
      icon:               data.icon || '/icon-192.png',
      badge:              '/icon-192.png',
      vibrate:            [200, 100, 200],
      requireInteraction: data.requireInteraction || false,
      data:               { url: data.url || '/' },
    })
  );
});

// ── LOCAL NOTIFICATION TRIGGER (postMessage from app) ───────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SHOW_NOTIFICATION') {
    const d = e.data;
    self.registration.showNotification(d.title || 'Mradi HQ', {
      body:               d.body || '',
      tag:                d.tag || 'mradi-local',
      icon:               '/icon-192.png',
      badge:              '/icon-192.png',
      vibrate:            [150, 75, 150],
      requireInteraction: !!d.requireInteraction,
      data:               { url: d.url || '/' },
    });
  }
});

// ── NOTIFICATION CLICK ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        const existing = list.find(c => c.url && c.focus);
        if (existing) return existing.focus();
        return clients.openWindow(url);
      })
  );
});
