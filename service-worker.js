const CACHE_NAME = "postpng-maker-v12-polish";
const DEBUG = new URL(self.location.href).searchParams.has("debug");

function debugWarn(...args) {
  if (DEBUG) console.warn(...args);
}

const APP_SHELL = [
  // GitHub Pages の /PDF-to-PNG/ ルート表示にも対応するため "./" を含める
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/pdf-service.js",
  "./js/image-service.js",
  "./js/export-service.js",
  "./js/ui-service.js",
  "./js/settings-service.js",
  "./js/pwa-service.js",
  "./libs/pdf.min.js",
  "./libs/pdf.worker.min.js",
  "./libs/jszip.min.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => {
        console.error(
          "アプリシェルのキャッシュ登録に失敗しました。APP_SHELLのパスを確認してください。",
          error,
        );
        throw error;
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.protocol === "blob:" || url.pathname.endsWith(".pdf")) return;
  const scopePath = new URL(self.registration.scope).pathname;
  const indexPath = new URL("./index.html", self.location.href).pathname;
  const normalizedScopePath = scopePath.endsWith("/")
    ? scopePath.slice(0, -1)
    : scopePath;
  const isRootRequest =
    url.pathname === scopePath ||
    url.pathname === normalizedScopePath ||
    url.pathname === `${normalizedScopePath}/`;
  const isIndexRequest = url.pathname === indexPath;
  const isAppShell = APP_SHELL.some(
    (path) => new URL(path, self.location.href).pathname === url.pathname,
  );
  if (!isAppShell && !isRootRequest && !isIndexRequest) return;
  const cacheRequest =
    isRootRequest || isIndexRequest ? "./index.html" : event.request;
  event.respondWith(
    caches.match(cacheRequest).then(
      (cached) =>
        cached ||
        fetch(event.request).catch((error) => {
          debugWarn(
            "ネットワーク取得に失敗しました。オフライン用index.htmlを返します。",
            error,
          );
          return caches.match("./index.html");
        }),
    ),
  );
});
