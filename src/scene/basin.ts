import * as THREE from 'three';
import { Noise2 } from '../render/noise';
import { andesite } from '../render/textures';
import type { Season } from './seasons';

/**
 * A natural stone basin (tsukubai) with a round bowl cut into it. The bowl is a clean cylinder
 * (radius `bowlRadius`, floor at `floorY`) so the water shaders can trace it exactly; the outside is
 * irregular. Moss grows on the rim and the upper outside (ref2). Centred at the origin, ground y = 0.
 */
export const basinSpec = {
  outerRadius: 0.3,
  height: 0.28,
  bowlRadius: 0.19,
  floorY: 0.13,
  waterLevel: 0.255,
} as const;

export function buildBasin(season: Season): THREE.Mesh {
  const { outerRadius: RO, height: H, bowlRadius: RB, floorY } = basinSpec;
  const n = new Noise2(7);
  // profile from the ground up the outside, over the rim, down the bowl wall, across the floor:
  // [radius, height, how much the outside noise applies, moss likelihood]
  const profile: [number, number, number, number][] = [
    [RO * 0.9, 0.0, 1, 0],
    [RO * 1.0, H * 0.2, 1, 0],
    [RO * 1.02, H * 0.55, 1, 0.1],
    [RO * 0.98, H * 0.85, 1, 0.5],
    [RO * 0.9, H * 0.97, 0.9, 0.9],
    [RO * 0.78, H, 0.6, 1],
    [RB + 0.035, H - 0.003, 0.25, 0.9],
    [RB + 0.008, H - 0.01, 0.05, 0.5],
    [RB, H - 0.025, 0, 0.1],
    [RB, floorY + 0.02, 0, 0],
    [RB - 0.02, floorY, 0, 0],
    [RB * 0.5, floorY, 0, 0],
    [0.0, floorY, 0, 0],
  ];
  // resample the profile finely
  const pts: { r: number; y: number; k: number; moss: number; s: number }[] = [];
  let arc = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0, k0, m0] = profile[i], [r1, y1, k1, m1] = profile[i + 1];
    const seg = Math.hypot(r1 - r0, y1 - y0);
    const steps = Math.max(2, Math.ceil(seg / 0.008));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      pts.push({ r: r0 + (r1 - r0) * t, y: y0 + (y1 - y0) * t, k: k0 + (k1 - k0) * t, moss: m0 + (m1 - m0) * t, s: arc + seg * t });
    }
    arc += seg;
  }
  const last = profile[profile.length - 1];
  pts.push({ r: last[0], y: last[1], k: last[2], moss: last[3], s: arc });

  const SEG = 128;
  const pos: number[] = [], uv: number[] = [], moss: number[] = [], idx: number[] = [];
  for (let j = 0; j <= SEG; j++) {
    const a = (j / SEG) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (const p of pts) {
      // lumpy outside: large bulges plus smaller knobs, tiling around the circle
      const bump = (n.fbm((j / SEG) * 6, p.y * 9, 4, 6, 1e6) - 0.5) * 0.09 + (n.value((j / SEG) * 3, p.y * 2, 3, 1e6) - 0.5) * 0.06;
      // a rounded-square footprint, like a natural block of stone (ref1), not a turned pot
      const ar = a + 0.45, e = 2.6;
      const square = Math.pow(Math.pow(Math.abs(Math.cos(ar)), e) + Math.pow(Math.abs(Math.sin(ar)), e), -1 / e);
      const shape = 1 + (square * (1 + 0.07 * Math.cos(2 * a + 0.6)) - 1) * p.k;
      const r = p.r * (1 + bump * p.k * 2.0) * shape;
      const y = p.y + (p.k > 0.4 && p.y > H - 0.01 ? (n.fbm((j / SEG) * 8, 3.3, 3, 8, 1e6) - 0.5) * 0.012 : 0);
      pos.push(r * ca, y, r * sa);
      uv.push((j / SEG) * 4, p.s * 5);
      const patch = n.fbm((j / SEG) * 10, p.s * 12 + 40, 4, 10, 1e6);
      const side = 0.5 + 0.5 * Math.cos(a - 2.2); // more moss on the shady back side
      moss.push(Math.min(1, Math.max(0, p.moss * (0.9 + 0.8 * side) - 0.75 + (patch - 0.5) * 2.4)));
    }
  }
  const row = pts.length;
  for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < row - 1; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aMoss', new THREE.Float32BufferAttribute(moss, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the lathe seam: average the normals of the first and last column so there is no crease
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < row; i++) {
    const a = i, b = SEG * row + i;
    const v = new THREE.Vector3().fromBufferAttribute(nrm, a).add(new THREE.Vector3().fromBufferAttribute(nrm, b)).normalize();
    nrm.setXYZ(a, v.x, v.y, v.z);
    nrm.setXYZ(b, v.x, v.y, v.z);
  }

  const stone = andesite(11);
  const mossMaps = mossTexture(12);
  const mat = new THREE.MeshStandardMaterial({
    map: stone.color,
    bumpMap: stone.bump,
    bumpScale: 3,
    roughnessMap: stone.rough,
    roughness: 1,
  });
  const mossCol = new THREE.Color(season.foliage.moss);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMossMap = { value: mossMaps };
    sh.uniforms.uMossCol = { value: mossCol };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMoss;\nvarying float vMoss;\nvarying vec3 vBasinPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMoss = aMoss;\nvBasinPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMoss;\nvarying vec3 vBasinPos;\nuniform sampler2D uMossMap;\nuniform vec3 uMossCol;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec4 mossT = texture2D(uMossMap, vMapUv * 3.0);
        vec4 mossF = texture2D(uMossMap, vMapUv * 11.0);
        float mossK = smoothstep(0.25, 0.5, vMoss + (mossT.a - 0.5) * 0.9 + (mossF.g - 0.5) * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, uMossCol * (0.15 + 0.8 * mossT.rgb) * (0.35 + 1.1 * mossF.g), mossK);
        // wet stone: the rim and the inside above the water stay wet from splashes (and the wet
        // edge is uneven); wet stone is darker and glossy
        float wet = smoothstep(${(H - 0.07).toFixed(3)}, ${(H - 0.01).toFixed(3)}, vBasinPos.y + 0.03 * (mossT.a - 0.5)) * (1.0 - 0.6 * mossK);
        wet = max(wet, smoothstep(${(RB + 0.04).toFixed(3)}, ${(RB + 0.005).toFixed(3)}, length(vBasinPos.xz)));
        diffuseColor.rgb *= 1.0 - 0.35 * wet;
        // where the block goes into the ground: damp and soil-stained
        float sunk = 1.0 - smoothstep(0.0, 0.07, vBasinPos.y + 0.02 * (mossT.a - 0.5));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.04, 0.03), sunk * 0.65);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, mossK);\nroughnessFactor = mix(roughnessFactor, 0.12, wet);')
      // moss is a mat of tiny stems: its own light-catching bumps replace the stone's
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, normalize(normal + (vec3(mossF.g, mossF.r, mossT.g) - 0.5) * 0.9), mossK));',
      );
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Moss: fine speckled green (rgb = brightness variation, a = coverage noise), tiling. */
function mossTexture(seed: number): THREE.DataTexture {
  const n = new Noise2(seed);
  const W = 256;
  const data = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / W;
      const fine = n.value(u * 96, v * 96, 96, 96);
      const mid = n.fbm(u * 12, v * 12, 3, 12, 12);
      const k = 0.35 + 0.45 * fine + 0.3 * mid;
      const i = (y * W + x) * 4;
      data[i] = Math.min(255, k * 0.9 * 255);
      data[i + 1] = Math.min(255, k * 255);
      data[i + 2] = Math.min(255, k * 0.6 * 255);
      data[i + 3] = n.fbm(u * 6 + 3, v * 6, 4, 6, 6) * 255;
    }
  }
  const t = new THREE.DataTexture(data, W, W, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
