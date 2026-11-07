const CACHE = 'ai-grak-v2';
const ASSETS = ['/', '/css/style.css', '/js/main.js', '/js/api.js', '/js/audio.js', '/js/config.js', '/js/state.js', '/js/ui.js', '/manifest.json'];
const API_PATHS = ['/chat', '/models', '/parse-pdf', '/fetch-url', '/run-python', '/config', '/health'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// استاتیک‌ها: اول شبکه، اگر آفلاین بود از کش. درخواست‌های API هرگز کش نمی‌شوند.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (API_PATHS.some((p) => url.pathname.startsWith(p))) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/')))
  );
});
    
