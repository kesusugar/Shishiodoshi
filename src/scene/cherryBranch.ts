import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flowerTexture } from './blossom';
import { translucentLeaves } from './translucent';

/**
 * A flowering cherry bough hanging into the foreground (ref4's spring): a dark bough with side
 * twigs, thick with five-petalled flowers, most of all toward the tips. Two boughs: one hangs down
 * the right side of the frame, and one crosses the top right, its flowers filling the corner.
 * Out of focus, it reads as the soft pink mass in front of the garden.
 */
export interface CherryBranch {
  group: THREE.Group;
}

const PINKS = ['#ffffff', '#ffe6ee', '#ffd3e0', '#ffc2d4', '#ffb3c9'];

export function buildCherryBranch(rand: () => number, tint: THREE.Color): CherryBranch {
  const group = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: '#33231b', roughness: 0.9 });
  const flowerMat = new THREE.MeshStandardMaterial({ map: flowerTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  translucentLeaves(flowerMat, tint);

  const boughs: { points: THREE.Vector3[]; twigs: number; flowers: number }[] = [
    // hangs down the right side, as the maple did
    { points: [[1.0, 1.02, 0.62], [0.8, 0.9, 0.6], [0.64, 0.74, 0.57], [0.53, 0.58, 0.55]].map(([x, y, z]) => new THREE.Vector3(x, y, z)), twigs: 16, flowers: 7 },
    // across the top right
    { points: [[1.15, 1.08, 0.4], [0.95, 1.0, 0.36], [0.7, 0.93, 0.32], [0.42, 0.86, 0.28]].map(([x, y, z]) => new THREE.Vector3(x, y, z)), twigs: 16, flowers: 8 },
  ];

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
      tubes.push(new THREE.TubeGeometry(twig, 8, 0.0028, 5));
      // flowers along the twig, more toward its tip; a big cluster right at the tip
      for (let k = 1; k <= 7; k++) spots.push({ p: twig.getPointAt(k / 8), n: b.flowers });
      spots.push({ p: p2.clone(), n: b.flowers * 3 });
    }
    for (let k = 1; k <= 9; k++) spots.push({ p: curve.getPointAt(k / 10), n: b.flowers });
  }
  // everything is built in world positions; the group sits at the bough's root so a breeze swings
  // it about there (its tip moves most)
  const base = boughs[0].points[0].clone();
  group.position.copy(base);
  const wood = new THREE.Mesh(mergeGeometries(tubes), bark);
  wood.position.copy(base).negate();
  wood.receiveShadow = true;
  group.add(wood);

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
