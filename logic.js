/**
 * May MiniMart — Business logic (ใช้ร่วมกัน: Google Apps Script ไฟล์ Logic.gs และหน้าแอป js/logic.js)
 * ไฟล์นี้ต้องเหมือนกันทั้ง 2 ที่  ห้ามใช้ DOM หรือ API เฉพาะของ Google ในไฟล์นี้
 * db adapter: read(t,opt) upsert(t,rows) append(t,rows) remove(t,keys) hash(s) now() log(u,a,d) settings()
 */
var Logic = (function () {
  var SCHEMA = {
    Products: { key: 'sku', read: 'all', write: 'editProducts', cols: ['sku', 'handle', 'name', 'category', 'description', 'byWeight', 'cost', 'barcode', 'trackStock', 'available', 'price', 'stock', 'lowStock', 'bestseller', 'unit', 'shelfLifeDays', 'note', 'updatedAt', 'updatedBy'] },
    Categories: { key: 'name', read: 'all', write: 'editProducts', cols: ['name', 'color', 'sort'] },
    Images: { key: 'sku', read: 'all', write: 'editProducts', cols: ['sku', 'data', 'updatedAt'] },
    Receipts: { key: 'id', read: 'receiveGoods', write: 'receiveGoods', own: 'createdBy', cols: ['id', 'date', 'supplier', 'supplierTaxId', 'docNo', 'type', 'subtotal', 'vat', 'total', 'payMethod', 'fileId', 'fileUrl', 'items', 'stockApplied', 'note', 'createdAt', 'createdBy'] },
    SalesDaily: { key: 'date', read: 'owner', write: 'owner', dateCol: 'date', cols: ['date', 'gross', 'refund', 'discount', 'net', 'cost', 'profit', 'source', 'note'] },
    TaxFilings: { key: 'id', read: 'owner', write: 'owner', cols: ['id', 'form', 'period', 'filedAt', 'amount', 'ref', 'fileId', 'fileUrl', 'note', 'createdAt'] },
    Sales: { key: 'id', read: 'owner', write: 'owner', cols: ['id', 'date', 'amount', 'gross', 'refund', 'discount', 'cost', 'profit', 'source', 'note', 'createdAt', 'createdBy'] },
    Orders: { key: 'id', read: 'none', write: 'none', dateCol: 'date', cols: ['id', 'date', 'deviceId', 'deviceName', 'cashier', 'cashierName', 'customerId', 'customerName', 'items', 'itemCount', 'subtotal', 'discount', 'total', 'cost', 'payments', 'payType', 'cash', 'change', 'pointsEarned', 'pointsUsed', 'status', 'refundOf', 'note', 'syncedAt'] },
    Customers: { key: 'id', read: 'customers', write: 'customers', cols: ['id', 'name', 'phone', 'note', 'totalSpent', 'visits', 'points', 'credit', 'creditLimit', 'lastVisit', 'createdAt'] },
    CustomerTx: { key: 'id', read: 'customers', write: 'none', dateCol: 'date', cols: ['id', 'date', 'customerId', 'type', 'amount', 'points', 'ref', 'by', 'note'] },
    Shifts: { key: 'id', read: 'owner', write: 'none', own: 'username', dateCol: 'inAt', cols: ['id', 'username', 'name', 'inAt', 'outAt', 'deviceId', 'hours'] },
    Devices: { key: 'id', read: 'owner', write: 'owner', cols: ['id', 'no', 'name', 'type', 'ua', 'lastSeen', 'lastUser', 'active', 'createdAt'] },
    StockCounts: { key: 'id', read: 'stockCount', write: 'stockCount', cols: ['id', 'name', 'date', 'scope', 'status', 'items', 'by', 'finishedAt', 'note'] },
    POs: { key: 'id', read: 'receiveGoods', write: 'receiveGoods', cols: ['id', 'date', 'supplier', 'status', 'items', 'total', 'note', 'createdBy', 'receivedAt'] },
    Licenses: { key: 'id', read: 'all', write: 'owner', cols: ['id', 'type', 'subtype', 'number', 'holder', 'issueDate', 'expiryDate', 'fileId', 'fileUrl', 'note', 'updatedAt'] },
    Users: { key: 'id', read: 'owner', write: 'none', cols: ['id', 'name', 'username', 'pinHash', 'role', 'active', 'createdAt'] },
    Jobs: { key: 'id', read: 'owner', write: 'owner', dateCol: 'date', cols: ['id', 'date', 'orderId', 'type', 'status', 'title', 'amount', 'fee', 'bank', 'bankName', 'acc', 'accName', 'carrier', 'carrierName', 'phone', 'billType', 'ref', 'contact', 'fileUrl', 'customerName', 'cashier', 'cashierName', 'deviceName', 'note', 'doneAt', 'doneBy', 'doneRef'] },
    Settings: { key: 'key', read: 'all', write: 'owner', cols: ['key', 'value'] },
    Log: { key: 'time', read: 'owner', write: 'none', cols: ['time', 'user', 'action', 'detail'] }
  };

  // สิทธิ์ของพนักงาน (เจ้าของทำได้ทุกอย่าง) — ค่า: true = อนุญาต, 'pin' = ต้องใส่รหัสเจ้าของร้านทุกครั้ง, false = ไม่อนุญาต
  // [ชื่อ, ค่าเริ่มต้น, ใช้โหมดรหัสได้ไหม]
  var PERMS = {
    posOnly: ['โหมดพนักงานขาย: เข้าได้เฉพาะหน้าขาย (ซ่อนเมนูอื่น)', true, false],
    sell: ['ขายสินค้า (POS)', true, false], discount: ['ให้ส่วนลด', true, true], priceEdit: ['แก้ราคาตอนขาย', 'pin', true],
    clearTicket: ['ลบรายการ/ล้างบิล', true, true], refund: ['คืนเงิน/ยกเลิกใบเสร็จ', 'pin', true], credit: ['ขายเงินเชื่อ/รับชำระหนี้', true, true],
    customers: ['จัดการฐานลูกค้า', true, true], editProducts: ['เพิ่ม/แก้ไข/ลบสินค้า บาร์โค้ด รูป', 'pin', true],
    receiveGoods: ['รับสินค้า/ใบเสร็จร้านส่ง/ใบสั่งซื้อ', true, true], stockCount: ['ตรวจนับสต็อก/ปรับสต็อก', true, true],
    viewCost: ['ดูต้นทุน/กำไร', false, false], ownSales: ['ดูยอดขายของตัวเองย้อนหลัง', false, false], reports: ['ดูรายงานยอดขายทั้งหมดของร้าน', false, false]
  };
  var OWNERPIN = null, PINOK = null;

  function n(v) { var x = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : 0; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function J(s, d) { try { return typeof s === 'string' ? (s ? JSON.parse(s) : d) : (s == null ? d : s); } catch (e) { return d; } }
  function err(m) { throw new Error(m); }
  function uid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  function perms(db) {
    var s = db.settings(), p = J(s.perms, {}), out = {};
    Object.keys(PERMS).forEach(function (k) { var v = k in p ? p[k] : PERMS[k][1]; out[k] = v === 'pin' && PERMS[k][2] ? 'pin' : !!v; });
    return out;
  }
  // ตรวจรหัสเจ้าของร้าน (ส่งมาเป็น payload.ownerPin)
  // รหัสอนุญาตพนักงาน (แยกจากรหัสเจ้าของ) ใช้ได้เฉพาะงานสินค้า: แก้ไขสินค้า · นับสต็อก · รับของเข้า
  var AP_SCOPE = { editProducts: 1, stockCount: 1, receiveGoods: 1 };
  function pinKind(db) {
    if (PINOK !== null) return PINOK;
    if (!OWNERPIN) return (PINOK = '');
    var h = db.hash(String(OWNERPIN)), ap = (db.settings() || {}).secretApprovePin;
    if (db.read('Users', {}).some(function (x) { return x.role === 'owner' && x.active !== 'N' && x.pinHash === h; })) return (PINOK = 'owner');
    if (ap && ap === h) return (PINOK = 'ap');
    err('PIN_BAD: รหัสไม่ถูกต้อง');
  }
  // ตรวจรหัส (ส่งมาเป็น payload.ownerPin) — รหัสเจ้าของร้านใช้ได้ทุกเรื่อง · รหัสอนุญาตใช้ได้เฉพาะงานสินค้า
  function pinOk(db, perm) {
    var k = pinKind(db);
    if (k === 'owner') return true;
    if (k === 'ap' && (!perm || AP_SCOPE[perm])) return true;
    if (k === 'ap') err('PIN_BAD: รหัสอนุญาตใช้ได้เฉพาะ แก้ไขสินค้า / นับสต็อก / รับของ — เรื่องนี้ต้องใช้รหัสเจ้าของร้าน');
    return false;
  }
  function can(db, u, p) {
    if (!u) return false;
    if (u.role === 'owner' || p === 'all') return true;
    if (p === 'owner' || p === 'none') return false;
    var v = perms(db)[p];
    return v === true || (v === 'pin' && pinOk(db, p));
  }
  function need(db, u, p) {
    if (can(db, u, p)) return;
    if (PERMS[p] && perms(db)[p] === 'pin') err('PIN_REQUIRED: ต้องใส่รหัสเจ้าของร้าน — ' + PERMS[p][0]);
    err('สิทธิ์ไม่เพียงพอ' + (PERMS[p] ? ' (' + PERMS[p][0] + ')' : ' (เฉพาะเจ้าของกิจการ)'));
  }
  function strict(db, u, p) { return u.role === 'owner' || perms(db)[p] === true; }

  // ---------- generic ----------
  function list(db, u, t, opt) {
    var sc = SCHEMA[t]; if (!sc) err('ไม่พบตาราง ' + t);
    var ownOnly = false;
    if (!can(db, u, sc.read)) { if (sc.own && u) ownOnly = true; else err('สิทธิ์ไม่เพียงพอ'); }
    var rows = db.read(t, opt || {});
    if (ownOnly || (sc.own && u.role !== 'owner' && t === 'Receipts')) rows = rows.filter(function (r) { return r[sc.own] === u.username; });
    if (t === 'Users') rows = rows.map(function (r) { var c = {}; for (var k in r) if (k !== 'pinHash') c[k] = r[k]; return c; });
    if (t === 'Products' && !strict(db, u, 'viewCost')) rows = rows.map(function (r) { var c = Object.assign({}, r); c.cost = ''; return c; });
    if (t === 'Settings' && u.role !== 'owner') rows = rows.filter(function (r) { return String(r.key).indexOf('secret') !== 0; });
    return rows;
  }
  function clean(t, r) { var c = {}; SCHEMA[t].cols.forEach(function (k) { if (k in r && r[k] != null) c[k] = typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k]); }); return c; }
  function upsert(db, u, t, rows) {
    var sc = SCHEMA[t]; if (!sc) err('ไม่พบตาราง');
    // พนักงานจัดผังปุ่มหน้าขาย (posLayout) ได้เองโดยไม่ต้องใช้รหัสเจ้าของ — ตั้งค่าอื่นยังต้องเป็นเจ้าของ
    var layoutOnly = t === 'Settings' && rows && rows.length && rows.every(function (r) { return r && r.key === 'posLayout'; });
    if (!layoutOnly) need(db, u, sc.write);
    rows = (rows || []).map(function (r) {
      var c = clean(t, r);
      if (!c[sc.key]) err('ไม่มีค่า ' + sc.key);
      if (t === 'Products') { c.updatedAt = db.now(); c.updatedBy = u.username; if (!strict(db, u, 'viewCost') && 'cost' in c) delete c.cost; }
      if (t === 'Images') c.updatedAt = db.now();
      if ((t === 'Receipts' || t === 'Sales') && !r.createdAt) { c.createdAt = db.now(); c.createdBy = u.username; }
      if (t === 'Licenses') c.updatedAt = db.now();
      if (t === 'Customers' && !c.createdAt && !r.createdAt) c.createdAt = db.now();
      if (t === 'POs' && !c.createdBy) c.createdBy = u.username;
      if (t === 'Customers') { delete c.totalSpent; delete c.visits; delete c.points; delete c.credit; }
      return c;
    });
    if (t === 'Customers') {
      var all = db.read('Customers', {});
      rows.forEach(function (c) {
        if (c.phone) { var dup = all.filter(function (x) { return x.phone === c.phone && x.id !== c.id; })[0]; if (dup) err('เบอร์โทร ' + c.phone + ' มีอยู่แล้ว: ' + dup.name); }
        var old = all.filter(function (x) { return x.id === c.id; })[0];
        if (!old) { c.totalSpent = '0'; c.visits = '0'; c.points = '0'; c.credit = '0'; }
      });
    }
    if (t === 'Receipts' && u.role !== 'owner') {
      var ex = db.read('Receipts', {});
      rows.forEach(function (r) { var o = ex.filter(function (x) { return x.id === r.id; })[0]; if (o && o.createdBy !== u.username) err('แก้ไขได้เฉพาะใบเสร็จที่ตนเองบันทึก'); });
    }
    db.upsert(t, rows);
    db.log(u, 'upsert ' + t, rows.length + ' แถว');
    return rows;
  }
  function remove(db, u, t, ids) {
    var sc = SCHEMA[t]; if (!sc || t === 'Log' || t === 'Orders') err('ไม่อนุญาต');
    if (t === 'Categories' || t === 'Images' || t === 'Products') need(db, u, 'editProducts'); else need(db, u, 'owner');
    if (t === 'Users') {
      var left = db.read('Users', {}).filter(function (x) { return ids.indexOf(x.id) < 0 && x.role === 'owner' && x.active !== 'N'; });
      if (!left.length) err('ต้องมีเจ้าของกิจการอย่างน้อย 1 คน');
    }
    db.remove(t, ids || []);
    db.log(u, 'remove ' + t, (ids || []).join(','));
    return (ids || []).length;
  }

  // ---------- users / devices ----------
  // เข้าระบบ: พนักงานใช้รหัส 4 หลักอย่างเดียว (username ว่าง) · เจ้าของใช้รหัสอย่างเดียว หรือ ชื่อผู้ใช้+รหัส ก็ได้
  function login(db, username, pin, dev) {
    username = String(username || '').trim().toLowerCase(); pin = String(pin || '');
    var h = db.hash(pin), act = db.read('Users', {}).filter(function (x) { return String(x.active) !== 'N'; }), user;
    if (username) {
      user = act.filter(function (x) { return String(x.username).toLowerCase() === username; })[0];
      if (!user || user.pinHash !== h) err('ชื่อผู้ใช้หรือรหัสไม่ถูกต้อง');
    } else {
      var m = act.filter(function (x) { return x.pinHash === h; });
      if (!m.length) err('รหัสไม่ถูกต้อง');
      if (m.length > 1) err('รหัสนี้ซ้ำกันหลายบัญชี — ให้เจ้าของร้านเปลี่ยนรหัสให้ไม่ซ้ำกัน');
      user = m[0];
    }
    var info = { id: user.id, name: user.name, username: user.username, role: user.role };
    var device = registerDevice(db, info, dev || {});
    db.log(info, 'login', device ? device.name : '');
    return { user: info, device: device, shift: user.role === 'owner' ? null : openShift(db, info), mustChangePin: user.role === 'owner' && user.pinHash === db.hash('1234') };
  }
  function pinTaken(db, pin, exceptId) {
    var h = db.hash(String(pin));
    if ((db.settings() || {}).secretApprovePin === h) return true; // ห้ามตรงกับรหัสอนุมัติ
    return db.read('Users', {}).some(function (x) { return x.id !== exceptId && String(x.active) !== 'N' && x.pinHash === h; });
  }
  function registerDevice(db, u, dev) {
    if (!dev.id) return null;
    var all = db.read('Devices', {}), d = all.filter(function (x) { return x.id === dev.id; })[0];
    var s = db.settings();
    if (!d) {
      var no = 1; all.forEach(function (x) { if (n(x.no) >= no) no = n(x.no) + 1; });
      d = { id: dev.id, no: String(no), name: dev.name || ((dev.type || 'อุปกรณ์') + ' ' + no), type: dev.type || '', ua: String(dev.ua || '').slice(0, 200), active: (s.deviceApproval === 'Y' && u.role !== 'owner') ? 'P' : 'Y', createdAt: db.now() };
    }
    if (d.active === 'N') err('อุปกรณ์นี้ถูกปิดการใช้งาน (เครื่องที่ ' + d.no + ') — ติดต่อเจ้าของร้าน');
    if (d.active === 'P' && u.role === 'owner') d.active = 'Y';
    d.lastSeen = db.now(); d.lastUser = u.username;
    db.upsert('Devices', [d]);
    if (d.active === 'P') err('อุปกรณ์ใหม่ (เครื่องที่ ' + d.no + ') รอเจ้าของร้านอนุมัติในเมนู อุปกรณ์');
    return { id: d.id, no: d.no, name: d.name };
  }
  function saveUser(db, u, p) {
    need(db, u, 'owner');
    var users = db.read('Users', {});
    var row = p.id ? users.filter(function (x) { return x.id === p.id; })[0] : null;
    var role = p.role === 'owner' ? 'owner' : 'staff';
    var uname = String(p.username || '').trim().toLowerCase();
    if (!uname) { // พนักงานไม่ต้องมีชื่อผู้ใช้ — สร้างให้อัตโนมัติ
      if (row) uname = row.username; else { var k = 1; while (users.some(function (x) { return String(x.username) === 'staff' + k; })) k++; uname = 'staff' + k; }
    }
    if (!/^[a-z0-9._-]{2,30}$/.test(uname)) err('ชื่อผู้ใช้ใช้ a-z 0-9 . _ - (2-30 ตัว)');
    if (users.some(function (x) { return String(x.username).toLowerCase() === uname && (!row || x.id !== row.id); })) err('ชื่อผู้ใช้ซ้ำ');
    if (!String(p.name || '').trim()) err('กรุณาใส่ชื่อที่แสดง');
    row = row ? Object.assign({}, row) : { id: uid('U'), createdAt: db.now() };
    if (role === 'staff' && row.role === 'owner' && !p.pin) err('เปลี่ยนเป็นพนักงาน ต้องตั้งรหัส 4 หลักใหม่ด้วย');
    row.name = String(p.name).trim(); row.username = uname; row.role = role; row.active = p.active === 'N' ? 'N' : 'Y';
    if (p.pin) {
      var pin = String(p.pin);
      if (role === 'staff' && !/^\d{4}$/.test(pin)) err('รหัสพนักงานต้องเป็นตัวเลข 4 หลัก');
      if (role === 'owner' && !/^\d{4}$/.test(pin)) err('รหัสเจ้าของต้องเป็นตัวเลข 4 หลัก');
      if (pinTaken(db, pin, row.id)) err('รหัสนี้มีผู้ใช้อื่นใช้แล้ว กรุณาตั้งรหัสอื่น');
      row.pinHash = db.hash(pin);
    }
    if (!row.pinHash) err('กรุณาตั้งรหัส');
    var owners = users.filter(function (x) { return x.role === 'owner' && x.active !== 'N' && x.id !== row.id; });
    if (!owners.length && (row.role !== 'owner' || row.active === 'N')) err('ต้องมีเจ้าของกิจการอย่างน้อย 1 คน');
    db.upsert('Users', [row]); db.log(u, 'saveUser', uname);
    return { username: uname };
  }
  // รหัสอนุมัติของเจ้าของร้าน (แยกจากรหัสเข้าระบบ) · ว่าง = ยกเลิก (ใช้รหัสเข้าระบบเจ้าของอนุมัติ)
  function setApprovePin(db, u, pin) {
    need(db, u, 'owner'); pin = String(pin == null ? '' : pin).trim();
    if (!pin) { db.upsert('Settings', [{ key: 'secretApprovePin', value: '' }]); db.log(u, 'approvePin', 'off'); return { set: false }; }
    if (!/^\d{4}$/.test(pin)) err('รหัสอนุมัติต้องเป็นตัวเลข 4 หลัก');
    var h = db.hash(pin);
    if (db.read('Users', {}).some(function (x) { return x.active !== 'N' && x.pinHash === h; })) err('รหัสนี้ซ้ำกับรหัสเข้าระบบของผู้ใช้ — ตั้งรหัสอนุมัติให้ต่างจากรหัสเข้าระบบทุกคน');
    db.upsert('Settings', [{ key: 'secretApprovePin', value: h }]); db.log(u, 'approvePin', 'set');
    return { set: true };
  }
  function changePin(db, u, oldPin, newPin) {
    if (u.role !== 'owner') err('พนักงานเปลี่ยนรหัสเองไม่ได้ — ให้เจ้าของร้านเปลี่ยนให้');
    if (!/^\d{4}$/.test(String(newPin))) err('รหัสต้องเป็นตัวเลข 4 หลัก');
    var me = db.read('Users', {}).filter(function (x) { return x.id === u.id; })[0];
    if (!me || me.pinHash !== db.hash(String(oldPin))) err('รหัสเดิมไม่ถูกต้อง');
    if (pinTaken(db, newPin, me.id)) err('รหัสนี้มีผู้ใช้อื่นใช้แล้ว กรุณาตั้งรหัสอื่น');
    db.upsert('Users', [{ id: me.id, pinHash: db.hash(String(newPin)) }]);
    return {};
  }

  // ---------- products ----------
  function nextSku(prods) { var m = 10000; prods.forEach(function (p) { var x = Number(p.sku); if (x > m && x < 900000) m = x; }); return String(m + 1); }
  function importProducts(db, u, rows, mode) {
    need(db, u, 'owner');
    var list = (rows || []).filter(function (r) { return r.sku; }).map(function (r) { var c = clean('Products', r); c.updatedAt = db.now(); c.updatedBy = u.username; return c; });
    if (mode === 'replace') db.remove('Products', '*');
    db.upsert('Products', list);
    // สร้างหมวดหมู่ที่ยังไม่มี
    var cats = db.read('Categories', {}), have = {}; cats.forEach(function (c) { have[c.name] = 1; });
    var COLORS = ['#43A047', '#FB8C00', '#1E88E5', '#E53935', '#8E24AA', '#00ACC1', '#C0CA33', '#6D4C41', '#F4511E', '#3949AB'];
    var add = [], i = cats.length;
    list.forEach(function (p) { if (p.category && !have[p.category]) { have[p.category] = 1; add.push({ name: p.category, color: COLORS[i++ % COLORS.length], sort: String(i) }); } });
    if (add.length) db.upsert('Categories', add);
    db.log(u, 'importProducts', list.length + ' (' + (mode || 'merge') + ')');
    return { count: list.length };
  }
  function renameCategory(db, u, from, to, color) {
    need(db, u, 'editProducts');
    to = String(to || '').trim(); if (!to) err('กรุณาใส่ชื่อหมวด');
    var cats = db.read('Categories', {}), old = cats.filter(function (c) { return c.name === from; })[0] || {};
    db.upsert('Categories', [{ name: to, color: color || old.color || '#43A047', sort: old.sort || String(cats.length + 1) }]);
    if (from && from !== to) {
      var ch = db.read('Products', {}).filter(function (p) { return p.category === from; }).map(function (p) { return { sku: p.sku, category: to }; });
      if (ch.length) db.upsert('Products', ch);
      db.remove('Categories', [from]);
      return { moved: ch.length };
    }
    return { moved: 0 };
  }
  function applyReceipt(db, u, rc) {
    need(db, u, 'receiveGoods');
    if (!rc || !rc.id) err('ข้อมูลใบเสร็จไม่ครบ');
    var items = J(rc.items, []);
    var prods = db.read('Products', {}), map = {};
    prods.forEach(function (p) { map[p.sku] = p; });
    var changed = {}, created = 0, viewCost = true; // บันทึกต้นทุนจากใบเสร็จได้ แม้พนักงานจะดูต้นทุนไม่ได้
    items.forEach(function (it) {
      var p = it.sku ? map[it.sku] : null;
      if (!p && it.createNew && it.name) {
        p = { sku: it.sku || nextSku(prods), handle: '', name: it.name, category: it.category || '', barcode: it.barcode || '', price: it.price || '', cost: '', stock: '', trackStock: 'N', available: 'Y', byWeight: 'N', bestseller: 'N' };
        prods.push(p); map[p.sku] = p; it.sku = p.sku; created++; changed[p.sku] = p;
      }
      if (!p) return;
      var qty = n(it.qty);
      if (it.updateCost && n(it.unitCost) > 0 && viewCost) p.cost = String(r2(n(it.unitCost)));
      if (it.updatePrice && n(it.price) > 0) p.price = String(it.price);
      if (it.barcode && !p.barcode) p.barcode = String(it.barcode);
      if (it.addStock && qty) { p.stock = String(r2(n(p.stock) + qty)); p.trackStock = 'Y'; }
      p.updatedAt = db.now(); p.updatedBy = u.username; changed[p.sku] = p;
    });
    var ch = Object.keys(changed).map(function (k) { return clean('Products', changed[k]); });
    if (ch.length) db.upsert('Products', ch);
    rc.items = JSON.stringify(items); rc.stockApplied = 'Y';
    if (!rc.createdAt) { rc.createdAt = db.now(); rc.createdBy = u.username; }
    db.upsert('Receipts', [clean('Receipts', rc)]);
    db.log(u, 'applyReceipt', rc.id);
    return { updated: ch.length, created: created };
  }

  // ปรับจำนวนสต็อก (ใช้สิทธิ์ตรวจนับ ไม่ต้องมีสิทธิ์แก้ไขสินค้า)
  function adjustStock(db, u, rows) {
    need(db, u, 'stockCount');
    var have = {}; db.read('Products', {}).forEach(function (p) { have[p.sku] = 1; });
    var ch = (rows || []).filter(function (r) { return have[r.sku]; }).map(function (r) { return { sku: String(r.sku), stock: String(r2(n(r.stock))), trackStock: 'Y', updatedAt: db.now(), updatedBy: u.username }; });
    if (ch.length) db.upsert('Products', ch);
    db.log(u, 'adjustStock', ch.map(function (c) { return c.sku + '=' + c.stock; }).join(',').slice(0, 280));
    return { rows: ch };
  }

  // ---------- POS orders ----------
  function payPart(o, type) { return J(o.payments, []).filter(function (p) { return p.type === type; }).reduce(function (s, p) { return s + n(p.amount); }, 0); }
  function applyOrderEffects(db, orders, sign, products, customers, now, by) {
    var pmap = {}, cmap = {}, chP = {}, chC = {}, tx = [];
    products.forEach(function (p) { pmap[p.sku] = p; });
    customers.forEach(function (c) { cmap[c.id] = c; });
    orders.forEach(function (o) {
      J(o.items, []).forEach(function (it) {
        var p = pmap[it.sku];
        if (p && p.trackStock === 'Y') { p.stock = String(r2(n(p.stock) - sign * Math.abs(n(it.qty)))); chP[p.sku] = { sku: p.sku, stock: p.stock }; }
      });
      if (o.customerId && cmap[o.customerId]) {
        var c = cmap[o.customerId], tot = Math.abs(n(o.total)), credit = Math.abs(payPart(o, 'credit'));
        c.totalSpent = String(r2(n(c.totalSpent) + sign * tot));
        c.visits = String(Math.max(0, n(c.visits) + sign));
        c.points = String(Math.max(0, n(c.points) + sign * (Math.abs(n(o.pointsEarned)) - Math.abs(n(o.pointsUsed)))));
        if (credit) {
          c.credit = String(r2(n(c.credit) + sign * credit));
          tx.push({ id: uid('T'), date: now, customerId: c.id, type: sign > 0 ? 'credit_sale' : 'credit_refund', amount: String(sign * credit), points: '', ref: o.id, by: by, note: '' });
        }
        if (sign > 0) c.lastVisit = o.date;
        chC[c.id] = { id: c.id, totalSpent: c.totalSpent, visits: c.visits, points: c.points, credit: c.credit, lastVisit: c.lastVisit || '' };
      }
    });
    var cp = Object.keys(chP).map(function (k) { return chP[k]; }), cc = Object.keys(chC).map(function (k) { return chC[k]; });
    if (cp.length) db.upsert('Products', cp);
    if (cc.length) db.upsert('Customers', cc);
    if (tx.length) db.append('CustomerTx', tx);
    return { products: cp, customers: cc };
  }
  function syncOrders(db, u, orders) {
    need(db, u, 'sell');
    orders = orders || [];
    if (!orders.length) return { saved: [] };
    var exist = db.read('Orders', { ids: orders.map(function (o) { return o.id; }) });
    var have = {}; exist.forEach(function (o) { have[o.id] = 1; });
    var now = db.now(), prods = db.read('Products', {}), pc = {};
    prods.forEach(function (p) { pc[p.sku] = n(p.cost); });
    var fresh = orders.filter(function (o) { return o.id && !have[o.id]; }).map(function (o) {
      if (payPart(o, 'credit') && !o.customerId) err('ขายเงินเชื่อต้องเลือกลูกค้า (บิล ' + o.id + ')');
      // ต้นทุนคิดจากฐานข้อมูลเสมอ (เครื่องพนักงานไม่มีข้อมูลต้นทุน)
      var items = J(o.items, []), cost = 0;
      items.forEach(function (it) { if (it.sku in pc) it.cost = pc[it.sku]; cost += n(it.qty) * n(it.cost); });
      o.items = JSON.stringify(items); o.cost = String(r2(cost));
      var c = clean('Orders', o); c.status = c.status || 'sale'; c.syncedAt = now; return c;
    });
    var eff = { products: [], customers: [] };
    if (fresh.length) {
      var needC = fresh.some(function (o) { return o.customerId; });
      eff = applyOrderEffects(db, fresh, 1, prods, needC ? db.read('Customers', {}) : [], now, u.username);
      db.append('Orders', fresh);
      db.log(u, 'syncOrders', fresh.length + ' บิล');
      makeJobs(db, fresh);
    }
    return { saved: orders.map(function (o) { return o.id; }), stock: eff.products, customers: eff.customers };
  }
  // ---------- งานที่เจ้าของร้านต้องทำต่อ (โอนเงินให้ลูกค้า / เติม TrueMoney / ชำระบิล) ----------
  // สร้างจากบิลขายที่มีรายการบริการ job.notify (สร้างตอนบิลเข้าระบบ จึงใช้ได้แม้ขายตอนออฟไลน์) แล้วแจ้งเตือนเจ้าของร้าน
  function makeJobs(db, orders) {
    var jobs = [];
    orders.forEach(function (o) {
      J(o.items, []).forEach(function (it, i) {
        var j = it && it.job; if (!j || !j.notify) return;
        jobs.push({ id: o.id + '-J' + i, date: o.date, orderId: o.id, type: String(j.type || ''), status: 'pending', title: String(it.name || ''), amount: String(n(j.amount)), fee: String(n(j.fee)),
          bank: j.bank || '', bankName: j.bankName || '', acc: j.acc || '', accName: j.accName || '', carrier: j.carrier || '', carrierName: j.carrierName || '', phone: j.phone || '',
          billType: j.billType || '', ref: j.ref || '', contact: j.contact || '', fileUrl: j.fileUrl || '', customerName: o.customerName || '', cashier: o.cashier || '', cashierName: o.cashierName || '', deviceName: o.deviceName || '' });
      });
    });
    if (!jobs.length) return [];
    db.upsert('Jobs', jobs);
    if (db.notify) { try { db.notify(jobs); } catch (e) { } }
    return jobs;
  }
  function jobsList(db, u, opt) {
    need(db, u, 'sell'); opt = opt || {};
    var rows = db.read('Jobs', {}), today = db.now().slice(0, 10);
    if (u.role !== 'owner') rows = rows.filter(function (j) { return String(j.date).slice(0, 10) === today; }); // พนักงานเห็นเฉพาะงานวันนี้ (ไว้บอกสถานะลูกค้า)
    if (opt.status) rows = rows.filter(function (j) { return j.status === opt.status; });
    rows.sort(function (a, b) { return String(b.date).localeCompare(a.date); });
    return rows.slice(0, n(opt.limit) || 300);
  }
  function jobUpdate(db, u, id, status, ref) {
    need(db, u, 'owner');
    if (['done', 'cancelled', 'pending'].indexOf(status) < 0) err('สถานะไม่ถูกต้อง');
    var j = db.read('Jobs', { ids: [id] })[0]; if (!j) err('ไม่พบงาน ' + id);
    var c = { id: id, status: status, doneAt: status === 'pending' ? '' : db.now(), doneBy: status === 'pending' ? '' : (u.name || u.username), doneRef: status === 'pending' ? '' : String(ref || '') };
    db.upsert('Jobs', [c]); db.log(u, 'job ' + status, id);
    for (var k in c) j[k] = c[k];
    return { job: j };
  }
  function hideCost(o) { var c = Object.assign({}, o); c.cost = ''; c.items = JSON.stringify(J(o.items, []).map(function (i) { var x = Object.assign({}, i); delete x.cost; return x; })); return c; }
  function ordersRange(db, u, from, to, cashier) {
    var all = strict(db, u, 'reports');
    // พนักงานที่ไม่มีสิทธิ์ดูยอดย้อนหลัง เห็นได้เฉพาะบิลของตัวเองวันนี้ (ไว้พิมพ์ซ้ำ)
    if (!all && !strict(db, u, 'ownSales')) { var t = db.now().slice(0, 10); if (from < t) from = t; if (to < t) return []; }
    var rows = db.read('Orders', { from: from, to: to + 'T99' });
    if (!all) rows = rows.filter(function (o) { return o.cashier === u.username; });
    else if (cashier) rows = rows.filter(function (o) { return o.cashier === cashier; });
    if (!strict(db, u, 'viewCost')) rows = rows.map(hideCost);
    return rows;
  }
  function getOrder(db, u, id) {
    var o = db.read('Orders', { ids: [id] })[0];
    if (!o) err('ไม่พบใบเสร็จ ' + id);
    if (!strict(db, u, 'reports') && o.cashier !== u.username) err('สิทธิ์ไม่เพียงพอ');
    return strict(db, u, 'viewCost') ? o : hideCost(o);
  }
  function refund(db, u, id, reason) {
    need(db, u, 'refund');
    var o = db.read('Orders', { ids: [id] })[0];
    if (!o) err('ไม่พบใบเสร็จ ' + id + ' (ถ้าเพิ่งขายแบบออฟไลน์ ให้รอซิงก์ก่อน)');
    if (o.status !== 'sale') err('ใบเสร็จนี้คืนเงิน/ยกเลิกไปแล้ว');
    var now = db.now();
    var neg = function (v) { return String(-Math.abs(n(v))); };
    var r = {
      id: o.id + '-R', date: now, deviceId: o.deviceId, deviceName: o.deviceName, cashier: u.username, cashierName: u.name,
      customerId: o.customerId, customerName: o.customerName, items: o.items, itemCount: o.itemCount,
      subtotal: neg(o.subtotal), discount: neg(o.discount), total: neg(o.total), cost: neg(o.cost),
      payments: JSON.stringify(J(o.payments, []).map(function (p) { return { type: p.type, amount: -Math.abs(n(p.amount)) }; })),
      payType: o.payType, pointsEarned: o.pointsEarned, pointsUsed: o.pointsUsed, status: 'refund', refundOf: o.id, note: reason || '', syncedAt: now
    };
    applyOrderEffects(db, [o], -1, db.read('Products', {}), o.customerId ? db.read('Customers', {}) : [], now, u.username);
    db.upsert('Orders', [{ id: o.id, status: 'refunded' }]);
    db.append('Orders', [r]);
    // บิลที่มีงานโอน/ชำระบิลค้างอยู่ → ยกเลิกงานและแจ้งเจ้าของร้าน
    var js = db.read('Jobs', {}).filter(function (j) { return j.orderId === o.id && j.status === 'pending'; });
    if (js.length) {
      db.upsert('Jobs', js.map(function (j) { return { id: j.id, status: 'cancelled', doneAt: now, doneBy: u.name || u.username, doneRef: 'คืนเงินบิล ' + o.id }; }));
      if (db.notify) { try { db.notify(js.map(function (j) { j.status = 'cancelled'; j.doneRef = 'คืนเงินบิล ' + o.id; return j; })); } catch (e) { } }
    }
    db.log(u, 'refund', o.id);
    return { refund: r };
  }
  function salesMonthly(db, u, year) {
    need(db, u, 'owner');
    var rows = db.read('Orders', { from: year + '-01-01', to: year + '-12-31T99' });
    var m = {};
    rows.forEach(function (o) {
      var k = String(o.date).slice(5, 7); var x = m[k] || (m[k] = { gross: 0, refund: 0, disc: 0, net: 0, count: 0, cost: 0 });
      var t = n(o.total);
      if (o.status === 'refund') { x.refund += -t; x.cost -= Math.abs(n(o.cost)); }
      else { x.gross += n(o.subtotal) || t; x.disc += n(o.discount); x.count++; x.cost += n(o.cost); }
      x.net += t;
    });
    return { months: m };
  }

  // ยอดขายรายวัน: วันที่มีบิล POS ใช้ยอด POS, วันที่ไม่มีใช้ยอดที่นำเข้า (Loyverse/Excel)
  // pass = ยอดเงินรับแทน (โอนเงิน/เติมเงิน/จ่ายบิล) ซึ่งไม่ใช่รายได้ของร้าน
  function dailySummary(db, u, from, to) {
    if (!strict(db, u, 'reports')) need(db, u, 'owner');
    var days = {}, ex = {}; (J(db.settings().vatCfg, {}).exemptCats || []).forEach(function (c) { ex[c] = 1; });
    db.read('Orders', { from: from, to: to + 'T99' }).forEach(function (o) {
      var k = String(o.date).slice(0, 10), x = days[k] || (days[k] = { gross: 0, refund: 0, disc: 0, net: 0, cost: 0, count: 0, pass: 0, exempt: 0, src: 'POS' });
      var t = n(o.total), sg = o.status === 'refund' ? -1 : 1;
      if (sg < 0) { x.refund += -t; x.cost -= Math.abs(n(o.cost)); } else { x.gross += n(o.subtotal) || t; x.disc += n(o.discount); x.count++; x.cost += n(o.cost); }
      x.net += t;
      J(o.items, []).forEach(function (it) { var a = sg * Math.abs(n(it.qty) * n(it.price)); if (it.pass) x.pass += a; else if (ex[it.cat || '']) x.exempt += a; });
    });
    db.read('SalesDaily', { from: from, to: to }).forEach(function (r) {
      var k = String(r.date).slice(0, 10); if (days[k]) return;
      days[k] = { gross: n(r.gross), refund: n(r.refund), disc: n(r.discount), net: n(r.net), cost: n(r.cost), count: 0, pass: 0, exempt: 0, src: r.source || 'นำเข้า', hasCost: r.cost !== '' };
    });
    if (!strict(db, u, 'viewCost')) Object.keys(days).forEach(function (k) { days[k].cost = 0; });
    Object.keys(days).forEach(function (k) { var d = days[k]; ['gross', 'refund', 'disc', 'net', 'cost', 'pass', 'exempt'].forEach(function (f) { d[f] = r2(d[f]); }); });
    return days;
  }

  // ---------- นำเข้าใบเสร็จรับเงินย้อนหลัง (เช่น จาก Loyverse หรือไฟล์ที่ส่งออกจากระบบนี้) ----------
  // ไม่ตัดสต็อก ไม่คิดแต้ม/เงินเชื่อ (เป็นประวัติการขาย) · เลขที่ใบเสร็จซ้ำกับที่มีอยู่แล้ว หรือซ้ำกันเองในไฟล์ = ข้าม
  // dry = ตรวจอย่างเดียว ยังไม่บันทึก
  function importOrders(db, u, rows, dry) {
    need(db, u, 'owner');
    rows = rows || [];
    var ids = rows.map(function (o) { return String(o && o.id || ''); }).filter(function (x) { return x; });
    var have = {}; if (ids.length) db.read('Orders', { ids: ids }).forEach(function (o) { have[o.id] = 1; });
    var seen = {}, dup = [], bad = [], fresh = [], now = db.now();
    rows.forEach(function (o, i) {
      var id = String(o && o.id || '');
      if (!id || !/^\d{4}-\d\d-\d\d/.test(String(o.date || ''))) { bad.push(id || ('แถว ' + (i + 1))); return; }
      if (have[id] || seen[id]) { dup.push(id); return; }
      seen[id] = 1;
      var c = clean('Orders', o); c.status = c.status || 'sale'; c.syncedAt = now; fresh.push(c);
    });
    if (!dry && fresh.length) { db.append('Orders', fresh); db.log(u, 'importOrders', fresh.length + ' บิล · ซ้ำ ' + dup.length); }
    return { fresh: fresh.length, added: dry ? 0 : fresh.length, dup: dup.length, dupIds: dup.slice(0, 30), bad: bad.length, badIds: bad.slice(0, 10) };
  }

  // ---------- สำรอง / กู้คืนข้อมูลทั้งระบบ (เจ้าของเท่านั้น) ----------
  function backupTable(db, u, t, offset, limit) {
    need(db, u, 'owner'); if (!SCHEMA[t]) err('ไม่พบตาราง ' + t);
    var rows = db.read(t, {}), off = Math.max(0, n(offset)), lim = Math.max(1, n(limit) || 5000);
    return { table: t, total: rows.length, rows: rows.slice(off, off + lim) };
  }
  // กู้คืนแบบรวม: แถวที่มีอยู่แล้ว (key ตรงกัน) = เขียนทับ · แถวใหม่ = เพิ่ม · ไม่ลบข้อมูลที่ไม่มีในไฟล์
  function restoreTable(db, u, t, rows, dry) {
    need(db, u, 'owner');
    var sc = SCHEMA[t]; if (!sc || t === 'Log') err('ไม่รองรับการกู้คืนตาราง ' + t);
    var list = (rows || []).map(function (r) { return clean(t, r || {}); }).filter(function (c) { return c[sc.key]; });
    var old = {}; db.read(t, {}).forEach(function (r) { old[String(r[sc.key])] = r; });
    var add = 0, upd = 0, same = 0;
    list.forEach(function (c) {
      var o = old[String(c[sc.key])];
      if (!o) { add++; return; }
      var diff = sc.cols.some(function (k) { return k in c && String(o[k] == null ? '' : o[k]) !== c[k]; });
      if (diff) upd++; else same++;
    });
    if (!dry && list.length) { db.upsert(t, list); db.log(u, 'restore ' + t, 'เพิ่ม ' + add + ' · แทนที่ ' + upd); }
    return { table: t, rows: list.length, add: add, upd: upd, same: same };
  }

  // ---------- customers ----------
  function customerPay(db, u, id, amount, note) {
    need(db, u, 'credit');
    amount = n(amount); if (amount <= 0) err('จำนวนเงินไม่ถูกต้อง');
    var c = db.read('Customers', {}).filter(function (x) { return x.id === id; })[0]; if (!c) err('ไม่พบลูกค้า');
    c.credit = String(r2(n(c.credit) - amount));
    db.upsert('Customers', [{ id: c.id, credit: c.credit }]);
    db.append('CustomerTx', [{ id: uid('T'), date: db.now(), customerId: id, type: 'credit_pay', amount: String(-amount), points: '', ref: '', by: u.username, note: note || '' }]);
    db.log(u, 'customerPay', c.name + ' ' + amount);
    return { credit: c.credit };
  }
  function adjustPoints(db, u, id, pts, note) {
    need(db, u, 'customers');
    var c = db.read('Customers', {}).filter(function (x) { return x.id === id; })[0]; if (!c) err('ไม่พบลูกค้า');
    c.points = String(Math.max(0, n(c.points) + n(pts)));
    db.upsert('Customers', [{ id: c.id, points: c.points }]);
    db.append('CustomerTx', [{ id: uid('T'), date: db.now(), customerId: id, type: 'points_adjust', amount: '', points: String(n(pts)), ref: '', by: u.username, note: note || '' }]);
    return { points: c.points };
  }

  // ---------- time clock ----------
  function openShift(db, u) { return db.read('Shifts', {}).filter(function (s) { return s.username === u.username && !s.outAt; })[0] || null; }
  // at = เวลาจากเครื่อง (กรณีลงเวลาตอนออฟไลน์แล้วส่งตามมา) ยอมรับย้อนหลังไม่เกิน 3 วัน
  function okTime(db, at) {
    var now = db.now(); if (!at) return now;
    var d = (new Date(now) - new Date(at)) / 36e5; return (d >= -0.1 && d <= 72) ? String(at).slice(0, 19) : now;
  }
  function clockIn(db, u, deviceId, at) {
    if (openShift(db, u)) err('ลงเวลาเข้างานไว้แล้ว');
    var s = { id: uid('S'), username: u.username, name: u.name, inAt: okTime(db, at), outAt: '', deviceId: deviceId || '', hours: '' };
    db.append('Shifts', [s]); return { shift: s };
  }
  function clockOut(db, u, at) {
    var s = openShift(db, u); if (!s) err('ยังไม่ได้ลงเวลาเข้างาน');
    s.outAt = okTime(db, at); if (s.outAt < s.inAt) s.outAt = s.inAt;
    s.hours = String(r2((new Date(s.outAt.replace(' ', 'T')) - new Date(s.inAt.replace(' ', 'T'))) / 36e5));
    db.upsert('Shifts', [{ id: s.id, outAt: s.outAt, hours: s.hours }]); return { shift: s };
  }
  function shifts(db, u, from, to) {
    var rows = db.read('Shifts', { from: from, to: to + 'T99' });
    if (u.role !== 'owner') rows = rows.filter(function (s) { return s.username === u.username; });
    return rows;
  }

  // ---------- stock count / PO ----------
  // p: {id, name, scope:{type,categories,skus}, items:[{sku,counted,expected}], zeroUncounted, note}
  function finishCount(db, u, p) {
    need(db, u, 'stockCount');
    var items = J(p.items, []), scope = J(p.scope, { type: 'all' }), counted = {};
    if (!items.length) err('ยังไม่ได้นับสินค้า');
    items.forEach(function (it) { if (it.counted !== '' && it.counted != null) counted[it.sku] = n(it.counted); });
    var ch = [], diffQty = 0, diffVal = 0, zeroed = 0;
    db.read('Products', {}).forEach(function (pr) {
      var inScope = scope.type === 'all' || (scope.type === 'category' && (scope.categories || []).indexOf(pr.category || '') >= 0) || (scope.type === 'selected' && (scope.skus || []).indexOf(pr.sku) >= 0);
      if (pr.sku in counted) {
        var d = counted[pr.sku] - n(pr.stock); diffQty += d; diffVal += d * n(pr.cost);
        ch.push({ sku: pr.sku, stock: String(counted[pr.sku]), trackStock: 'Y' });
      } else if (p.zeroUncounted && inScope && pr.trackStock === 'Y' && n(pr.stock) !== 0) {
        diffQty -= n(pr.stock); diffVal -= n(pr.stock) * n(pr.cost); zeroed++;
        ch.push({ sku: pr.sku, stock: '0' });
      }
    });
    if (ch.length) db.upsert('Products', ch);
    var compact = JSON.stringify(items.map(function (it) { return [it.sku, it.expected, it.counted]; }));
    var id = p.id || uid('SC');
    db.upsert('StockCounts', [{ id: id, name: p.name || 'ตรวจนับสต็อก', date: db.now().slice(0, 10), scope: JSON.stringify(scope), status: 'done', items: compact.length < 45000 ? compact : '', by: u.username, finishedAt: db.now(),
      note: 'นับ ' + Object.keys(counted).length + ' รายการ · ปรับเป็น 0 ' + zeroed + ' รายการ · ส่วนต่าง ' + r2(diffQty) + ' ชิ้น · มูลค่าทุน ' + r2(diffVal) + ' บาท' + (p.note ? ' · ' + p.note : '') }]);
    db.log(u, 'finishCount', id + ' ' + ch.length);
    return { id: id, updated: ch.length, diffQty: r2(diffQty), diffVal: r2(diffVal), stock: ch };
  }
  function receivePO(db, u, id) {
    need(db, u, 'receiveGoods');
    var po = db.read('POs', {}).filter(function (x) { return x.id === id; })[0]; if (!po) err('ไม่พบใบสั่งซื้อ');
    if (po.status === 'received') err('รับของใบนี้ไปแล้ว');
    var items = J(po.items, []).map(function (it) { return { sku: it.sku, name: it.name, qty: n(it.qty), unitCost: n(it.cost), amount: r2(n(it.qty) * n(it.cost)), updateCost: n(it.cost) > 0, addStock: true }; });
    var d = db.now().slice(0, 10);
    var res = applyReceipt(db, u, { id: 'RPO-' + id, date: d, supplier: po.supplier, type: 'สินค้า', total: po.total, items: JSON.stringify(items), note: 'รับของจากใบสั่งซื้อ ' + id });
    db.upsert('POs', [{ id: id, status: 'received', receivedAt: db.now() }]);
    return res;
  }

  // ---------- dispatcher ----------
  function handle(db, u, a, p) {
    OWNERPIN = p && p.ownerPin || null; PINOK = null;
    switch (a) {
      case 'setApprovePin': return setApprovePin(db, u, p.pin);
      case 'checkPin': if (!pinOk(db, p.scope)) err('PIN_BAD: กรุณาใส่รหัสเจ้าของร้าน'); return { ok: true, kind: PINOK };
      case 'list': return { rows: list(db, u, p.table, p.opt) };
      case 'upsert': return { rows: upsert(db, u, p.table, p.rows) };
      case 'remove': return { removed: remove(db, u, p.table, p.ids) };
      case 'importProducts': return importProducts(db, u, p.rows, p.mode);
      case 'renameCategory': return renameCategory(db, u, p.from, p.to, p.color);
      case 'applyReceipt': return applyReceipt(db, u, p.receipt);
      case 'syncOrders': return syncOrders(db, u, p.orders);
      case 'adjustStock': return adjustStock(db, u, p.rows);
      case 'ordersRange': return { rows: ordersRange(db, u, p.from, p.to, p.cashier) };
      case 'getOrder': return { order: getOrder(db, u, p.id) };
      case 'refund': return refund(db, u, p.id, p.reason);
      case 'salesMonthly': return salesMonthly(db, u, p.year);
      case 'jobs': return { rows: jobsList(db, u, p) };
      case 'jobUpdate': return jobUpdate(db, u, p.id, p.status, p.ref);
      case 'importOrders': return importOrders(db, u, p.rows, p.dry);
      case 'backupTable': return backupTable(db, u, p.table, p.offset, p.limit);
      case 'restoreTable': return restoreTable(db, u, p.table, p.rows, p.dry);
      case 'customerPay': return customerPay(db, u, p.id, p.amount, p.note);
      case 'adjustPoints': return adjustPoints(db, u, p.id, p.points, p.note);
      case 'clockIn': return clockIn(db, u, p.deviceId, p.at);
      case 'clockOut': return clockOut(db, u, p.at);
      case 'dailySummary': return { days: dailySummary(db, u, p.from, p.to) };
      case 'myShift': return { shift: openShift(db, u) };
      case 'shifts': return { rows: shifts(db, u, p.from, p.to) };
      case 'finishCount': return finishCount(db, u, p);
      case 'receivePO': return receivePO(db, u, p.id);
      case 'imagesSince': return { rows: db.read('Images', {}).filter(function (r) { return String(r.updatedAt) > String(p.since || ''); }), now: db.now() };
      case 'saveUser': return saveUser(db, u, p);
      case 'changePin': return changePin(db, u, p.oldPin, p.newPin);
      case 'perms': return { perms: perms(db), defs: PERMS };
      case 'bootstrap': {
        var s = {}; list(db, u, 'Settings').forEach(function (r) { s[r.key] = r.value; });
        return { settings: s, perms: perms(db), defs: PERMS, categories: db.read('Categories', {}), shift: openShift(db, u), activeUsers: db.read('Users', {}).filter(function (x) { return x.active !== 'N'; }).map(function (x) { return x.id + ':' + x.role; }), now: db.now() };
      }
    }
    err('ไม่รู้จักคำสั่ง: ' + a);
  }

  return { SCHEMA: SCHEMA, PERMS: PERMS, strict: strict, handle: handle, login: login, can: can, perms: perms, n: n, J: J, uid: uid, nextSku: nextSku };
})();
