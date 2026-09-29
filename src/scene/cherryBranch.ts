import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { snowify } from '../render/snow';
import { flowerTexture } from './blossom';
import { translucentLeaves } from './translucent';

/**
 * A bough hanging into the foreground (ref4): in spring a flowering cherry, thick with
 * five-petalled flowers, most of all toward the tips; in winter the same boughs bare, their tops
 * white with snow. Two boughs: one hangs down the right side of the frame, and one crosses the top
 * right, filling the corner. Out of focus, it is the soft mass in front of the garden.
 */
export interface Branch {
  group: THREE.Group;
}

const PINKS = ['#ffffff', '#ffe6ee', '#ffd3e0', '#ffc2d4', '#ffb3c9'];

interface Bough { points: THREE.Vector3[]; twigs: number; flowers: number }

const v3 = (a: number[][]) => a.map(([x, y, z]) => new THREE.Vector3(x, y, z));

/** The wood: boughs with side twigs (merged into one mesh), and the spots where a cluster of flowers (or a lump of snow) sits. */
function wood(rand: () => number, boughs: Bough[], twigRadius: number) {
  const tubes: THREE.BufferGeometry[] = [];
  const spots: { p: THREE.Vector3; n: number }[] = [];
  for (const b of boughs) {
    const curve = new THREE.CatmullRomCurve3(b.points);
    tubes.push(new THREE.TubeGeometry(curve, 30, 0.0075, 6));
    for (let i = 0; i < b.twigs; i++) {
      const t = 0.06 + (i / (b.twigs - 1)) * 0.92 + (rand() - 0.5) * 0.03;
      const p0 = curve.getPointAt(Math.min(t, 1));
      const side = i % 2 === 0 ? 1 : -1;
      const len = 0.09 + rand() * 0.12;
      const dir = new THREE.Vector3(-0.35 - rand() * 0.5, -0.3 - rand() * 0.5, side * (0.4 + rand() * 0.5)).normalize();
      const p2 = p0.clone().addScaledVector(dir, len);
      const p1 = p0.clone().lerp(p2, 0.5).add(new THREE.Vector3(0, 0.015, 0));
      const twig = new THREE.CatmullRomCurve3([p0, p1, p2]);
      tubes.push(new THREE.TubeGeometry(twig, 8, twigRadius, 5));
      // along the twig, more toward its tip; a big cluster right at the tip
      for (let k = 1; k <= 7; k++) spots.push({ p: twig.getPointAt(k / 8), n: b.flowers });
      spots.push({ p: p2.clone(), n: b.flowers * 3 });
    }
    for (let k = 1; k <= 9; k++) spots.push({ p: curve.getPointAt(k / 10), n: b.flowers });
  }
  return { geometry: mergeGeometries(tubes), spots };
}

const BOUGHS: Bough[] = [
  { points: v3([[1.0, 1.02, 0.62], [0.8, 0.9, 0.6], [0.64, 0.74, 0.57], [0.53, 0.58, 0.55]]), twigs: 16, flowers: 7 },
  { points: v3([[1.15, 1.08, 0.4], [0.95, 1.0, 0.36], [0.7, 0.93, 0.32], [0.42, 0.86, 0.28]]), twigs: 16, flowers: 8 },
];

// (the group sits at the first bough's root, so a breeze swings it about there and its tip moves most)
function place(group: THREE.Group, base: THREE.Vector3, w: THREE.Mesh): void {
  group.position.copy(base);
  w.position.copy(base).negate();
  w.receiveShadow = true;
  group.add(w);
}

export function buildCherryBranch(rand: () => number, tint: THREE.Color): Branch {
  const group = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: '#33231b', roughness: 0.9 });
  const flowerMat = new THREE.MeshStandardMaterial({ map: flowerTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  translucentLeaves(flowerMat, tint);

  const { geometry, spots } = wood(rand, BOUGHS, 0.0028);
  const base = BOUGHS[0].points[0].clone();
  place(group, base, new THREE.Mesh(geometry, bark));

  const total = spots.reduce((t, s) => t + s.n, 0);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), flowerMat, total);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color(), normal = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1), spin = new THREE.Quaternion();
  let i = 0;
  for (const spot of spots) {
    for (let k = 0; k < spot.n; k++, i++) {
      pos.copy(spot.p).add(new THREE.Vector3((rand() - 0.5) * 0.06, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.06)).sub(base);
      // the faces turn toward the open garden (the camera side and up), each a little differently
      normal.set((rand() - 0.5) * 1.4, 0.3 + rand() * 0.7, 0.5 + rand() * 0.6).normalize();
      q.setFromUnitVectors(zAxis, normal);
      spin.setFromAxisAngle(normal, rand() * Math.PI * 2);
      q.premultiply(spin);
      sc.setScalar(0.038 + rand() * 0.03);
      mesh.setMatrixAt(i, m.compose(pos, q, sc));
      col.set(PINKS[Math.floor(rand() * rand() * PINKS.length)]).multiplyScalar(0.85 + rand() * 0.3);
      mesh.setColorAt(i, col);
    }
  }
  mesh.receiveShadow = true;
  group.add(mesh);
  return { group };
}

/** The same boughs in winter: dark wood, snow along the tops, and lumps where twigs fork. */
export function buildBareBranch(rand: () => number): Branch {
  const group = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: '#33261e', roughness: 0.9 });
  snowify(bark, 0.005);
  const boughs = BOUGHS.map((b) => ({ ...b, twigs: b.twigs + 6, flowers: 1 }));
  const { geometry, spots } = wood(rand, boughs, 0.0032);
  const base = boughs[0].points[0].clone();
  place(group, base, new THREE.Mesh(geometry, bark));

  // lumps of snow sitting on the forks and tips
  const snow = new THREE.MeshStandardMaterial({ color: '#eef3fa', roughness: 0.9 });
  const lumps = spots.filter((_, i) => i % 3 === 0);
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), snow, lumps.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  lumps.forEach((spot, i) => {
    pos.copy(spot.p).add(new THREE.Vector3(0, 0.006, 0)).sub(base);
    q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3));
    const r = 0.004 + rand() * 0.007;
    sc.set(r * (1.2 + rand() * 0.6), r * 0.7, r);
    mesh.setMatrixAt(i, m.compose(pos, q, sc));
  });
  mesh.receiveShadow = true;
  group.add(mesh);
  return { group };
}
