/* =========================================================
   จอแสดงผลฝั่งลูกค้า (v2.6)
   - เครื่องเดียวกัน: BroadcastChannel (ทันที)
   - อีกเครื่อง: เชื่อมตรงแบบ WebRTC (ทันที ~ไม่กี่สิบมิลลิวินาที) ใช้เซิร์ฟเวอร์แค่ตอนจับคู่
     ถ้าเชื่อมตรงไม่ได้ จะสำรองส่งผ่านเซิร์ฟเวอร์ Google อัตโนมัติ
   - ออกแบบให้อ่านง่ายบนจอเล็ก 5.5" : ตัวอักษรปรับขนาดให้เต็มจอเอง รายการล่างสุดไม่ล้นจอ
   ========================================================= */
'use strict';
const RTC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const sig = (code, kind, data) => fetch(S.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: data === undefined ? 'sigGet' : 'sigPut', payload: { code, kind, data } }) }).then(r => r.json()).then(r => { if (!r.ok) throw new Error(r.error || 'sig'); return r.data; });
const iceDone = pc => new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 2500); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });

/* ---------- รูปแบบตัวเลข + ธนาคาร/เครือข่าย (ใช้ทั้งเครื่องขายและจอลูกค้า) ----------
   ไม่ใช้โลโก้ของธนาคาร/ค่ายมือถือ (เป็นเครื่องหมายการค้า) — แสดงเป็นป้ายสีประจำ + ชื่อย่อ
   เจ้าของร้านอัปโหลดรูปโลโก้ของตัวเองได้ที่ ค่าบริการหน้าร้าน › โลโก้ธนาคาร/เครือข่าย */
const BANKS = [
  ['KBANK', 'กสิกรไทย', '#138f2d'], ['SCB', 'ไทยพาณิชย์', '#4e2e7f'], ['KTB', 'กรุงไทย', '#1ba5e1'], ['BBL', 'กรุงเทพ', '#1e4598'],
  ['BAY', 'กรุงศรี', '#e3a800'], ['TTB', 'ทหารไทยธนชาต', '#0050f0'], ['GSB', 'ออมสิน', '#eb198d'], ['BAAC', 'ธ.ก.ส.', '#4b9b3e'],
  ['GHB', 'อาคารสงเคราะห์', '#f57d23'], ['UOB', 'ยูโอบี', '#0b3979'], ['CIMB', 'ซีไอเอ็มบี', '#7e2f36'], ['KKP', 'เกียรตินาคินภัทร', '#635f98'],
  ['LHB', 'แลนด์ แอนด์ เฮ้าส์', '#6d6e71'], ['TISCO', 'ทิสโก้', '#12549f'], ['IBANK', 'อิสลาม', '#184615'], ['PP', 'พร้อมเพย์', '#1b3a6b'], ['TMN', 'ทรูมันนี่', '#ff8200']
].map(([code, name, color]) => ({ code, name, color }));
const CARRIERS = [['AIS', 'AIS', '#7cbd1e'], ['TRUE', 'True', '#e3001b'], ['DTAC', 'dtac', '#1d9ad6'], ['NT', 'NT (my)', '#f5a800'], ['TMN', 'TrueMoney Wallet', '#ff8200']].map(([code, name, color]) => ({ code, name, color }));
const fmtNum = (v, kind) => { v = String(v || '').replace(/\D/g, '');
  if (kind === 'phone') return v.replace(/^(\d{3})(\d{0,3})(\d{0,4}).*/, (m, a, b, c) => [a, b, c].filter(Boolean).join('-')) || v;
  if (kind === 'account' && v.length === 10) return v.replace(/^(\d{3})(\d)(\d{5})(\d)$/, '$1-$2-$3-$4');
  return v.replace(/(\d{4})(?=\d)/g, '$1 '); };
const askValid = (a, v, pick) => { v = String(v || ''); if (a.pick && !pick) return false;
  if (a.field === 'phone') return /^0\d{9}$/.test(v); if (a.field === 'account') return v.length >= (a.min || 10) && v.length <= (a.max || 15);
  return v.length >= (a.min || 1) && v.length <= (a.max || 20); };
// ป้ายธนาคาร/เครือข่าย: รูปที่เจ้าของอัปโหลด (ถ้ามี) หรือป้ายสี + ชื่อย่อ
const pickTile = (x, on, big) => `<span class="ptile${on ? ' on' : ''}" style="--pc:${x.color}">${x.logo ? `<img src="${x.logo}" alt="">` : `<b>${esc(x.code === 'TMN' ? 'TrueMoney' : x.code === 'PP' ? 'PromptPay' : x.code)}</b>`}<i>${esc(x.name)}</i></span>`;
const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del'];
const padHTML = cls => `<div class="${cls || 'npad'}">${PAD_KEYS.map(k => `<button type="button" data-pk="${k}">${k === 'del' ? '⌫' : k === 'clr' ? 'ล้าง' : k}</button>`).join('')}</div>`;
const PICK_CSS = `.ptile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-radius:12px;background:var(--pc);color:#fff;padding:6px 4px;min-height:58px;box-shadow:0 0 0 0 transparent;transition:transform .08s;text-align:center;line-height:1.1;width:100%;box-sizing:border-box;border:3px solid transparent}
  .ptile b{font-size:15px;font-weight:800;letter-spacing:.2px}.ptile i{font-style:normal;font-size:11px;opacity:.95}.ptile img{max-width:80%;max-height:36px;object-fit:contain;background:#fff;border-radius:6px;padding:2px}
  .ptile.on{border-color:#111;box-shadow:0 0 0 3px #fff inset;transform:scale(1.04)}
  .npad{--kk:min(92px,12vh,26vw);display:grid;grid-template-columns:repeat(3,var(--kk));gap:10px;justify-content:center}.npad button{aspect-ratio:1/1;min-height:0;border-radius:16px;border:0;background:#eef1f5;font-size:clamp(22px,4vh,30px);font-weight:700;color:#111;cursor:pointer;font-family:inherit;touch-action:manipulation;user-select:none}.npad button:active{transform:scale(.96)}
  .npad.big{grid-template-columns:repeat(3,1fr)}.npad.big button{aspect-ratio:auto}.npad button:active{background:#d7dde6}.npad [data-pk=clr],.npad [data-pk=del]{font-size:18px;background:#f6e7e9;color:#b0001b}`;
if (!document.getElementById('pickcss')) { const st = document.createElement('style'); st.id = 'pickcss'; st.textContent = PICK_CSS; document.head.appendChild(st); }

