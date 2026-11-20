/* =========================================================
   จอแสดงผลฝั่งลูกค้า
   - เครื่องเดียวกัน (จอที่ 2 / หน้าต่างใหม่): ส่งผ่าน BroadcastChannel ทันที
   - อีกเครื่อง (แท็บเล็ต/มือถือ): จับคู่ด้วยรหัส ส่งผ่านเซิร์ฟเวอร์ ทุก ~1.5 วินาที
   ========================================================= */
'use strict';
const Display = {
  bc: ('BroadcastChannel' in window) ? new BroadcastChannel('mm-display') : null,
  last: null, t: null,
  push(state) {
    const dc = cfg('displayCfg', { welcome: 'ยินดีต้อนรับ', promo: '' });
    state = { ...state, shop: S.settings.shopName || 'ร้านเมย์ มินิมาร์ท', welcome: dc.welcome, promo: dc.promo, at: Date.now() };
    this.last = state;
    try { this.bc && this.bc.postMessage(state); } catch (e) { }
    const code = LS.get('dispCode', '');
    if (code && S.apiUrl) { clearTimeout(this.t); this.t = setTimeout(() => api('displayPush', { code, state: this.last }).catch(() => { }), state.mode === 'cart' ? 350 : 50); }
  }
};
window.Display = Display;
if (Display.bc) Display.bc.onmessage = e => { if (e.data && e.data.hello && Display.last && S.view === 'pos') Display.bc.postMessage(Display.last); };

