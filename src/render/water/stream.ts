import * as THREE from 'three';
import { ENV_GLSL, type EnvUniforms } from '../env';

/**
 * The thin stream from the kakei: a tube along the falling water's parabola. The flow rate is the
 * same all the way down, so as the water speeds up the stream gets thinner (r = sqrt(Q / (pi v))).
 * Its surface ripples with small travelling bulges (the start of the break-up into drops).
 */
export interface StreamSpec {
  /** Where the water leaves the lip (world) and its horizontal velocity there (m/s). */
  start: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Flow rate (m^3/s). */
  flow: number;
  /** Stop when the water falls to this height (m). */
  endY: number;
}

const G = 9.81;
const SEGS = 64;
const AROUND = 12;

export class Stream {
  readonly mesh: THREE.Mesh;
  private readonly uTime = { value: 0 };

  constructor(spec: StreamSpec, env: EnvUniforms) {
    const { start: p0, velocity: v0, flow, endY } = spec;
    // time to fall to endY: p0.y + v0.y t - g t^2 / 2 = endY
    const a = -G / 2, b = v0.y, c = p0.y - endY;
    const tEnd = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);

    const pos: number[] = [], nrm: number[] = [], along: number[] = [], idx: number[] = [];
    const frame = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= SEGS; i++) {
      const t = (i / SEGS) ** 1.4 * tEnd; // denser near the lip, where the stream bends most
      const c0 = new THREE.Vector3(p0.x + v0.x * t, p0.y + v0.y * t - (G * t * t) / 2, p0.z + v0.z * t);
      const vel = new THREE.Vector3(v0.x, v0.y - G * t, v0.z);
      const speed = vel.length();
      const r = Math.sqrt(flow / (Math.PI * Math.max(speed, 0.15)));
      const tan = vel.clone().normalize();
      const side = new THREE.Vector3().crossVectors(tan, frame).normalize();
      const up = new THREE.Vector3().crossVectors(side, tan).normalize();
      for (let j = 0; j <= AROUND; j++) {
        const phi = (j / AROUND) * Math.PI * 2;
        const n = side.clone().multiplyScalar(Math.cos(phi)).addScaledVector(up, Math.sin(phi));
        const p = c0.clone().addScaledVector(n, r);
        pos.push(p.x, p.y, p.z);
        nrm.push(n.x, n.y, n.z);
        along.push(t, r);
      }
    }
    for (let i = 0; i < SEGS; i++) {
      for (let j = 0; j < AROUND; j++) {
        const a0 = i * (AROUND + 1) + j, b0 = a0 + 1, c1 = a0 + AROUND + 1, d = c1 + 1;
        idx.push(a0, c1, b0, b0, c1, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 2));
    g.setIndex(idx);

    // A thin rod of water: the rim shows the garden reflected (Fresnel), the middle the garden seen
    // through it, bent and faintly tinted; the sun glints off it. Cheap enough to draw directly.
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...env, uTime: this.uTime },
      vertexShader: /* glsl */ `
        attribute vec2 aAlong;
        uniform float uTime;
        varying vec3 vPos, vNrm;
        void main() {
          // travelling bulges: the water that left the lip at time (uTime - t) carries its own wobble
          float born = uTime - aAlong.x;
          float bulge = 0.22 * sin(born * 37.0) + 0.14 * sin(born * 61.0 + 1.3) + 0.08 * sin(born * 97.0 + 2.1);
          bulge *= smoothstep(0.0, 0.08, aAlong.x);
          vec3 p = position + normal * aAlong.y * bulge;
          vPos = (modelMatrix * vec4(p, 1.0)).xyz;
          vNrm = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
        }`,
      fragmentShader:
        ENV_GLSL +
        /* glsl */ `
        varying vec3 vPos, vNrm;
        void main() {
          vec3 n = normalize(vNrm), v = normalize(vPos - cameraPosition);
          if (dot(n, v) > 0.0) n = -n;
          float c = clamp(-dot(v, n), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
          vec3 r = reflect(v, n);
          vec3 refl = envColor(r) + uSunCol * pow(max(dot(r, uSunDir), 0.0), 400.0) * 6.0;
          // through the rod: the view is bent strongly toward the axis
          vec3 t = normalize(v - n * (1.0 - c) * 1.4);
          vec3 thru = envColor(t) * vec3(0.9, 0.97, 1.0) + uSunCol * 0.02;
          gl_FragColor = vec4(mix(thru, refl, F), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
  }

  update(time: number): void {
    this.uTime.value = time;
  }
}
