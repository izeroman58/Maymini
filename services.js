/* =========================================================
   บริการหน้าร้าน: โอนเงิน (ออก/เข้า) · เติมเงินมือถือ · ชำระบิล
   หลักบัญชี: ยอดเงินที่รับแทน/จ่ายแทน = ต้นทุน (pass) · ค่าบริการ = กำไร
   ========================================================= */
'use strict';
const SVC_DEF = {
  transferOut: [[1, 999, 20], [1000, 2999, 30], [3000, 4999, 40], [5000, 10000, 60]],
  transferIn: [[1, 1000, 10], [1001, 3000, 20], [3001, 4999, 40], [5000, 10000, 50]],
  topupFee: 5, topupMode: 'flat', topupStep: 100,
  billFee: 10, billTypes: ['ค่าไฟฟ้า', 'ค่าน้ำประปา', 'ค่าอินเทอร์เน็ต', 'ค่าโทรศัพท์', 'บัตรเครดิต/สินเชื่อ', 'อื่นๆ'],
  networks: ['AIS', 'True', 'dtac', 'NT', 'อื่นๆ']
};
const svcCfg = () => cfg('svcCfg', SVC_DEF);
function tierFee(tiers, amt) {
  for (const [a, b, f] of tiers) if (amt >= a && amt <= b) return f;
  return null; // เกินตาราง → ให้กำหนดเอง
}
const SVC = {
  out: { key: 'out', name: 'โอนออก', desc: 'ลูกค้าให้เงินสด → ร้านโอนเข้าบัญชีปลายทาง', icon: '⬆️', color: '#1E88E5' },
  in: { key: 'in', name: 'โอนเข้า', desc: 'ลูกค้าโอนเข้าบัญชีร้าน → ร้านจ่ายเงินสดให้ลูกค้า', icon: '⬇️', color: '#00897B' },
  topup: { key: 'topup', name: 'เติมเงินมือถือ', desc: 'AIS / True / dtac / NT', icon: '📱', color: '#8E24AA' },
  bill: { key: 'bill', name: 'ชำระบิล', desc: 'ค่าไฟ ค่าน้ำ ค่าเน็ต ฯลฯ', icon: '🧾', color: '#E07A00' }
};
function svcFee(kind, amt) {
  const c = svcCfg();
  if (kind === 'out') return tierFee(c.transferOut, amt);
  if (kind === 'in') return tierFee(c.transferIn, amt);
  if (kind === 'topup') return c.topupMode === 'per' ? Math.ceil(amt / Math.max(1, num(c.topupStep))) * num(c.topupFee) : num(c.topupFee);
  if (kind === 'bill') return num(c.billFee);
  return 0;
}
/* เมนูบริการ (เปิดจากปุ่มบนแถบหน้าขาย) */
function svcMenu() {
  const ov = sheet('บริการ', `<div class="grid2">${Object.values(SVC).map(s => `<button class="btn" data-k="${s.key}" style="background:${s.color};min-height:92px;flex-direction:column;gap:2px;font-size:18px"><span style="font-size:26px">${s.icon}</span>${s.name}<span class="tiny" style="font-weight:400;opacity:.9">${s.desc}</span></button>`).join('')}</div>`);
  $$('[data-k]', ov).forEach(b => b.onclick = () => { ov.remove(); svcDialog(b.dataset.k); });
}
function svcDialog(kind) {
  const s = SVC[kind], c = svcCfg();
  let amt = '', feeOverride = null, mode = 'add', extra = kind === 'topup' ? (c.networks[0] || '') : kind === 'bill' ? (c.billTypes[0] || '') : '';
  const ov = sheet(`${s.icon} ${s.name}`, `<div class="small muted" style="margin:-4px 0 8px">${s.desc}</div>
    ${kind === 'topup' ? `<div class="chips" id="ex">${c.networks.map(n => `<button class="chip" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div><input class="in" id="ph" inputmode="tel" placeholder="เบอร์มือถือ (ถ้าต้องการบันทึก)" style="margin-bottom:8px">` : ''}
    ${kind === 'bill' ? `<div class="chips" id="ex">${c.billTypes.map(n => `<button class="chip" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div><input class="in" id="ph" placeholder="เลขที่บิล/เลขผู้ใช้ไฟ (ถ้าต้องการบันทึก)" style="margin-bottom:8px">` : ''}
    ${kind === 'out' || kind === 'in' ? `<input class="in" id="ph" placeholder="${kind === 'out' ? 'ชื่อ/ธนาคาร/เลขบัญชีปลายทาง' : 'ชื่อผู้โอน'} (ถ้าต้องการบันทึก)" style="margin-bottom:8px">` : ''}
    <div class="small">${kind === 'bill' ? 'ยอดตามบิล' : kind === 'topup' ? 'ยอดเติมเงิน' : 'ยอดโอน'}</div>
    <div class="kpv" id="kv" style="margin-bottom:4px">0</div>
    <div class="kp">${[7, 8, 9, 4, 5, 6, 1, 2, 3].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="00">00</button><button data-k="0">0</button><button data-k="del">⌫</button></div>
    ${kind === 'topup' ? `<div class="row wrap" style="gap:6px;margin-top:8px">${[20, 50, 100, 200, 300, 500].map(v => `<button class="btn ghost sm" data-q="${v}">${v}</button>`).join('')}</div>` : ''}
    <div class="card" style="margin-top:10px;padding:10px 12px" id="sum"></div>`,
    `<button class="btn grow green" id="ok" style="min-height:56px;font-size:18px">เพิ่มลงบิล</button>`);
  const ex = $('#ex', ov); if (ex) { const f = () => $$('#ex .chip', ov).forEach(b => b.classList.toggle('on', b.dataset.v === extra)); $$('#ex .chip', ov).forEach(b => b.onclick = () => { extra = b.dataset.v; f(); }); f(); }
  const calc = () => {
    const a = num(amt), auto = a ? svcFee(kind, a) : 0, fee = feeOverride != null ? feeOverride : auto;
    const pay = mode === 'add' ? a + (fee || 0) : a;
    const cashOut = kind === 'in' ? (mode === 'add' ? a : a - (fee || 0)) : 0;
    return { a, fee, auto, pay, cashOut, over: a && auto == null };
  };
  const draw = () => {
    $('#kv', ov).textContent = amt ? money(num(amt), 0) : '0';
    const k = calc();
    $('#sum', ov).innerHTML = `<div class="kv"><span>ค่าบริการ ${k.over ? '<span class="tag amber">เกินตาราง กำหนดเอง</span>' : ''}</span><span><b>${k.fee != null ? money(k.fee, 0) : '-'}</b> <a href="javascript:void 0" id="ef" class="small">แก้</a></span></div>
      ${kind === 'in' || kind === 'out' ? `<div class="seg" id="md" style="margin:6px 0"><button data-m="add">บวกค่าบริการเพิ่ม</button><button data-m="deduct">หักจากยอด</button></div>` : ''}
      <div class="kv" style="font-size:18px"><span>${kind === 'in' ? 'ลูกค้าโอนเข้าร้าน' : 'ลูกค้าจ่าย'}</span><b class="num">${bahtL(k.pay)}</b></div>
      ${kind === 'in' ? `<div class="kv" style="font-size:18px;color:var(--red)"><span>ร้านจ่ายเงินสดให้ลูกค้า</span><b class="num">${bahtL(k.cashOut)}</b></div>` : ''}
      ${kind === 'out' ? `<div class="kv"><span>ร้านโอนเข้าบัญชีปลายทาง</span><b class="num">${bahtL(mode === 'add' ? k.a : k.a - (k.fee || 0))}</b></div>` : ''}`;
    const md = $('#md', ov); if (md) { $$('#md button', ov).forEach(b => { b.classList.toggle('on', b.dataset.m === mode); b.onclick = () => { mode = b.dataset.m; draw(); }; }); }
    $('#ef', ov).onclick = async () => { if (!(await gate('priceEdit'))) return; keypad('ค่าบริการ', k.fee || '', v => { feeOverride = v; draw(); }); };
  };
  $$('.kp [data-k]', ov).forEach(b => b.onclick = () => { const v = b.dataset.k; if (v === 'del') amt = amt.slice(0, -1); else if (amt.length < 7) amt = (amt === '0' ? '' : amt) + v; feeOverride = null; draw(); });
  $$('[data-q]', ov).forEach(b => b.onclick = () => { amt = b.dataset.q; feeOverride = null; draw(); });
  ov.addEventListener('keydown', e => { if (/^\d$/.test(e.key)) { amt += e.key; draw(); } else if (e.key === 'Backspace') { amt = amt.slice(0, -1); draw(); } else if (e.key === 'Enter') $('#ok', ov).click(); }); ov.tabIndex = 0; ov.focus();
  $('#ok', ov).onclick = () => {
    const k = calc(); if (!k.a) return toast('ใส่ยอดเงิน', 1); if (k.fee == null) return toast('ยอดเกินตารางค่าบริการ — แตะ “แก้” เพื่อกำหนดค่าบริการ', 1);
    const ref = ($('#ph', ov) || {}).value || '';
    const principal = kind === 'in' ? k.cashOut : (mode === 'add' ? k.a : k.a - k.fee);
    const label = kind === 'out' ? 'โอนออก (ฝากเข้าบัญชี)' : kind === 'in' ? 'โอนเข้า (จ่ายเงินสดให้ลูกค้า)' : kind === 'topup' ? `เติมเงิน ${extra}` : `ชำระ${extra}`;
    const T = POS.t;
    T.items.push({ sku: 'SVC-' + kind.toUpperCase(), name: `${label} ${money(principal, 0)}${ref ? ' · ' + ref : ''}`, price: principal, qty: 1, cost: principal, cat: 'บริการรับชำระ', pass: 1, svc: kind });
    if (k.fee) T.items.push({ sku: 'SVC-FEE', name: `ค่าบริการ${s.name}`, price: k.fee, qty: 1, cost: 0, cat: 'ค่าบริการ', svc: kind });
    if (kind === 'in') T.cashOut = num(T.cashOut) + k.cashOut;
    ov.remove(); POS.save(); beep();
    if (kind === 'in') toast(`อย่าลืม: ตรวจยอดโอนเข้า ${money(k.pay)} แล้วจ่ายเงินสด ${money(k.cashOut)} ให้ลูกค้า`);
  };
  draw();
}

/* ---------- ตั้งค่าค่าบริการ (เจ้าของ) ---------- */
VIEWS.svcset = el => {
  if (ownerOnly(el)) return;
  const c = svcCfg();
  const tierTbl = (id, tiers) => `<table class="t" id="${id}"><tr><th>ตั้งแต่ (บาท)</th><th>ถึง (บาท)</th><th>ค่าบริการ</th><th></th></tr>${tiers.map(t => `<tr><td><input class="in" type="number" value="${t[0]}"></td><td><input class="in" type="number" value="${t[1]}"></td><td><input class="in" type="number" value="${t[2]}"></td><td><button class="iconbtn" data-rm>${I(IC.x, 16)}</button></td></tr>`).join('')}</table><button class="btn ghost sm" data-add="${id}" style="margin-top:6px">+ เพิ่มช่วง</button>`;
  el.innerHTML = vhead('ค่าบริการหน้าร้าน', '', 'more') + `
   <div class="card"><h3>⬆️ โอนออก (ลูกค้าให้เงินสด ร้านโอนให้)</h3>${tierTbl('to', c.transferOut)}</div>
   <div class="card"><h3>⬇️ โอนเข้า (ลูกค้าโอนให้ร้าน รับเงินสด)</h3>${tierTbl('ti', c.transferIn)}</div>
   <div class="card"><h3>📱 เติมเงินมือถือ</h3><div class="grid3"><label class="f"><span>ค่าบริการ (บาท)</span><input class="in" type="number" id="tf" value="${c.topupFee}"></label><label class="f"><span>วิธีคิด</span><select class="in" id="tm"><option value="flat">ครั้งละเท่ากัน</option><option value="per">ทุกๆ ... บาท</option></select></label><label class="f"><span>ทุกๆ (บาท)</span><input class="in" type="number" id="ts" value="${c.topupStep}"></label></div><label class="f"><span>เครือข่าย (คั่นด้วย ,)</span><input class="in" id="nw" value="${esc(c.networks.join(', '))}"></label></div>
   <div class="card"><h3>🧾 ชำระบิล</h3><label class="f"><span>ค่าบริการต่อบิล (บาท)</span><input class="in" type="number" id="bf" value="${c.billFee}"></label><label class="f"><span>ประเภทบิล (คั่นด้วย ,)</span><input class="in" id="bt" value="${esc(c.billTypes.join(', '))}"></label></div>
   <div class="alert blue small">${I(IC.alert, 18)}<div>ในรายงาน: ยอดโอน/เติม/บิล นับเป็น <b>เงินรับแทน (ต้นทุน)</b> ค่าบริการนับเป็น <b>กำไร</b> · ยอดรับแทนไม่นับรวมรายรับเทียบเกณฑ์ VAT และรายงานเงินสดรับ-จ่าย (แยกไว้ในหมายเหตุ)</div></div>
   <button class="btn block green" id="sv">บันทึก</button>`;
  $('#tm', el).value = c.topupMode;
  const bind = () => { $$('[data-rm]', el).forEach(b => b.onclick = () => b.closest('tr').remove()); };
  $$('[data-add]', el).forEach(b => b.onclick = () => { $('#' + b.dataset.add, el).insertAdjacentHTML('beforeend', '<tr><td><input class="in" type="number"></td><td><input class="in" type="number"></td><td><input class="in" type="number"></td><td><button class="iconbtn" data-rm>✕</button></td></tr>'); bind(); });
  bind();
  const read = id => $$('#' + id + ' tr', el).slice(1).map(tr => $$('input', tr).map(i => num(i.value))).filter(t => t[1] > 0).sort((a, b) => a[0] - b[0]);
  $('#sv', el).onclick = async () => {
    const o = { transferOut: read('to'), transferIn: read('ti'), topupFee: num($('#tf', el).value), topupMode: $('#tm', el).value, topupStep: num($('#ts', el).value) || 100, billFee: num($('#bf', el).value), networks: $('#nw', el).value.split(',').map(x => x.trim()).filter(Boolean), billTypes: $('#bt', el).value.split(',').map(x => x.trim()).filter(Boolean) };
    try { busy(1); await saveSetting('svcCfg', o); busy(0); toast('บันทึกค่าบริการแล้ว'); } catch (e) { busy(0); toast(e.message, 1); }
  };
};
