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
    const tip = `${esc(d.t)}: ${money(d.v)}${d.p != null ? ` · ${esc(opt.prevName || 'ช่วงก่อน')} ${money(d.p)}` : ''}`;
    g += `<g><title>${tip}</title><rect x="${x0}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent"/>`;
    if (hasP) g += bar(cx - w - 1, w, d.p || 0, '#D5D9DE') + bar(cx + 1, w, d.v, col);
    else g += bar(cx - w / 2, w, d.v, col);
    g += '</g>';
    if (data.length <= 16 || i % Math.ceil(data.length / 16) === 0) g += `<text x="${cx}" y="${H - pb + 14}" text-anchor="middle" font-size="10.5" fill="#666">${esc(d.l)}</text>`;
  });
  const leg = hasP ? `<div class="row tiny muted" style="gap:14px;justify-content:center;margin-top:2px"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${col};vertical-align:-1px"></i> ${esc(opt.curName || 'ช่วงนี้')}</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#D5D9DE;vertical-align:-1px"></i> ${esc(opt.prevName || 'ช่วงก่อน')}</span></div>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${g}</svg>${leg}`;
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
const prevRange = (from, to) => { const n = Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5) + 1; return [addDays(from, -n), addDays(from, -1)]; };

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
    <div id="rp"></div><div id="sf"></div><div id="kpi"><div class="card center"><span class="spin dark"></span></div></div>
    <div class="card"><div class="row" style="margin-bottom:6px"><h3 class="grow" id="cht">ยอดขาย</h3></div><div id="chart"></div></div>
    <div class="grid2" id="hl"></div>
    <div class="card"><div class="row" style="gap:8px;margin-bottom:10px"><div class="seg grow" id="tabs" style="overflow-x:auto">${[['day', 'ตามวัน'], ['prod', 'ตามสินค้า'], ['cat', 'ตามหมวดหมู่'], ['staff', 'ตามพนักงาน'], ['pay', 'ตามการชำระ']].map(([k, n]) => `<button data-t="${k}" class="${RS.tab === k ? 'on' : ''}" style="white-space:nowrap">${n}</button>`).join('')}</div><button class="btn ghost sm" id="ex">ส่งออก CSV</button></div><div id="tb"></div></div>
    <div class="row wrap" style="gap:8px"><button class="btn ghost grow" onclick="go('salesreceipts')">${I(IC.receipt, 18)} ใบเสร็จรับเงิน</button>${vc ? `<button class="btn ghost grow" onclick="go('stockvalue')">${I(IC.box, 18)} มูลค่าสต็อก</button>` : ''}${isOwner() ? `<button class="btn ghost grow" onclick="go('tax')">${I(IC.tax, 18)} ภาษี</button>` : ''}</div>`;
  let rows = [], prows = [], A = null, tableRows = [];
  const single = () => RS.from === RS.to;
  const draw = () => {
    const f = o => !RS.staff || (o.cashierName || o.cashier) === RS.staff;
    const R = rows.filter(f); A = aggregate(R); const P = aggregate(prows.filter(f));
    const k = (t, v, s, cur, prv, inv) => `<div class="stat"><div class="k">${t}</div><div class="v">${v}</div><div class="tiny muted">${cur != null ? chgTag(cur, prv, inv) + ' ' : ''}${s || ''}</div></div>`;
    const pn = single() ? 'เทียบวันก่อน' : 'เทียบช่วงก่อน';
    const extra = [(A.pass || 0) - (A.debt || 0) > 0 && `เงินรับแทน (โอน/เติม/บิล) ${money((A.pass || 0) - (A.debt || 0), 0)}`, A.debt && `รับชำระหนี้ ${money(A.debt, 0)}`, A.inst && `ผ่อนสินค้า (ดาวน์/ค่างวด) ${money(A.inst, 0)}`].filter(Boolean);
    $('#kpi', el).innerHTML = `<div class="grid3" style="margin-bottom:${extra.length ? 6 : 12}px">${k('ยอดขายสุทธิ', baht(A.net), pn, A.net, P.net)}${vc ? k('กำไรขั้นต้น', baht(A.profit), A.net ? 'อัตรา ' + (A.profit / A.net * 100).toFixed(1) + '%' : '', A.profit, P.profit) : k('จำนวนบิล', A.bills, '', A.bills, P.bills)}${k('เฉลี่ย/บิล', baht(A.bills ? A.net / A.bills : 0), A.bills + ' บิล', A.bills ? A.net / A.bills : 0, P.bills ? P.net / P.bills : 0)}${k('ยอดขาย (ก่อนหัก)', baht(A.gross), '', A.gross, P.gross)}${k('ส่วนลด', baht(A.disc), '', A.disc, P.disc, 1)}${k('คืนเงิน', baht(A.refund), A.refunds + ' ใบ', A.refund, P.refund, 1)}</div>
      ${extra.length ? `<div class="tiny muted" style="margin:0 4px 12px">รวมอยู่ในยอดขายสุทธิ: ${extra.join(' · ')}</div>` : ''}`;
    // กราฟหลัก: ช่วงนี้เทียบช่วงก่อนหน้า (แท่งเทา)
    let data, ttl;
    if (single()) { ttl = 'ยอดขายรายชั่วโมง'; data = []; for (let i = 5; i <= 23; i++) { const hh = String(i).padStart(2, '0'); data.push({ l: hh, t: hh + ':00 น.', v: A.hours[hh] || 0, p: P.hours[hh] || 0 }); } }
    else { ttl = 'ยอดขายสุทธิรายวัน'; data = []; const off = Math.round((new Date(RS.from + 'T12:00:00') - new Date(prevRange(RS.from, RS.to)[0] + 'T12:00:00')) / 864e5); for (let d = RS.from; d <= RS.to; d = addDays(d, 1)) { const pd = addDays(d, -off); data.push({ l: d.slice(8) + '/' + d.slice(5, 7), t: thDate(d), v: (A.days[d] || { net: 0 }).net, p: (P.days[pd] || { net: 0 }).net }); if (data.length > 400) break; } }
    $('#cht', el).textContent = ttl;
    $('#chart', el).innerHTML = barChart(data, { curName: single() ? 'วันนี้ที่เลือก' : 'ช่วงนี้', prevName: single() ? 'วันก่อนหน้า' : 'ช่วงก่อนหน้า (จำนวนวันเท่ากัน)' });
    // ไฮไลต์: สินค้าขายดี 5 อันดับ · ช่องทางชำระ · ช่วงเวลาขายดี
    const top = Object.values(A.prod).filter(p => p.amt > 0 && !p.pass).sort((a, b) => b.amt - a.amt).slice(0, 5).map(p => ({ n: p.name, v: p.amt, s: `${Math.round(p.qty * 1000) / 1000} ชิ้น${vc ? ' · กำไร ' + money(p.amt - p.cost, 0) : ''}` }));
    const pays = Object.entries(A.pay).filter(([, p]) => p.amt > 0).sort((a, b) => b[1].amt - a[1].amt).map(([k2, p]) => ({ n: PAYNAME[k2] || k2, v: p.amt, c: PAYCOLOR[k2] || '#999' }));
    const hrs = Object.entries(A.hours).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    $('#hl', el).innerHTML = `<div class="card"><h3>🏆 สินค้าขายดี</h3>${hBars(top, '#E53935')}<a href="#" class="small" id="morep">ดูทั้งหมด ›</a></div>
      <div class="card"><h3>💳 ช่องทางชำระ</h3>${pays.length ? mixBar(pays) : '<div class="empty small">ไม่มีข้อมูล</div>'}${hrs.length ? `<div class="kv small" style="margin-top:10px;padding-top:8px;border-top:1px solid var(--line)"><span>⏰ ช่วงขายดีที่สุด</span><b>${hrs[0][0]}:00–${String(+hrs[0][0] + 1).padStart(2, '0')}:00 น.</b></div>` : ''}${A.bills ? `<div class="kv small"><span>🧾 สินค้าต่อบิล (เฉลี่ย)</span><b>${(R.filter(o => o.status !== 'refund').reduce((s, o) => s + num(o.itemCount), 0) / A.bills).toFixed(1)} ชิ้น</b></div>` : ''}</div>`;
    $('#morep', el).onclick = e => { e.preventDefault(); RS.tab = 'prod'; $$('#tabs button', el).forEach(x => x.classList.toggle('on', x.dataset.t === 'prod')); drawTab(); $('#tabs', el).scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    drawTab();
  };
  const drawTab = () => {
    const tab = RS.tab; let h = '';
    if (tab === 'day') {
      tableRows = [['วันที่', 'บิล', 'ยอดขายสุทธิ'].concat(vc ? ['ต้นทุน', 'กำไร'] : [])].concat(Object.keys(A.days).sort().reverse().map(d => [d, A.days[d].bills, A.days[d].net].concat(vc ? [A.days[d].cost, A.days[d].net - A.days[d].cost] : [])));
      h = tbl(tableRows, r => [thDate(r[0])].concat(r.slice(1).map((v, i) => i === 0 ? v : money(v))));
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
      tableRows = [['ประเภทการชำระ', 'จำนวนบิล', 'ยอดเงิน']].concat(Object.entries(A.pay).sort((a, b) => b[1].amt - a[1].amt).map(([k2, p]) => [PAYNAME[k2] || k2, p.n, p.amt]));
      h = tbl(tableRows, r => [`<span style="font-weight:600">${esc(r[0])}</span>`, r[1], money(r[2])]);
    }
    $('#tb', el).innerHTML = h;
  };
  const round3 = v => Math.round(v * 1000) / 1000;
  const tbl = (rs, fmt) => rs.length > 1 ? `<div class="scroll-x" style="margin-top:10px"><table class="t"><tr>${rs[0].map((h, i) => `<th class="${i ? 'right' : ''}">${h}</th>`).join('')}</tr>${rs.slice(1).map(r => `<tr>${fmt(r).map((c, i) => `<td class="${i ? 'right num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table></div>` : '<div class="empty">ไม่มีข้อมูลในช่วงนี้</div>';
  const load = async force => {
    $('#kpi', el).innerHTML = '<div class="card center"><span class="spin dark"></span></div>';
    const [pf, pt] = prevRange(RS.from, RS.to);
    try { [rows, prows] = await Promise.all([fetchOrders(RS.from, RS.to, force), fetchOrders(pf, pt).catch(() => [])]); } catch (e) { rows = []; prows = []; toast(e.message, 1); }
    if (!el.isConnected) return;
    const staffs = [...new Set(rows.map(o => o.cashierName || o.cashier))];
    $('#sf', el).innerHTML = all && staffs.length > 1 ? `<select class="in" id="st" style="margin-bottom:10px"><option value="">พนักงานทั้งหมด</option>${staffs.map(x => `<option ${RS.staff === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : '';
    const st = $('#st', el); if (st) st.onchange = e => { RS.staff = e.target.value; draw(); };
    draw();
  };
  $$('#tabs button', el).forEach(b => b.onclick = () => { RS.tab = b.dataset.t; $$('#tabs button', el).forEach(x => x.classList.toggle('on', x === b)); drawTab(); });
  $('#ex', el).onclick = () => download(`sales_${RS.tab}_${RS.from}_${RS.to}.csv`, toCSV(tableRows.map(r => r.map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v))));
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
  const load = async force => { $('#ls', el).innerHTML = '<div class="empty"><span class="spin dark"></span></div>'; try { rows = await fetchOrders(RR.from, RR.to, force); } catch (e) { rows = LS.get('recentOrders', []).map(o => ({ ...o, _items: Logic.J(o.items, []), _pays: Logic.J(o.payments, []) })); toast(e.message + ' — แสดงบิลล่าสุดในเครื่อง', 1); } draw(); };
  $('#q', el).oninput = e => { RR.q = e.target.value; draw(); };
  $('#sc', el).onclick = () => openScanner(code => { $('#q', el).value = RR.q = code; draw(); const o = rows.find(x => x.id === code); if (o) orderDetail(o, () => load(true)); return 'close'; });
  if (!limited) rangePicker($('#rp', el), RR, () => load());
  const rx = $('#rx', el); if (rx) rx.onclick = () => receiptsIO(rows.filter(o => !o._pending), () => load(true));
  load();
};
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
  $('#fi', ov).onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const pv = $('#pv', ov);
    try {
      busy(1, 'กำลังอ่านไฟล์...'); const P = rxParse(await readTableFile(f));
      if (!P.rows.length) throw new Error('ไม่พบใบเสร็จในไฟล์');
      const CH = 400, chunks = []; for (let i = 0; i < P.rows.length; i += CH) chunks.push(P.rows.slice(i, i + CH));
      let fresh = 0, dup = 0, bad = 0, dupIds = [];
      for (let i = 0; i < chunks.length; i++) { busy(1, `กำลังตรวจใบเสร็จซ้ำ ${Math.min((i + 1) * CH, P.rows.length)}/${P.rows.length}...`); const r = await api('importOrders', { rows: chunks[i], dry: true }); fresh += r.fresh; dup += r.dup; bad += r.bad; dupIds = dupIds.concat(r.dupIds || []); }
      busy(0);
      const ds = P.rows.map(o => o.date).sort(), net = P.rows.reduce((a, o) => a + num(o.total), 0);
      const sub = [['รูปแบบไฟล์', P.src], ['ใบเสร็จในไฟล์', P.rows.length.toLocaleString() + ' ใบ'], ['ช่วงวันที่', `${thDate(ds[0].slice(0, 10))} – ${thDate(ds[ds.length - 1].slice(0, 10))}`], ['ยอดสุทธิรวม', baht(net)],
        ['<span style="color:var(--green)">ใหม่ (จะนำเข้า)</span>', `<span style="color:var(--green)">${fresh.toLocaleString()} ใบ</span>`], ['ซ้ำ — มีในระบบแล้ว (ข้าม)', dup.toLocaleString() + ' ใบ']];
      if (P.inFile.length) sub.push(['ซ้ำกันเองในไฟล์ (ข้าม)', P.inFile.length + ' ใบ']);
      if (P.cancelled.length) sub.push(['ใบเสร็จที่ยกเลิก (ข้าม)', P.cancelled.length + ' ใบ']);
      if (P.bad.length + bad) sub.push(['ข้อมูลไม่ครบ (ข้าม)', (P.bad.length + bad) + ' แถว']);
      pv.innerHTML = `<div class="card" style="margin:0">${sub.map(l => `<div class="kv"><span>${l[0]}</span><b>${l[1]}</b></div>`).join('')}
        ${dupIds.length ? `<div class="tiny muted" style="margin-top:4px">ตัวอย่างเลขที่ซ้ำ: ${esc(dupIds.slice(0, 6).join(', '))}${dup > 6 ? ' …' : ''}</div>` : ''}
        <div class="tiny muted" style="margin-top:6px">ใบเสร็จที่นำเข้าจะนับในรายงานยอดขาย · วันที่มีใบเสร็จแล้วระบบใช้ยอดจากใบเสร็จแทนยอดรายวันที่นำเข้า (ไม่นับซ้ำ)${P.src.includes('Loyverse') ? ' · เลขที่จาก Loyverse ขึ้นต้นด้วย LV-' : ''}</div></div>
        <button class="btn green block" id="go" style="margin-top:10px" ${fresh ? '' : 'disabled'}>${fresh ? `นำเข้า ${fresh.toLocaleString()} ใบ` : 'ไม่มีใบเสร็จใหม่ให้นำเข้า'}</button>`;
      const go = $('#go', pv); if (go) go.onclick = async () => {
        let added = 0, dup2 = 0;
        try {
          for (let i = 0; i < chunks.length; i++) { busy(1, `กำลังนำเข้า ${Math.min((i + 1) * CH, P.rows.length)}/${P.rows.length}...`); const r = await api('importOrders', { rows: chunks[i] }); added += r.added; dup2 += r.dup; }
          busy(0); ov.remove(); Cache.staleBefore = Date.now();
          ioReport('นำเข้าใบเสร็จรับเงินแล้ว', [['ไฟล์', esc(f.name)], ['นำเข้าใหม่', added.toLocaleString() + ' ใบ'], ['ข้าม (ซ้ำ)', (dup2 + P.inFile.length).toLocaleString() + ' ใบ'], ...(P.cancelled.length ? [['ข้าม (ยกเลิก)', P.cancelled.length + ' ใบ']] : []), ...(P.bad.length + bad ? [['ข้าม (ข้อมูลไม่ครบ)', (P.bad.length + bad) + ' แถว']] : []), ['ช่วงวันที่', `${thDate(ds[0].slice(0, 10))} – ${thDate(ds[ds.length - 1].slice(0, 10))}`]], 'import');
          reload && reload();
        } catch (err) { busy(0); toast(`นำเข้าได้ ${added} ใบแล้วหยุด: ${err.message} — เลือกไฟล์เดิมอีกครั้งเพื่อทำต่อ (ใบที่เข้าแล้วจะไม่ซ้ำ)`, 1, 8000); }
      };
    } catch (err) { busy(0); pv.innerHTML = ''; toast(err.message, 1); }
  };
}
