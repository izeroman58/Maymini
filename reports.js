/* =========================================================
   รายงาน: สรุปยอดขาย / ใบเสร็จรับเงินย้อนหลัง / การ์ด "วันนี้"
   ========================================================= */
'use strict';
const isoDay = (d) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00+07:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const RANGES = [
  ['today', 'วันนี้', () => { const t = todayISO(); return [t, t]; }],
  ['yday', 'เมื่อวาน', () => { const t = addDays(todayISO(), -1); return [t, t]; }],
  ['7d', '7 วัน', () => [addDays(todayISO(), -6), todayISO()]],
  ['30d', '30 วัน', () => [addDays(todayISO(), -29), todayISO()]],
  ['month', 'เดือนนี้', () => { const t = todayISO(); return [t.slice(0, 8) + '01', t]; }],
  ['lmonth', 'เดือนก่อน', () => { const t = todayISO(); const f = addDays(t.slice(0, 8) + '01', -1); return [f.slice(0, 8) + '01', f]; }],
  ['12m', '12 เดือน', () => { const t = todayISO(), d = new Date(+t.slice(0, 4), +t.slice(5, 7) - 12, 1); return [d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01', t]; }],
  ['year', 'ปีนี้', () => { const t = todayISO(); return [t.slice(0, 4) + '-01-01', t]; }],
  ['lyear', 'ปีที่แล้ว', () => { const y = +todayISO().slice(0, 4) - 1; return [y + '-01-01', y + '-12-31']; }],
  ['custom', 'กำหนดเอง', null]
];
const OCACHE = {};
async function fetchOrders(from, to, force) {
  const key = 'o:' + from + '|' + to;
  if (force) await Cache.del(Cache.key(key));
  // บิลอยู่ในเครื่องแล้ว → อ่านจากเครื่องทันที (ดึงบิลใหม่เบื้องหลัง แล้ววาดใหม่เองถ้ามีเปลี่ยน)
  let raw = null;
  if (window.OStore && OStore.allowed()) {
    if (force) await OStore.sync(true);
    raw = await OStore.query(from, to);
    if (raw) { (S.deps || (S.deps = new Set())).add('ostore'); if (!force) OStore.sync(); }
  }
  if (!raw) raw = await swr(key, async () => { await Sync.flush(); return (await api('ordersRange', { from, to })).rows; }, 30000);
  const rows = raw.map(o => ({ ...o, _items: Logic.J(o.items, []), _pays: Logic.J(o.payments, []) }));
  // บิลที่ยังรอส่ง
  Sync.box.filter(o => o.date.slice(0, 10) >= from && o.date.slice(0, 10) <= to && !rows.some(x => x.id === o.id)).forEach(o => rows.push({ ...o, _pending: 1, _items: Logic.J(o.items, []), _pays: Logic.J(o.payments, []) }));
  rows.sort((a, b) => String(b.date).localeCompare(a.date));
  return rows;
}
function aggregate(rows) {
  const A = { gross: 0, refund: 0, disc: 0, net: 0, cost: 0, profit: 0, bills: 0, refunds: 0, days: {}, hours: {}, prod: {}, cat: {}, staff: {}, pay: {} };
  rows.forEach(o => {
    const isR = o.status === 'refund', sg = isR ? -1 : 1, day = String(o.date).slice(0, 10), hr = String(o.date).slice(11, 13);
    const tot = num(o.total), cost = Math.abs(num(o.cost)) * sg;
    if (isR) { A.refund += Math.abs(tot); A.refunds++; } else { A.gross += num(o.subtotal); A.disc += num(o.discount); A.bills++; }
    A.net += tot; A.cost += cost;
    const dd = A.days[day] || (A.days[day] = { net: 0, cost: 0, bills: 0 }); dd.net += tot; dd.cost += cost; if (!isR) dd.bills++;
    A.hours[hr] = (A.hours[hr] || 0) + tot;
    const st = A.staff[o.cashierName || o.cashier] || (A.staff[o.cashierName || o.cashier] = { bills: 0, net: 0, refund: 0, cost: 0 });
    st.net += tot; st.cost += cost; if (isR) st.refund += Math.abs(tot); else st.bills++;
    o._pays.forEach(p => { const x = A.pay[p.type] || (A.pay[p.type] = { n: 0, amt: 0 }); x.amt += num(p.amount); if (!isR) x.n++; });
    o._items.forEach(it => {
      const q = Math.abs(num(it.qty)) * sg, amt = q * num(it.price), c = q * num(it.cost);
      if (it.pass) A.pass = (A.pass || 0) + amt;
      if (it.debt) A.debt = (A.debt || 0) + amt;
      if (it.inst) A.inst = (A.inst || 0) + amt;
      const pk = it.sku || it.name; const p = A.prod[pk] || (A.prod[pk] = { name: it.name, cat: it.cat || '', qty: 0, amt: 0, cost: 0, pass: !!(it.pass || it.debt) });
      p.qty += q; p.amt += amt; p.cost += c;
      const ck = it.cat || 'ไม่ระบุหมวด'; const cc = A.cat[ck] || (A.cat[ck] = { qty: 0, amt: 0, cost: 0 }); cc.qty += q; cc.amt += amt; cc.cost += c;
    });
  });
  A.profit = A.net - A.cost;
  return A;
}
// กล่องรายละเอียดกราฟแท่ง: ชี้เมาส์/แตะแท่ง → ขึ้นทันที (ไม่ต้องรอ) · แท่งขยายขึ้นเล็กน้อย
const BarTip = {
  el: null, cur: null,
  show(g, x, y) {
    if (!this.el) { this.el = document.createElement('div'); this.el.className = 'bctip'; document.body.appendChild(this.el); }
    if (this.cur !== g) { this.cur && this.cur.classList.remove('hov'); g.classList.add('hov'); this.cur = g; this.el.innerHTML = g.dataset.tip; }
    const r = g.getBoundingClientRect(), t = this.el; t.style.display = 'block';
    const w = t.offsetWidth, h = t.offsetHeight; let L = r.left + r.width / 2 - w / 2, T = r.top + (y == null ? 8 : 0) - h - 10;
    if (y != null) T = Math.min(T, y - h - 14); L = Math.max(6, Math.min(innerWidth - w - 6, L)); if (T < 6) T = (y || r.top) + 18;
    t.style.left = L + 'px'; t.style.top = T + 'px';
  },
  hide() { if (this.el) this.el.style.display = 'none'; this.cur && this.cur.classList.remove('hov'); this.cur = null; }
};
document.addEventListener('pointerover', e => { const g = e.target.closest && e.target.closest('.bch g.bg'); if (g && e.pointerType === 'mouse') BarTip.show(g, e.clientX, e.clientY); });
document.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const g = e.target.closest && e.target.closest('.bch g.bg'); if (g) BarTip.show(g, e.clientX, e.clientY); else if (BarTip.cur) BarTip.hide(); });
document.addEventListener('pointerdown', e => { const g = e.target.closest && e.target.closest('.bch g.bg'); if (g) BarTip.show(g, e.clientX, e.clientY); else BarTip.hide(); }, true);
addEventListener('scroll', () => BarTip.cur && BarTip.hide(), true);
function barChart(data, opt = {}) {
  // แท่งบาง ปลายมน · ถ้ามี d.p = ช่วงก่อนหน้า วาดเป็นแท่งสีเทาจาง ๆ ข้างหลังเพื่อเทียบ
  const W = 760, H = opt.h || 220, pl = 54, pb = 34, pt = 10, hasP = data.some(d => d.p != null);
  const max = Math.max(1, ...data.map(d => Math.max(d.v, d.p || 0))); const step = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / step) * step;
  const bw = (W - pl - 10) / Math.max(1, data.length), col = opt.color || '#7CB342';
  let g = '';
  for (let i = 0; i <= 4; i++) { const y = pt + (H - pt - pb) * (1 - i / 4); g += `<line x1="${pl}" x2="${W - 6}" y1="${y}" y2="${y}" stroke="#eee"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#888">${money(top * i / 4, 0)}</text>`; }
  const bar = (x, w, v, fill) => { const h = (H - pt - pb) * Math.max(0, v) / top, y = H - pb - h, r = Math.min(4, w / 2, h); return h <= 0 ? '' : `<path d="M${x},${H - pb}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${H - pb}Z" fill="${fill}"/>`; };
  data.forEach((d, i) => {
    const x0 = pl + i * bw, w = Math.max(2, Math.min(hasP ? bw * .42 : bw * .62, 34)), cx = x0 + bw / 2;
    const ch = d.p != null && d.p ? (d.v - d.p) / Math.abs(d.p) * 100 : null;
    const tip = `<b>${esc(d.t)}</b><div><i style="background:${col}"></i>${esc(opt.curName || 'ยอด')} <b>${money(d.v)}</b></div>${d.p != null ? `<div><i style="background:#C9CED4"></i>${esc(opt.prevName || 'ช่วงก่อน')} ${money(d.p)}</div>${ch != null ? `<div class="${ch >= 0 ? 'up' : 'dn'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}%</div>` : ''}` : ''}`;
    g += `<g class="bg" data-tip="${esc(tip)}"><rect class="hit" x="${x0}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent"/>`;
    if (hasP) g += bar(cx - w - 1, w, d.p || 0, '#D5D9DE') + bar(cx + 1, w, d.v, col);
    else g += bar(cx - w / 2, w, d.v, col);
    g += '</g>';
    if (data.length <= 16 || i % Math.ceil(data.length / 16) === 0) g += `<text x="${cx}" y="${H - pb + 14}" text-anchor="middle" font-size="10.5" fill="#666">${esc(d.l)}</text>`;
  });
  const leg = hasP ? `<div class="row tiny muted" style="gap:14px;justify-content:center;margin-top:2px"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${col};vertical-align:-1px"></i> ${esc(opt.curName || 'ช่วงนี้')}</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#D5D9DE;vertical-align:-1px"></i> ${esc(opt.prevName || 'ช่วงก่อน')}</span></div>` : '';
  return `<div class="bch"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${g}</svg></div>${leg}`;
}
// แถบแนวนอน (อันดับ) — ชื่อ + แท่ง + ตัวเลข
function hBars(list, color) {
  const max = Math.max(1, ...list.map(x => x.v));
  return list.map((x, i) => `<div style="margin-bottom:8px"><div class="row small" style="gap:6px"><span class="muted" style="width:16px">${i + 1}</span><span class="grow" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.n)}</span><b class="num">${money(x.v, 0)}</b></div><div style="height:8px;border-radius:4px;background:#F1F3F5;margin:3px 0 0 22px"><div style="height:8px;border-radius:4px;width:${x.v / max * 100}%;background:${x.c || color || '#7CB342'}"></div></div>${x.s ? `<div class="tiny muted" style="margin-left:22px">${x.s}</div>` : ''}</div>`).join('') || '<div class="empty small">ไม่มีข้อมูล</div>';
}
// แถบสัดส่วนแบบต่อกัน (ช่องทางชำระ) + คำอธิบาย
function mixBar(parts) {
  const tot = parts.reduce((s, p) => s + Math.max(0, p.v), 0) || 1;
  return `<div style="display:flex;gap:2px;height:14px;border-radius:7px;overflow:hidden;background:#F1F3F5">${parts.filter(p => p.v > 0).map(p => `<div title="${esc(p.n)} ${money(p.v)}" style="width:${p.v / tot * 100}%;background:${p.c}"></div>`).join('')}</div>
    <div style="margin-top:8px">${parts.map(p => `<div class="kv small"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.c};vertical-align:-1px"></i> ${esc(p.n)}</span><span><b class="num">${money(p.v, 0)}</b> <span class="muted" style="display:inline-block;width:48px;text-align:right">${(p.v / tot * 100).toFixed(1)}%</span></span></div>`).join('')}</div>`;
}
const pctChg = (a, b) => b ? (a - b) / Math.abs(b) * 100 : null;
const chgTag = (a, b, inv) => { const c = pctChg(a, b); if (c == null || !isFinite(c)) return ''; const up = c >= 0, good = inv ? !up : up; return `<span style="color:${Math.abs(c) < 0.5 ? '#888' : good ? 'var(--green)' : 'var(--red)'};font-weight:600">${up ? '▲' : '▼'} ${Math.abs(c).toFixed(Math.abs(c) < 10 ? 1 : 0)}%</span>`; };
function rangePicker(el, state, onChange) {
  el.innerHTML = `<div class="chips">${RANGES.map(([k, n]) => `<button class="chip ${state.r === k ? 'on' : ''}" data-r="${k}">${n}</button>`).join('')}</div>
    <div class="row ${state.r === 'custom' ? '' : 'hidden'}" id="cr" style="margin-bottom:8px"><input class="in" type="date" id="f" value="${state.from}"><span>ถึง</span><input class="in" type="date" id="t" value="${state.to}"><button class="btn sm" id="ok">ดู</button></div>`;
  $$('[data-r]', el).forEach(b => b.onclick = () => { state.r = b.dataset.r; const R = RANGES.find(x => x[0] === state.r); if (R[2]) [state.from, state.to] = R[2](); rangePicker(el, state, onChange); if (R[2]) onChange(); });
  $('#ok', el).onclick = () => { state.from = $('#f', el).value; state.to = $('#t', el).value; if (state.from > state.to) [state.from, state.to] = [state.to, state.from]; onChange(); };
}
const RS = { r: 'today', from: todayISO(), to: todayISO(), tab: 'day', staff: '', top: 'range' };
RS.pays = LS.get('rsPays', []);
// ประเภทการชำระ (ลำดับที่แสดง) — เงินสด · เงินเชื่อ · โอน/สแกนจ่าย · บัตรสวัสดิการ
const PAYORDER = ['cash', 'credit', 'transfer', 'welfare'];
const payName = k => (typeof PAYNAME !== 'undefined' && PAYNAME[k]) || (k === 'other' ? 'ไม่ระบุ' : k);
// รายการชำระของบิล (บิลเก่า/นำเข้าที่ไม่มีรายละเอียด ใช้ payType หรือ "ไม่ระบุ")
function billPays(o) {
  const ps = (o._pays || []).filter(p => num(p.amount));
  if (ps.length) return ps.map(p => ({ type: p.type || 'other', amount: Math.abs(num(p.amount)) }));
  return [{ type: o.payType && o.payType !== 'split' ? o.payType : 'other', amount: Math.abs(num(o.total)) }];
}
// กรองตามประเภทการชำระ: บิลที่แยกชำระหลายวิธี นับเฉพาะส่วนที่ชำระด้วยวิธีที่เลือก (ปรับยอดบิล/สินค้าตามสัดส่วน)
function payScope(rows, sel) {
  if (!sel || !sel.length) return rows;
  const want = new Set(sel);
  return rows.map(o => {
    const ps = billPays(o), all = ps.reduce((a, p) => a + p.amount, 0), part = ps.filter(p => want.has(p.type)).reduce((a, p) => a + p.amount, 0);
    if (!part) return null;
    const k = all ? part / all : 1; if (k > .9999) return o;
    return { ...o, total: num(o.total) * k, subtotal: num(o.subtotal) * k, discount: num(o.discount) * k, cost: num(o.cost) * k, _split: k,
      _items: (o._items || []).map(it => ({ ...it, qty: num(it.qty) * k })), _pays: (o._pays || []).filter(p => want.has(p.type)) };
  }).filter(Boolean);
}
const spanDays = (from, to) => Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5) + 1;
const yShift = (d, k) => { const y = +d.slice(0, 4) + k, md = d.slice(5); return y + '-' + (md === '02-29' ? '02-28' : md); };
// ช่วงก่อนหน้า: ช่วงสั้น = ช่วงยาวเท่ากันที่อยู่ติดกันก่อนหน้า · ช่วงตั้งแต่ ~1 ปี = วันเดียวกันของปีก่อน
const prevRange = (from, to) => { const n = spanDays(from, to); return n >= 300 ? [yShift(from, -1), yShift(to, -1)] : [addDays(from, -n), addDays(from, -1)]; };
/* ยอดที่นำเข้า (ใช้แทนใบเสร็จย้อนหลัง): ยอดรายวันที่นำเข้า (SalesDaily) สำหรับวันที่ไม่มีบิล
   + ยอดรายเดือนที่นำเข้า/กรอกเอง (Sales) สำหรับเดือนที่ไม่มีทั้งบิลและยอดรายวัน — นับเฉพาะเดือนที่อยู่ในช่วงทั้งเดือน */
