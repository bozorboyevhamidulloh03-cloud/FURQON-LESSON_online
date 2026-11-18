// Sof JS inflate (RFC1951) — brauzerda DecompressionStream bo'lmasa (eski Android WebView) zaxira.
const LB = new Uint16Array(29), LE = new Uint8Array(29), DB = new Uint16Array(30), DE = new Uint8Array(30);
(function () {
  const lb = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const le = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const db = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const de = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  lb.forEach((v, i) => { LB[i] = v; LE[i] = le[i]; }); db.forEach((v, i) => { DB[i] = v; DE[i] = de[i]; });
})();
interface Huff { count: Uint16Array; symbol: Uint16Array }
function build(lengths: ArrayLike<number>, n: number): Huff {
  const count = new Uint16Array(16), symbol = new Uint16Array(n), offs = new Uint16Array(16);
  for (let i = 0; i < n; i++) count[lengths[i]]++;
  count[0] = 0;
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
  for (let i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
  return { count, symbol };
}
let FIXL: Huff | null = null, FIXD: Huff | null = null;
export function inflateRaw(src: Uint8Array, cap: number): Uint8Array {
  let pos = 0, bitBuf = 0, bitCnt = 0, out = new Uint8Array(Math.min(Math.max(src.length * 4, 1024), cap + 1)), op = 0;
  const bad = () => new Error('inflate');
  const bits = (n: number): number => {
    while (bitCnt < n) { if (pos >= src.length) throw bad(); bitBuf |= src[pos++] << bitCnt; bitCnt += 8; }
    const v = bitBuf & ((1 << n) - 1); bitBuf >>>= n; bitCnt -= n; return v;
  };
  const dec = (h: Huff): number => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1); const c = h.count[len];
      if (code - c < first) return h.symbol[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw bad();
  };
  const put = (b: number) => {
    if (op >= out.length) { if (op >= cap) throw new Error('cap'); const n = new Uint8Array(Math.min(out.length * 2, cap + 1)); n.set(out); out = n; }
    out[op++] = b;
  };
  for (let last = 0; !last;) {
    last = bits(1); const type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0; if (pos + 4 > src.length) throw bad();
      const len = src[pos] | (src[pos + 1] << 8); pos += 4; if (pos + len > src.length) throw bad();
      for (let i = 0; i < len; i++) put(src[pos++]);
    } else if (type === 1 || type === 2) {
      let hl: Huff, hd: Huff;
      if (type === 1) {
        if (!FIXL) { const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288); FIXL = build(l, 288); FIXD = build(new Uint8Array(30).fill(5), 30); }
        hl = FIXL; hd = FIXD!;
      } else {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        const order = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15], lens = new Uint8Array(320);
        for (let i = 0; i < ncode; i++) lens[order[i]] = bits(3);
        const cl = build(lens, 19); lens.fill(0);
        for (let i = 0; i < nlen + ndist;) {
          const s = dec(cl);
          if (s < 16) lens[i++] = s;
          else {
            let prev = 0, rep: number;
            if (s === 16) { if (!i) throw bad(); prev = lens[i - 1]; rep = 3 + bits(2); } else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
            if (i + rep > nlen + ndist) throw bad(); while (rep--) lens[i++] = prev;
          }
        }
        hl = build(lens.subarray(0, nlen), nlen); hd = build(lens.subarray(nlen), ndist);
      }
      for (;;) {
        let s = dec(hl);
        if (s < 256) put(s);
        else if (s === 256) break;
        else {
          s -= 257; if (s >= 29) throw bad();
          const len = LB[s] + bits(LE[s]), ds = dec(hd); if (ds >= 30) throw bad();
          const dist = DB[ds] + bits(DE[ds]); if (dist > op) throw bad();
          for (let i = 0; i < len; i++) put(out[op - dist]);
        }
      }
    } else throw bad();
  }
  return out.slice(0, op);
}
