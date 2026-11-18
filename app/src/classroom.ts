import { FurDocument, FurObject, FurPage, newDocument, newPage } from '../../packages/fur-format/src/index';
import { BROKERS, Room, Msg, b64, unb64, customBroker, newCode, parseCode } from './room';
import { PresentHandle, PresentHooks, startPresentation } from './present';

// ---------- ulanish (qayta ulanish bilan) ----------
interface Link { send(m: Msg): void; close(): void; broker(): string }
async function openLink(code: string, order: string[], onMsg: (m: Msg) => void, onState: (up: boolean) => void): Promise<Link> {
  let room = await Room.open(code, order), dead = false, trying = false;
  const wire = (r: Room) => { r.onMsg = onMsg; r.onState = up => { onState(up); if (!up && !dead) retry(); }; };
  const retry = async () => { if (trying || dead) return; trying = true; for (let k = 0; !dead; k++) { await new Promise(r => setTimeout(r, Math.min(8000, 1500 + k * 1000))); if (dead) break; try { const r = await Room.open(code, [room.broker, ...order]); room.close(); room = r; wire(r); trying = false; onState(true); return; } catch { /* qayta urinadi */ } } trying = false; };
  wire(room);
  return { send: m => { void room.send(m); }, close: () => { dead = true; room.close(); }, broker: () => room.broker };
}
export const orderFor = (idx: number): string[] => { const c = customBroker(); return idx === 9 ? (c ? [c] : []) : [BROKERS[idx]].filter(Boolean); };

// ---------- yordamchi ----------
const assetIds = (p: FurPage): string[] => { const o = new Set<string>(); if (p.type === 'board') p.objects.forEach(x => { if (x.t === 'image') o.add(x.a); }); else p.blocks.forEach(b => { if (b.type === 'image') o.add(b.a); }); return [...o]; };
const CH = 24000;