// เปิด/ปิดให้ลูกค้ากรอกข้อมูลบนจอลูกค้า (จอเสริมที่ไม่ใช่ทัชสกรีน → ปิด: จอลูกค้าแสดงข้อมูลให้ตรวจสอบอย่างเดียว)
const custInputOn = () => (S.settings && S.settings.custInput) !== 'N';
const Display = {
  bc: ('BroadcastChannel' in window) ? new BroadcastChannel('mm-display') : null,
  last: null, t: null, dc: null, pc: null, offerId: '', sigT: null,
  // โลโก้/โฆษณา (ข้อมูลใหญ่) แยกจากรายการขาย — ส่งเฉพาะเมื่อเปลี่ยน ทุกการสแกนส่งแค่รายการ (เล็กมาก → เร็ว)
  assets() {
    const st = S.settings || {}, sm = v => { v = String(v || ''); return v.length + ':' + v.slice(0, 48) + v.slice(-48); }, sig = [st.shopName, sm(st.displayCfg), sm(st.adsCfg), sm(st.brandLogo), Brand.custom() ? 1 : 0].join('|');
    if (this.A && this.A.sig === sig) return this.A;
    const dc = cfg('displayCfg', { welcome: 'ยินดีต้อนรับ', promo: '' });
    let h = 0; for (let i = 0; i < sig.length; i++) h = (Math.imul(h, 31) + sig.charCodeAt(i)) | 0;
    return this.A = { sig, k: 'a' + (h >>> 0).toString(36) + sig.length.toString(36), v: { shop: st.shopName || 'ร้านเมย์ มินิมาร์ท', welcome: dc.welcome, promo: dc.promo, logoMode: dc.logoMode || 'mark', logo: dc.logoMode === 'image' ? dc.logo || '' : '', brandW: Brand.custom() ? Brand.white() : '', brandC: st.brandLogo || '', ads: adsCfg(), idle: idleCfg(dc) } };
  },
  dev: (() => { let d = ''; try { d = localStorage.getItem('mm_dispSrc') || ''; if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem('mm_dispSrc', d); } } catch (e) { } return d; })(),
  seq: 0,
  push(state) {
    if (!feat('display')) return;
    const A = this.assets();
    this.seq = Math.max(this.seq + 1, Date.now());
    const { shop, welcome, promo, logoMode, logo, brandW, brandC, ads, idle, ...dyn } = state || {};   // repush ส่งของเดิมกลับมา → ตัดส่วนใหญ่ออกก่อน
    const s = { ...dyn, ak: A.k, src: this.dev, seq: this.seq, cashier: (S.user && S.user.name) || '', ver: APP_VER, at: Date.now(), ask: this.askSt || null, pv: this.askSt ? null : (this.pvSt || null) };
    const full = { ...s, ...A.v };
    this.last = full;
    // เครื่องเดียวกัน: ส่งแค่รายการ (โลโก้เก็บแยกไว้ในเครื่อง เขียนเฉพาะตอนเปลี่ยน)
    if (this.lsAK !== A.k) { try { localStorage.setItem('mm_dispAssets', JSON.stringify({ k: A.k, v: A.v })); this.lsAK = A.k; } catch (e) { } }
    try { this.bc && this.bc.postMessage(s); } catch (e) { }
    try { localStorage.setItem('mm_dispState', JSON.stringify(s)); } catch (e) { }
    // เชื่อมตรง: ส่งโลโก้ครั้งแรก/เมื่อเปลี่ยน ที่เหลือส่งแค่รายการ
    const direct = this.dcAK === A.k ? this.send(s) : (this.send(full) && (this.dcAK = A.k, true));
    const code = LS.get('dispCode', '');
    // สำรองผ่าน Google: ส่งโลโก้เฉพาะเมื่อเปลี่ยน หรือทุก 60 วิ (ให้จอที่เพิ่งเปิดได้โลโก้ด้วย)
    if (code && S.apiUrl) {
      clearTimeout(this.t);
      this.t = setTimeout(() => { const f = this.rAK !== A.k || Date.now() - (this.rAt || 0) > 60000; apiQuiet('displayPush', { code, state: f ? this.last : { ...this.last, shop: undefined, welcome: undefined, promo: undefined, logoMode: undefined, logo: undefined, brandW: undefined, brandC: undefined, ads: undefined, idle: undefined } }).then(() => { if (f) { this.rAK = A.k; this.rAt = Date.now(); } }).catch(() => { }); }, s.mode === 'cart' ? 150 : 0);
    }
  },
  // ---- ให้ลูกค้ากรอกที่จอลูกค้า ----
  // spec: { title, sub, field: 'phone'|'account'|'digits', min, max, pick: 'bank'|'carrier', picks: [...], value, pickValue }
  // onPartial(r) ระหว่างลูกค้ากด · คืนค่า { value, pick } เมื่อลูกค้ากดยืนยัน หรือ null เมื่อยกเลิก/หมดเวลา
  askSt: null, askCb: null,
  ask(spec, onPartial) {
    this.cancelAsk();
    const id = Math.random().toString(36).slice(2, 10);
    this.askSt = { id, ...spec };
    return new Promise(res => {
      this.askCb = { id, res, onPartial };
      this.askTO = setTimeout(() => this.cancelAsk(), (spec.timeout || 120) * 1000);
      this.repush(); this.pollReply(id);
    });
  },
  // แสดงข้อมูลที่พนักงานกำลังกรอก (เลขบัญชี ธนาคาร เครือข่าย เบอร์ ยอด) ให้ลูกค้าตรวจสอบบนจอลูกค้า
  pvSt: null,
  preview(pv) { const k = JSON.stringify(pv || null); if (k === this.pvKey) return; this.pvKey = k; this.pvSt = pv || null; this.repush(); },
  repush() { this.push(this.last ? { ...this.last } : { mode: 'idle' }); },
  cancelAsk() { if (!this.askSt) return; const cb = this.askCb; this.askSt = null; this.askCb = null; clearTimeout(this.askTO); clearTimeout(this.askPT); this.repush(); cb && cb.res(null); },
  reply(r) {
    const cb = this.askCb; if (!cb || !r || r.id !== cb.id) return;
    if (r.partial) { try { cb.onPartial && cb.onPartial(r); } catch (e) { } return; }
    this.askSt = null; this.askCb = null; clearTimeout(this.askTO); clearTimeout(this.askPT); this.repush(); cb.res(r);
  },
  // จออีกเครื่องที่ไม่ได้เชื่อมตรง: รับคำตอบผ่านเซิร์ฟเวอร์ (ทุก 1 วินาทีระหว่างรอ)
  pollReply(id) {
    const code = LS.get('dispCode', ''); if (!code || !S.apiUrl) return;
    const tick = async () => { if (!this.askCb || this.askCb.id !== id) return; try { const r = await sig(code, 'reply'); if (r && r.id === id) return this.reply(r); } catch (e) { } this.askPT = setTimeout(tick, 1000); };
    this.askPT = setTimeout(tick, 1200);
  },
  // ช่องตรงที่เงียบเกิน 12 วิ (จอลูกค้าปิด/หลับ) = ถือว่าขาด → ส่งผ่าน Google ทันที และรับคำขอเชื่อมใหม่ได้เลย
  alive() { if (this.dc && this.dc.readyState === 'open' && this.rxAt && Date.now() - this.rxAt > 12000) { try { this.dc.close(); } catch (e) { } this.dc = null; } return !!(this.dc && this.dc.readyState === 'open'); },
  send(state) { this.alive(); try { if (this.dc && this.dc.readyState === 'open') { this.dc.send(JSON.stringify(state)); return true; } } catch (e) { } return false; },
  // ฝั่ง POS: คอยรับคำขอเชื่อมตรงจากจอลูกค้า แล้วตอบกลับ
  listen() {
    clearTimeout(this.sigT);
    const code = LS.get('dispCode', '');
    if (!code || !S.apiUrl || !('RTCPeerConnection' in window) || !S.user || !feat('display')) return;
    const tick = async () => {
      const open = this.alive();
      try {
        const off = await sig(code, 'offer');
        // จอลูกค้าขอเชื่อมใหม่ (เช่น เพิ่งรีเฟรช) → ตอบรับทันทีแม้ช่องเดิมยังดูเหมือนเปิดอยู่
        if (off && off.id && off.id !== this.offerId && Date.now() - off.t < 120000) {
          this.offerId = off.id;
          try { this.pc && this.pc.close(); } catch (e) { }
          const pc = this.pc = new RTCPeerConnection(RTC_CFG);
          pc.ondatachannel = ev => {
            const ch = ev.channel; this.dc = ch;
            ch.onopen = () => { this.rxAt = Date.now(); this.dcAK = ''; this.last && this.send(this.last) && (this.dcAK = this.last.ak); };
            ch.onmessage = m => { this.rxAt = Date.now(); if (m.data === 'ping') { try { ch.send('pong'); } catch (e) { } return; } if (m.data === 'need') { this.last && this.send(this.last) && (this.dcAK = this.last.ak); return; } if (m.data === 'hello') { this.last && this.send(this.last); return; } try { const o = JSON.parse(m.data); if (o && o.reply) this.reply(o.reply); } catch (e) { } };
            ch.onclose = () => { if (this.dc === ch) this.dc = null; };
          };
          await pc.setRemoteDescription(off.sdp);
          await pc.setLocalDescription(await pc.createAnswer());
          await iceDone(pc);
          await sig(code, 'answer', { id: off.id, sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: 'answer', sdp: pc.localDescription.sdp } });
        }
      } catch (e) { }
      this.sigT = setTimeout(tick, document.hidden ? 12000 : open ? 6000 : 4000);
    };
    tick();
  }
};
window.Display = Display;
if (Display.bc) Display.bc.onmessage = e => { if (e.data && e.data.reply) return Display.reply(e.data.reply); if (e.data && e.data.hello && Display.last && S.view === 'pos') Display.bc.postMessage(Display.last); };
addEventListener('storage', e => { if (e.key === 'mm_dispReply' && e.newValue && Display.askCb) { try { Display.reply(JSON.parse(e.newValue)); } catch (x) { } } });
document.addEventListener('mm:booted', () => Display.listen());

/* ===== โฆษณาฝั่งขวาของจอลูกค้า =====
   ไฟล์อยู่ใน Google Drive (โฟลเดอร์ "โฆษณาจอลูกค้า") — ชีตเก็บแค่รายการชื่อไฟล์ ไม่หนักฐานข้อมูล
   จอลูกค้าโหลดแต่ละไฟล์ครั้งเดียวแล้วเก็บไว้ในเครื่อง (IndexedDB) เปิดครั้งต่อไปเล่นได้ทันทีแม้เน็ตช้า */
const ADS_DEF = { on: false, idle: true, fit: 'contain', items: [] };
const adsCfg = () => { const c = cfg('displayAds', ADS_DEF); return { on: !!c.on, idle: c.idle !== false, fit: c.fit === 'cover' ? 'cover' : 'contain', items: (c.items || []).filter(x => x && x.id).map(x => ({ id: x.id, t: x.t === 'v' ? 'v' : 'i', s: Math.max(3, Math.min(60, +x.s || 8)) })) }; };
const AdFiles = {
  urls: {}, wait: {},
  async url(id) {
    if (this.urls[id]) return this.urls[id];
    if (this.wait[id]) return this.wait[id];
    return this.wait[id] = (async () => {
      const ce = await Cache.get('ad_' + id); let du = ce && ce.v;
      if (!du) {
        if (!S.apiUrl) throw new Error('no file');
        const r = await fetch(S.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'adGet', payload: { id } }) }).then(x => x.json());
        if (!r.ok) throw new Error(r.error || 'load');
        du = 'data:' + r.mime + ';base64,' + r.base64; await Cache.set('ad_' + id, du);
      }
      delete Cache.mem['ad_' + id]; // ไม่ค้างไฟล์ใหญ่ไว้ในหน่วยความจำ 2 ชุด
      const blob = await (await fetch(du)).blob();
      return this.urls[id] = URL.createObjectURL(blob);
    })().finally(() => delete this.wait[id]);
  },
  async put(id, dataUrl) { await Cache.set('ad_' + id, dataUrl); delete Cache.mem['ad_' + id]; },
  drop(id) { Cache.del('ad_' + id); if (this.urls[id]) { URL.revokeObjectURL(this.urls[id]); delete this.urls[id]; } }
};
// เล่นวนทีละรายการ: รูปค้างตามวินาทีที่ตั้ง · วิดีโอเล่นจนจบ (ปิดเสียง) · ไฟล์ไหนโหลดไม่ได้ข้ามไป
const AdPlayer = {
  el: null, key: '', list: [], i: -1, t: null, fails: 0, fit: 'contain',
  set(ads) {
    if (!this.el) { this.el = document.createElement('div'); this.el.className = 'adv'; }
    const list = ads && ads.on ? ads.items : [], key = JSON.stringify([list, ads && ads.fit]);
    this.fit = (ads && ads.fit) || 'contain'; this.el.dataset.fit = this.fit;
    if (key === this.key) return list.length > 0;
    this.key = key; this.list = list; this.i = -1; this.fails = 0; clearTimeout(this.t);
    list.forEach(x => AdFiles.url(x.id).catch(() => { })); // โหลดล่วงหน้าทั้งหมด
    if (list.length) this.next(); else this.el.innerHTML = '';
    return list.length > 0;
  },
  async next() {
    clearTimeout(this.t); if (!this.list.length) return;
    if (this.fails >= this.list.length) { this.fails = 0; this.t = setTimeout(() => this.next(), 15000); return; }
    this.i = (this.i + 1) % this.list.length; const it = this.list[this.i], key = this.key;
    let u; try { u = await AdFiles.url(it.id); } catch (e) { this.fails++; return key === this.key && this.next(); }
    if (key !== this.key) return; this.fails = 0;
    if (it.t === 'v') {
      const v = document.createElement('video'); v.src = u; v.muted = true; v.playsInline = true; v.autoplay = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      if (this.list.length === 1) v.loop = true; else v.onended = () => this.next();
      v.onerror = () => { this.fails++; this.next(); };
      this.el.replaceChildren(v); v.play().catch(() => { });
      this.t = setTimeout(() => this.next(), 5 * 60000); // กันวิดีโอค้าง
    } else {
      const im = new Image(); im.src = u; im.alt = ''; this.el.replaceChildren(im);
      if (this.list.length > 1) this.t = setTimeout(() => this.next(), it.s * 1000);
    }
  },
  mount(slot) { if (!slot || !this.el) return; slot.appendChild(this.el); const v = this.el.querySelector('video'); if (v) v.play().catch(() => { }); }
};
const dispLogoHTML = (m, img, shop, brandW, big) => m === 'image' && img ? `<img src="${img}" alt="" style="height:${big ? 'clamp(60px,22vmin,200px)' : 'clamp(26px,7vmin,60px)'};width:auto;max-width:${big ? '92%' : '60vw'};object-fit:contain;display:block">` : m === 'name' ? `<b>${esc(shop || 'ร้านเมย์ มินิมาร์ท')}</b>` : `<img src="${brandW || 'logo-white.png'}" alt="ร้านเมย์ Mini Mart" style="height:${big ? 'clamp(60px,22vmin,200px)' : 'clamp(28px,7.5vmin,64px)'};width:auto;max-width:${big ? '92%' : '60vw'};object-fit:contain;display:block">`;
const bkk = () => new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
const LB = v => `<span class="cu">฿</span>${money(v, num(v) % 1 ? 2 : 0)}`;

