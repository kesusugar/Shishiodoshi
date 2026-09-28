import * as THREE from 'three';
import type { Canopy } from '../render/canopy';
import { andesite } from '../render/textures';
import { mulberry32 } from './random';
import type { Season } from './seasons';
import { rockGeometry } from './shishiodoshi';

/**
 * The garden around the shishi-odoshi (docs/reference/ref3-ideal.png): wet gravel at its foot, moss-
 * covered boulders behind, clumps of fern, a maple branch hanging into the foreground, and a few
 * fallen leaves floating on the basin. These are what make it read as a place rather than an object
 * on a floor. Everything is placed from a seeded random sequence, so it is the same on every load.
 */
export interface Garden {
  root: THREE.Group;
  /** Leaves floating on the basin: moved by the water (see update). */
  floating: THREE.Object3D[];
  update(time: number, wind: number): void;
}

interface Keepout { x: number; z: number; r: number }

export function buildGarden(season: Season, _canopy: Canopy['uniforms'], basin: { center: THREE.Vector3; bowlRadius: number; level: number }): Garden {
  const root = new THREE.Group();
  const rand = mulberry32(404);
  // places already taken (basin, striker, posts, standing culm)
  const keep: Keepout[] = [
    { x: basin.center.x, z: basin.center.z, r: 0.34 },
    { x: -0.6, z: 0, r: 0.16 },
    { x: -0.34, z: 0, r: 0.07 },
    { x: 0.42, z: 0, r: 0.07 },
  ];
  const free = (x: number, z: number, pad = 0) => keep.every((k) => Math.hypot(x - k.x, z - k.z) > k.r + pad);

  // ---- gravel: small rounded stones, wet, in a bed around the base
  {
    const variants = [0, 1, 2].map(() => {
      const g = rockGeometry(rand, 1, 1.2, 0.85);
      g.translate(0, -0.35, 0);
      return g;
    });
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0, vertexColors: false });
    const perVariant = 900;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color();
    for (const g of variants) {
      const mesh = new THREE.InstancedMesh(g, mat, perVariant);
      let n = 0;
      for (let tries = 0; n < perVariant && tries < perVariant * 4; tries++) {
        // denser near the middle, thinning out
        const a = rand() * Math.PI * 2, d = 0.15 + Math.pow(rand(), 0.7) * 1.1;
        const x = -0.1 + Math.cos(a) * d * 1.2, z = 0.1 + Math.sin(a) * d * 0.8;
        if (!free(x, z, 0.01)) continue;
        const size = 0.008 + rand() * rand() * 0.02;
        p.set(x, 0, z);
        q.setFromEuler(e.set((rand() - 0.5) * 0.4, rand() * 6.28, (rand() - 0.5) * 0.4));
        s.set(size, size * (0.5 + rand() * 0.4), size * (0.7 + rand() * 0.4));
        mesh.setMatrixAt(n, m.compose(p, q, s));
        // pale granite, grey, and a few warm brown pebbles
        const t = rand();
        col.setHSL(t < 0.15 ? 0.08 : 0.1, t < 0.15 ? 0.25 : 0.05, 0.25 + rand() * 0.4);
        mesh.setColorAt(n, col);
        n++;
      }
      mesh.count = n;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }

  // ---- mossy boulders behind and to the sides
  {
    const stone = andesite(55);
    const mossCol = new THREE.Color(season.foliage.moss);
    const mat = new THREE.MeshStandardMaterial({ map: stone.color, bumpMap: stone.bump, bumpScale: 4, roughnessMap: stone.rough, roughness: 1 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uMoss = { value: mossCol };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vUp;\nvarying vec3 vObjPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUp = normalize(mat3(modelMatrix) * normal);\nvObjPos = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vUp;
          varying vec3 vObjPos;
          uniform vec3 uMoss;
          float mh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          float mn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(mh(i), mh(i + vec3(1,0,0)), f.x), mix(mh(i + vec3(0,1,0)), mh(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(mh(i + vec3(0,0,1)), mh(i + vec3(1,0,1)), f.x), mix(mh(i + vec3(0,1,1)), mh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          // moss on what faces the sky, in patches, fuzzy at the edges
          float patchy = mn(vObjPos * 5.0) * 0.6 + mn(vObjPos * 17.0) * 0.4;
          float mossK = smoothstep(0.25, 0.6, vUp.y + (patchy - 0.5) * 0.9);
          float fuzz = mn(vObjPos * 90.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uMoss * (0.35 + 0.9 * fuzz) * (0.7 + 0.5 * patchy), mossK);`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, mossK);');
    };
    const spots: [number, number, number, number, number][] = [
      // x, z, width, height, depth
      [-0.95, -0.55, 0.45, 0.42, 0.4],
      [-0.35, -0.75, 0.4, 0.3, 0.35],
      [0.35, -0.8, 0.5, 0.38, 0.4],
      [0.95, -0.45, 0.45, 0.45, 0.4],
      [1.25, 0.15, 0.3, 0.28, 0.3],
      [-1.3, 0.1, 0.35, 0.3, 0.35],
      [0.0, -1.5, 0.9, 0.7, 0.6],
      [-1.2, -1.3, 0.8, 0.8, 0.6],
      [1.3, -1.3, 0.9, 0.75, 0.7],
    ];
    for (const [x, z, w, h, d] of spots) {
      const g = rockGeometry(rand, w / 2, h, d / 2);
      const r = new THREE.Mesh(g, mat);
      r.position.set(x, -0.03, z);
      r.rotation.y = rand() * 6.28;
      r.castShadow = r.receiveShadow = true;
      root.add(r);
    }
  }

  // ---- ferns: clumps of fronds, each a curved stem with leaflets that shrink toward the tip
  {
    const frond = fernFrond(rand);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide });
    // light through the leaves: a touch of warm green even on the shaded side
    mat.emissive = new THREE.Color('#0d1a05');
    const clumps: [number, number, number][] = [
      [-0.85, -0.25, 1.0], [-0.55, -0.45, 0.8], [0.62, -0.4, 1.0], [0.85, 0.3, 0.9], [-1.0, 0.35, 0.9],
      [0.1, -0.55, 0.8], [1.15, -0.15, 1.1], [-0.25, 0.55, 0.7], [0.7, 0.62, 0.8], [-1.45, -0.4, 1.2],
    ];
    const count = clumps.length * 9;
    const mesh = new THREE.InstancedMesh(frond, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color(), leaf = new THREE.Color(season.foliage.leaf);
    let n = 0;
    for (const [cx, cz, size] of clumps) {
      for (let i = 0; i < 9; i++) {
        const yaw = (i / 9) * Math.PI * 2 + rand() * 0.6;
        p.set(cx + (rand() - 0.5) * 0.04, 0, cz + (rand() - 0.5) * 0.04);
        q.setFromEuler(e.set(0, yaw, 0.35 + rand() * 0.5, 'YXZ'));
        const k = size * (0.7 + rand() * 0.5);
        s.set(k, k, k);
        mesh.setMatrixAt(n, m.compose(p, q, s));
        col.copy(leaf).multiplyScalar(0.8 + rand() * 0.6);
        col.offsetHSL((rand() - 0.5) * 0.04, 0, 0);
        mesh.setColorAt(n, col);
        n++;
      }
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // ---- a maple branch hanging into the foreground on the right (out of focus), and one behind
  const mapleTex = mapleLeafTexture();
  const leafMat = new THREE.MeshStandardMaterial({ map: mapleTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
  leafMat.emissive = new THREE.Color('#0f1d06');
  const branches: THREE.InstancedMesh[] = [];
  for (const [bx, by, bz, spread, count] of [
    [0.75, 0.95, 0.55, 0.35, 160],
    [-0.9, 1.05, -0.6, 0.45, 180],
  ] as const) {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.07), leafMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color(), leaf = new THREE.Color(season.foliage.leaf);
    for (let i = 0; i < count; i++) {
      // leaves along a drooping arc of twigs
      const t = rand();
      p.set(bx - t * spread * Math.sign(bx) + (rand() - 0.5) * 0.18, by - t * t * 0.35 + (rand() - 0.5) * 0.12, bz + (rand() - 0.5) * 0.25);
      q.setFromEuler(e.set(-1.2 + rand() * 0.8, rand() * 6.28, (rand() - 0.5) * 0.8));
      s.setScalar(0.7 + rand() * 0.6);
      mesh.setMatrixAt(i, m.compose(p, q, s));
      col.copy(leaf).multiplyScalar(1.1 + rand() * 0.8);
      mesh.setColorAt(i, col);
    }
    mesh.castShadow = true;
    branches.push(mesh);
    root.add(mesh);
  }

  // ---- fallen leaves: a few floating on the basin, some on the gravel
  const floating: THREE.Object3D[] = [];
  const fallenMat = new THREE.MeshStandardMaterial({ map: mapleTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 });
  const fallenColours = ['#c8321c', '#d98b1c', '#b52a18', '#8a6a1a'];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshStandardMaterial().copy(fallenMat);
    m.color = new THREE.Color(fallenColours[i % fallenColours.length]);
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.055).rotateX(-Math.PI / 2), m);
    const a = rand() * 6.28, d = rand() * basin.bowlRadius * 0.7;
    leaf.position.set(basin.center.x + Math.cos(a) * d, basin.level + 0.002, basin.center.z + Math.sin(a) * d);
    leaf.rotation.y = rand() * 6.28;
    leaf.userData.home = leaf.position.clone();
    leaf.userData.phase = rand() * 6.28;
    leaf.receiveShadow = true;
    floating.push(leaf);
    root.add(leaf);
  }
  for (let i = 0; i < 9; i++) {
    const m = new THREE.MeshStandardMaterial().copy(fallenMat);
    m.color = new THREE.Color(fallenColours[Math.floor(rand() * fallenColours.length)]).multiplyScalar(0.8);
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05).rotateX(-Math.PI / 2), m);
    let x = 0, z = 0;
    for (let k = 0; k < 20; k++) {
      x = -0.9 + rand() * 1.8;
      z = -0.2 + rand() * 0.9;
      if (free(x, z, 0.02)) break;
    }
    leaf.position.set(x, 0.012, z);
    leaf.rotation.set((rand() - 0.5) * 0.4, rand() * 6.28, (rand() - 0.5) * 0.4);
    leaf.receiveShadow = true;
    root.add(leaf);
  }

  return {
    root,
    floating,
    update(time: number, wind: number) {
      // branches sway with the wind; floating leaves drift in slow circles
      for (const [i, b] of branches.entries()) {
        b.rotation.z = wind * 0.03 * Math.sin(time * 0.9 + i) + wind * 0.015 * Math.sin(time * 2.3 + i * 2);
        b.rotation.x = wind * 0.02 * Math.sin(time * 0.7 + i * 1.7);
      }
      for (const leaf of floating) {
        const h = leaf.userData.home as THREE.Vector3, ph = leaf.userData.phase as number;
        leaf.position.x = h.x + 0.02 * Math.sin(time * 0.07 + ph);
        leaf.position.z = h.z + 0.02 * Math.cos(time * 0.05 + ph);
        leaf.rotation.y += 0.0005;
      }
    },
  };
}

/** A fern frond (unit size): a stem curving up and over, with paired leaflets shrinking to the tip. */
function fernFrond(rand: () => number): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [];
  const N = 22;
  const stem = (t: number) => new THREE.Vector3(0, Math.sin(t * 1.6) * 0.32, t * 0.42); // rises then droops
  for (let i = 2; i < N; i++) {
    const t = i / N;
    const c = stem(t), next = stem(Math.min(1, t + 0.02));
    const dir = next.clone().sub(c).normalize();
    const side = new THREE.Vector3(1, 0, 0);
    const len = 0.11 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.85 + rand() * 0.3);
    const w = 0.018 * (1 - t * 0.6);
    for (const sgn of [-1, 1]) {
      // a leaflet: a narrow diamond angled forward and a little down
      const tip = c.clone().addScaledVector(side, sgn * len).addScaledVector(dir, len * 0.35).add(new THREE.Vector3(0, -len * 0.25, 0));
      const a = c.clone().addScaledVector(dir, w);
      const b = c.clone().addScaledVector(dir, -w);
      const mid = c.clone().addScaledVector(side, sgn * len * 0.5).add(new THREE.Vector3(0, w * 0.6, 0));
      for (const tri of sgn > 0 ? [[a, mid, tip], [b, tip, mid], [a, b, mid]] : [[a, tip, mid], [b, mid, tip], [a, mid, b]]) {
        for (const v of tri) pos.push(v.x, v.y, v.z);
        for (let k = 0; k < 3; k++) nrm.push(0, 1, 0);
      }
    }
  }
  // the stem itself: a thin ribbon
  for (let i = 0; i < N; i++) {
    const a = stem(i / N), b = stem((i + 1) / N);
    const o = new THREE.Vector3(0.0025, 0, 0);
    for (const v of [a.clone().sub(o), a.clone().add(o), b.clone().add(o), a.clone().sub(o), b.clone().add(o), b.clone().sub(o)]) pos.push(v.x, v.y, v.z);
    for (let k = 0; k < 6; k++) nrm.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.computeVertexNormals();
  return g;
}

/** A Japanese maple leaf: seven pointed lobes, drawn once into a texture (white; tinted by colour). */
function mapleLeafTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S * 0.6);
  g.fillStyle = '#fff';
  g.beginPath();
  const lobes = 7;
  for (let i = 0; i <= lobes * 2; i++) {
    const a = -Math.PI / 2 + ((i / (lobes * 2)) * 2 - 1) * Math.PI * 0.82;
    const r = i % 2 === 0 ? S * (0.46 - 0.12 * Math.abs(Math.sin(((i / (lobes * 2)) * 2 - 1) * Math.PI * 0.5))) : S * 0.14;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  // veins, slightly darker
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 3;
  for (let i = 0; i < lobes; i++) {
    const a = -Math.PI / 2 + ((i / (lobes - 1)) * 2 - 1) * Math.PI * 0.72;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * S * 0.36, Math.sin(a) * S * 0.36);
    g.stroke();
  }
  // stalk
  g.fillRect(-2, 0, 4, S * 0.35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
