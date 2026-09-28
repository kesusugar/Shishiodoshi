// Screenshot each camera preset into tools/out/ and fail on any console / shader error.
//
//   node tools/shot.mjs                  # system Edge with the real GPU
//   node tools/shot.mjs --swiftshader    # no-GPU machines (software WebGL)
//   node tools/shot.mjs --views=main --width=1920 --height=1080 --headed
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { openApp, outDir, parseArgs } from './lib/harness.mjs';

const args = parseArgs();
const views = String(args.views ?? 'main,close,wide').split(',');

await mkdir(outDir, { recursive: true });
const app = await openApp({
  swiftshader: !!args.swiftshader,
  headed: !!args.headed,
  width: Number(args.width ?? 1600),
  height: Number(args.height ?? 900),
});

let failed = false;
try {
  for (const view of views) {
    const probe = await app.load(`view=${view}`);
    await app.frames(10); // let shadows and damping settle
    const file = path.join(outDir, `shot-${view}.png`);
    await app.page.screenshot({ path: file });
    console.log(`${view}: ${path.relative(process.cwd(), file)}  (GPU: ${probe.gpu})`);
  }
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
