import * as THREE from 'three';

/**
 * Cherry blossom (spring, docs/reference/ref4-four-seasons.webp): a single petal, and a whole
 * flower of five. Drawn nearly white with a pink flush toward the notched tip, so an instance's
 * colour tints them from white to deeper pink.
 */
const S = 128;

/** One petal, root at the bottom of the (x, y) box and the notched tip at the top. */
function petalPath(g: CanvasRenderingContext2D, cx: number, base: number, len: number, wid: number): void {
  g.beginPath();
  g.moveTo(cx, base);
  g.bezierCurveTo(cx - wid * 0.9, base - len * 0.25, cx - wid * 1.05, base - len * 0.85, cx - wid * 0.22, base - len * 0.98);
  g.lineTo(cx, base - len * 0.86); // the notch
  g.lineTo(cx + wid * 0.22, base - len * 0.98);
  g.bezierCurveTo(cx + wid * 1.05, base - len * 0.85, cx + wid * 0.9, base - len * 0.25, cx, base);
  g.closePath();
}

function paintPetal(g: CanvasRenderingContext2D, cx: number, base: number, len: number, wid: number): void {
  const grad = g.createLinearGradient(0, base, 0, base - len);
  grad.addColorStop(0, '#f6b8c9'); // a rosy root
  grad.addColorStop(0.35, '#fff4f7');
  grad.addColorStop(1, '#ffe6ee');
  g.fillStyle = grad;
  petalPath(g, cx, base, len, wid);
  g.fill();
  // a faint vein up the middle
  g.strokeStyle = 'rgba(232,140,165,0.35)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(cx, base);
  g.lineTo(cx, base - len * 0.7);
  g.stroke();
}

let petalCache: THREE.CanvasTexture | undefined;
let flowerCache: THREE.CanvasTexture | undefined;

/** A single petal filling the picture (alpha cut out). */
export function petalTexture(): THREE.CanvasTexture {
  if (petalCache) return petalCache;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  paintPetal(g, S / 2, S - 6, S - 12, S * 0.3);
  petalCache = new THREE.CanvasTexture(c);
  petalCache.colorSpace = THREE.SRGBColorSpace;
  petalCache.anisotropy = 4;
  return petalCache;
}

/** A five-petalled flower seen from the front, with a darker centre and a few stamens. */
export function flowerTexture(): THREE.CanvasTexture {
  if (flowerCache) return flowerCache;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  for (let i = 0; i < 5; i++) {
    g.save();
    g.rotate((i / 5) * Math.PI * 2);
    paintPetal(g, 0, 0, S * 0.47, S * 0.17);
    g.restore();
  }
  // the centre and stamens
  g.fillStyle = '#d9587f';
  g.beginPath();
  g.arc(0, 0, 4.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(214,88,127,0.85)';
  g.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
    g.stroke();
    g.fillStyle = '#f5d76e';
    g.beginPath();
    g.arc(Math.cos(a) * 12, Math.sin(a) * 12, 1.3, 0, Math.PI * 2);
    g.fill();
  }
  flowerCache = new THREE.CanvasTexture(c);
  flowerCache.colorSpace = THREE.SRGBColorSpace;
  flowerCache.anisotropy = 4;
  return flowerCache;
}

/**
 * A petal's shape as geometry (facing +z, unit box scaled to `size`), cupped a little like a real
 * petal; finely divided enough (`segments`) to bend over ripples when afloat.
 */
export function petalGeometry(size: number, segments = 4): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, segments, segments);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setXYZ(i, x * size, y * size, (0.35 * x * x + 0.1 * (y + 0.5) * (y + 0.5)) * size * 0.5);
  }
  g.computeVertexNormals();
  return g;
}
