// Service worker del menú: hace que la app abra aunque no haya internet.
// Si cambias index.html (precios, promos...) y no lo ves en el celular, sube este número.
const VERSION = "v1";
const CACHE = "menu-" + VERSION;
const ARCHIVOS = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];

// Recursos externos que usa la página (letra y generador de QR)
const FUENTES_CSS = "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@200;300;400;700&display=swap";
const QR_JS = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
const HOSTS_EXTERNOS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ARCHIVOS);
    // Lo externo es "extra": si falla, la instalación sigue igual
    try {
      const r = await fetch(FUENTES_CSS);
      if (r.ok) {
        const css = await r.clone().text();
        await c.put(FUENTES_CSS, r);
        const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        await Promise.allSettled(urls.map(async u => { const f = await fetch(u); if (f.ok) await c.put(u, f); }));
      }
    } catch (_) {}
    try { const r = await fetch(QR_JS); if (r.ok) await c.put(QR_JS, r); } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith("menu-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;

  // Letra y QR: primero lo guardado, y se actualiza en segundo plano
  if (HOSTS_EXTERNOS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const guardado = await c.match(req);
      const red = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => null);
      return guardado || (await red) || Response.error();
    })());
    return;
  }

  if (url.origin !== location.origin) return;   // WhatsApp, Instagram, etc.: no se tocan

  // La página: primero internet (para ver precios y promos al día) y, sin conexión, la copia guardada
  e.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok) { const c = await caches.open(CACHE); c.put(req, r.clone()); }
      return r;
    } catch (err) {
      const r = await caches.match(req, { ignoreSearch: true });
      if (r) return r;
      if (req.mode === "navigate") { const i = await caches.match("index.html"); if (i) return i; }
      throw err;
    }
  })());
});
