/* =========================================================
   POS — หน้าจอขายสินค้า (มือถือ / แท็บเล็ต / iPad / คอมพิวเตอร์)
   ========================================================= */
'use strict';
const PAYNAME = { cash: 'เงินสด', transfer: 'โอน/สแกนจ่าย', welfare: 'บัตรสวัสดิการ', credit: 'เงินเชื่อ' };
const PAYCOLOR = { cash: '#0B8A3E', transfer: '#1F5FBF', welfare: '#7B3FB8', credit: '#B86E00' };
const PAYCFG_DEF = { transfer: true, welfare: true, credit: true, promptpay: '', qrImage: '', quick: [20, 50, 100, 500, 1000] };
const PTSCFG_DEF = { enabled: true, bahtPerPoint: 25, pointValue: 1 };
const payCfg = () => cfg('payCfg', PAYCFG_DEF);
const ptsCfg = () => cfg('pointsCfg', PTSCFG_DEF);

(function () {
  const st = document.createElement('style');
  st.textContent = `
.pos{display:flex;height:100vh;height:100dvh;background:#ECEFF1;overflow:hidden}
.pos-l{flex:1;display:flex;flex-direction:column;min-width:0}
.pos-r{width:380px;background:#fff;display:flex;flex-direction:column;border-left:1px solid #DDD;min-height:0}
.pbar{background:var(--red);color:#fff;display:flex;align-items:center;gap:4px;padding:calc(6px + var(--safe-t)) 8px 6px;min-height:56px}
.pbar .ttl{flex:1;font-family:var(--fh);font-size:19px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:4px}
.pbar .iconbtn{color:#fff}
.pbar .badge{background:#fff;color:var(--red);border-radius:99px;font-size:11px;padding:1px 7px;font-weight:700}
.pgrid{flex:1;display:grid;gap:8px;padding:8px;min-height:0;overflow:auto;align-content:start}
.pgrid.fill{align-content:stretch}
.tile{position:relative;border:0;border-radius:6px;background:#F5F5F5;color:#fff;font-family:var(--fh);font-weight:400;font-size:clamp(13px,1.6vw,19px);line-height:1.25;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;cursor:pointer;overflow:hidden;min-height:84px;box-shadow:0 1px 2px rgba(0,0,0,.12);user-select:none;-webkit-user-select:none;transition:transform .06s}
.tile:active{transform:scale(.96)}
.tile.empty{background:#F5F5F5;box-shadow:inset 0 0 0 1px #E0E0E0;cursor:default}
.tile.circle{border-radius:50%;aspect-ratio:1;margin:auto;height:auto;width:min(100%,100%);max-height:100%}
.tile.img{background-size:cover;background-position:center;align-items:flex-end;padding:0}
.tile.img .nm{width:100%;background:rgba(80,80,80,.78);padding:4px 4px 5px}
.tile .pr{position:absolute;top:4px;right:6px;font-size:11px;background:rgba(0,0,0,.35);border-radius:6px;padding:0 5px}
.tile .stack{position:absolute;top:6px;right:8px;opacity:.85}
.tile.edit{outline:2px dashed #FFB300;outline-offset:-3px}
.tile.mv{outline:4px solid #111;outline-offset:-4px;transform:scale(.94);box-shadow:0 0 0 4px #FFB300}
.ptabs{display:flex;background:#fff;border-top:1px solid #DDD;padding-bottom:var(--safe-b)}
.ptabs button{flex:1;border:0;background:none;padding:12px 4px;font-family:var(--fh);font-size:16px;color:#777;border-top:3px solid transparent;cursor:pointer;white-space:nowrap}
.ptabs button.on{color:var(--red);border-top-color:var(--red)}
.thead{display:flex;align-items:center;gap:6px;padding:calc(10px + var(--safe-t)) 10px 10px;border-bottom:1px solid #E0E0E0;min-height:56px}
.thead h3{flex:1;font-size:19px}
.tlist{flex:1;overflow:auto;padding:4px 14px}
.titem{display:flex;gap:8px;padding:10px 0;border-bottom:1px solid #EEE;cursor:pointer;font-size:16px}
.titem .q{color:#888}
.ttot{padding:10px 14px;border-top:1px solid #E0E0E0}
.ttot .kv{border:0;padding:3px 0}
.payb{margin:0 14px calc(14px + var(--safe-b));min-height:72px;font-size:21px;border-radius:8px;background:#7CB342}
.who2{display:flex;align-items:center;gap:8px;background:#fff;color:var(--red-d,#9b0019);border-radius:99px;padding:5px 14px 5px 6px;margin:0 4px;white-space:nowrap;font-family:var(--fh);font-size:16px;font-weight:700;box-shadow:0 1px 3px #0003}
.who2 .ic{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:var(--red);color:#fff}
.who2 b{max-width:180px;overflow:hidden;text-overflow:ellipsis}
.pclock{margin:0 6px;padding:2px 14px;border-radius:12px;background:#0003;color:#fff;font-family:var(--fh);font-size:30px;font-weight:800;line-height:1.15;font-variant-numeric:tabular-nums;letter-spacing:.5px;white-space:nowrap}
.pclock small{font-size:15px;font-weight:600;opacity:.85;margin-left:4px}
@media (max-width:700px){.who2{font-size:14px;padding:4px 10px 4px 5px;gap:6px}.who2 b{max-width:90px}.who2 .ic{width:22px;height:22px}.pclock{font-size:24px;padding:2px 10px}}
@media (max-width:520px){.who2 .ic{display:none}.who2{padding:4px 9px;margin:0 2px}.who2 b{max-width:70px}.pclock{font-size:20px;padding:1px 7px;margin:0 2px}.pclock small{display:none}}
.pop{position:fixed;z-index:60;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);min-width:240px;max-width:min(320px,92vw);overflow:hidden;animation:fi .12s}
.pop button{display:flex;width:100%;align-items:center;gap:12px;border:0;background:#fff;padding:0 18px;min-height:56px;font-size:17px;text-align:left;cursor:pointer;border-bottom:1px solid #F0F0F0}
.pop button:last-child{border-bottom:0}.pop button:active{background:#F2F2F2}
.cashout{margin:6px 14px 0;background:#FFEBEE;color:#B71C1C;border-radius:8px;padding:6px 10px;font-weight:600;font-size:15px}
.cashin .btn#cok{min-height:68px;min-width:min(240px,40%);font-size:21px}
.payb:disabled{background:#C5D9B0}
.cust{display:flex;align-items:center;gap:8px;background:var(--blue-l);color:#123B78;border-radius:10px;padding:6px 10px;margin:8px 14px 0;font-size:14px}
.cartbar{display:none}
.paywrap{flex:1;display:flex;flex-direction:column;background:#fff;min-height:0;overflow:auto}
.paytop{text-align:center;padding:14px 10px 6px}
.paytop .amt{font-family:var(--fh);font-size:clamp(34px,6vw,54px);font-weight:600;line-height:1.1}
.ptypes{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px 16px}
.ptypes button{border:1.5px solid #DDD;background:#FAFAFA;border-radius:8px;padding:10px 4px;font-size:14px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px}
.ptypes button.on{border-color:currentColor;background:#fff;box-shadow:0 0 0 2px currentColor inset}
.qcash{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:6px 16px}
.qcash button{border:1px solid #DDD;background:#F5F5F5;border-radius:6px;min-height:52px;font-size:18px;font-family:var(--fh);cursor:pointer}
.qcash button:active{background:#E0E0E0}
.cashin{display:flex;gap:10px;align-items:flex-end;padding:6px 16px}
.cashin input::-webkit-outer-spin-button,.cashin input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.cashin input{-moz-appearance:textfield;flex:1;border:0;border-bottom:2px solid #7CB342;font-size:26px;font-family:var(--fh);padding:6px 4px;outline:none;min-width:0;background:transparent}
.done{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;text-align:center;background:#fff}
.done .chg{font-family:var(--fh);font-size:clamp(40px,8vw,72px);font-weight:700;color:var(--green);line-height:1}
.kp{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.kp button{min-height:56px;border-radius:12px;border:0;background:#fff;box-shadow:var(--sh);font-family:var(--fh);font-size:22px;cursor:pointer}
.kpv{font-family:var(--fh);font-size:34px;text-align:right;padding:6px 10px;background:#fff;border-radius:12px;min-height:56px}
.swatch{width:34px;height:34px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1.5px #ccc;cursor:pointer}
.swatch.on{box-shadow:0 0 0 3px var(--ink)}
@media (max-width:899px){
  .pos-r{position:fixed;inset:0;width:auto;z-index:45;display:none;border:0}
  .pos.showT .pos-r{display:flex}
  .cartbar{display:flex;align-items:center;gap:10px;background:#fff;border-top:1px solid #DDD;padding:8px 10px}
  .cartbar .btn{flex:1;min-height:52px;font-size:17px;background:#7CB342;border-radius:6px}
  .ptabs button{font-size:14px;padding:10px 2px}
  .tile{min-height:88px}
  .ptypes{grid-template-columns:repeat(2,1fr)}
  .qcash{grid-template-columns:repeat(3,1fr)}
  .paytop{padding:8px 10px 2px}
  .qcash button{min-height:46px}
}`;
  document.head.appendChild(st);
})();

/* ---------- รูปสินค้า ---------- */
const Img = {
  map: LS.get('images', {}),
  get(sku) { return this.map[sku] || ''; },
  async sync() {
    try {
      const r = await api('imagesSince', { since: LS.get('imagesAt', '') });
      if (r.rows.length) { r.rows.forEach(x => { if (x.data) this.map[x.sku] = x.data; else delete this.map[x.sku]; }); LS.set('images', this.map); }
      LS.set('imagesAt', r.now || '');
    } catch (e) { }
  },
  async shrink(file, size = 240) {
    const im = await loadImg(URL.createObjectURL(file));
    const s = Math.min(im.width, im.height), cv = document.createElement('canvas'); cv.width = cv.height = size;
    cv.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, size, size);
    let q = .72, d = cv.toDataURL('image/jpeg', q);
    while (d.length > 30000 && q > .35) { q -= .1; d = cv.toDataURL('image/jpeg', q); }
    return d;
  },
  async save(sku, data) { await api('upsert', { table: 'Images', rows: [{ sku, data }] }); this.map[sku] = data; LS.set('images', this.map); },
  async remove(sku) { await api('remove', { table: 'Images', ids: [sku] }); delete this.map[sku]; LS.set('images', this.map); }
};

