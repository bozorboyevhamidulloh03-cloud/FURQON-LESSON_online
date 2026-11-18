const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u: Uint8Array): number { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export const crcHex = (u: Uint8Array): string => crc32(u).toString(16).padStart(8, '0');
export async function sha256Hex(u: Uint8Array): Promise<string | null> {
  const s = globalThis.crypto?.subtle; if (!s) return null;
  const h = new Uint8Array(await s.digest('SHA-256', u as unknown as BufferSource));
  return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
}
