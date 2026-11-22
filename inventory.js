/* =========================================================
   สินค้าคงคลัง: ตรวจนับสต็อก / ใบสั่งซื้อ / มูลค่าสต็อก / แผ่นบาร์โค้ด A4
   ========================================================= */
'use strict';
VIEWS.inventory = el => {
  const it = [
    ['stockcount', IC.count, 'ตรวจนับสต็อก', 'ทั้งหมด / ตามหมวด / เฉพาะที่สแกน · ใช้เครื่องยิงหรือกล้อง', can('stockCount')],
    ['polist', IC.file, 'ใบสั่งซื้อ', 'สร้างจากสินค้าใกล้หมด พิมพ์ส่งร้านค้า รับของเข้าสต็อก', can('receiveGoods')],
    ['stockvalue', IC.chart, 'มูลค่าสต็อก', 'ต้นทุน มูลค่าขาย กำไรคาดการณ์ ตามหมวด', can('viewCost')],
    ['barcodesheet', IC.scan, 'แผ่นบาร์โค้ด A4', 'สมุดบาร์โค้ดหน้าร้าน / ใบตรวจนับ สำหรับสินค้าไม่มีบาร์โค้ด', 1]
  ].filter(x => x[4]);
  el.innerHTML = vhead('สินค้าคงคลัง', '', 'more') + `<div class="list menu">${it.map(([v, ic, t, d]) => `<div class="item" onclick="go('${v}')"><div class="av">${I(ic, 20)}</div><div class="grow"><div class="t">${t}</div><div class="m">${d}</div></div></div>`).join('')}</div>`;
};

