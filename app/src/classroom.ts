import { FurDocument, FurObject, FurPage, newDocument, newPage } from '../../packages/fur-format/src/index';
import { BROKERS, Room, Msg, b64, unb64, customBroker, newCode, parseCode } from './room';
import { PresentHandle, PresentHooks, PresBtn, startPresentation } from './present';
import { Peers, getTrack, rtcSupported } from './rtc';
import { showTile, dropTile, dropAll } from './mediaui';
import { saveLive, touchLive, clearLive } from './livestate';

// ---------- ulanish (qayta ulanish bilan) ----------
interface Link { send(m: Msg): void; close(): void; broker(): string; id(): string }
async function openLink(code: string, order: string[], onMsg: (m: Msg) => void, onState: (up: boolean) => void): Promise<Link> {
  let room = await Room.open(code, order), dead = false, trying = false, lastRx = Date.now();
  const wire = (r: Room) => { r.onMsg = m => { lastRx = Date.now(); onMsg(m); }; r.onState = up => { onState(up); if (!up && !dead) retry(); }; };
  const retry = async () => { if (trying || dead) return; trying = true; for (let k = 0; !dead; k++) { await new Promise(r => setTimeout(r, Math.min(8000, 1500 + k * 1000))); if (dead) break; try { const r = await Room.open(code, [room.broker, ...order]); room.close(); room = r; wire(r); trying = false; onState(true); return; } catch { /* qayta urinadi */ } } trying = false; };
  wire(room);
  // Internet "jim-jit" uzilsa (ekran o'chdi, tarmoq almashdi) brauzer ulanish yopilganini bildirmaydi: qaytganda tekshirib, qayta ulaymiz.
  const kick = () => { if (dead || trying || Date.now() - lastRx < 9000) return; room.close(); room.onState(false); };
  const onVis = () => { if (document.visibilityState === 'visible') kick(); };
  window.addEventListener('online', kick); document.addEventListener('visibilitychange', onVis);
  return { send: m => { void room.send(m); }, close: () => { dead = true; window.removeEventListener('online', kick); document.removeEventListener('visibilitychange', onVis); room.close(); }, broker: () => room.broker, id: () => room.id };
}
export const orderFor = (idx: number, srv: string = customBroker()): string[] => idx === 9 ? (srv ? [srv] : []) : [BROKERS[idx]].filter(Boolean);
/** Saqlangan efir hali davom etayotganini jim tekshiradi (o'zini ro'yxatga qo'shmaydi): 'live' | 'ended' | 'none' (9 soniyada ustoz signali kelmadi). */
export async function probeLive(codeIn: string, srv?: string): Promise<'live' | 'ended' | 'none'> {
  const code = parseCode(codeIn); if (!code) return 'ended';
  return new Promise(res => {
    let done = false, link: Link | null = null; const fin = (v: 'live' | 'ended' | 'none') => { if (done) return; done = true; clearTimeout(t); link?.close(); res(v); }, t = setTimeout(() => fin('none'), 9000);
    openLink(code, orderFor(Number(code[0]), srv ?? customBroker()), m => { if (m.k === 'end') fin('ended'); else if (m.k === 'hb' || m.k === 'page') fin('live'); }, () => { }).then(l => { link = l; if (done) l.close(); }, () => fin('none'));
  });
}

// ---------- yordamchi ----------
const assetIds = (p: FurPage): string[] => { const o = new Set<string>(); if (p.type === 'board') p.objects.forEach(x => { if (x.t === 'image') o.add(x.a); }); else p.blocks.forEach(b => { if (b.type === 'image') o.add(b.a); }); return [...o]; };
const CH = 24000;

