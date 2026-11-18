import { crcHex, sha256Hex } from './crc32';
import { FurError } from './errors';
import { readZip, writeZip, ZipEntry, ZipLimits, DEFAULT_LIMITS } from './zip';
import { Align, Background, Block, FORMAT_VERSION, FurAsset, FurDocument, FurObject, FurPage, Layout, PageType, Run, defaultLayout, uid } from './model';
import { normalizeRuns } from './runs';

const MIMES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4' };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_JSON = 64 * 1024 * 1024, MAX_OBJECTS = 200000;
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const col = (v: unknown): string => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : '#111111');

function cleanObject(o: any): FurObject | null {
  if (!o || typeof o !== 'object') return null;
  const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : uid('o'), c = col(o.c), w = num(o.w) ? o.w : 3;
  switch (o.t) {
    case 'stroke': {
      if (!Array.isArray(o.pts) || o.pts.length > 200000) return null;
      const pts: [number, number][] = []; for (const p of o.pts) if (Array.isArray(p) && num(p[0]) && num(p[1])) pts.push([p[0], p[1]]);
      return pts.length ? { t: 'stroke', id, pts, c, w, hl: !!o.hl } : null;
    }
    case 'line': case 'arrow': case 'rect': case 'ellipse':
      return [o.x1, o.y1, o.x2, o.y2].every(num) ? { t: o.t, id, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, c, w } : null;
    case 'text': return typeof o.tx === 'string' && num(o.x) && num(o.y) ? { t: 'text', id, x: o.x, y: o.y, tx: o.tx.slice(0, 5000), s: num(o.s) ? o.s : 24, c } : null;
    case 'image': return typeof o.a === 'string' && [o.x, o.y, o.w, o.h].every(num) ? { t: 'image', id, a: o.a, x: o.x, y: o.y, w: o.w, h: o.h } : null;
  }
  return null;
}
function cleanRuns(a: any): Run[] {
  if (!Array.isArray(a)) return [];
  const out: Run[] = [];
  for (const x of a.slice(0, 50000)) {
    if (!x || typeof x.t !== 'string') continue;
    const r: Run = { t: x.t.slice(0, 100000) };
    for (const k of ['b', 'i', 'u', 's', 'sup', 'sub'] as const) if (x[k] === true) r[k] = true;
    if (typeof x.c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(x.c)) r.c = x.c;
    if (num(x.fs) && x.fs >= 6 && x.fs <= 200) r.fs = x.fs;
    if (typeof x.ff === 'string' && /^[\w\s,'"-]{1,80}$/.test(x.ff)) r.ff = x.ff;
    if (typeof x.href === 'string' && x.href.length < 2000 && /^(https?:|mailto:)/i.test(x.href)) r.href = x.href;
    out.push(r);
  }
  return normalizeRuns(out);
}
const aligns: Align[] = ['left', 'center', 'right', 'justify'];
const cleanAlign = (v: unknown): Align | undefined => (aligns as unknown[]).includes(v) ? v as Align : undefined;
function cleanBlocks(b: any): Block[] {
  if (!Array.isArray(b)) return [];
  const out: Block[] = [];
  for (const x of b.slice(0, 20000)) {
    if (!x || typeof x !== 'object') continue;
    const id = typeof x.id === 'string' && ID_RE.test(x.id) ? x.id : uid('b');
    if (x.type === 'heading' || x.type === 'paragraph' || x.type === 'li') {
      const runs = Array.isArray(x.runs) ? cleanRuns(x.runs) : typeof x.text === 'string' ? cleanRuns([{ t: x.text }]) : [];
      const blk: Block = { id, type: x.type, runs };
      if (x.type === 'heading') blk.level = x.level === 2 ? 2 : x.level === 3 ? 3 : 1;
      if (x.type === 'li') { blk.list = x.list === 'ordered' ? 'ordered' : 'bullet'; blk.indent = num(x.indent) ? Math.max(0, Math.min(3, Math.round(x.indent))) : 0; }
      const al = cleanAlign(x.align); if (al && al !== 'left') blk.align = al;
      out.push(blk);
    } else if (x.type === 'table' && Array.isArray(x.rows)) {
      const rows: Run[][][] = x.rows.slice(0, 200).map((r: any) => Array.isArray(r) ? r.slice(0, 30).map(cleanRuns) : []);
      const cols = Math.max(1, ...rows.map(r => r.length));
      for (const r of rows) while (r.length < cols) r.push([]);
      if (rows.length) out.push({ id, type: 'table', header: !!x.header, rows });
    } else if (x.type === 'image' && typeof x.a === 'string' && ID_RE.test(x.a)) {
      out.push({ id, type: 'image', a: x.a, w: num(x.w) ? Math.max(5, Math.min(100, x.w)) : 100, align: cleanAlign(x.align) ?? 'center', caption: cleanRuns(x.caption) });
    }
  }
  return out;
}
function cleanLayout(l: any): Layout {
  const d = defaultLayout(); if (!l || typeof l !== 'object') return d;
  return { margin: l.margin === 'narrow' || l.margin === 'wide' ? l.margin : 'normal', header: typeof l.header === 'string' ? l.header.slice(0, 200) : '', footer: typeof l.footer === 'string' ? l.footer.slice(0, 200) : '', pageNumbers: l.pageNumbers !== false };
}
function cleanPage(j: any, fallbackType: PageType): FurPage {
  if (!j || typeof j !== 'object') throw new FurError('INVALID', 'Sahifa JSON noto‘g‘ri');
  const raw = j.objects ?? j.objs ?? [];
  if (!Array.isArray(raw)) throw new FurError('INVALID', 'Sahifa obyektlari massiv emas');
  if (raw.length > MAX_OBJECTS) throw new FurError('TOO_LARGE', 'Sahifada obyektlar juda ko‘p');
  const objects: FurObject[] = []; for (const o of raw) { const c = cleanObject(o); if (c) objects.push(c); }
  const v = j.view && num(j.view.s) && num(j.view.x) && num(j.view.y) ? { s: Math.max(0.05, Math.min(10, j.view.s)), x: j.view.x, y: j.view.y } : { s: 1, x: 0, y: 0 };
  const type: PageType = j.type === 'document' ? 'document' : j.type === 'board' ? 'board' : fallbackType;
  const bg: Background = j.bg === 'white' || j.bg === 'dark' || j.bg === 'grid' ? j.bg : 'grid';
  return { id: typeof j.id === 'string' && ID_RE.test(j.id) ? j.id : uid('p'), type, title: typeof j.title === 'string' ? j.title.slice(0, 200) : '', bg, view: v, objects, blocks: cleanBlocks(j.blocks) };
}
function parseJson(u: Uint8Array, what: string): any {
  if (u.length > MAX_JSON) throw new FurError('TOO_LARGE', what + ' juda katta');
  try { return JSON.parse(dec.decode(u)); } catch { throw new FurError('INVALID', what + ' JSON emas'); }
}

export async function serializeFur(doc: FurDocument): Promise<Uint8Array> {
  const entries: ZipEntry[] = [], files: Record<string, { size: number; crc32: string; sha256?: string }> = {};
  const add = async (name: string, data: Uint8Array, store = false) => {
    entries.push({ name, data, store }); const s = await sha256Hex(data);
    files[name] = { size: data.length, crc32: crcHex(data), ...(s ? { sha256: s } : {}) };
  };
  const pages: { id: string; type: PageType; file: string }[] = [];
  for (let i = 0; i < doc.pages.length; i++) {
    const p = doc.pages[i], file = 'pages/p-' + String(i + 1).padStart(4, '0') + '.json';
    pages.push({ id: p.id, type: p.type, file });
    await add(file, enc.encode(JSON.stringify({ id: p.id, type: p.type, title: p.title, bg: p.bg, view: p.view, objects: p.objects, blocks: p.blocks })));
  }
  const used = new Set<string>(); for (const p of doc.pages) { for (const o of p.objects) if (o.t === 'image') used.add(o.a); for (const b of p.blocks) if (b.type === 'image') used.add(b.a); }
  const assets: Record<string, { file: string; mime: string }> = {};
  for (const a of doc.assets) {
    if (!used.has(a.id) || !MIMES[a.mime] || !ID_RE.test(a.id)) continue;
    const file = 'assets/' + a.id + '.' + MIMES[a.mime]; await add(file, a.data, true); assets[a.id] = { file, mime: a.mime };
  }
  await add('metadata.json', enc.encode(JSON.stringify({ title: doc.title, author: doc.author, created: doc.created, modified: doc.modified, layout: doc.layout, app: 'FUR Platform' })));
  const manifest = { format: 'fur', formatVersion: FORMAT_VERSION, pages, assets, files };
  entries.unshift({ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest)) });
  return writeZip(entries);
}

