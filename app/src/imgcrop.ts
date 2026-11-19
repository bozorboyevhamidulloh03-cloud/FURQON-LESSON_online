import { Crop } from '../../packages/fur-format/src/index';

/** Rasmni qirqilgan holda ko‘rsatadigan o‘ram. Qirqish bo‘lmasa rasmning o‘zi qaytariladi. */
export function croppedEl(im: HTMLImageElement, crop: Crop | undefined, width: string): HTMLElement {
  if (!crop) { im.style.width = width; return im; }
  const w = document.createElement('div'); w.className = 'imgc'; w.style.width = width;
  const kx = 1 - (crop.l + crop.r) / 100, ky = 1 - (crop.t + crop.b) / 100;
  im.style.width = (100 / kx) + '%'; im.style.height = (100 / ky) + '%';
  im.style.left = (-crop.l / 100 / kx * 100) + '%'; im.style.top = (-crop.t / 100 / ky * 100) + '%';
  const setAr = () => { if (im.naturalWidth) w.style.aspectRatio = `${im.naturalWidth * kx} / ${im.naturalHeight * ky}`; };
  if (im.complete) setAr(); im.addEventListener('load', setAr); w.append(im); return w;
}

/** Qirqish nisbati (ko‘rinadigan qism eni/bo‘yi), tabiiy o‘lcham kerak. */
export const cropAspect = (nw: number, nh: number, c?: Crop) => c ? (nw * (1 - (c.l + c.r) / 100)) / Math.max(1, nh * (1 - (c.t + c.b) / 100)) : nw / Math.max(1, nh);

/** Qirqish oynasi. Natija: yangi Crop, null = qirqishsiz (asl), undefined = bekor qilindi. */
export function cropDialog(url: string, cur: Crop | undefined): Promise<Crop | null | undefined> {
  return new Promise(res => {
    const c: Crop = { l: cur?.l ?? 0, t: cur?.t ?? 0, r: cur?.r ?? 0, b: cur?.b ?? 0 };
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="dlg cropdlg" role="dialog"><h3>Rasmni qirqish</h3>
      <div class="cprev"><img src="${url}" alt="" draggable="false"><div class="cbox"></div></div>
      ${[['l', 'Chap'], ['t', 'Tepa'], ['r', 'O‘ng'], ['b', 'Past']].map(([k, n]) => `<label class="crow"><span>${n}</span><input type="range" min="0" max="85" step="0.5" data-k="${k}" value="${c[k as keyof Crop]}"><output data-o="${k}"></output></label>`).join('')}
      <div class="row"><button class="tb" data-a="reset">Asliga qaytarish</button><button class="tb" data-a="x">Bekor</button><button class="tb pri" data-a="ok">Qo‘llash</button></div></div>`;
    document.body.append(ov);
    const box = ov.querySelector<HTMLElement>('.cbox')!;
    const draw = () => {
      box.style.left = c.l + '%'; box.style.top = c.t + '%'; box.style.right = c.r + '%'; box.style.bottom = c.b + '%';
      (Object.keys(c) as (keyof Crop)[]).forEach(k => { ov.querySelector<HTMLElement>(`[data-o=${k}]`)!.textContent = Math.round(c[k]) + '%'; });
    };
    ov.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(i => i.addEventListener('input', () => {
      const k = i.dataset.k as keyof Crop, o = { l: 'r', r: 'l', t: 'b', b: 't' }[k] as keyof Crop; let v = Number(i.value);
      if (v + c[o] > 90) { v = 90 - c[o]; i.value = String(v); } c[k] = v; draw();
    }));
    const end = (v: Crop | null | undefined) => { ov.remove(); document.removeEventListener('keydown', kd); res(v); };
    const kd = (e: KeyboardEvent) => { if (e.key === 'Escape') end(undefined); }; document.addEventListener('keydown', kd);
    ov.addEventListener('click', e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a; if (e.target === ov) return end(undefined);
      if (a === 'x') end(undefined); else if (a === 'reset') end(null);
      else if (a === 'ok') end(c.l + c.t + c.r + c.b < 0.5 ? null : { l: c.l, t: c.t, r: c.r, b: c.b });
    });
    draw();
  });
}