// ---------- O'QITUVCHI ----------
export interface RosterEntry { id: string; name: string; last: number; hand: boolean; aMic?: boolean; aCam?: boolean; aWr?: boolean; mic?: boolean; cam?: boolean }
export interface TeacherMedia { supported: boolean; remote(): MediaStream[]; mic(): boolean; cam(): boolean; setMic(on: boolean): Promise<void>; setCam(on: boolean): Promise<void>; perm(id: string, p: { mic?: boolean; cam?: boolean; wr?: boolean }): void; permAll(p: { mic?: boolean; cam?: boolean; wr?: boolean }): void; micTrack(): MediaStreamTrack | null }
export interface TeacherSession {
  code: string; broker: string; roster(): RosterEntry[]; hooks: PresentHooks; media: TeacherMedia; onBtn(b: PresBtn, view: PresentHandle): void;
  focus(i: number, u: number, v: number): void; page(): number; sendPage(i: number): void; touch(i: number): void; end(): void; up(): boolean;
}
export async function startTeacher(getDoc: () => FurDocument | null, getIdx: () => number, onRoster: () => void, onHandUp: (n: string) => void, onRemote?: (i: number) => void, resumeCode?: string): Promise<TeacherSession> {
  const custom = customBroker(), rc = resumeCode ? parseCode(resumeCode) : null, ri = rc ? Number(rc[0]) : -1;
  // Efirni davom ettirishda xuddi shu kod va xuddi shu server ishlatiladi — o'quvchilar o'zlari qaytib ulanadi.
  const order = rc ? orderFor(ri, custom) : custom ? [custom] : BROKERS, body = rc ? '0' + rc.slice(1) : newCode(0);
  // birinchi ishlagan serverni topamiz (shifr kaliti kod tanasidan olinadi, server raqami kalitga kirmaydi)
  let link: Link | null = null, idx = 9, lastErr = new Error('Server topilmadi'), upNow = true;
  const roster = new Map<string, RosterEntry>(), sentAssets = new Set<string>(), asked = new Map<string, number>(), snaps = new Map<number, Map<string, string>>(), lastDoc = new Map<number, string>();
  let cur = -1, timer = 0, hb = 0, ended = false, lastFocus = 0;
  // ---- ovoz/video ----
  let rtc: Peers | null = null, tMic: MediaStreamTrack | null = null, tCam: MediaStreamTrack | null = null, defMic = false, defCam = false, defWr = false; const owned = new Map<string, { i: number; id: string }[]>(); const streams = new Map<string, MediaStream>(), callAt = new Map<string, number>();
  const peerTile = (id: string) => { const st = streams.get(id), e = roster.get(id); if (st) showTile(id, e?.name ?? 'O‘quvchi', st, !!e?.cam); };
  const sendPerm = (e: RosterEntry) => { L.send({ k: 'perm', to: e.id, mic: !!e.aMic, cam: !!e.aCam, wr: !!e.aWr }); };
  const handle = (m: Msg) => {
    const doc = getDoc(); if (!doc) return;
    if (m.k === 'hello') { const e: RosterEntry = roster.get(m.f) ?? { id: m.f, name: '', last: 0, hand: false }; const isNew = !roster.has(m.f); e.name = String(m.name ?? 'O‘quvchi').slice(0, 40); e.last = Date.now(); roster.set(m.f, e); if (isNew) { e.aMic = defMic; e.aCam = defCam; e.aWr = defWr; } if (isNew || m.first) { e.mic = false; e.cam = false; onRoster(); sentAssets.clear(); if (cur >= 0) sendPage(cur); else sendHb(); if (rtc) void rtc.call(m.f); if (e.aMic || e.aCam || e.aWr) sendPerm(e); } }
    if (m.k === 'hello' && rtc && !rtc.has(m.f) && !m.first && roster.has(m.f) && Date.now() - (callAt.get(m.f) ?? 0) > 6000) { callAt.set(m.f, Date.now()); void rtc.call(m.f); }
    if (m.k === 'hand') { const e = roster.get(m.f); if (e) { e.hand = !!m.up; e.last = Date.now(); onRoster(); if (m.up) onHandUp(e.name); } }
    else if (m.k === 'bye') { roster.delete(m.f); rtc?.close(m.f); streams.delete(m.f); dropTile(m.f); onRoster(); }
    else if (m.k === 'rtc') void rtc?.handle(m);
    else if (m.k === 'sw' || m.k === 'su') {
      const e = roster.get(m.f), pg = typeof m.i === 'number' ? doc.pages[m.i] : undefined; if (!e || !e.aWr || !pg || pg.type !== 'board') return;
      const list = owned.get(m.f) ?? []; owned.set(m.f, list);
      if (m.k === 'sw') { const o = m.o, okS = o && o.t === 'stroke' && typeof o.id === 'string' && o.id.length <= 40 && !pg.objects.some(x => x.id === o.id) && Array.isArray(o.pts) && o.pts.length >= 1 && o.pts.length <= 3000 && o.pts.every((q: any) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]) && Math.abs(q[0]) < 1e6 && Math.abs(q[1]) < 1e6) && typeof o.c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(o.c) && Number.isFinite(o.w);
        if (!okS || pg.objects.length > 6000) return; pg.objects.push({ t: 'stroke', id: o.id, pts: o.pts.map((q: number[]) => [q[0], q[1]] as [number, number]), c: o.c, w: Math.max(0.5, Math.min(60, o.w)), hl: false }); list.push({ i: m.i, id: o.id }); if (list.length > 200) list.shift(); }
      else { const k = list.map(x => x.id).lastIndexOf(String(m.id ?? '')); const at = k >= 0 ? k : -1; if (at < 0) return; const [x] = list.splice(at, 1); const j = pg.objects.findIndex(o => o.id === x.id); if (j >= 0) pg.objects.splice(j, 1); }
      onRemote?.(m.i); touchSync(m.i);
    }
    else if (m.k === 'sm') { const e = roster.get(m.f); if (e) { e.mic = !!m.mic; e.cam = !!m.cam; peerTile(m.f); onRoster(); } }
    else if (m.k === 'need' && Array.isArray(m.ids)) { for (const id of m.ids.slice(0, 20)) { if (typeof id === 'string' && Date.now() - (asked.get(id) ?? 0) > 6000) { asked.set(id, Date.now()); sendAsset(id); } } }
  };
  for (let k = 0; k < order.length; k++) {
    try { link = await openLink(body, order, handle, up => { upNow = up; onRoster(); if (up) { sentAssets.clear(); if (cur >= 0) sendPage(cur); } }); idx = custom ? 9 : BROKERS.indexOf(link.broker()); break; } catch (e) { lastErr = e as Error; break; }
  }
  if (!link) throw new Error(order.length ? 'Hech bir server ochilmadi: ' + lastErr.message : 'Server manzili kiritilmagan');
  const code = String(idx) + body.slice(1), L = link;
  if (rtcSupported()) rtc = new Peers(() => L.id(), m => L.send(m), (peer, st) => { streams.set(peer, st); peerTile(peer); }, peer => { streams.delete(peer); dropTile(peer); });
  function touchSync(i: number) { clearTimeout(timer); timer = window.setTimeout(() => sync(i), 250); }
  function sendAsset(id: string) {
    const doc = getDoc(), a = doc?.assets.find(x => x.id === id); if (!a) return; sentAssets.add(id);
    const s = b64(a.data as Uint8Array), n = Math.ceil(s.length / CH); for (let i = 0; i < n; i++) L.send({ k: 'asset', id, mime: a.mime, i, n, d: s.slice(i * CH, (i + 1) * CH) });
  }
  function sendHb() { const doc = getDoc(); L.send({ k: 'hb', i: cur, n: doc?.pages.length ?? 0, tm: !!tMic, tc: !!tCam }); }
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
  const announce = () => L.send({ k: 'tm', mic: !!tMic, cam: !!tCam });
  const media: TeacherMedia = {
    supported: !!rtc, remote: () => [...streams.values()], mic: () => !!tMic, cam: () => !!tCam, micTrack: () => tMic,
    async setMic(on) { if (!rtc) throw new Error('Bu qurilmada ovoz qo‘llab-quvvatlanmaydi'); if (on) { if (tMic) return; tMic = await getTrack('audio'); rtc.setTrack('audio', tMic); } else { tMic?.stop(); tMic = null; rtc.setTrack('audio', null); } announce(); },
    async setCam(on) { if (!rtc) throw new Error('Bu qurilmada video qo‘llab-quvvatlanmaydi'); if (on) { if (tCam) return; tCam = await getTrack('video'); rtc.setTrack('video', tCam); } else { tCam?.stop(); tCam = null; rtc.setTrack('video', null); } announce(); },
    perm(id, p) { const e = roster.get(id); if (!e) return; if (p.mic !== undefined) e.aMic = p.mic; if (p.cam !== undefined) e.aCam = p.cam; if (p.wr !== undefined) e.aWr = p.wr; sendPerm(e); onRoster(); },
    permAll(p) { if (p.mic !== undefined) defMic = p.mic; if (p.cam !== undefined) defCam = p.cam; if (p.wr !== undefined) defWr = p.wr; for (const e of roster.values()) { if (p.mic !== undefined) e.aMic = p.mic; if (p.cam !== undefined) e.aCam = p.cam; if (p.wr !== undefined) e.aWr = p.wr; sendPerm(e); } onRoster(); },
  };
  const onBtn = (b: PresBtn, view: PresentHandle) => {
    const upd = () => { view.btn('mic', { on: !!tMic }); view.btn('cam', { on: !!tCam }); };
    if (b === 'mic') void media.setMic(!tMic).then(upd, e => view.status((e as Error).message, true)); else if (b === 'cam') void media.setCam(!tCam).then(upd, e => view.status((e as Error).message, true));
  };
  const hooks: PresentHooks = { page: i => sendPage(i), laser: (u, v, on) => L.send({ k: 'laser', u, v, on }), ink: pts => L.send({ k: 'ink', pts }), focus: (u, v) => L.send({ k: 'focus', i: cur, u, v }) };
  sendPage(Math.max(0, Math.min((getDoc()?.pages.length ?? 1) - 1, getIdx())));
  return {
    code, broker: L.broker(), roster: () => [...roster.values()], hooks, media, onBtn, page: () => cur, sendPage, focus(i, u, v) { const t = Date.now(); if (t - lastFocus < 150) return; lastFocus = t; L.send({ k: 'focus', i, u, v }); }, up: () => upNow,
    touch: touchSync,
    end() { if (ended) return; ended = true; clearTimeout(timer); clearInterval(hb); tMic?.stop(); tCam?.stop(); tMic = tCam = null; rtc?.closeAll(); dropAll(); L.send({ k: 'end' }); setTimeout(() => L.close(), 400); },
  };
}

