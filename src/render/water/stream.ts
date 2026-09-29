import * as THREE from 'three';
import { ENV_GLSL, type EnvUniforms } from '../env';

/**
 * Falling water: a tube along the parabola from where it leaves a lip. The flow rate is the same all
 * the way down, so as the water speeds up the stream gets thinner (r = sqrt(Q / (pi v))). Its surface
 * carries small travelling bulges (the start of the break-up into drops). Used for the kakei's stream
 * and for the pour out of the tube's mouth; both are reshaped from the simulation every frame.
 *
 * A pour over a wide lip leaves as a sheet as wide as the wetted crest: its cross-section is an
 * ellipse that surface tension pulls in toward a round jet within a few centimetres of falling
 * (the area stays Q / v), and the sheet tears into strands and then drops at different moments
 * across its width (uTear).
 */

const G = 9.81;
const SEGS = 160;
const AROUND = 12;

export class Stream {
  readonly mesh: THREE.Mesh;
  private readonly uTime = { value: 0 };
  private readonly uEndY = { value: -1 };
  /** How much air the water carries (white streaks): 0 for the clear kakei stream, more for the pour. */
  readonly uFoam = { value: 0 };
  /** Time after leaving the lip at which the column has broken into drops (s); 0 = never. */
  readonly uBreak = { value: 0 };
  /** How unevenly the break-up happens across the stream (0 = the whole column pinches at once). */
  readonly uTear = { value: 0 };
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
      uniforms: { ...env, uTime: this.uTime, uEndY: this.uEndY, uFoam: this.uFoam, uBreak: this.uBreak, uTear: this.uTear },
      transparent: true,
      depthWrite: true,
      vertexShader: /* glsl */ `
        attribute vec3 aAlong;   // time since leaving the lip (s), distance from the axis (m), around (0..1)
        uniform float uTime, uBreak, uTear;
        varying vec3 vPos, vNrm;
        varying float vT;
        varying vec2 vFlow;      // where this bit of water left the lip (time), and around the stream
        void main() {
          // travelling bulges: the water that left the lip at time (uTime - t) carries its own wobble
          float born = uTime - aAlong.x;
          float bulge = 0.22 * sin(born * 37.0) + 0.14 * sin(born * 61.0 + 1.3) + 0.08 * sin(born * 97.0 + 2.1);
          // the column starts smooth and grows lumpier as it falls, on its way to breaking into drops
          bulge *= smoothstep(0.0, 0.08, aAlong.x) * (1.0 + aAlong.x * 3.0);
          vec3 p = position + normal * aAlong.y * bulge;
          // break-up: the column pinches into a string of beads that travel with the water; each bead
          // holds the water of a stretch of column, so it is a little fatter than the column was
          // (a torn sheet does not pinch into beads: it frays into holes, see the fragment shader)
          if (uBreak > 0.0 && uTear == 0.0) {
            float k = smoothstep(uBreak * 0.6, uBreak * 1.4, aAlong.x);
            float f = fract(born * 60.0 + 0.3 * sin(born * 11.0));
            // a bead over part of each period, a gap over the rest
            float x = f / 0.55;
            float bead = x < 1.0 ? sqrt(max(0.0, 1.0 - pow(2.0 * x - 1.0, 2.0))) * 1.5 : 0.0;
            p -= normal * aAlong.y * (1.0 + bulge) * (1.0 - mix(1.0, bead, k));
          }
          vPos = (modelMatrix * vec4(p, 1.0)).xyz;
          vNrm = normalize(mat3(modelMatrix) * normal);
          vFlow = vec2(born, aAlong.z);
          vT = aAlong.x;
          gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
        }`,
      fragmentShader:
        ENV_GLSL +
        /* glsl */ `
        uniform float uEndY, uFoam, uBreak, uTear;
        varying vec3 vPos, vNrm;
        varying vec2 vFlow;
        varying float vT;
        float h21(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
        float n21(vec2 p) {
          vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          if (vPos.y < uEndY) discard;   // it has landed (in the tube, on the bamboo, in the basin)
          // a torn sheet: holes open where it is thinnest and spread until only strands, then nothing,
          // are left (the drops it breaks into are particles, see SimView); they ride with the water
          if (uTear > 0.0) {
            float tear = smoothstep(uBreak * 0.55, uBreak * 1.5, vT);
            float edge = abs(sin(6.2831853 * vFlow.y));   // the sheet's side edges (around = 1/4, 3/4) go first
            float holes = n21(vec2(vFlow.x * 45.0, vFlow.y * 9.0)) * 0.65 + n21(vec2(vFlow.x * 110.0, vFlow.y * 23.0)) * 0.35;
            if (holes < tear * (1.1 + 0.4 * edge) - 0.1) discard;
          }
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
          float through = (1.0 - F) * (1.0 - foam) * 0.72;
          float a = 1.0 - through;
          // sunlight caught inside the column: it glows a little where the sun is behind or beside it
          float sunIn = pow(max(dot(-v, uSunDir) * 0.5 + 0.5, 0.0), 3.0);
          vec3 col = refl * F + white * foam + (vec3(0.01, 0.025, 0.028) + uSunCol * 0.035 * sunIn) * (1.0 - F);
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
  set(start: THREE.Vector3, velocity: THREE.Vector3, flow: number, bottomY: number, endY: number, sheetWidth = 0): void {
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
      // the cross-section's half-width (sideways, z) and half-thickness (in the plane of the fall):
      // a sheet at the lip, pulled in toward the round jet (radius r) as it falls
      const wide = Math.max(r, (sheetWidth / 2) * Math.exp(-t / 0.045) + r * (1 - Math.exp(-t / 0.045)));
      const thick = (r * r) / wide;
      vel.normalize();
      side.crossVectors(vel, zAxis).normalize();
      up.crossVectors(side, vel).normalize();
      for (let j = 0; j <= AROUND; j++) {
        const phi = (j / AROUND) * Math.PI * 2;
        const cs = Math.cos(phi), sn = Math.sin(phi);
        const k = i * (AROUND + 1) + j;
        this.pos[k * 3] = c0.x + side.x * cs * thick + up.x * sn * wide;
        this.pos[k * 3 + 1] = c0.y + side.y * cs * thick + up.y * sn * wide;
        this.pos[k * 3 + 2] = c0.z + side.z * cs * thick + up.z * sn * wide;
        // the ellipse's normal
        nn.copy(side).multiplyScalar(cs / thick).addScaledVector(up, sn / wide).normalize();
        this.nrm[k * 3] = nn.x;
        this.nrm[k * 3 + 1] = nn.y;
        this.nrm[k * 3 + 2] = nn.z;
        this.along[k * 3] = t;
        this.along[k * 3 + 1] = Math.hypot(cs * thick, sn * wide); // this point's distance from the axis
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
