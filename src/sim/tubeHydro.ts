import type { TubeConfig } from './config';

/**
 * Water held in the tube's compartment (PLAN.md 4.1).
 *
 * In the tube-local frame the water occupies: the bore (y^2 + z^2 <= r^2, r = inner radius), in front
 * of the node diaphragm (x >= diaphragm), behind the slanted cut of the mouth (y <= yCut(x)), and
 * below the free surface. The free surface is a plane; `phi` is its angle in the tube frame (the tube's
 * angle plus the surface's own tilt from sloshing), so "below" means x sin(phi) + y cos(phi) <= s.
 *
 * Every slice across the tube (fixed x) is then the part of a disc below one chord, whose area and
 * first moment are closed-form, so volume and centroid are a 1-D integral over x.
 */

const SLICES = 200;

export interface WaterShape {
  /** Volume (m^3). */
  volume: number;
  /** Centroid in the tube-local frame (m). */
  cx: number;
  cy: number;
  /** dV/ds: the area of the free surface divided by cos(phi) (m^2), for Newton's method. */
  dVds: number;
}

export class TubeHydro {
  readonly r: number;
  private readonly x0: number;
  private readonly dx: number;
  private readonly xs = new Float64Array(SLICES);
  private readonly ycut = new Float64Array(SLICES);

  constructor(readonly tube: TubeConfig) {
    this.r = tube.radius - tube.wall;
    this.x0 = tube.diaphragm;
    this.dx = (tube.front - tube.diaphragm) / SLICES;
    for (let i = 0; i < SLICES; i++) {
      const x = this.x0 + (i + 0.5) * this.dx;
      this.xs[i] = x;
      // the cut plane x = front - cut (1 + y / R) / 2, solved for y
      this.ycut[i] = tube.radius * ((2 * (tube.front - x)) / tube.cut - 1);
    }
  }

  /** Water below the plane x sin(phi) + y cos(phi) = s, with |phi| < 90 degrees. */
  shape(phi: number, s: number, out: WaterShape = { volume: 0, cx: 0, cy: 0, dVds: 0 }): WaterShape {
    const r = this.r, r2 = r * r;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    let V = 0, Mx = 0, My = 0, W = 0;
    for (let i = 0; i < SLICES; i++) {
      const x = this.xs[i];
      const bPlane = (s - x * sp) / cp;
      let b = Math.min(this.ycut[i], bPlane);
      if (b <= -r) continue;
      if (b > r) b = r;
      const q = r2 - b * b;
      const sq = Math.sqrt(q);
      if (bPlane < this.ycut[i] && bPlane < r) W += 2 * sq;
      // disc area below the chord y = b, and its first moment in y
      const A = Math.PI * r2 - (r2 * Math.acos(b / r) - b * sq);
      V += A;
      Mx += A * x;
      My += (-2 / 3) * q * sq;
    }
    out.volume = V * this.dx;
    out.cx = V > 0 ? Mx / V : 0;
    out.cy = V > 0 ? My / V : 0;
    out.dVds = (W * this.dx) / cp;
    return out;
  }

  /** Largest volume the compartment can hold at all (the plane above everything). */
  get fullVolume(): number {
    return this.shape(0, 10).volume;
  }

  /**
   * The surface position s that holds `volume` at surface angle phi. V(s) is monotone: Newton's
   * method from `guess` (the last step's level), kept inside a shrinking bracket, with bisection
   * as the fallback.
   */
  levelFor(phi: number, volume: number, tmp: WaterShape = { volume: 0, cx: 0, cy: 0, dVds: 0 }, guess?: number): number {
    const reach = this.tube.front + this.tube.radius + 0.01;
    let lo = -reach, hi = reach;
    let x = guess ?? 0;
    for (let it = 0; it < 12; it++) {
      const sh = this.shape(phi, x, tmp);
      const err = sh.volume - volume;
      if (Math.abs(err) < 1e-12) return x;
      if (err < 0) lo = x;
      else hi = x;
      let next = sh.dVds > 1e-9 ? x - err / sh.dVds : 0.5 * (lo + hi);
      if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
      x = next;
    }
    for (let it = 0; it < 48; it++) {
      const mid = 0.5 * (lo + hi);
      if (this.shape(phi, mid, tmp).volume < volume) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  /**
   * The lowest point of the mouth's rim, as a value of x sin(phi) + y cos(phi) (the same measure
   * as s): water above it spills. The rim is the bore circle on the cut plane; along it this measure
   * is linear in y, so the lowest point is the lower or the upper lip.
   */
  lipLevel(phi: number): number {
    const t = this.tube, r = this.r;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    const cutX = (y: number) => t.front - (t.cut * (1 + y / t.radius)) / 2;
    const lower = cutX(-r) * sp - r * cp;
    const upper = cutX(r) * sp + r * cp;
    return Math.min(lower, upper);
  }

  /** Tube-local point of the lowest lip (where water spills from). */
  lipPoint(phi: number): { x: number; y: number } {
    const t = this.tube, r = this.r;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    const cutX = (y: number) => t.front - (t.cut * (1 + y / t.radius)) / 2;
    const lower = cutX(-r) * sp - r * cp;
    const upper = cutX(r) * sp + r * cp;
    return lower <= upper ? { x: cutX(-r), y: -r } : { x: cutX(r), y: r };
  }
}
