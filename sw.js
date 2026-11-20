/* May MiniMart service worker: เปิดแอปได้แม้เน็ตหลุด (ข้อมูลยังซิงก์เมื่อกลับมาออนไลน์) */
const V = '2.6.8', C = 'maymart-v' + V;
const JS = ['qr', 'logic', 'cache', 'offline', 'scanner', 'printer', 'pos', 'display', 'reports', 'inventory', 'people', 'quality', 'services', 'owner'].map(n => './' + n + '.js?v=' + V);
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'].concat(JS);
// ติดตั้ง: โหลดของใหม่จากเซิร์ฟเวอร์จริงเสมอ (ไม่ใช้แคชของเบราว์เซอร์) กันได้ไฟล์เก่าปนไฟล์ใหม่
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => Promise.all(CORE.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => { if (r.ok) return c.put(u, r); }).catch(() => { })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || /script\.google(usercontent)?\.com/.test(u.host)) return;
  if (u.origin === location.origin) {
    // ไฟล์ของแอป: ถามเซิร์ฟเวอร์ก่อนเสมอ (no-cache = ตรวจว่าไฟล์เปลี่ยนไหม) ถ้าไม่มีเน็ตใช้แคช
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request).then(m => m || caches.match(e.request, { ignoreSearch: true }))));
  } else if (/cdnjs|jsdelivr|unpkg|fonts\.g/.test(u.host)) {
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; })));
  }
});
