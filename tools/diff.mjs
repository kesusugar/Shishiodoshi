// Compare two screenshots pixel by pixel: node tools/diff.mjs a.png b.png [--out=diff.png]
// Prints how many pixels differ and by how much, and writes an amplified difference image.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from './lib/harness.mjs';

const args = parseArgs();
const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const load = async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`;
const browser = await chromium.launch({
  ...(process.env.SHISHI_BROWSER ? { executablePath: process.env.SHISHI_BROWSER } : { channel: 'msedge' }),
});
const page = await browser.newPage();
const res = await page.evaluate(
  async ([ua, ub]) => {
    const img = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
    const [ia, ib] = [await img(ua), await img(ub)];
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0);
    const da = g.getImageData(0, 0, c.width, c.height);
    g.drawImage(ib, 0, 0);
    const db = g.getImageData(0, 0, c.width, c.height);
    let n = 0, sum = 0, max = 0, minx = 1e9, maxx = -1, miny = 1e9, maxy = -1;
    const out = g.createImageData(c.width, c.height);
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
      if (d > 0) {
        n++; sum += d; max = Math.max(max, d);
        const p = i / 4, x = p % c.width, y = Math.floor(p / c.width);
        minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      }
      const v = Math.min(255, d * 8);
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    return { pixels: c.width * c.height, differing: n, meanDiff: n ? sum / n : 0, maxDiff: max, box: [minx, miny, maxx, maxy], png: c.toDataURL('image/png') };
  },
  [await load(a), await load(b)],
);
await browser.close();
if (args.out) await writeFile(String(args.out), Buffer.from(res.png.split(',')[1], 'base64'));
delete res.png;
console.log(JSON.stringify(res));
