import { croppedEl } from './imgcrop';
import { Block, FurDocument, FurPage, Run, StrokeObj, TextBlock, uid } from '../../packages/fur-format/src/index';
import { drawObject, objBounds } from './boardrender';
import { rasterize } from './snapshot';

export interface PresentHooks { page(i: number): void; laser(u: number, v: number, on: boolean): void; ink(pts: [number, number][] | null): void; focus?(u: number, v: number): void }
export type PresBtn = 'mic' | 'cam' | 'rec' | 'recp';
export type WriteObj = StrokeObj;
export interface PresentOpts { controlled?: boolean; onHand?: () => void; hooks?: PresentHooks; onBtn?: (b: PresBtn) => void; media?: boolean; record?: boolean; onWrite?: (o: StrokeObj) => void; onWriteUndo?: () => void }
export interface PresentHandle { setWrite(ok: boolean): void; stopFrames(): void; btn(id: PresBtn, st: { on?: boolean; dis?: boolean; hide?: boolean; title?: string }): void; frame(g: CanvasRenderingContext2D, W: number, H: number): void; viewSize(): [number, number]; destroy(): void; goto(i: number): void; refresh(): void; laser(u: number, v: number, on: boolean): void; ink(pts: [number, number][] | null): void; focus(u: number, v: number): void; status(t: string, bad?: boolean): void; hand(on: boolean): void; recInfo(t: string | null, paused?: boolean): void }
type Mode = 'nav' | 'laser' | 'pen';
const ico = (d: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

/** Hujjat sahifasini faqat o'qish uchun DOM ga aylantiradi (matn har doim textContent bilan qo'yiladi). */
function runEl(r: Run): HTMLElement {
  const s = document.createElement('span'); s.textContent = r.t; const st = s.style;
  if (r.b) st.fontWeight = '700'; if (r.i) st.fontStyle = 'italic';
  const dec = [r.u || r.href ? 'underline' : '', r.s ? 'line-through' : ''].filter(Boolean).join(' '); if (dec) st.textDecoration = dec;
  if (r.sup || r.sub) { st.verticalAlign = r.sup ? 'super' : 'sub'; st.fontSize = '0.75em'; }
  if (r.c) st.color = r.c; if (r.hl) st.backgroundColor = r.hl; if (r.fs) st.fontSize = r.fs + 'px'; if (r.ff) st.fontFamily = r.ff; if (r.href) st.color = r.c ?? '#2a6fdb';
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
      b.rows.forEach((row, ri) => { const tr = t.insertRow(); row.forEach((c, ci) => { const mg = b.merges?.find(m => ri >= m.r && ri < m.r + m.rs && ci >= m.c && ci < m.c + m.cs); if (mg && (mg.r !== ri || mg.c !== ci)) return; const td = document.createElement(b.header && ri === 0 ? 'th' : 'td'); if (mg) { if (mg.rs > 1) td.rowSpan = mg.rs; if (mg.cs > 1) td.colSpan = mg.cs; } const st = b.cs?.[ri + ',' + ci]; if (st?.a) td.style.textAlign = st.a; if (st?.bg) td.style.background = st.bg; fill(td, c); tr.appendChild(td); }); }); body.appendChild(t);
    } else if (b.type === 'image') {
      const a = doc.assets.find(x => x.id === b.a); if (!a) continue;
      const wr = b.wrap ?? 'block', abs = wr === 'behind' || wr === 'front'; const f = document.createElement('figure'); f.className = 'pp-img w-' + wr; f.style.textAlign = b.align;
      if (abs) { f.style.left = `calc(var(--pad) + (100% - 2 * var(--pad)) * ${(b.x ?? 0) / 100})`; f.style.top = (b.y ?? 0) + 'px'; f.style.width = `calc((100% - 2 * var(--pad)) * ${b.w / 100})`; } else if (wr !== 'block') f.style.width = b.w + '%';
      const u = URL.createObjectURL(new Blob([a.data as BlobPart], { type: a.mime })); urls.push(u); const im = new Image(); im.src = u; f.appendChild(croppedEl(im, b.crop, wr === 'block' ? b.w + '%' : '100%'));
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
  root.innerHTML = `<div class="pres-stage" id="ps"></div><canvas class="pres-ink" id="pi"></canvas><div class="pres-laser" id="pl" hidden></div><div class="pres-black" id="pb" hidden></div><div class="pres-rec" id="prb" role="status" aria-live="polite" hidden></div>
  <div class="pres-bar" id="pbar" role="toolbar" aria-label="Taqdimot boshqaruvi">
    ${ctl ? '' : `<button data-p="prev" title="Oldingi (←)" aria-label="Oldingi">${ico('<path d="M15 5l-7 7 7 7"/>')}</button>`}<span class="pres-no" id="pn"></span>${ctl ? '<span class="pres-st" id="pst"></span>' : `<button data-p="next" title="Keyingi (→, bo‘sh joy)" aria-label="Keyingi">${ico('<path d="M9 5l7 7-7 7"/>')}</button>`}<i></i>
    ${ctl ? `<button data-p="hand" title="Qo‘l ko‘tarish — savol" aria-label="Qo‘l ko‘tarish">${ico('<path d="M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v8c0 4-2 6-5 6-3 0-4-1.5-6-4.5l-1.5-2.5a1.5 1.5 0 012.5-1.5L8 14"/>')}</button>` : ''}
    ${ctl ? `<button data-p="write" hidden title="Doskaga yozish" aria-label="Yozish">${ico('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>')}</button><button data-p="wcol" hidden title="Rang" aria-label="Rang"><i class="wdot"></i></button><button data-p="wundo" hidden title="Oxirgi chizganimni qaytarish" aria-label="Qaytarish">${ico('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>')}</button>` : ''}
    <button data-p="laser" ${ctl ? 'hidden' : ''} title="Lazer ko‘rsatkich (L)" aria-label="Lazer">${ico('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>')}</button>
    <button data-p="pen" ${ctl ? 'hidden' : ''} title="Qalam — vaqtincha chizish (P)" aria-label="Qalam">${ico('<path d="M4 20l1-4L16 5l3 3L8 19z"/>')}</button>
    <button data-p="clear" ${ctl ? 'hidden' : ''} title="Chizilganni tozalash (C)" aria-label="Tozalash">${ico('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>')}</button>
    <button data-p="black" ${ctl ? 'hidden' : ''} title="Qora ekran (B)" aria-label="Qora ekran">${ico('<rect x="4" y="5" width="16" height="12" rx="1"/><path d="M9 21h6"/>')}</button>
    ${opts.media ? `<button data-p="mic" title="Mikrofon" aria-label="Mikrofon">${ico('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>')}</button><button data-p="cam" title="Kamera" aria-label="Kamera">${ico('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>')}</button>` : ''}${opts.record ? `<button data-p="rec" title="Darsni yozib olish (faqat shu sahifa + ovoz)" aria-label="Yozib olish">${ico('<circle cx="12" cy="12" r="6"/>')}</button><button data-p="recp" hidden title="Yozuvni pauza qilish" aria-label="Yozuvni pauza qilish">${ico('<path d="M9 5v14M15 5v14"/>')}</button>` : ''}
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
  const WCOL = ['#e03131', '#1971c2', '#2f9e44', '#111111']; let writeOn = false, wAllowed = false, wci = 0, wcur: [number, number][] | null = null, fitLock: { s: number; tx0: number; ty0: number } | null = null;
  const paintWcol = () => { const d = root.querySelector<HTMLElement>('[data-p=wcol] .wdot'); if (d) d.style.background = WCOL[wci]; };
  const syncWriteUi = () => { const b = (id: string) => root.querySelector<HTMLButtonElement>(`[data-p=${id}]`); const w = b('write'), c = b('wcol'), u = b('wundo'); if (w) { w.hidden = !wAllowed; w.classList.toggle('on', writeOn); } if (c) c.hidden = !(wAllowed && writeOn); if (u) u.hidden = !(wAllowed && writeOn); root.classList.toggle('writing', writeOn && wAllowed); paintWcol(); };
  let curPaper: HTMLElement | null = null, paperImg: HTMLImageElement | null = null, snapT = 0, recOn = false, laserXY: [number, number] | null = null;
  function snapPaper() { clearTimeout(snapT); const p = curPaper; if (!p) return; snapT = window.setTimeout(() => { void rasterize(p, 794, Math.max(1123, p.offsetHeight)).then(im => { if (p === curPaper && !dead) paperImg = im; }); }, 150); }
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
        const pad = 24; let s = Math.max(0.05, Math.min(4, (W - 2 * pad) / Math.max(1, e - a), (H - 2 * pad) / Math.max(1, f - b)));
        let tx0 = (W - (e - a) * s) / 2 - a * s, ty0 = (H - (f - b) * s) / 2 - b * s; if (writeOn && wAllowed) { if (!fitLock) fitLock = { s, tx0, ty0 }; ({ s, tx0, ty0 } = fitLock); } panX = Math.max(W - W * z, Math.min(0, panX)); panY = Math.max(H - H * z, Math.min(0, panY));
        const S = s * z, tx = tx0 * z + panX, ty = ty0 * z + panY; cmap = { to: (x, y) => [(x - tx) / S, (y - ty) / S], from: (u, v) => [u * S + tx, v * S + ty] };
        cx.save(); cx.translate(tx, ty); cx.scale(S, S); for (const o of p.objects) drawObject(cx, o, inkC, getImg); cx.restore();
      } else { if (writeOn && wAllowed && !fitLock) fitLock = { s: 1, tx0: 0, ty0: 0 }; panX = Math.max(W - W * z, Math.min(0, panX)); panY = Math.max(H - H * z, Math.min(0, panY)); const S = z, tx = panX, ty = panY; cmap = { to: (x, y) => [(x - tx) / S, (y - ty) / S], from: (u, v) => [u * S + tx, v * S + ty] }; }
    } else {
      stage.style.background = '#2a2d36'; stage.style.overflow = 'auto';
      const paper = renderDoc(doc, p, urls, i + 1); const wrap = document.createElement('div'); wrap.className = 'pp-wrap'; wrap.appendChild(paper); stage.appendChild(wrap);
      const s = Math.max(0.4, Math.min((W - 32) / 794, 2)) * z, ww = Math.max(W, 794 * s + 32); wrap.style.width = ww + 'px'; paper.style.left = ww / 2 + 'px'; paper.style.transform = `scale(${s})`; paper.style.transformOrigin = 'top center';
      cmap = { to: (x, y) => { const r = paper.getBoundingClientRect(), q = root.getBoundingClientRect(); return [(x - (r.left - q.left)) / r.width, (y - (r.top - q.top)) / r.width]; }, from: (u, v) => { const r = paper.getBoundingClientRect(), q = root.getBoundingClientRect(); return [u * r.width + r.left - q.left, v * r.width + r.top - q.top]; } };
      wrap.style.height = Math.max(H, paper.offsetHeight * s + 32) + 'px'; if (keep) { stage.scrollLeft = sl; stage.scrollTop = stt; }
      curPaper = paper; if (recOn) snapPaper();
    }
    sizeInk(); redrawInk(); updFollow();
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
  // ---- "ustozga o'tish": ustoz oxirgi tahrir/chizgan joy (doc: x ulushi, y px; doska: doska koordinatalari) ----
  let focusPt: [number, number] | null = null; const fb = document.createElement('button'); fb.className = 'pres-follow'; fb.hidden = true; fb.setAttribute('aria-label', 'Ustoz turgan joyga o‘tish'); root.append(fb);
  function focusScreen(): [number, number] | null { return focusPt ? cmap.from(focusPt[0], focusPt[1]) : null; }
  function updFollow() {
    if (!ctl) return; const sp = focusScreen(); if (!sp) { fb.hidden = true; return; }
    const W = root.clientWidth, H = root.clientHeight, m = 6, dx = sp[0] < m ? -1 : sp[0] > W - m ? 1 : 0, dy = sp[1] < m ? -1 : sp[1] > H - 70 ? 1 : 0;
    if (!dx && !dy) { fb.hidden = true; return; } fb.hidden = false; fb.textContent = Math.abs(sp[1] - H / 2) >= Math.abs(sp[0] - W / 2) * (W / H) ? (dy < 0 ? '↑' : '↓') : (dx < 0 ? '←' : '→'); if (!dy && !dx) fb.textContent = '•';
  }
  fb.addEventListener('pointerdown', e => e.stopPropagation()); fb.addEventListener('click', () => {
    const sp = focusScreen(); if (!sp) return; const W = root.clientWidth, H = root.clientHeight;
    if (doc.pages[i].type === 'board') { panX += W / 2 - sp[0]; panY += H / 2 - sp[1]; show(); } else { stage.scrollTop += sp[1] - H * 0.4; stage.scrollLeft += sp[0] - W / 2; redrawInk(); updFollow(); }
  });
  function commitWrite(raw: [number, number][]) {
    if (!raw.length || !opts.onWrite) return; const [a0] = cmap.from(0, 0), [a1] = cmap.from(1, 0), S = Math.max(0.01, a1 - a0); const pts: [number, number][] = []; let lx2 = NaN, ly2 = NaN;
    for (const q of raw) { const x = Math.round(q[0] * 10) / 10, y = Math.round(q[1] * 10) / 10; if (x !== lx2 || y !== ly2) { pts.push([x, y]); lx2 = x; ly2 = y; } }
    if (pts.length === 1) pts.push([pts[0][0] + 0.1, pts[0][1]]); if (pts.length > 1500) { const k = Math.ceil(pts.length / 1500), t = pts.filter((_, n) => n % k === 0 || n === pts.length - 1); pts.length = 0; pts.push(...t); }
    opts.onWrite({ t: 'stroke', id: uid('o'), pts, c: WCOL[wci], w: Math.max(1, Math.min(40, Math.round(30 / S) / 10)), hl: false });
  }
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
    else if (a === 'black') toggleBlack(); else if (a === 'full') fullscreen(); else if (a === 'exit') exit(); else if (a === 'mic' || a === 'cam' || a === 'rec' || a === 'recp') opts.onBtn?.(a);
    else if (a === 'write') { writeOn = !writeOn; fitLock = null; if (writeOn) { const p = doc.pages[i]; if (p.type === 'board') { fitLock = null; } } show(true); syncWriteUi(); }
    else if (a === 'wcol') { wci = (wci + 1) % WCOL.length; paintWcol(); } else if (a === 'wundo') opts.onWriteUndo?.();
  });
  // ko'rsatkich: lazer, qalam, zoom (chimchilash), surish, bosib o'tish
  function sendFocus(sx: number, sy: number) { if (!hk?.focus) return; const [u, v] = cmap.to(sx, sy); hk.focus(u, v); }
  let sx = 0, sy = 0, st = 0, moved = false, lastL = 0, lx = 0, ly = 0, pz = 0, pd = 1, pcx = 0, pcy = 0;
  const ptrs = new Map<number, [number, number]>();
  const pos = (e: PointerEvent): [number, number] => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const two = (): { d: number; cx: number; cy: number } => { const [p, q] = [...ptrs.values()]; return { d: Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, cx: (p[0] + q[0]) / 2, cy: (p[1] + q[1]) / 2 }; };
  root.addEventListener('pointerdown', e => {
    if ((e.target as HTMLElement).closest('.pres-bar')) return; const [x, y] = pos(e); ptrs.set(e.pointerId, [x, y]);
    try { root.setPointerCapture(e.pointerId); } catch { /* */ }
    if (ptrs.size === 2) { if (wcur) { wcur = null; redrawInk(); } if (drawing) { strokes.pop(); drawing = false; redrawInk(); } const t = two(); pz = z; pd = t.d; pcx = t.cx; pcy = t.cy; moved = true; return; }
    if (ptrs.size > 2) return;
    sx = e.clientX; sy = e.clientY; st = Date.now(); moved = false; lx = x; ly = y;
    if (ctl) { if (writeOn && wAllowed && doc.pages[i].type === 'board' && !(e.target as HTMLElement).closest('.pres-bar,.pres-follow')) wcur = [cmap.to(x, y)]; return; }
    if (mode === 'laser') { laser.hidden = false; laser.style.transform = `translate(${x}px,${y}px)`; }
    if (mode === 'pen') { drawing = true; strokes.push([cmap.to(x, y)]); redrawInk(); }
  });
  root.addEventListener('pointermove', e => {
    wake(); const [x, y] = pos(e); if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [x, y]);
    if (ptrs.size === 2) { const t = two(); setZoom(pz * t.d / pd, t.cx, t.cy); panBy(t.cx - pcx, t.cy - pcy); pcx = t.cx; pcy = t.cy; moved = true; return; }
    if (mode === 'laser' && !ctl) { laser.hidden = false; laser.style.transform = `translate(${x}px,${y}px)`; if (hk && Date.now() - lastL > 45) { lastL = Date.now(); const [u, v] = cmap.to(x, y); hk.laser(u, v, true); sendFocus(x, y); } }
    if (mode === 'pen' && drawing && !ctl) {
      const evs = (e.getCoalescedEvents?.() ?? []); const list = evs.length ? evs : [e]; const cur = strokes[strokes.length - 1];
      for (const ev of list) { const [px, py] = pos(ev); cur.push(cmap.to(px, py)); }
      if (cur.length < 3) redrawInk(); else { const n = cur.length, A = cmap.from(cur[n - 3][0], cur[n - 3][1]), B = cmap.from(cur[n - 2][0], cur[n - 2][1]), C = cmap.from(cur[n - 1][0], cur[n - 1][1]); g.strokeStyle = '#ff3b30'; g.lineWidth = 4; g.beginPath(); g.moveTo((A[0] + B[0]) / 2, (A[1] + B[1]) / 2); g.quadraticCurveTo(B[0], B[1], (B[0] + C[0]) / 2, (B[1] + C[1]) / 2); g.stroke(); g.beginPath(); g.moveTo((B[0] + C[0]) / 2, (B[1] + C[1]) / 2); g.lineTo(C[0], C[1]); g.stroke(); }
    }
    if (wcur && ptrs.size === 1) { for (const ev of (e.getCoalescedEvents?.() ?? [e]).length ? (e.getCoalescedEvents?.() ?? [e]) : [e]) { const [px, py] = pos(ev); wcur.push(cmap.to(px, py)); } const n = wcur.length; if (n >= 2) { const A = cmap.from(wcur[n - 2][0], wcur[n - 2][1]), B = cmap.from(wcur[n - 1][0], wcur[n - 1][1]); g.strokeStyle = WCOL[wci]; g.lineWidth = 3; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); } }
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) moved = true;
    if ((mode === 'nav' || ctl) && ptrs.size === 1 && !wcur && moved && (z > 1.001 || doc.pages[i].type !== 'board')) { panBy(x - lx, y - ly); }
    lx = x; ly = y;
  });
  const upH = (e: PointerEvent) => {
    const had = ptrs.delete(e.pointerId); if (!had || (e.target as HTMLElement).closest('.pres-bar')) return;
    if (ptrs.size === 1) { const [p] = [...ptrs.values()]; lx = p[0]; ly = p[1]; }
    if (drawing) { drawing = false; const cur = strokes[strokes.length - 1]; if (hk && cur?.length) { hk.ink(cur); const [sx2, sy2] = cmap.from(cur[cur.length - 1][0], cur[cur.length - 1][1]); sendFocus(sx2, sy2); } }
    if (wcur) { const pts = wcur; wcur = null; redrawInk(); if (e.type !== 'pointercancel') commitWrite(pts); }
    if (ctl || e.type === 'pointercancel') return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (mode === 'nav' && z <= 1.001) {
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 800) go(i + (dx < 0 ? 1 : -1));
      else if (!moved) { const r = root.getBoundingClientRect(); go(i + (e.clientX - r.left < r.width / 3 ? -1 : 1)); }
    }
  };
  root.addEventListener('pointerup', upH); root.addEventListener('pointercancel', upH);
  root.addEventListener('wheel', e => { if (e.ctrlKey || doc.pages[i].type === 'board') { e.preventDefault(); const [x, y] = pos(e as unknown as PointerEvent); setZoom(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), x, y); } }, { passive: false });
  stage.addEventListener('scroll', () => { redrawInk(); updFollow(); });
  root.addEventListener('contextmenu', e => e.preventDefault());
  show(); wake(); root.focus(); hk?.page(i);
  (window as any).__pres = { get i() { return i; }, go, mode: () => mode, exit };
  const remoteInk = (pts: [number, number][] | null) => { if (!pts) { clearInk(); return; } strokes.push(pts); redrawInk(); };
  return {
    destroy: exit, refresh: () => show(true), ink: remoteInk, focus(u: number, v: number) { focusPt = [u, v]; updFollow(); },
    goto(n: number) { n = Math.max(0, Math.min(doc.pages.length - 1, n)); const ch = n !== i; i = n; if (ch) { strokes.length = 0; resetView(); focusPt = null; fitLock = null; } show(!ch); },
    laser(u: number, v: number, on: boolean) { if (!on) { laser.hidden = true; return; } const [x, y] = cmap.from(u, v); laser.hidden = false; laser.style.transform = `translate(${x}px,${y}px)`; laserXY = [x, y]; },
    status(t: string, bad = false) { const e = root.querySelector<HTMLElement>('#pst'); if (e) { e.textContent = t; e.classList.toggle('bad', bad); } },
    btn(id: PresBtn, st: { on?: boolean; dis?: boolean; hide?: boolean; title?: string }) { const b = root.querySelector<HTMLButtonElement>(`[data-p=${id}]`); if (!b) return; if (st.on !== undefined) b.classList.toggle('on', st.on); if (st.dis !== undefined) b.classList.toggle('dis', st.dis); if (st.hide !== undefined) b.hidden = st.hide; if (st.title) b.title = st.title; },
    viewSize: () => [stage.clientWidth, stage.clientHeight] as [number, number],
    frame(gc: CanvasRenderingContext2D, W: number, H: number) {
      if (!recOn) { recOn = true; if (doc.pages[i].type !== 'board') snapPaper(); }
      const sw = stage.clientWidth, sh = stage.clientHeight; if (!sw || !sh) return; const k = Math.min(W / sw, H / sh), p = doc.pages[i], dark = p.type === 'board' && p.bg === 'dark';
      gc.fillStyle = p.type === 'board' ? (dark ? '#1b1e26' : '#fff') : '#2a2d36'; gc.fillRect(0, 0, W, H); gc.save(); gc.translate((W - sw * k) / 2, (H - sh * k) / 2); gc.scale(k, k); gc.beginPath(); gc.rect(0, 0, sw, sh); gc.clip();
      if (p.type === 'board') { const c = stage.querySelector('canvas'); if (c) gc.drawImage(c, 0, 0, sw, sh); }
      else if (curPaper && paperImg) { const r = curPaper.getBoundingClientRect(), q = stage.getBoundingClientRect(); gc.drawImage(paperImg, r.left - q.left, r.top - q.top, r.width, r.height); }
      if (ink.width) gc.drawImage(ink, 0, 0, ink.width, ink.height, 0, 0, parseFloat(ink.style.width) || sw, parseFloat(ink.style.height) || sh);
      if (!laser.hidden && laserXY) { gc.fillStyle = 'rgba(255,40,40,.9)'; gc.beginPath(); gc.arc(laserXY[0], laserXY[1] - 0, 9, 0, 7); gc.fill(); }
      if (!black.hidden) { gc.fillStyle = '#000'; gc.fillRect(0, 0, sw, sh); }
      gc.restore();
    },
    setWrite(ok: boolean) { wAllowed = ok; if (!ok) { writeOn = false; fitLock = null; } syncWriteUi(); show(true); },
    stopFrames() { recOn = false; },
    hand(on: boolean) { root.querySelector('[data-p=hand]')?.classList.toggle('on', on); },
    recInfo(t: string | null, paused = false) {
      const e = root.querySelector<HTMLElement>('#prb'), b = root.querySelector<HTMLButtonElement>('[data-p=recp]');
      if (e) { e.hidden = t === null; e.classList.toggle('paused', paused); e.innerHTML = t === null ? '' : `<i></i><span>${paused ? 'PAUZA' : 'REC'}</span><b>${t}</b>`; }
      if (b) { const ttl = paused ? 'Yozuvni davom ettirish' : 'Yozuvni pauza qilish'; b.title = ttl; b.setAttribute('aria-label', ttl); b.classList.toggle('on', paused); b.innerHTML = paused ? ico('<path d=\"M8 5l11 7-11 7z\"/>') : ico('<path d=\"M9 5v14M15 5v14\"/>'); }
    },
  };
}
