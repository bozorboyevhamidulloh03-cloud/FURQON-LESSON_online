import { Align, Block, FurAsset, FurDocument, FurPage, FurError, ImageBlock, Run, TableBlock, TextBlock, newDocument, newPage, normalizeRuns, plainText, readZip, uid } from '../../packages/fur-format/src/index';

export type Progress = (msg: string) => void;
export type Kind = 'fur' | 'pdf' | 'docx' | 'image' | 'unknown';
const titleOf = (name: string) => name.replace(/\.[^.]+$/, '').trim() || 'Nomsiz dars';

/** Fayl turini kengaytma emas, mazmuniga qarab aniqlaydi. */
export function sniff(b: Uint8Array, name: string): Kind {
  const s = String.fromCharCode(...b.slice(0, 8));
  if (s.startsWith('%PDF')) return 'pdf';
  if (b[0] === 0x89 && s.slice(1, 4) === 'PNG') return 'image';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image';
  if (s.startsWith('RIFF') && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image';
  if (s.startsWith('GIF8')) return 'image';
  if (b[0] === 0x50 && b[1] === 0x4b) return /\.docx$/i.test(name) ? 'docx' : /\.fur$/i.test(name) ? 'fur' : 'unknown';
  return 'unknown';
}

// ---------- rasm kodlash (umumiy) ----------
function canvasBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new FurError('INVALID', 'Rasm siqilmadi')), type, q));
}
async function bitmapOf(blob: Blob): Promise<{ w: number; h: number; draw(c: CanvasRenderingContext2D, w: number, h: number): void }> {
  const u = URL.createObjectURL(blob);
  try {
    const im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new FurError('INVALID', 'Rasm ochilmadi')); i.src = u; });
    return { w: im.naturalWidth, h: im.naturalHeight, draw: (c, w, h) => c.drawImage(im, 0, 0, w, h) };
  } finally { setTimeout(() => URL.revokeObjectURL(u), 2000); }
}
async function addAsset(doc: FurDocument, blob: Blob, mime: string): Promise<string> {
  const id = uid('a'); doc.assets.push({ id, mime, data: new Uint8Array(await blob.arrayBuffer()) } as FurAsset); return id;
}
function boardImagePage(aid: string, pw: number, ph: number, title = ''): FurPage {
  const p = newPage('board', title), W = 1000, H = Math.round(W * ph / pw * 100) / 100; p.bg = 'white';
  p.objects.push({ t: 'image', id: uid('o'), a: aid, x: 0, y: 0, w: W, h: H }); return p;
}

// ---------- rasm fayl ----------
export async function importImage(bytes: Uint8Array, name: string): Promise<FurDocument> {
  const png = bytes[0] === 0x89, doc = newDocument(titleOf(name)), src = new Blob([bytes as BlobPart]), bm = await bitmapOf(src);
  const k = Math.min(1, 1800 / Math.max(bm.w, bm.h)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bm.w * k)); c.height = Math.max(1, Math.round(bm.h * k));
  const g = c.getContext('2d')!; if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } bm.draw(g, c.width, c.height);
  const aid = await addAsset(doc, await canvasBlob(c, png ? 'image/png' : 'image/jpeg', 0.88), png ? 'image/png' : 'image/jpeg');
  doc.pages = [boardImagePage(aid, c.width, c.height)]; return doc;
}

