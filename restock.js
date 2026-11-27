/* =========================================================
   วางแผนสั่งของ: วิเคราะห์ยอดขายรายสินค้า → สินค้าหมด/ใกล้หมด → แนะนำจำนวนสั่งให้พอถึงสิ้นเดือน
   · คำนวณเฉพาะตอนเปิดหน้านี้/หน้าหลักเจ้าของ (ไม่แตะหน้าขาย) · แบ่งงานเป็นช่วง ๆ ไม่ให้จอค้าง · จำผลไว้ 10 นาที
   · เจ้าของเปิด/ปิดระบบได้ (ตั้งค่า stockPlan)
   ========================================================= */
'use strict';
const Restock = {
  DEF: { on: true, mode: 'month', days: 30, lead: 2, safety: 3, look: 90, season: true, home: true, hist: true },
  conf() { return cfg('stockPlan', this.DEF); },
  on() { return !!this.conf().on; },
  memo: null, job: null,
  // ช่วงที่ต้องให้พอ: ถึงสิ้นเดือนนี้ (เหลือไม่ถึง 7 วัน → ถึงสิ้นเดือนหน้า) หรือจำนวนวันที่ตั้ง
  cover(C, t) {
    if (C.mode !== 'month') return { days: Math.max(1, +C.days || 30), label: `${Math.max(1, +C.days || 30)} วันข้างหน้า`, end: addDays(t, Math.max(1, +C.days || 30) - 1) };
    let end = this.eom(t), d = this.diff(t, end) + 1;
    if (d < 7) { end = this.eom(addDays(end, 1)); d = this.diff(t, end) + 1; }
    return { days: d, end, label: `ถึงสิ้นเดือน ${TH_MF[+end.slice(5, 7) - 1]} (${d} วัน)` };
  },
  // ตัวคูณฤดูกาล = ดัชนีเฉลี่ยช่วงที่จะขาย ÷ ดัชนีเฉลี่ย 28 วันล่าสุด (จำกัด 0.7–1.6)
  sf(ix, mW, bW) { const m = W => { let a = 0, n = 0; for (const k in W) if (ix[k] != null) { a += ix[k] * W[k]; n += W[k]; } return n ? a / n : 1; }; const f = m(mW) / Math.max(.05, m(bW)); return isFinite(f) ? Math.min(1.6, Math.max(.7, f)) : 1; },
  itemFactor(h, ix0, mW, bW) {
    if (!h) return this.sf(ix0, mW, bW);
    if (h._f != null && h._k === this._fk) return h._f;
    let ix = ix0;
    if (h.qty >= 120) { const own = RHist.index(h.m); if (own) ix = ix0.map((v, k) => v == null ? v : own[k] == null ? v : .5 * own[k] + .5 * v); }
    h._k = this._fk; return (h._f = this.sf(ix, mW, bW));
  },
  eom: iso => addDays(addDays(iso.slice(0, 8) + '01', 32).slice(0, 8) + '01', -1),
  diff: (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5),
  key(C) { return [todayISO(), JSON.stringify(C), window.OStore ? OStore.ver || 0 : 0, window.Sync ? Sync.box.length : 0, S.products.length, (S.products[0] || {}).updatedAt || ''].join('|'); },
  // ผลล่าสุดที่จำไว้ (ไม่คำนวณใหม่) — ใช้กับป้ายหน้าหลัก
  cached() { const m = this.memo; return m && Date.now() - m.at < 10 * 60e3 ? m.res : null; },
  async run(force, onProg) {
    const C = this.conf(), k = this.key(C);
    if (!force && this.memo && this.memo.key === k && Date.now() - this.memo.at < 10 * 60e3) return this.memo.res;
    if (this.job && !force) return this.job;
    this.job = this._run(C, k, onProg).finally(() => { this.job = null; });
    return this.job;
  },
  async _run(C, k, onProg) {
    this._fk = k;
    const t0 = performance.now(), t = todayISO(), look = Math.max(14, +C.look || 90), from = addDays(t, -(look - 1)), cv = this.cover(C, t);
    const yieldUI = () => new Promise(r => setTimeout(r, 0));
    onProg && onProg('กำลังโหลดยอดขาย...');
    if (!S.products.length) await loadProducts(true).catch(() => { });
    const [rows0, pos, rcs, H] = await Promise.all([
      fetchOrders(from, t),
      quick(api('list', { table: 'POs' }).then(r => r.rows), 3000, S.pos || []).catch(() => S.pos || []),
      quick(loadTable('Receipts'), 3000, S.receipts || []).catch(() => S.receipts || []),
      C.hist === false ? null : RHist.get().catch(() => null)
    ]);
    const rows = H ? rows0.filter(o => !/^LV-/.test(o.id || '')) : rows0;   // ใบเสร็จระบบเดิมที่เคยนำเข้า = อยู่ในประวัติแล้ว
    S.pos = pos || []; S.receipts = rcs || S.receipts || [];
    onProg && onProg('กำลังวิเคราะห์...');
    // รวมจำนวนขายต่อสินค้า: 7 วัน · 28 วัน · ทั้งช่วง · วันที่ขายล่าสุด (แบ่งทีละ 800 บิลไม่ให้จอค้าง)
    const d7 = addDays(t, -6), d28 = addDays(t, -27), A = {};
    let first = t;
    for (let i = 0; i < rows.length; i++) {
      const o = rows[i], d = String(o.date).slice(0, 10), sg = o.status === 'refund' ? -1 : 1;
      if (d < first) first = d;
      const its = o._items || [];
      for (let j = 0; j < its.length; j++) {
        const it = its[j]; if (!it.sku || it.pass || it.debt || it.inst) continue;
        const q = sg * Math.abs(num(it.qty)), a = A[it.sku] || (A[it.sku] = { q7: 0, q28: 0, qL: 0, last: '', days: new Set() });
        a.qL += q; if (d >= d28) a.q28 += q; if (d >= d7) a.q7 += q; if (sg > 0) { if (d > a.last) a.last = d; a.days.add(d); }
      }
      if (i % 800 === 799) await yieldUI();
    }
    // วันที่มีข้อมูลจริงในแต่ละช่วง: บิลระบบนี้ (ตั้งแต่วันแรกที่มีบิล) + ประวัติระบบเดิม (ก่อนวันนั้น) — ไม่นับซ้ำ ไม่นับวันที่ไม่มีข้อมูล
    const posStart = rows.length ? first : addDays(t, 1), hEnd = H ? H.meta.to : '', hRf = H ? H.rf : '';
    const cov = ws => { let c = 0; const pf = posStart > ws ? posStart : ws; if (pf <= t) c += this.diff(pf, t) + 1;
      if (H && hRf) { const a2 = hRf > ws ? hRf : ws, e = [hEnd, addDays(posStart, -1), t].sort()[0]; if (a2 <= e) c += this.diff(a2, e) + 1; } return c; };
    const cL = cov(from), c28 = cov(d28), c7 = cov(d7), avail = Math.max(1, cL);
    if (H && hRf) {
      const dd = [], f7 = [], f28 = [], fL = []; for (let k = 0; k < RHist.D; k++) { const d = addDays(hRf, k); dd.push(d); const ok = d < posStart && d >= from && d <= t; fL.push(ok); f28.push(ok && d >= d28); f7.push(ok && d >= d7); }
      Object.entries(H.by).forEach(([sku, h]) => {
        const rc = h.rc; let a = A[sku];
        for (let k = 0; k < RHist.D; k++) { const q = rc[k]; if (!q || !fL[k]) continue; a = a || (A[sku] = { q7: 0, q28: 0, qL: 0, last: '', days: new Set() }); a.qL += q; if (f28[k]) a.q28 += q; if (f7[k]) a.q7 += q; if (q > 0) { if (dd[k] > a.last) a.last = dd[k]; a.days.add(dd[k]); } }
      });
      await yieldUI();
    }
    // ปรับตามฤดูกาล: ยอดขายร้านช่วงเดียวกันปีก่อน เทียบ 28 วันก่อนหน้านั้น (ใช้ยอดรายวันรวมยอดที่นำเข้า)
    let factor = 1, fNote = 'ไม่ได้ปรับตามฤดูกาล', IDX0 = null, mW = null, bW = null;
    if (C.season && H && H.idx) {
      // ฤดูกาลรายสินค้า: ดัชนีรายเดือนจากประวัติหลายปี (สินค้าขายน้อยใช้ดัชนีของทั้งร้าน)
      IDX0 = H.idx; mW = {}; bW = {};
      for (let k = 0; k < cv.days + (+C.safety || 0); k++) { const mo = +addDays(t, k).slice(5, 7); mW[mo] = (mW[mo] || 0) + 1; }
      for (let k = 0; k < 28; k++) { const mo = +addDays(t, -k).slice(5, 7); bW[mo] = (bW[mo] || 0) + 1; }
      const yrs = new Set(Object.keys(H.shop).map(k => k.slice(0, 4))).size;
      factor = this.sf(IDX0, mW, bW);
      fNote = `ฤดูกาลรายสินค้าจากประวัติ ${yrs} ปี · ทั้งร้านช่วงนี้ ${factor >= 1.02 ? `ขายดีขึ้น ${Math.round((factor - 1) * 100)}%` : factor <= .98 ? `ขายลดลง ${Math.round((1 - factor) * 100)}%` : 'ใกล้เคียงเดิม'}`;
    } else if (C.season) {
      try {
        const ly = addDays(t, -364), lyEnd = addDays(ly, cv.days - 1), lyB = addDays(ly, -28);
        const D = await quick(dailySummary(lyB, lyEnd), 3000, {}), sum = (a, b) => Object.entries(D || {}).filter(([d]) => d >= a && d <= b).reduce((s, [, x]) => s + num(x.net) - num(x.pass), 0);
        const nb = Object.keys(D || {}).filter(d => d >= lyB && d < ly).length, nc = Object.keys(D || {}).filter(d => d >= ly && d <= lyEnd).length;
        if (nb >= 14 && nc >= Math.min(7, cv.days)) {
          const f = (sum(ly, lyEnd) / nc) / Math.max(1, sum(lyB, addDays(ly, -1)) / nb);
          if (isFinite(f) && f > 0) { factor = Math.min(1.3, Math.max(.8, f)); fNote = factor >= 1.02 ? `ปีก่อนช่วงนี้ขายดีขึ้น ${Math.round((factor - 1) * 100)}% → เผื่อเพิ่ม` : factor <= .98 ? `ปีก่อนช่วงนี้ขายลดลง ${Math.round((1 - factor) * 100)}% → สั่งลดลง` : 'ปีก่อนช่วงนี้ยอดใกล้เคียงเดิม'; }
        } else fNote = 'ยังไม่มียอดขายปีก่อนช่วงนี้';
      } catch (e) { fNote = 'อ่านยอดปีก่อนไม่ได้'; }
    }
    // สั่งแล้วรอของ (ใบสั่งซื้อที่ยังไม่รับของ) · ร้านที่ซื้อล่าสุดต่อสินค้า (จากใบสั่งซื้อ/ใบเสร็จร้านส่ง)
    const onOrder = {}, sup = {};
    (S.pos || []).forEach(po => { const J = Logic.J(po.items, []); if (po.status !== 'received' && po.status !== 'cancelled') J.forEach(i => { if (i.sku) onOrder[i.sku] = (onOrder[i.sku] || 0) + num(i.qty); }); J.forEach(i => { if (i.sku && po.supplier && (!sup[i.sku] || po.date > sup[i.sku].d)) sup[i.sku] = { s: po.supplier, d: po.date, c: num(i.cost) }; }); });
    (S.receipts || []).forEach(r => { if (!r.supplier) return; Logic.J(r.items, []).forEach(i => { if (i.sku && (!sup[i.sku] || String(r.date) > sup[i.sku].d)) sup[i.sku] = { s: r.supplier, d: String(r.date), c: num(i.unitCost) }; }); });
    await yieldUI();
    const need = cv.days + (+C.safety || 0), urgentDays = (+C.lead || 0) + (+C.safety || 0), items = [], untracked = [];
    const rnd = (v, w) => w ? Math.ceil(v * 2) / 2 : Math.ceil(v - 1e-9);
    S.products.forEach(p => {
      if (p.available === 'N') return;
      const a = A[p.sku], w = p.byWeight === 'Y';
      const v7 = a ? a.q7 / Math.max(1, c7) : 0, v28 = a ? a.q28 / Math.max(1, c28) : 0, vL = a ? a.qL / Math.max(1, cL) : 0;
      const fac = IDX0 ? this.itemFactor(H.by[p.sku], IDX0, mW, bW) : factor;
      const W = [[v7, .2, c7 >= 4], [v28, .45, c28 >= 14], [vL, .35, cL >= 28]].filter(x => x[2]), ws = W.reduce((s2, x) => s2 + x[1], 0);
      const daily = Math.max(0, (ws ? W.reduce((s2, x) => s2 + x[0] * x[1], 0) / ws : vL) * fac);
      if (p.trackStock !== 'Y') { if (daily > 0 && num(p.price) > 0 && !/ระบุ|อื่น ?ๆ|เบ็ดเตล็ด|^ขนม \d+ ?บาท|^ลูกอม.*\d+ ?บาท/.test(p.name || '')) untracked.push({ p, daily, fac, need: daily * need }); return; }
      // สต็อกติดลบ = ตัวเลขไม่ถูกต้อง (ขายเกินที่บันทึกรับเข้า) → คิดเป็น 0 และเตือนให้ตรวจนับ
      const raw = num(p.stock), neg = raw < 0, stock = Math.max(0, raw), oo = onOrder[p.sku] || 0, min = num(p.lowStock);
      const target = Math.max(daily * need, min > 0 ? min + daily * urgentDays : 0), tiny = target < .5 && min <= 0;   // ขายช้ามาก: ช่วงนี้คาดว่าขายไม่ถึงครึ่งชิ้น
      let sugg = tiny ? 0 : Math.max(0, target - stock - oo); sugg = sugg > 0 ? Math.max(w ? .5 : 1, rnd(sugg, w)) : 0;
      const left = daily > 0 ? stock / daily : Infinity;
      let st = tiny ? (stock > 0 && daily <= 0 ? 'slow' : stock > 0 && left > 120 ? 'over' : 'ok') : stock <= 0 && (daily > 0 || min > 0) ? 'out' : (daily > 0 && left <= urgentDays) || (min > 0 && stock <= min) ? 'urgent' : sugg > 0 ? 'order' : daily <= 0 && stock > 0 ? 'slow' : left > 120 ? 'over' : 'ok';
      if ((st === 'out' || st === 'urgent' || st === 'order') && !sugg && oo > 0) st = 'wait';   // สั่งแล้วพอ รอของเข้า
      const s2 = sup[p.sku];
      items.push({ p, daily, fac, stock, raw, neg, oo, sugg, left, st, sold: a ? Math.max(0, a.qL) : 0, last: a ? a.last : '', nd: a ? a.days.size : 0, sup: s2 ? s2.s : '', cost: num(p.cost) || (s2 ? s2.c : 0) });
    });
    const rank = { out: 0, urgent: 1, order: 2, wait: 3, ok: 4, over: 5, slow: 6 };
    items.sort((x, y) => rank[x.st] - rank[y.st] || (x.left - y.left) || (y.daily - x.daily));
    untracked.sort((x, y) => y.daily - x.daily);
    const cnt = { out: 0, urgent: 0, order: 0, wait: 0, ok: 0, over: 0, slow: 0 }; items.forEach(i => cnt[i.st]++);
    const toBuy = items.filter(i => i.sugg > 0), value = toBuy.reduce((s, i) => s + i.sugg * i.cost, 0);
    const res = { at: Date.now(), cv, factor, fNote, avail, look, rows: rows.length, hist: H ? H.meta : null, posStart: rows.length ? posStart : '', H, items, untracked: untracked.slice(0, 100), untrackedN: untracked.length, cnt, toBuy: toBuy.length, value, ms: Math.round(performance.now() - t0), C };
    this.memo = { key: k, at: Date.now(), res };
    return res;
  }
};
window.Restock = Restock;

