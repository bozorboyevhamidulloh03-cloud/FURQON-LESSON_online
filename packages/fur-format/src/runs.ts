import type { Run } from './model';
type Flag = 'b' | 'i' | 'u' | 's' | 'sup' | 'sub';
const KEYS: (keyof Run)[] = ['b', 'i', 'u', 's', 'sup', 'sub', 'c', 'fs', 'ff', 'href'];
const same = (a: Run, b: Run) => KEYS.every(k => a[k] === b[k]);
export const runsLength = (r: Run[]): number => r.reduce((n, x) => n + x.t.length, 0);
export const plainText = (r: Run[]): string => r.map(x => x.t).join('');
export function normalizeRuns(r: Run[]): Run[] {
  const out: Run[] = [];
  for (const x of r) { if (!x.t) continue; const l = out[out.length - 1]; if (l && same(l, x)) l.t += x.t; else out.push({ ...x }); }
  return out;
}
export function splitRuns(r: Run[], off: number): [Run[], Run[]] {
  const L: Run[] = [], R: Run[] = []; let p = 0;
  for (const x of r) {
    const e = p + x.t.length;
    if (e <= off) L.push(x); else if (p >= off) R.push(x); else { L.push({ ...x, t: x.t.slice(0, off - p) }); R.push({ ...x, t: x.t.slice(off - p) }); }
    p = e;
  }
  return [L, R];
}
export const sliceRuns = (r: Run[], s: number, e: number): Run[] => splitRuns(splitRuns(r, e)[0], s)[1];
export function patchRuns(r: Run[], s: number, e: number, fn: (x: Run) => Run): Run[] {
  const [a, rest] = splitRuns(r, s), [m, z] = splitRuns(rest, e - s);
  return normalizeRuns([...a, ...m.map(fn), ...z]);
}
export function allHave(r: Run[], s: number, e: number, key: Flag): boolean { const m = sliceRuns(r, s, e); return m.length > 0 && m.every(x => !!x[key]); }
export function setFlag(x: Run, key: Flag, on: boolean): Run {
  const y: Run = { ...x }; if (on) y[key] = true; else delete y[key];
  if (on && key === 'sup') delete y.sub; if (on && key === 'sub') delete y.sup; return y;
}
export function replaceRange(r: Run[], s: number, e: number, text: string): Run[] {
  const [a, rest] = splitRuns(r, s), [m, z] = splitRuns(rest, e - s);
  const st: Run = { ...(m[0] ?? a[a.length - 1] ?? { t: '' }), t: text };
  return normalizeRuns([...a, st, ...z]);
}
