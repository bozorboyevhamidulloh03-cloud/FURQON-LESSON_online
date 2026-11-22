import { FurDocument, FurError, PageType, newDocument, newPage, parseFur, serializeFur, uid } from '../../packages/fur-format/src/index';
import { mountPageGrid, GridHandle } from './pagegrid';
import { mountEditor, EditorHandle } from './editor';
import { mountBoard, BoardHandle } from './board';
import { startPresentation } from './present';
import { startTeacher, joinClass, probeLive, TeacherSession } from './classroom';
import { getLive, saveLive, touchLive, clearLive } from './livestate';
import { RecItem, saveRecording, listRecordings, deleteRecording, recSource, shareRecording, recWhere, phoneRecs, shareLabel } from './recstore';
import { startRecorder, recSupported, Rec } from './recorder';
import { makeFrames, FrameCtl } from './recframe';
import { PresentHandle } from './present';
import { fmtCode, customBroker, setCustomBroker, BROKERS } from './room';
import { sniff, importPdf, importPdfText, importDocx, importImage } from './importers';
import * as db from './db';
import { initTheme, getSettings, setSettings, ACCENTS, effectiveMode, Settings } from './theme';
import type { DocMeta, Folder } from './db';

type Section = 'all' | 'recent' | 'fav' | 'trash' | 'rec';
type Sort = 'modified' | 'name' | 'size';
interface Session { meta: DocMeta; doc: FurDocument; status: 'saved' | 'dirty' | 'saving' | 'error'; savedAt: number; recT: number; saveT: number; recovery: { savedAt: number; data: Uint8Array } | null }
const S = { section: 'all' as Section, folderId: null as string | null, q: '', sort: 'modified' as Sort, metas: [] as DocMeta[], folders: [] as Folder[],
  view: 'home' as 'home' | 'doc' | 'edit', pageIdx: 0, editor: null as EditorHandle | null, grid: null as GridHandle | null, pview: ((): 'grid' | 'list' => { try { return localStorage.getItem('fur.pview') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } })(), ses: null as Session | null, menu: null as string | null, est: null as { usage: number; quota: number } | null, err: '', recs: [] as RecItem[], sel: null as Set<string> | null };