/* ---------- คิวส่งบิลขึ้นเซิร์ฟเวอร์ (ขายได้แม้เน็ตหลุด) ---------- */
const Sync = {
  busy: false, timer: null,
  get box() { return LS.get('outbox', []); },
  add(order) { const b = this.box; b.push(order); LS.set('outbox', b); this.badge(); this.flush(); },
  badge() {
    let el = $('#obx'); const n = this.box.length;
    if (!n) { el && el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'obx'; el.className = 'outbox'; el.onclick = () => this.flush(true); document.body.appendChild(el); }
    el.textContent = `รอส่ง ${n} บิล`;
  },
  async flush(manual) {
    if (window.Clock) Clock.flush().catch(() => { });
    if (this.busy || !S.user) return; const b = this.box; if (!b.length) return this.badge();
    this.busy = true;
    try {
      const batch = b.slice(0, 25);
      const r = await api('syncOrders', { orders: batch });
      const ok = new Set(r.saved || []);
      LS.set('outbox', this.box.filter(o => !ok.has(o.id)));
      (r.stock || []).forEach(x => { const p = IDX.bySku[x.sku]; if (p) p.stock = x.stock; });
      if ((r.stock || []).length) LS.set('products', S.products);
      (r.customers || []).forEach(x => { const c = (S.customers || []).find(c => c.id === x.id); if (c) Object.assign(c, x); });
      if (S.customers) LS.set('customers', S.customers);
      if (manual) toast('ส่งข้อมูลแล้ว');
      if (this.box.length) setTimeout(() => this.flush(), 300);
    } catch (e) { if (manual || !e.offline) toast('ส่งบิลไม่สำเร็จ: ' + e.message, 1); }
    this.busy = false; this.badge();
  },
  start() {
    this.badge(); clearInterval(this.timer); this.timer = setInterval(() => this.flush(), 20000);
    if (!this.hooked) { this.hooked = true; document.addEventListener('mm:online', () => this.back()); document.addEventListener('visibilitychange', () => { if (!document.hidden) this.flush(); }); }
    this.flush(); Img.sync(); RP.autoConnect();
  },
  // เน็ตกลับมา: ส่งบิลค้าง แล้วดึงราคา/สินค้า/สิทธิ์ล่าสุด
  async back() {
    if (!S.user) return;
    await this.flush();
    try { await loadProducts(true); await loadSettings(); Img.sync(); if (S.view === 'pos' && !POS.pay) POS.render(); } catch (e) { }
    if (!this.box.length) toast('ออนไลน์แล้ว — ส่งข้อมูลครบ และอัปเดตราคาล่าสุดแล้ว');
  },
};
window.Sync = Sync;

/* ---------- ลูกค้า ---------- */
async function loadCustomers(force) {
  if (!can('customers') && !can('credit')) return S.customers = S.customers || [];
  if (!force && S.customers && Date.now() - (S.customersAt || 0) < 60e3) return S.customers;
  try { S.customers = (await api('list', { table: 'Customers' })).rows; S.customersAt = Date.now(); LS.set('customers', S.customers); }
  catch (e) { S.customers = S.customers || LS.get('customers', []); }
  return S.customers;
}
function pickCustomer(cb) {
  let q = '';
  const ov = sheet('เลือกลูกค้า', `<div class="search"><svg class="s" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input class="in" id="cq" placeholder="ค้นหาชื่อ หรือ เบอร์โทร" inputmode="search"></div>
    <div class="list" id="cl" style="margin-top:10px"><div class="empty"><span class="spin dark"></span></div></div>`,
    `<button class="btn green block" id="cn">${I(IC.userplus, 18)} เพิ่มลูกค้าใหม่</button>`);
  const draw = () => {
    const t = norm(q), all = S.customers || [];
    const res = all.filter(c => !t || norm(c.name + c.phone).includes(t) || String(c.phone).replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')).slice(0, 60);
    $('#cl', ov).innerHTML = res.length ? res.map(c => `<div class="item" data-id="${esc(c.id)}"><div class="av">${esc(Array.from(c.name || '?')[0])}</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="m">${esc(c.phone || '-')} · ${num(c.points)} แต้ม${num(c.credit) ? ` · <span style="color:var(--amber)">ค้าง ${money(c.credit)}</span>` : ''}</div></div></div>`).join('') : `<div class="empty">ไม่พบลูกค้า${q ? ' “' + esc(q) + '”' : ''}</div>`;
    $$('[data-id]', ov).forEach(x => x.onclick = () => { ov.remove(); cb(all.find(c => c.id === x.dataset.id)); });
  };
  $('#cq', ov).oninput = e => { q = e.target.value; draw(); };
  $('#cn', ov).onclick = () => customerForm({ name: /\d/.test(q) ? '' : q, phone: /\d/.test(q) ? q : '' }, c => { ov.remove(); cb(c); });
  loadCustomers().then(draw);
  setTimeout(() => $('#cq', ov).focus(), 150);
}
function customerForm(c0, done) {
  const isNew = !c0 || !c0.id; const c = { ...(c0 || {}) };
  const ov = sheet(isNew ? 'ลูกค้าใหม่' : 'แก้ไขลูกค้า', `<label class="f"><span>ชื่อลูกค้า *</span><input class="in" id="c_name" value="${esc(c.name)}"></label>
    <label class="f"><span>เบอร์โทร</span><input class="in" id="c_phone" type="tel" inputmode="tel" value="${esc(c.phone)}"></label>
    <label class="f"><span>วงเงินเชื่อสูงสุด (เว้นว่าง = ไม่จำกัด)</span><input class="in" id="c_creditLimit" type="number" value="${esc(c.creditLimit)}"></label>
    <label class="f"><span>หมายเหตุ</span><input class="in" id="c_note" value="${esc(c.note)}"></label>`, `<button class="btn block" id="sv">บันทึก</button>`);
  $('#sv', ov).onclick = async () => {
    const o = { id: c.id || Logic.uid('C'), createdAt: c.createdAt }; ['name', 'phone', 'creditLimit', 'note'].forEach(k => o[k] = $('#c_' + k, ov).value.trim());
    o.phone = o.phone.replace(/[^\d+]/g, '');
    if (!o.name) return toast('กรุณาใส่ชื่อ', 1);
    try { busy(1); await api('upsert', { table: 'Customers', rows: [o] }); await loadCustomers(true); busy(0); ov.remove(); toast('บันทึกลูกค้าแล้ว'); done && done(S.customers.find(x => x.id === o.id) || o); } catch (e) { busy(0); toast(e.message, 1); }
  };
  setTimeout(() => $('#c_name', ov).focus(), 150);
}

/* ---------- PromptPay ---------- */
function crc16(s) { let c = 0xFFFF; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1; c &= 0xFFFF; } return c.toString(16).toUpperCase().padStart(4, '0'); }
function promptpayPayload(id, amount) {
  const f = (t, v) => t + String(v.length).padStart(2, '0') + v;
  id = String(id || '').replace(/\D/g, '');
  let acc;
  if (id.length >= 15) acc = f('03', id); else if (id.length >= 13) acc = f('02', id); else acc = f('01', ('0000000000000' + id.replace(/^0/, '66')).slice(-13));
  let s = f('00', '01') + f('01', amount ? '12' : '11') + f('29', f('00', 'A000000677010111') + acc) + f('53', '764') + (amount ? f('54', num(amount).toFixed(2)) : '') + f('58', 'TH') + '6304';
  return s + crc16(s);
}
async function qrDataUrl(text, cell = 6) {
  const q = new QRLib(-1, 0); q.addData(text); q.make();   // 0 = ระดับแก้ผิด M
  const n = q.getModuleCount(), m = 4, cv = document.createElement('canvas'); cv.width = cv.height = (n + m * 2) * cell;
  const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) x.fillRect((c + m) * cell, (r + m) * cell, cell, cell);
  return cv.toDataURL('image/png');
}
async function payQR(amount) {
  const pc = payCfg();
  if (pc.promptpay) return { img: await qrDataUrl(promptpayPayload(pc.promptpay, amount)), label: 'พร้อมเพย์ ' + pc.promptpay, dynamic: true };
  if (pc.qrImage) return { img: pc.qrImage, label: 'สแกนจ่าย (ใส่ยอดเอง)', dynamic: false };
  return null;
}

/* ---------- แป้นตัวเลข ---------- */
function keypad(title, init, cb, opt = {}) {
  let v = init != null ? String(init) : '';
  const ov = sheet(title, `${opt.sub ? `<div class="small muted" style="margin-bottom:6px">${opt.sub}</div>` : ''}<div class="kpv" id="kv">${v || '0'}</div><div class="kp">${[7, 8, 9, 4, 5, 6, 1, 2, 3].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button data-k=".">.</button><button data-k="0">0</button><button data-k="del">⌫</button></div>`, `<button class="btn green block" id="ok" style="min-height:56px;font-size:18px">ตกลง</button>`);
  const show = () => $('#kv', ov).textContent = v || '0';
  $$('[data-k]', ov).forEach(b => b.onclick = () => { const k = b.dataset.k; if (k === 'del') v = v.slice(0, -1); else if (k === '.' && v.includes('.')) return; else if (v.length < 9) v = (v === '0' && k !== '.' ? '' : v) + k; show(); });
  const ok = () => { const n = num(v); if (opt.min != null && n <= opt.min) return toast('กรุณาใส่ตัวเลข', 1); ov.remove(); cb(n); };
  $('#ok', ov).onclick = ok;
  ov.addEventListener('keydown', e => { if (/^[\d.]$/.test(e.key)) { v += e.key; show(); } else if (e.key === 'Backspace') { v = v.slice(0, -1); show(); } else if (e.key === 'Enter') ok(); });
  ov.tabIndex = 0; ov.focus();
}

