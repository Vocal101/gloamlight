// Offline support: cache the game files, serve them cache-first, refresh in the background.
const VERSION = 'gloamlight-v1.0.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/util.js', 'js/data.js', 'js/map.js', 'js/sim.js', 'js/bot.js', 'js/fx.js', 'js/art.js', 'js/render.js',
  'js/audio.js', 'js/save.js', 'js/game.js', 'js/ui.js', 'js/dev.js', 'js/main.js',
  'fonts/plex-sans-400.woff2', 'fonts/plex-sans-500.woff2', 'fonts/plex-sans-600.woff2', 'fonts/plex-cond-600.woff2', 'fonts/plex-mono-500.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