// ---------- PDF (pdf.js, brauzer ichida, oflayn) ----------
let pdfjs: any = null;
async function loadPdfjs(): Promise<any> {
  if (pdfjs) return pdfjs;
  const embedded = (id: string, type: string): string | null => { const e = document.getElementById(id); if (!e?.textContent) return null; const bin = atob(e.textContent.trim()), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([a], { type })); };
  const lib = embedded('v-pdf', 'text/javascript') ?? new URL('vendor/pdf.min.mjs', document.baseURI).href;
  const worker = embedded('v-pdfw', 'text/javascript') ?? new URL('vendor/pdf.worker.min.mjs', document.baseURI).href;
  try { pdfjs = await import(/* @vite-ignore */ lib); } catch { throw new FurError('INVALID', 'PDF o‘qish moduli yuklanmadi (vendor/pdf.min.mjs topilmadi)'); }
  pdfjs.GlobalWorkerOptions.workerSrc = worker; return pdfjs;
}
export async function importPdf(bytes: Uint8Array, name: string, progress: Progress = () => { }): Promise<FurDocument> {
  const lib = await loadPdfjs(), doc = newDocument(titleOf(name)); doc.pages = [];
  let pdf: any;
  try { pdf = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false }).promise; }
  catch (e: any) { throw new FurError('INVALID', e?.name === 'PasswordException' ? 'PDF parol bilan himoyalangan' : 'PDF o‘qib bo‘lmadi'); }
  const n: number = pdf.numPages; if (n > 400) throw new FurError('TOO_LARGE', `PDF juda uzun (${n} sahifa, chegara 400)`);
  try {
    for (let i = 1; i <= n; i++) {
      progress(`PDF: ${i}/${n} sahifa`);
      const page = await pdf.getPage(i), v1 = page.getViewport({ scale: 1 }), sc = Math.min(3, 1400 / v1.width), vp = page.getViewport({ scale: sc });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, canvas: c, viewport: vp }).promise; page.cleanup();
      const aid = await addAsset(doc, await canvasBlob(c, 'image/jpeg', 0.85), 'image/jpeg'); c.width = c.height = 0;
      doc.pages.push(boardImagePage(aid, vp.width, vp.height, `${i}-bet`));
    }
  } finally { void pdf.destroy?.(); }
  return doc;
}

