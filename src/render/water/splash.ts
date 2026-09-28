import * as THREE from 'three';
import { mulberry32 } from '../../scene/random';
import { ENV_GLSL, type EnvUniforms } from '../env';
import type { BasinWater } from './basinWater';

/**
 * Droplets thrown up where falling water strikes water (PLAN.md 5章): each flies on its own
 * ballistic path, stretched a little along its motion, and makes a small ripple where it falls back.
 */
const MAX = 500;
const G = 9.81;

interface Drop { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number }

export class Splash {
  readonly mesh: THREE.InstancedMesh;
  private readonly drops: Drop[] = [];
  private readonly rand = mulberry32(21);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(env: EnvUniforms, private readonly basin: BasinWater, private readonly basinSpec: { center: THREE.Vector3; bowlRadius: number; level: number }) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...env },
      transparent: true,
      vertexShader: /* glsl */ `
        varying vec3 vPos, vNrm;
        void main() {
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vPos = w.xyz;
          vNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader:
        ENV_GLSL +
        /* glsl */ `
        varying vec3 vPos, vNrm;
        void main() {
          vec3 n = normalize(vNrm), v = normalize(vPos - cameraPosition);
          float c = clamp(-dot(v, n), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
          vec3 r = reflect(v, n);
          // drops read as bright, nearly colourless beads: a sun glint, the pale sky, and a light core
          vec3 e = envColor(r);
          vec3 refl = vec3(dot(e, vec3(0.3, 0.5, 0.2))) * 1.3 + uSunCol * pow(max(dot(r, uSunDir), 0.0), 60.0) * 2.5;
          vec3 core = vec3(0.55, 0.62, 0.62) * (0.5 + 0.5 * n.y);
          float a = 0.35 + 0.55 * F;
          gl_FragColor = vec4((refl * F + core * (1.0 - F) * 0.45) / a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /**
   * Throw `count` drops from `at`: up and outward in a cone, `speed` (m/s) and radius (m) ranges.
   * `bias` tilts the cone (e.g. away from where the water came from).
   */
  emit(at: THREE.Vector3, count: number, speed: [number, number], radius: [number, number], bias = new THREE.Vector3()): void {
    for (let i = 0; i < count && this.drops.length < MAX; i++) {
      const a = this.rand() * Math.PI * 2;
      const tilt = 0.25 + this.rand() * 0.9; // radians from vertical
      const sp = speed[0] + (speed[1] - speed[0]) * this.rand();
      this.drops.push({
        x: at.x + (this.rand() - 0.5) * 0.01,
        y: at.y + 0.002,
        z: at.z + (this.rand() - 0.5) * 0.01,
        vx: Math.sin(tilt) * Math.cos(a) * sp + bias.x,
        vy: Math.cos(tilt) * sp + bias.y,
        vz: Math.sin(tilt) * Math.sin(a) * sp + bias.z,
        r: radius[0] * Math.pow(radius[1] / radius[0], this.rand()),
      });
    }
  }

  update(dt: number): void {
    const b = this.basinSpec;
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vy -= G * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      const inBowl = Math.hypot(d.x - b.center.x, d.z - b.center.z) < b.bowlRadius;
      if ((inBowl && d.y < b.level && d.vy < 0) || d.y < 0) {
        // back into the water: a small ring
        if (inBowl) this.basin.addDrop(this.v.set(d.x, b.level, d.z), Math.max(0.003, d.r * 3), -d.r * 400 * Math.min(1, -d.vy));
        this.drops.splice(i, 1);
      }
    }
    for (const d of this.drops) {
      // stretch along the motion a little (the eye sees a streak)
      this.v.set(d.vx, d.vy, d.vz);
      const speed = this.v.length();
      this.q.setFromUnitVectors(this.up, speed > 1e-4 ? this.v.normalize() : this.up);
      this.s.set(d.r, d.r * Math.min(3, 1 + (speed * 0.003) / d.r), d.r);
      this.m.compose(this.v.set(d.x, d.y, d.z), this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