/* ---------- ตรวจนับสต็อก ---------- */
const CNT = { get d() { return LS.get('countDraft', null); }, set d(v) { v ? LS.set('countDraft', v) : LS.del('countDraft'); } };
VIEWS.stockcount = async el => {
  if (!can('stockCount')) return ownerOnly(el);
  // นับสต็อกต้องให้เจ้าของร้านใส่รหัสครั้งเดียวตอนเข้า — ระหว่างนับ/บันทึกไม่ต้องใส่อีก
  if (!(await ownerGate('เข้าตรวจนับสต็อก — ให้เจ้าของร้านใส่รหัส', 'stock'))) { el.innerHTML = vhead('ตรวจนับสต็อก', '', isKiosk() ? 'pos' : 'more') + `<div class="card center"><div style="font-size:40px">🔒</div><div style="margin:8px 0">ต้องให้เจ้าของร้านใส่รหัสก่อนเข้าตรวจนับสต็อก</div><button class="btn" id="rq">ใส่รหัสเจ้าของร้าน</button></div>`; $('#rq', el).onclick = () => go('stockcount'); return; }
  if (!S.products.length) await loadProducts(true).catch(() => { });
  const d = CNT.d;
  if (!d) {
    let hist = []; try { hist = (await api('list', { table: 'StockCounts' })).rows.sort((a, b) => String(b.finishedAt).localeCompare(a.finishedAt)); } catch (e) { }
    el.innerHTML = vhead('ตรวจนับสต็อก', '', 'inventory') + `
     <div class="card"><h3>เริ่มตรวจนับใหม่</h3>
       <div class="list menu">
        <div class="item" id="sa"><div class="av">${I(IC.box, 20)}</div><div class="grow"><div class="t">นับทั้งร้าน</div><div class="m">${S.products.length.toLocaleString()} รายการ</div></div></div>
        <div class="item" id="sc"><div class="av">${I(IC.grid, 20)}</div><div class="grow"><div class="t">นับตามหมวดหมู่</div><div class="m">เลือกได้หลายหมวด</div></div></div>
        <div class="item" id="ss"><div class="av">${I(IC.scan, 20)}</div><div class="grow"><div class="t">นับบางส่วน (เฉพาะที่สแกน/เลือก)</div><div class="m">สแกนสินค้าทีละชิ้นแล้วใส่จำนวน</div></div></div>
       </div><button class="btn ghost block" style="margin-top:10px" onclick="go('barcodesheet')">${I(IC.print, 18)} พิมพ์ใบตรวจนับ (มีบาร์โค้ด)</button></div>
     <div class="card"><h3>ประวัติการตรวจนับ</h3>${hist.length ? hist.slice(0, 30).map(h => `<div class="kv"><span><b>${esc(h.name)}</b><div class="tiny muted">${thDate(h.date)} · ${esc(h.by)}</div></span><span class="tiny right" style="max-width:60%">${esc(h.note)}</span></div>`).join('') : '<div class="muted small">ยังไม่มี</div>'}</div>`;
    const start = (scope, name) => { CNT.d = { id: Logic.uid('SC'), name, scope, counts: {}, started: LocalDB.now(), mode: 'inc' }; go('stockcount'); };
    $('#sa', el).onclick = () => start({ type: 'all' }, 'นับทั้งร้าน ' + thDate(todayISO()));
    $('#ss', el).onclick = () => start({ type: 'selected', skus: [] }, 'นับบางส่วน ' + thDate(todayISO()));
    $('#sc', el).onclick = () => {
      const cats = [...new Set(S.products.map(p => p.category || ''))].sort();
      const ov = sheet('เลือกหมวดที่จะนับ', `<div class="list">${cats.map(c => `<label class="item"><input type="checkbox" value="${esc(c)}"><div class="grow t">${esc(c || 'ไม่ระบุหมวด')}</div><span class="tag gray">${S.products.filter(p => (p.category || '') === c).length}</span></label>`).join('')}</div>`, '<button class="btn block" id="ok">เริ่มนับ</button>');
      $('#ok', ov).onclick = () => { const sel = $$('input:checked', ov).map(i => i.value); if (!sel.length) return toast('เลือกอย่างน้อย 1 หมวด', 1); ov.remove(); start({ type: 'category', categories: sel }, 'นับหมวด ' + sel.map(c => c || 'ไม่ระบุ').join(', ').slice(0, 60)); };
    };
    return;
  }
  // ---- กำลังนับ ----
  const inScope = p => d.scope.type === 'all' || (d.scope.type === 'category' && d.scope.categories.includes(p.category || '')) || (d.scope.type === 'selected' && (d.scope.skus.includes(p.sku) || p.sku in d.counts));
  let filt = 'all', q = '', limit = 80;
  el.innerHTML = vhead(esc(d.name), `<button class="btn ghost sm" id="cx" style="color:var(--red)">ยกเลิก</button>`) + `
    <div class="card" style="position:sticky;top:calc(56px + var(--safe-t));z-index:5"><div class="row"><div class="grow"><div class="small muted">นับแล้ว</div><div class="disp" style="font-size:22px" id="pg"></div></div><button class="btn" id="scn">${I(IC.scan, 20)} สแกน</button></div>
      <div class="prog" style="margin-top:8px"><i id="pb"></i></div>
      <div class="row" style="margin-top:10px"><input class="in grow" id="kb" placeholder="ยิงบาร์โค้ด / ค้นหา" inputmode="search"></div>
      <div class="seg" id="md" style="margin-top:8px"><button data-m="inc">สแกน = +1</button><button data-m="ask">สแกนแล้วใส่จำนวน</button></div>
      <div id="lastc"></div></div>
    <div class="chips" id="fl"></div>
    <div class="list" id="cl"></div>
    <div class="row" style="margin-top:12px;gap:8px"><button class="btn ghost grow" id="sv">บันทึกร่าง</button><button class="btn green grow" id="fin">${I(IC.check, 18)} ปิดการนับ & ปรับสต็อก</button></div>
    <div class="tiny muted" style="margin-top:6px">ร่างการนับเก็บไว้ในเครื่องนี้ ปิดแอปแล้วกลับมานับต่อได้</div>`;
  const save = () => { CNT.d = d; };
  const list = () => S.products.filter(inScope);
  // รายการที่เพิ่งนับ ขึ้นบนสุดของรายการ (ล่าสุดก่อน)
  d.recent = d.recent || [];
  const setCount = (p, v, add) => { if (d.scope.type === 'selected' && !d.scope.skus.includes(p.sku)) d.scope.skus.push(p.sku); const cur = d.counts[p.sku]; d.counts[p.sku] = { c: add ? num(cur && cur.c) + v : v, e: cur ? cur.e : num(p.stock) }; d.recent = [p.sku].concat(d.recent.filter(x => x !== p.sku)).slice(0, 200); save(); };
  // ใส่จำนวนแทนการยิงซ้ำหลายรอบ: เพิ่ม (+) หรือแก้เป็นจำนวนรวม
  const qty = (p, how, after) => keypad((how === 'add' ? 'เพิ่มจำนวน — ' : 'จำนวนรวมที่นับได้ — ') + esc(p.name), '', v => { setCount(p, v, how === 'add'); draw(); after && after(); },
    { sub: `นับแล้ว ${d.counts[p.sku] ? num(d.counts[p.sku].c) : 0} · ในระบบ ${num(p.stock)}${how === 'add' ? ' · ใส่จำนวนที่จะบวกเพิ่ม' : ''}`, z: 95 });
  const lastHTML = p => { const c = d.counts[p.sku]; return `<div class="row" style="gap:8px;align-items:center"><div class="grow" style="min-width:0"><div class="tiny muted">ล่าสุด</div><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</b></div><span class="tag green" style="font-size:18px;padding:4px 12px">${c ? num(c.c) : 0}</span></div>
      <div class="row" style="gap:6px;margin-top:6px"><button class="btn ghost sm grow" onclick="CNTQ('${esc(p.sku)}','add')">＋ เพิ่มจำนวน</button><button class="btn ghost sm grow" onclick="CNTQ('${esc(p.sku)}','set')">แก้จำนวนรวม</button></div>`; };
  const drawLast = () => { const box = $('#lastc', el); const p = d.recent[0] && IDX.bySku[d.recent[0]]; if (box) box.innerHTML = p ? `<div style="margin-top:10px;padding:10px 12px;border-radius:12px;background:#ecfdf3">${lastHTML(p)}</div>` : ''; };
  window.CNTQ = (sku, how) => { const p = IDX.bySku[sku]; if (!p) return; qty(p, how, () => { const b = document.querySelector('.scan .last'); if (b) b.innerHTML = lastHTML(p); }); };
  const draw = () => {
    const L = list(), done = L.filter(p => p.sku in d.counts).length;
    $('#pg', el).textContent = `${done.toLocaleString()} / ${L.length.toLocaleString()}`; $('#pb', el).style.width = (L.length ? done / L.length * 100 : 0) + '%';
    $$('#md button', el).forEach(b => b.classList.toggle('on', b.dataset.m === d.mode));
    $('#fl', el).innerHTML = [['all', 'ทั้งหมด'], ['todo', 'ยังไม่นับ'], ['done', 'นับแล้ว'], ['diff', 'มีส่วนต่าง']].map(([k, n]) => `<button class="chip ${filt === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('');
    $$('[data-f]', el).forEach(b => b.onclick = () => { filt = b.dataset.f; limit = 80; draw(); });
    const t = q.toLowerCase().split(/\s+/).map(norm).filter(Boolean);
    let res = L.filter(p => t.every(x => p._n.includes(x)));
    // เรียงรายการที่เพิ่งนับไว้บนสุด
    const rk = {}; d.recent.forEach((x, i) => rk[x] = i + 1);
    if (d.recent.length) res = res.map((p, i) => [p, i]).sort((a, b) => (rk[a[0].sku] || 1e9) - (rk[b[0].sku] || 1e9) || a[1] - b[1]).map(x => x[0]);
    drawLast();
    if (filt === 'todo') res = res.filter(p => !(p.sku in d.counts)); else if (filt === 'done') res = res.filter(p => p.sku in d.counts); else if (filt === 'diff') res = res.filter(p => p.sku in d.counts && num(d.counts[p.sku].c) !== num(d.counts[p.sku].e));
    $('#cl', el).innerHTML = res.slice(0, limit).map(p => { const c = d.counts[p.sku], diff = c ? num(c.c) - num(c.e) : null; const isLast = p.sku === d.recent[0]; return `<div class="item" style="cursor:default${isLast ? ';background:#ecfdf3;box-shadow:inset 4px 0 0 var(--green)' : ''}"><div class="grow"><div class="t">${isLast ? '<span class="tag green" style="margin-right:6px">ล่าสุด</span>' : ''}${esc(p.name)}</div><div class="m">${esc(p.barcode || p.sku)} · ระบบ ${num(c ? c.e : p.stock)}${diff ? ` · <b style="color:${diff > 0 ? 'var(--green)' : 'var(--red)'}">${diff > 0 ? '+' : ''}${Math.round(diff * 1000) / 1000}</b>` : ''}</div></div><input class="in num right" style="width:84px;min-height:40px" type="number" inputmode="decimal" step="any" data-s="${esc(p.sku)}" value="${c ? c.c : ''}" placeholder="นับ"></div>`; }).join('') + (res.length > limit ? `<div class="item center" id="more" style="justify-content:center;color:var(--red)">แสดงเพิ่ม (${res.length - limit})</div>` : '') || '<div class="empty">ไม่มีรายการ</div>';
    $$('#cl [data-s]', el).forEach(i => i.onchange = () => { const p = IDX.bySku[i.dataset.s]; if (i.value === '') { delete d.counts[p.sku]; save(); } else setCount(p, num(i.value)); draw(); });
    const m = $('#more', el); if (m) m.onclick = () => { limit += 150; draw(); };
  };
  const hit = (code, ctx) => {
    const f = findByCode(code); if (!f) { toast('ไม่พบ ' + code, 1); ctx && ctx.showLast('ไม่พบ ' + esc(code)); return; }
    const p = f.p;
    if (d.scope.type !== 'selected' && !inScope(p)) { toast(p.name + ' ไม่อยู่ในขอบเขตการนับนี้', 1); return; }
    if (d.mode === 'ask') { keypad('จำนวนที่นับได้ — ' + esc(p.name), d.counts[p.sku] ? d.counts[p.sku].c : '', v => { setCount(p, v); draw(); }, { sub: 'ในระบบ ' + num(p.stock) }); return 'close'; }
    setCount(p, 1, true); ctx && ctx.showLast(lastHTML(p)); draw(); if (!ctx) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  $('#scn', el).onclick = () => openScanner((c, ctx) => hit(c, ctx), { continuous: d.mode === 'inc', title: 'สแกนนับสต็อก' });
  Scanner.on('stockcount', c => { if (findByCode(c)) { beep(); hit(c); } else { Scanner.err(); toast('ไม่พบ ' + c, 1); } });
  const kb = $('#kb', el);
  kb.onkeydown = e => { if (e.key === 'Enter' && kb.value.trim()) { const v = kb.value.trim(); if (findByCode(v)) { beep(); hit(v); kb.value = ''; q = ''; } else { q = v; } draw(); } };
  kb.oninput = () => { if (!/^\d{8,}$/.test(kb.value)) { q = kb.value; limit = 80; draw(); } };
  $$('#md button', el).forEach(b => b.onclick = () => { d.mode = b.dataset.m; save(); draw(); });
  $('#sv', el).onclick = () => { save(); toast('บันทึกร่างในเครื่องแล้ว'); };
  $('#cx', el).onclick = async () => { if (await confirmDlg('ยกเลิกการนับนี้? ข้อมูลที่นับจะหายไป', 'ยกเลิกการนับ', true)) { CNT.d = null; go('stockcount'); } };
  $('#fin', el).onclick = () => {
    const L = list(), n = Object.keys(d.counts).length; if (!n) return toast('ยังไม่ได้นับสินค้า', 1);
    let dv = 0, dq = 0; Object.entries(d.counts).forEach(([sku, c]) => { const p = IDX.bySku[sku]; const df = num(c.c) - num(p ? p.stock : c.e); dq += df; dv += df * num(p && p.cost); });
    const ov = sheet('ปิดการนับและปรับสต็อก', `<div class="kv"><span>นับแล้ว</span><b>${n} / ${L.length} รายการ</b></div><div class="kv"><span>ส่วนต่างรวม</span><b>${Math.round(dq * 1000) / 1000} ชิ้น</b></div>${can('viewCost') ? `<div class="kv"><span>มูลค่าส่วนต่าง (ทุน)</span><b style="color:${dv < 0 ? 'var(--red)' : 'var(--green)'}">${baht(dv)}</b></div>` : ''}
      ${d.scope.type !== 'selected' && n < L.length ? `<label class="row small" style="margin-top:10px"><input type="checkbox" id="z"> สินค้าที่ไม่ได้นับในขอบเขตนี้ ให้ปรับสต็อกเป็น 0</label>` : ''}<label class="f" style="margin-top:10px"><span>หมายเหตุ</span><input class="in" id="nt"></label>`, `<button class="btn block green" id="ok">ยืนยันปรับสต็อก</button>`);
    $('#ok', ov).onclick = async () => {
      try {
        busy(1, 'กำลังปรับสต็อก...');
        const items = Object.entries(d.counts).map(([sku, c]) => ({ sku, counted: c.c, expected: c.e }));
        const r = await api('finishCount', { id: d.id, name: d.name, scope: d.scope, items, zeroUncounted: !!($('#z', ov) && $('#z', ov).checked), note: $('#nt', ov).value });
        (r.stock || []).forEach(x => { const p = IDX.bySku[x.sku]; if (p) { p.stock = x.stock; if (x.trackStock) p.trackStock = x.trackStock; } }); LS.set('products', S.products);
        CNT.d = null; busy(0); ov.remove(); toast(`ปรับสต็อกแล้ว ${r.updated} รายการ`); go('stockcount');
      } catch (e) { busy(0); toast(e.message, 1); }
    };
  };
  draw();
};

/* ---------- มูลค่าสต็อก ---------- */
VIEWS.stockvalue = async el => {
  if (!can('viewCost')) return ownerOnly(el);
  el.innerHTML = vhead('มูลค่าสต็อก', `<button class="btn ghost sm" id="ex">CSV</button>`, 'inventory') + '<div id="sv"><div class="card center"><span class="spin dark"></span></div></div>';
  await loadProducts(true).catch(() => { });
  const tr = S.products.filter(p => p.trackStock === 'Y');
  const pos = tr.filter(p => num(p.stock) > 0), neg = tr.filter(p => num(p.stock) < 0), nocost = pos.filter(p => !num(p.cost));
  const cats = {}; let T = { qty: 0, cost: 0, retail: 0, n: 0 };
  pos.forEach(p => { const k = p.category || 'ไม่ระบุหมวด', c = cats[k] || (cats[k] = { qty: 0, cost: 0, retail: 0, n: 0 }); const q = num(p.stock); c.qty += q; c.cost += q * num(p.cost); c.retail += q * num(p.price); c.n++; T.qty += q; T.cost += q * num(p.cost); T.retail += q * num(p.price); T.n++; });
  const k = (t, v, s) => `<div class="stat"><div class="k">${t}</div><div class="v">${v}</div>${s ? `<div class="tiny muted">${s}</div>` : ''}</div>`;
  const top = pos.map(p => ({ p, v: num(p.stock) * num(p.cost) })).sort((a, b) => b.v - a.v).slice(0, 15);
  $('#sv', el).innerHTML = `<div class="grid2" style="margin-bottom:12px">${k('มูลค่าสต็อก (ทุน)', baht(T.cost), T.n + ' รายการที่นับสต็อก')}${k('มูลค่าขาย', baht(T.retail))}${k('กำไรคาดการณ์', baht(T.retail - T.cost), T.retail ? ((T.retail - T.cost) / T.retail * 100).toFixed(1) + '%' : '')}${k('จำนวนชิ้นรวม', Math.round(T.qty).toLocaleString())}</div>
    ${neg.length ? `<div class="alert amber">${I(IC.alert, 18)}<div>สต็อกติดลบ ${neg.length} รายการ (ไม่นำมาคิดมูลค่า) — ควรตรวจนับ <a href="#stockcount">ไปตรวจนับ</a></div></div>` : ''}
    ${nocost.length ? `<div class="alert amber">${I(IC.alert, 18)}<div>มีสต็อกแต่ไม่มีต้นทุน ${nocost.length} รายการ — มูลค่าทุนจะต่ำกว่าจริง</div></div>` : ''}
    <div class="alert blue">${I(IC.alert, 18)}<div>คิดเฉพาะสินค้าที่เปิด “นับสต็อก” (${tr.length} จาก ${S.products.length} รายการ) — เปิดนับสต็อกได้จากการตรวจนับหรือรับสินค้าเข้า</div></div>
    <div class="card"><h3>ตามหมวดหมู่</h3><div class="scroll-x"><table class="t"><tr><th>หมวด</th><th class="right">รายการ</th><th class="right">ทุน</th><th class="right">ขาย</th><th class="right">กำไร%</th></tr>${Object.entries(cats).sort((a, b) => b[1].cost - a[1].cost).map(([n, c]) => `<tr><td>${esc(n)}</td><td class="right">${c.n}</td><td class="right num">${money(c.cost)}</td><td class="right num">${money(c.retail)}</td><td class="right">${c.retail ? ((c.retail - c.cost) / c.retail * 100).toFixed(1) : '-'}</td></tr>`).join('')}</table></div></div>
    <div class="card"><h3>มูลค่าสูงสุด 15 อันดับ</h3>${top.map(x => `<div class="kv"><span>${esc(x.p.name)} <span class="muted tiny">× ${num(x.p.stock)}</span></span><b>${money(x.v)}</b></div>`).join('') || '<div class="muted small">ไม่มี</div>'}</div>`;
  $('#ex', el).onclick = () => download(`stock_value_${todayISO()}.csv`, toCSV([['SKU', 'ชื่อ', 'หมวด', 'คงเหลือ', 'ต้นทุน', 'ราคาขาย', 'มูลค่าทุน', 'มูลค่าขาย']].concat(tr.map(p => [p.sku, p.name, p.category, p.stock, p.cost, p.price, Math.round(num(p.stock) * num(p.cost) * 100) / 100, Math.round(num(p.stock) * num(p.price) * 100) / 100]))));
};

/* ---------- ใบสั่งซื้อ ---------- */
VIEWS.polist = async el => {
  if (!can('receiveGoods')) return ownerOnly(el);
  el.innerHTML = vhead('ใบสั่งซื้อ', `<button class="btn sm" id="nw">${I(IC.plus, 18)} สร้าง</button>`, 'inventory') + '<div class="list" id="pl"><div class="empty"><span class="spin dark"></span></div></div>';
  $('#nw', el).onclick = () => poForm(null);
  try {
    const rows = (await api('list', { table: 'POs' })).rows.sort((a, b) => String(b.date).localeCompare(a.date));
    S.pos = rows;
    $('#pl', el).innerHTML = rows.length ? rows.map(p => `<div class="item" data-id="${esc(p.id)}"><div class="grow"><div class="t">${esc(p.supplier || 'ไม่ระบุร้าน')}</div><div class="m">${thDate(p.date)} · ${esc(p.id)} · ${Logic.J(p.items, []).length} รายการ</div></div><span class="tag ${p.status === 'received' ? 'green' : p.status === 'sent' ? 'blue' : 'gray'}">${{ draft: 'ร่าง', sent: 'สั่งแล้ว', received: 'รับของแล้ว' }[p.status] || p.status}</span><div class="price" style="font-size:15px;color:var(--ink);margin-left:8px">${baht(p.total)}</div></div>`).join('') : '<div class="empty">ยังไม่มีใบสั่งซื้อ</div>';
    $$('#pl [data-id]', el).forEach(x => x.onclick = () => poForm(rows.find(p => p.id === x.dataset.id)));
  } catch (e) { $('#pl', el).innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
};
function poForm(po) {
  const isNew = !po; po = po ? { ...po } : { id: 'PO' + todayISO().replace(/-/g, '').slice(2) + '-' + Math.floor(Math.random() * 900 + 100), date: todayISO(), status: 'draft', supplier: '', items: '[]' };
  let items = Logic.J(po.items, []); const ro = po.status === 'received';
  const sups = [...new Set((S.receipts || []).map(r => r.supplier).concat((S.pos || []).map(p => p.supplier)).filter(Boolean))];
  const ov = sheet(isNew ? 'ใบสั่งซื้อใหม่' : 'ใบสั่งซื้อ ' + esc(po.id), `
    <div class="grid2"><label class="f"><span>ร้านค้า/ผู้ขาย</span><input class="in" id="sp" list="spl" value="${esc(po.supplier)}" ${ro ? 'readonly' : ''}><datalist id="spl">${sups.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label><label class="f"><span>วันที่</span><input class="in" type="date" id="dt" value="${esc(po.date)}" ${ro ? 'readonly' : ''}></label></div>
    ${ro ? '' : `<div class="row wrap" style="gap:6px;margin-bottom:8px"><button class="btn ghost sm" id="low">เติมจากสินค้าใกล้หมด</button><button class="btn ghost sm" id="add">${I(IC.plus, 16)} เพิ่มสินค้า</button><button class="btn ghost sm" id="scn">${I(IC.scan, 16)} สแกน</button></div>`}
    <div id="its"></div><div class="kv" style="font-weight:700;font-size:17px"><span>รวม</span><span id="tt"></span></div>
    <label class="f" style="margin-top:8px"><span>หมายเหตุ</span><input class="in" id="nt" value="${esc(po.note)}" ${ro ? 'readonly' : ''}></label>`,
    `<button class="btn ghost grow" id="pr">${I(IC.print, 18)} พิมพ์</button>${ro ? '' : `<button class="btn ghost grow" id="sv">บันทึก</button><button class="btn green grow" id="rc">รับของเข้าสต็อก</button>`}`);
  const tot = () => items.reduce((s, i) => s + num(i.qty) * num(i.cost), 0);
  const draw = () => {
    $('#its', ov).innerHTML = items.map((it, i) => `<div style="border-bottom:1px solid var(--line);padding:6px 0"><div class="row"><div class="grow small" style="font-weight:600">${esc(it.name)}</div>${ro ? '' : `<button class="iconbtn" data-x="${i}">${I(IC.x, 16)}</button>`}</div><div class="grid3"><label class="tiny muted">จำนวน<input class="in" type="number" step="any" data-k="qty" data-i="${i}" value="${it.qty}" ${ro ? 'readonly' : ''}></label><label class="tiny muted">ทุน/หน่วย<input class="in" type="number" step="any" data-k="cost" data-i="${i}" value="${it.cost}" ${ro ? 'readonly' : ''}></label><div class="tiny muted right">รวม<div class="num" style="font-size:15px;color:var(--ink);padding-top:10px">${money(num(it.qty) * num(it.cost))}</div></div></div></div>`).join('') || '<div class="empty small">ยังไม่มีรายการ</div>';
    $('#tt', ov).textContent = baht(tot());
    $$('[data-k]', ov).forEach(i => i.onchange = () => { items[+i.dataset.i][i.dataset.k] = num(i.value); draw(); });
    $$('[data-x]', ov).forEach(b => b.onclick = () => { items.splice(+b.dataset.x, 1); draw(); });
  };
  const addP = p => { const e = items.find(i => i.sku === p.sku); if (e) e.qty = num(e.qty) + 1; else items.push({ sku: p.sku, name: p.name, barcode: p.barcode, qty: 1, cost: num(p.cost) }); draw(); };
  const collect = () => ({ ...po, supplier: $('#sp', ov).value.trim(), date: $('#dt', ov).value, note: $('#nt', ov).value, items: JSON.stringify(items), total: String(Math.round(tot() * 100) / 100) });
  if (!ro) {
    $('#low', ov).onclick = () => { const low = S.products.filter(p => p.trackStock === 'Y' && p.lowStock !== '' && num(p.stock) <= num(p.lowStock)); low.forEach(p => { if (!items.some(i => i.sku === p.sku)) items.push({ sku: p.sku, name: p.name, barcode: p.barcode, qty: Math.max(1, num(p.lowStock) * 2 - num(p.stock)), cost: num(p.cost) }); }); toast(`เพิ่ม ${low.length} รายการ`); draw(); };
    $('#add', ov).onclick = () => { let q = ''; const o2 = sheet('เพิ่มสินค้า', `<input class="in" id="q" placeholder="ค้นหา..."><div class="list" id="l" style="margin-top:8px"></div>`); const dr = () => { $('#l', o2).innerHTML = searchProducts(q).slice(0, 50).map(p => `<div class="item" data-s="${esc(p.sku)}">${pthumb(p, 40)}<div class="grow"><div class="t">${esc(p.name)}</div><div class="m">คงเหลือ ${num(p.stock)} · ทุน ${money(p.cost)}</div></div></div>`).join(''); $$('[data-s]', o2).forEach(x => x.onclick = () => { addP(IDX.bySku[x.dataset.s]); toast('เพิ่มแล้ว'); }); }; $('#q', o2).oninput = e => { q = e.target.value; dr(); }; dr(); };
    $('#scn', ov).onclick = () => openScanner((c, ctx) => { const f = findByCode(c); if (f) { addP(f.p); ctx.showLast(esc(f.p.name) + ' ✓'); } else ctx.showLast('ไม่พบ ' + esc(c)); return ''; }, { continuous: true, title: 'สแกนเพิ่มในใบสั่งซื้อ' });
    $('#sv', ov).onclick = async () => { try { busy(1); const o = collect(); if (o.status === 'draft') o.status = 'sent'; await api('upsert', { table: 'POs', rows: [o] }); busy(0); ov.remove(); toast('บันทึกแล้ว'); go('polist'); } catch (e) { busy(0); toast(e.message, 1); } };
    $('#rc', ov).onclick = async () => { if (!items.length) return toast('ไม่มีรายการ', 1); if (!(await confirmDlg('รับของตามใบสั่งซื้อนี้เข้าสต็อก และอัปเดตต้นทุน?', 'รับของ'))) return; try { busy(1); await api('upsert', { table: 'POs', rows: [collect()] }); await api('receivePO', { id: po.id }); await loadProducts(true); busy(0); ov.remove(); toast('รับของเข้าสต็อกแล้ว'); go('polist'); } catch (e) { busy(0); toast(e.message, 1); } };
  }
  $('#pr', ov).onclick = () => { const o = collect(); printA4(`<h2>ใบสั่งซื้อ ${esc(o.id)}</h2><div>${esc(S.settings.shopName || '')} · ${esc(S.settings.address || '')} · โทร ${esc(S.settings.phone || '')}</div><div>ถึง: <b>${esc(o.supplier || '-')}</b> · วันที่ ${thDate(o.date)}</div>
     <table style="margin-top:8px"><tr><th>#</th><th>บาร์โค้ด</th><th>สินค้า</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>รวม</th></tr>${items.map((it, i) => `<tr><td>${i + 1}</td><td>${barcodeImg(it.barcode || internalBarcode(it.sku), 150, 36)}</td><td>${esc(it.name)}</td><td style="text-align:right">${it.qty}</td><td style="text-align:right">${money(it.cost)}</td><td style="text-align:right">${money(num(it.qty) * num(it.cost))}</td></tr>`).join('')}<tr><th colspan="5" style="text-align:right">รวม</th><th style="text-align:right">${money(tot())}</th></tr></table>${o.note ? `<p>หมายเหตุ: ${esc(o.note)}</p>` : ''}`); };
  draw();
}

/* ---------- A4 ---------- */
function barcodeImg(code, w = 180, h = 50) { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); drawBarcode(x, code, 4, 2, c.width - 8, c.height - 6, true, 20); return `<img src="${c.toDataURL()}" style="width:${w}px;height:${h}px">`; }
function printA4(html) {
  $('#printArea').innerHTML = `<style>@page{size:A4;margin:10mm}#printArea .bs{display:grid;gap:4mm}#printArea .bs>div{border:1px dashed #999;padding:2mm;text-align:center;break-inside:avoid;font-size:11px}</style>` + html;
  setTimeout(() => { try { window.print(); } catch (e) { toast('อุปกรณ์นี้สั่งพิมพ์ไม่ได้', 1); } }, 150);
}
VIEWS.barcodesheet = async el => {
  if (!S.products.length) await loadProducts(true).catch(() => { });
  const cats = [...new Set(S.products.map(p => p.category || ''))].sort();
  el.innerHTML = vhead('แผ่นบาร์โค้ด A4', '', 'inventory') + `
   <div class="card"><div class="seg" id="ty"><button data-t="book" class="on">สมุดบาร์โค้ดหน้าร้าน</button><button data-t="count">ใบตรวจนับสต็อก</button></div>
    <p class="small muted" id="hp"></p>
    <label class="f"><span>สินค้า</span><select class="in" id="src"><option value="nobar">สินค้าที่ไม่มีบาร์โค้ด (สร้างบาร์โค้ดให้อัตโนมัติ)</option><option value="best">สินค้าขายดี</option><option value="all">ทั้งหมด</option>${cats.map(c => `<option value="c:${esc(c)}">หมวด: ${esc(c || 'ไม่ระบุ')}</option>`).join('')}</select></label>
    <div class="grid2"><label class="f"><span>จำนวนคอลัมน์</span><select class="in" id="cols"><option>3</option><option selected>4</option><option>5</option></select></label><label class="f"><span>แสดงราคา</span><select class="in" id="pr"><option value="1">แสดง</option><option value="0">ไม่แสดง</option></select></label></div>
    <div class="small muted" id="cnt"></div><button class="btn block" id="go" style="margin-top:8px">${I(IC.print, 18)} สร้างและพิมพ์</button></div>`;
  let type = 'book';
  const pick = () => { const v = $('#src', el).value; return S.products.filter(p => v === 'nobar' ? !p.barcode : v === 'best' ? p.bestseller === 'Y' : v === 'all' ? true : (p.category || '') === v.slice(2)).sort((a, b) => a.name.localeCompare(b.name, 'th')); };
  const upd = () => { $('#hp', el).textContent = type === 'book' ? 'พิมพ์บาร์โค้ดของสินค้าที่ไม่มีบาร์โค้ดเป็นเล่ม วางไว้ที่แคชเชียร์ — ยิงจากกระดาษได้ทันที ขายเร็วขึ้น' : 'ตารางรายการสินค้าพร้อมบาร์โค้ดและช่องเขียนจำนวน สำหรับเดินนับในร้าน'; $('#cnt', el).textContent = pick().length + ' รายการ'; };
  $$('#ty button', el).forEach(b => b.onclick = () => { type = b.dataset.t; $$('#ty button', el).forEach(x => x.classList.toggle('on', x === b)); upd(); });
  $('#src', el).onchange = upd; upd();
  $('#go', el).onclick = async () => {
    const list = pick(); if (!list.length) return toast('ไม่มีรายการ', 1);
    if (list.length > 600 && !(await confirmDlg(`พิมพ์ ${list.length} รายการ? (หลายหน้า)`, 'พิมพ์'))) return;
    const missing = list.filter(p => !p.barcode);
    if (missing.length && can('editProducts')) { try { busy(1, `สร้างบาร์โค้ดให้ ${missing.length} รายการ...`); await saveProducts(missing.map(p => ({ ...p, barcode: internalBarcode(p.sku) }))); busy(0); } catch (e) { busy(0); return toast(e.message, 1); } }
    const L = list.map(p => IDX.bySku[p.sku] || p), sp = $('#pr', el).value === '1';
    busy(1, 'กำลังเตรียมหน้าพิมพ์...'); await sleep(30);
    if (type === 'book') { const cols = +$('#cols', el).value; printA4(`<h2 style="font-size:14px">${esc(S.settings.shopName || '')} — สมุดบาร์โค้ด (${thDate(todayISO())})</h2><div class="bs" style="grid-template-columns:repeat(${cols},1fr)">${L.map(p => `<div><div style="font-weight:600;height:2.6em;overflow:hidden">${esc(p.name)}</div>${barcodeImg(p.barcode || internalBarcode(p.sku), 160, 46)}${sp ? `<div style="font-weight:700">${baht(p.price)}</div>` : ''}</div>`).join('')}</div>`); }
    else printA4(`<h2 style="font-size:14px">ใบตรวจนับสต็อก — ${thDate(todayISO())} · ผู้นับ ..................</h2><table><tr><th>#</th><th>บาร์โค้ด</th><th>สินค้า</th><th>ในระบบ</th><th style="width:22mm">นับได้</th></tr>${L.map((p, i) => `<tr><td>${i + 1}</td><td>${barcodeImg(p.barcode || internalBarcode(p.sku), 130, 30)}</td><td>${esc(p.name)}</td><td style="text-align:right">${p.trackStock === 'Y' ? num(p.stock) : '-'}</td><td></td></tr>`).join('')}</table>`);
    busy(0);
  };
};