// ---------- DOCX (o'z o'qiguvchimiz: ZIP + XML) ----------
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const kids = (e: Element, n?: string) => Array.from(e.children).filter(c => c.namespaceURI === W_NS && (!n || c.localName === n));
const kid = (e: Element | null | undefined, n: string) => e ? kids(e, n)[0] ?? null : null;
const wv = (e: Element | null | undefined) => e?.getAttributeNS(W_NS, 'val') ?? null;
const on = (e: Element | null) => !!e && !['0', 'false', 'off', 'none'].includes((wv(e) ?? '').toLowerCase());
const xml = (b: Uint8Array | undefined) => b ? new DOMParser().parseFromString(new TextDecoder().decode(b), 'application/xml') : null;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export async function importDocx(bytes: Uint8Array, name: string, progress: Progress = () => { }): Promise<FurDocument> {
  progress('DOCX o‘qilmoqda…');
  let z: Map<string, Uint8Array>; try { z = await readZip(bytes); } catch { throw new FurError('INVALID', 'DOCX fayl buzilgan'); }
  const main = xml(z.get('word/document.xml')); if (!main || main.querySelector('parsererror')) throw new FurError('INVALID', 'Bu Word (.docx) fayl emas yoki buzilgan');
  const body = main.getElementsByTagNameNS(W_NS, 'body')[0]; if (!body) throw new FurError('INVALID', 'DOCX ichida matn topilmadi');
  // aloqalar, uslublar, raqamlash
  const rels = new Map<string, string>(); const rx = xml(z.get('word/_rels/document.xml.rels'));
  rx?.querySelectorAll('Relationship').forEach(r => rels.set(r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? ''));
  const styleName = new Map<string, string>(); xml(z.get('word/styles.xml'))?.getElementsByTagNameNS(W_NS, 'style') && Array.from(xml(z.get('word/styles.xml'))!.getElementsByTagNameNS(W_NS, 'style')).forEach(s => styleName.set(s.getAttributeNS(W_NS, 'styleId') ?? '', (wv(kid(s, 'name')) ?? '').toLowerCase()));
  const numFmt = new Map<string, string>(); const nx = xml(z.get('word/numbering.xml'));
  if (nx) {
    const abs = new Map<string, Element>(); Array.from(nx.getElementsByTagNameNS(W_NS, 'abstractNum')).forEach(a => abs.set(a.getAttributeNS(W_NS, 'abstractNumId') ?? '', a));
    Array.from(nx.getElementsByTagNameNS(W_NS, 'num')).forEach(nm => { const a = abs.get(wv(kid(nm, 'abstractNumId')) ?? ''), lv = a ? kids(a, 'lvl')[0] : null; numFmt.set(nm.getAttributeNS(W_NS, 'numId') ?? '', wv(kid(lv, 'numFmt')) ?? 'bullet'); });
  }
  const doc = newDocument(titleOf(name)); doc.pages = []; let cur = newPage('document'); cur.blocks = []; let warn = 0;
  const imgCache = new Map<string, string>();

  async function pickImage(rid: string): Promise<string | null> {
    if (imgCache.has(rid)) return imgCache.get(rid)!;
    const t = rels.get(rid); if (!t) return null; const path = t.startsWith('/') ? t.slice(1) : 'word/' + t.replace(/^\.\//, ''), data = z.get(path), ext = path.split('.').pop()!.toLowerCase();
    if (!data || !MIME[ext]) { warn++; return null; }
    const id = uid('a'); doc.assets.push({ id, mime: MIME[ext], data } as FurAsset); imgCache.set(rid, id); return id;
  }
  function runProps(rp: Element | null): Partial<Run> {
    const o: Partial<Run> = {}; if (!rp) return o;
    if (on(kid(rp, 'b'))) o.b = true; if (on(kid(rp, 'i'))) o.i = true; if (on(kid(rp, 'u'))) o.u = true; if (on(kid(rp, 'strike'))) o.s = true;
    const va = wv(kid(rp, 'vertAlign')); if (va === 'superscript') o.sup = true; else if (va === 'subscript') o.sub = true;
    const c = wv(kid(rp, 'color')); if (c && /^[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== '000000') o.c = '#' + c.toLowerCase();
    const sz = Number(wv(kid(rp, 'sz'))); if (sz > 0) { const px = Math.round(sz / 2 * 1.333); if (px >= 8 && px <= 96 && px !== 16 && px !== 15 && px !== 14) o.fs = px; }
    return o;
  }
  /** abzats ichidagi run, giperhavola va rasmlar. */
  async function readInline(p: Element): Promise<{ runs: Run[]; images: ImageBlock[]; pageBreak: boolean }> {
    const runs: Run[] = [], images: ImageBlock[] = []; let pageBreak = false;
    async function walk(parent: Element, href?: string) {
      for (const el of Array.from(parent.children)) {
        if (el.namespaceURI !== W_NS) continue;
        if (el.localName === 'hyperlink') { const rid = el.getAttributeNS(R_NS, 'id'), h = rid ? rels.get(rid) : null; await walk(el, h && /^(https?:|mailto:)/i.test(h) ? h : undefined); }
        else if (el.localName === 'r' || el.localName === 'smartTag' || el.localName === 'ins') {
          if (el.localName !== 'r') { await walk(el, href); continue; }
          const pr = runProps(kid(el, 'rPr'));
          for (const c of Array.from(el.children)) {
            if (c.namespaceURI === W_NS) {
              if (c.localName === 't') runs.push({ t: c.textContent ?? '', ...pr, ...(href ? { href, u: true, c: '#2a6fdb' } : {}) });
              else if (c.localName === 'tab') runs.push({ t: '    ', ...pr });
              else if (c.localName === 'br') { if (c.getAttributeNS(W_NS, 'type') === 'page') pageBreak = true; else runs.push({ t: '\n', ...pr }); }
              else if (c.localName === 'drawing' || c.localName === 'pict') {
                const blip = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0], rid = blip?.getAttributeNS(R_NS, 'embed');
                if (rid) { const a = await pickImage(rid); const ext = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'extent')[0], cx = Number(ext?.getAttribute('cx')) || 0;
                  if (a) images.push({ id: uid('b'), type: 'image', a, w: cx ? Math.max(5, Math.min(100, Math.round(cx / (5.8 * 914400) * 100))) : 60, align: 'center', caption: [] }); }
                else warn++;
              }
            }
          }
        }
      }
    }
    await walk(p); return { runs: normalizeRuns(runs.filter(r => r.t !== '')), images, pageBreak };
  }
  async function paragraph(p: Element): Promise<void> {
    const ppr = kid(p, 'pPr'), sid = wv(kid(ppr, 'pStyle')) ?? '', sn = styleName.get(sid) || sid.toLowerCase();
    const { runs, images, pageBreak } = await readInline(p);
    if (on(kid(ppr, 'pageBreakBefore')) && cur.blocks.length) newDocPage();
    const blk: TextBlock = { id: uid('b'), type: 'paragraph', runs };
    const hm = /^(?:heading|sarlavha|заголовок)\s*([1-9])$/.exec(sn), jc = wv(kid(ppr, 'jc')), numPr = kid(ppr, 'numPr');
    if (hm) { blk.type = 'heading'; blk.level = Math.min(3, Number(hm[1])) as 1 | 2 | 3; } else if (sn === 'title') { blk.type = 'heading'; blk.level = 1; }
    else if (numPr || /list/.test(sn)) { blk.type = 'li'; const fmt = numFmt.get(wv(kid(numPr, 'numId')) ?? '') ?? (/number/.test(sn) ? 'decimal' : 'bullet'); blk.list = fmt === 'bullet' ? 'bullet' : 'ordered'; const il = Number(wv(kid(numPr, 'ilvl')) ?? 0); if (il > 0) blk.indent = Math.min(3, il); }
    const al: Align | null = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' ? 'justify' : null; if (al) blk.align = al;
    if (runs.length || !images.length) cur.blocks.push(blk); cur.blocks.push(...images);
    if (pageBreak) newDocPage();
  }
  async function table(t: Element): Promise<void> {
    const rows: Run[][][] = []; let header = false;
    for (const [ri, tr] of kids(t, 'tr').entries()) {
      if (ri === 0 && kid(kid(tr, 'trPr'), 'tblHeader')) header = true;
      const row: Run[][] = [];
      for (const tc of kids(tr, 'tc')) { const cell: Run[] = []; for (const p of kids(tc, 'p')) { const { runs } = await readInline(p); if (cell.length && runs.length) cell.push({ t: '\n' }); cell.push(...runs); } row.push(normalizeRuns(cell)); }
      if (row.length) rows.push(row);
    }
    if (!rows.length) return; const cols = Math.min(12, Math.max(...rows.map(r => r.length)));
    cur.blocks.push({ id: uid('b'), type: 'table', header, rows: rows.map(r => Array.from({ length: cols }, (_, i) => r[i] ?? [])) } as TableBlock);
  }
  function newDocPage() { doc.pages.push(cur); cur = newPage('document'); cur.blocks = []; }
  async function flow(parent: Element) {
    for (const el of Array.from(parent.children)) {
      if (el.namespaceURI !== W_NS) continue;
      if (el.localName === 'p') await paragraph(el); else if (el.localName === 'tbl') await table(el);
      else if (el.localName === 'sdt') { const c = kid(el, 'sdtContent'); if (c) await flow(c); }
    }
  }
  await flow(body);
  while (cur.blocks.length && cur.blocks[cur.blocks.length - 1].type === 'paragraph' && !plainText((cur.blocks[cur.blocks.length - 1] as TextBlock).runs)) cur.blocks.pop();
  if (cur.blocks.length || !doc.pages.length) { if (!cur.blocks.length) cur.blocks.push({ id: uid('b'), type: 'paragraph', runs: [] }); doc.pages.push(cur); }
  // ketma-ket bo'sh abzatslarni bittagacha qisqartirish
  for (const p of doc.pages) p.blocks = p.blocks.filter((b, i, a) => !(b.type === 'paragraph' && !plainText(b.runs) && i > 0 && a[i - 1].type === 'paragraph' && !plainText((a[i - 1] as TextBlock).runs)));
  if (warn) (doc as any).__warn = warn;
  return doc;
}

