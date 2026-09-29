import * as THREE from 'three';
import type { Canopy } from '../render/canopy';
import { mulberry32 } from './random';
import type { Season } from './seasons';
import { leafGeometry, mapleLeafTexture } from './leaves';
import { mossyRockMaterial } from './rockMaterial';
import { translucentLeaves } from './translucent';
import { buildCherryBranch } from './cherryBranch';
import { petalGeometry } from './blossom';
import { petalTexture } from './blossom';
import { rockGeometry } from './shishiodoshi';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The garden around the shishi-odoshi (docs/reference/ref3-ideal.png): wet gravel at its foot, moss-
 * covered boulders behind, clumps of fern, a maple branch hanging into the foreground, and a few
 * fallen leaves floating on the basin. These are what make it read as a place rather than an object
 * on a floor. Everything is placed from a seeded random sequence, so it is the same on every load.
 */
export interface Garden {
  root: THREE.Group;
  /** The maple leaf texture (for the leaves afloat on the basin too). */
  leafTexture: THREE.Texture;
  update(time: number, wind: number): void;
}

interface Keepout { x: number; z: number; r: number }

/** Colours of fallen maple leaves: scarlet, gold, crimson, and one browning. */
export const FALLEN_COLOURS = ['#c8321c', '#d98b1c', '#b52a18', '#8a6a1a'];

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
  // where things stand on the ground (their contact shadows): basin, striker, posts, standing culm
  const contacts: { x: number; z: number; rx: number; rz: number }[] = [
    { x: basin.center.x, z: basin.center.z, rx: 0.42, rz: 0.42 },
    { x: -0.62, z: 0, rx: 0.24, rz: 0.2 },
    { x: -0.34, z: -0.058, rx: 0.05, rz: 0.05 },
    { x: -0.34, z: 0.058, rx: 0.05, rz: 0.05 },
    { x: 0.42, z: -0.01, rx: 0.08, rz: 0.08 },
  ];

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
      // too small to cast shadows that matter; they still receive them
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }

  // ---- mossy boulders behind and to the sides
  {
    const mat = mossyRockMaterial(season, 55);
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
      contacts.push({ x, z, rx: w * 0.75, rz: d * 0.75 });
      const g = rockGeometry(rand, w / 2, h, d / 2);
      const r = new THREE.Mesh(g, mat);
      r.position.set(x, -0.03, z);
      r.rotation.y = rand() * 6.28;
      r.castShadow = r.receiveShadow = true;
      root.add(r);
    }
  }

  root.add(contactShadows(contacts));

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
    const col = new THREE.Color(), leaf = new THREE.Color(season.garden.ferns);
    let n = 0;
    for (const [cx, cz, size] of clumps) {
      for (let i = 0; i < 9; i++) {
        const yaw = (i / 9) * Math.PI * 2 + rand() * 0.6;
        p.set(cx + (rand() - 0.5) * 0.04, 0, cz + (rand() - 0.5) * 0.04);
        q.setFromEuler(e.set(0, yaw, 0.35 + rand() * 0.5, 'YXZ'));
        const k = size * (0.7 + rand() * 0.5) * season.garden.fernScale;
        s.set(k, k, k);
        mesh.setMatrixAt(n, m.compose(p, q, s));
        col.copy(leaf).multiplyScalar(0.8 + rand() * 0.6);
        col.offsetHSL((rand() - 0.5) * 0.04, 0, 0);
        mesh.setColorAt(n, col);
        n++;
      }
    }
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // ---- a maple branch hanging into the foreground on the right (out of focus, as in ref3): a
  // drooping bough with side twigs, the leaves in opposite pairs along them and fanned at their tips
  const mapleTex = mapleLeafTexture();
  mapleTex.anisotropy = 4;
  const leafMat = new THREE.MeshStandardMaterial({ map: mapleTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55 });
  translucentLeaves(leafMat, new THREE.Color(season.foliage.leafLit));
  const twigMat = new THREE.MeshStandardMaterial({ color: '#3a2a1d', roughness: 0.85 });
  const branches: THREE.Group[] = [];
  if (season.garden.branch === 'cherry') {
    const cherry = buildCherryBranch(rand, new THREE.Color('#ffb0c8'));
    branches.push(cherry.group);
    root.add(cherry.group);
  } else if (season.garden.branch === 'maple') {
    // it comes in from beyond the right edge of the main view and droops down its right side
    const base = new THREE.Vector3(1.0, 1.02, 0.62);
    const bough = new THREE.CatmullRomCurve3([
      base.clone(),
      new THREE.Vector3(0.8, 0.88, 0.6),
      new THREE.Vector3(0.64, 0.72, 0.57),
      new THREE.Vector3(0.53, 0.56, 0.55),
    ]);
    const group = new THREE.Group();
    group.position.copy(base);
    const tubes: THREE.BufferGeometry[] = [new THREE.TubeGeometry(bough, 40, 0.007, 6)];
    const twigs: THREE.CatmullRomCurve3[] = [];
    for (let i = 0; i < 16; i++) {
      const t = 0.08 + (i / 15) * 0.9 + (rand() - 0.5) * 0.04;
      const p0 = bough.getPointAt(Math.min(t, 1));
      const side = i % 2 === 0 ? 1 : -1;
      const len = 0.1 + rand() * 0.12;
      const dir = new THREE.Vector3(-0.4 - rand() * 0.4, -0.35 - rand() * 0.4, side * (0.5 + rand() * 0.4)).normalize();
      const p2 = p0.clone().addScaledVector(dir, len);
      const p1 = p0.clone().lerp(p2, 0.5).add(new THREE.Vector3(0, 0.02, 0));
      const twig = new THREE.CatmullRomCurve3([p0, p1, p2]);
      twigs.push(twig);
      tubes.push(new THREE.TubeGeometry(twig, 8, 0.0028, 5));
    }
    twigs.push(bough);
    const twigMesh = new THREE.Mesh(mergeGeometries(tubes), twigMat);
    twigMesh.position.sub(base);
    twigMesh.receiveShadow = true;
    group.add(twigMesh);

    // leaves: pairs along each twig and a fan at its tip, stalks toward the twig
    const spots: { p: THREE.Vector3; along: THREE.Vector3; side: number }[] = [];
    for (const tw of twigs) {
      const n = tw === bough ? 8 : 5;
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const p = tw.getPointAt(t), along = tw.getTangentAt(t);
        spots.push({ p, along, side: 1 }, { p, along, side: -1 });
      }
      if (tw !== bough) {
        const tip = tw.getPointAt(1), along = tw.getTangentAt(1);
        for (let f = 0; f < 7; f++) spots.push({ p: tip, along, side: (f - 3) / 3 });
      }
    }
    const count = spots.length;
    const mesh = new THREE.InstancedMesh(leafGeometry(0.065), leafMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color(), leaf = new THREE.Color(season.foliage.leaf), lit = new THREE.Color(season.foliage.leafLit);
    const palette = season.garden.branchLeaves, paletteTotal = palette?.reduce((t, c) => t + c.weight, 0) ?? 0;
    const up = new THREE.Vector3(0, 1, 0), out = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
    const normal = new THREE.Vector3(), tipNow = new THREE.Vector3(), tipWant = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const sp = spots[i];
      // the leaf hangs out to its side of the twig on a stalk; its blade faces up and toward the open
      // side of the garden (the camera), each at its own angle
      out.crossVectors(sp.along, up).normalize().multiplyScalar(sp.side).addScaledVector(sp.along, 0.5).addScaledVector(up, -0.4).normalize();
      p.copy(sp.p).addScaledVector(out, 0.035 + rand() * 0.02).sub(base);
      normal.set((rand() - 0.5) * 1.2, 0.7 + rand() * 0.3, 0.6 + rand() * 0.4).normalize();
      q.setFromUnitVectors(zAxis, normal);
      // point its tip away from the twig (as far as the blade's plane allows)
      tipNow.set(0, 1, 0).applyQuaternion(q);
      tipWant.copy(out).addScaledVector(normal, -out.dot(normal)).normalize();
      q2.setFromUnitVectors(tipNow, tipWant);
      q.premultiply(q2);
      q2.setFromAxisAngle(normal.applyQuaternion(q2), (rand() - 0.5) * 0.8);
      q.premultiply(q2);
      s.setScalar(0.75 + rand() * 0.5);
      mesh.setMatrixAt(i, m.compose(p, q, s));
      if (palette) {
        // the season's own colours, picked by weight, each leaf a little lighter or darker
        let pick = rand() * paletteTotal;
        let chosen = palette[0].color;
        for (const c of palette) {
          if ((pick -= c.weight) <= 0) {
            chosen = c.color;
            break;
          }
        }
        col.set(chosen).multiplyScalar(0.75 + rand() * 0.5);
      } else {
        // deep greens, some paler where young; a few already turning
        col.copy(leaf).lerp(lit, rand() * rand() * 0.6).multiplyScalar(0.55 + rand() * 0.55);
        if (rand() < 0.03) col.set('#b8761c');
      }
      mesh.setColorAt(i, col);
    }
    // it takes the dappled shadow (so it is not evenly lit); casting its own would cost more than it shows
    mesh.receiveShadow = true;
    group.add(mesh);
    branches.push(group);
    root.add(group);
  }

  // ---- trees behind (out of focus they give the backdrop real depth), and a stone lantern
  {
    const bark = new THREE.MeshStandardMaterial({ color: '#5a4b3a', roughness: 0.95 });
    for (const [x, z, r] of [[-1.7, -2.2, 0.09], [-0.6, -2.8, 0.13], [0.5, -2.4, 0.07], [1.4, -2.9, 0.12], [2.1, -1.9, 0.08], [-2.4, -1.4, 0.1], [0.05, -3.6, 0.16]] as const) {
      const g2 = new THREE.CylinderGeometry(r * 0.75, r, 4, 12, 4);
      const pos = g2.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + Math.sin(pos.getY(i) * 1.3 + x) * 0.06);
      g2.computeVertexNormals();
      const t = new THREE.Mesh(g2, bark);
      t.position.set(x, 2, z);
      t.castShadow = t.receiveShadow = true;
      root.add(t);
    }
    const stoneMat = mossyRockMaterial(season, 77);
    const lantern = new THREE.Group();
    const part = (geo: THREE.BufferGeometry, y: number, mat: THREE.Material = stoneMat) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.castShadow = m.receiveShadow = true;
      lantern.add(m);
      return m;
    };
    part(new THREE.CylinderGeometry(0.13, 0.16, 0.08, 6), 0.04);
    part(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 12), 0.28);
    part(new THREE.CylinderGeometry(0.14, 0.1, 0.06, 6), 0.51);
    // the fire box, with a warm glow in its windows
    const glow = new THREE.MeshStandardMaterial({ color: '#2a2016', emissive: new THREE.Color('#ffb060'), emissiveIntensity: 1.6 });
    part(new THREE.BoxGeometry(0.17, 0.17, 0.17), 0.63);
    part(new THREE.BoxGeometry(0.1, 0.1, 0.175), 0.63, glow);
    part(new THREE.BoxGeometry(0.175, 0.1, 0.1), 0.63, glow);
    const roof = part(new THREE.ConeGeometry(0.26, 0.14, 6), 0.78);
    roof.rotation.y = Math.PI / 6;
    part(new THREE.SphereGeometry(0.04, 12, 8), 0.87);
    lantern.position.set(-1.15, 0, -0.95);
    lantern.rotation.y = 0.4;
    root.add(lantern);
  }

  // ---- fallen leaves on the ground (those afloat on the basin are render/water/floatingLeaves.ts)
  {
    const { colors, tone, count, size: leafSize } = season.garden.litter;
    if (count > 0) {
      const petals = season.garden.litter.shape === 'petal';
      const fallenMat = new THREE.MeshStandardMaterial({ map: petals ? petalTexture() : mapleTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
      const mesh = new THREE.InstancedMesh((petals ? petalGeometry(leafSize) : leafGeometry(leafSize)).rotateX(-Math.PI / 2), fallenMat, count);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
      const col = new THREE.Color();
      for (let i = 0; i < count; i++) {
        col.set(colors[Math.floor(rand() * colors.length)]).multiplyScalar(tone);
        let x = 0, z = 0;
        for (let k = 0; k < 20; k++) {
          x = -0.9 + rand() * 1.8;
          z = -0.2 + rand() * 0.9;
          if (free(x, z, 0.02)) break;
        }
        // a heap of leaves lies a little above the last: each at its own height, tilted a little
        const y = count > 20 ? 0.012 + (i % 5) * 0.003 : 0.012;
        p.set(x, y, z);
        q.setFromEuler(e.set((rand() - 0.5) * 0.4, rand() * 6.28, (rand() - 0.5) * 0.4));
        mesh.setMatrixAt(i, m.compose(p, q, sc));
        mesh.setColorAt(i, col);
      }
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }

  return {
    root,
    leafTexture: mapleTex,
    update(time: number, wind: number) {
      // branches sway with the wind
      for (const [i, b] of branches.entries()) {
        // about where the bough comes in, so its tip swings most
        b.rotation.z = wind * 0.06 * Math.sin(time * 0.9 + i) + wind * 0.03 * Math.sin(time * 2.3 + i * 2);
        b.rotation.x = wind * 0.04 * Math.sin(time * 0.7 + i * 1.7);
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


/**
 * Soft dark patches on the ground where things stand (ambient occlusion the shadow map cannot give:
 * the sky is hidden right at an object's foot). One instanced disc with a radial fade.
 */
function contactShadows(spots: { x: number; z: number; rx: number; rz: number }[]): THREE.InstancedMesh {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: tex, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((sp, i) => mesh.setMatrixAt(i, m.makeScale(sp.rx, 1, sp.rz).setPosition(sp.x, 0.002, sp.z)));
  mesh.renderOrder = -1;
  return mesh;
}
