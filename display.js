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
    state = { ...state, shop: S.settings.shopName || 'ร้านเมย์ มินิมาร์ท', welcome: dc.welcome, promo: dc.promo, cashier: (S.user && S.user.name) || '', at: Date.now() };
    this.last = state;
    try { this.bc && this.bc.postMessage(state); } catch (e) { }
    const direct = this.send(state);
    const code = LS.get('dispCode', '');
    // สำรองผ่านเซิร์ฟเวอร์: ถ้าเชื่อมตรงอยู่ ส่งช้าๆ ไว้กันพลาด (ใช้ตอนจอเพิ่งเปิดใหม่)
    if (code && S.apiUrl) { clearTimeout(this.t); this.t = setTimeout(() => api('displayPush', { code, state: this.last }).catch(() => { }), direct ? 2500 : (state.mode === 'cart' ? 150 : 0)); }
  },
  send(state) { try { if (this.dc && this.dc.readyState === 'open') { this.dc.send(JSON.stringify(state)); return true; } } catch (e) { } return false; },
  // ฝั่ง POS: คอยรับคำขอเชื่อมตรงจากจอลูกค้า แล้วตอบกลับ
  listen() {
    clearTimeout(this.sigT);
    const code = LS.get('dispCode', '');
    if (!code || !S.apiUrl || !('RTCPeerConnection' in window) || !S.user) return;
    const tick = async () => {
      if (this.dc && this.dc.readyState === 'open') return (this.sigT = setTimeout(tick, 8000));
      try {
        const off = await sig(code, 'offer');
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
      this.sigT = setTimeout(tick, document.hidden ? 8000 : 2500);
    };
    tick();
  }
};
window.Display = Display;
if (Display.bc) Display.bc.onmessage = e => { if (e.data && e.data.hello && Display.last && S.view === 'pos') Display.bc.postMessage(Display.last); };
document.addEventListener('mm:booted', () => Display.listen());

const bkk = () => new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
const LB = v => `<span class="cu">฿</span>${money(v, num(v) % 1 ? 2 : 0)}`;

