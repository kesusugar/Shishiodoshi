import * as THREE from 'three';
import { mulberry32 } from '../scene/random';

/**
 * Snow shaken off the tube when it tips (winter): lumps from along the top of the culm slide off
 * toward the mouth as the tube comes down on the crossbar, tumble under gravity, and are gone where
 * they reach the ground (a lump that reaches the basin's water leaves a small ring). Moved on the
 * CPU (a dozen or so); drawn as one instanced mesh of white, lumpy blobs.
 */
const N = 16;
const G = 9.81;

interface Clump { on: boolean; p: THREE.Vector3; v: THREE.Vector3; spin: THREE.Vector3; rot: THREE.Euler; r: number; age: number }

export class SnowSlide {
  readonly mesh: THREE.InstancedMesh;
  private readonly clumps: Clump[] = [];
  private readonly rand = mulberry32(31);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(private readonly basin: { center: THREE.Vector3; bowlRadius: number; level: number }, private readonly onWater: (x: number, z: number) => void) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#f1f5fb', roughness: 0.9 }), N);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < N; i++) this.clumps.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(), r: 0.02, age: 0 });
  }

  /**
   * Shake `count` lumps off the tube: from points along its top (tube-local x from `x0` to `x1`,
   * at the culm's `radius`), sliding along `axis` (world, toward the mouth) with a little scatter.
   */
  trigger(tube: THREE.Object3D, x0: number, x1: number, radius: number, axis: THREE.Vector3, count = 12): void {
    const r = this.rand;
    let n = 0;
    for (const c of this.clumps) {
      if (n >= count) break;
      if (c.on) continue;
      c.on = true;
      c.age = 0;
      c.r = 0.012 + r() * r() * 0.03;
      c.p.set(x0 + (x1 - x0) * r(), radius * (0.95 + 0.2 * r()), (r() - 0.5) * radius * 0.9);
      tube.localToWorld(c.p);
      c.v.copy(axis).multiplyScalar(0.25 + r() * 0.7).add(new THREE.Vector3((r() - 0.5) * 0.25, r() * 0.15, (r() - 0.5) * 0.35));
      c.spin.set((r() - 0.5) * 8, (r() - 0.5) * 8, (r() - 0.5) * 8);
      c.rot.set(r() * 6, r() * 6, r() * 6);
      n++;
    }
  }

  update(dt: number): void {
    let n = 0;
    const b = this.basin;
    for (const c of this.clumps) {
      if (!c.on) continue;
      c.age += dt;
      c.v.y -= G * dt;
      c.p.addScaledVector(c.v, dt);
      c.rot.x += c.spin.x * dt;
      c.rot.y += c.spin.y * dt;
      c.rot.z += c.spin.z * dt;
      const inBowl = Math.hypot(c.p.x - b.center.x, c.p.z - b.center.z) < b.bowlRadius;
      if (inBowl && c.p.y < b.level) {
        this.onWater(c.p.x, c.p.z);
        c.on = false;
      } else if (c.p.y < 0.015 || c.age > 4) c.on = false;
      if (!c.on) continue;
      // the lumps thin out as they fall (loose snow breaks up)
      const k = c.r * (1 - 0.35 * Math.min(1, c.age / 0.8));
      this.q.setFromEuler(c.rot);
      this.s.set(k * 1.3, k * 0.85, k);
      this.mesh.setMatrixAt(n++, this.m.compose(c.p, this.q, this.s));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
