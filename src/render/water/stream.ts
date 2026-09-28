import * as THREE from 'three';
import { ENV_GLSL, type EnvUniforms } from '../env';

/**
 * Falling water: a tube along the parabola from where it leaves a lip. The flow rate is the same all
 * the way down, so as the water speeds up the stream gets thinner (r = sqrt(Q / (pi v))). Its surface
 * carries small travelling bulges (the start of the break-up into drops). Used for the kakei's stream
 * and for the pour out of the tube's mouth; both are reshaped from the simulation every frame.
 */

const G = 9.81;
const SEGS = 64;
const AROUND = 12;

export class Stream {
  readonly mesh: THREE.Mesh;
  private readonly uTime = { value: 0 };
  private readonly uEndY = { value: -1 };
  /** How much air the water carries (white streaks): 0 for the clear kakei stream, more for the pour. */
  readonly uFoam = { value: 0 };
  private readonly pos: Float32Array;
  private readonly nrm: Float32Array;
  private readonly along: Float32Array;
  private readonly geo: THREE.BufferGeometry;

  constructor(env: EnvUniforms, private readonly thicken = 1) {
    const n = (SEGS + 1) * (AROUND + 1);
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    this.along = new Float32Array(n * 3);
    const idx: number[] = [];
    for (let i = 0; i < SEGS; i++) {
      for (let j = 0; j < AROUND; j++) {
        const a0 = i * (AROUND + 1) + j, b0 = a0 + 1, c1 = a0 + AROUND + 1, d = c1 + 1;
        idx.push(a0, c1, b0, b0, c1, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlong', new THREE.BufferAttribute(this.along, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.geo = g;

    // A rod of clear water, blended over what is behind it: its rim reflects the garden (Fresnel),
    // the sun glints off it, and in a pour, streaks of entrained air ride along with the water.
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...env, uTime: this.uTime, uEndY: this.uEndY, uFoam: this.uFoam },
      transparent: true,
      depthWrite: true,
      vertexShader: /* glsl */ `
        attribute vec3 aAlong;   // time since leaving the lip (s), radius (m), around (0..1)
        uniform float uTime;
        varying vec3 vPos, vNrm;
        varying vec2 vFlow;      // where this bit of water left the lip (time), and around the stream
        void main() {
          // travelling bulges: the water that left the lip at time (uTime - t) carries its own wobble
          float born = uTime - aAlong.x;
          float bulge = 0.22 * sin(born * 37.0) + 0.14 * sin(born * 61.0 + 1.3) + 0.08 * sin(born * 97.0 + 2.1);
          bulge *= smoothstep(0.0, 0.08, aAlong.x);
          vec3 p = position + normal * aAlong.y * bulge;
          vPos = (modelMatrix * vec4(p, 1.0)).xyz;
          vNrm = normalize(mat3(modelMatrix) * normal);
          vFlow = vec2(born, aAlong.z);
          gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
        }`,
      fragmentShader:
        ENV_GLSL +
        /* glsl */ `
        uniform float uEndY, uFoam;
        varying vec3 vPos, vNrm;
        varying vec2 vFlow;
        float h21(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
        float n21(vec2 p) {
          vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          if (vPos.y < uEndY) discard;   // it has landed (in the tube, on the bamboo, in the basin)
          vec3 n = normalize(vNrm), v = normalize(vPos - cameraPosition);
          if (dot(n, v) > 0.0) n = -n;
          float c = clamp(-dot(v, n), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
          vec3 r = reflect(v, n);
          vec3 refl = envColor(r) + uSunCol * pow(max(dot(r, uSunDir), 0.0), 400.0) * 6.0;
          // through the rod: the view is bent strongly toward the axis
          // entrained air: streaks that move with the water (they are fixed to where it left the lip)
          float streak = n21(vec2(vFlow.x * 60.0, vFlow.y * 7.0)) * n21(vec2(vFlow.x * 23.0 + 3.1, vFlow.y * 13.0));
          float foam = uFoam * smoothstep(0.15, 0.45, streak);
          vec3 white = vec3(0.75, 0.8, 0.8) * (0.35 + 0.25 * max(dot(n, uSunDir), 0.0)) + uSunCol * 0.04;
          // what is left of the view straight through: most of it, a little tinted
          float through = (1.0 - F) * (1.0 - foam) * 0.82;
          float a = 1.0 - through;
          vec3 col = refl * F + white * foam + vec3(0.01, 0.025, 0.028) * (1.0 - F);
          gl_FragColor = vec4(col / max(a, 1e-3), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /**
   * Reshape: water leaving `start` (world) at `velocity` with flow `flow` (m^3/s), drawn down to
   * height `bottomY`; the part below `endY` is hidden (it has landed).
   */
  set(start: THREE.Vector3, velocity: THREE.Vector3, flow: number, bottomY: number, endY: number): void {
    if (flow <= 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.uEndY.value = endY;
    const a = -G / 2, b = velocity.y, c = start.y - bottomY;
    const tEnd = Math.max(0.02, (-b - Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a));
    const c0 = new THREE.Vector3(), vel = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), nn = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= SEGS; i++) {
      const t = (i / SEGS) ** 1.4 * tEnd; // denser near the lip, where the stream bends most
      c0.set(start.x + velocity.x * t, start.y + velocity.y * t - (G * t * t) / 2, start.z + velocity.z * t);
      vel.set(velocity.x, velocity.y - G * t, velocity.z);
      const speed = vel.length();
      const r = this.thicken * Math.sqrt(flow / (Math.PI * Math.max(speed, 0.15)));
      vel.normalize();
      side.crossVectors(vel, zAxis).normalize();
      up.crossVectors(side, vel).normalize();
      for (let j = 0; j <= AROUND; j++) {
        const phi = (j / AROUND) * Math.PI * 2;
        nn.copy(side).multiplyScalar(Math.cos(phi)).addScaledVector(up, Math.sin(phi));
        const k = i * (AROUND + 1) + j;
        this.pos[k * 3] = c0.x + nn.x * r;
        this.pos[k * 3 + 1] = c0.y + nn.y * r;
        this.pos[k * 3 + 2] = c0.z + nn.z * r;
        this.nrm[k * 3] = nn.x;
        this.nrm[k * 3 + 1] = nn.y;
        this.nrm[k * 3 + 2] = nn.z;
        this.along[k * 3] = t;
        this.along[k * 3 + 1] = r;
        this.along[k * 3 + 2] = j / AROUND;
      }
    }
    for (const name of ['position', 'normal', 'aAlong']) this.geo.getAttribute(name).needsUpdate = true;
  }

  /** Hide the stream below this height (where it lands). */
  setEnd(endY: number): void {
    this.uEndY.value = endY;
  }

  update(time: number): void {
    this.uTime.value = time;
  }
}
