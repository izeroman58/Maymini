/* =========================================================
   เครื่องพิมพ์ใบเสร็จ (ESC/POS) — Bluetooth BLE / USB / USB-Serial / RawBT / พิมพ์ผ่านระบบ
   ใบเสร็จวาดเป็นภาพ (raster) จึงพิมพ์ภาษาไทยได้ทุกเครื่อง ไม่ต้องพึ่งฟอนต์ในเครื่องพิมพ์
   ========================================================= */
'use strict';
const RCFG_DEF = { paper: 80, header: '', footer: 'ขอบคุณที่อุดหนุนค่ะ', showCustomer: true, showCashier: true, showDevice: false, showPoints: true, showBarcode: true, showAddress: true, cut: true, fontScale: 1, showLogo: true, shopName: '', title: 'ใบเสร็จรับเงิน', taxId: '', qtyLine: false, bigTotal: true, qrText: '', qrLabel: '', feed: 4 };
const rcfg = () => cfg('receiptCfg', RCFG_DEF);
const PCONN_DEF = { type: 'system', chunk: 120, delay: 15, baud: 9600, autoPrint: true, drawer: false, drawerAll: false, drawerPin: '2', name: '' };
// เดิมค่าเริ่มต้นส่งคำสั่งลิ้นชักทั้ง 2 ขา — เครื่องพิมพ์ที่ไม่รองรับขา 5 จะเลื่อนกระดาษ → เปลี่ยนเป็นขา 2 (มาตรฐาน) ครั้งเดียว
(() => { const c = LS.get('printerConn', null); if (c && c.drawerPin === 'both' && !LS.get('drawerMig', false)) { c.drawerPin = '2'; LS.set('printerConn', c); } LS.set('drawerMig', true); })();
const drawerBytes = () => { const pin = pconn().drawerPin, out = []; (pin === '2' ? [0] : pin === '5' ? [1] : [0, 1]).forEach(m => out.push(0x1B, 0x70, m, 0x19, 0xFA)); return out; };
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
  if (logo && opt.logo !== false && c.showLogo !== false) { try { const im = await loadImg(logo); const w = Math.min(im.width, W * .7), h = im.height * w / im.width; x.drawImage(im, (W - w) / 2, y, w, h); y += h + 6; } catch (e) { } }
  text(c.shopName || S.settings.shopName || 'ร้านเมย์ มินิมาร์ท', { bold: 1, size: Math.round(fs * 1.3), align: 'center' });
  if (c.taxId) text('เลขประจำตัวผู้เสียภาษี ' + c.taxId, { align: 'center', size: Math.round(fs * .85) });
  if (c.showAddress && S.settings.address) text(S.settings.address, { align: 'center', size: Math.round(fs * .85) });
  if (c.showAddress && S.settings.phone) text('โทร ' + S.settings.phone, { align: 'center', size: Math.round(fs * .85) });
  String(c.header || '').split('\n').filter(Boolean).forEach(l => text(l, { align: 'center', size: Math.round(fs * .9) }));
  y += 4;
  const refund = order.status === 'refund';
  text(order.title || (refund ? 'ใบคืนเงิน' : (c.title || 'ใบเสร็จรับเงิน')), { bold: 1, align: 'center' });
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
    if (q !== 1 || it.byWeight === 'Y' || c.qtyLine) { x.font = F(500, Math.round(fs * .85)); text(`   ${qs} × ${money(pr)}`, { size: Math.round(fs * .85) }); }
  });
  dash();
  const sub = num(order.subtotal), disc = num(order.discount), tot = num(order.total);
  lr('รวม ' + items.reduce((s, it) => s + (it.byWeight === 'Y' ? 1 : num(it.qty)), 0) + ' ชิ้น', money(sub));
  if (disc) lr('ส่วนลด' + (order.pointsUsed && num(order.pointsUsed) ? ` (ใช้ ${order.pointsUsed} แต้ม)` : ''), '-' + money(Math.abs(disc)));
  lr('ยอดสุทธิ', money(tot), { bold: 1, size: Math.round(fs * (c.bigTotal === false ? 1.05 : 1.35)) });
  const pays = typeof order.payments === 'string' ? JSON.parse(order.payments || '[]') : (order.payments || []);
  pays.forEach(p => lr(PAYNAME[p.type] || p.type, money(p.amount)));
  if (num(order.cash) > 0) { lr('รับเงินสด', money(order.cash)); lr('เงินทอน', money(order.change), { bold: 1 }); }
  if (c.showPoints && order.customerId && (num(order.pointsEarned) || order.pointsBalance != null)) { dash(); if (num(order.pointsEarned)) lr('แต้มที่ได้รับ', '+' + order.pointsEarned); if (order.pointsBalance != null) lr('แต้มสะสมคงเหลือ', String(order.pointsBalance)); }
  if (order.creditBalance != null && num(order.creditBalance)) lr('ยอดค้างชำระ (เงินเชื่อ)', money(order.creditBalance), { bold: 1 });
  dash();
  String(c.footer || '').split('\n').filter(Boolean).forEach(l => text(l, { align: 'center' }));
  if (c.qrText && window.qrDataUrl) { try { const im = await loadImg(await qrDataUrl(c.qrText, 5)); const s = Math.min(W * .5, 240); y += 6; x.drawImage(im, (W - s) / 2, y, s, s); y += s + 2; if (c.qrLabel) text(c.qrLabel, { align: 'center', size: Math.round(fs * .85) }); } catch (e) { } }
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
  if (o.drawer) out.push(...drawerBytes());
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
  out.push(0x1B, 0x64, Math.max(0, Math.min(10, o.feed != null ? o.feed : 4)));
  if (o.cut) out.push(0x1D, 0x56, 0x42, 0x00);
  return new Uint8Array(out);
}

