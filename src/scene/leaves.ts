import * as THREE from 'three';
import { mulberry32 } from './random';

/**
 * A Japanese maple (Acer palmatum) leaf: seven lance-shaped lobes cut almost to the base, each with
 * a finely toothed edge, a midrib and side veins, on a slender stalk. Drawn in shades of grey so the
 * same texture can be tinted green on the branch or red and gold where it has fallen. The blade is
 * a little paler at the base and deeper toward the tips, and faintly mottled.
 */
const mapleCache = new Map<number, THREE.CanvasTexture>();
export function mapleLeafTexture(seed = 5): THREE.CanvasTexture {
  const hit = mapleCache.get(seed);
  if (hit) return hit;
  const S = 512;
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const bx = S / 2, by = S * 0.6; // where the lobes meet the stalk
  const angles = [-118, -78, -39, 0, 39, 78, 118];
  const lengths = [0.42, 0.7, 0.9, 1.0, 0.9, 0.7, 0.42].map((k) => k * S * 0.44);

  const lobePath = (angDeg: number, len: number) => {
    const a = (angDeg * Math.PI) / 180;
    const ax = Math.sin(a), ay = -Math.cos(a); // along the lobe
    const px = -ay, py = ax; // across it
    const halfW = len * 0.2;
    const pts: [number, number][] = [];
    const steps = 26;
    // up one side from the sinus to the tip, with teeth, then back down the other side
    for (const side of [-1, 1]) {
      for (let i = 0; i <= steps; i++) {
        const t = side < 0 ? i / steps : 1 - i / steps;
        const along = 0.12 + t * 0.88;
        // lance shape: widest a third of the way out, drawn to a long point
        let w = halfW * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.75))), 0.9) * (1 - 0.15 * t);
        if (t > 0.15 && t < 0.97) w *= 1 + (i % 2 === 0 ? 0.1 : -0.04) * (1 - t * 0.4); // teeth
        pts.push([bx + ax * along * len + px * w * side, by + ay * along * len + py * w * side]);
      }
    }
    return pts;
  };

  // the blade, filled light grey, lobe by lobe, with a palm where they join
  const grad = g.createRadialGradient(bx, by, S * 0.02, bx, by, S * 0.46);
  grad.addColorStop(0, '#f2f2f2');
  grad.addColorStop(1, '#bdbdbd');
  g.fillStyle = grad;
  for (let i = 0; i < angles.length; i++) {
    const p = lobePath(angles[i] + (rand() - 0.5) * 4, lengths[i] * (0.94 + rand() * 0.1));
    g.beginPath();
    g.moveTo(bx, by);
    for (const [x, y] of p) g.lineTo(x, y);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.arc(bx, by, S * 0.055, 0, Math.PI * 2);
  g.fill();

  // mottling inside the blade only
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + rand() * 0.05})`;
    g.beginPath();
    g.arc(rand() * S, rand() * S, 4 + rand() * 18, 0, Math.PI * 2);
    g.fill();
  }
  // veins: a pale midrib down each lobe, fine side veins off it
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < angles.length; i++) {
    const a = (angles[i] * Math.PI) / 180, ax = Math.sin(a), ay = -Math.cos(a);
    const len = lengths[i] * 0.93;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + ax * len, by + ay * len);
    g.stroke();
    g.lineWidth = 1.2;
    for (let k = 1; k < 7; k++) {
      const t = 0.2 + k * 0.11, sx = bx + ax * t * len, sy = by + ay * t * len;
      for (const s of [-1, 1]) {
        const da = a + s * 0.9;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + Math.sin(da) * len * 0.12, sy - Math.cos(da) * len * 0.12);
        g.stroke();
      }
    }
  }
  g.globalCompositeOperation = 'source-over';
  // the stalk
  g.strokeStyle = '#cfcfcf';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(bx, by);
  g.quadraticCurveTo(bx + S * 0.03, by + S * 0.2, bx + S * 0.01, by + S * 0.38);
  g.stroke();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  mapleCache.set(seed, t);
  return t;
}

/**
 * The leaf's surface (unit size, facing +z): not flat. Each leaf cups a little, droops toward its
 * tips and has a crease along the middle, so light and shadow break across it as on a real leaf.
 */
export function leafGeometry(size: number, segments = 4): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, segments, segments);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) + 0.1; // the lobes meet a little below the centre
    const r = Math.hypot(x, y);
    const z = -0.22 * r * r + 0.06 * Math.abs(x) - 0.05 * Math.max(0, r - 0.3);
    pos.setXYZ(i, x * size, (y - 0.1) * size, z * size);
  }
  g.computeVertexNormals();
  return g;
}
