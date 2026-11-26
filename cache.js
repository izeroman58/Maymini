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
const WRITE_ACTIONS = /^(upsert|remove|importProducts|renameCategory|applyReceipt|syncOrders|refund|customerPay|instCancel|adjustPoints|clockIn|clockOut|finishCount|receivePO|adjustStock|saveUser)$/;
function cacheAfterWrite(action, payload) {
  if (!WRITE_ACTIONS.test(action)) return;
  Cache.staleBefore = Date.now();
  if (payload && payload.table) Cache.del(Cache.key('t:' + payload.table));
  if (payload && payload.table && S._ql && S._ql[payload.table]) S._ql[payload.table].at = 0;
  if (/^(syncOrders|refund|instCancel)$/.test(action)) Cache.del(Cache.key('t:Installments'));
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
/* qload: โหลดตาราง แบบ quick แต่จำผลที่มาช้าไว้ใช้รอบถัดไป (ภายใน maxAge ไม่ดึงซ้ำ → ไม่วนวาดหน้าใหม่ไม่รู้จบ) */
function qload(t, ms, fb, maxAge = 60000) {
  const Q = S._ql || (S._ql = {}), c = Q[t];
  if (c && Date.now() - c.at < maxAge) return Promise.resolve(c.v);
  const p = c && c.p ? c.p : (Q[t] = { ...(c || {}), p: loadTable(t).then(v => { Q[t] = { v, at: Date.now() }; return v; }, e => { Q[t] = c && c.v ? { v: c.v, at: c.at } : undefined; throw e; }) }).p;
  return quick(p, ms, c && c.v ? c.v : fb);
}
/* ---------- ตัวโหลดข้อมูลที่ใช้แคช ---------- */
loadTable = t => swr('t:' + t, () => api('list', { table: t }).then(r => r.rows), 20000);
// อุ่นแคชหลังเจ้าของเข้าระบบ (โหลดเบื้องหลัง ไม่ต้องรอ)
function warmCache() {
  if (!S.user || S.user.role !== 'owner' || !S.apiUrl) return;
  const t = todayISO(), y = t.slice(0, 4), lm = addDays(t.slice(0, 8) + '01', -1).slice(0, 8) + '01';
  setTimeout(() => { [dailySummary(lm, t), dailySummary(y + '-01-01', y + '-12-31'), loadTable('Licenses'), loadTable('Receipts'), loadTable('Sales'), loadTable('TaxFilings')].forEach(p => p.catch(() => { })); }, 1500);
}

/* =========================================================
   บิลขายเก็บในเครื่อง (A) — รายงาน/กราฟ/ใบเสร็จย้อนหลัง คำนวณในเครื่อง แสดงทันที ใช้ได้ตอนออฟไลน์
   - ครั้งแรก: ดึงบิลย้อนหลัง 13 เดือนทีละเดือนอยู่เบื้องหลัง
   - หลังจากนั้น: ดึงเฉพาะ 2 วันล่าสุด (บิลใหม่/คืนเงิน) ทุกครั้งที่เปิดหน้ารายงาน หรือทุก 2 นาที
   - เฉพาะผู้ที่มีสิทธิ์ดูรายงาน · แยกตามผู้ใช้และฐานข้อมูลร้าน
   ========================================================= */
const OStore = {
  dbp: null, meta: null, busy: false, syncing: null, lastSync: 0, MONTHS: 13,
  allowed() { return !!(S.user && S.apiUrl && typeof canStrict === 'function' && canStrict('reports')); },
  owner() { return (S.apiUrl || '') + '|' + (S.user ? S.user.id : '') + '|' + (typeof canStrict === 'function' && canStrict('viewCost') ? 'c' : 'n'); },
  db() {
    if (this.dbp) return this.dbp;
    return this.dbp = new Promise(res => {
      try {
        const r = indexedDB.open('mm-orders', 1);
        r.onupgradeneeded = () => { const s = r.result.createObjectStore('o', { keyPath: 'id' }); s.createIndex('date', 'date'); r.result.createObjectStore('m'); };
        r.onsuccess = () => res(r.result); r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  },
  tx(store, mode, fn) { return this.db().then(db => db ? new Promise(res => { try { const t = db.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } }) : null); },
  async getMeta() {
    if (this.meta && this.meta.owner === this.owner()) return this.meta;
    const m = await this.tx('m', 'readonly', s => s.get('meta'));
    if (m && m.owner === this.owner()) return this.meta = m;
    // คนละผู้ใช้/คนละร้าน → เริ่มใหม่
    await this.tx('o', 'readwrite', s => s.clear());
    this.meta = { owner: this.owner(), from: '', last: '', at: 0, count: 0 };
    await this.tx('m', 'readwrite', s => s.put(this.meta, 'meta'));
    return this.meta;
  },
  saveMeta() { return this.tx('m', 'readwrite', s => s.put(this.meta, 'meta')); },
  async put(rows) {
    if (!rows || !rows.length) return 0;
    this.ver = (this.ver || 0) + 1;
    const refunded = rows.filter(o => o.status === 'refund' && o.refundOf).map(o => o.refundOf);
    await this.tx('o', 'readwrite', s => { rows.forEach(o => s.put(o)); });
    // บิลเดิมที่ถูกคืนเงิน (อาจอยู่นอกช่วงที่ดึงใหม่) → ติดสถานะคืนเงินให้ด้วย
    for (const id of refunded) { const o = await this.tx('o', 'readonly', s => s.get(id)); if (o && o.status !== 'refunded') { o.status = 'refunded'; await this.tx('o', 'readwrite', s => s.put(o)); } }
    return rows.length;
  },
  async count() { return (await this.tx('o', 'readonly', s => s.count())) || 0; },
  // ดึงบิลใหม่ (2 วันล่าสุด) — ถ้าเปลี่ยนแจ้งหน้าให้วาดใหม่
  sync(force) {
    if (!this.allowed() || (typeof Net !== 'undefined' && !Net.ok && !force)) return Promise.resolve(false);
    if (this.syncing) return this.syncing;
    if (!force && Date.now() - this.lastSync < 20000) return Promise.resolve(false);
    return this.syncing = (async () => {
      try {
        const m = await this.getMeta(), t = todayISO();
        if (!m.from) { this.backfill(); return false; }        // ยังไม่เคยดึง → เริ่มดึงย้อนหลัง
        const from = m.last ? addDays(m.last, -2) : addDays(t, -2);
        if (window.Sync && Sync.box.length) await Sync.flush();
        const rows = (await apiRaw('ordersRange', { from, to: t })).rows || [];
        const before = JSON.stringify(await this.query(from, t, true));
        await this.put(rows);
        m.last = t; m.at = Date.now(); this.lastSync = Date.now(); await this.saveMeta();
        const changed = before !== JSON.stringify(await this.query(from, t, true));
        if (changed) document.dispatchEvent(new CustomEvent('mm:data', { detail: 'ostore' }));
        return changed;
      } catch (e) { return false; } finally { this.syncing = null; }
    })();
  },
  // ดึงย้อนหลังทีละเดือน (เบื้องหลัง ไม่รบกวนการขาย)
  async backfill() {
    if (this.busy || !this.allowed()) return; this.busy = true;
    try {
      const m = await this.getMeta(), t = todayISO();
      const target = addDays(t.slice(0, 8) + '01', 0).slice(0, 7);   // เดือนนี้
      const [ty, tm] = target.split('-').map(Number); const startD = new Date(Date.UTC(ty, tm - 1 - (this.MONTHS - 1), 1)); const goal = startD.toISOString().slice(0, 10);
      if (!m.from) { // เริ่มจากเดือนนี้ก่อน (เห็นผลเร็วที่สุด)
        const f = t.slice(0, 8) + '01';
        await this.put((await apiRaw('ordersRange', { from: f, to: t })).rows || []);
        m.from = f; m.last = t; m.at = Date.now(); this.lastSync = Date.now(); await this.saveMeta();
        document.dispatchEvent(new CustomEvent('mm:data', { detail: 'ostore' }));
      }
      while (m.from > goal && this.allowed() && (typeof Net === 'undefined' || Net.ok)) {
        const end = addDays(m.from, -1), f = end.slice(0, 8) + '01';
        await this.put((await apiRaw('ordersRange', { from: f, to: end })).rows || []);
        m.from = f; await this.saveMeta();
        document.dispatchEvent(new CustomEvent('mm:data', { detail: 'ostore' }));
        await new Promise(r => setTimeout(r, 400));
      }
      m.count = await this.count(); await this.saveMeta();
    } catch (e) { } finally { this.busy = false; }
  },
  // อ่านบิลในช่วงวันที่ จากเครื่อง (null = ช่วงนี้ยังไม่มีในเครื่อง → ใช้ออนไลน์)
  async query(from, to, any) {
    const m = await this.getMeta();
    if (!any && (!m.from || from < m.from)) return null;
    const rows = await this.db().then(db => db ? new Promise(res => { try { const out = []; const r = db.transaction('o').objectStore('o').index('date').openCursor(IDBKeyRange.bound(from, to + 'T99')); r.onsuccess = () => { const c = r.result; if (c) { out.push(c.value); c.continue(); } else res(out); }; r.onerror = () => res(null); } catch (e) { res(null); } }) : null);
    return rows;
  },
  // สรุปรายวันจากบิลในเครื่อง (รูปแบบเดียวกับ dailySummary ของเซิร์ฟเวอร์)
  async days(from, to) {
    const mk = from + '|' + to + '|' + (this.ver || 0) + '|' + (window.Sync ? Sync.box.length : 0);
    const dm = this.dm || (this.dm = new Map()); if (dm.has(mk)) return dm.get(mk);
    const rows = await this.query(from, to); if (!rows) return null;
    const pend = (window.Sync ? Sync.box : []).filter(o => o.date.slice(0, 10) >= from && o.date.slice(0, 10) <= to && !rows.some(x => x.id === o.id));
    const ex = {}; ((cfg('vatCfg', {}).exemptCats) || []).forEach(c => ex[c] = 1);
    // ยกเว้น VAT นับตามหมวด "ปัจจุบัน" ของสินค้า (แก้หมวดแล้วยอดย้อนหลังถูกต้องทันที) · สินค้าที่ลบไปแล้วใช้หมวดตอนขาย
    const bs = (typeof IDX !== 'undefined' && IDX.bySku) || {}, catOf = it => { const p = it.sku && bs[it.sku]; return p ? (p.category || '') : (it.cat || ''); };
    const days = {}, J = (s, d) => { try { return typeof s === 'string' ? JSON.parse(s || 'null') || d : s || d; } catch (e) { return d; } };
    rows.concat(pend).forEach(o => {
      const k = String(o.date).slice(0, 10), x = days[k] || (days[k] = { gross: 0, refund: 0, disc: 0, net: 0, cost: 0, count: 0, pass: 0, exempt: 0, src: 'POS' });
      const t = num(o.total), sg = o.status === 'refund' ? -1 : 1;
      if (sg < 0) { x.refund += -t; x.cost -= Math.abs(num(o.cost)); } else { x.gross += num(o.subtotal) || t; x.disc += num(o.discount); x.count++; x.cost += num(o.cost); }
      x.net += t;
      J(o.items, []).forEach(it => { const a = sg * Math.abs(num(it.qty) * num(it.price)); if (it.pass) x.pass += a; else if (ex[catOf(it)]) x.exempt += a; });
    });
    Object.values(days).forEach(d => ['gross', 'refund', 'disc', 'net', 'cost', 'pass', 'exempt'].forEach(f => d[f] = Math.round(d[f] * 100) / 100));
    dm.set(mk, days); if (dm.size > 8) dm.delete(dm.keys().next().value);
    return days;
  },
  async info() { const m = await this.getMeta(); return { from: m.from, last: m.last, at: m.at, count: await this.count(), busy: this.busy }; },
  async reset() { await this.tx('o', 'readwrite', s => s.clear()); this.meta = { owner: this.owner(), from: '', last: '', at: 0, count: 0 }; await this.saveMeta(); this.backfill(); },
  start() {
    if (this.started || !this.allowed()) return; this.started = true;
    setTimeout(() => this.backfill().then(() => this.sync()), 4000);
    // v2.7.0: ไม่ดึงยอดขายตอนกำลังยิงบาร์โค้ด (รอให้หยุดยิงก่อน) · ไม่ดึงเมื่ออยู่หน้าขายแบบเงียบ ๆ ทุก 2 นาที
    setInterval(() => { if (!document.hidden && S.view !== 'pos') whenQuiet('ostoreSync', () => this.sync()); }, 120000);
    document.addEventListener('mm:online', () => whenQuiet('ostoreBack', () => this.backfill().then(() => this.sync(true))));
  }
};
window.OStore = OStore;

// สรุปรายวัน: บิลขายจากเครื่อง (ทันที) + ยอดที่นำเข้าจาก Loyverse จากเซิร์ฟเวอร์ (แคช)
const dailySummaryServer = (from, to) => swr('d:' + from + '|' + to, () => api('dailySummary', { from, to }).then(r => r.days), 60000);
var dailySummary = async function (from, to) {
  const loc = OStore.allowed() ? await OStore.days(from, to).catch(() => null) : null;
  if (!loc) return dailySummaryServer(from, to);
  (S.deps || (S.deps = new Set())).add('ostore');
  const k = Cache.key('d:' + from + '|' + to), c = await Cache.get(k);
  let base;
  if (c) { base = c.v; dailySummaryServer(from, to).catch(() => { }); }
  else { base = {}; dailySummaryServer(from, to).then(() => document.dispatchEvent(new CustomEvent('mm:data', { detail: 'ostore' }))).catch(() => { }); }
  const out = {};
  Object.keys(base || {}).forEach(d => { if (base[d] && base[d].src !== 'POS') out[d] = base[d]; });   // ยอดนำเข้า (วันที่ไม่มีบิล POS)
  Object.keys(loc).forEach(d => out[d] = loc[d]);
  return out;
};

// (D) เตรียมข้อมูลล่วงหน้าหลังเข้าระบบ — ทุกคน: สินค้า รูป ลูกค้า · ผู้ดูรายงาน: บิลย้อนหลัง
function prefetchAll() {
  if (!S.user || !S.apiUrl) return;
  setTimeout(() => {
    try { typeof loadProducts === 'function' && loadProducts().catch(() => { }); } catch (e) { }
    try { window.Img && Img.sync(); } catch (e) { }
    try { typeof loadCustomers === 'function' && loadCustomers().catch(() => { }); } catch (e) { }
    try { window.Inst && (can('customers') || can('credit')) && Inst.list().catch(() => { }); } catch (e) { }
    OStore.start();
  }, 2500);
}
document.addEventListener('mm:booted', prefetchAll);
