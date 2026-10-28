/* Service worker: gör spelet installerbart och startbart utan nät.
   - Nätet först: varje fil hämtas om från servern (cache: 'no-cache' frågar alltid servern, så en gammal kopia i webbläsarens egen cache
     aldrig ger en gammal version). Är nätet nere, eller svarar det inte inom NETWORK_TIMEOUT, används den sparade kopian.
   - Kärnan (sidan, skripten, ikonerna) förladdas när service workern installeras, så spelet startar offline även om en fil aldrig hunnit hämtas.
     Övrigt (bilder, ljud) sparas första gången det hämtas.
   - En ny version (sw.js?v=...) får en egen cache, och de gamla rensas: filer från olika versioner blandas aldrig. */
importScripts('js/files.js');

const VERSION = new URL(location.href).searchParams.get('v') || '0';
const CACHE = 'foundryfolk-' + VERSION;
const NETWORK_TIMEOUT = 4000;   // ms innan en sparad kopia får gå före ett segt nät
const CORE = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'images/foundryfolk_logo_image.png', 'images/pwa/icon-192.png',
  ...self.GAME_SCRIPTS.map(script => script + '?v=' + VERSION), 'js/files.js?v=' + VERSION];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // En fil som saknas ska inte stoppa installationen: resten förladdas ändå
    await Promise.allSettled(CORE.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('foundryfolk') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  const { request } = event, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || request.headers.has('range')) return;   // musiken (range-anrop) går alltid direkt mot nätet
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const stored = () => cache.match(request, { ignoreSearch: true });
    const network = fetch(request, { cache: 'no-cache' }).then(response => {
      if (response.status === 200 && !url.pathname.includes('/music/')) event.waitUntil(cache.put(request, response.clone()));
      return response;
    });
    network.catch(() => {});   // ett misslyckande efter att kopian redan svarat ska inte ge en olöst felrapport
    // Svarar nätet inte i tid vinner den sparade kopian (om det finns en), medan hämtningen fortsätter och uppdaterar cachen
    const slow = new Promise(resolve => setTimeout(() => resolve(stored()), NETWORK_TIMEOUT)).then(hit => hit || network);
    try { return await Promise.race([network, slow]); }
    catch (error) { return (await stored()) || Response.error(); }
  })());
});
