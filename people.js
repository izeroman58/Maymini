/* =========================================================
   ฐานลูกค้า / พนักงาน (ผู้ใช้ สิทธิ์ ลงเวลา ยอดขาย) / อุปกรณ์ / หมวดหมู่
   ========================================================= */
'use strict';
/* ---------- ฐานลูกค้า ---------- */
VIEWS.customers = async el => {
  if (!can('customers')) return ownerOnly(el);
  let q = '', sort = 'recent';
  el.innerHTML = vhead('ฐานลูกค้า', `<button class="btn sm" id="nw">${I(IC.userplus, 18)} เพิ่ม</button>`, 'more') + `
    <div class="search"><svg class="s" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input class="in" id="q" placeholder="ค้นหาชื่อ / เบอร์โทร"></div>
    <div class="chips" style="margin-top:10px">${[['recent', 'มาล่าสุด'], ['spent', 'ยอดซื้อสูงสุด'], ['points', 'แต้มมากสุด'], ['credit', 'ค้างชำระ']].map(([k, n]) => `<button class="chip ${k === sort ? 'on' : ''}" data-s="${k}">${n}</button>`).join('')}</div>
    <div class="grid3" id="sm" style="margin-bottom:10px"></div><div class="list" id="cl"><div class="empty"><span class="spin dark"></span></div></div>`;
  const draw = () => {
    const all = S.customers || [], t = norm(q);
    let res = all.filter(c => !t || norm(c.name + c.phone).includes(t));
    if (sort === 'credit') res = res.filter(c => num(c.credit) > 0);
    res.sort((a, b) => sort === 'spent' ? num(b.totalSpent) - num(a.totalSpent) : sort === 'points' ? num(b.points) - num(a.points) : sort === 'credit' ? num(b.credit) - num(a.credit) : String(b.lastVisit || b.createdAt).localeCompare(a.lastVisit || a.createdAt));
    $('#sm', el).innerHTML = `<div class="stat center"><div class="k">ลูกค้า</div><div class="v">${all.length}</div></div><div class="stat center"><div class="k">ยอดค้างเชื่อรวม</div><div class="v" style="color:var(--amber)">${money(all.reduce((s, c) => s + Math.max(0, num(c.credit)), 0), 0)}</div></div><div class="stat center"><div class="k">แต้มคงค้าง</div><div class="v">${all.reduce((s, c) => s + num(c.points), 0).toLocaleString()}</div></div>`;
    $('#cl', el).innerHTML = res.slice(0, 200).map(c => `<div class="item" data-id="${esc(c.id)}"><div class="av">${esc(Array.from(c.name || '?')[0])}</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="m">${esc(c.phone || '-')} · ${num(c.visits)} ครั้ง · ${num(c.points)} แต้ม${c.lastVisit ? ' · ล่าสุด ' + thDate(String(c.lastVisit).slice(0, 10)) : ''}</div></div><div class="right"><div class="num" style="font-weight:600">${baht(c.totalSpent)}</div>${num(c.credit) ? `<div class="tag amber">ค้าง ${money(c.credit)}</div>` : ''}</div></div>`).join('') || '<div class="empty">ไม่พบลูกค้า</div>';
    $$('#cl [data-id]', el).forEach(x => x.onclick = () => customerDetail(all.find(c => c.id === x.dataset.id)));
  };
  $('#q', el).oninput = e => { q = e.target.value; draw(); };
  $$('[data-s]', el).forEach(b => b.onclick = () => { sort = b.dataset.s; $$('[data-s]', el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#nw', el).onclick = () => customerForm(null, () => draw());
  await loadCustomers(true); draw();
};
async function customerDetail(c) {
  const ov = sheet(esc(c.name), `<div class="grid2" style="margin-bottom:10px"><div class="stat"><div class="k">ยอดซื้อรวม</div><div class="v">${baht(c.totalSpent)}</div><div class="tiny muted">${num(c.visits)} ครั้ง</div></div><div class="stat"><div class="k">แต้มสะสม</div><div class="v">${num(c.points)}</div></div>
     <div class="stat"><div class="k">ยอดค้างชำระ (เชื่อ)</div><div class="v" style="color:${num(c.credit) > 0 ? 'var(--amber)' : 'inherit'}">${baht(c.credit)}</div>${num(c.creditLimit) ? `<div class="tiny muted">วงเงิน ${money(c.creditLimit)}</div>` : ''}</div><div class="stat"><div class="k">เบอร์โทร</div><div class="v" style="font-size:16px">${esc(c.phone || '-')}</div></div></div>
     ${c.note ? `<div class="small muted" style="margin-bottom:8px">${esc(c.note)}</div>` : ''}
     <div id="cinst"></div>
     <div class="card"><h3>ความเคลื่อนไหว</h3><div id="tx"><span class="spin dark"></span></div></div>`,
    `<button class="btn ghost grow" id="ed">${I(IC.edit, 16)} แก้ไข</button><button class="btn ghost grow" id="pt">± แต้ม</button>${can('credit') && num(c.credit) > 0 ? `<button class="btn grow green" id="py">รับชำระหนี้</button>` : ''}`);
  $('#ed', ov).onclick = () => { ov.remove(); customerForm(c, () => go('customers')); };
  $('#pt', ov).onclick = () => {
    const o2 = sheet('ปรับแต้ม', `<div class="seg" id="sg"><button data-s="1" class="on">เพิ่มแต้ม</button><button data-s="-1">หักแต้ม</button></div><input class="in" id="pv" type="number" inputmode="numeric" style="margin-top:10px;font-size:22px" placeholder="จำนวนแต้ม"><input class="in" id="pn" style="margin-top:8px" placeholder="เหตุผล (เช่น แลกของรางวัล)">`, '<button class="btn block" id="ok">บันทึก</button>');
    let sg = 1; $$('#sg button', o2).forEach(b => b.onclick = () => { sg = +b.dataset.s; $$('#sg button', o2).forEach(x => x.classList.toggle('on', x === b)); });
    $('#ok', o2).onclick = async () => { const v = Math.floor(num($('#pv', o2).value)); if (!v) return toast('ใส่จำนวนแต้ม', 1); try { busy(1); const r = await api('adjustPoints', { id: c.id, points: sg * v, note: $('#pn', o2).value || 'ปรับโดย ' + S.user.name }); busy(0); o2.remove(); ov.remove(); toast('แต้มคงเหลือ ' + r.points); await loadCustomers(true); if (S.view === 'customers') go('customers'); } catch (e) { busy(0); toast(e.message, 1); } };
  };
  if (window.Inst) Inst.list().then(L => { const mine = L.filter(p => p.customerId === c.id && p.status === 'active'), b = $('#cinst', ov); if (!b || !mine.length) return;
    b.innerHTML = `<div class="card"><div class="row"><h3 class="grow">📆 สัญญาผ่อน ${mine.length} สัญญา</h3><button class="btn ghost sm" id="ci">ดูทั้งหมด</button></div>${mine.map(p => instRow(p, false)).join('')}</div>`;
    $('#ci', b).onclick = () => { ov.remove(); IV.cust = c.id; IV.f = ''; go('inst'); };
    $$('[data-iv]', b).forEach(r => r.onclick = () => instDetail(mine.find(p => p.id === r.dataset.iv))); }).catch(() => { });
  const py = $('#py', ov); if (py) py.onclick = () => keypad('รับชำระหนี้ — ค้าง ' + money(c.credit), num(c.credit), async v => {
    try { busy(1); const r = await api('customerPay', { id: c.id, amount: v }); busy(0); ov.remove(); toast('รับชำระแล้ว · คงค้าง ' + money(r.credit)); await loadCustomers(true); if (S.view === 'customers') go('customers');
      RP.printOrder({ id: 'PAY-' + Date.now().toString().slice(-6), date: LocalDB.now(), title: 'ใบรับชำระหนี้', cashierName: S.user.name, customerName: c.name, customerId: c.id, items: [{ name: 'รับชำระหนี้เงินเชื่อ', qty: 1, price: v }], subtotal: v, discount: 0, total: v, payments: [{ type: 'cash', amount: v }], creditBalance: r.credit }).catch(() => { });
    } catch (e) { busy(0); toast(e.message, 1); }
  }, { min: 0 });
  try {
    const tx = (await api('list', { table: 'CustomerTx' })).rows.filter(t => t.customerId === c.id).sort((a, b) => String(b.date).localeCompare(a.date)).slice(0, 40);
    const T = { credit_sale: 'ซื้อเงินเชื่อ', credit_pay: 'ชำระหนี้', credit_pay_void: 'ยกเลิกการชำระหนี้ (คืนเงินบิล)', credit_refund: 'คืนเงิน (เชื่อ)', points_adjust: 'ปรับแต้ม' };
    $('#tx', ov).innerHTML = tx.length ? tx.map(t => `<div class="kv small"><span>${T[t.type] || t.type}<div class="tiny muted">${esc(String(t.date).replace('T', ' ').slice(0, 16))} ${esc(t.ref || '')} ${esc(t.note || '')}</div></span><b>${t.amount ? money(t.amount) : (num(t.points) > 0 ? '+' : '') + t.points + ' แต้ม'}</b></div>`).join('') : '<div class="muted small">ยังไม่มีรายการเงินเชื่อ/แต้ม — ประวัติการซื้อดูได้ที่ใบเสร็จรับเงิน (ค้นหาชื่อลูกค้า)</div>';
  } catch (e) { $('#tx', ov).textContent = e.message; }
}

/* ---------- พนักงาน ---------- */
const SR = { r: 'month', from: todayISO().slice(0, 8) + '01', to: todayISO() };
VIEWS.staff = async (el, tab) => {
  tab = tab || S.staffTab || (isOwner() ? 'users' : 'clock'); S.staffTab = tab;
  const tabs = [isOwner() && ['users', 'ผู้ใช้'], isOwner() && ['perms', 'สิทธิ์'], ['clock', 'ลงเวลา'], seesSales() && ['sales', 'ยอดขาย']].filter(Boolean);
  if (!tabs.some(t => t[0] === tab)) tab = 'clock';
  el.innerHTML = vhead('พนักงาน', '', 'more') + `<div class="seg" style="margin-bottom:12px">${tabs.map(([k, n]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div id="sb"></div>`;
  $$('.seg [data-t]', el).forEach(b => b.onclick = () => go('staff', b.dataset.t));
  const sb = $('#sb', el);
  if (tab === 'users') {
    sb.innerHTML = `<div class="row" style="margin-bottom:8px"><span class="grow small muted">เจ้าของกิจการเข้าได้ทุกเมนู · พนักงานตามสิทธิ์ที่ตั้งไว้</span><button class="btn sm" id="add">${I(IC.plus, 16)} เพิ่มผู้ใช้</button></div><div class="list" id="ul"><div class="empty"><span class="spin dark"></span></div></div>`;
    const us = await loadTable('Users').catch(e => (toast(e.message, 1), []));
    $('#ul', sb).innerHTML = us.map(u => `<div class="item" data-id="${esc(u.id)}"><div class="av">${esc(Array.from(u.name || u.username)[0])}</div><div class="grow"><div class="t">${esc(u.name)}</div><div class="m">@${esc(u.username)}</div></div><span class="tag ${u.role === 'owner' ? 'red' : 'blue'}">${u.role === 'owner' ? 'เจ้าของ' : 'พนักงาน'}</span>${u.active === 'N' ? ' <span class="tag gray">ปิดใช้</span>' : ''}</div>`).join('');
    $$('#ul [data-id]', sb).forEach(x => x.onclick = () => userForm(us.find(u => u.id === x.dataset.id), () => go('staff', 'users')));
    $('#add', sb).onclick = () => userForm(null, () => go('staff', 'users'));
  } else if (tab === 'perms') {
    const r = await api('perms').catch(e => (toast(e.message, 1), null)); if (!r) return;
    const v2s = v => v === 'pin' ? 'pin' : v ? 'y' : 'n';
    sb.innerHTML = `<div class="card"><h3>สิ่งที่พนักงานทำได้</h3><p class="small muted" style="margin-top:0">ใช้กับผู้ใช้ที่เป็น “พนักงาน” ทุกคน · เจ้าของทำได้ทุกอย่าง · <b>🔒 ใส่รหัสเจ้าของ</b> = พนักงานทำได้เมื่อเจ้าของมากดรหัสให้ (ใช้ต่อได้ 3 นาที)</p>
      ${Object.entries(r.defs).map(([k, d]) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);gap:10px"><span class="grow small">${esc(d[0])}</span>${d[2]
        ? `<select class="in" data-k="${k}" style="width:auto;min-height:36px;padding:4px 8px"><option value="y">✅ อนุญาต</option><option value="pin">🔒 ใส่รหัสเจ้าของ</option><option value="n">⛔ ไม่อนุญาต</option></select>`
        : `<input type="checkbox" data-k="${k}" ${r.perms[k] ? 'checked' : ''} style="width:22px;height:22px">`}</div>`).join('')}
      <div class="row" style="padding:10px 0;gap:10px"><span class="grow small">อุปกรณ์ใหม่ที่พนักงานเข้าใช้ ต้องให้เจ้าของอนุมัติก่อน</span><input type="checkbox" id="da" ${S.settings.deviceApproval === 'Y' ? 'checked' : ''} style="width:22px;height:22px"></div>
      <div class="row" style="padding:6px 0;gap:10px"><span class="grow small">ล็อกหน้าจอ/ออกจากระบบอัตโนมัติ เมื่อไม่ได้ใช้งาน (นาที, 0 = ปิด)<div class="tiny muted">ใช้กับเจ้าของและพนักงานที่ไม่ได้อยู่ในโหมดพนักงานขาย</div></span><input class="in" type="number" id="il" value="${esc(cfg('idleLock', '10'))}" style="width:80px"></div>
      <button class="btn block green" id="sv" style="margin-top:8px">บันทึกสิทธิ์</button></div>
      <div class="card small"><b>แนะนำสำหรับร้าน:</b> เปิด “โหมดพนักงานขาย” · ต้นทุน/รายงาน = ไม่อนุญาต · แก้ไขสินค้า แก้ราคา คืนเงิน = ใส่รหัสเจ้าของ · ตรวจนับสต็อก = อนุญาต</div>`;
    $$('select[data-k]', sb).forEach(x => x.value = v2s(r.perms[x.dataset.k]));
    $('#sv', sb).onclick = async () => {
      const o = {}; $$('[data-k]', sb).forEach(c => o[c.dataset.k] = c.type === 'checkbox' ? c.checked : c.value === 'pin' ? 'pin' : c.value === 'y');
      try { busy(1); await saveSetting('perms', o); await saveSetting('deviceApproval', $('#da', sb).checked ? 'Y' : 'N'); await saveSetting('idleLock', String(Math.max(0, num($('#il', sb).value)))); await loadSettings(); busy(0); toast('บันทึกสิทธิ์แล้ว — พนักงานจะเห็นผลเมื่อเปิดแอปครั้งถัดไป'); } catch (e) { busy(0); toast(e.message, 1); }
    };
  } else if (tab === 'clock') {
    sb.innerHTML = `<div class="card center"><div class="small muted">${esc(S.user.name)}</div><div class="disp" style="font-size:22px;margin:6px 0">${S.shift ? 'กำลังทำงาน ตั้งแต่ ' + esc(S.shift.inAt.slice(11, 16)) + ' น.' : 'ยังไม่ได้ลงเวลาเข้างาน'}</div><button class="btn ${S.shift ? '' : 'green'}" id="ck" style="min-width:200px">${I(IC.clock, 18)} ${S.shift ? 'ลงเวลาออกงาน' : 'ลงเวลาเข้างาน'}</button></div><div id="rp"></div><div id="sl"></div>`;
    $('#ck', sb).onclick = async () => { await clockToggle(); go('staff', 'clock'); };
    const load = async () => {
      $('#sl', sb).innerHTML = '<div class="card center"><span class="spin dark"></span></div>';
      try {
        const rows = (await api('shifts', { from: SR.from, to: SR.to })).rows.sort((a, b) => String(b.inAt).localeCompare(a.inAt));
        const per = {}; rows.forEach(s => { const p = per[s.name] || (per[s.name] = { h: 0, n: 0, d: new Set() }); p.h += num(s.hours); p.n++; p.d.add(String(s.inAt).slice(0, 10)); });
        $('#sl', sb).innerHTML = `<div class="card"><h3>สรุปชั่วโมงทำงาน</h3>${Object.entries(per).map(([n, p]) => `<div class="kv"><span>${esc(n)}</span><span><b>${p.h.toFixed(2)}</b> ชม. · ${p.d.size} วัน</span></div>`).join('') || '<div class="muted small">ไม่มีข้อมูล</div>'}</div>
          <div class="card"><h3>รายการลงเวลา</h3><div class="scroll-x"><table class="t"><tr><th>พนักงาน</th><th>เข้า</th><th>ออก</th><th class="right">ชม.</th></tr>${rows.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(String(s.inAt).replace('T', ' ').slice(5, 16))}</td><td>${s.outAt ? esc(String(s.outAt).replace('T', ' ').slice(5, 16)) : '<span class="tag green">กำลังทำงาน</span>'}</td><td class="right">${s.hours ? num(s.hours).toFixed(2) : '-'}</td></tr>`).join('')}</table></div>
          <button class="btn ghost block" id="ex" style="margin-top:8px">ส่งออก CSV</button></div>`;
        $('#ex', sb).onclick = () => download(`timeclock_${SR.from}_${SR.to}.csv`, toCSV([['พนักงาน', 'เข้า', 'ออก', 'ชั่วโมง']].concat(rows.map(s => [s.name, s.inAt, s.outAt, s.hours]))));
      } catch (e) { $('#sl', sb).innerHTML = `<div class="alert red">${esc(e.message)}</div>`; }
    };
    rangePicker($('#rp', sb), SR, load); load();
  } else if (tab === 'sales') {
    sb.innerHTML = '<div id="rp"></div><div id="ss"></div>';
    const load = async () => {
      $('#ss', sb).innerHTML = '<div class="card center"><span class="spin dark"></span></div>';
      try {
        const A = aggregate(await fetchOrders(SR.from, SR.to)); const vc = can('viewCost');
        const list = Object.entries(A.staff).sort((a, b) => b[1].net - a[1].net); const max = Math.max(1, ...list.map(x => x[1].net));
        $('#ss', sb).innerHTML = `<div class="card">${list.map(([n, s]) => `<div style="margin-bottom:12px"><div class="row"><b class="grow">${esc(n)}</b><b>${baht(s.net)}</b></div><div class="prog" style="margin:4px 0"><i style="width:${s.net / max * 100}%;background:var(--green)"></i></div><div class="tiny muted">${s.bills} บิล · เฉลี่ย ${baht(s.bills ? s.net / s.bills : 0)}${s.refund ? ' · คืนเงิน ' + money(s.refund) : ''}${vc ? ' · กำไร ' + money(s.net - s.cost) : ''}</div></div>`).join('') || '<div class="empty">ไม่มีข้อมูล</div>'}</div>`;
      } catch (e) { $('#ss', sb).innerHTML = `<div class="alert red">${esc(e.message)}</div>`; }
    };
    rangePicker($('#rp', sb), SR, load); load();
  }
};
VIEWS.users = el => go('staff', 'users');

