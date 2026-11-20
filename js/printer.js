/* =========================================================
   เครื่องพิมพ์ใบเสร็จ (ESC/POS) — Bluetooth BLE / USB / USB-Serial / RawBT / พิมพ์ผ่านระบบ
   ใบเสร็จวาดเป็นภาพ (raster) จึงพิมพ์ภาษาไทยได้ทุกเครื่อง ไม่ต้องพึ่งฟอนต์ในเครื่องพิมพ์
   ========================================================= */
'use strict';
const RCFG_DEF = { paper: 58, header: '', footer: 'ขอบคุณที่อุดหนุนค่ะ', showCustomer: true, showCashier: true, showDevice: false, showPoints: true, showBarcode: true, showAddress: true, cut: true, fontScale: 1 };
const rcfg = () => cfg('receiptCfg', RCFG_DEF);
const PCONN_DEF = { type: 'system', chunk: 120, delay: 15, baud: 9600, autoPrint: true, drawer: false, name: '' };
const pconn = () => ({ ...PCONN_DEF, ...LS.get('printerConn', {}) });

/* ---------- วาดใบเสร็จ ---------- */
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function renderReceipt(order, opt = {}) {
  const c = { ...rcfg(), ...opt };
  const W = c.paper == 80 ? 576 : 384, pad = 6;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = 4000;
  const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, cv.height); x.fillStyle = '#000'; x.textBaseline = 'top';
  const fs = Math.round((W === 576 ? 26 : 22) * (c.fontScale || 1));
  const F = (w, s) => `${w} ${s}px "Noto Sans Thai",Prompt,sans-serif`;
  let y = 4;
  const text = (t, o = {}) => {
    const s = o.size || fs; x.font = F(o.bold ? 700 : 500, s); const lh = Math.round(s * 1.32);
    const lines = o.nowrap ? [String(t)] : wrapText(x, String(t), W - pad * 2, o.max || 6);
    lines.forEach(l => { x.textAlign = o.align || 'left'; x.fillText(l, o.align === 'center' ? W / 2 : o.align === 'right' ? W - pad : pad, y); y += lh; });
  };
  const lr = (l, r, o = {}) => {
    const s = o.size || fs; x.font = F(o.bold ? 700 : 500, s); const lh = Math.round(s * 1.32);
    const rw = x.measureText(r).width; const ll = wrapText(x, String(l), W - pad * 2 - rw - 10, 3);
    ll.forEach((t, i) => { x.textAlign = 'left'; x.fillText(t, pad, y); if (i === ll.length - 1) { x.textAlign = 'right'; x.fillText(r, W - pad, y); } y += lh; });
  };
  const dash = () => { y += 4; for (let i = pad; i < W - pad; i += 10) x.fillRect(i, y, 6, 2); y += 10; };
  // โลโก้
  const logo = S.settings.receiptLogo;
  if (logo && opt.logo !== false) { try { const im = await loadImg(logo); const w = Math.min(im.width, W * .7), h = im.height * w / im.width; x.drawImage(im, (W - w) / 2, y, w, h); y += h + 6; } catch (e) { } }
  text(S.settings.shopName || 'ร้านเมย์ มินิมาร์ท', { bold: 1, size: Math.round(fs * 1.3), align: 'center' });
  if (c.showAddress && S.settings.address) text(S.settings.address, { align: 'center', size: Math.round(fs * .85) });
  if (c.showAddress && S.settings.phone) text('โทร ' + S.settings.phone, { align: 'center', size: Math.round(fs * .85) });
  String(c.header || '').split('\n').filter(Boolean).forEach(l => text(l, { align: 'center', size: Math.round(fs * .9) }));
  y += 4;
  const refund = order.status === 'refund';
  text(order.title || (refund ? 'ใบคืนเงิน' : 'ใบเสร็จรับเงิน'), { bold: 1, align: 'center' });
  if (order.reprint) text('(สำเนา — พิมพ์ซ้ำ)', { align: 'center', size: Math.round(fs * .8) });
  dash();
  const d = String(order.date || '').replace('T', ' ').slice(0, 16);
  lr('เลขที่ ' + order.id, '', { size: Math.round(fs * .9) });
  lr(thDate(d.slice(0, 10)) + ' ' + d.slice(11), '', { size: Math.round(fs * .9) });
  if (c.showCashier && order.cashierName) lr('พนักงาน: ' + order.cashierName, '', { size: Math.round(fs * .9) });
  if (c.showDevice && order.deviceName) lr('เครื่อง: ' + order.deviceName, '', { size: Math.round(fs * .9) });
  if (c.showCustomer && order.customerName) lr('ลูกค้า: ' + order.customerName + (order.customerPhone ? ' ' + order.customerPhone : ''), '', { size: Math.round(fs * .9) });
  if (refund && order.refundOf) lr('อ้างอิงใบเสร็จ ' + order.refundOf, '', { size: Math.round(fs * .9) });
  dash();
  const items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);
  items.forEach(it => {
    const q = num(it.qty), pr = num(it.price);
    const qs = it.byWeight === 'Y' ? q.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' กก.' : q;
    lr(it.name, money(q * pr * (refund ? -1 : 1), 2));
    if (q !== 1 || it.byWeight === 'Y') { x.font = F(500, Math.round(fs * .85)); text(`   ${qs} × ${money(pr)}`, { size: Math.round(fs * .85) }); }
  });
  dash();
  const sub = num(order.subtotal), disc = num(order.discount), tot = num(order.total);
  lr('รวม ' + items.reduce((s, it) => s + (it.byWeight === 'Y' ? 1 : num(it.qty)), 0) + ' ชิ้น', money(sub));
  if (disc) lr('ส่วนลด' + (order.pointsUsed && num(order.pointsUsed) ? ` (ใช้ ${order.pointsUsed} แต้ม)` : ''), '-' + money(Math.abs(disc)));
  lr('ยอดสุทธิ', money(tot), { bold: 1, size: Math.round(fs * 1.35) });
  const pays = typeof order.payments === 'string' ? JSON.parse(order.payments || '[]') : (order.payments || []);
  pays.forEach(p => lr(PAYNAME[p.type] || p.type, money(p.amount)));
  if (num(order.cash) > 0) { lr('รับเงินสด', money(order.cash)); lr('เงินทอน', money(order.change), { bold: 1 }); }
  if (c.showPoints && order.customerId && (num(order.pointsEarned) || order.pointsBalance != null)) { dash(); if (num(order.pointsEarned)) lr('แต้มที่ได้รับ', '+' + order.pointsEarned); if (order.pointsBalance != null) lr('แต้มสะสมคงเหลือ', String(order.pointsBalance)); }
  if (order.creditBalance != null && num(order.creditBalance)) lr('ยอดค้างชำระ (เงินเชื่อ)', money(order.creditBalance), { bold: 1 });
  dash();
  String(c.footer || '').split('\n').filter(Boolean).forEach(l => text(l, { align: 'center' }));
  if (c.showBarcode && window.JsBarcode && order.id) { y += 6; drawBarcode(x, order.id, pad + 20, y, W - pad * 2 - 40, 70, false); y += 74; }
  y += 10;
  const out = document.createElement('canvas'); out.width = W; out.height = y;
  out.getContext('2d').drawImage(cv, 0, 0);
  return out;
}

