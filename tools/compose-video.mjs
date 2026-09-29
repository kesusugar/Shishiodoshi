// Put recorded clips together into one film (H.264 + AAC, ready for X / social media).
//
//   node tools/compose-video.mjs tools/video/proof.json
//     -> tools/out/video/<output>.mp4
//
// Needs ffmpeg with libx264 and aac: `pip install imageio-ffmpeg` (its binary is found by itself), or
// set FFMPEG=/path/to/ffmpeg. Film (JSON):
//   { output, width, height, fps, crossfade,
//     segments: [ { clip, soundRate, caption: { text, style, from, to } } ] }
//   clip       a name recorded with tools/record.mjs (frames + <name>.wav)
//   soundRate  1 = the sound as it is; 0.2 = slowed to a fifth (a slow-motion clip): the pitch falls by
//              an octave and the rest of the slowing is time-stretched, so a hit stays a "kon"
//   caption    text laid over the clip between `from` and `to` (film seconds of the clip), faded in and
//              out; style: "title" (large, lower centre), "label" (small box, top left), "note" (lower left)
import { execFileSync, execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { outDir } from './lib/harness.mjs';

const film = JSON.parse(await readFile(process.argv[2], 'utf8'));
const { output, width = 1280, height = 720, fps = 30, crossfade = 0.4, segments } = film;
const vdir = path.join(outDir, 'video');
await mkdir(vdir, { recursive: true });

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    return execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"', { encoding: 'utf8' }).trim();
  } catch {
    return 'ffmpeg';
  }
}
const ffmpeg = ffmpegPath();
const run = (args) => execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

// ---- captions as transparent pictures (ffmpeg here has no text filter)
const STYLES = {
  title: 'left:0;right:0;bottom:11%;text-align:center;font-size:66px;letter-spacing:0.28em;font-family:IPAPGothic,IPAGothic,WenQuanYi Zen Hei,sans-serif;text-shadow:0 2px 14px rgba(0,0,0,.75)',
  label: 'left:3.2%;top:5%;font-size:48px;padding:6px 20px;background:rgba(0,0,0,.45);border-radius:6px;font-family:IPAPGothic,IPAGothic,WenQuanYi Zen Hei,sans-serif',
  note: 'left:4%;bottom:8%;font-size:34px;letter-spacing:0.08em;font-family:IPAPGothic,IPAGothic,WenQuanYi Zen Hei,sans-serif;text-shadow:0 2px 10px rgba(0,0,0,.8)',
};
async function captionPng(text, style, file) {
  const browser = await chromium.launch({ ...(process.env.SHISHI_BROWSER ? { executablePath: process.env.SHISHI_BROWSER } : { channel: 'msedge' }) });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<body style="margin:0;background:transparent;width:${width}px;height:${height}px;color:#fff"><div style="position:absolute;${STYLES[style] ?? STYLES.title}">${text}</div></body>`);
  await page.screenshot({ path: file, omitBackground: true });
  await browser.close();
}

// Slow the sound to `rate` of its speed: first as tape does (the pitch falls, at most an octave), the
// rest by time-stretching (which keeps the pitch), so a hit stays a knock and not a rumble.
function slowFilter(rate) {
  const tape = Math.max(0.5, Math.sqrt(rate));
  let rest = rate / tape;
  const tempos = [];
  while (rest < 0.5) {
    tempos.push(0.5);
    rest /= 0.5;
  }
  tempos.push(rest);
  return `asetrate=${Math.round(48000 * tape)},aresample=48000,${tempos.map((t) => `atempo=${t.toFixed(4)}`).join(',')}`;
}

// ---- one mp4 per segment (frames + its sound), captions laid on
const parts = [];
for (const [i, seg] of segments.entries()) {
  const dir = path.join(vdir, seg.clip);
  const wav = path.join(vdir, `${seg.clip}.wav`);
  const out = path.join(vdir, `${output}-part${i}.mp4`);
  const rate = seg.soundRate ?? 1;
  const inputs = ['-framerate', String(fps), '-i', path.join(dir, 'frame-%05d.jpg'), '-i', wav];
  const afilter = rate === 1 ? 'anull' : slowFilter(rate);
  let vfilter = `[0:v]scale=${width}:${height},format=yuv420p[v0]`;
  const cap = seg.caption;
  if (cap) {
    const png = path.join(vdir, `${output}-cap${i}.png`);
    await captionPng(cap.text, cap.style ?? 'title', png);
    inputs.push('-loop', '1', '-framerate', String(fps), '-i', png);
    const f = 0.35;
    vfilter += `;[2:v]format=rgba,fade=t=in:st=${cap.from}:d=${f}:alpha=1,fade=t=out:st=${cap.to - f}:d=${f}:alpha=1[c];[v0][c]overlay=shortest=1,format=yuv420p[v0]`;
  }
  run([...inputs, '-filter_complex', `${vfilter};[1:a]${afilter},aformat=sample_rates=48000:channel_layouts=stereo[a0]`, '-map', '[v0]', '-map', '[a0]', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-r', String(fps), '-c:a', 'aac', '-b:a', '192k', '-shortest', out]);
  parts.push(out);
}

// ---- join with cross-fades (picture and sound)
function probeDuration(file) {
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-i', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(String(e.stderr));
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return 0;
}
const final = path.join(vdir, `${output}.mp4`);
if (parts.length === 1) {
  run(['-i', parts[0], '-c', 'copy', final]);
} else {
  const lens = parts.map(probeDuration);
  let vchain = '[0:v]';
  let achain = '[0:a]';
  let acc = lens[0];
  const filters = [];
  for (let i = 1; i < parts.length; i++) {
    const last = i === parts.length - 1;
    filters.push(`${vchain}[${i}:v]xfade=transition=fade:duration=${crossfade}:offset=${(acc - crossfade).toFixed(3)}[${last ? 'v' : `v${i}`}]`);
    filters.push(`${achain}[${i}:a]acrossfade=d=${crossfade}[${last ? 'a' : `a${i}`}]`);
    vchain = `[v${i}]`;
    achain = `[a${i}]`;
    acc += lens[i] - crossfade;
  }
  run([...parts.flatMap((p) => ['-i', p]), '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final]);
}
await writeFile(path.join(vdir, `${output}.txt`), `${film.output}: ${parts.length} segments\n`);
console.log(`wrote ${path.relative(process.cwd(), final)} (${probeDuration(final).toFixed(1)} s)`);
