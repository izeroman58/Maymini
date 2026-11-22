/* =========================================================
   เครื่องยิงบาร์โค้ด — ตัวรับสัญญาณกลางของทั้งแอป
   รองรับ:
   - USB (Type-C / Type-A / OTG) และ Bluetooth ที่ทำงานแบบคีย์บอร์ด (HID) = เกือบทุกรุ่นในตลาด
   - เครื่องแบบ Serial / USB-COM (USB-CDC) ผ่าน Web Serial (Chrome บนคอมพิวเตอร์)
   แก้ปัญหาที่พบบ่อย:
   - แป้นพิมพ์เป็นภาษาไทย → อ่านจากตำแหน่งปุ่ม (e.code) ไม่ใช่ตัวอักษร จึงได้ตัวเลขถูกเสมอ
   - เครื่องที่ไม่ส่ง Enter ท้าย → จบการยิงเมื่อหยุดส่งตัวอักษร
   - ยิงตอนเคอร์เซอร์อยู่ในช่องพิมพ์ → ตัวอักษรไม่ปนกับข้อความเดิม
   - มีรหัสนำหน้า AIM (เช่น ]E0) / ตัวนำหน้า-ต่อท้ายที่ตั้งไว้ → ตัดออกให้
   ========================================================= */
'use strict';
const SCFG_DEF = { maxGap: 50, minLen: 4, autoEnter: true, stripAim: true, sound: true, prefix: '', suffix: '', serial: false, baud: 9600 };
const Scanner = {
  get cfg() { return { ...SCFG_DEF, ...LS.get('scannerCfg', {}) }; },
  setCfg(o) { LS.set('scannerCfg', { ...this.cfg, ...o }); },
  handlers: {},           // handlers[ชื่อหน้า] = fn(code)  — ใช้เมื่อเปิดหน้านั้นอยู่
  history: [],            // สำหรับหน้าทดสอบ
  b: null, timer: null,
  SHIFT: { Digit1: '!', Digit2: '@', Digit3: '#', Digit4: '$', Digit5: '%', Digit6: '^', Digit7: '&', Digit8: '*', Digit9: '(', Digit0: ')', Minus: '_', Equal: '+', BracketLeft: '{', BracketRight: '}', Backslash: '|', Semicolon: ':', Quote: '"', Comma: '<', Period: '>', Slash: '?', Backquote: '~' },
  PLAIN: { Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', Space: ' ', NumpadDecimal: '.', NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/' },
  charOf(e) {
    const c = e.code || '';
    let m;
    if ((m = c.match(/^Digit(\d)$/))) return e.shiftKey ? this.SHIFT[c] : m[1];
    if ((m = c.match(/^Numpad(\d)$/))) return m[1];
    if ((m = c.match(/^Key([A-Z])$/))) return (e.shiftKey !== e.getModifierState('CapsLock')) ? m[1] : m[1].toLowerCase();
    if (c in this.PLAIN) return e.shiftKey && this.SHIFT[c] ? this.SHIFT[c] : this.PLAIN[c];
    if (e.key && e.key.length === 1 && e.key.charCodeAt(0) < 128) return e.key;   // บางเครื่อง/Android ไม่ส่ง e.code
    if (e.key && e.key.length === 1 && this.TH[e.key]) return this.TH[e.key];       // แป้นไทย (เกษมณี) ที่ไม่ส่ง e.code → แปลงกลับเป็นปุ่มภาษาอังกฤษ
    return null;
  },
  // แป้นพิมพ์ไทยเกษมณี → ตัวอักษรอังกฤษบนปุ่มเดียวกัน
  TH: (() => { const a = "ๅ/-ภถุึคตจขชๆไำพะัีรนยบลฃฟหกดเ้่าสวงผปแอิืทมใฝ+๑๒๓๔ู฿๕๖๗๘๙๐\"ฎฑธํ๊ณฯญฐ,ฅฤฆฏโฌ็๋ษศซ.()ฉฮฺ์?ฒฬฦ", b = "1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:\"ZXCVBNM<>?"; const m = {}; [...a].forEach((c, i) => { if (b[i] != null && !(c in m)) m[c] = b[i]; }); return m; })(),
  thai2en(s) { return [...String(s)].map(c => this.TH[c] != null ? this.TH[c] : c).join(''); },
  isField: el => el && (el.tagName === 'INPUT' && !/^(checkbox|radio|button|file|range|color|date)$/i.test(el.type) || el.tagName === 'TEXTAREA'),
  onKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    const cfg = this.cfg, now = e.timeStamp || performance.now();
    if (e.key === 'Enter' || e.key === 'Tab' || e.code === 'NumpadEnter') {
      if (this.b && now - this.b.last <= Math.max(cfg.maxGap * 6, 400)) { if (this.finish(e.key === 'Tab' ? 'Tab' : 'Enter', e)) return; }
      this.b = null;
      if (e.key === 'Enter') this.thaiField(e);
      return;
    }
    const ch = this.charOf(e);
    if (ch == null) return;            // Shift, CapsLock ฯลฯ — ไม่ตัดการยิง
    const b = this.b;
    // เครื่องยิง Bluetooth ส่งเป็นชุด ๆ อาจเว้นช่วงได้ → เมื่อยืนยันแล้วว่าเป็นเครื่องยิง (ตัวอักษรมาเร็ว ≥ 3 ตัว) ยอมให้เว้นได้ถึง 250ms
    const fastSoFar = b && b.gaps.length >= 2 && b.gaps.filter(g => g <= cfg.maxGap).length >= b.gaps.length - 1;
    const allow = b ? (fastSoFar ? Math.max(cfg.maxGap, 250) : cfg.maxGap) : 0;
    if (!b || now - b.last > allow) {
      if (b && fastSoFar && b.chars.length >= cfg.minLen) this.finish('idle');
      const el = document.activeElement, f = this.isField(el);
      this.b = { chars: [ch], keys: [e.key], t0: now, last: now, gaps: [], el: f ? el : null, before: f ? { v: el.value, s: el.selectionStart ?? el.value.length, e: el.selectionEnd ?? el.value.length } : null, thai: /[฀-๿]/.test(e.key), noCode: !e.code, swallowed: 0 };
    } else {
      b.gaps.push(now - b.last); b.last = now; b.chars.push(ch); b.keys.push(e.key);
      if (/[฀-๿]/.test(e.key)) b.thai = true;
      if (!e.code) b.noCode = true;
      // ตั้งแต่ตัวที่ 2 ที่มาเร็วผิดปกติ = เครื่องยิง → ไม่ให้ตัวอักษรลงช่องพิมพ์ (กันภาษาไทยเพี้ยน/ปนข้อความ)
      e.preventDefault(); b.swallowed++;
    }
    clearTimeout(this.timer);
    // ส่วนใหญ่เครื่องยิงส่ง Enter ท้าย → รอ Enter ให้นานพอ ไม่ตัดกลางรหัส (เครื่องที่ไม่ส่ง Enter จบเองหลังหยุด 300ms)
    this.timer = setTimeout(() => { if (this.b) this.finish('idle'); }, LS.get('scanSeenEnter', false) ? 400 : 260);
  },
  clean(code) {
    const cfg = this.cfg;
    if (cfg.stripAim) code = code.replace(/^\][A-Za-z][0-9A-Za-z]/, '');
    if (cfg.prefix && code.startsWith(cfg.prefix)) code = code.slice(cfg.prefix.length);
    if (cfg.suffix && code.endsWith(cfg.suffix)) code = code.slice(0, -cfg.suffix.length);
    return code.replace(/[\x00-\x1F]/g, '').trim();
  },
  finish(term, ev) {
    const b = this.b; this.b = null; clearTimeout(this.timer);
    if (!b) return false;
    const cfg = this.cfg;
    if (b.chars.length < cfg.minLen) {
      // ไม่ใช่การยิง (คนพิมพ์เร็ว) → คืนตัวอักษรที่กันไว้ให้ช่องพิมพ์
      if (b.swallowed && b.el) { const add = b.keys.slice(b.keys.length - b.swallowed).join(''); const s = b.el.selectionStart ?? b.el.value.length; b.el.value = b.el.value.slice(0, s) + add + b.el.value.slice(b.el.selectionEnd ?? s); b.el.setSelectionRange && b.el.setSelectionRange(s + add.length, s + add.length); b.el.dispatchEvent(new Event('input', { bubbles: true })); }
      return false;
    }
    // แป้นไทยที่ไม่ส่งตำแหน่งปุ่ม: ตัว - / + ฯลฯ ก็คือปุ่มตัวเลขบนแป้นไทย → แปลงจากตัวอักษรที่กดทั้งหมด
    const code = this.clean(b.thai && b.noCode ? this.thai2en(b.keys.join('')) : b.chars.join(''));
    if (term === 'Enter' && !LS.get('scanSeenEnter', false)) LS.set('scanSeenEnter', true);
    const ms = Math.round(b.last - b.t0), avg = b.gaps.length ? b.gaps.reduce((a, x) => a + x, 0) / b.gaps.length : 0;
    this.history.unshift({ code, len: code.length, ms, avg: Math.round(avg * 10) / 10, term, thai: b.thai, src: 'HID', at: new Date() }); this.history = this.history.slice(0, 30);
    if (!code) return false;
    this.dispatch(code, b, term, ev);
    return true;
  },
  // แป้นพิมพ์บนจอเป็นภาษาไทยและช่องพิมพ์ถูกเลือกอยู่ → Android ส่งตัวอักษรไทยเข้าช่องตรง ๆ (ไม่ผ่าน keydown)
  // กด Enter แล้ว: ถ้าท้ายช่องเป็นตัวอักษรไทยที่แปลงกลับเป็นบาร์โค้ดได้ → แก้เป็นตัวเลขให้แล้วส่งต่อเหมือนยิงปกติ
  thaiField(e) {
    const el = document.activeElement; if (!this.isField(el)) return;
    const m = String(el.value).match(/[\u0E00-\u0E7F0-9a-zA-Z\/\-+(),."?]{4,}$/); if (!m || !/[\u0E00-\u0E7F]/.test(m[0])) return;
    const code = this.clean(this.thai2en(m[0]));
    if (!/^[0-9A-Za-z\-]{4,}$/.test(code) || !/\d{3,}/.test(code)) return;
    const pre = el.value.slice(0, m.index);
    this.history.unshift({ code, len: code.length, ms: 0, avg: 0, term: 'Enter', thai: true, src: 'HID', at: new Date() }); this.history = this.history.slice(0, 30);
    el.value = pre + code; el.dispatchEvent(new Event('input', { bubbles: true }));
    this.dispatch(code, { el, before: { v: pre, s: pre.length, e: pre.length } }, 'Enter', e);
  },
  dispatch(code, b, term, ev) {
    const cfg = this.cfg;
    const el = b ? b.el : (this.isField(document.activeElement) ? document.activeElement : null);
    const overlay = $('.ov') || $('.scan');
    const h = this.handlers[S.view];
    const nativeField = el && (el.hasAttribute('data-scan-field') || overlay);
    if (h && !nativeField && !(overlay && !this.handlers._overlayOK)) {
      if (el && b && b.before) { el.value = b.before.v; el.dispatchEvent(new Event('input', { bubbles: true })); }
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      const t0 = performance.now(); try { h(code); } catch (e) { console.error(e); }
      if (this.history[0] && this.history[0].code === code) this.history[0].ui = Math.round(performance.now() - t0);
    } else if (el) {
      // ใส่รหัสที่ถูกต้องลงในช่องที่กำลังพิมพ์ (แทนตัวอักษรที่อาจเพี้ยนเป็นภาษาไทย)
      const bf = b && b.before ? b.before : { v: el.value, s: el.selectionStart ?? el.value.length, e: el.selectionEnd ?? el.value.length };
      el.value = bf.v.slice(0, bf.s) + code + bf.v.slice(bf.e);
      try { el.setSelectionRange(bf.s + code.length, bf.s + code.length); } catch (e) { }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (term === 'Tab' && ev) ev.preventDefault();
      if (term !== 'Enter' && cfg.autoEnter) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    } else if (S.user && !overlay) {
      // ไม่มีหน้าที่รับ → เปิดดูราคาสินค้า
      const f = window.findByCode && findByCode(code);
      if (f) { beep(); productCard(f.p, f.price); } else { this.err(); toast('ไม่พบสินค้า ' + code, 1); }
    }
    document.dispatchEvent(new CustomEvent('mm:scan', { detail: code }));
  },
  err() {
    if (!this.cfg.sound) return;
    try { const c = beep.c || (beep.c = new (window.AudioContext || window.webkitAudioContext)()); const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 220; g.gain.value = .07; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .25); } catch (e) { }
    try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch (e) { }
  },
  on(view, fn) { this.handlers[view] = fn; },

  /* ---------- Serial (USB-COM / CDC) ---------- */
  port: null, reading: false,
  get serialOK() { return 'serial' in navigator; },
  async serialConnect(silent) {
    if (!this.serialOK) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Web Serial (ใช้ Chrome บนคอมพิวเตอร์) — ให้ตั้งเครื่องยิงเป็นโหมดคีย์บอร์ด (HID) แทน');
    let port = null;
    if (silent) { const ps = await navigator.serial.getPorts(); port = ps[0]; if (!port) return false; }
    else port = await navigator.serial.requestPort();
    await port.open({ baudRate: this.cfg.baud || 9600 });
    this.port = port; this.setCfg({ serial: true }); this.readLoop();
    port.addEventListener && port.addEventListener('disconnect', () => { this.port = null; document.dispatchEvent(new Event('mm:scanner')); });
    document.dispatchEvent(new Event('mm:scanner'));
    return true;
  },
  async serialDisconnect() { this.setCfg({ serial: false }); try { this.reader && await this.reader.cancel(); await this.port.close(); } catch (e) { } this.port = null; document.dispatchEvent(new Event('mm:scanner')); },
  async readLoop() {
    if (this.reading || !this.port) return; this.reading = true;
    const dec = new TextDecoder(); let buf = '';
    try {
      while (this.port && this.port.readable) {
        this.reader = this.port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            let m; while ((m = buf.match(/[\r\n]+/))) { const line = buf.slice(0, m.index); buf = buf.slice(m.index + m[0].length); const code = this.clean(line); if (code) { this.history.unshift({ code, len: code.length, ms: 0, avg: 0, term: 'CR/LF', thai: false, src: 'Serial', at: new Date() }); this.dispatch(code, null, 'Enter', null); } }
            clearTimeout(this.st); this.st = setTimeout(() => { const code = this.clean(buf); buf = ''; if (code.length >= this.cfg.minLen) this.dispatch(code, null, 'idle', null); }, 120);
          }
        } finally { try { this.reader.releaseLock(); } catch (e) { } }
      }
    } catch (e) { }
    this.reading = false;
  },
  start() {
    if (this.started) return; this.started = true;
    window.addEventListener('keydown', e => this.onKey(e), true);
    if (this.cfg.serial && this.serialOK) this.serialConnect(true).catch(() => { });
  }
};
window.Scanner = Scanner;
Scanner.start();

