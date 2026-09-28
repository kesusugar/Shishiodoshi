import * as THREE from 'three';
import type { Season } from './seasons';
import { mulberry32 } from './random';

/**
 * Stand-in geometry in the ref1 arrangement (P0). Real bamboo, stone and plants arrive in P3;
 * the moving parts are driven by the simulation from P1. Units are metres, y up, ground at y = 0.
 */
export const layout = {
  basin: { center: new THREE.Vector3(0.02, 0, 0.06), radius: 0.28, height: 0.38, bowlRadius: 0.19 },
  pivot: new THREE.Vector3(-0.45, 0.55, 0),
  tube: { back: 0.4, front: 0.36, radius: 0.035 },
  spout: new THREE.Vector3(-0.1, 0.86, 0),
  kakeiRoot: new THREE.Vector3(0.75, 1.08, -0.3),
  striker: new THREE.Vector3(-0.82, 0.05, 0),
} as const;

export interface PlaceholderScene {
  root: THREE.Group;
  /** Rotates about the axle (z axis); the simulation will own this angle from P1. */
  tube: THREE.Group;
}

export function buildPlaceholder(season: Season): PlaceholderScene {
  const root = new THREE.Group();
  const rand = mulberry32(1);

  const bambooColor = new THREE.Color(season.bamboo.fresh).lerp(new THREE.Color(season.bamboo.aged), season.bamboo.age);
  const bamboo = new THREE.MeshStandardMaterial({ color: bambooColor, roughness: 0.45, side: THREE.DoubleSide });
  const wood = new THREE.MeshStandardMaterial({ color: '#6b5a45', roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: season.stone.basin, roughness: 0.85 });
  const lava = new THREE.MeshStandardMaterial({ color: season.stone.lava, roughness: 0.95, flatShading: true });
  const moss = new THREE.MeshStandardMaterial({ color: season.foliage.moss, roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: season.foliage.leaf, roughness: 0.8, side: THREE.DoubleSide });
  const water = new THREE.MeshStandardMaterial({ color: '#2f4a44', roughness: 0.05, metalness: 0.3 });

  const shadowed = <T extends THREE.Object3D>(o: T) => {
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshStandardMaterial({ color: season.stone.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // Basin: a stone block with a bowl of water and a moss rim.
  const { basin } = layout;
  const basinMesh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(basin.radius * 0.95, basin.radius, basin.height, 40), stone));
  basinMesh.position.copy(basin.center).setY(basin.height / 2);
  root.add(basinMesh);
  const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(basin.bowlRadius + 0.03, 0.022, 10, 48), moss));
  rim.rotation.x = Math.PI / 2;
  rim.position.copy(basin.center).setY(basin.height + 0.004);
  root.add(rim);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(basin.bowlRadius, 48), water);
  pool.rotation.x = -Math.PI / 2;
  pool.position.copy(basin.center).setY(basin.height + 0.001);
  root.add(pool);

  // Posts and axle
  for (const z of [-0.07, 0.07]) {
    const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.62, 0.055), wood));
    post.position.set(layout.pivot.x, 0.31, z);
    root.add(post);
  }
  const axle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.2, 12), wood));
  axle.rotation.x = Math.PI / 2;
  axle.position.copy(layout.pivot);
  root.add(axle);

  // Tube: an open bamboo cylinder along local +x from the axle, with node rings.
  const tube = new THREE.Group();
  tube.position.copy(layout.pivot);
  const { back, front, radius } = layout.tube;
  const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, back + front, 32, 1, true), bamboo));
  body.rotation.z = -Math.PI / 2;
  body.position.x = (front - back) / 2;
  tube.add(body);
  for (const x of [-back, -0.12, front * 0.55]) {
    const ring = shadowed(new THREE.Mesh(new THREE.TorusGeometry(radius * 1.02, 0.004, 8, 32), bamboo));
    ring.rotation.y = Math.PI / 2;
    ring.position.x = x;
    tube.add(ring);
  }
  const cap = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), bamboo);
  cap.rotation.y = -Math.PI / 2;
  cap.position.x = -back;
  tube.add(cap);
  tube.rotation.z = THREE.MathUtils.degToRad(14);
  root.add(tube);

  // Striker stone under the back end
  const striker = shadowed(new THREE.Mesh(rockGeometry(rand, 0.09), stone));
  striker.position.copy(layout.striker);
  striker.scale.set(1.2, 0.6, 1);
  root.add(striker);

  // Kakei (supply pipe) from the rocks to above the tube mouth
  const pipeDir = new THREE.Vector3().subVectors(layout.spout, layout.kakeiRoot);
  const pipe = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, pipeDir.length(), 20, 1, true), bamboo));
  pipe.position.copy(layout.kakeiRoot).addScaledVector(pipeDir, 0.5);
  pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pipeDir.clone().normalize());
  root.add(pipe);

  // Lava rock mound behind and to the right
  const rocks: [number, number, number, number][] = [
    [0.85, 0.35, -0.45, 0.55],
    [0.45, 0.2, -0.7, 0.45],
    [1.15, 0.8, -0.65, 0.5],
    [0.9, 1.05, -0.75, 0.4],
    [-0.05, 0.12, -0.55, 0.3],
    [1.35, 0.25, -0.1, 0.35],
    [-0.9, 0.08, -0.25, 0.22],
  ];
  for (const [x, y, z, s] of rocks) {
    const r = shadowed(new THREE.Mesh(rockGeometry(rand, s), lava));
    r.position.set(x, y, z);
    r.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    root.add(r);
  }

  // Foliage stand-in: a clump of leaves behind the posts (the nandina-like bush in ref1)
  const leafCount = 1800;
  const leaves = shadowed(new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.025), leaf, leafCount));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (let i = 0; i < leafCount; i++) {
    const cx = -0.6 + rand() * 1.1;
    p.set(cx, 0.5 + rand() * 0.9 - Math.abs(cx + 0.05) * 0.4, -0.75 - rand() * 0.35);
    q.setFromEuler(e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28));
    sc.setScalar(0.7 + rand() * 0.6);
    leaves.setMatrixAt(i, m.compose(p, q, sc));
  }
  root.add(leaves);

  // Far backdrop (blurred greenery in ref2); replaced by real depth of field in P5.
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), new THREE.MeshBasicMaterial({ color: season.foliage.backdrop }));
  backdrop.position.set(0, 3, -3.5);
  root.add(backdrop);

  return { root, tube };
}

/** Lumpy rock: an icosphere pushed in and out by a few random plane waves. */
function rockGeometry(rand: () => number, size: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(size, 3);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const waves = Array.from({ length: 6 }, () => ({
    d: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    f: (2 + rand() * 6) / size,
    a: 0.06 + rand() * 0.08,
    ph: rand() * 6.28,
  }));
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    let k = 1;
    for (const w of waves) k += w.a * Math.sin(v.dot(w.d) * w.f + w.ph);
    v.copy(n).multiplyScalar(size * k);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