async function importedSales(from, to) {
  if (!isOwner() && !canStrict('reports')) return { days: {}, months: [] };
  const [days, man] = await Promise.all([dailySummary(from, to).catch(() => ({})), qload('Sales', 1500, S.sales || []).catch(() => S.sales || [])]);
  if (man && man.length) S.sales = man;
  const dd = {}; Object.entries(days || {}).forEach(([d, x]) => { if (x.src !== 'POS' && (num(x.net) || num(x.gross))) dd[d] = x; });
  const has = ym => Object.keys(days || {}).some(d => d.startsWith(ym) && (num(days[d].net) || num(days[d].gross)));
  const partial = [];
  const months = (man || []).filter(r => r.amount !== '' && r.amount != null).map(r => {
    const ym = String(r.date).slice(0, 7), m0 = ym + '-01', m1 = addDays(addDays(m0, 32).slice(0, 8) + '01', -1);
    if (m1 < from || m0 > to || has(ym)) return null;
    if (m0 < from || m1 > to) { partial.push(ym); return null; }   // ช่วงที่เลือกครอบแค่บางส่วนของเดือน — ไม่มียอดรายวันให้แบ่ง
    return { ym, net: num(r.amount), gross: r.gross !== '' && r.gross != null ? num(r.gross) : num(r.amount), refund: num(r.refund), disc: num(r.discount), cost: num(r.cost), hasCost: r.cost !== '' && r.cost != null, src: r.source || 'นำเข้ารายเดือน' };
  }).filter(Boolean).sort((a, b) => a.ym.localeCompare(b.ym));
  return { days: dd, months, partial };
}
window.importedSales = importedSales;
// รวมยอดนำเข้าเข้าไปในผลสรุปจากใบเสร็จ (วันที่มีบิลใช้บิล)
function blendImported(A, I) {
  A.impD = 0; A.impDN = 0; A.impM = 0; A.months = {}; A.partial = I ? I.partial || [] : [];
  if (!I) return A;
  Object.entries(I.days).forEach(([d, x]) => {
    if (A.days[d]) return;
    A.net += num(x.net); A.gross += num(x.gross); A.disc += num(x.disc); A.refund += num(x.refund); A.cost += num(x.cost);
    A.days[d] = { net: num(x.net), cost: num(x.cost), bills: 0, imp: x.src || 'นำเข้า' }; A.impD += num(x.net); A.impDN++;
  });
  I.months.forEach(m => { A.net += m.net; A.gross += m.gross; A.disc += m.disc; A.refund += m.refund; A.cost += m.cost; A.months[m.ym] = m; A.impM += m.net; });
  A.profit = A.net - A.cost;
  return A;
}

/* ---------- รายงาน/ยอดขาย (รวมสรุปตามช่วงเวลา + รายเดือน/รายปี ไว้หน้าเดียว) ---------- */
VIEWS.reports = el => {
  if (!seesSales()) { el.innerHTML = vhead('รายงาน/ยอดขาย') + `<div class="card empty">${I(IC.shield, 40)}<p>รายงานยอดขายสำหรับเจ้าของร้าน</p></div>`; return; }
  const own = isOwner(); if (!own) RS.top = 'range';
  el.innerHTML = vhead('รายงาน/ยอดขาย') + (own ? `<div class="seg" id="rtop" style="margin-bottom:12px"><button data-t="range" class="${RS.top === 'range' ? 'on' : ''}">📊 สรุปตามช่วงเวลา</button><button data-t="month" class="${RS.top === 'month' ? 'on' : ''}">📅 รายเดือน · รายปี</button></div>` : '') + '<div id="rbody"></div>';
  const body = $('#rbody', el);
  const show = () => RS.top === 'month' && own ? salesMonthlyView(body) : reportsRange(body);
  $$('#rtop button', el).forEach(b => b.onclick = () => { if (RS.top === b.dataset.t) return; RS.top = b.dataset.t; $$('#rtop button', el).forEach(x => x.classList.toggle('on', x === b)); show(); });
  show();
};
// เปิดจากลิงก์เก่า "ยอดขายรายเดือน" → หน้าเดียวกัน แท็บรายเดือน
VIEWS.sales = el => { RS.top = 'month'; S.view = 'reports'; return VIEWS.reports(el); };

