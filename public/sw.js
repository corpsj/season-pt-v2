// Minimal service worker — present ONLY to satisfy Chrome's `beforeinstallprompt`
// (one-tap install) requirement, which still needs a SW with a fetch handler.
// NETWORK-ONLY: it never caches app assets, so the app always loads fresh (no stale
// CSS/JS). It just provides a tiny offline fallback for navigations.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const OFFLINE_HTML =
  '<!doctype html><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>오프라인</title>" +
  '<body style="margin:0;display:grid;place-items:center;height:100dvh;font-family:system-ui,-apple-system,sans-serif;background:#FAF8F4;color:#3a372f">' +
  '<div style="text-align:center;padding:2rem">' +
  '<div style="font-size:15px;font-weight:700">오프라인이에요</div>' +
  '<div style="margin-top:6px;font-size:13px;color:#8a857a">인터넷 연결을 확인하고 다시 시도해 주세요.</div>' +
  "</div></body>";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Navigations: always network (fresh); only fall back to a tiny offline page on failure.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
      )
    );
  }
  // Everything else: no respondWith → browser handles normally (network, no caching).
});