VIEWS.display = (root, hash) => {
  document.body.classList.add('full');
  const code = (hash.split('-')[1] || '').trim();
  root.innerHTML = `<style>
   .dsp{position:fixed;inset:0;background:#fff;display:flex;flex-direction:column;font-family:var(--fh);color:#111;overflow:hidden}
   .dsp .cu{opacity:.38;font-weight:400;margin-right:.08em}
   .dsp .hd{display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--red);color:#fff;font-size:clamp(14px,3.2vmin,26px);flex:none}
   .dsp .hd .sh{flex:1;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
   .dsp .hd .ck{font-weight:700;font-variant-numeric:tabular-nums}
   .dsp .bd{flex:1;display:flex;min-height:0}
   .dsp .lst{flex:1;min-width:0;min-height:0;padding:1vmin 2.5vmin;display:flex;flex-direction:column;justify-content:flex-end}
   .dsp .gr{display:grid;grid-template-columns:minmax(0,max-content) max-content;column-gap:2.5ch;row-gap:.12em;align-items:baseline;justify-content:center;line-height:1.22;font-weight:600}
   .dsp .gr.m{grid-template-columns:max-content max-content}
   .dsp .gr>.n{display:flex;align-items:baseline;gap:.45ch;min-width:0}
   .dsp .gr>.n>b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
   .dsp .gr>.n>i{font-style:normal;color:#777;font-weight:400;font-size:.8em;white-space:nowrap;flex:none}
   .dsp .gr>.a{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
   .dsp .gr>.more{grid-column:1/-1;color:#888;font-size:.72em;font-weight:400;border-bottom:1px dashed #ddd;padding-bottom:.15em;margin-bottom:.1em}
   .dsp .gr>.ln{grid-column:1/-1;height:1px;background:#eee}
   .dsp .tot{flex:none;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:1.2vmin 3vmin}
   .dsp .tot .l{font-size:clamp(16px,4.2vmin,34px);line-height:1.15}
   .dsp .tot .v{font-size:clamp(34px,12vmin,120px);font-weight:800;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}
   .dsp .tot .cu{opacity:.55}
   .dsp .ft{flex:none;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 12px;font-size:clamp(12px,2.8vmin,22px);color:#666;background:#fafafa;border-top:1px solid #eee}
   .dsp .ft .cs{font-weight:700;color:#333;white-space:nowrap}
   .dsp .side{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FFF3F4;padding:2vmin 3vmin;text-align:center;gap:1vmin}
   .dsp .qr{background:#fff;padding:1.5vmin;border-radius:2vmin;box-shadow:0 2px 10px #0001}
   .dsp .qr img{display:block;image-rendering:pixelated;width:min(52vmin,60vw);height:auto}
   .dsp .cen{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1.5vmin;padding:3vmin}
   .dsp .mk{font-weight:800;font-style:italic;color:var(--red);font-size:clamp(60px,24vmin,220px);line-height:1;letter-spacing:-3px}
   .dsp .huge{font-size:clamp(48px,20vmin,200px);font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
   .dsp .pill{background:#fff;color:var(--red);border-radius:99px;padding:.3em .9em;font-weight:700}
   .dsp .co{background:#FFF7E0;color:#8a5a00;border-radius:1.5vmin;padding:.3em .7em;font-weight:700}
   .fsb{position:fixed;left:8px;bottom:40px;opacity:.25;border:0;background:#0002;border-radius:10px;padding:8px 12px;z-index:5}
   .dot{display:inline-block;width:.55em;height:.55em;border-radius:50%;background:#bbb;margin-right:.3em;vertical-align:middle}.dot.on{background:#4ade80}
   @media (orientation:portrait){.dsp .bd{flex-direction:column}.dsp .side{order:-1}.dsp .qr img{width:min(62vw,40vh)}}
  </style><div class="dsp" id="d"><div class="hd"><span class="sh" id="sh"></span><span class="ck" id="ck"></span></div><div class="bd" id="bd"></div><div class="tot" id="tt" hidden></div><div class="ft"><span id="cnt"><span class="dot" id="lk"></span></span><span class="cs" id="cs"></span></div></div><button class="fsb" id="fs">⛶</button>`;
  const bd = $('#bd', root), tt = $('#tt', root);
  const tick = () => { const c = $('#ck', root); if (!c) return clearInterval(tk); c.textContent = bkk() + ' น.'; };
  const tk = setInterval(tick, 5000); tick();
  let cur = null, lastAt = 0;
  const fit = (box, grid, items) => {
    // หาขนาดตัวอักษรที่ใหญ่ที่สุดที่แสดงได้ครบ ไม่ล้นจอ; ถ้าเล็กสุดแล้วยังล้น ยุบรายการเก่าเป็น “+N รายการ”
    const H = box.clientHeight - 4, W = box.clientWidth - 4;
    const minF = Math.max(15, Math.min(22, Math.round(Math.min(innerWidth, innerHeight) / 22)));
    const maxF = Math.max(minF, Math.min(72, Math.round(H / 2.6)));
    const render = (skip, f) => {
      const shown = items.slice(skip), old = items.slice(0, skip);
      grid.style.fontSize = f + 'px';
      grid.innerHTML = (old.length ? `<div class="more">+ ${old.length} รายการก่อนหน้า · ${LB(old.reduce((a, x) => a + num(x.a), 0))}</div>` : '') +
        shown.map(it => { const q = it.w === 'Y' ? num(it.q).toFixed(3).replace(/\.?0+$/, '') + ' กก.' : (num(it.q) !== 1 ? '×' + num(it.q) : ''); return `<div class="n"><b>${esc(it.n)}</b>${q ? `<i>${q}</i>` : ''}</div><div class="a">${LB(it.a)}</div>`; }).join('');
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
    render(0, Math.max(best, Math.min(bh, Math.round(best * 1.2), Math.round(minF * 2.4))));
  };
  const draw = s => {
    cur = s;
    $('#sh', root).textContent = (s && s.shop) || S.settings.shopName || 'ร้านเมย์ มินิมาร์ท';
    $('#cs', root).textContent = s && s.cashier ? 'พนักงาน: ' + s.cashier : '';
    const cnt = $('#cnt', root); cnt.innerHTML = `<span class="dot ${Display.rx && Display.rx.readyState === 'open' ? 'on' : ''}" id="lk"></span>` + (s && s.mode !== 'idle' && s.mode !== 'done' && s.count ? `${s.count} รายการ` : '');
    if (!s || s.mode === 'idle' || !s.mode) {
      tt.hidden = true;
      bd.innerHTML = `<div class="cen"><div style="font-size:4vmin;color:var(--red-d)">ร้าน</div><div class="mk">เมย์</div><div style="font-size:5vmin;font-style:italic;color:var(--red)">Mini Mart</div><div style="font-size:6vmin;margin-top:1vmin">${esc((s && s.welcome) || 'ยินดีต้อนรับ')}</div>${s && s.promo ? `<div style="font-size:4.5vmin;background:var(--green);color:#fff;border-radius:2vmin;padding:1vmin 3vmin">${esc(s.promo)}</div>` : ''}</div>`;
      return;
    }
    if (s.mode === 'done') {
      tt.hidden = true;
      bd.innerHTML = `<div class="cen"><div style="font-size:8vmin;color:var(--green);font-weight:800">ขอบคุณค่ะ 🙏</div>${num(s.change) > 0 ? `<div style="font-size:5vmin">เงินทอน</div><div class="huge" style="color:var(--green)">${LB(s.change)}</div><div style="font-size:4vmin;color:#555">รับเงิน ${LB(s.cash)} · ยอด ${LB(s.total)}</div>` : `<div style="font-size:6vmin">ยอดชำระ ${LB(s.total)}</div>`}${num(s.cashOut) ? `<div class="co" style="font-size:5vmin">รับเงินสด ${LB(s.cashOut)}</div>` : ''}</div>`;
      return;
    }
    const amt = s.mode === 'pay' && s.amount != null ? s.amount : s.total;
    const side = s.mode === 'pay' && s.qr ? `<div class="side"><div style="font-size:4.5vmin;font-weight:700;color:var(--red)">สแกนจ่าย</div><div class="qr"><img src="${s.qr}"></div><div style="font-size:3.4vmin;color:#555">${esc(s.qrLabel || '')}</div></div>` : '';
    bd.innerHTML = `<div class="lst" id="lst"><div class="gr" id="gr"></div></div>${side}`;
    tt.hidden = false;
    tt.innerHTML = `<div class="l">${s.mode === 'pay' ? 'ยอดที่ต้องชำระ' : 'รวม'}${num(s.disc) ? `<div style="font-size:.75em;opacity:.9">ส่วนลด ${LB(s.disc)}</div>` : ''}${s.customer ? `<div><span class="pill" style="font-size:.7em">${esc(s.customer)}</span></div>` : ''}${num(s.cashOut) ? `<div class="co" style="font-size:.75em;margin-top:.2em">รับเงินสด ${LB(s.cashOut)}</div>` : ''}</div><div class="v">${LB(amt)}</div>`;
    const items = s.items || [];
    // จำนวนที่ถูกตัดตั้งแต่ฝั่ง POS (ส่งมาแค่ 60 ล่าสุด)
    const extra = Math.max(0, (s.count || items.length) - items.length);
    const all = extra ? [{ n: `(+${extra} รายการ)`, q: 1, a: 0 }].concat(items) : items;
    requestAnimationFrame(() => { const box = $('#lst', root), gr = $('#gr', root); if (box && gr) fit(box, gr, all); });
  };
  const accept = s => { if (!s || (s.at && s.at < lastAt)) return; lastAt = s.at || lastAt; Display.cur = s; draw(s); };
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
      setTimeout(poll, document.hidden ? 5000 : direct ? 6000 : 1000);
    };
    poll();
  }
  $('#fs', root).onclick = async () => { try { await document.documentElement.requestFullscreen(); } catch (e) { } try { await navigator.wakeLock.request('screen'); } catch (e) { } };
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
   ${isOwner() ? `<div class="card"><h3>ข้อความบนจอ</h3><label class="f"><span>ข้อความต้อนรับ</span><input class="in" id="wc" value="${esc(dc.welcome)}"></label><label class="f"><span>ข้อความโปรโมชัน (แสดงตอนว่าง)</span><input class="in" id="pm" value="${esc(dc.promo)}" placeholder="เช่น ส่งฟรี! สั่งครบ 300 บาท โทร 092-806-5163"></label><button class="btn green block" id="sv">บันทึก</button></div>` : ''}`;
  $('#op', el).onclick = () => { const w = window.open(base + '#display', 'mmdisplay', 'popup,width=1024,height=640'); if (!w) toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต pop-up ก่อน', 1); };
  const pair = $('#pair', el); if (pair) pair.onclick = () => { LS.set('dispCode', String(Math.floor(100000 + Math.random() * 900000))); Display.listen(); go('displayset'); };
  const off = $('#off', el); if (off) off.onclick = () => { LS.del('dispCode'); go('displayset'); };
  const cp = $('#cp', el); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(base + '#display-' + code); toast('คัดลอกแล้ว'); } catch (e) { toast('คัดลอกไม่ได้', 1); } };
  if (code) qrDataUrl(base + '#display-' + code, 4).then(src => { const q = $('#qr', el); if (q) q.innerHTML = `<img src="${src}" style="width:100%">`; }).catch(() => { });
  const sv = $('#sv', el); if (sv) sv.onclick = async () => { try { busy(1); await saveSetting('displayCfg', { welcome: $('#wc', el).value, promo: $('#pm', el).value }); busy(0); toast('บันทึกแล้ว'); } catch (e) { busy(0); toast(e.message, 1); } };
};
