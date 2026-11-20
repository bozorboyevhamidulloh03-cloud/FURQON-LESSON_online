// FURQON Holographic Glass UI — sozlamalar: rejim, aksent, shaffoflik, animatsiya. localStorage'da saqlanadi.
export type Mode = 'auto' | 'dark' | 'light';
export type Accent = 'blue' | 'ocean' | 'gold' | 'purple';
export type Motion = 'auto' | 'on' | 'off';
export interface Settings { mode: Mode; accent: Accent; glass: number; motion: Motion; compact: boolean; custom: string }
export const ACCENTS: { id: Accent; name: string; c: string }[] = [
  { id: 'blue', name: 'Furqon Blue', c: '#087BFF' }, { id: 'ocean', name: 'Ocean', c: '#12C2C9' },
  { id: 'gold', name: 'Gold', c: '#FFC928' }, { id: 'purple', name: 'Purple', c: '#8F6BFF' },
];
const KEY = 'fur.settings', DEF: Settings = { mode: 'dark', accent: 'blue', glass: 62, motion: 'auto', compact: false, custom: '' };
let cur: Settings = { ...DEF };
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const blurOk = typeof CSS !== 'undefined' && CSS.supports?.('backdrop-filter', 'blur(1px)') || typeof CSS !== 'undefined' && CSS.supports?.('-webkit-backdrop-filter', 'blur(1px)');

export function loadSettings(): Settings {
  let s: Partial<Settings> = {};
  try {
    const raw = localStorage.getItem(KEY); if (raw) s = JSON.parse(raw) as Partial<Settings>;
    else { const old = localStorage.getItem('fur-theme'); if (old === 'dark' || old === 'light') s.mode = old; }   // eski sozlamadan ko'chirish
  } catch { /* ignore */ }
  const ok = <T extends string>(v: unknown, a: readonly T[], d: T): T => (a as readonly string[]).includes(v as string) ? v as T : d;
  cur = {
    mode: ok(s.mode, ['auto', 'dark', 'light'] as const, DEF.mode), accent: ok(s.accent, ['blue', 'ocean', 'gold', 'purple'] as const, DEF.accent),
    glass: Math.max(20, Math.min(100, Number(s.glass) || DEF.glass)), motion: ok(s.motion, ['auto', 'on', 'off'] as const, DEF.motion),
    compact: !!s.compact, custom: /^#[0-9a-f]{6}$/i.test(s.custom ?? '') ? s.custom! : '',
  };
  return cur;
}
export const getSettings = (): Settings => ({ ...cur });
export const effectiveMode = (): 'dark' | 'light' => cur.mode === 'auto' ? (mq?.matches === false ? 'light' : 'dark') : cur.mode;

export function applySettings(): void {
  const d = document.documentElement, st = d.style;
  d.dataset.theme = effectiveMode(); d.dataset.accent = cur.accent; d.dataset.compact = cur.compact ? '1' : '0';
  const reduce = cur.motion === 'off' || (cur.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  d.dataset.motion = reduce ? 'off' : 'on';
  // shaffoflik: 20–100 % → alfa 0.28–0.96. backdrop-filter bo'lmasa, matn o'qilishi uchun kamida 0.9.
  let a = 0.28 + (cur.glass - 20) / 80 * 0.68; if (!blurOk) a = Math.max(a, 0.9);
  st.setProperty('--ga', a.toFixed(2)); st.setProperty('--blur', (blurOk ? Math.round(10 + cur.glass * 0.16) : 0) + 'px');
  if (cur.custom) { st.setProperty('--accent', cur.custom); st.setProperty('--accent2', cur.custom); } else { st.removeProperty('--accent'); st.removeProperty('--accent2'); }
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', effectiveMode() === 'dark' ? '#030817' : '#eaf1fb');
}
export function setSettings(p: Partial<Settings>): Settings {
  cur = { ...cur, ...p }; try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* ignore */ } applySettings(); return cur;
}
export function initTheme(): void {
  loadSettings(); applySettings();
  mq?.addEventListener?.('change', () => { if (cur.mode === 'auto') applySettings(); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => { if (cur.motion === 'auto') applySettings(); });
}