// ---------- PDF -> tahrirlanadigan hujjat (matn + rasm) ----------
interface TItem { x: number; y: number; w: number; fs: number; str: string; b: boolean; i: boolean; c?: string }
interface TLine { items: TItem[]; y: number; x0: number; x1: number; fs: number }
const hex2 = (n: number) => n.toString(16).padStart(2, '0');

export async function importPdfText(bytes: Uint8Array, name: string, progress: Progress = () => { }): Promise<FurDocument> {
  const lib = await loadPdfjs(), doc = newDocument(titleOf(name)); doc.pages = [];
  let pdf: any;
  try { pdf = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false }).promise; }
  catch (e: any) { throw new FurError('INVALID', e?.name === 'PasswordException' ? 'PDF parol bilan himoyalangan' : 'PDF o‘qib bo‘lmadi'); }
  const n: number = pdf.numPages; if (n > 400) throw new FurError('TOO_LARGE', `PDF juda uzun (${n} sahifa, chegara 400)`);
  const OPS = lib.OPS, U = lib.Util; let scanned = 0, graphic = 0, imagesN = 0;
  try {
    for (let pn = 1; pn <= n; pn++) {
      progress(`PDF matni: ${pn}/${n} sahifa`);
      const page = await pdf.getPage(pn), SC = 1.5, vp = page.getViewport({ scale: SC });
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const g = cv.getContext('2d', { willReadFrequently: true })!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: g, canvas: cv, viewport: vp }).promise;
      const tc = await page.getTextContent(), fontBold = new Map<string, [boolean, boolean]>();
      const fontFlags = (fn: string): [boolean, boolean] => {
        let f = fontBold.get(fn); if (f) return f; let nm = '';
        try { nm = page.commonObjs.has(fn) ? (page.commonObjs.get(fn)?.name ?? '') : ''; } catch { /* yuklanmagan */ }
        nm = nm + ' ' + (tc.styles[fn]?.fontFamily ?? ''); f = [/bold|black|heavy|semibold|demi/i.test(nm), /italic|oblique/i.test(nm)]; fontBold.set(fn, f); return f;
      };
      // --- rasm joylari (operator ro'yxati) ---
      const ol = await page.getOperatorList(), rects: { x: number; y: number; w: number; h: number }[] = [];
      let ctm = [1, 0, 0, 1, 0, 0]; const stack: number[][] = []; let pathOps = 0;
      for (let k = 0; k < ol.fnArray.length; k++) {
        const fn = ol.fnArray[k], a = ol.argsArray[k];
        if (fn === OPS.save) stack.push(ctm.slice()); else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop()!; }
        else if (fn === OPS.transform) ctm = U.transform(ctm, a);
        else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm.slice()); if (a?.[0]) ctm = U.transform(ctm, a[0]); }
        else if (fn === OPS.paintFormXObjectEnd) { if (stack.length) ctm = stack.pop()!; }
        else if (fn === OPS.constructPath) pathOps++;
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
          const M = U.transform(vp.transform, ctm), pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
          const x0 = Math.max(0, Math.min(...pts.map(p => p[0]))), y0 = Math.max(0, Math.min(...pts.map(p => p[1]))), x1 = Math.min(cv.width, Math.max(...pts.map(p => p[0]))), y1 = Math.min(cv.height, Math.max(...pts.map(p => p[1])));
          if (x1 - x0 >= 24 && y1 - y0 >= 24) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        }
      }
      if (pathOps > 60) graphic++;
      // --- matn elementlari ---
      const items: TItem[] = [];
      for (const it of tc.items as any[]) {
        if (typeof it.str !== 'string' || !it.str) continue; const T = U.transform(vp.transform, it.transform), fs = Math.hypot(T[2], T[3]) || 10, [b, i] = fontFlags(it.fontName);
        const base: TItem = { x: T[4], y: T[5], w: it.width * vp.scale, fs, str: it.str, b, i };
        if (!it.str.trim()) { items.push(base); continue; }
        const bx = Math.max(0, Math.floor(base.x)), by = Math.max(0, Math.floor(base.y - fs * 0.85)), bw = Math.min(cv.width - bx, Math.ceil(Math.max(2, Math.min(base.w, 2400)))), bh = Math.min(cv.height - by, Math.ceil(fs));
        if (bw <= 0 || bh <= 0) { items.push(base); continue; }
        const d = g.getImageData(bx, by, bw, bh).data, str: string = it.str;
        // belgilarning taxminiy kengligi (proporsional) -> ustunlar oralig'i
        g.font = `${Math.max(6, fs)}px sans-serif`; const cum = [0]; for (const ch of str) cum.push(cum[cum.length - 1] + g.measureText(ch).width); const tot = cum[cum.length - 1] || 1, k = base.w / tot;
        const colAt = (c0: number, c1: number): string | undefined => {
          let best = 999, r = 0, gg = 0, bb = 0; const x0 = Math.max(0, Math.floor(c0)), x1 = Math.min(bw, Math.max(x0 + 1, Math.ceil(c1)));
          for (let y = 0; y < bh; y++) for (let x = x0; x < x1; x++) { const p = (y * bw + x) * 4, l = d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11; if (l < best) { best = l; r = d[p]; gg = d[p + 1]; bb = d[p + 2]; } }
          return best < 200 && Math.max(r, gg, bb) - Math.min(r, gg, bb) > 70 ? '#' + hex2(r) + hex2(gg) + hex2(bb) : undefined;
        };
        const chars = Array.from(str), cols = chars.map((ch, ci) => /\s/.test(ch) ? null : colAt(cum[ci] * k, cum[ci + 1] * k)); let lastC: string | undefined = undefined;
        const cs = chars.map((_, ci) => { if (cols[ci] !== null) lastC = cols[ci] as string | undefined; return lastC; });
        let st = 0; for (let ci = 1; ci <= chars.length; ci++) {
          if (ci === chars.length || cs[ci] !== cs[st]) { const part = chars.slice(st, ci).join(''), x0 = base.x + cum[st] * k, x1 = base.x + cum[ci] * k; const sub: TItem = { ...base, x: x0, w: x1 - x0, str: part }; if (cs[st]) sub.c = cs[st]; items.push(sub); st = ci; }
        }
      }
      const inImg = (t: TItem) => rects.find(r => t.x + t.w / 2 >= r.x && t.x + t.w / 2 <= r.x + r.w && t.y - t.fs * 0.3 >= r.y && t.y - t.fs * 0.3 <= r.y + r.h);
      const free = items.filter(t => !inImg(t));
      // --- qatorlar ---
      free.sort((a, b) => a.y - b.y || a.x - b.x); const lines: TLine[] = [];
      for (const t of free) { const L = lines.find(l => Math.abs(l.y - t.y) < Math.max(l.fs, t.fs) * 0.45); if (L) { L.items.push(t); L.fs = Math.max(L.fs, t.fs); } else lines.push({ items: [t], y: t.y, x0: 0, x1: 0, fs: t.fs }); }
      for (const L of lines) { L.items.sort((a, b) => a.x - b.x); L.x0 = L.items[0].x; const lt = L.items[L.items.length - 1]; L.x1 = lt.x + lt.w; }
      lines.sort((a, b) => a.y - b.y);
      const tot = new Map<number, number>(); for (const L of lines) for (const t of L.items) { const k = Math.round(t.fs / 1.5); tot.set(k, (tot.get(k) ?? 0) + t.str.length); }
      const body = ([...tot.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10) * 1.5, minX0 = lines.length ? Math.min(...lines.map(l => l.x0)) : 0, maxW = Math.max(1, cv.width - 2 * minX0), pageMid = cv.width / 2;
      // --- elementlarni tartiblash (matn qatorlari + rasm bloklari) ---
      type El = { top: number; line?: TLine; img?: { x: number; y: number; w: number; h: number } };
      const els: El[] = [...lines.map(l => ({ top: l.y - l.fs, line: l })), ...rects.map(r => ({ top: r.y, img: r }))].sort((a, b) => a.top - b.top);
      const cp = newPage('document'); cp.blocks = []; let prev: { b: TextBlock; line: TLine } | null = null, prevBottom = -1;
      for (const el of els) {
        if (el.img) {
          const r = el.img; if (r.w * r.h > cv.width * cv.height * 0.85 && free.length === 0) scanned++;
          const c = document.createElement('canvas'); c.width = Math.round(r.w); c.height = Math.round(r.h); c.getContext('2d')!.drawImage(cv, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
          const aid = await addAsset(doc, await canvasBlob(c, 'image/jpeg', 0.88), 'image/jpeg'); imagesN++;
          cp.blocks.push({ id: uid('b'), type: 'image', a: aid, w: Math.max(10, Math.min(100, Math.round(r.w / cv.width * 100 * 1.15))), align: 'center', caption: [] } as ImageBlock); prev = null; prevBottom = r.y + r.h; continue;
        }
        const L = el.line!; let txt = '', runs: Run[] = [], last: TItem | null = null;
        for (const t of L.items) {
          let s = t.str; if (last && t.x - (last.x + last.w) > last.fs * 0.22 && !/\s$/.test(last.str) && !/^\s/.test(s)) s = ' ' + s;
          const r: Run = { t: s }; if (t.b) r.b = true; if (t.i) r.i = true; if (t.c) r.c = t.c; const ratio = t.fs / body; if (ratio > 1.12 || ratio < 0.88) r.fs = Math.max(8, Math.min(72, Math.round(16 * ratio)));
          runs.push(r); txt += s; last = t;
        }
        runs = normalizeRuns(runs); const plain = txt.trim(); if (!plain) continue;
        const ratio = L.fs / body, hd = ratio >= 1.7 ? 1 : ratio >= 1.4 ? 2 : ratio >= 1.2 && plain.length < 90 ? 3 : 0;
        const m = /^([-–—•·●▪◦]|\d{1,2}[.)]|[a-zA-Z][.)])\s+/.exec(plain), gap = prevBottom < 0 ? 0 : L.y - L.fs - prevBottom;
        const mid = (L.x0 + L.x1) / 2, centered = Math.abs(mid - pageMid) < cv.width * 0.04 && L.x0 - minX0 > cv.width * 0.08;
        const cont = prev && !m && !hd && !prev.b.level && gap < L.fs * 0.9 && Math.abs(prev.line.fs - L.fs) < L.fs * 0.2 && (prev.line.x1 - prev.line.x0) > maxW * 0.82 && !centered && Math.abs(L.x0 - prev.line.x0) < L.fs * 3;
        if (cont) { { const pr = prev!.b.runs.slice(); if (pr.length) pr[pr.length - 1] = { ...pr[pr.length - 1], t: pr[pr.length - 1].t + ' ' }; prev!.b.runs = normalizeRuns([...pr, ...runs]); } prev!.line = L; prevBottom = L.y; continue; }
        if (gap > L.fs * 2.2 && cp.blocks.length) cp.blocks.push({ id: uid('b'), type: 'paragraph', runs: [] } as TextBlock);
        const blk: TextBlock = { id: uid('b'), type: 'paragraph', runs };
        if (hd) { blk.type = 'heading'; blk.level = hd as 1 | 2 | 3; blk.runs = runs.map(r => { const q = { ...r }; delete q.fs; delete q.b; return q; }); }
        else if (m) { blk.type = 'li'; blk.list = /^[-–—•·●▪◦]/.test(m[1]) ? 'bullet' : 'ordered'; let skip = m[0].length; blk.runs = []; for (const r of runs) { if (skip >= r.t.length) { skip -= r.t.length; continue; } blk.runs.push({ ...r, t: r.t.slice(skip) }); skip = 0; } blk.runs = normalizeRuns(blk.runs); }
        if (centered && !m) blk.align = 'center';
        cp.blocks.push(blk); prev = { b: blk, line: L }; prevBottom = L.y;
      }
      if (!cp.blocks.length) cp.blocks.push({ id: uid('b'), type: 'paragraph', runs: [] } as TextBlock);
      doc.pages.push(cp); cv.width = cv.height = 0; page.cleanup();
    }
  } finally { void pdf.destroy?.(); }
  let bch = 0, tch = 0; for (const p of doc.pages) for (const b of p.blocks) if (b.type === 'paragraph' || b.type === 'li') for (const r of b.runs) { tch += r.t.length; if (r.b) bch += r.t.length; }
  if (tch && bch / tch > 0.8) for (const p of doc.pages) for (const b of p.blocks) if (b.type === 'paragraph' || b.type === 'li') b.runs = normalizeRuns(b.runs.map(r => { const q = { ...r }; delete q.b; return q; }));
  const notes: string[] = []; if (scanned) notes.push(`${scanned} ta sahifa skaner (rasm) — matn yo‘q`); if (graphic) notes.push(`${graphic} ta sahifada vektor grafik bo‘lishi mumkin (tushib qoladi)`);
  (doc as any).__note = notes.join('; ') + (imagesN ? ` · ${imagesN} rasm ajratildi` : ''); return doc;
}
