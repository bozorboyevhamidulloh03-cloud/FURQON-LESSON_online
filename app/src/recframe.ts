// Yozuv uchun kadr manbai: taqdimot ochiq bo‘lsa — uning o‘zi (qalam/lazer/zoom bilan), aks holda — hozirgi sahifa MODEL'idan
// (ya'ni o‘quvchilar ko‘rayotgan sahifa, ustoz tahrirlayotgan bo‘lsa ham). Shu tufayli yozuv taqdimotdan chiqqanda to‘xtamaydi.
import { FurDocument } from '../../packages/fur-format/src/index';
import { PresentHandle, renderDoc } from './present';
import { drawObject, objBounds } from './boardrender';
import { rasterize } from './snapshot';

export interface FrameCtl { frame(g: CanvasRenderingContext2D, W: number, H: number): void; dispose(): void }
export interface FrameDeps { getDoc(): FurDocument | null; getIdx(): number; getView(): PresentHandle | null; getFocus(): { i: number; v: number } | null }

export function makeFrames(d: FrameDeps): FrameCtl {
  const urls: string[] = [], imgs = new Map<string, HTMLImageElement | null>();
  const getImg = (id: string): HTMLImageElement | null => {
    if (imgs.has(id)) { const im = imgs.get(id)!; return im && im.complete && im.naturalWidth ? im : null; }
    const a = d.getDoc()?.assets.find(x => x.id === id); if (!a) { imgs.set(id, null); return null; }
    const u = URL.createObjectURL(new Blob([a.data as BlobPart], { type: a.mime })); urls.push(u); const im = new Image(); im.src = u; imgs.set(id, im); return null;
  };
  let paperImg: HTMLImageElement | null = null, paperH = 1123, paperKey = '', sig = '', busy = false, off = 0, offKey = '';
  const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };
  const tick = window.setInterval(() => {
    const doc = d.getDoc(), i = d.getIdx(), p = doc?.pages[i]; if (!doc || !p || p.type === 'board' || busy) return;
    const k = i + ':' + hash(JSON.stringify(p.blocks)) + ':' + doc.assets.length; if (k === sig) return; sig = k; busy = true;
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;pointer-events:none;opacity:0'; const el = renderDoc(doc, p, urls, i + 1); host.append(el); document.body.append(host);
    const imgsEl = Array.from(el.querySelectorAll('img')); void Promise.all(imgsEl.map(im => im.complete ? Promise.resolve() : new Promise<void>(r => { im.onload = im.onerror = () => r(); }))).then(async () => {
      const h = Math.max(1123, el.offsetHeight), im = await rasterize(el, 794, h); host.remove();
      if (im) { paperImg = im; paperH = h; paperKey = String(i); } busy = false;
    });
  }, 700);
  return {
    dispose() { clearInterval(tick); for (const u of urls) URL.revokeObjectURL(u); },
    frame(g, W, H) {
      const v = d.getView(); if (v) { v.frame(g, W, H); return; }
      const doc = d.getDoc(), i = d.getIdx(), p = doc?.pages[i]; g.fillStyle = '#2a2d36'; g.fillRect(0, 0, W, H); if (!doc || !p) return;
      if (p.type === 'board') {
        const dark = p.bg === 'dark'; g.fillStyle = dark ? '#1b1e26' : '#fff'; g.fillRect(0, 0, W, H); if (!p.objects.length) return;
        const inkC = (c: string) => dark && c.toLowerCase() === '#111111' ? '#f5f5f5' : c;
        let a = 1e9, b = 1e9, e = -1e9, f = -1e9; for (const o of p.objects) { const r = objBounds(g, o); a = Math.min(a, r[0]); b = Math.min(b, r[1]); e = Math.max(e, r[2]); f = Math.max(f, r[3]); }
        const pad = 40, s = Math.max(0.05, Math.min(4, (W - 2 * pad) / Math.max(1, e - a), (H - 2 * pad) / Math.max(1, f - b)));
        g.save(); g.translate((W - (e - a) * s) / 2 - a * s, (H - (f - b) * s) / 2 - b * s); g.scale(s, s); for (const o of p.objects) drawObject(g, o, inkC, getImg); g.restore(); return;
      }
      if (!paperImg || paperKey !== String(i)) return;
      const sc = W / 794, full = paperH * sc, fo = d.getFocus(); let target = 0;
      if (fo && fo.i === i) target = fo.v * full - H * 0.4; target = Math.max(0, Math.min(Math.max(0, full - H), target));
      if (offKey !== String(i)) { off = target; offKey = String(i); } off += (target - off) * 0.18;
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(paperImg, 0, -off, W, full);
    },
  };
}