/* ---------- หน้าตั้งค่า + ทดสอบเครื่องยิงบาร์โค้ด ---------- */
VIEWS.scannerset = el => {
  const c = Scanner.cfg;
  el.innerHTML = vhead('เครื่องยิงบาร์โค้ด', '', 'more') + `
   <div class="card center" id="pad" style="border:2px dashed var(--line);background:#FFFDF7">
     ${I(IC.scan, 40)}<div class="disp" style="font-size:19px;margin-top:6px">ยิงบาร์โค้ดทดสอบได้เลย</div>
     <div class="small muted">ไม่ต้องคลิกช่องใด · ใช้ได้ทั้งสาย USB และ Bluetooth</div>
     <div id="last" style="margin-top:12px"></div></div>
   <div class="card"><h3>ผลการทดสอบล่าสุด</h3><div id="hist" class="scroll-x"></div><div id="tips"></div></div>
   <div class="card"><h3>วิธีเชื่อมต่อ</h3>
     <div class="kv"><span><b>สาย USB</b> (Type-C / Type-A / ผ่านหัวแปลง OTG)</span><span class="small muted right">เสียบแล้วใช้ได้เลย ไม่ต้องลงโปรแกรม</span></div>
     <div class="kv"><span><b>Bluetooth</b></span><span class="small muted right">จับคู่ในหน้าตั้งค่า Bluetooth ของมือถือ/แท็บเล็ต/คอม ก่อน (ไม่ใช่ในแอปนี้) แล้วใช้ได้เลย</span></div>
     <div class="kv"><span><b>ตัวรับสัญญาณไร้สาย (2.4G dongle)</b></span><span class="small muted right">เสียบตัวรับที่ช่อง USB ใช้ได้เหมือนแบบสาย</span></div>
     <div class="kv"><span><b>Serial / USB-COM</b></span><span class="small muted right">เครื่องรุ่นเก่า/อุตสาหกรรม ที่ไม่พิมพ์เป็นคีย์บอร์ด — ใช้ Chrome บนคอมพิวเตอร์ แล้วกดเชื่อมต่อด้านล่าง</span></div>
     <div class="row" style="margin-top:10px"><span class="grow small" id="sst"></span><button class="btn sm" id="scon">${I(IC.wifi, 16)} เชื่อมต่อแบบ Serial</button></div></div>
   <div class="card"><h3>ตั้งค่า (เฉพาะเครื่องนี้)</h3>
     <label class="f"><span>ช่วงห่างสูงสุดระหว่างตัวอักษร: <b id="gv">${c.maxGap}</b> มิลลิวินาที</span><input type="range" id="gap" min="15" max="150" step="5" value="${c.maxGap}" style="width:100%"><div class="tiny muted">ถ้ายิงแล้วบางครั้งไม่ติด/ได้เลขไม่ครบ ให้เพิ่มค่านี้ (เครื่อง Bluetooth บางรุ่นส่งช้า) · ถ้าพิมพ์มือแล้วระบบเข้าใจผิดว่าเป็นการยิง ให้ลดค่า</div></label>
     <div class="grid2"><label class="f"><span>ความยาวขั้นต่ำของบาร์โค้ด</span><input class="in" type="number" id="min" min="2" max="20" value="${c.minLen}"></label><label class="f"><span>Baud rate (Serial)</span><select class="in" id="baud">${[9600, 19200, 38400, 57600, 115200].map(b => `<option ${b == c.baud ? 'selected' : ''}>${b}</option>`).join('')}</select></label></div>
     <div class="grid2"><label class="f"><span>ตัดตัวนำหน้า (ถ้ามี)</span><input class="in" id="pre" value="${esc(c.prefix)}"></label><label class="f"><span>ตัดตัวต่อท้าย (ถ้ามี)</span><input class="in" id="suf" value="${esc(c.suffix)}"></label></div>
     <label class="row small" style="margin-bottom:6px"><input type="checkbox" id="ae" ${c.autoEnter ? 'checked' : ''}> เครื่องที่ไม่ส่ง Enter ท้าย: ให้ระบบกด Enter ให้อัตโนมัติ</label>
     <label class="row small" style="margin-bottom:6px"><input type="checkbox" id="aim" ${c.stripAim ? 'checked' : ''}> ตัดรหัสระบุชนิดบาร์โค้ด (AIM ID เช่น ]E0) ออก</label>
     <label class="row small"><input type="checkbox" id="snd" ${c.sound ? 'checked' : ''}> เสียงเตือนเมื่อไม่พบสินค้า</label>
     <button class="btn ghost block sm" id="rst" style="margin-top:10px">คืนค่าเริ่มต้น</button></div>`;
  const save = () => { Scanner.setCfg({ maxGap: +$('#gap', el).value, minLen: Math.max(2, +$('#min', el).value || 4), baud: +$('#baud', el).value, prefix: $('#pre', el).value, suffix: $('#suf', el).value, autoEnter: $('#ae', el).checked, stripAim: $('#aim', el).checked, sound: $('#snd', el).checked }); };
  $('#gap', el).oninput = e => { $('#gv', el).textContent = e.target.value; save(); };
  $$('input,select', el).forEach(i => i.addEventListener('change', save));
  $('#rst', el).onclick = () => { LS.set('scannerCfg', { serial: Scanner.cfg.serial }); go('scannerset'); };
  const st = () => { $('#sst', el).innerHTML = Scanner.port ? '<span class="tag green">เชื่อมต่อ Serial แล้ว</span>' : Scanner.serialOK ? '<span class="tag gray">ไม่ได้ใช้ Serial</span>' : '<span class="tag gray">อุปกรณ์นี้ไม่รองรับ Serial (ใช้โหมดคีย์บอร์ด)</span>'; $('#scon', el).textContent = Scanner.port ? 'ตัดการเชื่อมต่อ' : 'เชื่อมต่อแบบ Serial'; $('#scon', el).disabled = !Scanner.serialOK; };
  $('#scon', el).onclick = async () => { try { if (Scanner.port) await Scanner.serialDisconnect(); else await Scanner.serialConnect(); } catch (e) { if (e.name !== 'NotFoundError') toast(e.message, 1); } st(); };
  const h = () => st(); document.addEventListener('mm:scanner', h); S.cleanup = () => document.removeEventListener('mm:scanner', h);
  const drawHist = () => {
    const H = Scanner.history;
    $('#hist', el).innerHTML = H.length ? `<table class="t"><tr><th>บาร์โค้ด</th><th>สินค้า</th><th class="right">ตัว</th><th class="right">เครื่องยิงส่ง</th><th class="right">ระบบแสดง</th><th>จบด้วย</th></tr>${H.slice(0, 12).map(x => { const f = findByCode(x.code); return `<tr><td class="num">${esc(x.code)}${x.thai ? ' <span class="tag amber">แป้นไทย→แก้แล้ว</span>' : ''}</td><td>${f ? esc(f.p.name) : '<span class="muted">ไม่พบ</span>'}</td><td class="right">${x.len}</td><td class="right">${x.src === 'Serial' ? 'Serial' : x.ms + 'ms'}</td><td class="right">${x.ui != null ? x.ui + 'ms' : '—'}</td><td>${x.term === 'idle' ? 'ไม่มี Enter' : x.term}</td></tr>`; }).join('')}</table>` : '<div class="muted small">ยังไม่มีการยิง</div>';
    const last = H[0], tips = [];
    if (last) {
      if (last.thai) tips.push(['amber', 'แป้นพิมพ์ของเครื่องนี้เป็นภาษาไทย — ระบบแปลงเป็นตัวเลขที่ถูกต้องให้แล้ว (ไม่ต้องสลับภาษา)']);
      if (last.term === 'idle') tips.push(['blue', 'เครื่องยิงไม่ส่ง Enter ต่อท้าย — ระบบจบการยิงให้อัตโนมัติแล้ว (ถ้าอยากให้เร็วขึ้นเล็กน้อย ตั้งเครื่องยิงให้ส่ง Enter/CR ตามคู่มือของเครื่อง)']);
      if (last.src === 'HID' && last.ms > 250) tips.push(['amber', `เครื่องยิงใช้เวลาส่งรหัส ${last.ms} ms ต่อครั้ง (ระบบแสดงผลเองใช้ ${last.ui != null ? last.ui : '<30'} ms) — ความช้ามาจากความเร็วส่ง Bluetooth ของเครื่องยิง: สแกนบาร์โค้ดตั้งค่า “Bluetooth HID transmit speed: High/Fast” (หรือ “Keyboard delay: 0 ms”) ในคู่มือเครื่องยิง จะเร็วขึ้นมาก`]);
      if (last.src === 'HID' && last.avg > 30) tips.push(['amber', `เครื่องนี้ส่งตัวอักษรช้า (เฉลี่ย ${last.avg} ms/ตัว) — ถ้ายิงแล้วไม่ติดบ่อย ให้เลื่อน “ช่วงห่างสูงสุด” เป็น ${Math.min(150, Math.ceil(last.avg * 2 / 5) * 5)} ms`]);
      if (/^\d{12}$/.test(last.code)) tips.push(['blue', 'ได้รหัส 12 หลัก (UPC-A) — ระบบค้นหาแบบเติม 0 ข้างหน้าให้อัตโนมัติ']);
      if (!tips.length) tips.push(['green', 'เครื่องยิงทำงานปกติ ✓']);
    }
    $('#tips', el).innerHTML = tips.map(([c2, t]) => `<div class="alert ${c2}" style="margin-top:8px">${I(c2 === 'green' ? IC.check : IC.alert, 18)}<div class="small">${t}</div></div>`).join('');
  };
  Scanner.on('scannerset', code => {
    const f = findByCode(code);
    if (f) beep(); else Scanner.err();
    $('#last', el).innerHTML = `<div class="disp num" style="font-size:26px;letter-spacing:1px">${esc(code)}</div>${f ? `<div class="tag green" style="margin-top:4px">${esc(f.p.name)} · ${baht(f.price != null ? f.price : f.p.price)}</div>` : '<div class="tag gray" style="margin-top:4px">ไม่พบในรายการสินค้า</div>'}`;
    $('#pad', el).style.borderColor = f ? 'var(--green)' : 'var(--amber)';
    drawHist();
  });
  st(); drawHist();
  if (!S.products.length) loadProducts(true).catch(() => { }); else buildIndex();
};

