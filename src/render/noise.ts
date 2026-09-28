/** Seeded value noise for procedural textures and shapes (CPU side, deterministic). */
import { mulberry32 } from '../scene/random';

export class Noise2 {
  private readonly perm: Uint8Array;
  private readonly vals: Float32Array;

  constructor(seed: number) {
    const rand = mulberry32(seed);
    this.vals = new Float32Array(256).map(() => rand());
    this.perm = new Uint8Array(512);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Value noise in [0, 1). `px`/`py` make it tile with that period (in lattice cells). */
  value(x: number, y: number, px = 256, py = 256): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const h = (i: number, j: number) => this.vals[this.perm[(((i % px) + px) % px & 255) + this.perm[((j % py) + py) % py & 255]]];
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  /** Fractal sum of `oct` octaves, normalised to [0, 1). */
  fbm(x: number, y: number, oct = 4, px = 256, py = 256): number {
    let s = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += amp * this.value(x, y, px, py);
      norm += amp;
      x *= 2; y *= 2; px *= 2; py *= 2;
      amp *= 0.5;
    }
    return s / norm;
  }
}
