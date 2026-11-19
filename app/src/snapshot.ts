// DOM elementini rasmga aylantiradi (SVG foreignObject orqali) — hujjat sahifasini yozib olish uchun.
let cssCache = '';
function pageCss(): string {
  if (cssCache) return cssCache; let out = '';
  for (const sh of Array.from(document.styleSheets)) { try { for (const r of Array.from(sh.cssRules)) out += r.cssText + '\n'; } catch { /* boshqa manba */ } }
  return (cssCache = out);
}
const toData = (b: Blob) => new Promise<string>((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = () => rej(f.error); f.readAsDataURL(b); });

export async function rasterize(el: HTMLElement, w: number, h: number, scale = 1.5): Promise<HTMLImageElement | null> {
  try {
    const c = el.cloneNode(true) as HTMLElement; c.style.transform = 'none'; c.style.position = 'relative'; c.style.left = '0'; c.style.top = '0'; c.style.margin = '0'; c.style.width = w + 'px';
    for (const im of Array.from(c.querySelectorAll('img'))) { const src = im.getAttribute('src'); if (src && src.startsWith('blob:')) { try { im.setAttribute('src', await toData(await (await fetch(src)).blob())); } catch { /* */ } } }
    const xml = new XMLSerializer().serializeToString(c);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${pageCss().replace(/</g, '\\3c ')}</style>${xml}</div></foreignObject></svg>`;
    const im = new Image(); im.decoding = 'async';
    await new Promise<void>((res, rej) => { im.onload = () => res(); im.onerror = () => rej(new Error('svg')); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    return im;
  } catch { return null; }
}
