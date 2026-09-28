import type { SimConfig } from './config';

/**
 * Where the kakei's stream goes (PLAN.md 4.3). It falls on a parabola from the spout; depending on
 * the tube's angle it enters the mouth, lands on the tube's back (and runs off), or misses the tube
 * and falls into the basin.
 */
export type StreamTarget = 'mouth' | 'skin' | 'basin' | 'ground';

export interface StreamLanding {
  target: StreamTarget;
  /** World point where the visible stream ends. */
  x: number;
  y: number;
}

/**
 * @param angle tube angle; @param surface the water surface in the tube, or null if it's empty:
 * `s` and `alpha` (the surface's world tilt) as in TubeHydro.
 */
export function streamLanding(cfg: SimConfig, angle: number, surface: { s: number; alpha: number } | null): StreamLanding {
  const { spout, velocity: v } = cfg.inflow;
  const g = cfg.gravity;
  const P = cfg.pivot, t = cfg.tube;
  const r = t.radius - t.wall;
  const c = Math.cos(angle), s = Math.sin(angle);
  // x of the stream when it has fallen to world height y
  const xAt = (y: number) => {
    const a = -g / 2, b = v.y, cc = spout.y - y;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return spout.x;
    const time = (-b - Math.sqrt(disc)) / (2 * a);
    return spout.x + v.x * Math.max(time, 0);
  };
  const toLocal = (px: number, py: number) => ({ x: px * c + py * s, y: -px * s + py * c });

  // 1. the mouth: where the (near-vertical) stream crosses the cut plane x + k y = front - cut / 2
  const k = t.cut / (2 * t.radius), cPlane = t.front - t.cut / 2;
  let y = spout.y - 0.1;
  let hit: { py: number; ly: number } | null = null;
  for (let it = 0; it < 4; it++) {
    const px = xAt(y) - P.x;
    const den = s + k * c;
    if (den <= 1e-6) break;
    const py = (cPlane - px * (c - k * s)) / den;
    y = P.y + py;
    hit = { py, ly: toLocal(px, py).y };
  }
  if (hit && Math.abs(hit.ly) <= r && P.y + hit.py < spout.y) {
    // inside: down to the water in the tube, or to the bore's floor if there is little
    let yEnd = P.y + hit.py;
    for (let it = 0; it < 3; it++) {
      const px = xAt(yEnd) - P.x;
      const floor = (-r + px * s) / c;
      const water = surface ? (surface.s - px * Math.sin(surface.alpha)) / Math.cos(surface.alpha) : -Infinity;
      yEnd = P.y + Math.min(Math.max(floor, water), hit.py);
    }
    return { target: 'mouth', x: xAt(yEnd), y: yEnd };
  }

  // 2. the tube's back (outer skin, top line y = +R), anywhere along its length
  let ys = spout.y - 0.1;
  for (let it = 0; it < 4; it++) {
    const px = xAt(ys) - P.x;
    ys = P.y + (t.radius + px * s) / c;
  }
  const lx = toLocal(xAt(ys) - P.x, ys - P.y).x;
  if (ys < spout.y && lx > -t.back && lx < t.front - t.cut) return { target: 'skin', x: xAt(ys), y: ys };

  // 3. the basin, or past it to the ground
  const xb = xAt(cfg.basinLevel);
  if (Math.abs(xb - cfg.basin.x) < cfg.basin.radius) return { target: 'basin', x: xb, y: cfg.basinLevel };
  return { target: 'ground', x: xAt(0), y: 0 };
}
