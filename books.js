/* =========================================================
   บัญชีร้าน: ตรวจสินค้า/หมวดยกเว้น VAT (ม.81(1)) · บัญชีรายรับ-รายจ่าย 40(8)
   · สแกนเอกสารจากกล้อง (ตัดขอบอัตโนมัติ) · ส่งออกรายงานฟอนต์ TH Sarabun
   ========================================================= */
'use strict';

/* ---------- ตัวจำแนกสินค้ายกเว้น VAT ----------
   อิงประมวลรัษฎากร ม.81(1)(ก)–(ฉ) + คำสั่งกรมสรรพากร ป.28/2535 (พืชผล), ป.29/2535 (สัตว์)
   หลักใหญ่: ของสด/แช่เย็น/แช่แข็ง/ตากแห้ง ที่ไม่ปรุงรส = ยกเว้น · ปรุงรสและบรรจุผนึกมั่นคง หรือแปรสภาพเป็นอาหารอื่น = เสีย VAT
   ผลลัพธ์: ex = น่าจะยกเว้น · chk = ต้องตรวจสอบ · tax = เสีย VAT ปกติ (เป็นคำแนะนำ ไม่ใช่คำวินิจฉัย) */
const VATX = (() => {
  const G = {
    veg: { n: 'ผัก ผลไม้ สมุนไพรสด', law: 'ม.81(1)(ก)', cat: 'ของสด (ยกเว้น VAT)', ex: 'ผักสด มะนาว พริกสด กระเทียม หอมแดง ผลไม้', no: 'ผักดองบรรจุขวด น้ำผลไม้ ผลไม้กระป๋อง' },
    rice: { n: 'ข้าวสาร ธัญพืช ถั่ว งา', law: 'ม.81(1)(ก) · ป.28/2535 ข้อ 2', cat: 'ข้าวสาร ธัญพืช (ยกเว้น VAT)', ex: 'ข้าวสาร ข้าวเหนียว ถั่วเขียว ถั่วเหลือง งาขาว', no: 'แป้งสาลี ขนมข้าว ถั่วอบเกลือ' },
    egg: { n: 'ไข่สด', law: 'ม.81(1)(ข)', cat: 'ของสด (ยกเว้น VAT)', ex: 'ไข่ไก่ ไข่เป็ด ไข่เค็มดิบ', no: 'ไข่ต้ม ไข่พะโล้' },
    meat: { n: 'เนื้อสัตว์ ปลา อาหารทะเล', law: 'ม.81(1)(ข) · ป.29/2535', cat: 'ของสด (ยกเว้น VAT)', ex: 'หมู ไก่ ปลา กุ้ง สด/แช่เย็น/แช่แข็ง (ไม่ปรุงรส)', no: 'ลูกชิ้น ไส้กรอก กุนเชียง หมูยอ แหนม ปลากระป๋อง' },
    feed: { n: 'อาหารสัตว์', law: 'ม.81(1)(ง)', cat: 'อาหารสัตว์ (ยกเว้น VAT)', ex: 'อาหารไก่ อาหารปลา หัวอาหาร รำ ปลาป่น', no: 'ขนมสัตว์เลี้ยง (ต้องตรวจ)' },
    farm: { n: 'ปุ๋ย ยา/เคมีภัณฑ์สำหรับพืช-สัตว์', law: 'ม.81(1)(ค)(จ)', cat: 'ปุ๋ย ยาเกษตร (ยกเว้น VAT)', ex: 'ปุ๋ยเคมี ปุ๋ยคอก ยาฆ่าหญ้า ยาสัตว์', no: 'ยากันยุง สเปรย์ฆ่าแมลงในบ้าน' },
    print: { n: 'หนังสือพิมพ์ นิตยสาร ตำรา', law: 'ม.81(1)(ฉ)', cat: 'หนังสือพิมพ์ ตำรา (ยกเว้น VAT)', ex: 'หนังสือพิมพ์ นิตยสาร หนังสือเรียน', no: 'สมุด เครื่องเขียน' }
  };
  const VEG = 'ผัก|ผลไม้|มะนาว|มะเขือ|มะละกอ|มะม่วง|มะพร้าว|มะกรูด|มะระ|มะยม|มะเฟือง|กระเทียม|หอม(แดง|หัว|แขก|ใหญ่|ใบ)|ต้นหอม|ผักชี|พริก|ขิง|ข่า|ตะไคร้|ใบ(มะกรูด|กะเพรา|โหระพา|แมงลัก|เตย|ชะพลู)|กะเพรา|โหระพา|กะหล่ำ|คะน้า|กวางตุ้ง|ผักกาด|แตง|ฟัก|บวบ|ถั่วฝักยาว|ถั่วงอก|ถั่วพู|ข้าวโพด|เห็ด|มันฝรั่ง|มันเทศ|มันสำปะหลัง|เผือก|ส้ม|กล้วย|สับปะรด|ฝรั่ง|ชมพู่|ลำไย|ลิ้นจี่|มังคุด|ทุเรียน|เงาะ|องุ่น|แอปเปิ้ล|แอ๊ปเปิ้ล|สาลี่|แครอท|หน่อไม้|สะตอ|ชะอม|ตำลึง|แก้วมังกร|ละมุด|น้อยหน่า|ขนุน|กระชาย|ขมิ้น|ยอดมะพร้าว';
  const MEAT = 'หมู|ไก่|เป็ด|เนื้อ|วัว|ควาย|แพะ|ปลา|กุ้ง|หมึก|ปู(?!น|ไทย)|หอย|โครงไก่|ปีก|น่อง|สะโพก|อกไก่|ตับ|เครื่องใน|สามชั้น|ซี่โครง|สันใน|สันนอก|คอหมู|กบ(?=นา|สด|\\s|\\(|$)|ปลาไหล';
  // [regex, ผล, กลุ่ม, เหตุผล] — ตรงข้อแรกที่เจอ (ข้อยกเว้นของการยกเว้นอยู่ก่อน)
  const R = [
    [/รส(?=[ก-ฮ\s])|กลิ่น/, 'tax', '', 'ปรุงรส/แต่งกลิ่น = สินค้าแปรรูป'],   // "รส" ต้องตามด้วยพยัญชนะ (กัน "อาหาร|สัตว์")
    [/ลูกชิ้น|ไส้กรอก|กุ[นญ]เชียง|หมูยอ|แหนม|หยอง|หมูแผ่น|หมูทุบ|แฮม|เบคอน|นักเก็ต|เกี๊ยว|ซาลาเปา|ติ่มซำ|เต้าหู้|ฟองเต้าหู้/, 'tax', '', 'อาหารแปรรูป (แปรสภาพเป็นอาหารอื่น)'],
    [/ทอด|เจียว|อบ|กรอบ|ราดพริก|ผัด|พะโล้|ต้มสุก|สำเร็จรูป|เฟรนฟราย|french|กระป๋อง|ซาร์?ดีน|ทูน่า|แช่อิ่ม|เชื่อม|กวน/i, 'tax', '', 'ปรุงสุก/สำเร็จรูป/บรรจุกระป๋อง'],
    [/ซอส|น้ำปลา|น้ำจิ้ม|ซีอิ๊ว|เต้าเจี้ยว|น้ำพริก|พริกเผา|พริกแกง|เครื่องแกง|ผงปรุง|ผงชูรส|คนอร์|ก้อนปรุง|ซุป/, 'tax', '', 'เครื่องปรุงรส'],
    [/มาม่า|บะหมี่|ยำยำ|ไวไว|โจ๊ก|ข้าวต้ม|วุ้นเส้น|ขนม|เค้ก|ปัง|ข้าวเกรียบ|เยลลี่|ลูกอม|ไอศ/, 'tax', '', 'อาหารสำเร็จรูป/ขนม'],
    [/สุรา|เหล้า|เบียร์|ไวน์|บุหรี่|ยาสูบ/, 'tax', '', 'สุรา/ยาสูบ'],
    [/น้ำมัน|แก๊ส/, 'tax', '', 'น้ำมันพืชบรรจุผนึก/เชื้อเพลิง'],
    [/^น้ำ|นม|โยเกิร์ต|กาแฟ|(^|\s)ชา|ชา(เขียว|ไทย|นม|ดำ|เย็น|มะนาว|ร์)|โกโก้|โซดา/, 'tax', '', 'เครื่องดื่ม/ผลิตภัณฑ์นม'],
    [/ยาสีฟัน|แปรง|สบู่|แชมพู|ครีม|โลชั่น|ผงซัก|น้ำยา|ทิชชู|ผ้าอนามัย|ผ้าอ้อม/, 'tax', '', 'ของใช้'],
    // ต้องตรวจสอบ
    [/ดอง/, 'chk', 'veg', 'ของดอง: ถ้าปรุงรสและบรรจุผนึกมั่นคง (ขวด/ซองปิดสนิท) = เสีย VAT · ตักแบ่งขาย = ยกเว้น'],
    [/^ไข่เค็ม/, 'chk', 'egg', 'ไข่เค็มดิบ (พอกดิน/ดองเกลือ) ได้รับยกเว้น — ถ้าต้มสุกพร้อมทาน = เสีย VAT'],
    [/^ไข่เยี่ยวม้า/, 'chk', 'egg', 'ไข่แปรสภาพ — ให้นักบัญชียืนยัน'],
    [/^หมูนุ่ม|หมัก/, 'chk', 'meat', 'เนื้อหมักปรุงรส: บรรจุผนึกมั่นคง = เสีย VAT · ตักแบ่งขาย/ไม่ผนึก = ยกเว้น'],
    [/^(ปลา|กุ้ง|หมึก|ปลาหมึก|หอย).*(เค็ม|แห้ง|ตาก|นึ่ง|รมควัน|ร้า|ส้ม|หวาน|แดดเดียว|เจ่า)|^ปลาร้า|^กุ้งแห้ง|^หมึกแห้ง/, 'chk', 'meat', 'ปลาแปรรูปเบื้องต้น (ตาก/เค็ม/นึ่ง/หมัก) — มักยกเว้นถ้าไม่ปรุงรสและไม่บรรจุผนึก'],
    [/^พริก.*(ป่น|ผง|แห้ง|เม็ด)|^พริกไทย|^ข้าวคั่ว|^มะขามเปียก/, 'chk', 'veg', 'พืชผลตากแห้ง/บด/คั่ว — ยกเว้นถ้าไม่ปรุงรส ให้ตรวจสอบ'],
    [/^แป้งข้าว(?!โพด)/, 'chk', 'rice', 'แป้งข้าว: ตรวจว่านับเป็นผลิตภัณฑ์จากการสีข้าวหรือไม่'],
    [/^อาหาร(สุนัข|หมา|แมว)|^ขนม(สุนัข|หมา|แมว)|สัตว์เลี้ยง/, 'chk', 'feed', 'อาหารสัตว์เลี้ยง — ยกเว้นเฉพาะที่เป็นอาหารสัตว์ขึ้นทะเบียน (ขนม/อาหารเสริมต้องตรวจ)'],
    [/ยาฆ่าหญ้า|ยากำจัดวัชพืช|ยาฆ่าแมลง.*(พืช|นา|สวน|ไร่)|ฮอร์โมนพืช|เคมีเกษตร|ยาสัตว์|ยาถ่ายพยาธิ(สัตว์|ไก่|หมู|วัว)/, 'chk', 'farm', 'ยา/เคมีภัณฑ์สำหรับพืชหรือสัตว์ (ไม่ใช่ยากันยุงในบ้าน)'],
    [/^ของสด/, 'chk', 'meat', 'สินค้าระบุราคาเอง — ควรแยกรายการตามชนิด (ของสด / ของแปรรูป)'],
    // ยกเว้น VAT
    [/^(ข้าวสาร|ข้าวหอม|ข้าวเจ้า|ข้าวเหนียว|ข้าวกล้อง|ข้าวไรซ์|ข้าวขาว|ปลายข้าว)/, 'ex', 'rice', 'ข้าวสาร (ผลิตภัณฑ์จากการสีข้าว — ยกเว้นแม้บรรจุถุงปิด)'],
    [/^(ถั่ว(เขียว|ดำ|แดง|เหลือง|ลิสง|ขาว)|งา(ขาว|ดำ)|เมล็ดพันธุ์|ลูกเดือย)/, 'ex', 'rice', 'ธัญพืช/ถั่ว/งา เมล็ดแห้ง (ไม่ปรุงรส)'],
    [/^ไข่(ไก่|เป็ด|นกกระทา|สด|ห่าน)/, 'ex', 'egg', 'ไข่สด'],
    [/^(อาหาร(ปลา|ไก่|เป็ด|หมู|สุกร|วัว|โค|กุ้ง|นก|กบ|ห่าน)|หัวอาหาร|รำข้าว|รำละเอียด|ปลาป่น|กากถั่ว)/, 'ex', 'feed', 'อาหารสัตว์ (ควรมีเลขทะเบียนอาหารสัตว์)'],
    [/^(ปุ๋ย|มูล(ไก่|วัว|ค้างคาว)|ขี้(วัว|ไก่)|แกลบ|ดินปลูก)/, 'ex', 'farm', 'ปุ๋ย/วัสดุการเกษตร'],
    [/หนังสือพิมพ์|นิตยสาร|วารสาร|ตำรา|แบบเรียน|หนังสือเรียน/, 'ex', 'print', 'สิ่งพิมพ์'],
    [new RegExp('^(' + MEAT + ')'), 'ex', 'meat', 'เนื้อสัตว์/ปลา/อาหารทะเลสด (แช่เย็น/แช่แข็งได้ ถ้าไม่ปรุงรส)'],
    [new RegExp('^(' + VEG + ')'), 'ex', 'veg', 'ผัก ผลไม้ สมุนไพรสด']
  ];
  // ชนิดของหมวด: fresh = หมวดของสด/ยกเว้น · proc = หมวดของแปรรูปชัดเจน (ชื่อคล้ายของสดในหมวดนี้มักเป็นยี่ห้อ/รสชาติ)
  const catKind = c => /ยกเว้น ?VAT|ของสด|ผัก|ผลไม้|เนื้อ|อาหารสด|อาหารสัตว์|ข้าวสาร|ธัญพืช|ปุ๋ย|เกษตร/.test(c || '') ? 'fresh'
    : /ขนม|ของทานเล่น|เครื่องดื่ม|นม|สุขภาพ|ความงาม|ทำความสะอาด|ไอศ|แอลกอฮ|บุหรี่|ช่าง|ปะปา|ไฟฟ้า|อิเล็|ไอที|^ยา|ประทัด|แม่และเด็ก|บริการ|เชื้อเพลิง/.test(c || '') ? 'proc' : 'other';
  const memo = new Map();
  function cls(p) {
    const name = String(p.name || '').trim().replace(/^[\s\-*•]+/, ''), cat = p.category || '', k = name + '|' + cat;
    if (memo.has(k)) return memo.get(k);
    let r = { s: 'tax', g: '', why: 'สินค้าทั่วไป' };
    for (const [re, s, g, why] of R) if (re.test(name)) { r = { s, g, why }; break; }
    if (r.s !== 'tax' && catKind(cat) === 'proc' && r.g !== 'feed' && r.g !== 'farm' && r.g !== 'print') r = { s: 'tax', g: '', why: 'ชื่อคล้ายของสด แต่อยู่หมวด ' + cat + ' (มักเป็นยี่ห้อ/รสชาติ)' };
    if (memo.size > 20000) memo.clear(); memo.set(k, r); return r;
  }
  const conf = () => cfg('vatCfg', { exemptCats: [], rv: {} });
  const exSet = () => new Set(conf().exemptCats || []);
  // สถานะจริงของสินค้า (ถ้าเจ้าของยืนยันเองแล้ว ใช้ค่าที่ยืนยัน)
  function stat(p, rv) { const c = cls(p), o = (rv || conf().rv || {})[p.sku]; return o ? { ...c, s: o, mine: 1 } : c; }
  // วิเคราะห์ทั้งร้าน
  function analyze(products) {
    const C = conf(), ex = new Set(C.exemptCats || []), rv = C.rv || {}, cats = {};
    const known = (S.categories || []).map(c => c.name);
    known.forEach(n => cats[n] = { name: n, ex: 0, chk: 0, tax: 0, n: 0, items: [] });
    products.forEach(p => {
      const cn = p.category || '', c = cats[cn] || (cats[cn] = { name: cn, ex: 0, chk: 0, tax: 0, n: 0, items: [] });
      const st = stat(p, rv); c[st.s]++; c.n++; c.items.push([p, st]);
    });
    const moves = [], checks = [];
    Object.values(cats).forEach(c => {
      c.exempt = ex.has(c.name); c.kind = catKind(c.name);
      // หมวดที่สินค้าแทบทั้งหมดยกเว้น → แนะนำตั้งทั้งหมวดเป็นยกเว้น (ไม่ต้องย้ายสินค้า)
      // สินค้าส่วนใหญ่ (≥60%) ยกเว้น → ตั้งทั้งหมวดเป็นยกเว้น แล้วย้ายของเสีย VAT ที่เหลือออก (ย้ายน้อยกว่า หน้าขายเปลี่ยนน้อย)
      c.suggestEx = !c.exempt && !!c.name && c.ex > 0 && c.kind !== 'proc' && c.ex >= .6 * c.n;
      c.outTo = /อาหารสัตว์/.test(c.name) ? 'อาหารสัตว์เลี้ยง (เสีย VAT)' : (C.taxCat || 'ของสดแปรรูป (เสีย VAT)');
      c.out = c.items.filter(([, st]) => st.s === 'tax').map(([p]) => p);
      c.state = c.exempt ? (c.tax ? 'bad' : c.chk ? 'chk' : 'ok') : c.suggestEx ? 'sug' : (c.ex && c.tax) ? 'mix' : c.chk ? 'chk' : c.ex ? 'mix' : 'tax';
    });
    // หมวดปลายทาง: นับหมวดที่ระบบแนะนำให้ตั้งยกเว้นด้วย (ย้ายเข้าหมวดเดิมของร้าน ไม่ต้องสร้างใหม่)
    const exPlus = new Set([...ex, ...Object.values(cats).filter(c => c.suggestEx).map(c => c.name)]);
    Object.values(cats).forEach(c => {
      c.items.forEach(([p, st]) => {
        if (st.s === 'ex' && !c.exempt && !c.suggestEx) moves.push({ p, st, kind: 'toEx', from: c.name, to: target(st.g, exPlus) });
        else if (st.s === 'tax' && c.exempt) moves.push({ p, st, kind: 'toTax', from: c.name, to: c.outTo });
        else if (st.s === 'chk' && !st.mine) checks.push({ p, st, from: c.name, exempt: c.exempt });
      });
    });
    const list = Object.values(cats).filter(c => c.n || c.exempt).sort((a, b) => (b.exempt - a.exempt) || (b.ex - a.ex) || (b.n - a.n));
    return { cats: list, moves, checks, ex, rv };
  }
  // หมวดปลายทางสำหรับกลุ่ม: ใช้หมวดยกเว้นที่มีอยู่แล้วของกลุ่มเดียวกันก่อน
  function target(g, ex) {
    const want = (G[g] || G.veg).cat;
    const have = [...(ex || exSet())].find(n => n === want) || [...(ex || exSet())].find(n => (g === 'feed' ? /อาหารสัตว์/ : g === 'rice' ? /ข้าว|ธัญพืช/ : g === 'farm' ? /ปุ๋ย|เกษตร/ : g === 'print' ? /หนังสือ|ตำรา/ : /ของสด|ผัก|เนื้อ/).test(n));
    return have || want;
  }
  // สินค้านี้ควรติดป้ายอะไร (ใช้ในรายการสินค้า/การ์ดสินค้า)
  function tag(p) {
    const C = conf(), ex = (C.exemptCats || []).includes(p.category || ''), st = stat(p, C.rv);
    if (ex && st.s === 'tax') return { c: 'red', t: 'ผิดหมวด VAT', why: st.why + ' — อยู่ในหมวดยกเว้น' };
    if (ex) return { c: 'green', t: 'ยกเว้น VAT', why: st.why };
    if (st.s === 'ex') return { c: 'amber', t: 'ควรยกเว้น VAT', why: st.why + ' — แต่หมวดนี้เสีย VAT' };
    if (st.s === 'chk') return { c: 'amber', t: 'ตรวจ VAT', why: st.why };
    return null;
  }
  return { G, R, cls, stat, analyze, target, tag, catKind, conf };
})();
window.VATX = VATX;
function vatTag(p) { if (!p) return ''; const t = VATX.tag(p); return t && (t.c === 'green' || can('editProducts')) ? ` <span class="tag ${t.c}" title="${esc(t.why)}">${t.c === 'green' ? '✓' : '⚠'} ${t.t}</span>` : ''; }

