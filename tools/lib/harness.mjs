// Shared setup for the offline checks: start Vite, open the page in the installed Edge via
// Playwright, and fail loudly on any console error (shader compile errors land there).
//
// Uses the system Edge (no browser download). Pass --swiftshader only on machines without a GPU
// (cloud / CI); it is the same software-rendering setup as caustic-volume's tests.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const outDir = path.join(root, 'tools', 'out');

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

const SWIFTSHADER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/**
 * @param {{ swiftshader?: boolean, headed?: boolean, width?: number, height?: number }} opts
 */
export async function openApp(opts = {}) {
  const server = await createServer({ root, logLevel: 'error', server: { port: 0, strictPort: false } });
  await server.listen();
  const base = server.resolvedUrls.local[0]; // ends with /Shishiodoshi/

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: !opts.headed,
    args: opts.swiftshader ? SWIFTSHADER_ARGS : ['--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({
    viewport: { width: opts.width ?? 1600, height: opts.height ?? 900 },
    deviceScaleFactor: 1,
  });

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`HTTP ${res.status()} ${res.url()}`);
  });

  async function load(query = '') {
    await page.goto(`${base}?capture${query ? `&${query}` : ''}`);
    await page.waitForFunction(() => window.__shishi?.ready || window.__shishi?.error, null, { timeout: 60_000 });
    const probe = await page.evaluate(() => window.__shishi);
    if (probe.error) throw new Error(`page reported: ${probe.error}`);
    return probe;
  }

  /** Wait until `n` more frames have been drawn. */
  async function frames(n) {
    const start = await page.evaluate(() => window.__shishi.frames);
    await page.waitForFunction((t) => window.__shishi.frames >= t, start + n, { timeout: 120_000 });
  }

  async function close() {
    await browser.close();
    await server.close();
  }

  return { page, errors, load, frames, close, base };
}