/* ---------- ESC/POS ---------- */
function canvasToEscPos(cv, o = {}) {
  const W = cv.width, H = cv.height, bpr = Math.ceil(W / 8);
  const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
  const out = [0x1B, 0x40];
  if (o.drawer) out.push(0x1B, 0x70, 0x00, 0x19, 0xFA);
  const BAND = 48;
  for (let y0 = 0; y0 < H; y0 += BAND) {
    const h = Math.min(BAND, H - y0);
    out.push(0x1D, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, h & 0xff, h >> 8);
    for (let y = y0; y < y0 + h; y++) for (let b = 0; b < bpr; b++) {
      let v = 0;
      for (let k = 0; k < 8; k++) { const xx = b * 8 + k; if (xx < W) { const i = (y * W + xx) * 4; if (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114 < 150) v |= 0x80 >> k; } }
      out.push(v);
    }
  }
  out.push(0x1B, 0x64, 4);
  if (o.cut) out.push(0x1D, 0x56, 0x42, 0x00);
  return new Uint8Array(out);
}

/* ---------- การเชื่อมต่อ ---------- */
const BLE_SVCS = ['000018f0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb', '0000ae30-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000ae00-0000-1000-8000-00805f9b34fb', '0000ff12-0000-1000-8000-00805f9b34fb'];
const RP = {
  t: null, dev: null, ch: null, usb: null, ep: null, port: null, writer: null,
  get ok() {
    const c = pconn();
    if (c.type === 'system' || c.type === 'rawbt') return true;
    if (c.type === 'bt') return !!(this.dev && this.dev.gatt.connected && this.ch);
    if (c.type === 'usb') return !!(this.usb && this.usb.opened);
    if (c.type === 'serial') return !!this.writer;
    return false;
  },
  label() { const c = pconn(); return ({ bt: 'Bluetooth', usb: 'USB', serial: 'USB-Serial', rawbt: 'RawBT (Android)', system: 'พิมพ์ผ่านระบบ' })[c.type] + (c.name ? ' · ' + c.name : ''); },
  async connect(type, silent) {
    const c = pconn(); type = type || c.type;
    if (type === 'bt') {
      if (!navigator.bluetooth) throw new Error('อุปกรณ์/เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth (ใช้ Chrome บน Android/คอมพิวเตอร์ หรือแอป Bluefy บน iPhone/iPad)');
      let dev = null;
      if (silent && navigator.bluetooth.getDevices) { const ds = await navigator.bluetooth.getDevices(); dev = ds.find(d => d.id === c.btId) || null; if (!dev) return false; }
      if (!dev) dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SVCS });
      const srv = await dev.gatt.connect();
      let ch = null;
      for (const s of await srv.getPrimaryServices()) {
        try { for (const k of await s.getCharacteristics()) if (k.properties.writeWithoutResponse || k.properties.write) { ch = k; break; } } catch (e) { }
        if (ch) break;
      }
      if (!ch) throw new Error('ไม่พบช่องส่งข้อมูลของเครื่องพิมพ์ — เครื่องนี้อาจเป็น Bluetooth แบบ Classic ให้ใช้ RawBT แทน');
      this.dev = dev; this.ch = ch; dev.addEventListener('gattserverdisconnected', () => { this.ch = null; document.dispatchEvent(new Event('mm:printer')); });
      LS.set('printerConn', { ...c, type, name: dev.name || 'Bluetooth', btId: dev.id });
    } else if (type === 'usb') {
      if (!navigator.usb) throw new Error('เบราว์เซอร์นี้ไม่รองรับ WebUSB (ใช้ Chrome บนคอมพิวเตอร์/Android)');
      let dev = null;
      if (silent) { const ds = await navigator.usb.getDevices(); dev = ds.find(d => d.vendorId === c.vid && d.productId === c.pid) || null; if (!dev) return false; }
      if (!dev) dev = await navigator.usb.requestDevice({ filters: [] });
      await dev.open(); if (!dev.configuration) await dev.selectConfiguration(1);
      let ifc = null, ep = null;
      for (const i of dev.configuration.interfaces) for (const alt of i.alternates) {
        const e = alt.endpoints.find(e => e.direction === 'out' && e.type === 'bulk');
        if (e && (!ifc || alt.interfaceClass === 7)) { ifc = i; ep = e; }
      }
      if (!ep) throw new Error('ไม่พบช่องส่งข้อมูล USB ของเครื่องพิมพ์');
      await dev.claimInterface(ifc.interfaceNumber);
      this.usb = dev; this.ep = ep;
      LS.set('printerConn', { ...c, type, name: dev.productName || 'USB', vid: dev.vendorId, pid: dev.productId });
    } else if (type === 'serial') {
      if (!navigator.serial) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Web Serial (ใช้ Chrome บนคอมพิวเตอร์)');
      let port = null;
      if (silent) { const ps = await navigator.serial.getPorts(); port = ps[0] || null; if (!port) return false; }
      if (!port) port = await navigator.serial.requestPort();
      await port.open({ baudRate: c.baud || 9600 });
      this.port = port; this.writer = port.writable.getWriter();
      LS.set('printerConn', { ...c, type, name: 'USB-Serial' });
    } else LS.set('printerConn', { ...c, type, name: '' });
    document.dispatchEvent(new Event('mm:printer'));
    return true;
  },
  async autoConnect() { const c = pconn(); if (['bt', 'usb', 'serial'].includes(c.type) && !this.ok) { try { await this.connect(c.type, true); } catch (e) { } } },
  async send(bytes) {
    const c = pconn();
    if (c.type === 'bt') {
      const n = Math.max(20, c.chunk || 120);
      for (let i = 0; i < bytes.length; i += n) {
        const part = bytes.slice(i, i + n);
        if (this.ch.properties.writeWithoutResponse) await this.ch.writeValueWithoutResponse(part); else await this.ch.writeValue(part);
        await sleep(c.delay || 15);
      }
    } else if (c.type === 'usb') {
      for (let i = 0; i < bytes.length; i += 4096) await this.usb.transferOut(this.ep.endpointNumber, bytes.slice(i, i + 4096));
    } else if (c.type === 'serial') {
      for (let i = 0; i < bytes.length; i += 1024) await this.writer.write(bytes.slice(i, i + 1024));
    } else if (c.type === 'rawbt') {
      let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
      location.href = 'intent:base64,' + btoa(bin) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
    }
  },
  async printCanvas(cv, o = {}) {
    const c = pconn();
    if (c.type === 'system') {
      const pa = $('#printArea'); const mm = cv.width === 576 ? 80 : 58;
      pa.innerHTML = `<style>@page{size:${mm}mm auto;margin:0}</style><img src="${cv.toDataURL('image/png')}" style="width:${mm - 4}mm;display:block;margin:0 auto">`;
      await sleep(80);
      try { window.print(); } catch (e) { throw new Error('อุปกรณ์นี้สั่งพิมพ์ผ่านระบบไม่ได้'); }
      return;
    }
    if (!this.ok) await this.connect(c.type);
    const bytes = canvasToEscPos(cv, { cut: rcfg().cut, drawer: o.drawer });
    for (let i = 0; i < (o.copies || 1); i++) await this.send(bytes);
  },
  async printOrder(order, o = {}) {
    await document.fonts.ready;
    const cv = await renderReceipt(order, o);
    const c = pconn();
    await this.printCanvas(cv, { drawer: o.drawer != null ? o.drawer : (c.drawer && JSON.parse(typeof order.payments === 'string' ? order.payments : JSON.stringify(order.payments || [])).some(p => p.type === 'cash')) });
  }
};

