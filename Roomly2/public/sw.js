/* Roomly app helper: makes Roomly installable and opens it when a notification is tapped.
 * It does not cache pages, so students always get the latest version of the site. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow((event.notification.data && event.notification.data.url) || '/');
    })
  );
});

/* Alerts from the Roomly server (Firebase Cloud Messaging), shown even when Roomly is closed */
self.addEventListener('push', (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch (e) {
    p = {};
  }
  const d = p.data || p.notification || p;
  const title = d.title || 'Roomly';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      tag: d.tag || 'roomly',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: d.url || '/' },
    })
  );
});