export interface ParseResult { doc: FurDocument; sourceVersion: string; migrated: boolean; warnings: string[] }
export async function parseFur(bytes: Uint8Array, limits: ZipLimits = DEFAULT_LIMITS): Promise<ParseResult> {
  const z = await readZip(bytes, limits), warnings: string[] = [];
  const mf = z.get('manifest.json'); if (!mf) throw new FurError('MISSING', 'manifest.json topilmadi');
  const man = parseJson(mf, 'manifest.json');
  if (!man || man.format !== 'fur') throw new FurError('INVALID', 'Bu FUR fayl emas');
  const ver = String(man.formatVersion ?? ''); const major = Number(ver.split('.')[0]);
  if (!/^\d+\.\d+/.test(ver)) throw new FurError('INVALID', 'Format versiyasi noma’lum');
  if (major > 1) throw new FurError('UNSUPPORTED_VERSION', 'Fayl yangi versiyada (' + ver + '). Ilovani yangilang');
  const files = man.files && typeof man.files === 'object' ? man.files : {};
  for (const [name, meta] of Object.entries<any>(files)) {
    const d = z.get(name); if (!d) throw new FurError('MISSING', 'Fayl yetishmaydi: ' + name);
    const crc = typeof meta === 'string' ? meta : meta?.crc32;
    if (crc && crcHex(d) !== crc) throw new FurError('CHECKSUM', 'Fayl buzilgan: ' + name);
    if (meta && typeof meta === 'object' && meta.sha256) { const s = await sha256Hex(d); if (s && s !== meta.sha256) throw new FurError('CHECKSUM', 'SHA-256 mos emas: ' + name); }
  }
  for (const n of z.keys()) if (n !== 'manifest.json' && !(n in files)) warnings.push('Manifestda yo‘q fayl e’tiborsiz qoldirildi: ' + n);
  const pl: any[] = Array.isArray(man.pages) ? man.pages : [];
  const pages: FurPage[] = [];
  for (const e of pl) {
    const file = typeof e === 'string' ? e : e?.file, d = typeof file === 'string' ? z.get(file) : undefined;
    if (!d) throw new FurError('MISSING', 'Sahifa fayli yetishmaydi: ' + String(file));
    const p = cleanPage(parseJson(d, String(file)), 'board');
    if (typeof e === 'object' && e?.type && !pages.some(x => x.id === p.id)) p.type = e.type === 'document' ? 'document' : 'board';
    pages.push(p);
  }
  if (!pages.length) throw new FurError('INVALID', 'Faylda sahifa yo‘q');
  const assets: FurAsset[] = [];
  for (const [id, a] of Object.entries<any>(man.assets && typeof man.assets === 'object' ? man.assets : {})) {
    if (!ID_RE.test(id) || !a || !MIMES[a.mime] || typeof a.file !== 'string' || !a.file.startsWith('assets/')) { warnings.push('Rasm o‘tkazib yuborildi: ' + id); continue; }
    const d = z.get(a.file); if (!d) throw new FurError('MISSING', 'Rasm yetishmaydi: ' + a.file);
    assets.push({ id, mime: a.mime, data: d });
  }
  const md = z.get('metadata.json') ? parseJson(z.get('metadata.json')!, 'metadata.json') : {};
  const now = Date.now();
  const doc: FurDocument = { title: typeof md.title === 'string' && md.title.trim() ? md.title.slice(0, 200) : 'Nomsiz dars', author: typeof md.author === 'string' ? md.author.slice(0, 200) : '',
    created: num(md.created) ? md.created : now, modified: num(md.modified) ? md.modified : now, pages, assets, layout: cleanLayout(md.layout) };
  return { doc, sourceVersion: ver, migrated: major < 1, warnings };
}
