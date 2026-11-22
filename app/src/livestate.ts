/** Oxirgi efir (jonli dars) haqida qurilmada saqlanadigan eslatma: ilova yopilib/ochilganda "Efirga qaytish" kartasi uchun. */
export interface LiveSaved { role: 'student' | 'teacher'; code: string; name?: string; title?: string; docId?: string; srv?: string; at: number }
const K = 'fur.live', TTL = 6 * 3600e3;
export function getLive(): LiveSaved | null {
  try { const v = JSON.parse(localStorage.getItem(K) || 'null') as LiveSaved | null; if (!v || typeof v.code !== 'string' || (v.role !== 'student' && v.role !== 'teacher') || Date.now() - v.at > TTL) return null; return v; } catch { return null; }
}
export function saveLive(p: Omit<LiveSaved, 'at'>): void {
  try { const cur = getLive(); const next: LiveSaved = cur && cur.code === p.code ? { ...cur, ...p, at: Date.now() } : { ...p, at: Date.now() }; localStorage.setItem(K, JSON.stringify(next)); } catch { /* */ }
}
let lastTouch = 0;
/** Efir davom etayotganini bildirib turadi (kamida 60 soniyada bir marta yoziladi). */
export function touchLive(): void { const t = Date.now(); if (t - lastTouch < 60000) return; lastTouch = t; const c = getLive(); if (c) { try { localStorage.setItem(K, JSON.stringify({ ...c, at: t })); } catch { /* */ } } }
export const clearLive = (): void => { try { localStorage.removeItem(K); } catch { /* */ } };
