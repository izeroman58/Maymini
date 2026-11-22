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
function svcDialog(kind) { return kind === 'in' ? svcDialogIn(kind) : svcDialog2(kind); }
function svcDialogIn(kind) {
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
    <div id="body"></div>`,
    `<button class="btn grow green" id="ok" style="min-height:56px;font-size:18px">เพิ่มลงบิล</button>`, { onClose: () => { if (asking) Display.cancelAsk(); Display.preview(null); } });
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
      <div style="display:flex;justify-content:flex-end;margin:-4px 0 2px">${sndBtn()}</div>${padHTML('npad')}
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
    $$('[data-pk]', ov).forEach(b => b.onclick = () => key(b.dataset.pk));
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
    if (f.photo && S.apiUrl) { try { busy(1, 'กำลังส่งรูปบิล...'); const up = await api('upload', { kind: 'bill', name: `bill_${f.billRef}_${todayISO()}.jpg`, mime: 'image/jpeg', base64: f.photo }); f.fileUrl = up.fileUrl; } catch (e) { toast('ส่งรูปบิลไม่ได้ (' + e.message + ') — บันทึกต่อโดยไม่มีรูป', 1); } busy(0); }
    const job = kind === 'out' ? { type: 'transfer', bank: f.bank, bankName: bank ? bank.name : '', acc: f.acc, accName: f.accName.trim(), amount: principal }
      : kind === 'topup' ? { type: f.carrier === 'TMN' ? 'wallet' : 'topup', carrier: f.carrier, carrierName: car ? car.name : '', phone: f.phone, amount: principal }
      : { type: 'bill', billType: f.billType, ref: f.billRef, contact: f.contact.trim(), amount: principal, fileUrl: f.fileUrl };
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
  el.innerHTML = vhead('ค่าบริการหน้าร้าน', '', 'more') + `
   <div class="card"><h3>⬆️ โอนออก (ลูกค้าให้เงินสด ร้านโอนให้)</h3>${tierTbl('to', c.transferOut)}</div>
   <div class="card"><h3>⬇️ โอนเข้า (ลูกค้าโอนให้ร้าน รับเงินสด)</h3>${tierTbl('ti', c.transferIn)}</div>
   <div class="card"><h3>📱 เติมเงินมือถือ</h3><div class="grid3"><label class="f"><span>ค่าบริการ (บาท)</span><input class="in" type="number" id="tf" value="${c.topupFee}"></label><label class="f"><span>วิธีคิด</span><select class="in" id="tm"><option value="flat">ครั้งละเท่ากัน</option><option value="per">ทุกๆ ... บาท</option></select></label><label class="f"><span>ทุกๆ (บาท)</span><input class="in" type="number" id="ts" value="${c.topupStep}"></label></div><label class="f"><span>เครือข่าย (คั่นด้วย ,)</span><input class="in" id="nw" value="${esc(c.networks.join(', '))}"></label></div>
   <div class="card"><h3>🧾 ชำระบิล</h3><label class="f"><span>ค่าบริการต่อบิล (บาท)</span><input class="in" type="number" id="bf" value="${c.billFee}"></label><label class="f"><span>ประเภทบิล (คั่นด้วย ,)</span><input class="in" id="bt" value="${esc(c.billTypes.join(', '))}"></label></div>
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
    const o = { transferOut: read('to'), transferIn: read('ti'), topupFee: num($('#tf', el).value), topupMode: $('#tm', el).value, topupStep: num($('#ts', el).value) || 100, billFee: num($('#bf', el).value), networks: $('#nw', el).value.split(',').map(x => x.trim()).filter(Boolean), billTypes: $('#bt', el).value.split(',').map(x => x.trim()).filter(Boolean) };
    try { busy(1); await saveSetting('svcCfg', o); busy(0); toast('บันทึกค่าบริการแล้ว'); } catch (e) { busy(0); toast(e.message, 1); }
  };
};

/* ---------- งานรอดำเนินการ (เจ้าของทำ: โอนเงิน / เติม TrueMoney / ชำระบิล) ---------- */
const JOB_T = { transfer: ['💸', 'โอนเงินให้ลูกค้า'], wallet: ['📱', 'เติมเงิน TrueMoney'], bill: ['🧾', 'ชำระบิลแทนลูกค้า'] };
const JOB_ST = { pending: ['รอดำเนินการ', 'amber'], done: ['ทำแล้ว', 'green'], cancelled: ['ยกเลิก', 'gray'] };
async function jobsBadge(box) {
  if (!box) return;
  try { const r = await api('jobs', { status: 'pending', limit: 50 }); const n = r.rows.length; if (!box.isConnected) return;
    box.innerHTML = n ? `<button class="alert red" style="width:100%;border:0;cursor:pointer;text-align:left;margin-bottom:10px;font-size:16px" onclick="go('jobs')">${I(IC.alert, 22)}<div class="grow"><b>งานรอดำเนินการ ${n} รายการ</b><div class="small">${r.rows.slice(0, 3).map(j => (JOB_T[j.type] || ['', j.type])[1] + ' ' + baht(j.amount)).join(' · ')}${n > 3 ? ' …' : ''}</div></div><span style="font-size:22px">›</span></button>` : '';
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
