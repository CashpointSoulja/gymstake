const CACHE = 'gymstake-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const response = await cache.match('/', { ignoreVary: true });
    if (response) {
      const html = await response.text();
      const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]);
      await Promise.all(assets.map((asset) => cache.add(asset).catch(() => undefined)));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('gymstake-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const isStaticShell = SHELL.includes(url.pathname) || url.pathname.startsWith('/assets/');
  const isIndexNavigation = request.mode === 'navigate' && url.pathname === '/index.html';
  if (!isStaticShell && !isIndexNavigation) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const home = await cache.match('/', { ignoreVary: true });
        if (home) return home;
      }
      return new Response('You’re offline. Reconnect to load this resource.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