function reportsRange(el) {
  const all = canStrict('reports'), vc = canStrict('viewCost');
  el.innerHTML = `
    ${all ? '' : `<div class="alert blue">${I(IC.user, 18)}<div>แสดงเฉพาะยอดขายของคุณ (${esc(S.user.name)})</div></div>`}
    <div id="rp"></div><div id="sf"></div><div id="pf"></div><div id="kpi"><div class="card center"><span class="spin dark"></span></div></div>
    <div class="card"><div class="row" style="margin-bottom:6px"><h3 class="grow" id="cht">ยอดขาย</h3></div><div id="chart"></div></div>
    <div class="grid2" id="hl"></div>
    <div class="card"><div class="row" style="gap:8px;margin-bottom:10px"><div class="seg grow" id="tabs" style="overflow-x:auto">${[['day', 'ตามวัน'], ['prod', 'ตามสินค้า'], ['cat', 'ตามหมวดหมู่'], ['staff', 'ตามพนักงาน'], ['pay', 'ตามการชำระ']].map(([k, n]) => `<button data-t="${k}" class="${RS.tab === k ? 'on' : ''}" style="white-space:nowrap">${n}</button>`).join('')}</div><button class="btn ghost sm" id="ex">CSV</button>${all ? '<button class="btn ghost sm" id="exx">Excel</button>' : ''}</div><div id="tb"></div></div>
    <div class="row wrap" style="gap:8px"><button class="btn ghost grow" onclick="go('salesreceipts')">${I(IC.receipt, 18)} ใบเสร็จรับเงิน</button>${vc ? `<button class="btn ghost grow" onclick="go('stockvalue')">${I(IC.box, 18)} มูลค่าสต็อก</button>` : ''}${isOwner() ? `<button class="btn ghost grow" onclick="go('tax')">${I(IC.tax, 18)} ภาษี</button>` : ''}</div>`;
  let rows = [], prows = [], A = null, tableRows = [], imp = null, pimp = null, RV = [];
  // ชิปเลือกประเภทการชำระ (เลือกได้หลายแบบ)
  const drawPf = () => {
    const sel = RS.pays || [], pf = $('#pf', el); if (!pf) return;
    pf.innerHTML = `<div class="chips" style="align-items:center"><span class="small muted" style="flex:none">การชำระ:</span><button class="chip ${sel.length ? '' : 'on'}" data-p="">ทุกประเภท</button>${PAYORDER.map(k => `<button class="chip ${sel.includes(k) ? 'on' : ''}" data-p="${k}"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PAYCOLOR[k]};margin-right:5px;vertical-align:1px"></i>${payName(k)}</button>`).join('')}</div>`;
    $$('[data-p]', pf).forEach(b => b.onclick = () => {
      const k = b.dataset.p; let v = (RS.pays || []).slice();
      if (!k) v = []; else v = v.includes(k) ? v.filter(x => x !== k) : v.concat(k);
      if (v.length === PAYORDER.length) v = [];
      RS.pays = v; LS.set('rsPays', v); drawPf(); draw();
    });
  };
  const single = () => RS.from === RS.to;
  const monthly = () => spanDays(RS.from, RS.to) > 62;
  const draw = () => {
    const f = o => !RS.staff || (o.cashierName || o.cashier) === RS.staff;
    const sel = RS.pays || [], R = payScope(rows.filter(f), sel), PR = payScope(prows.filter(f), sel); RV = R;
    A = blendImported(aggregate(R), RS.staff || sel.length ? null : imp); const P = blendImported(aggregate(PR), RS.staff || sel.length ? null : pimp);
    const k = (t, v, s, cur, prv, inv) => `<div class="stat"><div class="k">${t}</div><div class="v">${v}</div><div class="tiny muted">${cur != null ? chgTag(cur, prv, inv) + ' ' : ''}${s || ''}</div></div>`;
    const yoy = spanDays(RS.from, RS.to) >= 300, pn = single() ? 'เทียบวันก่อน' : yoy ? 'เทียบช่วงเดียวกันปีก่อน' : 'เทียบช่วงก่อน';
    const extra = [(A.pass || 0) - (A.debt || 0) > 0 && `เงินรับแทน (โอน/เติม/บิล) ${money((A.pass || 0) - (A.debt || 0), 0)}`, A.debt && `รับชำระหนี้ ${money(A.debt, 0)}`, A.inst && `ผ่อนสินค้า (ดาวน์/ค่างวด) ${money(A.inst, 0)}`].filter(Boolean);
    $('#kpi', el).innerHTML = `<div class="grid3" style="margin-bottom:${extra.length ? 6 : 12}px">${k('ยอดขายสุทธิ', baht(A.net), pn, A.net, P.net)}${vc ? k('กำไรขั้นต้น', baht(A.profit), A.net ? 'อัตรา ' + (A.profit / A.net * 100).toFixed(1) + '%' : '', A.profit, P.profit) : k('จำนวนบิล', A.bills, '', A.bills, P.bills)}${k('เฉลี่ย/บิล', baht(A.bills ? A.net / A.bills : 0), A.bills + ' บิล', A.bills ? A.net / A.bills : 0, P.bills ? P.net / P.bills : 0)}${k('ยอดขาย (ก่อนหัก)', baht(A.gross), '', A.gross, P.gross)}${k('ส่วนลด', baht(A.disc), '', A.disc, P.disc, 1)}${k('คืนเงิน', baht(A.refund), A.refunds + ' ใบ', A.refund, P.refund, 1)}</div>
      ${extra.length ? `<div class="tiny muted" style="margin:0 4px 12px">รวมอยู่ในยอดขายสุทธิ: ${extra.join(' · ')}</div>` : ''}
      ${sel.length ? `<div class="alert blue small" style="margin:0 0 12px">${I(IC.sale, 18)}<div>แสดงเฉพาะการชำระแบบ <b>${sel.map(payName).join(' + ')}</b> · บิลที่แยกชำระหลายวิธีนับเฉพาะส่วนที่จ่ายด้วยวิธีนี้${imp && (imp.days && Object.keys(imp.days).length || imp.months && imp.months.length) ? ' · ไม่รวมยอดที่นำเข้า (ไม่มีข้อมูลการชำระ)' : ''}</div></div>` : ''}
      ${A.partial.length ? `<div class="alert amber small" style="margin:0 0 12px">${I(IC.alert, 18)}<div>${A.partial.map(ym => TH_MF[+ym.slice(5, 7) - 1] + ' ' + (+ym.slice(0, 4) + 543)).join(', ')} มีแค่ยอดรวมทั้งเดือน (นำเข้า) ไม่มียอดรายวัน — ช่วงที่เลือกครอบไม่ครบเดือนจึงยังไม่นับ · เลือก “เดือนก่อน”, “12 เดือน”, “ปีนี้/ปีที่แล้ว” หรือกำหนดเองให้ครอบทั้งเดือน</div></div>` : ''}
      ${A.impDN || A.impM ? `<div class="alert blue small" style="margin:0 0 12px">${I(IC.io, 18)}<div>รวมยอดที่นำเข้าแล้ว: ${[A.impDN && `รายวัน ${A.impDN} วัน ${money(A.impD, 0)}`, A.impM && `รายเดือน ${Object.keys(A.months).length} เดือน ${money(A.impM, 0)}`].filter(Boolean).join(' · ')} — ยอดนำเข้าไม่มีจำนวนบิล/รายละเอียดสินค้า (เฉลี่ยต่อบิล สินค้าขายดี และตารางสินค้า/หมวด/พนักงาน/การชำระ คิดจากใบเสร็จเท่านั้น)${A.impM ? ' · ยอดรายเดือนนับเมื่อเลือกช่วงครอบทั้งเดือน' : ''}</div></div>` : ''}`;
    // เฉลี่ย/บิล: คิดจากใบเสร็จเท่านั้น
    { const nb = R.filter(o => o.status !== 'refund').reduce((a2, o) => a2 + num(o.total), 0), pb = PR.filter(o => o.status !== 'refund').reduce((a2, o) => a2 + num(o.total), 0), PA = aggregate(PR);
      const v = $$('#kpi .stat', el)[2]; if (v) v.outerHTML = k('เฉลี่ย/บิล', baht(A.bills ? nb / A.bills : 0), A.bills + ' บิล', A.bills ? nb / A.bills : 0, PA.bills ? pb / PA.bills : 0); }
    // กราฟหลัก: ช่วงนี้เทียบช่วงก่อนหน้า (แท่งเทา)
    let data, ttl;
    if (single()) { ttl = 'ยอดขายรายชั่วโมง'; data = []; for (let i = 5; i <= 23; i++) { const hh = String(i).padStart(2, '0'); data.push({ l: hh, t: hh + ':00 น.', v: A.hours[hh] || 0, p: P.hours[hh] || 0 }); } }
    else if (monthly()) {
      ttl = 'ยอดขายสุทธิรายเดือน'; data = [];
      const [pf] = prevRange(RS.from, RS.to), mk = (o, ym) => Object.entries(o.days).reduce((a2, [d, x]) => a2 + (d.startsWith(ym) ? x.net : 0), 0) + (o.months[ym] ? o.months[ym].net : 0);
      for (let ym = RS.from.slice(0, 7), i = 0; ym <= RS.to.slice(0, 7) && i < 60; i++) {
        const pd = new Date(+pf.slice(0, 4), +pf.slice(5, 7) - 1 + i, 1), pym = pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0'), mi = +ym.slice(5, 7) - 1;
        data.push({ l: TH_M[mi].replace('.', '') + String(+ym.slice(0, 4) + 543).slice(-2), t: TH_MF[mi] + ' ' + (+ym.slice(0, 4) + 543) + (A.months[ym] ? ' (นำเข้ารายเดือน)' : ''), v: mk(A, ym), p: mk(P, pym) });
        const nd = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 1); ym = nd.getFullYear() + '-' + String(nd.getMonth() + 1).padStart(2, '0');
      }
    }
    else { ttl = 'ยอดขายสุทธิรายวัน'; data = []; const off = Math.round((new Date(RS.from + 'T12:00:00') - new Date(prevRange(RS.from, RS.to)[0] + 'T12:00:00')) / 864e5); for (let d = RS.from; d <= RS.to; d = addDays(d, 1)) { const pd = addDays(d, -off); data.push({ l: d.slice(8) + '/' + d.slice(5, 7), t: thDate(d), v: (A.days[d] || { net: 0 }).net, p: (P.days[pd] || { net: 0 }).net }); if (data.length > 400) break; } }
    $('#cht', el).textContent = ttl;
    $('#chart', el).innerHTML = barChart(data, { curName: single() ? 'วันนี้ที่เลือก' : 'ช่วงนี้', prevName: single() ? 'วันก่อนหน้า' : yoy ? 'ช่วงเดียวกันปีก่อน' : 'ช่วงก่อนหน้า (จำนวนวันเท่ากัน)' })
      + (!single() && !monthly() && Object.keys(A.months).length ? `<div class="tiny muted center">เดือนที่มีแต่ยอดรวมทั้งเดือน (นำเข้า) ไม่มีแท่งรายวัน — ดูกราฟรายเดือนได้โดยเลือกช่วง 12 เดือน/ปี</div>` : '');
    // ไฮไลต์: สินค้าขายดี 5 อันดับ · ช่องทางชำระ · ช่วงเวลาขายดี
    const top = Object.values(A.prod).filter(p => p.amt > 0 && !p.pass).sort((a, b) => b.amt - a.amt).slice(0, 5).map(p => ({ n: p.name, v: p.amt, s: `${Math.round(p.qty * 1000) / 1000} ชิ้น${vc ? ' · กำไร ' + money(p.amt - p.cost, 0) : ''}` }));
    const pays = Object.entries(A.pay).filter(([, p]) => p.amt > 0).sort((a, b) => b[1].amt - a[1].amt).map(([k2, p]) => ({ n: PAYNAME[k2] || k2, v: p.amt, c: PAYCOLOR[k2] || '#999' }));
    const hrs = Object.entries(A.hours).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    $('#hl', el).innerHTML = `<div class="card"><h3>🏆 สินค้าขายดี</h3>${hBars(top, '#E53935')}<a href="#" class="small" id="morep">ดูทั้งหมด ›</a></div>
      <div class="card"><h3>💳 ช่องทางชำระ</h3>${pays.length ? mixBar(pays) : '<div class="empty small">ไม่มีข้อมูล</div>'}${hrs.length ? `<div class="kv small" style="margin-top:10px;padding-top:8px;border-top:1px solid var(--line)"><span>⏰ ช่วงขายดีที่สุด</span><b>${hrs[0][0]}:00–${String(+hrs[0][0] + 1).padStart(2, '0')}:00 น.</b></div>` : ''}${A.bills ? `<div class="kv small"><span>🧾 สินค้าต่อบิล (เฉลี่ย)</span><b>${(R.filter(o => o.status !== 'refund').reduce((s, o) => s + num(o.itemCount), 0) / A.bills).toFixed(1)} ชิ้น</b></div>` : ''}</div>`;
    $('#morep', el).onclick = e => { e.preventDefault(); RS.tab = 'prod'; $$('#tabs button', el).forEach(x => x.classList.toggle('on', x.dataset.t === 'prod')); drawTab(); $('#tabs', el).scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    const tb0 = $('#tabs [data-t="day"]', el); if (tb0) tb0.textContent = monthly() ? 'ตามเดือน' : 'ตามวัน';
    drawTab();
  };
  const drawTab = () => {
    const tab = RS.tab; let h = '';
    if (tab === 'day') {
      let dl = Object.keys(A.days).map(d => [d, A.days[d].bills || (A.days[d].imp ? 'นำเข้า' : 0), A.days[d].net, A.days[d].cost])
        .concat(Object.values(A.months).map(m => [m.ym, 'รายเดือน', m.net, m.cost])).sort((a2, b) => b[0].localeCompare(a2[0]));
      if (monthly()) {   // ช่วงยาว: รวมเป็นรายเดือน
        const g = {}; dl.forEach(r => { const ym = r[0].slice(0, 7), x = g[ym] || (g[ym] = [ym, 0, 0, 0, new Set()]); if (typeof r[1] === 'number') x[1] += r[1]; else x[4].add(r[1]); x[2] += r[2]; x[3] += r[3]; });
        dl = Object.values(g).sort((a2, b) => b[0].localeCompare(a2[0])).map(x => [x[0], x[1] || (x[4].has('รายเดือน') ? 'รายเดือน' : 'นำเข้า'), x[2], x[3]]);
      }
      tableRows = [[monthly() ? 'เดือน' : 'วันที่', 'บิล', 'ยอดขายสุทธิ'].concat(vc ? ['ต้นทุน', 'กำไร'] : [])].concat(dl.map(r => [r[0], r[1], r[2]].concat(vc ? [r[3], r[2] - r[3]] : [])));
      h = tbl(tableRows, r => [r[0].length === 7 ? (monthly() ? '' : 'ทั้งเดือน ') + TH_MF[+r[0].slice(5, 7) - 1] + ' ' + (+r[0].slice(0, 4) + 543) : thDate(r[0])].concat(r.slice(1).map((v, i) => i === 0 ? (typeof v === 'string' ? `<span class="tag gray" style="white-space:nowrap">${v}</span>` : v) : money(v, vc ? 2 : 0))));
    } else if (tab === 'prod') {
      const list = Object.values(A.prod).sort((a, b) => b.amt - a.amt);
      tableRows = [['สินค้า', 'หมวด', 'จำนวน', 'ยอดขาย'].concat(vc ? ['ต้นทุน', 'กำไร'] : [])].concat(list.map(p => [p.name, p.cat, round3(p.qty), p.amt].concat(vc ? [p.cost, p.amt - p.cost] : [])));
      h = tbl(tableRows.slice(0, 201), r => [esc(r[0]), `<span class="tiny muted">${esc(r[1])}</span>`, r[2]].concat(r.slice(3).map(v => money(v)))) + (list.length > 200 ? `<div class="tiny muted center">แสดง 200 จาก ${list.length} รายการ (ส่งออก CSV เพื่อดูทั้งหมด)</div>` : '');
    } else if (tab === 'cat') {
      const list = Object.entries(A.cat).sort((a, b) => b[1].amt - a[1].amt);
      h = hBars(list.slice(0, 12).map(([n, c]) => ({ n, v: c.amt, c: catColor(n) })));
      tableRows = [['หมวดหมู่', 'จำนวน', 'ยอดขาย'].concat(vc ? ['ต้นทุน', 'กำไร'] : [])].concat(list.map(([n, c]) => [n, round3(c.qty), c.amt].concat(vc ? [c.cost, c.amt - c.cost] : [])));
      h += tbl(tableRows, r => [esc(r[0]), r[1]].concat(r.slice(2).map(v => money(v))));
    } else if (tab === 'staff') {
      const list = Object.entries(A.staff).sort((a, b) => b[1].net - a[1].net);
      h = list.length > 1 ? hBars(list.map(([n, s2]) => ({ n, v: s2.net, s: s2.bills + ' บิล' })), '#1F5FBF') : '';
      tableRows = [['พนักงาน', 'บิล', 'คืนเงิน', 'ยอดขายสุทธิ', 'เฉลี่ย/บิล'].concat(vc ? ['กำไร'] : [])].concat(list.map(([n, s2]) => [n, s2.bills, s2.refund, s2.net, s2.bills ? s2.net / s2.bills : 0].concat(vc ? [s2.net - s2.cost] : [])));
      h += tbl(tableRows, r => [esc(r[0]), r[1]].concat(r.slice(2).map(v => money(v))));
    } else if (tab === 'pay') {
      // ยอดรวมแต่ละประเภท + ตารางรายวัน/รายเดือนแยกคอลัมน์ตามประเภท
      const M = payMatrix(RV, RS.pays, monthly()), tot = M.types.reduce((a2, k2) => a2 + M.tot[k2], 0);
      h = M.types.length ? hBars(M.types.map(k2 => ({ n: payName(k2), v: M.tot[k2], c: PAYCOLOR[k2] || '#999', s: M.n[k2] + ' บิล · ' + (tot ? (M.tot[k2] / tot * 100).toFixed(1) : 0) + '%' }))) : '';
      tableRows = [[monthly() ? 'เดือน' : 'วันที่'].concat(M.types.map(payName), ['รวม'])].concat(M.keys.map(d => [d].concat(M.types.map(k2 => M.cell[d][k2] || 0), [M.types.reduce((a2, k2) => a2 + (M.cell[d][k2] || 0), 0)])));
      h += tbl(tableRows, r => [r[0].length === 7 ? TH_MF[+r[0].slice(5, 7) - 1] + ' ' + (+r[0].slice(0, 4) + 543) : thDate(r[0])].concat(r.slice(1).map((v, i) => i === r.length - 2 ? `<b>${money(v)}</b>` : v ? money(v) : '<span class="muted">–</span>')))
        + (M.keys.length ? `<div class="kv small" style="margin-top:6px"><b>รวมทั้งช่วง</b><b class="num">${money(tot)}</b></div>` : '');
    }
    $('#tb', el).innerHTML = h;
  };
  const round3 = v => Math.round(v * 1000) / 1000;
  const tbl = (rs, fmt) => rs.length > 1 ? `<div class="scroll-x" style="margin-top:10px"><table class="t"><tr>${rs[0].map((h, i) => `<th class="${i ? 'right' : ''}">${h}</th>`).join('')}</tr>${rs.slice(1).map(r => `<tr>${fmt(r).map((c, i) => `<td class="${i ? 'right num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table></div>` : '<div class="empty">ไม่มีข้อมูลในช่วงนี้</div>';
  const load = async force => {
    $('#kpi', el).innerHTML = '<div class="card center"><span class="spin dark"></span></div>';
    const [pf, pt] = prevRange(RS.from, RS.to);
    try { [rows, prows, imp, pimp] = await Promise.all([fetchOrders(RS.from, RS.to, force), fetchOrders(pf, pt).catch(() => []), importedSales(RS.from, RS.to), importedSales(pf, pt)]); } catch (e) { rows = []; prows = []; toast(e.message, 1); }
    if (!el.isConnected) return;
    const staffs = [...new Set(rows.map(o => o.cashierName || o.cashier))];
    $('#sf', el).innerHTML = all && staffs.length > 1 ? `<select class="in" id="st" style="margin-bottom:10px"><option value="">พนักงานทั้งหมด</option>${staffs.map(x => `<option ${RS.staff === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : '';
    const st = $('#st', el); if (st) st.onchange = e => { RS.staff = e.target.value; draw(); };
    draw();
  };
  $$('#tabs button', el).forEach(b => b.onclick = () => { RS.tab = b.dataset.t; $$('#tabs button', el).forEach(x => x.classList.toggle('on', x === b)); drawTab(); });
  $('#ex', el).onclick = () => download(`sales_${RS.tab}_${RS.from}_${RS.to}.csv`, toCSV(tableRows.map(r => r.map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v))));
  const exx = $('#exx', el); if (exx) exx.onclick = () => payExportDlg(rows.filter(o => !RS.staff || (o.cashierName || o.cashier) === RS.staff), RS.from, RS.to);
  drawPf();
  rangePicker($('#rp', el), RS, () => load());
  load();
  // สถานะข้อมูลในเครื่อง
  if (window.OStore && OStore.allowed()) {
    el.insertAdjacentHTML('beforeend', '<div class="tiny muted center" id="osi" style="margin:10px 0 4px"></div>');
    const thd = d => d ? thDate(d) : '—';
    OStore.info().then(i => { const o = $('#osi', el); if (!o) return; o.innerHTML = i.from ? `ข้อมูลในเครื่อง ${i.count.toLocaleString()} บิล ตั้งแต่ ${thd(i.from)}${i.busy ? ' · กำลังดึงย้อนหลัง…' : ''} · อัปเดต ${i.at ? new Date(i.at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) + ' น.' : '—'} · <a href="#" id="osr">ดึงใหม่ทั้งหมด</a>` : 'กำลังเตรียมข้อมูลในเครื่อง (ครั้งแรก) — ระหว่างนี้ใช้ข้อมูลออนไลน์'; const r = $('#osr', el); if (r) r.onclick = async e => { e.preventDefault(); if (await confirmDlg('ลบข้อมูลบิลในเครื่องแล้วดึงใหม่ทั้งหมด (ใช้เวลาสักครู่ เบื้องหลัง)?', 'ดึงใหม่')) { await OStore.reset(); toast('เริ่มดึงข้อมูลใหม่แล้ว'); } }; });
  }
}

/* ---------- ใบเสร็จรับเงินย้อนหลัง ---------- */
const RR = { r: 'today', from: todayISO(), to: todayISO(), q: '' };
VIEWS.salesreceipts = el => {
  const limited = !seesSales();
  if (limited) { RR.r = 'today'; RR.from = RR.to = todayISO(); }
  el.innerHTML = vhead(limited ? 'บิลของฉันวันนี้' : 'ใบเสร็จรับเงิน', isOwner() ? `<button class="btn ghost sm" id="rx">${I(IC.io, 18)} ส่งออก / นำเข้า</button>` : '', 'more') + `<div id="rp"></div>
    <div class="grid3" id="sm" style="margin-bottom:10px"></div>
    <div class="search" style="margin-bottom:10px"><svg class="s" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input class="in" id="q" placeholder="ค้นหาเลขที่ / ลูกค้า / พนักงาน" value="${esc(RR.q)}"><button class="scanbtn" id="sc">${I(IC.scan, 20)}</button></div>
    <div class="list" id="ls"><div class="empty"><span class="spin dark"></span></div></div>`;
  let rows = [];
  const draw = () => {
    const t = norm(RR.q);
    const res = rows.filter(o => !t || norm(o.id + o.customerName + o.cashierName).includes(t));
    const sales = rows.filter(o => o.status !== 'refund'), refunds = rows.filter(o => o.status === 'refund');
    $('#sm', el).innerHTML = `<div class="stat center"><div class="k">ใบเสร็จทั้งหมด</div><div class="v">${rows.length}</div></div><div class="stat center"><div class="k">ขาย</div><div class="v" style="color:var(--green)">${sales.length}</div></div><div class="stat center"><div class="k">คืนเงิน</div><div class="v" style="color:var(--red)">${refunds.length}</div></div>`;
    $('#ls', el).innerHTML = res.length ? res.slice(0, 300).map(o => `<div class="item" data-id="${esc(o.id)}"><div class="grow"><div class="t">${esc(o.id)} ${o._pending ? '<span class="tag amber">รอส่ง</span>' : ''}${o.status === 'refunded' ? '<span class="tag gray">คืนเงินแล้ว</span>' : ''}</div><div class="m">${esc(String(o.date).replace('T', ' ').slice(0, 16))} · ${esc(o.cashierName || o.cashier)}${o.customerName ? ' · ' + esc(o.customerName) : ''} · ${esc(o._pays.map(p => PAYNAME[p.type] || p.type).join('+'))}</div></div><div class="price" style="font-size:16px;color:${o.status === 'refund' ? 'var(--red)' : 'var(--ink)'}">${o.status === 'refund' ? 'คืน ' : ''}${baht(Math.abs(num(o.total)))}</div></div>`).join('') : '<div class="empty">ไม่มีใบเสร็จ</div>';
    $$('#ls [data-id]', el).forEach(x => x.onclick = () => orderDetail(rows.find(o => o.id === x.dataset.id), () => load(true)));
  };
  // บิลที่ขายจากเครื่องนี้ (วันนี้) + บิลรอส่ง → แสดงทันที ไม่ต้องรอเน็ต
  const localRows = () => {
    const m = new Map(), inR = o => { const d = String(o.date).slice(0, 10); return d >= RR.from && d <= RR.to; }, mine = o => !limited || !S.user || o.cashier === S.user.username;
    [...LS.get('dayOrders', []), ...LS.get('recentOrders', [])].forEach(o => { if (o && o.id && !m.has(o.id)) m.set(o.id, o); });
    (Sync.box || []).forEach(o => m.set(o.id, { ...(m.get(o.id) || {}), ...o, _pending: 1 }));
    return [...m.values()].filter(o => inR(o) && mine(o)).map(o => ({ ...o, _items: o._items || Logic.J(o.items, []), _pays: o._pays || Logic.J(o.payments, []) }));
  };
  const merge = (a, b) => { const ids = new Set(a.map(o => o.id)); return a.concat(b.filter(o => !ids.has(o.id))).sort((x, y) => String(y.date).localeCompare(x.date)); };
  let seq = 0;
  const load = async force => {
    const my = ++seq, fast = !(window.OStore && OStore.allowed());
    if (fast) { rows = merge([], localRows()); if (rows.length) draw(); }
    if (!fast || !rows.length) $('#ls', el).innerHTML = '<div class="empty"><span class="spin dark"></span></div>';
    try { const r = await fetchOrders(RR.from, RR.to, force); if (my !== seq || !el.isConnected) return; rows = merge(r, localRows()); }
    catch (e) { if (my !== seq) return; rows = merge([], localRows()); if (!fast || !rows.length) toast(e.offline ? 'ไม่มีเน็ต — แสดงบิลในเครื่องนี้' : e.message + ' — แสดงบิลในเครื่องนี้', 1); }
    draw();
  };
  $('#q', el).oninput = e => { RR.q = e.target.value; draw(); };
  $('#sc', el).onclick = () => openScanner(code => { $('#q', el).value = RR.q = code; draw(); const o = rows.find(x => x.id === code); if (o) orderDetail(o, () => load(true)); return 'close'; });
  if (!limited) rangePicker($('#rp', el), RR, () => load());
  const rx = $('#rx', el); if (rx) rx.onclick = () => receiptsIO(rows.filter(o => !o._pending), () => load(true));
  load();
};
// เปิดใบเสร็จจากเลขที่: บิลที่รอส่ง → บิลในเครื่อง (13 เดือน) → ถาม Google
async function openOrderById(id, date) {
  const day = String(date || '').slice(0, 10);
  let o = (Sync.box || []).find(x => x.id === id);
  if (!o && window.OStore && OStore.allowed() && day) { try { const r = await OStore.query(day, day); o = r && r.find(x => x.id === id); } catch (e) { } }
  if (!o) { try { busy(1, 'กำลังเปิดใบเสร็จ...'); o = (await api('getOrder', { id })).order; } catch (e) { busy(0); return toast(e.offline ? 'ไม่มีเน็ต — เปิดใบเสร็จนี้ไม่ได้' : e.message, 1); } busy(0); }
  orderDetail({ ...o, _items: Logic.J(o.items, []), _pays: Logic.J(o.payments, []) });
}
function orderDetail(o, onChange) {
  const isR = o.status === 'refund';
  const ov = sheet(`${isR ? 'ใบคืนเงิน' : 'ใบเสร็จ'} ${esc(o.id)}`, `
    <div class="card"><div class="kv"><span class="muted">วันที่</span><span>${esc(String(o.date).replace('T', ' ').slice(0, 16))}</span></div><div class="kv"><span class="muted">พนักงาน</span><span>${esc(o.cashierName || o.cashier)}</span></div>${o.deviceName ? `<div class="kv"><span class="muted">เครื่อง</span><span>${esc(o.deviceName)}</span></div>` : ''}${o.customerName ? `<div class="kv"><span class="muted">ลูกค้า</span><span>${esc(o.customerName)}</span></div>` : ''}${o.refundOf ? `<div class="kv"><span class="muted">อ้างอิง</span><span>${esc(o.refundOf)}</span></div>` : ''}${o.note ? `<div class="kv"><span class="muted">หมายเหตุ</span><span>${esc(o.note)}</span></div>` : ''}</div>
    <div class="card">${o._items.map(it => `<div class="kv"><span>${esc(it.name)} <span class="muted">× ${num(it.qty)}</span></span><span>${it.price === '' || it.price == null ? '' : money(num(it.qty) * num(it.price))}</span></div>`).join('')}
      ${num(o.discount) ? `<div class="kv"><span>ส่วนลด</span><span>-${money(Math.abs(num(o.discount)))}</span></div>` : ''}<div class="kv" style="font-weight:700;font-size:17px"><span>รวม</span><span>${baht(o.total)}</span></div>
      ${o._pays.map(p => `<div class="kv small"><span>${PAYNAME[p.type] || p.type}</span><span>${money(p.amount)}</span></div>`).join('')}${num(o.change) ? `<div class="kv small"><span>รับเงิน / ทอน</span><span>${money(o.cash)} / ${money(o.change)}</span></div>` : ''}
      ${can('viewCost') && o.cost !== '' ? `<div class="kv small muted"><span>ต้นทุน / กำไร</span><span>${money(o.cost)} / ${money(num(o.total) - num(o.cost))}</span></div>` : ''}</div>`,
    `<button class="btn ghost grow" id="pr">${I(IC.print, 18)} พิมพ์ซ้ำ</button>${o.status === 'sale' && can('refund') && !o._pending ? `<button class="btn grow" id="rf">${I(IC.refund, 18)} คืนเงิน</button>` : ''}`);
  $('#pr', ov).onclick = () => RP.printOrder({ ...o, reprint: true }).catch(e => toast(e.message, 1));
  const rf = $('#rf', ov); if (rf) rf.onclick = () => {
    const o2 = sheet('คืนเงินทั้งใบ', `<p class="small">คืนเงิน <b>${baht(o.total)}</b> ให้ใบเสร็จ ${esc(o.id)} — ระบบจะคืนสต็อก${o.customerId ? ' ปรับยอด/แต้ม/เงินเชื่อของลูกค้า' : ''} และออกใบคืนเงิน</p><label class="f"><span>เหตุผล</span><input class="in" id="rs" placeholder="เช่น สินค้าชำรุด"></label>`, `<button class="btn block" id="ok">ยืนยันคืนเงิน</button>`);
    $('#ok', o2).onclick = async () => {
      try { busy(1, 'กำลังคืนเงิน...'); const r = await api('refund', { id: o.id, reason: $('#rs', o2).value }); window.OStore && OStore.sync(true); await loadProducts(true); busy(0); o2.remove(); ov.remove(); toast('คืนเงินแล้ว'); const rr = { ...r.refund }; if (pconn().autoPrint) RP.printOrder(rr).catch(() => { }); onChange && onChange(); }
      catch (e) { busy(0); toast(e.message, 1); }
    };
  };
}

/* ---------- การ์ด "วันนี้" บนหน้าหลัก ---------- */
async function homeToday(el) {
  const t = todayISO();
  if (!seesSales()) {
    el.innerHTML = `<div class="card row"><div class="grow"><b>${S.shift ? 'กำลังทำงาน' : 'ยังไม่ได้ลงเวลาเข้างาน'}</b>${S.shift ? `<div class="small muted">เข้างานเมื่อ ${esc(S.shift.inAt.slice(11, 16))} น.</div>` : ''}</div><button class="btn ${S.shift ? 'ghost' : 'green'}" id="clk">${I(IC.clock, 18)} ${S.shift ? 'ลงเวลาออก' : 'ลงเวลาเข้า'}</button></div>`;
    $('#clk', el).onclick = clockToggle; return;
  }
  el.innerHTML = `<div class="card" style="background:linear-gradient(135deg,var(--red),#F0384F);color:#fff"><div class="row"><div class="grow"><div class="small" style="opacity:.9">ยอดขายวันนี้${canStrict('reports') ? '' : ' (ของฉัน)'}</div><div class="disp" style="font-size:30px;font-weight:700" id="tn">…</div><div class="small" style="opacity:.9" id="tb"></div></div>
    <button class="btn" id="clk" style="background:#fff;color:var(--red-d);flex-direction:column;gap:0;min-width:96px">${I(IC.clock, 20)}<span class="tiny">${S.shift ? 'ลงเวลาออก' : 'ลงเวลาเข้า'}</span></button></div>
    ${S.shift ? `<div class="tiny" style="margin-top:6px;opacity:.9">เข้างานเมื่อ ${esc(S.shift.inAt.slice(11, 16))} น.</div>` : ''}</div>`;
  $('#clk', el).onclick = clockToggle;
  try { const rows = await fetchOrders(t, t); const A = aggregate(rows); $('#tn', el).textContent = baht(A.net); $('#tb', el).textContent = `${A.bills} บิล · เฉลี่ย ${baht(A.bills ? A.net / A.bills : 0)}${can('viewCost') ? ' · กำไร ' + baht(A.profit) : ''}`; }
  catch (e) { $('#tn', el).textContent = '-'; $('#tb', el).textContent = e.message; }
}
window.homeToday = homeToday;

/* ---------- ส่งออก / นำเข้าใบเสร็จรับเงิน (เจ้าของ) ----------
   ส่งออก: CSV / Excel ตามช่วงวันที่ที่เลือก (มีคอลัมน์ JSON ไว้นำกลับเข้าระบบได้ครบ)
   นำเข้า: ไฟล์ที่ส่งออกจากระบบนี้ หรือไฟล์ "ใบเสร็จ" ที่ส่งออกจาก Loyverse (ไทย/อังกฤษ) · ตรวจเลขที่ใบเสร็จซ้ำก่อนบันทึก */
const RX_HEAD = ['วันที่', 'เลขที่ใบเสร็จ', 'ประเภท', 'ยอดขายรวม', 'ส่วนลด', 'ยอดขายสุทธิ', 'ต้นทุน', 'กำไร', 'การชำระเงิน', 'รายการ', 'เครื่อง', 'พนักงาน', 'ลูกค้า', 'สถานะ', 'อ้างอิงคืนเงิน', 'หมายเหตุ', 'ข้อมูลรายการ (JSON)', 'ข้อมูลการชำระ (JSON)', 'รหัสพนักงาน', 'รหัสลูกค้า'];
function ordersToSheet(rows) {
  const list = rows.slice().sort((a, b) => String(a.date).localeCompare(b.date));
  return [RX_HEAD].concat(list.map(o => {
    const its = o._items || Logic.J(o.items, []), ps = o._pays || Logic.J(o.payments, []);
    return [String(o.date).replace('T', ' ').slice(0, 19), o.id, o.status === 'refund' ? 'คืนเงิน' : 'ขาย', num(o.subtotal) || num(o.total), num(o.discount), num(o.total), o.cost === '' ? '' : num(o.cost), o.cost === '' ? '' : Math.round((num(o.total) - num(o.cost)) * 100) / 100,
      ps.map(p => PAYNAME[p.type] || p.type).join(', '), its.map(i => `${num(i.qty)} x ${i.name}`).join(', '), o.deviceName || '', o.cashierName || o.cashier || '', o.customerName || '',
      o.status === 'refunded' ? 'คืนเงินแล้ว' : o.status === 'refund' ? 'ใบคืนเงิน' : 'ปกติ', o.refundOf || '', o.note || '', JSON.stringify(its), JSON.stringify(ps), o.cashier || '', o.customerId || ''];
  }));
}
// วันที่หลายรูปแบบ: 2026-11-22 13:06 · 22/11/26 13:06 (Loyverse ไทย) · 11/22/2026 1:06 PM · ปี พ.ศ.
function rxDateOrder(vals) { let dmy = 0, mdy = 0; vals.forEach(v => { const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{2,4}/.exec(String(v).trim()); if (m) { if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; } }); return mdy > dmy ? 'mdy' : 'dmy'; }
function rxDate(v, order) {
  v = String(v || '').trim(); let m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d{1,2}):(\d\d)(?::(\d\d))?)?/.exec(v), y, mo, d, h = 0, mi = 0, se = 0;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0); }
  else {
    m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:,?\s+(\d{1,2}):(\d\d)(?::(\d\d))?\s*(AM|PM|am|pm)?)?/.exec(v); if (!m) return '';
    [d, mo] = order === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]]; y = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0);
    if (m[7]) { const pm = /pm/i.test(m[7]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  }
  if (y < 100) y = y >= 50 ? 2500 + y - 543 : 2000 + y; else if (y > 2400) y -= 543;
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return '';
  const p = x => String(x).padStart(2, '0'); return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(se)}`;
}
const RX_PAY = t => { t = String(t || '').trim(); return /เงินสด|^cash$/i.test(t) ? 'cash' : /โอน|สแกน|พร้อมเพย์|transfer|qr|promptpay/i.test(t) ? 'transfer' : /สวัสดิการ|welfare/i.test(t) ? 'welfare' : /เซ็น|เชื่อ|credit/i.test(t) ? 'credit' : (Object.keys(PAYNAME).find(k => PAYNAME[k] === t) || t || 'cash'); };
function rxParse(aoa) {
  const head = (aoa[0] || []).map(h => String(h).replace(/^﻿/, '').trim()), body = aoa.slice(1);
  const F = {}, used = new Set(), find = (k, re) => { const i = head.findIndex((h, j) => !used.has(j) && re.test(h)); if (i >= 0) { F[k] = i; used.add(i); } };
  find('itemsJ', /^ข้อมูลรายการ/); find('paysJ', /^ข้อมูลการชำระ/); find('cashierId', /^รหัสพนักงาน$/); find('custId', /^รหัสลูกค้า$/);
  find('date', /^(วันที่|date)$/i); find('id', /^(เลขที่ใบเสร็จ|receipt number|receipt #)$/i); find('pay', /^(ประเภทการชำระเงิน|การชำระเงิน|payment type)$/i); find('type', /^(ประเภทใบเสร็จ|ประเภท|receipt type)$/i);
  find('gross', /^(ยอดขายรวม|gross sales)$/i); find('disc', /^(ส่วนลด|discounts?)$/i); find('net', /^(ยอดขายสุทธิ|net sales)$/i); find('coll', /^(ยอดที่เก็บรวบรวม|total collected)$/i);
  find('cost', /^(ต้นทุนของสินค้า|ต้นทุน|cost of goods)$/i); find('desc', /^(คำอธิบาย|รายการ|description)$/i); find('pos', /^(ระบบขายหน้าร้าน|เครื่อง|pos)$/i);
  find('cashier', /^(ชื่อแคชเชียร์|พนักงาน|cashier name)$/i); find('cust', /^(ชื่อลูกค้า|ลูกค้า|customer name)$/i); find('status', /^(สถานะ|status)$/i); find('ref', /^อ้างอิงคืนเงิน$/); find('note', /^(หมายเหตุ|note)$/i);
  if (F.id == null || F.date == null || (F.net == null && F.itemsJ == null)) throw new Error('ไม่พบคอลัมน์ "วันที่" "เลขที่ใบเสร็จ" "ยอดขายสุทธิ" — ใช้ไฟล์ใบเสร็จที่ส่งออกจากระบบนี้หรือจาก Loyverse');
  const own = F.itemsJ != null, src = own ? 'ไฟล์ส่งออกจากระบบนี้' : 'ไฟล์ใบเสร็จจาก Loyverse', order = rxDateOrder(body.map(r => r[F.date]));
  const g = (r, k) => F[k] == null ? '' : String(r[F[k]] == null ? '' : r[F[k]]).trim(), N = v => num(String(v).replace(/[฿,\s]/g, ''));
  const out = [], cancelled = [], bad = [];
  body.forEach((r, i) => {
    const rid = g(r, 'id'), date = rxDate(g(r, 'date'), order);
    if (!rid || !date) { bad.push(i + 2); return; }
    const st = g(r, 'status');
    if (!own && /ยกเลิก|cancel|void/i.test(st)) { cancelled.push(rid); return; }
    const refund = /คืน|refund/i.test(g(r, 'type')), sg = refund ? -1 : 1;
    let items, pays;
    if (own) { items = Logic.J(g(r, 'itemsJ'), []); pays = Logic.J(g(r, 'paysJ'), []); }
    else {
      const net = Math.abs(N(g(r, 'net'))) || Math.abs(N(g(r, 'coll')));
      items = g(r, 'desc').split(/,\s*(?=\d+(?:\.\d+)?\s*[x×]\s)/).filter(x => x.trim()).map(x => { const m = /^(\d+(?:\.\d+)?)\s*[x×]\s*(.+)$/.exec(x.trim()); return m ? { name: m[2].trim(), qty: +m[1], price: '' } : { name: x.trim(), qty: 1, price: '' }; });
      if (items.length === 1 && items[0].qty) items[0].price = Math.round(net / items[0].qty * 100) / 100;
      const types = g(r, 'pay').split(/\s*,\s*/).filter(Boolean).map(RX_PAY);
      pays = (types.length ? types : ['cash']).map((t, j) => ({ type: t, amount: j ? 0 : sg * net }));
    }
    const subtotal = own ? N(g(r, 'gross')) : sg * Math.abs(N(g(r, 'gross')));
    const total = own ? N(g(r, 'net')) : sg * (Math.abs(N(g(r, 'net'))) || Math.abs(N(g(r, 'coll'))));
    const cost = g(r, 'cost') === '' ? '' : (own ? N(g(r, 'cost')) : sg * Math.abs(N(g(r, 'cost'))));
    const stText = g(r, 'status');
    out.push({
      id: own ? rid : 'LV-' + rid, date, deviceId: '', deviceName: own ? g(r, 'pos') : 'Loyverse' + (g(r, 'pos') ? ' · ' + g(r, 'pos') : ''),
      cashier: own ? g(r, 'cashierId') : '', cashierName: g(r, 'cashier'), customerId: own ? g(r, 'custId') : '', customerName: g(r, 'cust'),
      items: JSON.stringify(items), itemCount: String(items.reduce((a, x) => a + (num(x.qty) || 0), 0)), subtotal: String(subtotal), discount: String(own ? N(g(r, 'disc')) : sg * Math.abs(N(g(r, 'disc')))), total: String(total), cost: String(cost),
      payments: JSON.stringify(pays), payType: (pays[0] && pays[0].type) || '', status: refund ? 'refund' : (own && /คืนเงินแล้ว/.test(stText) ? 'refunded' : 'sale'), refundOf: g(r, 'ref'),
      note: own ? g(r, 'note') : 'นำเข้าจาก Loyverse'
    });
  });
  // เลขที่ซ้ำกันเองในไฟล์
  const seen = new Set(), inFile = [], rows = out.filter(o => { if (seen.has(o.id)) { inFile.push(o.id); return false; } seen.add(o.id); return true; });
  return { rows, src, cancelled, bad, inFile, order };
}
async function readTableFile(f) {
  if (/\.xlsx?$/i.test(f.name)) { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX'); const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }); }
  return parseCSV(await f.text());
}
// รายงานผล + บันทึกประวัติ (เก็บในตั้งค่า เห็นได้ทุกเครื่องของเจ้าของ)
function ioReport(title, lines, kind) {
  sheet(title, `<div class="card">${lines.map(l => Array.isArray(l) ? `<div class="kv"><span>${l[0]}</span><b>${l[1]}</b></div>` : `<div class="small muted" style="margin-top:6px">${l}</div>`).join('')}</div>`, `<button class="btn block" onclick="this.closest('.ov').remove()">ตกลง</button>`);
  if (kind) ioLog(kind, title + ' — ' + lines.filter(l => Array.isArray(l) && !/^0 /.test(String(l[1]))).map(l => `${String(l[0]).replace(/<[^>]+>/g, '')} ${String(l[1]).replace(/<[^>]+>/g, '')}`).join(' · '));
}
function ioLog(kind, text) {
  const h = cfg('ioHistory', { list: [] }); h.list = [{ at: new Date().toISOString(), by: (S.user && S.user.name) || '', kind, text }].concat(h.list || []).slice(0, 40);
  saveSetting('ioHistory', { list: h.list }).catch(() => { });
}
window.ioReport = ioReport; window.ioLog = ioLog; window.readTableFile = readTableFile;
/* ---------- นำเข้าใบเสร็จจำนวนมาก (แสนใบ) ----------
   ส่งทีละชุด (ปรับขนาดชุดเองให้แต่ละครั้ง ~8 วินาที) · ระบบตรวจซ้ำทีละชุด · หน้าต่างแสดงความคืบหน้าละเอียดทุกวินาที
   ไม่ล็อกหน้าจอ/ไม่ออกจากระบบระหว่างทำ · จอไม่ดับ · เน็ตหลุด = รอแล้วลองใหม่เอง · จำจุดที่ทำถึง (ทำต่อได้) · บันทึกประวัติ */
async function rxImportRun(P, f, key, from, prev, reload) {
  const N = P.rows.length, T0 = Date.now(), st = { i: from, added: prev ? prev.added : 0, dup: prev ? prev.dup : 0, bad: prev ? prev.bad : 0, ch: 300, paused: false, stop: false, msg: '', calls: 0, sent: 0, busyMs: 0 };
  const elapsed0 = prev ? prev.elapsed || 0 : 0, log = [];
  S.longJob = (S.longJob || 0) + 1;
  let wl = null; const wake = async () => { try { wl = await navigator.wakeLock.request('screen'); } catch (e) { } };
  wake(); const onVis = () => { if (document.visibilityState === 'visible' && !st.stop) wake(); }; document.addEventListener('visibilitychange', onVis);
  const onUnload = e => { e.preventDefault(); e.returnValue = ''; }; addEventListener('beforeunload', onUnload);
  const ov = document.createElement('div'); ov.className = 'ov rxov'; ov.innerHTML = `<div class="sheet" role="dialog"><div class="sh"><h3>กำลังนำเข้าใบเสร็จ</h3></div><div class="sb" id="rxb"></div><div class="sf"><button class="btn ghost grow" id="rxp">⏸ หยุดชั่วคราว</button><button class="btn ghost" id="rxx" style="color:var(--red)">ยกเลิก</button></div></div>`;
  document.body.appendChild(ov);
  const fmtT = ms => { const s2 = Math.round(ms / 1000), h = Math.floor(s2 / 3600), m = Math.floor(s2 % 3600 / 60), x = s2 % 60; return (h ? h + ' ชม. ' : '') + (h || m ? m + ' นาที ' : '') + x + ' วินาที'; };
  const save = () => LS.set('rxJob', { key, done: st.i, total: N, added: st.added, dup: st.dup, bad: st.bad, at: new Date().toISOString(), elapsed: elapsed0 + Date.now() - T0 });
  const draw = () => {
    const el = Date.now() - T0, doneNow = st.i - from, rate = doneNow / Math.max(1, el / 1000), left = N - st.i, pct = st.i / N * 100;
    const cur = P.rows[Math.min(st.i, N - 1)], ce = P.rows[Math.min(st.i + st.ch, N) - 1] || cur;
    $('#rxb', ov).innerHTML = `
      <div class="small muted">${esc(f.name)}</div>
      <div style="height:14px;border-radius:7px;background:#EEF0F2;margin:10px 0 6px;overflow:hidden"><div style="height:100%;width:${pct.toFixed(2)}%;background:var(--green);border-radius:7px;transition:width .4s"></div></div>
      <div class="row" style="font-size:20px;font-weight:700"><span class="grow num">${st.i.toLocaleString()} / ${N.toLocaleString()} ใบ</span><span class="num">${pct.toFixed(1)}%</span></div>
      <div class="grid3" style="margin:12px 0">
        <div class="stat"><div class="k">นำเข้าใหม่</div><div class="v" style="color:var(--green)">${st.added.toLocaleString()}</div></div>
        <div class="stat"><div class="k">ซ้ำ (ข้าม)</div><div class="v">${st.dup.toLocaleString()}</div></div>
        <div class="stat"><div class="k">ไม่ครบ (ข้าม)</div><div class="v">${st.bad.toLocaleString()}</div></div></div>
      <div class="kv small"><span>ความเร็ว</span><b>${rate >= 1 ? rate.toFixed(1) + ' ใบ/วินาที' : '-'} ${doneNow ? `· ${(el / doneNow).toFixed(1)} ms/ใบ` : ''}</b></div>
      <div class="kv small"><span>เวลาที่ใช้</span><b>${fmtT(elapsed0 + el)}</b></div>
      <div class="kv small"><span>คาดว่าเสร็จในอีก</span><b>${doneNow && rate ? fmtT(left / rate * 1000) : 'กำลังคำนวณ…'}</b></div>
      <div class="kv small"><span>ชุดปัจจุบัน</span><b>${st.i < N ? `ใบที่ ${(st.i + 1).toLocaleString()}–${Math.min(st.i + st.ch, N).toLocaleString()} (${st.ch} ใบ/ชุด)` : '-'}</b></div>
      <div class="kv small"><span>วันที่ของใบเสร็จ</span><b>${cur ? esc(thDate(cur.date.slice(0, 10))) + (ce && ce.date.slice(0, 10) !== cur.date.slice(0, 10) ? ' – ' + esc(thDate(ce.date.slice(0, 10))) : '') : '-'}</b></div>
      <div class="kv small"><span>ใบล่าสุดที่ส่งแล้ว</span><b>${st.i > 0 ? esc(P.rows[st.i - 1].id) + ' · ' + esc(String(P.rows[st.i - 1].date).slice(0, 16).replace('T', ' ')) : '-'}</b></div>
      <div class="small" style="margin-top:8px;padding:8px 10px;border-radius:10px;background:${/รอ|หลุด|ผิดพลาด|หยุด/.test(st.msg) ? '#FFF6E5' : '#F2FBF3'}">${st.paused ? '⏸ หยุดชั่วคราว — กด ▶ ทำต่อ' : esc(st.msg || 'กำลังส่ง…')}</div>
      ${log.length ? `<div class="tiny muted" style="margin-top:8px">ชุดล่าสุด</div><div style="font-size:12px;font-family:ui-monospace,monospace;max-height:132px;overflow:auto;background:#FAFAF9;border-radius:8px;padding:6px 8px">${log.slice(0, 8).map(x => `<div>${x}</div>`).join('')}</div>` : ''}
      <div class="tiny muted" style="margin-top:8px">อย่าปิดหน้านี้หรือปิดเครื่อง · หน้าจอไม่ล็อกและไม่ออกจากระบบระหว่างนำเข้า · ปิดไปแล้วเลือกไฟล์เดิมอีกครั้งเพื่อทำต่อได้</div>`;
  };
  const tick = setInterval(draw, 1000); draw();
  $('#rxp', ov).onclick = () => { st.paused = !st.paused; $('#rxp', ov).textContent = st.paused ? '▶ ทำต่อ' : '⏸ หยุดชั่วคราว'; draw(); };
  $('#rxx', ov).onclick = async () => { if (await confirmDlg('ยกเลิกการนำเข้า? (ใบที่นำเข้าแล้วยังอยู่ · เลือกไฟล์เดิมอีกครั้งเพื่อทำต่อได้)', 'ยกเลิกการนำเข้า', true)) st.stop = true; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let status = 'สำเร็จ';
  try {
    while (st.i < N && !st.stop) {
      if (st.paused) { await sleep(400); continue; }
      const chunk = P.rows.slice(st.i, st.i + st.ch), t1 = Date.now();
      let r = null, tries = 0;
      while (!r && !st.stop) {
        if (!navigator.onLine) { st.msg = 'เน็ตหลุด — รอเชื่อมต่อแล้วส่งต่อเอง…'; await sleep(2000); continue; }
        try { st.msg = `กำลังส่งชุดใบที่ ${(st.i + 1).toLocaleString()}–${(st.i + chunk.length).toLocaleString()} และตรวจซ้ำ…`; r = await api('importOrders', { rows: chunk }); }
        catch (err) {
          if (!S.user || (!err.offline && /เจ้าของ|สิทธิ์|เข้าสู่ระบบ/.test(err.message))) throw err;   // ออกจากระบบ/ไม่มีสิทธิ์ = หยุด · อย่างอื่นลองใหม่เอง
          tries++; const w = Math.min(60, 2 ** tries) * 1000; st.msg = `ส่งไม่สำเร็จ (${err.message}) — ลองใหม่ใน ${Math.round(w / 1000)} วินาที (ครั้งที่ ${tries})`;
          if (tries >= 3 && st.ch > 100) st.ch = Math.max(100, Math.floor(st.ch / 2));
          await sleep(w);
        }
      }
      if (!r) break;
      const ms = Date.now() - t1;
      st.added += r.added; st.dup += r.dup; st.bad += r.bad; st.i += chunk.length; st.calls++; st.busyMs += ms;
      log.unshift(`${new Date().toTimeString().slice(0, 8)}  #${(st.i - chunk.length + 1).toLocaleString()}–${st.i.toLocaleString()}  +${r.added} ซ้ำ ${r.dup}${r.bad ? ' ไม่ครบ ' + r.bad : ''}  ${(ms / 1000).toFixed(1)}s`);
      st.msg = `ชุดล่าสุด ${chunk.length} ใบ ใช้ ${(ms / 1000).toFixed(1)} วินาที`;
      // ปรับขนาดชุดให้แต่ละครั้งใช้เวลา ~8 วินาที (ไม่ช้า ไม่เสี่ยงหมดเวลาของ Google)
      st.ch = Math.max(100, Math.min(2000, Math.round(st.ch * Math.min(2, Math.max(.5, 8000 / Math.max(500, ms))))));
      save();
    }
    if (st.stop) status = 'ยกเลิกกลางคัน';
  } catch (err) { status = 'หยุดเพราะผิดพลาด: ' + err.message; toast(err.message, 1, 8000); }
  clearInterval(tick); S.longJob = Math.max(0, (S.longJob || 1) - 1);
  removeEventListener('beforeunload', onUnload); document.removeEventListener('visibilitychange', onVis); try { wl && wl.release(); } catch (e) { }
  ov.remove();
  const all = st.i >= N; if (all) LS.del('rxJob'); else save();
  const dur = elapsed0 + Date.now() - T0, ds = P.rows.map(o => o.date);
  Cache.staleBefore = Date.now(); if (window.OStore) OStore.sync(true).catch(() => { });
  const lines = [['ไฟล์', esc(f.name)], ['สถานะ', all ? '<span style="color:var(--green)">นำเข้าครบ</span>' : `<span style="color:var(--red)">${esc(status)}</span>`], ['ทำไปแล้ว', `${st.i.toLocaleString()} / ${N.toLocaleString()} ใบ`], ['นำเข้าใหม่', st.added.toLocaleString() + ' ใบ'], ['ข้าม (ซ้ำในระบบ)', st.dup.toLocaleString() + ' ใบ'],
    ...(P.inFile.length ? [['ข้าม (ซ้ำในไฟล์)', P.inFile.length.toLocaleString() + ' ใบ']] : []), ...(P.cancelled.length ? [['ข้าม (ยกเลิก)', P.cancelled.length.toLocaleString() + ' ใบ']] : []), ...(st.bad + P.bad.length ? [['ข้าม (ข้อมูลไม่ครบ)', (st.bad + P.bad.length).toLocaleString() + ' แถว']] : []),
    ['ช่วงวันที่', `${thDate(ds[0].slice(0, 10))} – ${thDate(ds[ds.length - 1].slice(0, 10))}`], ['เวลาที่ใช้', fmtT(dur)], ['ความเร็วเฉลี่ย', st.i - from ? `${((st.i - from) / Math.max(1, (Date.now() - T0) / 1000)).toFixed(1)} ใบ/วินาที` : '-'],
    ...(all ? [] : ['ทำต่อ: เลือกไฟล์เดิมอีกครั้ง แล้วกด "ทำต่อ"'])];
  ioReport(all ? 'นำเข้าใบเสร็จรับเงินแล้ว' : 'นำเข้าใบเสร็จยังไม่ครบ', lines, '');
  ioLog('import-rx', `${f.name} · ${all ? 'ครบ' : status} · ${st.i.toLocaleString()}/${N.toLocaleString()} ใบ · ใหม่ ${st.added.toLocaleString()} · ซ้ำ ${(st.dup + P.inFile.length).toLocaleString()} · ${fmtT(dur)}`);
  reload && reload();
}
window.rxImportRun = rxImportRun;

