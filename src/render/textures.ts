import * as THREE from 'three';
import { Noise2 } from './noise';

/** Colour (sRGB) and bump (linear, in R) textures made on the CPU from seeded noise. */
export interface SurfaceMaps {
  color: THREE.DataTexture;
  bump: THREE.DataTexture;
  rough: THREE.DataTexture;
}

type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** '#rrggbb' -> sRGB components in 0..1 (the textures are written as sRGB bytes). */
const hex = (h: string): Rgb => {
  const x = parseInt(h.slice(1), 16);
  return [((x >> 16) & 255) / 255, ((x >> 8) & 255) / 255, (x & 255) / 255];
};

function makeMaps(w: number, h: number, fill: (u: number, v: number, out: { c: Rgb; b: number; r: number }) => void): SurfaceMaps {
  const col = new Uint8Array(w * h * 4);
  const bmp = new Uint8Array(w * h * 4);
  const rgh = new Uint8Array(w * h * 4);
  const o = { c: [0, 0, 0] as Rgb, b: 0, r: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      fill((x + 0.5) / w, (y + 0.5) / h, o);
      const i = (y * w + x) * 4;
      col[i] = clamp01(o.c[0]) * 255; col[i + 1] = clamp01(o.c[1]) * 255; col[i + 2] = clamp01(o.c[2]) * 255; col[i + 3] = 255;
      bmp[i] = bmp[i + 1] = bmp[i + 2] = clamp01(o.b) * 255; bmp[i + 3] = 255;
      rgh[i] = rgh[i + 1] = rgh[i + 2] = clamp01(o.r) * 255; rgh[i + 3] = 255;
    }
  }
  const tex = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { color: tex(col, true), bump: tex(bmp, false), rough: tex(rgh, false) };
}

export interface BambooSkinOptions {
  /** Length covered by the texture along the culm (m), and its circumference (m). */
  length: number;
  circumference: number;
  /** Node positions as fractions of `length`. */
  nodes: number[];
  /** 0 = fresh green, 1 = weathered ochre. */
  age: number;
  fresh: string;
  aged: string;
  seed: number;
}

/**
 * The outer skin of a bamboo culm. u runs along the culm, v around it. Fine lengthwise fibres, long
 * faint streaks, mottled weathering, a darker band and a pale waxy ring at each node.
 */
export function bambooSkin(opt: BambooSkinOptions): SurfaceMaps {
  const n = new Noise2(opt.seed);
  const W = 1024, H = 256;
  // cells per texture in each direction; v must tile around the culm
  const aroundCells = Math.round(opt.circumference / 0.004);
  const base = mix(hex(opt.fresh), hex(opt.aged), opt.age);
  const dark = mix(base, hex('#5a4526'), 0.55);
  const green = mix(base, hex('#8a9a48'), 0.35);
  const pale = mix(base, hex('#efe4c2'), 0.55);
  return makeMaps(W, H, (u, v, o) => {
    const x = u * opt.length; // metres along
    // fibres: very stretched along the culm
    const fib = n.fbm(x * 12, v * aroundCells, 3, 1e6, aroundCells);
    const streak = n.fbm(x * 3, v * aroundCells * 0.25, 3, 1e6, Math.max(1, aroundCells >> 2));
    const mottle = n.fbm(x * 9, v * 8, 4, 1e6, 8);
    const spots = smooth(0.62, 0.75, n.fbm(x * 40 + 13, v * 40, 3, 1e6, 40));
    let c = mix(green, base, smooth(0.35, 0.65, mottle));
    c = mix(c, dark, 0.5 * smooth(0.4, 0.8, streak) + 0.55 * spots);
    c = mix(c, pale, 0.25 * smooth(0.5, 0.9, fib));
    c = c.map((k) => k * (0.8 + 0.4 * fib)) as Rgb;
    // grime: dark streaks running along the culm where water has run and dried
    const grime = smooth(0.58, 0.8, n.fbm(x * 1.5 + 40, v * aroundCells * 0.12, 4, 1e6, Math.max(1, Math.round(aroundCells * 0.12))));
    c = mix(c, hex('#3a2c18'), 0.55 * grime);
    let bump = 0.5 + 0.12 * (fib - 0.5) + 0.05 * (streak - 0.5);
    let rough = 0.35 + 0.25 * mottle + 0.2 * spots;
    for (const nu of opt.nodes) {
      const d = (u - nu) * opt.length; // metres from the node ridge
      const ridge = Math.exp(-((d / 0.0018) ** 2));
      const band = Math.exp(-((d / 0.006) ** 2));
      const wax = smooth(-0.006, -0.012, d) * smooth(-0.03, -0.012, d); // pale ring just below the node
      c = mix(c, dark, 0.8 * band);
      c = mix(c, pale, 0.35 * wax * (0.6 + 0.4 * fib));
      bump += 0.45 * ridge - 0.15 * band;
      rough += 0.1 * wax;
    }
    o.c = c;
    o.b = bump;
    o.r = rough;
  });
}