const root = document.getElementById('app')!;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const I = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  vid: I('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'), share: I('<circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8 11l8-4M8 13l8 4"/>'),
  refresh: I('<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  live: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="2.5"/><path d="M7.5 7.5a6.4 6.4 0 000 9M16.5 7.5a6.4 6.4 0 010 9M4.5 4.5a10.6 10.6 0 000 15M19.5 4.5a10.6 10.6 0 010 15"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>',
  home: I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'), clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), star: I('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'), plus: I('<path d="M12 5v14M5 12h14"/>'), folder: I('<path d="M3 6a2 2 0 012-2h4l2 3h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  upload: I('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'), more: I('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'), back: I('<path d="M15 5l-7 7 7 7"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>'), moon: I('<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>'), search: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'), download: I('<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'),
  board: I('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 14l3-4 3 3 2-2 3 3"/>'), doc: I('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'), up: I('<path d="M12 19V5M6 11l6-6 6 6"/>'), down: I('<path d="M12 5v14M6 13l6 6 6-6"/>'),
};
const fmtSize = (n: number) => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
function ago(t: number): string {
  const d = Date.now() - t, m = Math.floor(d / 60000);
  if (m < 1) return 'hozirgina'; if (m < 60) return m + ' daq oldin'; const h = Math.floor(m / 60); if (h < 24) return h + ' soat oldin';
  const dd = Math.floor(h / 24); if (dd < 7) return dd + ' kun oldin'; return new Date(t).toLocaleDateString('uz');
}
const hhmm = (t: number) => new Date(t).toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ---------- dialoglar va xabarlar ----------
// eski Android WebView'lar uchun kichik zaxiralar
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function (this: Blob) { return new Response(this).arrayBuffer(); };
let toastT = 0;
function toast(msg: string, bad = false) {
  let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = window.setTimeout(() => t!.classList.remove('show'), 3200);
}
window.addEventListener('error', e => { try { toast('Xato: ' + (e.message || 'noma’lum'), true); } catch { /* */ } });
window.addEventListener('unhandledrejection', e => { try { const r = e.reason as { message?: string } | undefined; toast('Xato: ' + (r?.message || String(e.reason)), true); } catch { /* */ } });
function modal<T>(html: string, onMount: (box: HTMLElement, done: (v: T | null) => void) => void): Promise<T | null> {
  return new Promise(res => {
    const ov = document.createElement('div'); ov.className = 'ov'; ov.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">${html}</div>`; document.body.append(ov); document.body.classList.add('modal-open');
    const done = (v: T | null) => { ov.remove(); if (!document.querySelector('.ov')) document.body.classList.remove('modal-open'); document.removeEventListener('keydown', key); res(v); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', key); ov.addEventListener('mousedown', e => { if (e.target === ov) done(null); });
    onMount(ov.querySelector('.dlg') as HTMLElement, done);
  });
}
const askText = (title: string, value = '', ok = 'Saqlash') => modal<string>(`<h3>${esc(title)}</h3><input class="txt" value="${esc(value)}" maxlength="120"><div class="row"><button class="btn" data-x="0">Bekor</button><button class="btn pri" data-x="1">${ok}</button></div>`, (b, done) => {
  const i = b.querySelector('input')!; i.focus(); i.select();
  const go = () => { const v = i.value.trim(); done(v || null); };
  i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  b.querySelector('[data-x="1"]')!.addEventListener('click', go); b.querySelector('[data-x="0"]')!.addEventListener('click', () => done(null));
});
const confirmBox = (title: string, text: string, ok: string) => modal<boolean>(`<h3>${esc(title)}</h3><p class="mut">${esc(text)}</p><div class="row"><button class="btn" data-x="0">Bekor</button><button class="btn dng" data-x="1">${esc(ok)}</button></div>`, (b, done) => {
  b.querySelector('[data-x="1"]')!.addEventListener('click', () => done(true)); b.querySelector('[data-x="0"]')!.addEventListener('click', () => done(null));
});
const pickFolder = () => modal<string>(`<h3>Papkaga ko‘chirish</h3><div class="plist"><button class="pitem" data-f="">${IC.home}<span>Asosiy (papkasiz)</span></button>${S.folders.map(f => `<button class="pitem" data-f="${f.id}">${IC.folder}<span>${esc(f.name)}</span></button>`).join('')}</div><div class="row"><button class="btn" data-x="0">Bekor</button></div>`, (b, done) => {
  b.querySelectorAll<HTMLElement>('[data-f]').forEach(e => e.addEventListener('click', () => done(e.dataset.f ?? ''))); b.querySelector('[data-x="0"]')!.addEventListener('click', () => done(null));
});

// ---------- ma'lumot ----------
async function refresh() { [S.metas, S.folders, S.est] = await Promise.all([db.listMeta(), db.listFolders(), db.storageEstimate()]); }
function metaFor(id: string, doc: FurDocument, size: number, prev?: DocMeta): DocMeta {
  const boards = doc.pages.filter(p => p.type === 'board').length, now = Date.now();
  return { id, title: doc.title, folderId: prev?.folderId ?? S.folderId, favorite: prev?.favorite ?? false, deletedAt: null, created: prev?.created ?? doc.created, modified: now, openedAt: prev?.openedAt ?? now, size, pages: doc.pages.length, boards, docs: doc.pages.length - boards };
}
async function storeNew(doc: FurDocument, prev?: DocMeta): Promise<DocMeta> {
  const bytes = await serializeFur(doc); const m = metaFor(prev?.id ?? uid('d'), doc, bytes.length, prev); await db.saveDoc(m, bytes); return m;
}
async function createDoc() {
  const t = await askText('Yangi dars nomi', 'Nomsiz dars', 'Yaratish'); if (!t) return;
  const m = await storeNew(newDocument(t)); await refresh(); await openDoc(m.id);
}
async function createFolder() {
  const t = await askText('Yangi papka nomi', '', 'Yaratish'); if (!t) return;
  await db.putFolder({ id: uid('f'), name: t, parentId: S.folderId, created: Date.now() }); await refresh(); render();
}
async function importFiles(files: FileList | File[]): Promise<DocMeta[]> {
  let n = 0, pdfMode: 'img' | 'text' | null = null; const made: DocMeta[] = [];
  for (const f of Array.from(files)) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer()), kind = sniff(bytes, f.name);
      if (kind === 'pdf' || kind === 'docx' || kind === 'image') {
        const prog = (m: string) => toast(m);
        if (kind === 'pdf' && !pdfMode) { pdfMode = await modal<'img' | 'text'>(`<h3>PDF qanday import qilinsin?</h3><div class="choose"><button class="opt" data-v="img"><b>Sahifa rasmi (doska)</b><span>Har bet aynan o‘zidek ko‘rinadi, ustiga yozish va chizish mumkin. Matn tahrirlanmaydi. Skaner PDF uchun ham ishlaydi.</span></button><button class="opt" data-v="text"><b>Tahrirlanadigan matn</b><span>Matn, ro‘yxat, rang va rasmlar hujjat bloklariga ajratiladi. Murakkab jadval/grafiklar soddalashishi mumkin.</span></button></div><div class="row"><button class="btn" data-v="">Bekor qilish</button></div>`, (box, done) => { box.querySelectorAll<HTMLElement>('[data-v]').forEach(b => b.addEventListener('click', () => done((b.dataset.v || null) as any))); }); if (!pdfMode) continue; }
        const doc = kind === 'pdf' ? (pdfMode === 'text' ? await importPdfText(bytes, f.name, prog) : await importPdf(bytes, f.name, prog)) : kind === 'docx' ? await importDocx(bytes, f.name, prog) : await importImage(bytes, f.name);
        made.push(await storeNew(doc)); n++; const w = (doc as any).__warn as number | undefined;
        toast(`"${doc.title}" ${kind === 'pdf' ? 'PDF' : kind === 'docx' ? 'Word' : 'rasm'} import qilindi (${doc.pages.length} sahifa)${(doc as any).__note ? ' · ' + (doc as any).__note : ''}${w ? ` · ${w} ta element o‘tkazib yuborildi` : ''}`); continue;
      }
      if (kind === 'unknown' && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new FurError('UNSUPPORTED_VERSION', 'Qo‘llab-quvvatlanmaydigan fayl (.fur, .pdf, .docx yoki rasm bo‘lsin)');
      const r = await parseFur(bytes); made.push(await storeNew(r.doc)); n++;
      toast(r.migrated ? `"${r.doc.title}" ochildi (format ${r.sourceVersion} → 1.1 ga o‘tkazildi)` : `"${r.doc.title}" import qilindi`);
    } catch (e) { toast(`${f.name}: ${e instanceof FurError ? e.message : 'o‘qib bo‘lmadi'}`, true); }
  }
  if (n) { await refresh(); render(); }
  return made;
}
interface FurNativeApi { saveFile(name: string, mime: string, b64: string, last: boolean): void; version(): string; checkUpdate(): void; openExternal(u: string): void; incomingList?(): string; incomingChunk?(id: number, off: number, len: number): string; incomingDone?(id: number): void }
const native = (): FurNativeApi | null => (window as unknown as { FurNative?: FurNativeApi }).FurNative ?? null;
function download(bytes: Uint8Array, name: string, ext = '.fur', mime = 'application/octet-stream') {
  const fname = name.replace(/[\\/:*?"<>|]/g, '_') + ext, nat = native();
  if (nat) { // Android ilovasi: blob yuklab olish ishlamaydi, fayl mahalliy "Saqlash" oynasi orqali yoziladi
    const CH = 3 * 256 * 1024; for (let i = 0; i < bytes.length; i += CH) { let bin = ''; const part = bytes.subarray(i, i + CH); for (let k = 0; k < part.length; k += 8192) bin += String.fromCharCode(...part.subarray(k, k + 8192)); nat.saveFile(fname, mime, btoa(bin), i + CH >= bytes.length); }
    if (!bytes.length) nat.saveFile(fname, mime, '', true); return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
  a.download = fname; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}
const sheet = (title: string, items: [string, string, boolean?][]) => modal<string>(`<h3>${esc(title)}</h3><div class="sheetl">${items.map(([k, t, d]) => `<button class="sbtn ${d ? 'dng' : ''}" data-k="${k}">${t}</button>`).join('')}</div><div class="row"><button class="btn" data-k="">Yopish</button></div>`, (b, done) => b.querySelectorAll<HTMLElement>('[data-k]').forEach(x => x.addEventListener('click', () => done(x.dataset.k || null))));
async function openMenu(id: string) {
  const m = S.metas.find(x => x.id === id); if (!m) return;
  const items: [string, string, boolean?][] = m.deletedAt ? [['restore', 'Tiklash'], ['purge', 'Butunlay o‘chirish', true]] : [['open', 'Ochish'], ['rename', 'Nomini o‘zgartirish'], ['dup', 'Nusxa olish'], ['move', 'Papkaga ko‘chirish'], ['export', 'Eksport (.fur)'], ['trash', 'Savatga tashlash'], ['purge', 'Butunlay o‘chirish', true]];
  const k = await sheet(m.title, items); if (k) await menuAction(k, id);
}
async function menuAction(act: string, id: string) {
  const m = S.metas.find(x => x.id === id); if (!m) return; S.menu = null;
  if (act === 'open') return openDoc(id);
  if (act === 'fav') { await db.putMeta({ ...m, favorite: !m.favorite }); }
  else if (act === 'rename') { const t = await askText('Nomini o‘zgartirish', m.title); if (!t) return render(); const b = (await db.getBlob(id))!; const r = await parseFur(b); r.doc.title = t; const nb = await serializeFur(r.doc); await db.saveDoc({ ...m, title: t, size: nb.length, modified: Date.now() }, nb); }
  else if (act === 'dup') { const r = await parseFur((await db.getBlob(id))!); r.doc.title = m.title + ' (nusxa)'; const nm = await storeNew(r.doc); await db.putMeta({ ...nm, folderId: m.folderId }); toast('Nusxa yaratildi'); }
  else if (act === 'move') { const f = await pickFolder(); if (f === null) return render(); await db.putMeta({ ...m, folderId: f || null }); }
  else if (act === 'export') { download((await db.getBlob(id))!, m.title); toast('Eksport qilindi: ' + m.title + '.fur'); return render(); }
  else if (act === 'trash') { await db.putMeta({ ...m, deletedAt: Date.now() }); toast('"' + m.title + '" savatga tashlandi'); }
  else if (act === 'restore') { await db.putMeta({ ...m, deletedAt: null }); }
  else if (act === 'purge') { if (!(await confirmBox('Butunlay o‘chirish', `"${m.title}" qayta tiklanmaydi.`, 'Butunlay o‘chirish'))) return render(); await db.deleteDoc(id); toast('"' + m.title + '" butunlay o‘chirildi'); }
  await refresh(); render();
}

// ---------- hujjat sessiyasi ----------
async function openDoc(id: string) {
  const m = await db.getMeta(id), blob = await db.getBlob(id); if (!m || !blob) return toast('Hujjat topilmadi', true);
  try {
    const { doc } = await parseFur(blob); const rec = await db.getRecovery(id);
    S.ses = { meta: { ...m, openedAt: Date.now() }, doc, status: 'saved', savedAt: m.modified, recT: 0, saveT: 0, recovery: rec && rec.savedAt > m.modified ? { savedAt: rec.savedAt, data: rec.data } : null };
    await db.putMeta(S.ses.meta); S.view = 'doc'; S.err = ''; render();
  } catch (e) { toast(e instanceof FurError ? 'Fayl ochilmadi: ' + e.message : 'Fayl ochilmadi', true); }
}
function changed() {
  if (live && S.view === 'edit') live.touch(S.pageIdx);
  const s = S.ses!; s.status = 'dirty'; updateStatus();
  clearTimeout(s.recT); clearTimeout(s.saveT);
  s.recT = window.setTimeout(async () => { try { await db.putRecovery({ id: s.meta.id, data: await serializeFur(s.doc), savedAt: Date.now() }); } catch { /* recovery best-effort */ } }, 250);
  s.saveT = window.setTimeout(() => void persist(), 1500);
}
async function persist() {
  const s = S.ses; if (!s) return; s.status = 'saving'; updateStatus();
  try {
    s.doc.modified = Date.now(); const bytes = await serializeFur(s.doc); s.meta = { ...metaFor(s.meta.id, s.doc, bytes.length, s.meta), modified: s.doc.modified };
    await db.saveDoc(s.meta, bytes); await db.clearRecovery(s.meta.id); s.status = 'saved'; s.savedAt = s.doc.modified;
  } catch { s.status = 'error'; toast('Saqlab bo‘lmadi: xotira to‘lgan bo‘lishi mumkin. Faylni eksport qiling', true); }
  updateStatus();
}
function updateStatus() {
  const s = S.ses, el = document.getElementById('status'); if (!s || !el) return;
  const t = { saved: `Saqlandi · ${hhmm(s.savedAt)}`, dirty: 'O‘zgarishlar bor…', saving: 'Saqlanmoqda…', error: 'Saqlanmadi' }[s.status];
  el.className = 'chip ' + s.status; el.textContent = t;
}
async function closeDoc() { if (live) endLive(); if (RM.rec) void recStop(); if (S.editor) { S.editor.destroy(); S.editor = null; } const s = S.ses; if (s && s.status !== 'saved') { clearTimeout(s.saveT); clearTimeout(s.recT); await persist(); } S.ses = null; S.view = 'home'; await refresh(); render(); }
async function sesAction(act: string, arg?: string) {
  const s = S.ses!;
  if (act === 'addboard' || act === 'adddoc') { const t: PageType = act === 'addboard' ? 'board' : 'document'; s.doc.pages.push(newPage(t, '')); }
  else if (act === 'delpage') { if (s.doc.pages.length < 2) return toast('Kamida bitta sahifa qolishi kerak', true); s.doc.pages.splice(Number(arg), 1); }
  else if (act === 'up' || act === 'down') { const i = Number(arg), j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= s.doc.pages.length) return; [s.doc.pages[i], s.doc.pages[j]] = [s.doc.pages[j], s.doc.pages[i]]; }
  else if (act === 'moveto') { const [a, b] = (arg ?? '').split(':').map(Number), n = s.doc.pages.length; if (!(a >= 0 && a < n && b >= 0 && b < n) || a === b) return; const [pp] = s.doc.pages.splice(a, 1); s.doc.pages.splice(b, 0, pp); }
  else if (act === 'live') return void liveDialog();
  else if (act === 'present') return present(0);
  else if (act === 'export') { await persist(); download(await serializeFur(s.doc), s.doc.title); return toast('Eksport qilindi'); }
  else if (act === 'recover') { if (s.recovery) { const r = await parseFur(s.recovery.data); s.doc = r.doc; s.recovery = null; toast('Saqlanmagan o‘zgarishlar tiklandi'); changed(); render(); } return; }
  else if (act === 'discard') { await db.clearRecovery(s.meta.id); s.recovery = null; render(); return; }
  changed(); render();
}

// ---------- ko'rinish ----------
function thumb(m: DocMeta) {
  const pages = Math.min(3, m.pages), kind = m.docs > m.boards ? 'doc' : 'board';
  const lines = kind === 'doc' ? '<path d="M18 22h28M18 30h28M18 38h20" stroke="var(--line2)" stroke-width="2.5" stroke-linecap="round"/>' : '<path d="M14 40l10-12 8 8 8-10 10 14" stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  let s = ''; for (let i = pages - 1; i >= 0; i--) s += `<rect x="${12 + i * 7}" y="${10 - i * 3}" width="52" height="56" rx="6" fill="var(--card)" stroke="var(--line)"/>`;
  return `<svg viewBox="0 0 88 76" class="thumbsvg" aria-hidden="true"><g>${s}<g transform="translate(${12 + (pages - 1) * 7 - 4},${10 - (pages - 1) * 3 - 6})">${lines}</g></g></svg>`;
}
function visibleDocs(): DocMeta[] {
  let l = S.metas.filter(m => S.section === 'trash' ? m.deletedAt : !m.deletedAt); const q = S.q.trim().toLowerCase();
  if (q) l = l.filter(m => m.title.toLowerCase().includes(q));
  else if (S.section === 'all') l = l.filter(m => m.folderId === S.folderId);
  else if (S.section === 'fav') l = l.filter(m => m.favorite);
  else if (S.section === 'recent') l = [...l].sort((a, b) => b.openedAt - a.openedAt).slice(0, 12);
  if (S.section !== 'recent') l.sort((a, b) => S.sort === 'name' ? a.title.localeCompare(b.title, 'uz') : S.sort === 'size' ? b.size - a.size : b.modified - a.modified);
  return l;
}
function card(m: DocMeta): string {
  const trash = S.section === 'trash', on = !!S.sel?.has(m.id);
  return `<article class="card ${on ? 'sel' : ''}" data-id="${m.id}" tabindex="0"><div class="thumb">${thumb(m)}<img class="fbadge" src="fur-file.svg" alt=".fur" width="34" height="34">${S.sel ? `<span class="chk ${on ? 'on' : ''}"></span>` : ''}</div><div class="cinfo"><h3 title="${esc(m.title)}">${esc(m.title)}</h3><p>${m.pages} sahifa · ${fmtSize(m.size)}</p><p class="mut">${trash ? 'O‘chirilgan: ' + ago(m.deletedAt!) : ago(m.modified)}</p></div>
  ${trash ? '' : `<button class="ib star ${m.favorite ? 'on' : ''}" data-act="fav" aria-label="Sevimli">${IC.star}</button>`}<button class="ib more" data-act="menu" aria-label="Amallar">${IC.more}</button></article>`;
}
function home(): string {
  const live = S.metas.filter(m => !m.deletedAt), trashN = S.metas.length - live.length, favN = live.filter(m => m.favorite).length;
  const nav = (k: Section, ic: string, t: string, n?: number) => `<button class="nav ${S.section === k && !S.q ? 'on' : ''}" data-nav="${k}">${ic}<span>${t}</span>${n ? `<em>${n}</em>` : ''}</button>`;
  const docs = visibleDocs(), showFolders = S.section === 'all' && !S.q ? S.folders.filter(f => f.parentId === S.folderId) : [];
  const crumbs: Folder[] = []; for (let f = S.folders.find(x => x.id === S.folderId); f; f = S.folders.find(x => x.id === f!.parentId)) crumbs.unshift(f);
  const est = S.est, pct = est && est.quota ? Math.max(1, Math.min(100, Math.round(est.usage / est.quota * 100))) : 0;
  const titles: Record<Section, string> = { all: 'Barcha darslar', recent: 'So‘nggi ochilganlar', fav: 'Sevimlilar', trash: 'O‘chirilganlar', rec: 'Dars yozuvlari' };
  const empty = S.q ? `<div class="empty"><h2>Hech narsa topilmadi</h2><p>"${esc(S.q)}" bo‘yicha darslar yo‘q.</p></div>`
    : S.section === 'trash' ? `<div class="empty"><h2>Savat bo‘sh</h2><p>O‘chirilgan darslar shu yerda turadi va tiklanishi mumkin.</p></div>`
    : S.section === 'fav' ? `<div class="empty"><h2>Sevimlilar yo‘q</h2><p>Dars kartochkasidagi yulduzchani bosing.</p></div>`
    : `<div class="empty"><svg viewBox="0 0 120 90" width="120" aria-hidden="true"><rect x="22" y="14" width="64" height="66" rx="8" fill="var(--card)" stroke="var(--line)"/><rect x="34" y="6" width="64" height="66" rx="8" fill="var(--card)" stroke="var(--line)"/><path d="M46 30h40M46 42h40M46 54h24" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></svg><h2>Birinchi darsingizni yarating</h2><p>Hujjat va doskadan iborat dars bitta .fur faylda saqlanadi. Hammasi shu qurilmada, akkauntsiz.</p></div>`;
  return `<div class="shell"><aside class="side"><div class="brand"><img class="logoimg" src="icon-96.png" alt="" width="34" height="34"><b>FURQON</b><small>Online</small></div>
  <nav>${nav('all', IC.home, 'Darslar', live.length)}${nav('recent', IC.clock, 'So‘nggi')}${nav('fav', IC.star, 'Sevimlilar', favN)}${nav('rec', IC.vid, 'Yozuvlar', S.recs.length)}${nav('trash', IC.trash, 'O‘chirilganlar', trashN)}</nav>
  <div class="grow"></div><div class="stor"><div class="bar"><i style="width:${pct}%"></i></div><small>${est ? `${fmtSize(est.usage)} ishlatilgan` : 'Xotira'}${est?.quota ? ` · ${fmtSize(est.quota)} dan` : ''}</small></div>
  <button class="nav" data-act="theme">${IC.moon}<span>${effectiveMode() === 'dark' ? 'Yorug‘ rejim' : 'Qorong‘i rejim'}</span></button><button class="nav" data-act="settings">${IC.gear}<span>Sozlamalar</span></button><button class="nav upd" data-act="update" title="${esc(updTitle())}">${IC.refresh}<span>Yangilanishni tekshirish</span></button></aside>
  <main><header class="top"><label class="search">${IC.search}<input id="q" placeholder="Darslarni qidirish" value="${esc(S.q)}"></label>
  <select id="sort" aria-label="Saralash"><option value="modified" ${S.sort === 'modified' ? 'selected' : ''}>Oxirgi o‘zgarish</option><option value="name" ${S.sort === 'name' ? 'selected' : ''}>Nomi bo‘yicha</option><option value="size" ${S.sort === 'size' ? 'selected' : ''}>Hajmi bo‘yicha</option></select>${S.section === 'trash' && trashN ? '<button class="btn dng" data-act="emptytrash">Savatni bo‘shatish</button>' : ''}${S.section === 'rec' ? (S.recs.length ? `<button class="btn ${S.sel ? 'pri' : ''}" data-act="seltoggle">${S.sel ? 'Bekor' : 'Tanlash'}</button>` : '') : (docs.length ? `<button class="btn ${S.sel ? 'pri' : ''}" data-act="seltoggle">${S.sel ? 'Bekor' : 'Tanlash'}</button>` : '')}
  </header>
  <section class="content">${liveCardHtml()}${S.section === 'all' && !S.q && !S.folderId ? dash(live.length, favN, est?.usage ?? 0) : S.section === 'all' && !S.q ? qaRow() : ''}<div class="crumb">${S.section === 'all' && !S.q ? `<button data-folder="">Darslar</button>${crumbs.map(c => `<span>/</span><button data-folder="${c.id}">${esc(c.name)}</button>`).join('')}` : `<b>${S.q ? 'Qidiruv natijalari' : titles[S.section]}</b>`}</div>
  ${showFolders.length ? `<div class="folders">${showFolders.map(f => `<button class="fold" data-folder="${f.id}">${IC.folder}<span>${esc(f.name)}</span><em>${S.metas.filter(m => m.folderId === f.id && !m.deletedAt).length}</em></button>`).join('')}</div>` : ''}
  ${S.section === 'rec' ? recSection() : docs.length ? `<div class="grid">${docs.map(card).join('')}</div>` : showFolders.length ? '' : empty}</section></main></div>${selBar()}`;
}
// ---------- tanlash va ko‘plab o‘chirish ----------
function selBar(): string {
  if (!S.sel) return ''; const n = S.sel.size, rec = S.section === 'rec', trash = S.section === 'trash';
  const b = (a: string, t: string, c = '') => `<button class="btn ${c}" data-act="${a}" ${n ? '' : 'disabled'}>${t}</button>`;
  return `<div class="selbar"><b>${n} ta tanlandi</b><button class="btn" data-act="selall">Hammasi</button>${rec ? b('bulk:recdel', 'O‘chirish', 'dng') : trash ? b('bulk:restore', 'Tiklash') + b('bulk:purge', 'Butunlay o‘chirish', 'dng') : b('bulk:trash', 'Savatga') + b('bulk:purge', 'Butunlay o‘chirish', 'dng')}<button class="btn" data-act="selcancel">Bekor</button></div>`;
}
function keepScroll(fn: () => void) { const c = document.querySelector('.content'), y = window.scrollY, t = c?.scrollTop ?? 0; fn(); const c2 = document.querySelector('.content'); if (c2) c2.scrollTop = t; window.scrollTo(0, y); }
const recList = () => { const q = S.q.trim().toLowerCase(); return S.recs.filter(r => !q || r.title.toLowerCase().includes(q)); };
async function bulk(act: string) {
  const ids = [...(S.sel ?? [])]; if (!ids.length) return;
  if (act === 'purge') { if (!(await confirmBox('Butunlay o‘chirish', `${ids.length} ta dars qayta tiklanmaydi.`, 'Butunlay o‘chirish'))) return; for (const id of ids) await db.deleteDoc(id); toast(`${ids.length} ta dars butunlay o‘chirildi`); }
  else if (act === 'trash') { for (const id of ids) { const m = S.metas.find(x => x.id === id); if (m) await db.putMeta({ ...m, deletedAt: Date.now() }); } toast(`${ids.length} ta dars savatga tashlandi`); }
  else if (act === 'restore') { for (const id of ids) { const m = S.metas.find(x => x.id === id); if (m) await db.putMeta({ ...m, deletedAt: null }); } toast(`${ids.length} ta dars tiklandi`); }
  else if (act === 'recdel') {
    if (!(await confirmBox('Yozuvlarni o‘chirish', `${ids.length} ta yozuv ${phoneRecs() ? 'telefondan' : 'xotiradan'} butunlay o‘chadi va tiklanmaydi.`, 'Butunlay o‘chirish'))) return;
    let ok = 0; for (const id of ids) { const it = S.recs.find(x => x.id === id); if (it && (await deleteRecording(it))) ok++; } S.recs = await listRecordings(); toast(`${ok} ta yozuv o‘chirildi — joy bo‘shadi`, ok !== ids.length);
  }
  S.sel = null; await refresh(); render();
}
async function emptyTrash() {
  const ids = S.metas.filter(m => m.deletedAt).map(m => m.id); if (!ids.length) return;
  if (!(await confirmBox('Savatni bo‘shatish', `${ids.length} ta dars butunlay o‘chadi va tiklanmaydi.`, 'Bo‘shatish'))) return;
  for (const id of ids) await db.deleteDoc(id); toast('Savat bo‘shatildi'); await refresh(); render();
}

// ---------- dars yozuvlari ----------
const MON = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
const fmtDate = (t: number) => { const d = new Date(t), z = (n: number) => String(n).padStart(2, '0'); return `${d.getDate()}-${MON[d.getMonth()]}, ${z(d.getHours())}:${z(d.getMinutes())}`; };
function recSection(): string {
  const list = recList(), total = S.recs.reduce((a, r) => a + r.size, 0), q = S.q.trim();
  const head = `<div class="recbar"><b>${S.recs.length} ta yozuv · ${fmtSize(total)}</b><small class="mut">Saqlanadigan joy: ${esc(recWhere())}</small></div>`;
  if (!list.length) return head + `<div class="empty"><h2>${q ? 'Hech narsa topilmadi' : 'Hali yozuv yo‘q'}</h2><p>Jonli dars yoki taqdimot paytida ● tugmasi bilan yozib oling. Yozuv tugagach avtomatik ${phoneRecs() ? 'telefonning “' + esc(recWhere()) + '” papkasiga' : 'brauzer xotirasiga'} saqlanadi va shu yerda ko‘rinadi.</p></div>`;
  return head + `<div class="reclist">${list.map(r => { const on = !!S.sel?.has(r.id); return `<article class="rrow ${on ? 'sel' : ''}" data-rid="${esc(r.id)}" tabindex="0">${S.sel ? `<span class="chk ${on ? 'on' : ''}"></span>` : ''}<div class="rthumb">${IC.play}</div><div class="rinf"><h3 title="${esc(r.title)}">${esc(r.title)}</h3><p>${fmtDate(r.created)} · ${r.ms ? fmtDur(r.ms) + ' · ' : ''}${fmtSize(r.size)}</p></div><button class="ib" data-act="rshare" aria-label="${shareLabel()}" title="${shareLabel()}">${IC.share}</button><button class="ib dng" data-act="rdel" aria-label="O‘chirish" title="Telefondan butunlay o‘chirish">${IC.trash}</button></article>`; }).join('')}</div>`;
}
async function refreshRecs() { try { S.recs = await listRecordings(); } catch { /* */ } if (S.view === 'home') keepScroll(render); }
async function delRec(it: RecItem): Promise<void> {
  if (!(await confirmBox('Yozuvni o‘chirish', `“${it.title}” ${it.src === 'phone' ? 'telefondan' : 'brauzer xotirasidan'} butunlay o‘chiriladi va tiklanmaydi.`, 'Butunlay o‘chirish'))) return;
  const ok = await deleteRecording(it); S.recs = await listRecordings(); toast(ok ? `Yozuv o‘chirildi (${fmtSize(it.size)} bo‘shadi)` : 'O‘chirib bo‘lmadi', !ok); if (S.view === 'home') keepScroll(render);
}
async function playRec(id: string) {
  const it = S.recs.find(x => x.id === id); if (!it) return; let src: { url: string; revoke(): void };
  try { src = await recSource(it); } catch (e) { return void toast((e as Error).message, true); }
  const sp = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const r = await modal<string>(`<h3 class="rtitle" title="${esc(it.title)}">${esc(it.title)}</h3><video class="recvid" controls playsinline preload="metadata" src="${esc(src.url)}"></video><div class="speeds"><button class="chip" data-sk="-10">⟲ 10s</button>${sp.map(x => `<button class="chip ${x === 1 ? 'on' : ''}" data-sp="${x}">${x}×</button>`).join('')}<button class="chip" data-sk="10">10s ⟳</button></div><p class="mut small">${fmtDate(it.created)} · ${it.ms ? fmtDur(it.ms) + ' · ' : ''}${fmtSize(it.size)}</p><div class="row"><button class="btn" data-x="share">${shareLabel()}</button><button class="btn dng" data-x="del">O‘chirish</button><button class="btn pri" data-x="close">Yopish</button></div>`, (b, done) => {
    const v = b.querySelector('video')!;
    // MediaRecorder yozuvlarida davomiylik sarlavhada bo‘lmaydi — surish ishlashi uchun bir marta oxirigacha “o‘tkazib” olamiz
    v.addEventListener('loadedmetadata', () => { if (!isFinite(v.duration)) { const back = () => { v.removeEventListener('timeupdate', back); v.currentTime = 0; }; v.addEventListener('timeupdate', back); v.currentTime = 1e101; } });
    v.addEventListener('error', () => toast('Videoni ochib bo‘lmadi', true));
    b.querySelectorAll<HTMLElement>('[data-sp]').forEach(x => x.addEventListener('click', () => { v.playbackRate = Number(x.dataset.sp); b.querySelectorAll('[data-sp]').forEach(y => y.classList.toggle('on', y === x)); }));
    b.querySelectorAll<HTMLElement>('[data-sk]').forEach(x => x.addEventListener('click', () => { v.currentTime = Math.max(0, v.currentTime + Number(x.dataset.sk)); }));
    b.querySelector('[data-x="share"]')!.addEventListener('click', () => void shareRecording(it));
    b.querySelector('[data-x="del"]')!.addEventListener('click', () => done('del')); b.querySelector('[data-x="close"]')!.addEventListener('click', () => done(null));
  });
  src.revoke(); if (r === 'del') await delRec(it);
}

// ---------- “Efirga qaytish” kartasi ----------
let liveSt: 'checking' | 'live' | 'none' | null = null, liveProbeAt = 0, probing = false, inClass = false;
function liveCardHtml(): string {
  if (S.view !== 'home') return ''; const sv = getLive(); if (!sv || live || inClass) return '';
  const teacher = sv.role === 'teacher', st = teacher ? 'Siz o‘tkazayotgan efir' : liveSt === 'live' ? 'Efir davom etmoqda' : liveSt === 'none' ? 'Efir tugagan bo‘lishi mumkin' : 'Efir tekshirilmoqda…';
  return `<div class="livecard ${teacher || liveSt === 'live' ? 'on' : ''}"><i class="pulse"></i><div class="lcinf"><b>${st}</b><small>${esc(sv.title || 'Jonli dars')}${sv.name && !teacher ? ' · ' + esc(sv.name) : ''}</small></div><button class="btn pri" data-act="resumelive">${teacher ? 'Davom ettirish' : 'Qo‘shilish'}</button><button class="ib" data-act="dismisslive" aria-label="Yopish" title="Kartani yopish">✕</button></div>`;
}
async function probeSaved(force = false) {
  const sv = getLive(); if (!sv || sv.role !== 'student' || inClass || probing || S.view !== 'home' || document.hidden) return;
  if (!force && Date.now() - liveProbeAt < 20000) return;
  probing = true; liveProbeAt = Date.now(); if (!liveSt) { liveSt = 'checking'; keepScroll(render); }
  const r = await probeLive(sv.code, sv.srv).catch(() => 'none' as const); probing = false;
  if (r === 'ended') { clearLive(); liveSt = null; } else liveSt = r;
  if (S.view === 'home') keepScroll(render);
}
async function resumeLive() {
  const sv = getLive(); if (!sv) return;
  if (sv.role === 'student') {
    let nm = sv.name || ''; try { nm = nm || localStorage.getItem('fur.name') || ''; } catch { /* */ }
    try { setCustomBroker(sv.srv ?? ''); inClass = true; await joinClass(sv.code, nm || 'O‘quvchi', why => { inClass = false; if (why !== 'exit') toast(why); render(); void probeSaved(true); }); render(); }
    catch (e) { inClass = false; toast('Qo‘shilib bo‘lmadi: ' + (e as Error).message, true); render(); }
  } else {
    if (!sv.docId || !S.metas.some(m => m.id === sv.docId && !m.deletedAt)) { clearLive(); render(); return void toast('Efir hujjati topilmadi', true); }
    try { await openDoc(sv.docId); setCustomBroker(sv.srv ?? ''); live = await beginTeacher(sv.code); updatePill(); toast('Efir davom ettirildi — o‘quvchilar avtomatik qaytadi'); }
    catch (e) { live = null; toast('Efirni davom ettirib bo‘lmadi: ' + (e as Error).message, true); }
  }
}
async function beginTeacher(resume?: string): Promise<TeacherSession> {
  const L = await startTeacher(() => S.ses?.doc ?? null, () => (S.view === 'edit' ? S.pageIdx : 0), refreshRoster, n => toast(`✋ ${n} qo‘l ko‘tardi`), i => { if (S.view === 'edit' && S.pageIdx === i) (S.editor as unknown as BoardHandle | null)?.refresh?.(); }, resume);
  if (S.ses) saveLive({ role: 'teacher', code: L.code, docId: S.ses.meta.id, title: S.ses.doc.title, srv: customBroker() });
  return L;
}

function qaRow(): string {
  return `<div class="qa"><button data-act="new"><i>${IC.doc}</i><b>Yangi dars</b><small>Hujjat + doska</small></button><button data-act="join"><i>${IC.live}</i><b>Darsga qo‘shilish</b><small>Kod bilan kirish</small></button><button data-act="import"><i>${IC.upload}</i><b>Import</b><small>.fur · PDF · DOCX · rasm</small></button><button data-act="newfolder"><i>${IC.folder}</i><b>Yangi papka</b><small>Darslarni tartiblash</small></button></div>`;
}
function dash(n: number, fav: number, usage: number): string {
  const pages = S.metas.filter(m => !m.deletedAt).reduce((a, m) => a + m.pages, 0);
  return `<div class="hero"><div><h1>FURQON <span>Online</span></h1><p>Bilim — kelajak kaliti. Hujjat va doskadan iborat darsni bitta .fur faylda yarating, o‘tkazing va yozib oling.</p></div><img class="fur3d" src="fur-file.svg" alt="" width="132" height="132"></div>
  <div class="sec-h">Tezkor amallar</div>${qaRow()}
  <div class="stats"><div class="stat"><small>Darslar</small><b>${n}</b></div><div class="stat"><small>Sahifalar</small><b>${pages}</b></div><div class="stat"><small>Sevimlilar</small><b>${fav}</b></div><div class="stat"><small>Xotira</small><b>${fmtSize(usage)}</b></div></div>
  <div class="sec-h">${n ? 'Darslarim' : 'Boshlash'}</div>`;
}
function settingsDialog() {
  let tab: 'look' | 'ui' | 'acc' = 'look';
  void modal<null>('', (box, done) => {
    const draw = () => {
      const st: Settings = getSettings();
      const seg = (k: string, opts: [string, string][], cur: string) => `<div class="seg" role="group">${opts.map(([v, t]) => `<button data-s="${k}:${v}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${t}</button>`).join('')}</div>`;
      const look = `<h4>Ko‘rinish</h4><div class="set-row"><span class="l">Mavzu rejimi</span>${seg('mode', [['dark', 'Qorong‘i'], ['light', 'Yorug‘'], ['auto', 'Avtomatik']], st.mode)}</div>
        <div class="set-row"><span class="l">Dizayn (aksent rangi)</span><div class="themes">${ACCENTS.map(a => `<button data-s="accent:${a.id}" data-v="${a.id}" class="${st.accent === a.id && !st.custom ? 'on' : ''}"><i></i>${a.name}</button>`).join('')}</div></div>
        <div class="set-row"><label for="cacc">O‘z aksent rangingiz</label><div style="display:flex;gap:10px;align-items:center"><input type="color" id="cacc" value="${st.custom || ACCENTS.find(a => a.id === st.accent)!.c}"><button class="btn" data-s="custom:">Standartga qaytarish</button></div></div>
        <div class="set-row"><label for="gl">Shisha shaffofligi: <b>${st.glass}%</b></label><input type="range" id="gl" min="20" max="100" step="2" value="${st.glass}"></div><div class="set-prev"><b>Namuna</b><p class="mut" style="margin:4px 0 0">Shaffoflik oshganda panellar ko‘proq “shishadek” bo‘ladi; 100% — deyarli zich.</p></div>`;
      const ui = `<h4>Interfeys</h4><div class="set-row"><span class="l">Animatsiyalar</span>${seg('motion', [['auto', 'Tizim bo‘yicha'], ['on', 'Yoqilgan'], ['off', 'O‘chirilgan']], st.motion)}</div>
        <div class="tog"><span>Ixcham interfeys<br><small class="mut">Tugma va bo‘shliqlar kichikroq</small></span><input type="checkbox" id="cmp" ${st.compact ? 'checked' : ''}></div>`;
      const nm = (() => { try { return localStorage.getItem('fur.name') || ''; } catch { return ''; } })();
      const acc = `<h4>Hisob</h4><div class="set-row"><label for="nm">Jonli darsdagi ismingiz</label><input class="txt" id="nm" value="${esc(nm)}" maxlength="40" placeholder="Ism"></div><div class="set-row"><label for="br">Jonli dars serveri (ixtiyoriy)</label><input class="txt" id="br" value="${esc(customBroker())}" placeholder="bo‘sh = bepul ommaviy server"></div><p class="mut small">Ma’lumotlar faqat shu qurilmada saqlanadi.</p>`;
      box.classList.add('settings');
      box.innerHTML = `<nav class="set-nav" aria-label="Sozlamalar bo‘limlari"><h3>SOZLAMALAR</h3><button data-t="look" class="${tab === 'look' ? 'on' : ''}">Ko‘rinish</button><button data-t="ui" class="${tab === 'ui' ? 'on' : ''}">Interfeys</button><button data-t="acc" class="${tab === 'acc' ? 'on' : ''}">Hisob va jonli dars</button><div class="grow"></div><button data-t="x">Yopish</button></nav><div class="set-body">${tab === 'look' ? look : tab === 'ui' ? ui : acc}</div>`;
    };
    draw();
    box.addEventListener('click', e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t],[data-s]'); if (!t) return;
      if (t.dataset.t) { if (t.dataset.t === 'x') return done(null); tab = t.dataset.t as typeof tab; return draw(); }
      const [k, v] = t.dataset.s!.split(':'); if (k === 'accent') setSettings({ accent: v as Settings['accent'], custom: '' }); else if (k === 'custom') setSettings({ custom: '' }); else setSettings({ [k]: v } as Partial<Settings>); draw();
    });
    box.addEventListener('input', e => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'gl') { setSettings({ glass: Number(t.value) }); const l = box.querySelector('label[for=gl] b'); if (l) l.textContent = t.value + '%'; }
      else if (t.id === 'cacc') setSettings({ custom: t.value });
      else if (t.id === 'nm') { try { localStorage.setItem('fur.name', t.value.trim()); } catch { /* */ } }
      else if (t.id === 'br') setCustomBroker(t.value.trim());
    });
    box.addEventListener('change', e => { const t = e.target as HTMLInputElement; if (t.id === 'cmp') setSettings({ compact: t.checked }); });
  });
}
function docView(): string {
  const s = S.ses!;
  const rec = s.recovery ? `<div class="banner"><b>Saqlanmagan o‘zgarishlar topildi</b><span>${ago(s.recovery.savedAt)} saqlangan nusxa bor (ilova kutilmaganda yopilgan).</span><div><button class="btn pri" data-sa="recover">Tiklash</button><button class="btn" data-sa="discard">Tashlab yuborish</button></div></div>` : '';
  const pages = s.doc.pages.map((p, i) => `<article class="pg openable" data-open="${i}"><div class="pgthumb ${p.type}">${p.type === 'board' ? IC.board : IC.doc}</div><div class="pginfo"><b>${i + 1}-sahifa</b><span>${p.type === 'board' ? 'Doska' : 'Hujjat'} · ${p.type === 'board' ? p.objects.length + ' obyekt' : p.blocks.length + ' blok'}</span></div>
  <button class="btn" data-open="${i}">Tahrirlash</button><div class="pgact"><button class="ib" data-sa="up:${i}" aria-label="Yuqoriga" ${i === 0 ? 'disabled' : ''}>${IC.up}</button><button class="ib" data-sa="down:${i}" aria-label="Pastga" ${i === s.doc.pages.length - 1 ? 'disabled' : ''}>${IC.down}</button><button class="ib dng" data-sa="delpage:${i}" aria-label="O‘chirish">${IC.trash}</button></div></article>`).join('');
  return `<div class="docv"><header class="top"><button class="ib" data-act="back" aria-label="Orqaga">${IC.back}</button><input id="title" class="ttl" value="${esc(s.doc.title)}" maxlength="120" aria-label="Dars nomi"><span id="status" class="chip saved"></span>
  <button class="btn" data-sa="live">${IC.live}<span>Jonli dars</span></button><button class="btn pri" data-sa="present">${IC.play}<span>Taqdimot</span></button><button class="btn" data-sa="export">${IC.download}<span>Eksport</span></button></header>${rec}
  <section class="content narrow"><div class="meta">${s.doc.pages.length} sahifa · ${fmtSize(s.meta.size)} · yaratilgan ${new Date(s.doc.created).toLocaleDateString('uz')}</div><div class="vtog" role="group" aria-label="Ko‘rinish"><button class="${S.pview === 'grid' ? 'on' : ''}" data-act="pview:grid">${IC.board}<span>To‘r</span></button><button class="${S.pview === 'list' ? 'on' : ''}" data-act="pview:list">${IC.doc}<span>Ro‘yxat</span></button></div>${S.pview === 'grid' ? '<div id="pgridhost"></div>' : `<div class="plist2">${pages}</div>`}
  <div class="addrow"><button class="btn" data-sa="addboard">${IC.board}<span>Doska sahifasi qo‘shish</span></button><button class="btn" data-sa="adddoc">${IC.doc}<span>Hujjat sahifasi qo‘shish</span></button></div>
  <div class="note"><b>Eslatma:</b> sahifani bosing: hujjat sahifasi muharrirda, doska sahifasi doskada ochiladi.</div></section></div>`;
}
function editView(): string {
  const s = S.ses!, n = s.doc.pages.length, i = S.pageIdx;
  return `<div class="docv"><header class="top"><button class="ib" data-act="pages" aria-label="Sahifalar" title="Sahifalar">${IC.back}</button><input id="title" class="ttl" value="${esc(s.doc.title)}" maxlength="120" aria-label="Dars nomi"><span id="status" class="chip saved"></span>
  <button class="ib" data-act="present" aria-label="Taqdimot" title="Taqdimot">${IC.play}</button><button class="ib" data-act="prevpage" aria-label="Oldingi sahifa" ${i === 0 ? 'disabled' : ''}>${IC.back}</button><span class="pgno">${i + 1}/${n}</span><button class="ib flip" data-act="nextpage" aria-label="Keyingi sahifa" ${i === n - 1 ? 'disabled' : ''}>${IC.back}</button></header><div id="editor" class="editor ${s.doc.pages[i].type}"></div></div>`;
}
let loadedVer = '', updBusy = false;
void fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(j => { loadedVer = String(j.web ?? ''); }).catch(() => { /* */ });
const updTitle = () => native() ? nativeVer() : loadedVer ? `Joriy versiya: ${loadedVer}` : 'Yangilanishni tekshirish';
async function checkUpdate() {
  if (native()) { native()!.checkUpdate(); return; }
  if (updBusy) return; updBusy = true;
  try {
    if (!navigator.onLine) throw new Error('offline');
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(), v = String(j.web ?? '');
    if (loadedVer && v && v !== loadedVer) { const reg = await navigator.serviceWorker?.getRegistration?.(); await reg?.update().catch(() => { /* */ }); toast(`Yangi versiya topildi (${v}). Qayta yuklanmoqda…`); setTimeout(() => location.reload(), 900); }
    else toast('Eng so‘nggi versiya o‘rnatilgan' + (v ? ` (${v})` : '') + ' ✓');
  } catch { toast('Yangilanishni tekshirib bo‘lmadi. Internetni tekshiring.', true); } finally { updBusy = false; }
}
function nativeVer(): string { try { const v = JSON.parse(native()?.version() ?? '{}'); return `Versiya: web ${v.web}, APK ${v.apk}`; } catch { return 'Yangilanishni tekshirish'; } }
// ---------- jonli dars ----------
let live: TeacherSession | null = null;
function updatePill() {
  let el = document.getElementById('livepill'); if (!live) return el?.remove();
  if (!el) { el = document.createElement('button'); el.id = 'livepill'; el.className = 'livepill'; el.addEventListener('click', () => void liveDialog()); document.body.append(el); }
  const r = live.roster(), h = r.filter(x => x.hand).length; el.classList.toggle('bad', !live.up());
  el.innerHTML = `<i></i>${live.up() ? 'Jonli' : 'Aloqa yo‘q'} · ${r.length}${h ? ` · ✋${h}` : ''}`;
}
const ics = (d: string, sz = 20) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICL = {
  mic: ics('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'), cam: ics('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'), pen: ics('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
  rec: ics('<circle cx="12" cy="12" r="6" fill="currentColor"/>'), pause: ics('<path d="M8 5v14M16 5v14"/>'), play: ics('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'), stop: ics('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
  copy: ics('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>'), x: ics('<path d="M6 6l12 12M18 6L6 18"/>'), users: ics('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3.2 3.2 0 010 5.6M18 14.8c2 .6 3.5 2.3 3.5 5.2"/>'),
};
function refreshRoster() {
  updatePill(); const ul = document.getElementById('rost'); if (!ul || !live) return; const r = live.roster();
  const mm = live.media.supported, tg = (x: { id: string }, k: string, on: boolean, ic: string, t: string) => `<button class="tg ${on ? 'on' : ''}" data-pm="${esc(x.id)}:${k}" aria-pressed="${on}" title="${t}" aria-label="${t}">${ic}</button>`;
  ul.innerHTML = r.length ? r.map(x => `<li class="rl ${x.hand ? 'hand' : ''}"><span class="av">${esc((x.name || '?').trim().charAt(0).toUpperCase())}</span><span class="rn">${esc(x.name)}<small>${[x.hand ? '✋ qo‘l ko‘tardi' : '', x.mic ? 'gapiryapti' : '', x.cam ? 'kamerada' : ''].filter(Boolean).join(' · ') || 'qatnashmoqda'}</small></span><span class="rtg">${mm ? tg(x, 'mic', !!x.aMic, ICL.mic, 'Mikrofon ruxsati') + tg(x, 'cam', !!x.aCam, ICL.cam, 'Kamera ruxsati') : ''}${tg(x, 'wr', !!x.aWr, ICL.pen, 'Doskaga yozish ruxsati')}</span></li>`).join('') : '<li class="rl empty-r">Hali hech kim qo‘shilmadi. Kodni o‘quvchilarga yuboring.</li>';
  const c = document.getElementById('rcount'); if (c) c.textContent = String(r.length);
}
/** Dialogdagi mikrofon/kamera/yozuv kartalarining holatini yangilaydi (dialog ochiq bo‘lsa) */
function recDialogUi() {
  const box = document.getElementById('ldrec'); const r = RM.rec;
  if (box) box.innerHTML = r
    ? `<div class="recrow"><span class="recdot ${r.paused() ? 'p' : ''}"></span><b class="rect">${fmtDur(r.elapsed())}</b><span class="mut small">${r.paused() ? 'Pauzada' : 'Yozilmoqda'}</span><span class="grow"></span><button class="tg" data-r="pause" title="${r.paused() ? 'Davom ettirish' : 'Pauza'}" aria-label="Pauza">${r.paused() ? ICL.play : ICL.pause}</button><button class="btn pri sm" data-r="stop">${ICL.stop}<span>Saqlash</span></button></div>`
    : `<button class="tgl wide" data-r="start">${ICL.rec}<b>Yozib olishni boshlash</b><small>Faqat o‘quvchi ko‘radigan sahifa + ovoz. Boshqa ilovaga chiqsangiz ham, tahrirlashga o‘tsangiz ham davom etadi.</small></button>`;
  const ck = document.getElementById('recst') as HTMLInputElement | null; if (ck) ck.checked = RM.students;
  if (live) { for (const k of ['mic', 'cam'] as const) { const b = document.querySelector<HTMLElement>(`[data-m=${k}]`); if (b) { const on = k === 'mic' ? live.media.mic() : live.media.cam(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); const sm = b.querySelector('small'); if (sm) sm.textContent = on ? 'Yoqilgan' : 'O‘chiq'; } } }
}
function endLive() { live?.end(); live = null; clearLive(); liveSt = null; updatePill(); toast('Jonli dars tugatildi'); if (RM.rec) void recStop(); }
async function liveDialog() {
  if (!live) {
    let srvVal = '', autoRec = false;
    const v = await modal<string>(`<h3>Jonli darsni boshlash</h3><p class="mut">Hozir ochiq turgan dars o‘quvchilarga real vaqtda ko‘rinadi. Ma’lumot shifrlangan holda bepul ommaviy server orqali o‘tadi, ro‘yxatdan o‘tish kerak emas.</p><label class="lbl">Server (ixtiyoriy)<input id="srv" placeholder="bo‘sh = bepul ommaviy server · yoki ws://192.168.1.5:8883" value="${esc(customBroker())}"></label>${recSupported() ? '<label class="ck"><input type="checkbox" id="autorec"> Dars boshlanishi bilan yozib olishni ham boshlash</label>' : ''}<div class="row"><button class="btn" data-v="">Bekor qilish</button><button class="btn pri" data-v="go">Boshlash</button></div>`, (box, done) => {
      box.querySelectorAll<HTMLElement>('[data-v]').forEach(b => b.addEventListener('click', () => { srvVal = box.querySelector<HTMLInputElement>('#srv')!.value; autoRec = !!box.querySelector<HTMLInputElement>('#autorec')?.checked; done(b.dataset.v || null); }));
    });
    if (v !== 'go') return; toast('Server qidirilmoqda…');
    const srv = srvVal;
    try {
      setCustomBroker((srv ?? '').trim());
      live = await beginTeacher();
      updatePill(); if (autoRec) void recStart();
    } catch (e) { live = null; return void toast('Jonli dars boshlanmadi: ' + (e as Error).message, true); }
  }
  const L = live!; const host = L.broker.replace(/^wss?:\/\//, '').replace(/[:/].*$/, ''), mm = L.media.supported;
  const chip = (k: string, ic: string, t: string) => `<button class="chip" data-m="${k}">${ic}<span>${t}</span></button>`;
  void modal<string>(`<div class="ld-h"><div><h3>Jonli dars</h3><span class="ld-st"><i></i>Dars davom etmoqda</span></div><button class="ib" data-v="done" aria-label="Yopish" title="Yopish">${ICL.x}</button></div>
  <div class="ld-body"><div class="ld-col">
    <section class="ld-card"><small class="mut">O‘quvchilar ilovada <b>“Darsga qo‘shilish”</b> ni bosib shu kodni kiritadi</small><div class="bigcode" id="bcode">${fmtCode(L.code)}</div><div class="ld-row"><button class="btn" data-v="copy">${ICL.copy}<span>Kodni nusxalash</span></button></div><small class="mut">Server: ${esc(host)} · xabarlar shifrlangan</small></section>
    ${mm ? `<section class="ld-card"><h4>Mening ovozim va videom</h4><div class="ld-tgs"><button class="tgl" data-m="mic" aria-pressed="false">${ICL.mic}<b>Mikrofon</b><small>O‘chiq</small></button><button class="tgl" data-m="cam" aria-pressed="false">${ICL.cam}<b>Kamera</b><small>O‘chiq</small></button></div></section>` : '<section class="ld-card"><small class="mut">Bu qurilmada ovoz/video qo‘llab-quvvatlanmaydi.</small></section>'}
    ${recSupported() ? `<section class="ld-card"><h4>Yozib olish</h4><div id="ldrec"></div><label class="ck"><input type="checkbox" id="recst" checked> O‘quvchilar ovozini ham yozish</label></section>` : ''}
  </div><div class="ld-col"><section class="ld-card"><h4>${ICL.users}<span>Qatnashuvchilar</span><span class="cnt" id="rcount">0</span></h4>
    ${mm ? `<div class="ld-bulk">${chip('allmic', ICL.mic, 'Hammaga mikrofon')}${chip('allcam', ICL.cam, 'Hammaga kamera')}${chip('allwr', ICL.pen, 'Hammaga yozish')}${chip('none', ICL.x, 'Hammasini olish')}</div>` : `<div class="ld-bulk">${chip('allwr', ICL.pen, 'Hammaga yozish')}${chip('none', ICL.x, 'Hammasini olish')}</div>`}
    <ul class="rost" id="rost"></ul><p class="mut small">Tugmalar — o‘quvchiga ruxsat: mikrofon, kamera, doskaga yozish. Istalgan payt qaytarib olinadi.</p></section></div></div>
  <div class="ld-f"><button class="btn dng" data-v="end">Darsni tugatish</button><button class="btn pri" data-v="done">Yopish</button></div>`, (box, done) => {
    box.classList.add('ldlg'); refreshRoster(); recDialogUi();
    box.addEventListener('click', e => {
      const t = e.target as HTMLElement, pm = t.closest<HTMLElement>('[data-pm]')?.dataset.pm, mb = t.closest<HTMLElement>('[data-m]'), rb = t.closest<HTMLElement>('[data-r]')?.dataset.r;
      if (pm) { const [id, k] = pm.split(':'), en = L.roster().find(x => x.id === id); if (en) L.media.perm(id, k === 'mic' ? { mic: !en.aMic } : k === 'wr' ? { wr: !en.aWr } : { cam: !en.aCam }); return; }
      if (rb) { if (rb === 'start') void recStart(); else if (rb === 'stop') void recStop(); else if (rb === 'pause') recPause(); return; }
      if (!mb) return; const a = mb.dataset.m!;
      if (a === 'mic') void L.media.setMic(!L.media.mic()).then(recDialogUi, er => toast((er as Error).message, true));
      else if (a === 'cam') void L.media.setCam(!L.media.cam()).then(recDialogUi, er => toast((er as Error).message, true));
      else if (a === 'allmic') L.media.permAll({ mic: true }); else if (a === 'allcam') L.media.permAll({ cam: true }); else if (a === 'allwr') L.media.permAll({ wr: true }); else if (a === 'none') L.media.permAll({ mic: false, cam: false, wr: false });
    });
    box.addEventListener('change', e => { const t = e.target as HTMLInputElement; if (t.id === 'recst') RM.students = t.checked; });
    box.querySelectorAll<HTMLElement>('[data-v]').forEach(b => b.addEventListener('click', () => { const v = b.dataset.v; if (v === 'copy') { void navigator.clipboard?.writeText(fmtCode(L.code) + (L.code[0] === '9' && L.broker ? ' ' + L.broker : '')).then(() => toast('Kod nusxalandi'), () => toast('Nusxalab bo‘lmadi, kodni qo‘lda yozing', true)); } else { if (v === 'end') endLive(); done(v!); } }));
  });
}
async function joinDialog() {
  let nm = ''; try { nm = localStorage.getItem('fur.name') || ''; } catch { /* */ }
  void modal<string>(`<h3>Darsga qo‘shilish</h3><label class="lbl">Dars kodi<input id="jc" placeholder="masalan: 0-K7M2-Q9XA-4TDP (server bilan birga qo‘yish mumkin)" autocomplete="off" autocapitalize="characters"></label><label class="lbl">Ismingiz<input id="jn" maxlength="40" value="${esc(nm)}" placeholder="Ism"></label><label class="lbl">Server (faqat o‘qituvchi o‘z serveri ko‘rsatgan bo‘lsa)<input id="js" placeholder="bo‘sh qoldiring" value="${esc(customBroker())}"></label><p class="mut small" id="jerr"></p><div class="row"><button class="btn" data-v="">Bekor qilish</button><button class="btn pri" data-v="go">Qo‘shilish</button></div>`, (box, done) => {
    const q = (id: string) => box.querySelector<HTMLInputElement>('#' + id)!;
    box.querySelector('[data-v=""]')!.addEventListener('click', () => done(null));
    const go = async () => {
      const name = q('jn').value.trim() || 'O‘quvchi', err = box.querySelector<HTMLElement>('#jerr')!; err.textContent = 'Ulanmoqda…';
      try { localStorage.setItem('fur.name', name); } catch { /* */ }
      let codeIn = q('jc').value, srvIn = q('js').value.trim(); const um = codeIn.match(/wss?:\/\/\S+/i); if (um) { srvIn = um[0]; codeIn = codeIn.replace(um[0], ''); } // "kod + server" birga qo'yilsa
      setCustomBroker(srvIn);
      try { inClass = true; await joinClass(codeIn, name, why => { inClass = false; if (why !== 'exit') toast(why); render(); void probeSaved(true); }); done('ok'); } catch (e) { inClass = false; err.textContent = (e as Error).message; err.classList.add('bad'); }
    };
    box.querySelector('[data-v=go]')!.addEventListener('click', () => void go()); q('jc').addEventListener('keydown', e => { if (e.key === 'Enter') void go(); }); q('jc').focus();
  });
}
const fmtDur = (ms: number) => { const t = Math.round(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
// ---------- yozib olish (taqdimot/tahrirlash/jonli darsdan mustaqil) ----------
const RM = { rec: null as Rec | null, frames: null as FrameCtl | null, title: '', tick: 0, view: null as PresentHandle | null, focus: null as { i: number; v: number } | null, students: true };
async function recStart() {
  if (RM.rec || !S.ses) return; if (!recSupported()) return void toast('Bu qurilmada yozib olish qo‘llab-quvvatlanmaydi', true);
  const fr = makeFrames({ getDoc: () => S.ses?.doc ?? null, getIdx: () => S.view === 'edit' ? S.pageIdx : Math.max(0, live ? live.page() : S.pageIdx), getView: () => RM.view, getFocus: () => RM.focus });
  const L = live;
  try {
    RM.rec = await startRecorder({ frame: (g, W, H) => fr.frame(g, W, H), ownMic: !L, mic: () => live && live.media.mic() ? live.media.micTrack() : null, students: () => live?.media.remote() ?? [], includeStudents: () => RM.students, onStop: () => fr.dispose() });
  } catch (e) { fr.dispose(); return void toast((e as Error).message, true); }
  RM.frames = fr; RM.title = S.ses.doc.title;
  if (L && !L.media.mic()) toast('Yozish boshlandi. Mikrofoningiz o‘chiq — ovozingiz yozuvga tushishi uchun 🎤 ni yoqing', true);
  else toast(RM.rec.audio ? 'Yozish boshlandi: o‘quvchilar ko‘rgan sahifa + ovoz' : 'Yozish boshlandi — mikrofon yo‘q, ovozsiz', !RM.rec.audio);
  clearInterval(RM.tick); RM.tick = window.setInterval(recNotify, 500); recNotify();
}
async function recStop() {
  const r = RM.rec; if (!r) return; RM.rec = null; RM.frames = null; clearInterval(RM.tick); recNotify();
  const out = await r.stop(); if (!out.blob.size) return void toast('Yozuv bo‘sh chiqdi', true);
  toast('Yozuv saqlanmoqda…');
  try { const it = await saveRecording(out.blob, RM.title, out.ms); S.recs = await listRecordings(); toast(`Yozuv saqlandi (${fmtDur(out.ms)}, ${fmtSize(it.size)}) → ${recWhere()}`); if (S.view === 'home') keepScroll(render); }
  catch (e) { const ext = out.mime.includes('mp4') ? 'mp4' : 'webm'; download(new Uint8Array(await out.blob.arrayBuffer()), RM.title + ' — dars yozuvi', '.' + ext, out.mime); toast((e as Error).message + ' — yozuv faylga yuklab olindi', true); }
}
function recPause() { const r = RM.rec; if (!r) return; if (r.paused()) { r.resume(); toast('Yozish davom etmoqda'); } else { r.pause(); toast('Yozish pauzada'); } recNotify(); }
const recToggle = () => RM.rec ? void recStop() : void recStart();
function recNotify() {
  const r = RM.rec, v = RM.view, t = r ? fmtDur(r.elapsed()) : '';
  if (v) { v.btn('rec', { on: !!r, title: r ? 'To‘xtatish va saqlash' : 'Darsni yozib olish' }); v.btn('recp', { hide: !r }); v.recInfo(r ? t : null, !!r?.paused()); if (r) v.status(`${r.paused() ? '⏸ PAUZA' : '● REC'} ${t}`); }
  let el = document.getElementById('recpill');
  if (!r) el?.remove(); else { if (!el) { el = document.createElement('button'); el.id = 'recpill'; el.className = 'livepill recpill'; el.setAttribute('aria-label', 'Yozuv boshqaruvi'); el.addEventListener('click', () => void liveDialog()); document.body.append(el); } el.classList.toggle('paused', r.paused()); el.innerHTML = `<i></i>${r.paused() ? 'Pauza' : 'REC'} ${t}`; }
  recDialogUi();
}
function present(from: number) {
  const ses = S.ses; if (!ses) return; if (!ses.doc.pages.length) return toast('Sahifa yo‘q');
  const L = live;
  const view: PresentHandle = startPresentation(ses.doc, from, () => { if (RM.view === view) RM.view = null; render(); }, { ...(L ? { hooks: L.hooks } : {}), media: !!L?.media.supported, record: recSupported(), onBtn: b => {
    if (b === 'rec') recToggle(); else if (b === 'recp') recPause(); else if (L) L.onBtn(b, view);
  } });
  RM.view = view; recNotify();
}
function openPage(i: number) {
  const p = S.ses!.doc.pages[i]; if (!p) return;
  S.pageIdx = i; S.view = 'edit'; render(); live?.sendPage(i);
}
function render() {
  if (S.editor) { S.editor.destroy(); S.editor = null; } if (S.grid) { S.grid.destroy(); S.grid = null; }
  const keepQ = document.activeElement?.id === 'q', pos = (document.getElementById('q') as HTMLInputElement | null)?.selectionStart ?? 0;
  root.innerHTML = S.view === 'home' ? home() : S.view === 'doc' ? docView() : editView();
  if (S.view !== 'home') updateStatus();
  if (S.view === 'edit' && S.ses) { const ses = S.ses; const hp = { doc: ses.doc, page: ses.doc.pages[S.pageIdx], index: S.pageIdx, onChange: changed, focus: (u: number, v: number) => { RM.focus = { i: S.pageIdx, v }; live?.focus(S.pageIdx, u, v); }, toast, ask: askText }; const el = document.getElementById('editor')!; S.editor = hp.page.type === 'board' ? mountBoard(el, hp) : mountEditor(el, hp); }
  if (S.view === 'doc' && S.ses && S.pview === 'grid') { const h = document.getElementById('pgridhost'); if (h) S.grid = mountPageGrid(h, S.ses.doc, (a, b) => void sesAction('moveto', a + ':' + b)); }
  if (keepQ) { const q = document.getElementById('q') as HTMLInputElement; q.focus(); q.setSelectionRange(pos, pos); }
}

// ---------- hodisalar ----------
root.addEventListener('click', async e => {
  const t = e.target as HTMLElement;
  const op = t.closest<HTMLElement>('[data-open]'); if (op && S.ses && !t.closest('[data-sa]')) return openPage(Number(op.dataset.open));
  const sa = t.closest<HTMLElement>('[data-sa]'); if (sa) { const [a, arg] = sa.dataset.sa!.split(':'); return void sesAction(a, arg); }
  const nav = t.closest<HTMLElement>('[data-nav]'); if (nav) { S.section = nav.dataset.nav as Section; S.q = ''; S.folderId = null; S.menu = null; S.sel = null; if (S.section === 'rec') void refreshRecs(); return render(); }
  const rr = t.closest<HTMLElement>('[data-rid]');
  if (rr && !t.closest('[data-act]')) { const id = rr.dataset.rid!; if (S.sel) { if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); return keepScroll(render); } return void playRec(id); }
  const fo = t.closest<HTMLElement>('[data-folder]'); if (fo) { S.folderId = fo.dataset.folder || null; S.menu = null; return render(); }
  const actEl = t.closest<HTMLElement>('[data-act]'), card = t.closest<HTMLElement>('.card');
  if (actEl) {
    const a = actEl.dataset.act!, id = card?.dataset.id;
    if (a === 'menu') return void openMenu(id!);
    if (a === 'rshare' || a === 'rdel') { const it = S.recs.find(x => x.id === t.closest<HTMLElement>('[data-rid]')?.dataset.rid); if (!it) return; return void (a === 'rshare' ? shareRecording(it) : delRec(it)); }
    if (a === 'seltoggle') { S.sel = S.sel ? null : new Set(); return render(); }
    if (a === 'selcancel') { S.sel = null; return render(); }
    if (a === 'selall') { const ids = S.section === 'rec' ? recList().map(r => r.id) : visibleDocs().map(m => m.id); S.sel = S.sel && S.sel.size === ids.length ? new Set() : new Set(ids); return keepScroll(render); }
    if (a.startsWith('bulk:')) return void bulk(a.slice(5));
    if (a === 'emptytrash') return void emptyTrash();
    if (a === 'resumelive') return void resumeLive();
    if (a === 'dismisslive') { clearLive(); liveSt = null; return render(); }
    if (a.startsWith('m:')) return void menuAction(a.slice(2), id!);
    if (a === 'fav') return void menuAction('fav', id!);
    if (a === 'new') return void createDoc(); if (a === 'newfolder') return void createFolder();
    if (a === 'update') { void checkUpdate(); return; }
    if (a === 'join') return void joinDialog();
    if (a === 'import') return (document.getElementById('file') as HTMLInputElement).click();
    if (a === 'back') return void closeDoc();
    if (a === 'present') return present(S.view === 'edit' ? S.pageIdx : 0);
    if (a === 'pages') { S.view = 'doc'; return render(); }
    if (a.startsWith('pview:')) { S.pview = a.slice(6) === 'list' ? 'list' : 'grid'; try { localStorage.setItem('fur.pview', S.pview); } catch { /* */ } return render(); }
    if (a === 'prevpage' || a === 'nextpage') { let j = S.pageIdx + (a === 'nextpage' ? 1 : -1); if (S.ses!.doc.pages[j]) return openPage(j); return; }
    if (a === 'theme') { toggleTheme(); return render(); }
    if (a === 'settings') return settingsDialog();
  }
  if (card && S.sel) { const id = card.dataset.id!; if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); return keepScroll(render); }
  if (card && S.section !== 'trash') return void openDoc(card.dataset.id!);
  if (S.menu) { S.menu = null; render(); }
});
root.addEventListener('input', e => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'q') { S.q = t.value; render(); }
  else if (t.id === 'title' && S.ses) { S.ses.doc.title = t.value.trim() || 'Nomsiz dars'; changed(); }
});
root.addEventListener('change', e => { const t = e.target as HTMLSelectElement; if (t.id === 'sort') { S.sort = t.value as Sort; render(); } });
document.getElementById('file')!.addEventListener('change', e => { const i = e.target as HTMLInputElement; if (i.files?.length) void importFiles(i.files); i.value = ''; });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer?.files.length) void importFiles(e.dataTransfer.files); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { void probeSaved(); void refreshRecs(); } });
window.addEventListener('visibilitychange', () => { if (document.hidden && S.ses && S.ses.status !== 'saved') void persist(); });