VIEWS.display = (root, hash) => {
  document.body.classList.add('full');
  const code = (String(hash || '').split('-')[1] || '').trim();
  // จำรหัสจอนี้ไว้ — ติดตั้งเป็นแอป "จอลูกค้า" แล้วเปิดจากไอคอน จะเข้าหน้านี้เต็มจอทันที
  try { if (code) localStorage.setItem('mm_dispOwnCode', code); } catch (e) { }
  try { const lk = document.querySelector('link[rel=manifest]'); if (lk && !/display\.webmanifest/.test(lk.href)) lk.href = 'display.webmanifest?v=1'; } catch (e) { }
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => { }); } catch (e) { }
  root.innerHTML = `<style>
   .dsp{position:fixed;inset:0;background:#fff;display:flex;flex-direction:column;font-family:var(--fh);color:#111;overflow:hidden}
   .dsp .cu{opacity:.38;font-weight:400;margin-right:.08em}
   .dsp .hd{display:flex;align-items:center;gap:8px;padding:max(8px,1.4vmin) max(28px,5vmin) max(8px,1.4vmin) max(32px,6vmin);background:var(--red);color:#fff;font-size:clamp(14px,3.2vmin,26px);flex:none}
   .dsp .hd .sh{flex:1;min-width:0;display:flex;align-items:center;white-space:nowrap;overflow:hidden}
   .dsp .hd .sh img{height:clamp(26px,7vmin,60px);width:auto;max-width:60vw;object-fit:contain;display:block}
   .dsp .lgo{font-family:var(--flogo);font-style:italic;display:inline-flex;align-items:baseline;gap:.25em;line-height:1}
   .dsp .lgo small{font-size:.55em;font-weight:700;font-style:normal}
   .dsp .lgo b{font-size:1.45em;font-weight:800;letter-spacing:-1px}
   .dsp .lgo i{font-size:.7em;font-weight:600}
   .dsp .hd .ck{font-weight:800;font-variant-numeric:tabular-nums;font-size:clamp(20px,6vmin,48px);line-height:1}
   .dsp [hidden]{display:none!important}
   .dsp .bd{flex:1;display:flex;min-height:0}
   .dsp .lst{flex:2;min-width:0;min-height:0;padding:1.5vmin 3vmin;display:flex;flex-direction:column;justify-content:flex-start}
   .dsp .rp{flex:1;min-width:0;background:var(--red);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1.2vmin;padding:2vmin}
   .dsp .rp .rl{font-size:clamp(16px,4.6vmin,40px);font-weight:600}
   .dsp .rp .rv{font-size:clamp(34px,15vmin,150px);font-weight:800;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums}
   .dsp .rp .cu{opacity:.55}
   .dsp .rp .rx{font-size:clamp(14px,3.8vmin,30px)}
   .dsp .rp .co{font-size:clamp(14px,4vmin,32px)}
   .dsp .rp .qrl{font-size:clamp(13px,3.4vmin,26px);opacity:.95}
   .dsp .rp.hasqr .rv{font-size:clamp(28px,10vmin,110px)}
   .dsp .gr{flex:none;display:grid;grid-template-columns:minmax(0,1fr) max-content;column-gap:0;row-gap:0;padding-left:3.5ch;align-items:baseline;justify-content:stretch;line-height:1.22;font-weight:600;--rp:0px}
   .dsp .gr.m{grid-template-columns:max-content max-content}
   .dsp .gr.wr{align-items:stretch}
   .dsp .gr.wr>.n>b{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}
   .dsp .gr>.n{display:flex;align-items:baseline;gap:.45ch;min-width:0;padding:calc(.06em + var(--rp)) 2.5ch calc(.06em + var(--rp)) 0;border-bottom:1px solid #00000012}
   .dsp .gr>.n>s{text-decoration:none;color:#bbb;font-weight:400;flex:none;margin-right:.15ch}
   .dsp .gr>.n>b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
   .dsp .gr>.n>i{font-style:normal;color:#777;font-weight:400;font-size:.8em;white-space:nowrap;flex:none}
   .dsp .gr>.a{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding:calc(.06em + var(--rp)) 0;border-bottom:1px solid #00000012}
   .dsp .gr>.more{grid-column:1/-1;color:#888;font-size:.72em;font-weight:400;border-bottom:1px dashed #ddd;padding-bottom:.15em;margin-bottom:.1em}
   .dsp .gr>.ln{grid-column:1/-1;height:1px;background:#eee}
   .dsp .gt{flex:none;margin-top:auto;display:flex;align-items:baseline;justify-content:space-between;gap:2ch;border-top:3px solid #222;padding:.08em 0 0 2.5ch;margin-left:0;font-weight:800;line-height:1.2;color:#111}
   .dsp .gt b{font-weight:800}.dsp .gt i{font-style:normal;font-size:.5em;color:#666;font-weight:500;margin-left:.4ch}
   .dsp .gt .a{font-variant-numeric:tabular-nums;white-space:nowrap}
   .dsp .tot{flex:none;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:1.2vmin 3vmin}
   .dsp .tot .l{font-size:clamp(16px,4.2vmin,34px);line-height:1.15}
   .dsp .tot .v{font-size:clamp(34px,12vmin,120px);font-weight:800;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}
   .dsp .tot .cu{opacity:.55}
   .dsp .ft{flex:none;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px max(28px,5vmin) 4px max(32px,6vmin);font-size:clamp(12px,2.8vmin,22px);color:#666;background:#fafafa;border-top:1px solid #eee}
   .dsp .ft .cs{font-weight:800;color:#222;white-space:nowrap;font-size:clamp(15px,4vmin,30px)}
   .dsp .side{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FFF3F4;padding:2vmin 3vmin;text-align:center;gap:1vmin}
   .dsp .qr{background:#fff;padding:1.5vmin;border-radius:2vmin;box-shadow:0 2px 10px #0001}
   .dsp .qr img{display:block;image-rendering:pixelated;width:min(42vh,26vw);height:auto}
   .dsp .cen{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1.5vmin;padding:3vmin}
   .dsp .mk{font-family:var(--flogo);font-weight:800;font-style:italic;color:var(--red);font-size:clamp(60px,24vmin,220px);line-height:1;letter-spacing:-3px}
   .dsp .huge{font-size:clamp(48px,20vmin,200px);font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
   .dsp .pill{background:#fff;color:var(--red);border-radius:99px;padding:.3em .9em;font-weight:700}
   .dsp .co{background:#FFF7E0;color:#8a5a00;border-radius:1.5vmin;padding:.3em .7em;font-weight:700}
   .dfs{flex:none;border:0;background:#ffffff26;color:#fff;border-radius:10px;width:clamp(34px,7vmin,54px);height:clamp(34px,7vmin,54px);display:flex;align-items:center;justify-content:center;margin-left:4px;cursor:pointer}
   .dfs svg{width:60%;height:60%}
   .dsp .rp:not(.hasqr){justify-content:flex-start;gap:0}
   .dsp .rp .rlg{flex:1 1 0;min-height:0;width:100%;color:#fff;font-size:clamp(22px,6.5vmin,64px);display:flex;align-items:center;justify-content:center}
   .dsp .rp:not(.hasqr)::after{content:'';flex:.35 1 0}
   .dsp .rp .rlg img{max-height:100%!important;max-width:92%!important}
   .dot{display:inline-block;width:.55em;height:.55em;border-radius:50%;background:#bbb;margin-right:.3em;vertical-align:middle}.dot.on{background:#4ade80}
   .dsp .ask{flex:1;min-height:0;display:flex;gap:3vmin;padding:2.5vmin 4vmin 2.5vmin 6vmin;background:#fff}
   .dsp .ask .askq{flex:1.2;min-width:0;display:flex;flex-direction:column;gap:1.6vmin;overflow:auto}
   .dsp .ask .askt{font-size:clamp(20px,5vmin,46px);font-weight:800;line-height:1.2}
   .dsp .ask .asks{font-size:clamp(14px,2.8vmin,24px);color:#555}
   .dsp .ask .askv{font-size:clamp(28px,8vmin,80px);font-weight:800;letter-spacing:1px;border-bottom:4px solid var(--red);padding:.1em 0;font-variant-numeric:tabular-nums;line-height:1.15}
   .dsp .ask .askv.ph{color:#c4c4c4;font-weight:600;font-size:clamp(20px,5vmin,48px)}
   .dsp .ask .askl{font-size:clamp(14px,2.6vmin,22px);font-weight:700;margin-top:.5vmin}
   .dsp .ask .askg{display:grid;grid-template-columns:repeat(auto-fill,minmax(clamp(84px,14vmin,140px),1fr));gap:1.2vmin}
   .dsp .ask .askg button{all:unset;cursor:pointer;display:block}
   .dsp .ask .askg .ptile{min-height:clamp(54px,10vmin,96px)}.dsp .ask .askg .ptile b{font-size:clamp(13px,2.6vmin,22px)}.dsp .ask .askg .ptile i{font-size:clamp(10px,1.8vmin,15px)}
   .dsp .ask .askk{flex:1;min-width:0;display:flex;flex-direction:column;gap:1.4vmin;max-width:62vh}
   .dsp .ask .npad.big{flex:1;gap:1.4vmin;grid-auto-rows:1fr}.dsp .ask .npad.big button{min-height:0;font-size:clamp(24px,6vmin,56px)}
   .dsp .ask .askok{min-height:clamp(52px,11vmin,96px);border:0;border-radius:16px;background:#1f9d4c;color:#fff;font-size:clamp(20px,5vmin,44px);font-weight:800;font-family:inherit;cursor:pointer}
   .dsp .ask .askok:disabled{background:#c9d2cc}
   @media (orientation:portrait){.dsp .ask{flex-direction:column}.dsp .ask .askk{max-width:none;flex:1.3}}
   .dsp .ask .pvr{display:flex;justify-content:space-between;align-items:baseline;gap:2vmin;border-bottom:1px solid #eee;padding:.6vmin 0;font-size:clamp(16px,3.4vmin,30px)}
   .dsp .ask .pvr span{color:#666}.dsp .ask .pvr b{font-weight:800;text-align:right}
   .dsp .ask .pvr b.pvb{font-size:clamp(26px,7vmin,66px);letter-spacing:1px;font-variant-numeric:tabular-nums;color:#111}
   .dsp .ask .pvtile{width:clamp(140px,26vmin,260px)}.dsp .ask .pvtile .ptile{min-height:clamp(70px,13vmin,120px)}.dsp .ask .pvtile .ptile b{font-size:clamp(18px,4vmin,34px)}.dsp .ask .pvtile .ptile i{font-size:clamp(12px,2.4vmin,20px)}
   .dsp .ask .pvsum{justify-content:center;background:#fff5f6;border-radius:2vmin;padding:2vmin 3vmin}.dsp .ask .pvsum .pvr.pvt{border:0;font-size:clamp(22px,5.5vmin,54px)}.dsp .ask .pvsum .pvr.pvt b{color:var(--red)}.dsp .ask .pvsum .pvr.pvt span{font-size:.55em;white-space:nowrap;color:#333;font-weight:700}
   .dsp .ask .pvr.pvbig{flex-direction:column;align-items:flex-start;gap:0}.dsp .ask .pvr.pvbig b{text-align:left;white-space:nowrap}
   .dsp .rp.ad{padding:0;gap:0;justify-content:stretch}
   .dsp .rp.ad::after{display:none}
   .dsp .adslot{flex:1 1 0;min-height:0;width:100%;display:flex}
   .dsp .adv{flex:1;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
   .dsp .adv img,.dsp .adv video{width:100%;height:100%;object-fit:contain;display:block}
   .dsp .adv[data-fit=cover] img,.dsp .adv[data-fit=cover] video{object-fit:cover}
   .dsp .rp.ad .adx{flex:none;display:flex;flex-wrap:wrap;gap:1vmin;justify-content:center;padding:1vmin}
   .dsp .idl{flex:2;min-width:0}
   @media (orientation:portrait){.dsp .rp.ad{flex:0 0 40%}.dsp .bd{flex-direction:column}.dsp .lst{flex:1}.dsp .rp{flex:none;padding:1.5vmin 3vmin}.dsp .qr img{width:min(56vw,34vh)}}
  </style><div class="dsp" id="d"><div class="hd"><span class="sh" id="sh"></span><span class="ck" id="ck"></span><button class="dfs" id="fs" title="ย่อ/ขยายเต็มจอ"></button></div><div class="bd" id="bd"></div><div class="tot" id="tt" hidden></div><div class="ft"><span id="cnt"><span class="dot" id="lk"></span></span><span class="cs" id="cs"></span></div></div>`;
  const bd = $('#bd', root), tt = $('#tt', root);
  // ---- หน้ากรอกข้อมูลของลูกค้า (เครื่องขายขอ) ----
  const askSt = { id: '', v: '', pick: '', el: null };
  const sendReply = r => {
    try { Display.bc && Display.bc.postMessage({ reply: r }); } catch (e) { }
    try { localStorage.setItem('mm_dispReply', JSON.stringify({ ...r, t: Date.now() })); } catch (e) { }
    try { Display.rx && Display.rx.readyState === 'open' && Display.rx.send(JSON.stringify({ reply: r })); } catch (e) { }
    if (code && S.apiUrl && !r.partial) sig(code, 'reply', r).catch(() => { });
  };
  const pvDraw = p => {
    if (!askSt.el) { askSt.el = document.createElement('div'); askSt.el.className = 'ask'; bd.after(askSt.el); }
    askSt.id = 'pv'; bd.style.display = 'none'; tt.hidden = true;
    const row = (k, v, big) => v ? `<div class="pvr${big ? ' pvbig' : ''}"><span>${esc(k)}</span><b class="${big ? 'pvb' : ''}">${esc(v)}</b></div>` : '';
    askSt.el.innerHTML = `<div class="askq"><div class="askt">${esc(p.title || 'กรุณาตรวจสอบข้อมูล')}</div><div class="asks">กรุณาตรวจสอบความถูกต้องกับพนักงานก่อนชำระเงิน</div>
        ${p.tile ? `<div class="pvtile">${pickTile(p.tile, 1)}</div>` : ''}
        ${(p.rows || []).map(r => row(r[0], r[1], r[2])).join('')}</div>
      <div class="askk pvsum">${(p.sum || []).map(r => `<div class="pvr${r[2] ? ' pvt' : ''}"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')}</div>`;
  };
  const askDraw = (a, pv) => {
    if (!a && pv) return pvDraw(pv);
    if (!a) { if (askSt.el) { askSt.el.remove(); askSt.el = null; askSt.id = ''; } bd.style.display = ''; return; }
    if (askSt.id !== a.id) { askSt.id = a.id; askSt.v = String(a.value || ''); askSt.pick = a.pickValue || ''; }
    bd.style.display = 'none'; tt.hidden = true;
    if (!askSt.el) { askSt.el = document.createElement('div'); askSt.el.className = 'ask'; bd.after(askSt.el); }
    const ok = askValid(a, askSt.v, askSt.pick), max = a.field === 'phone' ? 10 : (a.max || 15);
    askSt.el.innerHTML = `<div class="askq"><div class="askt">${esc(a.title || 'กรุณากรอกข้อมูล')}</div>${a.sub ? `<div class="asks">${esc(a.sub)}</div>` : ''}
        <div class="askv${askSt.v ? '' : ' ph'}">${askSt.v ? esc(fmtNum(askSt.v, a.field)) : esc(a.field === 'phone' ? '0XX-XXX-XXXX' : 'แตะตัวเลขด้านขวา')}</div>
        ${a.picks && a.picks.length ? `<div class="askl">${a.pick === 'bank' ? 'เลือกธนาคาร' : 'เลือกเครือข่าย'}</div><div class="askg">${a.picks.map(x => `<button data-pv="${esc(x.code)}">${pickTile(x, askSt.pick === x.code)}</button>`).join('')}</div>` : ''}</div>
      <div class="askk">${padHTML('npad big')}<button class="askok" ${ok ? '' : 'disabled'}>ยืนยัน</button></div>`;
    $$('[data-pk]', askSt.el).forEach(b => b.onclick = () => { const k = b.dataset.pk; if (k === 'del') askSt.v = askSt.v.slice(0, -1); else if (k === 'clr') askSt.v = ''; else if (askSt.v.length < max) askSt.v += k; askDraw(a); sendReply({ id: a.id, partial: 1, value: askSt.v, pick: askSt.pick }); });
    $$('[data-pv]', askSt.el).forEach(b => b.onclick = () => { askSt.pick = b.dataset.pv; askDraw(a); sendReply({ id: a.id, partial: 1, value: askSt.v, pick: askSt.pick }); });
    $('.askok', askSt.el).onclick = () => { if (!askValid(a, askSt.v, askSt.pick)) return; sendReply({ id: a.id, value: askSt.v, pick: askSt.pick }); askSt.el.innerHTML = '<div class="askq" style="justify-content:center;align-items:center;display:flex"><div class="askt">✓ ส่งข้อมูลแล้ว ขอบคุณค่ะ</div></div>'; };
  };
  const tick = () => { const c = $('#ck', root); if (!c) return clearInterval(tk); c.textContent = bkk() + ' น.'; };
  const tk = setInterval(tick, 5000); tick();
  let cur = null, lastAt = 0;
  const fit = (box, grid, items, tot) => {
    // ตัวอักษรใหญ่ที่สุดที่ทุกรายการแสดงครบ (ไม่ล้นจอ ไม่ตัดชื่อ) · แถวรวมชิดขอบล่าง · พื้นที่ที่เหลือกระจายเป็นระยะห่างระหว่างแถว
    const gt = box.querySelector('.gt'), cs = getComputedStyle(box);
    const H = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2, W = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1;
    const minF = Math.max(15, Math.min(22, Math.round(Math.min(innerWidth, innerHeight) / 22)));
    const maxF = Math.max(minF, Math.min(150, Math.round(H / 3.4)));
    const TK = 1.4; // แถวรวมใหญ่กว่ารายการ 1.4 เท่า
    const render = (skip, f) => {
      const shown = items.slice(skip), old = items.slice(0, skip);
      grid.style.fontSize = f + 'px'; grid.style.setProperty('--rp', '0px');
      grid.innerHTML = (old.length ? `<div class="more">+ ${old.length} รายการก่อนหน้า · ${LB(old.reduce((a, x) => a + num(x.a), 0))}</div>` : '') +
        shown.map(it => { const q = it.w === 'Y' ? num(it.q).toFixed(3).replace(/\.?0+$/, '') + ' กก.' : (num(it.q) !== 1 ? '×' + num(it.q) : ''); return `<div class="n"><s>-</s><b>${esc(it.n)}</b>${q ? `<i>${q}</i>` : ''}</div><div class="a">${LB(it.a)}</div>`; }).join('');
      if (gt) { gt.style.fontSize = Math.round(f * TK) + 'px'; gt.innerHTML = tot ? `<span><b>รวม</b><i>${tot.c} ชิ้น</i></span><span class="a">${LB(tot.a)}</span>` : ''; }
    };
    const used = () => grid.scrollHeight + (gt ? gt.offsetHeight + 4 : 0);
    const fitsH = () => used() <= H;
    const fitsW = () => { grid.classList.add('m'); const ok = grid.scrollWidth <= grid.clientWidth - 2; grid.classList.remove('m'); return ok && (!gt || gt.scrollWidth <= gt.clientWidth + 1); };
    let skip = 0, lo = minF, hi = maxF, best = minF;
    grid.classList.remove('wr'); render(0, minF);
    if (!fitsH()) { // เล็กสุดแล้วยังล้น → ยุบรายการเก่า
      while (skip < items.length - 1) { skip++; render(skip, minF); if (fitsH()) break; }
      return;
    }
    // 1) ชื่อบรรทัดเดียว: ใหญ่สุดที่ไม่ล้นทั้งสูงและกว้าง
    while (lo <= hi) { const m = (lo + hi) >> 1; render(0, m); if (fitsH() && fitsW()) { best = m; lo = m + 1; } else hi = m - 1; }
    // 2) ชื่อยาวขึ้นบรรทัดที่ 2 ได้ (ไม่ตัดชื่อ) ถ้าทำให้ตัวใหญ่ขึ้นชัดเจน
    const twoLines = () => [...grid.querySelectorAll('.n>b')].every(b => b.getBoundingClientRect().height <= parseFloat(grid.style.fontSize) * 1.22 * 2.3);
    grid.classList.add('wr'); let bw = 0; lo = best + 1; hi = maxF;
    while (lo <= hi) { const m = (lo + hi) >> 1; render(0, m); if (fitsH() && twoLines() && grid.scrollWidth <= grid.clientWidth + 1 && (!gt || gt.scrollWidth <= gt.clientWidth + 1)) { bw = m; lo = m + 1; } else hi = m - 1; }
    let f = best;
    if (bw >= best * 1.12) f = bw; else grid.classList.remove('wr');
    render(0, f);
    // ความสูงที่เหลือ → กระจายเป็นระยะห่างแต่ละแถว (ไม่เกินครึ่งตัวอักษร) ให้รายการเต็มพื้นที่ ไม่เว้นว่างก้อนใหญ่
    const rows = grid.querySelectorAll('.a').length, spare = H - used();
    if (rows && spare > 0) grid.style.setProperty('--rp', Math.max(0, Math.min(f * .28, spare / rows / 2 - .5)).toFixed(1) + 'px');
  };
  // ย่อตัวเลขยอดรวมให้พอดีกว้างของแถบแดง
  const fitOne = el => { if (!el) return; const W = el.parentElement.clientWidth * .92; let f = parseFloat(getComputedStyle(el).fontSize); el.style.fontSize = ''; f = parseFloat(getComputedStyle(el).fontSize); while (el.scrollWidth > W && f > 18) { f -= 2; el.style.fontSize = f + 'px'; } };
  const draw = s => {
    askDraw(s && s.ask, s && s.pv);
    cur = s;
    const lg = (s && s.logo) || '', lm = (s && s.logoMode) || 'mark';
    $('#sh', root).innerHTML = dispLogoHTML(lm, lg, (s && s.shop) || S.settings.shopName, s && s.brandW);
    $('#cs', root).textContent = s && s.cashier ? 'พนักงาน: ' + s.cashier : '';
    const cnt = $('#cnt', root); cnt.innerHTML = `<span class="dot ${Display.rx && Display.rx.readyState === 'open' ? 'on' : ''}" id="lk"></span>` + (s && s.mode !== 'idle' && s.mode !== 'done' && s.count ? `${s.count} รายการ` : '');
    if (!s || s.mode === 'idle' || !s.mode) {
      tt.hidden = true;
      // หน้าจอว่างแบบใหม่ (ภาพเคลื่อนไหว) — ไม่วาดซ้ำถ้าเนื้อหาเดิม (ไม่ให้ภาพ/วิดีโอเริ่มใหม่ทุกครั้ง)
      if (s && s.idle && s.idle.style !== 'off' && window.idleScene) {
        const adsIdle = !s.idle.yt && s.ads && s.ads.on && s.ads.idle && s.ads.items && s.ads.items.length;
        const ik = JSON.stringify([s.idle, s.welcome, s.promo, s.shop, (s.brandC || '').length, adsIdle ? s.ads : 0]);
        if (bd.dataset.ik === ik && $('.idsc', bd)) return;
        bd.dataset.ik = ik;
        bd.innerHTML = idleScene(s);
        if (adsIdle) { const r = $('.iright', bd); r.insertAdjacentHTML('afterbegin', '<div class="ivw"><div class="adslot" id="ads" style="width:100%;height:100%"></div></div>'); const h = $('.ihd', r); h && h.classList.add('sm'); AdPlayer.set(s.ads); AdPlayer.mount($('#ads', root)); }
        idleAfter(bd);
        return;
      }
      bd.dataset.ik = '';
      const idleAd = s && s.ads && s.ads.idle && AdPlayer.set(s.ads);
      bd.innerHTML = `<div class="cen${idleAd ? ' idl' : ''}"><img src="${(s && s.brandC) || 'logo.png'}" alt="ร้านเมย์ Mini Mart" style="width:auto;height:min(46vh,${s && s.ads && s.ads.on && s.ads.idle && s.ads.items.length ? '38vw' : '60vw'});max-width:80vw;object-fit:contain"><div style="font-size:6vmin;margin-top:1vmin">${esc((s && s.welcome) || 'ยินดีต้อนรับ')}</div>${s && s.promo ? `<div style="font-size:4.5vmin;background:var(--green);color:#fff;border-radius:2vmin;padding:1vmin 3vmin">${esc(s.promo)}</div>` : ''}</div>${idleAd ? '<div class="rp ad"><div class="adslot" id="ads"></div></div>' : ''}`;
      if (idleAd) AdPlayer.mount($('#ads', root));
      return;
    }
    if (s.mode === 'done') {
      tt.hidden = true;
      bd.innerHTML = `<div class="cen"><div style="font-size:8vmin;color:var(--green);font-weight:800">ขอบคุณค่ะ 🙏</div>${num(s.change) > 0 ? `<div style="font-size:5vmin">เงินทอน</div><div class="huge" style="color:var(--green)">${LB(s.change)}</div><div style="font-size:4vmin;color:#555">รับเงิน ${LB(s.cash)} · ยอด ${LB(s.total)}</div>` : `<div style="font-size:6vmin">ยอดชำระ ${LB(s.total)}</div>`}${num(s.cashOut) ? `<div class="co" style="font-size:5vmin">รับเงินสด ${LB(s.cashOut)}</div>` : ''}</div>`;
      return;
    }
    const amt = s.mode === 'pay' && s.amount != null ? s.amount : s.total;
    // ฝั่งขวา 1/3 สีแดง: ยอดรวม · QR ชำระเงิน · ส่วนลด · สมาชิก · เงินสดที่ลูกค้าได้รับ (แนวตั้ง: อยู่ด้านล่าง)
    const qr = s.mode === 'pay' && s.qr ? `<div class="qr"><img src="${s.qr}"></div><div class="qrl">สแกนจ่าย${s.qrLabel ? ' · ' + esc(s.qrLabel) : ''}</div>` : '';
    const extras = `${num(s.disc) ? `<div class="rx">ส่วนลด ${LB(s.disc)}</div>` : ''}${s.customer ? `<div class="rx"><span class="pill">${esc(s.customer)}</span></div>` : ''}${num(s.cashOut) ? `<div class="co">รับเงินสด ${LB(s.cashOut)}</div>` : ''}`;
    // โฆษณา: แสดงตอนสแกนสินค้า · ตอนรับชำระ/โชว์ QR กลับเป็นยอดเงินตัวใหญ่ตามเดิม
    const showAd = s.mode === 'cart' && !qr && s.ads && AdPlayer.set(s.ads);
    if (showAd) { bd.innerHTML = `<div class="lst" id="lst"><div class="gr" id="gr"></div><div class="gt"></div></div><div class="rp ad"><div class="adslot" id="ads"></div>${extras ? `<div class="adx">${extras}</div>` : ''}</div>`; AdPlayer.mount($('#ads', root)); }
    else bd.innerHTML = `<div class="lst" id="lst"><div class="gr" id="gr"></div><div class="gt"></div></div><div class="rp${qr ? ' hasqr' : ''}">${qr || `<div class="rlg">${dispLogoHTML(s.logoMode || 'mark', s.logo || '', s.shop || S.settings.shopName, s.brandW, true)}</div>`}<div class="rl">${s.mode === 'pay' ? 'ยอดที่ต้องชำระ' : 'รวมทั้งหมด'}</div><div class="rv" id="rv">${LB(amt)}</div>${extras}</div>`;
    tt.hidden = true;
    const items = s.items || [];
    // จำนวนที่ถูกตัดตั้งแต่ฝั่ง POS (ส่งมาแค่ 60 ล่าสุด)
    const extra = Math.max(0, (s.count || items.length) - items.length);
    const all = extra ? [{ n: `(+${extra} รายการ)`, q: 1, a: 0 }].concat(items) : items;
    requestAnimationFrame(() => { const box = $('#lst', root), gr = $('#gr', root); if (box && gr) fit(box, gr, all, { a: amt, c: items.reduce((a, x) => a + (x.w === 'Y' ? 1 : num(x.q) || 1), 0) + extra }); fitOne($('#rv', root)); });
  };
  // โลโก้/โฆษณาที่ได้รับล่าสุด (ส่งมาเฉพาะตอนเปลี่ยน)
  let AS = null; try { AS = JSON.parse(localStorage.getItem('mm_dispAssets') || 'null'); } catch (e) { }
  const AK = ['shop', 'welcome', 'promo', 'logoMode', 'logo', 'brandW', 'brandC', 'ads', 'idle'];
  let lastSrc = '', lastSeq = 0;
  const accept = s => {
    // เครื่องขายใช้เวอร์ชันใหม่กว่า → จอลูกค้าโหลดตัวเองใหม่ (ไม่ต้องไปกดรีเฟรชที่จอลูกค้า)
    if (s && s.ver && s.ver !== APP_VER && sessionStorage.getItem('mm_dver') !== s.ver) { sessionStorage.setItem('mm_dver', s.ver); location.reload(); return; }
    if (!s) return;
    // ลำดับ: เทียบเลขลำดับของเครื่องที่ส่ง (ไม่พึ่งนาฬิกาที่อาจต่างกันระหว่างเครื่อง)
    if (s.src) { if (s.src === lastSrc ? s.seq <= lastSeq : (s.at && s.at < lastAt - 3000)) return; lastSrc = s.src; lastSeq = s.seq; }
    else if (s.at && s.at <= lastAt) return;
    lastAt = Math.max(lastAt, s.at || 0);
    if ('brandC' in s && s.brandC !== undefined) { AS = { k: s.ak, v: {} }; AK.forEach(k => AS.v[k] = s[k]); }
    else {
      if (!AS || AS.k !== s.ak) { try { const L = JSON.parse(localStorage.getItem('mm_dispAssets') || 'null'); if (L && L.k === s.ak) AS = L; } catch (e) { } }
      if (s.ak && (!AS || AS.k !== s.ak)) { try { Display.rx && Display.rx.readyState === 'open' && Display.rx.send('need'); } catch (e) { } }
      if (AS) s = { ...AS.v, ...s };
    }
    Display.cur = s; draw(s); };
  // สถานะล่าสุดที่เครื่องขายเก็บไว้ในเครื่องนี้ (เปิดหน้าขาย + จอลูกค้าในเครื่องเดียวกัน)
  const local = maxAge => { try { const s = JSON.parse(localStorage.getItem('mm_dispState') || 'null'); if (s && (!maxAge || Date.now() - (s.at || 0) < maxAge)) accept(s); } catch (e) { } };
  addEventListener('storage', e => { if (e.key === 'mm_dispState' && e.newValue) { try { accept(JSON.parse(e.newValue)); } catch (x) { } } });
  draw(null); local(30 * 60000);
  addEventListener('resize', () => { clearTimeout(VIEWS.display.rt); VIEWS.display.rt = setTimeout(() => draw(cur), 150); });
  // ฟอนต์โหลดเสร็จทีหลัง (ตัวอักษรกว้างขึ้น) → คำนวณขนาดใหม่ ไม่ให้ชื่อถูกตัด
  if (document.fonts) { document.fonts.ready.then(() => draw(cur)); document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { clearTimeout(VIEWS.display.ft); VIEWS.display.ft = setTimeout(() => draw(cur), 80); }); }
  if (!code) {
    if (Display.bc) { Display.bc.onmessage = e => { if (e.data && !e.data.hello) accept(e.data); }; Display.bc.postMessage({ hello: 1 }); }
  } else if (!S.apiUrl) {
    bd.innerHTML = '<div class="cen" style="font-size:4vmin">เครื่องนี้ยังไม่ได้ตั้งค่า URL เซิร์ฟเวอร์ — ให้เจ้าของร้านตั้งค่าการเชื่อมต่อก่อน แล้วเปิดลิงก์จอลูกค้าอีกครั้ง</div>';
  } else {
    // 1) เชื่อมตรง WebRTC (เร็วที่สุด)
    const connect = async () => {
      if (!('RTCPeerConnection' in window)) return;
      try {
        try { Display.rpc && Display.rpc.close(); } catch (e) { }
        const pc = Display.rpc = new RTCPeerConnection(RTC_CFG);
        const ch = Display.rx = pc.createDataChannel('mm', { ordered: true });
        let rx = Date.now();
        ch.onopen = () => { rx = Date.now(); ch.send('hello'); draw(cur); clearInterval(VIEWS.display.hb); VIEWS.display.hb = setInterval(() => { if (Display.rx !== ch) return clearInterval(VIEWS.display.hb); if (ch.readyState !== 'open') return; try { ch.send('ping'); } catch (e) { } if (Date.now() - rx > 12000) { clearInterval(VIEWS.display.hb); try { ch.close(); pc.close(); } catch (e) { } Display.rx = null; draw(cur); connect(); } }, 4000); };
        ch.onmessage = m => { rx = Date.now(); if (m.data === 'pong') return; try { accept(JSON.parse(m.data)); } catch (e) { } };
        ch.onclose = () => { if (Display.rx !== ch) return; draw(cur); setTimeout(connect, 1000); };
        await pc.setLocalDescription(await pc.createOffer());
        await iceDone(pc);
        const id = Math.random().toString(36).slice(2);
        await sig(code, 'offer', { id, t: Date.now(), sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: 'offer', sdp: pc.localDescription.sdp } });
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 1500));
          if (Display.rpc !== pc) return;
          const ans = await sig(code, 'answer').catch(() => null);
          if (ans && ans.id === id) { await pc.setRemoteDescription(ans.sdp); setTimeout(() => { if (ch.readyState !== 'open' && Display.rpc === pc) connect(); }, 15000); return; }
        }
        if (Display.rpc === pc) setTimeout(connect, 5000);
      } catch (e) { setTimeout(connect, 8000); }
    };
    connect();
    // 2) สำรองผ่านเซิร์ฟเวอร์ (ถี่เมื่อยังไม่เชื่อมตรง)
    let v = '';
    const poll = async () => {
      const direct = Display.rx && Display.rx.readyState === 'open';
      try {
        const r = await fetch(S.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'displayPull', payload: { code, v } }) }).then(x => x.json());
        if (r && r.ok && !r.same && r.v) { v = r.v; accept(r.state); }
      } catch (e) { }
      clearTimeout(VIEWS.display.pt); VIEWS.display.pt = setTimeout(poll, document.hidden ? 5000 : direct ? 3000 : 700);
    };
    VIEWS.display.poll = poll;
    poll();
  }
  // เต็มจอ: ปุ่มย่อ/ขยาย · เปิดเต็มจอเองอัตโนมัติ (เบราว์เซอร์ยอมให้เต็มจอเมื่อมีการแตะ/คลิกครั้งแรก) · จำว่าผู้ใช้ปิดเองหรือไม่
  const fsb = $('#fs', root), isFS = () => !!document.fullscreenElement;
  const paintFS = () => { fsb.innerHTML = I(isFS() ? IC.shrink : IC.expand, 22); };
  const goFS = async () => { try { if (!isFS() && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { } try { navigator.wakeLock && await navigator.wakeLock.request('screen'); } catch (e) { } paintFS(); };
  fsb.onclick = async e => { e.stopPropagation(); if (isFS()) { LS.set('dispFS', false); try { await document.exitFullscreen(); } catch (x) { } } else { LS.set('dispFS', true); await goFS(); } paintFS(); };
  document.addEventListener('fullscreenchange', paintFS);
  const autoFS = () => { if (LS.get('dispFS', true) && !isFS() && location.hash.indexOf('#display') === 0) goFS(); };
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, autoFS, true));
  autoFS(); paintFS();
  // เบราว์เซอร์ไม่ยอมให้เต็มจอเองโดยไม่มีการแตะ → ขึ้นป้ายใหญ่ให้แตะ 1 ครั้ง (ถ้าเปิดจากไอคอนแอป "จอลูกค้า" จะเต็มจอเองทันที ไม่ขึ้นป้ายนี้)
  const appMode = () => matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  const hint = () => {
    let h = document.getElementById('fshint');
    const need = LS.get('dispFS', true) && !isFS() && !appMode() && location.hash.indexOf('#display') === 0;
    if (!need) { h && h.remove(); return; }
    if (h) return;
    h = document.createElement('div'); h.id = 'fshint';
    h.style.cssText = 'position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:var(--fh);text-align:center;padding:4vmin;cursor:pointer';
    h.innerHTML = '<div style="font-size:9vmin;font-weight:800">แตะจอ 1 ครั้ง</div><div style="font-size:4.5vmin;margin-top:1vmin">เพื่อเปิดเต็มจอ</div><div style="font-size:2.6vmin;opacity:.8;margin-top:4vmin;max-width:80vw">ไม่อยากแตะทุกครั้ง: Chrome ⋮ › ติดตั้งแอป / เพิ่มลงในหน้าจอหลัก (ชื่อ "May จอลูกค้า") แล้วเปิดจากไอคอน จะเต็มจอเองทันที</div>';
    h.addEventListener('pointerdown', e => { e.stopPropagation(); h.remove(); goFS(); });   // แตะแล้วป้ายหายเสมอ (กลับมาเมื่อออกจากเต็มจอ)
    document.body.appendChild(h);
  };
  document.addEventListener('fullscreenchange', hint);
  setTimeout(hint, 600);
  // กลับมาแสดงผล (สลับแท็บ/ปลดล็อกจอ): อ่านสถานะล่าสุดทันที ไม่ต้องรอรอบดึงข้อมูลถัดไป
  const wake = () => { if (document.hidden) return; local(); if (Display.bc) try { Display.bc.postMessage({ hello: 1 }); } catch (e) { } if (VIEWS.display.poll) { clearTimeout(VIEWS.display.pt); VIEWS.display.poll(); } };
  document.addEventListener('visibilitychange', () => { wake(); if (!document.hidden) { try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => { }); } catch (e) { } } });
  addEventListener('pageshow', wake); addEventListener('focus', wake);
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => { }); } catch (e) { }
};

