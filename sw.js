/* May MiniMart service worker: เปิดแอปได้แม้เน็ตหลุด (ข้อมูลยังซิงก์เมื่อกลับมาออนไลน์) */
const V = '2.6.36', C = 'maymart-v' + V;
const JS = ['qr', 'logic', 'cache', 'offline', 'scanner', 'printer', 'pos', 'display', 'reports', 'inventory', 'people', 'quality', 'services', 'owner'].map(n => './' + n + '.js?v=' + V);
const CORE = ['./', './index.html', './manifest.webmanifest', './display.webmanifest', './icon-192.png', './favicon.png', './logo.png', './logo-white.png'].concat(JS);
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

// ===== แจ้งเตือนบนมือถือ (เจ้าของร้าน) =====
// ได้สัญญาณว่างจากเซิร์ฟเวอร์ → ถามรายละเอียด (pushPeek ด้วยรหัสลับของเครื่องนี้) → แสดงในแถบแจ้งเตือน
const pdb = () => new Promise((res, rej) => { const q = indexedDB.open('mm-push', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const pget = k => pdb().then(db => new Promise(res => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }));
self.addEventListener('push', e => e.waitUntil((async () => {
  let items = [];
  try {
    const c = await pget('cfg');
    if (c && c.api && c.secret) { const r = await fetch(c.api, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'pushPeek', payload: { secret: c.secret } }) }).then(x => x.json()); items = (r && r.items) || []; }
  } catch (x) { }
  if (!items.length) items = [{ tag: 'mm', title: '🔔 MayMiniMart', body: 'มีงานรอดำเนินการ — แตะเพื่อเปิด', sticky: true }];
  for (const it of items) await self.registration.showNotification(it.title, { body: it.body, tag: it.tag, icon: './icon-192.png', badge: './favicon.png', requireInteraction: !!it.sticky, vibrate: [200, 100, 200, 100, 300], data: { url: './#jobs' } });
})()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.indexOf(self.registration.scope) === 0 && x.url.indexOf('#display') < 0);
    if (c) { c.postMessage({ go: 'jobs' }); return c.focus(); }
    return self.clients.openWindow('./#jobs');
  }));
});
