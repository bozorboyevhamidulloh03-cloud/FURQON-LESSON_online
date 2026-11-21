// Muharrir bo'laklari (fragment): nusxa / qo'yish / boshqa sahifaga ko'chirish uchun umumiy tur va yordamchilar
import { cropAspect } from './imgcrop';
import { drawObject, objBounds } from './boardrender';
import { Block, FurAsset, FurDocument, FurObject, ImageBlock, Run, TableBlock, TextBlock, normalizeRuns, plainText, uid } from '../../packages/fur-format/src/index';

export interface Frag { blocks: Block[]; startPartial: boolean; endPartial: boolean; assets: FurAsset[] }
let store: { frag: Frag; text: string } | null = null;
export const getClip = () => store;
export function setClip(frag: Frag, text: string) { store = { frag, text }; }

const isText = (b: Block): b is TextBlock => b.type === 'paragraph' || b.type === 'heading' || b.type === 'li';
export const blockText = (b: Block): string => isText(b) ? plainText(b.runs) : b.type === 'table' ? b.rows.map(r => r.map(c => plainText(c)).join('\t')).join('\n') : plainText(b.caption);
export const fragText = (f: Frag): string => f.blocks.map(blockText).join('\n');
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function runHtml(r: Run): string {
  const st = [r.b && 'font-weight:700', r.i && 'font-style:italic', (r.u || r.s) && 'text-decoration:' + [r.u && 'underline', r.s && 'line-through'].filter(Boolean).join(' '), r.c && 'color:' + r.c, r.hl && 'background-color:' + r.hl, r.fs && 'font-size:' + r.fs + 'px'].filter(Boolean).join(';');
  return `<span style="${st}">${esc(r.t).replace(/\n/g, '<br>')}</span>`;
}
/** Tashqi ilovalar (Word, Gmail) uchun HTML — rang va qalin saqlanadi. */
export function fragHtml(f: Frag): string {
  return f.blocks.map(b => {
    if (isText(b)) { const t = b.type === 'heading' ? 'h' + (b.level ?? 1) : 'p'; return `<${t}>${b.runs.map(runHtml).join('')}</${t}>`; }
    if (b.type === 'table') return `<table>${b.rows.map((r, ri) => `<tr>${r.map((c, ci) => { const mg = b.merges?.find(m => ri >= m.r && ri < m.r + m.rs && ci >= m.c && ci < m.c + m.cs); if (mg && (mg.r !== ri || mg.c !== ci)) return ''; const st = b.cs?.[ri + ',' + ci], sty = [st?.a && 'text-align:' + st.a, st?.bg && 'background:' + st.bg].filter(Boolean).join(';'); return `<td${mg && mg.rs > 1 ? ` rowspan="${mg.rs}"` : ''}${mg && mg.cs > 1 ? ` colspan="${mg.cs}"` : ''}${sty ? ` style="${sty}"` : ''}>${c.map(runHtml).join('')}</td>`; }).join('')}</tr>`).join('')}</table>`;
    return `<p>[rasm]</p>`;
  }).join('');
}
/** Bo'lakni chuqur nusxalaydi; yangi blok identifikatorlari beriladi. */
export function cloneFrag(f: Frag, fresh = false): Frag {
  const bl = JSON.parse(JSON.stringify(f.blocks)) as Block[]; if (fresh) bl.forEach(b => { b.id = uid('b'); });
  return { blocks: bl, startPartial: f.startPartial, endPartial: f.endPartial, assets: f.assets.map(a => ({ ...a, data: a.data.slice() })) as FurAsset[] };
}
/** Bo'lakdagi rasmlar hujjatda bo'lmasa, qo'shib qo'yadi. */
export function ensureAssets(doc: FurDocument, f: Frag) { for (const a of f.assets) if (!doc.assets.some(x => x.id === a.id)) doc.assets.push({ ...a, data: a.data.slice() } as FurAsset); }
export function collectAssets(doc: FurDocument, blocks: Block[]): FurAsset[] { const ids = new Set(blocks.filter((b): b is ImageBlock => b.type === 'image').map(b => b.a)); return doc.assets.filter(a => ids.has(a.id)).map(a => ({ ...a, data: a.data.slice() }) as FurAsset); }
export const sliceRuns = (runs: Run[], s: number, e: number): Run[] => {
  const out: Run[] = []; let pos = 0;
  for (const r of runs) { const a = Math.max(s, pos), b = Math.min(e, pos + r.t.length); if (b > a) out.push({ ...r, t: r.t.slice(a - pos, b - pos) }); pos += r.t.length; }
  return normalizeRuns(out);
};
export { isText };

