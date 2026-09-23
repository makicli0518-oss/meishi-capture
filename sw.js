// Service Worker: アプリ本体をキャッシュしてオフラインでも起動できるようにする。
// 同一オリジンの GET だけを扱う（Microsoft へのサインインや Graph 通信には触れない）。
const VERSION = "0.1.1";
const CACHE = `meishi-capture-${VERSION}`;
const ASSETS = [
  "./", "./index.html", "./style.css", "./app.js", "./auth.js", "./camera.js", "./config.js",
  "./graph.js", "./image.js", "./naming.js", "./queue.js", "./uploader.js",
  "./vendor/msal-browser.min.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // ネットワーク優先（更新をすぐ反映）、失敗時はキャッシュ
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
