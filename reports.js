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
  const raw = await swr(key, async () => { await Sync.flush(); return (await api('ordersRange', { from, to })).rows; }, 30000);
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
      const pk = it.sku || it.name; const p = A.prod[pk] || (A.prod[pk] = { name: it.name, cat: it.cat || '', qty: 0, amt: 0, cost: 0 });
      p.qty += q; p.amt += amt; p.cost += c;
      const ck = it.cat || 'ไม่ระบุหมวด'; const cc = A.cat[ck] || (A.cat[ck] = { qty: 0, amt: 0, cost: 0 }); cc.qty += q; cc.amt += amt; cc.cost += c;
    });
  });
  A.profit = A.net - A.cost;
  return A;
}
function barChart(data, opt = {}) {
  const W = 760, H = 220, pl = 54, pb = 34, pt = 10;
  const max = Math.max(1, ...data.map(d => d.v)); const step = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / step) * step;
  const bw = (W - pl - 10) / Math.max(1, data.length);
  let g = '';
  for (let i = 0; i <= 4; i++) { const y = pt + (H - pt - pb) * (1 - i / 4); g += `<line x1="${pl}" x2="${W - 6}" y1="${y}" y2="${y}" stroke="#eee"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#888">${money(top * i / 4, 0)}</text>`; }
  data.forEach((d, i) => {
    const h = (H - pt - pb) * Math.max(0, d.v) / top, x = pl + i * bw + bw * .15, y = H - pb - h;
    g += `<rect x="${x}" y="${y}" width="${bw * .7}" height="${h}" rx="2" fill="${opt.color || '#7CB342'}"><title>${esc(d.t)}: ${money(d.v)}</title></rect>`;
    if (data.length <= 16 || i % Math.ceil(data.length / 16) === 0) g += `<text x="${x + bw * .35}" y="${H - pb + 14}" text-anchor="middle" font-size="10.5" fill="#666">${esc(d.l)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${g}</svg>`;
}
function rangePicker(el, state, onChange) {
  el.innerHTML = `<div class="chips">${RANGES.map(([k, n]) => `<button class="chip ${state.r === k ? 'on' : ''}" data-r="${k}">${n}</button>`).join('')}</div>
    <div class="row ${state.r === 'custom' ? '' : 'hidden'}" id="cr" style="margin-bottom:8px"><input class="in" type="date" id="f" value="${state.from}"><span>ถึง</span><input class="in" type="date" id="t" value="${state.to}"><button class="btn sm" id="ok">ดู</button></div>`;
  $$('[data-r]', el).forEach(b => b.onclick = () => { state.r = b.dataset.r; const R = RANGES.find(x => x[0] === state.r); if (R[2]) [state.from, state.to] = R[2](); rangePicker(el, state, onChange); if (R[2]) onChange(); });
  $('#ok', el).onclick = () => { state.from = $('#f', el).value; state.to = $('#t', el).value; if (state.from > state.to) [state.from, state.to] = [state.to, state.from]; onChange(); };
}
const RS = { r: 'today', from: todayISO(), to: todayISO(), tab: 'day', staff: '' };

/* ---------- สรุปยอดขาย ---------- */
VIEWS.reports = el => {
  if (!seesSales()) { el.innerHTML = vhead('สรุปยอดขาย') + `<div class="card empty">${I(IC.shield, 40)}<p>รายงานยอดขายสำหรับเจ้าของร้าน</p></div>`; return; }
  const all = canStrict('reports'), vc = canStrict('viewCost');
  el.innerHTML = vhead('สรุปยอดขาย', `<button class="btn ghost sm" id="ex">ส่งออก CSV</button>`) + `
    ${all ? '' : `<div class="alert blue">${I(IC.user, 18)}<div>แสดงเฉพาะยอดขายของคุณ (${esc(S.user.name)})</div></div>`}
    <div id="rp"></div><div id="sf"></div><div id="kpi"><div class="card center"><span class="spin dark"></span></div></div>
    <div class="card"><div class="seg" id="tabs" style="margin-bottom:10px;overflow-x:auto">${[['day', 'ตามวัน'], ['prod', 'ตามสินค้า'], ['cat', 'ตามหมวดหมู่'], ['staff', 'ตามพนักงาน'], ['pay', 'ตามการชำระ']].map(([k, n]) => `<button data-t="${k}" class="${RS.tab === k ? 'on' : ''}" style="white-space:nowrap">${n}</button>`).join('')}</div><div id="tb"></div></div>
    <div class="row wrap" style="gap:8px"><button class="btn ghost grow" onclick="go('salesreceipts')">${I(IC.receipt, 18)} ใบเสร็จรับเงิน</button>${vc ? `<button class="btn ghost grow" onclick="go('stockvalue')">${I(IC.box, 18)} มูลค่าสต็อก</button>` : ''}${isOwner() ? `<button class="btn ghost grow" onclick="go('sales')">${I(IC.chart, 18)} ยอดขายรายเดือน (ทุกปี)</button><button class="btn ghost grow" onclick="go('tax')">${I(IC.tax, 18)} ภาษี</button>` : ''}</div>`;
  let rows = [], A = null, tableRows = [];
  const draw = () => {
    const R = RS.staff ? rows.filter(o => (o.cashierName || o.cashier) === RS.staff) : rows;
    A = aggregate(R);
    const k = (t, v, s) => `<div class="stat"><div class="k">${t}</div><div class="v">${v}</div>${s ? `<div class="tiny muted">${s}</div>` : ''}</div>`;
    $('#kpi', el).innerHTML = `<div class="grid3" style="margin-bottom:12px">${k('ยอดขาย', baht(A.gross))}${k('คืนเงิน', baht(A.refund), A.refunds + ' ใบ')}${k('ส่วนลด', baht(A.disc))}${k('ยอดขายสุทธิ', baht(A.net))}${vc ? k('กำไรขั้นต้น', baht(A.profit), A.net ? (A.profit / A.net * 100).toFixed(1) + '%' : '') : k('จำนวนบิล', A.bills)}${k('เฉลี่ย/บิล', baht(A.bills ? A.net / A.bills : 0), A.bills + ' บิล')}</div>`;
    const tab = RS.tab; let h = '';
    if (tab === 'day') {
      const single = RS.from === RS.to;
      const data = single ? Array.from({ length: 24 }, (_, i) => { const hh = String(i).padStart(2, '0'); return { l: hh, t: hh + ':00', v: A.hours[hh] || 0 }; }).filter((d, i) => i >= 5 && i <= 23)
        : (() => { const out = []; for (let d = RS.from; d <= RS.to; d = addDays(d, 1)) { const x = A.days[d] || { net: 0 }; out.push({ l: d.slice(8) + '/' + d.slice(5, 7), t: thDate(d), v: x.net }); if (out.length > 400) break; } return out; })();
      h = barChart(data) + `<div class="tiny muted center">${single ? 'ยอดขายรายชั่วโมง' : 'ยอดขายสุทธิรายวัน'}</div>`;
      tableRows = [['วันที่', 'บิล', 'ยอดขายสุทธิ'].concat(vc ? ['ต้นทุน', 'กำไร'] : [])].concat(Object.keys(A.days).sort().reverse().map(d => [d, A.days[d].bills, A.days[d].net].concat(vc ? [A.days[d].cost, A.days[d].net - A.days[d].cost] : [])));
      h += tbl(tableRows, r => [thDate(r[0])].concat(r.slice(1).map((v, i) => i === 0 ? v : money(v))));
    } else if (tab === 'prod') {
      const list = Object.values(A.prod).sort((a, b) => b.amt - a.amt);
      tableRows = [['สินค้า', 'หมวด', 'จำนวน', 'ยอดขาย'].concat(vc ? ['ต้นทุน', 'กำไร'] : [])].concat(list.map(p => [p.name, p.cat, round3(p.qty), p.amt].concat(vc ? [p.cost, p.amt - p.cost] : [])));
      h = tbl(tableRows.slice(0, 201), r => [esc(r[0]), `<span class="tiny muted">${esc(r[1])}</span>`, r[2]].concat(r.slice(3).map(v => money(v)))) + (list.length > 200 ? `<div class="tiny muted center">แสดง 200 จาก ${list.length} รายการ (ส่งออก CSV เพื่อดูทั้งหมด)</div>` : '');
    } else if (tab === 'cat') {
      const list = Object.entries(A.cat).sort((a, b) => b[1].amt - a[1].amt);
      const tot = list.reduce((s, x) => s + x[1].amt, 0) || 1;
      h = list.map(([n, c]) => `<div style="margin-bottom:10px"><div class="row small"><span class="grow"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${catColor(n)}"></span> ${esc(n)}</span><b>${baht(c.amt)}</b><span class="muted" style="width:52px;text-align:right">${(c.amt / tot * 100).toFixed(1)}%</span></div><div class="prog" style="margin-top:4px"><i style="width:${c.amt / tot * 100}%;background:${catColor(n)}"></i></div></div>`).join('') || '<div class="empty">ไม่มีข้อมูล</div>';
      tableRows = [['หมวดหมู่', 'จำนวน', 'ยอดขาย'].concat(vc ? ['ต้นทุน', 'กำไร'] : [])].concat(list.map(([n, c]) => [n, round3(c.qty), c.amt].concat(vc ? [c.cost, c.amt - c.cost] : [])));
      h += tbl(tableRows, r => [esc(r[0]), r[1]].concat(r.slice(2).map(v => money(v))));
    } else if (tab === 'staff') {
      tableRows = [['พนักงาน', 'บิล', 'คืนเงิน', 'ยอดขายสุทธิ', 'เฉลี่ย/บิล'].concat(vc ? ['กำไร'] : [])].concat(Object.entries(A.staff).sort((a, b) => b[1].net - a[1].net).map(([n, s]) => [n, s.bills, s.refund, s.net, s.bills ? s.net / s.bills : 0].concat(vc ? [s.net - s.cost] : [])));
      h = tbl(tableRows, r => [esc(r[0]), r[1]].concat(r.slice(2).map(v => money(v))));
    } else if (tab === 'pay') {
      tableRows = [['ประเภทการชำระ', 'จำนวนบิล', 'ยอดเงิน']].concat(Object.entries(A.pay).sort((a, b) => b[1].amt - a[1].amt).map(([k, p]) => [PAYNAME[k] || k, p.n, p.amt]));
      h = tbl(tableRows, r => [`<span style="color:${PAYCOLOR[Object.keys(PAYNAME).find(k => PAYNAME[k] === r[0])] || '#333'};font-weight:600">${esc(r[0])}</span>`, r[1], money(r[2])]);
    }
    $('#tb', el).innerHTML = h;
  };
  const round3 = v => Math.round(v * 1000) / 1000;
  const tbl = (rs, fmt) => rs.length > 1 ? `<div class="scroll-x" style="margin-top:10px"><table class="t"><tr>${rs[0].map((h, i) => `<th class="${i ? 'right' : ''}">${h}</th>`).join('')}</tr>${rs.slice(1).map(r => `<tr>${fmt(r).map((c, i) => `<td class="${i ? 'right num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table></div>` : '<div class="empty">ไม่มีข้อมูลในช่วงนี้</div>';
  const load = async force => {
    $('#kpi', el).innerHTML = '<div class="card center"><span class="spin dark"></span></div>';
    try { rows = await fetchOrders(RS.from, RS.to, force); } catch (e) { rows = []; toast(e.message, 1); }
    const staffs = [...new Set(rows.map(o => o.cashierName || o.cashier))];
    $('#sf', el).innerHTML = all && staffs.length > 1 ? `<select class="in" id="st" style="margin-bottom:10px"><option value="">พนักงานทั้งหมด</option>${staffs.map(s => `<option ${RS.staff === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : '';
    const st = $('#st', el); if (st) st.onchange = e => { RS.staff = e.target.value; draw(); };
    draw();
  };
  $$('#tabs button', el).forEach(b => b.onclick = () => { RS.tab = b.dataset.t; $$('#tabs button', el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#ex', el).onclick = () => download(`sales_${RS.tab}_${RS.from}_${RS.to}.csv`, toCSV(tableRows.map(r => r.map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v))));
  rangePicker($('#rp', el), RS, () => load());
  load();
};

/* ---------- ใบเสร็จรับเงินย้อนหลัง ---------- */
const RR = { r: 'today', from: todayISO(), to: todayISO(), q: '' };
VIEWS.salesreceipts = el => {
  const limited = !seesSales();
  if (limited) { RR.r = 'today'; RR.from = RR.to = todayISO(); }
  el.innerHTML = vhead(limited ? 'บิลของฉันวันนี้' : 'ใบเสร็จรับเงิน', '', 'more') + `<div id="rp"></div>
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
  load();
};
function orderDetail(o, onChange) {
  const isR = o.status === 'refund';
  const ov = sheet(`${isR ? 'ใบคืนเงิน' : 'ใบเสร็จ'} ${esc(o.id)}`, `
    <div class="card"><div class="kv"><span class="muted">วันที่</span><span>${esc(String(o.date).replace('T', ' ').slice(0, 16))}</span></div><div class="kv"><span class="muted">พนักงาน</span><span>${esc(o.cashierName || o.cashier)}</span></div>${o.deviceName ? `<div class="kv"><span class="muted">เครื่อง</span><span>${esc(o.deviceName)}</span></div>` : ''}${o.customerName ? `<div class="kv"><span class="muted">ลูกค้า</span><span>${esc(o.customerName)}</span></div>` : ''}${o.refundOf ? `<div class="kv"><span class="muted">อ้างอิง</span><span>${esc(o.refundOf)}</span></div>` : ''}${o.note ? `<div class="kv"><span class="muted">หมายเหตุ</span><span>${esc(o.note)}</span></div>` : ''}</div>
    <div class="card">${o._items.map(it => `<div class="kv"><span>${esc(it.name)} <span class="muted">× ${num(it.qty)}</span></span><span>${money(num(it.qty) * num(it.price))}</span></div>`).join('')}
      ${num(o.discount) ? `<div class="kv"><span>ส่วนลด</span><span>-${money(Math.abs(num(o.discount)))}</span></div>` : ''}<div class="kv" style="font-weight:700;font-size:17px"><span>รวม</span><span>${baht(o.total)}</span></div>
      ${o._pays.map(p => `<div class="kv small"><span>${PAYNAME[p.type] || p.type}</span><span>${money(p.amount)}</span></div>`).join('')}${num(o.change) ? `<div class="kv small"><span>รับเงิน / ทอน</span><span>${money(o.cash)} / ${money(o.change)}</span></div>` : ''}
      ${can('viewCost') && o.cost !== '' ? `<div class="kv small muted"><span>ต้นทุน / กำไร</span><span>${money(o.cost)} / ${money(num(o.total) - num(o.cost))}</span></div>` : ''}</div>`,
    `<button class="btn ghost grow" id="pr">${I(IC.print, 18)} พิมพ์ซ้ำ</button>${o.status === 'sale' && can('refund') && !o._pending ? `<button class="btn grow" id="rf">${I(IC.refund, 18)} คืนเงิน</button>` : ''}`);
  $('#pr', ov).onclick = () => RP.printOrder({ ...o, reprint: true }).catch(e => toast(e.message, 1));
  const rf = $('#rf', ov); if (rf) rf.onclick = () => {
    const o2 = sheet('คืนเงินทั้งใบ', `<p class="small">คืนเงิน <b>${baht(o.total)}</b> ให้ใบเสร็จ ${esc(o.id)} — ระบบจะคืนสต็อก${o.customerId ? ' ปรับยอด/แต้ม/เงินเชื่อของลูกค้า' : ''} และออกใบคืนเงิน</p><label class="f"><span>เหตุผล</span><input class="in" id="rs" placeholder="เช่น สินค้าชำรุด"></label>`, `<button class="btn block" id="ok">ยืนยันคืนเงิน</button>`);
    $('#ok', o2).onclick = async () => {
      try { busy(1, 'กำลังคืนเงิน...'); const r = await api('refund', { id: o.id, reason: $('#rs', o2).value }); await loadProducts(true); busy(0); o2.remove(); ov.remove(); toast('คืนเงินแล้ว'); const rr = { ...r.refund }; if (pconn().autoPrint) RP.printOrder(rr).catch(() => { }); onChange && onChange(); }
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
