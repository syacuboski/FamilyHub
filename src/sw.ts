/// <reference lib="webworker" />
// Service worker: offline app shell, cached recipe photos, and Web Push.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every app URL opens the cached shell, except the API and the PocketBase admin.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/_\//] }));

// Recipe photos: keep a copy so the cookbook shows pictures offline.
registerRoute(({ url }) => url.pathname.startsWith('/api/files/'), new CacheFirst({ cacheName: 'fh-files' }));

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') void self.skipWaiting();
});

// ---------- push reminders (sent by the familyhub-push worker) ----------
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Family Hub', body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Family Hub', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await (c as WindowClient).focus();
          (c as WindowClient).navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
