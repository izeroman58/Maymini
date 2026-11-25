/* =========================================================
   POS — หน้าจอขายสินค้า (มือถือ / แท็บเล็ต / iPad / คอมพิวเตอร์)
   ========================================================= */
'use strict';
// จอสัมผัส (แท็บเล็ต/มือถือ): ใช้แป้นบนจอแทนคีย์บอร์ดของเครื่อง
const touchUI = () => matchMedia('(pointer: coarse)').matches;
const PAYNAME = { cash: 'เงินสด', transfer: 'โอน/สแกนจ่าย', welfare: 'บัตรสวัสดิการ', credit: 'เงินเชื่อ' };
const PAYCOLOR = { cash: '#0B8A3E', transfer: '#1F5FBF', welfare: '#7B3FB8', credit: '#B86E00' };
const PAYCFG_DEF = { transfer: true, welfare: true, credit: true, promptpay: '', qrImage: '', qrText: '', quick: [20, 50, 100, 500, 1000] };
const PTSCFG_DEF = { enabled: true, bahtPerPoint: 25, pointValue: 1 };
const payCfg = () => cfg('payCfg', PAYCFG_DEF);
const ptsCfg = () => cfg('pointsCfg', PTSCFG_DEF);

(function () {
  const st = document.createElement('style');
  st.textContent = `
.pos{display:flex;height:100vh;height:100dvh;background:#ECEFF1;overflow:hidden}
.pos-l{flex:1;display:flex;flex-direction:column;min-width:0}
.pos-r{width:380px;background:#fff;display:flex;flex-direction:column;border-left:1px solid #DDD;min-height:0}
.pbar{position:relative;background:var(--red);color:#fff;display:flex;align-items:center;gap:4px;padding:calc(6px + var(--safe-t)) 8px 6px;min-height:56px}
.pbar .ttl{flex:1;font-family:var(--fh);font-size:19px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:4px}
.pbar .iconbtn{color:#fff}
.pbar .pside.r{gap:10px!important}@media (min-width:521px){.pbar{grid-template-columns:minmax(0,1fr) auto minmax(0,1.7fr)!important}}.pbar .pside.r .iconbtn{border-radius:12px}.pbar .pside.r .iconbtn:active{background:#ffffff30}.pbar .pdrw{background:#ffffff1f}@media (max-width:700px){.pbar .pside.r{gap:6px!important}}
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
.tile.drop{outline:4px dashed #111;outline-offset:-6px;filter:brightness(1.1)}
.tile.mv{outline:4px solid #111;outline-offset:-4px;transform:scale(.94);box-shadow:0 0 0 4px #FFB300}
.ptabs{display:flex;background:#fff;border-top:1px solid #DDD;padding-bottom:var(--safe-b)}
.ptabs button{flex:1;border:0;background:none;padding:12px 4px;font-family:var(--fh);font-size:16px;color:#777;border-top:3px solid transparent;cursor:pointer;white-space:nowrap}
.ptabs button.on{color:var(--red);border-top-color:var(--red)}
.thead{display:flex;align-items:center;gap:6px;padding:calc(10px + var(--safe-t)) 10px 10px;border-bottom:1px solid #E0E0E0;min-height:56px}
.thead h3{flex:1;font-size:19px}
.tlist{flex:1;overflow:auto;padding:4px 14px}
.tlist{font-size:var(--tf,16px);contain:strict}.pos-l{contain:layout paint}.titem{display:flex;gap:.4em;padding:.4em 0;border-bottom:1px solid #EEE;cursor:pointer;font-size:1em;line-height:1.3;align-items:baseline;white-space:nowrap}.titem .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.titem .q{font-size:.78em;flex:none}.titem .num{font-weight:700;flex:none}.ttot .tgt{font-size:clamp(22px,3.4vh,30px)}.ttot .tgt b:last-child{font-size:1.15em}
.titem .q{color:#888}
.ttot{padding:10px 14px;border-top:1px solid #E0E0E0}
.ttot .kv{border:0;padding:3px 0}
.pos.dk{background:#232529;color:#E8E8E8}.pos.dk .pbar{background:#9E1420}.pos.dk .pos-r{background:#1B1C1F;border-left-color:#33363B}
.pos.dk .thead{border-bottom-color:#33363B}.pos.dk .thead .iconbtn,.pos.dk .iconbtn{color:#DDD}.pos.dk .pbar .iconbtn{color:#fff}
.pos.dk .titem{border-bottom-color:#2E3135}.pos.dk .titem .q{color:#8E9297}.pos.dk .ttot{border-top-color:#33363B}
.pos.dk .ptabs{background:#1B1C1F;border-top-color:#33363B}.pos.dk .ptabs button{color:#9EA2A8}.pos.dk .ptabs button.on{color:#FF6B76;border-top-color:#FF6B76}
.pos.dk .tile.empty{background:#2A2D31;box-shadow:inset 0 0 0 1px #34373C}.pos.dk .tile{box-shadow:none}.pos.dk .pgrid .empty,.pos.dk .muted{color:#9EA2A8}
.pos.dk .paywrap,.pos.dk .done{background:#1B1C1F;color:#E8E8E8}.pos.dk .ptypes button{background:#26282C;border-color:#3A3D42;color:#E8E8E8}.pos.dk .ptypes button.on{background:#2E3136}
.pos.dk .qcash button,.pos.dk .kp button{background:#2E3136;border-color:#3A3D42;color:#F0F0F0;box-shadow:none}.pos.dk .qcash button:active,.pos.dk .kp button:active{background:#3A3E44}
.pos.dk .qcash button[style]{background:#1F3A24!important;border-color:#2E7D32!important;color:#C8F2C9}.pos.dk .cashin input{color:#fff}.pos.dk .cust{background:#1E3350;color:#CFE1FF}.pos.dk .cartbar{background:#1B1C1F;border-top-color:#33363B}.pos.dk .btn.ghost{background:#2A2D31;color:#E8E8E8;box-shadow:inset 0 0 0 1.5px #3A3D42}
.pos.dk .list{background:#1B1C1F;box-shadow:none}.pos.dk .list .item{border-color:#2E3135;color:#E8E8E8;background:transparent}.pos.dk .list .item:active{background:#2A2D31}.pos.dk .item .m,.pos.dk .empty{color:#9EA2A8}.pos.dk .item .t{color:#EDEDED}.pos.dk .item .price{color:#FF8A93}
.pos.dk .payb:disabled{background:#3D4A33;color:#9AA88E}.pos.dk .kv{border-color:#2E3135}.pos.dk .in{background:#26282C;color:#fff;border-color:#3A3D42}
.payb{margin:0 14px calc(14px + var(--safe-b));min-height:72px;font-size:21px;border-radius:8px;background:#7CB342}
.who2{display:flex;align-items:center;gap:6px;background:transparent;color:#fff;padding:5px 8px;margin:0 4px;white-space:nowrap;font-family:var(--fh);font-size:16px;font-weight:700}
.who2 .ic{display:inline-flex;align-items:center;justify-content:center;color:#fff}
.who2 b{max-width:180px;overflow:hidden;text-overflow:ellipsis}
.pbar{display:grid!important;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}.pside{min-width:0;display:flex;align-items:center;gap:4px;overflow:hidden}.pside.r{justify-content:flex-end}.pside .iconbtn{flex:none}.who2{min-width:0;flex-shrink:1}.who2 b{min-width:0}
.pclock{flex:none;margin:0 6px;padding:2px 14px;border-radius:12px;background:#0003;color:#fff;font-family:var(--fh);font-size:30px;font-weight:800;line-height:1.15;font-variant-numeric:tabular-nums;letter-spacing:.5px;white-space:nowrap}
.pclock small{font-size:15px;font-weight:600;opacity:.85;margin-left:4px}
@media (max-width:700px){.who2{font-size:14px;padding:4px 10px 4px 5px;gap:6px}.who2 b{max-width:90px}.who2 .ic{width:22px;height:22px}.pclock{font-size:24px;padding:2px 10px}}
@media (max-width:520px),(max-height:480px){.pclock{display:none!important}}
@media (max-width:520px){.pbar{grid-template-columns:auto 1fr auto!important}.pbar #psvc,.pbar .fsb,.pbar [data-fs]{display:none}.pbar .iconbtn{width:40px;min-width:40px}.pbar #pcam{background:#ffffff26;border-radius:10px}.pside.l .ttl{display:none}.who2 .ic{display:none}.who2{padding:4px 9px;margin:0 2px}.who2 b{max-width:70px}.pclock{font-size:20px;padding:1px 7px;margin:0 2px}.pclock small{display:none}}
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
.kp{--kk:min(96px,12.5vh,26vw);display:grid;grid-template-columns:repeat(3,var(--kk));gap:10px;margin-top:10px;justify-content:center}.sndt{all:unset;cursor:pointer;font-size:20px;padding:4px 8px;border-radius:10px;opacity:.75}.sndt:active{background:#0001}.cashwrap{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;padding:6px 16px;align-items:start}.cashwrap .qcash{padding:0}.cpad{--kk:min(74px,9.5vh,17vw);margin-top:0}
.kp button{aspect-ratio:1/1;min-height:0;border-radius:16px;border:0;background:#fff;box-shadow:var(--sh);font-family:var(--fh);font-size:clamp(22px,4vh,32px);font-weight:600;cursor:pointer;touch-action:manipulation;user-select:none}.kp button:active{background:#e8ecf1;transform:scale(.96)}
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
Promise.resolve().then(() => { window.Img = Img; Img.load(); });
document.addEventListener('mm:images', () => { clearTimeout(Img.rt); Img.rt = setTimeout(() => { if (S.view === 'pos' && window.POS && POS.el) POS.render(); else if (S.view === 'products' && !$('.ov')) go('products'); }, 300); });
// รูปสินค้าเก็บใน IndexedDB (เก็บได้หลายสิบ MB) — localStorage เต็มเร็วเมื่อมีรูปหลายร้อยรูป ทำให้รูปหายหลังเปิดใหม่
const Img = {
  map: {}, ready: null,
  get(sku) { return this.map[sku] || ''; },
  load() {
    if (this.ready) return this.ready;
    return this.ready = (async () => {
      const c = window.Cache ? await Cache.get('images') : null;
      if (c && c.v) this.map = c.v.map || {}; else { this.map = LS.get('images', {}); LS.del('imagesAt'); }
      LS.del('images'); // ย้ายออกจาก localStorage แล้ว
      if (Object.keys(this.map).length) document.dispatchEvent(new Event('mm:images'));
    })();
  },
  persist() { if (window.Cache) Cache.set('images', { map: this.map, at: this.at || '' }); },
  async sync() {
    await this.load();
    try {
      const c = window.Cache ? await Cache.get('images') : null, since = (c && c.v && c.v.at) || '';
      const r = await api('imagesSince', { since });
      if (r.rows.length) r.rows.forEach(x => { if (x.data) this.map[x.sku] = x.data; else delete this.map[x.sku]; });
      this.at = r.now || since; this.persist();
      if (r.rows.length) document.dispatchEvent(new Event('mm:images'));
    } catch (e) { }
  },
  async shrink(file, size = 240, fit) {
    const im = await loadImg(URL.createObjectURL(file));
    const s = Math.min(im.width, im.height), cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d');
    if (fit === 'contain') { // รูปจากเว็บ: เห็นสินค้าทั้งชิ้น พื้นขาว ไม่ตัดขอบ
      const k = Math.min(size / im.width, size / im.height) * .94, w = im.width * k, h = im.height * k;
      g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.drawImage(im, (size - w) / 2, (size - h) / 2, w, h);
    } else g.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, size, size);
    let q = .72, d = cv.toDataURL('image/jpeg', q);
    while (d.length > 30000 && q > .35) { q -= .1; d = cv.toDataURL('image/jpeg', q); }
    return d;
  },
  async save(sku, data) { await api('upsert', { table: 'Images', rows: [{ sku, data }] }); this.map[sku] = data; this.persist(); },
  async remove(sku) { await api('remove', { table: 'Images', ids: [sku] }); delete this.map[sku]; this.persist(); }
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
      if ((r.inst || []).length && window.Inst) Inst.merge(r.inst);
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
/* QR ร้าน (เช่น แม่มณี/QR ร้านค้าธนาคาร) → ใส่ยอดเงินเข้าไปใน QR (มาตรฐาน Thai QR / EMVCo: tag 54 = ยอด, tag 01 = 12) */
function emvParse(s) { const out = []; let i = 0; s = String(s || ''); while (i + 4 <= s.length) { const id = s.substr(i, 2), n = parseInt(s.substr(i + 2, 2), 10); if (isNaN(n)) return null; out.push([id, s.substr(i + 4, n)]); i += 4 + n; } return i === s.length ? out : null; }
function isThaiQR(s) { const t = emvParse(s); return !!(t && t.some(x => x[0] === '00') && t.some(x => x[0] === '63') && crc16(s.slice(0, -4)) === s.slice(-4).toUpperCase()); }
function amountQR(base, amount) {
  const t = emvParse(base); if (!t) return null;
  const m = new Map(t.filter(x => x[0] !== '63').map(x => [x[0], x[1]]));
  m.set('01', '12'); m.set('54', num(amount).toFixed(2));
  const f = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const s = [...m.keys()].sort().map(k => f(k, m.get(k))).join('') + '6304';
  return s + crc16(s);
}
function qrShopName(base) { const t = emvParse(base) || []; const n = (t.find(x => x[0] === '59') || [])[1]; return n || ''; }
// อ่านข้อความจากรูป QR ของร้าน (ใช้ตัวอ่าน QR ของเบราว์เซอร์ — มีใน Chrome บน Android) แล้วจำไว้ในเครื่อง
async function decodeQRImage(src) {
  if (!('BarcodeDetector' in window)) return '';
  try { const d = new BarcodeDetector({ formats: ['qr_code'] }); const im = await loadImg(src); const r = await d.detect(im); const v = r && r[0] && r[0].rawValue; return v && isThaiQR(v) ? v : ''; } catch (e) { return ''; }
}
async function shopQRText() {
  const pc = payCfg(); if (pc.qrText && isThaiQR(pc.qrText)) return pc.qrText;
  if (!pc.qrImage) return '';
  const memo = LS.get('qrTextMemo', {}); const key = pc.qrImage.length + ':' + pc.qrImage.slice(-40);
  if (memo.k === key) return memo.v || '';
  const v = await decodeQRImage(pc.qrImage); LS.set('qrTextMemo', { k: key, v }); return v;
}
// mode: 'auto' = รวมยอดให้อัตโนมัติ · 'manual' = ลูกค้าใส่ยอดเอง (รูป QR เดิมของร้าน)
// พร้อมเพย์ที่ถูกต้อง: เบอร์มือถือ 10 หลัก · เลขบัตร/ผู้เสียภาษี 13 หลัก · e-Wallet 15 หลัก
const ppOK = id => /^(\d{10}|\d{13}|\d{15})$/.test(String(id || ''));
async function payQR(amount, mode) {
  const pc = { ...payCfg() }; if (!ppOK(pc.promptpay)) pc.promptpay = '';
  const base = pc.promptpay ? '' : await shopQRText();
  const canAuto = !!(pc.promptpay || base), canManual = !!pc.qrImage;
  mode = mode === 'manual' && canManual ? 'manual' : canAuto ? 'auto' : canManual ? 'manual' : '';
  const info = { canAuto, canManual, mode };
  if (mode === 'auto' && pc.promptpay) return { ...info, img: await qrDataUrl(promptpayPayload(pc.promptpay, amount)), label: 'พร้อมเพย์ ' + pc.promptpay + ' · ยอดรวมให้แล้ว', dynamic: true };
  if (mode === 'auto') { const pl = amountQR(base, amount); if (pl) return { ...info, img: await qrDataUrl(pl), label: (qrShopName(base) || S.settings.shopName || 'สแกนจ่าย') + ' · ยอดรวมให้แล้ว', dynamic: true }; }
  if (mode === 'manual' || canManual) return { ...info, mode: 'manual', img: pc.qrImage, label: 'สแกนจ่าย (ลูกค้าใส่ยอดเอง)', dynamic: false };
  return null;
}

/* ---------- แป้นตัวเลข ---------- */
function keypad(title, init, cb, opt = {}) {
  // แป้นตัวเลขแบบลอยเต็มจอ (ปุ่มใหญ่ กดแล้วติดทันทีตอนแตะ ไม่รอปล่อยนิ้ว)
  let v = init != null && init !== '' ? String(init) : '';
  let head = title, label = opt.label || '';
  if (!label && / — /.test(title)) { const i = title.indexOf(' — '); label = title.slice(0, i); head = title.slice(i + 3); }
  if (!label) { label = head; }
  const money = opt.money != null ? opt.money : /ราคา|ค่าบริการ|ชำระ|ยอด|เงิน/.test(label + ' ' + head);
  const dark = LS.get('posDark', true);
  const ov = document.createElement('div'); ov.className = 'ov kpov' + (dark ? ' dk' : ''); if (opt.z) ov.style.zIndex = opt.z;
  const K = (k, t, cls = '') => `<button type="button" data-k="${k}" class="${cls}">${t}</button>`;
  ov.innerHTML = `<div class="kpbox" role="dialog"><div class="kph"><button type="button" class="kpx" data-k="x">✕</button><div class="kpt">${head}</div>${sndBtn()}</div>
    <div class="kpvr"><span class="kpl">${label === head ? '' : label}${opt.sub ? `<small>${opt.sub}</small>` : ''}</span><span class="kpv2" id="kv"></span></div>
    <div class="kpg">${K(1, 1)}${K(2, 2)}${K(3, 3)}${K('del', '⌫', 'kdel')}${K(4, 4)}${K(5, 5)}${K(6, 6)}${K(7, 7)}${K(8, 8)}${K(9, 9)}${K('ok', 'ตกลง', 'kok')}${K(0, 0)}${K('00', '00')}${opt.noDot ? K('c', 'ล้าง') : K('.', '.')}</div></div>`;
  document.body.appendChild(ov);
  const show = () => { $('#kv', ov).textContent = (money ? '฿' : '') + (v || '0'); };
  const close = () => { ov.remove(); document.removeEventListener('keydown', kd, true); const sw = e => { e.stopPropagation(); e.preventDefault(); }; const off = () => { document.removeEventListener('click', sw, true); document.removeEventListener('pointerdown', off, true); }; document.addEventListener('click', sw, true); setTimeout(() => document.addEventListener('pointerdown', off, true), 0); setTimeout(off, 600); };   // กันคลิกทะลุไปโดนหน้าต่างด้านล่าง
  const ok = () => { if (opt.raw) { close(); return cb(v); } const n = num(v); if (opt.min != null && n <= opt.min) { Scanner.err && Scanner.err(); return toast('กรุณาใส่ตัวเลข', 1); } close(); cb(n); };
  const press = k => {
    if (k === 'x') return close(); if (k === 'ok') return ok();
    if (k === 'del') v = v.slice(0, -1); else if (k === 'c') v = '';
    else if (k === '.') { if (v.includes('.')) return; v = (v || '0') + '.'; }
    else if (v.length < (opt.maxLen || 9)) v = (v === '0' && !opt.raw ? '' : v) + k;
    show();
  };
  // pointerdown = ตอบสนองเร็วที่สุด · กันคลิกซ้อน
  ov.addEventListener('pointerdown', e => { const b = e.target.closest('[data-k]'); if (!b) { if (e.target === ov) close(); return; } e.preventDefault(); b.classList.add('dn'); setTimeout(() => b.classList.remove('dn'), 110); press(b.dataset.k); });
  ov.addEventListener('click', e => e.preventDefault());
  const kd = e => { if (!document.body.contains(ov) || e.defaultPrevented) return; if (/^[\d.]$/.test(e.key)) { e.preventDefault(); press(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); press('del'); } else if (e.key === 'Enter') { e.preventDefault(); ok(); } else if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', kd, true);
  show();
  return ov;
}
window.keypad = keypad;
(function () {
  const st = document.createElement('style');
  st.textContent = `.kpov{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:max(10px,2vh);animation:fi .1s;touch-action:none;user-select:none;-webkit-user-select:none}
.kpbox{width:min(720px,100%);height:min(640px,100%);background:#F4F5F7;color:#1B1C1F;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 16px 50px rgba(0,0,0,.35)}
.kph{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #0001}
.kpx{all:unset;cursor:pointer;width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:26px;border-radius:10px}.kpx:active{background:#0002}
.kpt{flex:1;font-family:var(--fh);font-size:clamp(18px,2.6vh,24px);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpvr{display:flex;align-items:center;gap:12px;padding:10px 20px;border-bottom:1px solid #0001;min-height:clamp(64px,11vh,96px)}
.kpl{flex:1;min-width:0;font-size:clamp(16px,2.3vh,20px);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpl small{display:block;font-weight:400;opacity:.7;font-size:.8em}
.kpv2{font-family:var(--fh);font-size:clamp(36px,7vh,60px);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.kpg{flex:1;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(4,1fr);gap:1px;background:#0002;min-height:0}
.kpg button{border:0;background:#fff;color:inherit;font-family:var(--fh);font-size:clamp(26px,5vh,40px);font-weight:600;cursor:pointer;touch-action:manipulation}
.kpg button.dn,.kpg button:active{background:#DDE3EA}
.kpg .kdel{grid-column:4;grid-row:1/span 2}.kpg .kok{grid-column:4;grid-row:3/span 2;color:#2E7D32;font-size:clamp(22px,4vh,32px)}
.kpov.dk .kpbox{background:#2B2D31;color:#F2F2F2}.kpov.dk .kph,.kpov.dk .kpvr{border-color:#ffffff14}.kpov.dk .kpg{background:#ffffff1f}.kpov.dk .kpg button{background:#3A3D42}.kpov.dk .kpg button.dn,.kpov.dk .kpg button:active{background:#55595F}.kpov.dk .kpg .kok{color:#8BE28F}.kpov.dk .sndt,.kpov.dk .kpx{color:#fff}`;
  document.head.appendChild(st);
})();

/* ---------- ขอสิทธิ์ชั่วคราวด้วยรหัสเจ้าของ (สำหรับการกระทำที่ทำในเครื่อง เช่น แก้ราคา ส่วนลด ลบรายการ) ---------- */
// เจ้าของร้านใส่รหัสครั้งเดียวตอนเข้าใช้ฟังก์ชัน (เช่น นับสต็อก) แล้วใช้งานต่อได้จนออกจากหน้านั้น
// ยืนยันแบบลอยเหนือหน้ากล้องสแกน
function confirmDlgZ(msg) { return new Promise(res => { const ov = sheet('ยืนยัน', `<p>${esc(msg)}</p>`, `<button class="btn ghost grow" id="n">ยกเลิก</button><button class="btn grow" id="y" style="background:var(--red)">ตกลง</button>`); ov.style.zIndex = 90; $('#n', ov).onclick = () => { ov.remove(); res(false); }; $('#y', ov).onclick = () => { ov.remove(); res(true); }; }); }
async function ownerGate(reason, scope) {
  const perm = scope === 'stock' ? 'stockCount' : 'editProducts';
  if (!S.user || S.user.role === 'owner' || Elev.covers(perm)) return true;
  const pin = await ownerPinDlg(reason, true); if (!pin) return false;
  try { busy(1, 'กำลังตรวจรหัส...'); const r = await apiRaw('checkPin', { ownerPin: pin, scope: perm }); busy(0); Elev.set(pin, scope, r.kind); if (r.kind !== 'ap') OfflineAuth.rememberOwnerPin(pin); return true; }
  catch (e) { busy(0); if (e.offline && await OfflineAuth.checkOwnerPin(pin)) { Elev.set(pin, scope); toast('อนุมัติแบบออฟไลน์'); return true; } toast(String(e.message).replace(/^PIN_\w+:\s*/, ''), 1); return false; }
}
async function gate(perm) {
  if (canStrict(perm) || Elev.covers(perm)) return true;
  if (S.perms[perm] !== 'pin') { toast('ไม่มีสิทธิ์: ' + ((S.defs[perm] || [])[0] || perm), 1); return false; }
  const apOK = ['editProducts', 'stockCount', 'receiveGoods'].includes(perm);
  const pin = await ownerPinDlg((S.defs[perm] || [])[0] || '', apOK);
  if (!pin) return false;
  try { busy(1, 'กำลังตรวจรหัส...'); const r = await apiRaw('checkPin', { ownerPin: pin, scope: perm }); busy(0); Elev.set(pin, perm === 'editProducts' && ELEV_AREA.includes(S.view) ? 'products' : '', r.kind); if (r.kind !== 'ap') OfflineAuth.rememberOwnerPin(pin); return true; }
  catch (e) {
    busy(0);
    if (e.offline && await OfflineAuth.checkOwnerPin(pin)) { Elev.set(pin, perm === 'editProducts' && ELEV_AREA.includes(S.view) ? 'products' : ''); toast('อนุมัติแบบออฟไลน์'); return true; }
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
  // บันทึกตั๋ว: แสดงรายการทันที แล้วค่อยส่งไปจอลูกค้าหลังหน้าจอวาดเสร็จ (สแกนปุ๊บขึ้นปั๊บ)
  save() { LS.set('ticket', this.t); this.renderTicket(); window.TSync && TSync.out(); const tok = this._ptok = (this._ptok || 0) + 1; requestAnimationFrame(() => setTimeout(() => { if (tok === this._ptok) this.pushDisplay(); }, 0)); },
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
      if (!o.silent) beep();
      this.save();
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
    el.innerHTML = `<div class="pos${LS.get('posDark', true) ? ' dk' : ''}" id="pos">
      <div class="pos-l"><div class="pbar"><div class="pside l"><button class="iconbtn" id="pm">${I(IC.menu, 24)}</button>${isKiosk() ? '' : `<button class="iconbtn" onclick="go('home')" title="Back to management">${I(IC.home, 22)}</button>`}<div class="ttl" id="pt"></div><span class="netpill"></span></div>
        <div class="pclock" id="pclk" title="เวลา กรุงเทพฯ"></div>
        <div class="pside r"><div class="who2" title="แคชเชียร์"><span class="ic">${I(IC.user, 20)}</span><b>${esc(S.user.name)}</b></div>
        <button class="iconbtn" id="psvc" title="Services">${I('<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', 22)}</button>
        <button class="iconbtn" id="ps" title="Search">${I(IC.search, 22)}</button><button class="iconbtn" id="pcam" title="Camera scan">${I(IC.scan, 22)}</button>${FS.btn()}<button class="iconbtn pdrw" id="pdrw" title="เปิดลิ้นชักเก็บเงิน">${I('<rect x="2.5" y="10" width="19" height="10" rx="1.5"/><path d="M4.5 10l2-5.5h11l2 5.5"/><path d="M9.5 15h5"/>', 22)}</button><button class="iconbtn tb" onclick="switchUser()" title="ออกจากระบบ">${I(IC.logout, 22)}</button></div></div>
        <div id="pmain" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>
        <div class="cartbar" id="cbar"></div></div>
      <div class="pos-r" id="pr"></div></div>`;
    $('#pm', el).onclick = () => this.menu();
    $('#psvc', el).onclick = () => svcMenu();
    $('#pdrw', el).onclick = () => { if (!pconn().drawer) return toast('ยังไม่ได้เปิดใช้ลิ้นชัก — ตั้งที่ ☰ › เครื่องพิมพ์ใบเสร็จ › ติ๊ก "เปิดลิ้นชักเก็บเงิน"', 1); RP.kick().then(() => toast('เปิดลิ้นชักแล้ว'), e => toast(e.message, 1)); };
    const tick = () => { const c = $('#pclk', el); if (c) c.innerHTML = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }) + '<small>น.</small>'; };
    tick(); clearInterval(this.clk); this.clk = setInterval(tick, 10000);
    $('#ps', el).onclick = () => this.search();
    $('#pcam', el).onclick = () => { let refresh = () => { };
      openScanner((code, ctx) => { const ok = this.scan(code); if (!ok) { try { Scanner.err && Scanner.err(); } catch (e) { } toast('ไม่พบสินค้า ' + code, 1); } refresh(ok ? this.lastAdded : -1); return ''; },
        { continuous: true, title: 'สแกนขายสินค้า', onClose: () => this.render(),
          // มือถือ: กล้องครึ่งบน · ครึ่งล่างเป็นตั๋วออเดอร์ (จำนวน ราคารวม) + ปุ่มชำระเงิน
          panel: (pane, sc) => {
            refresh = hl => {
              const T = this.totals(), its = this.t.items;
              pane.innerHTML = `<div class="row" style="padding:8px 14px;gap:8px;border-bottom:1px solid var(--line);background:#fff"><b class="grow">ตั๋วออเดอร์ · ${its.length} รายการ</b>${its.length ? '<button class="btn ghost sm" data-clr style="color:var(--red)">ล้าง</button>' : ''}</div>
                <div style="flex:1;overflow:auto;padding:4px 10px" data-ls>${its.length ? its.map((it, i) => ({ it, i })).reverse().map(({ it, i }) => `<div class="row" style="gap:8px;padding:8px 4px;border-bottom:1px solid var(--line);${i === hl ? 'background:#ecfdf3;border-radius:10px' : ''}"><div class="grow" style="min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.name)}</div><div class="tiny muted">${money(it.price)} × ${num(it.qty)}</div></div>
                  ${it.byWeight === 'Y' || it.svc ? `<b class="num">${num(it.qty)}</b>` : `<button class="btn ghost sm" data-m="${i}" style="min-width:38px;min-height:36px;padding:0">−</button><b class="num" style="min-width:26px;text-align:center">${num(it.qty)}</b><button class="btn ghost sm" data-p="${i}" style="min-width:38px;min-height:36px;padding:0">+</button>`}
                  <b class="num" style="min-width:64px;text-align:right">${money(num(it.qty) * num(it.price))}</b></div>`).join('') : '<div class="empty small" style="padding:24px 0">สแกนสินค้าเพื่อเริ่มขาย</div>'}</div>
                <div style="padding:10px 14px calc(12px + var(--safe-b));background:#fff;border-top:1px solid var(--line)"><button class="btn green block" data-pay style="min-height:58px;font-size:20px" ${its.length ? '' : 'disabled'}>ชำระเงิน ${bahtL(T.total)}</button></div>`;
              $$('[data-p]', pane).forEach(b => b.onclick = () => { const it = its[+b.dataset.p]; it.qty = num(it.qty) + 1; this.save(); refresh(+b.dataset.p); });
              $$('[data-m]', pane).forEach(b => b.onclick = () => { const k = +b.dataset.m, it = its[k]; if (num(it.qty) > 1) it.qty = num(it.qty) - 1; else its.splice(k, 1); this.save(); refresh(-1); });
              const c = $('[data-clr]', pane); if (c) c.onclick = async () => { if (await confirmDlgZ('ล้างรายการทั้งหมด?')) { this.t.items.length = 0; this.save(); refresh(-1); } };
              $('[data-pay]', pane).onclick = () => { sc.close(); this.startPay(); };
            };
            refresh(-1);
          } }); };
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
        $('#al', this.el).innerHTML = res.map(p => `<div class="item" data-sku="${esc(p.sku)}" style="padding:10px 12px">${pthumb(p, 40)}<div class="grow"><div class="t">${esc(p.name)}</div><div class="m">${esc(p.barcode || p.sku)}${p.trackStock === 'Y' ? ' · คงเหลือ ' + num(p.stock) : ''}</div></div><div class="price" style="font-size:16px">${num(p.price) ? baht(p.price) : 'ตัวแปร'}</div></div>`).join('') || '<div class="empty">ไม่พบสินค้า</div>';
        $$('#al [data-sku]', this.el).forEach(r => r.onclick = () => this.add(IDX.bySku[r.dataset.sku]));
      };
      $('#aq', this.el).oninput = e => { this.aq = e.target.value; drawAll(); };
      drawAll();
    } else {
      const catGrid = isCat && !this.cat, fill = (isPage || (catGrid && this.catSlots(L).length <= L.cols * L.rows)) && !narrow;
      const editBar = this.edit && (isPage || catGrid);
      $('#pmain', this.el).innerHTML = `<div class="pgrid ${fill ? 'fill' : ''}" style="grid-template-columns:repeat(${cols},1fr);${fill ? `grid-template-rows:repeat(${L.rows},1fr)` : 'grid-auto-rows:minmax(88px,auto)'}">${html}</div>` +
        (editBar && isPage ? `<div class="row wrap" style="padding:6px 8px;background:#FFF8E1;gap:6px"><b class="small grow">โหมดแก้ไขหน้าขาย — แตะช่องเพื่อแก้</b><button class="btn ghost sm" id="pgn">ชื่อหน้า</button><button class="btn ghost sm" id="pga">+ หน้าใหม่</button><button class="btn ghost sm" id="pgv">+ ปุ่มบริการ</button>${L.pages.length > 1 ? '<button class="btn ghost sm" id="pgd">ลบหน้า</button>' : ''}<button class="btn ghost sm" id="pgs">ตาราง ${L.cols}×${L.rows}</button><button class="btn sm green" id="pge">เสร็จ</button></div>` : '')
        + (editBar && catGrid ? `<div class="row wrap" style="padding:6px 8px;background:#FFF8E1;gap:6px"><b class="small grow">${this.mv != null ? '👉 แตะช่องปลายทางเพื่อย้าย/สลับ' : 'แก้ตำแหน่งหมวดหมู่ — แตะหมวดแล้วแตะช่องปลายทาง · แตะช่องว่างเพื่อเพิ่ม'}</b><button class="btn ghost sm" id="cgr">เรียงอัตโนมัติ</button><button class="btn ghost sm" id="pgs">ตาราง ${L.cols}×${L.rows}</button><button class="btn sm green" id="pge">เสร็จ</button></div>` : '') + this.tabsHTML(tabs);
      const ed1 = $('#ed1', this.el); if (ed1) ed1.onclick = () => { this.edit = true; this.render(); };
      $$('[data-i]', this.el).forEach(b => {
        const i = +b.dataset.i; let pressT;
        b.onclick = () => {
          if (this.held) { this.held = false; return; }
          if (this.edit) return this.editTile(i); const t = L.pages[this.tab].tiles[i]; if (!t) return; if (t.t === 's') return svcDialog(t.ref); if (t.t === 'c') { this.tab = L.pages.length; this.cat = t.ref; LS.set('posTab', this.tab); this.render(); } else this.add(IDX.bySku[t.ref]); };
      });
      $$('[data-cat]', this.el).forEach(b => b.onclick = () => { this.cat = b.dataset.cat; this.render(); });
      $$('[data-ci]', this.el).forEach(b => {
        const i = +b.dataset.ci; let pressT;
        b.onclick = () => {
          const slots = this.catSlots(L);
          if (this.held) { this.held = false; return; }
          if (!this.edit) { if (slots[i]) { this.cat = slots[i]; this.render(); } return; }
          if (this.mv != null) { const j = this.mv; this.mv = null; if (j !== i) { [slots[i], slots[j]] = [slots[j], slots[i]]; L.catTiles = slots; return saveL(); } return this.render(); }
          if (slots[i]) { this.mv = i; return this.render(); }
          this.pickCat(L, i);
        };
      });
      const saveL = () => this.saveLayout(L);
      // กดค้างแล้วลากไปวางบนช่องอื่น = ย้าย/สลับตำแหน่ง (พนักงานทำได้ ไม่ต้องใช้รหัส)
      const grid = $('.pgrid', this.el);
      if (grid && isPage) this.dragGrid(grid, 'i', (a, b) => { const T = L.pages[this.tab].tiles; if (!T[a]) return; [T[a], T[b]] = [T[b], T[a]]; this.saveLayout(L); });
      else if (grid && catGrid) this.dragGrid(grid, 'ci', (a, b) => { const s = this.catSlots(L); if (!s[a]) return; [s[a], s[b]] = [s[b], s[a]]; L.catTiles = s; this.saveLayout(L); });
      $$('[data-back]', this.el).forEach(b => b.onclick = () => { this.cat = null; this.render(); });
      $$('[data-sku]', this.el).forEach(b => b.onclick = () => this.add(IDX.bySku[b.dataset.sku]));
      if (this.edit) {
        const save = () => this.saveLayout(L);
        $('#pge', this.el).onclick = () => { this.edit = false; this.mv = null; this.render(); };
        const cgr = $('#cgr', this.el); if (cgr) cgr.onclick = async () => { if (!(await confirmDlg('เรียงหมวดหมู่ใหม่ตามลำดับเดิมของระบบ (ล้างตำแหน่งที่จัดไว้)?', 'เรียงใหม่'))) return; L.catTiles = []; save(); };
        if (catGrid) { $('#pgs', this.el).onclick = () => this.gridSizeDlg(L, save); }
        if (isPage) $('#pgn', this.el).onclick = () => { const ov = sheet('ชื่อหน้า', `<input class="in" id="nm" value="${esc(L.pages[this.tab].name)}">`, '<button class="btn block" id="ok">บันทึก</button>'); $('#ok', ov).onclick = () => { L.pages[this.tab].name = $('#nm', ov).value.trim() || 'หน้า'; ov.remove(); save(); }; };
        const pgv = $('#pgv', this.el); if (pgv) pgv.onclick = () => { const pg = L.pages[this.tab], n = L.cols * L.rows, have = new Set(pg.tiles.filter(x => x && x.t === 's').map(x => x.ref)); let added = 0; Object.keys(SVC).forEach(k => { if (have.has(k)) return; for (let i = 0; i < n; i++) if (!pg.tiles[i]) { pg.tiles[i] = { t: 's', ref: k, shape: 'square' }; added++; return; } }); if (!added) return toast(have.size >= 4 ? 'มีปุ่มบริการครบแล้ว' : 'หน้านี้ไม่มีช่องว่าง — เพิ่มหน้าใหม่หรือล้างบางช่องก่อน', 1); save(); toast('เพิ่มปุ่มบริการ ' + added + ' ปุ่มแล้ว'); };
        if (isPage) $('#pga', this.el).onclick = () => { L.pages.push({ name: 'หน้า ' + (L.pages.length + 1), tiles: [] }); this.tab = L.pages.length - 1; save(); };
        const d = $('#pgd', this.el); if (d) d.onclick = async () => { if (await confirmDlg('ลบหน้านี้?', 'ลบ', true)) { L.pages.splice(this.tab, 1); this.tab = 0; save(); } };
        if (isPage) $('#pgs', this.el).onclick = () => this.gridSizeDlg(L, save);
      }
    }
    $$('.ptabs [data-tab]', this.el).forEach(b => b.onclick = () => { this.tab = +b.dataset.tab; this.cat = null; this.mv = null; LS.set('posTab', this.tab); this.render(); });
  },
  // ตำแหน่งหมวดหมู่ในแท็บ "หมวดหมู่" (จัดวางเองได้เหมือนหน้าขายบ่อย) — หมวดใหม่จะเติมช่องว่างแรกให้อัตโนมัติ
  // กดค้าง 3 วินาที = หยิบปุ่มขึ้นมาย้าย (พนักงานทำได้ ไม่ต้องใช้รหัส) แล้วแตะช่องปลายทางเพื่อย้าย/สลับ
  // ลากวาง: กดค้าง HOLD มิลลิวินาที (ขยับนิ้วก่อนเวลา = เลื่อนจอปกติ) → ปุ่มลอยตามนิ้ว → ปล่อยบนช่องไหน สลับกับช่องนั้น
  dragGrid(grid, attr, swap) {
    const HOLD = 800, sel = `[data-${attr}]`;
    let st = null;
    const end = drop => {
      if (!st) return; clearTimeout(st.t);
      if (st.on) {
        const tg = st.over; st.ghost.remove(); st.el.style.opacity = ''; $$('.drop', grid).forEach(x => x.classList.remove('drop'));
        this.held = true; setTimeout(() => this.held = false, 350);
        if (drop && tg && tg !== st.el) swap(+st.el.dataset[attr === 'i' ? 'i' : 'ci'], +tg.dataset[attr === 'i' ? 'i' : 'ci']);
      }
      st = null;
    };
    grid.addEventListener('pointerdown', e => {
      const el = e.target.closest(sel); if (!el || !grid.contains(el)) return;
      if (el.classList.contains('empty')) return;
      st = { el, x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
      st.t = setTimeout(() => {
        if (!st) return; st.on = true;
        const r = el.getBoundingClientRect(), g = el.cloneNode(true);
        g.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:80;pointer-events:none;opacity:.9;transform:scale(1.06);box-shadow:0 10px 30px #0005;transition:none`;
        document.body.append(g); st.ghost = g; st.dx = st.x - r.left; st.dy = st.y - r.top; el.style.opacity = '.35';
        try { el.setPointerCapture(st.id); } catch (x) { }
        try { navigator.vibrate && navigator.vibrate(35); } catch (x) { }
      }, HOLD);
    });
    grid.addEventListener('pointermove', e => {
      if (!st || e.pointerId !== st.id) return;
      if (!st.on) { if (Math.abs(e.clientX - st.x) + Math.abs(e.clientY - st.y) > 12) { clearTimeout(st.t); st = null; } return; }
      st.ghost.style.left = (e.clientX - st.dx) + 'px'; st.ghost.style.top = (e.clientY - st.dy) + 'px';
      const t = (document.elementFromPoint(e.clientX, e.clientY) || {}).closest ? document.elementFromPoint(e.clientX, e.clientY).closest(sel) : null;
      const tg = t && grid.contains(t) ? t : null;
      if (tg !== st.over) { st.over && st.over.classList.remove('drop'); tg && tg !== st.el && tg.classList.add('drop'); st.over = tg; }
    });
    grid.addEventListener('pointerup', () => end(true));
    grid.addEventListener('pointercancel', () => end(false));
    // ระหว่างลาก ห้ามจอเลื่อน
    grid.addEventListener('touchmove', e => { if (st && st.on) e.preventDefault(); }, { passive: false });
    grid.addEventListener('contextmenu', e => e.preventDefault());
  },
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
    if (t.t === 's') { const sv = SVC[t.ref]; if (!sv) return `<button class="tile empty${ed}" data-i="${i}"></button>`; return `<button class="tile${shape}${ed}" data-i="${i}" style="background:${t.color || sv.color};flex-direction:column;gap:4px"><span style="font-size:1.7em;line-height:1">${sv.icon}</span><span>${esc(t.label || sv.name)}</span></button>`; }
    if (t.t === 'c') return `<button class="tile${shape}${ed}" data-i="${i}" style="background:${t.color || catColor(t.ref)}"><span class="stack">${I('<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>', 18)}</span>${esc(t.label || t.ref)}</button>`;
    const p = IDX.bySku[t.ref]; if (!p) return `<button class="tile empty${ed}" data-i="${i}"><span class="tiny muted">ไม่พบสินค้า</span></button>`;
    const img = t.noImg ? '' : Img.get(p.sku);
    if (img) return `<button class="tile img${shape}${ed}" data-i="${i}" style="background-image:url(${img})"><span class="nm">${esc(t.label || p.name)}</span></button>`;
    return `<button class="tile${shape}${ed}" data-i="${i}" style="background:${t.color || catColor(p.category)};${(t.color || '') === '#E0E0E0' ? 'color:#333' : ''}">${esc(t.label || p.name)}</button>`;
  },
  editTile(i) {
    const L = this.layout(), pg = L.pages[this.tab], t = { t: 'p', shape: 'square', ...(pg.tiles[i] || {}) };
    const ov = sheet('แก้ไขปุ่มลัด', `<div class="seg" id="tt"><button data-t="p">สินค้า</button><button data-t="c">หมวดหมู่</button><button data-t="s">บริการ</button></div>
      <div id="refw" style="margin-top:10px"></div>
      <label class="f" style="margin-top:10px"><span>ชื่อบนปุ่ม (เว้นว่าง = ใช้ชื่อสินค้า)</span><input class="in" id="lb" value="${esc(t.label || '')}"></label>
      <div class="small muted" style="margin-bottom:6px">สี (กรณีไม่มีรูป)</div><div class="row wrap" id="sw">${TILE_COLORS.map(c => `<span class="swatch ${t.color === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></span>`).join('')}<span class="swatch ${!t.color ? 'on' : ''}" data-c="" title="ตามหมวด" style="background:conic-gradient(#43A047,#1E88E5,#E53935,#43A047)"></span></div>
      <div class="seg" id="sh" style="margin-top:12px"><button data-s="square">สี่เหลี่ยม</button><button data-s="circle">วงกลม</button></div>
      <label class="row small" style="margin-top:10px" id="nir"><input type="checkbox" id="ni" ${t.noImg ? 'checked' : ''}> ไม่แสดงรูปสินค้า</label>`,
      `<button class="btn ghost grow" id="clr" style="color:var(--red)">ล้างช่องนี้</button><button class="btn grow" id="ok">บันทึก</button>`);
    const seg = (id, key, attr) => { const f = () => $$(`#${id} button`, ov).forEach(b => b.classList.toggle('on', b.dataset[attr] === t[key])); $$(`#${id} button`, ov).forEach(b => b.onclick = () => { t[key] = b.dataset[attr]; f(); if (key === 't') { t.ref = ''; refw(); } }); f(); };
    const refw = () => {
      if (t.t === 's') { $('#refw', ov).innerHTML = `<div class="grid2">${Object.values(SVC).map(s => `<button class="btn ${t.ref === s.key ? '' : 'ghost'}" data-sv="${s.key}" style="${t.ref === s.key ? `background:${s.color}` : ''};min-height:52px">${s.icon} ${s.name}</button>`).join('')}</div>`; $$('[data-sv]', ov).forEach(b => b.onclick = () => { t.ref = b.dataset.sv; refw(); }); $('#nir', ov).style.display = 'none'; return; }
      if (t.t === 'c') { $('#refw', ov).innerHTML = `<select class="in" id="cs">${S.categories.map(c => `<option ${c.name === t.ref ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`; t.ref = t.ref || (S.categories[0] || {}).name; $('#cs', ov).onchange = e => t.ref = e.target.value; $('#nir', ov).style.display = 'none'; return; }
      $('#nir', ov).style.display = '';
      const p = IDX.bySku[t.ref];
      $('#refw', ov).innerHTML = `<div class="row"><div class="grow small">${p ? `<b>${esc(p.name)}</b> · ${baht(p.price)}` : '<span class="muted">ยังไม่เลือกสินค้า</span>'}</div><button class="btn sm" id="pk">เลือกสินค้า</button></div>`;
      $('#pk', ov).onclick = () => { let q = ''; const o2 = sheet('เลือกสินค้า', `<input class="in" id="q" placeholder="ค้นหา..."><div class="list" id="l" style="margin-top:8px;max-height:58vh;overflow-y:auto"></div>`); const dr = () => { const R = searchProducts(q); $('#l', o2).innerHTML = R.length ? R.slice(0, 80).map(p => `<div class="item" data-s="${esc(p.sku)}">${pthumb(p, 44)}<div class="grow"><div class="t">${esc(p.name)}</div><div class="m">${esc(p.category || '')}${p.barcode ? ' · ' + esc(p.barcode) : ''}</div></div><div class="price" style="font-size:16px;white-space:nowrap">${baht(p.price)}</div></div>`).join('') + (R.length > 80 ? `<div class="item small muted center">พิมพ์ค้นหาเพื่อดูเพิ่ม (พบ ${R.length.toLocaleString()} รายการ)</div>` : '') : `<div class="empty small">${S.products.length ? 'ไม่พบสินค้าที่ค้นหา' : 'เครื่องนี้ยังไม่มีรายการสินค้า' + (S.apiUrl ? ' — กำลังโหลด…' : ' (โหมดทดลอง ยังไม่ได้เชื่อมฐานข้อมูลร้าน)')}</div>`; $$('[data-s]', o2).forEach(x => x.onclick = () => { t.ref = x.dataset.s; o2.remove(); refw(); }); }; $('#q', o2).oninput = e => { q = e.target.value; dr(); }; dr(); setTimeout(() => $('#q', o2).focus(), 100); };
    };
    seg('tt', 't', 't'); seg('sh', 'shape', 's'); refw();
    $$('#sw .swatch', ov).forEach(s => s.onclick = () => { t.color = s.dataset.c; $$('#sw .swatch', ov).forEach(x => x.classList.toggle('on', x === s)); });
    const save = () => { ov.remove(); this.saveLayout(L); };
    $('#ok', ov).onclick = () => { if (!t.ref) return toast('กรุณาเลือก' + (t.t === 'c' ? 'หมวดหมู่' : t.t === 's' ? 'บริการ' : 'สินค้า'), 1); t.label = $('#lb', ov).value.trim(); t.noImg = $('#ni', ov).checked; if (!t.color) delete t.color; pg.tiles[i] = t; save(); };
    $('#clr', ov).onclick = () => { pg.tiles[i] = null; save(); };
  },
  renderTicket() {
    if (!this.el) return;
    const T = this.totals(), t = this.t, c = t.customer;
    const pr = $('#pr', this.el);
    pr.innerHTML = `<div class="thead"><button class="iconbtn" id="tback" style="display:none">${I(IC.back)}</button><h3>ตั๋วออเดอร์ <span id="tsy" style="display:none;font-size:13px;vertical-align:middle">🔗</span><span id="smt" class="tiny" style="display:none;font-weight:400;margin-left:6px;opacity:.75"></span></h3><button class="iconbtn" id="tc" title="ลูกค้า">${I(IC.userplus, 24)}</button><button class="iconbtn" id="tm">${I(IC.dots, 24)}</button></div>
      ${c ? `<div class="cust">${I(IC.user, 18)}<div class="grow"><b>${esc(c.name)}</b> ${esc(c.phone || '')}<div class="tiny">${num(c.points)} แต้ม${num(c.credit) ? ' · ค้างชำระ ' + money(c.credit) : ''}${t.pointsUse ? ` · ใช้ ${t.pointsUse} แต้ม` : ''}</div></div><button class="iconbtn" id="cx">${I(IC.x, 18)}</button></div>` : ''}
      <div class="tlist">${t.items.length ? t.items.map((it, i) => `<div class="titem" data-i="${i}"><span class="nm">${esc(it.name)}</span><span class="q">×${it.byWeight === 'Y' ? num(it.qty).toFixed(3).replace(/\.?0+$/, '') + 'กก.' : num(it.qty)}</span><span class="num">${baht(num(it.qty) * num(it.price))}</span></div>`).join('') : '<div class="empty" style="padding-top:60px">ยังไม่มีสินค้า<br><span class="tiny">แตะปุ่มสินค้า หรือสแกนบาร์โค้ด</span></div>'}</div>
      ${num(t.cashOut) ? `<div class="cashout">💵 ต้องจ่ายเงินสดให้ลูกค้า ${bahtL(t.cashOut)}</div>` : ''}
      <div class="ttot">${T.disc ? `<div class="kv"><span>รวม</span><span>${baht(T.sub)}</span></div><div class="kv"><span>ส่วนลด</span><span style="color:var(--red)">-${baht(T.disc)}</span></div>` : ''}<div class="kv tgt"><b>รวมทั้งหมด</b><b>${baht(T.total)}</b></div></div>
      ${this.pay ? '' : `<button class="btn payb" id="pay" ${t.items.length ? '' : 'disabled'}>ชำระเงิน</button>`}`;
    const cb = $('#cbar', this.el);
    if (cb) cb.innerHTML = this.pay ? '' : `<button class="iconbtn" id="cbt" style="position:relative">${I(IC.cart, 26)}<span class="badge" style="position:absolute;top:-2px;right:-4px;background:var(--red);color:#fff;border-radius:99px;font-size:11px;padding:0 6px">${T.count}</span></button><button class="btn" id="cbp" ${t.items.length ? '' : 'disabled'}>ชำระเงิน ${baht(T.total)}</button>`;
    const narrow = innerWidth < 900;
    if (narrow) { $('#tback', pr).style.display = ''; $('#tback', pr).onclick = () => $('#pos', this.el).classList.remove('showT'); }
    const cbt = $('#cbt', this.el); if (cbt) cbt.onclick = () => { $('#pos', this.el).classList.add('showT'); this.fitTicket(); };
    const cbp = $('#cbp', this.el); if (cbp) cbp.onclick = () => this.startPay();
    const pay = $('#pay', pr); if (pay) pay.onclick = () => this.startPay();
    $('#tc', pr).onclick = () => pickCustomer(cu => { this.t.customer = { id: cu.id, name: cu.name, phone: cu.phone, points: cu.points, credit: cu.credit, creditLimit: cu.creditLimit }; this.t.pointsUse = 0; this.save(); if (this.pay) this.renderPay(); });
    const cx = $('#cx', pr); if (cx) cx.onclick = () => { this.t.customer = null; this.t.pointsUse = 0; this.save(); if (this.pay) this.renderPay(); };
    $('#tm', pr).onclick = () => this.ticketMenu();
    $$('.titem', pr).forEach(r => r.onclick = () => { if (!this.pay) this.editItem(+r.dataset.i); });
    this.fitTicket();
  },
  // ตัวอักษรรายการในตั๋วใหญ่ที่สุดที่ใส่ได้ (ลูกค้าส่วนมากซื้อ 1–4 ชิ้น) · รายการเยอะจนถึงขอบล่าง → ย่อทั้งหมดให้พอดีช่อง
  fitTicket() {
    const L = this.el && $('.tlist', this.el); if (!L) return;
    if (!L.clientHeight) return; // ซ่อนอยู่ (จอแคบ) — จะจัดตอนเปิดตั๋ว
    if (!this.t.items.length) { L.style.removeProperty('--tf'); return; }
    const MIN = 15, MAX = Math.max(MIN, Math.min(30, Math.round(innerHeight / 26)));
    const fits = m => { L.style.setProperty('--tf', m + 'px'); return L.scrollHeight <= L.clientHeight + 1; };
    // เริ่มจากขนาดเดิม — กรณีปกติ (1–4 ชิ้น) วัดแค่ครั้งเดียว ไม่หน่วงการสแกน
    let cur = Math.min(MAX, Math.max(MIN, parseInt(L.style.getPropertyValue('--tf')) || MAX)), best = cur;
    const n = this.t.items.length, grew = n >= (this._fitN || 0); this._fitN = n;
    if (fits(cur)) {
      // เพิ่มรายการแล้วยังพอดี → จบเลย (วัด 1 ครั้ง) · ลบรายการ → ลองขยายกลับทีละขั้น
      if (!grew) while (best < MAX && fits(best + 1)) best++;
    } else if (cur > MIN) {
      // ล้น → ประมาณขนาดใหม่จากสัดส่วนความสูงครั้งเดียว แล้วปรับละเอียด ±1 (แทนการไล่หาหลายรอบ)
      const r = L.clientHeight / Math.max(1, L.scrollHeight);
      let m = Math.max(MIN, Math.min(cur - 1, Math.floor(cur * r)));
      if (fits(m)) { while (m + 1 < cur && fits(m + 1)) m++; best = m; }
      else { while (m > MIN && !fits(m - 1)) m--; best = Math.max(MIN, m - 1); }
    } else best = MIN;
    L.style.setProperty('--tf', best + 'px');
    // ชื่อยาว → ย่อเฉพาะรายการนั้นให้อยู่ใน 1 บรรทัด (เล็กสุด 70% แล้วตัด …)
    const nms = L.querySelectorAll('.nm'), over = [];
    nms.forEach(n => { if (n.scrollWidth > n.clientWidth + 1) over.push([n, n.clientWidth / n.scrollWidth]); });
    over.forEach(([n, r]) => { n.style.fontSize = Math.max(.7, Math.floor(r * 100) / 100) + 'em'; });
    // รายการล่าสุดต้องเห็นเสมอ
    if (L.scrollHeight > L.clientHeight + 1) L.scrollTop = L.scrollHeight;
  },
  editItem(i) {
    if (this.t.items[i].svc) {
      const it = this.t.items[i];
      return popMenu($$('.titem', this.el)[i], [[`ลบ “${esc(it.name)}”`, async () => { if (!(await gate('clearTicket'))) return; const k = it.svc; this.t.items = this.t.items.filter(x => !(x.svc === k && (x === it || x.sku === 'SVC-FEE' && x.svc === k))); if (k === 'in') this.t.cashOut = 0; this.save(); }]], 'right');
    }
    const it = this.t.items[i]; const pe = canStrict('priceEdit') || Elev.covers('priceEdit'), pePin = !pe && S.perms.priceEdit === 'pin';
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
    let q = '', pick = null;
    const ov = sheet('ค้นหาสินค้า', `<input class="in" id="q" placeholder="ชื่อ / บาร์โค้ด / รหัส — สแกนแล้วแตะรูปเพื่อเพิ่มลงตั๋ว" inputmode="search"><div id="l" style="margin-top:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px"></div>`);
    // แสดงเป็นรูปให้เห็นก่อน แตะรูปเพื่อเพิ่มลงตั๋วออเดอร์
    const card = (p, hl) => { const im = window.Img && Img.get(p.sku); return `<button data-s="${esc(p.sku)}" style="all:unset;cursor:pointer;display:flex;flex-direction:column;border-radius:14px;background:#fff;overflow:hidden;box-shadow:${hl ? 'inset 0 0 0 3px var(--green)' : 'var(--sh)'}">
      <div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:#f4f4f4;color:var(--ink3)">${im ? `<img src="${im}" alt="" style="width:100%;height:100%;object-fit:contain;background:#fff">` : `<span style="font-size:28px;font-weight:700;color:#bbb">${esc(Array.from(p.name || '?')[0])}</span>`}</div>
      <div style="padding:6px 8px 8px"><div style="font-weight:600;font-size:14px;line-height:1.25;max-height:2.5em;overflow:hidden">${hl ? '<span class="tag green" style="margin-right:4px">ตรงบาร์โค้ด</span>' : ''}${esc(p.name)}</div><div class="row" style="margin-top:4px"><span class="price grow" style="font-size:17px">${num(p.price) ? baht(p.price) : 'ตัวแปร'}</span>${p.trackStock === 'Y' ? `<span class="tiny muted">เหลือ ${num(p.stock)}</span>` : ''}</div></div></button>`; };
    const dr = () => {
      let list = (q ? searchProducts(q) : []).filter(p => p.available !== 'N');
      if (pick) list = [pick].concat(list.filter(p => p.sku !== pick.sku));
      $('#l', ov).innerHTML = list.slice(0, 60).map(p => card(p, pick && p.sku === pick.sku)).join('') || (q ? '<div class="empty small" style="grid-column:1/-1">ไม่พบสินค้า</div>' : '');
      $$('[data-s]', ov).forEach(x => x.onclick = () => { const p = IDX.bySku[x.dataset.s]; this.add(p); toast('เพิ่ม ' + p.name); });
    };
    $('#q', ov).oninput = e => { q = e.target.value; pick = null; dr(); };
    // สแกน/กด Enter: ยังไม่เข้าตั๋ว — แสดงรูปสินค้าที่ตรงบาร์โค้ดไว้บนสุดให้แตะเลือก
    $('#q', ov).onkeydown = e => { if (e.key === 'Enter' && q) { const f = findByCode(q.trim()); if (f) { pick = f.p; beep(); } dr(); } };
    if (!touchUI()) setTimeout(() => $('#q', ov).focus(), 100);
  },
  async toggleEdit() { this.edit = !this.edit; this.mv = null; const L0 = this.layout(); if (this.tab > L0.pages.length || (this.tab === L0.pages.length && this.cat)) { this.tab = 0; this.cat = null; } this.render(); },
  async menu() {
    const k = isKiosk(), dk = LS.get('posDark', true), sy = LS.get('tkSync', true);
    const G = [
      !k && ['หน้าจัดการร้าน', IC.home, () => go('home')],
      { t: 'ขาย & บิล', ic: IC.receipt, items: [
        ['ใบเสร็จรับเงิน' + (seesSales() ? '' : ' (วันนี้)'), IC.receipt, () => go('salesreceipts')],
        ['เช็คราคา', IC.scan, () => go('scan')],
        ['บริการ โอน / เติม / บิล', '<path d="M7 7h11l-3-3M17 17H6l3 3"/>', () => svcMenu()],
        ['สถานะงานโอน / บิล', IC.alert, () => go('jobs')],
        ['ส่งบิลค้าง' + (Sync.box.length ? ` (${Sync.box.length})` : ''), IC.wifi, () => Sync.flush(true), Sync.box.length || '']] },
      { t: 'สินค้า', ic: IC.box, items: [
        ['รายการสินค้า', IC.box, () => go('products')],
        can('stockCount') && ['นับสต็อก', IC.count, () => go('stockcount')],
        ['พิมพ์ฉลาก', IC.tag, () => go('labels')],
        can('customers') && ['ลูกค้า', IC.user, () => go('customers')]] },
      { t: 'อุปกรณ์', ic: IC.print, items: [
        ['เครื่องพิมพ์ใบเสร็จ', IC.print, () => go('printer')],
        pconn().drawer && ['เปิดลิ้นชัก', '<rect x="2.5" y="10" width="19" height="10" rx="1.5"/><path d="M4.5 10l2-5.5h11l2 5.5"/><path d="M9.5 15h5"/>', () => RP.kick().then(() => toast('เปิดลิ้นชักแล้ว'), e => toast(e.message, 1))],
        ['เครื่องยิงบาร์โค้ด', IC.scan, () => go('scannerset')],
        ['จอลูกค้า', IC.monitor, () => go('displayset')]] },
      { t: 'หน้าขาย', ic: IC.grid, items: [
        [this.edit ? 'ปิดโหมดแก้ไขปุ่ม' : 'แก้ไขปุ่มลัด', IC.edit, () => this.toggleEdit(), '', false, 'editlayout'],
        [dk ? 'โทนสว่าง' : 'โทนมืด', dk ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' : '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', () => { LS.set('posDark', !dk); $('#pos', this.el).classList.toggle('dk', !dk); }, '', false, 'tone'],
        [sy ? 'ปิดซิงค์ตั๋ว (ชื่อเดียวกัน)' : 'เปิดซิงค์ตั๋ว (ชื่อเดียวกัน)', IC.wifi, () => { LS.set('tkSync', !sy); toast(!sy ? 'เปิดซิงค์ตั๋วแล้ว — เครื่องที่ล็อกอินชื่อเดียวกันเห็นตั๋วเดียวกัน' : 'ปิดซิงค์ตั๋วแล้ว — เครื่องนี้ใช้ตั๋วแยก'); if (!sy) TSync.out(); TSync.badge(); }, '', false, 'tksync']] },
      Elev.ok && ['ล็อกสิทธิ์เจ้าของ', IC.shield, () => { Elev.clear(); toast('ล็อกแล้ว'); }]
    ];
    Drawer.open({ mode: 'overlay', key: 'pos', head: drawerHead(), groups: G,
      foot: `<button class="dg one" id="dlo" style="color:var(--red)"><span class="dic" style="color:var(--red)">${I(IC.logout, 20)}</span><span class="dt">ออกจากระบบ</span></button><div class="ver">v.${APP_VER}</div>` });
    const lo = $('#dlo', Drawer.el); if (lo) lo.onclick = () => { Drawer.close(); switchUser(); };
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
    const types = ['cash', pc.transfer && 'transfer', pc.welfare && 'welfare', pc.credit && can('credit') && !this.t.items.some(it => it.debt || it.inst) && 'credit'].filter(Boolean);
    if (P.done) return this.renderDone();
    const qs = [...new Set([remain].concat(this.quick(remain)))].slice(0, 8);
    const c = this.t.customer;
    let body = '';
    if (P.type === 'cash') body = `<div class="cashin"><span class="muted small" style="padding-bottom:10px">เงินสดรับ</span><input id="cash" ${touchUI() ? 'type="text" inputmode="none" readonly' : 'type="number" inputmode="decimal" step="any"'} placeholder="${money(remain)}" ${P.split ? '' : ''}><button class="btn" id="cok" style="background:#7CB342;border-radius:8px">ชำระเงิน</button></div><div class="cashwrap"><div class="qcash">${qs.map((v, i) => `<button data-q="${v}" ${i ? '' : 'style="background:#E8F5E9;border-color:#A5D6A7"'}>${i ? '' : '<span style="font-size:12px;display:block;line-height:1">พอดี</span>'}${baht(v)}</button>`).join('')}</div>${touchUI() ? `<div class="kp cpad">${['7','8','9','4','5','6','1','2','3','.','0','del'].map(x => `<button data-ck="${x}">${x === 'del' ? '⌫' : x}</button>`).join('')}</div>` : ''}</div>`;
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
      const ci = $('#cash', this.el); if (!touchUI() && innerWidth >= 900) setTimeout(() => ci.focus(), 50);
      // แท็บเล็ต/มือถือ: ใช้แป้นตัวเลขบนจอ (ไม่เปิดคีย์บอร์ดของเครื่อง = ไม่กระพริบ)
      $$('[data-ck]', this.el).forEach(b => b.onclick = () => { const k = b.dataset.ck; let v = ci.value; if (k === 'del') v = v.slice(0, -1); else if (k === '.' && v.includes('.')) return; else if (v.replace('.', '').length < 8) v = (v === '0' && k !== '.' ? '' : v) + k; ci.value = v; });
      const doCash = v => { const amt = part(); if (v === '' || v == null) v = amt; v = num(v); if (v < amt - 0.001) { if (P.split) return addPay('cash', v, v); return toast('เงินสดรับน้อยกว่ายอดชำระ', 1); } addPay('cash', amt, v); };
      $('#cok', this.el).onclick = () => doCash(ci.value);
      ci.onkeydown = e => { if (e.key === 'Enter') doCash(ci.value); };
      $$('[data-q]', this.el).forEach(b => b.onclick = () => doCash(+b.dataset.q));
    }
    if (P.type === 'transfer') {
      const amt = part();
      let q = null; try { q = await payQR(amt, LS.get('qrMode', 'auto')); } catch (e) { }
      const w = $('#qrw', this.el);
      const tog = q && q.canAuto && q.canManual ? `<div class="seg" style="margin:0 auto 8px;max-width:420px"><button data-qm="auto" class="${q.mode === 'auto' ? 'on' : ''}">QR รวมยอดอัตโนมัติ</button><button data-qm="manual" class="${q.mode === 'manual' ? 'on' : ''}">QR ลูกค้าใส่ยอดเอง</button></div>` : '';
      if (w) w.innerHTML = q ? tog + `<img src="${q.img}" style="width:min(240px,48vh);image-rendering:pixelated"><div class="small">${esc(q.label)} · <b>${baht(amt)}</b></div><div class="tiny muted">แสดงบนจอลูกค้าด้วย</div>` : `<div class="alert amber" style="margin:0 16px">ยังไม่ได้ตั้งค่าพร้อมเพย์/รูป QR — เจ้าของร้านตั้งได้ที่ เพิ่มเติม › การชำระเงิน</div>`;
      this.pushDisplay({ mode: 'pay', qr: q && q.img, qrLabel: q && q.label, amount: amt });
      $$('[data-qm]', this.el).forEach(b => b.onclick = () => { LS.set('qrMode', b.dataset.qm); this.renderPay(); });
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
    // ลิ้นชักเด้งทันทีที่กดรับเงิน (ก่อนวาดใบเสร็จ) — ทำงานในเครื่อง ไม่ต้องใช้เน็ต
    const pcn = pconn(), wantDrawer = pcn.drawer && (pcn.drawerAll || P.payments.some(p => p.type === 'cash'));
    if (wantDrawer && !(pcn.autoPrint && pcn.type === 'rawbt')) RP.kick().catch(e => toast('เปิดลิ้นชักไม่ได้: ' + e.message, 1));
    const seq = LS.get('seq', 100000) + 1; LS.set('seq', seq);
    // แต้มคิดจากยอดซื้อสินค้า/บริการ ไม่รวมเงินรับแทน (โอน/เติม/บิล) และเงินใช้หนี้
    const nonPts = t.items.filter(it => it.pass || it.debt).reduce((s2, it) => s2 + num(it.qty) * num(it.price), 0);
    const earned = c && pc.enabled ? Math.floor(Math.max(0, T.total - nonPts) / Math.max(1, num(pc.bahtPerPoint))) : 0;
    const types = [...new Set(P.payments.map(p => p.type))];
    const order = {
      id: `${S.device.no || 0}-${seq}`, date: LocalDB.now(), deviceId: S.device.id, deviceName: S.device.name || '',
      cashier: S.user.username, cashierName: S.user.name, customerId: c ? c.id : '', customerName: c ? c.name : '',
      items: JSON.stringify(t.items.map(it => ({ sku: it.sku, name: it.name, qty: it.qty, price: it.price, cost: it.cost, cat: it.cat, byWeight: it.byWeight || '', ...(it.pass ? { pass: 1 } : {}), ...(it.svc ? { svc: it.svc } : {}), ...(it.job ? { job: it.job } : {}), ...(it.debt ? { debt: 1 } : {}), ...(it.inst ? { inst: it.inst } : {}) }))),
      itemCount: T.count, subtotal: T.sub, discount: T.disc, total: T.total, cost: Math.round(T.cost * 100) / 100,
      payments: JSON.stringify(P.payments), payType: types.length > 1 ? 'split' : types[0], cash: P.cash || '', change: P.change || '',
      pointsEarned: earned, pointsUsed: t.pointsUse || 0, status: 'sale', refundOf: '', note: ''
    };
    // อัปเดตในเครื่องทันที
    t.items.forEach(it => { const p = IDX.bySku[it.sku]; if (p && p.trackStock === 'Y') p.stock = String(Math.round((num(p.stock) - num(it.qty)) * 1000) / 1000); });
    LS.set('products', S.products);
    let cust = null;
    if (c) { cust = (S.customers || []).find(x => x.id === c.id); if (cust) { cust.points = String(Math.max(0, num(cust.points) + earned - num(t.pointsUse))); const dbt = t.items.filter(it => it.debt).reduce((s2, it) => s2 + num(it.qty) * num(it.price), 0); cust.totalSpent = String(num(cust.totalSpent) + T.total - dbt); const cr = P.payments.filter(p => p.type === 'credit').reduce((s, p) => s + p.amount, 0); if (cr || dbt) cust.credit = String(Math.round((num(cust.credit) + cr - dbt) * 100) / 100); LS.set('customers', S.customers); } }
    const printable = { ...order, cashOut: t.cashOut || 0, customerPhone: c ? c.phone : '', pointsBalance: cust ? cust.points : null, creditBalance: cust && (P.payments.some(p => p.type === 'credit') || t.items.some(it => it.debt)) ? cust.credit : null };
    if (window.Inst) Inst.applyLocal(order);
    const recent = LS.get('recentOrders', []); recent.unshift(printable); LS.set('recentOrders', recent.slice(0, 30));
    Sync.add(order);
    // รายงานในเครื่องเห็นบิลนี้ทันที (ไม่ต้องรอส่งขึ้นออนไลน์)
    try { if (window.OStore && OStore.allowed()) { if (canStrict('viewCost')) OStore.put([order]); else setTimeout(() => OStore.sync(true), 5000); } } catch (e) { }
    P.done = printable;
    this.renderPay(); this.renderTicket();
    this.pushDisplay({ mode: 'done', total: T.total, change: P.change || 0, cash: P.cash || 0 });
    if (pcn.autoPrint && pcn.type !== 'system') setTimeout(() => RP.printOrder(printable, { drawer: pcn.type === 'rawbt' ? wantDrawer : false }).catch(e => toast('พิมพ์ไม่สำเร็จ: ' + e.message, 1)), 0);
  },
  renderDone() {
    const P = this.pay, o = P.done;
    $('#pmain', this.el).innerHTML = `<div class="done">${I(IC.check, 54)}
      ${num(o.change) > 0 ? `<div class="muted">เงินทอน</div><div class="chg num">${bahtL(o.change)}</div><div class="muted">รับ ${baht(o.cash)} · ยอด ${baht(o.total)}</div>` : `<div class="chg num" style="font-size:44px">${bahtL(o.total)}</div><div class="muted">${esc(JSON.parse(o.payments).map(p => PAYNAME[p.type]).join(' + '))}</div>`}
      ${num(o.pointsEarned) ? `<div class="tag blue">${esc(o.customerName)} ได้รับ ${o.pointsEarned} แต้ม</div>` : ''}
      ${num(o.cashOut) ? `<div class="cashout" style="font-size:20px">💵 จ่ายเงินสดให้ลูกค้า ${bahtL(o.cashOut)}</div>` : ''}
      <div class="tiny muted">ใบเสร็จเลขที่ ${esc(o.id)}</div>
      <div class="row" style="gap:10px;margin-top:10px;width:min(420px,100%)"><button class="btn ghost grow" id="prt" style="min-height:56px">${I(IC.print, 20)} พิมพ์ใบเสร็จ</button><button class="btn grow" id="nxt" style="min-height:56px;background:#7CB342;border-radius:6px;font-size:18px">รายการใหม่</button></div></div>`;
    $('#prt', this.el).onclick = () => RP.printOrder(o, { drawer: false }).catch(e => toast(e.message, 1));
    $('#nxt', this.el).onclick = () => this.newTicket();
    setTimeout(() => { const b = $('#nxt', this.el); b && innerWidth >= 900 && b.focus(); }, 50);
  },
  pushDisplay(extra) {
    this._ptok = (this._ptok || 0) + 1;
    if (!window.Display) return;
    const T = this.totals();
    Display.push({ mode: this.t.items.length ? 'cart' : 'idle', items: this.t.items.slice(-60).map(it => ({ n: it.name, q: it.qty, w: it.byWeight, a: Math.round(num(it.qty) * num(it.price) * 100) / 100 })), count: this.t.items.length, sub: T.sub, disc: T.disc, total: T.total, customer: this.t.customer ? this.t.customer.name : '', cashOut: num(this.t.cashOut) || 0, ...(extra || {}) });
  }
};
VIEWS.pos = el => { POS.pay = POS.pay && POS.pay.done ? null : POS.pay; if (POS.pay && POS.pay.done) POS.newTicket(); POS.mount(el); POS.pushDisplay(); };
// แป้นพิมพ์เด้งขึ้น = ความสูงเปลี่ยน → ไม่วาดหน้าใหม่ (ไม่งั้นช่องค้นหาหลุดโฟกัส แป้นพิมพ์หาย) · วาดใหม่เมื่อความกว้างเปลี่ยน (หมุนจอ)
let _posW = innerWidth;
window.addEventListener('resize', () => { if (S.view !== 'pos') return; clearTimeout(POS.rt); POS.rt = setTimeout(() => { const a = document.activeElement; if (innerWidth !== _posW && !$('.ov') && !(a && a.tagName === 'INPUT')) { _posW = innerWidth; POS.render(); } else POS.fitTicket(); }, 150); });

/* ---------- ลงเวลาทำงาน ---------- */
async function clockToggle() {
  if (S.shift || Clock.get(S.user.id)) { if (await clockOutFlow()) S.shift = null; }
  else { try { const r = await Clock.act('clockIn'); LS.set('clockSess', S.user.id); toast('ลงเวลาเข้างานแล้ว ' + hhmm(r.inAt) + ' น.'); } catch (e) { toast(e.message, 1); } }
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
   <div class="card"><h3>QR รวมยอดอัตโนมัติจาก QR ร้าน</h3>
     <div class="small muted" style="margin-bottom:6px">ระบบอ่านข้อความในรูป QR ของร้านให้เอง (แท็บเล็ต Android) แล้วสร้าง QR ที่มียอดเงินทุกบิล — ลูกค้าไม่ต้องพิมพ์ยอด · ถ้าเครื่องนี้อ่านรูปไม่ได้ ให้วางข้อความ QR ด้านล่าง (ใช้แอปสแกน QR ในมือถือ คัดลอกข้อความ)</div>
     <label class="f"><span>ข้อความใน QR ร้าน</span><textarea class="in" id="qt" rows="2" style="font-family:monospace;font-size:12px">${esc(pc.qrText || '')}</textarea></label>
     <div class="row" style="gap:12px;align-items:center"><div id="qra" style="width:120px;height:120px;background:#fff;border-radius:10px;box-shadow:inset 0 0 0 1.5px var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden"></div><div class="small" id="qrs"></div></div></div>
   <div class="card"><h3>ปุ่มรับเงินลัด (บาท)</h3><input class="in" id="qk" value="${esc((pc.quick || []).join(', '))}"><div class="tiny muted" style="margin-top:4px">ระบบจะเพิ่มยอดปัดขึ้นอัตโนมัติ (เช่น ยอด 65 → 70, 80, 100, 500)</div></div>
   <div class="card"><h3>แต้มสะสม</h3><label class="row" style="margin-bottom:10px"><input type="checkbox" id="pe" ${pt.enabled ? 'checked' : ''}> เปิดใช้แต้มสะสม</label>
     <div class="grid2"><label class="f"><span>ซื้อทุก ๆ (บาท) ได้ 1 แต้ม</span><input class="in" type="number" id="bp" value="${pt.bahtPerPoint}"></label><label class="f"><span>1 แต้ม แลกเป็นส่วนลด (บาท)</span><input class="in" type="number" step="any" id="pv" value="${pt.pointValue}"></label></div></div>
   <button class="btn block green" id="sv">บันทึก</button>`;
  const prevAuto = async () => {
    const t = $('#qt', el).value.trim(), a = $('#qra', el), st = $('#qrs', el);
    if (!t) { a.innerHTML = '<span class="tiny muted">ไม่มี</span>'; st.innerHTML = $('#pp', el).value.trim() ? 'ใช้พร้อมเพย์ด้านบนสร้าง QR พร้อมยอดอยู่แล้ว' : 'ยังไม่มีข้อความ QR — อัปโหลดรูป QR ร้าน หรือวางข้อความ'; return; }
    if (!isThaiQR(t)) { a.innerHTML = '<span class="tiny" style="color:var(--red)">ไม่ถูกต้อง</span>'; st.textContent = 'ข้อความนี้ไม่ใช่ QR รับเงินมาตรฐาน Thai QR'; return; }
    a.innerHTML = `<img src="${await qrDataUrl(amountQR(t, 1), 3)}" style="width:100%">`;
    st.innerHTML = `✔️ อ่าน QR ร้านได้${qrShopName(t) ? ' — ' + esc(qrShopName(t)) : ''}<br><b>ตัวอย่าง QR ยอด 1.00 บาท</b> — ลองสแกนด้วยแอปธนาคาร ตรวจว่ายอดขึ้น 1.00 และชื่อร้านถูกต้อง (ไม่ต้องกดโอน)`;
  };
  const prev = async () => { prevAuto(); const v = $('#pp', el).value.replace(/\D/g, ''); $('#qrp', el).innerHTML = v && !ppOK(v) ? '<span class="tiny" style="color:var(--red);padding:6px;text-align:center">พร้อมเพย์ต้อง 10/13/15 หลัก</span>' : v ? `<img src="${await qrDataUrl(promptpayPayload(v, 1), 3)}" style="width:100%">` : qrImg ? `<img src="${qrImg}" style="width:100%">` : '<span class="tiny muted">ไม่มี QR</span>'; };
  $('#pp', el).oninput = () => {
    const v = $('#pp', el).value.trim();
    // วางข้อความ QR ร้านผิดช่อง → ย้ายไปช่อง "ข้อความใน QR ร้าน" ให้เอง
    if (/^000201/.test(v) && isThaiQR(v)) { $('#qt', el).value = v; $('#pp', el).value = ''; toast('นี่คือข้อความ QR ร้าน — ย้ายไปช่อง "ข้อความใน QR ร้าน" ให้แล้ว'); }
    clearTimeout(el.t); el.t = setTimeout(prev, 300);
  };
  if (pc.promptpay && !ppOK(pc.promptpay)) { $('#pp', el).value = ''; toast('หมายเลขพร้อมเพย์ที่บันทึกไว้ไม่ถูกต้อง (ต้องเป็น 10, 13 หรือ 15 หลัก) — ล้างให้แล้ว กรุณากดบันทึก', 1, 6000); }
  $('#qf', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; decodeQRImage(URL.createObjectURL(f)).then(v => { if (v) { $('#qt', el).value = v; prevAuto(); toast('อ่านข้อความ QR ร้านได้แล้ว'); } else if (!('BarcodeDetector' in window)) toast('เครื่องนี้อ่าน QR จากรูปไม่ได้ — ทำที่แท็บเล็ต Android หรือวางข้อความ QR เอง', 1); else toast('อ่าน QR จากรูปไม่ได้ — ลองรูปที่ชัดขึ้น หรือวางข้อความ QR เอง', 1); }); const im = await loadImg(URL.createObjectURL(f)); const s = Math.min(600, im.width), cv = document.createElement('canvas'); cv.width = s; cv.height = Math.round(im.height * s / im.width); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); qrImg = cv.toDataURL('image/jpeg', .85); if (qrImg.length > 45000) qrImg = cv.toDataURL('image/jpeg', .6); prev(); };
  $('#qx', el).onclick = () => { qrImg = ''; $('#qt', el).value = ''; prev(); };
  $('#qt', el).oninput = () => { clearTimeout(el.t2); el.t2 = setTimeout(prev, 300); };
  $('#sv', el).onclick = async () => {
    const ppv = $('#pp', el).value.replace(/\D/g, '');
    if (ppv && !ppOK(ppv)) return toast('หมายเลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก, เลขบัตร/ผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก', 1, 6000);
    try {
      busy(1);
      await saveSetting('payCfg', { transfer: $('#tr', el).checked, welfare: $('#wf', el).checked, credit: $('#cr', el).checked, promptpay: $('#pp', el).value.replace(/\D/g, ''), qrImage: qrImg, qrText: isThaiQR($('#qt', el).value.trim()) ? $('#qt', el).value.trim() : '', quick: $('#qk', el).value.split(/[,\s]+/).map(Number).filter(Boolean) });
      await saveSetting('pointsCfg', { enabled: $('#pe', el).checked, bahtPerPoint: num($('#bp', el).value) || 25, pointValue: num($('#pv', el).value) || 1 });
      busy(0); toast('บันทึกแล้ว');
    } catch (e) { busy(0); toast(e.message, 1); }
  };
  prev();
};

/* =========================================================
   ซิงค์ตั๋วออเดอร์ระหว่างเครื่องที่ล็อกอินชื่อเดียวกัน (เช่น แท็บเล็ต + มือถือ)
   - เครื่องเดียวกัน (หลายแท็บ): BroadcastChannel — ทันที
   - คนละเครื่อง: เชื่อมตรง WebRTC (Wi-Fi เดียวกัน ~ไม่ถึง 0.1 วิ) + สำรองผ่าน Google (~1–2 วิ)
   - ตัดสินว่าตั๋วไหนใหม่กว่าด้วยเลขรอบ (rev: เพิ่มขึ้นเสมอ อิงเวลา) + รหัสเครื่องเมื่อเท่ากัน → ทุกเครื่องได้ตั๋วเดียวกันเสมอ
   ========================================================= */
const TSync = {
  dev: (() => { let d = LS.get('tkDev', ''); if (!d) { d = Math.random().toString(36).slice(2, 10); LS.set('tkDev', d); } return d; })(),
  rev: LS.get('tkRev', 0), last: null, applying: false, dc: null, pc: null, peerAt: 0, direct: false, own: null, handled: '',
  bc: ('BroadcastChannel' in window) ? new BroadcastChannel('mm-ticket') : null,
  on() { return LS.get('tkSync', true) && !!S.user; },
  code() { let h = 2166136261; const s = (S.apiUrl || 'local') + '|' + (S.user ? S.user.id : ''); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return '9' + String(h % 10000000).padStart(7, '0'); },
  msg() { const t = POS.t; return { k: 'tk', dev: this.dev, u: S.user.id, rev: this.rev, t: { items: t.items, customer: t.customer, discount: t.discount, pointsUse: t.pointsUse || 0, cashOut: t.cashOut || 0 } }; },
  out() {
    if (this.applying || !this.on()) return;
    this.rev = Math.max(this.rev + 1, Date.now()); LS.set('tkRev', this.rev);   // เลขรอบ = เวลา (ตั๋วเก่าค้างจากเมื่อวานไม่ทับตั๋วปัจจุบัน) และเพิ่มขึ้นเสมอ
    const m = this.last = this.msg();
    try { this.bc && this.bc.postMessage(m); } catch (e) { }
    const s = JSON.stringify(m);
    let sent = false; try { if (this.dc && this.dc.readyState === 'open') { this.dc.send(s); sent = true; } } catch (e) { }
    // สำรองผ่าน Google: ส่งเสมอเมื่อยังไม่เชื่อมตรง · ถ้าเชื่อมตรงแล้วส่งช้า ๆ ไว้ให้เครื่องที่เพิ่งเปิด
    if (S.apiUrl) { clearTimeout(this.rt); this.rt = setTimeout(() => api('displayPush', { code: this.code(), state: this.last }).catch(() => { }), sent ? 1500 : 60); }
  },
  in(m) {
    if (!m || m.k !== 'tk' || m.dev === this.dev || !this.on() || m.u !== S.user.id) return;
    this.peerAt = Date.now();
    if (m.rev < this.rev || (m.rev === this.rev && m.dev < this.dev)) return;
    if (this.last && m.rev === this.last.rev && m.dev === this.last.dev) return;
    this.rev = m.rev; LS.set('tkRev', this.rev); this.last = m;
    this.applying = true;
    try {
      POS.t = { items: m.t.items || [], customer: m.t.customer || null, discount: m.t.discount || null, pointsUse: m.t.pointsUse || 0, ...(m.t.cashOut ? { cashOut: m.t.cashOut } : {}) };
      LS.set('ticket', POS.t);
      if (S.view === 'pos' && POS.el) {
        if (POS.pay && (!POS.t.items.length || POS.pay.done)) { POS.pay = null; POS.render(); }
        else if (POS.pay) { POS.renderTicket(); POS.renderPay(); }
        else POS.renderTicket();
        POS.pushDisplay();
      }
    } finally { this.applying = false; }
    this.badge();
  },
  badge() { const b = $('#tsy'); if (!b) return; const live = Date.now() - this.peerAt < 90000; b.style.display = this.on() && live ? '' : 'none'; b.title = this.direct ? 'ซิงค์กับอีกเครื่องแบบเชื่อมตรง' : 'ซิงค์กับอีกเครื่องผ่านอินเทอร์เน็ต'; b.style.color = this.direct ? '#7CB342' : '#FFB300'; },
  // ---- สำรองผ่าน Google ----
  v: '',
  async pull() {
    clearTimeout(this.pt);
    if (this.on() && S.apiUrl && !document.hidden) {
      try {
        const r = await fetch(S.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'displayPull', payload: { code: this.code(), v: this.v } }) }).then(x => x.json());
        if (r && r.ok && !r.same && r.v) { this.v = r.v; this.in(r.state); }
      } catch (e) { }
    }
    const live = Date.now() - this.peerAt < 600000;
    this.pt = setTimeout(() => this.pull(), document.hidden ? 8000 : this.direct ? 6000 : live ? 1200 : 2000);
  },
  // ---- เชื่อมตรง WebRTC ระหว่างเครื่อง (ใช้ช่องส่งสัญญาณเดียวกับจอลูกค้า) ----
  wire(ch) {
    this.dc = ch;
    ch.onopen = () => { this.direct = true; this.peerAt = this.rxAt = Date.now(); try { ch.send('hello'); } catch (e) { } this.badge();
      // ตรวจสายทุก 3 วิ: เงียบเกิน 10 วิ (อีกเครื่องปิด/หลับ/หลุด Wi-Fi) → ตัดแล้วเชื่อมใหม่ทันที ระหว่างนั้นส่งผ่าน Google
      clearInterval(this.hb); this.hb = setInterval(() => { if (this.dc !== ch) return clearInterval(this.hb); try { ch.send('ping'); } catch (e) { } if (Date.now() - this.rxAt > 10000) { clearInterval(this.hb); try { ch.close(); this.pc && this.pc.close(); } catch (e) { } this.dc = null; this.direct = false; this.own = null; this.badge(); this.rtc(); } }, 3000); };
    ch.onmessage = e => { this.rxAt = this.peerAt = Date.now(); if (e.data === 'ping') { try { ch.send('pong'); } catch (x) { } return; } if (e.data === 'pong') return; if (e.data === 'hello') { if (this.last) try { ch.send(JSON.stringify(this.last.dev === this.dev ? this.last : this.msg())); } catch (x) { } return; } try { this.in(JSON.parse(e.data)); } catch (x) { } };
    ch.onclose = () => { if (this.dc === ch) { this.dc = null; this.direct = false; this.own = null; this.badge(); clearTimeout(this.st); this.st = setTimeout(() => this.rtc(), 300); } };
  },
  async rtc() {
    clearTimeout(this.st);
    const open = this.dc && this.dc.readyState === 'open';
    if (this.on() && S.apiUrl && !document.hidden && !open && 'RTCPeerConnection' in window && typeof sig === 'function') {
      const code = this.code();
      try {
        const off = await sig(code, 'offer');
        if (off && off.dev && off.dev !== this.dev && off.id !== this.handled && Date.now() - off.t < 60000) {
          // อีกเครื่องขอเชื่อม → ตอบรับ
          this.handled = off.id; this.own = null; this.peerAt = Date.now();
          try { this.pc && this.pc.close(); } catch (e) { }
          const pc = this.pc = new RTCPeerConnection(RTC_CFG);
          pc.ondatachannel = ev => this.wire(ev.channel);
          await pc.setRemoteDescription(off.sdp); await pc.setLocalDescription(await pc.createAnswer()); await iceDone(pc);
          await sig(code, 'answer', { id: off.id, dev: this.dev, sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: 'answer', sdp: pc.localDescription.sdp } });
        } else if (this.own && Date.now() - this.own.t < 45000) {
          const ans = await sig(code, 'answer');
          if (ans && ans.id === this.own.id && this.pc && this.pc.signalingState === 'have-local-offer') { await this.pc.setRemoteDescription(ans.sdp); this.own = null; }
        } else if (!off || off.dev === this.dev || Date.now() - off.t >= 60000 || off.id === this.handled) {
          // ยังไม่มีใครขอ → ประกาศให้อีกเครื่องมาเชื่อม
          try { this.pc && this.pc.close(); } catch (e) { }
          const pc = this.pc = new RTCPeerConnection(RTC_CFG);
          this.wire(pc.createDataChannel('tk', { ordered: true }));
          await pc.setLocalDescription(await pc.createOffer()); await iceDone(pc);
          const id = Math.random().toString(36).slice(2);
          this.own = { id, t: Date.now() };
          await sig(code, 'offer', { id, dev: this.dev, t: Date.now(), sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: 'offer', sdp: pc.localDescription.sdp } });
        }
      } catch (e) { }
    }
    const live = Date.now() - this.peerAt < 600000;
    this.st = setTimeout(() => this.rtc(), document.hidden ? 10000 : open ? 8000 : this.own ? 1500 : live ? 3000 : 6000);
  },
  start() { if (this.started) return; this.started = true; this.pull(); setTimeout(() => this.rtc(), 800); document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.pull(); this.rtc(); } }); setInterval(() => this.badge(), 15000); }
};
window.TSync = TSync;
if (TSync.bc) TSync.bc.onmessage = e => { const m = e.data; if (m === 'hello') { if (TSync.on() && TSync.last) TSync.bc.postMessage(TSync.last.dev === TSync.dev ? TSync.last : TSync.msg()); return; } TSync.in(m); };
document.addEventListener('mm:booted', () => { TSync.start(); try { TSync.bc && TSync.bc.postMessage('hello'); } catch (e) { } });

// ⏱ วัดเวลาสแกนบนหน้าขาย (เปิดที่หน้า เครื่องยิงบาร์โค้ด) — แยก "เครื่องยิงส่ง" กับ "ระบบแสดง"
window.addEventListener('mm:scanTiming', e => { if (!LS.get('scanMeter', false)) return; const b = $('#smt'); if (!b) return; const H = e.detail; b.style.display = ''; b.textContent = `⏱ ยิง ${H.ms != null ? H.ms : '?'} · แสดง ${H.show} ms`; b.style.color = H.show > 150 ? '#FF6B6B' : ''; });
