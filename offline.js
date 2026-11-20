/* =========================================================
   โหมดออฟไลน์
   - สถานะเน็ต (Net) + ป้ายบอกบนจอ
   - เข้าระบบ/สลับพนักงานได้แม้ไม่มีเน็ต: เครื่องจำ "ตัวตรวจรหัส" ของคนที่เคยเข้าระบบเครื่องนี้แบบออนไลน์
     (เก็บเป็นค่า PBKDF2 ผูกกับเครื่องและผู้ใช้ ไม่ได้เก็บรหัสจริง)
   - อนุมัติด้วยรหัสเจ้าของแบบออฟไลน์ (ถ้าเจ้าของเคยเข้าระบบ/อนุมัติในเครื่องนี้)
   ========================================================= */
'use strict';
const Net = {
  ok: navigator.onLine !== false,
  set(v) {
    if (v === this.ok) return; this.ok = v;
    document.body.classList.toggle('offline', !v); this.paint();
    if (v) document.dispatchEvent(new Event('mm:online'));
  },
  paint() {
    $$('.netpill').forEach(p => p.innerHTML = this.ok ? '' : '<span class="tag" style="background:#FFC24B;color:#5A3A00;margin-right:4px">ออฟไลน์</span>');
    $$('.net').forEach(n => n.classList.toggle('off', !this.ok));
  }
};
addEventListener('online', () => { Net.ok = false; Net.set(true); });
addEventListener('offline', () => Net.set(false));
// ตรวจซ้ำทุก 30 วิ ตอนออฟไลน์ (บางเครื่องไม่แจ้ง event online)
setInterval(() => { if (!Net.ok && S.user && S.apiUrl && navigator.onLine !== false) apiRaw('ping', {}).catch(() => { }); }, 30000);
new MutationObserver(() => Net.paint()).observe(document.getElementById('app'), { childList: true });

const OfflineAuth = {
  ITER: 60000, MAX_DAYS: 30,
  get store() { return LS.get('offAuth', {}); },
  save(o) { LS.set('offAuth', o); },
  async derive(pin, salt) {
    if (!(window.crypto && crypto.subtle)) { let h = 0; const s = salt + '|' + pin; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return 'x' + h.toString(16); }
    const enc = new TextEncoder(), key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('maymart|' + S.device.id + '|' + salt), iterations: this.ITER }, key, 256);
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  },
  async remember(user, pin, token) {
    try { const o = this.store; o[user.id] = { user, token, v: await this.derive(pin, user.id), at: Date.now() }; this.save(o); if (user.role === 'owner') this.rememberOwnerPin(pin); } catch (e) { }
  },
  async rememberOwnerPin(pin) {
    try { const o = this.store; const v = await this.derive(pin, 'owner-approve'); const list = (o._owner || []).filter(x => x !== v); list.unshift(v); o._owner = list.slice(0, 3); this.save(o); } catch (e) { }
  },
  async checkOwnerPin(pin) { try { const v = await this.derive(pin, 'owner-approve'); return (this.store._owner || []).includes(v); } catch (e) { return false; } },
  async login(pin, username) {
    const o = this.store, now = Date.now();
    for (const id of Object.keys(o)) {
      if (id[0] === '_') continue; const e = o[id];
      if (now - e.at > this.MAX_DAYS * 864e5) continue;
      if (username && String(e.user.username).toLowerCase() !== username) continue;
      if (await this.derive(pin, id) === e.v) return { user: e.user, token: e.token, device: null, offline: true };
    }
    return null;
  },
  // ผู้ใช้ที่ถูกปิด/ลบ หรือเปลี่ยนสิทธิ์ → ลบออกจากเครื่อง (ทำทุกครั้งที่ออนไลน์)
  prune(active) {
    const o = this.store, map = {}; active.forEach(s => { const [id, role] = s.split(':'); map[id] = role; });
    let ch = false;
    Object.keys(o).forEach(id => { if (id[0] === '_') return; if (!(id in map)) { delete o[id]; ch = true; } else if (o[id].user.role !== map[id]) { o[id].user.role = map[id]; ch = true; } });
    if (!Object.values(map).includes('owner')) { delete o._owner; ch = true; }
    if (ch) this.save(o);
  },
  forget(id) { const o = this.store; delete o[id]; this.save(o); }
};
window.OfflineAuth = OfflineAuth; window.Net = Net;
// ขอให้เบราว์เซอร์เก็บข้อมูลถาวร (กันบิลค้างส่งถูกลบเมื่อพื้นที่เครื่องเหลือน้อย)
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
