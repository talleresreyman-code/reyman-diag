// Reyman Diag · service worker: la interfaz funciona sin conexión; la API siempre va a la red.
const CACHE = 'reyman-diag-v4';
const BASE = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'logo.png', 'icono.svg', 'manifest.webmanifest',
  'lib/api.js', 'lib/grafica.js', 'lib/informe.js', 'lib/visor-grafica.js', '/core/visor.js', '/core/grabacion.js', '/core/obd/senales.js', '/core/obd/sae-pids.js', '/core/obd/modo09.js', '/core/obd/parser.js', '/core/obd/pids.js', '/core/obd/dtc.js', '/core/obd/vin.js',
  '/core/obd/readiness.js', '/core/obd/elm327.js', '/core/obd/obd.js', '/core/obd/marcas.js', '/core/transport/ble.js', '/core/transport/serie.js', '/core/transport/simulador.js', '/core/transport/wifi.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
