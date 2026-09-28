import * as THREE from 'three';
import { addGardenFog, type EnvUniforms } from '../render/env';
import { mossyGround, weatheredWood } from '../render/textures';
import { defaultConfig, kakei as kakeiCfg, type SimConfig } from '../sim/config';
import { basinSpec, buildBasin } from './basin';
import { buildCulm, type CulmSpec } from './bamboo';
import { mulberry32 } from './random';
import type { Season } from './seasons';

/**
 * The shishi-odoshi itself, laid out as in ref1: the pivoting tube on two posts, its striker stone,
 * the supply pipe (kakei) from a standing culm, and the stone basin. Metres, y up, ground at y = 0,
 * the basin centred at `basinCenter`, the tube swinging in the x-y plane.
 */
const cfg: SimConfig = defaultConfig;
export const layout = {
  basinCenter: new THREE.Vector3(cfg.basin.x, 0, 0),
  pivot: new THREE.Vector3(cfg.pivot.x, cfg.pivot.y, 0),
  restAngle: cfg.restAngle,
  postX: kakeiCfg.postX,
  kakeiY: kakeiCfg.y,
  kakeiTipX: kakeiCfg.tipX,
};

export interface ShishiodoshiScene {
  root: THREE.Group;
  /** Rotates about the axle (local z); +angle raises the mouth. */
  tube: THREE.Group;
  tubeSpec: CulmSpec;
  /** Where the kakei's water leaves its lower lip (world). */
  spout: THREE.Vector3;
  /** Water surface of the basin, world. */
  basin: { center: THREE.Vector3; bowlRadius: number; floorY: number; waterLevel: number; rimY: number; stone: THREE.Texture };
}

export function buildShishiodoshi(season: Season, env: EnvUniforms): ShishiodoshiScene {
  const root = new THREE.Group();
  const rand = mulberry32(3);
  const { bamboo } = season;

  // Ground: moss and soil, mostly out of focus
  const groundMaps = mossyGround(21);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundMaps.color, bumpMap: groundMaps.bump, bumpScale: 3, roughness: 1 });
  addGardenFog(groundMat, env, 1.6, 5.0);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 96), groundMat);
  ground.geometry.rotateX(-Math.PI / 2);
  const guv = ground.geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * 36, guv.getY(i) * 36);
  ground.receiveShadow = true;
  root.add(ground);

  // Basin
  const basinMesh = buildBasin(season);
  basinMesh.position.copy(layout.basinCenter);
  root.add(basinMesh);

  // The tube
  const t = cfg.tube;
  const tubeSpec: CulmSpec = {
    back: t.back,
    front: t.front,
    radius: t.radius,
    wall: t.wall,
    cut: t.cut,
    nodes: t.nodes,
    diaphragm: t.diaphragm,
    age: bamboo.age,
    fresh: bamboo.fresh,
    aged: bamboo.aged,
    seed: 101,
  };
  const tube = new THREE.Group();
  tube.position.copy(layout.pivot);
  tube.add(buildCulm(tubeSpec));
  tube.rotation.z = layout.restAngle;
  root.add(tube);

  // Posts and axle
  const woodMaps = weatheredWood(31);
  const wood = new THREE.MeshStandardMaterial({ map: woodMaps.color, bumpMap: woodMaps.bump, bumpScale: 2, roughnessMap: woodMaps.rough, roughness: 1 });
  const postH = layout.pivot.y + 0.06;
  for (const z of [-0.058, 0.058]) {
    const g = new THREE.BoxGeometry(0.045, postH, 0.045, 1, 8, 1);
    roundBox(g, 0.004);
    const post = new THREE.Mesh(g, wood);
    post.position.set(layout.pivot.x, postH / 2, z);
    post.rotation.y = (rand() - 0.5) * 0.08;
    post.castShadow = post.receiveShadow = true;
    root.add(post);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.17, 16), wood);
  axle.rotation.x = Math.PI / 2;
  axle.position.copy(layout.pivot);
  axle.castShadow = true;
  root.add(axle);
  // The crossbar just under the axle: the tube's belly comes down on it when it tips forward
  const stopLocal = new THREE.Vector3(0.03, -t.radius, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), cfg.frontStopAngle);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 12), wood);
  bar.rotation.x = Math.PI / 2;
  bar.position.copy(layout.pivot).add(stopLocal).add(new THREE.Vector3(0, -0.009, 0));
  bar.castShadow = bar.receiveShadow = true;
  root.add(bar);

  // Striker stone under the back end (the tube's back rests on it while filling)
  const backEnd = new THREE.Vector3(-tubeSpec.back, -tubeSpec.radius, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), layout.restAngle).add(layout.pivot);
  const strikerH = backEnd.y;
  const striker = new THREE.Mesh(rockGeometry(rand, 0.12, strikerH, 0.11), basinMesh.material);
  striker.position.set(backEnd.x + 0.01, 0, 0);
  striker.castShadow = striker.receiveShadow = true;
  root.add(striker);

  // Standing culm that feeds the kakei (as in ref2), and the kakei itself
  const standSpec: CulmSpec = {
    back: 0.0,
    front: layout.kakeiY + 0.12,
    radius: 0.042,
    wall: 0.007,
    cut: 0.0001,
    nodes: [0.25, 0.62, layout.kakeiY + 0.1],
    diaphragm: layout.kakeiY + 0.1,
    age: bamboo.age,
    fresh: bamboo.fresh,
    aged: bamboo.aged,
    seed: 202,
  };
  const stand = buildCulm(standSpec);
  stand.rotation.z = Math.PI / 2; // +x -> +y
  stand.position.set(layout.postX, 0, -0.01);
  root.add(stand);

  const kakeiSlope = kakeiCfg.slope;
  const kakeiLen = (layout.postX - layout.kakeiTipX) / Math.cos(kakeiSlope);
  const kakeiSpec: CulmSpec = {
    back: 0.02,
    front: kakeiLen,
    radius: kakeiCfg.radius,
    wall: kakeiCfg.wall,
    cut: kakeiCfg.cut,
    nodes: [kakeiLen * 0.45],
    diaphragm: -0.02,
    age: bamboo.age,
    fresh: bamboo.fresh,
    aged: bamboo.aged,
    seed: 303,
  };
  const kakei = new THREE.Group();
  kakei.add(buildCulm(kakeiSpec));
  // local +x points toward -x in the world, tilted down by the slope
  kakei.rotation.set(0, Math.PI, -kakeiSlope);
  kakei.position.set(layout.postX, layout.kakeiY, 0);
  root.add(kakei);
  const spout = new THREE.Vector3(kakeiSpec.front, -(kakeiSpec.radius - kakeiSpec.wall), 0);
  kakei.updateMatrixWorld();
  kakei.localToWorld(spout);

  // A tie of palm-fibre rope where the kakei meets the standing culm
  const rope = new THREE.MeshStandardMaterial({ color: '#1d1712', roughness: 0.95 });
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.0035, 8, 32), rope);
    t.position.set(layout.postX, layout.kakeiY - 0.03 + i * 0.008, -0.01);
    t.rotation.x = Math.PI / 2 + (i - 1) * 0.15;
    t.castShadow = true;
    root.add(t);
  }

  return {
    root,
    tube,
    tubeSpec,
    spout,
    basin: {
      center: layout.basinCenter.clone(),
      bowlRadius: basinSpec.bowlRadius,
      floorY: basinSpec.floorY,
      waterLevel: basinSpec.waterLevel,
      rimY: basinSpec.height,
      stone: (basinMesh.material as THREE.MeshStandardMaterial).map!,
    },
  };
}