// ---------- O'QITUVCHI ----------
export interface RosterEntry { id: string; name: string; last: number; hand: boolean }
export interface TeacherSession {
  code: string; broker: string; roster(): RosterEntry[]; hooks: PresentHooks;
  sendPage(i: number): void; touch(i: number): void; end(): void; up(): boolean;
}
export async function startTeacher(getDoc: () => FurDocument | null, getIdx: () => number, onRoster: () => void, onHandUp: (n: string) => void): Promise<TeacherSession> {
  const custom = customBroker(), order = custom ? [custom] : BROKERS, body = newCode(0);
  // birinchi ishlagan serverni topamiz (shifr kaliti kod tanasidan olinadi, server raqami kalitga kirmaydi)
  let link: Link | null = null, idx = 9, lastErr = new Error('Server topilmadi'), upNow = true;
  const roster = new Map<string, RosterEntry>(), sentAssets = new Set<string>(), asked = new Map<string, number>(), snaps = new Map<number, Map<string, string>>(), lastDoc = new Map<number, string>();
  let cur = -1, timer = 0, hb = 0, ended = false;
  const handle = (m: Msg) => {
    const doc = getDoc(); if (!doc) return;
    if (m.k === 'hello') { const e = roster.get(m.f) ?? { id: m.f, name: '', last: 0, hand: false }; const isNew = !roster.has(m.f); e.name = String(m.name ?? 'O‘quvchi').slice(0, 40); e.last = Date.now(); roster.set(m.f, e); if (isNew || m.first) { onRoster(); sentAssets.clear(); if (cur >= 0) sendPage(cur); else sendHb(); } }
    else if (m.k === 'hand') { const e = roster.get(m.f); if (e) { e.hand = !!m.up; e.last = Date.now(); onRoster(); if (m.up) onHandUp(e.name); } }
    else if (m.k === 'bye') { roster.delete(m.f); onRoster(); }
    else if (m.k === 'need' && Array.isArray(m.ids)) { for (const id of m.ids.slice(0, 20)) { if (typeof id === 'string' && Date.now() - (asked.get(id) ?? 0) > 6000) { asked.set(id, Date.now()); sendAsset(id); } } }
  };
  for (let k = 0; k < order.length; k++) {
    try { link = await openLink(body, order, handle, up => { upNow = up; onRoster(); if (up) { sentAssets.clear(); if (cur >= 0) sendPage(cur); } }); idx = custom ? 9 : BROKERS.indexOf(link.broker()); break; } catch (e) { lastErr = e as Error; break; }
  }
  if (!link) throw new Error(order.length ? 'Hech bir server ochilmadi: ' + lastErr.message : 'Server manzili kiritilmagan');
  const code = String(idx) + body.slice(1), L = link;
  function sendAsset(id: string) {
    const doc = getDoc(), a = doc?.assets.find(x => x.id === id); if (!a) return; sentAssets.add(id);
    const s = b64(a.data as Uint8Array), n = Math.ceil(s.length / CH); for (let i = 0; i < n; i++) L.send({ k: 'asset', id, mime: a.mime, i, n, d: s.slice(i * CH, (i + 1) * CH) });
  }
  function sendHb() { const doc = getDoc(); L.send({ k: 'hb', i: cur, n: doc?.pages.length ?? 0 }); }
  function sendPage(i: number) {
    const doc = getDoc(); if (!doc || !doc.pages[i]) return; const p = doc.pages[i]; cur = i;
    for (const id of assetIds(p)) if (!sentAssets.has(id)) sendAsset(id);
    L.send({ k: 'page', i, n: doc.pages.length, title: doc.title, page: p, layout: doc.layout });
    if (p.type === 'board') snaps.set(i, new Map(p.objects.map(o => [o.id, JSON.stringify(o)]))); else lastDoc.set(i, JSON.stringify(p.blocks));
  }
  function sync(i: number) {
    const doc = getDoc(); const p = doc?.pages[i]; if (!doc || !p) return; if (i !== cur) return sendPage(i);
    for (const id of assetIds(p)) if (!sentAssets.has(id)) sendAsset(id);
    if (p.type === 'document') { const j = JSON.stringify(p.blocks); if (lastDoc.get(i) !== j) sendPage(i); return; }
    const old = snaps.get(i) ?? new Map<string, string>(), now = new Map(p.objects.map(o => [o.id, JSON.stringify(o)]));
    const del = [...old.keys()].filter(id => !now.has(id)), upd: FurObject[] = [], add: { at: number; o: FurObject }[] = [];
    p.objects.forEach((o, at) => { const j = now.get(o.id)!; if (!old.has(o.id)) add.push({ at, o }); else if (old.get(o.id) !== j) upd.push(o); });
    if (!del.length && !upd.length && !add.length) return;
    L.send({ k: 'ops', i, del, upd, add, n: p.objects.length }); snaps.set(i, now);
  }
  hb = window.setInterval(() => { sendHb(); const t = Date.now(); let ch = false; for (const [id, e] of roster) if (t - e.last > 30000) { roster.delete(id); ch = true; } if (ch) onRoster(); }, 4000);
  const hooks: PresentHooks = { page: i => sendPage(i), laser: (u, v, on) => L.send({ k: 'laser', u, v, on }), ink: pts => L.send({ k: 'ink', pts }) };
  sendPage(Math.max(0, Math.min((getDoc()?.pages.length ?? 1) - 1, getIdx())));
  return {
    code, broker: L.broker(), roster: () => [...roster.values()], hooks, sendPage, up: () => upNow,
    touch(i) { clearTimeout(timer); timer = window.setTimeout(() => sync(i), 250); },
    end() { if (ended) return; ended = true; clearTimeout(timer); clearInterval(hb); L.send({ k: 'end' }); setTimeout(() => L.close(), 400); },
  };
}

