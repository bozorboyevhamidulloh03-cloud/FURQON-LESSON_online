import { FurDocument, FurError, PageType, newDocument, newPage, parseFur, serializeFur, uid } from '../../packages/fur-format/src/index';
import { mountPageGrid, GridHandle } from './pagegrid';
import { mountEditor, EditorHandle } from './editor';
import { mountBoard, BoardHandle } from './board';
import { startPresentation } from './present';
import { startTeacher, joinClass, TeacherSession } from './classroom';
import { fmtCode, customBroker, setCustomBroker, BROKERS } from './room';
import { sniff, importPdf, importPdfText, importDocx, importImage } from './importers';
import * as db from './db';
import type { DocMeta, Folder } from './db';

type Section = 'all' | 'recent' | 'fav' | 'trash';
type Sort = 'modified' | 'name' | 'size';
interface Session { meta: DocMeta; doc: FurDocument; status: 'saved' | 'dirty' | 'saving' | 'error'; savedAt: number; recT: number; saveT: number; recovery: { savedAt: number; data: Uint8Array } | null }
const S = { section: 'all' as Section, folderId: null as string | null, q: '', sort: 'modified' as Sort, metas: [] as DocMeta[], folders: [] as Folder[],
  view: 'home' as 'home' | 'doc' | 'edit', pageIdx: 0, editor: null as EditorHandle | null, grid: null as GridHandle | null, pview: ((): 'grid' | 'list' => { try { return localStorage.getItem('fur.pview') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } })(), ses: null as Session | null, menu: null as string | null, est: null as { usage: number; quota: number } | null, err: '' };
