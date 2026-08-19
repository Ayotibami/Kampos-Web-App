// Kampos PWA Service Worker
// Caches static assets (cache-first), HTML pages (stale-while-revalidate),
// and external images from Cloudinary/Giphy (cache-first).
// API data is NOT cached here — that lives in a client-side IndexedDB layer
// (see the upcoming data-cache module).

const STATIC = "kampos-static-v1";
const IMAGES = "kampos-images-v1";

// ── Lifecycle ──────────────────────────────────────────────────────────────

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC && k !== IMAGES)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// ── Fetch strategies ───────────────────────────────────────────────────────

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // ── External images (Cloudinary, Giphy) → cache-first ─────────────────
  if (
    url.hostname === "res.cloudinary.com" ||
    url.hostname.includes("giphy.com")
  ) {
    e.respondWith(cacheFirst(e.request, IMAGES));
    return;
  }

  // ── Same-origin only beyond this point ────────────────────────────────
  if (url.origin !== self.location.origin) return;

  // ── API proxy routes → let them pass through to the server untouched.
  //     API data is cached client-side in IndexedDB (see dataCache.ts);
  //     double-caching here in the SW only adds staleness and cache churn.
  if (url.pathname.startsWith("/api/")) return;

  // ── Static assets → cache-first ───────────────────────────────────────
  if (
    /\.(js|mjs|cjs|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|otf|json|webp|avif|webm|mp4|xml|txt|rsc)$/.test(
      url.pathname,
    )
  ) {
    e.respondWith(cacheFirst(e.request, STATIC));
    return;
  }

  // ── Navigation / HTML pages → stale-while-revalidate ──────────────────
  e.respondWith(staleWhileRevalidate(e.request, STATIC));
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Serve from cache immediately, refresh cache in background. */
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    fetch(req)
      .then((res) => {
        if (res.ok) cache.put(req, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

/** Return cached version immediately if available; always fetch fresh in
 *  the background and update cache. If nothing is cached AND the network
 *  fails, return a friendly offline fallback instead of a white error page. */
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (cached) return cached;
  return network.catch(() => {
    // Only serve the offline fallback for navigation (HTML) requests, not
    // for API or asset requests that slipped through — those just fail.
    if (req.mode === "navigate") {
      return new Response(
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kampos — Offline</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100dvh;margin:0;background:#165abf;color:#fff;text-align:center;padding:2rem;}h1{font-size:1.5rem;margin-bottom:.5rem}p{opacity:.8}</style></head><body><div><h1>You\'re offline</h1><p>Connect to the internet and try again.</p></div></body></html>',
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
    }
    throw new Error("Offline — resource not cached");
  });
}