function receiptsIO(rows, reload) {
  const sales = rows.filter(o => o.status !== 'refund').length, ref = rows.length - sales;
  const ov = sheet('ส่งออก / นำเข้าใบเสร็จรับเงิน', `
    <div class="card"><b>ส่งออก</b><div class="small muted" style="margin:4px 0 8px">ช่วงที่เลือก ${esc(thDate(RR.from))} – ${esc(thDate(RR.to))} · ${rows.length.toLocaleString()} ใบ (ขาย ${sales} · คืนเงิน ${ref})</div>
      <div class="row" style="gap:8px"><button class="btn ghost grow" id="xc" ${rows.length ? '' : 'disabled'}>CSV</button><button class="btn ghost grow" id="xx" ${rows.length ? '' : 'disabled'}>Excel (.xlsx)</button></div></div>
    <div class="card"><b>นำเข้า</b><div class="small muted" style="margin:4px 0 8px">ไฟล์ใบเสร็จที่ส่งออกจากระบบนี้ หรือไฟล์ "ใบเสร็จ" จาก Loyverse (.csv / .xlsx) · ระบบตรวจเลขที่ใบเสร็จซ้ำให้ก่อน ใบที่มีอยู่แล้วจะไม่บันทึกซ้ำ · ไม่ตัดสต็อก ไม่คิดแต้มลูกค้า</div>
      <label class="btn block">${I(IC.io, 18)} เลือกไฟล์<input type="file" id="fi" accept=".csv,.xlsx,.xls,text/csv" hidden></label><div id="pv" style="margin-top:10px"></div></div>`);
  const fname = ext => `receipts_${RR.from}_${RR.to}.${ext}`;
  const done = ext => { ov.remove(); ioReport('ส่งออกใบเสร็จรับเงินแล้ว', [['จำนวน', rows.length.toLocaleString() + ' ใบ'], ['ขาย / คืนเงิน', `${sales} / ${ref}`], ['ช่วงวันที่', `${thDate(RR.from)} – ${thDate(RR.to)}`], ['ไฟล์', fname(ext)]], 'export'); };
  $('#xc', ov).onclick = () => { download(fname('csv'), toCSV(ordersToSheet(rows))); done('csv'); };
  $('#xx', ov).onclick = async () => { try { busy(1); await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX'); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ordersToSheet(rows)), 'receipts'); download(fname('xlsx'), new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/octet-stream' })); busy(0); done('xlsx'); } catch (e) { busy(0); toast(e.message, 1); } };
  // ประวัติการนำเข้าใบเสร็จ (10 ครั้งล่าสุด)
  const hist = (cfg('ioHistory', { list: [] }).list || []).filter(h => h.kind === 'import-rx').slice(0, 10);
  $('#pv', ov).insertAdjacentHTML('afterend', hist.length ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:600">ประวัติการนำเข้าใบเสร็จ (${hist.length})</summary>${hist.map(h => `<div class="small" style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(thDate(h.at.slice(0, 10)))} ${esc(new Date(h.at).toTimeString().slice(0, 5))}</b> · ${esc(h.by || '')}<div class="muted">${esc(h.text)}</div></div>`).join('')}</details>` : '');
  $('#fi', ov).onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const pv = $('#pv', ov);
    try {
      busy(1, 'กำลังอ่านไฟล์...'); await new Promise(r => setTimeout(r, 30));
      const P = rxParse(await readTableFile(f));
      if (!P.rows.length) throw new Error('ไม่พบใบเสร็จในไฟล์');
      P.rows.sort((x, y) => String(x.date).localeCompare(String(y.date)));
      busy(0);
      // ตัวอย่างจากไฟล์ (ทันที ไม่ต้องรอระบบ) — ใบซ้ำกับในระบบ ตรวจระหว่างนำเข้าทีละชุด แล้วข้าม
      const ds = P.rows.map(o => o.date), net = P.rows.reduce((a2, o) => a2 + num(o.total), 0);
      const key = `${f.name}|${f.size}|${P.rows.length}`, job = LS.get('rxJob', null), resume = job && job.key === key && job.done > 0 && job.done < P.rows.length ? job : null;
      const sub = [['รูปแบบไฟล์', P.src], ['ใบเสร็จในไฟล์', P.rows.length.toLocaleString() + ' ใบ'], ['ช่วงวันที่', `${thDate(ds[0].slice(0, 10))} – ${thDate(ds[ds.length - 1].slice(0, 10))}`], ['ยอดสุทธิรวม', baht(net)]];
      if (P.inFile.length) sub.push(['ซ้ำกันเองในไฟล์ (ข้าม)', P.inFile.length.toLocaleString() + ' ใบ']);
      if (P.cancelled.length) sub.push(['ใบเสร็จที่ยกเลิก (ข้าม)', P.cancelled.length.toLocaleString() + ' ใบ']);
      if (P.bad.length) sub.push(['ข้อมูลไม่ครบ (ข้าม)', P.bad.length.toLocaleString() + ' แถว']);
      pv.innerHTML = `<div class="card" style="margin:0">${sub.map(l => `<div class="kv"><span>${l[0]}</span><b>${l[1]}</b></div>`).join('')}
        <div class="tiny muted" style="margin-top:6px">ระบบตรวจเลขที่ใบเสร็จซ้ำกับในระบบระหว่างนำเข้า ใบที่มีอยู่แล้วข้ามให้เอง · หน้าจอไม่ล็อก/ไม่ออกจากระบบระหว่างนำเข้า · หยุดกลางคันแล้วเลือกไฟล์เดิมอีกครั้งเพื่อทำต่อได้${P.src.includes('Loyverse') ? ' · เลขที่จาก Loyverse ขึ้นต้นด้วย LV-' : ''}</div></div>
        ${resume ? `<div class="alert blue small" style="margin:10px 0 0">ไฟล์นี้เคยนำเข้าค้างไว้ที่ใบที่ ${resume.done.toLocaleString()} / ${P.rows.length.toLocaleString()} (${esc(thDate(String(resume.at).slice(0, 10)))})</div><button class="btn green block" id="go2" style="margin-top:8px">▶ ทำต่อจากใบที่ ${(resume.done + 1).toLocaleString()}</button>` : ''}
        <button class="btn ${resume ? 'ghost' : 'green'} block" id="go" style="margin-top:10px">${resume ? 'เริ่มใหม่ตั้งแต่ใบแรก (ใบที่เข้าแล้วข้ามให้เอง)' : `นำเข้า ${P.rows.length.toLocaleString()} ใบ`}</button>`;
      const start = from => { ov.remove(); rxImportRun(P, f, key, from, resume && from ? resume : null, reload); };
      $('#go', pv).onclick = () => start(0);
      const g2 = $('#go2', pv); if (g2) g2.onclick = () => start(resume.done);
    } catch (err) { busy(0); pv.innerHTML = ''; toast(err.message, 1); }
  };
}


