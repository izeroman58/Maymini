/* =========================================================
   หน้าเจ้าของร้าน: หน้าหลัก (วันนี้/เดือนนี้/เดือนก่อน), สถานะ VAT,
   บันทึกการยื่นภาษี, รายงานเงินสดรับ-จ่าย (ประกาศอธิบดีฯ ฉบับที่ 161), ฟอนต์
   ========================================================= */
'use strict';
const VATCFG_DEF = { status: 'none', regDate: '', vatNo: '', reviewedYear: '', reviewer: '', note: '', exemptCats: [], rv: {} };
const vatCfg = () => cfg('vatCfg', VATCFG_DEF);
const bahtL = (v, d) => `<span class="cur">฿</span>${money(v, d != null ? d : (num(v) % 1 ? 2 : 0))}`;
(function () { const st = document.createElement('style'); st.textContent = `.cur{opacity:.4;font-weight:400;margin-right:.06em;font-size:.82em}
.kpi3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}@media(max-width:560px){.kpi3{grid-template-columns:1fr}}
.kpi3 .stat .v{font-size:24px}.qa button{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;transition:transform .15s,box-shadow .15s}.qa.qsort button:not(.qdrag){opacity:.75}.qa button.qdrag{transform:scale(1.08);box-shadow:0 10px 26px rgba(0,0,0,.22);position:relative;z-index:2;opacity:1}.skel{color:transparent;background:#EFE9E8;border-radius:8px;min-width:80px;display:inline-block}`; document.head.appendChild(st); })();

/* ---------- ข้อมูลยอดขายแบบรวม (POS + นำเข้า) ---------- */
function sumDays(days, from, to) {
  const s = { net: 0, cost: 0, count: 0, pass: 0, exempt: 0, hasCost: true, n: 0 };
  Object.entries(days || {}).forEach(([d, x]) => { if (d < from || d > to) return; s.n++; s.net += num(x.net); s.cost += num(x.cost); s.count += num(x.count); s.pass += num(x.pass); s.exempt += num(x.exempt); if (x.hasCost === false) s.hasCost = false; });
  return s;
}

