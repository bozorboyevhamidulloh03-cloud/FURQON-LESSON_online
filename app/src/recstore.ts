/** Dars yozuvlari ombori.
 *  Android ilovasida: telefonning "Movies/FURQON Recordings" papkasiga avtomatik saqlanadi (RecStore.java), shu yerdan ilovada ko‘rsatiladi va o‘chiriladi.
 *  Brauzerda (kompyuter/PWA): brauzer xotirasida (IndexedDB) saqlanadi. */
export interface RecItem { id: string; title: string; ms: number; size: number; created: number; mime: string; src: 'phone' | 'browser' }
interface Native { recSaveBegin?(name: string, mime: string): string; recSaveChunk?(tok: string, b64: string): boolean; recSaveEnd?(tok: string, ok: boolean): string; recList?(): string; recDelete?(id: string): boolean; recShare?(id: string): void; recWhere?(): string; recShareLabel?(): string }
const nat = (): Native | undefined => (window as unknown as { FurNative?: Native }).FurNative;
export const phoneRecs = (): boolean => !!nat()?.recSaveBegin && !!nat()?.recList && !!nat()?.recDelete;
export const shareLabel = (): string => { try { return nat()?.recShareLabel?.() || (phoneRecs() ? 'Ulashish' : 'Yuklab olish'); } catch { return 'Ulashish'; } };
export const recWhere = (): string => { try { return phoneRecs() ? nat()!.recWhere?.() || 'Movies/FURQON Recordings' : 'brauzer xotirasi'; } catch { return ''; } };

const META = 'fur.recmeta';
type Meta = Record<string, { t: string; ms: number }>;
const getMeta = (): Meta => { try { return JSON.parse(localStorage.getItem(META) || '{}') as Meta; } catch { return {}; } };
const putMeta = (m: Meta) => { try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* */ } };

// ---- brauzer zaxirasi: IndexedDB ----
const idb = (): Promise<IDBDatabase> => new Promise((res, rej) => { const q = indexedDB.open('fur-recs', 1); q.onupgradeneeded = () => { q.result.createObjectStore('recs', { keyPath: 'id' }); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const idbDo = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => { const db = await idb(); return new Promise((res, rej) => { const r = f(db.transaction('recs', mode).objectStore('recs')); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
interface Stored extends RecItem { blob: Blob }

const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Dars';
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
const readB64 = (b: Blob) => new Promise<string>((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1] ?? ''); f.onerror = () => rej(f.error); f.readAsDataURL(b); });

/** Yozuvni saqlaydi. Telefonda — papkaga bo‘laklab (xotirani to‘ldirmasdan) yozadi. */
export async function saveRecording(blob: Blob, title: string, ms: number, onProgress?: (p: number) => void): Promise<RecItem> {
  const mime = (blob.type || 'video/webm').split(';')[0], ext = mime.includes('mp4') ? 'mp4' : 'webm', name = `${safe(title)} — ${stamp()}.${ext}`, n = nat();
  if (phoneRecs() && n) {
    const tok = n.recSaveBegin!(name, mime);
    if (tok) {
      const CH = 3 * 512 * 1024; let ok = true;
      for (let off = 0; off < blob.size && ok; off += CH) { ok = !!n.recSaveChunk!(tok, await readB64(blob.slice(off, off + CH))); onProgress?.(Math.min(1, (off + CH) / blob.size)); }
      const r = n.recSaveEnd!(tok, ok);
      if (ok && r) { const j = JSON.parse(r) as { id: string; size: number }, m = getMeta(); m[j.id] = { t: title, ms }; putMeta(m); return { id: j.id, title, ms, size: j.size || blob.size, created: Date.now(), mime, src: 'phone' }; }
    }
    throw new Error('Telefon xotirasiga yozib bo‘lmadi (joy yetarli emasmi?)');
  }
  const it: Stored = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, ms, size: blob.size, created: Date.now(), mime, src: 'browser', blob };
  await idbDo('readwrite', s => s.put(it)); const { blob: _b, ...meta } = it; void _b; return meta;
}

export async function listRecordings(): Promise<RecItem[]> {
  const out: RecItem[] = [], m = getMeta(), n = nat();
  if (phoneRecs() && n) {
    try {
      for (const j of JSON.parse(n.recList!()) as { id: string; name: string; size: number; date: number; mime: string }[]) {
        const mm = m[j.id]; out.push({ id: j.id, title: mm?.t ?? j.name.replace(/\.(webm|mp4)$/i, '').replace(/ — \d{4}-\d\d-\d\d \d\d-\d\d$/, ''), ms: mm?.ms ?? 0, size: j.size, created: j.date, mime: j.mime || 'video/webm', src: 'phone' });
      }
    } catch { /* */ }
  }
  try { const all = (await idbDo('readonly', s => s.getAll())) as Stored[]; for (const r of all) { const { blob: _b, ...meta } = r; void _b; out.push(meta); } } catch { /* */ }
  return out.sort((a, b) => b.created - a.created);
}

export async function deleteRecording(it: RecItem): Promise<boolean> {
  if (it.src === 'phone') { const ok = !!nat()?.recDelete?.(it.id); if (ok) { const m = getMeta(); delete m[it.id]; putMeta(m); } return ok; }
  await idbDo('readwrite', s => s.delete(it.id)); return true;
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** Pleyer uchun manba: telefonda — ilovaning ichki manzili (Range qo‘llab-quvvatlanadi), brauzerda — blob URL (revoke() ni chaqiring). */
export async function recSource(it: RecItem): Promise<{ url: string; revoke(): void }> {
  if (it.src === 'phone') return { url: `/__rec/${b64url(it.id)}.${it.mime.includes('mp4') ? 'mp4' : 'webm'}`, revoke() { /* */ } };
  const s = (await idbDo('readonly', st => st.get(it.id))) as Stored | undefined; if (!s) throw new Error('Yozuv topilmadi');
  const u = URL.createObjectURL(s.blob); return { url: u, revoke: () => URL.revokeObjectURL(u) };
}

/** Telefonda: ulashish oynasi (Telegram va h.k.). Brauzerda: faylni yuklab olish. */
export async function shareRecording(it: RecItem): Promise<void> {
  if (it.src === 'phone') { nat()?.recShare?.(it.id); return; }
  const s = (await idbDo('readonly', st => st.get(it.id))) as Stored | undefined; if (!s) return;
  const a = document.createElement('a'), u = URL.createObjectURL(s.blob); a.href = u; a.download = `${safe(it.title)} — ${stamp(new Date(it.created))}.${it.mime.includes('mp4') ? 'mp4' : 'webm'}`; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 3000);
}
export function setRecMeta(id: string, ms: number): void { const m = getMeta(); if (m[id]) { m[id].ms = ms; putMeta(m); } }
