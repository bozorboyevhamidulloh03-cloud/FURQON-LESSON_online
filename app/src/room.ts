import { mqttConnect, MqttHandle } from './mqtt';

/** Bepul ommaviy MQTT-WebSocket serverlar (ro'yxatdan o'tish shart emas). Xabarlar shifrlangan yuboriladi. */
export const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const enc = new TextEncoder(), dec = new TextDecoder();
export const customBroker = (): string => { try { return localStorage.getItem('fur.broker') || ''; } catch { return ''; } };
export const setCustomBroker = (u: string) => { try { u ? localStorage.setItem('fur.broker', u) : localStorage.removeItem('fur.broker'); } catch { /* */ } };

export function newCode(idx: number): string { const r = crypto.getRandomValues(new Uint8Array(12)); return String(idx) + Array.from(r, b => ALPHA[b % ALPHA.length]).join(''); }
export function fmtCode(c: string): string { return `${c[0]}-${c.slice(1, 5)}-${c.slice(5, 9)}-${c.slice(9, 13)}`; }
export function parseCode(s: string): string | null { const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[OIL]/g, ''); return /^[0-9][A-HJKMNP-Z2-9]{12}$/.test(c) ? c : null; }
const b64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); };
export const unb64 = (s: string) => { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
export { b64 };
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');

export type Msg = { k: string; [x: string]: any };
export class Room {
  readonly id = Math.random().toString(36).slice(2, 10);
  onMsg: (m: Msg, from: string) => void = () => { };
  onState: (up: boolean) => void = () => { };
  private conn!: MqttHandle; private key!: CryptoKey; private topic = ''; private parts = new Map<string, { n: number; got: string[]; at: number }>();
  broker = '';
  /** idx: 0..2 = ommaviy server raqami, 9 = o'zingizning server (Server maydoni). */
  static async open(code: string, tryOrder: string[]): Promise<Room> {
    if (!crypto?.subtle) throw new Error('Brauzer shifrlashni qo‘llamaydi (ilovani fayl yoki https orqali oching)');
    const r = new Room(), body = code.slice(1), base = await crypto.subtle.importKey('raw', enc.encode(body), 'PBKDF2', false, ['deriveKey']);
    r.key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('fur-room-v1'), iterations: 100000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    r.topic = 'fur/v1/' + hex(await crypto.subtle.digest('SHA-256', enc.encode('topic:' + body))).slice(0, 24);
    let err = new Error('Server topilmadi');
    for (const url of tryOrder) {
      try { r.conn = await mqttConnect(url, r.topic, p => { void r.recv(p); }, up => r.onState(up)); r.broker = url; return r; } catch (e) { err = e as Error; }
    }
    throw err;
  }
  private async encrypt(plain: string): Promise<Uint8Array> { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, enc.encode(plain))); const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return o; }
  async send(m: Msg): Promise<void> {
    if (!this.conn?.open) return; const json = JSON.stringify({ f: this.id, ...m });
    if (json.length <= 28000) return this.conn.publish(this.topic, await this.encrypt(json));
    const id = Math.random().toString(36).slice(2, 9), n = Math.ceil(json.length / 28000);
    for (let i = 0; i < n; i++) this.conn.publish(this.topic, await this.encrypt(JSON.stringify({ f: this.id, k: '~', id, i, n, d: json.slice(i * 28000, (i + 1) * 28000) })));
  }
  private async recv(p: Uint8Array) {
    try {
      const pt = dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: p.slice(0, 12) }, this.key, p.slice(12))); let m = JSON.parse(pt) as Msg;
      if (m.f === this.id) return;
      if (m.k === '~') {
        const key = m.f + m.id; let e = this.parts.get(key); if (!e) { e = { n: m.n, got: [], at: Date.now() }; this.parts.set(key, e); } e.got[m.i] = m.d;
        if (e.got.filter(x => x !== undefined).length < e.n) { for (const [k, v] of this.parts) if (Date.now() - v.at > 60000) this.parts.delete(k); return; }
        this.parts.delete(key); m = JSON.parse(e.got.join('')) as Msg;
      }
      this.onMsg(m, m.f);
    } catch { /* begona yoki buzilgan xabar */ }
  }
  close() { try { this.conn?.close(); } catch { /* */ } }
}
