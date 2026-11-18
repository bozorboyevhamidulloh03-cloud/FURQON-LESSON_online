import { Block, FurDocument, FurPage, Run, TextBlock } from '../../packages/fur-format/src/index';
import { drawObject, objBounds } from './boardrender';

export interface PresentHooks { page(i: number): void; laser(u: number, v: number, on: boolean): void; ink(pts: [number, number][] | null): void }
export interface PresentOpts { controlled?: boolean; onHand?: () => void; hooks?: PresentHooks }
export interface PresentHandle { destroy(): void; goto(i: number): void; refresh(): void; laser(u: number, v: number, on: boolean): void; ink(pts: [number, number][] | null): void; status(t: string, bad?: boolean): void; hand(on: boolean): void }
type Mode = 'nav' | 'laser' | 'pen';
const ico = (d: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

/** Hujjat sahifasini faqat o'qish uchun DOM ga aylantiradi (matn har doim textContent bilan qo'yiladi). */
function runEl(r: Run): HTMLElement {
  const s = document.createElement('span'); s.textContent = r.t; const st = s.style;
  if (r.b) st.fontWeight = '700'; if (r.i) st.fontStyle = 'italic';
  const dec = [r.u || r.href ? 'underline' : '', r.s ? 'line-through' : ''].filter(Boolean).join(' '); if (dec) st.textDecoration = dec;
  if (r.sup || r.sub) { st.verticalAlign = r.sup ? 'super' : 'sub'; st.fontSize = '0.75em'; }
  if (r.c) st.color = r.c; if (r.fs) st.fontSize = r.fs + 'px'; if (r.ff) st.fontFamily = r.ff; if (r.href) st.color = r.c ?? '#2a6fdb';
  st.whiteSpace = 'pre-wrap'; return s;
}
const fill = (el: HTMLElement, runs: Run[]) => { runs.forEach(r => el.appendChild(runEl(r))); return el; };
export function renderDoc(doc: FurDocument, page: FurPage, urls: string[], pageNo: number): HTMLElement {
  const pad = { narrow: 40, normal: 64, wide: 96 }[doc.layout.margin] ?? 64;
  const paper = document.createElement('div'); paper.className = 'pp-paper'; paper.style.setProperty('--pad', pad + 'px');
  if (doc.layout.header) { const h = document.createElement('div'); h.className = 'pp-hf'; h.textContent = doc.layout.header; paper.appendChild(h); }
  const body = document.createElement('div'); body.className = 'pp-body'; paper.appendChild(body);
  const counters = [0, 0, 0, 0];
  for (const b of page.blocks as Block[]) {
    if (b.type !== 'li') counters.fill(0);
    if (b.type === 'table') {
      const t = document.createElement('table'); t.className = 'pp-tbl';
      b.rows.forEach((row, ri) => { const tr = t.insertRow(); row.forEach(c => { const td = document.createElement(b.header && ri === 0 ? 'th' : 'td'); fill(td, c); tr.appendChild(td); }); }); body.appendChild(t);
    } else if (b.type === 'image') {
      const a = doc.assets.find(x => x.id === b.a); if (!a) continue;
      const wr = b.wrap ?? 'block', abs = wr === 'behind' || wr === 'front'; const f = document.createElement('figure'); f.className = 'pp-img w-' + wr; f.style.textAlign = b.align;
      if (abs) { f.style.left = `calc(var(--pad) + (100% - 2 * var(--pad)) * ${(b.x ?? 0) / 100})`; f.style.top = (b.y ?? 0) + 'px'; f.style.width = `calc((100% - 2 * var(--pad)) * ${b.w / 100})`; } else if (wr !== 'block') f.style.width = b.w + '%';
      const u = URL.createObjectURL(new Blob([a.data as BlobPart], { type: a.mime })); urls.push(u); const im = new Image(); im.src = u; im.style.width = wr === 'block' ? b.w + '%' : '100%'; f.appendChild(im);
      if (b.caption.length) { const c = document.createElement('figcaption'); fill(c, b.caption); f.appendChild(c); } body.appendChild(f);
    } else {
      const tb = b as TextBlock, el = document.createElement('div');
      el.className = tb.type === 'heading' ? 'pp-h' + (tb.level ?? 1) : 'pp-p'; if (tb.align) el.style.textAlign = tb.align; fill(el, tb.runs);
      if (!tb.runs.length) el.innerHTML = '&nbsp;';
      if (tb.type === 'li') {
        const ind = tb.indent ?? 0; if (tb.list === 'ordered') counters[ind]++; else counters[ind] = 0; for (let k = ind + 1; k < 4; k++) counters[k] = 0;
        const w = document.createElement('div'); w.className = 'pp-li'; w.style.marginLeft = ind * 28 + 'px';
        const mk = document.createElement('span'); mk.className = 'pp-mk'; mk.textContent = tb.list === 'ordered' ? counters[ind] + '.' : ind % 2 ? '◦' : '•'; w.append(mk, el); body.appendChild(w);
      } else body.appendChild(el);
    }
  }
  if (doc.layout.footer || doc.layout.pageNumbers) { const f = document.createElement('div'); f.className = 'pp-hf pp-ft'; f.textContent = [doc.layout.footer, doc.layout.pageNumbers ? String(pageNo) : ''].filter(Boolean).join('   ·   '); paper.appendChild(f); }
  return paper;
}

export function startPresentation(doc: FurDocument, startIndex: number, onExit: () => void, opts: PresentOpts = {}): PresentHandle {
  const ctl = !!opts.controlled, hk = opts.hooks;
  const root = document.createElement('div'); root.className = 'pres'; root.tabIndex = -1; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Taqdimot');
  root.innerHTML = `<div class="pres-stage" id="ps"></div><canvas class="pres-ink" id="pi"></canvas><div class="pres-laser" id="pl" hidden></div><div class="pres-black" id="pb" hidden></div>
  <div class="pres-bar" id="pbar" role="toolbar" aria-label="Taqdimot boshqaruvi">
    ${ctl ? '' : `<button data-p="prev" title="Oldingi (←)" aria-label="Oldingi">${ico('<path d="M15 5l-7 7 7 7"/>')}</button>`}<span class="pres-no" id="pn"></span>${ctl ? '<span class="pres-st" id="pst"></span>' : `<button data-p="next" title="Keyingi (→, bo‘sh joy)" aria-label="Keyingi">${ico('<path d="M9 5l7 7-7 7"/>')}</button>`}<i></i>
    ${ctl ? `<button data-p="hand" title="Qo‘l ko‘tarish — savol" aria-label="Qo‘l ko‘tarish">${ico('<path d="M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v8c0 4-2 6-5 6-3 0-4-1.5-6-4.5l-1.5-2.5a1.5 1.5 0 012.5-1.5L8 14"/>')}</button>` : ''}
    <button data-p="laser" ${ctl ? 'hidden' : ''} title="Lazer ko‘rsatkich (L)" aria-label="Lazer">${ico('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>')}</button>
    <button data-p="pen" ${ctl ? 'hidden' : ''} title="Qalam — vaqtincha chizish (P)" aria-label="Qalam">${ico('<path d="M4 20l1-4L16 5l3 3L8 19z"/>')}</button>
    <button data-p="clear" ${ctl ? 'hidden' : ''} title="Chizilganni tozalash (C)" aria-label="Tozalash">${ico('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>')}</button>
    <button data-p="black" ${ctl ? 'hidden' : ''} title="Qora ekran (B)" aria-label="Qora ekran">${ico('<rect x="4" y="5" width="16" height="12" rx="1"/><path d="M9 21h6"/>')}</button>
    <button data-p="zout" title="Kichraytirish (−)" aria-label="Kichraytirish">${ico('<circle cx="11" cy="11" r="6"/><path d="M8 11h6M20 20l-4.5-4.5"/>')}</button><button data-p="zin" title="Yaqinlashtirish (+)" aria-label="Yaqinlashtirish">${ico('<circle cx="11" cy="11" r="6"/><path d="M8 11h6M11 8v6M20 20l-4.5-4.5"/>')}</button><button data-p="full" title="To‘liq ekran (F)" aria-label="To‘liq ekran">${ico('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button><i></i>
    <button data-p="exit" title="Chiqish (Esc)" aria-label="Chiqish">${ico('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>`;
  document.body.appendChild(root);
  const stage = root.querySelector<HTMLElement>('#ps')!, ink = root.querySelector<HTMLCanvasElement>('#pi')!, laser = root.querySelector<HTMLElement>('#pl')!, black = root.querySelector<HTMLElement>('#pb')!, bar = root.querySelector<HTMLElement>('#pbar')!, no = root.querySelector<HTMLElement>('#pn')!;
  const g = ink.getContext('2d')!, urls: string[] = [], imgs = new Map<string, HTMLImageElement>();
  let cmap: { to(x: number, y: number): [number, number]; from(u: number, v: number): [number, number] } = { to: (x, y) => [x, y], from: (u, v) => [u, v] };
  let i = Math.max(0, Math.min(doc.pages.length - 1, startIndex)), mode: Mode = 'nav', hideT = 0, drawing = false, dead = false;
  let z = 1, panX = 0, panY = 0; const strokes: [number, number][][] = [];
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  const getImg = (id: string): HTMLImageElement | null => {
    const c = imgs.get(id); if (c) return c.complete && c.naturalWidth ? c : null;
    const a = doc.assets.find(x => x.id === id); if (!a) return null;
    const u = URL.createObjectURL(new Blob([a.data as BlobPart], { type: a.mime })); urls.push(u); const im = new Image(); im.onload = () => show(); im.src = u; imgs.set(id, im); return null;
  };
  function show(keep = false) {
    if (dead) return; const p = doc.pages[i], W = stage.clientWidth, H = stage.clientHeight; no.textContent = `${i + 1} / ${doc.pages.length}` + (z > 1.01 ? ` · ${Math.round(z * 100)}%` : '');
    const pv = root.querySelector<HTMLButtonElement>('[data-p=prev]'), nx = root.querySelector<HTMLButtonElement>('[data-p=next]'); if (pv) pv.disabled = i === 0; if (nx) nx.disabled = i === doc.pages.length - 1;
    const sl = stage.scrollLeft, stt = stage.scrollTop; stage.replaceChildren(); stage.scrollTop = 0; stage.scrollLeft = 0;
    if (p.type === 'board') {
      const dark = p.bg === 'dark'; stage.style.background = dark ? '#1b1e26' : '#fff'; stage.style.overflow = 'hidden';
      const c = document.createElement('canvas'), d = dpr(); c.width = Math.round(W * d); c.height = Math.round(H * d); c.style.width = W + 'px'; c.style.height = H + 'px'; stage.appendChild(c);
      const cx = c.getContext('2d')!; cx.setTransform(d, 0, 0, d, 0, 0); cx.fillStyle = dark ? '#1b1e26' : '#fff'; cx.fillRect(0, 0, W, H);
      const inkC = (col: string) => dark && col.toLowerCase() === '#111111' ? '#f5f5f5' : col;
      let a = Infinity, b = Infinity, e = -Infinity, f = -Infinity; for (const o of p.objects) { const r = objBounds(cx, o); a = Math.min(a, r[0]); b = Math.min(b, r[1]); e = Math.max(e, r[2]); f = Math.max(f, r[3]); }
      cmap = { to: (x, y) => [x / W, y / W], from: (u, v) => [u * W, v * W] };
      if (p.objects.length) {
        const pad = 24, s = Math.max(0.05, Math.min(4, (W - 2 * pad) / Math.max(1, e - a), (H - 2 * pad) / Math.max(1, f - b)));
        const tx0 = (W - (e - a) * s) / 2 - a * s, ty0 = (H - (f - b) * s) / 2 - b * s; panX = Math.max(W - W * z, Math.min(0, panX)); panY = Math.max(H - H * z, Math.min(0, panY));
        const S = s * z, tx = tx0 * z + panX, ty = ty0 * z + panY; cmap = { to: (x, y) => [(x - tx) / S, (y - ty) / S], from: (u, v) => [u * S + tx, v * S + ty] };
        cx.save(); cx.translate(tx, ty); cx.scale(S, S); for (const o of p.objects) drawObject(cx, o, inkC, getImg); cx.restore();
      }
    } else {
      stage.style.background = '#2a2d36'; stage.style.overflow = 'auto';
      const paper = renderDoc(doc, p, urls, i + 1); const wrap = document.createElement('div'); wrap.className = 'pp-wrap'; wrap.appendChild(paper); stage.appendChild(wrap);
      const s = Math.max(0.4, Math.min((W - 32) / 794, 2)) * z, ww = Math.max(W, 794 * s + 32); wrap.style.width = ww + 'px'; paper.style.left = ww / 2 + 'px'; paper.style.transform = `scale(${s})`; paper.style.transformOrigin = 'top center';
      cmap = { to: (x, y) => { const r = paper.getBoundingClientRect(), q = root.getBoundingClientRect(); return [(x - (r.left - q.left)) / r.width, (y - (r.top - q.top)) / r.width]; }, from: (u, v) => { const r = paper.getBoundingClientRect(), q = root.getBoundingClientRect(); return [u * r.width + r.left - q.left, v * r.width + r.top - q.top]; } };
      wrap.style.height = Math.max(H, paper.offsetHeight * s + 32) + 'px'; if (keep) { stage.scrollLeft = sl; stage.scrollTop = stt; }
    }
    sizeInk(); redrawInk();
  }
  function paintStroke(pts: [number, number][]) {
    g.strokeStyle = '#ff3b30'; g.lineWidth = 4; g.beginPath(); const P = pts.map(([u, v]) => cmap.from(u, v));
    if (P.length === 1) { g.moveTo(P[0][0], P[0][1]); g.lineTo(P[0][0] + 0.01, P[0][1]); }
    else { g.moveTo(P[0][0], P[0][1]); for (let k = 1; k < P.length - 1; k++) g.quadraticCurveTo(P[k][0], P[k][1], (P[k][0] + P[k + 1][0]) / 2, (P[k][1] + P[k + 1][1]) / 2); const l = P[P.length - 1]; g.lineTo(l[0], l[1]); }
    g.stroke();
  }
  function redrawInk() { g.clearRect(0, 0, root.clientWidth, root.clientHeight); for (const st of strokes) if (st.length) paintStroke(st); }
  function clearInk() { strokes.length = 0; redrawInk(); }
  function resetView() { z = 1; panX = 0; panY = 0; }
  let rq = 0; const later = () => { if (!rq) rq = requestAnimationFrame(() => { rq = 0; if (!dead) show(true); }); };
  function setZoom(nz: number, fx: number, fy: number) {
    nz = Math.max(1, Math.min(6, nz)); if (Math.abs(nz - z) < 0.001) return; const k = nz / z, p = doc.pages[i];
    if (p.type === 'board') { panX = fx - (fx - panX) * k; panY = fy - (fy - panY) * k; z = nz; } else { const l = (stage.scrollLeft + fx) * k - fx, t = (stage.scrollTop + fy) * k - fy; z = nz; show(); stage.scrollLeft = l; stage.scrollTop = t; redrawInk(); return; }
    if (z <= 1.001) { panX = 0; panY = 0; } show();
  }
  function panBy(dx: number, dy: number) { if (doc.pages[i].type === 'board') { if (z <= 1.001) return; panX += dx; panY += dy; later(); } else { stage.scrollLeft -= dx; stage.scrollTop -= dy; redrawInk(); } }
  function sizeInk() { const W = root.clientWidth, H = root.clientHeight, d = dpr(); ink.width = Math.round(W * d); ink.height = Math.round(H * d); ink.style.width = W + 'px'; ink.style.height = H + 'px'; g.setTransform(d, 0, 0, d, 0, 0); g.lineCap = 'round'; g.lineJoin = 'round'; }
  function go(n: number) { if (ctl) return; n = Math.max(0, Math.min(doc.pages.length - 1, n)); if (n === i) return; i = n; strokes.length = 0; resetView(); show(); hk?.page(i); }
  function setMode(m: Mode) { if (ctl) return; if (mode === 'laser') hk?.laser(0, 0, false); mode = mode === m ? 'nav' : m; laser.hidden = true; root.dataset.mode = mode; root.querySelectorAll<HTMLElement>('[data-p=laser],[data-p=pen]').forEach(b => b.classList.toggle('on', b.dataset.p === mode)); }
  const toggleBlack = () => { black.hidden = !black.hidden; root.querySelector('[data-p=black]')!.classList.toggle('on', !black.hidden); };
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void root.requestFullscreen?.().catch(() => { }); };
  function exit() { if (dead) return; dead = true; document.removeEventListener('keydown', kd, true); document.removeEventListener('fullscreenchange', fs); clearTimeout(hideT); ro.disconnect(); if (document.fullscreenElement) void document.exitFullscreen().catch(() => { }); urls.forEach(u => URL.revokeObjectURL(u)); root.remove(); onExit(); }
  const wake = () => { bar.classList.remove('hide'); clearTimeout(hideT); hideT = window.setTimeout(() => { if (!bar.matches(':hover')) bar.classList.add('hide'); }, 2500); };

  const kd = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; const k = e.key; let h = true;
    if (ctl) { if (k.toLowerCase() === 'f') { fullscreen(); e.preventDefault(); } else if (k === 'Escape' && !document.fullscreenElement) exit(); return; }
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') go(i + 1); else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') go(i - 1);
    else if (k === 'Home') go(0); else if (k === 'End') go(doc.pages.length - 1); else if (k === 'Escape') { if (document.fullscreenElement) void document.exitFullscreen(); else exit(); }
    else if (k.toLowerCase() === 'l') setMode('laser'); else if (k.toLowerCase() === 'p') setMode('pen'); else if (k.toLowerCase() === 'c') { clearInk(); hk?.ink(null); } else if (k === '+' || k === '=') setZoom(z * 1.4, root.clientWidth / 2, root.clientHeight / 2); else if (k === '-') setZoom(z / 1.4, root.clientWidth / 2, root.clientHeight / 2); else if (k === '0') { resetView(); show(); }
    else if (k.toLowerCase() === 'b') toggleBlack(); else if (k.toLowerCase() === 'f') fullscreen(); else h = false;
    if (h) { e.preventDefault(); e.stopPropagation(); wake(); }
  };
  document.addEventListener('keydown', kd, true);
  const fs = () => setTimeout(() => { show(); }, 120); document.addEventListener('fullscreenchange', fs);
  const ro = new ResizeObserver(() => show()); ro.observe(root);

  bar.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-p]'); if (!t) return; const a = t.dataset.p;
    if (a === 'prev') go(i - 1); else if (a === 'next') go(i + 1); else if (a === 'laser') setMode('laser'); else if (a === 'pen') setMode('pen'); else if (a === 'clear') { clearInk(); hk?.ink(null); } else if (a === 'zin') setZoom(z * 1.4, root.clientWidth / 2, root.clientHeight / 2); else if (a === 'zout') setZoom(z / 1.4, root.clientWidth / 2, root.clientHeight / 2); else if (a === 'zreset') { resetView(); show(); } else if (a === 'hand') opts.onHand?.();
    else if (a === 'black') toggleBlack(); else if (a === 'full') fullscreen(); else if (a === 'exit') exit();
  });
  // ko'rsatkich: lazer, qalam, zoom (chimchilash), surish, bosib o'tish
  let sx = 0, sy = 0, st = 0, moved = false, lastL = 0, lx = 0, ly = 0, pz = 0, pd = 1, pcx = 0, pcy = 0;
  const ptrs = new Map<number, [number, number]>();
  const pos = (e: PointerEvent): [number, number] => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const two = (): { d: number; cx: number; cy: number } => { const [p, q] = [...ptrs.values()]; return { d: Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, cx: (p[0] + q[0]) / 2, cy: (p[1] + q[1]) / 2 }; };
  root.addEventListener('pointerdown', e => {
    if ((e.target as HTMLElement).closest('.pres-bar')) return; const [x, y] = pos(e); ptrs.set(e.pointerId, [x, y]);
    try { root.setPointerCapture(e.pointerId); } catch { /* */ }
    if (ptrs.size === 2) { if (drawing) { strokes.pop(); drawing = false; redrawInk(); } const t = two(); pz = z; pd = t.d; pcx = t.cx; pcy = t.cy; moved = true; return; }
    if (ptrs.size > 2) return;
    sx = e.clientX; sy = e.clientY; st = Date.now(); moved = false; lx = x; ly = y;
    if (ctl) return;
    if (mode === 'laser') { laser.hidden = false; laser.style.transform = `translate(${x}px,${y}px)`; }
    if (mode === 'pen') { drawing = true; strokes.push([cmap.to(x, y)]); redrawInk(); }
  });
  root.addEventListener('pointermove', e => {
    wake(); const [x, y] = pos(e); if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [x, y]);
    if (ptrs.size === 2) { const t = two(); setZoom(pz * t.d / pd, t.cx, t.cy); panBy(t.cx - pcx, t.cy - pcy); pcx = t.cx; pcy = t.cy; moved = true; return; }
    if (mode === 'laser' && !ctl) { laser.hidden = false; laser.style.transform = `translate(${x}px,${y}px)`; if (hk && Date.now() - lastL > 45) { lastL = Date.now(); const [u, v] = cmap.to(x, y); hk.laser(u, v, true); } }
    if (mode === 'pen' && drawing && !ctl) {
      const evs = (e.getCoalescedEvents?.() ?? []); const list = evs.length ? evs : [e]; const cur = strokes[strokes.length - 1];
      for (const ev of list) { const [px, py] = pos(ev); cur.push(cmap.to(px, py)); }
      if (cur.length < 3) redrawInk(); else { const n = cur.length, A = cmap.from(cur[n - 3][0], cur[n - 3][1]), B = cmap.from(cur[n - 2][0], cur[n - 2][1]), C = cmap.from(cur[n - 1][0], cur[n - 1][1]); g.strokeStyle = '#ff3b30'; g.lineWidth = 4; g.beginPath(); g.moveTo((A[0] + B[0]) / 2, (A[1] + B[1]) / 2); g.quadraticCurveTo(B[0], B[1], (B[0] + C[0]) / 2, (B[1] + C[1]) / 2); g.stroke(); g.beginPath(); g.moveTo((B[0] + C[0]) / 2, (B[1] + C[1]) / 2); g.lineTo(C[0], C[1]); g.stroke(); }
    }
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) moved = true;
    if ((mode === 'nav' || ctl) && ptrs.size === 1 && moved && (z > 1.001 || doc.pages[i].type !== 'board')) { panBy(x - lx, y - ly); }
    lx = x; ly = y;
  });
  const upH = (e: PointerEvent) => {
    const had = ptrs.delete(e.pointerId); if (!had || (e.target as HTMLElement).closest('.pres-bar')) return;
    if (ptrs.size === 1) { const [p] = [...ptrs.values()]; lx = p[0]; ly = p[1]; }
    if (drawing) { drawing = false; const cur = strokes[strokes.length - 1]; if (hk && cur?.length) hk.ink(cur); }
    if (ctl || e.type === 'pointercancel') return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (mode === 'nav' && z <= 1.001) {
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 800) go(i + (dx < 0 ? 1 : -1));
      else if (!moved) { const r = root.getBoundingClientRect(); go(i + (e.clientX - r.left < r.width / 3 ? -1 : 1)); }
    }
  };
  root.addEventListener('pointerup', upH); root.addEventListener('pointercancel', upH);
  root.addEventListener('wheel', e => { if (e.ctrlKey || doc.pages[i].type === 'board') { e.preventDefault(); const [x, y] = pos(e as unknown as PointerEvent); setZoom(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), x, y); } }, { passive: false });
  stage.addEventListener('scroll', () => redrawInk());
  root.addEventListener('contextmenu', e => e.preventDefault());
  show(); wake(); root.focus(); hk?.page(i);
  (window as any).__pres = { get i() { return i; }, go, mode: () => mode, exit };
  const remoteInk = (pts: [number, number][] | null) => { if (!pts) { clearInk(); return; } strokes.push(pts); redrawInk(); };
  return {
    destroy: exit, refresh: show, ink: remoteInk,
    goto(n: number) { n = Math.max(0, Math.min(doc.pages.length - 1, n)); const ch = n !== i; i = n; if (ch) { strokes.length = 0; resetView(); } show(); },
    laser(u: number, v: number, on: boolean) { if (!on) { laser.hidden = true; return; } const [x, y] = cmap.from(u, v); laser.hidden = false; laser.style.transform = `translate(${x}px,${y}px)`; },
    status(t: string, bad = false) { const e = root.querySelector<HTMLElement>('#pst'); if (e) { e.textContent = t; e.classList.toggle('bad', bad); } },
    hand(on: boolean) { root.querySelector('[data-p=hand]')?.classList.toggle('on', on); },
  };
}
