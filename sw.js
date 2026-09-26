/* Niti Pamyati cache reset — 2026-09-26 */
self.addEventListener("install", event => {
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
    const clients = await self.clients.matchAll({type:"window", includeUncontrolled:true});
    for (const client of clients) {
      client.postMessage({type:"NITI_CACHE_CLEARED"});
    }
  })());
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request, {cache:"no-store"}).catch(() => new Response(
    "<!doctype html><meta charset=utf-8><title>Нити Памяти</title><p>Подключитесь к интернету и обновите страницу.</p>",
    {headers:{"Content-Type":"text/html; charset=utf-8"}}
  )));
});