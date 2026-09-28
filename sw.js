/* sw.js — CODE 3 service worker (v0.4 PWA side lane).
   Goal: installs, plays offline, and a kid is never stuck on a stale build.
   - HTML (navigations, index.html, tilt-academy.html): network-first, 3 s timeout, cache fallback;
     every good network answer refreshes the cache.
   - three.js r128 from cdnjs: cache-first (it never changes), fetched as a CORS request so the page's
     <script crossorigin="anonymous"> matches the cached response.
   - Everything else passes straight through to the network.
   Bump CACHE on every release: activate() deletes every other 'code3-*' cache. */
const CACHE = 'code3-v0.4.0';
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];
const NET_TIMEOUT_MS = 3000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })));
    await cache.add(new Request(THREE_URL, { mode: 'cors' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('code3-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isHtml(req, url) {
  if (req.mode === 'navigate') return true;
  if (url.origin !== self.location.origin) return false;
  return /\/(index|tilt-academy)\.html$/.test(url.pathname);
}

// Cache keys for HTML drop the query string (?sw=1, ?x=...), and the scope root './' and './index.html'
// are the same page, so a fresh copy of either refreshes both (offline then serves the newest build).
function htmlKeys(url) {
  const bare = url.origin + url.pathname;
  const root = self.registration.scope;
  return (bare === root || bare === root + 'index.html') ? [root, root + 'index.html'] : [bare];
}

async function networkFirst(event, req, url) {
  // Registered synchronously (waitUntil after respondWith settles would throw): the worker stays alive
  // until the offline copy is written. A failed fetch or put (e.g. over quota) is swallowed, never fatal.
  let refreshed;
  event.waitUntil(new Promise(resolve => { refreshed = resolve; }));
  const cache = await caches.open(CACHE);
  const keys = htmlKeys(url);
  const net = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      refreshed(copy.blob().then(body => Promise.all(keys.map(k => cache.put(k, new Response(body, {
        status: copy.status, statusText: copy.statusText, headers: copy.headers })))))
        .catch(() => {}));
    } else refreshed();
    return res;
  }, err => { refreshed(); throw err; });
  net.catch(() => {}); // a late failure after the timeout must not surface as an unhandled rejection
  const timeout = new Promise(resolve => setTimeout(resolve, NET_TIMEOUT_MS, 'timeout'));
  try {
    const res = await Promise.race([net, timeout]);
    if (res !== 'timeout' && res && res.ok) return res;
  } catch (e) { /* offline: fall through to cache */ }
  const hit = await cache.match(keys[0])
    || (req.mode === 'navigate' ? await cache.match(self.registration.scope) : undefined);
  if (hit) return hit;
  return net; // nothing cached: let the network answer (or fail) on its own time
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.url === THREE_URL) { event.respondWith(cacheFirst(req)); return; }
  if (isHtml(req, url)) { event.respondWith(networkFirst(event, req, url)); return; }
  // everything else: pass through (no respondWith)
});