VIEWS.display = (root, hash) => {
  document.body.classList.add('full');
  const code = (hash.split('-')[1] || '').trim();
  root.innerHTML = `<style>
   .dsp{position:fixed;inset:0;background:linear-gradient(135deg,#fff 0%,#FFF3F4 100%);display:flex;font-family:Prompt,"Noto Sans Thai",sans-serif;color:#1d1b1c}
   .dsp .l{flex:1.2;display:flex;flex-direction:column;padding:3vh 3vw;min-width:0}
   .dsp .r{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--red);color:#fff;padding:3vh 3vw;text-align:center}
   .dsp .it{display:flex;gap:12px;font-size:clamp(16px,2.6vh,30px);padding:1.1vh 0;border-bottom:1px solid #F0E0E2}
   .dsp .big{font-size:clamp(48px,13vh,150px);font-weight:700;line-height:1}
   .dsp .idle{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(120% 80% at 50% 0%,#FFE1E5,#fff 70%);text-align:center;gap:2vh}
   .dsp .mk{font-weight:800;font-style:italic;color:var(--red);font-size:clamp(60px,18vh,200px);line-height:1;letter-spacing:-3px}
   .dsp .fs{position:fixed;right:12px;bottom:12px;opacity:.35;border:0;background:#0002;color:#000;border-radius:10px;padding:8px 12px;cursor:pointer}
   @media (orientation:portrait){.dsp{flex-direction:column}.dsp .r{flex:none;min-height:42vh}}
  </style><div class="dsp" id="d"></div><button class="fs" id="fs">เต็มจอ</button>`;
  const d = $('#d', root);
  const draw = s => {
    if (!s || s.mode === 'idle' || !s.mode) {
      const now = new Date();
      d.innerHTML = `<div class="idle"><div style="font-size:3vh;color:var(--red-d)">ร้าน</div><div class="mk">เมย์</div><div style="font-size:3.4vh;font-style:italic;color:var(--red)">Mini Mart</div><div style="font-size:4vh;margin-top:2vh">${esc((s && s.welcome) || 'ยินดีต้อนรับ')}</div>${s && s.promo ? `<div style="font-size:3vh;background:var(--green);color:#fff;border-radius:16px;padding:1.4vh 3vw;max-width:80vw">${esc(s.promo)}</div>` : ''}<div style="font-size:2.4vh;color:#888">${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</div></div>`;
      return;
    }
    if (s.mode === 'done') {
      d.innerHTML = `<div class="idle"><div style="font-size:6vh;color:var(--green);font-weight:700">ขอบคุณค่ะ</div>${num(s.change) > 0 ? `<div style="font-size:3.5vh">เงินทอน</div><div class="big" style="color:var(--green)">${baht(s.change)}</div><div style="font-size:2.6vh;color:#666">รับเงิน ${baht(s.cash)} · ยอดชำระ ${baht(s.total)}</div>` : `<div style="font-size:3.5vh">ยอดชำระ ${baht(s.total)}</div>`}<div style="font-size:2.6vh;color:#888">${esc(s.shop)}</div></div>`;
      return;
    }
    const items = (s.items || []).map(it => `<div class="it"><div style="flex:1;min-width:0">${esc(it.n)} <span style="color:#999">× ${it.w === 'Y' ? num(it.q).toFixed(3).replace(/\.?0+$/, '') + ' กก.' : num(it.q)}</span></div><div>${money(it.a)}</div></div>`).join('');
    const right = s.mode === 'pay' && s.qr
      ? `<div style="font-size:3vh">สแกนเพื่อชำระเงิน</div><div style="background:#fff;padding:2vh;border-radius:2vh;margin:2vh 0"><img src="${s.qr}" style="width:min(36vh,30vw);height:auto;image-rendering:pixelated;display:block"></div><div class="big" style="font-size:clamp(36px,9vh,100px)">${baht(s.amount)}</div><div style="font-size:2.2vh;opacity:.9">${esc(s.qrLabel || '')}</div>`
      : `<div style="font-size:3.2vh;opacity:.9">${s.mode === 'pay' ? 'ยอดที่ต้องชำระ' : 'รวมทั้งหมด'}</div><div class="big">${baht(s.mode === 'pay' && s.amount != null ? s.amount : s.total)}</div>${num(s.disc) ? `<div style="font-size:2.6vh;margin-top:1vh">ส่วนลด ${baht(s.disc)}</div>` : ''}${s.customer ? `<div style="font-size:2.6vh;margin-top:2vh;background:#fff3;border-radius:99px;padding:.6vh 2vw">สมาชิก: ${esc(s.customer)}</div>` : ''}`;
    d.innerHTML = `<div class="l"><div style="font-size:3vh;font-weight:700;color:var(--red);margin-bottom:1vh">${esc(s.shop)}</div><div style="flex:1;overflow:hidden">${items}</div><div style="font-size:2.4vh;color:#888">${s.count} รายการ</div></div><div class="r">${right}</div>`;
  };
  draw(null);
  setInterval(() => { if (!d.querySelector('.it') && !/ขอบคุณ/.test(d.textContent)) draw(Display.cur); }, 30000);
  if (!code) {
    if (Display.bc) { Display.bc.onmessage = e => { if (e.data && !e.data.hello) { Display.cur = e.data; draw(e.data); } }; Display.bc.postMessage({ hello: 1 }); }
  } else {
    let v = '';
    const poll = async () => {
      try {
        const r = S.apiUrl ? await fetch(S.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'displayPull', payload: { code, v } }) }).then(x => x.json()) : null;
        if (r && r.ok && !r.same && r.v) { v = r.v; Display.cur = r.state; draw(r.state); }
      } catch (e) { }
      setTimeout(poll, document.hidden ? 4000 : 1500);
    };
    if (!S.apiUrl) d.innerHTML = '<div class="idle"><div style="font-size:3vh">เครื่องนี้ยังไม่ได้ตั้งค่า URL เซิร์ฟเวอร์ — เปิดแอปตามปกติ แตะ “ตั้งค่าการเชื่อมต่อ” ก่อน แล้วเปิดลิงก์จอลูกค้าอีกครั้ง</div></div>';
    else poll();
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
  const pair = $('#pair', el); if (pair) pair.onclick = () => { LS.set('dispCode', String(Math.floor(100000 + Math.random() * 900000))); go('displayset'); };
  const off = $('#off', el); if (off) off.onclick = () => { LS.del('dispCode'); go('displayset'); };
  const cp = $('#cp', el); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(base + '#display-' + code); toast('คัดลอกแล้ว'); } catch (e) { toast('คัดลอกไม่ได้', 1); } };
  if (code) qrDataUrl(base + '#display-' + code, 4).then(src => { const q = $('#qr', el); if (q) q.innerHTML = `<img src="${src}" style="width:100%">`; }).catch(() => { });
  const sv = $('#sv', el); if (sv) sv.onclick = async () => { try { busy(1); await saveSetting('displayCfg', { welcome: $('#wc', el).value, promo: $('#pm', el).value }); busy(0); toast('บันทึกแล้ว'); } catch (e) { busy(0); toast(e.message, 1); } };
};
