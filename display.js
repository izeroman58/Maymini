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

const Display = {
  bc: ('BroadcastChannel' in window) ? new BroadcastChannel('mm-display') : null,
  last: null, t: null, dc: null, pc: null, offerId: '', sigT: null,
  push(state) {
    const dc = cfg('displayCfg', { welcome: 'ยินดีต้อนรับ', promo: '' });
    state = { ...state, shop: S.settings.shopName || 'ร้านเมย์ มินิมาร์ท', welcome: dc.welcome, promo: dc.promo, logoMode: dc.logoMode || 'mark', logo: dc.logoMode === 'image' ? dc.logo || '' : '', brandW: Brand.custom() ? Brand.white() : '', brandC: (S.settings && S.settings.brandLogo) || '', ads: adsCfg(), cashier: (S.user && S.user.name) || '', ver: APP_VER, at: Date.now() };
    this.last = state;
    try { this.bc && this.bc.postMessage(state); } catch (e) { }
    const direct = this.send(state);
    const code = LS.get('dispCode', '');
    // สำรองผ่านเซิร์ฟเวอร์: ถ้าเชื่อมตรงอยู่ ส่งช้าๆ ไว้กันพลาด (ใช้ตอนจอเพิ่งเปิดใหม่)
    // ส่งผ่าน Google ทุกครั้งด้วย (เร็ว ~150 มิลลิวิ) กันกรณีเชื่อมตรงค้าง/ขาด เช่น จอลูกค้าเพิ่งโหลดใหม่หรือใช้เน็ตมือถือ · จอลูกค้าตัดข้อมูลซ้ำ/เก่าทิ้งเอง
    if (code && S.apiUrl) { clearTimeout(this.t); this.t = setTimeout(() => api('displayPush', { code, state: this.last }).catch(() => { }), state.mode === 'cart' ? 150 : 0); }
  },
  send(state) { try { if (this.dc && this.dc.readyState === 'open') { this.dc.send(JSON.stringify(state)); return true; } } catch (e) { } return false; },
  // ฝั่ง POS: คอยรับคำขอเชื่อมตรงจากจอลูกค้า แล้วตอบกลับ
  listen() {
    clearTimeout(this.sigT);
    const code = LS.get('dispCode', '');
    if (!code || !S.apiUrl || !('RTCPeerConnection' in window) || !S.user) return;
    const tick = async () => {
      const open = this.dc && this.dc.readyState === 'open';
      try {
        const off = await sig(code, 'offer');
        // จอลูกค้าขอเชื่อมใหม่ (เช่น เพิ่งรีเฟรช) → ตอบรับทันทีแม้ช่องเดิมยังดูเหมือนเปิดอยู่
        if (off && off.id && off.id !== this.offerId && Date.now() - off.t < 120000) {
          this.offerId = off.id;
          try { this.pc && this.pc.close(); } catch (e) { }
          const pc = this.pc = new RTCPeerConnection(RTC_CFG);
          pc.ondatachannel = ev => {
            const ch = ev.channel; this.dc = ch;
            ch.onopen = () => { this.last && this.send(this.last); };
            ch.onmessage = m => { if (m.data === 'hello' && this.last) this.send(this.last); };
            ch.onclose = () => { if (this.dc === ch) this.dc = null; };
          };
          await pc.setRemoteDescription(off.sdp);
          await pc.setLocalDescription(await pc.createAnswer());
          await iceDone(pc);
          await sig(code, 'answer', { id: off.id, sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: 'answer', sdp: pc.localDescription.sdp } });
        }
      } catch (e) { }
      this.sigT = setTimeout(tick, document.hidden ? 8000 : open ? 5000 : 2500);
    };
    tick();
  }
};
window.Display = Display;
if (Display.bc) Display.bc.onmessage = e => { if (e.data && e.data.hello && Display.last && S.view === 'pos') Display.bc.postMessage(Display.last); };
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
  const code = (hash.split('-')[1] || '').trim();
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
   .dsp .gr{display:grid;grid-template-columns:minmax(0,max-content) max-content;column-gap:0;row-gap:0;padding-left:.6ch;align-items:baseline;justify-content:start;line-height:1.22;font-weight:600}
   .dsp .gr.m{grid-template-columns:max-content max-content}
   .dsp .gr>.n{display:flex;align-items:baseline;gap:.45ch;min-width:0;padding:.06em 2.5ch .06em 0;border-bottom:1px solid #00000012}
   .dsp .gr>.n>s{text-decoration:none;color:#bbb;font-weight:400;flex:none;margin-right:.15ch}
   .dsp .gr>.n>b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
   .dsp .gr>.n>i{font-style:normal;color:#777;font-weight:400;font-size:.8em;white-space:nowrap;flex:none}
   .dsp .gr>.a{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding:.06em 0;border-bottom:1px solid #00000012}
   .dsp .gr>.more{grid-column:1/-1;color:#888;font-size:.72em;font-weight:400;border-bottom:1px dashed #ddd;padding-bottom:.15em;margin-bottom:.1em}
   .dsp .gr>.ln{grid-column:1/-1;height:1px;background:#eee}
   .dsp .gr>.tl{font-size:1.45em;font-weight:800;border-bottom:none;border-top:3px solid #222;margin-top:.15em;padding-top:.12em;color:#111}
   .dsp .gr>.n.tl>b{font-weight:800}
   .dsp .gr>.n.tl>i{font-size:.55em;color:#666;font-weight:500}
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
  const tick = () => { const c = $('#ck', root); if (!c) return clearInterval(tk); c.textContent = bkk() + ' น.'; };
  const tk = setInterval(tick, 5000); tick();
  let cur = null, lastAt = 0;
  const fit = (box, grid, items, tot) => {
    // หาขนาดตัวอักษรที่ใหญ่ที่สุดที่แสดงได้ครบ ไม่ล้นจอ; ถ้าเล็กสุดแล้วยังล้น ยุบรายการเก่าเป็น “+N รายการ”
    const H = box.clientHeight - 4, W = box.clientWidth - 4;
    const minF = Math.max(15, Math.min(22, Math.round(Math.min(innerWidth, innerHeight) / 22)));
    const maxF = Math.max(minF, Math.min(60, Math.round(H / 3.2)));
    const render = (skip, f) => {
      const shown = items.slice(skip), old = items.slice(0, skip);
      grid.style.fontSize = f + 'px';
      grid.innerHTML = (old.length ? `<div class="more">+ ${old.length} รายการก่อนหน้า · ${LB(old.reduce((a, x) => a + num(x.a), 0))}</div>` : '') +
        shown.map(it => { const q = it.w === 'Y' ? num(it.q).toFixed(3).replace(/\.?0+$/, '') + ' กก.' : (num(it.q) !== 1 ? '×' + num(it.q) : ''); return `<div class="n"><s>-</s><b>${esc(it.n)}</b>${q ? `<i>${q}</i>` : ''}</div><div class="a">${LB(it.a)}</div>`; }).join('') +
        (tot ? `<div class="n tl"><b>รวม</b><i>${tot.c} ชิ้น</i></div><div class="a tl">${LB(tot.a)}</div>` : '');
    };
    const fitsH = () => grid.scrollHeight <= H;
    const fitsW = () => { grid.classList.add('m'); const ok = grid.scrollWidth <= W; grid.classList.remove('m'); return ok; };
    let skip = 0, lo = minF, hi = maxF, best = minF;
    render(0, minF);
    if (!fitsH()) { // ยุบรายการเก่า
      while (skip < items.length - 1) { skip++; render(skip, minF); if (fitsH()) break; }
      return;
    }
    while (lo <= hi) { const m = (lo + hi) >> 1; render(0, m); if (fitsH() && fitsW()) { best = m; lo = m + 1; } else hi = m - 1; }
    // ยอมตัดชื่อยาวด้วย … เล็กน้อย เพื่อให้ตัวอักษรใหญ่ขึ้น (อ่านง่ายสำหรับผู้สูงอายุ) — ความสูงต้องพอดีเสมอ
    let bh = best; lo = best; hi = maxF;
    while (lo <= hi) { const m = (lo + hi) >> 1; render(0, m); if (fitsH()) { bh = m; lo = m + 1; } else hi = m - 1; }
    render(0, Math.max(minF, Math.round(Math.max(best, Math.min(bh, Math.round(best * 1.2), Math.round(minF * 2.4))) * .88)));
  };
  // ย่อตัวเลขยอดรวมให้พอดีกว้างของแถบแดง
  const fitOne = el => { if (!el) return; const W = el.parentElement.clientWidth * .92; let f = parseFloat(getComputedStyle(el).fontSize); el.style.fontSize = ''; f = parseFloat(getComputedStyle(el).fontSize); while (el.scrollWidth > W && f > 18) { f -= 2; el.style.fontSize = f + 'px'; } };
  const draw = s => {
    cur = s;
    const lg = (s && s.logo) || '', lm = (s && s.logoMode) || 'mark';
    $('#sh', root).innerHTML = dispLogoHTML(lm, lg, (s && s.shop) || S.settings.shopName, s && s.brandW);
    $('#cs', root).textContent = s && s.cashier ? 'พนักงาน: ' + s.cashier : '';
    const cnt = $('#cnt', root); cnt.innerHTML = `<span class="dot ${Display.rx && Display.rx.readyState === 'open' ? 'on' : ''}" id="lk"></span>` + (s && s.mode !== 'idle' && s.mode !== 'done' && s.count ? `${s.count} รายการ` : '');
    if (!s || s.mode === 'idle' || !s.mode) {
      tt.hidden = true;
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
    if (showAd) { bd.innerHTML = `<div class="lst" id="lst"><div class="gr" id="gr"></div></div><div class="rp ad"><div class="adslot" id="ads"></div>${extras ? `<div class="adx">${extras}</div>` : ''}</div>`; AdPlayer.mount($('#ads', root)); }
    else bd.innerHTML = `<div class="lst" id="lst"><div class="gr" id="gr"></div></div><div class="rp${qr ? ' hasqr' : ''}">${qr || `<div class="rlg">${dispLogoHTML(s.logoMode || 'mark', s.logo || '', s.shop || S.settings.shopName, s.brandW, true)}</div>`}<div class="rl">${s.mode === 'pay' ? 'ยอดที่ต้องชำระ' : 'รวมทั้งหมด'}</div><div class="rv" id="rv">${LB(amt)}</div>${extras}</div>`;
    tt.hidden = true;
    const items = s.items || [];
    // จำนวนที่ถูกตัดตั้งแต่ฝั่ง POS (ส่งมาแค่ 60 ล่าสุด)
    const extra = Math.max(0, (s.count || items.length) - items.length);
    const all = extra ? [{ n: `(+${extra} รายการ)`, q: 1, a: 0 }].concat(items) : items;
    requestAnimationFrame(() => { const box = $('#lst', root), gr = $('#gr', root); if (box && gr) fit(box, gr, all, { a: amt, c: items.reduce((a, x) => a + (x.w === 'Y' ? 1 : num(x.q) || 1), 0) + extra }); fitOne($('#rv', root)); });
  };
  const accept = s => {
    // เครื่องขายใช้เวอร์ชันใหม่กว่า → จอลูกค้าโหลดตัวเองใหม่ (ไม่ต้องไปกดรีเฟรชที่จอลูกค้า)
    if (s && s.ver && s.ver !== APP_VER && sessionStorage.getItem('mm_dver') !== s.ver) { sessionStorage.setItem('mm_dver', s.ver); location.reload(); return; }
    if (!s || (s.at && s.at < lastAt)) return; lastAt = s.at || lastAt; Display.cur = s; draw(s); };
  draw(null);
  addEventListener('resize', () => { clearTimeout(VIEWS.display.rt); VIEWS.display.rt = setTimeout(() => draw(cur), 150); });
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
        ch.onopen = () => { ch.send('hello'); draw(cur); };
        ch.onmessage = m => { try { accept(JSON.parse(m.data)); } catch (e) { } };
        ch.onclose = () => { draw(cur); setTimeout(connect, 3000); };
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
      setTimeout(poll, document.hidden ? 5000 : direct ? 3000 : 700);
    };
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => { }); } catch (e) { } } });
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
     <div id="lgp"></div><div class="tiny muted" style="margin-top:6px">กดบันทึกด้านล่าง แล้วจอลูกค้าจะเปลี่ยนตอนขายบิลถัดไป</div></div><div class="card" id="adc"></div><div class="card"><h3>ข้อความบนจอ</h3><label class="f"><span>ข้อความต้อนรับ</span><input class="in" id="wc" value="${esc(dc.welcome)}"></label><label class="f"><span>ข้อความโปรโมชัน (แสดงตอนว่าง)</span><input class="in" id="pm" value="${esc(dc.promo)}" placeholder="เช่น ส่งฟรี! สั่งครบ 300 บาท โทร 092-806-5163"></label><button class="btn green block" id="sv">บันทึก</button></div>` : ''}`;
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
  const sv = $('#sv', el); if (sv) sv.onclick = async () => { try { busy(1); await saveSetting('displayCfg', { welcome: $('#wc', el).value, promo: $('#pm', el).value, logoMode: ($('[name=lgm]:checked', el) || {}).value || 'mark', logo: lgImg }); busy(0); toast('บันทึกแล้ว'); } catch (e) { busy(0); toast(e.message, 1); } };
};

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
