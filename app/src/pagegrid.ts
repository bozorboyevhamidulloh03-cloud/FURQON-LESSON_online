// Sahifalar to'ri: hamma sahifaning haqiqiy kichraytirilgan ko'rinishi (3x3 va h.k.)
import { FurDocument, FurPage } from '../../packages/fur-format/src/index';
import { drawObject, objBounds } from './boardrender';
import { renderDoc } from './present';

export interface GridHandle { destroy(): void }

export function mountPageGrid(host: HTMLElement, doc: FurDocument, onMove?: (from: number, to: number) => void): GridHandle {
  const urls: string[] = [], imgs = new Map<string, HTMLImageElement>(); let dead = false;
  const redraw: (() => void)[] = [];
  const getImg = (id: string): HTMLImageElement | null => {
    const c = imgs.get(id); if (c) return c.complete && c.naturalWidth ? c : null;
    const a = doc.assets.find(x => x.id === id); if (!a) return null;
    const u = URL.createObjectURL(new Blob([a.data as BlobPart], { type: a.mime })); urls.push(u);
    const im = new Image(); im.onload = () => { if (!dead) redraw.forEach(f => f()); }; im.src = u; imgs.set(id, im); return null;
  };
  function boardThumb(cell: HTMLElement, p: FurPage) {
    const c = document.createElement('canvas'); cell.appendChild(c);
    const draw = () => {
      const W = cell.clientWidth, H = cell.clientHeight; if (!W || !H) return; const d = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(W * d); c.height = Math.round(H * d); c.style.width = W + 'px'; c.style.height = H + 'px';
      const g = c.getContext('2d')!; g.setTransform(d, 0, 0, d, 0, 0); const dark = p.bg === 'dark'; g.fillStyle = dark ? '#1b1e26' : '#fff'; g.fillRect(0, 0, W, H);
      let a = Infinity, b = Infinity, e = -Infinity, f = -Infinity; for (const o of p.objects) { const r = objBounds(g, o); a = Math.min(a, r[0]); b = Math.min(b, r[1]); e = Math.max(e, r[2]); f = Math.max(f, r[3]); }
      if (!p.objects.length) return; const pad = 8, s = Math.max(0.02, Math.min(4, (W - 2 * pad) / Math.max(1, e - a), (H - 2 * pad) / Math.max(1, f - b)));
      const tx = (W - (e - a) * s) / 2 - a * s, ty = (H - (f - b) * s) / 2 - b * s; g.save(); g.translate(tx, ty); g.scale(s, s);
      const inkC = (col: string) => dark && col.toLowerCase() === '#111111' ? '#f5f5f5' : col; for (const o of p.objects) drawObject(g, o, inkC, getImg); g.restore();
    };
    redraw.push(draw); return draw;
  }
  function docThumb(cell: HTMLElement, p: FurPage, no: number) {
    const paper = renderDoc(doc, p, urls, no); cell.appendChild(paper);
    const fit = () => { const W = cell.clientWidth; if (!W) return; paper.style.left = '0'; paper.style.marginLeft = '0'; paper.style.top = '0'; paper.style.transformOrigin = 'top left'; paper.style.transform = `scale(${W / 794})`; };
    redraw.push(fit); return fit;
  }
  const grid = document.createElement('div'); grid.className = 'pgrid'; host.appendChild(grid);
  const draws: (() => void)[] = [];
  doc.pages.forEach((p, i) => {
    const cell = document.createElement('div'); cell.className = 'pcell ' + p.type; cell.dataset.open = String(i); cell.tabIndex = 0; cell.setAttribute('role', 'button'); cell.setAttribute('aria-label', `${i + 1}-sahifani ochish`);
    const view = document.createElement('div'); view.className = 'pview'; cell.appendChild(view);
    const lab = document.createElement('div'); lab.className = 'plab'; lab.innerHTML = `<b>${i + 1}</b><span>${p.type === 'board' ? 'Doska' : 'Hujjat'}</span>`; cell.appendChild(lab);
    const act = document.createElement('div'); act.className = 'pact';
    act.innerHTML = `<button class="ib" data-sa="up:${i}" aria-label="Oldinga" ${i === 0 ? 'disabled' : ''}>◀</button><button class="ib" data-sa="down:${i}" aria-label="Orqaga" ${i === doc.pages.length - 1 ? 'disabled' : ''}>▶</button><button class="ib dng" data-sa="delpage:${i}" aria-label="O‘chirish">✕</button>`; cell.appendChild(act);
    grid.appendChild(cell);
    draws.push(p.type === 'board' ? boardThumb(view, p) : docThumb(view, p, i + 1));
  });
  // ---- sudrab tartibini o'zgartirish: sichqoncha — biroz sudrash, sensor — uzoq bosish ----
  let dFrom = -1, dTo = -1, sx = 0, sy = 0, tm = 0, active = false, justDragged = false, pid = -1;
  const cells = () => Array.from(grid.querySelectorAll<HTMLElement>('.pcell'));
  const clearMarks = () => cells().forEach(c => c.classList.remove('pdrag', 'pdrop'));
  const startDrag = () => { active = true; grid.classList.add('dragging'); cells()[dFrom]?.classList.add('pdrag'); };
  const stop = () => { clearTimeout(tm); if (active && dTo >= 0 && dTo !== dFrom) { justDragged = true; setTimeout(() => { justDragged = false; }, 400); onMove?.(dFrom, dTo); } else if (active) { justDragged = true; setTimeout(() => { justDragged = false; }, 400); } active = false; dFrom = dTo = -1; pid = -1; grid.classList.remove('dragging'); clearMarks(); };
  grid.addEventListener('pointerdown', e => {
    if (!onMove || (e.pointerType === 'mouse' && e.button !== 0) || (e.target as HTMLElement).closest('button')) return;
    const c = (e.target as HTMLElement).closest<HTMLElement>('.pcell'); if (!c) return; dFrom = Number(c.dataset.open); dTo = -1; sx = e.clientX; sy = e.clientY; pid = e.pointerId; active = false;
    if (e.pointerType !== 'mouse') { clearTimeout(tm); tm = window.setTimeout(() => { if (dFrom >= 0) startDrag(); }, 350); }
  });
  grid.addEventListener('pointermove', e => {
    if (dFrom < 0 || e.pointerId !== pid) return;
    if (!active) { const mv = Math.hypot(e.clientX - sx, e.clientY - sy); if (e.pointerType === 'mouse' && mv > 6) startDrag(); else if (e.pointerType !== 'mouse' && mv > 10) { clearTimeout(tm); dFrom = -1; } if (!active) return; }
    e.preventDefault(); const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.pcell'); clearMarks(); cells()[dFrom]?.classList.add('pdrag');
    if (el && grid.contains(el)) { dTo = Number(el.dataset.open); if (dTo !== dFrom) el.classList.add('pdrop'); } else dTo = -1;
  });
  grid.addEventListener('touchmove', e => { if (active) e.preventDefault(); }, { passive: false });
  grid.addEventListener('pointerup', stop); grid.addEventListener('pointercancel', () => { active = false; stop(); });
  grid.addEventListener('click', e => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
  grid.addEventListener('contextmenu', e => { if (dFrom >= 0) e.preventDefault(); });
  const ro = new ResizeObserver(() => draws.forEach(f => f())); ro.observe(grid); requestAnimationFrame(() => draws.forEach(f => f()));
  return { destroy() { dead = true; ro.disconnect(); urls.forEach(u => URL.revokeObjectURL(u)); grid.remove(); } };
}
