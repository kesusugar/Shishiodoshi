// Render the sound offline and draw its spectrogram (PLAN.md 7章, verification).
//
//   node tools/audio.mjs [--seconds=10] [--start=15] [--season=spring|summer|autumn|winter] [--time=day|dusk|night] [--name=audio]
//                                                        -> tools/out/<name>.wav, tools/out/<name>-spec.png
//
// The page runs a fresh simulation, fast-forwards it silently by `start` seconds, then renders
// `seconds` of sound in an OfflineAudioContext with the same synthesiser the live page uses.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { openApp, outDir, parseArgs } from './lib/harness.mjs';

const args = parseArgs();
const seconds = Number(args.seconds ?? 10);
const start = Number(args.start ?? 15);
const name = String(args.name ?? 'audio');

await mkdir(outDir, { recursive: true });
const app = await openApp({ swiftshader: !!args.swiftshader });
let wav;
try {
  await app.load([args.season && `season=${args.season}`, args.time && `time=${args.time}`].filter(Boolean).join('&'));
  const b64 = await app.page.evaluate(([s, t]) => window.__shishi.inspect.renderAudio(s, t), [seconds, start]);
  wav = Buffer.from(b64, 'base64');
} finally {
  await app.close();
}
if (app.errors.length) {
  console.error(app.errors.join('\n'));
  process.exit(1);
}
const wavPath = path.join(outDir, `${name}.wav`);
await writeFile(wavPath, wav);

// ---- decode (16-bit stereo) to mono float
const sr = wav.readUInt32LE(24), ch = wav.readUInt16LE(22);
const n = (wav.length - 44) / (2 * ch);
const x = new Float32Array(n);
let peak = 0, sumsq = 0;
for (let i = 0; i < n; i++) {
  let v = 0;
  for (let c = 0; c < ch; c++) v += wav.readInt16LE(44 + (i * ch + c) * 2) / 32768;
  x[i] = v / ch;
  peak = Math.max(peak, Math.abs(x[i]));
  sumsq += x[i] * x[i];
}

// ---- spectrogram: Hann-windowed FFT, log frequency axis 60 Hz .. 12 kHz, dB colour
const N = 2048, hop = 256;
const cols = Math.floor((n - N) / hop);
const rows = 360;
const fMin = 60, fMax = 12000;
const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
const re = new Float32Array(N), im = new Float32Array(N);
function fft() {
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}
const W = cols, H = rows + 40; // + a waveform strip
const img = Buffer.alloc(W * H * 3);
const colour = (t) => {
  // dark blue -> purple -> orange -> yellow
  const c = [[0, 0, 12], [60, 10, 110], [190, 40, 90], [250, 140, 30], [255, 250, 180]];
  const s = Math.max(0, Math.min(1, t)) * (c.length - 1), i = Math.min(c.length - 2, Math.floor(s)), f = s - i;
  return c[i].map((v, k) => v + (c[i + 1][k] - v) * f);
};
for (let col = 0; col < cols; col++) {
  for (let i = 0; i < N; i++) { re[i] = x[col * hop + i] * win[i]; im[i] = 0; }
  fft();
  for (let r = 0; r < rows; r++) {
    const f = fMin * Math.pow(fMax / fMin, (rows - 1 - r) / (rows - 1));
    const bin = Math.round((f / sr) * N);
    const mag = Math.hypot(re[bin], im[bin]) / (N / 4);
    const db = 20 * Math.log10(mag + 1e-9);
    const rgb = colour((db + 90) / 80);
    const o = (r * W + col) * 3;
    img[o] = rgb[0]; img[o + 1] = rgb[1]; img[o + 2] = rgb[2];
  }
  // waveform strip: peak of this column
  let pk = 0;
  for (let i = 0; i < hop; i++) pk = Math.max(pk, Math.abs(x[col * hop + i]));
  const h = Math.round(pk * 38);
  for (let r = 0; r < 40; r++) {
    const o = ((rows + r) * W + col) * 3;
    const on = 39 - r < h;
    img[o] = on ? 120 : 10; img[o + 1] = on ? 200 : 10; img[o + 2] = on ? 255 : 14;
  }
}
// frequency grid lines (100 Hz, 1 kHz, 10 kHz) and 1 s ticks
for (const f of [100, 1000, 10000]) {
  const r = Math.round((rows - 1) * (1 - Math.log(f / fMin) / Math.log(fMax / fMin)));
  for (let c = 0; c < W; c += 4) { const o = (r * W + c) * 3; img[o] = img[o + 1] = img[o + 2] = 200; }
}
for (let s = 1; s * sr / hop < W; s++) {
  const c = Math.round((s * sr) / hop);
  for (let r = 0; r < rows; r += 6) { const o = (r * W + c) * 3; img[o] = img[o + 1] = img[o + 2] = 140; }
}

// ---- PNG
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let r = 0; r < H; r++) { raw[r * (W * 3 + 1)] = 0; img.copy(raw, r * (W * 3 + 1) + 1, r * W * 3, (r + 1) * W * 3); }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const pngPath = path.join(outDir, `${name}-spec.png`);
await writeFile(pngPath, png);
console.log(`${path.relative(process.cwd(), wavPath)}  ${seconds}s from sim t=${start}s  peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS  rms ${(10 * Math.log10(sumsq / n)).toFixed(1)} dBFS`);
console.log(`${path.relative(process.cwd(), pngPath)}  (log frequency 60 Hz-12 kHz, grid at 100 Hz / 1 kHz / 10 kHz, ticks every 1 s)`);
