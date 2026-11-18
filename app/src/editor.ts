import { Align, Block, FurDocument, FurPage, ImageBlock, Run, TableBlock, TextBlock, allHave, normalizeRuns, patchRuns, plainText, replaceRange, runsLength, setFlag, splitRuns, uid } from '../../packages/fur-format/src/index';

export interface EditorHost { doc: FurDocument; page: FurPage; index: number; onChange(): void; toast(m: string, bad?: boolean): void; ask(t: string, v?: string, ok?: string): Promise<string | null> }
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
  const urls = new Map<string, string>(); let selImg: string | null = null, last: SavedSel | null = null;

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
  ${btn('undo', ico('<path d="M9 7L4 12l5 5M4 12h10a6 6 0 010 12"/>'), 'Bekor qilish (Ctrl+Z)')}${btn('redo', ico('<path d="M15 7l5 5-5 5M20 12H10a6 6 0 000 12"/>'), 'Qaytarish (Ctrl+Y)')}${btn('find', ico('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'), 'Qidirish va almashtirish')}${btn('page', ico('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'), 'Sahifa sozlamalari')}`;
  const $ = <T extends HTMLElement>(id: string) => tools.querySelector<T>('#' + id)!;

  // ---- model yordamchilari ----
  const find = (id: string) => blocks.find(b => b.id === id);
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
    if (!s) return; const a = findEd(s.ak), b = findEd(s.bk); if (!a || !b) return;
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
  function mkEd(el: HTMLElement, k: string, bid: string, runs: Run[]) { el.className = (el.className + ' ed').trim(); el.contentEditable = PT; el.dataset.k = k; el.dataset.bid = bid; renderRuns(el, runs); return el; }
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
        const f = document.createElement('figure'); f.className = 'imgf' + (selImg === b.id ? ' sel' : ''); f.dataset.fid = b.id; f.style.textAlign = b.align;
        const im = document.createElement('img'); im.src = imgUrl(b.a); im.style.width = b.w + '%'; im.alt = ''; im.draggable = false; f.append(im);
        const cap = document.createElement('figcaption'); cap.className = 'cap'; mkEd(cap, 'cap', b.id, b.caption); f.append(cap); body.append(f);
      }
    }
    if (!blocks.length) { blocks.push({ id: uid('b'), type: 'paragraph', runs: [] }); renderAll(); return; }
    const l = L(); paper.style.setProperty('--pad', MARGIN[l.margin] + 'px');
    root.querySelector<HTMLElement>('#phdr')!.textContent = l.header;
    root.querySelector<HTMLElement>('#pftr')!.innerHTML = `<span>${esc(l.footer)}</span><span>${l.pageNumbers ? h.index + 1 : ''}</span>`;
    updateState();
  }

  // ---- amallar ----
  function done() { checkpoint(); h.onChange(); updateState(); }
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
  body.addEventListener('input', e => { const el = edOf(e.target as Node); if (!el) return; setRuns(el, domToRuns(el)); clearTimeout(tm); tm = window.setTimeout(checkpoint, 500); h.onChange(); });
  body.addEventListener('paste', e => {
    e.preventDefault(); const img = Array.from(e.clipboardData?.files ?? []).find(f => f.type.startsWith('image/')); if (img) return void addImage(img);
    const t = e.clipboardData?.getData('text/plain'); if (t) document.execCommand('insertText', false, t);
  });
  body.addEventListener('dragover', e => e.preventDefault());
  body.addEventListener('drop', e => { e.preventDefault(); const f = Array.from(e.dataTransfer?.files ?? []).find(x => x.type.startsWith('image/')); if (f) void addImage(f); });
  body.addEventListener('mousedown', e => { const f = (e.target as HTMLElement).closest<HTMLElement>('.imgf'); const nid = f && !(e.target as HTMLElement).closest('.cap') ? f.dataset.fid! : null; if (nid !== selImg) { selImg = nid; body.querySelectorAll('.imgf').forEach(x => x.classList.toggle('sel', (x as HTMLElement).dataset.fid === selImg)); updateState(); } if (nid) { body.focus(); getSelection()?.removeAllRanges(); } });
  body.tabIndex = -1; body.style.outline = 'none';
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
    else if (c === 'undo') doUndo(); else if (c === 'redo') doRedo(); else if (c === 'find') findReplace(); else if (c === 'page') pageSettings();
  });
  $('tblock').addEventListener('change', e => { blockStyle((e.target as HTMLSelectElement).value); restoreSel(last); });
  $('tsize').addEventListener('change', e => { const v = Number((e.target as HTMLSelectElement).value); inline((r, s, en) => patchRuns(r, s, en, x => { const y = { ...x }; if (v) y.fs = v; else delete y.fs; return y; })); });
  $('tfont').addEventListener('change', e => { const v = (e.target as HTMLSelectElement).value; inline((r, s, en) => patchRuns(r, s, en, x => { const y = { ...x }; if (v) y.ff = v; else delete y.ff; return y; })); });
  $('tcolor').addEventListener('change', e => { const v = (e.target as HTMLInputElement).value; inline((r, s, en) => patchRuns(r, s, en, x => ({ ...x, c: v }))); });
  fileIn.addEventListener('change', () => { const f = fileIn.files?.[0]; fileIn.value = ''; if (f) void addImage(f); });
  ctx.addEventListener('click', e => {
    const bt = (e.target as HTMLElement).closest<HTMLElement>('[data-x]'); if (!bt) return; const x = bt.dataset.x!, c = curCell(), ib = selImg ? find(selImg) : undefined;
    if (ib?.type === 'image') { if (x === 'del') return delBlock(ib.id); if (x.startsWith('w')) mutate(() => { (ib as ImageBlock).w = Number(x.slice(1)); }); return; }
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
    if (ib?.type === 'image') { ctx.hidden = false; ctx.innerHTML = `<b>Rasm</b>${[25, 50, 75, 100].map(w => `<button class="tb ${ib.w === w ? 'on' : ''}" data-x="w${w}">${w}%</button>`).join('')}<button class="tb dng" data-x="del">O‘chirish</button>`; }
    else if (b?.type === 'table') { ctx.hidden = false; ctx.innerHTML = `<b>Jadval</b><button class="tb" data-x="addr">+ Qator</button><button class="tb" data-x="addc">+ Ustun</button><button class="tb" data-x="delr">− Qator</button><button class="tb" data-x="delc">− Ustun</button><button class="tb ${b.header ? 'on' : ''}" data-x="head">Sarlavha qatori</button><button class="tb dng" data-x="del">Jadvalni o‘chirish</button>`; }
    else ctx.hidden = true;
  }
  const onSel = () => { if (body.contains(document.activeElement) || body.contains(getSelection()?.anchorNode ?? null)) updateState(); };
  document.addEventListener('selectionchange', onSel);
  renderAll(); const first = eds()[0]; if (first && !blocks.some(b => b.type !== 'paragraph' || (b as TextBlock).runs.length)) caret(first, 0);
  return { destroy() { clearTimeout(tm); checkpoint(); document.removeEventListener('selectionchange', onSel); document.removeEventListener('keydown', onDocKey); urls.forEach(u => URL.revokeObjectURL(u)); } };
}
