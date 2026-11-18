/** Juda kichik MQTT 3.1.1 mijozi (WebSocket orqali, QoS 0). Faqat connect/subscribe/publish/ping. */
const enc = new TextEncoder(), dec = new TextDecoder();
const varint = (n: number) => { const o: number[] = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0); return o; };
const str = (s: string) => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
const cat = (...parts: (number[] | Uint8Array)[]) => { const n = parts.reduce((a, p) => a + p.length, 0), o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };

export interface MqttHandle { publish(topic: string, payload: Uint8Array): void; close(): void; readonly open: boolean }
export function mqttConnect(url: string, topic: string, onMsg: (payload: Uint8Array) => void, onState: (up: boolean) => void, timeoutMs = 7000): Promise<MqttHandle> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket, buf = new Uint8Array(0), up = false, settled = false, ping = 0, closed = false;
    const cid = 'fur' + Math.random().toString(36).slice(2, 10);
    const fail = (m: string) => { if (!settled) { settled = true; clearTimeout(tm); try { ws.close(); } catch { /* */ } reject(new Error(m)); } };
    const tm = setTimeout(() => fail('Server javob bermadi'), timeoutMs);
    try { ws = new WebSocket(url, 'mqtt'); } catch { return fail('Server manzili noto‘g‘ri'); }
    ws.binaryType = 'arraybuffer';
    const send = (b: Uint8Array) => { if (ws.readyState === 1) ws.send(b as unknown as ArrayBuffer); };
    const handle: MqttHandle = {
      get open() { return up; },
      publish(t, payload) { const v = cat(str(t), payload); send(cat([0x30], varint(v.length), v)); },
      close() { closed = true; clearInterval(ping); try { send(new Uint8Array([0xe0, 0])); ws.close(); } catch { /* */ } },
    };
    ws.onopen = () => { const v = cat(str('MQTT'), [4, 2, 0, 30], str(cid)); send(cat([0x10], varint(v.length), v)); };
    ws.onerror = () => fail('Serverga ulanib bo‘lmadi');
    ws.onclose = () => { clearInterval(ping); if (!settled) return fail('Server ulanishni yopdi'); if (up) { up = false; onState(false); } };
    ws.onmessage = ev => {
      buf = cat(buf, new Uint8Array(ev.data as ArrayBuffer));
      for (;;) {
        if (buf.length < 2) return; let mul = 1, len = 0, i = 1, b: number;
        do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
        if (buf.length < i + len) return; const type = buf[0] >> 4, body = buf.slice(i, i + len); buf = buf.slice(i + len);
        if (type === 2) { if (body[1] !== 0) return fail('Server rad etdi (kod ' + body[1] + ')'); send(cat([0x82], varint(5 + enc.encode(topic).length), [0, 1], str(topic), [0])); }
        else if (type === 9) { if (!settled) { settled = true; clearTimeout(tm); up = true; ping = window.setInterval(() => send(new Uint8Array([0xc0, 0])), 20000); onState(true); resolve(handle); } else { up = true; onState(true); } }
        else if (type === 3) { const tl = (body[0] << 8) | body[1]; onMsg(body.slice(2 + tl)); }
      }
    };
    void closed; void dec;
  });
}
