// public/sw.js
// Minimal offline-support service worker.
//
// All PATIENT DATA already lives in IndexedDB (see lib/db.js), which
// works offline natively with zero help from a service worker. This
// worker's only job is to cache the app shell (JS/CSS/pages) itself, so
// the app still LOADS with no network connection at all — e.g. a health
// worker's tablet with the app already opened once, then no signal for
// the rest of a rural health camp.

const CACHE_NAME = "sandhiq-shell-v3";
const CORE_ASSETS = ["/", "/dashboard", "/login", "/patients", "/manifest.json"];

// Content-hashed build output: a new build produces new filenames, so a cached
// hit can never be stale. Safe to serve from cache without revalidating.
const isImmutableAsset = (url) => url.pathname.startsWith("/_next/static/");

// Never cache these. /api/* is live server state (model health, inference
// results); a cached copy would show a stale model or a stale grade.
const isNeverCached = (url) => url.pathname.startsWith("/api/");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (isNeverCached(url)) return;

  // Network-first, cache as the offline fallback.
  //
  // The app must still LOAD with no signal (rural health camp), so the cache
  // is kept — but it must never win when there IS a network. The previous
  // cache-first version returned the cached copy and only refreshed in the
  // background, which meant a cached HTML page kept referencing cached
  // content-hashed chunks, pinning the browser to the previous build
  // indefinitely. Health workers were running a stale app after an update
  // with no way to tell.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Last resort for a navigation: the cached app shell.
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return new Response("Offline and not cached.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      })
  );
});
