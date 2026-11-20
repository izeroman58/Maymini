/* =========================================================
   แคชข้อมูล — ทุกหน้าแสดงทันทีจากข้อมูลที่เคยโหลด แล้วอัปเดตเบื้องหลัง
   (stale-while-revalidate) เก็บใน IndexedDB ของเครื่อง
   ========================================================= */
'use strict';
const Cache = {
  mem: {}, inflight: {}, staleBefore: 0, dbp: null,
  idb() {
    if (this.dbp) return this.dbp;
    this.dbp = new Promise(res => {
      try { const r = indexedDB.open('mm-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
      catch (e) { res(null); }
    });
    return this.dbp;
  },
  async get(k) {
    if (this.mem[k]) return this.mem[k];
    const db = await this.idb(); if (!db) return null;
    return new Promise(res => { try { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => { if (q.result) this.mem[k] = q.result; res(q.result || null); }; q.onerror = () => res(null); } catch (e) { res(null); } });
  },
  async set(k, v) {
    const e = { v, at: Date.now() }; this.mem[k] = e;
    const db = await this.idb(); if (!db) return;
    try { db.transaction('kv', 'readwrite').objectStore('kv').put(e, k); } catch (er) { }
  },
  async del(k) { delete this.mem[k]; const db = await this.idb(); if (db) try { db.transaction('kv', 'readwrite').objectStore('kv').delete(k); } catch (e) { } },
  async clear() { this.mem = {}; const db = await this.idb(); if (db) try { db.transaction('kv', 'readwrite').objectStore('kv').clear(); } catch (e) { } },
  key: k => (S.user ? S.user.id : '-') + '|' + k
};
/* swr: คืนข้อมูลเก่าทันที (ถ้ามี) และโหลดใหม่เบื้องหลัง เมื่อได้ข้อมูลใหม่ที่ต่างจากเดิม → แจ้งหน้าให้วาดใหม่ */
async function swr(key, fetcher, maxAge = 30000) {
  const k = Cache.key(key); (S.deps || (S.deps = new Set())).add(k);
  const c = await Cache.get(k);
  const refresh = () => {
    if (Cache.inflight[k]) return Cache.inflight[k];
    return (Cache.inflight[k] = fetcher().then(v => {
      const changed = !c || JSON.stringify(v) !== JSON.stringify(c.v);
      Cache.set(k, v);
      if (changed && c) document.dispatchEvent(new CustomEvent('mm:data', { detail: k }));
      return v;
    }).finally(() => { delete Cache.inflight[k]; }));
  };
  if (c) { if (Date.now() - c.at > maxAge || c.at < Cache.staleBefore) refresh().catch(() => { }); return c.v; }
  return refresh();
}
// บันทึกข้อมูลแล้ว → ข้อมูลในแคชถือว่าเก่า (ตารางที่แก้ ลบทิ้งเลย เพื่อให้หน้าถัดไปเห็นของใหม่ทันที)
const WRITE_ACTIONS = /^(upsert|remove|importProducts|renameCategory|applyReceipt|syncOrders|refund|customerPay|adjustPoints|clockIn|clockOut|finishCount|receivePO|adjustStock|saveUser)$/;
function cacheAfterWrite(action, payload) {
  if (!WRITE_ACTIONS.test(action)) return;
  Cache.staleBefore = Date.now();
  if (payload && payload.table) Cache.del(Cache.key('t:' + payload.table));
  if (action === 'syncOrders' || action === 'refund') Object.keys(Cache.mem).forEach(k => { if (/\|(o|d):/.test(k)) Cache.mem[k].at = 0; });
}
// วาดหน้าใหม่เมื่อข้อมูลอัปเดต (ไม่รบกวนตอนพิมพ์/เปิดหน้าต่างย่อย/อยู่หน้าขาย)
let rerenderT = null;
document.addEventListener('mm:data', e => {
  if (!S.deps || !S.deps.has(e.detail) || S.view === 'pos' || S.view === 'display') return;
  clearTimeout(rerenderT);
  rerenderT = setTimeout(function again() {
    const a = document.activeElement;
    if ($('.ov') || $('.scan') || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { rerenderT = setTimeout(again, 1500); return; }
    const y = scrollY; go(S.view, S.viewArg); setTimeout(() => scrollTo(0, y), 60);
  }, 250);
});

/* quick: รอข้อมูลไม่เกิน ms มิลลิวินาที ถ้ายังไม่มา แสดงหน้าด้วยค่าสำรองไปก่อน แล้ววาดใหม่เองเมื่อข้อมูลมาถึง (ห้ามหมุนรอนาน) */
function quick(p, ms, fb) {
  let late = false; const v = S.view, a = S.viewArg;
  p.then(() => { if (late && S.view === v && S.viewArg === a) { clearTimeout(quick.t); quick.t = setTimeout(() => { if (S.view === v && !$('.ov')) { const y = scrollY; go(v, a); setTimeout(() => scrollTo(0, y), 60); } }, 200); } }, () => { });
  return Promise.race([p.catch(() => fb), new Promise(r => setTimeout(() => { late = true; r(fb); }, ms))]);
}
/* ---------- ตัวโหลดข้อมูลที่ใช้แคช ---------- */
loadTable = t => swr('t:' + t, () => api('list', { table: t }).then(r => r.rows), 20000);
function dailySummary(from, to) { return swr('d:' + from + '|' + to, () => api('dailySummary', { from, to }).then(r => r.days), 60000); }
// อุ่นแคชหลังเจ้าของเข้าระบบ (โหลดเบื้องหลัง ไม่ต้องรอ)
function warmCache() {
  if (!S.user || S.user.role !== 'owner' || !S.apiUrl) return;
  const t = todayISO(), y = t.slice(0, 4), lm = addDays(t.slice(0, 8) + '01', -1).slice(0, 8) + '01';
  setTimeout(() => { [dailySummary(lm, t), dailySummary(y + '-01-01', y + '-12-31'), loadTable('Licenses'), loadTable('Receipts'), loadTable('Sales'), loadTable('TaxFilings')].forEach(p => p.catch(() => { })); }, 1500);
}