/* ---------- อุปกรณ์ POS ---------- */
VIEWS.devices = async el => {
  if (ownerOnly(el)) return;
  el.innerHTML = vhead('อุปกรณ์ POS', '', 'more') + `<div class="card"><div class="kv"><span>เครื่องนี้</span><b>${esc(S.device.name || '-')} (เครื่องที่ ${esc(S.device.no || '-')})</b></div><div class="tiny muted">อุปกรณ์จะถูกเพิ่มอัตโนมัติเมื่อมีคนเข้าสู่ระบบ · เลขเครื่องใช้เป็นตัวหน้าของเลขที่ใบเสร็จ</div>
    <label class="row small" style="margin-top:10px"><input type="checkbox" id="da" ${S.settings.deviceApproval === 'Y' ? 'checked' : ''}> อุปกรณ์ใหม่ต้องให้เจ้าของอนุมัติก่อนใช้งาน</label></div><div class="list" id="dl"><div class="empty"><span class="spin dark"></span></div></div>`;
  $('#da', el).onchange = async e => { try { await saveSetting('deviceApproval', e.target.checked ? 'Y' : 'N'); toast('บันทึกแล้ว'); } catch (er) { toast(er.message, 1); } };
  const rows = (await loadTable('Devices').catch(e => (toast(e.message, 1), []))).sort((a, b) => num(a.no) - num(b.no));
  const ago = t => { if (!t) return '-'; const m = Math.round((Date.now() + 7 * 3600e3 - new Date(t + 'Z').getTime()) / 60000); return m < 2 ? 'ออนไลน์อยู่' : m < 60 ? m + ' นาทีที่แล้ว' : m < 1440 ? Math.round(m / 60) + ' ชม.ที่แล้ว' : Math.round(m / 1440) + ' วันที่แล้ว'; };
  $('#dl', el).innerHTML = rows.map(d => { const on = d.lastSeen && (Date.now() + 7 * 3600e3 - new Date(d.lastSeen + 'Z').getTime()) < 10 * 60000; return `<div class="item" data-id="${esc(d.id)}"><div class="av" style="background:${on ? 'var(--green-l)' : '#F2EDEC'};color:${on ? 'var(--green)' : 'var(--ink3)'}">${esc(d.no)}</div><div class="grow"><div class="t">${esc(d.name)} ${d.id === S.device.id ? '<span class="tag blue">เครื่องนี้</span>' : ''}</div><div class="m">${esc(d.type)} · ${esc(d.lastUser || '')} · ${ago(d.lastSeen)}</div></div>${d.active === 'Y' ? '<span class="tag green">ใช้งาน</span>' : d.active === 'P' ? '<span class="tag amber">รออนุมัติ</span>' : '<span class="tag gray">ปิด</span>'}</div>`; }).join('') || '<div class="empty">ยังไม่มีอุปกรณ์</div>';
  $$('#dl [data-id]', el).forEach(x => x.onclick = () => {
    const d = rows.find(r => r.id === x.dataset.id);
    const ov = sheet('อุปกรณ์ ' + esc(d.no), `<label class="f"><span>ชื่ออุปกรณ์</span><input class="in" id="nm" value="${esc(d.name)}"></label><label class="f"><span>สถานะ</span><select class="in" id="ac"><option value="Y">ใช้งาน</option><option value="P">รออนุมัติ</option><option value="N">ปิดใช้งาน (ล็อกเครื่องนี้)</option></select></label><div class="tiny muted" style="word-break:break-all">${esc(d.ua)}</div>`, `<button class="btn ghost grow" id="dl" style="color:var(--red)">ลบ</button><button class="btn grow" id="sv">บันทึก</button>`);
    $('#ac', ov).value = d.active || 'Y';
    $('#sv', ov).onclick = async () => { try { busy(1); await api('upsert', { table: 'Devices', rows: [{ id: d.id, name: $('#nm', ov).value.trim() || d.name, active: $('#ac', ov).value }] }); if (d.id === S.device.id) { S.device.name = $('#nm', ov).value.trim(); LS.set('device', S.device); } busy(0); ov.remove(); go('devices'); } catch (e) { busy(0); toast(e.message, 1); } };
    $('#dl', ov).onclick = async () => { if (!(await confirmDlg('ลบอุปกรณ์นี้ออกจากรายการ? (ถ้าเข้าระบบใหม่จะถูกเพิ่มกลับพร้อมเลขเครื่องใหม่)', 'ลบ', true))) return; try { busy(1); await api('remove', { table: 'Devices', ids: [d.id] }); busy(0); ov.remove(); go('devices'); } catch (e) { busy(0); toast(e.message, 1); } };
  });
};

