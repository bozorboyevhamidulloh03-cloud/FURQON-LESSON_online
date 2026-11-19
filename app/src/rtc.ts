// Ovoz/video: ustoz ↔ har bir o‘quvchi o‘rtasida WebRTC. Signal (offer/answer/ICE) shifrlangan dars kanali orqali.
// Ustoz doim "offer" yuboradi; har ikki tomonda audio+video transceiver sendrecv, trek replaceTrack bilan qo‘yiladi/olinadi —
// shuning uchun qayta kelishuv (renegotiation) kerak emas.
import { Msg } from './room';

const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
export const rtcSupported = (): boolean => typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

interface Ent { pc: RTCPeerConnection; aT?: RTCRtpTransceiver; vT?: RTCRtpTransceiver; pend: RTCIceCandidateInit[]; hasRemote: boolean; stream: MediaStream }

export class Peers {
  private m = new Map<string, Ent>(); private tr: Record<'audio' | 'video', MediaStreamTrack | null> = { audio: null, video: null };
  constructor(private me: () => string, private send: (m: Msg) => void, private onStream: (peer: string, s: MediaStream) => void, private onGone: (peer: string) => void) { }

  setTrack(kind: 'audio' | 'video', t: MediaStreamTrack | null) { this.tr[kind] = t; for (const e of this.m.values()) { const x = kind === 'audio' ? e.aT : e.vT; void x?.sender.replaceTrack(t).catch(() => { /* */ }); } }
  private make(peer: string): Ent {
    this.close(peer); const pc = new RTCPeerConnection(ICE), e: Ent = { pc, pend: [], hasRemote: false, stream: new MediaStream() }; this.m.set(peer, e);
    pc.onicecandidate = ev => { if (ev.candidate) this.send({ k: 'rtc', to: peer, ice: ev.candidate.toJSON() }); };
    pc.ontrack = ev => { if (!e.stream.getTracks().includes(ev.track)) e.stream.addTrack(ev.track); this.onStream(peer, e.stream); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { if (this.m.get(peer) === e) { this.m.delete(peer); this.onGone(peer); } } };
    return e;
  }
  /** Ustoz tomoni: o‘quvchiga qo‘ng‘iroq (offer). */
  async call(peer: string) {
    const e = this.make(peer), pc = e.pc; e.aT = pc.addTransceiver('audio', { direction: 'sendrecv' }); e.vT = pc.addTransceiver('video', { direction: 'sendrecv' });
    if (this.tr.audio) void e.aT.sender.replaceTrack(this.tr.audio); if (this.tr.video) void e.vT.sender.replaceTrack(this.tr.video);
    await pc.setLocalDescription(await pc.createOffer()); this.send({ k: 'rtc', to: peer, sdp: pc.localDescription!.toJSON() });
  }
  async handle(m: Msg) {
    if (m.to !== this.me() || typeof m.f !== 'string') return; const peer = m.f as string;
    try {
      if (m.sdp) {
        if (m.sdp.type === 'offer') {
          const e = this.make(peer), pc = e.pc; await pc.setRemoteDescription(m.sdp); e.hasRemote = true;
          for (const t of pc.getTransceivers()) { t.direction = 'sendrecv'; if (t.receiver.track.kind === 'audio') { e.aT = t; if (this.tr.audio) void t.sender.replaceTrack(this.tr.audio); } else { e.vT = t; if (this.tr.video) void t.sender.replaceTrack(this.tr.video); } }
          for (const c of e.pend.splice(0)) await pc.addIceCandidate(c).catch(() => { /* */ });
          await pc.setLocalDescription(await pc.createAnswer()); this.send({ k: 'rtc', to: peer, sdp: pc.localDescription!.toJSON() });
        } else { const e = this.m.get(peer); if (!e) return; await e.pc.setRemoteDescription(m.sdp); e.hasRemote = true; for (const c of e.pend.splice(0)) await e.pc.addIceCandidate(c).catch(() => { /* */ }); }
      } else if (m.ice) { const e = this.m.get(peer); if (!e) return; if (e.hasRemote) await e.pc.addIceCandidate(m.ice).catch(() => { /* */ }); else e.pend.push(m.ice); }
    } catch { /* buzilgan signal — e'tiborsiz */ }
  }
  has(peer: string) { return this.m.has(peer); }
  close(peer: string) { const e = this.m.get(peer); if (!e) return; this.m.delete(peer); try { e.pc.close(); } catch { /* */ } }
  closeAll() { for (const k of [...this.m.keys()]) this.close(k); }
}

/** Mikrofon/kamera trekini oladi. Xato bo‘lsa o‘zbekcha matn bilan tashlaydi. */
export async function getTrack(kind: 'audio' | 'video'): Promise<MediaStreamTrack> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Bu qurilmada mikrofon/kamera mavjud emas (yoki xavfsiz ulanish emas)');
  try {
    const s = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } } : { video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 }, facingMode: 'user' } });
    return s.getTracks()[0];
  } catch (e) { const n = (e as DOMException).name; throw new Error(n === 'NotAllowedError' || n === 'SecurityError' ? (kind === 'audio' ? 'Mikrofonga ruxsat berilmadi (ilova yangi bo‘lmasligi mumkin — APK ni yangilang)' : 'Kameraga ruxsat berilmadi (ilova yangi bo‘lmasligi mumkin — APK ni yangilang)') : n === 'NotFoundError' ? (kind === 'audio' ? 'Mikrofon topilmadi' : 'Kamera topilmadi') : 'Ochib bo‘lmadi: ' + (e as Error).message); }
}