/** Bo'lakni doska obyektlariga aylantiradi (matn → matn obyekti, rasm → rasm obyekti). */
export async function toBoardObjects(doc: FurDocument, f: Frag, x0: number, y0: number): Promise<FurObject[]> {
  const out: FurObject[] = []; let y = y0;
  for (const b of f.blocks) {
    if (isText(b)) { const tx = plainText(b.runs).trim(); if (!tx) continue; const s = b.type === 'heading' ? 30 : 20, c = b.runs.find(r => r.c)?.c ?? '#111111'; out.push({ t: 'text', id: uid('o'), x: x0, y, tx: tx.slice(0, 2000), s, c }); y += s * 1.5 * Math.max(1, tx.split('\n').length) + 14; }
    else if (b.type === 'image') {
      const a = doc.assets.find(z => z.id === b.a) ?? f.assets.find(z => z.id === b.a); if (!a) continue;
      const dim = await new Promise<[number, number]>(res => { const u = URL.createObjectURL(new Blob([a.data as BlobPart], { type: a.mime })), im = new Image(); im.onload = () => { res([im.naturalWidth, im.naturalHeight]); URL.revokeObjectURL(u); }; im.onerror = () => { res([400, 300]); URL.revokeObjectURL(u); }; im.src = u; });
      const w = 420, h = Math.round(w / cropAspect(dim[0], dim[1], b.crop)); const io: FurObject = { t: 'image', id: uid('o'), a: a.id, x: x0, y, w, h }; if (b.crop) io.crop = { ...b.crop }; out.push(io); y += h + 20;
    } else if (b.type === 'table') { const tx = (b as TableBlock).rows.map(r => r.map(c => plainText(c)).join('  |  ')).join('\n'); out.push({ t: 'text', id: uid('o'), x: x0, y, tx, s: 18, c: '#111111' }); y += 24 * (b as TableBlock).rows.length + 14; }
  }
  return out;
}

/** Doska obyektlarini hujjat bloklariga aylantiradi (matn → abzats, rasm → rasm, qolganlari → PNG rasm). */
export async function objectsToBlocks(doc: FurDocument, objs: FurObject[]): Promise<Block[]> {
  const out: Block[] = [];
  for (const o of objs) {
    if (o.t === 'text') { const lines = o.tx.split('\n'); for (const ln of lines) out.push({ id: uid('b'), type: 'paragraph', runs: ln ? [o.c && o.c.toLowerCase() !== '#111111' ? { t: ln, c: o.c } : { t: ln }] : [] } as TextBlock); }
    else if (o.t === 'image') { const ib: ImageBlock = { id: uid('b'), type: 'image', a: o.a, w: 60, align: 'center', caption: [] }; if (o.crop) ib.crop = { ...o.crop }; out.push(ib); }
    else {
      const cv = document.createElement('canvas'), g0 = cv.getContext('2d')!; const [a, b, e, f] = objBounds(g0, o), pad = 12, W = Math.max(8, e - a + 2 * pad), H = Math.max(8, f - b + 2 * pad), k = Math.min(2, 1600 / Math.max(W, H));
      cv.width = Math.round(W * k); cv.height = Math.round(H * k); const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.scale(k, k); g.translate(pad - a, pad - b); drawObject(g, o, c => c, () => null);
      const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/png')); if (!blob) continue;
      const id = uid('a'); doc.assets.push({ id, mime: 'image/png', data: new Uint8Array(await blob.arrayBuffer()) }); out.push({ id: uid('b'), type: 'image', a: id, w: Math.max(15, Math.min(80, Math.round(W / 794 * 100 * 1.4))), align: 'center', caption: [] } as ImageBlock);
    }
  }
  return out;
}

/** Sahifa tanlash oynasi: natija — {dest, move} yoki null. */
export function pagePicker(doc: FurDocument, cur: number, what: string): Promise<{ dest: number; move: boolean } | null> {
  return new Promise(res => {
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="dlg" role="dialog"><h3>Boshqa sahifaga</h3><p class="mut">${what}</p><div class="sendl">${doc.pages.map((p, i) => `<label class="fl ck"><input type="radio" name="dp" value="${i}" ${i === cur ? 'disabled' : ''}> ${i + 1}-sahifa · ${p.type === 'board' ? 'Doska' : 'Hujjat'}</label>`).join('')}</div><label class="fl ck"><input type="radio" name="dm" value="copy" checked> Nusxalash</label><label class="fl ck"><input type="radio" name="dm" value="move"> Ko‘chirish (bu yerdan o‘chadi)</label><div class="row"><button class="btn ghost" data-a="x">Bekor</button><button class="btn" data-a="ok" id="sg">Bajarish</button></div></div>`;
    document.body.append(ov); const end = (v: { dest: number; move: boolean } | null) => { ov.remove(); res(v); };
    ov.addEventListener('click', e => { const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a; if (e.target === ov || a === 'x') return end(null); if (a === 'ok') { const d = ov.querySelector<HTMLInputElement>('input[name=dp]:checked'); if (!d) return; end({ dest: Number(d.value), move: ov.querySelector<HTMLInputElement>('input[name=dm]:checked')!.value === 'move' }); } });
  });
}