// ---------- O'QUVCHI ----------
export async function joinClass(codeIn: string, name: string, onExit: (why: string) => void): Promise<void> {
  const code = parseCode(codeIn); if (!code) throw new Error('Kod noto‘g‘ri (13 belgi: raqam + 12 harf/raqam)');
  const doc: FurDocument = newDocument('Jonli dars'); doc.pages = []; const parts = new Map<string, { n: number; got: string[]; mime: string }>();
  let view: PresentHandle | null = null, lastHb = Date.now(), cur = 0, ended = false, hand = false, link: Link | null = null, ti = 0, th = 0;
  const ensure = (n: number) => { while (doc.pages.length < n) { const p = newPage('board'); p.bg = 'white'; doc.pages.push(p); } };
  const missing = (p: FurPage) => assetIds(p).filter(id => !doc.assets.some(a => a.id === id));
  const onMsg = (m: Msg) => {
    lastHb = Date.now(); if (!view) return;
    if (m.k === 'page' && m.page && typeof m.i === 'number') {
      ensure(Math.max(m.n ?? 0, m.i + 1)); doc.pages[m.i] = m.page as FurPage; if (m.layout) doc.layout = m.layout; if (m.title) doc.title = String(m.title); cur = m.i; view.goto(m.i); view.status('● Jonli');
      const need = missing(doc.pages[m.i]); if (need.length) link?.send({ k: 'need', ids: need });
    } else if (m.k === 'ops' && typeof m.i === 'number') {
      const p = doc.pages[m.i]; if (!p || p.type !== 'board') return; const del = new Set<string>(m.del ?? []);
      let objs = p.objects.filter(o => !del.has(o.id)); const upd = new Map<string, FurObject>((m.upd ?? []).map((o: FurObject) => [o.id, o])); objs = objs.map(o => upd.get(o.id) ?? o);
      for (const a of [...(m.add ?? [])].sort((x: any, y: any) => x.at - y.at)) objs.splice(Math.min(a.at, objs.length), 0, a.o);
      p.objects.splice(0, p.objects.length, ...objs); const need = missing(p); if (need.length) link?.send({ k: 'need', ids: need }); if (m.i === cur) view.refresh();
    } else if (m.k === 'asset' && typeof m.id === 'string') {
      let e = parts.get(m.id); if (!e || e.n !== m.n) { e = { n: m.n, got: [], mime: String(m.mime) }; parts.set(m.id, e); } e.got[m.i] = m.d;
      if (e.got.filter(x => x !== undefined).length === e.n && !doc.assets.some(a => a.id === m.id)) { doc.assets.push({ id: m.id, mime: e.mime, data: unb64(e.got.join('')) } as any); parts.delete(m.id); view.refresh(); }
    } else if (m.k === 'laser') view.laser(m.u, m.v, !!m.on); else if (m.k === 'ink') view.ink(m.pts ?? null);
    else if (m.k === 'hb') { ensure(m.n ?? 0); if (m.i !== undefined && m.i >= 0 && m.i !== cur) { cur = m.i; view.goto(m.i); } view.status('● Jonli'); }
    else if (m.k === 'end') { ended = true; view.status('Dars tugadi', true); }
  };
  link = await openLink(code, orderFor(Number(code[0])), onMsg, up => { if (!view) return; view.status(up ? '● Jonli' : 'Aloqa uzildi…', !up); if (up) link?.send({ k: 'hello', name, first: true }); });
  const finish = (why: string) => { clearInterval(ti); clearInterval(th); if (!ended) link?.send({ k: 'bye' }); setTimeout(() => link?.close(), 300); onExit(why); };
  doc.pages = []; ensure(1);
  view = startPresentation(doc, 0, () => finish('exit'), { controlled: true, onHand: () => { hand = !hand; link?.send({ k: 'hand', name, up: hand }); view?.hand(hand); } });
  view.status('Ustoz kutilmoqda…');
  link.send({ k: 'hello', name, first: true });
  ti = window.setInterval(() => link?.send({ k: 'hello', name }), 8000);
  th = window.setInterval(() => { if (!ended && Date.now() - lastHb > 14000) view?.status('Ustoz ulanishi yo‘q', true); }, 3000);
}
