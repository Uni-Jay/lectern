// Offline support for the self-hosted app: the app itself, and any read-aloud
// audio already played or saved, work without data.
const APP = "lectern-app-v1";
const AUDIO = "lectern-audio-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(["/", "/index.html"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Audio: once fetched, always from the phone.
  if (url.pathname === "/api/tts") {
    e.respondWith(
      caches.open(AUDIO).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      }),
    );
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  // App files: built assets never change name, so cache first; pages try the network first.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(APP).then(async (c) => (await c.match(e.request)) ?? fetch(e.request).then((r) => (r.ok && c.put(e.request, r.clone()), r))),
    );
    return;
  }
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => (caches.open(APP).then((c) => c.put("/index.html", r.clone())), r))
        .catch(() => caches.match("/index.html")),
    );
  }
});
