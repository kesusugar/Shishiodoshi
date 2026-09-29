// Shoot the four seasons from the same camera and lay them out 2 x 2 (春 夏 / 秋 冬), like
// docs/reference/ref4-four-seasons.webp, so they can be compared with it side by side.
//
//   node tools/seasons-sheet.mjs [--view=seasons] [--at=10] [--seasons=spring,summer,autumn,winter]
//                                [--width=800 --height=480]
//   -> tools/out/seasons-sheet.png (and tools/out/season-<name>.png for each)
//
// A season that does not exist yet is skipped (and left blank in the sheet).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openApp, outDir, parseArgs } from './lib/harness.mjs';

const args = parseArgs();
const view = String(args.view ?? 'seasons');
const at = String(args.at ?? 10);
const width = Number(args.width ?? 800);
const height = Number(args.height ?? 480);
const wanted = String(args.seasons ?? 'spring,summer,autumn,winter').split(',');
const LABEL = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

await mkdir(outDir, { recursive: true });
const shots = {};
for (const name of wanted) {
  const app = await openApp({ swiftshader: !!args.swiftshader, headed: !!args.headed, width, height });
  try {
    const probe = await app.load(`view=${view}&season=${name}&at=${at}`);
    if (probe.season !== name) {
      console.log(`${name}: not available yet (page used ${probe.season})`);
      continue;
    }
    await app.page.waitForFunction(() => window.__shishi.frozen, null, { timeout: 180_000 });
    await app.frames(3);
    const file = path.join(outDir, `season-${name}.png`);
    await app.page.screenshot({ path: file });
    shots[name] = file;
    console.log(`${name}: ${path.relative(process.cwd(), file)}`);
  } finally {
    await app.close();
  }
  if (app.errors.length) console.error(`${name}: ${app.errors.join('\n')}`);
}

// compose 2 x 2 in a plain page's canvas
const order = ['spring', 'summer', 'autumn', 'winter'];
const images = {};
for (const [name, file] of Object.entries(shots)) images[name] = `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
const app = await openApp({ width: 400, height: 300 });
try {
  const url = await app.page.evaluate(
    async ([images, order, labels, w, h]) => {
      const c = document.createElement('canvas');
      c.width = w * 2;
      c.height = h * 2;
      const g = c.getContext('2d');
      g.fillStyle = '#111';
      g.fillRect(0, 0, c.width, c.height);
      for (const [i, name] of order.entries()) {
        if (!images[name]) continue;
        const img = new Image();
        img.src = images[name];
        await img.decode();
        const x = (i % 2) * w, y = Math.floor(i / 2) * h;
        g.drawImage(img, x, y, w, h);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(x + 8, y + 8, 56, 56);
        g.fillStyle = '#fff';
        g.font = '40px sans-serif';
        g.fillText(labels[name], x + 16, y + 52);
      }
      return c.toDataURL('image/png');
    },
    [images, order, LABEL, width, height],
  );
  await writeFile(path.join(outDir, 'seasons-sheet.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('tools/out/seasons-sheet.png');
} finally {
  await app.close();
}
