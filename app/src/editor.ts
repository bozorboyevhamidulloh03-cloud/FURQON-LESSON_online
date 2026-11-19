import { Frag, cloneFrag, collectAssets, ensureAssets, fragHtml, fragText, getClip, setClip, sliceRuns, toBoardObjects, blockText } from './clip';
import { croppedEl, cropDialog } from './imgcrop';
import { Align, Block, FurDocument, FurPage, ImageBlock, ImageWrap, Run, TableBlock, TextBlock, allHave, normalizeRuns, patchRuns, plainText, replaceRange, runsLength, setFlag, splitRuns, uid } from '../../packages/fur-format/src/index';

export interface EditorHost { doc: FurDocument; page: FurPage; index: number; onChange(): void; focus?(u: number, v: number): void; toast(m: string, bad?: boolean): void; ask(t: string, v?: string, ok?: string): Promise<string | null> }
export interface EditorHandle { destroy(): void }
type Flag = 'b' | 'i' | 'u' | 's' | 'sup' | 'sub';
interface SavedSel { ak: string; ao: number; bk: string; bo: number }

const FONTS: [string, string][] = [['Standart', ''], ['Serif', 'Georgia, serif'], ['Mono', 'ui-monospace, Menlo, Consolas, monospace']];
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40];
const MARGIN = { narrow: 36, normal: 64, wide: 96 };
const ico = (d: string) => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const AL: Record<Align, string> = { left: ico('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'), center: ico('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'), right: ico('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'), justify: ico('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>') };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const PT: string = (() => { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'; })();

// ---- runs <-> DOM (DOM faqat o'zimiz yaratgan <span data-s> lardan iborat) ----
function renderRuns(el: HTMLElement, runs: Run[]) {
  el.textContent = '';
  for (const r of runs) {
    if (!r.t) continue;
    const n = document.createElement(r.href ? 'a' : 'span'); n.textContent = r.t; const { t: _t, ...st } = r; n.dataset.s = JSON.stringify(st);
    if (r.href) { (n as HTMLAnchorElement).href = r.href; (n as HTMLAnchorElement).target = '_blank'; (n as HTMLAnchorElement).rel = 'noopener noreferrer'; }
    if (r.b) n.style.fontWeight = '700'; if (r.i) n.style.fontStyle = 'italic';
    const dec = [r.u && 'underline', r.s && 'line-through'].filter(Boolean).join(' '); if (dec) n.style.textDecoration = dec;
    if (r.c) n.style.color = r.c; if (r.fs) n.style.fontSize = r.fs + 'px'; if (r.ff) n.style.fontFamily = r.ff;
    if (r.sup || r.sub) { n.style.verticalAlign = r.sup ? 'super' : 'sub'; n.style.fontSize = r.fs ? r.fs * 0.75 + 'px' : '0.75em'; }
    el.append(n);
  }
}
function domToRuns(el: HTMLElement): Run[] {
  const out: Run[] = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n: Node | null;
  while ((n = w.nextNode())) {
    const t = n.textContent || ''; if (!t) continue; let st: Partial<Run> = {};
    const h = n.parentElement?.closest<HTMLElement>('[data-s]');
    if (h && el.contains(h)) { try { st = JSON.parse(h.dataset.s!); } catch { /* plain */ } }
    out.push({ ...st, t });
  }
  return normalizeRuns(out);
}
function locate(el: HTMLElement, off: number): [Node, number] {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n: Node | null, c = 0, last: Node | null = null;
  while ((n = w.nextNode())) { const l = (n.textContent || '').length; if (off <= c + l) return [n, off - c]; c += l; last = n; }
  return last ? [last, (last.textContent || '').length] : [el, 0];
}
function offsetIn(el: HTMLElement, node: Node, off: number): number { const r = document.createRange(); r.selectNodeContents(el); r.setEnd(node, off); return r.toString().length; }

export function mountEditor(root: HTMLElement, h: EditorHost): EditorHandle {
  const blocks = h.page.blocks, doc = h.doc, L = () => doc.layout;
  root.innerHTML = `<div class="etools" id="etools"></div><div class="ectx" id="ectx" hidden></div><div class="escroll"><div class="paper" id="paper"><div class="phdr" id="phdr"></div><div class="pbody" id="pbody"></div><div class="pftr" id="pftr"></div></div></div><input type="file" id="eimg" accept="image/*" hidden>`;
  const tools = root.querySelector<HTMLElement>('#etools')!, ctx = root.querySelector<HTMLElement>('#ectx')!, paper = root.querySelector<HTMLElement>('#paper')!, body = root.querySelector<HTMLElement>('#pbody')!;
  const fileIn = root.querySelector<HTMLInputElement>('#eimg')!;
  const urls = new Map<string, string>(); let selImg: string | null = null, last: SavedSel | null = null, selMode = false, bsel: string[] = [];

  // ---- toolbar ----
  const btn = (cmd: string, label: string, title: string, extra = '') => `<button class="tb ${extra}" data-cmd="${cmd}" title="${title}" aria-label="${title}">${label}</button>`;
  tools.innerHTML = `<select id="tblock" aria-label="Blok turi"><option value="p">Oddiy matn</option><option value="h1">Sarlavha 1</option><option value="h2">Sarlavha 2</option><option value="h3">Sarlavha 3</option></select>
  <select id="tfont" aria-label="Shrift">${FONTS.map(([n, v]) => `<option value="${esc(v)}">${n}</option>`).join('')}</select>
  <select id="tsize" aria-label="O‘lcham"><option value="">Avto</option>${SIZES.map(s => `<option value="${s}">${s}</option>`).join('')}</select><span class="tsep"></span>
  ${btn('b', '<b>B</b>', 'Qalin (Ctrl+B)')}${btn('i', '<i>I</i>', 'Qiya (Ctrl+I)')}${btn('u', '<u>U</u>', 'Tagiga chizilgan (Ctrl+U)')}${btn('s', '<s>S</s>', 'Chizilgan')}${btn('sup', 'x<sup>2</sup>', 'Yuqori indeks')}${btn('sub', 'x<sub>2</sub>', 'Quyi indeks')}
  <label class="tb colr" title="Matn rangi"><span>A</span><input type="color" id="tcolor" value="#e03131"></label>${btn('link', ico('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'), 'Havola')}<span class="tsep"></span>
  ${(['left', 'center', 'right', 'justify'] as Align[]).map(a => btn('al-' + a, AL[a], 'Tekislash: ' + a)).join('')}<span class="tsep"></span>
  ${btn('bullet', ico('<circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/><path d="M10 7h10M10 12h10M10 17h10"/>'), 'Markerli ro‘yxat')}${btn('ordered', ico('<path d="M10 7h10M10 12h10M10 17h10M4 6h1v4M4 14h2l-2 3h2"/>'), 'Raqamli ro‘yxat')}${btn('outdent', ico('<path d="M10 6h10M10 12h10M10 18h10M7 9l-3 3 3 3"/>'), 'Chekinishni kamaytirish')}${btn('indent', ico('<path d="M10 6h10M10 12h10M10 18h10M4 9l3 3-3 3"/>'), 'Chekinishni oshirish')}<span class="tsep"></span>
  ${btn('table', ico('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>'), 'Jadval qo‘shish')}${btn('image', ico('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M4 18l5-5 4 4 3-3 4 4"/>'), 'Rasm qo‘shish')}<span class="tsep"></span>
  ${btn('undo', ico('<path d="M9 7L4 12l5 5M4 12h10a6 6 0 010 12"/>'), 'Bekor qilish (Ctrl+Z)')}${btn('redo', ico('<path d="M15 7l5 5-5 5M20 12H10a6 6 0 000 12"/>'), 'Qaytarish (Ctrl+Y)')}${btn('copy', ico('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>'), 'Nusxalash (Ctrl+C)')}${btn('cut', ico('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>'), 'Kesish (Ctrl+X)')}${btn('paste', ico('<path d="M9 4h6v3H9z"/><path d="M15 5h2a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h2"/>'), 'Qo‘yish (Ctrl+V)')}${btn('dsel', ico('<path d="M5 4h6M8 4v14M5 18h6"/><path d="M15 9l5 5-5 5" />'), 'Sudrab belgilash: barmoq bilan bir necha qatorni belgilash (qayta bosilsa o‘chadi)')}${btn('selmode', ico('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'), 'Belgilash rejimi: butun blokni (matn, rasm, jadval) belgilash')}${btn('find', ico('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'), 'Qidirish va almashtirish')}${btn('page', ico('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'), 'Sahifa sozlamalari')}`;
  const $ = <T extends HTMLElement>(id: string) => tools.querySelector<T>('#' + id)!;

  // ---- model yordamchilari ----
  const find = (id: string) => blocks.find(b => b.id === id);
  const topEl = (id: string): HTMLElement | null => (body.children[blocks.findIndex(b => b.id === id)] as HTMLElement) ?? null;
  const isText = (b: Block | undefined): b is TextBlock => !!b && (b.type === 'paragraph' || b.type === 'heading' || b.type === 'li');
  const eds = () => Array.from(body.querySelectorAll<HTMLElement>('.ed'));
  const edOf = (n: Node | null): HTMLElement | null => (n instanceof HTMLElement ? n : n?.parentElement ?? null)?.closest<HTMLElement>('.ed') ?? null;
  const keyOf = (el: HTMLElement) => [el.dataset.k, el.dataset.bid, el.dataset.r ?? '', el.dataset.c ?? ''].join(':');
  function getRuns(el: HTMLElement): Run[] {
    const b = find(el.dataset.bid!); if (!b) return [];
    if (b.type === 'table') return b.rows[+el.dataset.r!]?.[+el.dataset.c!] ?? [];
    if (b.type === 'image') return b.caption; return b.runs;
  }
  function setRuns(el: HTMLElement, runs: Run[]) {
    const b = find(el.dataset.bid!); if (!b) return;
    if (b.type === 'table') { const row = b.rows[+el.dataset.r!]; if (row) row[+el.dataset.c!] = runs; } else if (b.type === 'image') b.caption = runs; else b.runs = runs;
  }
  function saveSel(): SavedSel | null {
    const s = getSelection(); if (!s || !s.rangeCount) return null; const r = s.getRangeAt(0), a = edOf(r.startContainer), b = edOf(r.endContainer);
    if (!a || !b || !body.contains(a) || !body.contains(b)) return null;
    return { ak: keyOf(a), ao: offsetIn(a, r.startContainer, r.startOffset), bk: keyOf(b), bo: offsetIn(b, r.endContainer, r.endOffset) };
  }
  const findEd = (k: string) => eds().find(e => keyOf(e) === k) ?? null;
  function restoreSel(s: SavedSel | null) {
    if (!s || selMode) return; const a = findEd(s.ak), b = findEd(s.bk); if (!a || !b) return;
    const [an, ao] = locate(a, s.ao), [bn, bo] = locate(b, s.bo), r = document.createRange(); r.setStart(an, ao); r.setEnd(bn, bo);
    const g = getSelection()!; g.removeAllRanges(); g.addRange(r);
  }
  function caret(el: HTMLElement | null, off: number) { if (!el) return; el.focus(); restoreSel({ ak: keyOf(el), ao: off, bk: keyOf(el), bo: off }); }

  // ---- tarix ----
  let base = JSON.stringify(blocks); const undo: string[] = [], redo: string[] = []; let tm = 0;
  function checkpoint() { clearTimeout(tm); const s = JSON.stringify(blocks); if (s !== base) { undo.push(base); if (undo.length > 100) undo.shift(); base = s; redo.length = 0; } }
  function loadState(s: string) { blocks.splice(0, blocks.length, ...(JSON.parse(s) as Block[])); selImg = null; renderAll(); restoreSel(last); h.onChange(); }
  function doUndo() { checkpoint(); const p = undo.pop(); if (p === undefined) return; redo.push(base); base = p; loadState(p); }
  function doRedo() { checkpoint(); const p = redo.pop(); if (p === undefined) return; undo.push(base); base = p; loadState(p); }

  // ---- ko'rsatish ----
  function imgUrl(id: string): string {
    let u = urls.get(id); if (u) return u; const a = doc.assets.find(x => x.id === id); if (!a) return '';
    u = URL.createObjectURL(new Blob([a.data as unknown as BlobPart], { type: a.mime })); urls.set(id, u); return u;
  }
  function mkEd(el: HTMLElement, k: string, bid: string, runs: Run[]) { el.className = (el.className + ' ed').trim(); el.contentEditable = selMode ? 'false' : PT; el.dataset.k = k; el.dataset.bid = bid; renderRuns(el, runs); return el; }
  function renderAll() {
    body.textContent = ''; const counters: number[] = [0, 0, 0, 0];
    for (const b of blocks) {
      if (b.type !== 'li') counters.fill(0);
      if (isText(b)) {
        const el = document.createElement('div'); el.className = 'blk ' + (b.type === 'heading' ? 'h' + (b.level ?? 1) : b.type === 'li' ? 'li' : 'p'); if (b.align) el.style.textAlign = b.align;
        mkEd(el, 'blk', b.id, b.runs);
        if (b.type === 'li') {
          const ind = b.indent ?? 0; if (b.list === 'ordered') counters[ind]++; else counters[ind] = 0; for (let k = ind + 1; k < 4; k++) counters[k] = 0;
          const w = document.createElement('div'); w.className = 'liw'; w.style.marginLeft = ind * 28 + 'px';
          const mk = document.createElement('span'); mk.className = 'mk'; mk.contentEditable = 'false'; mk.textContent = b.list === 'ordered' ? counters[ind] + '.' : ind % 2 ? '◦' : '•';
          w.append(mk, el); body.append(w);
        } else body.append(el);
      } else if (b.type === 'table') {
        const w = document.createElement('div'); w.className = 'tblw'; const t = document.createElement('table'); t.dataset.bid = b.id;
        b.rows.forEach((row, r) => { const tr = document.createElement('tr'); row.forEach((cell, c) => { const td = document.createElement(b.header && r === 0 ? 'th' : 'td'); mkEd(td, 'cell', b.id, cell); td.dataset.r = String(r); td.dataset.c = String(c); tr.append(td); }); t.append(tr); });
        w.append(t); body.append(w);
      } else {
        const wr = b.wrap ?? 'block', abs = wr === 'behind' || wr === 'front';
        const f = document.createElement('figure'); f.className = 'imgf w-' + wr + (selImg === b.id ? ' sel' : ''); f.dataset.fid = b.id; f.style.textAlign = b.align;
        if (abs) { f.style.left = `calc(var(--pad) + (100% - 2 * var(--pad)) * ${(b.x ?? 0) / 100})`; f.style.top = (b.y ?? 0) + 'px'; f.style.width = `calc((100% - 2 * var(--pad)) * ${b.w / 100})`; }
        else if (wr === 'left' || wr === 'right') f.style.width = b.w + '%';
        const im = document.createElement('img'); im.src = imgUrl(b.a); im.alt = ''; im.draggable = false; f.append(croppedEl(im, b.crop, wr === 'block' ? b.w + '%' : '100%'));
        if (selImg === b.id) { const hd = document.createElement('div'); hd.className = 'imgh'; hd.title = 'Sudrab ko‘chirish'; hd.textContent = '✥'; const rz = document.createElement('div'); rz.className = 'imgz'; rz.title = 'O‘lchamini o‘zgartirish'; f.append(hd, rz); }
        const cap = document.createElement('figcaption'); cap.className = 'cap'; mkEd(cap, 'cap', b.id, b.caption); f.append(cap); body.append(f);
      }
    }
    if (!blocks.length) { blocks.push({ id: uid('b'), type: 'paragraph', runs: [] }); renderAll(); return; }
    body.classList.toggle('selmode', selMode); if (selMode) bsel.forEach(id => topEl(id)?.classList.add('bsel'));
    const l = L(); paper.style.setProperty('--pad', MARGIN[l.margin] + 'px');
    root.querySelector<HTMLElement>('#phdr')!.textContent = l.header;
    root.querySelector<HTMLElement>('#pftr')!.innerHTML = `<span>${esc(l.footer)}</span><span>${l.pageNumbers ? h.index + 1 : ''}</span>`;
    updateState();
  }

  // ---- amallar ----
  function done() { checkpoint(); h.onChange(); updateState(); reportFocus(); }
  function mutate(fn: () => void) { checkpoint(); const ss = saveSel() ?? last; fn(); renderAll(); restoreSel(ss); done(); }
  function selectedEds(): HTMLElement[] { const ss = saveSel() ?? last; if (!ss) return []; const l = eds(), a = l.findIndex(e => keyOf(e) === ss.ak), b = l.findIndex(e => keyOf(e) === ss.bk); return a < 0 || b < 0 ? [] : l.slice(Math.min(a, b), Math.max(a, b) + 1); }
  function selectedTextBlocks(): TextBlock[] { const seen = new Set<string>(), out: TextBlock[] = []; for (const e of selectedEds()) { const b = find(e.dataset.bid!); if (e.dataset.k === 'blk' && isText(b) && !seen.has(b.id)) { seen.add(b.id); out.push(b); } } return out; }
  function inline(fn: (runs: Run[], s: number, e: number) => Run[], needSel = true) {
    const ss = saveSel() ?? last; if (!ss) return; const list = eds(), ia = list.findIndex(e => keyOf(e) === ss.ak), ib = list.findIndex(e => keyOf(e) === ss.bk);
    if (ia < 0 || ib < 0) return; if (needSel && ia === ib && ss.ao === ss.bo) return h.toast('Avval matnni belgilang');
    checkpoint();
    for (let i = ia; i <= ib; i++) { const el = list[i], runs = getRuns(el), s = i === ia ? ss.ao : 0, e = i === ib ? ss.bo : runsLength(runs); if (e > s) { setRuns(el, fn(runs, s, e)); renderRuns(el, getRuns(el)); } }
    restoreSel(ss); done();
  }
  function toggle(k: Flag) {
    const ss = saveSel() ?? last; if (!ss) return; const list = eds(), ia = list.findIndex(e => keyOf(e) === ss.ak), ib = list.findIndex(e => keyOf(e) === ss.bk); if (ia < 0 || ib < 0) return;
    let all = true; for (let i = ia; i <= ib; i++) { const runs = getRuns(list[i]), s = i === ia ? ss.ao : 0, e = i === ib ? ss.bo : runsLength(runs); if (e > s && !allHave(runs, s, e, k)) all = false; }
    inline((r, s, e) => patchRuns(r, s, e, x => setFlag(x, k, !all)));
  }
  const setBlocks = (fn: (b: TextBlock) => void) => { const t = selectedTextBlocks(); if (t.length) mutate(() => t.forEach(fn)); };
  function toggleList(kind: 'bullet' | 'ordered') {
    const t = selectedTextBlocks(); if (!t.length) return; const all = t.every(b => b.type === 'li' && b.list === kind);
    mutate(() => t.forEach(b => { if (all) { b.type = 'paragraph'; delete b.list; delete b.indent; } else { b.type = 'li'; b.list = kind; b.indent ??= 0; delete b.level; } }));
  }
  function blockStyle(v: string) { setBlocks(b => { delete b.list; delete b.indent; if (v === 'p') { b.type = 'paragraph'; delete b.level; } else { b.type = 'heading'; b.level = Number(v[1]) as 1 | 2 | 3; } }); }
  function curCell(): { b: TableBlock; r: number; c: number } | null { const s = saveSel() ?? last; const el = s ? findEd(s.ak) : null; if (!el || el.dataset.k !== 'cell') return null; const b = find(el.dataset.bid!); return b?.type === 'table' ? { b, r: +el.dataset.r!, c: +el.dataset.c! } : null; }
  const emptyRow = (n: number): Run[][] => Array.from({ length: n }, () => [] as Run[]);
  function insertAfterCurrent(nb: Block) {
    const ss = saveSel() ?? last, el = ss ? findEd(ss.ak) : null, i = el ? blocks.findIndex(b => b.id === el.dataset.bid) : blocks.length - 1;
    checkpoint(); blocks.splice(i + 1, 0, nb); renderAll(); done();
  }
  async function insertTable() {
    const v = await h.ask('Jadval o‘lchami (qator × ustun)', '3x3', 'Qo‘shish'); if (!v) return; const m = v.toLowerCase().match(/^\s*(\d{1,2})\s*[x×*,\s]\s*(\d{1,2})\s*$/);
    if (!m || +m[1] < 1 || +m[2] < 1 || +m[1] > 50 || +m[2] > 12) return h.toast('Masalan: 3x4 (1-50 qator, 1-12 ustun)', true);
    const tid = uid('b'); insertAfterCurrent({ id: tid, type: 'table', header: true, rows: Array.from({ length: +m[1] }, () => emptyRow(+m[2])) }); caret(findEd(`cell:${tid}:0:0`), 0);
  }
  async function addImage(file: File) {
    try {
      const u = URL.createObjectURL(file), im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Rasm ochilmadi')); i.src = u; });
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const g = c.getContext('2d')!; if (!/png|webp|gif/.test(file.type)) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      const png = /png|webp|gif/.test(file.type), blob = await new Promise<Blob | null>(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.88)); if (!blob) throw new Error('Rasm siqilmadi');
      const id = uid('a'); doc.assets.push({ id, mime: png ? 'image/png' : 'image/jpeg', data: new Uint8Array(await blob.arrayBuffer()) });
      insertAfterCurrent({ id: uid('b'), type: 'image', a: id, w: 60, align: 'center', caption: [] });
    } catch (e) { h.toast('Rasm qo‘shilmadi: ' + (e as Error).message, true); }
  }
  async function makeLink() {
    const ss = saveSel() ?? last; if (!ss || (ss.ak === ss.bk && ss.ao === ss.bo)) return h.toast('Avval matnni belgilang');
    const v = await h.ask('Havola manzili (bo‘sh = olib tashlash)', 'https://'); if (v === null) return; const ok = /^(https?:|mailto:)/i.test(v.trim());
    if (v.trim() && v.trim() !== 'https://' && !ok) return h.toast('Havola http://, https:// yoki mailto: bilan boshlansin', true);
    const href = v.trim() === 'https://' ? '' : v.trim(); restoreSel(ss); inline((r, s, e) => patchRuns(r, s, e, x => { const y = { ...x }; if (href) { y.href = href; y.u = true; y.c = '#2a6fdb'; } else { delete y.href; delete y.c; delete y.u; } return y; }));
  }
  function modal(html: string, wire: (b: HTMLElement, close: () => void) => void) {
    const ov = document.createElement('div'); ov.className = 'ov'; ov.innerHTML = `<div class="dlg" role="dialog">${html}</div>`; document.body.append(ov);
    const close = () => { ov.remove(); document.removeEventListener('keydown', k); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k); ov.addEventListener('mousedown', e => { if (e.target === ov) close(); }); wire(ov.querySelector('.dlg') as HTMLElement, close);
  }
  function findReplace() {
    modal(`<h3>Qidirish va almashtirish</h3><input class="txt" id="fq" placeholder="Qidirish"><div style="height:8px"></div><input class="txt" id="fr" placeholder="Almashtirish"><p class="mut" id="fc"></p><div class="row"><button class="btn" id="fx">Yopish</button><button class="btn pri" id="fa">Hammasini almashtirish</button></div>`, (b, close) => {
      const q = b.querySelector<HTMLInputElement>('#fq')!, r = b.querySelector<HTMLInputElement>('#fr')!, c = b.querySelector<HTMLElement>('#fc')!; q.focus();
      const count = () => { const s = q.value.toLowerCase(); let n = 0; if (s) for (const e of eds()) { const t = plainText(getRuns(e)).toLowerCase(); for (let i = t.indexOf(s); i >= 0; i = t.indexOf(s, i + s.length)) n++; } c.textContent = s ? `${n} ta topildi (shu sahifada)` : ''; return n; };
      q.addEventListener('input', count);
      b.querySelector('#fx')!.addEventListener('click', close);
      b.querySelector('#fa')!.addEventListener('click', () => {
        const s = q.value; if (!s) return; const n = count(); if (!n) return; checkpoint();
        for (const e of eds()) { let runs = getRuns(e); const t = plainText(runs).toLowerCase(), pos: number[] = []; for (let i = t.indexOf(s.toLowerCase()); i >= 0; i = t.indexOf(s.toLowerCase(), i + s.length)) pos.push(i); for (const p of pos.reverse()) runs = replaceRange(runs, p, p + s.length, r.value); if (pos.length) setRuns(e, runs); }
        close(); renderAll(); done(); h.toast(`${n} ta almashtirildi`);
      });
    });
  }
  function pageSettings() {
    const l = L();
    modal(`<h3>Sahifa sozlamalari</h3><label class="fl">Chekka (margin)<select id="pm"><option value="narrow">Tor</option><option value="normal">O‘rtacha</option><option value="wide">Keng</option></select></label><label class="fl">Yuqori kolontitul<input class="txt" id="ph" maxlength="200"></label><label class="fl">Pastki kolontitul<input class="txt" id="pf" maxlength="200"></label><label class="fl ck"><input type="checkbox" id="pn"> Sahifa raqamini ko‘rsatish</label><div class="row"><button class="btn" id="px">Bekor</button><button class="btn pri" id="ps">Saqlash</button></div>`, (b, close) => {
      (b.querySelector('#pm') as HTMLSelectElement).value = l.margin; (b.querySelector('#ph') as HTMLInputElement).value = l.header; (b.querySelector('#pf') as HTMLInputElement).value = l.footer; (b.querySelector('#pn') as HTMLInputElement).checked = l.pageNumbers;
      b.querySelector('#px')!.addEventListener('click', close);
      b.querySelector('#ps')!.addEventListener('click', () => { doc.layout = { margin: (b.querySelector('#pm') as HTMLSelectElement).value as 'narrow', header: (b.querySelector('#ph') as HTMLInputElement).value, footer: (b.querySelector('#pf') as HTMLInputElement).value, pageNumbers: (b.querySelector('#pn') as HTMLInputElement).checked }; close(); renderAll(); h.onChange(); });
    });
  }

  // ---- klaviatura ----
  function split(el: HTMLElement, b: TextBlock) {
    const g = saveSel(); if (!g || g.ak !== g.bk) return; b.runs = domToRuns(el); checkpoint();
    if (b.type === 'li' && !b.runs.length) { b.type = 'paragraph'; delete b.list; delete b.indent; renderAll(); caret(findEd(keyOf(el)), 0); return done(); }
    const [l] = splitRuns(b.runs, g.ao), [, r] = splitRuns(b.runs, g.bo); b.runs = l;
    const nb: TextBlock = { id: uid('b'), type: b.type === 'heading' ? 'paragraph' : b.type, runs: r }; if (b.type === 'li') { nb.list = b.list; nb.indent = b.indent; } if (b.align) nb.align = b.align;
    blocks.splice(blocks.findIndex(x => x.id === b.id) + 1, 0, nb); renderAll(); caret(findEd('blk:' + nb.id + ':' + '' + ':'), 0); done();
  }
  function backspace(e: KeyboardEvent, el: HTMLElement, b: TextBlock) {
    const g = saveSel(); if (!g || g.ak !== g.bk || g.ao !== 0 || g.bo !== 0) return; e.preventDefault(); b.runs = domToRuns(el); checkpoint();
    if (b.type !== 'paragraph') { b.type = 'paragraph'; delete b.list; delete b.indent; delete b.level; renderAll(); caret(findEd(keyOf(el)), 0); return done(); }
    const i = blocks.findIndex(x => x.id === b.id), p = blocks[i - 1]; if (!p) return;
    if (isText(p)) { const n = runsLength(p.runs); p.runs = normalizeRuns([...p.runs, ...b.runs]); blocks.splice(i, 1); renderAll(); caret(findEd('blk:' + p.id + ':' + '' + ':'), n); done(); }
    else if (!b.runs.length) { blocks.splice(i, 1); renderAll(); done(); }
  }
  body.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), el = edOf(e.target as Node);
    if (ctrl && (k === 'b' || k === 'i' || k === 'u')) { e.preventDefault(); return toggle(k as Flag); }
    if (ctrl && k === 'a' && !selMode) { e.preventDefault(); return selectAllText(); }
    if (!el) { if (selImg && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); delBlock(selImg); } return; }
    const b = el.dataset.k === 'blk' ? find(el.dataset.bid!) : undefined, blk = isText(b) ? b : undefined;
    if (e.key === 'Enter') { if (e.shiftKey || el.dataset.k === 'cell') { e.preventDefault(); document.execCommand('insertText', false, '\n'); } else { e.preventDefault(); if (blk) split(el, blk); } }
    else if (e.key === 'Backspace' && blk) backspace(e, el, blk);
    else if (e.key === 'Tab') {
      e.preventDefault();
      if (blk?.type === 'li') { blk.indent = Math.max(0, Math.min(3, (blk.indent ?? 0) + (e.shiftKey ? -1 : 1))); mutate(() => {}); }
      else if (el.dataset.k === 'cell') { const c = curCell(); if (!c) return; const cols = c.b.rows[0].length; let r = c.r, cc = c.c + (e.shiftKey ? -1 : 1); if (cc >= cols) { cc = 0; r++; } if (cc < 0) { cc = cols - 1; r--; } if (r >= c.b.rows.length) { checkpoint(); c.b.rows.push(emptyRow(cols)); renderAll(); done(); } if (r >= 0) caret(findEd(`cell:${c.b.id}:${r}:${cc}`), 0); }
    }
  });
  const onDocKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || document.querySelector('.ov')) return; const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); }
  };
  document.addEventListener('keydown', onDocKey);
  body.addEventListener('beforeinput', e => { if ((e as InputEvent).inputType === 'historyUndo') { e.preventDefault(); doUndo(); } else if ((e as InputEvent).inputType === 'historyRedo') { e.preventDefault(); doRedo(); } });
  body.addEventListener('input', e => { const el = edOf(e.target as Node); if (!el) return; setRuns(el, domToRuns(el)); clearTimeout(tm); tm = window.setTimeout(checkpoint, 500); h.onChange(); reportFocus(); });
  body.addEventListener('paste', e => {
    e.preventDefault(); const cd = e.clipboardData, img = Array.from(cd?.files ?? []).find(f => f.type.startsWith('image/')); if (img) return void addImage(img);
    const text = (cd?.getData('text/plain') ?? '').replace(/\r\n/g, '\n'), c = getClip();
    if (c && c.text.replace(/\r\n/g, '\n') === text) return pasteFrag(c.frag);
    const raw = cd?.getData('application/x-fur'); if (raw) { try { const j = JSON.parse(raw) as { b: Block[]; sp: boolean; ep: boolean }; return pasteFrag({ blocks: j.b, startPartial: !!j.sp, endPartial: !!j.ep, assets: [] }); } catch { /* oddiy matn */ } }
    if (text) pastePlain(text);
  });
  body.addEventListener('dragover', e => e.preventDefault());
  body.addEventListener('drop', e => { e.preventDefault(); const f = Array.from(e.dataTransfer?.files ?? []).find(x => x.type.startsWith('image/')); if (f) void addImage(f); });
  body.addEventListener('mousedown', e => { if (selMode) return; const f = (e.target as HTMLElement).closest<HTMLElement>('.imgf'); const nid = f && !(e.target as HTMLElement).closest('.cap') ? f.dataset.fid! : null; if (nid !== selImg) { selImg = nid; const ss = saveSel(); renderAll(); if (!nid) restoreSel(ss); updateState(); } if (nid) { body.focus(); getSelection()?.removeAllRanges(); } });
  body.tabIndex = -1; body.style.outline = 'none';
  const WRAPS: [ImageWrap, string, string][] = [['block', 'Matn bilan', 'O‘z qatorida (tepa va past)'], ['left', 'Chapga o‘rash', 'Rasm chapda, matn o‘rab oladi'], ['right', 'O‘ngga o‘rash', 'Rasm o‘ngda, matn o‘rab oladi'], ['behind', 'Matn ortida', 'Matn rasm ustida turadi'], ['front', 'Matn ustida', 'Rasm matn ustida, istalgan joyga']];
  function setWrap(ib: ImageBlock, wr: ImageWrap) {
    const fig = body.querySelector<HTMLElement>(`[data-fid="${ib.id}"]`), was = ib.wrap ?? 'block', abs = wr === 'behind' || wr === 'front';
    let px = ib.x ?? 0, py = ib.y ?? 0;
    if (abs && fig && !(was === 'behind' || was === 'front')) { const cw = Math.max(1, body.clientWidth - 2 * padPx()); px = Math.max(0, Math.min(100 - ib.w, (fig.offsetLeft - padPx()) / cw * 100)); py = Math.max(0, Math.min(fig.offsetTop, body.clientHeight - fig.offsetHeight)); }
    mutate(() => { if (wr === 'block') delete ib.wrap; else ib.wrap = wr; if (abs) { ib.x = Math.round(px * 10) / 10; ib.y = Math.round(py); } else { delete ib.x; delete ib.y; } if (wr === 'left' || wr === 'right') ib.w = Math.min(ib.w, 60); });
  }
  const padPx = () => parseFloat(getComputedStyle(body).paddingLeft) || 0;
  // sudrab ko'chirish / o'lchamini o'zgartirish
  body.addEventListener('pointerdown', e => {
    const t = e.target as HTMLElement, hd = t.closest<HTMLElement>('.imgh'), rz = t.closest<HTMLElement>('.imgz'), fig = t.closest<HTMLElement>('.imgf'); if (!fig || (!hd && !rz && !(fig.classList.contains('w-front') && fig.classList.contains('sel') && !t.closest('.cap')))) return;
    const ib = find(fig.dataset.fid!); if (ib?.type !== 'image') return; e.preventDefault(); fig.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, bw = Math.max(1, body.clientWidth - 2 * padPx()), abs = ib.wrap === 'behind' || ib.wrap === 'front', x0 = ib.x ?? 0, y0 = ib.y ?? 0, w0 = ib.w; let nx = x0, ny = y0, nw = w0, moved = false, dropAt = -1;
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy; if (Math.hypot(dx, dy) > 3) moved = true;
      if (rz) { nw = Math.max(8, Math.min(100, w0 + dx / bw * 100)); if (abs) fig.style.width = `calc((100% - 2 * var(--pad)) * ${nw / 100})`; else if (ib.wrap) fig.style.width = nw + '%'; else (fig.querySelector('img') as HTMLElement).style.width = nw + '%'; }
      else if (abs) { nx = Math.max(0, Math.min(100 - w0, x0 + dx / bw * 100)); ny = Math.max(0, Math.min(Math.max(0, body.clientHeight - fig.offsetHeight), y0 + dy)); fig.style.left = `calc(var(--pad) + (100% - 2 * var(--pad)) * ${nx / 100})`; fig.style.top = ny + 'px'; }
      else { fig.style.transform = `translateY(${dy}px)`; fig.style.opacity = '.6'; const r = body.getBoundingClientRect(); const kids = Array.from(body.children).filter(c => c !== fig && !(c as HTMLElement).classList.contains('w-behind') && !(c as HTMLElement).classList.contains('w-front')); dropAt = kids.length; for (let k = 0; k < kids.length; k++) { const q = kids[k].getBoundingClientRect(); if (ev.clientY < q.top + q.height / 2) { dropAt = k; break; } } void r; }
    };
    const up = () => {
      fig.removeEventListener('pointermove', mv); fig.removeEventListener('pointerup', up); fig.removeEventListener('pointercancel', up); fig.style.transform = ''; fig.style.opacity = '';
      if (!moved) return;
      if (rz) mutate(() => { ib.w = Math.round(nw); });
      else if (abs) mutate(() => { ib.x = Math.round(nx * 10) / 10; ib.y = Math.round(ny); });
      else if (dropAt >= 0) { const kids = Array.from(body.children).filter(c => c !== fig && !(c as HTMLElement).classList.contains('w-behind') && !(c as HTMLElement).classList.contains('w-front')); const bidOf = (c: Element | undefined): string | null => c ? ((c as HTMLElement).dataset.bid ?? (c as HTMLElement).dataset.fid ?? c.querySelector<HTMLElement>('[data-bid]')?.dataset.bid ?? null) : null; const target = bidOf(kids[dropAt]); mutate(() => { const i = blocks.indexOf(ib); blocks.splice(i, 1); const j = target ? blocks.findIndex(b => b.id === target) : blocks.length; blocks.splice(j < 0 ? blocks.length : j, 0, ib); }); }
    };
    fig.addEventListener('pointermove', mv); fig.addEventListener('pointerup', up); fig.addEventListener('pointercancel', up);
  });
  function delBlock(id: string) { checkpoint(); const i = blocks.findIndex(b => b.id === id); if (i < 0) return; blocks.splice(i, 1); selImg = null; renderAll(); done(); }

  // ---- toolbar va kontekst panel ----
  tools.addEventListener('mousedown', e => { if (!(e.target as HTMLElement).closest('select,input')) e.preventDefault(); });
  ctx.addEventListener('mousedown', e => e.preventDefault());
  tools.addEventListener('click', e => {
    const bt = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]'); if (!bt) return; const c = bt.dataset.cmd!;
    if (c === 'b' || c === 'i' || c === 'u' || c === 's' || c === 'sup' || c === 'sub') toggle(c);
    else if (c.startsWith('al-')) { const a = c.slice(3) as Align; const ib = selImg ? find(selImg) : undefined; if (ib?.type === 'image') mutate(() => { ib.align = a; }); else setBlocks(b => { if (a === 'left') delete b.align; else b.align = a; }); }
    else if (c === 'bullet' || c === 'ordered') toggleList(c); else if (c === 'indent' || c === 'outdent') setBlocks(b => { if (b.type === 'li') b.indent = Math.max(0, Math.min(3, (b.indent ?? 0) + (c === 'indent' ? 1 : -1))); });
    else if (c === 'link') void makeLink(); else if (c === 'table') void insertTable(); else if (c === 'image') fileIn.click();
    else if (c === 'copy') doCopy(false); else if (c === 'cut') doCopy(true); else if (c === 'paste') pasteClip(); else if (c === 'selmode') setSelMode(!selMode); else if (c === 'dsel') setDragSel(!dragSel);
    else if (c === 'undo') doUndo(); else if (c === 'redo') doRedo(); else if (c === 'find') findReplace(); else if (c === 'page') pageSettings();
  });
  $('tblock').addEventListener('change', e => { blockStyle((e.target as HTMLSelectElement).value); restoreSel(last); });
  $('tsize').addEventListener('change', e => { const v = Number((e.target as HTMLSelectElement).value); inline((r, s, en) => patchRuns(r, s, en, x => { const y = { ...x }; if (v) y.fs = v; else delete y.fs; return y; })); });
  $('tfont').addEventListener('change', e => { const v = (e.target as HTMLSelectElement).value; inline((r, s, en) => patchRuns(r, s, en, x => { const y = { ...x }; if (v) y.ff = v; else delete y.ff; return y; })); });
  $('tcolor').addEventListener('change', e => { const v = (e.target as HTMLInputElement).value; inline((r, s, en) => patchRuns(r, s, en, x => ({ ...x, c: v }))); });
  fileIn.addEventListener('change', () => { const f = fileIn.files?.[0]; fileIn.value = ''; if (f) void addImage(f); });
  ctx.addEventListener('click', e => {
    const bt = (e.target as HTMLElement).closest<HTMLElement>('[data-x]'); if (!bt) return; const x = bt.dataset.x!, c = curCell(), ib = selImg ? find(selImg) : undefined;
    if (x === 'copy') return void doCopy(false); if (x === 'cut') return void doCopy(true); if (x === 'paste') return pasteClip(); if (x === 'up') return extend(-1); if (x === 'down') return extend(1);
    if (x === 'all') { if (selMode) { bsel = blocks.map(b => b.id); renderAll(); syncBselLast(); updateState(); } else selectAllText(); return; }
    if (x === 'send') return sendDialog(); if (x === 'selx') return setSelMode(false); if (x === 'delsel') return deleteSource();
    if (ib?.type === 'image') {
      if (x === 'del') return delBlock(ib.id);
      if (x === 'crop') { const a = doc.assets.find(z => z.id === ib.a); if (!a) return; const u = URL.createObjectURL(new Blob([a.data as BlobPart], { type: a.mime })); void cropDialog(u, ib.crop).then(r => { URL.revokeObjectURL(u); if (r === undefined) return; mutate(() => { if (r) ib.crop = r; else delete ib.crop; }); }); return; }
      if (x.startsWith('wrap:')) return setWrap(ib, x.slice(5) as ImageWrap);
      if (x === 'mvup' || x === 'mvdn') { const i = blocks.indexOf(ib), j = i + (x === 'mvup' ? -1 : 1); if (j < 0 || j >= blocks.length) return; mutate(() => { blocks.splice(i, 1); blocks.splice(j, 0, ib); }); return; }
      if (x.startsWith('w')) mutate(() => { (ib as ImageBlock).w = Number(x.slice(1)); }); return;
    }
    if (!c) return; const cols = c.b.rows[0].length;
    mutate(() => {
      if (x === 'addr') c.b.rows.splice(c.r + 1, 0, emptyRow(cols)); else if (x === 'addc') c.b.rows.forEach(r => r.splice(c.c + 1, 0, [])); else if (x === 'delr' && c.b.rows.length > 1) c.b.rows.splice(c.r, 1);
      else if (x === 'delc' && cols > 1) c.b.rows.forEach(r => r.splice(c.c, 1)); else if (x === 'head') c.b.header = !c.b.header; else if (x === 'del') blocks.splice(blocks.indexOf(c.b), 1);
    });
  });
  function updateState() {
    const ss = saveSel(); if (ss) last = ss; const cur = ss ?? last, el = cur ? findEd(cur.ak) : null, b = el ? find(el.dataset.bid!) : undefined;
    const sb = $('tblock') as HTMLSelectElement; sb.value = isText(b) && b.type === 'heading' ? 'h' + (b.level ?? 1) : 'p';
    const runs = el ? getRuns(el) : [], a = cur ? Math.min(cur.ao, cur.bo) : 0, z = cur ? Math.max(cur.ao, cur.bo) : 0, same = !!cur && cur.ak === cur.bk;
    const flag = (k: Flag) => same && runs.length ? (z > a ? allHave(runs, a, z, k) : a > 0 && allHave(runs, a - 1, a, k)) : false;
    (['b', 'i', 'u', 's', 'sup', 'sub'] as Flag[]).forEach(k => tools.querySelector(`[data-cmd="${k}"]`)?.classList.toggle('on', flag(k)));
    tools.querySelector('[data-cmd="bullet"]')?.classList.toggle('on', isText(b) && b.type === 'li' && b.list === 'bullet'); tools.querySelector('[data-cmd="ordered"]')?.classList.toggle('on', isText(b) && b.type === 'li' && b.list === 'ordered');
    (['left', 'center', 'right', 'justify'] as Align[]).forEach(al => tools.querySelector(`[data-cmd="al-${al}"]`)?.classList.toggle('on', (isText(b) ? (b.align ?? 'left') : b?.type === 'image' ? b.align : 'left') === al));
    const ib = selImg ? find(selImg) : undefined;
    const SEL = (n: string) => `<b>${n}</b><button class="tb" data-x="copy">Nusxa</button><button class="tb" data-x="cut">Kesish</button><button class="tb" data-x="paste">Qo‘yish</button><button class="tb" data-x="up" title="Belgilashni yuqoriga kengaytirish">↑ qator</button><button class="tb" data-x="down" title="Belgilashni pastga kengaytirish">↓ qator</button><button class="tb" data-x="all">Hammasi</button><button class="tb" data-x="send">Boshqa sahifaga…</button>`;
    if (selMode) { ctx.hidden = false; ctx.innerHTML = SEL(bsel.length + ' ta blok') + '<button class="tb dng" data-x="delsel">O‘chirish</button><button class="tb" data-x="selx">Tugatish</button>'; }
    else if (ib?.type === 'image') { ctx.hidden = false; const wr = ib.wrap ?? 'block'; ctx.innerHTML = `<b>Rasm</b>${WRAPS.map(([k, t, tt]) => `<button class="tb ${wr === k ? 'on' : ''}" data-x="wrap:${k}" title="${tt}">${t}</button>`).join('')}<span class="tsep"></span>${[25, 50, 75, 100].map(w => `<button class="tb ${Math.round(ib.w) === w ? 'on' : ''}" data-x="w${w}">${w}%</button>`).join('')}<span class="tsep"></span><button class="tb ${ib.crop ? 'on' : ''}" data-x="crop" title="Rasmni qirqish">✂ Qirqish</button><span class="tsep"></span><button class="tb" data-x="mvup" title="Yuqoriga">▲</button><button class="tb" data-x="mvdn" title="Pastga">▼</button><span class="tsep"></span><button class="tb" data-x="copy">Nusxa</button><button class="tb" data-x="cut">Kesish</button><button class="tb" data-x="send">Boshqa sahifaga…</button><button class="tb dng" data-x="del">O‘chirish</button>`; }
    else if (b?.type === 'table') { ctx.hidden = false; ctx.innerHTML = `<b>Jadval</b><button class="tb" data-x="addr">+ Qator</button><button class="tb" data-x="addc">+ Ustun</button><button class="tb" data-x="delr">− Qator</button><button class="tb" data-x="delc">− Ustun</button><button class="tb ${b.header ? 'on' : ''}" data-x="head">Sarlavha qatori</button><button class="tb dng" data-x="del">Jadvalni o‘chirish</button>`; }
    else if (cur && !(cur.ak === cur.bk && cur.ao === cur.bo) && ss) { ctx.hidden = false; ctx.innerHTML = SEL('Belgilangan'); }
    else ctx.hidden = true;
  }

  // ---- belgilash, nusxa/qo'yish, ko'p blokli o'chirish, boshqa sahifaga ----
  const idxK = (k: string) => eds().findIndex(e => keyOf(e) === k);
  function fragFromBlocks(ids: string[]): Frag | null { const bl = blocks.filter(b => ids.includes(b.id)); return bl.length ? { blocks: JSON.parse(JSON.stringify(bl)) as Block[], startPartial: false, endPartial: false, assets: collectAssets(doc, bl) } : null; }
  function fragFromSel(): Frag | null {
    if (selMode) return fragFromBlocks(bsel); if (selImg) return fragFromBlocks([selImg]);
    const ss = saveSel() ?? last; if (!ss || (ss.ak === ss.bk && ss.ao === ss.bo)) return null;
    const list = eds(), ia = idxK(ss.ak), ib = idxK(ss.bk); if (ia < 0 || ib < 0) return null;
    const out: Block[] = [], seen = new Set<string>();
    for (let i = ia; i <= ib; i++) {
      const el = list[i], b = find(el.dataset.bid!); if (!b) continue; const runs = getRuns(el), len = runsLength(runs), st = i === ia ? ss.ao : 0, en = i === ib ? ss.bo : len;
      if (el.dataset.k === 'blk' && isText(b)) { if (en < st) continue; const sl = sliceRuns(runs, st, en); out.push(st === 0 && en === len ? { ...JSON.parse(JSON.stringify(b)), runs: sl } : { id: uid('b'), type: 'paragraph', runs: sl }); }
      else if (el.dataset.k === 'cell' && b.type === 'table') {
        if (seen.has(b.id)) continue; const te = list.filter(x => x.dataset.bid === b.id);
        if (te.every(x => { const k = list.indexOf(x); return k >= ia && k <= ib; })) { seen.add(b.id); out.push(JSON.parse(JSON.stringify(b))); } else if (en > st) out.push({ id: uid('b'), type: 'paragraph', runs: sliceRuns(runs, st, en) });
      } else if (el.dataset.k === 'cap' && b.type === 'image' && !seen.has(b.id)) { seen.add(b.id); out.push(JSON.parse(JSON.stringify(b))); }
    }
    if (!out.length) return null; const one = ia === ib; return { blocks: out, startPartial: one || (list[ia].dataset.k === 'blk' && !(ss.ao === 0)), endPartial: one || (() => { const e2 = list[ib]; return e2.dataset.k === 'blk' && ss.bo < runsLength(getRuns(e2)); })(), assets: collectAssets(doc, out) };
  }
  function deleteRange(ss: SavedSel): { k: string; o: number } {
    const list = eds(), ia = idxK(ss.ak), ib = idxK(ss.bk);
    if (ia === ib) { const el = list[ia]; setRuns(el, replaceRange(getRuns(el), ss.ao, ss.bo, '')); return { k: ss.ak, o: ss.ao }; }
    const first = list[ia], le = list[ib], fb = find(first.dataset.bid!), lb = find(le.dataset.bid!);
    if (first.dataset.k === 'blk' && le.dataset.k === 'blk' && isText(fb) && isText(lb)) {
      const left = sliceRuns(getRuns(first), 0, ss.ao), right = sliceRuns(getRuns(le), ss.bo, runsLength(getRuns(le))), fi = blocks.indexOf(fb), li = blocks.indexOf(lb);
      fb.runs = normalizeRuns([...left, ...right]); blocks.splice(fi + 1, li - fi); return { k: keyOf(first), o: runsLength(left) };
    }
    for (let i = ia; i <= ib; i++) { const el = list[i], runs = getRuns(el), len = runsLength(runs), st = i === ia ? ss.ao : 0, en = i === ib ? ss.bo : len; if (en > st) setRuns(el, replaceRange(runs, st, en, '')); }
    return { k: ss.ak, o: ss.ao };
  }
  function pasteFrag(f0: Frag) {
    const ss = saveSel() ?? last; if (!ss) return h.toast('Avval qayerga qo‘yishni tanlang (matn ichiga bosing)', true);
    checkpoint(); const f = cloneFrag(f0, true); ensureAssets(doc, f);
    let key = ss.ak, off = ss.ao; if (!(ss.ak === ss.bk && ss.ao === ss.bo)) { const at = deleteRange(ss); key = at.k; off = at.o; }
    const el = findEd(key), cur = el ? find(el.dataset.bid!) : undefined; if (!el || !cur) return;
    if (el.dataset.k !== 'blk' || !isText(cur)) {
      const runs = getRuns(el), ins = normalizeRuns(f.blocks.flatMap((b, i) => { const r: Run[] = isText(b) ? b.runs : b.type === 'image' ? [] : [{ t: blockText(b) }]; return i ? [{ t: ' ' }, ...r] : r; }));
      setRuns(el, normalizeRuns([...sliceRuns(runs, 0, off), ...ins, ...sliceRuns(runs, off, runsLength(runs))])); renderAll(); caret(findEd(key), off + runsLength(ins)); return done();
    }
    const l = sliceRuns(cur.runs, 0, off), r = sliceRuns(cur.runs, off, runsLength(cur.runs)), bi = blocks.indexOf(cur), k0 = keyOf(el);
    if (f.blocks.length === 1 && isText(f.blocks[0]) && (f.startPartial || f.endPartial)) { const ins = f.blocks[0].runs; cur.runs = normalizeRuns([...l, ...ins, ...r]); renderAll(); caret(findEd(k0), off + runsLength(ins)); return done(); }
    const bl = f.blocks.slice(); let head = l; const first = bl[0];
    if (f.startPartial && first && isText(first)) { head = normalizeRuns([...l, ...first.runs]); bl.shift(); }
    cur.runs = head; let endBlk: TextBlock | null = null, endOff = 0; const lastB = bl[bl.length - 1];
    if (f.endPartial && lastB && isText(lastB)) { bl.pop(); endOff = runsLength(lastB.runs); lastB.runs = normalizeRuns([...lastB.runs, ...r]); endBlk = lastB; }
    const ins: Block[] = [...bl]; let tb: TextBlock | null = null;
    if (endBlk) ins.push(endBlk); else if (r.length) { tb = { id: uid('b'), type: cur.type === 'heading' ? 'paragraph' : cur.type, runs: r }; if (cur.type === 'li') { tb.list = cur.list; tb.indent = cur.indent; } ins.push(tb); }
    const replaceCur = !runsLength(head) && cur.type === 'paragraph' && !f.startPartial && ins.length > 0;
    if (replaceCur) blocks.splice(bi, 1, ...ins); else blocks.splice(bi + 1, 0, ...ins);
    renderAll();
    const tgt = endBlk ? { id: endBlk.id, o: endOff } : tb ? { id: tb.id, o: 0 } : (() => { for (let i = ins.length - 1; i >= 0; i--) { const b = ins[i]; if (isText(b)) return { id: b.id, o: runsLength(b.runs) }; } return { id: cur.id, o: runsLength(cur.runs) }; })();
    caret(findEd('blk:' + tgt.id + '::'), tgt.o); done();
  }
  function deleteSource() {
    checkpoint();
    if (selMode) { const set = new Set(bsel); const keep = blocks.filter(b => !set.has(b.id)); blocks.splice(0, blocks.length, ...keep); bsel = []; renderAll(); syncBselLast(); return done(); }
    if (selImg) return delBlock(selImg);
    const ss = saveSel() ?? last; if (!ss) return; const at = deleteRange(ss); renderAll(); caret(findEd(at.k), at.o); done();
  }
  function doCopy(cut: boolean, ev?: ClipboardEvent): boolean {
    const f = fragFromSel(); if (!f) { h.toast('Avval matn yoki rasmni belgilang'); return false; }
    const text = fragText(f); setClip(f, text);
    if (ev?.clipboardData) { ev.clipboardData.setData('text/plain', text); ev.clipboardData.setData('text/html', fragHtml(f)); try { ev.clipboardData.setData('application/x-fur', JSON.stringify({ b: f.blocks, sp: f.startPartial, ep: f.endPartial })); } catch { /* */ } } else { try { void navigator.clipboard?.writeText(text).catch(() => { /* */ }); } catch { /* */ } }
    if (cut) deleteSource(); else h.toast(`${f.blocks.length} ta blok nusxalandi`); return true;
  }
  function pasteClip() { const c = getClip(); if (c) return pasteFrag(c.frag); try { void navigator.clipboard?.readText().then(t => { if (t) pastePlain(t); }, () => h.toast('Qo‘yishga ruxsat yo‘q. Avval nusxalang yoki matnni bosib turib “Qo‘yish”ni tanlang', true)); } catch { /* */ } }
  function pastePlain(text: string) {
    const lines = text.replace(/\r\n/g, '\n').split('\n'); const bl: Block[] = lines.map(t => ({ id: uid('b'), type: 'paragraph' as const, runs: t ? [{ t }] : [] }));
    pasteFrag({ blocks: bl, startPartial: true, endPartial: true, assets: [] });
  }
  body.addEventListener('copy', e => { if (doCopy(false, e)) e.preventDefault(); });
  body.addEventListener('cut', e => { if (doCopy(true, e)) e.preventDefault(); });
  function selectAllText() { const list = eds(); if (!list.length) return; const [an, ao] = locate(list[0], 0), [bn, bo] = locate(list[list.length - 1], 1e9); getSelection()!.setBaseAndExtent(an, ao, bn, bo); updateState(); }
  function extend(dir: 1 | -1) {
    if (selMode) { const i = bsel.length ? (dir > 0 ? Math.max(...bsel.map(id => blocks.findIndex(b => b.id === id))) + 1 : Math.min(...bsel.map(id => blocks.findIndex(b => b.id === id))) - 1) : 0; const b = blocks[i]; if (b && !bsel.includes(b.id)) { bsel.push(b.id); renderAll(); syncBselLast(); updateState(); } return; }
    const ss = saveSel() ?? last; if (!ss) return; const list = eds(), ia = idxK(ss.ak), ib = idxK(ss.bk); if (ia < 0 || ib < 0) return;
    let [an, ao] = locate(list[ia], ss.ao), [bn, bo] = locate(list[ib], ss.bo);
    if (dir > 0 && ib + 1 < list.length) [bn, bo] = locate(list[ib + 1], 1e9); else if (dir < 0 && ia > 0) [an, ao] = locate(list[ia - 1], 0);
    getSelection()!.setBaseAndExtent(an, ao, bn, bo); updateState();
  }
  // belgilash rejimi (butun bloklar)
  function syncBselLast() {
    const ids = blocks.filter(b => bsel.includes(b.id)).map(b => b.id); if (!ids.length) { last = null; return; }
    const all = eds(), mine = (id: string) => all.filter(e => e.dataset.bid === id); const fe = mine(ids[0])[0], le = mine(ids[ids.length - 1]).slice(-1)[0]; if (!fe || !le) return;
    last = { ak: keyOf(fe), ao: 0, bk: keyOf(le), bo: runsLength(getRuns(le)) };
  }
  function setSelMode(on: boolean) {
    selMode = on; bsel = []; getSelection()?.removeAllRanges();
    if (on) { const ss = last; const el = ss ? findEd(ss.ak) : null; const id = selImg ?? el?.dataset.bid; if (id) bsel = [id]; selImg = null; }
    renderAll(); if (on) syncBselLast(); updateState();
  }
  body.addEventListener('click', e => {
    if (!selMode) return; const t = e.target as HTMLElement, tops = Array.from(body.children); let top: Element | null = t; while (top && top.parentElement !== body) top = top.parentElement; if (!top) return;
    const bi = tops.indexOf(top), b = blocks[bi]; if (!b) return;
    if (e.shiftKey && bsel.length) { const ai = Math.max(...bsel.map(id => blocks.findIndex(x => x.id === id))), lo = Math.min(ai, bi), hi = Math.max(ai, bi); for (let k = lo; k <= hi; k++) if (!bsel.includes(blocks[k].id)) bsel.push(blocks[k].id); }
    else if (bsel.includes(b.id)) bsel = bsel.filter(x => x !== b.id); else bsel.push(b.id);
    renderAll(); syncBselLast(); updateState();
  });
  // sichqoncha bilan bloklar bo'ylab belgilash (Chrome bitta tahrirlanadigan blokdan chiqarmaydi — o'zimiz kengaytiramiz)
  let dragA: { n: Node; o: number; ed: HTMLElement } | null = null;
  const caretAt = (x: number, y: number): { n: Node; o: number } | null => { const d = document as unknown as { caretRangeFromPoint?(x: number, y: number): Range | null; caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }; if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); return r ? { n: r.startContainer, o: r.startOffset } : null; } const p = d.caretPositionFromPoint?.(x, y); return p ? { n: p.offsetNode, o: p.offset } : null; };
  let lastPT = 'mouse'; body.addEventListener('pointerdown', e => { lastPT = e.pointerType; }, true);
  body.addEventListener('mousedown', e => {
    dragA = null; if (selMode || e.button !== 0 || e.shiftKey || e.detail !== 1 || lastPT !== 'mouse') return;
    const ed = edOf(e.target as Node), c = ed ? caretAt(e.clientX, e.clientY) : null; if (!ed || !c) return;
    e.preventDefault(); ed.focus({ preventScroll: true }); getSelection()!.setBaseAndExtent(c.n, c.o, c.n, c.o); dragA = { n: c.n, o: c.o, ed };
  }, true);
  const dragEnd = () => { dragA = null; }; document.addEventListener('mouseup', dragEnd);
  body.addEventListener('mousemove', e => {
    if (!dragA || !(e.buttons & 1)) return; let c = caretAt(e.clientX, e.clientY), target = c ? edOf(c.n) : null;
    if (!target || !body.contains(target)) { let best: HTMLElement | null = null, bd = 1e9; for (const el of eds()) { const r = el.getBoundingClientRect(), d = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0; if (d < bd) { bd = d; best = el; } } if (!best) return; const r = best.getBoundingClientRect(), [tn, to] = locate(best, e.clientY < r.top ? 0 : 1e9); c = { n: tn, o: to }; }
    if (c) { e.preventDefault(); getSelection()!.setBaseAndExtent(dragA.n, dragA.o, c.n, c.o); }
  });
  // ---- sensorli "sudrab belgilash": barmoq bilan qatorlar orasida belgilash (Android'ning o'z tutqichlari bir blokdan chiqa olmaydi) ----
  let dragSel = false, tA: { n: Node; o: number } | null = null, tId = -1, tY = 0, tX = 0, scT = 0;
  function setDragSel(on: boolean) { dragSel = on; body.classList.toggle('dsel', on); root.querySelector('[data-cmd=dsel]')?.classList.toggle('on', on); if (on) { h.toast('Belgilash: matn ustidan barmoqni sudrang. Sahifani aylantirish uchun ekran chetiga olib boring.'); } else { tA = null; clearInterval(scT); } }
  const scrollEl = (() => { let e: HTMLElement | null = body; while (e && e !== document.body) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2) return e; e = e.parentElement; } return document.scrollingElement as HTMLElement; });
  function touchExtend() {
    if (!tA) return; let c = caretAt(tX, tY), target = c ? edOf(c.n) : null;
    if (!target || !body.contains(target)) { let best: HTMLElement | null = null, bd = 1e9; for (const el of eds()) { const r = el.getBoundingClientRect(), d = tY < r.top ? r.top - tY : tY > r.bottom ? tY - r.bottom : 0; if (d < bd) { bd = d; best = el; } } if (!best) return; const r = best.getBoundingClientRect(), [tn, to] = locate(best, tY < r.top ? 0 : 1e9); c = { n: tn, o: to }; }
    if (c) getSelection()!.setBaseAndExtent(tA.n, tA.o, c.n, c.o);
  }
  body.addEventListener('pointerdown', e => {
    if (!dragSel || e.pointerType === 'mouse' || !e.isPrimary) return; const ed = edOf(e.target as Node), c = ed ? caretAt(e.clientX, e.clientY) : null; if (!ed || !c) return;
    ed.focus({ preventScroll: true }); getSelection()!.setBaseAndExtent(c.n, c.o, c.n, c.o); tA = c; tId = e.pointerId; tX = e.clientX; tY = e.clientY; try { body.setPointerCapture(e.pointerId); } catch { /* */ }
    clearInterval(scT); scT = window.setInterval(() => { if (!tA) return; const sc = scrollEl(), r = sc === document.scrollingElement ? { top: 0, bottom: innerHeight } : sc.getBoundingClientRect(), z = 70; let dy = 0; if (tY < r.top + z) dy = -Math.ceil((r.top + z - tY) / 5); else if (tY > r.bottom - z) dy = Math.ceil((tY - (r.bottom - z)) / 5); if (dy) { sc.scrollTop += dy; touchExtend(); } }, 30);
  }, true);
  body.addEventListener('pointermove', e => { if (!tA || e.pointerId !== tId) return; tX = e.clientX; tY = e.clientY; e.preventDefault(); touchExtend(); });
  const tEnd = (e: PointerEvent) => { if (e.pointerId !== tId) return; tA = null; tId = -1; clearInterval(scT); updateState(); }; body.addEventListener('pointerup', tEnd); body.addEventListener('pointercancel', tEnd);
  // ko'p blokli belgilash ustida yozish/o'chirish
  body.addEventListener('beforeinput', e => {
    const ie = e as InputEvent, t = ie.inputType, ss = saveSel(); if (!ss || ss.ak === ss.bk) return;
    if (t.startsWith('delete') || t === 'insertText' || t === 'insertParagraph' || t === 'insertLineBreak') {
      e.preventDefault(); checkpoint(); const at = deleteRange(ss); renderAll(); caret(findEd(at.k), at.o);
      if (t === 'insertText' && ie.data) document.execCommand('insertText', false, ie.data); else if (t === 'insertParagraph') { const el = findEd(at.k), b = el ? find(el.dataset.bid!) : undefined; if (el && isText(b) && el.dataset.k === 'blk') split(el, b); }
      done();
    }
  });
  async function sendTo(f: Frag, dest: number, move: boolean) {
    const dp = doc.pages[dest]; if (!dp) return;
    if (dp.type === 'document') {
      const g = cloneFrag(f, true); ensureAssets(doc, g); if (dp.blocks.length === 1 && dp.blocks[0].type === 'paragraph' && !runsLength(dp.blocks[0].runs)) dp.blocks.splice(0, 1); dp.blocks.push(...g.blocks);
    } else {
      let y0 = 40; for (const o of dp.objects) { const yy = o.t === 'stroke' ? Math.max(...o.pts.map(q => q[1])) : o.t === 'text' ? o.y + o.s * 2 : o.t === 'image' ? o.y + o.h : Math.max(o.y1, o.y2); if (yy + 40 > y0) y0 = yy + 40; }
      const objs = await toBoardObjects(doc, f, 40, y0); ensureAssets(doc, f); dp.objects.push(...objs);
    }
    if (move) deleteSource(); h.onChange(); h.toast(`${f.blocks.length} ta blok ${dest + 1}-sahifaga ${move ? 'ko‘chirildi' : 'nusxalandi'}`);
  }
  function sendDialog() {
    const f = fragFromSel(); if (!f) return void h.toast('Avval matn yoki rasmni belgilang');
    if (doc.pages.length < 2) return void h.toast('Boshqa sahifa yo‘q. Avval sahifa qo‘shing', true);
    modal(`<h3>Boshqa sahifaga</h3><p class="mut">${f.blocks.length} ta blok tanlangan</p><div class="sendl">${doc.pages.map((p, i) => `<label class="fl ck"><input type="radio" name="dp" value="${i}" ${i === h.index ? 'disabled' : ''}> ${i + 1}-sahifa · ${p.type === 'board' ? 'Doska' : 'Hujjat'}</label>`).join('')}</div><label class="fl ck"><input type="radio" name="dm" value="copy" checked> Nusxalash</label><label class="fl ck"><input type="radio" name="dm" value="move"> Ko‘chirish (bu yerdan o‘chadi)</label><div class="row"><button class="btn" id="sx">Bekor</button><button class="btn pri" id="sg">Bajarish</button></div>`, (b, close) => {
      b.querySelector('#sx')!.addEventListener('click', close);
      b.querySelector('#sg')!.addEventListener('click', () => { const d = b.querySelector<HTMLInputElement>('input[name=dp]:checked'), m = b.querySelector<HTMLInputElement>('input[name=dm]:checked')!; if (!d) return void h.toast('Qaysi sahifaga?', true); close(); void sendTo(f, Number(d.value), m.value === 'move'); });
    });
  }
  let fq = 0; function reportFocus() {
    if (!h.focus) return; clearTimeout(fq); fq = window.setTimeout(() => {
      const s = getSelection(); if (!s || !s.rangeCount || !body.contains(s.anchorNode)) return; let r: DOMRect | undefined = s.getRangeAt(0).getClientRects()[0];
      if (!r || (!r.width && !r.height)) { const n = s.anchorNode instanceof HTMLElement ? s.anchorNode : s.anchorNode?.parentElement; r = n?.getBoundingClientRect(); } if (!r) return;
      const pr = paper.getBoundingClientRect(); if (pr.height > 0) h.focus!(Math.max(0, Math.min(1, (r.left - pr.left) / pr.width)), Math.max(0, Math.min(1, (r.top - pr.top) / pr.height)));
    }, 120);
  }
  const onSel = () => { if (body.contains(document.activeElement) || body.contains(getSelection()?.anchorNode ?? null)) updateState(); };
  document.addEventListener('selectionchange', onSel);
  renderAll(); const first = eds()[0]; if (first && !blocks.some(b => b.type !== 'paragraph' || (b as TextBlock).runs.length)) caret(first, 0);
  return { destroy() { clearTimeout(tm); checkpoint(); document.removeEventListener('selectionchange', onSel); document.removeEventListener('keydown', onDocKey); urls.forEach(u => URL.revokeObjectURL(u)); } };
}
