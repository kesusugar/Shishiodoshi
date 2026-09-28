import * as THREE from 'three';
import { mulberry32 } from '../scene/random';

/**
 * Leaves overhead (ref2's dappled light). An unseen layer of leaves at `height` casts real shadows
 * from the sun, so light reaches the scene only through the gaps and sways with the wind. The water
 * shaders read the same leaf texture (CANOPY_GLSL) so the caustics fall in the same patches of sun.
 */
/** The leaf texture covers `tile` metres; the layer is `size` across (the texture repeats). */
export const CANOPY = { height: 1.6, tile: 2.4, size: 9.6, center: new THREE.Vector2(0.05, 0.0) };
const REPEAT = CANOPY.size / CANOPY.tile;

export const CANOPY_GLSL = /* glsl */ `
uniform sampler2D uCanopy;
uniform vec2 uCanopyShift;
// how much sun gets through the leaves along the sun's direction from p (1 = a gap, 0 = leaf)
float canopyLight(vec3 p, vec3 sunDir) {
  float t = (${CANOPY.height.toFixed(3)} - p.y) / max(sunDir.y, 0.05);
  vec2 q = p.xz + sunDir.xz * t;
  // the plane's uv runs along +x and -z (it is a PlaneGeometry turned to face up)
  vec2 d = (q - vec2(${CANOPY.center.x.toFixed(3)}, ${CANOPY.center.y.toFixed(3)})) / ${CANOPY.tile.toFixed(3)};
  vec2 uv = vec2(d.x, -d.y) + ${(REPEAT / 2).toFixed(4)} + uCanopyShift;
  return 1.0 - smoothstep(0.35, 0.65, textureLod(uCanopy, uv, 2.0).a);
}
`;

export class Canopy {
  readonly mesh: THREE.Mesh;
  readonly texture: THREE.CanvasTexture;
  readonly uniforms = { uCanopy: { value: null as THREE.Texture | null }, uCanopyShift: { value: new THREE.Vector2() } };

  constructor() {
    const S = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const g = canvas.getContext('2d')!;
    const rand = mulberry32(77);
    // clusters of leaves, with about half the sky showing through
    g.fillStyle = '#000';
    const clusters = Array.from({ length: 70 }, () => ({ x: rand() * S, y: rand() * S, r: 60 + rand() * 140 }));
    for (let i = 0; i < 5200; i++) {
      const c = clusters[Math.floor(rand() * clusters.length)];
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * c.r;
      const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
      const len = 9 + rand() * 12;
      for (const [ox, oy] of [[0, 0], [-S, 0], [S, 0], [0, -S], [0, S]]) {
        g.beginPath();
        g.ellipse(x + ox, y + oy, len, len * 0.42, rand() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    }
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.repeat.set(REPEAT, REPEAT);
    this.uniforms.uCanopy.value = this.texture;

    // invisible in the picture, but it casts shadows through its alpha
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(CANOPY.size, CANOPY.size), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(CANOPY.center.x, CANOPY.height, CANOPY.center.y);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  }

  /** Sway with the wind: the leaves drift a little back and forth. */
  update(time: number, wind: number): void {
    const s = this.uniforms.uCanopyShift.value;
    s.set(
      wind * 0.012 * (Math.sin(time * 0.7) + 0.5 * Math.sin(time * 1.9 + 1.3)),
      wind * 0.008 * (Math.sin(time * 0.5 + 2.0) + 0.4 * Math.sin(time * 2.3)),
    );
    this.texture.offset.copy(s);
  }
}