(function () {
  const st = document.createElement('style'); st.textContent = `
.rs-k{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}.rs-k .stat{padding:10px 12px;cursor:pointer}.rs-k .stat .v{font-size:22px}
.rs-k .stat.on{outline:2px solid var(--ink);outline-offset:-2px}
@media(max-width:520px){.rs-k{grid-template-columns:repeat(2,1fr)}}
.rs-row{display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);box-shadow:inset 4px 0 0 var(--c,#CFC7C9)}.rs-row:last-child{border-bottom:0}
.rs-row input[type=checkbox]{width:20px;height:20px;flex:none;accent-color:var(--green)}
.rs-row .nm{font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3}
.rs-row{align-items:flex-start}.rs-row>input[type=checkbox]{margin-top:10px}.rs-ft{display:flex;align-items:flex-end;gap:8px;margin-top:3px}.rs-ft .rs-tl{flex:1;min-width:0}
.rs-bar{height:6px;border-radius:6px;background:#EFE9E8;overflow:hidden;margin-top:5px;max-width:240px}.rs-bar i{display:block;height:100%;border-radius:6px}
.rs-q{display:flex;align-items:center;gap:2px;flex:none}.rs-q button{all:unset;cursor:pointer;width:30px;height:32px;border-radius:9px;background:#F4F1EF;text-align:center;font-size:18px;line-height:32px;font-weight:700}
.rs-q input{width:52px;text-align:center;font:inherit;font-weight:700;font-size:17px;border:1.5px solid var(--line);border-radius:9px;height:32px;padding:0 2px;background:#fff}
#bt{position:sticky;bottom:8px;z-index:3}.rs-bot{display:flex;gap:8px;align-items:center;background:#fff;border-radius:16px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.18);margin-top:10px}
.rs-tl{font-size:12px;color:var(--ink2)}.rs-tl b{color:var(--ink)}
.rs-home{display:flex;gap:12px;align-items:center;cursor:pointer}.rs-home .ic2{width:44px;height:44px;border-radius:13px;background:#FFF3DC;display:flex;align-items:center;justify-content:center;font-size:24px;flex:none}`;
  document.head.appendChild(st);
})();
const RS_ST = { out: ['var(--red)', 'red', 'หมดแล้ว'], urgent: ['#F08C00', 'amber', 'ใกล้หมด สั่งด่วน'], order: ['#E3B008', 'amber', 'ควรสั่งเพิ่ม'], wait: ['#7B3FB8', 'blue', 'สั่งแล้ว รอของ'], ok: ['var(--green)', 'green', 'พอขาย'], over: ['#1F5FBF', 'blue', 'สต็อกเกิน'], slow: ['#9E9597', 'gray', 'ขายไม่ออก'] };
const rsQty = (v, w) => w ? (Math.round(v * 10) / 10).toLocaleString() : Math.round(v).toLocaleString();
// แถบล่างลอยเหนือแถบเมนูล่าง (ถ้ามี)
function rsSticky(x) { if (!x) return; const n = document.querySelector('.nav'), on = n && getComputedStyle(n).display !== 'none' && getComputedStyle(n).position === 'fixed'; x.style.bottom = (on ? n.offsetHeight + 8 : 8) + 'px'; }
const RS_WHY_T = 'ยอดขายเฉลี่ย (รวมผลฤดูกาลแล้ว) · 📈/📉 ฤดูกาล = ตัวคูณช่วงขายดี/ขายลง · แตะเพื่อดูวิธีคิด';
// อธิบายที่มาของ "ขาย …/สัปดาห์ · ฤดูกาล ×…" ของสินค้าแต่ละตัว
function rsWhy(i, R) {
  const C = R.C || {}, w = i.p.byWeight === 'Y', u = esc(i.p.unit || (w ? 'กก.' : 'ชิ้น')), f = i.fac || 1, base = f ? i.daily / f : i.daily;
  const r1 = v => (Math.round(v * 100) / 100).toLocaleString(), cv = R.cv || { days: 30, label: '30 วัน' }, sf = +C.safety || 0, need = i.daily * (cv.days + sf);
  const ov = sheet('ที่มาของตัวเลข', `<div class="small" style="line-height:1.65">
    <div style="font-size:17px;font-weight:700;margin-bottom:6px">${esc(i.p.name)}</div>
    <div class="card" style="padding:10px 12px;margin:0 0 10px"><b>ขาย ${rsRate(i.daily, w)}</b> = ยอดขายเฉลี่ยที่คาดว่าจะขายได้ในช่วงที่จะสั่งของ<br>
      · ยอดขายจริงเฉลี่ย <b>${r1(base)} ${u}/วัน</b> (${r1(base * 7)} ${u}/สัปดาห์) คิดผสมจาก 3 ช่วง: 7 วันล่าสุด (20%) · 28 วันล่าสุด (45%) · ${R.look || C.look || 90} วันล่าสุด (35%) — นับเฉพาะวันที่มีข้อมูลขาย ช่วงล่าสุดมีน้ำหนักมากเพื่อตามทันกระแส<br>
      · คูณฤดูกาล ×${f.toFixed(2)} → <b>${r1(i.daily)} ${u}/วัน</b>${i.daily < 1 ? ` (แสดงเป็นต่อสัปดาห์ = ${r1(i.daily * 7)})` : ''}</div>
    <div class="card" style="padding:10px 12px;margin:0 0 10px"><b>${f > 1 ? '📈' : f < 1 ? '📉' : ''} ฤดูกาล ×${f.toFixed(2)}</b> = ช่วงที่จะสั่งของนี้ (${esc(cv.label || '')}) ปีก่อน ๆ ขาย${f >= 1 ? 'ดีกว่า' : 'น้อยกว่า'}ช่วง 28 วันที่ผ่านมา <b>${Math.abs(Math.round((f - 1) * 100))}%</b> ระบบจึง${f >= 1 ? 'เผื่อสั่งเพิ่ม' : 'ลดจำนวนสั่ง'}ตามนั้น<br>
      · ${esc(R.fNote || 'คิดจากประวัติยอดขายรายเดือน')} · จำกัดตัวคูณ 0.7–1.6 เท่า · ×1.00 = เดือนปกติ (แสดงเมื่อต่างจากปกติ 10% ขึ้นไป)</div>
    <div class="card" style="padding:10px 12px;margin:0"><b>ควรมี</b> = ขาย/วัน × (ช่วงสั่งของ ${cv.days} วัน + สำรอง ${sf} วัน) = <b>${rsQty(need, w)} ${u}</b>${i.stock != null ? `<br>· เหลือ ${rsQty(i.stock, w)}${i.oo ? ` · สั่งแล้วรอของ ${rsQty(i.oo, w)}` : ''} → แนะนำสั่ง <b>${rsQty(i.sugg || 0, w)} ${u}</b>` : ''}</div>
    <div class="tiny muted" style="margin-top:8px">ปรับช่วงสั่งของ/สำรอง/ยอดย้อนหลัง/ฤดูกาลได้ที่ ⚙️ ตั้งค่า</div></div>`);
  return ov;
}
const rsRate = (v, w, u) => v <= 0 ? '0' : v >= 1 ? `${(Math.round(v * 10) / 10).toLocaleString()}/วัน` : `${(Math.round(v * 70) / 10).toLocaleString()}/สัปดาห์`;
const rsDay = d => !isFinite(d) ? '—' : d < 1 ? 'ไม่ถึง 1 วัน' : d >= 365 ? 'เกิน 1 ปี' : Math.floor(d) + ' วัน';