/* ---------- ขอสิทธิ์ชั่วคราวด้วยรหัสเจ้าของ (สำหรับการกระทำที่ทำในเครื่อง เช่น แก้ราคา ส่วนลด ลบรายการ) ---------- */
async function gate(perm) {
  if (canStrict(perm) || Elev.ok) return true;
  if (S.perms[perm] !== 'pin') { toast('ไม่มีสิทธิ์: ' + ((S.defs[perm] || [])[0] || perm), 1); return false; }
  const pin = await ownerPinDlg((S.defs[perm] || [])[0] || '');
  if (!pin) return false;
  try { busy(1, 'กำลังตรวจรหัส...'); await apiRaw('checkPin', { ownerPin: pin }); busy(0); Elev.set(pin); OfflineAuth.rememberOwnerPin(pin); return true; }
  catch (e) {
    busy(0);
    if (e.offline && await OfflineAuth.checkOwnerPin(pin)) { Elev.set(pin); toast('อนุมัติแบบออฟไลน์'); return true; }
    toast(e.offline ? 'ออฟไลน์: เครื่องนี้ยังไม่เคยบันทึกรหัสเจ้าของ (ให้เจ้าของเข้าระบบ/อนุมัติแบบออนไลน์ในเครื่องนี้ 1 ครั้ง)' : e.message.replace(/^PIN_\w+:\s*/, ''), 1); return false;
  }
}

