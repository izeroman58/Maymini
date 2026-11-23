'use strict';
/* =========================================================
   หน้าจอลูกค้าตอนว่าง (ยังไม่มีการขาย) — ภาพเวกเตอร์เคลื่อนไหว โทนขาว·แดง·เขียว
   - ข้อความทั้งหมดเจ้าของร้านแก้ได้ (เพิ่มเติม › จอแสดงผลฝั่งลูกค้า › หน้าจอตอนว่าง)
   - วิดีโอ: ลิงก์ YouTube / ไฟล์ .mp4 จากเว็บ (เล่นบนเครื่องจอลูกค้าเท่านั้น ไม่กระทบเครื่องขาย)
   - ใช้หน่วย cq (ขนาดตามกล่อง) → ตัวอย่างในหน้าตั้งค่าหน้าตาเหมือนจอจริง
   - เคลื่อนไหวด้วย CSS transform/opacity ล้วน (ใช้การ์ดจอ เบามาก)
   ========================================================= */
const IDLE_DEF = { style: 'festive', top: 'ยินดีต้อนรับสู่', big: 'ร้านเมย์', tag: 'MINI MART', sub: '', note: '', info: '', phone: '', qr: '', yt: '', ride: true, font: 'prompt', fontId: '', fontName: '', slides: [], sec: 8, fx: true, fit: 'contain' };
// ฟอนต์หัวข้อ (ไม่มีหัว) — Google Fonts ฟรี หรือไฟล์ฟอนต์ของร้านเอง (เช่น PSL Omyim ที่ร้านมีลิขสิทธิ์)
const IDLE_FONTS = { prompt: ['Prompt', 'Prompt'], kanit: ['Kanit', 'Kanit'], mitr: ['Mitr', 'Mitr'], anuphan: ['Anuphan', 'Anuphan'], baij: ['Bai Jamjuree', 'Bai+Jamjuree'], custom: ['IdleCustom', ''] };
const IdleFont = {
  loaded: {},
  family(c) { const f = IDLE_FONTS[c.font] || IDLE_FONTS.prompt; return `"${f[0]}","Prompt","Noto Sans Thai",sans-serif`; },
  async ensure(c) {
    const k = c.font === 'custom' ? 'custom:' + c.fontId : c.font; if (!c.font || c.font === 'prompt' || this.loaded[k]) return;
    this.loaded[k] = 1;
    try {
      if (c.font === 'custom') { if (!c.fontId || typeof AdFiles === 'undefined') return; const u = await AdFiles.url(c.fontId); const ff = new FontFace('IdleCustom', `url(${u})`); await ff.load(); document.fonts.add(ff); }
      else { const f = IDLE_FONTS[c.font]; if (!f) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${f[1]}:wght@600;700;800&display=swap`; document.head.appendChild(l); }
    } catch (e) { delete this.loaded[k]; }
  }
};
const idleCfg = dc => ({ ...IDLE_DEF, ...((dc && dc.idle) || {}) });
function ytId(u) {
  u = String(u || '').trim(); if (!u) return '';
  const m = u.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/); return m ? m[1] : (/^[\w-]{11}$/.test(u) ? u : '');
}
function idleVideoHTML(u) {
  const id = ytId(u);
  if (id) return `<iframe class="iv" src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen frameborder="0"></iframe>`;
  if (/^https?:\/\/.+\.(mp4|webm)(\?.*)?$/i.test(String(u || '').trim())) return `<video class="iv" src="${esc(u)}" autoplay muted loop playsinline></video>`;
  return '';
}
function idleScene(s, preview) {
  const c = { ...IDLE_DEF, ...(s.idle || {}) }, fest = c.style !== 'clean';
  IdleFont.ensure(c);
  const fw = (x, y, r, col, d) => `<g class="fw" style="transform-origin:${x}px ${y}px;animation-delay:${d}s">${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, r1 = r * .35, r2 = r; return `<line x1="${x + Math.cos(a) * r1}" y1="${y + Math.sin(a) * r1}" x2="${x + Math.cos(a) * r2}" y2="${y + Math.sin(a) * r2}" stroke="${col}" stroke-width="5" stroke-linecap="round"/>`; }).join('')}<circle cx="${x}" cy="${y}" r="${r * .16}" fill="none" stroke="${col}" stroke-width="5"/></g>`;
  const fx = (on) => on ? `<svg class="ibg fxo" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${[[220, 160, 110, '#F2735E', 0], [1380, 180, 90, '#A98BC9', 1.1], [820, 120, 70, '#F4A21C', 2], [1250, 700, 80, '#1FB35B', .6], [300, 720, 70, '#E84393', 1.7]].map(a => fw(...a)).join('')}</svg><div class="iconf">${Array.from({ length: 22 }, (_, i) => `<i style="left:${(i * 31 + 5) % 100}%;background:${['#E8432E', '#1FB35B', '#F4A21C', '#4E9BD6', '#E84393'][i % 5]};animation-delay:${-(i * 1.07) % 9}s;animation-duration:${6 + (i % 6)}s"></i>`).join('')}</div><div class="isparkle">${Array.from({ length: 10 }, (_, i) => `<b style="left:${(i * 47 + 9) % 96}%;top:${(i * 29 + 7) % 90}%;animation-delay:${i * .37}s">✦</b>`).join('')}</div>` : '';
  if (c.style === 'slides') {
    const L = (c.slides || []).filter(x => x && x.id);
    return `<div class="idsc slides${preview ? ' pv' : ''}" style="--if:${IdleFont.family(c)}" data-sec="${Math.max(3, +c.sec || 8)}" data-fit="${c.fit === 'cover' ? 'cover' : 'contain'}" data-ids="${esc(L.map(x => x.id).join(','))}"><div class="isl"></div>${fx(c.fx !== false)}${L.length ? '' : '<div class="iempty">ยังไม่มีภาพ — เพิ่มภาพที่ เพิ่มเติม › จอลูกค้า › หน้าจอตอนว่าง</div>'}${c.phone ? `<div class="icta" style="position:absolute;right:3cqw;bottom:3cqh"><div class="iph">📞 สั่งเลย โทร. <b>${esc(c.phone)}</b></div></div>` : ''}</div>`;
  }
  const vid = c.yt ? idleVideoHTML(c.yt) : '';
  const lines = String(c.info || '').split('\n').map(x => x.trim()).filter(Boolean);
  const flags = ['#F4A21C', '#E8432E', '#D96B6B', '#1FC59B', '#4E7FA8', '#F4A21C', '#E8432E'];
  const conf = fest ? Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 37 + 7) % 100}%;background:${['#E8432E', '#1FB35B', '#F4A21C', '#4E9BD6', '#E84393'][i % 5]};animation-delay:${-(i * 1.13) % 9}s;animation-duration:${7 + (i % 5)}s;transform:rotate(${i * 40}deg)"></i>`).join('') : '';
  const store = `<g transform="translate(600 610)">
      <rect x="40" y="-60" width="230" height="56" rx="6" fill="#C8102E"/><text x="155" y="-23" text-anchor="middle" font-family="Prompt" font-weight="800" font-style="italic" font-size="34" fill="#fff">${esc(((s.shop || 'ร้านเมย์').replace(/^ร้าน\s*/, '').split(/\s+/)[0] || 'เมย์').slice(0, 10))}</text>
      <rect x="0" y="10" width="330" height="22" fill="#D6001C"/><rect x="10" y="32" width="310" height="148" fill="#F3F3F3"/>
      ${Array.from({ length: 8 }, (_, i) => `<path d="M${i * 41.25} 32 h41.25 l-4 34 a16.6 16.6 0 0 1 -33.2 0z" fill="${i % 2 ? '#fff' : '#E31B23'}"/>`).join('')}
      <rect x="30" y="85" width="150" height="80" fill="#8ED3E8"/><rect x="200" y="85" width="100" height="95" fill="#8ED3E8"/><path d="M105 85v80M250 85v95" stroke="#fff" stroke-width="5"/><rect x="10" y="160" width="310" height="20" fill="#E31B23"/></g>
    <g transform="translate(470 690)"><path d="M0 60 L60 20 L120 60z" fill="#5A5A6E"/><rect x="10" y="60" width="100" height="60" fill="#F2B08A"/><rect x="25" y="75" width="25" height="45" fill="#fff"/><rect x="65" y="75" width="32" height="24" fill="#8ED3E8"/></g>
    <g transform="translate(950 690)"><circle cx="20" cy="70" r="34" fill="#9BCB5E"/><path d="M30 60 L105 18 L180 60z" fill="#3D3F5C"/><rect x="40" y="60" width="130" height="60" fill="#EDE6DC"/><rect x="58" y="75" width="40" height="28" fill="#8ED3E8"/><rect x="112" y="75" width="22" height="45" fill="#B5643C"/><circle cx="185" cy="96" r="26" fill="#A8D46F"/></g>`;
  const scooter = c.ride !== false ? `<g class="ride"><g class="bob">
      <ellipse cx="0" cy="118" rx="95" ry="8" fill="#0002"/>
      <circle cx="-62" cy="90" r="30" fill="#333"/><circle cx="-62" cy="90" r="13" fill="#ddd"/><circle cx="62" cy="90" r="30" fill="#333"/><circle cx="62" cy="90" r="13" fill="#ddd"/>
      <path d="M-95 70 q10 -45 60 -45 h40 l25 40 h40 q20 0 25 25 h-40 q-10 -20 -30 -20 h-90 q-25 0 -30 20z" fill="#E31B23"/>
      <rect x="-105" y="-20" width="62" height="52" rx="8" fill="#222"/><text x="-74" y="12" text-anchor="middle" font-family="Prompt" font-weight="800" font-style="italic" font-size="17" fill="#fff">DELIVERY</text>
      <path d="M-20 25 q-6 -40 16 -55 l26 6 q8 30 -4 49z" fill="#E31B23"/><path d="M-10 24 l45 2 l10 40 h-14 l-12 -28 h-30z" fill="#4A4F7A"/>
      <circle cx="10" cy="-50" r="21" fill="#E31B23"/><path d="M-8 -55 a20 20 0 0 1 38 -4 l8 4 h-24z" fill="#fff" opacity=".9"/><circle cx="20" cy="-45" r="9" fill="#F2C9A0"/>
      <path d="M12 -22 l40 8" stroke="#F2C9A0" stroke-width="8" stroke-linecap="round"/><path d="M60 -30 l10 40" stroke="#444" stroke-width="6"/>
      <g class="puff"><circle cx="-115" cy="95" r="10" fill="#fff"/><circle cx="-135" cy="88" r="14" fill="#fff"/><circle cx="-160" cy="96" r="9" fill="#fff"/></g></g></g>` : '';
  const head = `<div class="ihd">${c.top ? `<div class="it1">${esc(c.top)}</div>` : ''}<div class="ibig">${esc(c.big || '')}${c.tag ? `<span class="itag">${esc(c.tag)}</span>` : ''}</div></div>`;
  return `<div class="idsc${fest ? ' fest' : ''}${preview ? ' pv' : ''}" style="--if:${IdleFont.family(c)}">
    <svg class="ibg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs><pattern id="idots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="3.2" fill="#F7D9C8"/></pattern></defs>
      <path d="M-50 900 C 80 520 260 420 420 560 C 520 650 470 900 470 900z" fill="#FDE9DC"/><path d="M1650 900 C 1560 520 1400 380 1240 470 C 1110 560 1180 900 1180 900z" fill="#FDE9DC"/>
      <rect x="0" y="300" width="230" height="230" fill="url(#idots)" opacity=".7"/><rect x="1370" y="240" width="230" height="260" fill="url(#idots)" opacity=".7"/>
      ${fest ? fw(560, 70, 150, '#F2735E', 0) + fw(960, 600, 120, '#F2735E', 1.2) + fw(1170, 70, 70, '#A98BC9', .6) + fw(1380, 560, 60, '#F4A21C', 2.1) : ''}
      ${fest ? `<g class="flagline"><path d="M1060 20 Q 1330 120 1620 60" fill="none" stroke="#333" stroke-width="3"/>${flags.map((f, i) => { const x = 1080 + i * 78, y = 30 + Math.sin(i / 6 * Math.PI) * 52; return `<path class="flag" style="animation-delay:${i * .15}s;transform-origin:${x + 30}px ${y}px" d="M${x} ${y} l60 6 l-24 74z" fill="${f}"/>`; }).join('')}</g>` : ''}
      <rect x="0" y="808" width="1600" height="92" fill="#8C8C8C"/><rect x="0" y="800" width="1600" height="10" fill="#7EBB4A"/>
      <g class="dash">${Array.from({ length: 20 }, (_, i) => `<rect x="${i * 100}" y="850" width="50" height="6" rx="3" fill="#fff" opacity=".6"/>`).join('')}</g>
      ${store}
      ${scooter ? `<g transform="translate(0 700)">${scooter}</g>` : ''}
    </svg>
    <div class="iconf">${conf}</div>
    <div class="ilay">
      <div class="ileft"><img class="ilogo" src="${s.brandC || 'logo.png'}" alt="">${s.welcome ? `<div class="iwel">${esc(s.welcome)}</div>` : ''}${lines.map((l, i) => `<div class="iln${i ? '' : ' b'}">${esc(l)}</div>`).join('')}</div>
      <div class="iright">${vid ? `<div class="ivw">${vid}</div>${head.replace('class="ihd"', 'class="ihd sm"')}` : head}</div>
      <div class="ibot">${c.sub ? `<div class="isub">${esc(c.sub)}</div>` : ''}${c.note ? `<div class="inote">${esc(c.note)}</div>` : ''}${s.promo ? `<div class="ipromo">${esc(s.promo)}</div>` : ''}</div>
      <div class="icta">${c.qr ? `<div class="iqr" data-qr="${esc(c.qr)}"></div>` : ''}${c.phone ? `<div class="iph">📞 สั่งเลย โทร. <b>${esc(c.phone)}</b></div>` : ''}</div>
    </div></div>`;
}
// วาด QR ในหน้าจอว่าง (ทำหลังใส่ HTML)
function idleSlides(root) {
  const sc = $('.idsc.slides', root); if (!sc || sc._run) return; sc._run = 1;
  const ids = (sc.dataset.ids || '').split(',').filter(Boolean), sec = +sc.dataset.sec || 8, fit = sc.dataset.fit, box = $('.isl', sc);
  if (!ids.length) return;
  let i = -1;
  const next = async () => {
    if (!sc.isConnected) return;
    i = (i + 1) % ids.length;
    let u; try { u = await AdFiles.url(ids[i]); } catch (e) { return setTimeout(next, 1500); }
    if (!sc.isConnected) return;
    const im = document.createElement('img'); im.src = u; im.alt = ''; im.className = 'is ' + (i % 2 ? 'kb2' : 'kb1'); im.style.objectFit = fit; im.style.animationDuration = (sec + 1.5) + 's';
    im.onload = () => { box.appendChild(im); requestAnimationFrame(() => im.classList.add('on')); const old = [...box.children].filter(x => x !== im); setTimeout(() => old.forEach(o => o.remove()), 1300); ids.slice(i + 1, i + 2).forEach(x => AdFiles.url(x).catch(() => { })); };
    im.onerror = () => setTimeout(next, 500);
    if (ids.length > 1) setTimeout(next, sec * 1000);
  };
  next();
}
function idleAfter(root) {
  idleSlides(root); $$('.iqr[data-qr]', root).forEach(q => { const t = q.dataset.qr; q.removeAttribute('data-qr'); (window.qrDataUrl ? qrDataUrl(t, 6) : Promise.reject()).then(src => { q.innerHTML = `<img src="${src}" alt="">`; }).catch(() => q.remove()); }); }