/* =========================================================
   อ่านบาร์โค้ดจาก "รูปถ่าย"
   1) BarcodeDetector ในเครื่อง (Android Chrome ฯลฯ)
   2) ตัวอ่าน EAN-13 / EAN-8 / UPC-A ที่เขียนไว้ในแอป (ทำงานออฟไลน์ ใช้ได้ทุกเครื่องรวม iPhone)
   3) ZXing (โหลดจากอินเทอร์เน็ต) สำหรับ Code128/QR ฯลฯ
   ========================================================= */
const ImgScan = {
  // ความกว้างแต่ละแถบของตัวเลข (ช่องว่าง,แถบ,ช่องว่าง,แถบ) ชุด L และ G ; ชุด R ใช้แบบเดียวกับ L แต่เริ่มด้วยแถบดำ
  L: ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'].map(s => s.split('').map(Number)),
  G: ['1123', '1222', '2212', '1141', '2311', '1321', '4111', '2131', '3121', '2113'].map(s => s.split('').map(Number)),
  PAR: ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'],
  digit(w, sets) {
    const tot = w[0] + w[1] + w[2] + w[3], n = w.map(x => x * 7 / tot);
    let best = null, be = 9;
    sets.forEach(([name, tab]) => tab.forEach((p, d) => { const e = Math.abs(n[0] - p[0]) + Math.abs(n[1] - p[1]) + Math.abs(n[2] - p[2]) + Math.abs(n[3] - p[3]); if (e < be) { be = e; best = { d, set: name }; } }));
    return be < 1.6 ? best : null;
  },
  // runs = ความยาวช่วงสลับ ขาว/ดำ ; dark0 = ช่วงแรกเป็นสีดำหรือไม่
  decodeRuns(runs, dark0) {
    const out = [];
    for (let i = 0; i < runs.length; i++) {
      if (((i % 2 === 0) === dark0) === false) continue;        // ต้องเริ่มที่แถบดำ
      const q = i > 0 ? runs[i - 1] : 0;
      for (const [len, mods, nd] of [[59, 95, 13], [43, 67, 8]]) {
        if (i + len > runs.length) continue;
        const seg = runs.slice(i, i + len), W = seg.reduce((a, b) => a + b, 0), m = W / mods;
        if (q < m * 3 && i > 0) continue;                        // ต้องมีขอบขาวด้านหน้า
        const g = (k) => Math.abs(seg[k] / m - 1) < .7;
        if (!(g(0) && g(1) && g(2))) continue;
        const half = nd === 13 ? 6 : 4, mid = 3 + half * 4;
        if (![0, 1, 2, 3, 4].every(k => g(mid + k))) continue;
        const digs = [], par = [];
        let ok = true;
        for (let k = 0; k < half && ok; k++) { const r = this.digit(seg.slice(3 + k * 4, 7 + k * 4), nd === 13 ? [['L', this.L], ['G', this.G]] : [['L', this.L]]); if (!r) ok = false; else { digs.push(r.d); par.push(r.set); } }
        for (let k = 0; k < half && ok; k++) { const r = this.digit(seg.slice(mid + 5 + k * 4, mid + 9 + k * 4), [['R', this.L]]); if (!r) ok = false; else digs.push(r.d); }
        if (!ok) continue;
        let code;
        if (nd === 13) { const f = this.PAR.indexOf(par.join('')); if (f < 0) continue; code = f + digs.join(''); }
        else code = digs.join('');
        if (EAN.valid(code)) out.push(code);
      }
    }
    return out;
  },
  scanLine(px, w, y, data) {
    const row = new Float32Array(w);
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; row[x] = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114; }
    // เบลอเล็กน้อยลดสัญญาณรบกวน
    const s = new Float32Array(w); for (let x = 1; x < w - 1; x++) s[x] = (row[x - 1] + 2 * row[x] + row[x + 1]) / 4; s[0] = row[0]; s[w - 1] = row[w - 1];
    const res = [];
    // เกณฑ์ขาว/ดำ 2 แบบ: ทั้งแถว และแบบเฉลี่ยรอบข้าง (กันเงา/แสงไม่เท่ากัน)
    let mn = 255, mx = 0; for (let x = 0; x < w; x++) { if (s[x] < mn) mn = s[x]; if (s[x] > mx) mx = s[x]; }
    if (mx - mn < 40) return res;
    const win = Math.max(15, w >> 4), pre = new Float64Array(w + 1); for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + s[x];
    const thrs = [x => (mn + mx) / 2, x => { const a = Math.max(0, x - win), b = Math.min(w, x + win); return (pre[b] - pre[a]) / (b - a); }];
    for (const T of thrs) {
      const runs = []; let dark = s[0] < T(0), dark0 = dark, len = 0;
      for (let x = 0; x < w; x++) { const d = s[x] < T(x); if (d === dark) len++; else { runs.push(len); len = 1; dark = d; } }
      runs.push(len);
      res.push(...this.decodeRuns(runs, dark0));
      const rv = runs.slice().reverse(); res.push(...this.decodeRuns(rv, runs.length % 2 ? dark0 : !dark0));
    }
    return res;
  },
  canvasFrom(img, maxW, rot) {
    const sc = Math.min(1, maxW / Math.max(img.width, img.height));
    const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
    const c = document.createElement('canvas'); c.width = rot ? h : w; c.height = rot ? w : h;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (rot) { x.translate(h, 0); x.rotate(Math.PI / 2); }
    x.drawImage(img, 0, 0, w, h); return c;
  },
  decodeCanvas(c) {
    const w = c.width, h = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const votes = {};
    for (let k = 1; k < 60; k++) { const y = Math.round(h * k / 60); this.scanLine(null, w, y, d).forEach(code => votes[code] = (votes[code] || 0) + 1); }
    const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  },
  async decodeFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImg(url);
      // 1) ตัวอ่านในเครื่อง
      if ('BarcodeDetector' in window) {
        try { const det = new BarcodeDetector(); const r = await det.detect(img); if (r.length) { const pick = r.find(x => /ean|upc/.test(x.format)) || r[0]; return { code: pick.rawValue, via: 'เครื่อง' }; } } catch (e) { }
      }
      // 2) ตัวอ่าน EAN ในแอป: ลองหลายขนาด และหมุน 90°
      for (const [mw, rot] of [[1200, 0], [800, 0], [1200, 1], [1800, 0], [800, 1]]) {
        const code = this.decodeCanvas(this.canvasFrom(img, mw, rot));
        if (code) return { code, via: 'แอป' };
      }
      // 3) ZXing (ต้องต่ออินเทอร์เน็ต) สำหรับบาร์โค้ดชนิดอื่น
      try {
        await loadScript('https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js', 'ZXing');
        const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        const r = await new ZXing.BrowserMultiFormatReader(hints).decodeFromImageUrl(this.canvasFrom(img, 1600, 0).toDataURL('image/jpeg', .92));
        if (r) return { code: r.getText(), via: 'ZXing' };
      } catch (e) { }
      return null;
    } finally { URL.revokeObjectURL(url); }
  }
};
window.ImgScan = ImgScan;