(function () {
  const st = document.createElement('style'); st.textContent = `
.vx-leg{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:var(--ink2);margin:2px 2px 10px}.vx-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.vx-cat{display:flex;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line)}.vx-cat:last-child{border-bottom:0}
.vx-cat .bar{display:flex;height:6px;border-radius:6px;overflow:hidden;background:#EFE9E8;margin-top:6px;gap:2px}.vx-cat .bar i{display:block;height:100%}
.vx-st{flex:none;width:6px;align-self:stretch;border-radius:6px}
.vx-ok{background:var(--green)}.vx-sug{background:repeating-linear-gradient(135deg,var(--green) 0 4px,#7CC79A 4px 8px)}.vx-chk,.vx-mix{background:#E3A008}.vx-bad{background:var(--red)}.vx-tax{background:#CFC7C9}
.vx-mv{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-bottom:1px solid var(--line)}.vx-mv:last-child{border-bottom:0}
.vx-mv input[type=checkbox]{width:20px;height:20px;margin-top:2px;flex:none;accent-color:var(--green)}
.vx-mv .to{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;font-size:12px}
.vx-mv select{font:inherit;font-size:12px;border:1.5px solid var(--line);border-radius:8px;padding:3px 6px;background:#fff;max-width:100%}
.vx-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}.vx-sum .stat .v{font-size:22px}
.vx-sum .stat.g{box-shadow:inset 4px 0 0 var(--green),var(--sh)}.vx-sum .stat.a{box-shadow:inset 4px 0 0 #E3A008,var(--sh)}.vx-sum .stat.r{box-shadow:inset 4px 0 0 var(--red),var(--sh)}
.vx-law{padding:10px 14px;border-bottom:1px solid var(--line)}.vx-law:last-child{border-bottom:0}
.chip .vxd{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:5px;vertical-align:1px}
@media(min-width:900px){.vx-wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:14px;align-items:start}}`;
  document.head.appendChild(st);
})();