/* ---------- การเชื่อมต่อ ---------- */
const BLE_SVCS = ['000018f0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb', '0000ae30-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000ae00-0000-1000-8000-00805f9b34fb', '0000ff12-0000-1000-8000-00805f9b34fb'];
const SPP = '00001101-0000-1000-8000-00805f9b34fb';
// แท็บเล็ต Samsung มักเปิด Chrome แบบ "เว็บไซต์เดสก์ท็อป" → ไม่มีคำว่า Android ใน userAgent จึงดูจากจอสัมผัสบน Linux ด้วย
const isAndroidish = () => /Android/i.test(navigator.userAgent) || (/Linux/i.test(navigator.userAgent) && navigator.maxTouchPoints > 0);
const canBtc = () => !!navigator.serial;
const RP = {
  t: null, dev: null, ch: null, usb: null, ep: null, port: null, writer: null,
  get ok() {
    const c = pconn();
    if (c.type === 'system' || c.type === 'rawbt') return true;
    if (c.type === 'bt') return !!(this.dev && this.dev.gatt.connected && this.ch);
    if (c.type === 'usb') return !!(this.usb && this.usb.opened);
    if (c.type === 'serial' || c.type === 'btc') return !!this.writer;
    return false;
  },
  label() { const c = pconn(); return ({ bt: 'Bluetooth', usb: 'USB', serial: 'USB-Serial', btc: 'Bluetooth ตรง', rawbt: 'RawBT (Android)', system: 'พิมพ์ผ่านระบบ' })[c.type] + (c.name ? ' · ' + c.name : ''); },
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
    } else if (type === 'btc') {
      // Bluetooth แบบ Classic (SPP) ตรงจาก Chrome Android 138+ — ไม่ต้องใช้แอป RawBT
      if (!navigator.serial) throw new Error('Chrome เครื่องนี้ยังเชื่อม Bluetooth ตรงไม่ได้ — อัปเดต Chrome ใน Play Store (ต้องเวอร์ชัน 138 ขึ้นไป) หรือใช้ RawBT ไปก่อน');
      let port = null;
      if (silent) {
        const ps = await navigator.serial.getPorts();
        port = ps.find(p => { try { return !!p.getInfo().bluetoothServiceClassId; } catch (e) { return false; } }) || ps[0] || null;
        if (!port) return false;
      }
      if (!port) port = await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP] });
      await this._close();
      try { await port.open({ baudRate: c.baud || 9600 }); } catch (e) { if (!/already open/i.test(e.message)) throw new Error('ต่อเครื่องพิมพ์ไม่ได้ — เปิดเครื่องพิมพ์ ให้อยู่ใกล้แท็บเล็ต และปิดแอป RawBT ก่อน (' + e.message + ')'); }
      this.port = port; this.writer = port.writable.getWriter();
      if (!port._mmw) { port._mmw = 1; port.addEventListener('disconnect', () => { if (this.port === port) { this.writer = null; this.port = null; document.dispatchEvent(new Event('mm:printer')); } }); }
      LS.set('printerConn', { ...c, type, name: 'เครื่องพิมพ์ Bluetooth' });
    } else LS.set('printerConn', { ...c, type, name: '' });
    document.dispatchEvent(new Event('mm:printer'));
    return true;
  },
  async _close() { try { if (this.writer) { this.writer.releaseLock(); } } catch (e) { } try { if (this.port) await this.port.close(); } catch (e) { } this.writer = null; this.port = null; },
  async autoConnect() { const c = pconn(); if (['bt', 'usb', 'serial', 'btc'].includes(c.type) && !this.ok) { try { await this.connect(c.type, true); } catch (e) { } } },
  // ส่งทีละงาน (ลิ้นชัก + ใบเสร็จ ไม่ชนกัน)
  send(bytes) { const p = (this._q || Promise.resolve()).then(() => this._send(bytes)); this._q = p.catch(() => { }); return p; },
  // เปิดลิ้นชัก: ส่งคำสั่งสั้น ๆ ทันที (ไม่ต้องรอวาดใบเสร็จ ไม่ใช้เน็ต)
  async kick() {
    const c = pconn();
    if (c.type === 'system') throw new Error('โหมด "พิมพ์ผ่านระบบ" สั่งเปิดลิ้นชักไม่ได้ — เลือกการเชื่อมต่อ Bluetooth / USB / RawBT');
    if (!this.ok) { const r = await this.connect(c.type, true).catch(() => false); if (!r || !this.ok) throw new Error('เครื่องพิมพ์ยังไม่ได้เชื่อมต่อ (เพิ่มเติม › เครื่องพิมพ์ใบเสร็จ › เชื่อมต่อ)'); }
    await this.send(new Uint8Array(drawerBytes()));
  },
  async _send(bytes) {
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
    } else if (c.type === 'btc') {
      // หลุดระหว่างทาง (เครื่องพิมพ์ปิด/หลับ) → ต่อใหม่เงียบ ๆ 1 ครั้งแล้วส่งซ้ำ
      for (let t = 0; t < 2; t++) {
        try {
          if (!this.writer && !(await this.connect('btc', true))) throw new Error('เครื่องพิมพ์ยังไม่ได้เชื่อมต่อ (เพิ่มเติม › เครื่องพิมพ์ใบเสร็จ › เชื่อมต่อ)');
          for (let i = 0; i < bytes.length; i += 512) await this.writer.write(bytes.slice(i, i + 512));
          return;
        } catch (e) { await this._close(); if (t) throw e; await sleep(300); }
      }
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
    const bytes = canvasToEscPos(cv, { cut: rcfg().cut, feed: num(rcfg().feed != null ? rcfg().feed : 4), drawer: o.drawer });
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
  ${isAndroidish() && !canBtc() ? `<div class="card" style="border:2px solid #C62828"><h3>Chrome เครื่องนี้ยังต่อเครื่องพิมพ์ Bluetooth ตรงไม่ได้</h3><div class="small" style="line-height:1.7">เปิด Play Store › ค้นหา Chrome › กด <b>อัปเดต</b> (ต้องเวอร์ชัน 138 ขึ้นไป) แล้วปิด-เปิด Chrome ใหม่ จะมีปุ่มสีเขียว “ใช้ Bluetooth ตรง” ขึ้นที่หน้านี้ · ระหว่างนี้ใช้ RawBT ไปก่อน</div></div>` : ''}
  ${canBtc() ? `<div class="card" style="border:2px solid #2E7D32"><h3>✨ ต่อเครื่องพิมพ์ Bluetooth ตรง — ไม่ต้องใช้ RawBT</h3>
    <div class="small" style="line-height:1.7">เร็วกว่า ไม่มีหน้าต่าง RawBT เด้ง ลิ้นชักเด้งทันที ใช้ได้แม้ไม่มีเน็ต<br>
    1) เปิดเครื่องพิมพ์ › แท็บเล็ต การตั้งค่า › การเชื่อมต่อ › Bluetooth › จับคู่เครื่องพิมพ์ไว้ (ถ้าเคยจับคู่กับ RawBT แล้ว ข้ามได้)<br>
    2) <b>ปิดแอป RawBT</b> (ปัดทิ้งจากแอปล่าสุด) — เครื่องพิมพ์ Bluetooth ต่อได้ทีละแอป<br>
    3) กด <b>ใช้ Bluetooth ตรง</b> › เลือกชื่อเครื่องพิมพ์ในรายการ › อนุญาต<br>
    4) กด “ทดสอบพิมพ์” และ “ทดสอบเปิดลิ้นชัก” — ครั้งต่อไประบบต่อให้เองทุกครั้งที่เปิดหน้าขาย</div>
    <div class="row" style="gap:8px;margin-top:8px"><button class="btn green sm" id="usebtc">ใช้ Bluetooth ตรง</button></div></div>` : ''}
  ${isAndroidish() ? `<details class="card" ${canBtc() ? '' : 'open'} style="border:2px solid #FFB300"><summary><b>${canBtc() ? 'ทางสำรอง: ' : ''}แท็บเล็ต Android + เครื่องพิมพ์ AIMO / QF300-UBT / Xprinter ผ่านแอป RawBT</b></summary>
    <div class="small" style="line-height:1.7;margin-top:6px">${canBtc() ? 'ใช้เมื่อ Bluetooth ตรงใช้ไม่ได้กับเครื่องพิมพ์รุ่นนั้น — RawBT รุ่นฟรีจะมีหน้าต่างเด้งทุกครั้งที่พิมพ์/เปิดลิ้นชัก' : 'Chrome เครื่องนี้ยังต่อ Bluetooth แบบ Classic ตรงไม่ได้ — อัปเดต Chrome ใน Play Store (เวอร์ชัน 138 ขึ้นไป) แล้วเปิดหน้านี้ใหม่ จะมีปุ่ม “Bluetooth ตรง” ให้ใช้แทน RawBT · ระหว่างนี้ใช้แอปฟรี <b>RawBT</b> เป็นตัวกลาง'}<br>
    1) เปิดเครื่องพิมพ์ › แท็บเล็ต การตั้งค่า › การเชื่อมต่อ › Bluetooth › จับคู่เครื่องพิมพ์ (รหัส 0000 หรือ 1234)<br>
    2) ติดตั้งแอป RawBT › เปิดแอป › ตั้งค่า › วิธีเชื่อมต่อ: Bluetooth › เลือกเครื่องพิมพ์ · ไดรเวอร์ ESC/POS · กระดาษ 80 มม. (576 จุด) › กด Test print ในแอปให้ออกก่อน<br>
    3) กลับมาหน้านี้ › เลือก <b>RawBT</b> › กด “ทดสอบพิมพ์” (ครั้งแรก Chrome ถามว่าจะเปิด RawBT ให้ติ๊ก “จำไว้/ทุกครั้ง”)<br>
    4) ติ๊ก “พิมพ์อัตโนมัติ” และ “เปิดลิ้นชัก” — ลิ้นชักเด้งพร้อมใบเสร็จ</div>
    <div class="row" style="gap:8px;margin-top:8px"><a class="btn sm" href="https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter" target="_blank" rel="noopener">ติดตั้งแอป RawBT</a><button class="btn ghost sm" id="useraw">ใช้ RawBT กับเครื่องนี้</button></div></details>` : ''}
  <div class="card"><h3>การเชื่อมต่อ (เฉพาะเครื่องนี้)</h3>
    <div class="seg wrap" id="ptype">${[['btc', 'Bluetooth ตรง'], ['bt', 'Bluetooth BLE'], ['usb', 'USB'], ['serial', 'USB-Serial'], ['rawbt', 'RawBT'], ['system', 'ผ่านระบบ']].map(([k, n]) => `<button data-t="${k}" class="${pc.type === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="small muted" id="phelp" style="margin:8px 2px"></div>
    <div class="row"><div class="grow small" id="pst"></div><button class="btn sm" id="pcon">เชื่อมต่อ</button><button class="btn ghost sm" id="ptest">ทดสอบพิมพ์</button></div>
    <label class="row small" style="margin-top:10px"><input type="checkbox" id="auto" ${pc.autoPrint ? 'checked' : ''}> พิมพ์ใบเสร็จอัตโนมัติหลังรับชำระ</label>
    <label class="row small" style="margin-top:6px"><input type="checkbox" id="drw" ${pc.drawer ? 'checked' : ''}> เปิดลิ้นชักเก็บเงินทันทีเมื่อกดรับเงินสด (สายลิ้นชัก RJ11 เสียบช่อง DK/Cash drawer หลังเครื่องพิมพ์)</label>
    <label class="row small" style="margin-top:6px;padding-left:26px"><input type="checkbox" id="drwa" ${pc.drawerAll ? 'checked' : ''}> เปิดลิ้นชักทุกการชำระ (รวมโอน/บัตร)</label>
    <div class="row small" style="margin-top:6px;padding-left:26px;gap:8px">ขาสั่งลิ้นชัก <select class="in" id="dpin" style="width:auto;min-height:36px;padding:2px 8px"><option value="2">ขา 2 (มาตรฐาน)</option><option value="5">ขา 5</option><option value="both">ขา 2 + 5</option></select><button class="btn ghost sm" id="dtest">ทดสอบเปิดลิ้นชัก</button></div>
    <div class="tiny muted" style="margin-top:6px;padding-left:26px">ไม่ได้ต่อลิ้นชักกับเครื่องพิมพ์ → อย่าติ๊ก (ระบบจะส่งคำสั่งไปเครื่องพิมพ์ทุกครั้งที่รับเงิน · ผ่าน RawBT จะเห็นหน้าต่าง RawBT และกระดาษเลื่อนเล็กน้อย)</div>
    <details style="margin-top:8px"><summary class="small muted">ขั้นสูง</summary><div class="grid3" style="margin-top:8px"><label class="f"><span>ขนาดชิ้น BT (ไบต์)</span><input class="in" type="number" id="chunk" value="${pc.chunk}"></label><label class="f"><span>หน่วงเวลา (ms)</span><input class="in" type="number" id="delay" value="${pc.delay}"></label><label class="f"><span>Baud (Serial)</span><input class="in" type="number" id="baud" value="${pc.baud}"></label></div></details>
  </div>
  <div class="card"><h3>ออกแบบใบเสร็จ ${isOwner() ? '' : '<span class="tag gray">ดูอย่างเดียว</span>'}</h3>
    <div class="seg" id="paper" style="margin-bottom:10px"><button data-p="58" class="${c.paper != 80 ? 'on' : ''}">กระดาษ 58 มม.</button><button data-p="80" class="${c.paper == 80 ? 'on' : ''}">กระดาษ 80 มม.</button></div>
    <div class="row" style="gap:10px;margin-bottom:10px"><div id="lg" style="width:120px;height:60px;background:#fff;border-radius:10px;box-shadow:inset 0 0 0 1.5px var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden">${logo ? `<img src="${logo}" style="max-width:100%;max-height:100%">` : '<span class="tiny muted">ไม่มีโลโก้</span>'}</div>
      <div><label class="btn ghost sm">อัปโหลดโลโก้<input type="file" accept="image/*" id="lgf" class="hidden"></label> <button class="btn ghost sm" id="lgx">ลบ</button><div class="tiny muted">แปลงเป็นขาวดำอัตโนมัติ</div></div></div>
    <label class="f"><span>ข้อความส่วนหัว (ใต้ชื่อร้าน)</span><textarea class="in" id="hd" rows="2" placeholder="เช่น เลขผู้เสียภาษี / เวลาเปิด-ปิด">${esc(c.header)}</textarea></label>
    <label class="f"><span>ข้อความส่วนท้าย</span><textarea class="in" id="ft" rows="2">${esc(c.footer)}</textarea></label>
    <div class="grid2"><label class="f"><span>ชื่อร้านบนใบเสร็จ</span><input class="in" id="sn" value="${esc(c.shopName || '')}" placeholder="${esc(S.settings.shopName || 'ร้านเมย์ มินิมาร์ท')}"></label><label class="f"><span>หัวใบเสร็จ</span><input class="in" id="ttl" value="${esc(c.title || 'ใบเสร็จรับเงิน')}"></label></div>
    <label class="f"><span>เลขประจำตัวผู้เสียภาษี (ถ้ามี)</span><input class="in" id="tax" value="${esc(c.taxId || '')}" inputmode="numeric"></label>
    <div class="grid2"><label class="f"><span>QR ท้ายใบเสร็จ (ลิงก์ LINE / เพจ / เว็บ)</span><input class="in" id="qrt" value="${esc(c.qrText || '')}" placeholder="https://lin.ee/..."></label><label class="f"><span>ข้อความใต้ QR</span><input class="in" id="qrl" value="${esc(c.qrLabel || '')}" placeholder="แอดไลน์รับโปรโมชั่น"></label></div>
    <label class="f"><span>ขนาดตัวอักษร: <b id="fszv">${Math.round((c.fontScale || 1) * 100)}%</b></span><input type="range" id="fsz" min="0.8" max="1.4" step="0.05" value="${c.fontScale || 1}" style="width:100%"></label>
    <label class="f"><span>เว้นกระดาษท้ายใบ (บรรทัด) ก่อนตัด</span><input class="in" type="number" id="feed" min="0" max="10" value="${c.feed != null ? c.feed : 4}"></label>
    <div class="grid2 small">${[['showLogo', 'แสดงโลโก้'], ['showAddress', 'แสดงที่อยู่/โทร'], ['showCashier', 'แสดงชื่อพนักงาน'], ['showCustomer', 'แสดงข้อมูลลูกค้า'], ['showPoints', 'แสดงแต้มสะสม'], ['showDevice', 'แสดงชื่อเครื่อง'], ['qtyLine', 'แสดงจำนวน × ราคา ทุกรายการ'], ['bigTotal', 'ยอดสุทธิตัวใหญ่'], ['showBarcode', 'บาร์โค้ดเลขที่ใบเสร็จ'], ['cut', 'ตัดกระดาษอัตโนมัติ']].map(([k, n]) => `<label class="row"><input type="checkbox" data-k="${k}" ${c[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div>
    ${isOwner() ? '<button class="btn block green" id="sv">บันทึกรูปแบบใบเสร็จ</button>' : ''}
  </div>
  <div class="card center"><div class="small muted" style="margin-bottom:8px">ตัวอย่างใบเสร็จ</div><canvas id="pv" style="max-width:100%;width:290px;box-shadow:0 4px 16px rgba(0,0,0,.12);background:#fff"></canvas></div>`;
  $('#dpin', el).value = pc.drawerPin || '2';
  const HELP = { btc: 'เครื่องพิมพ์ Bluetooth แบบ Classic (AIMO, QF300-UBT, Xprinter) ต่อตรงจาก Chrome บน Android — จับคู่ในการตั้งค่า Bluetooth ของแท็บเล็ตก่อน แล้วกด “เชื่อมต่อ” เลือกเครื่องพิมพ์ · ปิดแอป RawBT ระหว่างใช้', bt: 'เครื่องพิมพ์ Bluetooth Low Energy (BLE) — ใช้ Chrome บน Android/Windows/Mac หรือแอป Bluefy บน iPhone/iPad', usb: 'ต่อสาย USB Type-C/Type-A กับมือถือ Android (ผ่าน OTG) หรือคอมพิวเตอร์ — ใช้ Chrome', serial: 'เครื่องพิมพ์ที่ต่อ USB แล้วขึ้นเป็นพอร์ต COM (คอมพิวเตอร์)', rawbt: 'เครื่องพิมพ์ Bluetooth แบบ Classic บน Android (เช่น QF300-UBT, AIMO, Xprinter) — ติดตั้งแอป RawBT จาก Play Store › จับคู่เครื่องพิมพ์ในแอป RawBT › ตั้ง Default printer แล้วกลับมากดทดสอบพิมพ์ · ใช้ได้แม้ไม่มีเน็ต', system: 'ใช้หน้าต่างพิมพ์ของระบบ (เครื่องพิมพ์ที่ติดตั้งไว้ในคอม/AirPrint) — ต้องกดยืนยันทุกครั้ง' };
  const getC = () => { const o = { ...c, header: $('#hd', el).value, footer: $('#ft', el).value, fontScale: +$('#fsz', el).value, shopName: $('#sn', el).value.trim(), title: $('#ttl', el).value.trim() || 'ใบเสร็จรับเงิน', taxId: $('#tax', el).value.trim(), qrText: $('#qrt', el).value.trim(), qrLabel: $('#qrl', el).value.trim(), feed: Math.max(0, Math.min(10, +$('#feed', el).value || 0)) }; $$('[data-k]', el).forEach(k => o[k.dataset.k] = k.checked); o.paper = +$('#paper .on', el).dataset.p; return o; };
  const pv = async () => { const saved = S.settings.receiptLogo; S.settings.receiptLogo = logo; const cv = await renderReceipt(SAMPLE_ORDER(), getC()); S.settings.receiptLogo = saved; const t = $('#pv', el); t.width = cv.width; t.height = cv.height; t.getContext('2d').drawImage(cv, 0, 0); };
  const st = () => { const p = pconn(); $('#pst', el).innerHTML = (RP.ok ? '<span class="tag green">พร้อม</span> ' : '<span class="tag gray">ยังไม่เชื่อมต่อ</span> ') + esc(RP.label()); $('#phelp', el).textContent = HELP[p.type]; $('#pcon', el).style.display = ['bt', 'usb', 'serial', 'btc'].includes(p.type) ? '' : 'none'; };
  const ur = $('#useraw', el); if (ur) ur.onclick = () => { LS.set('printerConn', { ...pconn(), type: 'rawbt', name: '' }); $$('#ptype button', el).forEach(x => x.classList.toggle('on', x.dataset.t === 'rawbt')); st(); toast('ตั้งเป็น RawBT แล้ว — กด “ทดสอบพิมพ์”'); };
  const ub = $('#usebtc', el); if (ub) ub.onclick = async () => { LS.set('printerConn', { ...pconn(), type: 'btc', name: '' }); $$('#ptype button', el).forEach(x => x.classList.toggle('on', x.dataset.t === 'btc')); st(); $('#pcon', el).click(); };
  $$('#ptype button', el).forEach(b => b.onclick = () => { LS.set('printerConn', { ...pconn(), type: b.dataset.t, name: '' }); $$('#ptype button', el).forEach(x => x.classList.toggle('on', x === b)); st(); });
  $$('#paper button', el).forEach(b => b.onclick = () => { $$('#paper button', el).forEach(x => x.classList.toggle('on', x === b)); pv(); });
  $('#pcon', el).onclick = async () => { try { busy(1, 'กำลังเชื่อมต่อ...'); await RP.connect(); busy(0); toast('เชื่อมต่อแล้ว'); } catch (e) { busy(0); if (e.name === 'NotFoundError') { const t = pconn().type; toast(t === 'btc' ? 'ยังไม่ได้เลือกเครื่องพิมพ์ — ถ้าไม่เห็นชื่อเครื่องพิมพ์ในรายการ ให้จับคู่ใน การตั้งค่า › Bluetooth ของแท็บเล็ตก่อน แล้วกดเชื่อมต่ออีกครั้ง' : t === 'usb' ? 'ไม่พบเครื่องพิมพ์ทางสาย USB — ต้องเสียบสาย USB จากเครื่องพิมพ์เข้าแท็บเล็ต (ผ่านหัวแปลง OTG) ถ้าใช้ Bluetooth ให้เลือก RawBT' : t === 'bt' ? 'ไม่พบเครื่องพิมพ์ Bluetooth แบบ BLE — เครื่องพิมพ์ใบเสร็จส่วนใหญ่ (AIMO, QF300, Xprinter) เป็น Bluetooth Classic ให้เลือก “RawBT”' : 'ไม่พบอุปกรณ์', 1); } else toast(e.message, 1); } st(); };
  $('#ptest', el).onclick = async () => { try { busy(1, 'กำลังพิมพ์...'); await RP.printOrder({ ...SAMPLE_ORDER(), title: 'ทดสอบเครื่องพิมพ์' }); busy(0); } catch (e) { busy(0); toast(e.message, 1); } st(); };
  ['auto', 'drw', 'drwa', 'dpin'].forEach(id => $('#' + id, el).onchange = () => LS.set('printerConn', { ...pconn(), autoPrint: $('#auto', el).checked, drawer: $('#drw', el).checked, drawerAll: $('#drwa', el).checked, drawerPin: $('#dpin', el).value }));
  $('#dtest', el).onclick = async () => { try { await RP.kick(); toast('ส่งคำสั่งเปิดลิ้นชักแล้ว'); } catch (e) { toast(e.message, 1); } st(); };
  ['chunk', 'delay', 'baud'].forEach(id => $('#' + id, el).onchange = e => LS.set('printerConn', { ...pconn(), [id]: +e.target.value }));
  let pvT; const pvd = () => { clearTimeout(pvT); pvT = setTimeout(pv, 250); };
  $$('textarea,input[data-k],#sn,#ttl,#tax,#qrt,#qrl,#feed', el).forEach(i => { i.addEventListener('input', pvd); i.addEventListener('change', pvd); });
  $('#fsz', el).oninput = e => { $('#fszv', el).textContent = Math.round(e.target.value * 100) + '%'; pvd(); };
  $('#lgf', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; logo = await processLogo(f, getC().paper == 80 ? 400 : 280); $('#lg', el).innerHTML = `<img src="${logo}" style="max-width:100%;max-height:100%">`; pv(); };
  $('#lgx', el).onclick = () => { logo = ''; $('#lg', el).innerHTML = '<span class="tiny muted">ไม่มีโลโก้</span>'; pv(); };
  const sv = $('#sv', el); if (sv) sv.onclick = async () => { try { busy(1); await saveSetting('receiptCfg', getC()); if (logo !== (S.settings.receiptLogo || '')) await saveSetting('receiptLogo', logo); busy(0); toast('บันทึกรูปแบบใบเสร็จแล้ว (ใช้กับทุกเครื่อง)'); } catch (e) { busy(0); toast(e.message, 1); } };
  const h = () => st(); document.addEventListener('mm:printer', h); S.cleanup = () => document.removeEventListener('mm:printer', h);
  st(); document.fonts.ready.then(pv);
};
