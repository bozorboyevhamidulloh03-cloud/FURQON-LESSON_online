import { drawObject, objBounds } from './boardrender';
import { FurDocument, FurObject, FurPage, ImageObj, ShapeObj, StrokeObj, TextObj, uid } from '../../packages/fur-format/src/index';

export interface BoardHost { doc: FurDocument; page: FurPage; index: number; onChange(): void; toast(m: string, bad?: boolean): void; ask(t: string, v?: string, ok?: string): Promise<string | null> }
export interface BoardHandle { destroy(): void; fit(): void }
type Tool = 'select' | 'hand' | 'pen' | 'hl' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text';
type P = [number, number];

const INK = '#111111';
const COLORS = [INK, '#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5', '#ffffff'];
const WIDTHS = [2, 4, 6, 10];
const BGS = ['grid', 'white', 'dark'] as const;
const BG_NAME = { grid: 'Katak', white: 'Oq', dark: 'Qora' };
const ico = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TOOLS: [Tool, string, string][] = [
  ['select', 'Tanlash / ko‘chirish', ico('<path d="M5 3l14 8-6 2-2 6z"/>')],
  ['hand', 'Surish (bo‘sh joyni ushlab ham suriladi)', ico('<path d="M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v8c0 4-2 6-5 6-3 0-4-1.5-6-4.500l-1.500-2.500a1.500 1.500 0 012.500-1.500L8 14"/>')],
  ['pen', 'Qalam', ico('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>')],
  ['hl', 'Marker', ico('<path d="M9 14l6-6 4 4-6 6H9z"/><path d="M5 20h6"/>')],
  ['eraser', 'O‘chirg‘ich', ico('<path d="M8 20h11M5 14l8-8 6 6-6 6H9z"/>')],
  ['line', 'Chiziq', ico('<path d="M5 19L19 5"/>')],
  ['arrow', 'Strelka', ico('<path d="M5 19L19 5M10 5h9v9"/>')],
  ['rect', 'To‘rtburchak', ico('<rect x="4" y="6" width="16" height="12" rx="1"/>')],
  ['ellipse', 'Ellips', ico('<ellipse cx="12" cy="12" rx="8" ry="6"/>')],
  ['text', 'Matn', ico('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>')],
];