VIEWS.restock = async el => {
  if (ownerOnly(el)) return;
  const C = Restock.conf(), F = S.rsF || (S.rsF = { tab: 'need', q: '', cat: '', sel: null, qty: {} });
  el.innerHTML = vhead('วางแผนสั่งของ', `<button class="btn ghost sm" id="cfg">${I(IC.gear, 18)} ตั้งค่า</button>`, 'inventory') + '<div id="rsb"></div>';
  $('#cfg', el).onclick = () => restockCfg(() => go('restock'));
  const box = $('#rsb', el);
  if (!C.on) { box.innerHTML = `<div class="card empty">${I(IC.box, 40)}<p><b>ระบบวางแผนสั่งของปิดอยู่</b></p><p class="small muted">เปิดแล้วระบบวิเคราะห์ยอดขายรายสินค้า บอกว่าตัวไหนหมด/ใกล้หมด และควรสั่งเพิ่มเท่าไหร่ให้พอขายถึงสิ้นเดือน</p><button class="btn green" id="en">เปิดใช้งาน</button></div>`; $('#en', box).onclick = async () => { await saveSetting('stockPlan', { ...C, on: true }); go('restock'); }; return; }
  box.innerHTML = `<div class="card center" style="padding:30px"><span class="spin dark"></span><div class="small muted" id="pg" style="margin-top:8px">กำลังวิเคราะห์ยอดขาย...</div></div>`;
  let R;
  try { R = await Restock.run(!!F.force, m => { const g = $('#pg', box); if (g) g.textContent = m; }); F.force = 0; }
  catch (e) { box.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }
  if (!el.isConnected) return;
  if (!F.sel || F.selAt !== R.at) { F.sel = new Set(R.items.filter(i => i.sugg > 0 && (i.st === 'out' || i.st === 'urgent' || i.st === 'order')).map(i => i.p.sku)); F.qty = {}; F.selAt = R.at; }
  const qOf = i => F.qty[i.p.sku] != null ? F.qty[i.p.sku] : i.sugg;
  const cats = [...new Set(R.items.map(i => i.p.category || ''))].sort((a, b) => a.localeCompare(b, 'th'));
  const tracked = R.items.length, upd = new Date(R.at), nOut = R.items.filter(i => i.sugg > 0 && i.st === 'out').length, nUrg = R.items.filter(i => i.sugg > 0 && i.st === 'urgent').length, nOrd = R.items.filter(i => i.sugg > 0 && i.st === 'order').length;
  box.innerHTML = `
    <div class="rs-k">
      <div class="stat" data-k="out" style="box-shadow:inset 0 3px 0 var(--red),var(--sh)"><div class="k">🔴 หมดแล้ว</div><div class="v" style="color:var(--red)">${nOut}</div></div>
      <div class="stat" data-k="urgent" style="box-shadow:inset 0 3px 0 #F08C00,var(--sh)"><div class="k">🟠 ใกล้หมด</div><div class="v" style="color:#C25E00">${nUrg}</div></div>
      <div class="stat" data-k="order" style="box-shadow:inset 0 3px 0 #E3B008,var(--sh)"><div class="k">🟡 ควรสั่งเพิ่ม</div><div class="v">${nOrd}</div></div>
      <div class="stat" data-k="need" style="box-shadow:inset 0 3px 0 var(--green),var(--sh)"><div class="k">💰 งบสั่งของ</div><div class="v num" style="font-size:19px">${bahtL(R.value, 0)}</div></div>
    </div>
    <div class="card small" style="padding:10px 12px;margin-bottom:10px;line-height:1.55">
      📅 ให้พอขาย <b>${R.cv.label}</b> + สำรอง ${C.safety} วัน · ของมาส่งใน ${C.lead} วัน<br>
      📈 ใช้ยอดขาย ${Math.min(R.look, R.avail)} วัน${R.hist ? ` — ${R.posStart ? `บิลระบบนี้ตั้งแต่ ${thDate(R.posStart)} (${R.rows.toLocaleString()} บิล) + ประวัติระบบเดิมก่อนหน้านั้น` : `จากประวัติระบบเดิม (ถึง ${thDate(R.hist.to)})`}` : ` ล่าสุด (${R.rows.toLocaleString()} บิล)`} · ${C.season ? `${R.hist && R.H && R.H.idx ? '' : `ฤดูกาล ×${R.factor.toFixed(2)} — `}${esc(R.fNote)}` : 'ไม่ปรับตามฤดูกาล'}<br>
      ${R.hist ? `📚 ประวัติระบบเดิม ${thDate(R.hist.from)} – ${thDate(R.hist.to)} · ${num(R.hist.bills).toLocaleString()} บิล · ${num(R.hist.items).toLocaleString()} สินค้า · <a href="javascript:void 0" id="hi">อัปเดต</a><br>` : ''}
      ${R.items.some(i => i.neg) ? `<span style="color:var(--red)">⚠ สต็อกติดลบ ${R.items.filter(i => i.neg).length} รายการ (คิดเป็น 0) — ควร<a href="javascript:void go('stockcount')">ตรวจนับสต็อก</a></span><br>` : ''}
      <span class="tiny muted">ติดตามสต็อก ${tracked.toLocaleString()} รายการ · คำนวณ ${R.ms} ms · อัปเดต ${String(upd.getHours()).padStart(2, '0')}:${String(upd.getMinutes()).padStart(2, '0')} · <a href="javascript:void 0" id="rf">คำนวณใหม่</a></span></div>
    ${!R.hist && R.avail < 60 ? `<div class="alert blue small" style="margin-bottom:10px;align-items:center">${I(IC.alert, 18)}<div class="grow">ระบบนี้มีบิลขายแค่ ${R.avail} วัน — <b>นำเข้าประวัติขายจากระบบเดิม (Loyverse)</b> ให้วิเคราะห์ได้แม่นทันที และคิดฤดูกาลรายสินค้าได้</div><button class="btn sm" id="hi2">นำเข้า</button></div>` : ''}
    <div class="seg" id="tb" style="margin-bottom:8px">${[['need', `ต้องสั่ง (${R.toBuy})`], ...(R.cnt.wait ? [['wait', `รอของ (${R.cnt.wait})`]] : []), ['all', 'ทั้งหมด'], ['slow', `ขายไม่ออก (${R.cnt.slow + R.cnt.over})`], ['untr', `ไม่ได้ติดตาม (${R.untrackedN})`]].map(([k, n]) => `<button data-t="${k}" class="${F.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="row" style="gap:8px;margin-bottom:8px"><input class="in grow" id="q" placeholder="ค้นหาสินค้า" value="${esc(F.q)}"><select class="in" id="ct" style="max-width:42%"><option value="">ทุกหมวด</option>${cats.map(c => `<option ${(c || '__none') === F.cat ? 'selected' : ''} value="${esc(c || '__none')}">${esc(c || 'ไม่ระบุหมวด')}</option>`).join('')}</select></div>
    <div id="ls"></div><div id="bt"></div>`;
  $('#rf', box).onclick = () => { F.force = 1; go('restock'); };
  [$('#hi', box), $('#hi2', box)].forEach(b => b && (b.onclick = () => restockImport(() => { F.force = 1; go('restock'); })));
  $$('#tb button', box).forEach(b => b.onclick = () => { F.tab = b.dataset.t; F.st = ''; $$('#tb button', box).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $$('.rs-k .stat', box).forEach(s => s.onclick = () => { F.tab = 'need'; F.st = F.st === s.dataset.k || s.dataset.k === 'need' ? '' : s.dataset.k; $$('#tb button', box).forEach(x => x.classList.toggle('on', x.dataset.t === 'need')); draw(); });
  let qt = 0; $('#q', box).oninput = e => { clearTimeout(qt); qt = setTimeout(() => { F.q = e.target.value; draw(); }, 150); };
  $('#ct', box).onchange = e => { F.cat = e.target.value; draw(); };
  const match = i => (!F.cat || (i.p.category || '__none') === F.cat) && (!F.q || norm(i.p.name + (i.p.barcode || '')).includes(norm(F.q)));
  box._R = R; if (!box._why) { box._why = 1; box.addEventListener('click', e => { const t = e.target.closest && e.target.closest('[data-why]'); if (!t) return; e.stopPropagation(); e.preventDefault(); const R2 = box._R, sku = t.dataset.why; const i = R2.items.find(y => y.p.sku === sku) || (R2.untracked || []).map(y => ({ ...y, stock: null, sugg: 0, oo: 0 })).find(y => y.p.sku === sku); i && rsWhy(i, R2); }, true); }
  const draw = () => {
    $$('.rs-k .stat', box).forEach(s => s.classList.toggle('on', F.tab === 'need' && F.st === s.dataset.k));
    const ls = $('#ls', box), LIM = 150;
    if (F.tab === 'untr') {
      const L = R.untracked.filter(match);
      F.cnt = F.cnt || {};
      ls.innerHTML = `<div class="alert blue small" style="margin-bottom:8px">${I(IC.alert, 18)}<div>สินค้าขายดีที่ยัง <b>ไม่ได้ติดตามสต็อก</b> — ระบบบอกได้ว่า<b>ควรมีของเท่าไหร่</b>ให้พอขาย${esc(R.cv.label.replace(/ \(.*/, ''))} · <b>ใส่จำนวนที่มีบนชั้น</b> แล้วระบบบอกจำนวนที่ต้องสั่ง · กด “เริ่มติดตามสต็อก” เพื่อให้ระบบนับให้เองต่อจากนี้</div></div>`
        + (L.length ? `<div class="list">${L.slice(0, LIM).map(i => { const w = i.p.byWeight === 'Y', c = F.cnt[i.p.sku], nd = Math.ceil(i.need - 1e-9), sg = c == null || c === '' ? null : Math.max(0, Math.ceil(i.need - num(c) - 1e-9)); return `<div class="rs-row" style="--c:#1F5FBF"><span data-ud="${esc(i.p.sku)}" style="cursor:pointer;flex:none">${pthumb(i.p, 38)}</span><div class="grow" style="min-width:0"><div class="nm" data-ud="${esc(i.p.sku)}" style="cursor:pointer">${esc(i.p.name)}</div>
          <div class="rs-tl"><span class="rs-why" data-why="${esc(i.p.sku)}" title="${RS_WHY_T}">ขาย <b>${rsRate(i.daily)}</b>${Math.abs(i.fac - 1) >= .1 ? ` · ${i.fac > 1 ? '📈' : '📉'} ฤดูกาล ×${i.fac.toFixed(2)}` : ''} <i>ⓘ</i></span> · ควรมี <b>${rsQty(nd, w)}</b> ${esc(i.p.unit || 'ชิ้น')}</div>
          <div class="rs-ft"><div class="rs-tl">${sg == null ? 'ใส่จำนวนที่มี →' : sg > 0 ? `<b style="color:#C25E00">ต้องสั่ง ${rsQty(sg, w)}</b>` : '<b style="color:var(--green)">พอแล้ว</b>'}</div><div style="text-align:right;flex:none"><div class="tiny muted">มีอยู่</div><div class="rs-q"><input data-c="${esc(i.p.sku)}" type="number" inputmode="decimal" value="${c == null ? '' : c}" placeholder="—"></div></div></div></div></div>`; }).join('')}</div>` : '<div class="card empty">ไม่มี</div>');
      $$('[data-ud]', ls).forEach(x => x.onclick = () => { const i = R.untracked.find(y => y.p.sku === x.dataset.ud); i && rsDetail({ ...i, stock: null, sugg: 0, st: 'untr', oo: 0, cost: num(i.p.cost) }, R); });
      $$('[data-c]', ls).forEach(x => x.onchange = () => { F.cnt[x.dataset.c] = x.value === '' ? null : Math.max(0, num(x.value)); draw(); });
      const ent = Object.entries(F.cnt).filter(([, v]) => v != null);
      $('#bt', box).innerHTML = ent.length ? `<div class="rs-bot"><div class="grow"><b>${ent.length}</b> รายการที่ใส่จำนวน<div class="tiny muted">ตั้งคงเหลือตามที่ใส่ แล้วเริ่มติดตามสต็อก</div></div><button class="btn green sm" id="trk">เริ่มติดตามสต็อก</button></div>` : '';
      rsSticky($('#bt', box));
      const tk = $('#trk', box); if (tk) tk.onclick = async () => {
        if (!(await confirmDlg(`ตั้งจำนวนคงเหลือและเปิด “ติดตามสต็อก” ${ent.length} รายการ? ต่อจากนี้ขาย = ตัดสต็อกอัตโนมัติ`, 'เริ่มติดตาม'))) return;
        try { busy(1); await saveProducts(ent.map(([sku, v]) => ({ sku, trackStock: 'Y', stock: String(v) }))); busy(0); F.cnt = {}; F.tab = 'need'; F.force = 1; toast(`เริ่มติดตามสต็อก ${ent.length} รายการแล้ว`); go('restock'); } catch (e) { busy(0); toast(e.message, 1); }
      };
      return;
    }
    let L = R.items.filter(match);
    if (F.tab === 'need') L = L.filter(i => i.sugg > 0 && (!F.st || i.st === F.st));
    else if (F.tab === 'wait') L = L.filter(i => i.st === 'wait');
    else if (F.tab === 'slow') L = L.filter(i => i.st === 'slow' || i.st === 'over').sort((a, b) => b.stock * b.cost - a.stock * a.cost);
    const tied = F.tab === 'slow' ? L.reduce((s, i) => s + i.stock * i.cost, 0) : 0;
    ls.innerHTML = (F.tab === 'slow' && L.length ? `<div class="alert amber small" style="margin-bottom:8px">${I(IC.alert, 18)}<div>สินค้าค้างสต็อก ${L.length} รายการ เป็นเงินจมประมาณ <b>${baht(tied)}</b> (ตามต้นทุน) — ชะลอการสั่ง หรือจัดโปรระบายของ</div></div>` : '')
      + (L.length ? `<div class="list">${L.slice(0, LIM).map(i => {
        const [c, tg, nm] = RS_ST[i.st], w = i.p.byWeight === 'Y', u = esc(i.p.unit || (w ? 'กก.' : 'ชิ้น')), cvd = R.cv.days + (+C.safety || 0);
        const pct = isFinite(i.left) ? Math.max(3, Math.min(100, i.left / cvd * 100)) : 100, q = qOf(i);
        return `<div class="rs-row" style="--c:${c}">${F.tab === 'need' ? `<input type="checkbox" data-s="${esc(i.p.sku)}" ${F.sel.has(i.p.sku) ? 'checked' : ''}>` : ''}<span data-dt="${esc(i.p.sku)}" style="cursor:pointer;flex:none">${pthumb(i.p, 40)}</span>
          <div class="grow" style="min-width:0"><div class="nm pnm" data-pinfo="${esc(i.p.sku)}">${esc(i.p.name)}</div>
            <div class="rs-tl"><span class="tag ${tg}" style="padding:1px 7px">${nm}</span> เหลือ <b>${i.neg ? `<span style="color:var(--red)" title="สต็อกติดลบ — ควรตรวจนับ">${rsQty(i.raw, w)} ⚠</span>` : rsQty(i.stock, w)}</b> · <span class="rs-why" data-why="${esc(i.p.sku)}" title="${RS_WHY_T}">ขาย <b>${rsRate(i.daily, w)}</b>${Math.abs(i.fac - 1) >= .1 ? ` · <span style="color:${i.fac > 1 ? '#0B8A3E' : '#9E9597'}">${i.fac > 1 ? '📈' : '📉'} ฤดูกาล ×${i.fac.toFixed(2)}</span>` : ''} <i>ⓘ</i></span>${i.oo ? ` · สั่งแล้ว ${rsQty(i.oo, w)}` : ''}</div>
            <div class="rs-bar"><i style="width:${pct}%;background:${c}"></i></div>
            <div class="rs-ft"><div class="rs-tl">${i.st === 'slow' ? (i.last ? 'ขายล่าสุด ' + thDate(i.last) : `ไม่มียอดขาย ${R.look} วัน`) : i.neg ? '<span style="color:var(--red)">สต็อกติดลบ — ควรตรวจนับ</span>' : i.stock <= 0 ? (i.daily * num(i.p.price) >= 5 ? `<span style="color:var(--red)">ขาดโอกาสขาย ~${baht(i.daily * num(i.p.price), 0)}/วัน</span>` : 'หมดสต็อก') : `พออีก <b>${rsDay(i.left)}</b>`}${i.sup ? ` · 🏪 ${esc(i.sup)}` : ''}${i.st === 'slow' || i.st === 'over' ? ` · ทุนจม ${baht(i.stock * i.cost)}` : ''}</div>
          ${F.tab === 'need' ? `<div style="text-align:right;flex:none"><div class="tiny muted">สั่ง (${u}) · <span data-v="${esc(i.p.sku)}">${i.cost ? baht(q * i.cost) : 'ไม่มีทุน'}</span></div><div class="rs-q"><button data-m="${esc(i.p.sku)}">−</button><input data-q="${esc(i.p.sku)}" type="number" inputmode="decimal" value="${q}"><button data-p="${esc(i.p.sku)}">+</button></div></div>` : i.sugg ? `<div class="tiny muted" style="text-align:right;flex:none">ควรสั่ง <b style="font-size:16px;color:var(--ink)">${rsQty(i.sugg, w)}</b></div>` : ''}</div></div></div>`;
      }).join('')}${L.length > LIM ? `<div class="item center tiny muted" style="justify-content:center">แสดง ${LIM} จาก ${L.length} รายการ — ค้นหาหรือเลือกหมวดเพื่อดูเพิ่ม</div>` : ''}</div>`
        : `<div class="card empty">${F.tab === 'need' ? '🎉 ไม่มีสินค้าที่ต้องสั่งตอนนี้' : 'ไม่มีรายการ'}</div>`);
    $$('[data-dt]', ls).forEach(x => x.onclick = () => { const i = R.items.find(y => y.p.sku === x.dataset.dt); i && rsDetail(i, R); });
    if (F.tab === 'need') {
      const step = (sku, d, abs) => { const i = R.items.find(x => x.p.sku === sku), w = i.p.byWeight === 'Y'; F.qty[sku] = abs != null ? abs : Math.max(0, Math.round((qOf(i) + d * (w ? .5 : 1)) * 10) / 10); const inp = $(`[data-q="${CSS.escape(sku)}"]`, ls); if (inp) inp.value = F.qty[sku]; const vv = $(`[data-v="${CSS.escape(sku)}"]`, ls); if (vv && i.cost) vv.textContent = baht(F.qty[sku] * i.cost); if (F.qty[sku] > 0) F.sel.add(sku); foot(); };
      $$('[data-m]', ls).forEach(b => b.onclick = () => step(b.dataset.m, -1));
      $$('[data-p]', ls).forEach(b => b.onclick = () => step(b.dataset.p, 1));
      $$('[data-q]', ls).forEach(x => x.onchange = () => { step(x.dataset.q, 0, Math.max(0, num(x.value))); });
      $$('[data-s]', ls).forEach(x => x.onchange = () => { x.checked ? F.sel.add(x.dataset.s) : F.sel.delete(x.dataset.s); foot(); });
    }
    foot();
  };
  const picked = () => R.items.filter(i => F.sel.has(i.p.sku) && qOf(i) > 0);
  const foot = () => {
    const bt = $('#bt', box); if (F.tab !== 'need') { bt.innerHTML = ''; return; }
    const P = picked(), v = P.reduce((s, i) => s + qOf(i) * i.cost, 0);
    bt.innerHTML = `<div class="rs-bot"><div class="grow"><b>${P.length}</b> รายการ<div class="tiny muted">${baht(v)}</div></div><button class="btn ghost sm" id="sh">📋 แชร์</button><button class="btn ghost sm" id="xl">Excel</button><button class="btn green sm" id="po" ${P.length ? '' : 'disabled'}>📝 ใบสั่งซื้อ</button></div>`;
    rsSticky(bt);
    $('#sh', bt).onclick = () => rsShare(P, qOf);
    $('#xl', bt).onclick = () => rsExcel(R, P, qOf);
    $('#po', bt).onclick = () => rsMakePO(P, qOf);
  };
  draw();
};
// ตั้งค่า (เจ้าของ)
function restockCfg(done) {
  const C = Restock.conf();
  const ov = sheet('ตั้งค่าวางแผนสั่งของ', `
    <label class="row card" style="gap:10px;padding:12px;cursor:pointer"><input type="checkbox" id="on" ${C.on ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--green)"><div class="grow"><b>เปิดใช้ระบบวางแผนสั่งของ</b><div class="tiny muted">ปิด = ซ่อนเมนูและป้ายบนหน้าหลัก ไม่คำนวณอะไรเลย (หน้าขายไม่ได้รับผลกระทบทั้งเปิดและปิด)</div></div></label>
    <label class="f"><span>สั่งให้พอขาย</span><select class="in" id="md"><option value="month">ถึงสิ้นเดือนนี้ (เหลือไม่ถึง 7 วัน = ถึงสิ้นเดือนหน้า)</option><option value="7">7 วันข้างหน้า</option><option value="14">14 วันข้างหน้า</option><option value="30">30 วันข้างหน้า</option><option value="60">60 วันข้างหน้า</option></select></label>
    <div class="grid2"><label class="f"><span>รอของมาส่ง (วัน)</span><input class="in" id="ld" type="number" inputmode="numeric" min="0" max="30" value="${C.lead}"></label><label class="f"><span>สำรองเผื่อ (วัน)</span><input class="in" id="sf" type="number" inputmode="numeric" min="0" max="30" value="${C.safety}"></label></div>
    <label class="f"><span>ใช้ยอดขายย้อนหลัง</span><select class="in" id="lk"><option value="28">28 วัน (ตามยอดล่าสุด)</option><option value="60">60 วัน</option><option value="90">90 วัน (แนะนำ)</option></select></label>
    <label class="row small" style="gap:8px;padding:6px 0"><input type="checkbox" id="ss" ${C.season ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--green)"> ปรับตามฤดูกาล (เทียบยอดขายร้านช่วงเดียวกันปีก่อน)</label>
    <label class="row small" style="gap:8px;padding:6px 0"><input type="checkbox" id="hs" ${C.hist !== false ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--green)"> ใช้ประวัติขายจากระบบเดิม (ช่วงที่ระบบนี้ยังไม่มีบิล + ฤดูกาลรายสินค้า)</label>
    <button class="btn ghost block sm" id="imp" type="button" style="margin:2px 0 8px">📚 ${RHist.meta() ? 'ประวัติระบบเดิม: ' + thDate(RHist.meta().from) + ' – ' + thDate(RHist.meta().to) + ' · อัปเดต/ลบ' : 'นำเข้าประวัติขายจากระบบเดิม (Loyverse)'}</button>
    <label class="row small" style="gap:8px;padding:6px 0"><input type="checkbox" id="hm" ${C.home ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--green)"> แสดงการ์ด “ควรสั่งของ” บนหน้าหลัก</label>
    <div class="card tiny muted" style="line-height:1.6;margin-top:6px"><b>วิธีคิด</b><br>ขายเฉลี่ย/วัน = 20% ของ 7 วันล่าสุด + 45% ของ 28 วัน + 35% ของช่วงที่เลือก (วันที่ระบบนี้ยังไม่มีบิลใช้ประวัติระบบเดิม) × ฤดูกาล<br>ฤดูกาล = ดัชนีรายเดือนจากประวัติหลายปี (สินค้าขายน้อยใช้ของทั้งร้าน) ช่วงที่จะขาย ÷ 28 วันล่าสุด<br>ควรมี = ขายเฉลี่ย/วัน × (วันที่ต้องให้พอ + สำรอง) · ไม่น้อยกว่า “เตือนเมื่อเหลือ” ของสินค้า<br>แนะนำสั่ง = ควรมี − คงเหลือ − สั่งแล้วรอของ (ปัดขึ้น)<br>ใกล้หมด = เหลือพอขายไม่เกิน (รอของ + สำรอง) วัน · คิดเฉพาะสินค้าที่เปิด “ติดตามสต็อก”</div>`,
    `<button class="btn grow green" id="sv">${I(IC.check, 18)} บันทึก</button>`, { sticky: true });
  $('#imp', ov).onclick = () => { ov.remove(); restockImport(done); };
  $('#md', ov).value = C.mode === 'month' ? 'month' : String(C.days || 30); $('#lk', ov).value = String(C.look || 90);
  $('#sv', ov).onclick = async () => {
    const md = $('#md', ov).value, n = {
      on: $('#on', ov).checked, mode: md === 'month' ? 'month' : 'days', days: md === 'month' ? (C.days || 30) : +md,
      hist: $('#hs', ov).checked, lead: Math.max(0, Math.min(30, num($('#ld', ov).value))), safety: Math.max(0, Math.min(30, num($('#sf', ov).value))), look: +$('#lk', ov).value, season: $('#ss', ov).checked, home: $('#hm', ov).checked
    };
    try { busy(1); await saveSetting('stockPlan', n); Restock.memo = null; busy(0); ov.remove(); toast(n.on ? 'บันทึกแล้ว' : 'ปิดระบบวางแผนสั่งของแล้ว'); done && done(); } catch (e) { busy(0); toast(e.message, 1); }
  };
}
// แชร์รายการสั่งของ (LINE ฯลฯ) — แยกตามร้าน
function rsShare(P, qOf) {
  if (!P.length) return toast('ยังไม่ได้เลือกรายการ', 1);
  const g = {}; P.forEach(i => (g[i.sup || 'ไม่ระบุร้าน'] = g[i.sup || 'ไม่ระบุร้าน'] || []).push(i));
  const txt = `📦 รายการสั่งของ ${S.settings.shopName || 'ร้านเมย์'} · ${thLong(todayISO())}\n` + Object.entries(g).map(([s, L]) => `\n🏪 ${s}\n` + L.map((i, k) => `${k + 1}. ${i.p.name} × ${rsQty(qOf(i), i.p.byWeight === 'Y')} ${i.p.unit || ''}`.trim()).join('\n')).join('\n');
  if (navigator.share) navigator.share({ text: txt }).catch(() => { });
  else (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('คัดลอกรายการแล้ว วางใน LINE ได้เลย')).catch(() => sheet('รายการสั่งของ', `<textarea class="in" style="min-height:300px">${esc(txt)}</textarea>`));
}
function rsExcel(R, P, qOf) {
  if (!P.length) return toast('ยังไม่ได้เลือกรายการ', 1);
  const shop = S.settings.shopName || 'ร้านเมย์ มินิมาร์ท', rows = P.map((i, k) => [k + 1, i.p.barcode || i.p.sku, i.p.name, i.p.category || '', i.sup || '', i.stock, Math.round(i.daily * 100) / 100, isFinite(i.left) ? Math.floor(i.left) : '', qOf(i), i.p.unit || '', i.cost, qOf(i) * i.cost]);
  const tot = rows.reduce((s, r) => s + r[11], 0);
  XL.save(`restock_${todayISO()}.xlsx`, [{ name: 'รายการสั่งของ', cols: [5, 16, 34, 16, 16, 10, 10, 10, 10, 8, 11, 13], merges: ['A1:L1', 'A2:L2'], freeze: 4, landscape: true,
    rows: [[{ v: 'รายการแนะนำสั่งของ', s: 'T' }], [{ v: `${shop} · ${thLong(todayISO())} · ให้พอขาย ${R.cv.label} + สำรอง ${R.C.safety} วัน`, s: 'c' }], []]
      .concat(XL.table(['#', 'บาร์โค้ด', 'สินค้า', 'หมวด', 'ร้านที่ซื้อล่าสุด', 'คงเหลือ', 'ขาย/วัน', 'พออีก (วัน)', 'สั่ง', 'หน่วย', 'ทุน/หน่วย', 'รวม'], rows, ['i', 't', 't', 't', 't', 'n', 'n', 'i', 'n', 'd', 'n', 'n'], ['', '', `${rows.length} รายการ`, '', '', '', '', '', '', '', '', tot])) }], { title: 'รายการสั่งของ' });
  toast('ดาวน์โหลด Excel แล้ว');
}
// สร้างใบสั่งซื้อ: ร้านเดียว → เปิดฟอร์มให้ตรวจ · หลายร้าน → แยกใบตามร้านที่ซื้อล่าสุด
async function rsMakePO(P, qOf) {
  if (!P.length) return;
  const g = {}; P.forEach(i => (g[i.sup || ''] = g[i.sup || ''] || []).push(i));
  const mk = (sup, L) => ({ id: 'PO' + todayISO().replace(/-/g, '').slice(2) + '-' + Math.floor(Math.random() * 900 + 100), date: todayISO(), status: 'draft', supplier: sup, note: 'สร้างจากวางแผนสั่งของ', items: JSON.stringify(L.map(i => ({ sku: i.p.sku, name: i.p.name, barcode: i.p.barcode, qty: qOf(i), cost: i.cost }))), createdBy: S.user.username || '' });
  const keys = Object.keys(g);
  if (keys.length === 1) return poForm(mk(keys[0], g[keys[0]]));
  if (!(await confirmDlg(`สร้างใบสั่งซื้อ ${keys.length} ใบ แยกตามร้านที่ซื้อล่าสุด:\n${keys.map(k => `• ${k || 'ไม่ระบุร้าน'} (${g[k].length} รายการ)`).join('\n')}`, 'สร้างใบสั่งซื้อ'))) return;
  try { busy(1); await api('upsert', { table: 'POs', rows: keys.map(k => mk(k, g[k])) }); busy(0); toast(`สร้างใบสั่งซื้อ ${keys.length} ใบแล้ว`); Restock.memo = null; go('polist'); } catch (e) { busy(0); toast(e.message, 1); }
}
// การ์ดบนหน้าหลักเจ้าของ: ใช้ผลที่จำไว้ หรือคำนวณตอนเครื่องว่าง (ไม่หน่วงหน้าหลัก)
function restockHome(box) {
  if (!box || !isOwner() || !Restock.on() || !Restock.conf().home) return;
  const paint = R => {
    if (!box.isConnected || !R) return;
    if (!R.toBuy) { box.innerHTML = R.cnt.wait ? `<div class="card rs-home" onclick="go('restock')"><div class="ic2">🚚</div><div class="grow"><b>สั่งของแล้ว รอของเข้า ${R.cnt.wait} รายการ</b><div class="small muted">ไม่มีสินค้าที่ต้องสั่งเพิ่มตอนนี้</div></div><span class="muted">›</span></div>` : ''; return; }
    const out = R.items.filter(i => i.sugg > 0 && i.st === 'out').length, urg = R.items.filter(i => i.sugg > 0 && i.st === 'urgent').length;
    box.innerHTML = `<div class="card rs-home" onclick="go('restock')"><div class="ic2">📦</div><div class="grow"><b>ควรสั่งของ ${R.toBuy} รายการ</b><div class="small muted">${out ? `<span style="color:var(--red);font-weight:600">หมด ${out}</span> · ` : ''}${urg ? `<span style="color:#C25E00;font-weight:600">ใกล้หมด ${urg}</span> · ` : ''}งบประมาณ ${baht(R.value)}</div></div><span class="muted">›</span></div>`;
  };
  const c = Restock.cached(); if (c) return paint(c);
  // หน้าหลักไม่ดึงบิลจากเน็ตเพื่อคำนวณ — ใช้เฉพาะเครื่องที่มีบิลในเครื่อง (หรือโหมดทดลอง)
  if (S.apiUrl && !(window.OStore && OStore.allowed())) return;
  (window.requestIdleCallback || (f => setTimeout(f, 1200)))(() => Restock.run().then(paint).catch(() => { }), { timeout: 4000 });
}

/* ---------- ประวัติขายรายสินค้าจากระบบเดิม (Loyverse) ----------
   นำเข้าไฟล์ใบเสร็จ CSV → สรุปจำนวนขายรายสินค้า (รายเดือนทั้งหมด + รายวัน 120 วันสุดท้าย) → เก็บตาราง ItemHist ไม่กี่พันแถว
   (ไม่เก็บใบเสร็จแสนใบ) · วางแผนสั่งของใช้แทนช่วงที่ระบบนี้ยังไม่มีบิล และใช้คิดฤดูกาลรายสินค้า */
const RHist = {
  D: 120, cache: null,
  meta() { try { const v = S.settings.itemHistMeta; return v ? (typeof v === 'string' ? JSON.parse(v) : v) : null; } catch (e) { return null; } },
  async get() {
    const M = this.meta(); if (!M) return null;
    if (this.cache && this.cache.at === M.at) return this.cache;
    const rows = await quick(loadTable('ItemHist'), 8000, null); if (!rows || !rows.length) return null;
    const by = {}, shop = {};
    rows.forEach(r => {
      const m = {}; String(r.months || '').split(';').forEach(x => { const [k, v] = x.split(':'); if (k && v) { const ym = '20' + k.slice(0, 2) + '-' + k.slice(2, 4); m[ym] = +v; shop[ym] = (shop[ym] || 0) + (+v); } });
      const rc = new Float64Array(this.D); String(r.recent || '').split(',').forEach((v, i) => { if (v && i < this.D) rc[i] = +v; });
      by[r.sku] = { m, rc, rf: r.recentFrom || '', first: r.first || '', last: r.last || '', qty: num(r.qty) };
    });
    this.cache = { at: M.at, meta: M, by, shop, idx: this.index(shop), rf: (rows.find(r => r.recentFrom) || {}).recentFrom || '' };
    return this.cache;
  },
  // ดัชนีฤดูกาลรายเดือน (1 = เฉลี่ย) จากปีที่มีข้อมูลอย่างน้อย 10 เดือน
  index(mm) {
    const yrs = {}; Object.entries(mm).forEach(([ym, q]) => { const y = ym.slice(0, 4); (yrs[y] = yrs[y] || {})[+ym.slice(5)] = q; });
    const acc = Array(13).fill(0), n = Array(13).fill(0);
    Object.values(yrs).forEach(Y => { const ks = Object.keys(Y); if (ks.length < 10) return; const avg = ks.reduce((s, k) => s + Y[k], 0) / ks.length; if (avg <= 0) return; ks.forEach(k => { acc[k] += Y[k] / avg; n[k]++; }); });
    const out = Array(13).fill(null); let ok = 0; for (let k = 1; k <= 12; k++) if (n[k]) { out[k] = acc[k] / n[k]; ok++; }
    return ok >= 10 ? out : null;
  }
};
window.RHist = RHist;
// อ่าน CSV เร็ว (ตัดเป็นช่วง ไม่ต่อตัวอักษรทีละตัว) · onRow คืน false = หยุด
async function csvStream(text, onRow, onProg) {
  let i = text.charCodeAt(0) === 0xFEFF ? 1 : 0, n = text.length, cnt = 0;
  while (i < n) {
    const row = [];
    for (;;) {
      let v;
      if (text.charCodeAt(i) === 34) {
        let j = i + 1, s = '';
        for (;;) { const k = text.indexOf('"', j); if (k < 0) { s += text.slice(j); i = n; break; } if (text.charCodeAt(k + 1) === 34) { s += text.slice(j, k + 1); j = k + 2; } else { s += text.slice(j, k); i = k + 1; break; } }
        v = s;
      } else { let k = i; while (k < n) { const c = text.charCodeAt(k); if (c === 44 || c === 10 || c === 13) break; k++; } v = text.slice(i, k); i = k; }
      row.push(v);
      if (i < n && text.charCodeAt(i) === 44) { i++; continue; }
      if (i < n && text.charCodeAt(i) === 13) i++; if (i < n && text.charCodeAt(i) === 10) i++;
      break;
    }
    if (row.length > 1 || row[0]) { if (onRow(row) === false) return; }
    if (++cnt % 4000 === 0) { onProg && onProg(i / n); await new Promise(r => setTimeout(r, 0)); }
  }
}
function restockImport(done) {
  if (!isOwner()) return toast('เฉพาะเจ้าของกิจการ', 1);
  const M = RHist.meta();
  const ov = sheet('ประวัติขายจากระบบเดิม', `
    <div class="small" style="line-height:1.6;margin-bottom:10px">ใช้ไฟล์ <b>ใบเสร็จ (Receipts) CSV จาก Loyverse</b> หรือไฟล์ที่ส่งออกจากระบบนี้ ระบบจะ<b>สรุปจำนวนขายรายสินค้า</b> (รายเดือน + รายวัน 120 วันสุดท้าย) เก็บไว้ไม่กี่พันแถว — <b>ไม่นำเข้าใบเสร็จทีละใบ</b> ไม่เปลืองพื้นที่ ไม่ทำให้ระบบช้า ไม่กระทบยอดขาย/รายงาน/ภาษี</div>
    ${M ? `<div class="card small" style="padding:10px 12px"><b>นำเข้าไว้แล้ว</b><br>${thLong(M.from)} – ${thLong(M.to)} · ${num(M.bills).toLocaleString()} บิล · ${num(M.items).toLocaleString()} สินค้า (จับคู่ได้ ${M.pct}% ของจำนวนชิ้น)<br><span class="tiny muted">นำเข้าเมื่อ ${thLong(String(M.at).slice(0, 10))}</span></div>` : ''}
    <label class="btn block green" style="margin-top:6px">${I(IC.file, 18)} ${M ? 'นำเข้าไฟล์ใหม่ (แทนของเดิม)' : 'เลือกไฟล์ใบเสร็จ CSV'}<input type="file" accept=".csv,text/csv" class="hidden" id="f"></label>
    <div id="pg"></div>
    <div class="tiny muted" style="margin-top:10px;line-height:1.6">• จับคู่สินค้าด้วยชื่อสินค้า (ชื่อในระบบนี้ต้องตรงกับระบบเดิม) · สินค้าที่จับคู่ไม่ได้จะแจ้งรายชื่อ<br>• วันที่ที่ระบบนี้มีบิลขายจริงแล้ว ใช้บิลจริงแทนประวัติเสมอ (ไม่นับซ้ำ)<br>• ประวัติหลายปีช่วยคิดฤดูกาลรายสินค้า เช่น ช่วงปีใหม่/สงกรานต์ขายดีขึ้นเท่าไหร่</div>`,
    M ? `<button class="btn ghost grow" id="del" style="color:var(--red)">ลบประวัติที่นำเข้า</button>` : '', { sticky: true });
  const pg = $('#pg', ov), say = h => { pg.innerHTML = `<div class="card small" style="margin-top:10px;padding:10px 12px">${h}</div>`; };
  const del = $('#del', ov); if (del) del.onclick = async () => {
    if (!(await confirmDlg('ลบประวัติขายที่นำเข้าทั้งหมด? (ยอดขาย/ใบเสร็จของระบบนี้ไม่ได้รับผลกระทบ)', 'ลบ', true))) return;
    try { busy(1, 'กำลังลบ...'); const rows = await loadTable('ItemHist').catch(() => []); for (let i = 0; i < rows.length; i += 400) await api('remove', { table: 'ItemHist', ids: rows.slice(i, i + 400).map(r => r.sku) }); await saveSetting('itemHistMeta', ''); RHist.cache = null; Restock.memo = null; busy(0); ov.remove(); toast('ลบประวัติแล้ว'); done && done(); } catch (e) { busy(0); toast(e.message, 1); }
  };
  $('#f', ov).onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    S.longJob = true;
    try {
      say('กำลังอ่านไฟล์...'); const text = await f.text();
      if (!S.products.length) await loadProducts(true);
      // จับคู่ชื่อ: ตรงตัว → ตัดวรรณยุกต์/ช่องว่าง (ใช้เมื่อไม่ซ้ำ)
      const clean = s => String(s || '').replace(/^"+|"+$/g, '').replace(/""/g, '"').replace(/\s+/g, ' ').trim();
      const exact = new Map(), loose = new Map();
      S.products.forEach(p => { exact.set(clean(p.name), p.sku); const k = norm(p.name); loose.set(k, loose.has(k) && loose.get(k) !== p.sku ? null : p.sku); });
      let H = null, iD = -1, iT = -1, iX = -1, iS = -1, iN = -1, dm = null, rows = 0, bills = 0, refunds = 0, skip = 0, minD = '9999', maxD = '0000';
      const agg = {}, miss = {}; let qAll = 0, qHit = 0;
      // หาวันที่ล่าสุดก่อน (ไฟล์มักเรียงใหม่→เก่า) เพื่อเก็บรายวันช่วงท้าย
      const dates = [];
      const pd = s => {
        let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s); if (!m) return '';
        let a = +m[1], b = +m[2], y = +m[3]; const cy = new Date().getFullYear();
        if (y < 100) { y += 2000; if (y > cy + 1) y -= 543; } else if (y > 2400) y -= 543;
        const [d, mo] = dm === 'md' ? [b, a] : [a, b]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
        return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      };
      // รอบแรก: หัวตาราง + รูปแบบวันที่ + ช่วงวันที่ (อ่านเฉพาะคอลัมน์วันที่)
      await csvStream(text, r => {
        if (!H) { H = r.map(x => String(x).trim()); const f2 = re => H.findIndex(h => re.test(h)); iD = f2(/^(วันที่|date)$/i); iT = f2(/ประเภทใบเสร็จ|receipt type/i); iX = f2(/^(คำอธิบาย|description)$/i); iS = f2(/^(สถานะ|status)$/i); iN = f2(/เลขที่ใบเสร็จ|receipt (number|#)/i); if (iD < 0 || iX < 0) return false; return; }
        const v = r[iD] || '', m = /^(\d{1,2})\/(\d{1,2})\//.exec(v); if (m && !dm) { if (+m[1] > 12) dm = 'dm'; else if (+m[2] > 12) dm = 'md'; }
        dates.push(v);
      }, p => say(`กำลังตรวจไฟล์... ${Math.round(p * 100)}%`));
      if (iD < 0 || iX < 0) throw new Error('ไม่ใช่ไฟล์ใบเสร็จ — ต้องมีคอลัมน์ “วันที่” และ “คำอธิบาย” (Date / Description)');
      dm = dm || 'dm';
      let last0 = ''; for (const v of dates) { const d = pd(String(v)); if (d > last0) last0 = d; }
      const rf0 = last0 ? addDays(last0, -(RHist.D - 1)) : '0000';
      let H2 = null;
      await csvStream(text, r => {
        if (!H2) { H2 = 1; return; }
        rows++;
        const st = String(r[iS] || ''); if (/ยกเลิก|cancel/i.test(st)) { skip++; return; }
        const d = pd(String(r[iD] || '')); if (!d) { skip++; return; }
        if (d < minD) minD = d; if (d > maxD) maxD = d;
        const sg = /คืนเงิน|refund/i.test(String(r[iT] || '')) ? -1 : 1; if (sg < 0) refunds++; else bills++;
        const parts = String(r[iX] || '').split(/, (?=\d+(?:\.\d+)? x )/);
        for (const p of parts) {
          const m = /^(\d+(?:\.\d+)?) x ([\s\S]+)$/.exec(p.trim()); if (!m) continue;
          const q = sg * +m[1], nm = clean(m[2]); qAll += Math.abs(q);
          const sku = exact.get(nm) || loose.get(norm(nm)) || null;
          if (!sku) { miss[nm] = (miss[nm] || 0) + Math.abs(q); continue; }
          qHit += Math.abs(q);
          const a = agg[sku] || (agg[sku] = { m: {}, d: {}, first: d, last: d, qty: 0 });
          const ym = d.slice(2, 4) + d.slice(5, 7); a.m[ym] = (a.m[ym] || 0) + q; if (d >= rf0) a.d[d] = (a.d[d] || 0) + q; a.qty += q;
          if (d < a.first) a.first = d; if (d > a.last) a.last = d;
        }
      }, p => say(`กำลังสรุปยอดขายรายสินค้า... ${Math.round(p * 100)}%<div class="bar" style="height:6px;background:#EFE9E8;border-radius:6px;margin-top:6px"><i style="display:block;height:100%;width:${Math.round(p * 100)}%;background:var(--green);border-radius:6px"></i></div>`));
      if (!bills) throw new Error('ไม่พบบิลขายในไฟล์');
      const rf = rf0, out = [], now = new Date().toISOString(), r2 = v => Math.round(v * 1000) / 1000;
      const nameOf = {}; S.products.forEach(p => nameOf[p.sku] = p.name);
      Object.entries(agg).forEach(([sku, a]) => {
        const rc = []; for (let k = 0; k < RHist.D; k++) { const v = a.d[addDays(rf, k)]; rc.push(v ? r2(v) : ''); }
        while (rc.length && rc[rc.length - 1] === '') rc.pop();
        out.push({ sku, name: nameOf[sku] || '', months: Object.keys(a.m).sort().map(k => k + ':' + r2(a.m[k])).join(';'), recent: rc.join(','), recentFrom: rf, first: a.first, last: a.last, qty: String(r2(a.qty)), updatedAt: now });
      });
      const top = Object.entries(miss).sort((a, b) => b[1] - a[1]), pct = qAll ? Math.round(qHit / qAll * 1000) / 10 : 0;
      say(`<b>สรุปจากไฟล์</b><br>${thLong(minD)} – ${thLong(maxD)} · ${bills.toLocaleString()} บิลขาย · คืนเงิน ${refunds} · ข้าม ${skip}<br>จับคู่สินค้าได้ <b>${out.length.toLocaleString()}</b> รายการ = <b>${pct}%</b> ของจำนวนชิ้นที่ขาย
        ${top.length ? `<details style="margin-top:6px"><summary>จับคู่ไม่ได้ ${top.length} ชื่อ (${Math.round((qAll - qHit) / Math.max(1, qAll) * 1000) / 10}%)</summary><div class="tiny" style="max-height:160px;overflow:auto;margin-top:4px">${top.slice(0, 60).map(([n, q]) => `• ${esc(n)} <span class="muted">(${Math.round(q)})</span>`).join('<br>')}</div><div class="tiny muted">ชื่อในระบบนี้ไม่ตรงกับระบบเดิม (เช่น เปลี่ยนชื่อแล้ว) — แก้ชื่อให้ตรงแล้วนำเข้าใหม่ได้</div></details>` : ''}
        <button class="btn block green" id="sv" style="margin-top:10px">${I(IC.check, 18)} บันทึกประวัติ ${out.length.toLocaleString()} สินค้า</button>`);
      $('#sv', ov).onclick = async () => {
        try {
          const old = await loadTable('ItemHist').catch(() => []), keep = new Set(out.map(r => r.sku)), gone = old.filter(r => !keep.has(r.sku)).map(r => r.sku);
          for (let i = 0; i < out.length; i += 250) { say(`กำลังบันทึก... ${Math.min(out.length, i + 250).toLocaleString()} / ${out.length.toLocaleString()}`); await api('upsert', { table: 'ItemHist', rows: out.slice(i, i + 250) }); }
          for (let i = 0; i < gone.length; i += 400) await api('remove', { table: 'ItemHist', ids: gone.slice(i, i + 400) });
          await saveSetting('itemHistMeta', JSON.stringify({ from: minD, to: maxD, bills, refunds, items: out.length, pct, miss: top.length, file: f.name, at: now }));
          if (window.Cache) Cache.staleBefore = Date.now(); RHist.cache = null; Restock.memo = null;
          S.longJob = false; ov.remove(); toast(`บันทึกประวัติขาย ${out.length.toLocaleString()} สินค้าแล้ว`); done && done();
        } catch (e2) { S.longJob = false; toast(/ไม่พบตาราง/.test(e2.message) ? 'Apps Script ยังเป็นรุ่นเก่า — อัปเดต Code.gs และ Logic.gs แล้ว Deploy เวอร์ชันใหม่ก่อน' : e2.message, 1); }
      };
    } catch (err) { say(`<span style="color:var(--red)">${esc(err.message)}</span>`); }
    finally { if (!$('#sv', ov)) S.longJob = false; }
  };
}
// รายละเอียดสินค้า: ยอดขายรายเดือน 24 เดือน (ประวัติระบบเดิม + ระบบนี้) · ความเร็วขาย · ฤดูกาล · คาดการณ์
async function rsDetail(i, R) {
  const p = i.p, w = p.byWeight === 'Y', u = p.unit || (w ? 'กก.' : 'ชิ้น'), h = R.H && R.H.by[p.sku];
  const t = todayISO(), months = []; for (let k = 23; k >= 0; k--) { const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1 - k, 1)); months.push(d.toISOString().slice(0, 7)); }
  const q = {}; if (h) Object.entries(h.m).forEach(([ym, v]) => { if (!R.posStart || ym < R.posStart.slice(0, 7) || ym === R.posStart.slice(0, 7)) q[ym] = (q[ym] || 0) + v; });
  // บิลระบบนี้ (ตั้งแต่วันแรกที่มีบิล) — ใช้ข้อมูลในเครื่อง
  try { if (R.posStart) { const rows = await fetchOrders(R.posStart > addDays(t, -400) ? R.posStart : addDays(t, -400), t); rows.forEach(o => { if (/^LV-/.test(o.id || '')) return; const sg = o.status === 'refund' ? -1 : 1, ym = String(o.date).slice(0, 7); (o._items || []).forEach(it => { if (it.sku === p.sku) q[ym] = (q[ym] || 0) + sg * Math.abs(num(it.qty)); }); }); } } catch (e) { }
  const mx = Math.max(1, ...months.map(m => q[m] || 0)), cur = t.slice(0, 7);
  const bars = months.map(m => { const v = q[m] || 0, hgt = Math.round(v / mx * 100); return `<div title="${TH_M[+m.slice(5) - 1]} ${+m.slice(0, 4) + 543}: ${rsQty(v, w)}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px;min-width:0"><div class="tiny" style="font-size:9.5px;color:var(--ink3)">${v >= mx * .6 ? rsQty(v, w) : ''}</div><div style="width:100%;height:${Math.max(v > 0 ? 2 : 0, hgt)}%;background:${m === cur ? 'var(--red)' : m.slice(5) === '12' || m.slice(5) === '04' ? '#E3A008' : '#9DB7E5'};border-radius:3px 3px 0 0"></div></div>`; }).join('');
  const labels = months.map((m, k) => `<div style="flex:1;text-align:center;font-size:9.5px;color:var(--ink3);min-width:0">${k % 3 === 0 || m === cur ? TH_M[+m.slice(5) - 1].replace('.', '') : ''}</div>`).join('');
  const own = h && h.qty >= 120 ? RHist.index(h.m) : null, ix = own || (R.H && R.H.idx);
  const best = ix ? ix.map((v, k) => [k, v]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]) : [];
  sheet(esc(p.name), `
    <div class="row" style="gap:10px;margin-bottom:10px">${pthumb(p, 52)}<div class="grow small">${esc(p.category || 'ไม่ระบุหมวด')} · ${esc(p.barcode || p.sku)}<br>ราคา ${baht(p.price)}${num(p.cost) ? ` · ทุน ${baht(p.cost)}` : ''}</div></div>
    <div class="card" style="padding:12px"><b class="small">ยอดขายรายเดือน (${u}) · 24 เดือน</b>
      <div style="display:flex;gap:2px;height:130px;margin-top:8px;align-items:stretch">${bars}</div><div style="display:flex;gap:2px;margin-top:3px">${labels}</div>
      <div class="tiny muted" style="margin-top:4px">🟥 เดือนนี้ · 🟨 ธ.ค./เม.ย. · ${h ? `ประวัติระบบเดิม${R.posStart ? ' + บิลระบบนี้' : ''}` : 'บิลระบบนี้'}</div></div>
    <div class="card small" style="line-height:1.7;padding:10px 12px">
      <div class="kv"><span>ขายเฉลี่ย (ปรับฤดูกาลแล้ว)</span><b>${rsRate(i.daily)}</b></div>
      ${Math.abs((i.fac || 1) - 1) >= .01 ? `<div class="kv"><span>ตัวคูณฤดูกาลช่วงที่จะขาย</span><b>×${(i.fac || 1).toFixed(2)}</b></div>` : ''}
      ${best.length ? `<div class="kv"><span>เดือนที่ขายดีที่สุด${own ? '' : ' (ทั้งร้าน)'}</span><b>${best.slice(0, 3).map(([k, v]) => `${TH_M[k - 1]} +${Math.round((v - 1) * 100)}%`).join(' · ')}</b></div>` : ''}
      <div class="kv"><span>คาดว่าขาย${esc(R.cv.label.replace(/ \(.*/, ''))} + สำรอง</span><b>${rsQty(i.daily * (R.cv.days + (+R.C.safety || 0)), w)} ${esc(u)}</b></div>
      ${i.stock != null ? `<div class="kv"><span>คงเหลือ${i.oo ? ' · สั่งแล้วรอของ' : ''}</span><b>${rsQty(i.stock, w)}${i.oo ? ' · ' + rsQty(i.oo, w) : ''}</b></div><div class="kv"><span>พอขายอีก</span><b>${rsDay(i.left)}</b></div><div class="kv"><span>แนะนำสั่ง</span><b style="font-size:17px">${rsQty(i.sugg, w)} ${esc(u)}</b></div>` : '<div class="tiny muted">ยังไม่ได้ติดตามสต็อก — ใส่จำนวนที่มีในแท็บ “ไม่ได้ติดตาม” เพื่อคำนวณจำนวนสั่ง</div>'}
      ${h ? `<div class="tiny muted" style="margin-top:4px">ขายในระบบเดิมรวม ${rsQty(h.qty, w)} ${esc(u)} · ครั้งแรก ${thDate(h.first)} · ล่าสุด ${thDate(h.last)}</div>` : ''}</div>`);
}