(function () {
  const st = document.createElement('style');
  st.textContent = `.idsc{position:relative;width:100%;height:100%;overflow:hidden;background:#FFFDFB;container-type:size;font-family:"Sarabun","Noto Sans Thai",sans-serif;color:#2B2B2B}
.idsc .ibg{position:absolute;inset:0;width:100%;height:100%}
.idsc .fw{animation:ifw 3.2s ease-out infinite;opacity:0}@keyframes ifw{0%{transform:scale(.2);opacity:0}15%{opacity:1}60%{transform:scale(1);opacity:.9}100%{transform:scale(1.15);opacity:0}}
.idsc .flag{animation:iflag 2.4s ease-in-out infinite}@keyframes iflag{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(6deg)}}
.idsc .ride{animation:iride 16s linear infinite}@keyframes iride{0%{transform:translateX(1800px)}100%{transform:translateX(-260px)}}
.idsc .bob{animation:ibob .5s ease-in-out infinite alternate}@keyframes ibob{to{transform:translateY(-4px)}}
.idsc .puff{animation:ipuff .9s ease-out infinite}@keyframes ipuff{0%{opacity:.9;transform:translateX(0)}100%{opacity:0;transform:translateX(40px)}}
.idsc .dash{animation:idash 1.2s linear infinite}@keyframes idash{to{transform:translateX(-100px)}}
.idsc .iconf{position:absolute;inset:0;pointer-events:none;overflow:hidden}.idsc .iconf i{position:absolute;top:-4cqh;width:1.1cqmin;height:2.2cqmin;border-radius:.3cqmin;opacity:.85;animation:iconf linear infinite}
@keyframes iconf{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(110cqh) rotate(720deg)}}
.idsc .ilay{position:absolute;inset:0;display:grid;grid-template-columns:36% 1fr;grid-template-rows:1fr auto;padding:3cqh 3cqw 13cqh;gap:1cqh 2cqw}
.idsc .ileft{display:flex;flex-direction:column;align-items:center;text-align:center;gap:.6cqh;min-width:0}
.idsc .ilogo{height:min(22cqh,26cqw);width:auto;max-width:100%;object-fit:contain;margin-bottom:.5cqh}
.idsc .iwel{font-family:"Prompt",sans-serif;font-weight:700;font-size:4cqmin;color:#C8102E}
.idsc .iln{font-weight:700;font-size:2.9cqmin;line-height:1.35}.idsc .iln.b{font-size:3.1cqmin}
.idsc .iright{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0}
.idsc .ihd{text-align:center;font-family:"Prompt",sans-serif;color:#0A9447;line-height:1}
.idsc .it1{font-weight:800;font-size:8cqmin;letter-spacing:-.02em;animation:ipop 4s ease-in-out infinite}
.idsc .ibig{font-weight:800;font-size:19cqmin;letter-spacing:-.03em;display:inline-flex;align-items:flex-end;gap:1cqw;animation:ipop 4s ease-in-out infinite .3s}
.idsc .itag{font-size:5cqmin;font-style:italic;font-weight:800;border-bottom:.6cqmin solid #0A9447;padding-bottom:.4cqmin;margin-bottom:2.6cqmin}
@keyframes ipop{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.idsc .ihd.sm .it1{font-size:4.5cqmin}.idsc .ihd.sm .ibig{font-size:8cqmin}.idsc .ihd.sm .itag{font-size:3cqmin;margin-bottom:1.2cqmin}
.idsc .ivw{width:100%;max-width:62cqw;aspect-ratio:16/9;border-radius:2cqmin;overflow:hidden;background:#000;box-shadow:0 1cqmin 4cqmin #0003;margin-bottom:1.5cqh}.idsc .iv{width:100%;height:100%;border:0;display:block;object-fit:cover}
.idsc .ibot{grid-column:1;align-self:end;min-width:0;max-width:36cqw;background:rgba(255,253,251,.82);border-radius:1.5cqmin;padding:.6cqh 1cqw}.idsc .ibot:empty{display:none}
.idsc .isub{font-family:"Prompt",sans-serif;font-weight:800;font-size:4.2cqmin;line-height:1.15;color:#1E1E1E;text-shadow:0 0 1cqmin #fff}
.idsc .inote{font-weight:700;font-size:2.6cqmin;text-shadow:0 0 1cqmin #fff}
.idsc .ipromo{display:inline-block;margin-top:.8cqh;background:#0A9447;color:#fff;font-weight:700;font-size:3cqmin;border-radius:1.5cqmin;padding:.6cqh 1.6cqw}
.idsc .icta{grid-column:2;align-self:end;justify-self:end;display:flex;align-items:flex-end;gap:2cqw}
.idsc .iqr{background:#fff;padding:1cqmin;border-radius:1.5cqmin;box-shadow:0 .6cqmin 2cqmin #0002}.idsc .iqr img{display:block;width:17cqmin;height:17cqmin;image-rendering:pixelated}
.idsc .iph{background:#fff;color:#C8102E;border:.7cqmin solid #E31B23;border-radius:99px;padding:1cqh 2.4cqw;font-family:"Prompt",sans-serif;font-weight:700;font-size:3.2cqmin;white-space:nowrap;box-shadow:0 .6cqmin 2cqmin #0002;animation:iph 2.2s ease-in-out infinite}
.idsc .iph b{font-size:4.4cqmin;font-weight:800}@keyframes iph{0%,100%{transform:translateY(0)}50%{transform:translateY(-.8cqh)}}
@container (max-aspect-ratio: 1/1){.idsc .ilay{grid-template-columns:1fr;grid-template-rows:auto 1fr auto auto;padding-bottom:12cqh}.idsc .ibot,.idsc .icta{grid-column:1;justify-self:center;text-align:center}.idsc .ibig{font-size:15cqmin}}
.idsc,.idsc .iwel,.idsc .ihd,.idsc .isub,.idsc .iph{font-family:var(--if,"Prompt")}.idsc .iln,.idsc .inote{font-family:var(--if,"Sarabun")}
.idsc.slides{background:#fff}.idsc .isl{position:absolute;inset:0}.idsc .isl .is{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 1.2s ease;animation:ikb1 9s ease-in-out forwards}.idsc .isl .is.on{opacity:1}.idsc .isl .is.kb2{animation-name:ikb2}
@keyframes ikb1{from{transform:scale(1)}to{transform:scale(1.06) translate(-1%,-1%)}}@keyframes ikb2{from{transform:scale(1.06) translate(1%,1%)}to{transform:scale(1)}}
.idsc .fxo{pointer-events:none}.idsc .iempty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#888;font-size:3cqmin;text-align:center;padding:4cqw}
.idsc .isparkle{position:absolute;inset:0;pointer-events:none}.idsc .isparkle b{position:absolute;color:#FFD54F;font-size:3.4cqmin;text-shadow:0 0 1cqmin #fff;animation:isp 2.6s ease-in-out infinite;opacity:0}
@keyframes isp{0%,100%{opacity:0;transform:scale(.4) rotate(0)}50%{opacity:1;transform:scale(1.2) rotate(90deg)}}
@media (prefers-reduced-motion:reduce){.idsc *{animation:none!important}}`;
  document.head.appendChild(st);
})();
window.IdleFont = IdleFont; window.idleScene = idleScene; window.idleAfter = idleAfter; window.idleCfg = idleCfg; window.ytId = ytId; window.IDLE_DEF = IDLE_DEF;