/* ---------- ปุ่มด่วนหน้าหลัก: กดค้างแล้วลากเพื่อย้ายตำแหน่ง (จำในเครื่อง) ---------- */
const IC_LEDGER = '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/>';
function qaButtons(own) {
  return [
    own ? { k: 'ledger', c: 'var(--green)', ic: IC_LEDGER, t: 'บันทึกรายรับ-รายจ่าย', fn: () => go('ledger') } : { k: 'pos', c: 'var(--green)', ic: IC.cart, t: 'ขายสินค้า', fn: () => go('pos') },
    own ? { k: 'reports', c: '#2B4C9B', ic: IC.chart, t: 'รายงาน', fn: () => go('reports') } : { k: 'scan', c: 'var(--red)', ic: IC.scan, t: 'เช็คราคา', fn: () => go('scan') },
    can('receiveGoods') && { k: 'receipt', c: '#E07A00', ic: IC.cam, t: 'ใบเสร็จร้านส่ง', fn: () => newReceipt() },
    own ? { k: 'tax', c: '#7B3FB8', ic: IC.tax, t: 'ภาษี', fn: () => go('tax') } : { k: 'labels', c: '#2B4C9B', ic: IC.print, t: 'พิมพ์ฉลาก', fn: () => go('labels') }
  ].filter(Boolean);
}
function qaDraw(box, own) {
  if (!box) return;
  const key = 'qaOrd_' + (own ? 'o' : 's'), B = qaButtons(own), ord = LS.get(key, []);
  B.sort((a, b) => { const i = ord.indexOf(a.k), j = ord.indexOf(b.k); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
  let cur = B.map(b => b.k);
  box.innerHTML = B.map(b => `<button type="button" data-k="${b.k}"><span class="ic" style="background:${b.c}">${I(b.ic)}</span>${b.t}</button>`).join('');
  let tm = null, st = null, drag = null, last = 0;
  box.oncontextmenu = e => e.preventDefault();
  box.onclick = e => { const b = e.target.closest('button[data-k]'); if (!b || Date.now() - last < 450) return; const x = B.find(y => y.k === b.dataset.k); x && x.fn(); };
  box.onpointerdown = e => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    st = { x: e.clientX, y: e.clientY }; clearTimeout(tm);
    tm = setTimeout(() => { drag = b; b.classList.add('qdrag'); box.classList.add('qsort'); try { navigator.vibrate && navigator.vibrate(25); } catch (x) { } }, 450);
  };
  box.addEventListener('pointermove', e => {
    if (!drag) { if (st && (Math.abs(e.clientX - st.x) > 8 || Math.abs(e.clientY - st.y) > 8)) { clearTimeout(tm); st = null; } return; }
    e.preventDefault();
    const hit = [...box.children].find(x => { if (x === drag) return false; const r = x.getBoundingClientRect(); return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom; });
    if (hit) { const all = [...box.children]; if (all.indexOf(drag) < all.indexOf(hit)) hit.after(drag); else hit.before(drag); }
  }, { passive: false });
  box.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  const up = () => {
    clearTimeout(tm); st = null; if (!drag) return;
    drag.classList.remove('qdrag'); box.classList.remove('qsort'); drag = null; last = Date.now();
    const now = [...box.children].map(x => x.dataset.k); if (now.join() !== cur.join()) { LS.set(key, now); cur = now; toast('ย้ายตำแหน่งปุ่มแล้ว'); }
  };
  box.onpointerup = up; box.onpointercancel = up;
}

/* ---------- หน้าหลัก ---------- */
VIEWS.home = async el => {
  const own = isOwner();
  const h = new Date(Date.now() + 7 * 3600e3).getUTCHours();
  const greet = h < 11 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
  el.innerHTML = `<div class="row" style="margin:2px 2px 12px"><div class="grow"><div class="muted small">${greet} · ${thDate(todayISO())}</div><h2 style="font-size:22px">${esc(S.user.name)}</h2></div></div>
   <div class="qa" id="qa"></div>
   ${own ? '<div id="jobsb"></div><div id="rsh"></div><div id="kpi"></div><div id="vat"></div>' : ''}<div id="alerts"></div><div id="stats"></div>
   ${S.apiUrl ? '' : `<div class="alert blue">${I(IC.alert, 20)}<div>กำลังใช้ <b>โหมดทดลอง</b> ข้อมูลอยู่ในเครื่องนี้เท่านั้น</div></div>`}`;
  qaDraw($('#qa', el), own);
  if (own && window.restockHome) restockHome($('#rsh', el));
  const t = todayISO(), m0 = t.slice(0, 8) + '01', lmEnd = addDays(m0, -1), lm0 = lmEnd.slice(0, 8) + '01';
  if (own && window.jobsBadge) jobsBadge($('#jobsb', el));
  if (own) {
    const kpi = $('#kpi', el);
    kpi.innerHTML = `<div class="kpi3">${['วันนี้', 'เดือนนี้', 'เดือนก่อน'].map(n => `<div class="stat"><div class="k">ยอดขาย${n}</div><div class="v"><span class="skel">000,000</span></div></div>`).join('')}</div>`;
    Promise.all([dailySummary(lm0, t), window.importedSales ? importedSales(lm0, lmEnd).catch(() => null) : null]).then(([days, imL]) => {
      if (!$('#kpi', el)) return;
      const T = sumDays(days, t, t), M = sumDays(days, m0, t), L = sumDays(days, lm0, lmEnd);
      // เดือนก่อนไม่มีบิล/ยอดรายวัน แต่มียอดรายเดือนที่นำเข้า → ใช้ยอดรายเดือน
      const lmM = imL && imL.months[0]; if (lmM && !L.net) Object.assign(L, { net: lmM.net, cost: lmM.cost, hasCost: lmM.hasCost, pass: 0, n: 1 });
      const dom = +t.slice(8, 10), Lsame = sumDays(days, lm0, lm0.slice(0, 8) + String(Math.min(dom, +lmEnd.slice(8))).padStart(2, '0'));
      const cmp = Lsame.net ? (M.net - Lsame.net) / Lsame.net * 100 : null;
      const vc = canStrict('viewCost');
      const card = (n, x, sub) => `<div class="stat"><div class="k">ยอดขาย${n}</div><div class="v num">${bahtL(x.net - x.pass)}</div><div class="tiny muted">${sub || ''}${vc && x.hasCost && x.net ? ` · กำไร ${money(x.net - x.pass - x.cost, 0)}` : ''}${x.pass ? ` · รับแทน ${money(x.pass, 0)}` : ''}</div></div>`;
      $('#kpi', el).innerHTML = `<div class="kpi3">${card('วันนี้', T, T.count ? T.count + ' บิล' : (T.n ? 'จากไฟล์นำเข้า' : 'ยังไม่มีบิล'))}${card('เดือนนี้', M, cmp == null ? TH_MF[+t.slice(5, 7) - 1] : `${cmp >= 0 ? '▲' : '▼'} ${Math.abs(cmp).toFixed(0)}% เทียบช่วงเดียวกันเดือนก่อน`)}${card('เดือนก่อน', L, TH_MF[+lm0.slice(5, 7) - 1])}</div>`;
    }).catch(e => { const k = $('#kpi', el); if (k) k.innerHTML = `<div class="alert amber">${I(IC.wifi, 18)}<div class="small">โหลดยอดขายไม่ได้: ${esc(e.message)}</div></div>`; });
    vatCard($('#vat', el));
  }
  // แจ้งเตือน + สถิติสินค้า (จากข้อมูลในเครื่อง แสดงทันที)
  const drawAlerts = (lic, filings) => {
    const al = [];
    (lic || []).forEach(l => { if (!l.expiryDate) return; const d = daysTo(l.expiryDate); if (d < 0) al.push(['red', `${esc(l.type)} <b>หมดอายุแล้ว ${-d} วัน</b> — ต้องต่ออายุ`, 'licenses']); else if (d <= 60) al.push([d <= 15 ? 'red' : 'amber', `${esc(l.type)} จะหมดอายุใน <b>${d} วัน</b> (${thDate(l.expiryDate)})`, 'licenses']); });
    const low = S.products.filter(p => p.trackStock === 'Y' && p.lowStock !== '' && num(p.stock) <= num(p.lowStock || 0));
    if (low.length && !(own && window.Restock && Restock.on() && Restock.conf().home)) al.push(['amber', `สินค้าใกล้หมด/หมดสต็อก <b>${low.length}</b> รายการ`, 'products:low']);   // เปิดวางแผนสั่งของ = ใช้การ์ด "ควรสั่งของ" แทน
    if (own) TAX.deadlines().forEach(d => { if (isFiled(filings, d.form, d.period)) return; const n = daysTo(d.paper); if (n >= 0 && n <= 45) al.push(['blue', `อีก <b>${n} วัน</b> ครบกำหนดยื่น ${d.form} (${d.what}) — ${thDate(d.paper)}`, 'tax']); });
    const a = $('#alerts', el); if (!a) return;
    a.innerHTML = al.map(([c, tx, v]) => `<div class="alert ${c}" style="cursor:pointer" data-go="${v}">${I(IC.alert, 20)}<div>${tx}</div></div>`).join('');
    $$('[data-go]', a).forEach(x => x.onclick = () => { const [v, f] = x.dataset.go.split(':'); go(v, f); });
    const st = $('#stats', el);
    if (own && st) {
      const stockVal = S.products.filter(p => p.trackStock === 'Y').reduce((s, p) => s + Math.max(0, num(p.stock)) * num(p.cost), 0);
      st.innerHTML = `<div class="grid3" style="margin-bottom:12px"><div class="stat" onclick="go('products')" style="cursor:pointer"><div class="k">สินค้า</div><div class="v">${S.products.length.toLocaleString()}</div></div><div class="stat" onclick="go('stockvalue')" style="cursor:pointer"><div class="k">มูลค่าสต็อก</div><div class="v num">${bahtL(stockVal, 0)}</div></div><div class="stat" onclick="go('dataquality')" style="cursor:pointer"><div class="k">ไม่มีต้นทุน</div><div class="v">${S.products.filter(p => num(p.price) && !num(p.cost)).length}</div></div></div>`;
    }
  };
  drawAlerts(S.licenses, S.filings);
  Promise.all([loadTable('Licenses').catch(() => []), own ? loadTable('TaxFilings').catch(() => []) : []]).then(([lic, f]) => { S.licenses = lic; S.filings = f; drawAlerts(lic, f); });
  if (!S.products.length) loadProducts().then(() => drawAlerts(S.licenses, S.filings)).catch(() => { });
};

/* ---------- สถานะ VAT ---------- */
function vatCard(box) {
  if (!box) return;
  const v = vatCfg(), y = +todayISO().slice(0, 4), t = todayISO();
  if (v.status === 'registered') {
    // จด VAT แล้ว: เตือนยื่น ภ.พ.30 ทุกเดือน
    const pm = addDays(t.slice(0, 8) + '01', -1).slice(0, 7), due = t.slice(0, 8) + '15', dueOn = t.slice(0, 8) + '23';
    const filed = isFiled(S.filings, 'ภ.พ.30', pm);
    box.innerHTML = `<div class="card" style="border-left:5px solid var(--green)"><div class="row"><b class="grow">✅ จดทะเบียน VAT แล้ว${v.vatNo ? ' · ' + esc(v.vatNo) : ''}</b><button class="btn ghost sm" onclick="vatDlg()">แก้ไข</button></div>
      <div class="small" style="margin-top:6px">ภ.พ.30 เดือน ${TH_MF[+pm.slice(5) - 1]} ${+pm.slice(0, 4) + 543}: ${filed ? '<span class="tag green">ยื่นแล้ว ✓</span>' : `<span class="tag ${daysTo(dueOn) < 0 ? 'red' : 'amber'}">ยังไม่ได้บันทึกการยื่น</span> กำหนด ${thDate(due)} (ออนไลน์ ${thDate(dueOn)})`} · <a href="#tax">บันทึกการยื่น</a></div></div>`;
    return;
  }
  box.innerHTML = `<div class="card"><div class="small muted">กำลังคำนวณยอดเทียบเกณฑ์ VAT…</div></div>`;
  Promise.all([dailySummary(y + '-01-01', y + '-12-31'), window.importedSales ? importedSales(y + '-01-01', y + '-12-31').catch(() => null) : null]).then(([days, im]) => {
    const s = sumDays(days, y + '-01-01', t);
    const mo = im ? im.months.filter(m => m.ym + '-01' <= t) : []; s.net += mo.reduce((a, m) => a + m.net, 0);   // เดือนที่มีแต่ยอดรายเดือนที่นำเข้า
    const counted = Math.max(0, s.net - s.pass - s.exempt);
    const doy = Math.max(1, Math.round((new Date(t) - new Date(y + '-01-01')) / 864e5) + 1), proj = counted / doy * 365;
    const pct = counted / 1.8e6 * 100, reviewed = v.status === 'reviewed' && String(v.reviewedYear) === String(y);
    const color = reviewed ? 'var(--blue)' : pct >= 100 ? 'var(--red)' : pct >= 80 || proj >= 1.8e6 ? 'var(--amber)' : 'var(--green)';
    const msg = reviewed ? `ตรวจสอบแล้ว${v.reviewer ? ' โดย ' + esc(v.reviewer) : ''}: ${esc(v.note || 'ยังไม่ต้องจด VAT')}` : pct >= 100 ? 'รายรับที่ต้องนับเกิน 1.8 ล้านบาทแล้ว — ต้องยื่นจด VAT ภายใน 30 วันนับจากวันที่เกิน (ปรึกษาสรรพากรพื้นที่/นักบัญชี)' : proj >= 1.8e6 ? `คาดว่าทั้งปีจะถึง ${money(proj, 0)} บาท — เตรียมเรื่องจด VAT` : 'ยังไม่ถึงเกณฑ์';
    box.innerHTML = `<div class="card" style="border-left:5px solid ${color}"><div class="row"><div class="grow small">รายรับปี ${y + 543} เทียบเกณฑ์จด VAT 1.8 ล้าน</div><b class="small">${pct.toFixed(0)}%</b><button class="btn ghost sm" style="margin-left:8px" onclick="vatDlg()">สถานะ / วิธีปิด</button></div>
      <div class="prog" style="margin-top:6px"><i style="width:${Math.min(100, pct)}%;background:${color}"></i></div>
      <div class="tiny" style="margin-top:6px">${msg}</div>
      <div class="tiny muted">นับ ${money(counted, 0)} = ยอดขาย ${money(s.net, 0)}${mo.length ? ` (รวมยอดรายเดือนที่นำเข้า ${mo.length} เดือน)` : ''}${s.pass ? ` − เงินรับแทน (โอน/เติมเงิน/บิล) ${money(s.pass, 0)}` : ''}${s.exempt ? ` − สินค้ายกเว้น VAT ${money(s.exempt, 0)}` : ''}</div></div>`;
  }).catch(() => { box.innerHTML = ''; });
}
async function vatDlg() {
  if (!isOwner()) return;
  const v = vatCfg(), y = +todayISO().slice(0, 4);
  const cats = (S.categories.length ? S.categories.map(c => c.name) : [...new Set(S.products.map(p => p.category).filter(Boolean))]);
  const ov = sheet('สถานะ VAT (ภาษีมูลค่าเพิ่ม)', `
    <div class="alert blue small">${I(IC.alert, 18)}<div><b>ทำความเข้าใจก่อน:</b> เกณฑ์ 1.8 ล้านไม่ใช่ภาษีที่ “จ่ายแล้วหายแดง” — เป็นเกณฑ์ว่าร้านต้อง<b>จดทะเบียน VAT</b> หรือไม่ การยื่น/จ่ายภาษีเงินได้ (ภ.ง.ด.90/94) หรือภาษีที่เทศบาล ไม่ได้ทำให้สถานะนี้เปลี่ยน · สถานะจะเป็นสีเขียวเมื่อ <b>(1) จด VAT แล้ว</b> หรือ <b>(2) นักบัญชี/สรรพากรตรวจแล้วว่ายังไม่ต้องจด</b> (เช่น เมื่อหักสินค้าที่ได้รับยกเว้นและเงินรับแทนแล้วไม่ถึงเกณฑ์)</div></div>
    <div class="list" style="margin:10px 0">${[['none', 'ยังไม่ได้ดำเนินการ', 'ระบบคำนวณและเตือนตามยอดจริง'], ['registered', 'จดทะเบียน VAT แล้ว', 'ระบบจะเตือนยื่น ภ.พ.30 ทุกเดือน'], ['reviewed', 'ตรวจสอบแล้ว ยังไม่ต้องจด (เฉพาะปีนี้)', 'บันทึกว่าใครตรวจ/เหตุผล']].map(([k, t, d]) => `<label class="item"><input type="radio" name="vs" value="${k}" ${v.status === k ? 'checked' : ''}><div class="grow"><div class="t">${t}</div><div class="m">${d}</div></div></label>`).join('')}</div>
    <div id="reg" class="grid2"><label class="f"><span>วันที่จดทะเบียน</span><input class="in" type="date" id="rd" value="${esc(v.regDate)}"></label><label class="f"><span>เลขประจำตัวผู้เสียภาษี (VAT)</span><input class="in" id="vn" inputmode="numeric" value="${esc(v.vatNo)}"></label></div>
    <div id="rev"><label class="f"><span>ผู้ตรวจสอบ (เช่น ชื่อนักบัญชี / สรรพากรพื้นที่)</span><input class="in" id="rv" value="${esc(v.reviewer)}"></label><label class="f"><span>เหตุผล/ผลการตรวจ</span><input class="in" id="nt" value="${esc(v.note)}" placeholder="เช่น หักของสดและบริการรับชำระแล้วไม่ถึง 1.8 ล้าน"></label></div>
    <details style="margin-top:6px"><summary class="small"><b>หมวดสินค้าที่ได้รับยกเว้น VAT</b> (ไม่นับรวมยอด)</summary><div class="tiny muted" style="margin:6px 0">เช่น พืชผัก ผลไม้ เนื้อสัตว์ ปลา ไข่ ที่ยังไม่แปรรูป · <b>ต้องให้นักบัญชียืนยัน</b> สินค้าแปรรูป/บรรจุขาย (นม ขนม เครื่องดื่ม) ไม่ได้รับยกเว้น · นับได้เฉพาะยอดที่ขายผ่าน POS ของระบบนี้</div>${cats.map(c => `<label class="row small" style="padding:4px 0"><input type="checkbox" data-c="${esc(c)}" ${(v.exemptCats || []).includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('')}<button class="btn ghost block sm" style="margin-top:6px" onclick="this.closest('.ov').remove();go('vatcheck')">ตรวจสินค้าทีละรายการ · แนะนำย้ายหมวด</button></details>
    <div class="tiny muted" style="margin-top:10px">ยอด “เงินรับแทน” จากบริการโอนเงิน เติมเงิน จ่ายบิล ไม่นับเป็นรายรับของร้าน (นับเฉพาะค่าบริการ) · ข้อมูลนี้ช่วยประเมินเท่านั้น การตัดสินว่าต้องจด VAT หรือไม่ ควรให้นักบัญชี/สรรพากรยืนยัน</div>`,
    `<button class="btn block green" id="sv">บันทึก</button>`);
  const vis = () => { const s = ($('input[name=vs]:checked', ov) || {}).value; $('#reg', ov).style.display = s === 'registered' ? '' : 'none'; $('#rev', ov).style.display = s === 'reviewed' ? '' : 'none'; };
  $$('input[name=vs]', ov).forEach(r => r.onchange = vis); vis();
  $('#sv', ov).onclick = async () => {
    const o = { status: ($('input[name=vs]:checked', ov) || {}).value || 'none', regDate: $('#rd', ov).value, vatNo: $('#vn', ov).value.trim(), reviewer: $('#rv', ov).value.trim(), note: $('#nt', ov).value.trim(), reviewedYear: String(y), exemptCats: $$('[data-c]:checked', ov).map(c => c.dataset.c) };
    try { busy(1); await saveSetting('vatCfg', { ...vatCfg(), ...o }); if (window.OStore) OStore.dm = null; Cache.staleBefore = Date.now(); busy(0); ov.remove(); toast('บันทึกสถานะ VAT แล้ว'); go(S.view, S.viewArg); } catch (e) { busy(0); toast(e.message, 1); }
  };
}

/* ---------- บันทึกการยื่นภาษี ---------- */
function isFiled(filings, form, period) { return (filings || []).some(f => f.form === form && String(f.period) === String(period)); }
function filingForm(f0, done) {
  const f = { id: Logic.uid('F'), form: 'ภ.ง.ด.90', period: String(+todayISO().slice(0, 4) - 1), filedAt: todayISO(), ...(f0 || {}) };
  const ov = sheet('บันทึกการยื่น/ชำระภาษี', `<div class="grid2"><label class="f"><span>แบบ</span><select class="in" id="fm">${['ภ.ง.ด.90', 'ภ.ง.ด.94', 'ภ.พ.30', 'ภาษีป้าย/ท้องถิ่น', 'อื่นๆ'].map(x => `<option ${x === f.form ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
     <label class="f"><span id="pl">งวด</span><input class="in" id="pd" value="${esc(f.period)}"></label></div><div class="tiny muted" id="ph" style="margin:-4px 0 8px"></div>
     <div class="grid2"><label class="f"><span>วันที่ยื่น</span><input class="in" type="date" id="fa" value="${esc(f.filedAt)}"></label><label class="f"><span>ภาษีที่ชำระ (บาท)</span><input class="in" type="number" step="any" id="am" value="${esc(f.amount)}"></label></div>
     <label class="f"><span>เลขอ้างอิง/เลขที่ใบเสร็จ</span><input class="in" id="rf" value="${esc(f.ref)}"></label>
     ${f.fileUrl ? `<a class="btn ghost sm" href="${esc(f.fileUrl)}" target="_blank" rel="noopener">${I(IC.file, 16)} เปิดหลักฐาน</a>` : ''}
     <label class="btn ghost block" style="margin-top:8px">${I(IC.cam, 18)} แนบใบเสร็จ/ใบยืนยันการยื่น<input type="file" accept="image/*,application/pdf" id="ff" class="hidden"></label><div class="tiny muted" id="fn"></div>
     <label class="f" style="margin-top:8px"><span>หมายเหตุ</span><input class="in" id="nt" value="${esc(f.note)}"></label>`,
    `${f0 ? '<button class="btn ghost grow" id="dl" style="color:var(--red)">ลบ</button>' : ''}<button class="btn grow green" id="sv">บันทึก</button>`);
  const hint = () => { const m = $('#fm', ov).value; $('#ph', ov).textContent = m === 'ภ.ง.ด.90' ? 'ใส่ปี ค.ศ. ของเงินได้ เช่น 2025 (= ปีภาษี 2568)' : m === 'ภ.ง.ด.94' ? 'ใส่ปี ค.ศ.-H1 เช่น 2026-H1 (ครึ่งปีแรก 2569)' : m === 'ภ.พ.30' ? 'ใส่เดือน เช่น 2026-10' : ''; };
  $('#fm', ov).onchange = hint; hint();
  let file = null; $('#ff', ov).onchange = e => { file = e.target.files[0]; $('#fn', ov).textContent = file ? file.name : ''; };
  $('#sv', ov).onclick = async () => {
    const o = { ...f, form: $('#fm', ov).value, period: $('#pd', ov).value.trim(), filedAt: $('#fa', ov).value, amount: $('#am', ov).value, ref: $('#rf', ov).value.trim(), note: $('#nt', ov).value.trim() };
    if (!o.period) return toast('ใส่งวดภาษี', 1);
    try { busy(1); if (file) { const img = await compressImage(file, 2000, .85); const up = await api('upload', { kind: 'other', name: `${o.form}_${o.period}.${img.mime === 'application/pdf' ? 'pdf' : 'jpg'}`, mime: img.mime, base64: img.dataUrl }); o.fileId = up.fileId; o.fileUrl = up.fileUrl; }
      await api('upsert', { table: 'TaxFilings', rows: [o] }); S.filings = await loadTable('TaxFilings'); busy(0); ov.remove(); toast('บันทึกแล้ว'); done && done(); } catch (e) { busy(0); toast(e.message, 1); }
  };
  const dl = $('#dl', ov); if (dl) dl.onclick = async () => { if (!(await confirmDlg('ลบบันทึกนี้?', 'ลบ', true))) return; try { busy(1); await api('remove', { table: 'TaxFilings', ids: [f.id] }); busy(0); ov.remove(); done && done(); } catch (e) { busy(0); toast(e.message, 1); } };
}
// เสริมหน้า "ภาษี": บันทึกการยื่น + รายงานเงินสดรับ-จ่าย + สถานะ VAT
const _taxView = VIEWS.tax;
VIEWS.tax = async el => {
  S.filings = await quick(loadTable('TaxFilings'), 700, S.filings || []);
  await _taxView(el);
  if (!isOwner()) return;
  const box = document.createElement('div'); el.appendChild(box);
  const draw = () => {
    const F = (S.filings || []).slice().sort((a, b) => String(b.filedAt).localeCompare(a.filedAt));
    box.innerHTML = `<div class="card"><div class="row" style="margin-bottom:6px"><h3 class="grow">บันทึกการยื่น/ชำระภาษี</h3><button class="btn sm" id="af">${I(IC.plus, 16)} บันทึก</button></div>
      ${F.length ? F.map(f => `<div class="item" data-id="${esc(f.id)}" style="padding:8px 2px"><div class="grow"><div class="t">${esc(f.form)} · งวด ${esc(f.period)}</div><div class="m">ยื่น ${thDate(f.filedAt)}${f.ref ? ' · ' + esc(f.ref) : ''}${f.fileUrl ? ' · 📎' : ''}</div></div><b class="num">${f.amount !== '' ? money(f.amount) : ''}</b></div>`).join('') : '<div class="small muted">ยังไม่มี — เมื่อยื่นแล้วให้บันทึกไว้ ระบบจะเปลี่ยนกำหนดยื่นเป็น “ยื่นแล้ว ✓” และหยุดเตือน</div>'}</div>
     <div class="card"><h3>หลักฐานสำหรับยื่นกรมสรรพากร</h3><p class="small muted" style="margin-top:0">ผู้มีเงินได้ 40(8) ที่ยังไม่จด VAT ต้องจัดทำ “รายงานแสดงรายได้และรายจ่าย” เป็นประจำวัน (ประกาศอธิบดีกรมสรรพากรฯ ฉบับที่ 161) — ระบบสร้างให้จากยอดขายและใบเสร็จร้านส่ง</p>
       <button class="btn block" onclick="go('ledger')">${I(IC.file, 18)} บัญชีรายรับ-รายจ่าย 40(8) (ดู/พิมพ์/ส่งออก)</button>
       <button class="btn ghost block" style="margin-top:8px" onclick="go('vatcheck')">${I(IC.tag, 18)} ตรวจสินค้ายกเว้น VAT ตามกฎหมาย</button></div>
     <div id="vatbox"></div>`;
    $('#af', box).onclick = () => filingForm(null, () => go('tax'));
    $$('[data-id]', box).forEach(x => x.onclick = () => filingForm(F.find(f => f.id === x.dataset.id), () => go('tax')));
    vatCard($('#vatbox', box));
  };
  draw();
  // ทำเครื่องหมาย "ยื่นแล้ว" ที่กำหนดยื่น
  const mark = () => { $$('#tx .kv', el).forEach(kv => { const m = kv.textContent.match(/(ภ\.ง\.ด\.9[04])/); if (!m) return; const d = TAX.deadlines().find(x => x.form === m[1]); if (d && isFiled(S.filings, d.form, d.period) && !kv.querySelector('.filed')) kv.querySelector('span:last-child').insertAdjacentHTML('beforeend', ' <span class="tag green filed">ยื่นแล้ว ✓</span>'); }); };
  setTimeout(mark, 400); setTimeout(mark, 1500);
};

/* ---------- รายงานเงินสดรับ-จ่าย ---------- */
VIEWS.cashreport = async el => {
  if (ownerOnly(el)) return;
  const t = todayISO(); const RS2 = S.crState || (S.crState = { y: +t.slice(0, 4), m: 0 });
  const tx = cfg('taxInfo', { name: '', taxId: '', shop: S.settings.shopName || '', addr: S.settings.address || '' });
  el.innerHTML = vhead('รายงานเงินสดรับ-จ่าย', '', 'tax') + `
   <div class="card"><div class="grid2"><label class="f"><span>ปี</span><select class="in" id="yy">${[0, 1, 2, 3].map(k => `<option value="${RS2.y - k + (k ? 0 : 0)}">${RS2.y - k + 543}</option>`).join('')}</select></label><label class="f"><span>เดือน</span><select class="in" id="mm"><option value="0">ทั้งปี</option>${TH_MF.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}</select></label></div>
     <details><summary class="small"><b>ข้อมูลผู้ประกอบการ (หัวรายงาน)</b></summary><div class="grid2" style="margin-top:8px"><label class="f"><span>ชื่อผู้ประกอบการ</span><input class="in" id="tn" value="${esc(tx.name)}"></label><label class="f"><span>เลขประจำตัวผู้เสียภาษีอากร</span><input class="in" id="ti" inputmode="numeric" value="${esc(tx.taxId)}"></label></div><label class="f"><span>ชื่อสถานประกอบการ</span><input class="in" id="ts" value="${esc(tx.shop)}"></label><label class="f"><span>ที่ตั้ง</span><input class="in" id="ta" value="${esc(tx.addr)}"></label><button class="btn ghost sm" id="tsv">บันทึกหัวรายงาน</button></details>
     <div class="row wrap" style="gap:8px;margin-top:10px"><button class="btn grow" id="pr">${I(IC.print, 18)} พิมพ์</button><button class="btn ghost grow" id="xl">Excel</button><button class="btn ghost grow" id="cv">CSV</button></div></div>
   <div class="card" id="rp"><span class="small muted">กำลังเตรียม…</span></div>`;
  $('#yy', el).value = RS2.y; $('#mm', el).value = RS2.m;
  $('#tsv', el).onclick = async () => { try { busy(1); await saveSetting('taxInfo', { name: $('#tn', el).value, taxId: $('#ti', el).value, shop: $('#ts', el).value, addr: $('#ta', el).value }); busy(0); toast('บันทึกแล้ว'); } catch (e) { busy(0); toast(e.message, 1); } };
  let rows = [];
  const build = async () => {
    RS2.y = +$('#yy', el).value; RS2.m = +$('#mm', el).value;
    const y = RS2.y, from = RS2.m ? `${y}-${String(RS2.m).padStart(2, '0')}-01` : `${y}-01-01`, to = RS2.m ? addDays(addDays(from, 32).slice(0, 8) + '01', -1) : `${y}-12-31`;
    const [days, rc] = await Promise.all([quick(dailySummary(y + '-01-01', y + '-12-31'), 900, {}), quick(loadTable('Receipts'), 900, [])]);
    rows = [];
    const dates = new Set(Object.keys(days).filter(d => d >= from && d <= to));
    rc.forEach(r => { const d = String(r.date).slice(0, 10); if (d >= from && d <= to) dates.add(d); });
    [...dates].sort().forEach(d => {
      const x = days[d];
      if (x && num(x.net)) { const inc = num(x.net) - num(x.pass); rows.push({ d, item: 'รายได้จากการขายสินค้า/ค่าบริการ', inc, exp: 0, note: (x.pass ? `ไม่รวมเงินรับแทน ${money(x.pass)}` : '') + (x.src !== 'POS' ? (x.pass ? ' · ' : '') + 'ยอดจาก ' + x.src : '') }); }
      rc.filter(r => String(r.date).slice(0, 10) === d).forEach(r => rows.push({ d, item: `${r.type === 'ค่าใช้จ่าย' ? 'ค่าใช้จ่าย' : 'ซื้อสินค้า'} — ${r.supplier || 'ไม่ระบุ'}${r.docNo ? ' เลขที่ ' + r.docNo : ''}`, inc: 0, exp: num(r.total), note: r.fileUrl ? 'มีหลักฐาน' : 'ไม่มีรูปหลักฐาน' }));
    });
    const TI = rows.reduce((s, r) => s + r.inc, 0), TE = rows.reduce((s, r) => s + r.exp, 0);
    $('#rp', el).innerHTML = `<div class="grid3" style="margin-bottom:10px"><div class="stat"><div class="k">รายรับ</div><div class="v num">${bahtL(TI, 0)}</div></div><div class="stat"><div class="k">รายจ่าย (มีใบเสร็จ)</div><div class="v num">${bahtL(TE, 0)}</div></div><div class="stat"><div class="k">รายการ</div><div class="v">${rows.length}</div></div></div>
      <div class="scroll-x" style="max-height:420px;overflow:auto"><table class="t"><tr><th>วัน เดือน ปี</th><th>รายการ</th><th class="right">รายรับ</th><th class="right">รายจ่าย</th><th>หมายเหตุ</th></tr>${rows.slice(0, 400).map(r => `<tr><td>${thDate(r.d)}</td><td>${esc(r.item)}</td><td class="right num">${r.inc ? money(r.inc) : ''}</td><td class="right num">${r.exp ? money(r.exp) : ''}</td><td class="tiny">${esc(r.note)}</td></tr>`).join('')}</table></div>${rows.length > 400 ? `<div class="tiny muted center">แสดง 400 จาก ${rows.length} รายการ — ฉบับพิมพ์/ส่งออกมีครบ</div>` : ''}
      ${!rc.some(r => String(r.date) >= from && String(r.date) <= to) ? '<div class="alert amber" style="margin-top:8px"><div class="small">ช่วงนี้ยังไม่มีใบเสร็จร้านส่งในระบบ — ถ้าเลือกหักค่าใช้จ่ายเหมา 60% ไม่ต้องใช้รายจ่าย แต่ถ้าหักตามจริงต้องบันทึกใบเสร็จให้ครบ</div></div>' : ''}`;
    return { from, to, TI, TE };
  };
  let info = await build();
  ['yy', 'mm'].forEach(id => $('#' + id, el).onchange = async () => { info = await build(); });
  const head = () => { const T = cfg('taxInfo', tx); return [T.name, T.taxId, T.shop, T.addr]; };
  $('#pr', el).onclick = () => {
    const [n, id, shop, addr] = head(), byM = {};
    rows.forEach(r => (byM[r.d.slice(0, 7)] = byM[r.d.slice(0, 7)] || []).push(r));
    printA4(Object.entries(byM).map(([ym, rs]) => { const ti = rs.reduce((s, r) => s + r.inc, 0), te = rs.reduce((s, r) => s + r.exp, 0); return `<div style="break-after:page"><h2 style="text-align:center;font-size:16px;margin:0">รายงานเงินสดรับ-จ่าย</h2><div style="text-align:center">ประจำเดือน ${TH_MF[+ym.slice(5) - 1]} พ.ศ. ${+ym.slice(0, 4) + 543}</div>
      <div style="margin:6px 0">ชื่อผู้ประกอบการ ${esc(n || '..............................')} &nbsp; เลขประจำตัวผู้เสียภาษีอากร ${esc(id || '.............................')}<br>ชื่อสถานประกอบการ ${esc(shop)} &nbsp; ที่ตั้ง ${esc(addr)}</div>
      <table><tr><th style="width:18%">วัน เดือน ปี</th><th>รายการ</th><th style="width:14%">รายรับ<br>จำนวนเงิน</th><th style="width:14%">รายจ่าย<br>จำนวนเงิน</th><th style="width:18%">หมายเหตุ</th></tr>${rs.map(r => `<tr><td>${thDate(r.d)}</td><td>${esc(r.item)}</td><td style="text-align:right">${r.inc ? money(r.inc) : ''}</td><td style="text-align:right">${r.exp ? money(r.exp) : ''}</td><td style="font-size:10px">${esc(r.note)}</td></tr>`).join('')}<tr><th colspan="2" style="text-align:right">รวม</th><th style="text-align:right">${money(ti)}</th><th style="text-align:right">${money(te)}</th><th></th></tr></table>
      <div style="margin-top:14px;text-align:right">ลงชื่อ ................................................ ผู้ประกอบการ</div></div>`; }).join('') || '<p>ไม่มีข้อมูล</p>');
  };
  const exRows = () => [['วัน เดือน ปี', 'รายการ', 'รายรับ', 'รายจ่าย', 'หมายเหตุ']].concat(rows.map(r => [r.d, r.item, r.inc || '', r.exp || '', r.note]));
  $('#cv', el).onclick = () => download(`cash-report_${RS2.y}${RS2.m ? '-' + RS2.m : ''}.csv`, toCSV(exRows()));
  $('#xl', el).onclick = async () => { try { busy(1); await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX'); const [n, id, shop, addr] = head(); const aoa = [['รายงานเงินสดรับ-จ่าย'], ['ชื่อผู้ประกอบการ', n, 'เลขประจำตัวผู้เสียภาษีอากร', id], ['ชื่อสถานประกอบการ', shop, 'ที่ตั้ง', addr], []].concat(exRows()); const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 12 }, { wch: 46 }, { wch: 12 }, { wch: 12 }, { wch: 30 }]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'รายงานเงินสดรับ-จ่าย'); download(`cash-report_${RS2.y}.xlsx`, new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })])); busy(0); } catch (e) { busy(0); toast(e.message, 1); } };
};

/* ---------- ฟอนต์ (เจ้าของร้านเลือกได้) ---------- */
const FONTS = [['Sarabun', 'สารบรรณ (มีหัว) — ค่าเริ่มต้น'], ['Bai Jamjuree', 'ใบจามจุรี (มีหัว)'], ['Noto Sans Thai', 'Noto Sans Thai (ไม่มีหัว)'], ['Prompt', 'พร้อมท์ (ไม่มีหัว)'], ['Kanit', 'คณิต (ไม่มีหัว)']];
function applyFont(f) {
  f = f || cfg('uiFont', { body: 'Sarabun', head: 'Sarabun', scale: 1 });
  if (/^(Noto Sans Thai Looped|Loyverse)$/.test(f.body)) f.body = 'Sarabun'; if (/^(Noto Sans Thai Looped|Loyverse)$/.test(f.head)) f.head = 'Sarabun';
  const fam = k => `'${k || 'Sarabun'}'`;
  const r = document.documentElement.style;
  r.setProperty('--fb', `${fam(f.body)},'Noto Sans Thai',system-ui,sans-serif`); r.setProperty('--fh', `${fam(f.head || f.body)},'Noto Sans Thai',system-ui,sans-serif`); r.setProperty('--fs', (15 * (f.scale || 1)) + 'px');
  LS.set('uiFont', f);
}
document.addEventListener('mm:settings', () => applyFont());
function fontDlg() {
  const f = cfg('uiFont', { body: 'Sarabun', head: 'Sarabun', scale: 1 }); if (/^(Noto Sans Thai Looped|Loyverse)$/.test(f.body)) f.body = 'Sarabun'; if (/^(Noto Sans Thai Looped|Loyverse)$/.test(f.head)) f.head = 'Sarabun';
  const ov = sheet('ฟอนต์และขนาดตัวอักษร', `<label class="f"><span>ฟอนต์ข้อความ</span><select class="in" id="fb">${FONTS.map(([k, n]) => `<option value="${k}" style="font-family:${k === 'Loyverse' ? "Roboto,'Noto Sans Thai Looped'" : "'" + k + "'"}">${n}</option>`).join('')}</select></label>
    <label class="f"><span>ฟอนต์หัวข้อ/ตัวเลข</span><select class="in" id="fh">${FONTS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
    <label class="f"><span>ขนาดตัวอักษร: <b id="sv2">${Math.round((f.scale || 1) * 100)}%</b></span><input type="range" id="sc" min="85" max="130" step="5" value="${Math.round((f.scale || 1) * 100)}" style="width:100%"></label>
    <div class="card" id="pv"><div class="disp" style="font-size:20px">ตั๋วออเดอร์ ฿1,234</div><div>นมเปรี้ยวบีทาเก้น 140ml × 2 · ข้อต่อตรง 3/4" 6หุน</div></div>
    <div class="tiny muted">ใช้กับทุกเครื่องในร้าน (เครื่องอื่นเห็นผลเมื่อเปิดแอปครั้งถัดไป)</div>`, `<button class="btn block green" id="ok">บันทึก</button>`);
  $('#fb', ov).value = f.body; $('#fh', ov).value = f.head || f.body;
  const cur = () => ({ body: $('#fb', ov).value, head: $('#fh', ov).value, scale: +$('#sc', ov).value / 100 });
  ['fb', 'fh', 'sc'].forEach(id => $('#' + id, ov).oninput = () => { $('#sv2', ov).textContent = $('#sc', ov).value + '%'; applyFont(cur()); });
  $('#ok', ov).onclick = async () => { try { busy(1); await saveSetting('uiFont', cur()); busy(0); ov.remove(); toast('บันทึกฟอนต์แล้ว'); } catch (e) { busy(0); toast(e.message, 1); } };
  ov.querySelector('[data-x]').addEventListener('click', () => applyFont());
}
// ปุ่มฟอนต์ในหน้าตั้งค่า (เจ้าของ)
const _settingsView = VIEWS.settings;
VIEWS.settings = el => {
  _settingsView(el);
  if (!isOwner()) return;
  const c = document.createElement('div'); c.className = 'card';
  c.innerHTML = `<h3>การแสดงผล</h3><button class="btn ghost block" onclick="brandDlg()">โลโก้ร้าน (หน้าใส่ PIN · แถบบน · จอลูกค้า · ไอคอนแท็บ)</button><button class="btn ghost block" style="margin-top:8px" onclick="fontDlg()">ฟอนต์และขนาดตัวอักษร</button><button class="btn ghost block" style="margin-top:8px" onclick="vatDlg()">สถานะ VAT</button><button class="btn ghost block" style="margin-top:8px" onclick="go('svcset')">ค่าบริการ โอนเงิน/เติมเงิน/จ่ายบิล</button>`;
  el.insertBefore(c, el.children[2] || null);
};

/* ---------- โลโก้ร้าน (เจ้าของเปลี่ยนเองได้) ---------- */
async function brandFile(f) { return shrinkLogo(await loadImg(URL.createObjectURL(f))); }
// เก็บในช่อง Google Sheet ได้ไม่เกิน ~50,000 ตัวอักษร → ย่อ/บีบอัดจนพอดี
function shrinkLogo(im) {
  for (const W of [520, 440, 360, 300, 240]) {
    const s = Math.min(1, W / im.width, (W * .77) / im.height), c = document.createElement('canvas');
    c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    let d = c.toDataURL('image/png'); if (d.length < 45000) return d;
    for (const q of [.92, .85, .75]) { d = c.toDataURL('image/webp', q); if (d.startsWith('data:image/webp') && d.length < 45000) return d; }
  }
  throw new Error('รูปโลโก้ใหญ่เกินไป');
}
async function toWhite(src) { // ทำโลโก้สีขาว (ใช้บนพื้นแดง) จากโลโก้พื้นโปร่งใส
  const im = await loadImg(src), c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const D = x.getImageData(0, 0, c.width, c.height), a = D.data; for (let i = 0; i < a.length; i += 4) { a[i] = a[i + 1] = a[i + 2] = 255; } x.putImageData(D, 0, 0); return shrinkLogo(await loadImg(c.toDataURL('image/png')));
}
function brandDlg() {
  let col = S.settings.brandLogo || '', wh = S.settings.brandLogoW || '';
  const ov = sheet('โลโก้ร้าน', `<div class="small muted" style="margin-bottom:8px">ใช้ไฟล์ PNG พื้นโปร่งใสจะสวยที่สุด (JPG ได้ แต่จะเห็นพื้นสี่เหลี่ยม) · ระบบย่อขนาดให้อัตโนมัติ</div>
    <div class="grid2"><div><div class="small" style="font-weight:600">1. โลโก้สี — ใช้บนพื้นขาว (หน้าใส่ PIN)</div><div id="pc" style="height:140px;background:#fff;border-radius:12px;box-shadow:inset 0 0 0 1.5px var(--line);display:flex;align-items:center;justify-content:center;margin:6px 0"></div><label class="btn ghost sm">อัปโหลด<input type="file" accept="image/png,image/jpeg,image/webp" id="fc" hidden></label></div>
    <div><div class="small" style="font-weight:600">2. โลโก้สีขาว — ใช้บนพื้นแดง (แถบบน · จอลูกค้า · ไอคอนแท็บ)</div><div id="pw" style="height:140px;background:var(--red);border-radius:12px;display:flex;align-items:center;justify-content:center;margin:6px 0"></div><label class="btn ghost sm">อัปโหลด<input type="file" accept="image/png,image/jpeg,image/webp" id="fw" hidden></label> <button class="btn ghost sm" id="mkw">ทำจากโลโก้สี</button></div></div>
    <div class="tiny muted" style="margin-top:8px">ไอคอนบนหน้าจอมือถือ/แท็บเล็ต (shortcut) เป็นไฟล์ในเว็บ — ถ้าต้องการเปลี่ยนไอคอนนั้นด้วย แจ้งผู้ดูแลระบบให้ทำไฟล์ไอคอนใหม่ แล้วลบ shortcut เดิมและเพิ่มใหม่</div>`,
    `<button class="btn ghost" id="rs">ใช้โลโก้เริ่มต้น</button><button class="btn grow" id="ok">บันทึก</button>`);
  const pv = () => { $('#pc', ov).innerHTML = `<img src="${col || 'logo.png'}" style="max-height:120px;max-width:90%;object-fit:contain">`; $('#pw', ov).innerHTML = `<img src="${wh || 'logo-white.png'}" style="max-height:120px;max-width:90%;object-fit:contain">`; };
  $('#fc', ov).onchange = async e => { const f = e.target.files[0]; if (f) { try { col = await brandFile(f); pv(); } catch (x) { toast(x.message, 1); } } };
  $('#fw', ov).onchange = async e => { const f = e.target.files[0]; if (f) { try { wh = await brandFile(f); pv(); } catch (x) { toast(x.message, 1); } } };
  $('#mkw', ov).onclick = async () => { wh = await toWhite(col || 'logo.png'); pv(); };
  $('#rs', ov).onclick = () => { col = ''; wh = ''; pv(); };
  $('#ok', ov).onclick = async () => { try { busy(1); await saveSetting('brandLogo', col); await saveSetting('brandLogoW', wh); busy(0); ov.remove(); toast('บันทึกโลโก้แล้ว'); Brand.favicon(); go(S.view, S.viewArg); } catch (e) { busy(0); toast(e.message, 1); } };
  pv();
}
