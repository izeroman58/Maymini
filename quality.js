/* =========================================================
   ความครบถ้วนของข้อมูล — วัดว่าข้อมูลร้านพร้อมแค่ไหน และพาไปแก้ทีละจุด
   ========================================================= */
'use strict';
VIEWS.dataquality = async el => {
  if (ownerOnly(el)) return;
  el.innerHTML = vhead('ความครบถ้วนของข้อมูล', '', 'more') + '<div id="dq"></div>';
  if (!S.products.length) { try { await quick(loadProducts(), 1500); } catch (e) { } } else loadProducts().catch(() => { });
  const [orders, receipts, sales] = await Promise.all([
    quick(fetchOrders(addDays(todayISO(), -29), todayISO()), 700, []),
    quick(loadTable('Receipts'), 700, []), quick(loadTable('Sales'), 700, [])
  ]);
  const P = S.products.filter(p => p.available !== 'N'), N = P.length || 1;
  const isVar = p => !num(p.price);
  const fixed = P.filter(p => !isVar(p));
  const hasCost = fixed.filter(p => num(p.cost) > 0), hasBar = P.filter(p => p.barcode), hasCat = P.filter(p => p.category), track = P.filter(p => p.trackStock === 'Y');
  const below = fixed.filter(p => num(p.cost) > 0 && num(p.cost) >= num(p.price)), neg = track.filter(p => num(p.stock) < 0), vars = P.filter(isVar);
  const pct = (a, b) => b ? a / b * 100 : 0;
  // จากยอดขาย POS 30 วัน
  let sold = {}, soldTot = 0, varAmt = 0, noCostAmt = 0;
  orders.filter(o => o.status === 'sale' || o.status === 'refunded').forEach(o => o._items.forEach(it => {
    const amt = num(it.qty) * num(it.price), p = IDX.bySku[it.sku];
    soldTot += amt; sold[it.sku] = (sold[it.sku] || 0) + amt;
    if (!p || isVar(p)) varAmt += amt; else if (!num(p.cost)) noCostAmt += amt;
  }));
  const hasPOS = soldTot > 0;
  // ใบเสร็จร้านส่ง เดือนนี้
  const ym = todayISO().slice(0, 7), rcM = receipts.filter(r => String(r.date).startsWith(ym)), rcImg = rcM.filter(r => r.fileUrl);
  // ต้นทุน/ยอดขาย ที่นำเข้า 12 เดือนล่าสุด
  const last12 = sales.filter(r => r.cost !== '' && r.cost != null && num(r.amount)).sort((a, b) => String(b.date).localeCompare(a.date)).slice(0, 12);
  const costRatio = last12.length ? last12.reduce((s, r) => s + num(r.cost), 0) / last12.reduce((s, r) => s + num(r.amount), 0) * 100 : null;
  // คะแนน
  const parts = [
    ['ต้นทุนสินค้า', pct(hasCost.length, fixed.length), 35],
    ['บาร์โค้ด', pct(hasBar.length, N), 20],
    ['นับสต็อก', pct(track.length, N), 15],
    ['หมวดหมู่', pct(hasCat.length, N), 10],
    ['ใบเสร็จร้านส่งมีรูป', rcM.length ? pct(rcImg.length, rcM.length) : 0, 10],
    ['ขายผ่านปุ่มระบุราคาน้อย', hasPOS ? 100 - pct(varAmt, soldTot) : pct(fixed.length, N), 10]
  ];
  const score = Math.round(parts.reduce((s, p) => s + p[1] * p[2], 0) / 100);
  // ประวัติคะแนน (บันทึกวันละครั้ง)
  let hist = []; try { hist = JSON.parse(S.settings.dqHistory || '[]'); } catch (e) { }
  if (!hist.length || hist[hist.length - 1].d !== todayISO()) {
    hist = hist.filter(h => h.d !== todayISO()).concat([{ d: todayISO(), s: score, c: Math.round(pct(hasCost.length, fixed.length)), b: Math.round(pct(hasBar.length, N)) }]).slice(-60);
    saveSetting('dqHistory', hist).catch(() => { });
  }
  const prev = hist.filter(h => h.d <= addDays(todayISO(), -7)).pop();
  const bar = (label, v, sub, color) => `<div style="margin-bottom:12px"><div class="row small"><span class="grow">${label}</span><b>${v.toFixed(0)}%</b></div><div class="prog" style="margin:4px 0"><i style="width:${Math.min(100, v)}%;background:${color || (v >= 80 ? 'var(--green)' : v >= 50 ? 'var(--amber)' : 'var(--red)')}"></i></div>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</div>`;
  const ring = `<svg width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="#EFE9E8" stroke-width="12"/><circle cx="60" cy="60" r="50" fill="none" stroke="${score >= 80 ? '#0B8A3E' : score >= 50 ? '#E09A00' : '#D6001C'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${score * 3.1416} 400" transform="rotate(-90 60 60)"/><text x="60" y="68" text-anchor="middle" font-size="30" font-weight="700" font-family="Prompt">${score}</text></svg>`;
  // งานที่ควรทำ (เรียงตามผลกระทบ)
  const todo = [];
  if (hasCost.length < fixed.length) todo.push(['red', `เติมต้นทุน ${fixed.length - hasCost.length} รายการ`, hasPOS && noCostAmt ? `สินค้าที่ไม่มีต้นทุนขายไป ${baht(noCostAmt)} ใน 30 วัน — กำไรในรายงานจึงสูงเกินจริง` : 'ใช้ตารางด้านล่าง หรือถ่ายใบเสร็จร้านส่ง (ระบบอัปเดตต้นทุนให้)', '#fill']);
  if (below.length) todo.push(['red', `ราคาขายต่ำกว่า/เท่าต้นทุน ${below.length} รายการ`, below.slice(0, 4).map(p => esc(p.name)).join(', ') + (below.length > 4 ? ' …' : ''), '#below']);
  if (hasPOS && varAmt / soldTot > .1) todo.push(['amber', `ยอดขาย ${pct(varAmt, soldTot).toFixed(0)}% มาจากปุ่ม “ระบุราคา”`, `${baht(varAmt)} ใน 30 วัน ระบบไม่รู้ว่าขายอะไรและไม่มีต้นทุน — สร้างเป็นสินค้าจริงแล้วพิมพ์บาร์โค้ด/ทำปุ่มลัด`, 'barcodesheet']);
  if (!hasPOS && vars.length) todo.push(['amber', `สินค้าแบบระบุราคา ${vars.length} รายการ`, vars.slice(0, 5).map(p => esc(p.name)).join(', ') + ' — ยอดที่ขายผ่านปุ่มเหล่านี้ไม่มีต้นทุน', 'products']);
  if (rcM.length === 0) todo.push(['amber', 'เดือนนี้ยังไม่มีใบเสร็จร้านส่ง', 'ถ่ายรูปทุกใบที่ซื้อของเข้าร้าน: ได้ต้นทุนจริง + หลักฐานหักค่าใช้จ่ายตามจริงตอนยื่นภาษี', 'receipts']);
  if (neg.length) todo.push(['amber', `สต็อกติดลบ ${neg.length} รายการ`, 'มักเกิดจากรับของเข้าไม่ได้บันทึก — ตรวจนับหมวดนั้นใหม่', 'stockcount']);
  if (hasBar.length < N) todo.push(['blue', `ไม่มีบาร์โค้ด ${N - hasBar.length} รายการ`, 'พิมพ์สมุดบาร์โค้ด A4 ไว้หน้าแคชเชียร์ หรือพิมพ์ฉลากติดสินค้า', 'barcodesheet']);
  if (track.length < N * .5) todo.push(['blue', `นับสต็อกแล้ว ${track.length} จาก ${N} รายการ`, 'เริ่มนับทีละหมวด สัปดาห์ละหมวด — เริ่มจากหมวดที่ราคาสูง/หายบ่อย', 'stockcount']);
  if (costRatio != null && costRatio < 50) todo.push(['blue', `ต้นทุนที่บันทึกใน Loyverse 12 เดือนล่าสุด = ${costRatio.toFixed(0)}% ของยอดขาย`, 'ต่ำผิดปกติสำหรับร้านขายของชำ แปลว่ากำไรที่เห็นสูงเกินจริง — จะถูกต้องขึ้นเมื่อเติมต้นทุนครบ', 'sales']);

  $('#dq', el).innerHTML = `
   <div class="card row" style="gap:16px">${ring}<div class="grow"><div class="disp" style="font-size:20px">คะแนนความพร้อมของข้อมูล</div><div class="small muted">${score >= 80 ? 'ดีมาก — ตัวเลขกำไรและภาษีเชื่อถือได้' : score >= 50 ? 'พอใช้ — ตัวเลขกำไรยังคลาดเคลื่อน' : 'ต้องปรับปรุง — กำไร/ต้นทุนในรายงานยังไม่สะท้อนความจริง'}</div>${prev ? `<div class="small" style="margin-top:4px">${score - prev.s >= 0 ? '▲' : '▼'} ${Math.abs(score - prev.s)} คะแนน จากสัปดาห์ก่อน (${prev.s})</div>` : '<div class="tiny muted" style="margin-top:4px">ระบบเก็บคะแนนรายวัน ไว้เทียบความคืบหน้า</div>'}</div></div>
   <div class="card"><h3>สิ่งที่ควรทำ เรียงตามผลกระทบ</h3>${todo.map(([c, t, d, go2]) => `<div class="alert ${c}" style="cursor:pointer" data-go="${go2}">${I(c === 'red' ? IC.alert : IC.check, 18)}<div><b>${t}</b><div class="small">${d}</div></div></div>`).join('') || '<div class="alert green">ข้อมูลครบถ้วนดีมาก 🎉</div>'}</div>
   <div class="card"><h3>รายละเอียด</h3>
     ${bar('สินค้ามีต้นทุน', pct(hasCost.length, fixed.length), `${hasCost.length} / ${fixed.length} รายการ (ไม่นับสินค้าระบุราคา ${vars.length} รายการ)`)}
     ${hasPOS ? bar('ยอดขาย 30 วันที่รู้ต้นทุน', pct(soldTot - varAmt - noCostAmt, soldTot), `${baht(soldTot - varAmt - noCostAmt)} จาก ${baht(soldTot)}`) : ''}
     ${bar('สินค้ามีบาร์โค้ด', pct(hasBar.length, N), `${hasBar.length} / ${N}`)}
     ${bar('สินค้าที่นับสต็อก', pct(track.length, N), `${track.length} / ${N}${neg.length ? ' · ติดลบ ' + neg.length : ''}`)}
     ${bar('สินค้ามีหมวดหมู่', pct(hasCat.length, N), `${hasCat.length} / ${N}`)}
     ${bar('ใบเสร็จร้านส่งเดือนนี้มีรูปหลักฐาน', rcM.length ? pct(rcImg.length, rcM.length) : 0, `${rcImg.length} / ${rcM.length} ใบ · ยอดซื้อ ${baht(rcM.reduce((s, r) => s + num(r.total), 0))}`)}
     ${!hasPOS ? '<div class="tiny muted">ยังไม่มียอดขายผ่าน POS ของระบบนี้ใน 30 วัน — เมื่อเริ่มขายผ่านระบบ จะวัดได้ว่ายอดขายกี่ % รู้ต้นทุนจริง</div>' : ''}</div>
   <div class="card" id="fill"><div class="row" style="margin-bottom:6px"><h3 class="grow">เติมต้นทุนด่วน</h3><select class="in" id="fc" style="width:auto;max-width:50%"><option value="">ทุกหมวด</option>${[...new Set(fixed.filter(p => !num(p.cost)).map(p => p.category || ''))].sort().map(c => `<option value="${esc(c)}">${esc(c || 'ไม่ระบุหมวด')}</option>`).join('')}</select></div>
     <div class="tiny muted" style="margin-bottom:6px">เรียงจากสินค้าที่ขายได้มากที่สุดก่อน · ใส่ต้นทุนต่อหน่วยแล้วกดบันทึกทีเดียว</div><div id="fl"></div>
     <div class="row" style="margin-top:10px"><span class="small muted grow" id="fn"></span><button class="btn green" id="fs">บันทึกต้นทุน</button></div></div>
   ${below.length ? `<div class="card" id="below"><h3>ราคาขาย ≤ ต้นทุน</h3>${below.slice(0, 40).map(p => `<div class="kv"><span>${esc(p.name)}</span><span class="small">ทุน ${money(p.cost)} · ขาย <b style="color:var(--red)">${money(p.price)}</b> <a href="javascript:void 0" data-ed="${esc(p.sku)}">แก้</a></span></div>`).join('')}</div>` : ''}`;
  $$('[data-go]', el).forEach(a => a.onclick = () => { const g = a.dataset.go; if (g[0] === '#') { const t = $(g, el); t && t.scrollIntoView({ behavior: 'smooth' }); } else go(g); });
  $$('[data-ed]', el).forEach(a => a.onclick = () => editProduct(IDX.bySku[a.dataset.ed]));
  const edits = {}; let lim = 30;
  const drawFill = () => {
    const c = $('#fc', el).value;
    const list = fixed.filter(p => !num(p.cost) && !(p.sku in edits && num(edits[p.sku]) > 0 && false) && (!c || (p.category || '') === c))
      .sort((a, b) => (sold[b.sku] || 0) - (sold[a.sku] || 0) || (b.bestseller === 'Y') - (a.bestseller === 'Y') || a.name.localeCompare(b.name, 'th'));
    $('#fl', el).innerHTML = list.slice(0, lim).map(p => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="grow"><div class="small" style="font-weight:600;line-height:1.3">${esc(p.name)}</div><div class="tiny muted">ขาย ${money(p.price)}${sold[p.sku] ? ' · ขายได้ ' + baht(sold[p.sku]) + '/30วัน' : ''}</div></div><input class="in num right" style="width:96px;min-height:38px" type="number" inputmode="decimal" step="any" placeholder="ทุน" data-s="${esc(p.sku)}" value="${esc(edits[p.sku] || '')}"></div>`).join('') + (list.length > lim ? `<button class="btn ghost block sm" id="fm" style="margin-top:8px">แสดงเพิ่ม (${list.length - lim})</button>` : '') || '<div class="muted small">ทุกรายการมีต้นทุนแล้ว</div>';
    $$('#fl [data-s]', el).forEach(i => i.oninput = () => { edits[i.dataset.s] = i.value; const p = IDX.bySku[i.dataset.s]; i.style.borderColor = num(i.value) >= num(p.price) && num(i.value) ? 'var(--red)' : ''; $('#fn', el).textContent = Object.values(edits).filter(v => num(v) > 0).length + ' รายการรอบันทึก'; });
    const fm = $('#fm', el); if (fm) fm.onclick = () => { lim += 50; drawFill(); };
  };
  $('#fc', el).onchange = drawFill;
  $('#fs', el).onclick = async () => {
    const rows = Object.entries(edits).filter(([, v]) => num(v) > 0).map(([sku, v]) => ({ ...IDX.bySku[sku], cost: String(num(v)) }));
    if (!rows.length) return toast('ยังไม่ได้ใส่ต้นทุน', 1);
    try { busy(1, `กำลังบันทึก ${rows.length} รายการ...`); await saveProducts(rows); busy(0); toast(`บันทึกต้นทุน ${rows.length} รายการแล้ว`); go('dataquality'); } catch (e) { busy(0); toast(e.message, 1); }
  };
  drawFill();
};