/* ---------- หน้าตรวจ VAT ---------- */
VIEWS.vatcheck = async el => {
  if (ownerOnly(el)) return;
  el.innerHTML = vhead('ตรวจสินค้ายกเว้น VAT', '', 'tax') + `<div class="empty"><span class="spin dark"></span></div>`;
  if (!S.settings || !Object.keys(S.settings).length) await loadSettings().catch(() => { }); else loadSettings().catch(() => { });   // ใช้ค่าในเครื่องก่อน
  if (!S.products.length) await loadProducts(true).catch(e => toast(e.message, 1));
  const tab = S.vxTab || (S.vxTab = 'cats');
  const A = VATX.analyze(S.products);
  const nOk = S.products.filter(p => A.ex.has(p.category || '') && VATX.stat(p, A.rv).s !== 'tax').length;
  const bad = A.moves.length + A.cats.filter(c => c.suggestEx).length;
  el.innerHTML = vhead('ตรวจสินค้ายกเว้น VAT', '', 'tax') + `
   <div class="vx-sum">
     <div class="stat g"><div class="k">ยกเว้น VAT แล้ว</div><div class="v">${nOk.toLocaleString()}</div><div class="tiny muted">รายการ ถูกหมวด</div></div>
     <div class="stat r"><div class="k">ควรแก้หมวด</div><div class="v" style="color:${bad ? 'var(--red)' : 'inherit'}">${bad.toLocaleString()}</div><div class="tiny muted">${A.moves.length} สินค้า · ${A.cats.filter(c => c.suggestEx).length} หมวด</div></div>
     <div class="stat a"><div class="k">รอตรวจสอบ</div><div class="v" style="color:${A.checks.length ? 'var(--amber)' : 'inherit'}">${A.checks.length.toLocaleString()}</div><div class="tiny muted">ต้องยืนยันเอง</div></div>
   </div>
   <div id="imp"></div>
   <div class="seg" id="tb" style="margin-bottom:10px"><button data-t="cats">หมวดหมู่</button><button data-t="mv">แนะนำย้าย (${A.moves.length})</button><button data-t="chk">รอตรวจ (${A.checks.length})</button><button data-t="law">ตามกฎหมาย</button></div>
   <div id="pane"></div>
   <div class="tiny muted" style="margin:12px 4px">ระบบจำแนกจากชื่อสินค้าตามหลักเกณฑ์ ม.81(1) และคำสั่งกรมสรรพากร ป.28/2535, ป.29/2535 — เป็น<b>คำแนะนำเบื้องต้น</b> สินค้าที่ไม่แน่ใจให้ยืนยันกับนักบัญชีหรือสรรพากรพื้นที่ · ยอดยกเว้นนับตามหมวดปัจจุบันของสินค้า (ย้อนหลังทั้งปีด้วย)</div>`;
  $$('#tb button', el).forEach(b => { b.classList.toggle('on', b.dataset.t === tab); b.onclick = () => { S.vxTab = b.dataset.t; go('vatcheck'); }; });
  const pane = $('#pane', el);
  const legend = `<div class="vx-leg"><span><i class="vx-ok"></i>ยกเว้น VAT ถูกต้อง</span><span><i class="vx-sug"></i>ควรตั้งเป็นหมวดยกเว้น</span><span><i class="vx-mix"></i>ปนกัน/รอตรวจ</span><span><i class="vx-bad"></i>มีสินค้าเสีย VAT อยู่ในหมวดยกเว้น</span><span><i class="vx-tax"></i>เสีย VAT ปกติ</span></div>`;
  if (tab === 'cats') {
    const label = { ok: ['green', '✓ ยกเว้น VAT'], sug: ['green', 'ควรตั้งเป็นยกเว้น'], chk: ['amber', 'รอตรวจ'], mix: ['amber', 'หมวดปนกัน'], bad: ['red', 'มีสินค้าเสีย VAT ปน'], tax: ['gray', 'เสีย VAT'] };
    const row = (c, i) => {
      const L = label[c.state], w = k => c.n ? (c[k] / c.n * 100).toFixed(1) : 0;
      const note = c.state === 'sug' ? `ยกเว้น ${c.ex} จาก ${c.n} รายการ${c.chk ? ` · รอตรวจ ${c.chk}` : ''}${c.tax ? ` · ของแปรรูป ${c.tax} รายการจะย้ายไป “${esc(c.outTo)}”` : ' — ตั้งทั้งหมวดได้เลย'}`
        : c.state === 'bad' ? `มีสินค้าเสีย VAT ${c.tax} รายการปนอยู่ → ยอดยกเว้นจะสูงเกินจริง ให้ย้ายออก`
          : c.state === 'mix' ? `ยกเว้น ${c.ex} · เสีย VAT ${c.tax}${c.chk ? ' · รอตรวจ ' + c.chk : ''} → แยกสินค้ายกเว้นไปหมวดใหม่`
            : c.state === 'chk' ? `รอตรวจ ${c.chk} รายการ` : c.exempt ? `ทุกรายการเข้าเกณฑ์ (${c.n})` : `${c.n} รายการ`;
      return `<div class="vx-cat"><span class="vx-st vx-${c.state}"></span><div class="grow" style="min-width:0"><div class="row" style="gap:6px;flex-wrap:wrap"><b style="min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(c.name || 'ไม่ระบุหมวด')}</b><span class="tag ${L[0]}">${L[1]}</span></div>
        <div class="tiny muted" style="margin-top:2px">${note}</div>
        ${c.n ? `<div class="bar"><i style="width:${w('ex')}%;background:var(--green)"></i><i style="width:${w('chk')}%;background:#E3A008"></i><i style="width:${w('tax')}%;background:#CFC7C9"></i></div>` : ''}</div>
        ${c.name && (c.exempt || c.suggestEx) ? `<button class="btn sm ${c.exempt ? 'ghost' : 'green'}" data-ci="${i}" style="flex:none;max-width:42%">${c.exempt ? 'ยกเลิกยกเว้น' : c.tax ? 'ตั้งยกเว้น + แยกของแปรรูป' : 'ตั้งเป็นยกเว้น'}</button>` : ''}</div>`;
    };
    // หมวดที่เสีย VAT ล้วน ไม่มีอะไรต้องทำ → ย่อรวมไว้ด้านล่าง
    const main = A.cats.map((c, i) => [c, i]).filter(([c]) => c.state !== 'tax'), rest = A.cats.map((c, i) => [c, i]).filter(([c]) => c.state === 'tax');
    pane.innerHTML = legend + `<div class="list">${main.map(([c, i]) => row(c, i)).join('') || '<div class="empty">ยังไม่มีหมวดที่เกี่ยวกับสินค้ายกเว้น VAT</div>'}</div>
      ${rest.length ? `<details class="list" style="margin-top:10px"><summary class="vx-cat" style="cursor:pointer;list-style:none"><span class="vx-st vx-tax"></span><div class="grow"><b>หมวดที่เสีย VAT ปกติ</b> <span class="tag gray">${rest.length} หมวด</span><div class="tiny muted">${rest.reduce((a, [c]) => a + c.n, 0).toLocaleString()} รายการ · ไม่พบสินค้ายกเว้น — แตะเพื่อดู</div></div></summary>${rest.map(([c, i]) => row(c, i)).join('')}</details>` : ''}`;
    $$('[data-ci]', pane).forEach(b => b.onclick = async () => {
      const c = A.cats[+b.dataset.ci], on = !c.exempt;
      let moves = [];
      if (on && c.tax) {
        const keep = c.out.slice(0, 12).map(p => '• ' + p.name).join('\n') + (c.out.length > 12 ? `\n…อีก ${c.out.length - 12} รายการ` : '');
        if (!(await confirmDlg(`ตั้งหมวด "${c.name}" เป็นยกเว้น VAT และย้ายสินค้าแปรรูป/เสีย VAT ${c.tax} รายการออกไปหมวด "${c.outTo}":\n${keep}`, 'ตั้งยกเว้น + ย้ายออก'))) return;
        moves = c.out.map(p => ({ sku: p.sku, to: c.outTo }));
      }
      await vxSave({ exAdd: on ? [c.name] : [], exDel: on ? [] : [c.name], moves });
      toast(on ? `ตั้ง "${c.name}" เป็นหมวดยกเว้น VAT แล้ว` : `ยกเลิกยกเว้น "${c.name}" แล้ว`); go('vatcheck');
    });
  } else if (tab === 'mv') {
    if (!A.moves.length) pane.innerHTML = `<div class="card empty">${I(IC.check || IC.shield, 36)}<p>สินค้าทุกรายการอยู่ถูกหมวดแล้ว</p></div>`;
    else {
      const cats = [...new Set((S.categories || []).map(c => c.name).concat(A.moves.map(m => m.to)))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'th'));
      const grp = {}; A.moves.forEach((m, i) => (grp[m.kind + '|' + m.from] = grp[m.kind + '|' + m.from] || []).push(i));
      pane.innerHTML = `<div class="alert blue small" style="margin-bottom:10px">${I(IC.alert, 18)}<div>สีเขียว = ย้ายเข้าหมวดยกเว้น VAT (ยอดจะไม่ถูกนับเกิน) · สีแดง = สินค้าเสีย VAT ที่อยู่ในหมวดยกเว้น ต้องย้ายออก (ไม่งั้นยอดยกเว้นจะสูงเกินจริง) · เปลี่ยนหมวดปลายทางได้ที่ช่องเลือก</div></div>
        ${Object.entries(grp).map(([k, ix]) => { const [kind, from] = k.split('|'); return `<div class="card" style="padding:0;overflow:hidden;margin-bottom:10px"><div class="row" style="padding:10px 12px;background:${kind === 'toEx' ? 'var(--green-l)' : 'var(--red-l)'}"><label class="row grow" style="gap:8px;min-width:0"><input type="checkbox" data-all="${esc(k)}" checked style="width:20px;height:20px;accent-color:var(--green)"><b style="min-width:0">${kind === 'toEx' ? 'ควรยกเว้น' : 'เสีย VAT'} · จากหมวด ${esc(from || 'ไม่ระบุ')}</b></label><span class="small muted">${ix.length}</span></div>
          ${ix.map(i => { const m = A.moves[i]; return `<div class="vx-mv"><input type="checkbox" data-m="${i}" data-g="${esc(k)}" checked><div class="grow" style="min-width:0"><div style="font-weight:600">${esc(m.p.name)}</div><div class="tiny muted">${esc(m.st.why)}${m.st.g ? ` · ${VATX.G[m.st.g].law}` : ''}</div>
            <div class="to"><span class="muted">ย้ายไป →</span><select data-to="${i}">${cats.map(c => `<option${c === m.to ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select><span class="tag ${kind === 'toEx' ? 'green' : 'gray'}">${kind === 'toEx' ? 'ยกเว้น VAT' : 'เสีย VAT'}</span></div></div>
            <button class="iconbtn" data-no="${i}" title="ไม่ใช่ — คงหมวดเดิม">${I(IC.x, 16)}</button></div>`; }).join('')}</div>`; }).join('')}
        <div style="position:sticky;bottom:8px;z-index:2"><button class="btn block green" id="ap" style="box-shadow:var(--sh)">ย้ายหมวดที่เลือก</button></div>`;
      if (window.rsSticky) rsSticky($('#ap', pane).parentElement);
      const cnt = () => { const n = $$('[data-m]:checked', pane).length; $('#ap', pane).textContent = n ? `ย้ายหมวดที่เลือก (${n} รายการ)` : 'เลือกรายการที่จะย้าย'; $('#ap', pane).disabled = !n; };
      $$('[data-all]', pane).forEach(c => c.onchange = () => { $$(`[data-g="${CSS.escape(c.dataset.all)}"]`, pane).forEach(x => x.checked = c.checked); cnt(); });
      $$('[data-m]', pane).forEach(c => c.onchange = cnt); cnt();
      $$('[data-no]', pane).forEach(b => b.onclick = async () => { const m = A.moves[+b.dataset.no]; await vxSave({ rv: { [m.p.sku]: m.kind === 'toEx' ? 'tax' : 'ex' }, quiet: 1 }); toast('จำไว้แล้ว: คง "' + m.p.name + '" ไว้หมวดเดิม'); go('vatcheck'); });
      $('#ap', pane).onclick = async () => {
        const sel = $$('[data-m]:checked', pane).map(c => { const i = +c.dataset.m, m = A.moves[i]; return { sku: m.p.sku, to: $(`[data-to="${i}"]`, pane).value, kind: m.kind }; });
        if (!sel.length) return;
        const exAdd = [...new Set(sel.filter(s => s.kind === 'toEx').map(s => s.to))];
        // ปลายทางเป็นหมวดที่แนะนำให้ตั้งยกเว้นและยังมีของแปรรูปปน → แยกของแปรรูปออกพร้อมกัน (กันยอดยกเว้นเกินจริง)
        const sug = A.cats.filter(c => c.suggestEx && exAdd.includes(c.name) && c.out.length);
        if (sug.length && !(await confirmDlg(`หมวด ${sug.map(c => '"' + c.name + '"').join(', ')} จะถูกตั้งเป็นยกเว้น VAT — ระบบจะย้ายของแปรรูป/เสีย VAT ${sug.reduce((a, c) => a + c.out.length, 0)} รายการในหมวดนั้นออกไปด้วย`, 'ตกลง'))) return;
        const extra = sug.flatMap(c => c.out.map(p => ({ sku: p.sku, to: c.outTo, kind: 'toTax' })));
        await vxSave({ moves: sel.concat(extra), exAdd });
        toast(`ย้ายหมวดแล้ว ${sel.length + extra.length} รายการ`); go('vatcheck');
      };
    }
  } else if (tab === 'chk') {
    pane.innerHTML = !A.checks.length ? `<div class="card empty"><p>ไม่มีรายการรอตรวจ</p></div>` : `<div class="alert amber small" style="margin-bottom:10px">${I(IC.alert, 18)}<div>สินค้าเหล่านี้ขึ้นกับวิธีขาย (ตักแบ่ง/บรรจุผนึก/ปรุงรส) — เลือก <b>ยกเว้น</b> หรือ <b>เสีย VAT</b> ตามที่ขายจริง ระบบจะจำไว้</div></div>
      <div class="list">${A.checks.map((c, i) => `<div class="vx-mv"><span class="vx-st vx-chk" style="width:5px"></span><div class="grow" style="min-width:0"><div style="font-weight:600">${esc(c.p.name)}</div><div class="tiny muted">${esc(c.from || 'ไม่ระบุหมวด')} · ${esc(c.st.why)}</div>
        <div class="row" style="gap:6px;margin-top:6px"><button class="btn sm green" data-ex="${i}">ยกเว้น</button><button class="btn sm ghost" data-tx="${i}">เสีย VAT</button></div></div></div>`).join('')}</div>`;
    $$('[data-ex]', pane).forEach(b => b.onclick = async () => { const c = A.checks[+b.dataset.ex], to = c.exempt ? c.from : VATX.target(c.st.g, A.ex); await vxSave({ rv: { [c.p.sku]: 'ex' }, moves: c.exempt ? [] : [{ sku: c.p.sku, to }], exAdd: c.exempt ? [] : [to] }); toast(c.exempt ? 'ยืนยันยกเว้นแล้ว' : `ย้ายไป "${to}" แล้ว`); go('vatcheck'); });
    $$('[data-tx]', pane).forEach(b => b.onclick = async () => { const c = A.checks[+b.dataset.tx]; const C = VATX.conf(); const to = C.taxCat || 'ของสดแปรรูป (เสีย VAT)'; await vxSave({ rv: { [c.p.sku]: 'tax' }, moves: c.exempt ? [{ sku: c.p.sku, to }] : [] }); toast(c.exempt ? `ย้ายไป "${to}" แล้ว` : 'บันทึกว่าเสีย VAT แล้ว'); go('vatcheck'); });
  } else {
    pane.innerHTML = `<div class="list">${Object.values(VATX.G).map(g => `<div class="vx-law"><div class="row" style="gap:8px"><span class="vx-st vx-ok" style="width:5px;align-self:stretch"></span><div class="grow"><b>${g.n}</b> <span class="tag green">${g.law}</span>
      <div class="small" style="margin-top:4px"><span style="color:var(--green)">✓ ยกเว้น:</span> ${g.ex}</div><div class="small"><span style="color:var(--red-d)">✗ ไม่ยกเว้น:</span> ${g.no}</div></div></div></div>`).join('')}</div>
      <div class="card small" style="margin-top:10px"><b>หลักที่ใช้ตัดสิน</b><ul style="margin:6px 0 0;padding-left:20px">
        <li>สด แช่เย็น แช่แข็ง ตากแห้ง โดย<b>ไม่ปรุงรส/ไม่ใส่สารกันเสีย</b> = ยกเว้น</li>
        <li>ปรุงรสหรือใส่สารกันเสีย <b>และ</b> บรรจุกระป๋อง/ภาชนะผนึกมั่นคง = เสีย VAT</li>
        <li>แปรสภาพเป็นอาหารอื่น (ลูกชิ้น ไส้กรอก ขนม) = เสีย VAT ไม่ว่าบรรจุแบบไหน</li>
        <li>ข้าวสาร/ผลิตภัณฑ์จากการสีข้าว = ยกเว้นแม้บรรจุถุงปิด</li>
        <li>เงินรับแทน (โอนเงิน เติมเงิน จ่ายบิล) ไม่ใช่รายรับของร้าน — ระบบแยกให้อยู่แล้ว</li></ul></div>`;
  }
  // ยอดขายปีนี้ของสินค้าที่ควรยกเว้นแต่ยังอยู่หมวดเสีย VAT (ถูกนับเกิน) — คำนวณเบื้องหลัง
  vxImpact(A).then(h => { const b = $('#imp', el); if (b && h) b.innerHTML = h; }).catch(() => { });
};
async function vxImpact(A) {
  const t = todayISO(), from = t.slice(0, 4) + '-01-01';
  const pend = new Set(A.moves.filter(m => m.kind === 'toEx').map(m => m.p.sku).concat(A.cats.filter(c => c.suggestEx).flatMap(c => c.items.filter(([, st]) => st.s === 'ex').map(([p]) => p.sku))));
  const over = new Set(A.moves.filter(m => m.kind === 'toTax').map(m => m.p.sku));
  if (!pend.size && !over.size) return `<div class="alert green small" style="margin-bottom:10px">${I(IC.check || IC.shield, 18)}<div>หมวดสินค้ายกเว้น VAT ถูกต้องแล้ว — ยอดที่นับเข้าเกณฑ์ 1.8 ล้านตรงตามจริง</div></div>`;
  let rows = null;
  try { rows = S.apiUrl && !(window.OStore && OStore.allowed()) ? null : await quick(fetchOrders(from, t), 5000, null); } catch (e) { }
  let a = 0, b = 0;
  (rows || []).forEach(o => { const sg = o.status === 'refund' ? -1 : 1; (o._items || []).forEach(it => { if (it.pass) return; const v = sg * Math.abs(num(it.qty) * num(it.price)); if (pend.has(it.sku)) a += v; if (over.has(it.sku)) b += v; }); });
  const parts = [];
  if (pend.size) parts.push(`<div class="alert amber small" style="margin-bottom:8px">${I(IC.alert, 18)}<div><b>สินค้า ${pend.size} รายการ</b> เข้าเกณฑ์ยกเว้นแต่ยังอยู่หมวดเสีย VAT${rows ? ` — ยอดขายปีนี้ <b>${baht(a)}</b> ถูกนับรวมเกินจริง` : ''} · แก้หมวดแล้วยอดย้อนหลังทั้งปีจะถูกต้องทันที</div></div>`);
  if (over.size) parts.push(`<div class="alert red small" style="margin-bottom:8px">${I(IC.alert, 18)}<div><b>สินค้าเสีย VAT ${over.size} รายการ</b> อยู่ในหมวดยกเว้น${rows ? ` — ยอด <b>${baht(b)}</b> ถูกหักออกเกินจริง` : ''} ควรย้ายออก</div></div>`);
  return parts.join('');
}
// บันทึก: ย้ายหมวดสินค้า + สร้างหมวดใหม่ + ปรับรายการหมวดยกเว้น/สิ่งที่ยืนยันเอง
async function vxSave(o) {
  try {
    busy(1, 'กำลังบันทึก...');
    const C = VATX.conf(), ex = new Set(C.exemptCats || []), rv = { ...(C.rv || {}), ...(o.rv || {}) };
    (o.exAdd || []).forEach(c => ex.add(c)); (o.exDel || []).forEach(c => ex.delete(c));
    const moves = o.moves || [];
    const have = new Set((S.categories || []).map(c => c.name)), add = [...new Set(moves.map(m => m.to))].filter(c => c && !have.has(c));
    if (add.length) await api('upsert', { table: 'Categories', rows: add.map((n, k) => ({ name: n, color: /ยกเว้น/.test(n) ? '#43A047' : '#FB8C00', sort: String((S.categories || []).length + k + 1) })) });
    for (let i = 0; i < moves.length; i += 300) await saveProducts(moves.slice(i, i + 300).map(m => ({ sku: m.sku, category: m.to })));
    // สินค้าที่ย้ายแล้วไม่ต้องจำค่าที่ยืนยัน (หมวดบอกเองแล้ว) ยกเว้นรายการที่ผู้ใช้กดยืนยันเอง
    moves.forEach(m => { if (!(o.rv || {})[m.sku]) delete rv[m.sku]; });
    await saveSetting('vatCfg', { ...C, exemptCats: [...ex], rv });
    if (add.length || moves.length) { await loadSettings().catch(() => { }); }
    if (window.Cache) Cache.staleBefore = Date.now(); if (window.OStore) OStore.dm = null;
    busy(0);
  } catch (e) { busy(0); toast(e.message, 1); throw e; }
}

/* ---------- ไฟล์ Excel (.xlsx) ที่สร้างในเครื่องเอง — ไม่ต้องโหลดไลบรารี ใช้ได้แม้ออฟไลน์ ----------
   ฟอนต์ TH SarabunPSK (ฟอนต์ราชการ) · หัวตารางตัวหนาพื้นเทา · เส้นตาราง · ตัวเลขมีจุลภาค · ตั้งหน้า A4
   แถว = อาร์เรย์ของเซลล์: ตัวเลข / ข้อความ / { v, s } โดย s = h หัวตาราง · t ข้อความในตาราง · n ตัวเลข · i จำนวนเต็ม
   · T ชื่อรายงาน · b ตัวหนา · tl/tn แถวรวม · c ข้อความกลาง */
const XL = (() => {
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {   // เก็บแบบไม่บีบอัด (stored) — Excel/LibreOffice/Google Sheets เปิดได้
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    files.forEach(([name, text]) => {
      const nb = enc.encode(name), db = typeof text === 'string' ? enc.encode(text) : text, crc = crc32(db);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, db.length, true); h.setUint32(22, db.length, true); h.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(h.buffer), nb, db);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, db.length, true); c.setUint32(24, db.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
      cen.push(new Uint8Array(c.buffer), nb); off += 30 + nb.length + db.length;
    });
    const cl = cen.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cl, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(cen, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const col = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const SID = { '': 0, h: 1, n: 2, t: 3, T: 4, tn: 5, tl: 6, b: 7, i: 8, c: 9, sub: 10, d: 11 };
  function styles(font, size) {
    const f = (b, sz) => `<font>${b ? '<b/>' : ''}<sz val="${sz}"/><name val="${x(font)}"/><family val="2"/><charset val="222"/></font>`;
    const xf = (fo, fi, bo, nf, al) => `<xf numFmtId="${nf}" fontId="${fo}" fillId="${fi}" borderId="${bo}" xfId="0"${nf ? ' applyNumberFormat="1"' : ''}${fo ? ' applyFont="1"' : ''}${fi ? ' applyFill="1"' : ''}${bo ? ' applyBorder="1"' : ''}${al ? ` applyAlignment="1"><alignment ${al}/></xf>` : '/>'}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="4">${f(0, size)}${f(1, size)}${f(1, size + 4)}${f(0, size - 2)}</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF7F7F7F"/></left><right style="thin"><color rgb="FF7F7F7F"/></right><top style="thin"><color rgb="FF7F7F7F"/></top><bottom style="thin"><color rgb="FF7F7F7F"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">${xf(0, 0, 0, 0)}${xf(1, 2, 1, 0, 'horizontal="center" vertical="center" wrapText="1"')}${xf(0, 0, 1, 164, 'vertical="top"')}${xf(0, 0, 1, 0, 'vertical="top" wrapText="1"')}${xf(2, 0, 0, 0, 'horizontal="center"')}${xf(1, 2, 1, 164)}${xf(1, 2, 1, 0, 'horizontal="center"')}${xf(1, 0, 0, 0)}${xf(0, 0, 1, 3, 'vertical="top"')}${xf(0, 0, 0, 0, 'horizontal="center"')}${xf(3, 0, 0, 0, 'horizontal="center"')}${xf(0, 0, 1, 0, 'horizontal="center" vertical="top"')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
  function sheetXml(sh) {
    const rows = sh.rows.map((r, ri) => `<row r="${ri + 1}">${(r || []).map((c, ci) => {
      if (c == null || c === '') return '';
      const o = typeof c === 'object' ? c : { v: c }, ref = col(ci) + (ri + 1), v = o.v;
      const s = SID[o.s != null ? o.s : (typeof v === 'number' ? 'n' : '')] || 0;
      if (v == null || v === '') return `<c r="${ref}" s="${s}"/>`;
      return typeof v === 'number' && isFinite(v) ? `<c r="${ref}" s="${s}"><v>${Math.round(v * 100) / 100}</v></c>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const cols = (sh.cols || []).length ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const mg = (sh.merges || []).length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    const fr = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${fr}<sheetFormatPr defaultRowHeight="21.75"/>${cols}<sheetData>${rows}</sheetData>${mg}<pageMargins left="0.5" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${sh.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
  function book(sheets, o = {}) {
    const font = o.font || cfg('xlFont', 'TH SarabunPSK'), size = o.size || 16;
    const names = new Set(), nm = s => { let n = String(s || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Sheet', k = 2; while (names.has(n)) n = n.slice(0, 28) + ' ' + k++; names.add(n); return n; };
    const shs = sheets.map(s => ({ ...s, name: nm(s.name) }));
    const files = [
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${shs.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
      ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(o.title || '')}</dc:title><dc:creator>May MiniMart</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${shs.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${shs.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${shs.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', styles(font, size)]
    ].concat(shs.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]));
    return zip(files);
  }
  // ช่วยสร้างตาราง: หัว + แถว + แถวรวม (ระบุชนิดคอลัมน์: t ข้อความ · n เงิน · i จำนวน · d วันที่/กลาง)
  function table(head, rows, kinds, total) {
    const out = [head.map(h => ({ v: h, s: 'h' }))];
    rows.forEach(r => out.push(r.map((v, i) => ({ v: v == null ? '' : v, s: kinds[i] || (typeof v === 'number' ? 'n' : 't') }))));
    if (total) out.push(total.map((v, i) => ({ v: v == null ? '' : v, s: typeof v === 'number' ? 'tn' : 'tl' })));
    return out;
  }
  const save = (name, sheets, o) => download(name, book(sheets, o));
  return { book, table, save, col };
})();
window.XL = XL;
const thLong = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d} ${TH_MF[m - 1]} ${y + 543}`; };

/* ---------- สแกนเอกสารจากกล้อง: หาขอบกระดาษอัตโนมัติ → ดัดให้ตรง → ปรับให้เหมือนสแกน ----------
   ทำในเครื่องทั้งหมด (ไม่ต้องต่อเน็ต) · ลากมุมแก้เองได้ · ผลเป็น JPEG พร้อมอัปโหลด/อ่าน OCR */
const DocScan = (() => {
  const loadBmp = f => new Promise((res, rej) => { const u = URL.createObjectURL(f), i = new Image(); i.onload = () => { res(i); setTimeout(() => URL.revokeObjectURL(u), 2000); }; i.onerror = () => rej(new Error('เปิดรูปไม่ได้')); i.src = u; });
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  // ภาพต้นฉบับย่อให้ไม่เกิน max (กันหน่วยความจำเต็มบนแท็บเล็ต) + หมุนได้
  function base(img, max, rot) {
    const r = ((rot || 0) % 4 + 4) % 4, s = Math.min(1, max / Math.max(img.width, img.height)), w = img.width * s, h = img.height * s;
    const c = r % 2 ? cv(h, w) : cv(w, h), x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); x.rotate(r * Math.PI / 2); x.drawImage(img, -w / 2, -h / 2, w, h); return c;
  }
  // หาขอบกระดาษ: กระดาษมักสว่างกว่าพื้น → Otsu → ก้อนสว่างที่ใหญ่สุด → มุมจากจุดสุดขั้วตามแนวทแยง
  function detect(src) {
    const W = 320, s = W / Math.max(src.width, src.height), w = Math.round(src.width * s), h = Math.round(src.height * s);
    const c = cv(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.filter = 'blur(1.5px)'; x.drawImage(src, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h), hist = new Uint32Array(256);
    for (let i = 0; i < w * h; i++) { const v = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8; g[i] = v; hist[v]++; }
    let sum = 0, sb = 0, wb = 0, best = 0, th = 128; for (let i = 0; i < 256; i++) sum += i * hist[i];
    for (let t = 0; t < 256; t++) { wb += hist[t]; if (!wb) continue; const wf = w * h - wb; if (!wf) break; sb += t * hist[t]; const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf); if (v > best) { best = v; th = t; } }
    const lab = new Int32Array(w * h).fill(-1), q = new Int32Array(w * h); let bestC = null;
    for (let i = 0; i < w * h; i++) {
      if (g[i] <= th || lab[i] >= 0) continue;
      let qh = 0, qt = 0, n = 0, a = [1e9, -1e9, -1e9, 1e9], P = [0, 0, 0, 0], edge = 0; q[qt++] = i; lab[i] = i;
      while (qh < qt) {
        const k = q[qh++], px = k % w, py = (k / w) | 0; n++;
        if (px === 0 || py === 0 || px === w - 1 || py === h - 1) edge++;
        const s1 = px + py, s2 = px - py;
        if (s1 < a[0]) { a[0] = s1; P[0] = k; } if (s2 > a[1]) { a[1] = s2; P[1] = k; } if (s1 > a[2]) { a[2] = s1; P[2] = k; } if (s2 < a[3]) { a[3] = s2; P[3] = k; }
        if (px > 0 && lab[k - 1] < 0 && g[k - 1] > th) { lab[k - 1] = i; q[qt++] = k - 1; }
        if (px < w - 1 && lab[k + 1] < 0 && g[k + 1] > th) { lab[k + 1] = i; q[qt++] = k + 1; }
        if (py > 0 && lab[k - w] < 0 && g[k - w] > th) { lab[k - w] = i; q[qt++] = k - w; }
        if (py < h - 1 && lab[k + w] < 0 && g[k + w] > th) { lab[k + w] = i; q[qt++] = k + w; }
      }
      if (!bestC || n > bestC.n) bestC = { n, P, edge };
    }
    if (!bestC) return null;
    const frac = bestC.n / (w * h), perim = 2 * (w + h);
    if (frac < .12 || frac > .97 || bestC.edge > perim * .45) return null;   // เล็กไป/เต็มภาพ/ชนขอบเกือบรอบ = ไม่แน่ใจ
    const Q = bestC.P.map(k => [(k % w) / s, ((k / w) | 0) / s]);
    const area = Math.abs(Q.reduce((a, p, i) => { const n2 = Q[(i + 1) % 4]; return a + p[0] * n2[1] - n2[0] * p[1]; }, 0)) / 2;
    if (area < src.width * src.height * .1 || area < bestC.n / (s * s) * .6) return null;
    return Q;
  }
  const full = (c, m) => { const ix = c.width * (m || 0), iy = c.height * (m || 0); return [[ix, iy], [c.width - ix, iy], [c.width - ix, c.height - iy], [ix, c.height - iy]]; };
  // โฮโมกราฟี: จุดบนภาพผลลัพธ์ (สี่เหลี่ยม) → จุดบนภาพต้นฉบับ
  function homography(dst, src) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) { const [x, y] = dst[i], [u, v] = src[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    return b.map((v, i) => v / A[i][i]).concat(1);
  }
  function warp(src, Q, max) {
    const dd = (a, b2) => Math.hypot(a[0] - b2[0], a[1] - b2[1]);
    let W = Math.max(dd(Q[0], Q[1]), dd(Q[3], Q[2])), H = Math.max(dd(Q[0], Q[3]), dd(Q[1], Q[2]));
    const s = Math.min(1, max / Math.max(W, H)); W = Math.round(W * s); H = Math.round(H * s);
    const Hm = homography([[0, 0], [W, 0], [W, H], [0, H]], Q);
    const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height), S0 = sd.data, sw = src.width, sh = src.height;
    const out = cv(W, H), o = out.getContext('2d'), od = o.createImageData(W, H), D = od.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const z = Hm[6] * x + Hm[7] * y + 1, u = (Hm[0] * x + Hm[1] * y + Hm[2]) / z, v = (Hm[3] * x + Hm[4] * y + Hm[5]) / z;
      const x0 = Math.max(0, Math.min(sw - 2, u | 0)), y0 = Math.max(0, Math.min(sh - 2, v | 0)), fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
      const i0 = (y0 * sw + x0) * 4, i1 = i0 + sw * 4, di = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) D[di + c] = (S0[i0 + c] * (1 - fx) + S0[i0 + 4 + c] * fx) * (1 - fy) + (S0[i1 + c] * (1 - fx) + S0[i1 + 4 + c] * fx) * fy;
      D[di + 3] = 255;
    }
    o.putImageData(od, 0, 0); return out;
  }
  // ปรับให้เหมือนสแกน: หาความสว่างพื้นกระดาษเป็นช่อง ๆ (ค่าสูงสุดในช่อง) แล้วหารออก → พื้นขาว ตัวหนังสือเข้ม เงา/แสงไม่เท่ากันหายไป
  function enhance(src, mode) {
    if (mode === 'orig') return src;
    const W = src.width, H = src.height, x = src.getContext('2d', { willReadFrequently: true }), id = x.getImageData(0, 0, W, H), d = id.data;
    const B = 24, gw = Math.ceil(W / B), gh = Math.ceil(H / B), mx = new Float32Array(gw * gh);
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const i = (y * W + xx) * 4, L = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8, k = ((y / B) | 0) * gw + ((xx / B) | 0); if (L > mx[k]) mx[k] = L; }
    const bc = cv(gw, gh), bx = bc.getContext('2d'), bd = bx.createImageData(gw, gh);
    for (let k = 0; k < gw * gh; k++) { bd.data[k * 4] = bd.data[k * 4 + 1] = bd.data[k * 4 + 2] = Math.max(60, mx[k]); bd.data[k * 4 + 3] = 255; }
    bx.putImageData(bd, 0, 0);
    const big = cv(W, H), gx = big.getContext('2d', { willReadFrequently: true }); gx.filter = `blur(${Math.round(B * .8)}px)`; gx.imageSmoothingQuality = 'high'; gx.drawImage(bc, -B, -B, W + 2 * B, H + 2 * B);
    const bg = gx.getImageData(0, 0, W, H).data, out = cv(W, H), ox = out.getContext('2d'), od = ox.createImageData(W, H), D = od.data;
    for (let i = 0; i < W * H * 4; i += 4) {
      const b = Math.max(40, bg[i]);
      if (mode === 'color') { for (let c = 0; c < 3; c++) { let v = d[i + c] / b * 255; v = (v - 30) * 255 / 215; D[i + c] = v < 0 ? 0 : v > 255 ? 255 : v; } }
      else { let v = ((d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8) / b * 255; v = (v - 55) * 255 / 175; v = v < 0 ? 0 : v > 255 ? 255 : v; v = 255 * Math.pow(v / 255, 1.35); D[i] = D[i + 1] = D[i + 2] = v; }
      D[i + 3] = 255;
    }
    ox.putImageData(od, 0, 0); return out;
  }
  (function () { const st = document.createElement('style'); st.textContent = `
.dsc{position:fixed;inset:0;z-index:120;background:#111;color:#fff;display:flex;flex-direction:column;touch-action:none}
.dsc .tp{display:flex;align-items:center;gap:8px;padding:calc(10px + var(--safe-t)) 12px 8px}.dsc .tp b{flex:1;font-size:16px}.dsc .tp .iconbtn{color:#fff}
.dsc .st{flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;padding:18px}
.dsc .st canvas{max-width:100%;max-height:100%;display:block;box-shadow:0 4px 30px rgba(0,0,0,.5);background:#fff}
.dsc svg.qs{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}.dsc svg.qs polygon{fill:rgba(11,138,62,.18);stroke:#38D27A;stroke-width:2.5}
.dsc .hd{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #38D27A;background:rgba(255,255,255,.25);touch-action:none;cursor:grab}
.dsc .hd:after{content:'';position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#38D27A}
.dsc .bt{padding:10px 12px calc(12px + var(--safe-b));display:flex;flex-direction:column;gap:10px;background:#1b1b1b}
.dsc .bt .row{gap:8px}.dsc .bt .btn.ghost{background:#2a2a2a;color:#fff;box-shadow:none}.dsc .seg{background:#2a2a2a}.dsc .seg button{color:#bbb}.dsc .seg button.on{background:#fff;color:#111}
.dsc .hint{font-size:12.5px;color:#bbb;text-align:center}`; document.head.appendChild(st); })();
  // เปิดหน้าตัดขอบ: คืน { dataUrl, mime, w, h } หรือ null ถ้ายกเลิก
  async function open(file, o = {}) {
    if (!/^image\//.test(file.type || '')) return null;
    busy(1, 'กำลังเตรียมภาพ...');
    let img; try { img = await loadBmp(file); } catch (e) { busy(0); toast(e.message, 1); return null; }
    let rot = 0, src = base(img, 2400, rot), Q = detect(src) || full(src, .03), auto = !!detect(src); busy(0);
    let mode = LS.get('scanMode', 'scan'), step = 1, result = null;
    return new Promise(done => {
      const ov = document.createElement('div'); ov.className = 'dsc'; document.body.appendChild(ov);
      const close = v => { ov.remove(); done(v); };
      const render = () => {
        ov.innerHTML = `<div class="tp"><button class="iconbtn" data-a="x">${I(IC.x)}</button><b>${step === 1 ? 'ตัดขอบเอกสาร' : 'ผลการสแกน'}</b>${step === 1 ? `<button class="iconbtn" data-a="rot" title="หมุน">⟳</button>` : ''}</div>
          <div class="st"><canvas></canvas>${step === 1 ? '<svg class="qs"><polygon/></svg>' + [0, 1, 2, 3].map(i => `<div class="hd" data-h="${i}"></div>`).join('') : ''}</div>
          <div class="bt">${step === 1 ? `<div class="hint">${auto ? '✓ พบขอบเอกสารอัตโนมัติ — ลากจุดสีเขียวปรับได้' : 'ลากจุดสีเขียวทั้ง 4 มุมให้ตรงขอบเอกสาร'}</div>
            <div class="row"><button class="btn ghost grow" data-a="all">ใช้ทั้งภาพ</button><button class="btn ghost grow" data-a="auto">หาขอบอัตโนมัติ</button><button class="btn green grow" data-a="next">ถัดไป ›</button></div>`
          : `<div class="seg">${[['scan', 'สแกนขาวดำ'], ['color', 'สี (คมชัด)'], ['orig', 'ต้นฉบับ']].map(([k, n]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
            <div class="row"><button class="btn ghost grow" data-a="back">‹ ตัดขอบใหม่</button><button class="btn green grow" data-a="ok">${I(IC.check, 18)} ใช้ภาพนี้</button></div>`}</div>`;
        const c = $('canvas', ov), stg = $('.st', ov);
        if (step === 1) { c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); }
        else { c.width = result.width; c.height = result.height; c.getContext('2d').drawImage(result, 0, 0); }
        $$('[data-a]', ov).forEach(b => b.onclick = () => act(b.dataset.a));
        $$('[data-m]', ov).forEach(b => b.onclick = () => { mode = b.dataset.m; LS.set('scanMode', mode); make(); render(); });
        if (step !== 1) return;
        const svg = $('svg.qs', ov), poly = $('polygon', ov), hs = $$('.hd', ov);
        const place = () => {
          const r = c.getBoundingClientRect(), sr = stg.getBoundingClientRect(), k = r.width / src.width, ox = r.left - sr.left, oy = r.top - sr.top;
          svg.style.left = ox + 'px'; svg.style.top = oy + 'px'; svg.setAttribute('width', r.width); svg.setAttribute('height', r.height);
          poly.setAttribute('points', Q.map(p => p[0] * k + ',' + p[1] * k).join(' '));
          hs.forEach((h, i) => { h.style.left = (ox + Q[i][0] * k) + 'px'; h.style.top = (oy + Q[i][1] * k) + 'px'; });
        };
        requestAnimationFrame(place); ov._place = place;
        hs.forEach((h, i) => h.onpointerdown = e => {
          e.preventDefault(); h.setPointerCapture(e.pointerId);
          const mv = ev => { const r = c.getBoundingClientRect(), k = src.width / r.width; Q[i] = [Math.max(0, Math.min(src.width, (ev.clientX - r.left) * k)), Math.max(0, Math.min(src.height, (ev.clientY - r.top) * k))]; place(); };
          h.onpointermove = mv; h.onpointerup = h.onpointercancel = () => { h.onpointermove = null; };
        });
      };
      const make = () => { const w = warp(src, Q, o.max || 1700); result = enhance(w, mode); };
      const act = a => {
        if (a === 'x') return close(null);
        if (a === 'rot') { rot = (rot + 1) % 4; src = base(img, 2400, rot); const d = detect(src); auto = !!d; Q = d || full(src, .03); return render(); }
        if (a === 'all') { Q = full(src, 0); auto = false; return render(); }
        if (a === 'auto') { const d = detect(src); auto = !!d; Q = d || full(src, .03); if (!d) toast('หาขอบไม่เจอ — วางเอกสารบนพื้นสีเข้ม หรือลากมุมเอง'); return render(); }
        if (a === 'next') { busy(1, 'กำลังสแกน...'); setTimeout(() => { try { make(); step = 2; } catch (e) { toast(e.message, 1); } busy(0); render(); }, 30); return; }
        if (a === 'back') { step = 1; return render(); }
        if (a === 'ok') { const q = mode === 'scan' ? .72 : .8, url = result.toDataURL('image/jpeg', q); close({ dataUrl: url, mime: 'image/jpeg', w: result.width, h: result.height }); }
      };
      const onR = () => ov._place && step === 1 && ov._place(); addEventListener('resize', onR);
      const mo = new MutationObserver(() => { if (!ov.isConnected) { removeEventListener('resize', onR); mo.disconnect(); } }); mo.observe(document.body, { childList: true });
      render();
    });
  }
  return { open, detect, warp, enhance, base, full };
})();
window.DocScan = DocScan;

/* ---------- บัญชีรายรับ-รายจ่าย (เงินได้ ม.40(8)) ----------
   รายรับ = ยอดขายสุทธิจาก POS/ยอดนำเข้า (ไม่รวมเงินรับแทน) · รายจ่าย = ใบเสร็จ/บิลที่บันทึก (ตาราง Receipts)
   รูปแบบรายงานตามประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีเงินได้ (ฉบับที่ 161) "รายงานเงินสดรับ-จ่าย" */
/* หมวดรายจ่าย: เจ้าของเพิ่ม/ลบ/เปลี่ยนชื่อ/อิโมจิ/ปักหมุดได้ (ตั้งค่า expCats) · หมวด "ซื้อสินค้ามาขาย" มีเสมอ (ใช้ลงสต๊อก) */
const EXP_DEF = [['ซื้อสินค้ามาขาย', '🛒', 1], ['ค่าเช่าร้าน/สถานที่', '🏠'], ['ค่าไฟฟ้า', '⚡'], ['ค่าน้ำประปา', '🚰'], ['ค่าโทรศัพท์/อินเทอร์เน็ต', '📶'], ['ค่าจ้างพนักงาน', '👷'], ['ค่าขนส่ง/น้ำมันรถ', '⛽'], ['ค่าซ่อมแซม/อุปกรณ์', '🔧'], ['ค่าวัสดุสิ้นเปลือง/บรรจุภัณฑ์', '🛍️'], ['ค่าธรรมเนียม/ภาษีป้าย/ใบอนุญาต', '🧾'], ['อื่น ๆ', '📦']];
const EXP_SUGGEST = [['ค่าน้ำแข็ง', '🧊'], ['ค่าแก๊สหุงต้ม', '🔥'], ['ค่าเก็บขยะ', '🗑️'], ['ค่าอาหารพนักงาน', '🍱'], ['ค่าธรรมเนียมธนาคาร', '🏦'], ['ของใช้ในร้าน', '🧴'], ['ค่าโฆษณา', '📣'], ['ค่าส่งสินค้า', '🚚'], ['ค่าถุง/บรรจุภัณฑ์', '🛍️'], ['ค่าน้ำดื่ม', '💧']];
const EXP_EMO = ['🛒', '🧊', '🔥', '⚡', '🚰', '💧', '📶', '📱', '🏠', '👷', '🍱', '⛽', '🚚', '🛵', '🔧', '🛠️', '🧹', '🧴', '🛍️', '📦', '🧾', '🏦', '💳', '📣', '🗑️', '🧯', '💡', '❄️', '🖨️', '📄', '🥚', '🥬', '🍚', '🥤', '🍺', '🚬', '💊', '🎁', '🏷️', '💰', '📝', '⭐'];
const EXP_PAL = ['#1F5FBF', '#7B3FB8', '#E3A008', '#00ACC1', '#3949AB', '#D81B60', '#6D4C41', '#00897B', '#7CB342', '#F4511E', '#5E35B1', '#039BE5', '#C2185B', '#558B2F'];
const ExpCats = {
  BUY: 'ซื้อสินค้ามาขาย',
  list() {
    let L = null; try { const v = S.settings.expCats; L = v ? (typeof v === 'string' ? JSON.parse(v) : v) : null; } catch (e) { }
    if (!Array.isArray(L) || !L.length) L = EXP_DEF.map(([n, e, pin]) => ({ n, e, pin: !!pin }));
    L = L.filter(c => c && c.n).map(c => ({ n: String(c.n), e: c.e || '🏷️', pin: !!c.pin }));
    if (!L.some(c => c.n === this.BUY)) L.unshift({ n: this.BUY, e: '🛒', pin: true });
    return L;
  },
  color(n) { if (n === this.BUY) return EXP_PAL[0]; let h = 0; for (const ch of String(n)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return EXP_PAL[1 + h % (EXP_PAL.length - 1)]; },
  meta(n) { const c = this.list().find(x => x.n === n); return { e: c ? c.e : (n === 'อื่น ๆ' ? '📦' : '🏷️'), c: this.color(n) }; },
  label(n) { return this.meta(n).e + ' ' + n; },
  // ใช้บ่อยแค่ไหน (120 วันล่าสุด) → แสดงเป็นตัวเลือกด่วน ที่เหลือซ่อนไว้ใต้ "อื่น ๆ"
  usage() { const from = addDays(todayISO(), -120), u = {}; (S.receipts || []).forEach(r => { if (String(r.date) >= from) { const k = expCat(r); u[k] = (u[k] || 0) + 1; } }); return u; },
  quick(cur) {
    const L = this.list(), u = this.usage(), pin = L.filter(c => c.pin), used = L.filter(c => !c.pin && u[c.n]).sort((a, b) => u[b.n] - u[a.n]), rest = L.filter(c => !c.pin && !u[c.n]);
    const set = new Set(pin.concat(used, rest).slice(0, Math.max(6, pin.length)).map(c => c.n)); if (cur) set.add(cur);
    return { all: L, show: L.filter(c => set.has(c.n)), hidden: L.filter(c => !set.has(c.n)) };
  },
  async save(L) { await saveSetting('expCats', JSON.stringify(L.map(c => ({ n: c.n, e: c.e, pin: c.pin ? 1 : 0 })))); }
};
window.ExpCats = ExpCats;
// จัดการหมวดรายจ่าย: เพิ่ม · ลบ · เปลี่ยนชื่อ/อิโมจิ · 📌 แสดงเป็นตัวเลือกด่วนเสมอ · เรียงลำดับ
function expCatsDlg(done) {
  if (!isOwner()) return toast('เฉพาะเจ้าของกิจการ', 1);
  let L = ExpCats.list().map(c => ({ ...c, o: c.n })), pick = -1, newE = '🏷️';
  const ov = sheet('หมวดรายจ่าย', `<div class="tiny muted" style="margin:-4px 2px 10px">📌 = แสดงเป็นตัวเลือกด่วนเสมอ · หมวดอื่นแสดงตามที่ใช้บ่อย ที่เหลือซ่อนใต้ “อื่น ๆ” (กดขยายได้) · ลบหมวดแล้ว รายการที่บันทึกไว้ยังอยู่ครบ</div>
    <div class="card" style="padding:10px 12px"><b class="small">เพิ่มหมวดใหม่</b>
      <div class="row" style="gap:8px;margin-top:8px"><button class="ecemo" id="ne" type="button">${newE}</button><input class="in grow" id="nn" placeholder="เช่น ค่าน้ำแข็ง" maxlength="40"><button class="btn sm green" id="na" type="button">${I(IC.plus, 16)} เพิ่ม</button></div>
      <div id="ng"></div>
      <div class="tiny muted" style="margin:10px 0 4px">แนะนำ (แตะเพื่อเพิ่ม)</div><div class="row wrap" id="sg" style="gap:6px"></div></div>
    <div class="list" id="ec"></div>`,
    `<button class="btn ghost" id="rs" type="button">ค่าเริ่มต้น</button><button class="btn grow green" id="sv" type="button">${I(IC.check, 18)} บันทึก</button>`, { sticky: true });
  const grid = (cur, on) => `<div class="ecgrid">${EXP_EMO.map(e => `<button type="button" data-e="${e}" class="${e === cur ? 'on' : ''}">${e}</button>`).join('')}<input class="in" data-own placeholder="พิมพ์เอง" maxlength="4"></div>`;
  const draw = () => {
    $('#ec', ov).innerHTML = L.map((c, i) => `<div class="ecr"><div class="row" style="gap:8px;padding:8px 10px">
        <button class="ecemo" type="button" data-pe="${i}">${c.e}</button>
        ${c.n === ExpCats.BUY ? `<div class="grow small" style="font-weight:600">${esc(c.n)}<div class="tiny muted" style="font-weight:400">ใช้ลงสต๊อก · ลบไม่ได้</div></div>` : `<input class="in grow" data-nm="${i}" value="${esc(c.n)}" maxlength="40" style="min-height:38px;padding:6px 10px">`}
        <button class="ecpin ${c.pin ? 'on' : ''}" type="button" data-pin="${i}" title="แสดงเป็นตัวเลือกด่วนเสมอ">📌</button>
        <button class="iconbtn" type="button" data-up="${i}" ${i ? '' : 'disabled'} style="padding:4px">▲</button><button class="iconbtn" type="button" data-dn="${i}" ${i < L.length - 1 ? '' : 'disabled'} style="padding:4px">▼</button>
        ${c.n === ExpCats.BUY ? '<span style="width:30px"></span>' : `<button class="iconbtn" type="button" data-del="${i}" style="color:var(--red);padding:4px">${I(IC.trash, 18)}</button>`}</div>
        ${pick === i ? grid(c.e) : ''}</div>`).join('');
    $('#sg', ov).innerHTML = EXP_SUGGEST.filter(([n]) => !L.some(c => c.n === n)).map(([n, e]) => `<button class="chip" type="button" data-sn="${esc(n)}" data-se="${e}">${e} ${esc(n)}</button>`).join('') || '<span class="tiny muted">—</span>';
    $('#ne', ov).textContent = newE;
    $$('[data-nm]', ov).forEach(x => x.oninput = () => { L[+x.dataset.nm].n = x.value; });
    $$('[data-pe]', ov).forEach(b => b.onclick = () => { pick = pick === +b.dataset.pe ? -1 : +b.dataset.pe; $('#ng', ov).innerHTML = ''; draw(); });
    $$('[data-pin]', ov).forEach(b => b.onclick = () => { const c = L[+b.dataset.pin]; c.pin = !c.pin; draw(); });
    $$('[data-up]', ov).forEach(b => b.onclick = () => { const i = +b.dataset.up; [L[i - 1], L[i]] = [L[i], L[i - 1]]; pick = -1; draw(); });
    $$('[data-dn]', ov).forEach(b => b.onclick = () => { const i = +b.dataset.dn; [L[i + 1], L[i]] = [L[i], L[i + 1]]; pick = -1; draw(); });
    $$('[data-del]', ov).forEach(b => b.onclick = () => { L.splice(+b.dataset.del, 1); pick = -1; draw(); });
    $$('[data-sn]', ov).forEach(b => b.onclick = () => { L.splice(1, 0, { n: b.dataset.sn, e: b.dataset.se, pin: true }); draw(); toast(`เพิ่ม ${b.dataset.se} ${b.dataset.sn} แล้ว (📌 แสดงเป็นตัวเลือกด่วน)`); });
    const g = pick >= 0 && $('.ecgrid', ov);
    if (g) { $$('[data-e]', g).forEach(b => b.onclick = () => { L[pick].e = b.dataset.e; pick = -1; draw(); }); const own = $('[data-own]', g); own.onchange = () => { if (own.value.trim()) { L[pick].e = own.value.trim(); pick = -1; draw(); } }; }
  };
  $('#ne', ov).onclick = () => { const ng = $('#ng', ov); if (ng.innerHTML) { ng.innerHTML = ''; return; } pick = -1; draw(); ng.innerHTML = grid(newE); $$('[data-e]', ng).forEach(b => b.onclick = () => { newE = b.dataset.e; ng.innerHTML = ''; $('#ne', ov).textContent = newE; }); const own = $('[data-own]', ng); own.onchange = () => { if (own.value.trim()) { newE = own.value.trim(); ng.innerHTML = ''; $('#ne', ov).textContent = newE; } }; };
  $('#na', ov).onclick = () => { const n = $('#nn', ov).value.trim(); if (!n) return toast('ใส่ชื่อหมวด', 1); if (L.some(c => c.n === n)) return toast('มีหมวดนี้แล้ว', 1); L.splice(1, 0, { n, e: newE, pin: true }); $('#nn', ov).value = ''; newE = '🏷️'; draw(); };
  $('#nn', ov).onkeydown = e => { if (e.key === 'Enter') $('#na', ov).click(); };
  $('#rs', ov).onclick = async () => { if (!(await confirmDlg('คืนหมวดรายจ่ายเป็นค่าเริ่มต้น? (หมวดที่เพิ่มเองจะหายจากตัวเลือก รายการที่บันทึกไว้ยังอยู่)', 'คืนค่าเริ่มต้น', true))) return; L = EXP_DEF.map(([n, e, pin]) => ({ n, e, pin: !!pin, o: n })); pick = -1; draw(); };
  $('#sv', ov).onclick = async () => {
    L.forEach(c => c.n = String(c.n || '').trim());
    if (L.some(c => !c.n)) return toast('ชื่อหมวดห้ามว่าง', 1);
    if (new Set(L.map(c => c.n)).size !== L.length) return toast('ชื่อหมวดซ้ำกัน', 1);
    try {
      busy(1, 'กำลังบันทึก...');
      // เปลี่ยนชื่อหมวด → ย้ายรายการเดิมไปชื่อใหม่ด้วย
      const ren = L.filter(c => c.o && c.o !== c.n), rows = [];
      ren.forEach(c => (S.receipts || []).forEach(r => { if (expCat(r) === c.o) { rows.push({ id: r.id, cat: c.n }); r.cat = c.n; } }));
      for (let i = 0; i < rows.length; i += 200) await api('upsert', { table: 'Receipts', rows: rows.slice(i, i + 200) });
      await ExpCats.save(L);
      busy(0); ov.remove(); toast('บันทึกหมวดรายจ่ายแล้ว' + (rows.length ? ` · ย้ายรายการเดิม ${rows.length} รายการไปชื่อใหม่` : '')); done && done();
    } catch (e) { busy(0); toast(e.message, 1); }
  };
  draw();
}
(function () { const st = document.createElement('style'); st.textContent = `.ecr{border-bottom:1px solid var(--line)}.ecr:last-child{border-bottom:0}
.ecemo{all:unset;box-sizing:border-box;cursor:pointer;width:40px;height:40px;flex:none;border-radius:11px;background:#F4F1EF;display:flex;align-items:center;justify-content:center;font-size:22px}
.ecpin{all:unset;cursor:pointer;font-size:17px;padding:4px 6px;border-radius:8px;opacity:.25;filter:grayscale(1)}.ecpin.on{opacity:1;filter:none;background:#FFF3DC}
.ecgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:4px;padding:6px 10px 10px}.ecgrid button{all:unset;cursor:pointer;text-align:center;font-size:22px;height:40px;line-height:40px;border-radius:9px}.ecgrid button:hover,.ecgrid button.on{background:#FFF3DC}.ecgrid .in{grid-column:span 3;min-height:38px;padding:4px 8px;text-align:center}
.lg-cats .chip .e{font-size:16px;margin-right:4px;vertical-align:-1px}.lg-cats .chip.more{border-style:dashed;color:var(--ink2)}.lg-cats .chip.mng{color:var(--ink2)}`; document.head.appendChild(st); })();
// รายจ่าย/ใบเสร็จร้านส่ง: เก็บสำเนาในเครื่อง → เปิดบัญชีได้ทันที · ดึงจาก Google เบื้องหลัง (ไม่วนโหลดซ้ำ)
function rcLocalSave() { try { LS.set('rcCache', (S.receipts || []).map(r => /^data:/.test(r.fileUrl || '') ? { ...r, fileUrl: '', _img: 1 } : r)); } catch (e) { } }
function rcLoad(force) {
  const loc = S.receipts && S.receipts.length ? S.receipts : LS.get('rcCache', []);
  if (!force && S.rcAt && Date.now() - S.rcAt < 60000) return Promise.resolve(loc);
  const p = loadTable('Receipts').then(r => {
    // รายการที่เพิ่งบันทึก/แก้ในเครื่อง (5 นาที) ชนะข้อมูลที่ดึงมาก่อนบันทึกเสร็จ
    const fresh = {}; (S.receipts || []).forEach(x => { if (x._new && Date.now() - x._new < 300000) fresh[x.id] = x; });
    const ids = new Set(r.map(x => x.id));
    S.rcAt = Date.now(); S.receipts = r.map(x => fresh[x.id] || x).concat(Object.values(fresh).filter(x => !ids.has(x.id))); rcLocalSave(); return S.receipts;
  });
  return loc && loc.length ? quick(p, 2500, loc) : p.catch(() => loc || []);
}
const expCat = r => r.cat || (r.type === 'ค่าใช้จ่าย' ? 'อื่น ๆ' : 'ซื้อสินค้ามาขาย');
const lastDay = ym => addDays(addDays(ym + '-01', 32).slice(0, 8) + '01', -1);
async function ledgerData(y) {
  const from = y + '-01-01', to = y + '-12-31';
  const [days, rc, im] = await Promise.all([quick(dailySummary(from, to), 2500, {}), rcLoad(), window.importedSales ? importedSales(from, to).catch(() => null) : null]);
  S.receipts = rc || [];
  const inc = [];
  Object.entries(days || {}).forEach(([d, x]) => { const a = num(x.net) - num(x.pass); if (Math.abs(a) >= .005) inc.push({ d, item: 'รายได้จากการขายสินค้า/ค่าบริการ', amt: a, note: [x.pass ? `ไม่รวมเงินรับแทน ${money(x.pass)}` : '', x.src && x.src !== 'POS' ? 'ยอดจาก ' + x.src : ''].filter(Boolean).join(' · ') }); });
  ((im && im.months) || []).forEach(m => inc.push({ d: lastDay(m.ym), item: 'รายได้จากการขาย (ยอดรวมทั้งเดือน)', amt: m.net, note: 'ยอดรายเดือนที่นำเข้า' + (m.src ? ' · ' + m.src : '') }));
  const exp = S.receipts.filter(r => String(r.date).slice(0, 4) === String(y)).map(r => ({ d: String(r.date).slice(0, 10), r, cat: expCat(r), amt: num(r.total), item: `${expCat(r)}${r.supplier ? ' — ' + r.supplier : ''}${r.docNo ? ' เลขที่ ' + r.docNo : ''}`, note: [r.fileUrl || r.fileId ? 'มีหลักฐาน' : 'ไม่มีหลักฐาน', r.payMethod || ''].filter(Boolean).join(' · ') }));
  return { inc, exp };
}
(function () { const st = document.createElement('style'); st.textContent = `
.lg-k{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 6px}.lg-k .stat .v{font-size:21px}
.lg-k .stat.s-in{box-shadow:inset 0 3px 0 var(--green),var(--sh)}.lg-k .stat.s-ex{box-shadow:inset 0 3px 0 var(--red),var(--sh)}
@media(max-width:480px){.lg-k .stat .v{font-size:17px}.lg-k .stat{padding:10px}}
.lg-add{min-height:58px;font-size:16.5px;margin-bottom:12px;gap:10px}
.lg-day{padding:8px 14px;background:#FAF7F5;border-bottom:1px solid var(--line);display:flex;gap:8px;font-size:13px;font-weight:600;color:var(--ink2)}
.lg-row{display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)}.lg-row.x{cursor:pointer}.lg-row.x:active{background:#FBF8F7}
.lg-ic{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden}.lg-ic img{width:100%;height:100%;object-fit:cover}
.lg-amt{font-family:var(--fh);font-weight:700;white-space:nowrap;flex:none}.lg-amt.lgp{color:var(--green)}.lg-amt.lgn{color:var(--red-d)}
.lg-ph{border-radius:16px;background:#fff;box-shadow:inset 0 0 0 1.5px var(--line);margin-bottom:12px;overflow:hidden}
.lg-ph img{display:block;width:100%;max-height:300px;object-fit:contain;background:#F4F1EF}
.lg-ph .pb{display:grid;grid-template-columns:1.4fr 1fr;gap:8px;padding:10px}
.lg-cats{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.lg-cats .chip{padding:6px 11px}
.lg-tax .kv b{font-variant-numeric:tabular-nums}`; document.head.appendChild(st); })();

VIEWS.ledger = async el => {
  if (ownerOnly(el)) return;
  const t = todayISO(), L = S.lgState || (S.lgState = { y: +t.slice(0, 4), m: +t.slice(5, 7), tab: 'list' });
  const tx = cfg('taxInfo', { name: '', taxId: '', shop: S.settings.shopName || '', addr: S.settings.address || '' });
  el.innerHTML = vhead('บัญชีรายรับ-รายจ่าย', '', 'tax') + `
   <div class="card" style="padding:12px">
     <div class="row" style="gap:8px"><select class="in" id="yy" style="max-width:130px">${[0, 1, 2, 3].map(k => `<option value="${L.y - k}">${L.y - k + 543}</option>`).join('')}</select><select class="in grow" id="mm"><option value="0">ทั้งปี</option>${TH_MF.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}</select></div>
     <div class="lg-k" id="kp"></div>
     <div class="tiny muted">เงินได้ประเภท ม.40(8) · บันทึกตามเงินสดรับ-จ่ายจริง · รายรับไม่รวมเงินรับแทน (โอน/เติมเงิน/จ่ายบิล) · ยอดขายสินค้ายกเว้น VAT ยังนับเป็นรายรับตามปกติ</div>
   </div>
   <button class="btn block green lg-add" id="add">${I(IC.cam, 24)} บันทึกรายจ่าย · ถ่ายรูปบิล</button>
   <div id="dexp"></div>
   <div class="seg" id="tb" style="margin-bottom:10px">${[['list', 'รายการ'], ['month', 'รายเดือน'], ['cat', 'หมวดรายจ่าย'], ['tax', 'ยื่นภาษี']].map(([k, n]) => `<button data-t="${k}" class="${L.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
   <div id="pane"><div class="card center"><span class="spin dark"></span></div></div>
   <div class="card"><h3>ส่งออกรายงานเงินสดรับ-จ่าย</h3><div class="small muted" style="margin:-4px 0 8px">ตามแบบประกาศอธิบดีกรมสรรพากรฯ (ฉบับที่ 161) · ฟอนต์ TH Sarabun</div>
     <div class="row wrap" style="gap:8px"><button class="btn grow" id="pr">${I(IC.print, 18)} พิมพ์ / PDF</button><button class="btn ghost grow" id="xl">${I(IC.file, 18)} Excel (.xlsx)</button></div>
     <details style="margin-top:10px"><summary class="small"><b>ข้อมูลผู้ประกอบการ (หัวรายงาน)</b></summary><div class="grid2" style="margin-top:8px"><label class="f"><span>ชื่อผู้ประกอบการ</span><input class="in" id="tn" value="${esc(tx.name)}"></label><label class="f"><span>เลขประจำตัวผู้เสียภาษีอากร</span><input class="in" id="ti" inputmode="numeric" value="${esc(tx.taxId)}"></label></div><label class="f"><span>ชื่อสถานประกอบการ</span><input class="in" id="ts" value="${esc(tx.shop)}"></label><label class="f"><span>ที่ตั้ง</span><input class="in" id="ta" value="${esc(tx.addr)}"></label><button class="btn ghost sm" id="tsv">บันทึกหัวรายงาน</button></details></div>`;
  $('#yy', el).value = L.y; $('#mm', el).value = L.m;
  $('#tsv', el).onclick = async () => { try { busy(1); await saveSetting('taxInfo', { name: $('#tn', el).value.trim(), taxId: $('#ti', el).value.trim(), shop: $('#ts', el).value.trim(), addr: $('#ta', el).value.trim() }); busy(0); toast('บันทึกหัวรายงานแล้ว'); } catch (e) { busy(0); toast(e.message, 1); } };
  $('#add', el).onclick = () => expenseForm(null, () => go('ledger'));
  if (window.DailyExp) DailyExp.mount($('#dexp', el));
  let D = await ledgerData(L.y);
  const inR = (d) => !L.m || +d.slice(5, 7) === L.m;
  const draw = () => {
    const I2 = D.inc.filter(x => inR(x.d)), E = D.exp.filter(x => inR(x.d)), TI = I2.reduce((a, x) => a + x.amt, 0), TE = E.reduce((a, x) => a + x.amt, 0);
    $('#kp', el).innerHTML = `<div class="stat s-in"><div class="k">รายรับรวม</div><div class="v num">${bahtL(TI, 0)}</div><div class="tiny muted">${I2.length} วันที่มีรายรับ</div></div><div class="stat s-ex"><div class="k">รายจ่ายรวม</div><div class="v num">${bahtL(TE, 0)}</div><div class="tiny muted">${E.length} รายการ${E.filter(x => x.note.startsWith('ไม่มี')).length ? ` · ไม่มีบิล ${E.filter(x => x.note.startsWith('ไม่มี')).length}` : ''}</div></div><div class="stat"><div class="k">คงเหลือ</div><div class="v num" style="color:${TI - TE < 0 ? 'var(--red)' : 'inherit'}">${bahtL(TI - TE, 0)}</div><div class="tiny muted">รายรับ − รายจ่าย</div></div>`;
    const pane = $('#pane', el), tab = L.tab;
    if (tab === 'list') {
      const days = {}; I2.forEach(x => (days[x.d] = days[x.d] || { i: [], e: [] }).i.push(x)); E.forEach(x => (days[x.d] = days[x.d] || { i: [], e: [] }).e.push(x));
      const ks = Object.keys(days).sort().reverse(), lim = L.lim || 40;
      pane.innerHTML = ks.length ? `<div class="list">${ks.slice(0, lim).map(d => { const g = days[d], si = g.i.reduce((a, x) => a + x.amt, 0), se = g.e.reduce((a, x) => a + x.amt, 0); return `<div class="lg-day"><span class="grow">${thLong(d)}</span>${si ? `<span style="color:var(--green)">+${money(si, 0)}</span>` : ''}${se ? `<span style="color:var(--red-d)">−${money(se, 0)}</span>` : ''}</div>`
        + g.i.map(x => `<div class="lg-row"><div class="lg-ic" style="background:var(--green-l);color:var(--green)">${I(IC.sale, 20)}</div><div class="grow"><div style="font-weight:600">${esc(x.item)}</div>${x.note ? `<div class="tiny muted">${esc(x.note)}</div>` : ''}</div><div class="lg-amt lgp">+${money(x.amt)}</div></div>`).join('')
        + g.e.map(x => { const im = /^data:image/.test(x.r.fileUrl || '') ? x.r.fileUrl : ''; const cm = ExpCats.meta(x.cat); return `<div class="lg-row x" data-id="${esc(x.r.id)}"><div class="lg-ic" style="background:${x.r.fileUrl || x.r.fileId ? '#EEF3FB' : 'var(--amber-l)'};color:${x.r.fileUrl || x.r.fileId ? 'var(--blue)' : 'var(--amber)'}">${im ? `<img src="${im}" alt="">` : I(x.r.fileUrl || x.r.fileId ? IC.file : IC.alert, 20)}</div><div class="grow" style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.r.supplier || x.cat)}</div><div class="tiny muted"><span class="tag" style="background:${cm.c}1a;color:${cm.c}">${cm.e} ${esc(x.cat)}</span>${x.r.type === 'สินค้า' ? (x.r.stockApplied === 'Y' ? ' <span class="tag green">ลงสต๊อกแล้ว</span>' : ' <span class="tag amber">ยังไม่ลงสต๊อก</span>') : ''}${x.r.fileUrl || x.r.fileId ? '' : ' <span class="tag amber">ไม่มีบิล</span>'}</div></div><div class="lg-amt lgn">−${money(x.amt)}</div></div>`; }).join('');
      }).join('')}${ks.length > lim ? `<div class="item center" id="more" style="justify-content:center;color:var(--red);font-weight:600">แสดงเพิ่ม (${ks.length - lim} วัน)</div>` : ''}</div>` : `<div class="card empty">ยังไม่มีรายการ${L.m ? 'ในเดือนนี้' : 'ในปีนี้'}</div>`;
      $$('[data-id]', pane).forEach(x => x.onclick = () => expenseForm(S.receipts.find(r => r.id === x.dataset.id), () => go('ledger')));
      const mo = $('#more', pane); if (mo) mo.onclick = () => { L.lim = lim + 60; draw(); };
    } else if (tab === 'month') {
      const rows = TH_MF.map((n, i) => { const f = x => +x.d.slice(5, 7) === i + 1, a = D.inc.filter(f).reduce((s, x) => s + x.amt, 0), b = D.exp.filter(f).reduce((s, x) => s + x.amt, 0); return [i + 1, n, a, b]; });
      const A = rows.reduce((s, r) => s + r[2], 0), B = rows.reduce((s, r) => s + r[3], 0);
      pane.innerHTML = `<div class="card scroll-x"><table class="t"><tr><th>เดือน</th><th class="right">รายรับ</th><th class="right">รายจ่าย</th><th class="right">คงเหลือ</th></tr>${rows.map(r => `<tr data-m="${r[0]}" style="cursor:pointer${L.m === r[0] ? ';background:#FFF7E6' : ''}"><td>${r[1]}</td><td class="right num" style="color:var(--green)">${r[2] ? money(r[2]) : '–'}</td><td class="right num" style="color:var(--red-d)">${r[3] ? money(r[3]) : '–'}</td><td class="right num">${r[2] || r[3] ? money(r[2] - r[3]) : '–'}</td></tr>`).join('')}<tr><th>รวมทั้งปี ${L.y + 543}</th><th class="right num">${money(A)}</th><th class="right num">${money(B)}</th><th class="right num">${money(A - B)}</th></tr></table><div class="tiny muted" style="margin-top:6px">แตะเดือนเพื่อดูรายการ</div></div>`;
      $$('[data-m]', pane).forEach(r => r.onclick = () => { L.m = +r.dataset.m; L.tab = 'list'; go('ledger'); });
    } else if (tab === 'cat') {
      const by = {}; E.forEach(x => { const c = by[x.cat] || (by[x.cat] = { n: 0, a: 0 }); c.n++; c.a += x.amt; });
      const list = Object.entries(by).sort((a, b) => b[1].a - a[1].a);
      pane.innerHTML = `<div class="row" style="margin:0 2px 8px"><span class="grow small muted">รายจ่ายแยกตามหมวด${L.m ? ' (เดือนนี้)' : ' (ทั้งปี)'}</span><button class="btn ghost sm" onclick="expCatsDlg(()=>go('ledger'))">⚙️ จัดการหมวด</button></div>` + (list.length ? `<div class="card">${hBars(list.map(([n, c]) => ({ n: ExpCats.label(n), v: c.a, c: ExpCats.color(n), s: c.n + ' รายการ · ' + (TE ? (c.a / TE * 100).toFixed(1) : 0) + '%' })))}</div>` : `<div class="card empty">ยังไม่มีรายจ่าย</div>`);
    } else {
      const yi = D.inc.reduce((a, x) => a + x.amt, 0), ye = D.exp.reduce((a, x) => a + x.amt, 0), flat = yi * .6, noBill = D.exp.filter(x => x.note.startsWith('ไม่มี'));
      const better = ye > flat ? 'actual' : 'flat';
      pane.innerHTML = `<div class="card lg-tax"><h3>เลือกวิธีหักค่าใช้จ่าย ปีภาษี ${L.y + 543}</h3>
        <div class="kv"><span>เงินได้ 40(8) (รายรับทั้งปี)</span><b>${money(yi)}</b></div>
        <div class="kv"><span>① หักเหมา 60%</span><b>${money(flat)}</b></div>
        <div class="kv"><span>② หักตามจริง (รายจ่ายที่บันทึก)</span><b>${money(ye)}</b></div>
        <div class="alert ${better === 'actual' ? 'green' : 'blue'} small" style="margin-top:10px">${I(IC.check, 18)}<div>${better === 'actual' ? `หักตามจริงได้มากกว่าเหมา <b>${money(ye - flat)}</b> บาท — ต้องเก็บหลักฐานรายจ่ายให้ครบทุกรายการ` : `หักเหมา 60% ได้มากกว่าตามจริง <b>${money(flat - ye)}</b> บาท — ไม่ต้องแสดงหลักฐานรายจ่าย แต่ยังต้องทำรายงานเงินสดรับ-จ่าย`}</div></div>
        ${noBill.length ? `<div class="alert amber small">${I(IC.alert, 18)}<div>รายจ่าย ${noBill.length} รายการ (${money(noBill.reduce((a, x) => a + x.amt, 0))} บาท) ยังไม่มีรูปบิล — แตะรายการในแท็บ “รายการ” เพื่อแนบ</div></div>` : ''}
        <div class="tiny muted">ยื่น ภ.ง.ด.94 (ครึ่งปี ม.ค.–มิ.ย.) ภายใน 30 ก.ย. · ภ.ง.ด.90 (ทั้งปี) ภายใน 31 มี.ค. ปีถัดไป · ตัวเลขนี้ช่วยประเมิน ควรให้นักบัญชีตรวจก่อนยื่น</div></div>`;
    }
  };
  draw();
  $('#yy', el).onchange = async () => { L.y = +$('#yy', el).value; L.lim = 0; $('#pane', el).innerHTML = '<div class="card center"><span class="spin dark"></span></div>'; D = await ledgerData(L.y); draw(); };
  $('#mm', el).onchange = () => { L.m = +$('#mm', el).value; L.lim = 0; draw(); };
  $$('#tb button', el).forEach(b => b.onclick = () => { L.tab = b.dataset.t; $$('#tb button', el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  const head = () => { const T = cfg('taxInfo', tx); return { n: $('#tn', el).value.trim() || T.name, id: $('#ti', el).value.trim() || T.taxId, shop: $('#ts', el).value.trim() || T.shop, addr: $('#ta', el).value.trim() || T.addr }; };
  $('#pr', el).onclick = () => ledgerPrint(D, L, head());
  $('#xl', el).onclick = () => { try { XL.save(`cash-report-40-8_${L.y + 543}${L.m ? '-' + String(L.m).padStart(2, '0') : ''}.xlsx`, ledgerBook(D, L, head()), { title: 'รายงานเงินสดรับ-จ่าย' }); toast('ดาวน์โหลด Excel แล้ว'); } catch (e) { toast(e.message, 1); } };
};
VIEWS.cashreport = el => VIEWS.ledger(el);   // หน้าเดิม → หน้าใหม่
// แถวของรายงานแต่ละเดือน (รายรับก่อนรายจ่ายในวันเดียวกัน)
function ledgerRows(D, ym) {
  return D.inc.filter(x => x.d.startsWith(ym)).map(x => ({ d: x.d, item: x.item, inc: x.amt, exp: 0, note: x.note, o: 0 }))
    .concat(D.exp.filter(x => x.d.startsWith(ym)).map(x => ({ d: x.d, item: x.item, inc: 0, exp: x.amt, note: x.note, o: 1 })))
    .sort((a, b) => a.d.localeCompare(b.d) || a.o - b.o);
}
const ledgerMonths = (D, L) => (L.m ? [L.m] : [...Array(12).keys()].map(i => i + 1)).map(m => L.y + '-' + String(m).padStart(2, '0')).filter(ym => L.m || D.inc.some(x => x.d.startsWith(ym)) || D.exp.some(x => x.d.startsWith(ym)));
function ledgerPrint(D, L, h) {
  const dots = (v, n) => esc(v) || '.'.repeat(n);
  const css = `<style>#printArea .lg{font-family:'Sarabun','TH Sarabun New','TH SarabunPSK',sans-serif;font-size:14.5px;line-height:1.45;color:#000}#printArea .lg h2{text-align:center;font-size:19px;margin:0}#printArea .lg .c{text-align:center}#printArea .lg table{width:100%;border-collapse:collapse;margin-top:6px}#printArea .lg th,#printArea .lg td{border:1px solid #444;padding:2px 6px;vertical-align:top}#printArea .lg th{font-weight:700;text-align:center;background:#f0f0f0}#printArea .lg td.r{text-align:right;white-space:nowrap}#printArea .lg tr.t td{font-weight:700;background:#f6f6f6}#printArea .lg .sg{margin-top:22px;text-align:right}</style>`;
  const months = ledgerMonths(D, L);
  const pages = months.map(ym => {
    const rs = ledgerRows(D, ym), ti = rs.reduce((a, r) => a + r.inc, 0), te = rs.reduce((a, r) => a + r.exp, 0);
    return `<div class="lg" style="break-after:page"><h2>รายงานเงินสดรับ-จ่าย</h2><div class="c">ประจำเดือน ${TH_MF[+ym.slice(5) - 1]} พ.ศ. ${+ym.slice(0, 4) + 543}</div>
      <div style="margin:8px 0 2px">ชื่อผู้ประกอบการ ${dots(h.n, 40)} &nbsp; เลขประจำตัวผู้เสียภาษีอากร ${dots(h.id, 26)}</div><div>ชื่อสถานประกอบการ ${dots(h.shop, 30)} &nbsp; ที่ตั้ง ${dots(h.addr, 40)}</div>
      <table><thead><tr><th style="width:15%">วัน เดือน ปี</th><th>รายการ</th><th style="width:14%">รายรับ<br>จำนวนเงิน</th><th style="width:14%">รายจ่าย<br>จำนวนเงิน</th><th style="width:19%">หมายเหตุ</th></tr></thead>
      ${rs.map(r => `<tr><td>${thDate(r.d)}</td><td>${esc(r.item)}</td><td class="r">${r.inc ? money(r.inc) : ''}</td><td class="r">${r.exp ? money(r.exp) : ''}</td><td>${esc(r.note)}</td></tr>`).join('') || '<tr><td colspan="5" class="c">ไม่มีรายการ</td></tr>'}
      <tr class="t"><td colspan="2" class="c">รวมเดือน ${TH_MF[+ym.slice(5) - 1]}</td><td class="r">${money(ti)}</td><td class="r">${money(te)}</td><td>คงเหลือ ${money(ti - te)}</td></tr></table>
      <div class="sg">ลงชื่อ ................................................ ผู้ประกอบการ<br>(${dots(h.n, 40)})</div></div>`;
  });
  let sum = '';
  if (!L.m) {
    const rows = TH_MF.map((n, i) => { const ym = L.y + '-' + String(i + 1).padStart(2, '0'), a = D.inc.filter(x => x.d.startsWith(ym)).reduce((s, x) => s + x.amt, 0), b = D.exp.filter(x => x.d.startsWith(ym)).reduce((s, x) => s + x.amt, 0); return [n, a, b]; });
    const A = rows.reduce((s, r) => s + r[1], 0), B = rows.reduce((s, r) => s + r[2], 0);
    sum = `<div class="lg" style="break-after:page"><h2>สรุปรายงานเงินสดรับ-จ่าย ประจำปี พ.ศ. ${L.y + 543}</h2><div class="c">${dots(h.shop, 30)} · เลขประจำตัวผู้เสียภาษีอากร ${dots(h.id, 26)}</div>
      <table><tr><th>เดือน</th><th>รายรับ</th><th>รายจ่าย</th><th>คงเหลือ</th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td class="r">${money(r[1])}</td><td class="r">${money(r[2])}</td><td class="r">${money(r[1] - r[2])}</td></tr>`).join('')}<tr class="t"><td>รวมทั้งปี</td><td class="r">${money(A)}</td><td class="r">${money(B)}</td><td class="r">${money(A - B)}</td></tr></table>
      <table style="margin-top:12px;width:70%"><tr><th colspan="2">เปรียบเทียบการหักค่าใช้จ่าย (ม.40(8))</th></tr><tr><td>หักเหมา 60% ของรายรับ</td><td class="r">${money(A * .6)}</td></tr><tr><td>หักตามจริง (รายจ่ายที่บันทึก)</td><td class="r">${money(B)}</td></tr></table>
      <div class="sg">ลงชื่อ ................................................ ผู้ประกอบการ</div></div>`;
  }
  printA4(css + (sum + pages.join('')) || '<p>ไม่มีข้อมูล</p>');
}
function ledgerBook(D, L, h) {
  const months = ledgerMonths(D, L), sheets = [];
  const top = (title, sub) => [[{ v: title, s: 'T' }], [{ v: sub, s: 'c' }], [{ v: `ชื่อผู้ประกอบการ ${h.n || '.....................................'}   เลขประจำตัวผู้เสียภาษีอากร ${h.id || '...........................'}`, s: '' }], [{ v: `ชื่อสถานประกอบการ ${h.shop || '.............................'}   ที่ตั้ง ${h.addr || '.....................................'}`, s: '' }], []];
  if (!L.m) {
    const rows = TH_MF.map((n, i) => { const ym = L.y + '-' + String(i + 1).padStart(2, '0'), a = D.inc.filter(x => x.d.startsWith(ym)).reduce((s, x) => s + x.amt, 0), b = D.exp.filter(x => x.d.startsWith(ym)).reduce((s, x) => s + x.amt, 0); return [n, a, b, a - b]; });
    const A = rows.reduce((s, r) => s + r[1], 0), B = rows.reduce((s, r) => s + r[2], 0);
    const by = {}; D.exp.forEach(x => by[x.cat] = (by[x.cat] || 0) + x.amt);
    sheets.push({ name: 'สรุปทั้งปี', cols: [30, 15, 15, 15], merges: ['A1:D1', 'A2:D2', 'A3:D3', 'A4:D4'], rows: top('สรุปรายงานเงินสดรับ-จ่าย', `ประจำปี พ.ศ. ${L.y + 543}`)
      .concat(XL.table(['เดือน', 'รายรับ', 'รายจ่าย', 'คงเหลือ'], rows, ['t', 'n', 'n', 'n'], ['รวมทั้งปี', A, B, A - B]), [[]],
        XL.table(['เปรียบเทียบการหักค่าใช้จ่าย ม.40(8)', 'จำนวนเงิน'], [['เงินได้ (รายรับทั้งปี)', A], ['หักเหมา 60%', A * .6], ['หักตามจริง (รายจ่ายที่บันทึก)', B]], ['t', 'n']), [[]],
        XL.table(['รายจ่ายตามหมวด', 'จำนวนเงิน'], Object.entries(by).sort((a, b) => b[1] - a[1]), ['t', 'n'], ['รวม', B])) });
  }
  months.forEach(ym => {
    const rs = ledgerRows(D, ym), ti = rs.reduce((a, r) => a + r.inc, 0), te = rs.reduce((a, r) => a + r.exp, 0), mn = TH_MF[+ym.slice(5) - 1], yy = +ym.slice(0, 4) + 543;
    sheets.push({ name: `${TH_M[+ym.slice(5) - 1].replace(/\./g, '')} ${String(yy).slice(-2)}`, cols: [11, 36, 13, 13, 22], merges: ['A1:E1', 'A2:E2', 'A3:E3', 'A4:E4'], freeze: 6,
      rows: top('รายงานเงินสดรับ-จ่าย', `ประจำเดือน ${mn} พ.ศ. ${yy}`).concat(
        XL.table(['วัน เดือน ปี', 'รายการ', 'รายรับ (บาท)', 'รายจ่าย (บาท)', 'หมายเหตุ'], rs.map(r => [thDate(r.d), r.item, r.inc || '', r.exp || '', r.note]), ['d', 't', 'n', 'n', 't'], [`รวมเดือน ${mn}`, '', ti, te, `คงเหลือ ${money(ti - te)}`]),
        [[], ['', '', { v: 'ลงชื่อ ......................................... ผู้ประกอบการ', s: '' }]]) });
  });
  if (!sheets.length) sheets.push({ name: 'รายงาน', rows: top('รายงานเงินสดรับ-จ่าย', 'ไม่มีข้อมูล') });
  return sheets;
}

/* ---------- ฟอร์มรายจ่าย: ถ่ายรูปบิล → ตัดขอบอัตโนมัติ → อ่านยอด (OCR) → บันทึก ---------- */
function expenseForm(r0, done) {
  if (!isOwner()) return toast('เฉพาะเจ้าของกิจการ', 1);
  const isNew = !r0, r = r0 ? { ...r0 } : { id: uid('R'), date: todayISO(), type: 'ค่าใช้จ่าย', cat: ExpCats.list().some(c => c.n === LS.get('lastExpCat', '')) ? LS.get('lastExpCat', '') : ExpCats.BUY, items: '[]', payMethod: 'เงินสด' };
  let cat = expCat(r), shot = null;
  const sups = [...new Set((S.receipts || []).map(x => x.supplier).filter(Boolean))].slice(0, 200);
  const ov = sheet(isNew ? 'บันทึกรายจ่าย' : 'รายจ่าย', `
    <div class="lg-ph" id="ph"></div>
    <div class="small muted" style="margin:0 2px 6px">หมวดรายจ่าย</div><div class="lg-cats" id="cs"></div>
    <div class="grid2"><label class="f"><span>วันที่จ่าย</span><input class="in" type="date" id="e_date" value="${esc(String(r.date || '').slice(0, 10))}"></label><label class="f"><span>จำนวนเงิน (บาท) *</span><input class="in" id="e_total" type="number" inputmode="decimal" step="any" value="${esc(r.total || '')}" style="font-weight:700;font-size:18px"></label></div>
    <label class="f"><span>จ่ายให้ / ร้านค้า</span><input class="in" id="e_supplier" list="lgsup" value="${esc(r.supplier || '')}" placeholder="เช่น แม็คโคร, การไฟฟ้าส่วนภูมิภาค"><datalist id="lgsup">${sups.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
    <div class="grid2"><label class="f"><span>เลขที่เอกสาร</span><input class="in" id="e_docNo" value="${esc(r.docNo || '')}"></label><label class="f"><span>ชำระโดย</span><select class="in" id="e_payMethod">${['เงินสด', 'โอน', 'เครดิต', 'บัตร'].map(x => `<option>${x}</option>`).join('')}</select></label></div>
    <label class="f"><span>หมายเหตุ</span><input class="in" id="e_note" value="${esc(r.note || '')}"></label>
    <div id="stk"></div>
    ${!isNew ? `<button class="btn ghost sm" id="del" style="color:var(--red);margin-top:6px">${I(IC.trash, 16)} ลบรายการนี้</button>` : ''}`,
    `<button class="btn grow green" id="sv">${I(IC.check, 18)} บันทึก</button>`, { sticky: true });
  $('#e_payMethod', ov).value = r.payMethod || 'เงินสด';
  // ตัวเลือกด่วน: หมวดที่ปักหมุด + ใช้บ่อย · ที่เหลือซ่อนใต้ "อื่น ๆ" กดขยายได้
  let showAll = false;
  const drawCats = () => {
    const Q = ExpCats.quick(cat), list = showAll ? Q.all : Q.show;
    $('#cs', ov).innerHTML = list.map(c => { const col = ExpCats.color(c.n); return `<button type="button" class="chip ${c.n === cat ? 'on' : ''}" data-c="${esc(c.n)}" style="${c.n === cat ? `background:${col};border-color:${col}` : ''}"><span class="e">${c.e}</span>${esc(c.n)}</button>`; }).join('')
      + (Q.hidden.length ? `<button type="button" class="chip more" id="cm">${showAll ? '▴ ย่อ' : `＋ อื่น ๆ ${Q.hidden.length}`}</button>` : '')
      + `<button type="button" class="chip mng" id="cg">⚙️ จัดการ</button>`;
    $$('[data-c]', ov).forEach(b => b.onclick = () => { cat = b.dataset.c; drawCats(); drawStk(); });
    const m = $('#cm', ov); if (m) m.onclick = () => { showAll = !showAll; drawCats(); };
    $('#cg', ov).onclick = () => expCatsDlg(() => { if (!ExpCats.list().some(c => c.n === cat) && cat !== expCat(r)) cat = ExpCats.BUY; drawCats(); drawStk(); });
  };
  const imgSrc = () => shot ? shot.dataUrl : /^data:image/.test(r.fileUrl || '') ? r.fileUrl : '';
  const drawPh = () => {
    const src = imgSrc();
    $('#ph', ov).innerHTML = `${src ? `<img src="${src}" alt="บิล">` : r.fileUrl ? `<div style="padding:12px"><a class="btn ghost sm" href="${esc(r.fileUrl)}" target="_blank" rel="noopener">${I(IC.file, 16)} เปิดรูปบิลที่แนบไว้</a></div>` : `<div class="center muted small" style="padding:14px 10px 2px">${I(IC.file, 30)}<div>ถ่ายรูปบิล/ใบเสร็จ — ระบบตัดขอบให้เป็นภาพสแกนอัตโนมัติ</div></div>`}
      <div class="pb"><label class="btn ${src || r.fileUrl ? 'ghost' : ''}">${I(IC.cam, 20)} ${src || r.fileUrl ? 'ถ่ายใหม่' : 'ถ่ายรูปบิล'}<input type="file" accept="image/*" capture="environment" class="hidden" data-f></label><label class="btn ghost">${I(IC.image || IC.file, 20)} เลือกรูป<input type="file" accept="image/*" class="hidden" data-f></label></div>
      ${src ? `<div class="row" style="padding:0 10px 10px"><button class="btn ghost sm grow" id="ocr">อ่านยอด/วันที่จากบิลอัตโนมัติ</button></div>` : ''}`;
    $$('[data-f]', ov).forEach(inp => inp.onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const res = await DocScan.open(f); if (!res) return;
      shot = res; drawPh();
      if (S.apiUrl && !num($('#e_total', ov).value)) readBill();
    });
    const ob = $('#ocr', ov); if (ob) ob.onclick = readBill;
  };
  const readBill = async () => {
    const src = imgSrc(); if (!src) return;
    try {
      busy(1, 'กำลังอ่านข้อมูลจากบิล...');
      const o = await api('ocr', { base64: src, mime: 'image/jpeg' }), d = o.data || parseReceiptText(o.text || '');
      busy(0);
      const set = (id, v) => { if (v && !$('#' + id, ov).value) $('#' + id, ov).value = v; };
      if (num(d.total)) $('#e_total', ov).value = num(d.total);
      if (d.date && /^\d{4}-\d\d-\d\d$/.test(d.date)) $('#e_date', ov).value = d.date;
      set('e_supplier', d.supplier); set('e_docNo', d.docNo);
      r._ocr = d; toast(num(d.total) ? `อ่านยอดได้ ${baht(d.total)} — ตรวจสอบก่อนบันทึก` : 'อ่านยอดไม่ได้ — กรอกเอง');
    } catch (e) { busy(0); toast('อ่านอัตโนมัติไม่สำเร็จ: ' + e.message + ' — กรอกเองได้', 1); }
  };
  const drawStk = () => {
    const b = $('#stk', ov); if (!b) return;
    b.innerHTML = cat !== ExpCats.BUY ? '' : r.stockApplied === 'Y' ? `<div class="alert green small">${I(IC.check, 18)}<div>บิลนี้ลงสต๊อก/ต้นทุนแล้ว</div></div>`
      : `<div class="alert blue small" style="align-items:center">${I(IC.box, 18)}<div class="grow">บิลซื้อสินค้า — เพิ่มสต๊อกและอัปเดตต้นทุนจากรายการในบิลได้</div></div>${isNew ? '<div class="tiny muted" style="margin:-4px 2px 8px">บันทึกแล้วกด “เพิ่มสต๊อกจากบิลนี้” ได้ทันที หรือทำภายหลังที่หน้าเพิ่มสต๊อก</div>' : `<button class="btn block" id="tostk" style="margin-bottom:8px">${I(IC.box, 18)} เพิ่มสต๊อกจากบิลนี้ (อ่านรายการอัตโนมัติ)</button>`}`;
    const t2 = $('#tostk', ov); if (t2) t2.onclick = () => { ov.remove(); stockFromBill(r, done); };
  };
  drawCats(); drawPh(); drawStk();
  $('#sv', ov).onclick = async () => {
    const rc = { ...r }; delete rc._ocr;
    ['date', 'total', 'supplier', 'docNo', 'payMethod', 'note'].forEach(k => rc[k] = $('#e_' + k, ov).value.trim());
    if (!num(rc.total)) return toast('ใส่จำนวนเงิน', 1); if (!rc.date) return toast('ใส่วันที่', 1);
    rc.cat = cat; rc.type = cat === ExpCats.BUY ? 'สินค้า' : 'ค่าใช้จ่าย'; if (!rc.items) rc.items = '[]';
    try {
      busy(1, 'กำลังบันทึก...');
      if (shot) { const up = await api('upload', { kind: 'receipt', name: `bill_${rc.date}_${Date.now()}.jpg`, mime: shot.mime, base64: shot.dataUrl }); rc.fileId = up.fileId || ''; rc.fileUrl = up.fileUrl || ''; }
      if (!rc.createdAt) { rc.createdAt = new Date().toISOString(); rc.createdBy = S.user.username || S.user.name || ''; }
      await api('upsert', { table: 'Receipts', rows: [rc] });
      LS.set('lastExpCat', cat);
      const i = (S.receipts || []).findIndex(x => x.id === rc.id); if (i >= 0) S.receipts[i] = { ...rc, _new: Date.now() }; else (S.receipts = S.receipts || []).push({ ...rc, _new: Date.now() }); rcLocalSave();
      busy(0); ov.remove(); toast(`บันทึกรายจ่าย ${baht(rc.total)} แล้ว`);
      if (isNew && rc.type === 'สินค้า' && (rc.fileUrl || rc.fileId) && await confirmDlg('เพิ่มสต๊อก/อัปเดตต้นทุนจากรายการในบิลนี้เลยไหม?', 'เพิ่มสต๊อกเลย')) return stockFromBill(rc, done);
      done && done();
    } catch (e) { busy(0); toast(e.message, 1); }
  };
  const del = $('#del', ov); if (del) del.onclick = async () => { if (!(await confirmDlg('ลบรายจ่ายนี้?' + (r.stockApplied === 'Y' ? ' (สต๊อก/ต้นทุนที่อัปเดตไปแล้วจะไม่ย้อนกลับ)' : ''), 'ลบ', true))) return; try { busy(1); await api('remove', { table: 'Receipts', ids: [r.id] }); S.receipts = (S.receipts || []).filter(x => x.id !== r.id); rcLocalSave(); busy(0); ov.remove(); done && done(); } catch (e) { busy(0); toast(e.message, 1); } };
}
// เพิ่มสต๊อกจากบิลที่แนบไว้ในบัญชีรายจ่าย: อ่านรายการสินค้า (OCR) → จับคู่สินค้า → ใช้ฟอร์มตรวจใบเสร็จเดิม (บันทึกทับบิลเดิม ไม่สร้างซ้ำ)
async function stockFromBill(r, done) {
  try {
    if (!(r.fileUrl || r.fileId)) throw new Error('บิลนี้ยังไม่มีรูป');
    busy(1, 'กำลังอ่านรายการสินค้าจากบิล...');
    const o = /^data:/.test(r.fileUrl || '') ? await api('ocr', { base64: r.fileUrl, mime: 'image/jpeg' }) : await api('ocr', { fileId: r.fileId });
    const data = o.data ? { ...o.data, items: (o.data.items || []).map(i => ({ ...i })) } : parseReceiptText(o.text || '');
    if (!S.products.length) await loadProducts(true); buildIndex();
    const items = (data.items || []).map(it => { const m = matchProduct(it.name, it.code); return { name: it.name, code: it.code || '', qty: num(it.qty) || 1, unitCost: num(it.unitPrice) || (num(it.amount) / (num(it.qty) || 1)), amount: num(it.amount), sku: m ? m.p.sku : '', score: m ? m.score : 0, updateCost: !!m, addStock: !!m, createNew: false }; });
    busy(0);
    if (!items.length) toast('อ่านรายการสินค้าไม่ได้ — เพิ่มแถวเองได้', 1);
    receiptForm({ ...r, type: 'สินค้า', items: JSON.stringify(items), supplier: r.supplier || data.supplier || '', supplierTaxId: r.supplierTaxId || data.supplierTaxId || '', docNo: r.docNo || data.docNo || '', subtotal: r.subtotal || data.subtotal || '', vat: r.vat || data.vat || '', total: r.total || data.total || '', _raw: o.text || '', _engine: o.engine, _img: /^data:/.test(r.fileUrl || '') ? r.fileUrl : '', _done: done }, true);
  } catch (e) { busy(0); toast(e.message, 1); }
}

/* ---------- รายจ่ายประจำวัน (ผัก · น้ำแข็ง · ค่าแรง) — กดปุ่ม ใส่ยอด ✔ จบ · รูปแนบภายหลังได้ (ไม่บังคับ) ----------
   บันทึกลงบัญชีรายรับ-รายจ่าย (ตาราง Receipts) ทันทีในเครื่อง แล้วส่ง Google เบื้องหลัง · ไม่มีเน็ต = เข้าคิวส่งเอง */
const DailyExp = {
  P: [
    { k: 'veg', e: '🥬', n: 'ซื้อผัก/ของสด', find: /ผัก|ของสด/, color: '#2E7D32', pay: 'ask' },    // บางแผงโอน/สแกน (มีสลิป) บางแผงเงินสด → ถามทุกครั้ง
    { k: 'ice', e: '🧊', n: 'ค่าน้ำแข็ง', find: /น้ำแข็ง/, color: '#0288D1', pay: 'เงินสด' },       // คนส่งน้ำแข็งเทใส่ถัง จ่ายเงินสด
    { k: 'wage', e: '👷', n: 'ค่าจ้างพนักงาน', find: /ค่าจ้าง|ค่าแรง/, color: '#6D4C41', pay: 'เงินสด' }
  ],
  // ใช้หมวดที่ร้านมีอยู่แล้ว (เช่น "ค่าน้ำแข็ง ซื้อมาขาย") ถ้าไม่มีสร้างใหม่และปักหมุดไว้
  async cat(p) {
    const L = ExpCats.list(); let c = L.find(x => p.find.test(x.n));
    if (!c) { c = { n: p.n, e: p.e, pin: true }; L.push(c); try { await ExpCats.save(L); } catch (e) { } }
    return c.n;
  },
  q() { return LS.get('dexpQ', []); },
  async flush() {
    if (this.busy) return; const Q = this.q(); if (!Q.length) return; this.busy = true;
    try { await api('upsert', { table: 'Receipts', rows: Q }); const ids = new Set(Q.map(r => r.id)); LS.set('dexpQ', this.q().filter(r => !ids.has(r.id))); }
    catch (e) { clearTimeout(this.t); this.t = setTimeout(() => this.flush(), 20000); }
    this.busy = false; this.refresh();
  },
  today(p, cn) { const t = todayISO(); return (S.receipts || []).filter(r => String(r.date).slice(0, 10) === t && (r.cat === cn || r.dexp === p.k)); },
  month(cn) { const m = todayISO().slice(0, 7); return (S.receipts || []).filter(r => String(r.date).slice(0, 7) === m && r.cat === cn).reduce((a, r) => a + num(r.total), 0); },
  async add(p, extra) {
    const cn = await this.cat(p), last = LS.get('dexpLast', {}), key = p.k + (extra && extra.who ? ':' + extra.who : '');
    const save = (v, pay, who) => {
      const rc = { id: uid('R'), date: todayISO(), type: 'ค่าใช้จ่าย', cat: cn, total: String(v), supplier: who || '', payMethod: pay, note: p.k === 'wage' && who ? 'ค่าจ้างรายวัน ' + who : '', items: '[]', createdAt: new Date().toISOString(), createdBy: S.user.username || S.user.name || '' };
      (S.receipts = S.receipts || []).push({ ...rc, _new: Date.now() }); window.rcLocalSave && rcLocalSave();
      LS.set('dexpQ', this.q().concat([rc])); last[key] = v; LS.set('dexpLast', last);
      this.refresh(); this.flush(); return rc;
    };
    keypad(`${p.e} ${esc(p.n)}${extra && extra.who ? ' · ' + esc(extra.who) : ''}`, last[key] || '', v => {
      if (!num(v)) return toast('ใส่จำนวนเงิน', 1);
      if (p.pay !== 'ask') { save(v, p.pay, extra && extra.who); return toast(`✔ ${p.n} ${baht(v)} · ${p.pay} บันทึกแล้ว`); }
      this.payAsk(p, cn, v, save);
    }, { sub: `วันนี้ ${thDate(todayISO())} · หมวด "${esc(cn)}"${p.pay !== 'ask' ? ' · ' + p.pay : ''}${last[key] ? ' · ครั้งก่อน ' + baht(last[key]) : ''}`, replace: true, okLabel: p.pay === 'ask' ? 'ถัดไป ›' : '✔ บันทึก' });
  },
  // ซื้อผัก: เลือกแผง (ไม่บังคับ) + จ่ายเงินสด / โอน-สแกน (เปิดกล้องถ่ายสลิปให้ทันที)
  payAsk(p, cn, v, save) {
    const vend = [...new Set((S.receipts || []).filter(r => r.cat === cn && r.supplier).sort((a, b) => String(b.createdAt || b.date).localeCompare(a.createdAt || a.date)).map(r => r.supplier))].slice(0, 6);
    let who = LS.get('dexpVend', '') || '';
    const ov = sheet(`${p.e} ${esc(p.n)} ${baht(v)}`, `
      <div class="small muted" style="margin-bottom:6px">ซื้อจากแผงไหน (ไม่ใส่ก็ได้)</div>
      <div class="chips" id="vd" style="margin-bottom:6px">${vend.map(n => `<button class="chip${n === who ? ' on' : ''}" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <input class="in" id="vn" placeholder="ชื่อแผง / แม่ค้า" maxlength="40" value="${esc(vend.includes(who) ? '' : who)}">
      <div class="small muted" style="margin:14px 0 6px">จ่ายด้วย</div>
      <div class="dx-pay"><button class="btn" id="pc" style="background:#2E7D32">💵 เงินสด</button><button class="btn" id="pt" style="background:#1565C0">📱 โอน / สแกน<small>ถ่ายสลิปแนบ</small></button></div>`, '', { cls: 'dxp' });
    $$('[data-v]', ov).forEach(b => b.onclick = () => { who = b.dataset.v; $('#vn', ov).value = ''; $$('[data-v]', ov).forEach(x => x.classList.toggle('on', x === b)); });
    const name = () => ($('#vn', ov).value.trim() || who || '').trim();
    $('#pc', ov).onclick = () => { const n = name(); LS.set('dexpVend', n); ov.remove(); save(v, 'เงินสด', n); toast(`✔ ${p.n} ${baht(v)} · เงินสด บันทึกแล้ว`); };
    $('#pt', ov).onclick = () => { const n = name(); LS.set('dexpVend', n); ov.remove(); const rc = save(v, 'โอน/สแกน', n); toast(`✔ ${p.n} ${baht(v)} · โอน — ถ่ายสลิปได้เลย`); this.photo(rc.id); };
  },
  async wage() {
    let users = []; try { users = (await quick(loadTable('Users'), 1500, S.users || [])).filter(u => u.active !== 'N' && u.role !== 'owner'); } catch (e) { }
    const names = [...new Set(users.map(u => u.name || u.username).filter(Boolean))];
    const ov = sheet('👷 ค่าจ้างพนักงานวันนี้', `<div class="small muted" style="margin-bottom:10px">เลือกคนที่จ่าย แล้วใส่ยอด</div>
      <div class="dx-who">${names.map(n => `<button class="btn ghost" data-w="${esc(n)}">${esc(n)}</button>`).join('')}<button class="btn ghost" data-w="">ไม่ระบุชื่อ</button></div>
      <div class="row" style="gap:8px;margin-top:10px"><input class="in grow" id="wn" placeholder="หรือพิมพ์ชื่ออื่น" maxlength="40"><button class="btn" id="wok">ถัดไป</button></div>`);
    const go = who => { ov.remove(); this.add(this.P[2], { who: String(who || '').trim() }); };
    $$('[data-w]', ov).forEach(b => b.onclick = () => go(b.dataset.w));
    $('#wok', ov).onclick = () => go($('#wn', ov).value);
  },
  async photo(id) {
    const r = (S.receipts || []).find(x => x.id === id); if (!r) return;
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';   // เลือกจากคลังภาพได้ (สลิปโอนจากแอปธนาคาร) หรือถ่ายใหม่
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try { busy(1, 'กำลังแนบรูป...'); const im = await compressImage(f, 1400, .7); const up = await api('upload', { kind: 'receipt', name: `bill_${r.date}_${Date.now()}.jpg`, mime: im.mime, base64: im.dataUrl }); r.fileId = up.fileId || ''; r.fileUrl = up.fileUrl || ''; r._new = Date.now(); await api('upsert', { table: 'Receipts', rows: [{ ...r, _new: undefined }] }); window.rcLocalSave && rcLocalSave(); busy(0); toast('แนบรูปแล้ว'); this.refresh(); }
      catch (e) { busy(0); toast(e.offline ? 'ต้องต่อเน็ตเพื่อแนบรูป' : e.message, 1); }
    };
    inp.click();
  },
  boxes: new Set(),
  async mount(box) {
    if (!box) return; this.boxes.add(box); box.className = 'card dx';
    if (!S.receipts || !S.receipts.length) { try { if (window.rcLoad) await rcLoad(); } catch (e) { } }
    this.draw(box);
  },
  refresh() { this.boxes.forEach(b => { if (b.isConnected) this.draw(b); else this.boxes.delete(b); }); },
  draw(box) {
    const L = ExpCats.list(), cn = p => (L.find(x => p.find.test(x.n)) || { n: p.n }).n, pend = new Set(this.q().map(r => r.id));
    const rows = this.P.map(p => ({ p, c: cn(p), t: this.today(p, cn(p)) }));
    box.innerHTML = `<div class="row" style="margin-bottom:8px"><h3 class="grow">รายจ่ายประจำวัน</h3><span class="tiny muted">${thDate(todayISO())}</span></div>
      <div class="dx-g">${rows.map(({ p, t }) => { const s = t.reduce((a, r) => a + num(r.total), 0); return `<button class="dx-b${t.length ? ' done' : ''}" data-k="${p.k}" style="--c:${p.color}"><span class="ic">${p.e}</span><b>${esc(p.n)}</b><span class="v">${t.length ? '✓ ' + baht(s) : 'แตะเพื่อบันทึก'}</span></button>`; }).join('')}</div>
      ${rows.some(x => x.t.length) ? `<div class="dx-l">${rows.flatMap(({ p, t }) => t.map(r => `<div class="dx-r"><span>${p.e} ${esc(r.supplier || p.n)}</span><span class="tiny muted">${r.payMethod === 'โอน/สแกน' ? '📱 โอน' : '💵 สด'}</span><b>${baht(r.total)}</b>${pend.has(r.id) ? '<span class="tag amber" style="padding:0 6px">รอส่ง</span>' : ''}<button class="iconbtn" data-ph="${esc(r.id)}" title="แนบรูป">${r.fileUrl || r.fileId ? '🖼' : '📷'}</button></div>`)).join('')}</div>` : ''}
      <div class="tiny muted" style="margin-top:8px">เดือนนี้จ่าย: ${rows.map(({ p, c }) => `${p.e} ${baht(this.month(c))}`).join(' · ')}</div>
      <div id="dxc" class="dx-c"></div>`;
    this.compare($('#dxc', box), rows);
    $$('.dx-b', box).forEach(b => b.onclick = () => { const p = this.P.find(x => x.k === b.dataset.k); p.k === 'wage' ? this.wage() : this.add(p); });
    $$('[data-ph]', box).forEach(b => b.onclick = () => this.photo(b.dataset.ph));
  }
};
// ซื้อ เทียบ ขาย: 🥬 ซื้อผัก ↔ ขายของสด/ผัก/ผลไม้ · 🧊 ซื้อน้ำแข็ง ↔ ขายน้ำแข็ง (วันนี้ + เดือนนี้)
DailyExp.MATCH = {
  veg: { n: 'ผัก/ของสด', test: (nm, cat) => /ผัก|ผลไม้|ของสด|พริก|มะนาว|กะหล่ำ|แตง|มะเขือ|ต้นหอม|ผักชี|กระเทียม|หอมแดง|ข่า|ตะไคร้|ใบมะกรูด|ถั่วฝักยาว|ฟัก|บวบ|มะละกอ|กล้วย|ส้ม|มะม่วง|สับปะรด|ไข่ไก่|ไข่เป็ด/.test(nm + ' ' + cat) && !/น้ำแข็ง|ขนม|เครื่องดื่ม|น้ำผลไม้|กระป๋อง|ดอง|แห้ง|ทอด|อบ|ซอส|ผง/.test(nm + ' ' + cat) },
  ice: { n: 'น้ำแข็ง', test: (nm, cat) => /น้ำแข็ง/.test(nm) }
};
DailyExp.compare = async function (el, rows) {
  if (!el || !window.fetchOrders) return;
  const t = todayISO(), m0 = t.slice(0, 8) + '01';
  let R = []; try { R = await fetchOrders(m0, t); } catch (e) { return; }
  if (!el.isConnected) return;
  const sold = { veg: { d: 0, m: 0, items: {} }, ice: { d: 0, m: 0, items: {} } };
  R.forEach(o => { const sg = o.status === 'refund' ? -1 : 1, day = String(o.date).slice(0, 10) === t;
    (o._items || []).forEach(it => { if (it.pass) return; const p = IDX.bySku[it.sku] || {}, nm = String(it.name || p.name || ''), cat = String(p.category || it.cat || ''), amt = sg * Math.abs(num(it.qty)) * num(it.price);
      ['veg', 'ice'].forEach(k => { if (this.MATCH[k].test(nm, cat)) { sold[k].m += amt; if (day) sold[k].d += amt; sold[k].items[nm] = (sold[k].items[nm] || 0) + amt; } }); }); });
  const buy = k => { const r = rows.find(x => x.p.k === k), c = r ? r.c : ''; return { d: r ? r.t.reduce((a, x) => a + num(x.total), 0) : 0, m: this.month(c) }; };
  const cell = (s, b) => { if (!s && !b) return '<td class="muted">—</td>'; const g = s - b, pc = b ? Math.round(g / b * 100) : null; return `<td><div class="tiny muted">ขาย ${baht(s)} · ซื้อ ${baht(b)}</div><b style="color:${g >= 0 ? 'var(--green)' : 'var(--red)'}">${g >= 0 ? 'กำไร' : 'ขาดทุน'} ${baht(Math.abs(g))}</b>${pc != null ? ` <span class="tiny">(${pc > 0 ? '+' : ''}${pc}% จากทุน)</span>` : ''}</td>`; };
  el.innerHTML = `<table class="dx-t"><tr><th></th><th>วันนี้</th><th>เดือนนี้</th></tr>${['veg', 'ice'].map(k => { const b = buy(k), sv = sold[k], e = k === 'veg' ? '🥬' : '🧊'; return `<tr data-cx="${k}"><th>${e} ${this.MATCH[k].n} <span class="tiny muted">ⓘ</span></th>${cell(sv.d, b.d)}${cell(sv.m, b.m)}</tr>`; }).join('')}</table>
    <div class="tiny muted" style="margin-top:4px">กำไร = ยอดขายสินค้านั้น − เงินที่จ่ายซื้อ · % คิดจากเงินที่ซื้อ · รายวันขึ้นลงได้ (ซื้อวันนี้ ขายพรุ่งนี้) ดูเดือนนี้แม่นกว่า</div>`;
  $$('[data-cx]', el).forEach(tr => tr.onclick = () => { const k = tr.dataset.cx, it = Object.entries(sold[k].items).sort((a, b) => b[1] - a[1]);
    sheet(`${k === 'veg' ? '🥬' : '🧊'} นับเป็นยอดขาย${this.MATCH[k].n} (เดือนนี้)`, `<div class="small muted" style="margin-bottom:8px">ระบบนับจากชื่อสินค้า/หมวดที่มีคำว่า ${k === 'veg' ? 'ผัก ผลไม้ ของสด และชื่อผักผลไม้ทั่วไป (ไม่รวมของแปรรูป)' : 'น้ำแข็ง'} · ถ้าขายของสดด้วยปุ่ม "ระบุราคา" ให้ใช้ปุ่ม "ของสด ระบุ" ยอดจะนับตรง</div>
      <div class="list">${it.length ? it.map(([n, v]) => `<div class="item" style="cursor:default"><div class="grow">${esc(n)}</div><b>${baht(v)}</b></div>`).join('') : '<div class="empty">ยังไม่มียอดขายที่ตรง</div>'}</div>`); });
};
window.DailyExp = DailyExp;
addEventListener('online', () => DailyExp.flush()); setTimeout(() => DailyExp.flush(), 4000);