/* ประมวลผลรูปโลโก้: ย่อ + แปลงขาวดำแบบ dithering */
async function processLogo(file, maxW) {
  const im = await loadImg(URL.createObjectURL(file));
  const w = Math.min(maxW, im.width), h = Math.round(im.height * w / im.width);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data, g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = d[i * 4 + 3] < 30 ? 255 : d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = yy * w + xx, o = g[i], nv = o < 128 ? 0 : 255, e = o - nv; g[i] = nv;
    if (xx + 1 < w) g[i + 1] += e * 7 / 16; if (yy + 1 < h) { if (xx) g[i + w - 1] += e * 3 / 16; g[i + w] += e * 5 / 16; if (xx + 1 < w) g[i + w + 1] += e / 16; }
  }
  for (let i = 0; i < w * h; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g[i]; d[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

const SAMPLE_ORDER = () => ({ id: (S.device.no || '1') + '-000123', date: LocalDB.now(), cashierName: S.user ? S.user.name : 'Cashier', deviceName: S.device.name || 'POS 1', customerName: 'คุณสมใจ', customerPhone: '081-234-5678', customerId: 'C1',
  items: [{ name: 'ข้อต่อตรง 3/4" 6หุน', qty: 2, price: 10 }, { name: 'Yoyo ฟรุตตี้', qty: 1, price: 5 }, { name: 'กุ้งแม่น้ำ', qty: .5, price: 280, byWeight: 'Y' }, { name: 'อาหารปลาเม็ดเล็ก', qty: 1, price: 35 }],
  subtotal: 200, discount: 0, total: 200, payments: [{ type: 'cash', amount: 200 }], cash: 500, change: 300, pointsEarned: 8, pointsBalance: 120 });

/* ---------- หน้าตั้งค่าเครื่องพิมพ์ + ออกแบบใบเสร็จ ---------- */
VIEWS.printer = el => {
  const c = rcfg(); let logo = S.settings.receiptLogo || '';
  const pc = pconn();
  el.innerHTML = vhead('เครื่องพิมพ์ใบเสร็จ', '', 'more') + `
  <div class="card"><h3>การเชื่อมต่อ (เฉพาะเครื่องนี้)</h3>
    <div class="seg wrap" id="ptype">${[['bt', 'Bluetooth'], ['usb', 'USB'], ['serial', 'USB-Serial'], ['rawbt', 'RawBT'], ['system', 'ผ่านระบบ']].map(([k, n]) => `<button data-t="${k}" class="${pc.type === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="small muted" id="phelp" style="margin:8px 2px"></div>
    <div class="row"><div class="grow small" id="pst"></div><button class="btn sm" id="pcon">เชื่อมต่อ</button><button class="btn ghost sm" id="ptest">ทดสอบพิมพ์</button></div>
    <label class="row small" style="margin-top:10px"><input type="checkbox" id="auto" ${pc.autoPrint ? 'checked' : ''}> พิมพ์ใบเสร็จอัตโนมัติหลังรับชำระ</label>
    <label class="row small" style="margin-top:6px"><input type="checkbox" id="drw" ${pc.drawer ? 'checked' : ''}> เปิดลิ้นชักเก็บเงินเมื่อรับเงินสด (ลิ้นชักต่อกับเครื่องพิมพ์)</label>
    <details style="margin-top:8px"><summary class="small muted">ขั้นสูง</summary><div class="grid3" style="margin-top:8px"><label class="f"><span>ขนาดชิ้น BT (ไบต์)</span><input class="in" type="number" id="chunk" value="${pc.chunk}"></label><label class="f"><span>หน่วงเวลา (ms)</span><input class="in" type="number" id="delay" value="${pc.delay}"></label><label class="f"><span>Baud (Serial)</span><input class="in" type="number" id="baud" value="${pc.baud}"></label></div></details>
  </div>
  <div class="card"><h3>ออกแบบใบเสร็จ ${isOwner() ? '' : '<span class="tag gray">ดูอย่างเดียว</span>'}</h3>
    <div class="seg" id="paper" style="margin-bottom:10px"><button data-p="58" class="${c.paper != 80 ? 'on' : ''}">กระดาษ 58 มม.</button><button data-p="80" class="${c.paper == 80 ? 'on' : ''}">กระดาษ 80 มม.</button></div>
    <div class="row" style="gap:10px;margin-bottom:10px"><div id="lg" style="width:120px;height:60px;background:#fff;border-radius:10px;box-shadow:inset 0 0 0 1.5px var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden">${logo ? `<img src="${logo}" style="max-width:100%;max-height:100%">` : '<span class="tiny muted">ไม่มีโลโก้</span>'}</div>
      <div><label class="btn ghost sm">อัปโหลดโลโก้<input type="file" accept="image/*" id="lgf" class="hidden"></label> <button class="btn ghost sm" id="lgx">ลบ</button><div class="tiny muted">แปลงเป็นขาวดำอัตโนมัติ</div></div></div>
    <label class="f"><span>ข้อความส่วนหัว (ใต้ชื่อร้าน)</span><textarea class="in" id="hd" rows="2" placeholder="เช่น เลขผู้เสียภาษี / เวลาเปิด-ปิด">${esc(c.header)}</textarea></label>
    <label class="f"><span>ข้อความส่วนท้าย</span><textarea class="in" id="ft" rows="2">${esc(c.footer)}</textarea></label>
    <div class="grid2 small">${[['showAddress', 'แสดงที่อยู่/โทร'], ['showCashier', 'แสดงชื่อพนักงาน'], ['showCustomer', 'แสดงข้อมูลลูกค้า'], ['showPoints', 'แสดงแต้มสะสม'], ['showDevice', 'แสดงชื่อเครื่อง'], ['showBarcode', 'บาร์โค้ดเลขที่ใบเสร็จ'], ['cut', 'ตัดกระดาษอัตโนมัติ']].map(([k, n]) => `<label class="row"><input type="checkbox" data-k="${k}" ${c[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div>
    <label class="f" style="margin-top:10px"><span>ขนาดตัวอักษร</span><select class="in" id="fsz"><option value="0.9">เล็ก</option><option value="1">ปกติ</option><option value="1.15">ใหญ่</option></select></label>
    ${isOwner() ? '<button class="btn block green" id="sv">บันทึกรูปแบบใบเสร็จ</button>' : ''}
  </div>
  <div class="card center"><div class="small muted" style="margin-bottom:8px">ตัวอย่างใบเสร็จ</div><canvas id="pv" style="max-width:100%;width:290px;box-shadow:0 4px 16px rgba(0,0,0,.12);background:#fff"></canvas></div>`;
  $('#fsz', el).value = String(c.fontScale || 1);
  const HELP = { bt: 'เครื่องพิมพ์ Bluetooth Low Energy (BLE) — ใช้ Chrome บน Android/Windows/Mac หรือแอป Bluefy บน iPhone/iPad', usb: 'ต่อสาย USB Type-C/Type-A กับมือถือ Android (ผ่าน OTG) หรือคอมพิวเตอร์ — ใช้ Chrome', serial: 'เครื่องพิมพ์ที่ต่อ USB แล้วขึ้นเป็นพอร์ต COM (คอมพิวเตอร์)', rawbt: 'เครื่องพิมพ์ Bluetooth แบบ Classic บน Android — ติดตั้งแอป RawBT แล้วจับคู่เครื่องพิมพ์ในแอปนั้น', system: 'ใช้หน้าต่างพิมพ์ของระบบ (เครื่องพิมพ์ที่ติดตั้งไว้ในคอม/AirPrint) — ต้องกดยืนยันทุกครั้ง' };
  const getC = () => { const o = { ...c, header: $('#hd', el).value, footer: $('#ft', el).value, fontScale: +$('#fsz', el).value }; $$('[data-k]', el).forEach(k => o[k.dataset.k] = k.checked); o.paper = +$('#paper .on', el).dataset.p; return o; };
  const pv = async () => { const saved = S.settings.receiptLogo; S.settings.receiptLogo = logo; const cv = await renderReceipt(SAMPLE_ORDER(), getC()); S.settings.receiptLogo = saved; const t = $('#pv', el); t.width = cv.width; t.height = cv.height; t.getContext('2d').drawImage(cv, 0, 0); };
  const st = () => { const p = pconn(); $('#pst', el).innerHTML = (RP.ok ? '<span class="tag green">พร้อม</span> ' : '<span class="tag gray">ยังไม่เชื่อมต่อ</span> ') + esc(RP.label()); $('#phelp', el).textContent = HELP[p.type]; $('#pcon', el).style.display = ['bt', 'usb', 'serial'].includes(p.type) ? '' : 'none'; };
  $$('#ptype button', el).forEach(b => b.onclick = () => { LS.set('printerConn', { ...pconn(), type: b.dataset.t, name: '' }); $$('#ptype button', el).forEach(x => x.classList.toggle('on', x === b)); st(); });
  $$('#paper button', el).forEach(b => b.onclick = () => { $$('#paper button', el).forEach(x => x.classList.toggle('on', x === b)); pv(); });
  $('#pcon', el).onclick = async () => { try { busy(1, 'กำลังเชื่อมต่อ...'); await RP.connect(); busy(0); toast('เชื่อมต่อแล้ว'); } catch (e) { busy(0); if (e.name !== 'NotFoundError') toast(e.message, 1); } st(); };
  $('#ptest', el).onclick = async () => { try { busy(1, 'กำลังพิมพ์...'); await RP.printOrder({ ...SAMPLE_ORDER(), title: 'ทดสอบเครื่องพิมพ์' }); busy(0); } catch (e) { busy(0); toast(e.message, 1); } st(); };
  ['auto', 'drw'].forEach(id => $('#' + id, el).onchange = () => LS.set('printerConn', { ...pconn(), autoPrint: $('#auto', el).checked, drawer: $('#drw', el).checked }));
  ['chunk', 'delay', 'baud'].forEach(id => $('#' + id, el).onchange = e => LS.set('printerConn', { ...pconn(), [id]: +e.target.value }));
  $$('textarea,input[data-k],select', el).forEach(i => i.addEventListener('change', pv));
  $('#lgf', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; logo = await processLogo(f, getC().paper == 80 ? 400 : 280); $('#lg', el).innerHTML = `<img src="${logo}" style="max-width:100%;max-height:100%">`; pv(); };
  $('#lgx', el).onclick = () => { logo = ''; $('#lg', el).innerHTML = '<span class="tiny muted">ไม่มีโลโก้</span>'; pv(); };
  const sv = $('#sv', el); if (sv) sv.onclick = async () => { try { busy(1); await saveSetting('receiptCfg', getC()); if (logo !== (S.settings.receiptLogo || '')) await saveSetting('receiptLogo', logo); busy(0); toast('บันทึกรูปแบบใบเสร็จแล้ว (ใช้กับทุกเครื่อง)'); } catch (e) { busy(0); toast(e.message, 1); } };
  const h = () => st(); document.addEventListener('mm:printer', h); S.cleanup = () => document.removeEventListener('mm:printer', h);
  st(); document.fonts.ready.then(pv);
};
