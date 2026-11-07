const CACHE = 'hoosh-pro-v3';

// فایل‌های خود برنامه
const ASSETS = [
  '/', '/css/style.css', '/css/extra.css',
  '/js/main.js', '/js/api.js', '/js/audio.js', '/js/config.js', '/js/state.js', '/js/ui.js',
  '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'
];

// کتابخانه‌های CDN. این آدرس‌ها باید دقیقاً با index.html یکی باشند تا آفلاین هم کار کنند
const CDN = [
  'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css',
  'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js',
  'https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/dist/umd.js',
  'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Vazirmatn:wght@400;700&display=swap'
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const API_PATHS = ['/chat', '/models', '/parse-pdf', '/fetch-url', '/run-python', '/config', '/health'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all([
        ...ASSETS.map((a) => c.add(a).catch(() => {})),
        // پاسخ‌های cross-origin به‌صورت opaque ذخیره می‌شوند (برای <script> و <link> کافی است)
        ...CDN.map((u) => fetch(new Request(u, { mode: 'no-cors' })).then((r) => c.put(u, r)).catch(() => {}))
      ]))
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

// CDN و فونت: اول کش (سریع و آفلاین)، در پس‌زمینه بروزرسانی
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  if (hit) return hit;
  return (await net) || Response.error();
}

// فایل‌های برنامه: اول شبکه، اگر آفلاین بود از کش
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') { const home = await caches.match('/'); if (home) return home; }
    return Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (CDN_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req));
    return;
  }
  // درخواست‌های API هرگز کش نمی‌شوند
  if (API_PATHS.some((p) => url.pathname.startsWith(p))) return;
  e.respondWith(networkFirst(req));
});
