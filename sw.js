/* ============================================================
   sw.js — offline support
   App shell: cache-first (fast, works with no signal)
   Content JSON: network-first (so published updates arrive)
   ============================================================ */
const VERSION = 'khutwa-v1.3.0';
const SHELL = VERSION + '-shell';
const DATA  = VERSION + '-data';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/theme.css',
  './css/app.css',
  './app/main.js',
  './app/util.js',
  './app/store.js',
  './app/data.js',
  './app/tts.js',
  './app/router.js',
  './app/ui.js',
  './app/config.js',
  './app/sync.js',
  './app/views/home.js',
  './app/views/units.js',
  './app/views/learn.js',
  './app/views/quiz.js',
  './app/views/review.js',
  './app/views/alphabet.js',
  './app/views/search.js',
  './app/views/stats.js',
  './app/views/sentences.js',
  './app/views/settings.js',
  './assets/icon.svg',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(SHELL_FILES.map(f => c.add(new Request(f, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // never touch api.github.com

  // content files: fresh first, cache as backup
  if (url.pathname.includes('/data/')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(DATA);
        c.put(req, res.clone());
        return res;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  // everything else: cache first, refresh in the background
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: false });
    const net = fetch(req).then(res => {
      if (res.ok) caches.open(SHELL).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => null);
    return hit || (await net) || (await caches.match('./index.html'));
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