VIEWS.displayset = el => {
  const code = LS.get('dispCode', ''); const dc = cfg('displayCfg', { welcome: 'ยินดีต้อนรับ', promo: '' });
  const base = location.href.split('#')[0];
  el.innerHTML = vhead('จอแสดงผลฝั่งลูกค้า', '', 'more') + `
   <div class="card"><h3>แบบที่ 1 · จอที่สองของเครื่องนี้</h3><p class="small muted" style="margin-top:0">สำหรับคอมพิวเตอร์ที่ต่อจอเสริม หรือแท็บเล็ตที่ต่อจอ — เปิดหน้าต่างจอลูกค้า ลากไปไว้จอที่ 2 แล้วกด “เต็มจอ”</p><button class="btn block" id="op">${I(IC.monitor, 18)} เปิดหน้าต่างจอลูกค้า</button></div>
   <div class="card"><h3>แบบที่ 2 · ใช้แท็บเล็ต/มือถืออีกเครื่องเป็นจอลูกค้า</h3>
     ${!S.apiUrl ? '<div class="alert amber">ต้องเชื่อมต่อเซิร์ฟเวอร์ Google ก่อน (โหมดทดลองใช้ได้เฉพาะแบบที่ 1)</div>' : ''}
     ${code ? `<div class="center"><div class="small muted">รหัสจอของเครื่อง POS นี้</div><div class="disp" style="font-size:40px;letter-spacing:6px;color:var(--red)">${code}</div><div id="qr" style="margin:8px auto;width:160px"></div><div class="small">บนเครื่องจอลูกค้า: เปิดแอปและตั้ง URL เซิร์ฟเวอร์ให้เรียบร้อย แล้วเปิดลิงก์นี้ (หรือสแกน QR)</div><div class="tiny" style="word-break:break-all;background:#fff;padding:6px;border-radius:8px;margin-top:6px">${esc(base)}#display-${code}</div></div>
       <div class="row" style="margin-top:10px"><button class="btn ghost grow" id="cp">คัดลอกลิงก์</button><button class="btn ghost grow" id="off" style="color:var(--red)">ยกเลิกการจับคู่</button></div>`
      : `<button class="btn block" id="pair" ${S.apiUrl ? '' : 'disabled'}>สร้างรหัสจับคู่จอลูกค้า</button>`}
   </div>
   ${isOwner() ? `<div class="card" id="lgw"><h3>โลโก้แถบบนของจอลูกค้า</h3>
     <label class="row" style="margin-bottom:6px"><input type="radio" name="lgm" value="mark" ${(dc.logoMode || 'mark') === 'mark' ? 'checked' : ''}> โลโก้ร้าน (ตั้งที่ ตั้งค่า › โลโก้ร้าน) — ค่าเริ่มต้น</label>
     <label class="row" style="margin-bottom:6px"><input type="radio" name="lgm" value="image" ${dc.logoMode === 'image' ? 'checked' : ''}> รูปโลโก้ของร้าน (แนวนอน · พื้นโปร่งใสจะสวยที่สุด)</label>
     <label class="row" style="margin-bottom:8px"><input type="radio" name="lgm" value="name" ${dc.logoMode === 'name' ? 'checked' : ''}> ชื่อร้านแบบตัวอักษร</label>
     <div id="lgup" style="margin-bottom:8px"><label class="btn ghost sm">อัปโหลดรูปโลโก้<input type="file" accept="image/*" id="lgf" hidden></label></div>
     <div id="lgp"></div><div class="tiny muted" style="margin-top:6px">กดบันทึกด้านล่าง แล้วจอลูกค้าจะเปลี่ยนตอนขายบิลถัดไป</div></div><div class="card" id="idc"></div><div class="card" id="cic"></div><div class="card" id="adc"></div><div class="card"><h3>ข้อความบนจอ</h3><label class="f"><span>ข้อความต้อนรับ</span><input class="in" id="wc" value="${esc(dc.welcome)}"></label><label class="f"><span>ข้อความโปรโมชัน (แสดงตอนว่าง)</span><input class="in" id="pm" value="${esc(dc.promo)}" placeholder="เช่น ส่งฟรี! สั่งครบ 300 บาท โทร 092-806-5163"></label><button class="btn green block" id="sv">บันทึก</button></div>` : ''}`;
  $('#op', el).onclick = async () => {
    // ถ้ามีจอที่สอง: เปิดหน้าต่างจอลูกค้าเต็มพื้นที่จอนั้นเลย (Chrome จะถามสิทธิ์ "จัดการหน้าต่าง" ครั้งแรก)
    try { if ('getScreenDetails' in window) { const sd = await window.getScreenDetails(); const ext = sd.screens.find(x => x !== sd.currentScreen) || null; if (ext) { const w2 = window.open(base + '#display', 'mmdisplay', `popup,left=${ext.availLeft},top=${ext.availTop},width=${ext.availWidth},height=${ext.availHeight}`); if (w2) { toast('เปิดจอลูกค้าบนจอที่สองแล้ว — คลิกที่จอลูกค้า 1 ครั้งเพื่อเต็มจอ'); return; } } } } catch (e) { }
    const w = window.open(base + '#display', 'mmdisplay', 'popup,width=1024,height=640'); if (!w) toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต pop-up ก่อน', 1); };
  const pair = $('#pair', el); if (pair) pair.onclick = () => { LS.set('dispCode', String(Math.floor(100000 + Math.random() * 900000))); Display.listen(); go('displayset'); };
  const off = $('#off', el); if (off) off.onclick = () => { LS.del('dispCode'); go('displayset'); };
  const cp = $('#cp', el); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(base + '#display-' + code); toast('คัดลอกแล้ว'); } catch (e) { toast('คัดลอกไม่ได้', 1); } };
  if (code) qrDataUrl(base + '#display-' + code, 4).then(src => { const q = $('#qr', el); if (q) q.innerHTML = `<img src="${src}" style="width:100%">`; }).catch(() => { });
  let lgImg = dc.logo || '';
  const lw = $('#lgw', el);
  if (lw) {
    const pv = () => { const m = $('[name=lgm]:checked', el).value; $('#lgp', el).innerHTML = `<div style="background:var(--red);color:#fff;border-radius:10px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;font-size:22px"><span style="display:flex;align-items:center;min-width:0;overflow:hidden">${dispLogoHTML(m, lgImg, S.settings.shopName, Brand.custom() ? Brand.white() : '')}</span><b style="font-size:28px">12:00 น.</b></div>`; $('#lgup', el).style.display = m === 'image' ? '' : 'none'; };
    $$('[name=lgm]', el).forEach(r => r.onchange = pv);
    $('#lgf', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; const im = await loadImg(URL.createObjectURL(f)); const h = Math.min(120, im.height), w = Math.round(im.width * h / im.height), cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(im, 0, 0, w, h); lgImg = cv.toDataURL('image/png'); if (lgImg.length > 60000) lgImg = cv.toDataURL('image/webp', .85); pv(); };
    pv();
  }
  const adc = $('#adc', el); if (adc) adSettings(adc);
  const idc = $('#idc', el); if (idc) idleSettings(idc);
  const cic = $('#cic', el);
  if (cic) { const dr = () => { cic.innerHTML = `<h3>ลูกค้ากรอกข้อมูลบนจอลูกค้า</h3><label class="row" style="margin:4px 0"><input type="checkbox" id="ci" ${custInputOn() ? 'checked' : ''}> <b>เปิดให้ลูกค้ากดกรอกเลขบัญชี / เบอร์โทร / เลขบิล ที่จอลูกค้า</b></label>
      <div class="small muted">ใช้ได้เมื่อจอลูกค้าเป็นจอทัชสกรีน (แท็บเล็ต/มือถือ) · ถ้าเป็นจอเสริมที่แตะไม่ได้ ให้ปิด — จอลูกค้าจะแสดงเลขบัญชี ธนาคาร เครือข่าย เบอร์ และยอด ที่พนักงานกรอก ให้ลูกค้าตรวจสอบอย่างเดียว (แสดงทั้งเปิดและปิด)</div>`;
      $('#ci', cic).onchange = async e => { try { busy(1); await saveSetting('custInput', e.target.checked ? 'Y' : 'N'); busy(0); toast(e.target.checked ? 'เปิดให้ลูกค้ากรอกบนจอลูกค้าแล้ว' : 'ปิดแล้ว — จอลูกค้าแสดงข้อมูลให้ตรวจสอบอย่างเดียว'); } catch (x) { busy(0); toast(x.message, 1); dr(); } }; };
    dr(); }
  const sv = $('#sv', el); if (sv) sv.onclick = async () => { try { busy(1); await saveSetting('displayCfg', { ...cfg('displayCfg', {}), welcome: $('#wc', el).value, promo: $('#pm', el).value, logoMode: ($('[name=lgm]:checked', el) || {}).value || 'mark', logo: lgImg }); busy(0); toast('บันทึกแล้ว'); } catch (e) { busy(0); toast(e.message, 1); } };
};