// ---------- O'QUVCHI ----------
export async function joinClass(codeIn: string, name: string, onExit: (why: string) => void): Promise<void> {
  const code = parseCode(codeIn); if (!code) throw new Error('Kod noto‘g‘ri (13 belgi: raqam + 12 harf/raqam)');
  const doc: FurDocument = newDocument('Jonli dars'); doc.pages = []; const parts = new Map<string, { n: number; got: string[]; mime: string }>();
  let view: PresentHandle | null = null, lastHb = Date.now(), cur = 0, ended = false, hand = false, link: Link | null = null, ti = 0, th = 0;
  // ---- ovoz/video (o‘quvchi) ----
  const allow = { mic: false, cam: false, wr: false }, mine: { i: number; id: string }[] = [], on = { mic: false, cam: false }, trk: { mic: MediaStreamTrack | null; cam: MediaStreamTrack | null } = { mic: null, cam: null }; let tStream: MediaStream | null = null, tCam = false, rtc: Peers | null = null, noteT = 0;
  const note = (t: string, bad = true) => { view?.status(t, bad); clearTimeout(noteT); noteT = window.setTimeout(() => view?.status('● Jonli'), 3500); };
  const paintBtns = () => { view?.btn('mic', { on: on.mic, dis: !allow.mic, title: allow.mic ? 'Mikrofon' : 'Mikrofon — ustoz ruxsat bermagan' }); view?.btn('cam', { on: on.cam, dis: !allow.cam, title: allow.cam ? 'Kamera' : 'Kamera — ustoz ruxsat bermagan' }); };
  const reportMedia = () => link?.send({ k: 'sm', mic: on.mic, cam: on.cam });
  const turnOff = (k: 'mic' | 'cam') => { trk[k]?.stop(); trk[k] = null; on[k] = false; rtc?.setTrack(k === 'mic' ? 'audio' : 'video', null); };
  const teacherTile = () => { if (tStream) showTile('teacher', 'Ustoz', tStream, tCam); };
  const toggle = async (k: 'mic' | 'cam') => {
    if (!rtc) return note('Bu qurilmada ovoz/video qo‘llab-quvvatlanmaydi');
    if (!allow[k]) return note(k === 'mic' ? 'Ustoz hali mikrofonga ruxsat bermagan' : 'Ustoz hali kameraga ruxsat bermagan');
    if (on[k]) { turnOff(k); } else { try { const t = await getTrack(k === 'mic' ? 'audio' : 'video'); if (!allow[k]) { t.stop(); return; } trk[k] = t; on[k] = true; rtc.setTrack(k === 'mic' ? 'audio' : 'video', t); } catch (e) { return note((e as Error).message); } }
    paintBtns(); reportMedia();
  };

  const ensure = (n: number) => { while (doc.pages.length < n) { const p = newPage('board'); p.bg = 'white'; doc.pages.push(p); } };
  const missing = (p: FurPage) => assetIds(p).filter(id => !doc.assets.some(a => a.id === id));
  const onMsg = (m: Msg) => {
    lastHb = Date.now(); if (!view) return;
    if (m.k === 'page' && m.page && typeof m.i === 'number') {
      ensure(Math.max(m.n ?? 0, m.i + 1)); doc.pages[m.i] = m.page as FurPage; if (m.layout) doc.layout = m.layout; if (m.title) { doc.title = String(m.title); saveLive({ role: 'student', code, title: doc.title }); } cur = m.i; view.goto(m.i); view.status('● Jonli');
      const need = missing(doc.pages[m.i]); if (need.length) link?.send({ k: 'need', ids: need });
    } else if (m.k === 'ops' && typeof m.i === 'number') {
      const p = doc.pages[m.i]; if (!p || p.type !== 'board') return; const del = new Set<string>(m.del ?? []);
      let objs = p.objects.filter(o => !del.has(o.id)); const upd = new Map<string, FurObject>((m.upd ?? []).map((o: FurObject) => [o.id, o])); objs = objs.map(o => upd.get(o.id) ?? o);
      for (const a of [...(m.add ?? [])].sort((x: any, y: any) => x.at - y.at)) if (!objs.some(o => o.id === a.o.id)) objs.splice(Math.min(a.at, objs.length), 0, a.o);
      p.objects.splice(0, p.objects.length, ...objs); const need = missing(p); if (need.length) link?.send({ k: 'need', ids: need }); if (m.i === cur) view.refresh();
    } else if (m.k === 'asset' && typeof m.id === 'string') {
      let e = parts.get(m.id); if (!e || e.n !== m.n) { e = { n: m.n, got: [], mime: String(m.mime) }; parts.set(m.id, e); } e.got[m.i] = m.d;
      if (e.got.filter(x => x !== undefined).length === e.n && !doc.assets.some(a => a.id === m.id)) { doc.assets.push({ id: m.id, mime: e.mime, data: unb64(e.got.join('')) } as any); parts.delete(m.id); view.refresh(); }
    } else if (m.k === 'focus' && m.i === cur && typeof m.u === 'number' && typeof m.v === 'number') view.focus(m.u, m.v);
    else if (m.k === 'laser') view.laser(m.u, m.v, !!m.on); else if (m.k === 'ink') view.ink(m.pts ?? null);
    else if (m.k === 'rtc') void rtc?.handle(m);
    else if (m.k === 'perm' && m.to === link?.id()) { allow.mic = !!m.mic; allow.cam = !!m.cam; const wasWr = allow.wr; allow.wr = !!m.wr; view?.setWrite(allow.wr); let ch = false; if (!allow.mic && on.mic) { turnOff('mic'); ch = true; } if (!allow.cam && on.cam) { turnOff('cam'); ch = true; } paintBtns(); if (ch) reportMedia(); note(allow.mic || allow.cam || allow.wr ? 'Ustoz ruxsat berdi: ' + [allow.mic ? 'mikrofon' : '', allow.cam ? 'kamera' : '', allow.wr ? 'doskaga yozish' : ''].filter(Boolean).join(', ') : 'Ruxsatlar olindi', false); void wasWr; }
    else if (m.k === 'tm') { tCam = !!m.cam; teacherTile(); }
    else if (m.k === 'hb') { touchLive(); if (m.tc !== undefined && !!m.tc !== tCam) { tCam = !!m.tc; teacherTile(); } ensure(m.n ?? 0); if (m.i !== undefined && m.i >= 0 && m.i !== cur) { cur = m.i; view.goto(m.i); } view.status('● Jonli'); }
    else if (m.k === 'end') { ended = true; clearLive(); view.status('Dars tugadi', true); }
  };
  saveLive({ role: 'student', code, name, srv: customBroker() });
  link = await openLink(code, orderFor(Number(code[0])), onMsg, up => { if (!view) return; view.status(up ? '● Jonli' : 'Aloqa uzildi…', !up); if (up) link?.send({ k: 'hello', name, first: true }); });
  const finish = (why: string) => { clearInterval(ti); clearInterval(th); turnOff('mic'); turnOff('cam'); rtc?.closeAll(); dropAll(); if (!ended) link?.send({ k: 'bye' }); setTimeout(() => link?.close(), 300); onExit(why); };
  doc.pages = []; ensure(1);
  if (rtcSupported()) rtc = new Peers(() => link!.id(), m => link?.send(m), (_p, st) => { tStream = st; teacherTile(); }, () => { dropTile('teacher'); tStream = null; });
  view = startPresentation(doc, 0, () => finish('exit'), { controlled: true, media: !!rtc, onWrite: o => { const p = doc.pages[cur]; if (!p || p.type !== 'board' || !allow.wr) return; p.objects.push(o); mine.push({ i: cur, id: o.id }); if (mine.length > 100) mine.shift(); link?.send({ k: 'sw', i: cur, o }); view?.refresh(); }, onWriteUndo: () => { const k = mine.map(x => x.i).lastIndexOf(cur); if (k < 0) return note('Qaytariladigan chizma yo‘q'); const [x] = mine.splice(k, 1), p = doc.pages[x.i]; const j = p ? p.objects.findIndex(o => o.id === x.id) : -1; if (j >= 0) p!.objects.splice(j, 1); link?.send({ k: 'su', i: x.i, id: x.id }); view?.refresh(); }, onBtn: b => { if (b === 'mic' || b === 'cam') void toggle(b); }, onHand: () => { hand = !hand; link?.send({ k: 'hand', name, up: hand }); view?.hand(hand); } }); paintBtns();
  view.status('Ustoz kutilmoqda…');
  link.send({ k: 'hello', name, first: true });
  ti = window.setInterval(() => link?.send({ k: 'hello', name }), 8000);
  th = window.setInterval(() => { if (!ended && Date.now() - lastHb > 14000) view?.status('Ustoz ulanishi yo‘q', true); }, 3000);
}