/* ---------- ยอดขายตามประเภทการชำระ: ตาราง + ส่งออก Excel ---------- */
function payMatrix(rows, sel, byMonth) {
  const want = sel && sel.length ? new Set(sel) : null, cell = {}, tot = {}, n = {}, seen = new Set();
  rows.forEach(o => {
    const sg = o.status === 'refund' ? -1 : 1, d = String(o.date).slice(0, byMonth ? 7 : 10), c = cell[d] || (cell[d] = {});
    billPays(o).forEach(p => { if (want && !want.has(p.type)) return; const a = sg * p.amount; c[p.type] = (c[p.type] || 0) + a; tot[p.type] = (tot[p.type] || 0) + a; seen.add(p.type); if (sg > 0) n[p.type] = (n[p.type] || 0) + 1; });
  });
  const types = PAYORDER.filter(k => seen.has(k) || (want && want.has(k))).concat([...seen].filter(k => !PAYORDER.includes(k)));
  types.forEach(k => { tot[k] = tot[k] || 0; n[k] = n[k] || 0; });
  return { types, cell, tot, n, keys: Object.keys(cell).sort() };
}
function payExportDlg(rows, from, to) {
  const all = payMatrix(rows, null, false), sel0 = (RS.pays || []).length ? RS.pays : all.types;
  const ov = sheet('ส่งออก Excel ตามการชำระเงิน', `
    <div class="small muted" style="margin-bottom:8px">ช่วง ${thLong(from)}${from !== to ? ' – ' + thLong(to) : ''} · ${rows.length.toLocaleString()} บิล</div>
    <div class="card" style="padding:10px 12px"><b class="small">เลือกประเภทการชำระที่จะส่งออก</b>
      ${all.types.length ? all.types.map(k => `<label class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><input type="checkbox" data-k="${k}" ${sel0.includes(k) ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--green)"><i style="width:10px;height:10px;border-radius:3px;background:${PAYCOLOR[k] || '#999'}"></i><span class="grow">${payName(k)}</span><span class="small num">${money(all.tot[k])} · ${all.n[k]} บิล</span></label>`).join('') : '<div class="empty small">ไม่มียอดขายในช่วงนี้</div>'}
      <div class="row" style="gap:6px;margin-top:8px"><button class="btn ghost sm" id="sa">เลือกทั้งหมด</button><button class="btn ghost sm" id="sn">ไม่เลือก</button></div></div>
    <div class="card" style="padding:10px 12px"><b class="small">เนื้อหาในไฟล์</b>
      ${[['sum', 'สรุปยอดตามประเภท', 1], ['day', 'ยอดรายวัน แยกคอลัมน์ตามประเภท', 1], ['bill', 'รายการใบเสร็จ (บิลละแถว)', 1], ['each', 'แยกใบเสร็จแต่ละประเภทเป็นชีตของตัวเอง', 0]].map(([k, n2, on]) => `<label class="row small" style="padding:6px 0"><input type="checkbox" data-o="${k}" ${on ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--green)"> ${n2}</label>`).join('')}
      <div class="tiny muted" style="margin-top:4px">ไฟล์ .xlsx ฟอนต์ TH SarabunPSK · บิลที่แยกชำระหลายวิธี แสดงยอดแยกตามแต่ละวิธี</div></div>`,
    `<button class="btn block green" id="go">${I(IC.file, 18)} ดาวน์โหลด Excel</button>`);
  $('#sa', ov).onclick = () => $$('[data-k]', ov).forEach(c => c.checked = true);
  $('#sn', ov).onclick = () => $$('[data-k]', ov).forEach(c => c.checked = false);
  $('#go', ov).onclick = () => {
    const sel = $$('[data-k]:checked', ov).map(c => c.dataset.k), opt = {}; $$('[data-o]', ov).forEach(c => opt[c.dataset.o] = c.checked);
    if (!sel.length) return toast('เลือกประเภทการชำระอย่างน้อย 1 แบบ', 1);
    if (!opt.sum && !opt.day && !opt.bill && !opt.each) return toast('เลือกเนื้อหาอย่างน้อย 1 อย่าง', 1);
    try { XL.save(`sales-by-payment_${from}_${to}.xlsx`, payBook(rows, sel, from, to, opt), { title: 'ยอดขายตามการชำระเงิน' }); ov.remove(); toast('ดาวน์โหลด Excel แล้ว'); } catch (e) { toast(e.message, 1); }
  };
}
function payBook(rows, sel, from, to, opt) {
  const M = payMatrix(rows, sel, false), T = M.types, shop = S.settings.shopName || 'ร้านเมย์ มินิมาร์ท';
  const span = `ช่วงวันที่ ${thLong(from)}${from !== to ? ' ถึง ' + thLong(to) : ''}`, which = 'ประเภทการชำระ: ' + T.map(payName).join(', ');
  const head = (title, w) => ({ rows: [[{ v: title, s: 'T' }], [{ v: shop + ' · ' + span, s: 'c' }], [{ v: which, s: 'sub' }], []], merges: [`A1:${XL.col(w - 1)}1`, `A2:${XL.col(w - 1)}2`, `A3:${XL.col(w - 1)}3`] });
  const sheets = [], grand = T.reduce((a, k) => a + M.tot[k], 0);
  if (opt.sum) { const h = head('สรุปยอดขายตามประเภทการชำระเงิน', 4); sheets.push({ name: 'สรุปตามการชำระ', cols: [26, 14, 18, 12], merges: h.merges, rows: h.rows.concat(XL.table(['ประเภทการชำระ', 'จำนวนบิล', 'ยอดเงิน (บาท)', 'สัดส่วน %'], T.map(k => [payName(k), M.n[k], M.tot[k], grand ? M.tot[k] / grand * 100 : 0]), ['t', 'i', 'n', 'n'], ['รวม', T.reduce((a, k) => a + M.n[k], 0), grand, grand ? 100 : 0])) }); }
  if (opt.day) { const w = T.length + 2, h = head('ยอดขายรายวัน แยกตามประเภทการชำระเงิน', w); sheets.push({ name: 'รายวัน', cols: [16].concat(T.map(() => 16), [17]), merges: h.merges, freeze: 5, rows: h.rows.concat(XL.table(['วันที่'].concat(T.map(payName), ['รวม']), M.keys.map(d => [thDate(d)].concat(T.map(k => M.cell[d][k] || 0), [T.reduce((a, k) => a + (M.cell[d][k] || 0), 0)])), ['d'], ['รวม'].concat(T.map(k => M.tot[k]), [grand]))) }); }
  const want = new Set(T), billRows = list => list.slice().sort((a, b) => String(a.date).localeCompare(b.date)).map(o => {
    const sg = o.status === 'refund' ? -1 : 1, ps = billPays(o), by = {}; ps.forEach(p => by[p.type] = (by[p.type] || 0) + sg * p.amount);
    return { o, by, any: ps.some(p => want.has(p.type)) };
  }).filter(r => r.any);
  const billSheet = (name, title, types) => {
    const w = 6 + types.length + 1, h = head(title, w), L = billRows(rows).filter(r => types.some(k => r.by[k]));
    const body = L.map(({ o, by }) => [thDate(o.date), String(o.date).slice(11, 16), o.id, o.cashierName || o.cashier || '', o.customerName || '', o.status === 'refund' ? 'คืนเงิน' : Object.keys(by).length > 1 ? 'แยกชำระ' : 'ขาย'].concat(types.map(k => by[k] || ''), [types.reduce((a, k) => a + (by[k] || 0), 0)]));
    sheets.push({ name, cols: [13, 8, 20, 16, 18, 10].concat(types.map(() => 15), [16]), merges: h.merges, freeze: 5, landscape: types.length > 2, rows: h.rows.concat(XL.table(['วันที่', 'เวลา', 'เลขที่ใบเสร็จ', 'พนักงาน', 'ลูกค้า', 'ประเภทบิล'].concat(types.map(payName), ['รวม']), body, ['d', 'd', 't', 't', 't', 'd'], ['รวม', '', `${L.length} บิล`, '', '', ''].concat(types.map(k => body.reduce((a, r, i) => a + (L[i].by[k] || 0), 0)), [body.reduce((a, r) => a + r[r.length - 1], 0)]))) });
  };
  if (opt.bill) billSheet('ใบเสร็จ', 'รายการใบเสร็จรับเงิน แยกตามประเภทการชำระ', T);
  if (opt.each) T.forEach(k => billSheet(payName(k).replace('/', '-'), 'ใบเสร็จที่ชำระด้วย ' + payName(k), [k]));
  return sheets;
}