function toggleTheme() { setSettings({ mode: effectiveMode() === 'dark' ? 'light' : 'dark' }); }
let incBusy = false, incWanted = false, appReady = false;
initTheme();
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !native()) navigator.serviceWorker.register('sw.js').catch(() => {});
(async () => { try { await refresh(); } catch { S.err = 'Brauzer xotirasi (IndexedDB) mavjud emas'; } render(); if (S.err) toast(S.err, true); appReady = true; void checkIncoming(); void refreshRecs(); void probeSaved(true); })();
setInterval(() => { if (document.hidden) return; if (live) touchLive(); else void probeSaved(); }, 25000);
(window as any).__fur = { S, openDoc, refresh, render, saveRecording, refreshRecs };

/** "Ochish" (Open with) / "Ulashish" orqali kelgan .fur (va PDF/DOCX/rasm) fayllar: Android qobig'i xotirada ushlab turadi, bu yerda olib import qilinadi va ochiladi. */
async function checkIncoming() {
  const n = native(); if (!n?.incomingList || !n.incomingChunk || !n.incomingDone) return;
  if (!appReady || incBusy) { incWanted = true; return; }
  incBusy = true; incWanted = false;
  try {
    const list = JSON.parse(n.incomingList()) as { id: number; name: string; size: number }[]; if (!Array.isArray(list) || !list.length) return;
    const files: File[] = [], CH = 3 * 256 * 1024;
    for (const it of list) {
      const parts: Uint8Array[] = [];
      for (let off = 0; off < it.size; off += CH) { const bin = atob(n.incomingChunk(it.id, off, Math.min(CH, it.size - off))), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); parts.push(u); }
      n.incomingDone(it.id); files.push(new File(parts as unknown as BlobPart[], it.name || 'fayl.fur'));
    }
    if (S.ses) await closeDoc();
    const made = await importFiles(files);
    if (made.length === 1) await openDoc(made[0].id);
  } catch (e) { toast('Faylni ochib bo‘lmadi' + (e instanceof Error && e.message ? ': ' + e.message : ''), true); }
  finally { incBusy = false; if (incWanted) void checkIncoming(); }
}
(window as unknown as { __furIncoming: () => void }).__furIncoming = () => { void checkIncoming(); };
// Brauzer/PWA (kompyuter): .fur faylni "Ochish" orqali ishga tushirish (manifest file_handlers)
(window as unknown as { launchQueue?: { setConsumer(f: (p: { files: { getFile(): Promise<File> }[] }) => void): void } }).launchQueue?.setConsumer(async p => { try { const fs = await Promise.all(p.files.map(h => h.getFile())); if (!fs.length) return; if (S.ses) await closeDoc(); const made = await importFiles(fs); if (made.length === 1) await openDoc(made[0].id); } catch { /* */ } });


/** Android "orqaga" tugmasi uchun: true = ilova o'zi ishladi, false = ilovadan chiqish mumkin. */
(window as unknown as { __furBack: () => boolean }).__furBack = () => {
  const pres = (window as unknown as { __pres?: { exit(): void } }).__pres; if (document.querySelector('.pres') && pres) { pres.exit(); return true; }
  const ov = document.querySelector('.ov'); if (ov) { ov.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true; }
  if (S.view === 'edit') { S.view = 'doc'; render(); return true; }
  if (S.view === 'doc') { void closeDoc(); return true; }
  return false;
};