const root = document.getElementById('app')!;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const I = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  live: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="2.5"/><path d="M7.5 7.5a6.4 6.4 0 000 9M16.5 7.5a6.4 6.4 0 010 9M4.5 4.5a10.6 10.6 0 000 15M19.5 4.5a10.6 10.6 0 010 15"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>',
  home: I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'), clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), star: I('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'), plus: I('<path d="M12 5v14M5 12h14"/>'), folder: I('<path d="M3 6a2 2 0 012-2h4l2 3h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  upload: I('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'), more: I('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'), back: I('<path d="M15 5l-7 7 7 7"/>'),
  moon: I('<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>'), search: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'), download: I('<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'),
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
    const ov = document.createElement('div'); ov.className = 'ov'; ov.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">${html}</div>`; document.body.append(ov);
    const done = (v: T | null) => { ov.remove(); document.removeEventListener('keydown', key); res(v); };
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
async function importFiles(files: FileList | File[]) {
  let n = 0, pdfMode: 'img' | 'text' | null = null;
  for (const f of Array.from(files)) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer()), kind = sniff(bytes, f.name);
      if (kind === 'pdf' || kind === 'docx' || kind === 'image') {
        const prog = (m: string) => toast(m);
        if (kind === 'pdf' && !pdfMode) { pdfMode = await modal<'img' | 'text'>(`<h3>PDF qanday import qilinsin?</h3><div class="choose"><button class="opt" data-v="img"><b>Sahifa rasmi (doska)</b><span>Har bet aynan o‘zidek ko‘rinadi, ustiga yozish va chizish mumkin. Matn tahrirlanmaydi. Skaner PDF uchun ham ishlaydi.</span></button><button class="opt" data-v="text"><b>Tahrirlanadigan matn</b><span>Matn, ro‘yxat, rang va rasmlar hujjat bloklariga ajratiladi. Murakkab jadval/grafiklar soddalashishi mumkin.</span></button></div><div class="row"><button class="btn" data-v="">Bekor qilish</button></div>`, (box, done) => { box.querySelectorAll<HTMLElement>('[data-v]').forEach(b => b.addEventListener('click', () => done((b.dataset.v || null) as any))); }); if (!pdfMode) continue; }
        const doc = kind === 'pdf' ? (pdfMode === 'text' ? await importPdfText(bytes, f.name, prog) : await importPdf(bytes, f.name, prog)) : kind === 'docx' ? await importDocx(bytes, f.name, prog) : await importImage(bytes, f.name);
        await storeNew(doc); n++; const w = (doc as any).__warn as number | undefined;
        toast(`"${doc.title}" ${kind === 'pdf' ? 'PDF' : kind === 'docx' ? 'Word' : 'rasm'} import qilindi (${doc.pages.length} sahifa)${(doc as any).__note ? ' · ' + (doc as any).__note : ''}${w ? ` · ${w} ta element o‘tkazib yuborildi` : ''}`); continue;
      }
      if (kind === 'unknown' && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new FurError('UNSUPPORTED_VERSION', 'Qo‘llab-quvvatlanmaydigan fayl (.fur, .pdf, .docx yoki rasm bo‘lsin)');
      const r = await parseFur(bytes); await storeNew(r.doc); n++;
      toast(r.migrated ? `"${r.doc.title}" ochildi (format ${r.sourceVersion} → 1.1 ga o‘tkazildi)` : `"${r.doc.title}" import qilindi`);
    } catch (e) { toast(`${f.name}: ${e instanceof FurError ? e.message : 'o‘qib bo‘lmadi'}`, true); }
  }
  if (n) { await refresh(); render(); }
}
interface FurNativeApi { saveFile(name: string, mime: string, b64: string, last: boolean): void; version(): string; checkUpdate(): void; openExternal(u: string): void }
const native = (): FurNativeApi | null => (window as unknown as { FurNative?: FurNativeApi }).FurNative ?? null;
function download(bytes: Uint8Array, name: string) {
  const fname = name.replace(/[\\/:*?"<>|]/g, '_') + '.fur', nat = native();
  if (nat) { // Android ilovasi: blob yuklab olish ishlamaydi, fayl mahalliy "Saqlash" oynasi orqali yoziladi
    const CH = 3 * 256 * 1024; for (let i = 0; i < bytes.length; i += CH) { let bin = ''; const part = bytes.subarray(i, i + CH); for (let k = 0; k < part.length; k += 8192) bin += String.fromCharCode(...part.subarray(k, k + 8192)); nat.saveFile(fname, 'application/octet-stream', btoa(bin), i + CH >= bytes.length); }
    if (!bytes.length) nat.saveFile(fname, 'application/octet-stream', '', true); return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' }));
  a.download = fname; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}
async function menuAction(act: string, id: string) {
  const m = S.metas.find(x => x.id === id); if (!m) return; S.menu = null;
  if (act === 'open') return openDoc(id);
  if (act === 'fav') { await db.putMeta({ ...m, favorite: !m.favorite }); }
  else if (act === 'rename') { const t = await askText('Nomini o‘zgartirish', m.title); if (!t) return render(); const b = (await db.getBlob(id))!; const r = await parseFur(b); r.doc.title = t; const nb = await serializeFur(r.doc); await db.saveDoc({ ...m, title: t, size: nb.length, modified: Date.now() }, nb); }
  else if (act === 'dup') { const r = await parseFur((await db.getBlob(id))!); r.doc.title = m.title + ' (nusxa)'; const nm = await storeNew(r.doc); await db.putMeta({ ...nm, folderId: m.folderId }); toast('Nusxa yaratildi'); }
  else if (act === 'move') { const f = await pickFolder(); if (f === null) return render(); await db.putMeta({ ...m, folderId: f || null }); }
  else if (act === 'export') { download((await db.getBlob(id))!, m.title); toast('Eksport qilindi: ' + m.title + '.fur'); return render(); }
  else if (act === 'trash') { await db.putMeta({ ...m, deletedAt: Date.now() }); toast('"' + m.title + '" o‘chirilganlarga ko‘chirildi'); }
  else if (act === 'restore') { await db.putMeta({ ...m, deletedAt: null }); }
  else if (act === 'purge') { if (!(await confirmBox('Butunlay o‘chirish', `"${m.title}" qayta tiklanmaydi.`, 'Butunlay o‘chirish'))) return render(); await db.deleteDoc(id); }
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
async function closeDoc() { if (live) endLive(); if (S.editor) { S.editor.destroy(); S.editor = null; } const s = S.ses; if (s && s.status !== 'saved') { clearTimeout(s.saveT); clearTimeout(s.recT); await persist(); } S.ses = null; S.view = 'home'; await refresh(); render(); }
async function sesAction(act: string, arg?: string) {
  const s = S.ses!;
  if (act === 'addboard' || act === 'adddoc') { const t: PageType = act === 'addboard' ? 'board' : 'document'; s.doc.pages.push(newPage(t, '')); }
  else if (act === 'delpage') { if (s.doc.pages.length < 2) return toast('Kamida bitta sahifa qolishi kerak', true); s.doc.pages.splice(Number(arg), 1); }
  else if (act === 'up' || act === 'down') { const i = Number(arg), j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= s.doc.pages.length) return; [s.doc.pages[i], s.doc.pages[j]] = [s.doc.pages[j], s.doc.pages[i]]; }
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
  const trash = S.section === 'trash', items = trash ? [['restore', 'Tiklash'], ['purge', 'Butunlay o‘chirish']] : [['open', 'Ochish'], ['rename', 'Nomini o‘zgartirish'], ['dup', 'Nusxa olish'], ['move', 'Papkaga ko‘chirish'], ['export', 'Eksport (.fur)'], ['trash', 'O‘chirish']];
  return `<article class="card" data-id="${m.id}" tabindex="0"><div class="thumb">${thumb(m)}</div><div class="cinfo"><h3 title="${esc(m.title)}">${esc(m.title)}</h3><p>${m.pages} sahifa · ${fmtSize(m.size)}</p><p class="mut">${trash ? 'O‘chirilgan: ' + ago(m.deletedAt!) : ago(m.modified)}</p></div>
  ${trash ? '' : `<button class="ib star ${m.favorite ? 'on' : ''}" data-act="fav" aria-label="Sevimli">${IC.star}</button>`}<button class="ib more" data-act="menu" aria-label="Amallar">${IC.more}</button>
  ${S.menu === m.id ? `<div class="menu">${items.map(([a, t]) => `<button data-act="m:${a}" class="${a === 'trash' || a === 'purge' ? 'dng' : ''}">${t}</button>`).join('')}</div>` : ''}</article>`;
}
function home(): string {
  const live = S.metas.filter(m => !m.deletedAt), trashN = S.metas.length - live.length, favN = live.filter(m => m.favorite).length;
  const nav = (k: Section, ic: string, t: string, n?: number) => `<button class="nav ${S.section === k && !S.q ? 'on' : ''}" data-nav="${k}">${ic}<span>${t}</span>${n ? `<em>${n}</em>` : ''}</button>`;
  const docs = visibleDocs(), showFolders = S.section === 'all' && !S.q ? S.folders.filter(f => f.parentId === S.folderId) : [];
  const crumbs: Folder[] = []; for (let f = S.folders.find(x => x.id === S.folderId); f; f = S.folders.find(x => x.id === f!.parentId)) crumbs.unshift(f);
  const est = S.est, pct = est && est.quota ? Math.max(1, Math.min(100, Math.round(est.usage / est.quota * 100))) : 0;
  const titles: Record<Section, string> = { all: 'Barcha darslar', recent: 'So‘nggi ochilganlar', fav: 'Sevimlilar', trash: 'O‘chirilganlar' };
  const empty = S.q ? `<div class="empty"><h2>Hech narsa topilmadi</h2><p>"${esc(S.q)}" bo‘yicha darslar yo‘q.</p></div>`
    : S.section === 'trash' ? `<div class="empty"><h2>Savat bo‘sh</h2><p>O‘chirilgan darslar shu yerda turadi va tiklanishi mumkin.</p></div>`
    : S.section === 'fav' ? `<div class="empty"><h2>Sevimlilar yo‘q</h2><p>Dars kartochkasidagi yulduzchani bosing.</p></div>`
    : `<div class="empty"><svg viewBox="0 0 120 90" width="120" aria-hidden="true"><rect x="22" y="14" width="64" height="66" rx="8" fill="var(--card)" stroke="var(--line)"/><rect x="34" y="6" width="64" height="66" rx="8" fill="var(--card)" stroke="var(--line)"/><path d="M46 30h40M46 42h40M46 54h24" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></svg><h2>Birinchi darsingizni yarating</h2><p>Hujjat va doskadan iborat dars bitta .fur faylda saqlanadi. Hammasi shu qurilmada, akkauntsiz.</p><button class="btn pri" data-act="new">${IC.plus} Yangi dars</button></div>`;
  return `<div class="shell"><aside class="side"><div class="brand"><span class="logo">F</span><b>FUR</b><small>Platform</small></div>
  <nav>${nav('all', IC.home, 'Darslar', live.length)}${nav('recent', IC.clock, 'So‘nggi')}${nav('fav', IC.star, 'Sevimlilar', favN)}${nav('trash', IC.trash, 'O‘chirilganlar', trashN)}</nav>
  <div class="grow"></div><div class="stor"><div class="bar"><i style="width:${pct}%"></i></div><small>${est ? `${fmtSize(est.usage)} ishlatilgan` : 'Xotira'}${est?.quota ? ` · ${fmtSize(est.quota)} dan` : ''}</small></div>
  <button class="nav" data-act="theme">${IC.moon}<span>Mavzu</span></button></aside>
  <main><header class="top"><label class="search">${IC.search}<input id="q" placeholder="Darslarni qidirish" value="${esc(S.q)}"></label>
  <select id="sort" aria-label="Saralash"><option value="modified" ${S.sort === 'modified' ? 'selected' : ''}>Oxirgi o‘zgarish</option><option value="name" ${S.sort === 'name' ? 'selected' : ''}>Nomi bo‘yicha</option><option value="size" ${S.sort === 'size' ? 'selected' : ''}>Hajmi bo‘yicha</option></select>
  ${native() ? `<button class="btn" data-act="update" title="${esc(nativeVer())}">${IC.live}<span>Yangilanish</span></button>` : ''}<button class="btn" data-act="join">${IC.live}<span>Darsga qo‘shilish</span></button><button class="btn" data-act="import">${IC.upload}<span>Import</span></button><button class="btn" data-act="newfolder">${IC.folder}<span>Papka</span></button><button class="btn pri" data-act="new">${IC.plus}<span>Yangi dars</span></button></header>
  <section class="content"><div class="crumb">${S.section === 'all' && !S.q ? `<button data-folder="">Darslar</button>${crumbs.map(c => `<span>/</span><button data-folder="${c.id}">${esc(c.name)}</button>`).join('')}` : `<b>${S.q ? 'Qidiruv natijalari' : titles[S.section]}</b>`}</div>
  ${showFolders.length ? `<div class="folders">${showFolders.map(f => `<button class="fold" data-folder="${f.id}">${IC.folder}<span>${esc(f.name)}</span><em>${S.metas.filter(m => m.folderId === f.id && !m.deletedAt).length}</em></button>`).join('')}</div>` : ''}
  ${docs.length ? `<div class="grid">${docs.map(card).join('')}</div>` : showFolders.length ? '' : empty}</section></main></div>`;
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
function nativeVer(): string { try { const v = JSON.parse(native()?.version() ?? '{}'); return `Versiya: web ${v.web}, APK ${v.apk}`; } catch { return 'Yangilanishni tekshirish'; } }
// ---------- jonli dars ----------
let live: TeacherSession | null = null;
function updatePill() {
  let el = document.getElementById('livepill'); if (!live) return el?.remove();
  if (!el) { el = document.createElement('button'); el.id = 'livepill'; el.className = 'livepill'; el.addEventListener('click', () => void liveDialog()); document.body.append(el); }
  const r = live.roster(), h = r.filter(x => x.hand).length; el.classList.toggle('bad', !live.up());
  el.innerHTML = `<i></i>${live.up() ? 'Jonli' : 'Aloqa yo‘q'} · ${r.length}${h ? ` · ✋${h}` : ''}`;
}
function refreshRoster() {
  updatePill(); const ul = document.getElementById('rost'); if (!ul || !live) return; const r = live.roster();
  ul.innerHTML = r.length ? r.map(x => `<li class="${x.hand ? 'hand' : ''}">${x.hand ? '✋ ' : ''}${esc(x.name)}</li>`).join('') : '<li class="mut">Hali hech kim qo‘shilmadi</li>';
  const c = document.getElementById('rcount'); if (c) c.textContent = String(r.length);
}
function endLive() { live?.end(); live = null; updatePill(); toast('Jonli dars tugatildi'); }
async function liveDialog() {
  if (!live) {
    let srvVal = '';
    const v = await modal<string>(`<h3>Jonli darsni boshlash</h3><p class="mut">Hozir ochiq turgan dars o‘quvchilarga real vaqtda ko‘rinadi. Ma’lumot shifrlangan holda bepul ommaviy server orqali o‘tadi, ro‘yxatdan o‘tish kerak emas.</p><label class="lbl">Server (ixtiyoriy)<input id="srv" placeholder="bo‘sh = bepul ommaviy server · yoki ws://192.168.1.5:8883" value="${esc(customBroker())}"></label><div class="row"><button class="btn" data-v="">Bekor qilish</button><button class="btn pri" data-v="go">Boshlash</button></div>`, (box, done) => {
      box.querySelectorAll<HTMLElement>('[data-v]').forEach(b => b.addEventListener('click', () => { srvVal = box.querySelector<HTMLInputElement>('#srv')!.value; done(b.dataset.v || null); }));
    });
    if (v !== 'go') return; toast('Server qidirilmoqda…');
    const srv = srvVal;
    try {
      setCustomBroker((srv ?? '').trim());
      live = await startTeacher(() => S.ses?.doc ?? null, () => (S.view === 'edit' ? S.pageIdx : 0), refreshRoster, n => toast(`✋ ${n} qo‘l ko‘tardi`));
      updatePill();
    } catch (e) { live = null; return void toast('Jonli dars boshlanmadi: ' + (e as Error).message, true); }
  }
  const L = live!; const host = L.broker.replace(/^wss?:\/\//, '').replace(/[:/].*$/, '');
  void modal<string>(`<h3>Jonli dars</h3><p class="mut">O‘quvchilar ilovada <b>“Darsga qo‘shilish”</b> tugmasini bosib, shu kodni kiritadi:</p><div class="bigcode" id="bcode">${fmtCode(L.code)}</div><div class="row"><button class="btn" data-v="copy">Kodni nusxalash</button></div><p class="mut small">Server: ${esc(host)} · xabarlar shifrlangan</p><h4>Qatnashuvchilar (<span id="rcount">0</span>)</h4><ul class="rost" id="rost"></ul><div class="row"><button class="btn dng" data-v="end">Darsni tugatish</button><button class="btn pri" data-v="close">Yopish</button></div>`, (box, done) => {
    refreshRoster();
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
      try { await joinClass(codeIn, name, why => { if (why !== 'exit') toast(why); render(); }); done('ok'); } catch (e) { err.textContent = (e as Error).message; err.classList.add('bad'); }
    };
    box.querySelector('[data-v=go]')!.addEventListener('click', () => void go()); q('jc').addEventListener('keydown', e => { if (e.key === 'Enter') void go(); }); q('jc').focus();
  });
}
function present(from: number) {
  const ses = S.ses; if (!ses) return; if (!ses.doc.pages.length) return toast('Sahifa yo‘q');
  startPresentation(ses.doc, from, () => { render(); }, live ? { hooks: live.hooks } : {});
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
  if (S.view === 'edit' && S.ses) { const ses = S.ses; const hp = { doc: ses.doc, page: ses.doc.pages[S.pageIdx], index: S.pageIdx, onChange: changed, toast, ask: askText }; const el = document.getElementById('editor')!; S.editor = hp.page.type === 'board' ? mountBoard(el, hp) : mountEditor(el, hp); }
  if (S.view === 'doc' && S.ses && S.pview === 'grid') { const h = document.getElementById('pgridhost'); if (h) S.grid = mountPageGrid(h, S.ses.doc); }
  if (keepQ) { const q = document.getElementById('q') as HTMLInputElement; q.focus(); q.setSelectionRange(pos, pos); }
}

// ---------- hodisalar ----------
root.addEventListener('click', async e => {
  const t = e.target as HTMLElement;
  const op = t.closest<HTMLElement>('[data-open]'); if (op && S.ses && !t.closest('[data-sa]')) return openPage(Number(op.dataset.open));
  const sa = t.closest<HTMLElement>('[data-sa]'); if (sa) { const [a, arg] = sa.dataset.sa!.split(':'); return void sesAction(a, arg); }
  const nav = t.closest<HTMLElement>('[data-nav]'); if (nav) { S.section = nav.dataset.nav as Section; S.q = ''; S.folderId = null; S.menu = null; return render(); }
  const fo = t.closest<HTMLElement>('[data-folder]'); if (fo) { S.folderId = fo.dataset.folder || null; S.menu = null; return render(); }
  const actEl = t.closest<HTMLElement>('[data-act]'), card = t.closest<HTMLElement>('.card');
  if (actEl) {
    const a = actEl.dataset.act!, id = card?.dataset.id;
    if (a === 'menu') { S.menu = S.menu === id ? null : id!; return render(); }
    if (a.startsWith('m:')) return void menuAction(a.slice(2), id!);
    if (a === 'fav') return void menuAction('fav', id!);
    if (a === 'new') return void createDoc(); if (a === 'newfolder') return void createFolder();
    if (a === 'update') { native()?.checkUpdate(); return; }
    if (a === 'join') return void joinDialog();
    if (a === 'import') return (document.getElementById('file') as HTMLInputElement).click();
    if (a === 'back') return void closeDoc();
    if (a === 'present') return present(S.view === 'edit' ? S.pageIdx : 0);
    if (a === 'pages') { S.view = 'doc'; return render(); }
    if (a.startsWith('pview:')) { S.pview = a.slice(6) === 'list' ? 'list' : 'grid'; try { localStorage.setItem('fur.pview', S.pview); } catch { /* */ } return render(); }
    if (a === 'prevpage' || a === 'nextpage') { let j = S.pageIdx + (a === 'nextpage' ? 1 : -1); if (S.ses!.doc.pages[j]) return openPage(j); return; }
    if (a === 'theme') return toggleTheme();
  }
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
window.addEventListener('visibilitychange', () => { if (document.hidden && S.ses && S.ses.status !== 'saved') void persist(); });

function toggleTheme() { const d = document.documentElement, n = d.dataset.theme === 'dark' ? 'light' : 'dark'; d.dataset.theme = n; try { localStorage.setItem('fur-theme', n); } catch { /* ignore */ } }
(() => { let t: string | null = null; try { t = localStorage.getItem('fur-theme'); } catch { /* ignore */ } document.documentElement.dataset.theme = t ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); })();
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !native()) navigator.serviceWorker.register('sw.js').catch(() => {});
(async () => { try { await refresh(); } catch { S.err = 'Brauzer xotirasi (IndexedDB) mavjud emas'; } render(); if (S.err) toast(S.err, true); })();
(window as any).__fur = { S, openDoc, refresh, render };

/** Android "orqaga" tugmasi uchun: true = ilova o'zi ishladi, false = ilovadan chiqish mumkin. */
(window as unknown as { __furBack: () => boolean }).__furBack = () => {
  const pres = (window as unknown as { __pres?: { exit(): void } }).__pres; if (document.querySelector('.pres') && pres) { pres.exit(); return true; }
  const ov = document.querySelector('.ov'); if (ov) { ov.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true; }
  if (S.view === 'edit') { S.view = 'doc'; render(); return true; }
  if (S.view === 'doc') { void closeDoc(); return true; }
  return false;
};
