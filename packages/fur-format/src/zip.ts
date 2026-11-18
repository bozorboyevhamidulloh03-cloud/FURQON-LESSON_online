import { crc32 } from './crc32';
import { FurError } from './errors';
import { inflateRaw } from './inflate';
const hasStreams = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export interface ZipEntry { name: string; data: Uint8Array; store?: boolean }
export interface ZipLimits { maxEntries: number; maxTotal: number; maxEntry: number }
export const DEFAULT_LIMITS: ZipLimits = { maxEntries: 5000, maxTotal: 1024 ** 3, maxEntry: 512 * 1024 ** 2 };
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  if (!hasStreams) return data; // siqmasdan saqlanadi (store)
  const cs = new CompressionStream('deflate-raw'); const w = cs.writable.getWriter();
  const wp = w.write(data as unknown as BufferSource).then(() => w.close());
  const [buf] = await Promise.all([new Response(cs.readable).arrayBuffer(), wp]);
  return new Uint8Array(buf);
}
async function inflate(data: Uint8Array, cap: number): Promise<Uint8Array> {
  if (!hasStreams) { try { return inflateRaw(data, cap); } catch (e) { if ((e as Error).message === 'cap') throw new FurError('TOO_LARGE', 'Siqilgan fayl e’lon qilingan hajmdan katta (zip-bomba)'); throw new FurError('CORRUPT', 'Siqilgan ma’lumot buzilgan'); } }
  const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter();
  const wp = w.write(data as unknown as BufferSource).then(() => w.close()).catch(() => {});
  const r = ds.readable.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await r.read(); if (done) break;
      total += value.length;
      if (total > cap) { await r.cancel(); throw new FurError('TOO_LARGE', 'Siqilgan fayl e’lon qilingan hajmdan katta (zip-bomba)'); }
      chunks.push(value);
    }
  } catch (e) { if (e instanceof FurError) throw e; throw new FurError('CORRUPT', 'Siqilgan ma’lumot buzilgan'); }
  await wp;
  const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export async function writeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [], cds: Uint8Array[] = []; let off = 0;
  for (const e of entries) {
    const nm = enc.encode(e.name), crc = crc32(e.data); let method = 0, body = e.data;
    if (!e.store && e.data.length > 128) { const c = await deflate(e.data); if (c.length < e.data.length) { method = 8; body = c; } }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true);
    lh.setUint32(22, e.data.length, true); lh.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(lh.buffer), nm, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
    ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, e.data.length, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    cds.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + body.length;
  }
  let cdSize = 0; for (const p of cds) cdSize += p.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...cds, new Uint8Array(end.buffer)];
  const out = new Uint8Array(off + cdSize + 22); let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

export async function readZip(buf: Uint8Array, lim: ZipLimits = DEFAULT_LIMITS): Promise<Map<string, Uint8Array>> {
  if (buf.length < 22) throw new FurError('NOT_ZIP', 'Fayl juda kichik, ZIP konteyner emas');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = buf.length - 22; const stop = Math.max(0, buf.length - 65557);
  while (e >= stop && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < stop) throw new FurError('NOT_ZIP', 'ZIP konteyner emas');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  if (n === 0xFFFF || p === 0xFFFFFFFF) throw new FurError('INVALID', 'ZIP64 qo‘llab-quvvatlanmaydi');
  if (n > lim.maxEntries) throw new FurError('TOO_LARGE', 'Fayllar soni juda ko‘p');
  const out = new Map<string, Uint8Array>(); let total = 0;
  for (let i = 0; i < n; i++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) throw new FurError('CORRUPT', 'Konteyner katalogi buzilgan');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true);
    const csz = dv.getUint32(p + 20, true), usz = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    if (p + 46 + nl > buf.length) throw new FurError('CORRUPT', 'Konteyner katalogi buzilgan');
    let name: string; try { name = dec.decode(buf.subarray(p + 46, p + 46 + nl)); } catch { throw new FurError('UNSAFE', 'Fayl nomi noto‘g‘ri'); }
    if (flags & 1) throw new FurError('INVALID', 'Shifrlangan ZIP qo‘llab-quvvatlanmaydi');
    if (!name || name.length > 255 || name.startsWith('/') || name.includes('\\') || name.includes(':') || name.split('/').some(s => s === '..' || s === '.'))
      throw new FurError('UNSAFE', 'Xavfli fayl nomi: ' + name.slice(0, 60));
    if (out.has(name)) throw new FurError('INVALID', 'Takrorlangan fayl: ' + name);
    if (name.endsWith('/')) { p += 46 + nl + el + cl; continue; }
    if (usz > lim.maxEntry) throw new FurError('TOO_LARGE', 'Fayl juda katta: ' + name);
    total += usz; if (total > lim.maxTotal) throw new FurError('TOO_LARGE', 'Umumiy hajm juda katta');
    if (lo + 30 > buf.length || dv.getUint32(lo, true) !== 0x04034b50) throw new FurError('CORRUPT', 'Fayl sarlavhasi buzilgan: ' + name);
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    if (ds + csz > buf.length) throw new FurError('CORRUPT', 'Fayl kesilgan: ' + name);
    const raw = buf.subarray(ds, ds + csz); let data: Uint8Array;
    if (method === 0) { if (csz !== usz) throw new FurError('CORRUPT', 'Hajm mos emas: ' + name); data = raw.slice(); }
    else if (method === 8) { data = await inflate(raw, usz); if (data.length !== usz) throw new FurError('CORRUPT', 'Hajm mos emas: ' + name); }
    else throw new FurError('INVALID', 'Noma’lum siqish usuli');
    if (crc32(data) !== crc) throw new FurError('CHECKSUM', 'CRC mos emas: ' + name);
    out.set(name, data); p += 46 + nl + el + cl;
  }
  return out;
}
