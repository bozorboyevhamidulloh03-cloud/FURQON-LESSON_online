import { FurObject } from '../../packages/fur-format/src/index';

export function drawObject(g: CanvasRenderingContext2D, o: FurObject, inkC: (c: string) => string, getImg: (id: string) => HTMLImageElement | null) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (o.t === 'stroke') {
    g.save(); g.strokeStyle = inkC(o.c); g.fillStyle = inkC(o.c); if (o.hl) { g.globalAlpha = 0.35; g.lineCap = 'butt'; } g.lineWidth = o.hl ? o.w * 3 : o.w;
    const p = o.pts; if (p.length === 1) { g.beginPath(); g.arc(p[0][0], p[0][1], g.lineWidth / 2, 0, 7); g.fill(); } else {
      g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length - 1; i++) g.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2); g.lineTo(p[p.length - 1][0], p[p.length - 1][1]); g.stroke();
    } g.restore(); return;
  }
  if (o.t === 'text') { g.save(); g.fillStyle = inkC(o.c); g.font = `${o.s}px system-ui,sans-serif`; g.textBaseline = 'top'; o.tx.split('\n').forEach((l, i) => g.fillText(l, o.x, o.y + i * o.s * 1.25)); g.restore(); return; }
  if (o.t === 'image') { const im = getImg(o.a); if (im) { const c = o.crop, nw = im.naturalWidth, nh = im.naturalHeight; if (c) g.drawImage(im, nw * c.l / 100, nh * c.t / 100, nw * (1 - (c.l + c.r) / 100), nh * (1 - (c.t + c.b) / 100), o.x, o.y, o.w, o.h); else g.drawImage(im, o.x, o.y, o.w, o.h); } else { g.save(); g.fillStyle = 'rgba(128,128,128,.15)'; g.fillRect(o.x, o.y, o.w, o.h); g.restore(); } return; }
  g.save(); g.strokeStyle = inkC(o.c); g.lineWidth = o.w;
  if (o.t === 'line' || o.t === 'arrow') {
    g.beginPath(); g.moveTo(o.x1, o.y1); g.lineTo(o.x2, o.y2); g.stroke();
    if (o.t === 'arrow') { const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = Math.max(14, o.w * 4); g.beginPath(); g.moveTo(o.x2 - L * Math.cos(a - 0.45), o.y2 - L * Math.sin(a - 0.45)); g.lineTo(o.x2, o.y2); g.lineTo(o.x2 - L * Math.cos(a + 0.45), o.y2 - L * Math.sin(a + 0.45)); g.stroke(); }
  } else if (o.t === 'rect') g.strokeRect(Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1));
  else { g.beginPath(); g.ellipse((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2, Math.abs(o.x2 - o.x1) / 2, Math.abs(o.y2 - o.y1) / 2, 0, 0, 7); g.stroke(); }
  g.restore();
}

export function objBounds(g: CanvasRenderingContext2D, o: FurObject): [number, number, number, number] {
  if (o.t === 'stroke') { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of o.pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } const p = o.w / 2; return [a - p, b - p, c + p, d + p]; }
  if (o.t === 'text') { g.save(); g.font = `${o.s}px system-ui,sans-serif`; const L = o.tx.split('\n'); const w = Math.max(...L.map(l => g.measureText(l).width)); g.restore(); return [o.x, o.y, o.x + w, o.y + L.length * o.s * 1.25]; }
  if (o.t === 'image') return [o.x, o.y, o.x + o.w, o.y + o.h];
  return [Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.max(o.x1, o.x2), Math.max(o.y1, o.y2)];
}
