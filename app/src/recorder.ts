// Darsni yozib olish: faqat taqdimot sahifasining o‘zi (chizish, lazer, zoom bilan) + ustoz mikrofoni.
// Telefon ekrani yozilmaydi — kadrlar ilovaning o‘z ichidan canvas'ga chiziladi, shuning uchun boshqa ilovalar/qidiruv tushmaydi.
import { PresentHandle } from './present';
import { getTrack } from './rtc';

export interface Rec { stop(): Promise<{ blob: Blob; mime: string; ms: number; audio: boolean }>; pause(): void; resume(): void; paused(): boolean; elapsed(): number; audio: boolean }

const MIMES = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
export const recSupported = () => typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;

export async function startRecorder(view: PresentHandle, micTrack?: MediaStreamTrack | null): Promise<Rec> {
  if (!recSupported()) throw new Error('Bu qurilmada yozib olish qo‘llab-quvvatlanmaydi');
  const [sw, sh] = view.viewSize(), W = Math.max(320, Math.min(1280, sw)) & ~1, H = Math.max(180, Math.round(W * sh / Math.max(1, sw))) & ~1;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d')!;
  let own: MediaStreamTrack | null = null, audio = false; const tracks: MediaStreamTrack[] = [];
  const mt = micTrack && micTrack.readyState === 'live' ? micTrack.clone() : (own = await getTrack('audio').catch(() => null));
  if (mt) { tracks.push(mt); audio = true; }
  view.frame(g, W, H); const vs = cv.captureStream(15); tracks.unshift(vs.getVideoTracks()[0]);
  const mime = MIMES.find(m => MediaRecorder.isTypeSupported(m)) ?? '';
  const mr = new MediaRecorder(new MediaStream(tracks), { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 900_000, audioBitsPerSecond: 64_000 });
  const chunks: Blob[] = []; mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const pump = window.setInterval(() => { if (mr.state === 'recording') view.frame(g, W, H); }, 66);
  let acc = 0, t0 = Date.now(), paused = false;
  mr.start(4000);
  return {
    audio, paused: () => paused, elapsed: () => acc + (paused ? 0 : Date.now() - t0),
    pause() { if (paused || mr.state !== 'recording') return; mr.pause(); acc += Date.now() - t0; paused = true; },
    resume() { if (!paused) return; mr.resume(); t0 = Date.now(); paused = false; },
    stop() {
      return new Promise(res => {
        const ms = acc + (paused ? 0 : Date.now() - t0); clearInterval(pump);
        mr.onstop = () => { tracks.forEach(t => t.stop()); own?.stop(); view.stopFrames(); res({ blob: new Blob(chunks, { type: mr.mimeType || mime || 'video/webm' }), mime: mr.mimeType || mime || 'video/webm', ms, audio }); };
        if (mr.state === 'inactive') mr.onstop(new Event('stop')); else mr.stop();
      });
    },
  };
}