// หน้าจอตอนว่าง (เจ้าของร้าน): ข้อความ เบอร์ QR วิดีโอ YouTube + ตัวอย่างสด
function idleSettings(box) {
  const dc0 = cfg('displayCfg', { welcome: 'ยินดีต้อนรับ', promo: '' });
  let c = idleCfg(dc0);
  const F = (k, label, ph, ta) => `<label class="f"><span>${label}</span>${ta ? `<textarea class="in" data-k="${k}" rows="3" placeholder="${esc(ph || '')}">${esc(c[k] || '')}</textarea>` : `<input class="in" data-k="${k}" value="${esc(c[k] || '')}" placeholder="${esc(ph || '')}">`}</label>`;
  box.innerHTML = `<h3>หน้าจอตอนว่าง (ยังไม่มีการขาย)</h3>
    <div class="seg" id="ist" style="margin-bottom:8px;flex-wrap:wrap"><button data-s="festive">เทศกาล</button><button data-s="clean">เรียบ</button><button data-s="slides">ภาพของร้าน (สไลด์โชว์)</button><button data-s="off">แบบเดิม</button></div>
    <div id="ipv" style="aspect-ratio:16/9;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px #0002;margin-bottom:10px"></div>
    <div id="isl"></div>
    <div id="ifn"><label class="f"><span>ฟอนต์ข้อความ (แบบไม่มีหัว)</span><select class="in" id="ifont"><option value="prompt">Prompt (ค่าเริ่มต้น)</option><option value="kanit">Kanit</option><option value="mitr">Mitr (มน)</option><option value="anuphan">Anuphan</option><option value="baij">Bai Jamjuree</option><option value="custom">ไฟล์ฟอนต์ของร้าน${c.fontName ? ' — ' + esc(c.fontName) : ''}</option></select></label>
      <div class="row small" style="gap:8px;margin:-4px 0 10px"><label class="btn ghost sm">อัปโหลดไฟล์ฟอนต์ (.ttf .otf .woff2)<input type="file" id="iff" accept=".ttf,.otf,.woff,.woff2" hidden></label><span class="tiny muted">เช่น PSL Omyim — ใช้ไฟล์ที่ร้านมีสิทธิ์ใช้งาน</span></div></div>
    <div id="ifs">
    <div class="grid2">${F('top', 'ข้อความบรรทัดบน (สีเขียว)', 'เช่น พิเศษ บริการส่ง')}${F('big', 'ข้อความตัวใหญ่', 'เช่น ฟรี*')}</div>
    <div class="grid2">${F('tag', 'ป้ายเอียงข้างตัวใหญ่', 'เช่น DELIVERY')}${F('phone', 'เบอร์โทรสั่งสินค้า', 'เช่น 092-806-5163')}</div>
    ${F('sub', 'ข้อความตัวหนาด้านล่าง', 'เช่น *สั่งสินค้าตั้งแต่ 300 บาท ขึ้นไป')}${F('note', 'หมายเหตุตัวเล็ก', 'เช่น *ในระยะทางไม่เกิน 5 กิโลเมตร')}
    ${F('info', 'ข้อความใต้โลโก้ (บรรทัดละ 1 ข้อ เช่น ที่อยู่ เวลาเปิด-ปิด)', 'บ้านกะเลา ต.หมื่นศรี อ.สำโรงทาบ จ.สุรินทร์\nเปิดทุกวัน 06.00 - 20.00 น.', true)}
    ${F('qr', 'QR มุมขวาล่าง (ลิงก์ LINE / เพจ)', 'https://lin.ee/...')}
    ${F('yt', 'วิดีโอ (ลิงก์ YouTube หรือไฟล์ .mp4 จากเว็บ) — ว่าง = ไม่แสดง', 'https://youtu.be/...')}
    <div class="tiny muted" style="margin:-4px 0 8px">วิดีโอเล่นบนเครื่องจอลูกค้าเท่านั้น (ปิดเสียง วนซ้ำ) ไม่โหลดผ่านเครื่องขาย จึงไม่ทำให้การขายช้า · เครื่องจอลูกค้าต้องต่อเน็ต · ข้อความ "ยินดีต้อนรับ" และ "โปรโมชัน" ตั้งที่การ์ด ข้อความบนจอ ด้านล่าง</div>
    <label class="row small" style="margin-bottom:8px"><input type="checkbox" id="iride" ${c.ride !== false ? 'checked' : ''}> รถส่งของวิ่งผ่าน</label></div>
    <button class="btn green block" id="isv">บันทึกหน้าจอตอนว่าง</button>`;
  const read = () => { $$('[data-k]', box).forEach(i => c[i.dataset.k] = i.value.trim()); c.info = ($('[data-k=info]', box).value || '').trim(); c.ride = $('#iride', box).checked; return c; };
  const pv = () => {
    read();
    const dc = cfg('displayCfg', { welcome: 'ยินดีต้อนรับ', promo: '' });
    $$('#ist button', box).forEach(b => b.classList.toggle('on', b.dataset.s === c.style));
    $('#ifs', box).style.display = c.style === 'off' || c.style === 'slides' ? 'none' : '';
    $('#ifn', box).style.display = c.style === 'off' ? 'none' : '';
    drawSlides();
    const p = $('#ipv', box);
    if (c.style === 'off') { p.innerHTML = '<div class="center muted" style="height:100%;display:flex;align-items:center;justify-content:center">แบบเดิม: โลโก้ร้าน + ข้อความต้อนรับ + โปรโมชัน</div>'; return; }
    p.innerHTML = idleScene({ idle: { ...c, yt: c.yt ? '' : '' }, welcome: dc.welcome, promo: dc.promo, shop: S.settings.shopName, brandC: S.settings.brandLogo }, true);
    if (c.yt) { const r = $('.iright', p); const ok = !!idleVideoHTML(c.yt); r.insertAdjacentHTML('afterbegin', `<div class="ivw" style="display:flex;align-items:center;justify-content:center;color:#fff;font-size:3cqmin">${ok ? '▶ วิดีโอจะเล่นตรงนี้บนจอลูกค้า' : '⚠ ลิงก์วิดีโอไม่ถูกต้อง'}</div>`); const h = $('.ihd', r); h && h.classList.add('sm'); }
    idleAfter(p);
  };
  // ---- สไลด์โชว์ภาพของร้าน ----
  const saveNow = async () => { await saveSetting('displayCfg', { ...cfg('displayCfg', {}), idle: { ...c } }); Display.repush && Display.repush(); };
  const drawSlides = () => {
    const w = $('#isl', box); if (c.style !== 'slides') { w.innerHTML = ''; return; }
    const L = c.slides || (c.slides = []);
    w.innerHTML = `<div class="small muted" style="margin-bottom:6px">อัปโหลดภาพที่ออกแบบไว้ (แนวนอน 16:9 เช่น 1920×1080) — แสดงเต็มจอ เปลี่ยนภาพแบบค่อย ๆ จาง ซูมช้า ๆ และมีเอฟเฟกต์เคลื่อนไหวซ้อนด้านบน</div>
      ${L.map((x, i) => `<div class="row" style="gap:8px;padding:6px 0;border-bottom:1px solid var(--line)"><div class="slt" data-id="${esc(x.id)}" style="width:96px;height:54px;border-radius:6px;background:#eee;overflow:hidden;flex:none"></div><div class="grow small" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name || 'ภาพ ' + (i + 1))}</div><button class="btn ghost sm" data-up="${i}" ${i ? '' : 'disabled'}>▲</button><button class="btn ghost sm" data-dn="${i}" ${i < L.length - 1 ? '' : 'disabled'}>▼</button><button class="btn ghost sm" data-rm="${i}" style="color:var(--red)">ลบ</button></div>`).join('')}
      <div class="row" style="gap:8px;margin:8px 0;flex-wrap:wrap"><label class="btn sm">＋ เพิ่มภาพ<input type="file" id="isf" accept="image/*" multiple hidden></label>
        <label class="row small" style="gap:6px">เปลี่ยนภาพทุก <input class="in" id="isec" type="number" min="3" max="60" value="${c.sec || 8}" style="width:70px;min-height:36px"> วินาที</label>
        <select class="in" id="ifit" style="width:auto;min-height:36px"><option value="contain">แสดงทั้งภาพ</option><option value="cover">เต็มจอ (ตัดขอบ)</option></select>
        <label class="row small" style="gap:6px"><input type="checkbox" id="ifx" ${c.fx !== false ? 'checked' : ''}> เอฟเฟกต์ พลุ·กระดาษสี·ประกาย</label>
        <input class="in" id="iphs" placeholder="เบอร์โทรมุมขวาล่าง (ไม่ใส่ก็ได้)" value="${esc(c.phone || '')}" style="max-width:240px;min-height:36px"></div>`;
    $('#ifit', w).value = c.fit || 'contain';
    $$('.slt', w).forEach(t => AdFiles.url(t.dataset.id).then(u => t.innerHTML = `<img src="${u}" style="width:100%;height:100%;object-fit:cover">`).catch(() => { }));
    const mv = (i, j) => { const L2 = c.slides; [L2[i], L2[j]] = [L2[j], L2[i]]; saveNow().then(pv).catch(e => toast(e.message, 1)); };
    $$('[data-up]', w).forEach(b => b.onclick = () => mv(+b.dataset.up, +b.dataset.up - 1));
    $$('[data-dn]', w).forEach(b => b.onclick = () => mv(+b.dataset.dn, +b.dataset.dn + 1));
    $$('[data-rm]', w).forEach(b => b.onclick = async () => { const x = c.slides[+b.dataset.rm]; if (!(await confirmDlg('ลบภาพนี้?', 'ลบ', true))) return; c.slides.splice(+b.dataset.rm, 1); try { busy(1); await saveNow(); api('adDelete', { id: x.id }).catch(() => { }); AdFiles.drop(x.id); busy(0); pv(); } catch (e) { busy(0); toast(e.message, 1); } });
    $('#isec', w).onchange = e => { c.sec = Math.max(3, Math.min(60, +e.target.value || 8)); saveNow().then(pv).catch(er => toast(er.message, 1)); };
    $('#ifit', w).onchange = e => { c.fit = e.target.value; saveNow().then(pv).catch(er => toast(er.message, 1)); };
    $('#ifx', w).onchange = e => { c.fx = e.target.checked; saveNow().then(pv).catch(er => toast(er.message, 1)); };
    $('#iphs', w).onchange = e => { c.phone = e.target.value.trim(); const ph = $('[data-k=phone]', box); if (ph) ph.value = c.phone; saveNow().then(pv).catch(er => toast(er.message, 1)); };
    $('#isf', w).onchange = async e => {
      const files = [...e.target.files]; if (!files.length) return;
      try {
        for (let k = 0; k < files.length; k++) {
          busy(1, `กำลังอัปโหลดภาพ ${k + 1}/${files.length}...`);
          const im = await loadImg(URL.createObjectURL(files[k])), sc = Math.min(1, 1920 / im.width, 1080 / im.height), cv = document.createElement('canvas');
          cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc); const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(im, 0, 0, cv.width, cv.height);
          const du = cv.toDataURL('image/jpeg', .88);
          const up = await api('upload', { kind: 'ad', name: files[k].name, mime: 'image/jpeg', base64: du });
          await AdFiles.put(up.fileId, du);
          (c.slides || (c.slides = [])).push({ id: up.fileId, name: files[k].name });
        }
        await saveNow(); busy(0); toast('เพิ่มภาพแล้ว'); pv();
      } catch (er) { busy(0); toast(er.message, 1); }
    };
  };
  $('#ifont', box).value = c.font || 'prompt';
  $('#ifont', box).onchange = e => { if (e.target.value === 'custom' && !c.fontId) { e.target.value = c.font || 'prompt'; return toast('อัปโหลดไฟล์ฟอนต์ก่อน', 1); } c.font = e.target.value; pv(); };
  $('#iff', box).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase(), mime = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[ext];
    if (!mime) return toast('รองรับไฟล์ .ttf .otf .woff .woff2', 1);
    if (f.size > 4e6) return toast('ไฟล์ฟอนต์ใหญ่เกิน 4 MB', 1);
    try {
      busy(1, 'กำลังอัปโหลดฟอนต์...');
      const du = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, 'data:' + mime + ';base64,')); r.onerror = rej; r.readAsDataURL(f); });
      const up = await api('upload', { kind: 'ad', name: f.name, mime, base64: du });
      await AdFiles.put(up.fileId, du);
      if (c.fontId) api('adDelete', { id: c.fontId }).catch(() => { });
      c.font = 'custom'; c.fontId = up.fileId; c.fontName = f.name; delete IdleFont.loaded['custom:' + up.fileId];
      await saveNow(); busy(0); toast('อัปโหลดฟอนต์แล้ว'); idleSettings(box);
    } catch (er) { busy(0); toast(er.message, 1); }
  };
  let t; box.addEventListener('input', () => { clearTimeout(t); t = setTimeout(pv, 300); });
  $('#iride', box).onchange = pv;
  $$('#ist button', box).forEach(b => b.onclick = () => { c.style = b.dataset.s; pv(); });
  $('#isv', box).onclick = async () => { read(); if (c.yt && !idleVideoHTML(c.yt)) return toast('ลิงก์วิดีโอไม่ถูกต้อง (ใช้ลิงก์ YouTube หรือไฟล์ .mp4)', 1); try { busy(1); await saveSetting('displayCfg', { ...cfg('displayCfg', {}), idle: { ...c } }); busy(0); toast('บันทึกแล้ว — จอลูกค้าเปลี่ยนภายในไม่กี่วินาที'); Display.repush && Display.repush(); } catch (e) { busy(0); toast(e.message, 1); } };
  pv();
}

