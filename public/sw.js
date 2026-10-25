/* Service worker: gör spelet installerbart och startbart utan nät. Nätet först (en ny version syns direkt), cachen när nätet saknas. */
const CACHE = 'foundryfolk';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const { request } = event, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || request.headers.has('range')) return;   // musiken (range-anrop) går alltid direkt mot nätet
  event.respondWith(fetch(request).then(response => {
    if (response.status === 200 && !url.pathname.includes('/music/')) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request, { ignoreSearch: true }).then(hit => hit || Response.error())));
});