export function mountBoard(root: HTMLElement, h: BoardHost): BoardHandle {
  const { doc, page } = h;
  let tool: Tool = 'pen', color = INK, wi = 1, sel: string | null = null, cur: FurObject | null = null, panKey = false, penSeen = false;
  const undo: string[] = [JSON.stringify(page.objects)]; let ui = 0;
  const imgs = new Map<string, HTMLImageElement>(); const urls: string[] = [];

  root.innerHTML = `<div class="etools btools" role="toolbar" aria-label="Doska asboblari">
    ${TOOLS.map(([k, n, i]) => `<button class="tb" data-tool="${k}" title="${n}" aria-label="${n}">${i}</button>`).join('')}
    <button class="tb" data-b="image" title="Rasm qo‘shish" aria-label="Rasm qo‘shish">${ico('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.500"/><path d="M4 18l5-5 4 4 3-3 4 4"/>')}</button><span class="tsep"></span>
    <span class="swatches" id="sw">${COLORS.map(c => `<button class="sw" data-c="${c}" style="background:${c}" title="Rang ${c}" aria-label="Rang ${c}"></button>`).join('')}<label class="sw cust" title="Boshqa rang"><input type="color" id="bcol" value="#e03131"></label></span><span class="tsep"></span>
    <span class="wds" id="wd">${WIDTHS.map((w, i) => `<button class="tb wdb" data-w="${i}" title="Qalinlik ${w}" aria-label="Qalinlik ${w}"><i style="height:${w + 1}px"></i></button>`).join('')}</span><span class="tsep"></span>
    <button class="tb" data-b="undo" title="Orqaga (Ctrl+Z)" aria-label="Orqaga">${ico('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>')}</button>
    <button class="tb" data-b="redo" title="Oldinga (Ctrl+Y)" aria-label="Oldinga">${ico('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h3"/>')}</button>
    <button class="tb dng" data-b="del" title="Tanlanganni o‘chirish (Delete)" aria-label="O‘chirish">${ico('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>')}</button><span class="tsep"></span>
    <button class="tb" data-b="zout" title="Kichraytirish" aria-label="Kichraytirish">${ico('<circle cx="11" cy="11" r="6"/><path d="M8 11h6M16 16l4 4"/>')}</button>
    <span class="zoomv" id="zv">100%</span>
    <button class="tb" data-b="zin" title="Kattalashtirish" aria-label="Kattalashtirish">${ico('<circle cx="11" cy="11" r="6"/><path d="M8 11h6M11 8v6M16 16l4 4"/>')}</button>
    <button class="tb" data-b="fit" title="Hammasini sig‘dirish" aria-label="Sig‘dirish">${ico('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button>
    <button class="tb" data-b="bg" id="bgb" title="Fon" aria-label="Fon"></button>
    <input type="file" id="bimg" accept="image/*" hidden></div>
    <div class="bwrap" id="bw"><canvas id="bc" aria-label="Doska"></canvas></div>`;
  const wrap = root.querySelector<HTMLElement>('#bw')!, cv = root.querySelector<HTMLCanvasElement>('#bc')!, g = cv.getContext('2d')!, zv = root.querySelector<HTMLElement>('#zv')!;
  const v = page.view; if (!(v.s > 0)) { v.s = 1; v.x = 0; v.y = 0; }
  let W = 1, H = 1, dpr = 1, raf = 0;

  // ---------- yordamchilar ----------
  const toW = (sx: number, sy: number): P => [(sx - v.x) / v.s, (sy - v.y) / v.s];
  const inkC = (c: string) => page.bg === 'dark' && c.toLowerCase() === INK ? '#f5f5f5' : c;
  const tsize = (o: TextObj) => o.s;
  const bounds = (o: FurObject) => objBounds(g, o);
  const segD = (p: P, a: P, b: P) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  function hit(o: FurObject, p: P, tol: number, forSelect: boolean): boolean {
    if (o.t === 'stroke') { const r = tol + o.w / 2; if (o.pts.length === 1) return Math.hypot(p[0] - o.pts[0][0], p[1] - o.pts[0][1]) <= r; for (let i = 1; i < o.pts.length; i++) if (segD(p, o.pts[i - 1], o.pts[i]) <= r) return true; return false; }
    if (o.t === 'line' || o.t === 'arrow') return segD(p, [o.x1, o.y1], [o.x2, o.y2]) <= tol + o.w / 2;
    const [a, b, c, d] = bounds(o);
    if (o.t === 'text' || o.t === 'image') return p[0] >= a - tol && p[0] <= c + tol && p[1] >= b - tol && p[1] <= d + tol;
    if (forSelect && p[0] >= a && p[0] <= c && p[1] >= b && p[1] <= d) return true;
    const r = tol + o.w / 2;
    if (o.t === 'rect') { const inX = p[0] >= a - r && p[0] <= c + r, inY = p[1] >= b - r && p[1] <= d + r; return inX && inY && !(p[0] > a + r && p[0] < c - r && p[1] > b + r && p[1] < d - r); }
    const cx = (a + c) / 2, cy = (b + d) / 2, rx = Math.max(1, (c - a) / 2), ry = Math.max(1, (d - b) / 2), k = Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry);
    return Math.abs(k - 1) * Math.min(rx, ry) <= r;
  }
  const topAt = (p: P, tol: number, forSelect: boolean) => { for (let i = page.objects.length - 1; i >= 0; i--) if (hit(page.objects[i], p, tol, forSelect)) return page.objects[i]; return null; };
  function move(o: FurObject, dx: number, dy: number) {
    if (o.t === 'stroke') o.pts = o.pts.map(([x, y]) => [x + dx, y + dy] as P);
    else if (o.t === 'text' || o.t === 'image') { o.x += dx; o.y += dy; } else { o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; }
  }
  function getImg(id: string): HTMLImageElement | null {
    const c = imgs.get(id); if (c) return c.complete && c.naturalWidth ? c : null;
    const a = doc.assets.find(x => x.id === id); if (!a) return null;
    const u = URL.createObjectURL(new Blob([a.data as BlobPart], { type: a.mime })); urls.push(u); const im = new Image(); im.onload = () => draw(); im.src = u; imgs.set(id, im); return null;
  }

  // ---------- chizish ----------
  const drawObj = (o: FurObject) => drawObject(g, o, inkC, getImg);
  function draw() {
    raf = 0; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = page.bg === 'dark' ? '#1b1e26' : '#ffffff'; g.fillRect(0, 0, W, H);
    if (page.bg === 'grid') {
      let st = 40; while (st * v.s < 14) st *= 5; g.strokeStyle = 'rgba(120,130,150,.22)'; g.lineWidth = 1; g.beginPath();
      for (let x = Math.floor(-v.x / v.s / st) * st; x * v.s + v.x < W; x += st) { const sx = Math.round(x * v.s + v.x) + 0.5; g.moveTo(sx, 0); g.lineTo(sx, H); }
      for (let y = Math.floor(-v.y / v.s / st) * st; y * v.s + v.y < H; y += st) { const sy = Math.round(y * v.s + v.y) + 0.5; g.moveTo(0, sy); g.lineTo(W, sy); } g.stroke();
    }
    g.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y);
    for (const o of page.objects) drawObj(o); if (cur) drawObj(cur);
    const so = sel ? page.objects.find(o => o.id === sel) : null;
    if (so) { const [a, b, c, d] = bounds(so), pd = 6 / v.s; g.save(); g.strokeStyle = '#3157d5'; g.lineWidth = 1.5 / v.s; g.setLineDash([6 / v.s, 4 / v.s]); g.strokeRect(a - pd, b - pd, c - a + 2 * pd, d - b + 2 * pd); g.restore(); }
    zv.textContent = Math.round(v.s * 100) + '%';
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
  function resize() { const r = wrap.getBoundingClientRect(); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height)); dpr = Math.min(3, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; redraw(); }
  const ro = new ResizeObserver(resize); ro.observe(wrap);

  // ---------- holat ----------
  function commit() { const s = JSON.stringify(page.objects); if (s === undo[ui]) return; undo.length = ui + 1; undo.push(s); if (undo.length > 120) undo.shift(); ui = undo.length - 1; h.onChange(); syncUi(); }
  function applyState(i: number) { ui = i; page.objects.splice(0, page.objects.length, ...(JSON.parse(undo[i]) as FurObject[])); if (sel && !page.objects.some(o => o.id === sel)) sel = null; h.onChange(); syncUi(); redraw(); }
  function syncUi() {
    root.querySelectorAll<HTMLElement>('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    root.querySelectorAll<HTMLElement>('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === color));
    root.querySelectorAll<HTMLElement>('[data-w]').forEach(b => b.classList.toggle('on', Number(b.dataset.w) === wi));
    (root.querySelector('[data-b=undo]') as HTMLButtonElement).disabled = ui === 0; (root.querySelector('[data-b=redo]') as HTMLButtonElement).disabled = ui >= undo.length - 1;
    (root.querySelector('#bgb') as HTMLElement).innerHTML = `${ico('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>')}<span class="bgn">${BG_NAME[page.bg]}</span>`;
    wrap.dataset.tool = tool; wrap.classList.toggle('panning', tool === 'hand' || panKey);
  }
  function setTool(t: Tool) { tool = t; if (t !== 'select') sel = null; syncUi(); redraw(); }
  function zoomAt(f: number, sx: number, sy: number) { const ns = Math.max(0.05, Math.min(8, v.s * f)), k = ns / v.s; v.x = sx - (sx - v.x) * k; v.y = sy - (sy - v.y) * k; v.s = ns; redraw(); }
  function fit() {
    if (!page.objects.length) { v.s = 1; v.x = W / 2; v.y = H / 2; return redraw(); }
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const o of page.objects) { const r = bounds(o); a = Math.min(a, r[0]); b = Math.min(b, r[1]); c = Math.max(c, r[2]); d = Math.max(d, r[3]); }
    if (page.objects.length === 1 && page.objects[0].t === 'image') { const im = page.objects[0] as ImageObj; v.s = Math.max(0.05, Math.min(4, (W - 40) / im.w)); v.x = 20; v.y = 20; return redraw(); }
    const pad = 40, s = Math.max(0.05, Math.min(4, Math.min((W - 2 * pad) / Math.max(1, c - a), (H - 2 * pad) / Math.max(1, d - b))));
    v.s = s; v.x = (W - (c - a) * s) / 2 - a * s; v.y = (H - (d - b) * s) / 2 - b * s; redraw();
  }
  if (v.s === 1 && v.x === 0 && v.y === 0) { resize(); fit(); }

  // ---------- ko'rsatkich hodisalari ----------
  const ptrs = new Map<number, P>(); let mode: 'none' | 'draw' | 'pan' | 'move' | 'erase' | 'pinch' = 'none', start: P = [0, 0], last: P = [0, 0], moved = false, pinch = { d: 1, c: [0, 0] as P }, erased = false;
  const loc = (e: PointerEvent): P => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const mkStroke = (p: P): StrokeObj => ({ t: 'stroke', id: uid('o'), pts: [[round(p[0]), round(p[1])]], c: color, w: WIDTHS[wi], hl: tool === 'hl' });
  const round = (n: number) => Math.round(n * 10) / 10;
  function twoFinger(): { d: number; c: P } { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; }

  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button === 2) return; cv.setPointerCapture(e.pointerId); const s = loc(e); ptrs.set(e.pointerId, s); if (e.pointerType === 'pen') penSeen = true;
    if (ptrs.size === 2) { cur = null; mode = 'pinch'; pinch = twoFinger(); return redraw(); }
    if (ptrs.size > 2) return;
    const w = toW(s[0], s[1]); start = s; last = s; moved = false; erased = false;
    const panOnly = tool === 'hand' || panKey || e.button === 1 || (e.pointerType === 'touch' && penSeen && tool !== 'select');
    if (panOnly) { mode = 'pan'; return; }
    if (tool === 'select') { const o = topAt(w, 8 / v.s, true); sel = o ? o.id : null; mode = o ? 'move' : 'pan'; syncUi(); return redraw(); }
    if (tool === 'eraser') { mode = 'erase'; eraseAt(w); return; }
    if (tool === 'text') { mode = 'none'; void addText(w); return; }
    mode = 'draw';
    if (tool === 'pen' || tool === 'hl') cur = mkStroke(w); else cur = { t: tool, id: uid('o'), x1: w[0], y1: w[1], x2: w[0], y2: w[1], c: color, w: WIDTHS[wi] } as ShapeObj;
    redraw();
  });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; const s = loc(e); ptrs.set(e.pointerId, s);
    if (mode === 'pinch' && ptrs.size === 2) { const n = twoFinger(); const k = n.d / pinch.d; v.x += n.c[0] - pinch.c[0]; v.y += n.c[1] - pinch.c[1]; zoomAt(k, n.c[0], n.c[1]); pinch = n; return; }
    if (ptrs.size > 1) return;
    if (mode === 'pan') { v.x += s[0] - last[0]; v.y += s[1] - last[1]; last = s; return redraw(); }
    if (Math.hypot(s[0] - start[0], s[1] - start[1]) > 3) moved = true;
    if (mode === 'move' && sel) { const o = page.objects.find(x => x.id === sel); if (o && moved) { move(o, (s[0] - last[0]) / v.s, (s[1] - last[1]) / v.s); } last = s; return redraw(); }
    if (mode === 'erase') { const ev = (e.getCoalescedEvents?.() ?? [e]); for (const c of ev.length ? ev : [e]) eraseAt(toW(...loc(c))); return; }
    if (mode === 'draw' && cur) {
      if (cur.t === 'stroke') { const ev = (e.getCoalescedEvents?.() ?? []); for (const c of ev.length ? ev : [e]) { const w = toW(...loc(c)), lp = cur.pts[cur.pts.length - 1]; if (Math.hypot(w[0] - lp[0], w[1] - lp[1]) * v.s >= 1.2) cur.pts.push([round(w[0]), round(w[1])]); } }
      else { const w = toW(s[0], s[1]); (cur as ShapeObj).x2 = w[0]; (cur as ShapeObj).y2 = w[1]; if (e.shiftKey) { const o = cur as ShapeObj, dx = o.x2 - o.x1, dy = o.y2 - o.y1; if (o.t === 'line' || o.t === 'arrow') { if (Math.abs(dx) > Math.abs(dy) * 2) o.y2 = o.y1; else if (Math.abs(dy) > Math.abs(dx) * 2) o.x2 = o.x1; } else { const m = Math.max(Math.abs(dx), Math.abs(dy)); o.x2 = o.x1 + Math.sign(dx || 1) * m; o.y2 = o.y1 + Math.sign(dy || 1) * m; } } }
      redraw();
    }
  });
  const up = (e: PointerEvent) => {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
    if (mode === 'pinch') { if (ptrs.size < 2) mode = 'none'; return; }
    if (mode === 'draw' && cur) {
      const o = cur; cur = null;
      const tiny = o.t !== 'stroke' && Math.hypot((o as ShapeObj).x2 - (o as ShapeObj).x1, (o as ShapeObj).y2 - (o as ShapeObj).y1) * v.s < 4;
      if (!tiny) { page.objects.push(o); commit(); }
    } else if (mode === 'move' && moved) commit(); else if (mode === 'erase' && erased) commit();
    mode = 'none'; redraw();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { cur = null; up(e); });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top); else { v.x -= e.deltaX; v.y -= e.deltaY; redraw(); } }, { passive: false });
  cv.addEventListener('dblclick', e => { if (tool !== 'select') return; const r = cv.getBoundingClientRect(), o = topAt(toW(e.clientX - r.left, e.clientY - r.top), 8 / v.s, true); if (o?.t === 'text') void editText(o); });

  function eraseAt(p: P) { const tol = 10 / v.s, n = page.objects.length; const keep = page.objects.filter(o => !hit(o, p, tol, false)); if (keep.length !== n) { page.objects.splice(0, n, ...keep); erased = true; redraw(); } }
  async function addText(w: P) {
    const t = await h.ask('Matn (yangi qator uchun \\n yozing)', '', 'Qo‘shish'); if (!t || !t.trim()) return;
    const o: TextObj = { t: 'text', id: uid('o'), x: round(w[0]), y: round(w[1]), tx: t.replace(/\\n/g, '\n').slice(0, 2000), s: 14 + WIDTHS[wi] * 3, c: color }; page.objects.push(o); commit(); redraw();
  }
  async function editText(o: TextObj) {
    const t = await h.ask('Matnni tahrirlash', o.tx.replace(/\n/g, '\\n'), 'Saqlash'); if (t === null) return;
    if (!t.trim()) { page.objects.splice(page.objects.indexOf(o), 1); sel = null; } else o.tx = t.replace(/\\n/g, '\n').slice(0, 2000); commit(); redraw();
  }
  async function addImage(file: File) {
    try {
      const u = URL.createObjectURL(file), im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Rasm ochilmadi')); i.src = u; });
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const cx = c.getContext('2d')!; const png = /png|webp|gif/.test(file.type); if (!png) { cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); } cx.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      const blob = await new Promise<Blob | null>(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.88)); if (!blob) throw new Error('Rasm siqilmadi');
      const id = uid('a'); doc.assets.push({ id, mime: png ? 'image/png' : 'image/jpeg', data: new Uint8Array(await blob.arrayBuffer()) });
      const ww = Math.min(c.width, (W / v.s) * 0.6), hh = ww * c.height / c.width, [x, y] = toW(W / 2, H / 2);
      const o: ImageObj = { t: 'image', id: uid('o'), a: id, x: round(x - ww / 2), y: round(y - hh / 2), w: round(ww), h: round(hh) }; page.objects.unshift(o); sel = o.id; tool = 'select'; commit(); redraw();
    } catch (e) { h.toast('Rasm qo‘shilmadi: ' + (e as Error).message, true); }
  }
  function delSel() { if (!sel) return h.toast('Avval “Tanlash” bilan obyektni bosing'); const i = page.objects.findIndex(o => o.id === sel); if (i >= 0) page.objects.splice(i, 1); sel = null; commit(); redraw(); }

  // ---------- asboblar paneli va klaviatura ----------
  root.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!t) return;
    if (t.dataset.tool) return setTool(t.dataset.tool as Tool);
    if (t.dataset.c) { color = t.dataset.c; if (sel) { const o = page.objects.find(x => x.id === sel); if (o && o.t !== 'image') { o.c = color; commit(); } } syncUi(); redraw(); return; }
    if (t.dataset.w) { wi = Number(t.dataset.w); syncUi(); return; }
    switch (t.dataset.b) {
      case 'undo': if (ui > 0) applyState(ui - 1); break; case 'redo': if (ui < undo.length - 1) applyState(ui + 1); break;
      case 'del': delSel(); break; case 'zin': zoomAt(1.25, W / 2, H / 2); break; case 'zout': zoomAt(0.8, W / 2, H / 2); break; case 'fit': fit(); break;
      case 'bg': page.bg = BGS[(BGS.indexOf(page.bg) + 1) % 3]; h.onChange(); syncUi(); redraw(); break;
      case 'image': root.querySelector<HTMLInputElement>('#bimg')!.click(); break;
    }
  });
  root.querySelector('#bcol')!.addEventListener('input', e => { color = (e.target as HTMLInputElement).value; root.querySelectorAll('[data-c]').forEach(b => b.classList.remove('on')); if (tool === 'eraser' || tool === 'hand' || tool === 'select') setTool('pen'); });
  root.querySelector('#bimg')!.addEventListener('change', e => { const i = e.target as HTMLInputElement; if (i.files?.[0]) void addImage(i.files[0]); i.value = ''; });
  const typing = (e: Event) => { const t = e.target as HTMLElement; return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable; };
  const kd = (e: KeyboardEvent) => {
    if (typing(e)) return; const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) { if (ui < undo.length - 1) applyState(ui + 1); } else if (ui > 0) applyState(ui - 1); }
    else if (mod && k === 'y') { e.preventDefault(); if (ui < undo.length - 1) applyState(ui + 1); }
    else if (k === 'delete' || k === 'backspace') { if (sel) { e.preventDefault(); delSel(); } }
    else if (k === 'escape') { sel = null; redraw(); } else if (k === ' ') { if (!panKey) { panKey = true; syncUi(); } e.preventDefault(); }
    else if (!mod) { const m: Record<string, Tool> = { v: 'select', h: 'hand', p: 'pen', m: 'hl', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'text' }; if (m[k]) setTool(m[k]); }
  };
  const ku = (e: KeyboardEvent) => { if (e.key === ' ') { panKey = false; syncUi(); } };
  document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
  syncUi(); resize();
  (window as any).__board = { page, get v() { return v; }, fit, tool: () => tool, setTool, undoLen: () => undo.length };
  return { fit, destroy() { document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); ro.disconnect(); cancelAnimationFrame(raf); urls.forEach(u => URL.revokeObjectURL(u)); } };
}