/* ช่องบาร์โค้ด + ไอคอนกล้องท้ายช่อง (ใช้ซ้ำได้ทุกฟอร์ม) */
function barcodeFieldHTML(id, value) {
  return `<div style="position:relative;flex:1;min-width:0"><input class="in" id="${id}" inputmode="numeric" autocomplete="off" data-scan-field value="${esc(value || '')}" style="padding-right:48px;width:100%">
    <label class="camin" title="ถ่ายรูปบาร์โค้ด" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);width:38px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--red);cursor:pointer;background:var(--red-l)">${I(IC.cam, 19)}<input type="file" accept="image/*" capture="environment" class="hidden" data-for="${id}"></label></div>`;
}
function bindBarcodeField(root, id, onFill) {
  const inp = $('#' + id, root), fi = $(`input[data-for="${id}"]`, root);
  if (!fi) return;
  fi.onchange = async () => {
    const f = fi.files[0]; fi.value = ''; if (!f) return;
    const cam = fi.parentElement, old = cam.innerHTML.split('<input')[0];
    cam.firstChild && (cam.querySelector('svg').style.display = 'none'); cam.insertAdjacentHTML('afterbegin', '<span class="spin dark" style="width:18px;height:18px;border-width:2px"></span>');
    try {
      const r = await ImgScan.decodeFile(f);
      if (r) { inp.value = r.code; inp.dispatchEvent(new Event('input', { bubbles: true })); beep(); toast('อ่านบาร์โค้ดได้: ' + r.code); onFill && onFill(r.code); }
      else { Scanner.err(); toast('อ่านบาร์โค้ดจากรูปไม่ได้ — ถ่ายใกล้ขึ้น ให้บาร์โค้ดตรงและเต็มกรอบ ไม่สะท้อนแสง', 1); }
    } catch (e) { toast('อ่านรูปไม่ได้: ' + e.message, 1); }
    const sp = cam.querySelector('.spin'); sp && sp.remove(); const sv = cam.querySelector('svg'); sv && (sv.style.display = '');
  };
}
