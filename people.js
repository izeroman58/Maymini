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
    <div id="rkb"></div><div class="grid3" id="sm" style="margin-bottom:10px"></div><div class="list" id="cl"><div class="empty"><span class="spin dark"></span></div></div>`;
  const draw = () => {
    const all = S.customers || [], t = norm(q), cr = c => num(c.credit) + (typeof custPending === 'function' ? custPending(c.id) : 0);
    let res = all.filter(c => !t || norm(c.name + c.phone).includes(t));
    if (sort === 'credit') res = res.filter(c => cr(c) > 0);
    res.sort((a, b) => sort === 'spent' ? num(b.totalSpent) - num(a.totalSpent) : sort === 'points' ? num(b.points) - num(a.points) : sort === 'credit' ? cr(b) - cr(a) : String(b.lastVisit || b.createdAt).localeCompare(a.lastVisit || a.createdAt));
    $('#sm', el).innerHTML = `<div class="stat center"><div class="k">ลูกค้า</div><div class="v">${all.length}</div></div><div class="stat center"><div class="k">ยอดค้างเชื่อรวม</div><div class="v" style="color:var(--red)">${money(all.reduce((s, c) => s + Math.max(0, num(c.credit)), 0), 0)}</div></div><div class="stat center"><div class="k">แต้มคงค้าง</div><div class="v">${all.reduce((s, c) => s + num(c.points), 0).toLocaleString()}</div></div>`;
    $('#cl', el).innerHTML = res.slice(0, 200).map(c => `<div class="item cit" data-id="${esc(c.id)}"><div class="av cav">${esc(Array.from(c.name || '?')[0])}</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="m">${esc(c.phone || '-')} · ${num(c.visits)} ครั้ง · ${num(c.points)} แต้ม${c.lastVisit ? ' · ล่าสุด ' + thDate(String(c.lastVisit).slice(0, 10)) : ''}</div></div><div class="right"><div class="num" style="font-weight:600">${baht(c.totalSpent)}</div>${num(c.credit) ? `<div class="tag red" style="font-weight:700">ค้าง ${money(c.credit)}</div>` : ''}</div></div>`).join('') || '<div class="empty">ไม่พบลูกค้า</div>';
    $$('#cl [data-id]', el).forEach(x => x.onclick = () => customerDetail(all.find(c => c.id === x.dataset.id)));
    // หน้า ยอดซื้อสูงสุด / แต้มมากสุด → ปุ่มทำภาพอันดับ
    $('#rkb', el).innerHTML = sort === 'spent' || sort === 'points' ? `<button class="btn block rkbtn" onclick="go('rank','${sort}')">🏆 ทำภาพอันดับลูกค้า${sort === 'spent' ? 'ยอดซื้อสูงสุด' : 'แต้มสูงสุด'}</button>` : '';
  };
  $('#q', el).oninput = e => { q = e.target.value; draw(); };
  $$('[data-s]', el).forEach(b => b.onclick = () => { sort = b.dataset.s; $$('[data-s]', el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#nw', el).onclick = () => customerForm(null, () => draw());
  // แสดงจากข้อมูลในเครื่องทันที → อัปเดตจาก Google เบื้องหลัง แล้ววาดใหม่ให้เอง
  if (!S.customers) S.customers = LS.get('customers', null);
  if (S.customers) draw();
  const h = () => { if (!el.isConnected) return document.removeEventListener('mm:customers', h); draw(); }; document.addEventListener('mm:customers', h);
  loadCustomers(!S.customers).then(() => { if (el.isConnected) draw(); });
};
const CTX_T = { credit_sale: 'ซื้อเงินเชื่อ', credit_pay: 'ชำระหนี้', credit_pay_void: 'ยกเลิกการชำระหนี้ (คืนเงินบิล)', credit_refund: 'คืนเงิน (เชื่อ)', credit_adjust: 'ปรับยอดค้างชำระ', points_adjust: 'ปรับแต้ม' };
function customerDetail(c0) {
  const id = c0.id, own = isOwner();
  const cur = () => (S.customers || []).find(x => x.id === id) || c0;
  const ov = sheet(esc(c0.name), `<div id="cdb"></div><div id="cinst"></div><div class="card"><h3>ความเคลื่อนไหว <span id="txs" class="tiny muted" style="font-weight:400"></span></h3><div id="tx"></div></div>`,
    `<button class="btn ghost grow" id="ed">${I(IC.edit, 16)} แก้ไข</button><button class="btn ghost grow" id="pt">± แต้ม</button>${own ? '<button class="btn ghost grow" id="cr">± ยอดค้าง</button>' : ''}<span id="pyw" style="display:contents"></span>${own ? `<button class="btn ghost" id="rm" title="ลบลูกค้า" style="color:var(--red)">${I(IC.trash, 18)}</button>` : ''}`);
  $('.sheet', ov).classList.add('cdx');
  const pend = () => typeof custPending === 'function' ? custPending(id) : 0;
  const paint = () => {
    if (!ov.isConnected) return document.removeEventListener('mm:customers', paint);
    const c = cur(), pd = pend(), credit = Math.round((num(c.credit) + pd) * 100) / 100;
    $('#cdb', ov).innerHTML = `<div class="grid2" style="margin-bottom:10px"><div class="stat"><div class="k">ยอดซื้อรวม</div><div class="v">${baht(c.totalSpent)}</div><div class="tiny muted">${num(c.visits)} ครั้ง</div></div><div class="stat"><div class="k">แต้มสะสม</div><div class="v">${num(c.points)}</div></div>
     <div class="stat"><div class="k">ยอดค้างชำระ (เชื่อ)</div><div class="v" style="color:${credit > 0 ? 'var(--red)' : 'inherit'}">${baht(credit)}</div>${pd ? `<div class="tiny muted">รวมบิลที่รอส่ง ${money(pd)}</div>` : ''}${num(c.creditLimit) ? `<div class="tiny muted">วงเงิน ${money(c.creditLimit)}</div>` : ''}</div><div class="stat"><div class="k">เบอร์โทร</div><div class="v" style="font-size:16px">${esc(c.phone || '-')}</div></div></div>
     ${c.note ? `<div class="small muted" style="margin-bottom:8px">${esc(c.note)}</div>` : ''}`;
    $('#pyw', ov).innerHTML = can('credit') && credit > 0 ? '<button class="btn grow green" id="py">รับชำระหนี้</button>' : '';
    const py = $('#py', ov); if (py) py.onclick = () => keypad('รับชำระหนี้ — ค้าง ' + money(credit), credit, v => {
      v = Math.min(credit, num(v)); if (v <= 0) return;
      const left = Math.round((num(cur().credit) - v) * 100) / 100;
      custLocal(id, { credit: String(left) }); custTxLocal(id, { type: 'credit_pay', amount: String(-v), note: '' });
      CustQ.push('customerPay', { id, amount: v }); toast('รับชำระแล้ว · คงค้าง ' + money(left + pend())); drawTx();
      RP.printOrder({ id: 'PAY-' + Date.now().toString().slice(-6), date: LocalDB.now(), title: 'ใบรับชำระหนี้', cashierName: S.user.name, customerName: cur().name, customerId: id, items: [{ name: 'รับชำระหนี้เงินเชื่อ', qty: 1, price: v }], subtotal: v, discount: 0, total: v, payments: [{ type: 'cash', amount: v }], creditBalance: left + pend() }).catch(() => { });
    }, { min: 0 });
    const h2 = $('.sh h3', ov); if (h2 && h2.textContent !== c.name) h2.textContent = c.name;
  };
  const drawTx = () => {
    if (!ov.isConnected) return;
    const tx = (LS.get('custTx', {})[id] || []);
    const oref = t => t.ref && !/^Q/.test(t.ref) && !/^PAY-/.test(t.ref) ? t.ref : '';
    $('#tx', ov).innerHTML = tx.length ? tx.slice(0, 40).map(t => `<div class="kv ctx${oref(t) ? ' go' : ''}" ${oref(t) ? `data-o="${esc(t.ref)}" data-d="${esc(t.date)}"` : ''}><span>${CTX_T[t.type] || t.type}${t._local ? ' <span class="tag gray" style="font-size:10px">รอส่ง</span>' : ''}<div class="tiny muted">${esc(String(t.date).replace('T', ' ').slice(0, 16))} ${/^Q/.test(t.ref || '') ? '' : esc(t.ref || '')} ${esc(t.note || '')}</div></span><b style="${num(t.amount) > 0 ? 'color:var(--red)' : num(t.amount) < 0 ? 'color:var(--green)' : ''}">${t.amount ? money(t.amount) : (num(t.points) > 0 ? '+' : '') + t.points + ' แต้ม'}${oref(t) ? ' <span class="muted" style="font-weight:400">›</span>' : ''}</b></div>`).join('') : '<div class="muted small">ยังไม่มีรายการเงินเชื่อ/แต้ม — ประวัติการซื้อดูได้ที่ใบเสร็จรับเงิน (ค้นหาชื่อลูกค้า)</div>';
  };
  // แตะรายการที่มาจากบิล → เปิดใบเสร็จดูว่าซื้ออะไร
  $('#tx', ov).onclick = e => { const r = e.target.closest('[data-o]'); if (r) openOrderById(r.dataset.o, r.dataset.d); };
  paint(); drawTx(); document.addEventListener('mm:customers', paint);
  // ประวัติ: แสดงที่เก็บไว้ในเครื่องก่อน แล้วดึงเฉพาะของลูกค้าคนนี้เบื้องหลัง
  $('#txs', ov).textContent = '⟳ กำลังอัปเดต';
  const pullTx = () => api('customerTx', { id, limit: 60 }).then(r => {
    const m = LS.get('custTx', {}), loc = CustQ.list.length ? (m[id] || []).filter(t => t._local) : []; m[id] = loc.concat(r.rows || []); LS.set('custTx', m);
    if (ov.isConnected) { drawTx(); $('#txs', ov).textContent = ''; }
  }).catch(e => { if (ov.isConnected) $('#txs', ov).textContent = e.offline ? '(ออฟไลน์ — แสดงข้อมูลในเครื่อง)' : ''; });
  (CustQ.list.length ? CustQ.flush() : Promise.resolve()).then(pullTx);
  const qh = () => { if (!ov.isConnected) return document.removeEventListener('mm:custq', qh); if (!CustQ.list.length) pullTx(); }; document.addEventListener('mm:custq', qh);
  if (window.Inst) Inst.list().then(L => { const mine = L.filter(p => p.customerId === id && p.status === 'active'), b = $('#cinst', ov); if (!b || !mine.length) return;
    b.innerHTML = `<div class="card"><div class="row"><h3 class="grow">📆 สัญญาผ่อน ${mine.length} สัญญา</h3><button class="btn ghost sm" id="ci">ดูทั้งหมด</button></div>${mine.map(p => instRow(p, false)).join('')}</div>`;
    $('#ci', b).onclick = () => { ov.remove(); IV.cust = id; IV.f = ''; go('inst'); };
    $$('[data-iv]', b).forEach(r => r.onclick = () => instDetail(mine.find(p => p.id === r.dataset.iv))); }).catch(() => { });
  $('#ed', ov).onclick = () => customerForm(cur(), () => paint());
  $('#pt', ov).onclick = () => {
    const o2 = sheet('ปรับแต้ม', `<div class="seg" id="sg"><button data-s="1" class="on">เพิ่มแต้ม</button><button data-s="-1">หักแต้ม</button></div><input class="in" id="pv" type="number" inputmode="numeric" style="margin-top:10px;font-size:22px" placeholder="จำนวนแต้ม"><input class="in" id="pn" style="margin-top:8px" placeholder="เหตุผล (เช่น แลกของรางวัล)">`, '<button class="btn block" id="ok">บันทึก</button>');
    let sg = 1; $$('#sg button', o2).forEach(b => b.onclick = () => { sg = +b.dataset.s; $$('#sg button', o2).forEach(x => x.classList.toggle('on', x === b)); });
    $('#ok', o2).onclick = () => {
      const v = Math.floor(num($('#pv', o2).value)); if (!v) return toast('ใส่จำนวนแต้ม', 1);
      const note = $('#pn', o2).value || 'ปรับโดย ' + S.user.name, pts = Math.max(0, num(cur().points) + sg * v);
      custLocal(id, { points: String(pts) }); custTxLocal(id, { type: 'points_adjust', points: String(sg * v), note });
      CustQ.push('adjustPoints', { id, points: sg * v, note }); o2.remove(); toast('แต้มคงเหลือ ' + pts); drawTx();
    };
  };
  const crb = $('#cr', ov); if (crb) crb.onclick = () => {
    const now = num(cur().credit);
    const o2 = sheet('ปรับยอดค้างชำระ', `<div class="small muted" style="margin-bottom:8px">ยอดค้างตอนนี้ <b>${money(now)}</b>${pend() ? ` (ไม่รวมบิลที่รอส่ง ${money(pend())})` : ''} · ใช้ยกหนี้เก่าจากสมุดมาใส่ แก้ยอดที่ผิด หรือยกหนี้ให้ลูกค้า — ระบบบันทึกส่วนต่างในประวัติ</div>
      <div class="seg" id="cm"><button data-m="set" class="on">ตั้งยอดใหม่</button><button data-m="add">เพิ่มหนี้</button><button data-m="sub">ลดหนี้</button></div>
      <input class="in" id="cv" type="number" inputmode="decimal" step="any" style="margin-top:10px;font-size:22px" value="${now}">
      <div class="small" id="cpv" style="margin:6px 2px;font-weight:600"></div>
      <input class="in" id="cn" placeholder="เหตุผล (เช่น ยกยอดจากสมุดหนี้ / ยกหนี้ให้)">`, '<button class="btn block" id="ok">บันทึก</button>');
    let m = 'set'; const nv = () => { const v = num($('#cv', o2).value); return Math.max(0, Math.round((m === 'set' ? v : m === 'add' ? now + v : now - v) * 100) / 100); };
    const pv = () => { const d = nv() - now; $('#cpv', o2).textContent = `ยอดค้างใหม่ ${money(nv())} (${d >= 0 ? '+' : ''}${money(d)})`; };
    $$('#cm button', o2).forEach(b => b.onclick = () => { m = b.dataset.m; $$('#cm button', o2).forEach(x => x.classList.toggle('on', x === b)); $('#cv', o2).value = m === 'set' ? now : ''; pv(); $('#cv', o2).focus(); });
    $('#cv', o2).oninput = pv; pv();
    $('#ok', o2).onclick = () => {
      const v = nv(), d = Math.round((v - now) * 100) / 100; if (!d) return o2.remove();
      const note = $('#cn', o2).value.trim() || 'ปรับโดย ' + S.user.name;
      custLocal(id, { credit: String(v) }); custTxLocal(id, { type: 'credit_adjust', amount: String(d), note });
      CustQ.push('adjustCredit', { id, credit: v, note }); o2.remove(); toast('ยอดค้างชำระ ' + money(v)); drawTx();
    };
  };
  const rmb = $('#rm', ov); if (rmb) rmb.onclick = async () => {
    const c = cur(), credit = num(c.credit) + pend();
    const ip = window.Inst ? Inst.view(Inst.cache()).filter(p => p.customerId === id && p.status === 'active') : [];
    if (ip.length) return toast(`${c.name} มีสัญญาผ่อนที่ยังไม่ปิด ${ip.length} สัญญา — ปิดหรือยกเลิกสัญญาก่อน`, 1);
    if (POS.t.customer && POS.t.customer.id === id) return toast('ลูกค้านี้อยู่ในบิลที่กำลังขาย — ชำระหรือล้างบิลก่อน', 1);
    if (!(await confirmDlg(`ลบลูกค้า <b>${esc(c.name)}</b> ${esc(c.phone || '')}?${credit > 0 ? `<div class="alert amber small" style="margin-top:8px">มียอดค้างชำระ ${money(credit)} — ยอดนี้จะหายไปด้วย</div>` : ''}<div class="tiny muted" style="margin-top:8px">บิลเก่าและประวัติยังอยู่ · แต้มสะสมหายไปด้วย</div>`, 'ลบลูกค้า', true))) return;
    ov.remove(); custLocal(id, null); CustQ.push('customerRemove', { id, force: credit > 0 ? 1 : 0 }); toast('ลบลูกค้าแล้ว');
  };
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
    $('#ul', sb).insertAdjacentHTML('beforebegin', '<div class="card pinc" id="pc"></div>');
    // รหัส PIN ของทุกคน: เจ้าของกดดูได้ (ยืนยันรหัสเจ้าของก่อน) · ซ่อนเองใน 60 วินาที
    const draw = () => {
      if (!sb.isConnected) return clearInterval(PINV.t);
      const on = pinsShown(), left = Math.max(0, Math.ceil((PINV.until - Date.now()) / 1000));
      $('#pc', sb).innerHTML = on
        ? `<div class="row" style="gap:8px"><b class="grow">🔑 รหัส PIN ของทุกคน</b><span class="tiny muted">ซ่อนใน ${left} วิ</span><button class="btn ghost sm" id="hp">ซ่อน</button></div>
           ${PINV.apSet ? `<div class="kv small" style="margin-top:6px"><span>รหัสอนุมัติ (พนักงานใช้ขออนุญาตงานสินค้า)</span>${PINV.ap ? `<b class="pinv">${esc(PINV.ap)}</b>` : '<span class="tag amber">ตั้งก่อนระบบนี้ — ตั้งใหม่เพื่อให้แสดงได้</span>'}</div>` : ''}
           ${us.some(u => !PINV.map[u.id]) ? '<div class="tiny muted" style="margin-top:6px">“ยังไม่ทราบ” = รหัสที่ตั้งไว้ก่อนอัปเดตนี้ จะแสดงหลังคนนั้นเข้าระบบครั้งถัดไป หรือแตะชื่อเพื่อตั้งรหัสใหม่ได้ทันที</div>' : ''}`
        : `<div class="row" style="gap:10px"><div class="grow"><b>🔑 รหัส PIN</b><div class="tiny muted">เจ้าของกิจการดูและเปลี่ยนรหัสของตนเองและพนักงานได้ทุกคน (ยืนยันรหัสเจ้าของก่อนแสดง)</div></div><button class="btn sm" id="sp">แสดงรหัส</button></div>`;
      $('#ul', sb).innerHTML = us.map(u => `<div class="item" data-id="${esc(u.id)}"><div class="av">${esc(Array.from(u.name || u.username)[0])}</div><div class="grow"><div class="t">${esc(u.name)}</div><div class="m">@${esc(u.username)}</div></div>${on ? (PINV.map[u.id] ? `<b class="pinv">${esc(PINV.map[u.id])}</b>` : '<span class="tag amber">ยังไม่ทราบ</span>') : '<span class="pinh">••••</span>'}<span class="tag ${u.role === 'owner' ? 'red' : 'blue'}">${u.role === 'owner' ? 'เจ้าของ' : 'พนักงาน'}</span>${u.active === 'N' ? ' <span class="tag gray">ปิดใช้</span>' : ''}</div>`).join('');
      $$('#ul [data-id]', sb).forEach(x => x.onclick = () => userForm(us.find(u => u.id === x.dataset.id), () => go('staff', 'users')));
      const sp = $('#sp', sb); if (sp) sp.onclick = async () => { if (await revealPins()) { tick(); draw(); } };
      const hp = $('#hp', sb); if (hp) hp.onclick = () => { PINV.until = 0; draw(); };
    };
    const tick = () => { clearInterval(PINV.t); PINV.t = setInterval(() => { if (!sb.isConnected) return clearInterval(PINV.t); if (!pinsShown()) { clearInterval(PINV.t); PINV.map = null; } draw(); }, 1000); };
    if (pinsShown()) tick();
    draw();
    $('#add', sb).onclick = () => userForm(null, () => go('staff', 'users'));
  } else if (tab === 'perms') {
    const r = await api('perms').catch(e => (toast(e.message, 1), null)); if (!r) return;
    const v2s = v => v === 'pin' ? 'pin' : v ? 'y' : 'n';
    sb.innerHTML = `<div class="card"><h3>สิ่งที่พนักงานทำได้</h3><p class="small muted" style="margin-top:0">ใช้กับผู้ใช้ที่เป็น “พนักงาน” ทุกคน · เจ้าของทำได้ทุกอย่าง · <b>🔒 ใส่รหัสเจ้าของ</b> = พนักงานทำได้เมื่อเจ้าของมากดรหัสให้ (ใช้ต่อได้ 3 นาที)</p>
      ${Object.entries(r.defs).map(([k, d]) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);gap:10px"><span class="grow small">${esc(d[0])}</span>${d[2]
        ? `<select class="in" data-k="${k}" style="width:auto;min-height:36px;padding:4px 8px"><option value="y">✅ อนุญาต</option><option value="pin">🔒 ใส่รหัสเจ้าของ</option><option value="n">⛔ ไม่อนุญาต</option></select>`
        : `<input type="checkbox" data-k="${k}" ${r.perms[k] ? 'checked' : ''} style="width:22px;height:22px">`}</div>`).join('')}
      <div class="row" style="padding:10px 0;gap:10px"><span class="grow small">อุปกรณ์ใหม่ที่พนักงานเข้าใช้ ต้องให้เจ้าของอนุมัติก่อน</span><input type="checkbox" id="da" ${S.settings.deviceApproval === 'Y' ? 'checked' : ''} style="width:22px;height:22px"></div>
      <div class="tiny muted" style="padding:6px 0">ออกจากระบบอัตโนมัติ ตั้งได้ที่ เพิ่มเติม › ตั้งค่า › ร้าน · การเชื่อมต่อ</div>
      <button class="btn block green" id="sv" style="margin-top:8px">บันทึกสิทธิ์</button></div>
      <div class="card small"><b>แนะนำสำหรับร้าน:</b> เปิด “โหมดพนักงานขาย” · ต้นทุน/รายงาน = ไม่อนุญาต · แก้ไขสินค้า แก้ราคา คืนเงิน = ใส่รหัสเจ้าของ · ตรวจนับสต็อก = อนุญาต</div>`;
    $$('select[data-k]', sb).forEach(x => x.value = v2s(r.perms[x.dataset.k]));
    $('#sv', sb).onclick = async () => {
      const o = {}; $$('[data-k]', sb).forEach(c => o[c.dataset.k] = c.type === 'checkbox' ? c.checked : c.value === 'pin' ? 'pin' : c.value === 'y');
      try { busy(1); await saveSetting('perms', o); await saveSetting('deviceApproval', $('#da', sb).checked ? 'Y' : 'N'); await loadSettings(); busy(0); toast('บันทึกสิทธิ์แล้ว — พนักงานจะเห็นผลเมื่อเปิดแอปครั้งถัดไป'); } catch (e) { busy(0); toast(e.message, 1); }
    };
  } else if (tab === 'clock') {
    sb.innerHTML = `<div class="card center"><div class="small muted">${esc(S.user.name)}</div><div class="disp" style="font-size:22px;margin:6px 0">${S.shift ? 'กำลังทำงาน ตั้งแต่ ' + esc(S.shift.inAt.slice(11, 16)) + ' น.' : 'ยังไม่ได้ลงเวลาเข้างาน'}</div><button class="btn ${S.shift ? '' : 'green'}" id="ck" style="min-width:200px">${I(IC.clock, 18)} ${S.shift ? 'ลงเวลาออกงาน' : 'ลงเวลาเข้างาน'}</button></div><div id="rp"></div><div id="sl"></div>`;
    $('#ck', sb).onclick = async () => { await clockToggle(); go('staff', 'clock'); };
    const load = async () => {
      $('#sl', sb).innerHTML = '<div class="card center"><span class="spin dark"></span></div>';
      try {
        const rows = (await api('shifts', { from: SR.from, to: SR.to })).rows.sort((a, b) => String(b.inAt).localeCompare(a.inAt));
        const per = {}; rows.forEach(s => { const p = per[s.name] || (per[s.name] = { h: 0, n: 0, d: new Set() }); p.h += num(s.hours); p.n++; p.d.add(String(s.inAt).slice(0, 10)); });
        // รายวัน: รวมทุกรอบที่ลงเวลาเข้า-ออกของวันนั้น (นับวันตามเวลาเข้างาน · รอบที่ยังไม่ลงเวลาออกยังไม่นับชั่วโมง)
        const dd = {}; rows.forEach(s => { const k = s.name + '|' + String(s.inAt).slice(0, 10); const x = dd[k] || (dd[k] = { name: s.name, d: String(s.inAt).slice(0, 10), h: 0, n: 0, first: s.inAt, last: s.outAt || '', open: false }); x.h += num(s.hours); x.n++; if (String(s.inAt) < String(x.first)) x.first = s.inAt; if (!s.outAt) x.open = true; else if (String(s.outAt) > String(x.last)) x.last = s.outAt; });
        const days = Object.values(dd).sort((a, b) => b.d.localeCompare(a.d) || a.name.localeCompare(b.name));
        const hm = h => { const m = Math.round(h * 60); return Math.floor(m / 60) + ' ชม. ' + String(m % 60).padStart(2, '0') + ' นาที'; };
        const dayCard = `<div class="card"><h3>ชั่วโมงทำงานรายวัน</h3><div class="scroll-x"><table class="t"><tr><th>วันที่</th><th>พนักงาน</th><th>เข้างาน</th><th>ออกงาน</th><th class="right">รวมวันนั้น</th></tr>${days.map(x => `<tr><td>${thDate(x.d)}</td><td>${esc(x.name)}</td><td>${esc(String(x.first).slice(11, 16))}</td><td>${x.open ? '<span class="tag green">กำลังทำงาน</span>' : esc(String(x.last).slice(11, 16))}</td><td class="right"><b>${x.h ? hm(x.h) : '-'}</b>${x.n > 1 ? `<div class="tiny muted">${x.n} รอบ</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">ไม่มีข้อมูล</td></tr>'}</table></div></div>`;
        $('#sl', sb).innerHTML = `${dayCard}<div class="card"><h3>สรุปชั่วโมงทำงาน</h3>${Object.entries(per).map(([n, p]) => `<div class="kv"><span>${esc(n)}</span><span><b>${p.h.toFixed(2)}</b> ชม. · ${p.d.size} วัน</span></div>`).join('') || '<div class="muted small">ไม่มีข้อมูล</div>'}</div>
          <div class="card"><h3>รายการลงเวลา</h3><div class="scroll-x"><table class="t"><tr><th>พนักงาน</th><th>เข้า</th><th>ออก</th><th class="right">ชม.</th></tr>${rows.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(String(s.inAt).replace('T', ' ').slice(5, 16))}</td><td>${s.outAt ? esc(String(s.outAt).replace('T', ' ').slice(5, 16)) : '<span class="tag green">กำลังทำงาน</span>'}</td><td class="right">${s.hours ? num(s.hours).toFixed(2) : '-'}</td></tr>`).join('')}</table></div>
          <button class="btn ghost block" id="ex" style="margin-top:8px">ส่งออก CSV</button></div>`;
        $('#ex', sb).onclick = () => download(`timeclock_${SR.from}_${SR.to}.csv`, toCSV([['พนักงาน', 'เข้า', 'ออก', 'ชั่วโมง']].concat(rows.map(s => [s.name, s.inAt, s.outAt, s.hours])).concat([[], ['รายวัน'], ['วันที่', 'พนักงาน', 'เข้างาน', 'ออกงาน', 'รวมชั่วโมง']]).concat(days.map(x => [x.d, x.name, x.first, x.open ? '' : x.last, Math.round(x.h * 100) / 100]))));
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
  const cats = S.categories.slice(), vx = new Set(window.VATX ? VATX.conf().exemptCats || [] : []);
  el.innerHTML = vhead('หมวดหมู่สินค้า', `<button class="btn sm" id="add">${I(IC.plus, 18)} เพิ่ม</button>`, 'more') + `<div class="list" id="cl">${cats.map((c, i) => `<div class="item" data-i="${i}"><span style="width:34px;height:34px;border-radius:10px;background:${c.color};flex:none"></span><div class="grow"><div class="t">${esc(c.name)}</div><div class="m">${counts[c.name] || 0} สินค้า${vx.has(c.name) ? ' · <span class="tag green">✓ ยกเว้น VAT</span>' : ''}</div></div><button class="iconbtn" data-up="${i}" ${i ? '' : 'disabled'}>▲</button><button class="iconbtn" data-dn="${i}" ${i < cats.length - 1 ? '' : 'disabled'}>▼</button></div>`).join('') || '<div class="empty">ยังไม่มีหมวดหมู่</div>'}</div>${counts[''] ? `<div class="small muted" style="margin-top:8px">สินค้าที่ยังไม่ระบุหมวด ${counts['']} รายการ</div>` : ''}${isOwner() && window.VATX ? `<button class="btn ghost block" style="margin-top:10px" onclick="go('vatcheck')">ตรวจหมวดยกเว้น VAT ตามกฎหมาย</button>` : ''}`;
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

/* ---------- 🏆 ภาพอันดับลูกค้า (แต้มสูงสุด / ยอดซื้อสูงสุด) ----------
   วาดเป็นภาพ 1024×1536 บนพื้นหลังแม่แบบของร้าน (rank-bg.jpg — เปลี่ยนได้) · ดาวน์โหลด/พิมพ์/เปิดเต็มจอได้ */
const RANK_DEF = { type: 'points', n: 15, title: '', sub: '', prefix: true, first: true, font: 'kanit', foot: '', bgId: '' };
const RANK_FONTS = { kanit: ['Kanit', 'kanit'], prompt: ['Prompt', 'prompt'], mitr: ['Mitr', 'mitr'] };
const rankCfg = () => ({ ...RANK_DEF, ...cfg('rankCfg', {}), ...LS.get('rankCfgLocal', {}) });
function rankName(c, o) {
  let n = String(c.name || '').trim().replace(/^คุณ\s*/, ''); if (o.first) n = n.split(/\s+/)[0] || n;
  return (o.prefix ? 'คุณ' : '') + n;
}
async function rankDraw(cv, list, o) {
  const W = 1024, H = 1536, x = cv.getContext('2d'); cv.width = W; cv.height = H;
  const fam = (RANK_FONTS[o.font] || RANK_FONTS.kanit)[0], F = (w, s) => `${w} ${s}px "${fam}","Prompt","Noto Sans Thai",sans-serif`;
  if (window.IdleFont) IdleFont.ensure({ font: (RANK_FONTS[o.font] || RANK_FONTS.kanit)[1] });
  try { await Promise.all([document.fonts.load(F(800, 60)), document.fonts.load(F(600, 40)), document.fonts.load(F(700, 40))]); await document.fonts.ready; } catch (e) { }
  const img = src => new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = no; i.src = src; });
  let bg = null; try { bg = await img(o.bgId && window.AdFiles ? await AdFiles.url(o.bgId) : 'rank-bg.jpg'); } catch (e) { try { bg = await img('rank-bg.jpg'); } catch (e2) { } }
  if (bg) { const s = Math.max(W / bg.width, H / bg.height); x.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s); } else { x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); }
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  const fit = (t, max, size, w) => { let s = size; x.font = F(w, s); while (x.measureText(t).width > max && s > 12) { s -= 1; x.font = F(w, s); } return s; };
  const GREEN = '#0E5A2B', LINE = '#1E8E3E', RED = '#D7262E', PILL = '#E4F5E7';
  // โลโก้
  try { const lg = await img(Brand.color()); const h = 190, w = Math.min(330, lg.width * h / lg.height); x.drawImage(lg, (W - w) / 2, 22, w, w * lg.height / lg.width); } catch (e) { }
  // หัวข้อ
  const N = list.length, unit = o.type === 'spent' ? 'บาท' : 'แต้ม';
  const title = (o.title || `{n} อันดับลูกค้า${o.type === 'spent' ? 'ยอดซื้อสูงสุด' : 'แต้มสูงสุด'}`).replace(/\{n\}/g, N && N < o.n ? N : o.n);
  const sub = o.sub || (o.type === 'spent' ? 'ขอบคุณที่อุดหนุนร้านเมย์เสมอมา' : 'สะสมแต้มทุกการช้อป');
  x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = GREEN;
  fit(title, 940, 84, 800); x.fillText(title, W / 2, 302);
  const ss = fit(sub, 600, 42, 600); x.fillStyle = '#1B6B3A'; x.fillText(sub, W / 2, 356);
  const sw = x.measureText(sub).width; x.strokeStyle = '#1B6B3A'; x.lineWidth = 4; x.lineCap = 'round';
  [[W / 2 - sw / 2 - 150, W / 2 - sw / 2 - 30], [W / 2 + sw / 2 + 30, W / 2 + sw / 2 + 150]].forEach(([a, b]) => { x.beginPath(); x.moveTo(a, 356 - ss * .33); x.lineTo(b, 356 - ss * .33); x.stroke(); });
  const val = c => num(o.type === 'spent' ? c.totalSpent : c.points);
  const valTxt = c => Math.round(val(c)).toLocaleString('en-US');
  // 3 อันดับแรก
  const MED = { 1: ['#FFE27A', '#E6A800', '#8A5A00'], 2: ['#F2F4F7', '#AEB6C0', '#4B5563'], 3: ['#F7C08C', '#D9783A', '#7A3A12'] };
  const pod = [[2, 45, 520, 288, 240, 200, 505, 50], [1, 343, 485, 334, 280, 512, 452, 60], [3, 688, 520, 290, 240, 828, 505, 50]];
  pod.forEach(([r, X, Y, w, h, mx, my, mr]) => {
    const c = list[r - 1]; if (!c) return;
    // ริบบิ้น
    x.fillStyle = '#E53935';
    [[-1], [1]].forEach(([s]) => { x.beginPath(); x.moveTo(mx + s * mr * .15, my + mr * .4); x.lineTo(mx + s * mr * .95, my + mr * 1.65); x.lineTo(mx + s * mr * .62, my + mr * 1.45); x.lineTo(mx + s * mr * .5, my + mr * 1.85); x.lineTo(mx + s * mr * -.2, my + mr * .6); x.closePath(); x.fill(); });
    // การ์ด
    x.save(); x.shadowColor = 'rgba(0,0,0,.12)'; x.shadowBlur = 18; x.shadowOffsetY = 6; rr(X, Y, w, h, 30); x.fillStyle = '#fff'; x.fill(); x.restore();
    rr(X, Y, w, h, 30); x.lineWidth = 7; x.strokeStyle = LINE; x.stroke();
    // เหรียญ
    const g = x.createRadialGradient(mx - mr * .35, my - mr * .4, mr * .1, mx, my, mr); g.addColorStop(0, MED[r][0]); g.addColorStop(1, MED[r][1]);
    x.beginPath(); x.arc(mx, my, mr, 0, 7); x.fillStyle = g; x.fill(); x.lineWidth = mr * .1; x.strokeStyle = MED[r][2] + '88'; x.stroke();
    x.beginPath(); x.arc(mx, my, mr * .78, 0, 7); x.lineWidth = mr * .05; x.strokeStyle = '#ffffffaa'; x.stroke();
    if (r === 1) { x.fillStyle = '#D99A00'; x.beginPath(); const cy = my - mr * .55, cw = mr * .55; x.moveTo(mx - cw, cy); x.lineTo(mx - cw * .55, cy - cw * .55); x.lineTo(mx - cw * .3, cy - cw * .1); x.lineTo(mx, cy - cw * .75); x.lineTo(mx + cw * .3, cy - cw * .1); x.lineTo(mx + cw * .55, cy - cw * .55); x.lineTo(mx + cw, cy); x.closePath(); x.fill(); }
    x.fillStyle = MED[r][2]; x.font = F(800, mr * 1.15); x.textAlign = 'center'; x.fillText(String(r), mx, my + mr * (r === 1 ? .52 : .4));
    // ชื่อ + ค่า
    x.fillStyle = '#111'; fit(rankName(c, o), w - 36, r === 1 ? 62 : 52, 700); x.fillText(rankName(c, o), X + w / 2, Y + (r === 1 ? 142 : 120));
    const py = Y + h - (r === 1 ? 104 : 92), ph = r === 1 ? 80 : 70; rr(X + 18, py, w - 36, ph, ph / 2); x.fillStyle = PILL; x.fill();
    const vt = valTxt(c), vs = fit(vt, w - 130, r === 1 ? 62 : 54, 800), vw = x.measureText(vt).width; x.font = F(700, vs * .6); const uw = x.measureText(' ' + unit).width;
    const sx = X + w / 2 - (vw + uw) / 2; x.textAlign = 'left'; x.fillStyle = RED; x.font = F(800, vs); x.fillText(vt, sx, py + ph / 2 + vs * .36); x.font = F(700, vs * .6); x.fillText(' ' + unit, sx + vw, py + ph / 2 + vs * .36);
  });
  // อันดับ 4 เป็นต้นไป (เรียงลงตามคอลัมน์)
  const rest = list.slice(3), cols = rest.length > 14 ? 3 : 2, rows = Math.ceil(rest.length / cols);
  if (rest.length) {
    const top = 800, bottom = 1258, gap = 18, cw = (984 - gap * (cols - 1)) / cols, step = Math.min(76, (bottom - top) / rows), h = step * .84;
    // ขนาดตัวอักษร: ให้ยอด/แต้มที่ยาวที่สุดพอดี และเหลือที่ให้ชื่ออย่างน้อย 40% ของช่อง
    let fs = Math.min(38, h * .56); const bw0 = Math.min(82, cw * .2);
    const need = f => { x.font = F(800, f); const vw = Math.max(...rest.map(c => x.measureText(valTxt(c)).width)); x.font = F(700, f * .62); return 8 + bw0 + h * .22 + 14 + 10 + vw + x.measureText(' ' + unit).width + 16; };
    while (fs > 14 && cw - need(fs) < cw * .4) fs -= 1;
    rest.forEach((c, i) => {
      const col = Math.floor(i / rows), row = i % rows, X = 20 + col * (cw + gap), Y = top + row * step, rank = i + 4;
      rr(X, Y, cw, h, h * .32); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 3; x.strokeStyle = LINE; x.stroke();
      const bw = Math.min(82, cw * .2); x.beginPath(); x.moveTo(X + 8 + h * .25, Y + 6); x.lineTo(X + 8 + bw, Y + 6); x.lineTo(X + 8 + bw + h * .22, Y + h / 2); x.lineTo(X + 8 + bw, Y + h - 6); x.lineTo(X + 8 + h * .25, Y + h - 6); x.arcTo(X + 8, Y + h - 6, X + 8, Y + h / 2, h * .25); x.arcTo(X + 8, Y + 6, X + 8 + h * .25, Y + 6, h * .25); x.closePath(); x.fillStyle = '#DDF2E1'; x.fill();
      x.fillStyle = GREEN; x.textAlign = 'center'; x.font = F(800, fs); x.fillText(String(rank), X + 8 + bw / 2 + 4, Y + h / 2 + fs * .36);
      const vt = valTxt(c); x.font = F(800, fs); const vw = x.measureText(vt).width; x.font = F(700, fs * .62); const uw = x.measureText(' ' + unit).width;
      const vx = X + cw - 16 - uw - vw; x.textAlign = 'left'; x.fillStyle = RED; x.font = F(800, fs); x.fillText(vt, vx, Y + h / 2 + fs * .36); x.font = F(700, fs * .62); x.fillText(' ' + unit, vx + vw, Y + h / 2 + fs * .36);
      x.fillStyle = '#111'; const nx = X + 8 + bw + h * .22 + 14, nmax = vx - nx - 10; fit(rankName(c, o), nmax, fs, 600); x.fillText(rankName(c, o), nx, Y + h / 2 + fs * .36);
    });
  }
  if (!N) { x.fillStyle = '#888'; x.textAlign = 'center'; x.font = F(600, 40); x.fillText('ยังไม่มีข้อมูลลูกค้า', W / 2, 700); }
  // ท้ายภาพ
  const foot = (o.foot || 'ข้อมูล ณ วันที่ {date}').replace(/\{date\}/g, thDate(todayISO()));
  x.textAlign = 'right'; x.fillStyle = '#333'; fit(foot, 215, 22, 600); x.fillText(foot, 1006, 1474);
}
VIEWS.rank = async (el, type) => {
  if (!can('customers')) return ownerOnly(el);
  const own = isOwner(); const o = rankCfg(); if (type === 'spent' || type === 'points') o.type = type;
  el.innerHTML = vhead('อันดับลูกค้า (ภาพ)', '', 'customers') + `<div class="rkw"><div class="rkpv"><canvas id="rkc"></canvas><div class="center small muted" id="rkst" style="margin-top:6px"></div></div>
    <div class="card rkset"><div class="seg" id="rkt" style="margin-bottom:10px"><button data-t="points">⭐ แต้มสูงสุด</button><button data-t="spent">💰 ยอดซื้อสูงสุด</button></div>
      <div class="grid2"><label class="f"><span>จำนวนอันดับ</span><select class="in" id="rkn">${[3, 5, 10, 15, 20, 25, 30].map(n => `<option value="${n}">${n} อันดับ</option>`).join('')}</select></label>
      <label class="f"><span>ฟอนต์</span><select class="in" id="rkf"><option value="kanit">Kanit</option><option value="prompt">Prompt</option><option value="mitr">Mitr</option></select></label></div>
      <label class="f"><span>หัวข้อ ({n} = จำนวนอันดับ · เว้นว่าง = อัตโนมัติ)</span><input class="in" id="rkh" placeholder="{n} อันดับลูกค้าแต้มสูงสุด"></label>
      <label class="f"><span>ข้อความรอง</span><input class="in" id="rks" placeholder="สะสมแต้มทุกการช้อป"></label>
      <label class="f"><span>ข้อความท้ายภาพ ({date} = วันที่วันนี้)</span><input class="in" id="rkft" placeholder="ข้อมูล ณ วันที่ {date}"></label>
      <label class="row small" style="gap:8px;margin:4px 0"><input type="checkbox" id="rkp"> เติม “คุณ” หน้าชื่อ</label>
      <label class="row small" style="gap:8px;margin:4px 0 10px"><input type="checkbox" id="rk1"> แสดงเฉพาะชื่อต้น (ไม่แสดงนามสกุล)</label>
      <div class="small" style="font-weight:600;margin-bottom:6px">ภาพพื้นหลัง</div>
      <div class="row wrap" style="gap:8px"><label class="btn ghost sm">🖼 เปลี่ยนภาพพื้นหลัง<input type="file" id="rkbg" accept="image/*" hidden></label><button class="btn ghost sm" id="rkbd">ใช้พื้นหลังเริ่มต้น</button></div>
      <div class="tiny muted" style="margin:4px 0 12px">แนะนำภาพแนวตั้ง 1024×1536 (2:3) ส่วนบนและล่างมีลวดลาย ตรงกลางเว้นว่าง</div>
      <div class="grid2"><button class="btn green" id="rkdl">⬇ ดาวน์โหลด JPG</button><button class="btn" id="rksh" style="background:#1877F2">📤 แชร์ (Facebook/LINE)</button><button class="btn ghost" id="rkfs">⛶ เต็มจอ (แคปหน้าจอ)</button><button class="btn ghost" id="rkpng">⬇ PNG</button><button class="btn ghost" id="rkpr">🖨 พิมพ์</button><button class="btn ghost" id="rksv">${own ? '💾 บันทึกการตั้งค่า' : '💾 จำการตั้งค่าในเครื่องนี้'}</button></div>
      <div class="tiny muted" style="margin-top:8px">โพสต์ Facebook: กด “ดาวน์โหลด JPG” หรือ “แชร์” (มือถือเลือกแอป Facebook ได้เลย) · หรือกด “เต็มจอ” แล้วแคปหน้าจอ (แตะ 1 ครั้งเพื่อปิด)</div></div></div>`;
  const cv = $('#rkc', el);
  const pick = () => { const all = (S.customers || []).filter(c => num(o.type === 'spent' ? c.totalSpent : c.points) > 0); all.sort((a, b) => num(o.type === 'spent' ? b.totalSpent : b.points) - num(o.type === 'spent' ? a.totalSpent : a.points)); return all.slice(0, o.n); };
  let tm = 0, busyDraw = false, again = false;
  const draw = async () => { if (busyDraw) { again = true; return; } busyDraw = true; const L = pick(); await rankDraw(cv, L, o); busyDraw = false; $('#rkst', el).textContent = `${L.length} คน${L.length < o.n ? ` (มีลูกค้าที่มี${o.type === 'spent' ? 'ยอดซื้อ' : 'แต้ม'}แค่ ${L.length} คน)` : ''}`; if (again) { again = false; draw(); } };
  const soon = () => { clearTimeout(tm); tm = setTimeout(draw, 250); };
  const sync = () => { $$('#rkt button', el).forEach(b => b.classList.toggle('on', b.dataset.t === o.type)); $('#rkh', el).placeholder = `{n} อันดับลูกค้า${o.type === 'spent' ? 'ยอดซื้อสูงสุด' : 'แต้มสูงสุด'}`; $('#rks', el).placeholder = o.type === 'spent' ? 'ขอบคุณที่อุดหนุนร้านเมย์เสมอมา' : 'สะสมแต้มทุกการช้อป'; };
  $('#rkn', el).value = String(o.n); $('#rkf', el).value = o.font; $('#rkh', el).value = o.title; $('#rks', el).value = o.sub; $('#rkft', el).value = o.foot; $('#rkp', el).checked = o.prefix; $('#rk1', el).checked = o.first; sync();
  $$('#rkt button', el).forEach(b => b.onclick = () => { o.type = b.dataset.t; sync(); draw(); });
  $('#rkn', el).onchange = e => { o.n = +e.target.value; draw(); };
  $('#rkf', el).onchange = e => { o.font = e.target.value; draw(); };
  [['rkh', 'title'], ['rks', 'sub'], ['rkft', 'foot']].forEach(([id, k]) => $('#' + id, el).oninput = e => { o[k] = e.target.value.trim(); soon(); });
  $('#rkp', el).onchange = e => { o.prefix = e.target.checked; draw(); };
  $('#rk1', el).onchange = e => { o.first = e.target.checked; draw(); };
  $('#rkbg', el).onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      busy(1, 'กำลังเตรียมภาพ...'); const im = await loadImg(URL.createObjectURL(f)), sc = Math.min(1, 1024 / im.width, 1536 / im.height), c2 = document.createElement('canvas');
      c2.width = Math.round(im.width * sc); c2.height = Math.round(im.height * sc); const g = c2.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c2.width, c2.height); g.drawImage(im, 0, 0, c2.width, c2.height);
      const du = c2.toDataURL('image/jpeg', .88);
      if (S.apiUrl) { const up = await api('upload', { kind: 'ad', name: f.name, mime: 'image/jpeg', base64: du }); await AdFiles.put(up.fileId, du); o.bgId = up.fileId; }
      else { o.bgId = ''; toast('โหมดทดลอง: ใช้ภาพนี้ชั่วคราว', 0); const u = URL.createObjectURL(await (await fetch(du)).blob()); window.AdFiles && (AdFiles.urls.__rk = u); o.bgId = '__rk'; }
      busy(0); draw(); toast('เปลี่ยนพื้นหลังแล้ว — กดบันทึกการตั้งค่าเพื่อใช้ครั้งต่อไป');
    } catch (er) { busy(0); toast(er.message, 1); }
  };
  $('#rkbd', el).onclick = () => { o.bgId = ''; draw(); };
  const fname = ext => `อันดับลูกค้า_${o.type === 'spent' ? 'ยอดซื้อ' : 'แต้ม'}_${todayISO()}.${ext}`;
  const jpg = () => new Promise(r => cv.toBlob(r, 'image/jpeg', .92));
  $('#rkdl', el).onclick = async () => { download(fname('jpg'), await jpg()); toast('ดาวน์โหลดภาพ JPG แล้ว — โพสต์ Facebook ได้เลย'); };
  $('#rkpng', el).onclick = () => cv.toBlob(b => download(fname('png'), b), 'image/png');
  $('#rksh', el).onclick = async () => {
    try {
      const f = new File([await jpg()], fname('jpg'), { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'อันดับลูกค้า ร้านเมย์ มินิมาร์ท' });
      else { download(fname('jpg'), f); toast('เครื่องนี้แชร์ตรงไม่ได้ — ดาวน์โหลดภาพให้แล้ว นำไปโพสต์ได้เลย', 0, 4000); }
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, 1); }
  };
  $('#rkpr', el).onclick = () => { const w = open('', '_blank'); if (!w) return toast('เบราว์เซอร์บล็อกหน้าต่างใหม่', 1); w.document.write(`<title>อันดับลูกค้า</title><style>@page{size:A4 portrait;margin:8mm}body{margin:0;text-align:center}img{max-width:100%;max-height:100vh}</style><img src="${cv.toDataURL('image/png')}" onload="setTimeout(()=>print(),200)">`); w.document.close(); };
  // เต็มจอสำหรับแคปหน้าจอ: พื้นสีขาว ไม่มีปุ่มบังภาพ · แตะ 1 ครั้งเพื่อปิด
  $('#rkfs', el).onclick = () => { const ov = document.createElement('div'); ov.className = 'rkfull'; ov.innerHTML = `<img src="${cv.toDataURL('image/jpeg', .95)}" alt="อันดับลูกค้า">`; ov.onclick = () => { ov.remove(); try { document.fullscreenElement && document.exitFullscreen(); } catch (e) { } }; document.body.appendChild(ov); try { ov.requestFullscreen && ov.requestFullscreen().catch(() => { }); } catch (e) { } toast('แคปหน้าจอได้เลย · แตะ 1 ครั้งเพื่อปิด', 0, 2200); };
  $('#rksv', el).onclick = async () => {
    const keep = { type: o.type, n: o.n, title: o.title, sub: o.sub, prefix: o.prefix, first: o.first, font: o.font, foot: o.foot, bgId: o.bgId === '__rk' ? '' : o.bgId };
    if (!own) { LS.set('rankCfgLocal', keep); return toast('จำการตั้งค่าในเครื่องนี้แล้ว'); }
    try { busy(1); LS.del('rankCfgLocal'); await saveSetting('rankCfg', keep); busy(0); toast('บันทึกแล้ว — ใช้ได้ทุกเครื่อง'); } catch (er) { busy(0); toast(er.message, 1); }
  };
  await loadCustomers(true).catch(() => { }); if (el.isConnected) draw();
};


/* ---------- รหัส PIN: เจ้าของกิจการดูได้ (ถอดจากสำเนาเข้ารหัสบนเซิร์ฟเวอร์) ---------- */
const PINV = { map: null, ap: '', apSet: false, until: 0, t: 0 };
const pinsShown = () => !!PINV.map && Date.now() < PINV.until;
async function revealPins() {
  if (!isOwner()) return false;
  const pin = await ownerPinDlg('ยืนยันรหัสเจ้าของกิจการ เพื่อดูรหัส PIN ของทุกคน');
  if (!pin) return false;
  try {
    busy(1); const r = await api('revealPins', { ownerPin: pin }); busy(0);
    PINV.map = {}; (r.users || []).forEach(u => PINV.map[u.id] = u.pin || ''); PINV.ap = r.approve || ''; PINV.apSet = !!r.approveSet; PINV.until = Date.now() + 60000;
    return true;
  } catch (e) { busy(0); toast(e.message, 1); return false; }
}
(function () { const st = document.createElement('style'); st.textContent = `.pinv{font-family:var(--fh);font-size:20px;letter-spacing:4px;background:#FFF7E6;color:#6B4000;border-radius:8px;padding:1px 8px;font-variant-numeric:tabular-nums}.pinh{color:var(--ink3);letter-spacing:3px;font-size:13px}`; document.head.appendChild(st); })();