/* ---------- หมวดหมู่ ---------- */
VIEWS.categories = async el => {
  if (!can('editProducts')) return ownerOnly(el);
  await loadSettings();
  const counts = {}; S.products.forEach(p => counts[p.category || ''] = (counts[p.category || ''] || 0) + 1);
  const cats = S.categories.slice();
  el.innerHTML = vhead('หมวดหมู่สินค้า', `<button class="btn sm" id="add">${I(IC.plus, 18)} เพิ่ม</button>`, 'more') + `<div class="list" id="cl">${cats.map((c, i) => `<div class="item" data-i="${i}"><span style="width:34px;height:34px;border-radius:10px;background:${c.color};flex:none"></span><div class="grow"><div class="t">${esc(c.name)}</div><div class="m">${counts[c.name] || 0} สินค้า</div></div><button class="iconbtn" data-up="${i}" ${i ? '' : 'disabled'}>▲</button><button class="iconbtn" data-dn="${i}" ${i < cats.length - 1 ? '' : 'disabled'}>▼</button></div>`).join('') || '<div class="empty">ยังไม่มีหมวดหมู่</div>'}</div>${counts[''] ? `<div class="small muted" style="margin-top:8px">สินค้าที่ยังไม่ระบุหมวด ${counts['']} รายการ</div>` : ''}`;
  const form = c => {
    c = c || { name: '', color: TILE_COLORS[cats.length % 10] }; let color = c.color;
    const ov = sheet(c.name ? 'แก้ไขหมวด' : 'หมวดใหม่', `<label class="f"><span>ชื่อหมวด</span><input class="in" id="nm" value="${esc(c.name)}"></label><div class="row wrap" id="sw">${TILE_COLORS.map(x => `<span class="swatch ${x === color ? 'on' : ''}" data-c="${x}" style="background:${x}"></span>`).join('')}</div>${c.name && counts[c.name] ? `<div class="tiny muted" style="margin-top:8px">เปลี่ยนชื่อแล้ว สินค้า ${counts[c.name]} รายการจะย้ายไปชื่อใหม่ให้อัตโนมัติ</div>` : ''}`, `${c.name && !counts[c.name] ? '<button class="btn ghost grow" id="dl" style="color:var(--red)">ลบ</button>' : ''}<button class="btn grow" id="sv">บันทึก</button>`);
    $$('#sw .swatch', ov).forEach(s => s.onclick = () => { color = s.dataset.c; $$('#sw .swatch', ov).forEach(x => x.classList.toggle('on', x === s)); });
    $('#sv', ov).onclick = async () => { try { busy(1); const r = await api('renameCategory', { from: c.name, to: $('#nm', ov).value, color }); if (r.moved) await loadProducts(true); busy(0); ov.remove(); go('categories'); } catch (e) { busy(0); toast(e.message, 1); } };
    const dl = $('#dl', ov); if (dl) dl.onclick = async () => { try { busy(1); await api('remove', { table: 'Categories', ids: [c.name] }); busy(0); ov.remove(); go('categories'); } catch (e) { busy(0); toast(e.message, 1); } };
  };
  $('#add', el).onclick = () => form(null);
  $$('#cl [data-i]', el).forEach(x => x.onclick = e => { if (e.target.closest('[data-up],[data-dn]')) return; form(cats[+x.dataset.i]); });
  const move = async (i, d) => { const a = cats.splice(i, 1)[0]; cats.splice(i + d, 0, a); try { busy(1); await api('upsert', { table: 'Categories', rows: cats.map((c, k) => ({ name: c.name, color: c.color, sort: String(k + 1) })) }); busy(0); go('categories'); } catch (e) { busy(0); toast(e.message, 1); } };
  $$('[data-up]', el).forEach(b => b.onclick = () => move(+b.dataset.up, -1));
  $$('[data-dn]', el).forEach(b => b.onclick = () => move(+b.dataset.dn, 1));
};
