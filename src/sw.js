// owned by 2a
// Service worker (skabelon). buildSite() indsætter versionen og precache-listen på de to pladsholder-linjer nedenfor.
// Kontrakt: docs/architecture.md §6.2. Skallen precaches hel og serveres cache-first, versioneret med indholdshash,
// så index og JS altid kommer fra samme cache. Ingen runtime-caching; kalenderfeedet og fremmede oprindelser røres ikke.
'use strict';

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;

const PREFIX = 'im2027-';
const CACHE = `${PREFIX}shell-${VERSION}`;
const SCOPE = self.registration.scope; // slutter på '/', fx https://emilberntsen-ui.github.io/ironman-2027/
// Kalenderfeedets mappe. Regexen er skrevet med escapes, så sw.js aldrig indeholder stien som sammenhængende tekst (tjekkes efter udrulning).
const FEED = /\/cal\//;

// Ingen skipWaiting her: en ny version afventer, til siden beder om den (se 'message' nedenfor).
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE) || FEED.test(url.pathname)) return; // ingen respondWith: browseren henter selv
  event.respondWith(answer(req));
});

async function answer(req) {
  const cache = await caches.open(CACHE);
  const hit = req.mode === 'navigate' ? await cache.match(SCOPE, { ignoreSearch: true }) : await cache.match(req);
  return hit || fetch(req);
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
