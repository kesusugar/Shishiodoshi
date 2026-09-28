import * as THREE from 'three';
import { bambooFlesh, bambooSkin } from '../render/textures';

/**
 * A length of bamboo culm along local +x, from x = -back (closed, cut just behind a node) to the mouth
 * at x = front, where it is cut on a slant: the lower lip reaches `front`, the upper lip stops `cut`
 * short of it, so the opening faces up and forward. Units are metres.
 */
export interface CulmSpec {
  back: number;
  front: number;
  radius: number;
  wall: number;
  cut: number;
  /** Node positions (x). A node inside the bore closes it: the bore runs from `diaphragm` to the mouth. */
  nodes: number[];
  diaphragm: number;
  age: number;
  fresh: string;
  aged: string;
  seed: number;
}

const SEG_AROUND = 64;

export function buildCulm(spec: CulmSpec): THREE.Group {
  const { back, front, radius: R, wall, cut } = spec;
  const len = back + front;

  // Node ridges swell the culm a little; it also tapers very slightly toward the mouth.
  const bulge = (x: number) => {
    let b = -0.04 * R * ((x + back) / len);
    for (const xn of spec.nodes) {
      const d = x - xn;
      b += 0.06 * R * Math.exp(-((d / 0.005) ** 2)) + 0.025 * R * Math.exp(-((d / 0.02) ** 2));
    }
    return b;
  };
  const dBulge = (x: number) => (bulge(x + 1e-4) - bulge(x - 1e-4)) / 2e-4;
  // The slanted cut is the plane x = front - cut * (1 + y / R) / 2.
  const cutX = (y: number) => front - (cut * (1 + y / R)) / 2;
  const cutNormal = new THREE.Vector3(1, cut / (2 * R), 0).normalize();

  const skin = bambooSkin({
    length: len,
    circumference: 2 * Math.PI * R,
    nodes: spec.nodes.map((x) => (x + back) / len),
    age: spec.age,
    fresh: spec.fresh,
    aged: spec.aged,
    seed: spec.seed,
  });
  const flesh = bambooFlesh(spec.seed + 1);

  const skinMat = new THREE.MeshPhysicalMaterial({
    map: skin.color,
    bumpMap: skin.bump,
    bumpScale: 2.0,
    roughnessMap: skin.rough,
    roughness: 1,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    sheen: 0.1,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#fff4d8'),
  });
  const fleshMat = new THREE.MeshStandardMaterial({
    map: flesh.color,
    bumpMap: flesh.bump,
    bumpScale: 1.5,
    roughnessMap: flesh.rough,
    roughness: 1,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();

  // Outer skin
  {
    const ns = 160;
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= SEG_AROUND; j++) {
      const phi = (j / SEG_AROUND) * Math.PI * 2;
      const s = Math.sin(phi), c = Math.cos(phi);
      for (let i = 0; i <= ns; i++) {
        // sample x more densely near the ends so the slant and the nodes are smooth
        const t = i / ns;
        const xEnd = cutX((R + bulge(front)) * s);
        let x = -back + t * (xEnd + back);
        const r = R + bulge(x);
        if (i === ns) x = cutX(r * s);
        pos.push(x, r * s, r * c);
        const n = new THREE.Vector3(-dBulge(x), s, c).normalize();
        nrm.push(n.x, n.y, n.z);
        uv.push((x + back) / len, j / SEG_AROUND);
      }
    }
    const row = ns + 1;
    for (let j = 0; j < SEG_AROUND; j++) {
      for (let i = 0; i < ns; i++) {
        const a = j * row + i, b = a + 1, c2 = a + row, d = c2 + 1;
        idx.push(a, c2, b, b, c2, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, skinMat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // Bore, cut face (the ring of wall exposed by the slant) and the node diaphragm, all in flesh
  {
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    const add = (p: THREE.Vector3, n: THREE.Vector3, u: number, v: number) => {
      pos.push(p.x, p.y, p.z);
      nrm.push(n.x, n.y, n.z);
      uv.push(u, v);
      return pos.length / 3 - 1;
    };
    const rIn = R - wall;
    const nsIn = 40;
    // bore: normals face the axis
    const bore: number[][] = [];
    for (let j = 0; j <= SEG_AROUND; j++) {
      const phi = (j / SEG_AROUND) * Math.PI * 2, s = Math.sin(phi), c = Math.cos(phi);
      const xEnd = cutX(rIn * s);
      const col: number[] = [];
      for (let i = 0; i <= nsIn; i++) {
        const x = spec.diaphragm + (i / nsIn) * (xEnd - spec.diaphragm);
        col.push(add(new THREE.Vector3(x, rIn * s, rIn * c), new THREE.Vector3(0, -s, -c), x * 3, j / SEG_AROUND));
      }
      bore.push(col);
    }
    for (let j = 0; j < SEG_AROUND; j++) {
      for (let i = 0; i < nsIn; i++) {
        const a = bore[j][i], b = bore[j][i + 1], c2 = bore[j + 1][i], d = bore[j + 1][i + 1];
        idx.push(a, b, c2, b, d, c2);
      }
    }
    // cut face between the outer and inner lips
    for (let j = 0; j <= SEG_AROUND; j++) {
      const phi = (j / SEG_AROUND) * Math.PI * 2, s = Math.sin(phi), c = Math.cos(phi);
      const rOut = R + bulge(front);
      const o = new THREE.Vector3(cutX(rOut * s), rOut * s, rOut * c);
      const i2 = new THREE.Vector3(cutX(rIn * s), rIn * s, rIn * c);
      add(o, cutNormal, j / SEG_AROUND * 8, 0);
      add(i2, cutNormal, j / SEG_AROUND * 8, 0.12);
    }
    const base = pos.length / 3 - (SEG_AROUND + 1) * 2;
    for (let j = 0; j < SEG_AROUND; j++) {
      const a = base + j * 2, b = a + 1, c2 = a + 2, d = a + 3;
      idx.push(a, c2, b, b, c2, d);
    }
    // diaphragm and back cap: discs across the culm
    const disc = (x: number, r: number, facing: number) => {
      const center = add(new THREE.Vector3(x, 0, 0), new THREE.Vector3(facing, 0, 0), 0.5, 0.5);
      const ring: number[] = [];
      for (let j = 0; j <= SEG_AROUND; j++) {
        const phi = (j / SEG_AROUND) * Math.PI * 2;
        ring.push(add(new THREE.Vector3(x, r * Math.sin(phi), r * Math.cos(phi)), new THREE.Vector3(facing, 0, 0), 0.5 + 0.5 * Math.cos(phi), 0.5 + 0.5 * Math.sin(phi)));
      }
      for (let j = 0; j < SEG_AROUND; j++) {
        if (facing > 0) idx.push(center, ring[j], ring[j + 1]);
        else idx.push(center, ring[j + 1], ring[j]);
      }
    };
    disc(spec.diaphragm, rIn, 1);
    disc(-back, R + bulge(-back), -1);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, fleshMat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  return group;
}

/** Point on the lower lip of the mouth (local coordinates): where water pours from. */
export function lipPoint(spec: CulmSpec): THREE.Vector3 {
  return new THREE.Vector3(spec.front, -(spec.radius - spec.wall), 0);
}