/** Round off a box's edges a little by pulling its vertices toward a rounded box. */
function roundBox(g: THREE.BufferGeometry, r: number): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const inner = new THREE.Vector3(Math.sign(v.x) * Math.max(Math.abs(v.x) - r, 0), v.y, Math.sign(v.z) * Math.max(Math.abs(v.z) - r, 0));
    const d = v.clone().sub(inner);
    if (d.lengthSq() > 0) v.copy(inner).add(d.setLength(r));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
}

/**
 * A rounded natural stone standing on the ground: a squashed sphere with lumps, its base flattened
 * at y = 0 and its top reaching `height`, a little flattened where the tube strikes it.
 */
function rockGeometry(rand: () => number, rx: number, height: number, rz: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 5);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const waves = Array.from({ length: 7 }, () => ({
    d: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    f: 2 + rand() * 5,
    a: 0.03 + rand() * 0.05,
    p: rand() * 6.28,
  }));
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let k = 1;
    for (const w of waves) k += w.a * Math.sin(v.dot(w.d) * w.f + w.p);
    v.multiplyScalar(k);
    // squash to size; flatten the top and the base
    // a wide base: the lower half bulges out, and the stone is sunk a little into the ground
    const y = Math.max(-0.55, Math.min(0.9, v.y));
    const widen = 1 + 0.35 * Math.max(0, -v.y);
    pos.setXYZ(i, v.x * rx * widen, ((y + 0.55) / 1.45) * height, v.z * rz * widen);
  }
  g.computeVertexNormals();
  return g;
}

/** World height of the tube's bore floor below world x (for where the stream lands). */
export function boreFloorY(scene: ShishiodoshiScene, x: number): number {
  const th = scene.tube.rotation.z, p = scene.tube.position, rIn = scene.tubeSpec.radius - scene.tubeSpec.wall;
  const xl = (x - p.x - rIn * Math.sin(th)) / Math.cos(th);
  return p.y + xl * Math.sin(th) - rIn * Math.cos(th);
}
