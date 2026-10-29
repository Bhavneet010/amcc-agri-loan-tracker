const CACHE = 'amcc-shell-v4';
const SHELL = ['/', '/offline.html', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('amcc-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/signin') || url.pathname.startsWith('/signout')) return;
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) await caches.open(CACHE).then(cache => cache.put('/', response.clone())).catch(() => {});
        return response;
      } catch {
        return (await caches.match('/')) || caches.match('/offline.html');
      }
    })());
    return;
  }
  if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html'))); return; }
  if (SHELL.includes(url.pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
// New-loan alerts for admin phones. The payload is { title, body, tag, url } from the data service.
self.addEventListener('push', event => {
  let alert = {};
  try { alert = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(alert.title || 'New loan added', {
    body: alert.body || 'Open the app to see the latest loans.',
    tag: alert.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: alert.url || '/' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(client => new URL(client.url).origin === target.origin);
    return open ? open.focus() : self.clients.openWindow(target.href);
  }));
});
