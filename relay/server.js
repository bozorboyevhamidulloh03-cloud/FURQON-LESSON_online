#!/usr/bin/env node
// FUR Relay (bulut variant) — Render/Railway/Fly kabi bepul hostingda ishlaydi. PORT muhit o'zgaruvchisini o'qiydi.
// Oldingi: FUR Relay — jonli dars uchun mahalliy (LAN) server. Internet va ro'yxatdan o'tish shart emas.
// Ishga tushirish:  node fur-relay.cjs 8883      (talab: `npm i ws` bir marta)
// Ilovada: Jonli dars -> "Server" maydoniga  ws://<kompyuter IP>:8883  yozing.
// MQTT 3.1.1 ning kichik qismi (connect, subscribe, publish QoS0) — dars xabarlari shifrlangan keladi.
const http = require('http');
const { WebSocketServer } = require('ws');
const port = Number(process.env.PORT || process.argv[2] || 8883);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); r.end('FUR relay ishlayapti\n'); });
const wss = new WebSocketServer({ server: srv, handleProtocols: ps => (ps.has('mqtt') ? 'mqtt' : false), maxPayload: 4 * 1024 * 1024 });
// hosting proksilari bo'sh ulanishni uzmasligi uchun har 25 s ping
setInterval(() => { for (const w of wss.clients) { try { w.ping(); } catch { /* */ } } }, 25000);
const subs = new Map(); // ws -> Set(topic)
const cat = (...p) => Buffer.concat(p.map(x => Buffer.from(x)));
wss.on('connection', ws => {
  let buf = Buffer.alloc(0); subs.set(ws, new Set());
  ws.on('close', () => subs.delete(ws)); ws.on('error', () => { });
  ws.on('message', d => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return; let mul = 1, len = 0, i = 1, b;
      do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
      if (buf.length < i + len) return; const pkt = buf.subarray(0, i + len), type = pkt[0] >> 4, body = pkt.subarray(i); buf = buf.subarray(i + len);
      if (type === 1) ws.send(Buffer.from([0x20, 2, 0, 0]));
      else if (type === 8) { const id = body.subarray(0, 2), tl = body.readUInt16BE(2); subs.get(ws).add(body.subarray(4, 4 + tl).toString()); ws.send(cat([0x90, 3], id, [0])); }
      else if (type === 3) { if (process.env.FUR_RELAY_LOG) require('fs').appendFileSync(process.env.FUR_RELAY_LOG, body.toString('latin1') + '\n'); const tl = body.readUInt16BE(0), t = body.subarray(2, 2 + tl).toString(); for (const [c, s] of subs) if (c !== ws && s.has(t) && c.readyState === 1) c.send(pkt); }
      else if (type === 12) ws.send(Buffer.from([0xd0, 0]));
      else if (type === 14) ws.close();
    }
  });
});
srv.listen(port, '0.0.0.0', () => console.log('FUR Relay ishlayapti: port ' + port));
