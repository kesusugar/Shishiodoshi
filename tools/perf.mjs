// Measure frame rate over a few seconds and report frame-time percentiles.
// Headless Edge still uses the real GPU; pass --headed to measure in a visible window.
//
//   node tools/perf.mjs [--seconds=5] [--view=ref1] [--width=1920 --height=1080] [--headed] [--swiftshader]
import { openApp, parseArgs } from './lib/harness.mjs';

const args = parseArgs();
const seconds = Number(args.seconds ?? 5);

const app = await openApp({
  swiftshader: !!args.swiftshader,
  headed: !!args.headed,
  width: Number(args.width ?? 1920),
  height: Number(args.height ?? 1080),
});

let failed = false;
try {
  const probe = await app.load(`view=${args.view ?? 'ref1'}`);
  await app.frames(30); // warm up (shader compile, shadow maps)
  const times = await app.page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const out = [];
        let last = performance.now();
        const end = last + ms;
        const tick = (t) => {
          out.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
  const sorted = [...times].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  const total = times.reduce((a, b) => a + b, 0);
  console.log(`GPU:        ${probe.gpu}`);
  console.log(`frames:     ${times.length} in ${(total / 1000).toFixed(2)} s`);
  console.log(`mean fps:   ${((times.length * 1000) / total).toFixed(1)}`);
  console.log(`frame ms:   p50 ${pct(50).toFixed(2)}  p95 ${pct(95).toFixed(2)}  p99 ${pct(99).toFixed(2)}  max ${sorted.at(-1).toFixed(2)}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  failed = true;
} finally {
  await app.close();
}

if (app.errors.length) {
  console.error(`\n${app.errors.length} console error(s):`);
  for (const e of app.errors) console.error(`  ${e}`);
  failed = true;
}
process.exit(failed ? 1 : 0);
