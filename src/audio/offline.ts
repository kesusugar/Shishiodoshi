import { SIM_DT } from '../sim/fixedStep';
import { ShishiodoshiSim } from '../sim/shishiodoshi';
import type { SimEvent } from '../sim/events';
import { AudioEngine } from './engine';

/**
 * Render the sound of a fresh simulation without a speaker (PLAN.md 7章, verification): the
 * simulation is fast-forwarded silently by `start` seconds, then `seconds` of it are rendered in an
 * OfflineAudioContext, pausing every 1/60 s to feed it, exactly as the live page does. Returns a
 * 16-bit stereo WAV.
 */
export async function renderOffline(seconds: number, start = 0, sampleRate = 48000): Promise<ArrayBuffer> {
  const sim = new ShishiodoshiSim();
  for (let t = 0; t < start; t += SIM_DT) sim.step(SIM_DT);
  sim.drainEvents();
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const engine = await AudioEngine.create(ctx);
  const frame = 1 / 60;
  const offset = -sim.state.time; // audio time = sim time - start
  // before each frame's audio, step the simulation through that frame and send what happened
  const feed = (k: number) => {
    const until = start + (k + 1) * frame;
    const events: SimEvent[] = [];
    while (sim.state.time < until) {
      sim.step(SIM_DT);
      events.push(...sim.drainEvents());
    }
    engine.send(sim, events, sim.state.time, offset);
  };
  feed(0);
  const frames = Math.floor(seconds / frame);
  for (let k = 1; k < frames; k++) {
    void ctx.suspend(k * frame).then(() => {
      feed(k);
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  return encodeWav(buf);
}

function encodeWav(buf: AudioBuffer): ArrayBuffer {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(44 + (i * ch + c) * 2, v * 32767, true);
    }
  }
  return out.buffer;
}
