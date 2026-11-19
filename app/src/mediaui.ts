// Qatnashuvchilarning video/audio "plitkalari" (ekranning yuqori o‘ng burchagida). Taqdimot ustida ham ko‘rinadi.
const tiles = new Map<string, { el: HTMLElement; v: HTMLVideoElement; cam: boolean }>();
function host(): HTMLElement { let h = document.getElementById('fur-media'); if (!h) { h = document.createElement('div'); h.id = 'fur-media'; h.className = 'fur-media'; document.body.append(h); } return h; }

export function showTile(id: string, label: string, stream: MediaStream, cam: boolean) {
  let t = tiles.get(id);
  if (!t) {
    const el = document.createElement('div'); el.className = 'mtile'; const v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', ''); const lb = document.createElement('span'); lb.className = 'mlab'; el.append(v, lb); host().append(el);
    el.addEventListener('click', () => { void v.play().catch(() => { /* */ }); }); t = { el, v, cam }; tiles.set(id, t);
  }
  if (t.v.srcObject !== stream) t.v.srcObject = stream; t.cam = cam; t.el.classList.toggle('audio', !cam); (t.el.querySelector('.mlab') as HTMLElement).textContent = (cam ? '' : '🎤 ') + label;
  void t.v.play().catch(() => { t!.el.classList.add('tap'); (t!.el.querySelector('.mlab') as HTMLElement).textContent = '▶ ' + label; });
}
export function dropTile(id: string) { const t = tiles.get(id); if (!t) return; t.v.srcObject = null; t.el.remove(); tiles.delete(id); if (!tiles.size) document.getElementById('fur-media')?.remove(); }
export function dropAll() { for (const k of [...tiles.keys()]) dropTile(k); }
export const hasTile = (id: string) => tiles.has(id);