/** The inside of the culm and the cut end grain: pale, fibrous, matte. */
export function bambooFlesh(seed: number): SurfaceMaps {
  const n = new Noise2(seed);
  const a = hex('#e6d9b0'), b = hex('#c9b27a');
  return makeMaps(256, 256, (u, v, o) => {
    const fib = n.fbm(u * 4, v * 96, 3, 4, 96);
    const blot = n.fbm(u * 6 + 3, v * 6, 3, 6, 6);
    o.c = mix(a, b, 0.5 * smooth(0.3, 0.8, blot) + 0.4 * fib);
    o.b = 0.5 + 0.3 * (fib - 0.5);
    o.r = 0.75 + 0.2 * fib;
  });
}

/** Weathered, greyed wood for the posts and the axle: vertical grain and a few cracks. */
export function weatheredWood(seed: number): SurfaceMaps {
  const n = new Noise2(seed);
  const light = hex('#8a7a66'), mid = hex('#5e5040'), deep = hex('#2e261d');
  return makeMaps(256, 512, (u, v, o) => {
    const warp = n.fbm(u * 4, v * 2, 3, 4, 2);
    const grain = 0.5 + 0.5 * Math.sin((u * 26 + warp * 3) * Math.PI * 2);
    const fine = n.fbm(u * 64, v * 6, 3, 64, 6);
    const crack = smooth(0.965, 0.99, 1 - Math.abs(n.fbm(u * 5 + 7, v * 1.5, 3, 5, 2) * 2 - 1) + 0.0);
    let c = mix(mid, light, 0.55 * grain + 0.45 * fine);
    c = mix(c, deep, crack * 0.9);
    o.c = c;
    o.b = 0.55 + 0.2 * grain + 0.15 * fine - 0.5 * crack;
    o.r = 0.8 + 0.15 * fine;
  });
}

/** Pale granite for the basin: speckled, with faint dark staining. Tiles in both directions. */
export function granite(seed: number): SurfaceMaps {
  const n = new Noise2(seed);
  const base = hex('#9d9a92'), light = hex('#cfcbc2'), darkSpeck = hex('#3d3b38'), stain = hex('#5f6358');
  return makeMaps(512, 512, (u, v, o) => {
    const big = n.fbm(u * 5, v * 5, 4, 5, 5);
    const speck = n.value(u * 300, v * 300, 300, 300);
    const speck2 = n.value(u * 120 + 50, v * 120, 120, 120);
    const st = n.fbm(u * 3 + 9, v * 3, 4, 3, 3);
    let c = mix(base, light, 0.5 * big);
    c = mix(c, darkSpeck, smooth(0.82, 0.9, speck) * 0.45);
    c = mix(c, light, smooth(0.8, 0.9, speck2) * 0.6);
    c = mix(c, stain, 0.45 * smooth(0.5, 0.75, st));
    o.c = c;
    o.b = 0.5 + 0.25 * (big - 0.5) + 0.15 * (speck - 0.5);
    o.r = 0.7 + 0.2 * big;
  });
}

/** Garden floor: patchy moss over dark soil with a few pale pebbles. Tiles. */
export function mossyGround(seed: number): SurfaceMaps {
  const n = new Noise2(seed);
  const soil = hex('#3d3325'), mossA = hex('#46631f'), mossB = hex('#6f8f2c');
  return makeMaps(512, 512, (u, v, o) => {
    const patch = n.fbm(u * 3, v * 3, 5, 3, 3);
    const fine = n.value(u * 160, v * 160, 160, 160);
    const tuft = n.fbm(u * 40, v * 40, 3, 40, 40);
    const mossK = smooth(0.25, 0.45, patch + 0.15 * (tuft - 0.5));
    let c = mix(mossA, mossB, 0.6 * tuft + 0.4 * fine);
    c = mix(soil, c, 0.75 + 0.25 * mossK);
    o.c = c.map((k) => k * (0.8 + 0.35 * fine)) as Rgb;
    o.b = 0.5 + 0.25 * (tuft - 0.5) + 0.2 * (fine - 0.5);
    o.r = 0.95;
  });
}

/**
 * Dark volcanic stone (andesite) as in the ideal reference: charcoal grey with pale and dark
 * speckles, lighter weathered patches, and roughness that varies (wet hollows are glossier).
 */
export function andesite(seed: number): SurfaceMaps {
  const n = new Noise2(seed);
  const base = hex('#5e5c55'), light = hex('#9a968b'), dark = hex('#2a2927'), lichen = hex('#9a9c80');
  return makeMaps(512, 512, (u, v, o) => {
    const big = n.fbm(u * 4, v * 4, 5, 4, 4);
    const speck = n.value(u * 260, v * 260, 260, 260);
    const speck2 = n.value(u * 170 + 30, v * 170, 170, 170);
    const pit = n.fbm(u * 40, v * 40, 3, 40, 40);
    const weather = n.fbm(u * 7 + 11, v * 7, 4, 7, 7);
    let c = mix(dark, base, 0.4 + 0.6 * big);
    c = mix(c, light, smooth(0.7, 0.85, speck) * 0.8);
    c = mix(c, dark, smooth(0.75, 0.9, speck2) * 0.7);
    c = mix(c, lichen, smooth(0.62, 0.8, weather) * 0.35);
    o.c = c;
    o.b = 0.5 + 0.3 * (big - 0.5) + 0.25 * (pit - 0.5) + 0.1 * (speck - 0.5);
    o.r = 0.35 + 0.45 * smooth(0.3, 0.7, pit) + 0.15 * weather;
  });
}