/* ---------- POS ---------- */
const TILE_COLORS = ['#43A047', '#7CB342', '#C0CA33', '#FB8C00', '#F4511E', '#E53935', '#D81B60', '#8E24AA', '#3949AB', '#1E88E5', '#00ACC1', '#00897B', '#6D4C41', '#757575', '#E0E0E0'];
const POS = {
  t: LS.get('ticket', null) || { items: [], customer: null, discount: null, pointsUse: 0 },
  tab: LS.get('posTab', 0), cat: null, edit: false, pay: null,
  layout() {
    const def = { cols: 5, rows: 4, pages: [{ name: 'ขายบ่อย', tiles: [] }] };
    const L = cfg('posLayout', def); if (!L.pages || !L.pages.length) L.pages = def.pages;
    if (!L.pages[0].tiles.length && !S.settings.posLayout) {
      // เริ่มต้น: สินค้าขายดี ถ้าไม่มี ใช้สินค้าที่ไม่มีบาร์โค้ด (ของสด/ขนมราคาเดียว) ซึ่งต้องกดจากหน้าจอบ่อยที่สุด
      let pick = S.products.filter(p => p.bestseller === 'Y');
      if (pick.length < 6) pick = pick.concat(S.products.filter(p => !p.barcode && p.available !== 'N' && p.bestseller !== 'Y').sort((a, b) => (/ของสด/.test(b.category) - /ของสด/.test(a.category)) || a.name.localeCompare(b.name, 'th')));
      L.pages[0].tiles = pick.slice(0, L.cols * L.rows).map(p => ({ t: 'p', ref: p.sku }));
    }
    return L;
  },
  save() { LS.set('ticket', this.t); this.renderTicket(); this.pushDisplay(); },
  totals() {
    const sub = this.t.items.reduce((s, it) => s + num(it.qty) * num(it.price), 0);
    let disc = 0; const d = this.t.discount;
    if (d) disc = d.type === 'pct' ? sub * num(d.value) / 100 : num(d.value);
    const pc = ptsCfg(); const ptsDisc = this.t.customer && this.t.pointsUse ? num(this.t.pointsUse) * num(pc.pointValue) : 0;
    disc = Math.min(sub, Math.round((disc + ptsDisc) * 100) / 100);
    const total = Math.round((sub - disc) * 100) / 100;
    const cost = this.t.items.reduce((s, it) => s + num(it.qty) * num(it.cost), 0);
    const count = this.t.items.reduce((s, it) => s + (it.byWeight === 'Y' ? 1 : num(it.qty)), 0);
    return { sub, disc, total, cost, count };
  },
  add(p, o = {}) {
    if (!p) return;
    const go = (price, qty) => {
      const same = !o.price && p.byWeight !== 'Y' && this.t.items.find(it => it.sku === p.sku && num(it.price) === num(price));
      if (same) same.qty = num(same.qty) + (qty || 1);
      else this.t.items.push({ sku: p.sku, name: p.name, price: num(price), qty: qty || 1, cost: num(p.cost), cat: p.category || '', byWeight: p.byWeight === 'Y' ? 'Y' : '' });
      this.lastAdded = this.t.items.length - 1;
      this.save();
      if (!o.silent) beep();
    };
    if (o.price != null) return go(o.price, 1);
    if (p.byWeight === 'Y') return keypad('น้ำหนัก (กก.) — ' + esc(p.name), '', w => go(p.price || 0, w), { min: 0, sub: `ราคา ${baht(p.price)} / กก.` });
    if (!num(p.price)) return keypad('ระบุราคา — ' + esc(p.name), '', v => go(v, 1), { min: 0 });
    go(p.price, 1);
  },
  scan(code) {
    const f = findByCode(code);
    if (!f) { toast('ไม่พบสินค้า ' + code, 1); if (can('editProducts') && !isKiosk()) setTimeout(() => confirmDlg(`ไม่พบบาร์โค้ด <b>${esc(code)}</b> — เพิ่มเป็นสินค้าใหม่?`, 'เพิ่มสินค้า').then(y => y && editProduct({ barcode: code })), 200); return false; }
    this.add(f.p, f.price != null ? { price: f.price } : {}); return true;
  },
  newTicket() { this.t = { items: [], customer: null, discount: null, pointsUse: 0 }; this.pay = null; this.save(); this.render(); },

  /* --- render --- */
  mount(el) {
    this.el = el;
    el.innerHTML = `<div class="pos" id="pos">
      <div class="pos-l"><div class="pbar"><button class="iconbtn" id="pm">${I(IC.menu, 24)}</button>${isKiosk() ? '' : `<button class="iconbtn" onclick="go('home')" title="Back to management">${I(IC.home, 22)}</button>`}<div class="ttl" id="pt"></div><span class="netpill"></span>
        <div class="who2" title="แคชเชียร์"><span class="ic">${I(IC.user, 16)}</span><b>${esc(S.user.name)}</b></div><div class="pclock" id="pclk" title="เวลา กรุงเทพฯ"></div>
        <button class="iconbtn" id="psvc" title="Services">${I('<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', 22)}</button>
        <button class="iconbtn" id="ps" title="Search">${I(IC.search, 22)}</button><button class="iconbtn" id="pcam" title="Camera scan">${I(IC.scan, 22)}</button>${FS.btn()}<button class="iconbtn tb" onclick="switchUser()" title="Switch user">${I(IC.switchu, 22)}</button></div>
        <div id="pmain" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>
        <div class="cartbar" id="cbar"></div></div>
      <div class="pos-r" id="pr"></div></div>`;
    $('#pm', el).onclick = () => this.menu();
    $('#psvc', el).onclick = () => svcMenu();
    const tick = () => { const c = $('#pclk', el); if (c) c.innerHTML = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }) + '<small>น.</small>'; };
    tick(); clearInterval(this.clk); this.clk = setInterval(tick, 10000);
    $('#ps', el).onclick = () => this.search();
    $('#pcam', el).onclick = () => openScanner((code, ctx) => { const ok = this.scan(code); ctx.showLast(ok ? `<b>${esc(this.t.items[this.lastAdded].name)}</b> · รวม ${baht(this.totals().total)}` : 'ไม่พบ ' + esc(code)); return ''; }, { continuous: true, title: 'สแกนขายสินค้า' });
    // เครื่องยิงบาร์โค้ด USB/Bluetooth/Serial — รับผ่านตัวรับกลาง (js/scanner.js)
    Scanner.on('pos', code => {
      if (this.pay && this.pay.done) this.newTicket();           // ยิงชิ้นถัดไปได้เลยหลังรับเงิน = เริ่มบิลใหม่
      else if (this.pay) { Scanner.err(); return toast('กำลังชำระเงิน — กด “กลับ” ก่อนเพิ่มสินค้า', 1); }
      if (!this.scan(code)) Scanner.err();
    });
    const ps = () => this.render();
    document.addEventListener('mm:settings', ps);
    S.cleanup = () => { document.removeEventListener('mm:settings', ps); };
    this.render();
    if (!S.products.length) loadProducts(true).then(() => this.render()).catch(e => toast(e.message, 1)); else { buildIndex(); loadProducts().catch(() => { }); }
    loadCustomers();
  },
  render() { if (!this.el || S.view !== 'pos') return; if (this.pay) this.renderPay(); else this.renderGrid(); this.renderTicket(); },
  renderGrid() {
    const L = this.layout(); const tabs = L.pages.map(p => p.name).concat(['หมวดหมู่', '☰']);
    if (this.tab >= tabs.length) this.tab = 0;
    const isPage = this.tab < L.pages.length, isCat = this.tab === L.pages.length, isAll = this.tab === L.pages.length + 1;
    $('#pt', this.el).textContent = isCat && this.cat ? this.cat : tabs[this.tab] === '☰' ? 'สินค้าทั้งหมด' : tabs[this.tab];
    const narrow = innerWidth < 900;
    const cols = narrow ? Math.min(L.cols, innerWidth < 420 ? 3 : 4) : L.cols;
    let html = '';
    if (isPage) {
      const pg = L.pages[this.tab]; const n = L.cols * L.rows;
      for (let i = 0; i < n; i++) html += this.tileHTML(pg.tiles[i], i);
      if (!this.edit && !pg.tiles.some(Boolean)) html = `<div style="grid-column:1/-1;grid-row:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#777;text-align:center;gap:10px">${I(IC.grid, 40)}<div>ยังไม่มีปุ่มลัดในหน้านี้</div>${can('editProducts') ? '<button class="btn sm" id="ed1">ตั้งค่าปุ่มลัด</button>' : '<div class="small">ให้เจ้าของร้านตั้งค่า หรือใช้แท็บ หมวดหมู่ / ค้นหา</div>'}</div>`;
    } else if (isCat && !this.cat) {
      const ed = this.edit ? ' edit' : '';
      html = this.catSlots(L).map((name, i) => {
        if (!name) return `<button class="tile empty${ed}" data-ci="${i}">${this.edit ? '<span style="color:#999;font-size:28px">+</span>' : ''}</button>`;
        const col = catColor(name), light = /^#(E0E0E0|EEE|F[0-9A-F]{5})$/i.test(col || '');
        return `<button class="tile${ed}${this.mv === i ? ' mv' : ''}" data-ci="${i}" style="background:${col};${light ? 'color:#333' : ''}"><span class="stack">${I('<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>', 18)}</span>${esc(name)}</button>`;
      }).join('');
    } else if (isCat) {
      const color = catColor(this.cat);
      html = `<button class="tile" data-back style="background:#fff;color:#555">${I(IC.back, 28)}<br>กลับ</button>` + S.products.filter(p => (p.category || '') === this.cat && p.available !== 'N').sort((a, b) => a.name.localeCompare(b.name, 'th')).map(p => this.prodTile(p, color)).join('');
    }
    if (isAll) {
      $('#pmain', this.el).innerHTML = `<div style="padding:8px"><input class="in" id="aq" placeholder="ค้นหาชื่อ / บาร์โค้ด" value="${esc(this.aq || '')}"></div><div class="list" id="al" style="margin:0 8px 8px;overflow:auto;flex:1"></div>` + this.tabsHTML(tabs);
      const drawAll = () => {
        const res = searchProducts(this.aq || '').filter(p => p.available !== 'N').slice(0, 150);
        $('#al', this.el).innerHTML = res.map(p => `<div class="item" data-sku="${esc(p.sku)}" style="padding:10px 12px">${Img.get(p.sku) ? `<img src="${Img.get(p.sku)}" style="width:40px;height:40px;border-radius:8px;object-fit:cover">` : `<div class="av" style="background:${catColor(p.category)};color:#fff">${esc(Array.from(p.name)[0] || '')}</div>`}<div class="grow"><div class="t">${esc(p.name)}</div><div class="m">${esc(p.barcode || p.sku)}${p.trackStock === 'Y' ? ' · คงเหลือ ' + num(p.stock) : ''}</div></div><div class="price" style="font-size:16px">${num(p.price) ? baht(p.price) : 'ตัวแปร'}</div></div>`).join('') || '<div class="empty">ไม่พบสินค้า</div>';
        $$('#al [data-sku]', this.el).forEach(r => r.onclick = () => this.add(IDX.bySku[r.dataset.sku]));
      };
      $('#aq', this.el).oninput = e => { this.aq = e.target.value; drawAll(); };
      drawAll();
    } else {
      const catGrid = isCat && !this.cat, fill = (isPage || (catGrid && this.catSlots(L).length <= L.cols * L.rows)) && !narrow;
      const editBar = this.edit && (isPage || catGrid);
      $('#pmain', this.el).innerHTML = `<div class="pgrid ${fill ? 'fill' : ''}" style="grid-template-columns:repeat(${cols},1fr);${fill ? `grid-template-rows:repeat(${L.rows},1fr)` : 'grid-auto-rows:minmax(88px,auto)'}">${html}</div>` +
        (editBar && isPage ? `<div class="row wrap" style="padding:6px 8px;background:#FFF8E1;gap:6px"><b class="small grow">โหมดแก้ไขหน้าขาย — แตะช่องเพื่อแก้</b><button class="btn ghost sm" id="pgn">ชื่อหน้า</button><button class="btn ghost sm" id="pga">+ หน้าใหม่</button>${L.pages.length > 1 ? '<button class="btn ghost sm" id="pgd">ลบหน้า</button>' : ''}<button class="btn ghost sm" id="pgs">ตาราง ${L.cols}×${L.rows}</button><button class="btn sm green" id="pge">เสร็จ</button></div>` : '')
        + (editBar && catGrid ? `<div class="row wrap" style="padding:6px 8px;background:#FFF8E1;gap:6px"><b class="small grow">${this.mv != null ? '👉 แตะช่องปลายทางเพื่อย้าย/สลับ' : 'แก้ตำแหน่งหมวดหมู่ — แตะหมวดแล้วแตะช่องปลายทาง · แตะช่องว่างเพื่อเพิ่ม'}</b><button class="btn ghost sm" id="cgr">เรียงอัตโนมัติ</button><button class="btn ghost sm" id="pgs">ตาราง ${L.cols}×${L.rows}</button><button class="btn sm green" id="pge">เสร็จ</button></div>` : '') + this.tabsHTML(tabs);
      const ed1 = $('#ed1', this.el); if (ed1) ed1.onclick = async () => { if (await gate('editProducts')) { this.edit = true; this.render(); } };
      $$('[data-i]', this.el).forEach(b => {
        const i = +b.dataset.i; let pressT;
        b.onclick = () => { if (this.edit) return this.editTile(i); const t = L.pages[this.tab].tiles[i]; if (!t) return; if (t.t === 'c') { this.tab = L.pages.length; this.cat = t.ref; LS.set('posTab', this.tab); this.render(); } else this.add(IDX.bySku[t.ref]); };
        if (can('editProducts')) { b.addEventListener('pointerdown', () => pressT = setTimeout(async () => { if (!(await gate('editProducts'))) return; this.edit = true; this.render(); navigator.vibrate && navigator.vibrate(30); }, 700)); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(pressT))); }
      });
      $$('[data-cat]', this.el).forEach(b => b.onclick = () => { this.cat = b.dataset.cat; this.render(); });
      $$('[data-ci]', this.el).forEach(b => {
        const i = +b.dataset.ci; let pressT;
        b.onclick = () => {
          const slots = this.catSlots(L);
          if (!this.edit) { if (slots[i]) { this.cat = slots[i]; this.render(); } return; }
          if (this.mv != null) { const j = this.mv; this.mv = null; if (j !== i) { [slots[i], slots[j]] = [slots[j], slots[i]]; L.catTiles = slots; return saveL(); } return this.render(); }
          if (slots[i]) { this.mv = i; return this.render(); }
          this.pickCat(L, i);
        };
        if (can('editProducts')) { b.addEventListener('pointerdown', () => pressT = setTimeout(async () => { if (this.edit || !(await gate('editProducts'))) return; this.edit = true; this.mv = null; this.render(); navigator.vibrate && navigator.vibrate(30); }, 700)); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(pressT))); }
      });
      const saveL = () => this.saveLayout(L);
      $$('[data-back]', this.el).forEach(b => b.onclick = () => { this.cat = null; this.render(); });
      $$('[data-sku]', this.el).forEach(b => b.onclick = () => this.add(IDX.bySku[b.dataset.sku]));
      if (this.edit) {
        const save = () => this.saveLayout(L);
        $('#pge', this.el).onclick = () => { this.edit = false; this.mv = null; this.render(); };
        const cgr = $('#cgr', this.el); if (cgr) cgr.onclick = async () => { if (!(await confirmDlg('เรียงหมวดหมู่ใหม่ตามลำดับเดิมของระบบ (ล้างตำแหน่งที่จัดไว้)?', 'เรียงใหม่'))) return; L.catTiles = []; save(); };
        if (catGrid) { $('#pgs', this.el).onclick = () => this.gridSizeDlg(L, save); }
        if (isPage) $('#pgn', this.el).onclick = () => { const ov = sheet('ชื่อหน้า', `<input class="in" id="nm" value="${esc(L.pages[this.tab].name)}">`, '<button class="btn block" id="ok">บันทึก</button>'); $('#ok', ov).onclick = () => { L.pages[this.tab].name = $('#nm', ov).value.trim() || 'หน้า'; ov.remove(); save(); }; };
        if (isPage) $('#pga', this.el).onclick = () => { L.pages.push({ name: 'หน้า ' + (L.pages.length + 1), tiles: [] }); this.tab = L.pages.length - 1; save(); };
        const d = $('#pgd', this.el); if (d) d.onclick = async () => { if (await confirmDlg('ลบหน้านี้?', 'ลบ', true)) { L.pages.splice(this.tab, 1); this.tab = 0; save(); } };
        if (isPage) $('#pgs', this.el).onclick = () => this.gridSizeDlg(L, save);
      }
    }
    $$('.ptabs [data-tab]', this.el).forEach(b => b.onclick = () => { this.tab = +b.dataset.tab; this.cat = null; this.mv = null; LS.set('posTab', this.tab); this.render(); });
  },
  // ตำแหน่งหมวดหมู่ในแท็บ "หมวดหมู่" (จัดวางเองได้เหมือนหน้าขายบ่อย) — หมวดใหม่จะเติมช่องว่างแรกให้อัตโนมัติ
  // บันทึกผังหน้าขาย: แสดงผลทันที แล้วส่งขึ้นเซิร์ฟเวอร์เบื้องหลัง
  saveLayout(L) {
    S.settings.posLayout = JSON.stringify(L); LS.set('settings', S.settings); this.render();
    clearTimeout(this.lt); this.lt = setTimeout(() => saveSetting('posLayout', L).catch(e => toast('บันทึกผังหน้าขายไม่สำเร็จ: ' + e.message, 1)), 400);
  },
  catSlots(L) {
    const all = (S.categories.length ? S.categories.map(c => c.name) : [...new Set(S.products.map(p => p.category).filter(Boolean))]);
    const has = new Set(all), slots = (L.catTiles || []).map(n => (n && has.has(n) ? n : null));
    const placed = new Set(slots.filter(Boolean));
    all.forEach(n => { if (placed.has(n)) return; const k = slots.indexOf(null); if (k >= 0 && k < Math.max(slots.length, L.cols * L.rows)) slots[k] = n; else slots.push(n); placed.add(n); });
    const n = Math.max(L.cols * L.rows, Math.ceil(slots.length / L.cols) * L.cols);
    while (slots.length < n) slots.push(null);
    return slots;
  },
  pickCat(L, i) {
    const slots = this.catSlots(L);
    const ov = sheet('เลือกหมวดหมู่ใส่ช่องนี้', `<div class="small muted" style="margin:-4px 0 8px">หมวดที่อยู่ช่องอื่นแล้วจะถูกย้ายมาช่องนี้</div><div class="grid2">${(S.categories.length ? S.categories : slots.filter(Boolean).map(n => ({ name: n }))).map(c => `<button class="btn" data-n="${esc(c.name)}" style="background:${catColor(c.name)};min-height:56px">${esc(c.name)}</button>`).join('')}</div>`);
    $$('[data-n]', ov).forEach(b => b.onclick = async () => { const nm = b.dataset.n, j = slots.indexOf(nm); if (j >= 0) slots[j] = null; slots[i] = nm; L.catTiles = slots; ov.remove(); this.saveLayout(L); });
  },
  gridSizeDlg(L, save) {
    const ov = sheet('ขนาดตาราง', `<div class="grid2"><label class="f"><span>คอลัมน์</span><input class="in" type="number" id="c" min="2" max="8" value="${L.cols}"></label><label class="f"><span>แถว</span><input class="in" type="number" id="r" min="2" max="8" value="${L.rows}"></label></div><div class="small muted">ใช้กับทั้งหน้าขายบ่อยและแท็บหมวดหมู่</div>`, '<button class="btn block" id="ok">บันทึก</button>');
    $('#ok', ov).onclick = () => { L.cols = Math.max(2, Math.min(8, +$('#c', ov).value)); L.rows = Math.max(2, Math.min(8, +$('#r', ov).value)); ov.remove(); save(); };
  },
  tabsHTML(tabs) { return `<div class="ptabs">${tabs.map((t, i) => `<button data-tab="${i}" class="${i === this.tab ? 'on' : ''}">${t === '☰' ? I(IC.grid, 22) : esc(t)}</button>`).join('')}</div>`; },
  prodTile(p, color) {
    const img = Img.get(p.sku);
    return img ? `<button class="tile img" data-sku="${esc(p.sku)}" style="background-image:url(${img})"><span class="pr">${num(p.price) ? money(p.price, 0) : '?'}</span><span class="nm">${esc(p.name)}</span></button>`
      : `<button class="tile" data-sku="${esc(p.sku)}" style="background:${color}"><span class="pr">${num(p.price) ? money(p.price, 0) : '?'}</span>${esc(p.name)}</button>`;
  },
  tileHTML(t, i) {
    const ed = this.edit ? ' edit' : '';
    if (!t) return `<button class="tile empty${ed}" data-i="${i}">${this.edit ? `<span style="color:#999;font-size:28px">+</span>` : ''}</button>`;
    const shape = t.shape === 'circle' ? ' circle' : '';
    if (t.t === 'c') return `<button class="tile${shape}${ed}" data-i="${i}" style="background:${t.color || catColor(t.ref)}"><span class="stack">${I('<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>', 18)}</span>${esc(t.label || t.ref)}</button>`;
    const p = IDX.bySku[t.ref]; if (!p) return `<button class="tile empty${ed}" data-i="${i}"><span class="tiny muted">ไม่พบสินค้า</span></button>`;
    const img = t.noImg ? '' : Img.get(p.sku);
    if (img) return `<button class="tile img${shape}${ed}" data-i="${i}" style="background-image:url(${img})"><span class="nm">${esc(t.label || p.name)}</span></button>`;
    return `<button class="tile${shape}${ed}" data-i="${i}" style="background:${t.color || catColor(p.category)};${(t.color || '') === '#E0E0E0' ? 'color:#333' : ''}">${esc(t.label || p.name)}</button>`;
  },
  editTile(i) {
    const L = this.layout(), pg = L.pages[this.tab], t = { t: 'p', shape: 'square', ...(pg.tiles[i] || {}) };
    const ov = sheet('แก้ไขปุ่มลัด', `<div class="seg" id="tt"><button data-t="p">สินค้า</button><button data-t="c">หมวดหมู่</button></div>
      <div id="refw" style="margin-top:10px"></div>
      <label class="f" style="margin-top:10px"><span>ชื่อบนปุ่ม (เว้นว่าง = ใช้ชื่อสินค้า)</span><input class="in" id="lb" value="${esc(t.label || '')}"></label>
      <div class="small muted" style="margin-bottom:6px">สี (กรณีไม่มีรูป)</div><div class="row wrap" id="sw">${TILE_COLORS.map(c => `<span class="swatch ${t.color === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></span>`).join('')}<span class="swatch ${!t.color ? 'on' : ''}" data-c="" title="ตามหมวด" style="background:conic-gradient(#43A047,#1E88E5,#E53935,#43A047)"></span></div>
      <div class="seg" id="sh" style="margin-top:12px"><button data-s="square">สี่เหลี่ยม</button><button data-s="circle">วงกลม</button></div>
      <label class="row small" style="margin-top:10px" id="nir"><input type="checkbox" id="ni" ${t.noImg ? 'checked' : ''}> ไม่แสดงรูปสินค้า</label>`,
      `<button class="btn ghost grow" id="clr" style="color:var(--red)">ล้างช่องนี้</button><button class="btn grow" id="ok">บันทึก</button>`);
    const seg = (id, key, attr) => { const f = () => $$(`#${id} button`, ov).forEach(b => b.classList.toggle('on', b.dataset[attr] === t[key])); $$(`#${id} button`, ov).forEach(b => b.onclick = () => { t[key] = b.dataset[attr]; f(); if (key === 't') { t.ref = ''; refw(); } }); f(); };
    const refw = () => {
      if (t.t === 'c') { $('#refw', ov).innerHTML = `<select class="in" id="cs">${S.categories.map(c => `<option ${c.name === t.ref ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`; t.ref = t.ref || (S.categories[0] || {}).name; $('#cs', ov).onchange = e => t.ref = e.target.value; $('#nir', ov).style.display = 'none'; return; }
      $('#nir', ov).style.display = '';
      const p = IDX.bySku[t.ref];
      $('#refw', ov).innerHTML = `<div class="row"><div class="grow small">${p ? `<b>${esc(p.name)}</b> · ${baht(p.price)}` : '<span class="muted">ยังไม่เลือกสินค้า</span>'}</div><button class="btn sm" id="pk">เลือกสินค้า</button></div>`;
      $('#pk', ov).onclick = () => { let q = ''; const o2 = sheet('เลือกสินค้า', `<input class="in" id="q" placeholder="ค้นหา..."><div class="list" id="l" style="margin-top:8px"></div>`); const dr = () => { $('#l', o2).innerHTML = searchProducts(q).slice(0, 60).map(p => `<div class="item" data-s="${esc(p.sku)}"><div class="grow"><div class="t">${esc(p.name)}</div><div class="m">${esc(p.category || '')}</div></div><div class="price" style="font-size:15px">${baht(p.price)}</div></div>`).join(''); $$('[data-s]', o2).forEach(x => x.onclick = () => { t.ref = x.dataset.s; o2.remove(); refw(); }); }; $('#q', o2).oninput = e => { q = e.target.value; dr(); }; dr(); setTimeout(() => $('#q', o2).focus(), 100); };
    };
    seg('tt', 't', 't'); seg('sh', 'shape', 's'); refw();
    $$('#sw .swatch', ov).forEach(s => s.onclick = () => { t.color = s.dataset.c; $$('#sw .swatch', ov).forEach(x => x.classList.toggle('on', x === s)); });
    const save = () => { ov.remove(); this.saveLayout(L); };
    $('#ok', ov).onclick = () => { if (!t.ref) return toast('กรุณาเลือก' + (t.t === 'c' ? 'หมวดหมู่' : 'สินค้า'), 1); t.label = $('#lb', ov).value.trim(); t.noImg = $('#ni', ov).checked; if (!t.color) delete t.color; pg.tiles[i] = t; save(); };
    $('#clr', ov).onclick = () => { pg.tiles[i] = null; save(); };
  },
  renderTicket() {
    if (!this.el) return;
    const T = this.totals(), t = this.t, c = t.customer;
    const pr = $('#pr', this.el);
    pr.innerHTML = `<div class="thead"><button class="iconbtn" id="tback" style="display:none">${I(IC.back)}</button><h3>ตั๋วออเดอร์</h3><button class="iconbtn" id="tc" title="ลูกค้า">${I(IC.userplus, 24)}</button><button class="iconbtn" id="tm">${I(IC.dots, 24)}</button></div>
      ${c ? `<div class="cust">${I(IC.user, 18)}<div class="grow"><b>${esc(c.name)}</b> ${esc(c.phone || '')}<div class="tiny">${num(c.points)} แต้ม${num(c.credit) ? ' · ค้างชำระ ' + money(c.credit) : ''}${t.pointsUse ? ` · ใช้ ${t.pointsUse} แต้ม` : ''}</div></div><button class="iconbtn" id="cx">${I(IC.x, 18)}</button></div>` : ''}
      <div class="tlist">${t.items.length ? t.items.map((it, i) => `<div class="titem" data-i="${i}"><div class="grow">${esc(it.name)} <span class="q">× ${it.byWeight === 'Y' ? num(it.qty).toFixed(3).replace(/\.?0+$/, '') + ' กก.' : num(it.qty)}</span></div><div class="num">${baht(num(it.qty) * num(it.price))}</div></div>`).join('') : '<div class="empty" style="padding-top:60px">ยังไม่มีสินค้า<br><span class="tiny">แตะปุ่มสินค้า หรือสแกนบาร์โค้ด</span></div>'}</div>
      ${num(t.cashOut) ? `<div class="cashout">💵 ต้องจ่ายเงินสดให้ลูกค้า ${bahtL(t.cashOut)}</div>` : ''}
      <div class="ttot">${T.disc ? `<div class="kv"><span>รวม</span><span>${baht(T.sub)}</span></div><div class="kv"><span>ส่วนลด</span><span style="color:var(--red)">-${baht(T.disc)}</span></div>` : ''}<div class="kv" style="font-size:19px"><b>รวมทั้งหมด</b><b>${baht(T.total)}</b></div></div>
      ${this.pay ? '' : `<button class="btn payb" id="pay" ${t.items.length ? '' : 'disabled'}>ชำระเงิน</button>`}`;
    const cb = $('#cbar', this.el);
    if (cb) cb.innerHTML = this.pay ? '' : `<button class="iconbtn" id="cbt" style="position:relative">${I(IC.cart, 26)}<span class="badge" style="position:absolute;top:-2px;right:-4px;background:var(--red);color:#fff;border-radius:99px;font-size:11px;padding:0 6px">${T.count}</span></button><button class="btn" id="cbp" ${t.items.length ? '' : 'disabled'}>ชำระเงิน ${baht(T.total)}</button>`;
    const narrow = innerWidth < 900;
    if (narrow) { $('#tback', pr).style.display = ''; $('#tback', pr).onclick = () => $('#pos', this.el).classList.remove('showT'); }
    const cbt = $('#cbt', this.el); if (cbt) cbt.onclick = () => $('#pos', this.el).classList.add('showT');
    const cbp = $('#cbp', this.el); if (cbp) cbp.onclick = () => this.startPay();
    const pay = $('#pay', pr); if (pay) pay.onclick = () => this.startPay();
    $('#tc', pr).onclick = () => pickCustomer(cu => { this.t.customer = { id: cu.id, name: cu.name, phone: cu.phone, points: cu.points, credit: cu.credit, creditLimit: cu.creditLimit }; this.t.pointsUse = 0; this.save(); if (this.pay) this.renderPay(); });
    const cx = $('#cx', pr); if (cx) cx.onclick = () => { this.t.customer = null; this.t.pointsUse = 0; this.save(); if (this.pay) this.renderPay(); };
    $('#tm', pr).onclick = () => this.ticketMenu();
    $$('.titem', pr).forEach(r => r.onclick = () => { if (!this.pay) this.editItem(+r.dataset.i); });
  },
  editItem(i) {
    if (this.t.items[i].svc) {
      const it = this.t.items[i];
      return popMenu($$('.titem', this.el)[i], [[`ลบ “${esc(it.name)}”`, async () => { if (!(await gate('clearTicket'))) return; const k = it.svc; this.t.items = this.t.items.filter(x => !(x.svc === k && (x === it || x.sku === 'SVC-FEE' && x.svc === k))); if (k === 'in') this.t.cashOut = 0; this.save(); }]], 'right');
    }
    const it = this.t.items[i]; const pe = canStrict('priceEdit') || Elev.ok, pePin = !pe && S.perms.priceEdit === 'pin';
    const ov = sheet(esc(it.name), `<div class="row" style="justify-content:center;gap:14px;margin:6px 0 14px"><button class="btn ghost" id="m" style="width:60px;font-size:24px">−</button><input class="in center" id="q" type="number" inputmode="decimal" step="any" value="${it.qty}" style="width:120px;font-size:24px;font-family:var(--fh)"><button class="btn ghost" id="p" style="width:60px;font-size:24px">+</button></div>
      <label class="f"><span>ราคาต่อหน่วย ${pe ? '' : pePin ? '' : '(ไม่มีสิทธิ์แก้ราคา)'}</span><div class="row"><input class="in grow" id="pr" type="number" inputmode="decimal" step="any" value="${it.price}" ${pe ? '' : 'readonly'}>${pePin ? `<button class="btn ghost sm" id="unl">🔒 แก้ราคา</button>` : ''}</div></label>`,
      `${can('clearTicket') ? `<button class="btn ghost grow" id="rm" style="color:var(--red)">${I(IC.trash, 18)} ลบ</button>` : ''}<button class="btn grow green" id="ok">ตกลง</button>`);
    const q = $('#q', ov), step = it.byWeight === 'Y' ? .1 : 1; let canPr = pe;
    const unl = $('#unl', ov); if (unl) unl.onclick = async () => { if (await gate('priceEdit')) { canPr = true; $('#pr', ov).readOnly = false; $('#pr', ov).focus(); unl.remove(); } };
    $('#m', ov).onclick = () => q.value = Math.max(step, Math.round((num(q.value) - step) * 1000) / 1000);
    $('#p', ov).onclick = () => q.value = Math.round((num(q.value) + step) * 1000) / 1000;
    $('#ok', ov).onclick = async () => { const v = num(q.value); if (v <= 0) { if (!(await gate('clearTicket'))) return; this.t.items.splice(i, 1); } else { if (v < num(it.qty) && !(await gate('clearTicket'))) return; it.qty = v; if (canPr) it.price = num($('#pr', ov).value); } ov.remove(); this.save(); };
    const rm = $('#rm', ov); if (rm) rm.onclick = async () => { if (!(await gate('clearTicket'))) return; this.t.items.splice(i, 1); ov.remove(); this.save(); };
  },
  ticketMenu() {
    const held = LS.get('held', []);
    const acts = [
      can('discount') && ['ส่วนลดท้ายบิล' + (canStrict('discount') ? '' : ' 🔒'), async () => { if (await gate('discount')) this.discountDlg(); }],
      this.t.customer && ptsCfg().enabled && num(this.t.customer.points) > 0 && ['ใช้แต้มสะสมเป็นส่วนลด', () => this.pointsDlg()],
      this.t.items.length && ['พักบิลนี้', () => { held.push({ ...this.t, at: LocalDB.now() }); LS.set('held', held); this.newTicket(); toast('พักบิลแล้ว'); }],
      held.length && [`เรียกบิลที่พักไว้ (${held.length})`, () => this.heldDlg()],
      this.t.items.length && can('clearTicket') && ['ล้างบิล' + (canStrict('clearTicket') ? '' : ' 🔒'), async () => { if (await gate('clearTicket') && await confirmDlg('ล้างรายการทั้งหมด?', 'ล้าง', true)) this.newTicket(); }]
    ].filter(Boolean);
    popMenu($('#tm', this.el), acts.length ? acts.map(a => [a[0], a[1]]) : [['ไม่มีตัวเลือก', () => { }]], 'right');
  },
  discountDlg() {
    const d = this.t.discount || { type: 'amt', value: '' };
    const ov = sheet('ส่วนลดท้ายบิล', `<div class="seg" id="dt"><button data-t="amt">บาท</button><button data-t="pct">%</button></div><input class="in" id="dv" type="number" inputmode="decimal" step="any" value="${esc(d.value)}" style="margin-top:10px;font-size:22px">`, `<button class="btn ghost grow" id="dx">ไม่มีส่วนลด</button><button class="btn grow green" id="ok">ตกลง</button>`);
    let type = d.type; const f = () => $$('#dt button', ov).forEach(b => b.classList.toggle('on', b.dataset.t === type)); $$('#dt button', ov).forEach(b => b.onclick = () => { type = b.dataset.t; f(); }); f();
    $('#ok', ov).onclick = () => { const v = num($('#dv', ov).value); this.t.discount = v > 0 ? { type, value: v } : null; ov.remove(); this.save(); };
    $('#dx', ov).onclick = () => { this.t.discount = null; ov.remove(); this.save(); };
    setTimeout(() => $('#dv', ov).focus(), 100);
  },
  pointsDlg() {
    const c = this.t.customer, pc = ptsCfg();
    keypad('ใช้แต้ม (มี ' + num(c.points) + ' แต้ม)', '', v => { if (v > num(c.points)) return toast('แต้มไม่พอ', 1); this.t.pointsUse = Math.floor(v); this.save(); }, { sub: `1 แต้ม = ${pc.pointValue} บาท` });
  },
  heldDlg() {
    const held = LS.get('held', []);
    const ov = sheet('บิลที่พักไว้', `<div class="list">${held.map((h, i) => `<div class="item" data-i="${i}"><div class="grow"><div class="t">${h.items.length} รายการ${h.customer ? ' · ' + esc(h.customer.name) : ''}</div><div class="m">${esc(String(h.at).replace('T', ' ').slice(0, 16))}</div></div><div class="price">${baht(h.items.reduce((s, it) => s + it.qty * it.price, 0))}</div></div>`).join('')}</div>`);
    $$('[data-i]', ov).forEach(x => x.onclick = () => { const i = +x.dataset.i; if (this.t.items.length) { held.push({ ...this.t, at: LocalDB.now() }); } const h = held.splice(i, 1)[0]; LS.set('held', held); delete h.at; this.t = h; ov.remove(); this.save(); });
  },
  search() {
    let q = '';
    const ov = sheet('ค้นหาสินค้า', `<input class="in" id="q" placeholder="ชื่อ / บาร์โค้ด / รหัส" inputmode="search"><div class="list" id="l" style="margin-top:8px"></div>`);
    const dr = () => { $('#l', ov).innerHTML = (q ? searchProducts(q) : []).filter(p => p.available !== 'N').slice(0, 60).map(p => `<div class="item" data-s="${esc(p.sku)}"><div class="grow"><div class="t">${esc(p.name)}</div><div class="m">${esc(p.barcode || p.sku)}${p.trackStock === 'Y' ? ' · คงเหลือ ' + num(p.stock) : ''}</div></div><div class="price" style="font-size:16px">${num(p.price) ? baht(p.price) : 'ตัวแปร'}</div></div>`).join(''); $$('[data-s]', ov).forEach(x => x.onclick = () => { this.add(IDX.bySku[x.dataset.s]); toast('เพิ่ม ' + IDX.bySku[x.dataset.s].name); }); };
    $('#q', ov).oninput = e => { q = e.target.value; dr(); };
    $('#q', ov).onkeydown = e => { if (e.key === 'Enter' && q) { if (this.scan(q)) { $('#q', ov).value = q = ''; dr(); } } };
    setTimeout(() => $('#q', ov).focus(), 100);
  },
  async menu() {
    const sh = S.shift, k = isKiosk();
    const acts = [
      !k && ['หน้าหลัก', IC.home, () => go('home')],
      ['ใบเสร็จรับเงิน' + (seesSales() ? '' : ' (วันนี้)'), IC.receipt, () => go('salesreceipts')],
      ['เช็คราคา / สแกน', IC.scan, () => go('scan')],
      ['เครื่องยิงบาร์โค้ด (ทดสอบ/ตั้งค่า)', IC.scan, () => go('scannerset')],
      k && ['สินค้า' + (canStrict('editProducts') ? '' : ' (แก้ไขต้องใช้รหัส)'), IC.box, () => go('products')],
      k && can('stockCount') && ['ตรวจนับสต็อก', IC.count, () => go('stockcount')],
      k && can('customers') && ['ฐานลูกค้า', IC.user, () => go('customers')],
      k && ['พิมพ์ฉลาก/บาร์โค้ด', IC.tag, () => go('labels')],
      ['บริการ โอนเงิน/เติมเงิน/จ่ายบิล', IC.sale, () => svcMenu()],
      ['จอแสดงผลฝั่งลูกค้า', IC.monitor, () => go('displayset')],
      ['เครื่องพิมพ์ใบเสร็จ', IC.print, () => go('printer')],
      can('editProducts') && [this.edit ? 'ปิดโหมดแก้ไขหน้าขาย' : 'แก้ไขหน้าขาย (ปุ่มลัด)' + (canStrict('editProducts') ? '' : ' 🔒'), IC.edit, async () => { if (!this.edit && !(await gate('editProducts'))) return; this.edit = !this.edit; this.mv = null; const L0 = this.layout(); if (this.tab > L0.pages.length || (this.tab === L0.pages.length && this.cat)) { this.tab = 0; this.cat = null; } this.render(); }],
      ['ส่งบิลค้าง' + (Sync.box.length ? ` (${Sync.box.length})` : ''), IC.wifi, () => Sync.flush(true)],
      Elev.ok && ['ล็อกสิทธิ์เจ้าของ', IC.shield, () => { Elev.clear(); toast('ล็อกแล้ว'); }],
      ['สลับผู้ใช้ / ออกจากระบบ', IC.switchu, () => switchUser()]
    ].filter(Boolean);
    popMenu($('#pm', this.el), acts.map(a => [a[0], a[2], a[1]]), 'left');
  },

  /* --- ชำระเงิน --- */
  startPay() {
    if (!this.t.items.length) return;
    if (!can('sell')) return toast('ไม่มีสิทธิ์ขาย', 1);
    this.pay = { type: 'cash', payments: [], split: false };
    $('#pos', this.el).classList.remove('showT');
    this.render();
  },
  paid() { return this.pay.payments.reduce((s, p) => s + num(p.amount), 0); },
  async renderPay() {
    const T = this.totals(), P = this.pay, pc = payCfg(), remain = Math.round((T.total - this.paid()) * 100) / 100;
    $('#pt', this.el).textContent = 'ชำระเงิน';
    const types = ['cash', pc.transfer && 'transfer', pc.welfare && 'welfare', pc.credit && can('credit') && 'credit'].filter(Boolean);
    if (P.done) return this.renderDone();
    const qs = [...new Set([remain].concat(this.quick(remain)))].slice(0, 8);
    const c = this.t.customer;
    let body = '';
    if (P.type === 'cash') body = `<div class="cashin"><span class="muted small" style="padding-bottom:10px">เงินสดรับ</span><input id="cash" type="number" inputmode="decimal" step="any" placeholder="${money(remain)}" ${P.split ? '' : ''}><button class="btn" id="cok" style="background:#7CB342;border-radius:8px">ชำระเงิน</button></div><div class="qcash">${qs.map((v, i) => `<button data-q="${v}" ${i ? '' : 'style="background:#E8F5E9;border-color:#A5D6A7"'}>${i ? '' : '<span style="font-size:12px;display:block;line-height:1">พอดี</span>'}${baht(v)}</button>`).join('')}</div>`;
    else if (P.type === 'transfer') body = `<div class="center" id="qrw" style="padding:6px"><span class="spin dark"></span></div><div style="padding:6px 16px"><button class="btn block" id="tok" style="min-height:56px;background:${PAYCOLOR.transfer}">ได้รับเงินโอนแล้ว ${baht(P.split ? '' : remain)}</button></div>`;
    else if (P.type === 'welfare') body = `<div style="padding:10px 16px"><div class="small muted" style="margin-bottom:8px">รูดบัตร/สแกนผ่านแอปถุงเงิน (EDC) ให้เรียบร้อย แล้วกดยืนยัน</div><button class="btn block" id="wok" style="min-height:56px;background:${PAYCOLOR.welfare}">ยืนยันชำระด้วยบัตรสวัสดิการ</button></div>`;
    else if (P.type === 'credit') body = c ? `<div style="padding:10px 16px"><div class="kv"><span>ลูกค้า</span><b>${esc(c.name)}</b></div><div class="kv"><span>ยอดค้างเดิม</span><b>${money(c.credit)}</b></div><div class="kv"><span>ยอดค้างหลังบิลนี้</span><b style="color:var(--amber)">${money(num(c.credit) + remain)}</b></div>${num(c.creditLimit) && num(c.credit) + remain > num(c.creditLimit) ? `<div class="alert red" style="margin-top:8px">เกินวงเงินเชื่อ ${money(c.creditLimit)}</div>` : ''}<button class="btn block" id="kok" style="min-height:56px;margin-top:10px;background:${PAYCOLOR.credit}">บันทึกขายเงินเชื่อ</button></div>`
      : `<div style="padding:16px" class="center"><div class="small muted" style="margin-bottom:10px">ขายเงินเชื่อต้องเลือกลูกค้าก่อน</div><button class="btn" id="kcu">${I(IC.userplus, 18)} เลือกลูกค้า</button></div>`;
    $('#pmain', this.el).innerHTML = `<div class="paywrap">
      <div class="row" style="padding:6px 8px 0"><button class="btn ghost sm" id="pback">${I(IC.back, 16)} กลับ</button><span class="grow"></span><label class="row small"><input type="checkbox" id="spl" ${P.split ? 'checked' : ''}> แยกชำระหลายวิธี</label></div>
      <div class="paytop"><div class="amt num">${bahtL(remain)}</div>${num(this.t.cashOut) ? `<div class="cashout" style="display:inline-block">💵 จ่ายเงินสดให้ลูกค้า ${bahtL(this.t.cashOut)}</div>` : ''}<div class="muted">${P.payments.length ? `ชำระแล้ว ${baht(this.paid())} · คงเหลือ` : 'จำนวนเงินที่ต้องชำระ'}</div>
        ${P.payments.length ? `<div class="row wrap" style="justify-content:center;gap:6px;margin-top:6px">${P.payments.map((p, i) => `<span class="tag gray">${PAYNAME[p.type]} ${money(p.amount)} <a data-rp="${i}" style="cursor:pointer;color:var(--red)">✕</a></span>`).join('')}</div>` : ''}</div>
      ${P.split ? `<div class="cashin"><span class="muted small" style="padding-bottom:10px">ยอดที่ชำระด้วยวิธีนี้</span><input id="part" type="number" inputmode="decimal" step="any" value="${remain}"></div>` : ''}
      <div class="ptypes">${types.map(k => `<button data-pt="${k}" class="${P.type === k ? 'on' : ''}" style="color:${PAYCOLOR[k]}">${I(k === 'cash' ? IC.sale : k === 'transfer' ? IC.scan : k === 'welfare' ? IC.file : IC.user, 22)}${PAYNAME[k]}</button>`).join('')}</div>
      ${body}</div>`;
    const part = () => P.split ? Math.min(remain, num($('#part', this.el).value) || remain) : remain;
    $('#pback', this.el).onclick = () => { this.pay = null; this.render(); this.pushDisplay(); };
    $('#spl', this.el).onchange = e => { P.split = e.target.checked; this.renderPay(); };
    $$('[data-pt]', this.el).forEach(b => b.onclick = async () => { if (b.dataset.pt === 'credit' && !(await gate('credit'))) return; P.type = b.dataset.pt; this.renderPay(); });
    $$('[data-rp]', this.el).forEach(a => a.onclick = () => { P.payments.splice(+a.dataset.rp, 1); this.renderPay(); });
    const addPay = (type, amount, cash) => {
      P.payments.push({ type, amount: Math.round(amount * 100) / 100 });
      if (cash != null) { P.cash = (P.cash || 0) + cash; P.change = Math.round((cash - amount) * 100) / 100; }
      if (Math.round((T.total - this.paid()) * 100) / 100 <= 0) this.complete(); else { P.type = 'cash'; this.renderPay(); }
    };
    if (P.type === 'cash') {
      const ci = $('#cash', this.el); if (innerWidth >= 900) setTimeout(() => ci.focus(), 50);
      const doCash = v => { const amt = part(); if (v === '' || v == null) v = amt; v = num(v); if (v < amt - 0.001) { if (P.split) return addPay('cash', v, v); return toast('เงินสดรับน้อยกว่ายอดชำระ', 1); } addPay('cash', amt, v); };
      $('#cok', this.el).onclick = () => doCash(ci.value);
      ci.onkeydown = e => { if (e.key === 'Enter') doCash(ci.value); };
      $$('[data-q]', this.el).forEach(b => b.onclick = () => doCash(+b.dataset.q));
    }
    if (P.type === 'transfer') {
      const amt = part();
      let q = null; try { q = await payQR(amt); } catch (e) { }
      const w = $('#qrw', this.el);
      if (w) w.innerHTML = q ? `<img src="${q.img}" style="width:min(240px,48vh);image-rendering:pixelated"><div class="small">${esc(q.label)} · <b>${baht(amt)}</b></div><div class="tiny muted">แสดงบนจอลูกค้าด้วย</div>` : `<div class="alert amber" style="margin:0 16px">ยังไม่ได้ตั้งค่าพร้อมเพย์/รูป QR — เจ้าของร้านตั้งได้ที่ เพิ่มเติม › การชำระเงิน</div>`;
      this.pushDisplay({ mode: 'pay', qr: q && q.img, qrLabel: q && q.label, amount: amt });
      const tok = $('#tok', this.el); if (tok) tok.onclick = () => addPay('transfer', part());
    } else this.pushDisplay({ mode: 'pay', amount: remain });
    const wok = $('#wok', this.el); if (wok) wok.onclick = () => addPay('welfare', part());
    const kok = $('#kok', this.el); if (kok) kok.onclick = () => addPay('credit', part());
    const kcu = $('#kcu', this.el); if (kcu) kcu.onclick = () => $('#tc', this.el).click();
  },
  quick(r) {
    const out = new Set(); [10, 20, 50, 100, 500, 1000].forEach(d => { const v = Math.ceil(r / d) * d; if (v > r) out.add(v); });
    (payCfg().quick || []).forEach(v => { if (v > r) out.add(+v); });
    return [...out].sort((a, b) => a - b).slice(0, 7);
  },
  complete() {
    const T = this.totals(), P = this.pay, t = this.t, c = t.customer, pc = ptsCfg();
    const seq = LS.get('seq', 100000) + 1; LS.set('seq', seq);
    const earned = c && pc.enabled ? Math.floor(T.total / Math.max(1, num(pc.bahtPerPoint))) : 0;
    const types = [...new Set(P.payments.map(p => p.type))];
    const order = {
      id: `${S.device.no || 0}-${seq}`, date: LocalDB.now(), deviceId: S.device.id, deviceName: S.device.name || '',
      cashier: S.user.username, cashierName: S.user.name, customerId: c ? c.id : '', customerName: c ? c.name : '',
      items: JSON.stringify(t.items.map(it => ({ sku: it.sku, name: it.name, qty: it.qty, price: it.price, cost: it.cost, cat: it.cat, byWeight: it.byWeight || '', ...(it.pass ? { pass: 1 } : {}), ...(it.svc ? { svc: it.svc } : {}) }))),
      itemCount: T.count, subtotal: T.sub, discount: T.disc, total: T.total, cost: Math.round(T.cost * 100) / 100,
      payments: JSON.stringify(P.payments), payType: types.length > 1 ? 'split' : types[0], cash: P.cash || '', change: P.change || '',
      pointsEarned: earned, pointsUsed: t.pointsUse || 0, status: 'sale', refundOf: '', note: ''
    };
    // อัปเดตในเครื่องทันที
    t.items.forEach(it => { const p = IDX.bySku[it.sku]; if (p && p.trackStock === 'Y') p.stock = String(Math.round((num(p.stock) - num(it.qty)) * 1000) / 1000); });
    LS.set('products', S.products);
    let cust = null;
    if (c) { cust = (S.customers || []).find(x => x.id === c.id); if (cust) { cust.points = String(Math.max(0, num(cust.points) + earned - num(t.pointsUse))); cust.totalSpent = String(num(cust.totalSpent) + T.total); const cr = P.payments.filter(p => p.type === 'credit').reduce((s, p) => s + p.amount, 0); if (cr) cust.credit = String(num(cust.credit) + cr); LS.set('customers', S.customers); } }
    const printable = { ...order, cashOut: t.cashOut || 0, customerPhone: c ? c.phone : '', pointsBalance: cust ? cust.points : null, creditBalance: cust && P.payments.some(p => p.type === 'credit') ? cust.credit : null };
    const recent = LS.get('recentOrders', []); recent.unshift(printable); LS.set('recentOrders', recent.slice(0, 30));
    Sync.add(order);
    P.done = printable;
    this.renderPay(); this.renderTicket();
    this.pushDisplay({ mode: 'done', total: T.total, change: P.change || 0, cash: P.cash || 0 });
    const pcn = pconn();
    if (pcn.autoPrint && pcn.type !== 'system' && pcn.type !== 'rawbt') RP.printOrder(printable).catch(e => toast('พิมพ์ไม่สำเร็จ: ' + e.message, 1));
  },
  renderDone() {
    const P = this.pay, o = P.done;
    $('#pmain', this.el).innerHTML = `<div class="done">${I(IC.check, 54)}
      ${num(o.change) > 0 ? `<div class="muted">เงินทอน</div><div class="chg num">${bahtL(o.change)}</div><div class="muted">รับ ${baht(o.cash)} · ยอด ${baht(o.total)}</div>` : `<div class="chg num" style="font-size:44px">${bahtL(o.total)}</div><div class="muted">${esc(JSON.parse(o.payments).map(p => PAYNAME[p.type]).join(' + '))}</div>`}
      ${num(o.pointsEarned) ? `<div class="tag blue">${esc(o.customerName)} ได้รับ ${o.pointsEarned} แต้ม</div>` : ''}
      ${num(o.cashOut) ? `<div class="cashout" style="font-size:20px">💵 จ่ายเงินสดให้ลูกค้า ${bahtL(o.cashOut)}</div>` : ''}
      <div class="tiny muted">ใบเสร็จเลขที่ ${esc(o.id)}</div>
      <div class="row" style="gap:10px;margin-top:10px;width:min(420px,100%)"><button class="btn ghost grow" id="prt" style="min-height:56px">${I(IC.print, 20)} พิมพ์ใบเสร็จ</button><button class="btn grow" id="nxt" style="min-height:56px;background:#7CB342;border-radius:6px;font-size:18px">รายการใหม่</button></div></div>`;
    $('#prt', this.el).onclick = () => RP.printOrder(o).catch(e => toast(e.message, 1));
    $('#nxt', this.el).onclick = () => this.newTicket();
    setTimeout(() => { const b = $('#nxt', this.el); b && innerWidth >= 900 && b.focus(); }, 50);
  },
  pushDisplay(extra) {
    if (!window.Display) return;
    const T = this.totals();
    Display.push({ mode: this.t.items.length ? 'cart' : 'idle', items: this.t.items.slice(-60).map(it => ({ n: it.name, q: it.qty, w: it.byWeight, a: Math.round(num(it.qty) * num(it.price) * 100) / 100 })), count: this.t.items.length, sub: T.sub, disc: T.disc, total: T.total, customer: this.t.customer ? this.t.customer.name : '', cashOut: num(this.t.cashOut) || 0, ...(extra || {}) });
  }
};
VIEWS.pos = el => { POS.pay = POS.pay && POS.pay.done ? null : POS.pay; if (POS.pay && POS.pay.done) POS.newTicket(); POS.mount(el); POS.pushDisplay(); };
window.addEventListener('resize', () => { if (S.view === 'pos' && !$('.ov')) { clearTimeout(POS.rt); POS.rt = setTimeout(() => POS.render(), 150); } });

/* ---------- ลงเวลาทำงาน ---------- */
async function clockToggle() {
  if (S.shift || Clock.get(S.user.id)) { if (await clockOutFlow()) S.shift = null; }
  else { try { const r = await Clock.act('clockIn'); toast('ลงเวลาเข้างานแล้ว ' + hhmm(r.inAt) + ' น.'); } catch (e) { toast(e.message, 1); } }
  if (S.view === 'home') go('home');
}

/* ---------- ตั้งค่าการชำระเงิน & แต้ม ---------- */
VIEWS.payset = el => {
  if (ownerOnly(el)) return;
  const pc = payCfg(), pt = ptsCfg(); let qrImg = pc.qrImage || '';
  el.innerHTML = vhead('การชำระเงิน & แต้มสะสม', '', 'more') + `
   <div class="card"><h3>ประเภทการชำระเงิน</h3>
     <label class="row" style="margin-bottom:6px"><input type="checkbox" checked disabled> เงินสด</label>
     <label class="row" style="margin-bottom:6px"><input type="checkbox" id="tr" ${pc.transfer ? 'checked' : ''}> โอน / สแกนจ่าย (แสดง QR บนจอลูกค้า)</label>
     <label class="row" style="margin-bottom:6px"><input type="checkbox" id="wf" ${pc.welfare ? 'checked' : ''}> บัตรสวัสดิการแห่งรัฐ</label>
     <label class="row"><input type="checkbox" id="cr" ${pc.credit ? 'checked' : ''}> เงินเชื่อ (ผูกกับฐานลูกค้า)</label></div>
   <div class="card"><h3>QR รับเงิน</h3>
     <label class="f"><span>หมายเลขพร้อมเพย์ (เบอร์มือถือ หรือ เลขบัตรประชาชน/เลขผู้เสียภาษี) — สร้าง QR พร้อมยอดเงินอัตโนมัติ</span><input class="in" id="pp" inputmode="numeric" value="${esc(pc.promptpay)}"></label>
     <div class="row" style="gap:12px"><div id="qrp" style="width:120px;height:120px;background:#fff;border-radius:10px;box-shadow:inset 0 0 0 1.5px var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden"></div>
       <div class="small"><div class="muted">หรืออัปโหลดรูป QR ของร้าน (เช่น QR แม่มณี/ร้านค้าธนาคาร) ใช้เมื่อไม่ได้ใส่พร้อมเพย์ — ลูกค้าต้องพิมพ์ยอดเอง</div><div class="row" style="margin-top:6px"><label class="btn ghost sm">อัปโหลดรูป QR<input type="file" accept="image/*" id="qf" class="hidden"></label><button class="btn ghost sm" id="qx">ลบรูป</button></div></div></div></div>
   <div class="card"><h3>ปุ่มรับเงินลัด (บาท)</h3><input class="in" id="qk" value="${esc((pc.quick || []).join(', '))}"><div class="tiny muted" style="margin-top:4px">ระบบจะเพิ่มยอดปัดขึ้นอัตโนมัติ (เช่น ยอด 65 → 70, 80, 100, 500)</div></div>
   <div class="card"><h3>แต้มสะสม</h3><label class="row" style="margin-bottom:10px"><input type="checkbox" id="pe" ${pt.enabled ? 'checked' : ''}> เปิดใช้แต้มสะสม</label>
     <div class="grid2"><label class="f"><span>ซื้อทุก ๆ (บาท) ได้ 1 แต้ม</span><input class="in" type="number" id="bp" value="${pt.bahtPerPoint}"></label><label class="f"><span>1 แต้ม แลกเป็นส่วนลด (บาท)</span><input class="in" type="number" step="any" id="pv" value="${pt.pointValue}"></label></div></div>
   <button class="btn block green" id="sv">บันทึก</button>`;
  const prev = async () => { const v = $('#pp', el).value.trim(); $('#qrp', el).innerHTML = v ? `<img src="${await qrDataUrl(promptpayPayload(v, 1), 3)}" style="width:100%">` : qrImg ? `<img src="${qrImg}" style="width:100%">` : '<span class="tiny muted">ไม่มี QR</span>'; };
  $('#pp', el).oninput = () => { clearTimeout(el.t); el.t = setTimeout(prev, 300); };
  $('#qf', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; const im = await loadImg(URL.createObjectURL(f)); const s = Math.min(600, im.width), cv = document.createElement('canvas'); cv.width = s; cv.height = Math.round(im.height * s / im.width); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); qrImg = cv.toDataURL('image/jpeg', .85); if (qrImg.length > 45000) qrImg = cv.toDataURL('image/jpeg', .6); prev(); };
  $('#qx', el).onclick = () => { qrImg = ''; prev(); };
  $('#sv', el).onclick = async () => {
    try {
      busy(1);
      await saveSetting('payCfg', { transfer: $('#tr', el).checked, welfare: $('#wf', el).checked, credit: $('#cr', el).checked, promptpay: $('#pp', el).value.replace(/\D/g, ''), qrImage: qrImg, quick: $('#qk', el).value.split(/[,\s]+/).map(Number).filter(Boolean) });
      await saveSetting('pointsCfg', { enabled: $('#pe', el).checked, bahtPerPoint: num($('#bp', el).value) || 25, pointValue: num($('#pv', el).value) || 1 });
      busy(0); toast('บันทึกแล้ว');
    } catch (e) { busy(0); toast(e.message, 1); }
  };
  prev();
};
