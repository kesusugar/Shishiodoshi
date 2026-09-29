// Record one clip frame by frame (the cloud machine has no GPU, so nothing is real time): the page
// runs in ?manual mode and is advanced by exactly one film frame at a time.
//
//   node tools/record.mjs tools/video/hit.json [--frames=N]      (N: only the first N frames, to try)
//     -> tools/out/video/<name>/frame-00001.jpg ... and <name>.wav (the sound of the same moment)
//
// A clip (JSON): { name, width, height, fps, seconds, season, start, flow, speed, camera: [...] }
//   start   simulation time (s) the clip starts at (the world is run silently up to it first)
//   flow    the kakei's flow (mL/s); speed  simulated seconds per film second (1 = real time, 0.2 = slow motion)
//   camera  keyframes { t, position: [x,y,z], target: [x,y,z], fov } (t in film seconds, eased between)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openApp, outDir, parseArgs } from './lib/harness.mjs';

const args = parseArgs();
const spec = JSON.parse(await readFile(process.argv[2], 'utf8'));
const { name, width = 1280, height = 720, fps = 30, seconds, season = 'summer', start = 0, flow, speed = 1, camera } = spec;
const total = args.frames ? Math.min(Number(args.frames), Math.round(seconds * fps)) : Math.round(seconds * fps);
const dir = path.join(outDir, 'video', name);
await mkdir(dir, { recursive: true });

const ease = (x) => x * x * (3 - 2 * x);
function cameraAt(t) {
  const k = camera;
  if (t <= k[0].t) return k[0];
  for (let i = 0; i < k.length - 1; i++) {
    if (t <= k[i + 1].t) {
      const u = ease((t - k[i].t) / (k[i + 1].t - k[i].t));
      const mix = (a, b) => a.map((v, j) => v + (b[j] - v) * u);
      return { position: mix(k[i].position, k[i + 1].position), target: mix(k[i].target, k[i + 1].target), fov: k[i].fov + (k[i + 1].fov - k[i].fov) * u };
    }
  }
  return k.at(-1);
}

const app = await openApp({ swiftshader: !!args.swiftshader, width, height });
try {
  await app.load(`manual&season=${season}&t=${start}${flow ? `&flow=${flow}` : ''}`);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const c = cameraAt(i / fps);
    const url = await app.page.evaluate(
      ([cam, dt]) => {
        window.__shishi.inspect.setCamera(cam.position, cam.target, cam.fov);
        return window.__shishi.inspect.advance(dt, 0.95);
      },
      [c, speed / fps],
    );
    await writeFile(path.join(dir, `frame-${String(i + 1).padStart(5, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    if (i % 10 === 9 || i === total - 1) console.log(`${name}: ${i + 1}/${total} frames, ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)} s/frame`);
  }
  if (!args.frames) {
    // the sound of the same stretch of simulated time (real time; a slow-motion clip stretches it afterwards)
    const b64 = await app.page.evaluate(([sec, st, fl]) => window.__shishi.inspect.renderAudio(sec, st, fl), [seconds * speed, start, flow]);
    await writeFile(path.join(outDir, 'video', `${name}.wav`), Buffer.from(b64, 'base64'));
    console.log(`${name}: sound written (${(seconds * speed).toFixed(2)} s of simulation)`);
  }
} finally {
  await app.close();
}
if (app.errors.length) console.error(app.errors.join('\n'));
