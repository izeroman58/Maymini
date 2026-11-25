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
  networks: ['AIS', 'True', 'dtac', 'NT', 'อื่นๆ'],
  // ถ่ายเอกสาร / พิมพ์เอกสาร: ราคาต่อหน้า + ต้นทุนต่อหน้า (กระดาษ+หมึก ไว้คิดกำไร)
  copy: { copyBW: 1, copyColor: 5, printBW: 3, printColor: 10, costCopyBW: 0, costCopyColor: 0, costPrintBW: 0, costPrintColor: 0 },
  // ผ่อนสินค้า: ค่าเริ่มต้นตอนเปิดสัญญา
  inst: { rate: 0, rateMode: 'period', period: 'month', count: 6, downPct: 0 }
};
const svcCfg = () => { const c = cfg('svcCfg', SVC_DEF) || {}; return { ...SVC_DEF, ...c, copy: { ...SVC_DEF.copy, ...(c.copy || {}) }, inst: { ...SVC_DEF.inst, ...(c.inst || {}) } }; };
function tierFee(tiers, amt) {
  const T = (tiers || []).slice().sort((x, y) => x[0] - y[0]);
  for (let i = 0; i < T.length; i++) { const [a, b, f] = T[i], up = Math.min(i < T.length - 1 ? T[i + 1][0] : Infinity, b + 1); if (amt >= a && amt < up) return f; }
  return null; // นอกช่วงที่ตั้งไว้ → ให้กำหนดเอง
}
// ตรวจช่วงยอดที่ซ้อนกัน/เว้นช่วง เพื่อเตือนก่อนบันทึก
function tierIssues(tiers, name) {
  const T = tiers.slice().sort((x, y) => x[0] - y[0]), out = [];
  T.forEach((t, i) => { if (t[1] < t[0]) out.push(`${name}: ช่วง ${money(t[0], 0)}–${money(t[1], 0)} "ถึง" น้อยกว่า "ตั้งแต่"`); if (i) { const p = T[i - 1]; if (t[0] <= p[1]) out.push(`${name}: ช่วง ${money(p[0], 0)}–${money(p[1], 0)} ซ้อนกับ ${money(t[0], 0)}–${money(t[1], 0)}`); else if (t[0] > p[1] + 1) out.push(`${name}: ยอด ${money(p[1] + 1, 0)}–${money(t[0] - 1, 0)} ยังไม่มีค่าบริการ`); } });
  return out;
}
const SVC = {
  out: { key: 'out', name: 'โอนออก', desc: 'ลูกค้าให้เงินสด → ร้านโอนเข้าบัญชีปลายทาง', icon: '⬆️', color: '#1E88E5' },
  in: { key: 'in', name: 'โอนเข้า', desc: 'ลูกค้าโอนเข้าบัญชีร้าน → ร้านจ่ายเงินสดให้ลูกค้า', icon: '⬇️', color: '#00897B' },
  topup: { key: 'topup', name: 'เติมเงิน', desc: 'AIS / True / dtac / NT / TrueMoney', icon: '📱', color: '#8E24AA' },
  bill: { key: 'bill', name: 'ชำระบิล', desc: 'ค่าไฟ ค่าน้ำ ค่าเน็ต ฯลฯ', icon: '🧾', color: '#E07A00' },
  debt: { key: 'debt', name: 'ใช้หนี้', desc: 'รับชำระเงินเชื่อ / ค่างวด ตัดยอดอัตโนมัติ', icon: '💰', color: '#C62828' },
  copy: { key: 'copy', name: 'ถ่ายเอกสาร', desc: 'ขาวดำ / สี คิดตามจำนวนหน้า', icon: '📠', color: '#455A64' },
  print: { key: 'print', name: 'พิมพ์เอกสาร', desc: 'ขาวดำ / สี คิดตามจำนวนหน้า', icon: '🖨️', color: '#5D4037' },
  inst: { key: 'inst', name: 'ผ่อนสินค้า', desc: 'เปิดสัญญาผ่อน (สมาชิกเท่านั้น)', icon: '📆', color: '#2E7D32' }
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
  const ov = sheet('บริการ', `<div class="svmg">${Object.values(SVC).map(s => `<button class="btn" data-k="${s.key}" style="background:${s.color}"><span class="ic">${s.icon}</span><b>${s.name}</b><span class="ds">${s.desc}</span></button>`).join('')}</div>`, '', { cls: 'svmenu' });
  $$('[data-k]', ov).forEach(b => b.onclick = () => { ov.remove(); svcDialog(b.dataset.k); });
}
function svcDialog(kind) {
  if (kind === 'debt') return svcDebt();
  if (kind === 'copy' || kind === 'print') return svcCopy(kind);
  if (kind === 'inst') return svcInst();
  return kind === 'in' ? svcDialogIn(kind) : svcDialog2(kind);
}
function svcDialogIn(kind) {
  const s = SVC[kind], c = svcCfg();
  let amt = '', feeOverride = null, mode = 'add', extra = kind === 'topup' ? (c.networks[0] || '') : kind === 'bill' ? (c.billTypes[0] || '') : '';
  const ov = sheet(`${s.icon} ${s.name}`, `<div class="svl"><div class="small muted" style="margin:-4px 0 8px">${s.desc}</div>
    ${kind === 'topup' ? `<div class="chips" id="ex">${c.networks.map(n => `<button class="chip" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div><input class="in" id="ph" inputmode="tel" placeholder="เบอร์มือถือ (ถ้าต้องการบันทึก)" style="margin-bottom:8px">` : ''}
    ${kind === 'bill' ? `<div class="chips" id="ex">${c.billTypes.map(n => `<button class="chip" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div><input class="in" id="ph" placeholder="เลขที่บิล/เลขผู้ใช้ไฟ (ถ้าต้องการบันทึก)" style="margin-bottom:8px">` : ''}
    ${kind === 'out' || kind === 'in' ? `<input class="in" id="ph" placeholder="${kind === 'out' ? 'ชื่อ/ธนาคาร/เลขบัญชีปลายทาง' : 'ชื่อผู้โอน'} (ถ้าต้องการบันทึก)" style="margin-bottom:8px">` : ''}
    <div class="small">${kind === 'bill' ? 'ยอดตามบิล' : kind === 'topup' ? 'ยอดเติมเงิน' : 'ยอดโอน'}</div>
    <div class="kpv" id="kv" style="margin-bottom:4px">0</div>
    ${kind === 'topup' ? `<div class="row wrap" style="gap:6px;margin-top:8px">${[20, 50, 100, 200, 300, 500].map(v => `<button class="btn ghost sm" data-q="${v}">${v}</button>`).join('')}</div>` : ''}
    <div class="card" style="margin-top:10px;padding:10px 12px" id="sum"></div></div>
    <div class="svr"><div class="svh"><span>กำลังกรอก: <b>${kind === 'bill' ? 'ยอดตามบิล' : kind === 'topup' ? 'ยอดเติมเงิน' : 'ยอดโอน'}</b></span>${sndBtn()}</div><div class="kp">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="00">00</button><button data-k="0">0</button><button data-k="del">⌫</button></div></div>`,
    `<button class="btn grow green" id="ok" style="min-height:56px;font-size:18px">เพิ่มลงบิล</button>`, { cls: 'svs', sticky: true });
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
    $('#ok', ov).textContent = k.pay ? `เพิ่มลงบิล · ${kind === 'in' ? 'ลูกค้าโอน' : 'ลูกค้าจ่าย'} ฿${money(k.pay, 0)}` : 'เพิ่มลงบิล';
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

/* ---------- โอนออก / เติมเงิน / ชำระบิล (แบบใหม่) ----------
   - กรอกเลขบัญชี/เบอร์/เลขบิล ด้วยแป้นตัวเลขเดียวกันกับจอลูกค้า (1–0) หรือกด "ให้ลูกค้ากรอก" ให้ลูกค้ากดเองที่จอลูกค้า
   - โอนออก / เติม TrueMoney / ชำระบิล → หลังชำระเงิน ระบบส่งงานไปแจ้งเจ้าของร้าน (พนักงานทำเองไม่ได้)
   - เติมเงินมือถือ (AIS/True/dtac/NT) → พนักงานเติมได้เลย ไม่ต้องแจ้งเจ้าของ */
const svcLogo = code => (window.Img && Img.get('LOGO-' + code)) || '';
const withLogos = list => list.map(x => ({ ...x, logo: svcLogo(x.code) }));
const JOB_NEEDS_OWNER = (kind, f) => kind === 'out' || kind === 'bill' || (kind === 'topup' && f.carrier === 'TMN');
function svcDialog2(kind) {
  const s = SVC[kind], c = svcCfg();
  const f = { bank: '', acc: '', accName: '', carrier: '', phone: '', billType: c.billTypes[0] || '', billRef: '', contact: '', amt: '', fileUrl: '', photo: '' };
  let active = kind === 'out' ? 'acc' : kind === 'topup' ? 'phone' : 'billRef', feeOverride = null, mode = 'add', asking = false;
  const FIELD = { acc: { label: 'เลขบัญชีปลายทาง / พร้อมเพย์', kind: 'account', max: 15 }, phone: { label: 'เบอร์มือถือ (10 หลัก)', kind: 'phone', max: 10 }, billRef: { label: 'เลขที่ผู้ใช้ / เลขบิล (CA)', kind: 'digits', max: 20 }, amt: { label: kind === 'bill' ? 'ยอดตามบิล' : kind === 'topup' ? 'ยอดเติมเงิน' : 'ยอดโอน', kind: 'amt', max: 7 } };
  const fieldBox = k => `<button type="button" class="sfield${active === k ? ' on' : ''}" data-f="${k}"><span>${FIELD[k].label}</span><b>${f[k] ? (k === 'amt' ? money(num(f[k]), 0) : esc(fmtNum(f[k], FIELD[k].kind))) : '<i>แตะแล้วกดตัวเลข</i>'}</b></button>`;
  const picks = kind === 'out' ? withLogos(BANKS) : kind === 'topup' ? withLogos(CARRIERS) : null, pickKey = kind === 'out' ? 'bank' : 'carrier';
  const ov = sheet(`${s.icon} ${s.name}`, `<style>.sfield{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:2px;width:100%;padding:8px 12px;border-radius:12px;background:#fff;box-shadow:inset 0 0 0 1.5px var(--line);cursor:pointer;margin-bottom:8px}.sfield span{font-size:13px;color:var(--ink2)}.sfield b{font-size:24px;font-weight:800;letter-spacing:.5px;font-variant-numeric:tabular-nums;min-height:30px}.sfield b i{font-size:15px;font-weight:400;color:var(--ink3);font-style:normal}.sfield.on{box-shadow:inset 0 0 0 3px var(--red);background:#fff7f8}.spk{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px;margin-bottom:10px}.spk button{all:unset;cursor:pointer}.sask{width:100%;margin-bottom:10px}</style>
    <div id="body" class="svl"></div><div class="svr"><div class="svh"><span>กำลังกรอก: <b id="svf"></b></span>${sndBtn()}</div>${padHTML('npad')}</div>`,
    `<button class="btn grow green" id="ok" style="min-height:56px;font-size:18px">เพิ่มลงบิล</button>`, { cls: 'svs', sticky: true, onClose: () => { if (asking) Display.cancelAsk(); Display.preview(null); } });
  $$('.svr [data-pk]', ov).forEach(b => b.onclick = () => key(b.dataset.pk));
  const calc = () => { const a = num(f.amt), auto = a ? svcFee(kind, a) : 0, fee = feeOverride != null ? feeOverride : auto; return { a, fee, auto, pay: kind === 'out' && mode === 'deduct' ? a : a + (fee || 0), over: a && auto == null }; };
  const askCustomer = async () => {
    if (asking) { Display.cancelAsk(); return; }
    asking = true; draw();
    const spec = kind === 'out' ? { title: 'กรุณากรอกเลขบัญชีปลายทาง', sub: 'แล้วแตะเลือกธนาคาร (พร้อมเพย์: เบอร์ 10 หลัก / เลขบัตร 13 หลัก)', field: 'account', min: 10, max: 15, pick: 'bank', picks, value: f.acc, pickValue: f.bank }
      : kind === 'topup' ? { title: 'กรุณากรอกเบอร์มือถือที่จะเติมเงิน', sub: 'แล้วแตะเลือกเครือข่าย', field: 'phone', pick: 'carrier', picks, value: f.phone, pickValue: f.carrier }
      : { title: 'กรุณากรอกเลขที่ผู้ใช้ / เลขบิล', sub: f.billType ? 'บิล' + f.billType.replace(/^ค่า/, 'ค่า') : '', field: 'digits', min: 4, max: 20, value: f.billRef };
    const key = kind === 'out' ? 'acc' : kind === 'topup' ? 'phone' : 'billRef';
    const r = await Display.ask(spec, p => { f[key] = p.value; if (picks && p.pick) f[pickKey] = p.pick; draw(); });
    asking = false;
    if (r) { f[key] = r.value; if (picks && r.pick) f[pickKey] = r.pick; active = 'amt'; beep(); toast('ลูกค้ากรอกแล้ว — ตรวจตัวเลขกับลูกค้าอีกครั้ง'); }
    if (ov.isConnected) draw();
  };
  // จอลูกค้าแสดงข้อมูลที่พนักงานกรอกให้ลูกค้าตรวจสอบ (ระหว่างไม่ได้ให้ลูกค้ากรอกเอง)
  const pvPush = () => {
    const k = calc();
    const bank = BANKS.find(x => x.code === f.bank), car = CARRIERS.find(x => x.code === f.carrier), M = v => '฿' + money(v, 0);
    Display.preview({ title: kind === 'out' ? 'โอนเงินเข้าบัญชีปลายทาง' : kind === 'topup' ? 'เติมเงิน' + (car ? ' ' + car.name : '') : 'ชำระ' + (f.billType || 'บิล'),
      tile: kind === 'out' ? (bank ? { ...bank, logo: svcLogo(bank.code) } : null) : kind === 'topup' ? (car ? { ...car, logo: svcLogo(car.code) } : null) : null,
      rows: kind === 'out' ? [['ธนาคาร', bank ? bank.name : 'ยังไม่ได้เลือก'], ['เลขบัญชี / พร้อมเพย์', f.acc ? fmtNum(f.acc, 'account') : '-', 1], ['ชื่อบัญชี', f.accName.trim()]]
        : kind === 'topup' ? [['เครือข่าย', car ? car.name : 'ยังไม่ได้เลือก'], ['เบอร์มือถือ', f.phone ? fmtNum(f.phone, 'phone') : '-', 1]]
        : [['ประเภทบิล', f.billType], ['เลขที่ผู้ใช้ / เลขบิล', f.billRef || '-', 1]],
      sum: [[kind === 'out' ? 'ยอดโอน' : kind === 'topup' ? 'ยอดเติมเงิน' : 'ยอดตามบิล', M(kind === 'out' && mode === 'deduct' ? k.a - (k.fee || 0) : k.a)], ['ค่าบริการ', k.fee != null ? M(k.fee) : '-'], ['รวมที่ต้องชำระ', M(k.pay), 1]] });
  };
  const draw = () => {
    const k = calc(), needOwner = JOB_NEEDS_OWNER(kind, f);
    $('#body', ov).innerHTML = `
      ${custInputOn() ? `<button class="btn ghost sask" id="ask" ${asking ? 'style="background:var(--amber-l);color:#6B4000"' : ''}>${asking ? '⏳ รอลูกค้ากรอกที่จอลูกค้า… (แตะเพื่อยกเลิก)' : '📱 ให้ลูกค้ากรอกที่จอลูกค้า'}</button>` : '<div class="tiny muted" style="margin-bottom:8px">🖥 จอลูกค้าแสดงข้อมูลที่กรอก ให้ลูกค้าตรวจสอบ</div>'}
      ${picks ? `<div class="small" style="font-weight:600;margin-bottom:4px">${kind === 'out' ? 'ธนาคารปลายทาง' : 'เครือข่าย'}</div><div class="spk">${picks.map(x => `<button data-pv="${x.code}">${pickTile(x, f[pickKey] === x.code)}</button>`).join('')}</div>` : ''}
      ${kind === 'bill' ? `<div class="chips" style="margin-bottom:8px">${c.billTypes.map(n => `<button class="chip${f.billType === n ? ' on' : ''}" data-bt="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
      ${fieldBox(kind === 'out' ? 'acc' : kind === 'topup' ? 'phone' : 'billRef')}
      ${kind === 'out' ? `<input class="in" id="an" placeholder="ชื่อบัญชีปลายทาง (ถ้ามี)" value="${esc(f.accName)}" style="margin-bottom:8px">` : ''}
      ${kind === 'bill' ? `<div class="row" style="gap:8px;margin-bottom:8px"><input class="in grow" id="ct" placeholder="ชื่อ/เบอร์ติดต่อลูกค้า (ถ้ามี)" value="${esc(f.contact)}"><label class="btn ghost sm" style="flex:none">${f.photo ? '✓ รูปบิล' : '📷 ถ่ายรูปบิล'}<input type="file" accept="image/*" capture="environment" id="bp" hidden></label></div>` : ''}
      ${kind === 'topup' ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">${[10, 20, 30, 50, 100, 150, 200, 300, 500].map(v => `<button class="btn ${num(f.amt) === v ? '' : 'ghost'}" data-q="${v}" style="min-height:58px;font-size:22px;font-weight:700;width:100%">${v}</button>`).join('')}</div>` : ''}
      ${fieldBox('amt')}
      <div class="card" style="margin-top:10px;padding:10px 12px">
        <div class="kv"><span>ค่าบริการ ${k.over ? '<span class="tag amber">เกินตาราง กำหนดเอง</span>' : ''}</span><span><b>${k.fee != null ? money(k.fee, 0) : '-'}</b> <a href="javascript:void 0" id="ef" class="small">แก้</a></span></div>
        ${kind === 'out' ? `<div class="seg" id="md" style="margin:6px 0"><button data-m="add">บวกค่าบริการเพิ่ม</button><button data-m="deduct">หักจากยอด</button></div>` : ''}
        <div class="kv" style="font-size:18px"><span>ลูกค้าจ่าย</span><b class="num">${bahtL(k.pay)}</b></div>
        ${kind === 'out' ? `<div class="kv"><span>ยอดที่ต้องโอนเข้าบัญชีปลายทาง</span><b class="num">${bahtL(mode === 'add' ? k.a : k.a - (k.fee || 0))}</b></div>` : ''}
        <div class="tiny" style="margin-top:6px;color:${needOwner ? 'var(--red)' : 'var(--green)'}">${needOwner ? '🔔 หลังรับเงิน ระบบส่งแจ้งเตือนให้เจ้าของร้าน' + (kind === 'out' ? 'โอนเงิน' : kind === 'bill' ? 'ชำระบิล' : 'เติมเงิน TrueMoney') + 'ให้ลูกค้า' : kind === 'topup' ? '✓ พนักงานเติมเงินให้ลูกค้าได้เลย' : ''}</div></div>`;
    if ($('#ask', ov)) $('#ask', ov).onclick = askCustomer;
    pvPush();
    $$('[data-pv]', ov).forEach(b => b.onclick = () => { f[pickKey] = b.dataset.pv; draw(); });
    $$('[data-bt]', ov).forEach(b => b.onclick = () => { f.billType = b.dataset.bt; draw(); });
    $$('[data-f]', ov).forEach(b => b.onclick = () => { active = b.dataset.f; draw(); });
    $$('[data-q]', ov).forEach(b => b.onclick = () => { f.amt = b.dataset.q; feeOverride = null; active = 'amt'; draw(); });
    $('#svf', ov).textContent = FIELD[active].label.replace(/ \(.*\)$/, '');
    $('#ok', ov).textContent = k.pay ? `เพิ่มลงบิล · ลูกค้าจ่าย ฿${money(k.pay, 0)}` : 'เพิ่มลงบิล';
    if (draw.last !== active) { draw.last = active; const on = $('.sfield.on', ov); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' }); }
    const an = $('#an', ov); if (an) an.oninput = () => { f.accName = an.value; pvPush(); };
    const ct = $('#ct', ov); if (ct) ct.oninput = () => { f.contact = ct.value; pvPush(); };
    const bp = $('#bp', ov); if (bp) bp.onchange = async e => { const fl = e.target.files[0]; if (!fl) return; try { busy(1, 'กำลังย่อรูป...'); const im = await compressImage(fl, 1400, .72); f.photo = im.dataUrl; busy(0); toast('แนบรูปบิลแล้ว'); draw(); } catch (x) { busy(0); toast(x.message, 1); } };
    const md = $('#md', ov); if (md) $$('#md button', ov).forEach(b => { b.classList.toggle('on', b.dataset.m === mode); b.onclick = () => { mode = b.dataset.m; draw(); }; });
    $('#ef', ov).onclick = async () => { if (!(await gate('priceEdit'))) return; keypad('ค่าบริการ', k.fee || '', v => { feeOverride = v; draw(); }); };
  };
  const key = k => {
    const F = FIELD[active], v = String(f[active] || '');
    if (k === 'del') f[active] = v.slice(0, -1); else if (k === 'clr') f[active] = ''; else if (v.length < F.max) f[active] = (active === 'amt' && v === '0' ? '' : v) + k;
    if (active === 'amt') feeOverride = null;
    draw();
  };
  ov.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (/^\d$/.test(e.key)) key(e.key); else if (e.key === 'Backspace') key('del'); else if (e.key === 'Enter') $('#ok', ov).click(); }); ov.tabIndex = 0; ov.focus();
  $('#ok', ov).onclick = async () => {
    const k = calc();
    if (kind === 'out') { if (!f.bank) return toast('เลือกธนาคารปลายทาง', 1); if (f.acc.length < 10) return toast('เลขบัญชี/พร้อมเพย์ต้องมีอย่างน้อย 10 หลัก', 1); }
    if (kind === 'topup') { if (!f.carrier) return toast('เลือกเครือข่าย', 1); if (!/^0\d{9}$/.test(f.phone)) return toast('เบอร์มือถือต้องเป็น 10 หลัก ขึ้นต้นด้วย 0', 1); }
    if (kind === 'bill' && !f.billRef) return toast('ใส่เลขที่ผู้ใช้/เลขบิล', 1);
    if (!k.a) return toast('ใส่ยอดเงิน', 1); if (k.fee == null) return toast('ยอดเกินตารางค่าบริการ — แตะ “แก้” เพื่อกำหนดค่าบริการ', 1);
    if (asking) Display.cancelAsk();
    const principal = kind === 'out' && mode === 'deduct' ? k.a - k.fee : k.a;
    const bank = BANKS.find(x => x.code === f.bank), car = CARRIERS.find(x => x.code === f.carrier);
    // รูปบิล: อัปโหลดเก็บใน Google Drive (ต้องต่อเน็ต) — ถ้าไม่ได้ ส่งงานไปโดยไม่มีรูป
    // รูปบิล: เก็บไว้ในเครื่องก่อน ไม่ต้องรอเน็ต → ส่งขึ้น Google Drive เบื้องหลังตอนส่งบิล (Sync.flush)
    let photoKey = ''; if (f.photo) { photoKey = 'BP' + Date.now().toString(36); const bp = LS.get('billPhotos', {}); bp[photoKey] = { b64: f.photo, name: `bill_${f.billRef}_${todayISO()}.jpg` }; if (!LS.set('billPhotos', bp)) photoKey = ''; }
    const job = kind === 'out' ? { type: 'transfer', bank: f.bank, bankName: bank ? bank.name : '', acc: f.acc, accName: f.accName.trim(), amount: principal }
      : kind === 'topup' ? { type: f.carrier === 'TMN' ? 'wallet' : 'topup', carrier: f.carrier, carrierName: car ? car.name : '', phone: f.phone, amount: principal }
      : { type: 'bill', billType: f.billType, ref: f.billRef, contact: f.contact.trim(), amount: principal, fileUrl: '', ...(photoKey ? { photoKey } : {}) };
    job.notify = JOB_NEEDS_OWNER(kind, f) ? 1 : 0; job.fee = k.fee || 0;
    const label = kind === 'out' ? `โอนออก ${bank ? bank.name : ''} ${fmtNum(f.acc, 'account')}` : kind === 'topup' ? `เติมเงิน ${car ? car.name : ''} ${fmtNum(f.phone, 'phone')}` : `ชำระ${f.billType} ${f.billRef}`;
    const T = POS.t;
    T.items.push({ sku: 'SVC-' + kind.toUpperCase(), name: `${label} ${money(principal, 0)}`, price: principal, qty: 1, cost: principal, cat: 'บริการรับชำระ', pass: 1, svc: kind, job });
    if (k.fee) T.items.push({ sku: 'SVC-FEE', name: `ค่าบริการ${s.name}`, price: k.fee, qty: 1, cost: 0, cat: 'ค่าบริการ', svc: kind });
    ov.remove(); Display.preview(null); POS.save(); beep();
    if (job.notify) toast('เพิ่มลงบิลแล้ว — หลังรับเงิน ระบบจะแจ้งเจ้าของร้านให้ดำเนินการ');
  };
  draw();
}
window.svcDialog2 = svcDialog2;

/* ---------- ตั้งค่าค่าบริการ (เจ้าของ) ---------- */
VIEWS.svcset = el => {
  if (ownerOnly(el)) return;
  const c = svcCfg();
  const tierTbl = (id, tiers) => `<table class="t" id="${id}"><tr><th>ตั้งแต่ (บาท)</th><th>ถึง (บาท)</th><th>ค่าบริการ</th><th></th></tr>${tiers.map(t => `<tr><td><input class="in" type="number" value="${t[0]}"></td><td><input class="in" type="number" value="${t[1]}"></td><td><input class="in" type="number" value="${t[2]}"></td><td><button class="iconbtn" data-rm>${I(IC.x, 16)}</button></td></tr>`).join('')}</table><button class="btn ghost sm" data-add="${id}" style="margin-top:6px">+ เพิ่มช่วง</button>`;
  el.innerHTML = vhead('ค่าบริการ · ถ่ายเอกสาร · ผ่อน', '', 'more') + `
   <div class="card"><h3>⬆️ โอนออก (ลูกค้าให้เงินสด ร้านโอนให้)</h3>${tierTbl('to', c.transferOut)}</div>
   <div class="card"><h3>⬇️ โอนเข้า (ลูกค้าโอนให้ร้าน รับเงินสด)</h3>${tierTbl('ti', c.transferIn)}</div>
   <div class="card"><h3>📱 เติมเงินมือถือ</h3><div class="grid3"><label class="f"><span>ค่าบริการ (บาท)</span><input class="in" type="number" id="tf" value="${c.topupFee}"></label><label class="f"><span>วิธีคิด</span><select class="in" id="tm"><option value="flat">ครั้งละเท่ากัน</option><option value="per">ทุกๆ ... บาท</option></select></label><label class="f"><span>ทุกๆ (บาท)</span><input class="in" type="number" id="ts" value="${c.topupStep}"></label></div><label class="f"><span>เครือข่าย (คั่นด้วย ,)</span><input class="in" id="nw" value="${esc(c.networks.join(', '))}"></label></div>
   <div class="card"><h3>🧾 ชำระบิล</h3><label class="f"><span>ค่าบริการต่อบิล (บาท)</span><input class="in" type="number" id="bf" value="${c.billFee}"></label><label class="f"><span>ประเภทบิล (คั่นด้วย ,)</span><input class="in" id="bt" value="${esc(c.billTypes.join(', '))}"></label></div>
   <div class="card"><h3>📠 ถ่ายเอกสาร / 🖨️ พิมพ์เอกสาร (บาท ต่อหน้า)</h3><table class="t" id="cpt"><tr><th></th><th class="right">ราคาขาย</th><th class="right">ต้นทุน (กระดาษ+หมึก)</th></tr>${[['copyBW', 'ถ่ายเอกสาร ขาวดำ'], ['copyColor', 'ถ่ายเอกสาร สี'], ['printBW', 'พิมพ์เอกสาร ขาวดำ'], ['printColor', 'พิมพ์เอกสาร สี']].map(([k, n]) => `<tr><td>${n}</td><td><input class="in right" type="number" step="any" data-cp="${k}" value="${c.copy[k]}"></td><td><input class="in right" type="number" step="any" data-cp="cost${k[0].toUpperCase() + k.slice(1)}" value="${c.copy['cost' + k[0].toUpperCase() + k.slice(1)]}"></td></tr>`).join('')}</table><div class="tiny muted" style="margin-top:6px">ต้นทุนไม่บังคับ — ใส่ไว้เพื่อให้รายงานคิดกำไรได้ถูก</div></div>
   <div class="card"><h3>📆 ผ่อนสินค้า (ค่าเริ่มต้นตอนเปิดสัญญา แก้ได้ทุกครั้ง)</h3><div class="grid3"><label class="f"><span>ดอกเบี้ย %</span><input class="in" type="number" step="any" id="ir" value="${c.inst.rate}"></label><label class="f"><span>คิดดอกเบี้ย</span><select class="in" id="im"><option value="period">% ต่องวด</option><option value="total">% ทั้งสัญญา</option></select></label><label class="f"><span>ระยะงวด</span><select class="in" id="ip"><option value="month">รายเดือน</option><option value="week">รายสัปดาห์</option><option value="day">รายวัน</option></select></label><label class="f"><span>จำนวนงวด</span><input class="in" type="number" id="ic" value="${c.inst.count}"></label><label class="f"><span>เงินดาวน์ขั้นต่ำ %</span><input class="in" type="number" step="any" id="id" value="${c.inst.downPct}"></label></div><div class="tiny muted">ดอกเบี้ยแบบคงที่ (flat) คิดจากยอดจัดผ่อน = ราคา − เงินดาวน์ · ค่างวด ดาวน์ และดอกเบี้ย นับเป็นรายได้ร้าน</div></div>
   <div class="alert blue small">${I(IC.alert, 18)}<div>ในรายงาน: ยอดโอน/เติม/บิล นับเป็น <b>เงินรับแทน (ต้นทุน)</b> ค่าบริการนับเป็น <b>กำไร</b> · ยอดรับแทนไม่นับรวมรายรับเทียบเกณฑ์ VAT และรายงานเงินสดรับ-จ่าย (แยกไว้ในหมายเหตุ)</div></div>
   <button class="btn block green" id="sv">บันทึก</button>
   <div class="card" style="margin-top:12px"><h3>🔔 แจ้งเตือนเจ้าของร้าน</h3><div class="small muted" style="margin:-4px 0 8px">เมื่อพนักงานรับเงินโอนออก / เติม TrueMoney / ชำระบิล ระบบส่งรายละเอียด (ธนาคาร เลขบัญชี ยอด) ให้เจ้าของร้านทันที และขึ้นในเมนู “งานรอดำเนินการ”</div>
    <label class="f"><span>อีเมลรับแจ้งเตือน (เว้นว่าง = อีเมล Google ที่ติดตั้ง Apps Script)</span><input class="in" id="ne" type="email" placeholder="เช่น may.minimart@gmail.com"></label>
    <label class="row small" style="margin-bottom:8px"><input type="checkbox" id="noff"> ปิดการส่งอีเมล (ดูในแอปอย่างเดียว)</label>
    <details><summary class="small" style="cursor:pointer">ส่งเข้า Telegram ด้วย (ไม่บังคับ)</summary><div class="grid2" style="margin-top:6px"><label class="f"><span>Bot token</span><input class="in" id="ntk"></label><label class="f"><span>Chat ID</span><input class="in" id="nch"></label></div></details>
    <div class="row" style="gap:8px;margin-top:8px"><button class="btn green grow" id="nsv">บันทึกการแจ้งเตือน</button><button class="btn ghost" id="nts">ส่งทดสอบ</button></div>
    <div id="pushc" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)"></div></div>
   <div class="card" style="margin-top:12px"><h3>โลโก้ธนาคาร / เครือข่าย (ไม่บังคับ)</h3><div class="small muted" style="margin:-4px 0 8px">ปกติแสดงเป็นป้ายสี + ชื่อ · ถ้าต้องการรูปโลโก้ แตะป้ายแล้วเลือกรูปที่ร้านมีเอง (ย่อเหลือไม่กี่ KB แสดงทั้งเครื่องขายและจอลูกค้า)</div>
    <div id="lg" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px"></div></div>`;
  $('#tm', el).value = c.topupMode;
  $('#im', el).value = c.inst.rateMode; $('#ip', el).value = c.inst.period;
  const drawLogos = () => { const L = [...BANKS, ...CARRIERS.filter(x => !BANKS.some(b => b.code === x.code))].map(x => ({ ...x, logo: svcLogo(x.code) }));
    $('#lg', el).innerHTML = L.map(x => `<div style="display:flex;flex-direction:column;gap:4px"><label style="cursor:pointer">${pickTile(x)}<input type="file" accept="image/*" data-lu="${x.code}" hidden></label>${x.logo ? `<button class="btn ghost sm" data-lr="${x.code}" style="min-height:28px;padding:2px 6px;font-size:12px">ลบรูป</button>` : ''}</div>`).join('');
    $$('[data-lu]', el).forEach(i => i.onchange = async e => { const f = e.target.files[0]; if (!f) return; try { busy(1); await Img.save('LOGO-' + i.dataset.lu, await Img.shrink(f, 96, 'contain')); busy(0); drawLogos(); toast('บันทึกรูปแล้ว'); } catch (x) { busy(0); toast(x.message, 1); } });
    $$('[data-lr]', el).forEach(b => b.onclick = async () => { try { busy(1); await api('remove', { table: 'Images', ids: ['LOGO-' + b.dataset.lr] }); delete Img.map['LOGO-' + b.dataset.lr]; Img.persist(); busy(0); drawLogos(); } catch (x) { busy(0); toast(x.message, 1); } }); };
  Img.load().then(drawLogos);
  // แจ้งเตือนบนมือถือ/แท็บเล็ตเครื่องนี้ (แถบแจ้งเตือนเหมือนแอปทั่วไป)
  const pushc = $('#pushc', el);
  const drawPush = async () => {
    const st = await PushMe.state().catch(() => 'unsupported');
    const msg = { 'ios-home': '📱 iPhone/iPad: กดปุ่มแชร์ › <b>เพิ่มไปยังหน้าจอโฮม</b> แล้วเปิดแอปจากไอคอน MayMiniMart ก่อน จึงเปิดแจ้งเตือนได้', unsupported: 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน — ใช้ Chrome บนมือถือ Android หรือแอปที่เพิ่มไว้หน้าจอโฮม', denied: '⛔ การแจ้งเตือนถูกบล็อก — เปิดสิทธิ์ "การแจ้งเตือน" ของเว็บนี้ในตั้งค่าเบราว์เซอร์/แอป แล้วกลับมากดอีกครั้ง' }[st];
    pushc.innerHTML = `<b>📲 แจ้งเตือนบนมือถือเครื่องนี้</b><div class="small muted" style="margin:2px 0 8px">เด้งในแถบแจ้งเตือนมือถือทันทีที่มีงานโอน/เติม TrueMoney/ชำระบิล แม้ปิดแอปอยู่ · แตะแจ้งเตือนเพื่อเปิดงาน</div>
      ${msg ? `<div class="alert amber small">${msg}</div>` : st === 'on' ? `<div class="alert green small">✓ เครื่องนี้รับแจ้งเตือนแล้ว</div><div class="row" style="gap:8px;margin-top:6px"><button class="btn ghost grow" id="pt">ส่งแจ้งเตือนทดสอบ</button><button class="btn ghost" id="pd">ปิดบนเครื่องนี้</button></div>`
        : `<button class="btn block" id="pe">📲 เปิดแจ้งเตือนบนเครื่องนี้</button>`}
      <label class="row small" style="margin-top:10px"><input type="checkbox" id="stay" ${LS.get('stayIn', false) ? 'checked' : ''}> เครื่องนี้ไม่ต้องออกจากระบบอัตโนมัติ (มือถือส่วนตัวของเจ้าของร้าน — ไม่ควรติ๊กบนเครื่องหน้าร้าน)</label>
      <div id="pdl" class="small" style="margin-top:8px"></div>`;
    const pe = $('#pe', pushc); if (pe) pe.onclick = async () => { try { busy(1, 'กำลังเปิดแจ้งเตือน...'); await PushMe.enable(); if (!LS.get('stayIn', false) && /มือถือ|iPhone/.test(PushMe.devName())) LS.set('stayIn', true); busy(0); toast('เปิดแจ้งเตือนแล้ว — ลองกด "ส่งแจ้งเตือนทดสอบ"'); drawPush(); } catch (e) { busy(0); toast(e.message, 1, 6000); drawPush(); } };
    const pt = $('#pt', pushc); if (pt) pt.onclick = async () => { try { busy(1); const r = await api('pushTest', {}); busy(0); toast(r.sent ? `ส่งแล้ว ${r.sent} เครื่อง — รอเด้งในแถบแจ้งเตือน` : 'ส่งไม่สำเร็จ — ลองปิดแล้วเปิดแจ้งเตือนใหม่', !r.sent); } catch (e) { busy(0); toast(e.message, 1); } };
    const pd = $('#pd', pushc); if (pd) pd.onclick = async () => { busy(1); await PushMe.disable(); busy(0); toast('ปิดแจ้งเตือนบนเครื่องนี้แล้ว'); drawPush(); };
    $('#stay', pushc).onchange = e => { LS.set('stayIn', e.target.checked); toast(e.target.checked ? 'เครื่องนี้จะไม่ออกจากระบบเอง' : 'ออกจากระบบอัตโนมัติเมื่อไม่ได้ใช้งานตามที่ตั้งไว้'); };
    if (S.apiUrl) api('pushList', {}).then(r => { const d = $('#pdl', pushc); if (!d || !r.rows.length) return; const me = LS.get('pushId', '');
      d.innerHTML = '<div class="muted">เครื่องที่รับแจ้งเตือน:</div>' + r.rows.map(x => `<div class="row" style="gap:6px;padding:4px 0;border-bottom:1px solid var(--line)"><span class="grow">${esc(x.name)}${x.id === me ? ' <b>(เครื่องนี้)</b>' : ''} <span class="tiny muted">${esc(x.user || '')}</span></span><button class="btn ghost sm" data-pr="${esc(x.id)}" style="min-height:28px;padding:2px 8px">ลบ</button></div>`).join('');
      $$('[data-pr]', d).forEach(b => b.onclick = async () => { await api('pushRemove', { id: b.dataset.pr }).catch(() => { }); if (b.dataset.pr === me) await PushMe.disable(); drawPush(); }); }).catch(() => { });
  };
  drawPush();
  const N = cfg('secretNotify', {}); $('#ne', el).value = N.email && N.email !== 'off' ? N.email : ''; $('#noff', el).checked = N.email === 'off'; $('#ntk', el).value = N.tgToken || ''; $('#nch', el).value = N.tgChat || '';
  const nsave = () => saveSetting('secretNotify', { email: $('#noff', el).checked ? 'off' : $('#ne', el).value.trim(), tgToken: $('#ntk', el).value.trim(), tgChat: $('#nch', el).value.trim() });
  $('#nsv', el).onclick = async () => { try { busy(1); await nsave(); busy(0); toast('บันทึกการแจ้งเตือนแล้ว'); } catch (e) { busy(0); toast(e.message, 1); } };
  $('#nts', el).onclick = async () => { try { busy(1, 'กำลังส่งทดสอบ...'); await nsave(); const r = await api('notifyTest', {}); busy(0); toast(r.sent && r.sent.length ? 'ส่งแล้ว: ' + r.sent.join(', ') : 'ยังไม่ได้ส่ง — ตรวจการตั้งค่า', !(r.sent && r.sent.length)); } catch (e) { busy(0); toast(e.message, 1, 6000); } };
  const bind = () => { $$('[data-rm]', el).forEach(b => b.onclick = () => b.closest('tr').remove()); };
  $$('[data-add]', el).forEach(b => b.onclick = () => { $('#' + b.dataset.add, el).insertAdjacentHTML('beforeend', '<tr><td><input class="in" type="number"></td><td><input class="in" type="number"></td><td><input class="in" type="number"></td><td><button class="iconbtn" data-rm>✕</button></td></tr>'); bind(); });
  bind();
  const read = id => $$('#' + id + ' tr', el).slice(1).map(tr => $$('input', tr).map(i => num(i.value))).filter(t => t[1] > 0).sort((a, b) => a[0] - b[0]);
  $('#sv', el).onclick = async () => {
    const iss = tierIssues(read('to'), 'โอนออก').concat(tierIssues(read('ti'), 'โอนเข้า'));
    if (iss.length && !(await confirmDlg('ตรวจพบ:<br>• ' + iss.join('<br>• ') + '<br><br>บันทึกต่อหรือไม่? (ยอดที่ไม่มีค่าบริการ พนักงานต้องกำหนดเองตอนขาย)', 'บันทึกต่อ'))) return;
    const o = { transferOut: read('to'), transferIn: read('ti'), topupFee: num($('#tf', el).value), topupMode: $('#tm', el).value, topupStep: num($('#ts', el).value) || 100, billFee: num($('#bf', el).value), networks: $('#nw', el).value.split(',').map(x => x.trim()).filter(Boolean), billTypes: $('#bt', el).value.split(',').map(x => x.trim()).filter(Boolean),
      copy: Object.fromEntries($$('[data-cp]', el).map(i => [i.dataset.cp, num(i.value)])), inst: { rate: num($('#ir', el).value), rateMode: $('#im', el).value, period: $('#ip', el).value, count: Math.max(1, Math.round(num($('#ic', el).value)) || 6), downPct: num($('#id', el).value) } };
    try { busy(1); await saveSetting('svcCfg', o); busy(0); toast('บันทึกค่าบริการแล้ว'); } catch (e) { busy(0); toast(e.message, 1); }
  };
};

/* ---------- งานรอดำเนินการ (เจ้าของทำ: โอนเงิน / เติม TrueMoney / ชำระบิล) ---------- */
const JOB_T = { transfer: ['💸', 'โอนเงินให้ลูกค้า'], wallet: ['📱', 'เติมเงิน TrueMoney'], bill: ['🧾', 'ชำระบิลแทนลูกค้า'] };
const JOB_ST = { pending: ['รอดำเนินการ', 'amber'], done: ['ทำแล้ว', 'green'], cancelled: ['ยกเลิก', 'gray'] };
async function jobsBadge(box) {
  if (!box) return;
  try { const r = await api('jobs', { status: 'pending', limit: 50 }); const n = r.rows.length; S.jobsN = n; if (!box.isConnected) return;
    if (!n) { box.innerHTML = ''; return; }
    const ago = d => { const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); return !d || isNaN(m) ? '' : m < 1 ? 'เมื่อกี้' : m < 60 ? m + ' นาทีที่แล้ว' : Math.floor(m / 60) + ' ชม. ' + (m % 60) + ' นาที'; };
    const det = j => j.type === 'transfer' ? `${esc(j.bank || '')} ${esc(j.acc || '')}${j.accName ? ' · ' + esc(j.accName) : ''}` : j.type === 'wallet' ? esc(j.phone || '') : `${esc(j.billType || '')} ${esc(j.ref || '')}`;
    box.innerHTML = `<div class="jbig" onclick="go('jobs')">
      <div class="jtop"><span class="jbell">🔔</span><div class="grow"><div class="jtt">งานด่วน รอดำเนินการ</div><div class="jts">ลูกค้าจ่ายเงินแล้ว รอร้านโอน · เติม · จ่ายบิลให้</div></div><span class="jnum">${n}</span></div>
      ${r.rows.slice(0, 3).map(j => { const t = JOB_T[j.type] || ['•', j.type]; return `<div class="jrow"><span class="jem">${t[0]}</span><div class="grow" style="min-width:0"><div class="jrt">${t[1]}</div><div class="jrd">${det(j)}${j.cashierName ? ' · ' + esc(j.cashierName) : ''}</div></div><div class="right"><div class="jamt">${baht(j.amount)}</div><div class="jago">${ago(j.date)}</div></div></div>`; }).join('')}
      ${n > 3 ? `<div class="jmore">และอีก ${n - 3} รายการ</div>` : ''}
      <button class="jgo">ดำเนินการเลย ›</button></div>
      <style>.jbig{cursor:pointer;border-radius:18px;padding:14px;margin-bottom:12px;color:#fff;background:linear-gradient(135deg,#FF3D00,#D6001C 60%,#9C0016);box-shadow:0 8px 24px rgba(214,0,28,.35);animation:jpulse 2s ease-in-out infinite}
      @keyframes jpulse{0%,100%{box-shadow:0 8px 24px rgba(214,0,28,.35)}50%{box-shadow:0 8px 34px rgba(255,61,0,.75)}}
      .jtop{display:flex;align-items:center;gap:12px;margin-bottom:10px}.jbell{font-size:34px;animation:jring 1.4s ease-in-out infinite;transform-origin:50% 10%}
      @keyframes jring{0%,60%,100%{transform:rotate(0)}10%{transform:rotate(16deg)}20%{transform:rotate(-14deg)}30%{transform:rotate(10deg)}40%{transform:rotate(-6deg)}}
      .jtt{font-family:var(--fh);font-size:20px;font-weight:800}.jts{font-size:13.5px;opacity:.9}
      .jnum{min-width:52px;height:52px;border-radius:26px;background:#fff;color:#D6001C;font-family:var(--fh);font-size:28px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 10px}
      .jrow{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.14);border-radius:12px;padding:8px 10px;margin-top:6px}.jem{font-size:24px}
      .jrt{font-weight:700}.jrd{font-size:13px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jamt{font-family:var(--fh);font-size:20px;font-weight:800}.jago{font-size:12px;opacity:.85;white-space:nowrap}
      .jmore{font-size:13px;opacity:.9;margin-top:6px}.jgo{all:unset;box-sizing:border-box;width:100%;display:block;text-align:center;margin-top:10px;background:#fff;color:#D6001C;font-weight:800;font-size:17px;border-radius:12px;padding:11px;cursor:pointer}
      @media (prefers-reduced-motion:reduce){.jbig,.jbell{animation:none}}</style>`;
  } catch (e) { }
}
window.jobsBadge = jobsBadge;
const copyTxt = (t, label) => { const done = () => toast('คัดลอก' + (label || '') + 'แล้ว: ' + t); if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => toast(t)); else toast(t); };
window.copyTxt = copyTxt;
VIEWS.jobs = async el => {
  const own = isOwner(); let tab = own ? 'pending' : 'all', rows = [];
  el.innerHTML = vhead(own ? 'งานรอดำเนินการ' : 'งานโอน/ชำระบิล วันนี้', `<button class="btn ghost sm" id="rf">รีเฟรช</button>`, 'more') + `
    ${own ? `<div class="seg" id="tb" style="margin-bottom:10px"><button data-t="pending">รอดำเนินการ</button><button data-t="all">ทั้งหมด</button></div>` : '<div class="small muted" style="margin-bottom:8px">งานเหล่านี้เจ้าของร้านเป็นผู้ดำเนินการ · บอกลูกค้าได้ตามสถานะ</div>'}
    <div id="jl"><div class="empty"><span class="spin dark"></span></div></div>`;
  const tile = code => { const x = [...BANKS, ...CARRIERS].find(b => b.code === code); return x ? `<span style="display:inline-block;width:88px;vertical-align:middle">${pickTile({ ...x, logo: svcLogo(x.code) })}</span>` : ''; };
  const big = (label, val, copyAs) => `<div class="kv" style="align-items:center"><span class="muted">${label}</span><span style="display:flex;align-items:center;gap:6px"><b style="font-size:20px;letter-spacing:.5px">${esc(val)}</b>${own && copyAs ? `<button class="btn ghost sm" data-cp="${esc(copyAs)}" data-lb="${esc(label)}" style="min-height:32px;padding:2px 10px">คัดลอก</button>` : ''}</span></div>`;
  const card = j => { const T = JOB_T[j.type] || ['•', j.type], st = JOB_ST[j.status] || [j.status, 'gray'];
    return `<div class="card" style="${j.status === 'pending' ? 'box-shadow:inset 4px 0 0 var(--amber,#e0a000)' : 'opacity:.8'}">
      <div class="row" style="gap:8px;margin-bottom:6px"><b style="font-size:17px" class="grow">${T[0]} ${T[1]}</b><span class="tag ${st[1]}">${st[0]}</span></div>
      ${j.type === 'transfer' ? `<div class="row" style="gap:10px;margin-bottom:4px">${tile(j.bank)}<div class="grow"><div style="font-weight:700">${esc(j.bankName || j.bank)}</div>${j.accName ? `<div class="small">${esc(j.accName)}</div>` : ''}</div></div>${big('เลขบัญชี / พร้อมเพย์', fmtNum(j.acc, 'account'), j.acc)}` : ''}
      ${j.type === 'wallet' ? big('เบอร์ TrueMoney', fmtNum(j.phone, 'phone'), j.phone) : ''}
      ${j.type === 'bill' ? `<div class="kv"><span class="muted">ประเภทบิล</span><b>${esc(j.billType)}</b></div>${big('เลขที่ผู้ใช้/เลขบิล', j.ref, j.ref)}${j.contact ? `<div class="kv"><span class="muted">ติดต่อลูกค้า</span><span>${esc(j.contact)}</span></div>` : ''}${j.fileUrl ? `<div class="kv"><span class="muted">รูปบิล</span><a href="${esc(j.fileUrl)}" target="_blank">เปิดรูป</a></div>` : ''}` : ''}
      ${big(j.type === 'transfer' ? 'ยอดที่ต้องโอน' : 'ยอด', money(j.amount), String(num(j.amount)))}
      <div class="tiny muted" style="margin-top:4px">บิล ${esc(j.orderId)} · ${esc(String(j.date).replace('T', ' ').slice(0, 16))} · ${esc(j.cashierName || j.cashier || '')} · ค่าบริการ ${money(j.fee, 0)}</div>
      ${j.status !== 'pending' ? `<div class="tiny" style="margin-top:4px">${st[0]} ${esc(String(j.doneAt).replace('T', ' ').slice(0, 16))} · ${esc(j.doneBy || '')}${j.doneRef ? ' · ' + esc(j.doneRef) : ''}</div>` : ''}
      ${own ? `<div class="row" style="gap:8px;margin-top:10px">${j.status === 'pending' ? `<button class="btn green grow" data-done="${esc(j.id)}">✔ ทำแล้ว</button><button class="btn ghost" data-cancel="${esc(j.id)}">ยกเลิก</button>` : `<button class="btn ghost sm" data-back="${esc(j.id)}">ย้อนเป็นรอดำเนินการ</button>`}</div>` : ''}</div>`; };
  const draw = () => {
    const list = tab === 'pending' ? rows.filter(j => j.status === 'pending') : rows;
    if ($('#tb', el)) $$('#tb button', el).forEach(b => { b.classList.toggle('on', b.dataset.t === tab); b.onclick = () => { tab = b.dataset.t; draw(); }; });
    $('#jl', el).innerHTML = list.length ? list.map(card).join('') : `<div class="card empty">${tab === 'pending' ? '✓ ไม่มีงานค้าง' : 'ยังไม่มีงาน'}</div>`;
    $$('[data-cp]', el).forEach(b => b.onclick = () => copyTxt(b.dataset.cp, b.dataset.lb));
    const upd = async (id, status, ref) => { try { busy(1); const r = await api('jobUpdate', { id, status, ref }); busy(0); rows = rows.map(j => j.id === id ? r.job : j); draw(); toast(status === 'done' ? 'บันทึกว่าทำแล้ว' : status === 'cancelled' ? 'ยกเลิกงานแล้ว' : 'ย้อนสถานะแล้ว'); } catch (e) { busy(0); toast(e.message, 1); } };
    $$('[data-done]', el).forEach(b => b.onclick = () => { const ov = sheet('ทำแล้ว', `<label class="f"><span>เลขอ้างอิง / หมายเหตุ (ถ้ามี)</span><input class="in" id="rf2" placeholder="เช่น เลขที่รายการโอน"></label>`, `<button class="btn green block" id="ok">บันทึกว่าทำแล้ว</button>`); $('#ok', ov).onclick = () => { const v = $('#rf2', ov).value.trim(); ov.remove(); upd(b.dataset.done, 'done', v); }; });
    $$('[data-cancel]', el).forEach(b => b.onclick = async () => { if (await confirmDlg('ยกเลิกงานนี้? (เช่น ลูกค้าขอยกเลิก — อย่าลืมคืนเงินบิลถ้าคืนเงินลูกค้า)', 'ยกเลิกงาน', true)) upd(b.dataset.cancel, 'cancelled', 'ยกเลิกโดยเจ้าของร้าน'); });
    $$('[data-back]', el).forEach(b => b.onclick = () => upd(b.dataset.back, 'pending', ''));
  };
  const load = async () => { try { rows = (await api('jobs', { limit: 300 })).rows; } catch (e) { $('#jl', el).innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; } draw(); };
  $('#rf', el).onclick = load; load();
  clearInterval(VIEWS.jobs.t); VIEWS.jobs.t = setInterval(() => { if (S.view === 'jobs' && !document.hidden && !$('.ov')) load(); else if (S.view !== 'jobs') clearInterval(VIEWS.jobs.t); }, 30000);
};

/* =========================================================
   ใช้หนี้ · ถ่าย/พิมพ์เอกสาร · ผ่อนสินค้า
   ทุกอย่างเพิ่มเป็นรายการในบิล → ชำระเงินตามปกติ (ลิ้นชัก ใบเสร็จ ออฟไลน์ได้)
   ระบบตัดยอดหนี้/ค่างวดให้เองตอนบิลเข้าระบบ (Logic: applyOrderEffects / applyInst)
   ========================================================= */
const PERIOD_T = { day: 'วัน', week: 'สัปดาห์', month: 'เดือน' };
const r2c = v => Math.round(v * 100) / 100;
const ticketCust = () => POS.t.customer;
// ผูกลูกค้ากับบิล (ใช้หนี้/ผ่อน ต้องมีลูกค้าในบิล)
async function bindCustomer(c) {
  const T = POS.t, cur = T.customer;
  if (cur && cur.id !== c.id) {
    if (T.items.some(it => it.debt || it.inst)) { toast(`บิลนี้มีรายการใช้หนี้/ผ่อนของ ${cur.name} อยู่แล้ว — ชำระบิลนี้ก่อน แล้วค่อยทำของลูกค้าคนอื่น`, 1, 5000); return false; }
    if (T.items.length && !(await confirmDlg(`เปลี่ยนลูกค้าในบิลจาก ${esc(cur.name)} เป็น ${esc(c.name)}?`, 'เปลี่ยน'))) return false;
  }
  if (!cur || cur.id !== c.id) { T.customer = { id: c.id, name: c.name, phone: c.phone, points: c.points, credit: c.credit, creditLimit: c.creditLimit }; T.pointsUse = 0; }
  return true;
}
const withCustomer = cb => { const c = ticketCust(); if (c) return cb((S.customers || []).find(x => x.id === c.id) || c); loadCustomers().then(() => pickCustomer(x => x && cb(x))); };

/* ---------- สัญญาผ่อน: ข้อมูลในเครื่อง ---------- */
const Inst = {
  rows: null,
  cache() { return this.rows || (this.rows = LS.get('instCache', [])); },
  save() { LS.set('instCache', this.rows || []); },
  merge(list) { const m = {}; this.cache().forEach(r => m[r.id] = r); (list || []).forEach(r => m[r.id] = { ...(m[r.id] || {}), ...r }); this.rows = Object.values(m); this.save(); },
  // บิลที่ยังไม่ส่งเข้าระบบ → คิดผลไว้ก่อน (ไม่ให้เห็นยอดเก่า)
  pendingOps() { const ops = []; (Sync.box || []).forEach(o => Logic.J(o.items, []).forEach(it => { if (it && it.inst) ops.push({ o, it }); })); return ops; },
  view(rows) {
    const m = {}; rows.forEach(r => m[r.id] = { ...r });
    this.pendingOps().forEach(({ o, it }) => {
      const x = it.inst;
      if (x.op === 'new' && x.plan && !m[x.plan.id]) m[x.plan.id] = { ...x.plan, date: o.date, customerId: o.customerId, customerName: o.customerName, paid: '0', status: 'active', orderId: o.id, _pending: 1 };
      if (x.op === 'pay' && m[x.id] && !m[x.id]._seen) { const r = m[x.id]; r.paid = String(r2c(num(r.paid) + num(it.qty) * num(it.price))); r.lastPayAt = o.date; r._pending = 1; if (num(r.paid) >= num(r.total) - .009) r.status = 'done'; }
    });
    return Object.values(m);
  },
  applyLocal() { /* บิลใหม่อยู่ใน outbox แล้ว view() คิดให้เอง */ },
  refresh() { return this._p || (this._p = api('list', { table: 'Installments' }).then(r => { this.rows = r.rows; this.at = Date.now(); this.save(); }).catch(() => { this.cache(); }).finally(() => { this._p = null; })); },
  // ไม่บังคับ → ใช้ข้อมูลในเครื่องทันที (มีแล้ว) แล้วอัปเดตเบื้องหลัง · บังคับ → รอข้อมูลล่าสุด
  async list(force) {
    const stale = !this.at || Date.now() - this.at > 30e3, has = this.cache().length || this.at;
    if (force || (stale && !has)) await this.refresh(); else if (stale) this.refresh();
    return this.view(this.cache());
  },
  // ตารางงวด: [{no, due, amt, paid, left, st}] — ตัดยอดที่ชำระแล้วจากงวดแรกไปงวดหลัง
  schedule(p) {
    const n = Math.max(1, num(p.count)), per = num(p.per), tot = num(p.total), out = [];
    let paid = num(p.paid), d = String(p.firstDue || String(p.date || todayISO()).slice(0, 10)), t = todayISO();
    for (let i = 1; i <= n; i++) {
      const amt = i < n ? per : r2c(tot - per * (n - 1)), pd = Math.min(amt, Math.max(0, paid)); paid = r2c(paid - pd);
      const left = r2c(amt - pd);
      out.push({ no: i, due: d, amt, paid: pd, left, st: left <= .009 ? 'paid' : d < t ? 'late' : d === t ? 'today' : 'wait' });
      d = instNext(d, p.period);
    }
    return out;
  },
  stat(p) {
    const sc = this.schedule(p), late = sc.filter(x => x.st === 'late'), next = sc.find(x => x.left > .009);
    return { sc, late, lateAmt: r2c(late.reduce((a, x) => a + x.left, 0)), next, left: r2c(Math.max(0, num(p.total) - num(p.paid))), paidN: sc.filter(x => x.st === 'paid').length };
  }
};
window.Inst = Inst;
function instNext(iso, period) {
  const d = new Date(iso + 'T12:00:00');
  if (period === 'day') d.setDate(d.getDate() + 1);
  else if (period === 'week') d.setDate(d.getDate() + 7);
  else { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  return isoDay(d);
}
// คำนวณสัญญาผ่อน (ดอกเบี้ยคงที่ flat)
function instCalc(f) {
  const price = num(f.price), down = Math.min(price, num(f.down)), count = Math.max(1, Math.round(num(f.count)) || 1), financed = r2c(price - down);
  const interest = Math.ceil(financed * num(f.rate) / 100 * (f.rateMode === 'total' ? 1 : count));
  const total = r2c(financed + interest), per = count ? Math.ceil(total / count) : total;
  return { price, down, count, financed, interest, total, per, last: r2c(total - per * (count - 1)) };
}

/* ---------- 💰 ใช้หนี้ ---------- */
// ยอดค้างที่ยังรอส่งเข้าระบบ (บิลในเครื่อง): ขายเชื่อ = เพิ่ม · ใช้หนี้ = ลด
function custPending(cid) {
  return r2c((Sync.box || []).filter(o => o.customerId === cid).reduce((a, o) =>
    a + Logic.J(o.payments, []).filter(p => p.type === 'credit').reduce((s, p) => s + num(p.amount), 0)
      - Logic.J(o.items, []).filter(it => it && it.debt).reduce((s, it) => s + num(it.qty) * num(it.price), 0), 0));
}
function svcDebt() {
  withCustomer(c => {
    // เปิดทันทีจากข้อมูลในเครื่อง แล้วอัปเดตยอดจาก Google เบื้องหลัง
    let ov = null, amt = null, touched = false, sig = '', live = false;
    const open = () => {
      const cu = (S.customers || []).find(x => x.id === c.id) || c;
      const inTk = POS.t.customer && POS.t.customer.id === cu.id ? POS.t.items.filter(it => it.debt).reduce((a, it) => a + num(it.qty) * num(it.price), 0) : 0;
      const owe = r2c(Math.max(0, num(cu.credit) + custPending(cu.id) - inTk));
      const plans = Inst.view(Inst.cache()).filter(p => p.customerId === cu.id && p.status === 'active');
      sig = owe + '|' + plans.map(p => p.id + ':' + p.paid).join(',');
      amt = touched && amt != null ? Math.min(amt, owe) : owe;
      const old = ov;
      ov = sheet(`💰 ใช้หนี้ · ${esc(cu.name)}`, `<div class="small muted" style="margin:-4px 0 10px">${esc(cu.phone || '')} · ระบบตัดยอดค้างให้เองเมื่อรับเงินแล้ว <span id="dsy" class="tiny" style="color:${live ? 'var(--green)' : 'var(--ink3)'}">${live ? '✓ ยอดล่าสุด' : '⟳ กำลังอัปเดตยอด…'}</span></div>
      <div class="card" style="padding:12px"><div class="kv"><span>ยอดเงินเชื่อค้างชำระ</span><b style="font-size:20px;color:${owe ? 'var(--red)' : 'var(--green)'}">${money(owe)}</b></div>
       ${inTk ? `<div class="tiny muted">หักรายการใช้หนี้ที่อยู่ในบิลนี้แล้ว ${money(inTk)}</div>` : ''}
       ${owe ? `<div class="small" style="margin-top:8px">จำนวนที่ชำระ</div><button class="kpv" id="da" style="width:100%;text-align:right;border:0;cursor:pointer">${money(amt)}</button>
        <div class="row wrap" style="gap:6px;margin-top:8px"><button class="btn ghost sm" data-q="all">ทั้งหมด</button>${owe >= 2 ? '<button class="btn ghost sm" data-q="half">ครึ่งหนึ่ง</button>' : ''}${[100, 200, 500, 1000].filter(v => v < owe).map(v => `<button class="btn ghost sm" data-q="${v}">${v}</button>`).join('')}</div>
        <div class="kv" style="margin-top:8px"><span>คงค้างหลังชำระ</span><b id="dl"></b></div>
        <button class="btn block green" id="dok" style="min-height:56px;font-size:18px;margin-top:10px">เพิ่มลงบิล</button>` : '<div class="alert green small" style="margin-top:8px">ไม่มียอดเงินเชื่อค้างชำระ</div>'}</div>
      ${plans.length ? `<h3 style="margin:14px 0 6px">📆 สัญญาผ่อนที่ยังไม่ปิด</h3>${plans.map(p => instRow(p)).join('')}` : ''}`); ov.sticky = true;
      if (old) old.remove();
      const draw = () => { const a = $('#da', ov); if (!a) return; a.textContent = money(amt); $('#dl', ov).innerHTML = money(r2c(owe - amt)); };
      const da = $('#da', ov); if (da) da.onclick = () => keypad('ยอดชำระหนี้', amt, v => { amt = Math.min(owe, Math.max(0, num(v))); touched = true; draw(); });
      $$('[data-q]', ov).forEach(b => b.onclick = () => { const q = b.dataset.q; amt = q === 'all' ? owe : q === 'half' ? Math.ceil(owe / 2) : +q; touched = q !== 'all'; draw(); });
      const ok = $('#dok', ov); if (ok) ok.onclick = async () => {
        if (amt <= 0) return toast('ใส่จำนวนเงิน', 1);
        if (!(await gate('credit'))) return;
        if (!(await bindCustomer(cu))) return;
        POS.t.items.push({ sku: 'SVC-DEBT', name: `ใช้หนี้ ${cu.name} (คงค้าง ${money(r2c(owe - amt), 0)})`, price: amt, qty: 1, cost: amt, cat: 'รับชำระหนี้', pass: 1, debt: 1, svc: 'debt' });
        ov.remove(); POS.save(); beep(); toast('เพิ่มรายการใช้หนี้แล้ว — รับเงินตามปกติ ระบบตัดยอดค้างให้เอง');
      };
      $$('[data-ip]', ov).forEach(b => b.onclick = () => { const p = plans.find(x => x.id === b.dataset.ip); ov.remove(); instPay(p); });
      draw();
    };
    open();
    Promise.all([refreshCustomers(), Inst.list(true).catch(() => [])]).then(() => {
      if (!ov || !ov.isConnected) return;
      live = true; const before = sig, a0 = amt;
      const cu = (S.customers || []).find(x => x.id === c.id) || c, plans = Inst.view(Inst.cache()).filter(p => p.customerId === cu.id && p.status === 'active');
      const inTk = POS.t.customer && POS.t.customer.id === cu.id ? POS.t.items.filter(it => it.debt).reduce((a, it) => a + num(it.qty) * num(it.price), 0) : 0;
      const now = r2c(Math.max(0, num(cu.credit) + custPending(cu.id) - inTk)) + '|' + plans.map(p => p.id + ':' + p.paid).join(',');
      if (now !== before) { open(); if (touched && amt !== a0) toast('ยอดค้างอัปเดตแล้ว — ตรวจจำนวนที่ชำระอีกครั้ง'); }
      else { const d = $('#dsy', ov); if (d) { d.textContent = '✓ ยอดล่าสุด'; d.style.color = 'var(--green)'; } }
    });
  });
}
function instRow(p, btn = true) {
  const st = Inst.stat(p), pct = Math.min(100, num(p.paid) / Math.max(1, num(p.total)) * 100);
  return `<div class="card" style="padding:10px 12px;margin-bottom:8px"${btn ? '' : ` data-iv="${esc(p.id)}"`}><div class="row" style="gap:8px"><div class="grow" style="min-width:0"><b>${esc(p.product)}</b>${p._pending ? ' <span class="tag gray">รอส่ง</span>' : ''}${p.status === 'done' ? ' <span class="tag green">ปิดแล้ว</span>' : p.status === 'cancelled' ? ' <span class="tag gray">ยกเลิก</span>' : st.late.length ? ` <span class="tag red">ค้าง ${st.late.length} งวด</span>` : ''}
      <div class="tiny muted">${btn ? '' : esc(p.customerName || '') + ' · '}งวดละ ${money(p.per, 0)} × ${p.count} ${PERIOD_T[p.period] || ''} · จ่ายแล้ว ${st.paidN}/${p.count} งวด${st.next && p.status === 'active' ? ` · ครบกำหนดถัดไป ${thDate(st.next.due)}` : ''}</div></div>
      <div class="right"><div class="tiny muted">คงเหลือ</div><b>${p.status === 'cancelled' ? '-' : money(st.left, 0)}</b></div>${btn && p.status === 'active' ? `<button class="btn sm green" data-ip="${esc(p.id)}">ชำระงวด</button>` : ''}</div>
      <div style="height:6px;border-radius:3px;background:#EEF0F2;margin-top:8px"><div style="height:6px;border-radius:3px;width:${pct}%;background:${st.late.length && p.status === 'active' ? 'var(--red)' : 'var(--green)'}"></div></div></div>`;
}

/* ---------- 📠 ถ่ายเอกสาร / 🖨️ พิมพ์เอกสาร ---------- */
function svcCopy(kind) {
  const s = SVC[kind], cc = svcCfg().copy, key = m => kind + (m === 'bw' ? 'BW' : 'Color');
  let mode = 'bw', pages = '', priceOv = null;
  const unit = () => priceOv != null ? priceOv : num(cc[key(mode)]);
  const ov = sheet(`${s.icon} ${s.name}`, `<div class="svl"><div class="seg" id="cm" style="margin-bottom:10px"><button data-m="bw" style="min-height:52px">⚫ ขาวดำ <span class="tiny">${money(cc[key('bw')])}/หน้า</span></button><button data-m="color" style="min-height:52px">🌈 สี <span class="tiny">${money(cc[key('color')])}/หน้า</span></button></div>
    <div class="small">จำนวนหน้า</div><div class="kpv" id="kv" style="margin-bottom:4px">0</div>
    <div class="row wrap" style="gap:6px;margin-top:8px">${[1, 2, 5, 10, 20, 50, 100].map(v => `<button class="btn ghost sm" data-q="${v}">${v}</button>`).join('')}</div>
    <div class="card" style="margin-top:10px;padding:10px 12px" id="sum"></div></div>
    <div class="svr"><div class="svh"><span>กำลังกรอก: <b>จำนวนหน้า</b></span>${sndBtn()}</div><div class="kp">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="00">00</button><button data-k="0">0</button><button data-k="del">⌫</button></div></div>`,
    `<button class="btn grow green" id="ok" style="min-height:56px;font-size:18px">เพิ่มลงบิล</button>`, { cls: 'svs', sticky: true });
  const draw = () => {
    $$('#cm button', ov).forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    $('#kv', ov).textContent = pages || '0';
    $('#sum', ov).innerHTML = `<div class="kv"><span>ราคาต่อหน้า</span><span><b>${money(unit())}</b> <a href="javascript:void 0" id="ep" class="small">แก้</a></span></div><div class="kv" style="font-size:20px"><span>รวม</span><b class="num">${bahtL(r2c(num(pages) * unit()))}</b></div>`;
    $('#ep', ov).onclick = async () => { if (!(await gate('priceEdit'))) return; keypad('ราคาต่อหน้า', unit(), v => { priceOv = num(v); draw(); }); };
  };
  $$('#cm button', ov).forEach(b => b.onclick = () => { mode = b.dataset.m; priceOv = null; draw(); });
  $$('.kp [data-k]', ov).forEach(b => b.onclick = () => { const v = b.dataset.k; if (v === 'del') pages = pages.slice(0, -1); else if (pages.length < 5) pages = (pages === '0' ? '' : pages) + v; draw(); });
  $$('[data-q]', ov).forEach(b => b.onclick = () => { pages = b.dataset.q; draw(); });
  ov.addEventListener('keydown', e => { if (/^\d$/.test(e.key)) { pages += e.key; draw(); } else if (e.key === 'Backspace') { pages = pages.slice(0, -1); draw(); } else if (e.key === 'Enter') $('#ok', ov).click(); }); ov.tabIndex = 0; ov.focus();
  $('#ok', ov).onclick = () => {
    const q = Math.round(num(pages)); if (!q) return toast('ใส่จำนวนหน้า', 1);
    const sku = `SVC-${kind.toUpperCase()}-${mode.toUpperCase()}`, price = unit(), cost = num(cc['cost' + key(mode)[0].toUpperCase() + key(mode).slice(1)]);
    const name = `${s.name} ${mode === 'bw' ? 'ขาวดำ' : 'สี'}`;
    const ex = POS.t.items.find(it => it.sku === sku && num(it.price) === price);
    if (ex) ex.qty = num(ex.qty) + q; else POS.t.items.push({ sku, name, price, qty: q, cost, cat: 'ค่าบริการ', svc: kind });
    ov.remove(); POS.save(); beep();
  };
  draw();
}

/* ---------- 📆 ผ่อนสินค้า: เปิดสัญญาใหม่ ---------- */
function svcInst() {
  withCustomer(async cu => {
    const ic = svcCfg().inst, t0 = todayISO();
    const plans = (await Inst.list().catch(() => [])).filter(p => p.customerId === cu.id && p.status === 'active');
    const f = { product: '', sku: '', price: '', down: '', count: ic.count, period: ic.period, rate: ic.rate, rateMode: ic.rateMode, adv: '', firstDue: instNext(t0, ic.period), note: '' };
    const ov = sheet(`📆 ผ่อนสินค้า · ${esc(cu.name)}`, `<div class="small muted" style="margin:-4px 0 10px">${esc(cu.phone || 'ไม่มีเบอร์')} · สมาชิก${num(cu.credit) ? ` · เงินเชื่อค้าง ${money(cu.credit)}` : ''}${plans.length ? ` · <b style="color:var(--amber)">มีสัญญาผ่อนอยู่ ${plans.length} สัญญา</b> <a href="javascript:void 0" id="opay">ชำระงวด</a>` : ''}</div>
      <label class="f"><span>ชื่อสินค้า</span><input class="in" id="ipn" list="ipl" placeholder="พิมพ์ชื่อ หรือเลือกจากสินค้าในร้าน" autocomplete="off"></label><datalist id="ipl"></datalist>
      <div class="grid2"><label class="f"><span>ราคาสินค้า (บาท)</span><input class="in" id="ipr" type="number" step="any" inputmode="decimal"></label><label class="f"><span>เงินดาวน์ (บาท)</span><input class="in" id="ipd" type="number" step="any" inputmode="decimal"></label></div>
      <div class="row wrap" style="gap:6px;margin:-4px 0 8px"><span class="tiny muted">ดาวน์</span>${[0, 10, 20, 30, 50].map(v => `<button class="btn ghost sm" data-dp="${v}" style="min-height:30px;padding:2px 10px">${v}%</button>`).join('')}</div>
      <div class="grid2"><label class="f"><span>จำนวนงวด</span><input class="in" id="ipc" type="number" inputmode="numeric"></label><label class="f"><span>ระยะงวด</span><select class="in" id="ipp"><option value="month">รายเดือน</option><option value="week">รายสัปดาห์</option><option value="day">รายวัน</option></select></label></div>
      <div class="grid2"><label class="f"><span>ดอกเบี้ย %</span><input class="in" id="ipi" type="number" step="any" inputmode="decimal"></label><label class="f"><span>คิดดอกเบี้ย</span><select class="in" id="ipm"><option value="period">% ต่องวด</option><option value="total">% ทั้งสัญญา</option></select></label></div>
      <div class="grid2"><label class="f"><span>ชำระล่วงหน้า (บาท ไม่บังคับ)</span><input class="in" id="ipa" type="number" step="any" inputmode="decimal" placeholder="0"></label><label class="f"><span>ครบกำหนดงวดแรก</span><input class="in" id="ipf" type="date" data-nokp></label></div>
      <label class="f"><span>หมายเหตุ (เช่น เลขเครื่อง/สี/ผู้ค้ำ)</span><input class="in" id="ipo"></label>
      <div class="card" id="ips" style="padding:10px 12px"></div>`,
      `<button class="btn grow green" id="ok" style="min-height:56px;font-size:18px">เปิดสัญญา · เพิ่มลงบิล</button>`); ov.sticky = true;
    const V = { ipn: 'product', ipr: 'price', ipd: 'down', ipc: 'count', ipp: 'period', ipi: 'rate', ipm: 'rateMode', ipa: 'adv', ipf: 'firstDue', ipo: 'note' };
    Object.entries(V).forEach(([id, k]) => { const i = $('#' + id, ov); i.value = f[k]; i.oninput = i.onchange = () => { f[k] = i.value; if (k === 'period') { f.firstDue = instNext(t0, f.period); $('#ipf', ov).value = f.firstDue; } if (k === 'product') pickProd(); draw(); }; });
    const pl = $('#ipl', ov); setTimeout(() => { pl.innerHTML = (S.products || []).filter(p => !String(p.sku).startsWith('SVC')).slice(0, 4000).map(p => `<option value="${esc(p.name)}">`).join(''); }, 50);
    const pickProd = () => { const p = (S.products || []).find(x => x.name === f.product.trim()); f.sku = p ? p.sku : ''; if (p && !num(f.price)) { f.price = num(p.price); $('#ipr', ov).value = f.price; } };
    $$('[data-dp]', ov).forEach(b => b.onclick = () => { f.down = Math.ceil(num(f.price) * +b.dataset.dp / 100); $('#ipd', ov).value = f.down; draw(); });
    const op = $('#opay', ov); if (op) op.onclick = () => { ov.remove(); plans.length === 1 ? instPay(plans[0]) : svcDebt(); };
    const draw = () => {
      const k = instCalc(f), adv = Math.min(num(f.adv), k.total), minDown = Math.ceil(k.price * num(ic.downPct) / 100);
      const sc = k.price ? Inst.schedule({ count: k.count, per: k.per, total: k.total, paid: adv, firstDue: f.firstDue, period: f.period }) : [];
      $('#ips', ov).innerHTML = k.price ? `<div class="kv"><span>ยอดจัดผ่อน (ราคา − ดาวน์)</span><b>${money(k.financed)}</b></div><div class="kv"><span>ดอกเบี้ย ${num(f.rate)}%${f.rateMode === 'total' ? ' ทั้งสัญญา' : ' × ' + k.count + ' งวด'}</span><b>${money(k.interest)}</b></div>
        <div class="kv"><span>รวมต้องผ่อน</span><b>${money(k.total)}</b></div><div class="kv" style="font-size:18px"><span>ค่างวด</span><b style="color:var(--green)">${money(k.per, 0)} × ${k.count} ${PERIOD_T[f.period]}${k.last !== k.per ? ` <span class="tiny muted">(งวดสุดท้าย ${money(k.last, 0)})</span>` : ''}</b></div>
        ${num(f.down) < minDown ? `<div class="alert amber small">เงินดาวน์ต่ำกว่าขั้นต่ำที่ตั้งไว้ ${ic.downPct}% (${money(minDown, 0)})</div>` : ''}
        <div class="kv" style="font-size:20px;border-top:1px solid var(--line);padding-top:6px;margin-top:4px"><span>ลูกค้าจ่ายวันนี้</span><b class="num">${bahtL(k.down + adv)}</b></div><div class="tiny muted">เงินดาวน์ ${money(k.down, 0)}${adv ? ` + ชำระล่วงหน้า ${money(adv, 0)}` : ''} · หลังจากนี้คงเหลือ ${money(k.total - adv, 0)}</div>
        <details style="margin-top:6px"><summary class="small" style="cursor:pointer">ตารางผ่อน ${k.count} งวด</summary><div class="scroll-x" style="max-height:200px;overflow:auto"><table class="t"><tr><th>งวด</th><th>ครบกำหนด</th><th class="right">ยอด</th><th class="right">ชำระแล้ว</th></tr>${sc.map(x => `<tr><td>${x.no}</td><td>${thDate(x.due)}</td><td class="right">${money(x.amt, 0)}</td><td class="right">${x.paid ? money(x.paid, 0) : '-'}</td></tr>`).join('')}</table></div></details>` : '<div class="muted small">ใส่ราคาสินค้าเพื่อคำนวณค่างวด</div>';
    };
    $('#ok', ov).onclick = async () => {
      const k = instCalc(f), adv = r2c(Math.min(num(f.adv), k.total));
      if (!f.product.trim()) return toast('ใส่ชื่อสินค้า', 1);
      if (!k.price) return toast('ใส่ราคาสินค้า', 1);
      if (num(f.down) > k.price) return toast('เงินดาวน์มากกว่าราคาสินค้า', 1);
      if (!k.financed) return toast('ดาวน์เต็มราคาแล้ว — ขายปกติได้เลย ไม่ต้องผ่อน', 1);
      if (!(await gate('credit'))) return;
      if (!(await bindCustomer(cu))) return;
      const id = 'IN' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase();
      const plan = { id, customerId: cu.id, customerName: cu.name, phone: cu.phone || '', product: f.product.trim(), price: k.price, down: k.down, financed: k.financed, rate: num(f.rate), rateMode: f.rateMode, interest: k.interest, total: k.total, count: k.count, period: f.period, per: k.per, firstDue: f.firstDue || instNext(t0, f.period), note: f.note.trim() };
      const p = f.sku && IDX.bySku[f.sku];
      // ถ้าเป็นสินค้าในร้าน → ตัดสต็อก 1 ชิ้นพร้อมเงินดาวน์ (ต้นทุนสินค้าเข้าวันที่ส่งมอบ)
      POS.t.items.push({ sku: p ? p.sku : 'SVC-INST', name: `ผ่อน ${plan.product} · เงินดาวน์ (${k.count} งวด × ${money(k.per, 0)})`, price: k.down, qty: 1, cost: p ? num(p.cost) : 0, cat: p ? p.category : 'ผ่อนสินค้า', svc: 'inst', inst: { op: 'new', plan } });
      if (adv) POS.t.items.push({ sku: 'SVC-INSTPAY', name: `ค่างวด ${plan.product} (ชำระล่วงหน้า)`, price: adv, qty: 1, cost: 0, cat: 'ผ่อนสินค้า', svc: 'inst', inst: { op: 'pay', id } });
      ov.remove(); POS.save(); beep(); toast('เพิ่มสัญญาผ่อนลงบิลแล้ว — รับเงินดาวน์ตามปกติ สัญญาจะบันทึกเมื่อชำระเงินเสร็จ', 0, 5000);
    };
    draw();
  });
}

/* ---------- 📆 ชำระค่างวด ---------- */
function instPay(p) {
  const st = Inst.stat(p);
  const inTk = POS.t.items.filter(it => it.inst && it.inst.op === 'pay' && it.inst.id === p.id).reduce((a, it) => a + num(it.qty) * num(it.price), 0);
  const left = r2c(Math.max(0, st.left - inTk));
  if (!left) return toast(inTk ? 'ยอดงวดของสัญญานี้อยู่ในบิลครบแล้ว' : 'สัญญานี้ชำระครบแล้ว', 1);
  let amt = Math.min(left, st.lateAmt > inTk ? r2c(st.lateAmt - inTk) : (st.next ? st.next.left : num(p.per)));
  const ov = sheet(`📆 ชำระค่างวด · ${esc(p.product)}`, `<div class="small muted" style="margin:-4px 0 10px">${esc(p.customerName)} · งวดละ ${money(p.per, 0)} · จ่ายแล้ว ${st.paidN}/${p.count} งวด</div>
    ${st.late.length ? `<div class="alert red small">ค้างชำระ ${st.late.length} งวด รวม ${money(st.lateAmt, 0)} (เกินกำหนดตั้งแต่ ${thDate(st.late[0].due)})</div>` : st.next ? `<div class="alert blue small">งวดที่ ${st.next.no} ครบกำหนด ${thDate(st.next.due)}</div>` : ''}
    <div class="card" style="padding:12px"><div class="kv"><span>ยอดคงเหลือทั้งสัญญา</span><b>${money(left)}</b></div>
      <div class="small" style="margin-top:8px">จำนวนที่ชำระ</div><button class="kpv" id="ia" style="width:100%;text-align:right;border:0;cursor:pointer"></button>
      <div class="row wrap" style="gap:6px;margin-top:8px">${[1, 2, 3].filter(n => n * num(p.per) < left).map(n => `<button class="btn ghost sm" data-q="${n * num(p.per)}">${n} งวด</button>`).join('')}${st.lateAmt > inTk ? `<button class="btn ghost sm" data-q="${r2c(st.lateAmt - inTk)}">ยอดค้าง</button>` : ''}<button class="btn ghost sm" data-q="${left}">ปิดยอดทั้งหมด</button></div>
      <div class="kv" style="margin-top:8px"><span>คงเหลือหลังชำระ</span><b id="il"></b></div></div>`,
    `<button class="btn grow green" id="ok" style="min-height:56px;font-size:18px">เพิ่มลงบิล</button>`); ov.sticky = true;
  const draw = () => { $('#ia', ov).textContent = money(amt); $('#il', ov).textContent = money(r2c(left - amt)); };
  $('#ia', ov).onclick = () => keypad('ยอดชำระค่างวด', amt, v => { amt = Math.min(left, Math.max(0, num(v))); draw(); });
  $$('[data-q]', ov).forEach(b => b.onclick = () => { amt = Math.min(left, +b.dataset.q); draw(); });
  $('#ok', ov).onclick = async () => {
    if (amt <= 0) return toast('ใส่จำนวนเงิน', 1);
    const c = (S.customers || []).find(x => x.id === p.customerId) || { id: p.customerId, name: p.customerName, phone: p.phone };
    if (!(await bindCustomer(c))) return;
    const from = Math.min(num(p.count), Math.floor((num(p.paid) + inTk + .009) / Math.max(1, num(p.per))) + 1), to = Math.min(num(p.count), Math.ceil((num(p.paid) + inTk + amt - .009) / Math.max(1, num(p.per))));
    POS.t.items.push({ sku: 'SVC-INSTPAY', name: `ค่างวด ${p.product} งวดที่ ${from === to ? from : from + '–' + to}/${p.count}${amt >= left ? ' (ปิดสัญญา)' : ''}`, price: amt, qty: 1, cost: 0, cat: 'ผ่อนสินค้า', svc: 'inst', inst: { op: 'pay', id: p.id } });
    ov.remove(); POS.save(); beep(); toast('เพิ่มค่างวดลงบิลแล้ว — รับเงินตามปกติ ระบบตัดยอดให้เอง');
  };
  draw();
}
window.instPay = instPay; window.svcInst = svcInst; window.svcDebt = svcDebt;

/* ---------- หน้า "สัญญาผ่อนสินค้า" ---------- */
const IV = { f: 'active', q: '', cust: '' };
VIEWS.inst = async el => {
  if (!can('customers') && !can('credit')) { el.innerHTML = vhead('สัญญาผ่อนสินค้า', '', 'more') + '<div class="card empty">ไม่มีสิทธิ์</div>'; return; }
  el.innerHTML = vhead('สัญญาผ่อนสินค้า', `<button class="btn sm" id="nw">${I(IC.plus, 18)} เปิดสัญญาใหม่</button>`, 'more') + `<div id="ik"></div>
    <div class="search"><svg class="s" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input class="in" id="q" placeholder="ค้นหาชื่อลูกค้า / สินค้า / เบอร์" value="${esc(IV.q)}"></div>
    <div class="chips" id="fl" style="margin-top:10px"></div><div id="il"><div class="card center"><span class="spin dark"></span></div></div>`;
  $('#nw', el).onclick = () => { go('pos'); setTimeout(svcInst, 250); };
  let rows = [];
  const draw = () => {
    const S2 = rows.map(p => ({ p, st: Inst.stat(p) })), act = S2.filter(x => x.p.status === 'active'), late = act.filter(x => x.st.late.length);
    const k = (t, v, s2, c) => `<div class="stat"><div class="k">${t}</div><div class="v" ${c ? `style="color:${c}"` : ''}>${v}</div>${s2 ? `<div class="tiny muted">${s2}</div>` : ''}</div>`;
    $('#ik', el).innerHTML = `<div class="grid3" style="margin-bottom:12px">${k('กำลังผ่อน', act.length + ' สัญญา', 'ยอดคงเหลือ ' + money(act.reduce((a, x) => a + x.st.left, 0), 0))}${k('ค้างชำระ', late.length + ' สัญญา', 'รวม ' + money(late.reduce((a, x) => a + x.st.lateAmt, 0), 0), late.length ? 'var(--red)' : '')}${k('ครบกำหนด 7 วันนี้', act.filter(x => x.st.next && x.st.next.due <= addDays(todayISO(), 7) && x.st.next.st !== 'late').length + ' สัญญา', '')}</div>`;
    const F = [['active', 'กำลังผ่อน'], ['late', 'ค้างชำระ'], ['done', 'ปิดแล้ว'], ['cancelled', 'ยกเลิก'], ['', 'ทั้งหมด']];
    $('#fl', el).innerHTML = F.map(([v, n]) => `<button class="chip ${IV.f === v ? 'on' : ''}" data-f="${v}">${n}</button>`).join('') + (IV.cust ? `<button class="chip on" data-cx>ลูกค้า: ${esc((rows.find(p => p.customerId === IV.cust) || {}).customerName || '')} ✕</button>` : '');
    $$('[data-f]', el).forEach(b => b.onclick = () => { IV.f = b.dataset.f; draw(); });
    const cx = $('[data-cx]', el); if (cx) cx.onclick = () => { IV.cust = ''; draw(); };
    const t = norm(IV.q);
    const L = S2.filter(x => (!IV.cust || x.p.customerId === IV.cust) && (IV.f === '' || (IV.f === 'late' ? x.p.status === 'active' && x.st.late.length : x.p.status === IV.f)) && (!t || norm(x.p.customerName + x.p.product + (x.p.phone || '')).includes(t)))
      .sort((a, b) => (b.st.late.length - a.st.late.length) || String((a.st.next || {}).due || '9').localeCompare((b.st.next || {}).due || '9') || String(b.p.date).localeCompare(a.p.date));
    $('#il', el).innerHTML = L.length ? L.map(x => instRow(x.p, false)).join('') : '<div class="card empty">ไม่มีสัญญาผ่อน</div>';
    $$('[data-iv]', el).forEach(r => r.onclick = () => instDetail(rows.find(p => p.id === r.dataset.iv), () => load(true)));
  };
  const load = async force => { rows = await Inst.list(force); if (el.isConnected) draw(); };
  let tt; $('#q', el).oninput = e => { clearTimeout(tt); tt = setTimeout(() => { IV.q = e.target.value; draw(); }, 150); };
  load(true);
};
function instDetail(p, reload) {
  const st = Inst.stat(p), SC = { paid: ['ชำระแล้ว', 'green'], late: ['เกินกำหนด', 'red'], today: ['ครบวันนี้', 'amber'], wait: ['รอชำระ', 'gray'] };
  const ov = sheet(`📆 ${esc(p.product)}`, `<div class="small muted" style="margin:-4px 0 10px">${esc(p.customerName)}${p.phone ? ' · ' + esc(p.phone) : ''} · เปิดสัญญา ${thDate(p.date)}${p.createdBy ? ' โดย ' + esc(p.createdBy) : ''}${p.orderId ? ' · บิล ' + esc(p.orderId) : ''}</div>
    <div class="card" style="padding:10px 12px"><div class="kv"><span>ราคาสินค้า</span><b>${money(p.price)}</b></div><div class="kv"><span>เงินดาวน์</span><b>${money(p.down)}</b></div><div class="kv"><span>ยอดจัดผ่อน</span><b>${money(p.financed)}</b></div><div class="kv"><span>ดอกเบี้ย ${num(p.rate)}% ${p.rateMode === 'total' ? 'ทั้งสัญญา' : 'ต่องวด'}</span><b>${money(p.interest)}</b></div>
      <div class="kv"><span>รวมต้องผ่อน</span><b>${money(p.total)}</b></div><div class="kv"><span>ชำระแล้ว</span><b style="color:var(--green)">${money(p.paid)}</b></div><div class="kv" style="font-size:18px"><span>คงเหลือ</span><b style="color:${st.left ? 'var(--red)' : 'var(--green)'}">${money(st.left)}</b></div>${p.note ? `<div class="tiny muted" style="margin-top:4px">${esc(p.note)}</div>` : ''}</div>
    <div class="scroll-x" style="margin-top:8px"><table class="t"><tr><th>งวด</th><th>ครบกำหนด</th><th class="right">ยอด</th><th class="right">ชำระแล้ว</th><th></th></tr>${st.sc.map(x => `<tr><td>${x.no}</td><td>${thDate(x.due)}</td><td class="right">${money(x.amt, 0)}</td><td class="right">${x.paid ? money(x.paid, 0) : '-'}</td><td>${p.status === 'active' || x.st === 'paid' ? `<span class="tag ${SC[x.st][1]}">${SC[x.st][0]}</span>` : ''}</td></tr>`).join('')}</table></div>`,
    `${p.status === 'active' ? `${isOwner() && !p._pending ? '<button class="btn ghost" id="ix" style="color:var(--red)">ยกเลิกสัญญา</button>' : ''}<button class="btn grow green" id="ipay" style="min-height:52px">ชำระงวด (ไปหน้าขาย)</button>` : `<button class="btn grow ghost" onclick="this.closest('.ov').remove()">ปิด</button>`}`);
  const pb = $('#ipay', ov); if (pb) pb.onclick = () => { ov.remove(); go('pos'); setTimeout(() => instPay(p), 250); };
  const xb = $('#ix', ov); if (xb) xb.onclick = async () => {
    if (!(await confirmDlg('ยกเลิกสัญญาผ่อนนี้? (เงินที่รับไปแล้วไม่ถูกคืนอัตโนมัติ — ถ้าจะคืนเงินดาวน์ ให้คืนเงินที่ใบเสร็จ)', 'ยกเลิกสัญญา', true))) return;
    try { busy(1); await api('instCancel', { id: p.id }); Inst.at = 0; busy(0); ov.remove(); toast('ยกเลิกสัญญาแล้ว'); reload && reload(); } catch (e) { busy(0); toast(e.message, 1); }
  };
}
