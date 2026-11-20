// Darsni yozib olish: o‘quvchilar ko‘rgan sahifa (qalam, lazer, tahrir bilan) + ovoz (ustoz, ixtiyoriy o‘quvchilar).
// Telefon ekrani yozilmaydi — kadrlar ilovaning o‘z ichidan canvas'ga chiziladi, shuning uchun boshqa ilovalar/qidiruv tushmaydi.
// Yozuv UI'dan (taqdimot/tahrirlash) mustaqil: kadr manbasi va ovoz manbalari funksiyalar orqali beriladi.
import { getTrack } from './rtc';

export interface Rec { stop(): Promise<{ blob: Blob; mime: string; ms: number; audio: boolean }>; pause(): void; resume(): void; paused(): boolean; elapsed(): number; audio: boolean }
export interface RecSource {
  /** Joriy kadrni W×H canvas'ga chizadi */
  frame(g: CanvasRenderingContext2D, W: number, H: number): void;
  /** Ustoz mikrofoni: jonli darsda — ustoz yoqqan trek (o‘chiq bo‘lsa null); yakka yozuvda undefined (yozuv o‘zi ochadi) */
  mic?: () => MediaStreamTrack | null;
  /** Jonli darsda o‘quvchilardan kelayotgan oqimlar */
  students?: () => MediaStream[];
  includeStudents?: () => boolean;
  /** Mikrofonni yozuv o‘zi ochsinmi (jonli dars bo‘lmaganda) */
  ownMic: boolean;
  onStop?: () => void;
}

const MIMES = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
export const recSupported = () => typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
export const REC_W = 1280, REC_H = 720;

export async function startRecorder(src: RecSource): Promise<Rec> {
  if (!recSupported()) throw new Error('Bu qurilmada yozib olish qo‘llab-quvvatlanmaydi');
  const cv = document.createElement('canvas'); cv.width = REC_W; cv.height = REC_H; const g = cv.getContext('2d')!;
  src.frame(g, REC_W, REC_H); const vs = cv.captureStream(15); const tracks: MediaStreamTrack[] = [vs.getVideoTracks()[0]];
  // ---- ovoz: WebAudio aralashtirgich (ustoz + o‘quvchilar) ----
  const AC: typeof AudioContext | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  let ac: AudioContext | null = null, dest: MediaStreamAudioDestinationNode | null = null, own: MediaStreamTrack | null = null, audio = false; const nodes = new Map<string, MediaStreamAudioSourceNode>();
  if (AC) {
    try { ac = new AC(); void ac.resume(); dest = ac.createMediaStreamDestination(); } catch { ac = null; }
    if (ac && src.ownMic) own = await getTrack('audio').catch(() => null);
    if (ac && dest) {
      const sync = () => {
        if (!ac || !dest) return; const want = new Map<string, MediaStreamTrack>();
        const add = (t: MediaStreamTrack | null | undefined, k: string) => { if (t && t.readyState === 'live' && t.kind === 'audio') want.set(k + t.id, t); };
        add(own, 'o'); add(src.mic?.(), 'm'); if (src.includeStudents?.() ?? true) for (const s of src.students?.() ?? []) for (const t of s.getAudioTracks()) add(t, 's');
        for (const [k, n] of nodes) if (!want.has(k)) { try { n.disconnect(); } catch { /* */ } nodes.delete(k); }
        for (const [k, t] of want) if (!nodes.has(k)) { try { const n = ac.createMediaStreamSource(new MediaStream([t])); n.connect(dest); nodes.set(k, n); } catch { /* */ } }
      };
      sync(); (dest as unknown as { _t: number })._t = window.setInterval(sync, 1200);
      tracks.push(dest.stream.getAudioTracks()[0]); audio = true;
    }
  }
  const mime = MIMES.find(m => MediaRecorder.isTypeSupported(m)) ?? '';
  const mr = new MediaRecorder(new MediaStream(tracks), { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 900_000, audioBitsPerSecond: 64_000 });
  const chunks: Blob[] = []; mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const pump = window.setInterval(() => { if (mr.state === 'recording') src.frame(g, REC_W, REC_H); }, 66);
  let acc = 0, t0 = Date.now(), paused = false;
  mr.start(4000);
  return {
    audio, paused: () => paused, elapsed: () => acc + (paused ? 0 : Date.now() - t0),
    pause() { if (paused || mr.state !== 'recording') return; mr.pause(); acc += Date.now() - t0; paused = true; },
    resume() { if (!paused) return; mr.resume(); t0 = Date.now(); paused = false; },
    stop() {
      return new Promise(res => {
        const ms = acc + (paused ? 0 : Date.now() - t0); clearInterval(pump); if (dest) clearInterval((dest as unknown as { _t: number })._t);
        const fin = () => { tracks.forEach(t => t.stop()); own?.stop(); for (const n of nodes.values()) { try { n.disconnect(); } catch { /* */ } } void ac?.close().catch(() => { /* */ }); src.onStop?.(); res({ blob: new Blob(chunks, { type: mr.mimeType || mime || 'video/webm' }), mime: mr.mimeType || mime || 'video/webm', ms, audio }); };
        if (mr.state === 'inactive') fin(); else { mr.onstop = fin; mr.stop(); }
      });
    },
  };
}