// ตั้งค่าโฆษณาฝั่งขวาของจอลูกค้า (เจ้าของร้าน) — เปลี่ยนแล้วบันทึกทันที
function adSettings(box) {
  const A = { ...ADS_DEF, ...cfg('displayAds', ADS_DEF) }; A.items = (A.items || []).slice();
  const save = async (msg) => { await saveSetting('displayAds', A); if (Display.last) Display.push({ ...Display.last }); if (msg) toast(msg); };
  const render = () => {
    box.innerHTML = `<h3 style="margin-bottom:4px">โฆษณาบนจอลูกค้า (พื้นที่ฝั่งขวา)</h3>
     <div class="small muted" style="margin-bottom:8px">ตอนสแกนสินค้า ฝั่งขวาจะเล่นรูป/วิดีโอวนไป ยอดรวมย้ายไปอยู่ใต้รายการ · ตอนรับชำระเงินหรือแสดง QR จะกลับเป็นยอดเงินตัวใหญ่เหมือนเดิม</div>
     <label class="row" style="margin-bottom:6px"><input type="checkbox" id="a_on" ${A.on ? 'checked' : ''}> <b>เปิดแสดงโฆษณา</b></label>
     <label class="row small" style="margin-bottom:6px"><input type="checkbox" id="a_idle" ${A.idle !== false ? 'checked' : ''}> แสดงตอนจอว่าง (ยังไม่มีลูกค้า) ด้วย</label>
     <div class="row small" style="gap:14px;margin-bottom:10px;flex-wrap:wrap"><label class="row"><input type="radio" name="a_fit" value="contain" ${A.fit !== 'cover' ? 'checked' : ''}> แสดงทั้งภาพ (ไม่ตัดขอบ)</label><label class="row"><input type="radio" name="a_fit" value="cover" ${A.fit === 'cover' ? 'checked' : ''}> เต็มกรอบ (ตัดขอบเกินออก)</label></div>
     <div id="a_list">${A.items.length ? A.items.map((x, i) => `<div class="row" style="gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">
        <div data-th="${i}" style="width:48px;height:64px;border-radius:6px;background:var(--red);overflow:hidden;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px">${x.t === 'v' ? '▶' : ''}</div>
        <div class="grow" style="min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.t === 'v' ? '🎬 ' : '🖼 '}${esc(x.name || 'ไฟล์')}</div><div class="tiny muted">${x.kb ? x.kb.toLocaleString() + ' KB' : ''}${x.t === 'v' ? ' · เล่นจนจบแล้วต่อรายการถัดไป' : ''}</div>
          ${x.t !== 'v' ? `<label class="tiny row" style="gap:4px;margin-top:2px">แสดง <input class="in" type="number" min="3" max="60" data-s="${i}" value="${x.s || 8}" style="width:56px;min-height:30px;padding:2px 6px"> วินาที</label>` : ''}</div>
        <button class="btn ghost sm" data-up="${i}" ${i ? '' : 'disabled'}>▲</button><button class="btn ghost sm" data-dn="${i}" ${i < A.items.length - 1 ? '' : 'disabled'}>▼</button>
        <button class="btn ghost sm" data-rm="${i}" style="color:var(--red)">${I(IC.trash, 16)}</button></div>`).join('') : '<div class="small muted center" style="padding:10px">ยังไม่มีรูป/วิดีโอ</div>'}</div>
     <div class="row" style="gap:8px;margin-top:10px"><label class="btn ghost grow" ${A.items.length >= 10 ? 'style="opacity:.5;pointer-events:none"' : ''}>+ เพิ่มรูปภาพ<input type="file" accept="image/*" id="a_img" hidden multiple></label><label class="btn ghost grow" ${A.items.length >= 10 ? 'style="opacity:.5;pointer-events:none"' : ''}>+ เพิ่มวิดีโอ<input type="file" accept="video/mp4,video/webm" id="a_vid" hidden></label></div>
     <div style="display:block;margin-top:10px;background:#F4F7FB;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.55">
      <b>ขนาดที่แนะนำ</b> (จอลูกค้าไม่เกิน 11 นิ้ว)<br>
      • <b>รูปภาพ</b>: แนวตั้ง สัดส่วน 2:3 เช่น <b>800×1200 px</b> (JPG/PNG) — ระบบย่อให้อัตโนมัติ เหลือไฟล์ละประมาณ 100–250 KB<br>
      • <b>วิดีโอ</b>: MP4 (H.264) แนวตั้ง <b>720×1080</b> ยาว 10–30 วินาที <b>ไม่เกิน 10 MB</b> · จอเล่นแบบปิดเสียง<br>
      • สูงสุด 10 รายการ · ช่องโฆษณากว้างประมาณ 1/3 ของจอ สัดส่วนจริงต่างกันไปตามจอ ถ้าเลือก “แสดงทั้งภาพ” จะไม่ถูกตัดขอบ<br>
      • ไฟล์เก็บใน Google Drive (โฟลเดอร์ “โฆษณาจอลูกค้า”) ไม่ได้เก็บใน Google Sheet จึงไม่ทำให้ฐานข้อมูลหนัก · จอลูกค้าโหลดครั้งเดียวแล้วเก็บไว้ในเครื่อง</div>`;
    A.items.forEach((x, i) => { if (x.t !== 'v') AdFiles.url(x.id).then(u => { const t = $(`[data-th="${i}"]`, box); if (t) t.innerHTML = `<img src="${u}" style="width:100%;height:100%;object-fit:cover">`; }).catch(() => { }); });
    $('#a_on', box).onchange = e => { A.on = e.target.checked; save(A.on ? (A.items.length ? 'เปิดโฆษณาแล้ว' : 'เปิดแล้ว — เพิ่มรูปหรือวิดีโอด้านล่าง') : 'ปิดโฆษณาแล้ว').catch(er => toast(er.message, 1)); };
    $('#a_idle', box).onchange = e => { A.idle = e.target.checked; save().catch(er => toast(er.message, 1)); };
    $$('[name=a_fit]', box).forEach(r => r.onchange = () => { A.fit = r.value; save().catch(er => toast(er.message, 1)); });
    $$('[data-s]', box).forEach(n => n.onchange = () => { A.items[+n.dataset.s].s = Math.max(3, Math.min(60, +n.value || 8)); save().catch(er => toast(er.message, 1)); });
    const mv = (i, j) => { [A.items[i], A.items[j]] = [A.items[j], A.items[i]]; render(); save().catch(er => toast(er.message, 1)); };
    $$('[data-up]', box).forEach(b => b.onclick = () => mv(+b.dataset.up, +b.dataset.up - 1));
    $$('[data-dn]', box).forEach(b => b.onclick = () => mv(+b.dataset.dn, +b.dataset.dn + 1));
    $$('[data-rm]', box).forEach(b => b.onclick = async () => {
      const i = +b.dataset.rm, x = A.items[i]; if (!(await confirmDlg(`ลบ “${esc(x.name || 'ไฟล์นี้')}” ออกจากโฆษณา?`, 'ลบ', true))) return;
      try { busy(1); A.items.splice(i, 1); await save(); api('adDelete', { id: x.id }).catch(() => { }); AdFiles.drop(x.id); busy(0); render(); toast('ลบแล้ว'); } catch (e) { busy(0); toast(e.message, 1); }
    });
    const add = async (files, kind) => {
      for (const f of files) {
        if (A.items.length >= 10) { toast('ใส่ได้สูงสุด 10 รายการ', 1); break; }
        try {
          let du, mime, t = kind;
          if (kind === 'i') { const r = await compressImage(f, 1280, .82); du = r.dataUrl; mime = r.mime; }
          else {
            if (f.size > 10 * 1024 * 1024) { toast(`วิดีโอ ${(f.size / 1048576).toFixed(1)} MB ใหญ่เกิน 10 MB — ย่อขนาดก่อน (แนะนำ 720×1080 ยาวไม่เกิน 30 วินาที)`, 1, 6000); continue; }
            mime = f.type || 'video/mp4'; du = await fileToDataURL(f);
          }
          busy(1, `กำลังอัปโหลด ${f.name}...`);
          const up = await api('upload', { kind: 'ad', name: f.name, mime, base64: du });
          await AdFiles.put(up.fileId, du);
          A.items.push({ id: up.fileId, t, s: 8, name: f.name, kb: Math.round(du.length * .75 / 1024) });
          await save(); busy(0);
        } catch (e) { busy(0); toast('อัปโหลดไม่สำเร็จ: ' + e.message, 1); }
      }
      if (!A.on && A.items.length) toast('เพิ่มแล้ว — ติ๊ก “เปิดแสดงโฆษณา” เพื่อเริ่มแสดง'); else toast('เพิ่มแล้ว');
      render();
    };
    $('#a_img', box).onchange = e => add([...e.target.files], 'i');
    $('#a_vid', box).onchange = e => add([...e.target.files], 'v');
  };
  render();
}
