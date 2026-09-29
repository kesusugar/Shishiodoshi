import * as THREE from 'three';
import { mulberry32 } from '../../scene/random';
import { leafGeometry } from '../../scene/leaves';
import { chainCompile } from '../shaderChain';

/**
 * Fallen maple leaves afloat on the basin. Each vertex of a leaf rides on the water's surface as the
 * ripple simulation computes it, so rings passing under a leaf lift and tilt it. The leaves drift:
 * water plunging in (the pour, a stream that misses the tube) pushes them outward, the water's drag
 * slows them, the stone wall turns them back, and a faint breeze keeps them wandering and turning.
 */
export interface WaterSurfaceRef {
  uSurf: THREE.IUniform;
  center: THREE.Vector3;
  bowlRadius: number;
  level: number;
}

interface Leaf { mesh: THREE.Mesh; x: number; z: number; vx: number; vz: number; spin: number }

export class FloatingLeaves {
  readonly group = new THREE.Group();
  private readonly leaves: Leaf[] = [];
  private readonly rand = mulberry32(88);
  private time = 0;
  private nextSlot = 0;

  constructor(private readonly water: WaterSurfaceRef, texture: THREE.Texture, colours: string[]) {
    const geo = leafGeometry(0.055, 8).rotateX(-Math.PI / 2); // fine enough to bend over the ripples
    const R = water.bowlRadius;
    for (let i = 0; i < colours.length; i++) {
      const mat = new THREE.MeshStandardMaterial({ map: texture, color: colours[i], alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.35 });
      chainCompile(mat, (sh) => {
        sh.uniforms.uSurf = water.uSurf;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
            uniform sampler2D uSurf;
            vec3 surfAt(vec2 world) { return textureLod(uSurf, (world - vec2(${water.center.x.toFixed(4)}, ${water.center.z.toFixed(4)})) / ${(2 * R).toFixed(4)} + 0.5, 0.0).xyz; }`)
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            // ride the water: lift each point by the surface height beneath it
            vec3 wpos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vec3 s = surfAt(wpos.xz);
            transformed.y += s.x;`,
          )
          .replace(
            '#include <beginnormal_vertex>',
            `#include <beginnormal_vertex>
            {
              vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
              vec3 sl = surfAt(wp.xz);
              objectNormal = normalize(objectNormal + vec3(-sl.y, 0.0, -sl.z) * 3.0);
            }`,
          );
      }, `floatingLeaf ${water.center.x} ${water.center.z} ${R}`);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.renderOrder = 2;
      const a = this.rand() * Math.PI * 2, d = Math.sqrt(this.rand()) * R * 0.7;
      const leaf: Leaf = { mesh, x: Math.cos(a) * d, z: Math.sin(a) * d, vx: 0, vz: 0, spin: (this.rand() - 0.5) * 0.2 };
      mesh.rotation.y = this.rand() * Math.PI * 2;
      this.leaves.push(leaf);
      this.group.add(mesh);
    }
  }

  /**
   * A leaf that has just landed at (x, z) (world): it takes the place of the one that has been afloat
   * longest and drifts from there on.
   */
  spawn(x: number, z: number, color: string): void {
    const l = this.leaves[this.nextSlot];
    this.nextSlot = (this.nextSlot + 1) % this.leaves.length;
    if (!l) return;
    l.x = x - this.water.center.x;
    l.z = z - this.water.center.z;
    l.vx = l.vz = 0;
    l.spin = (this.rand() - 0.5) * 0.3;
    (l.mesh.material as THREE.MeshStandardMaterial).color.set(color);
    l.mesh.rotation.y = this.rand() * Math.PI * 2;
  }

  dispose(): void {
    for (const l of this.leaves) (l.mesh.material as THREE.Material).dispose();
    this.leaves[0]?.mesh.geometry.dispose();
  }

  /** Water plunging in at `at` (world) with a strength (roughly m/s of outward push at 5 cm). */
  push(at: THREE.Vector3, strength: number, dt: number): void {
    for (const l of this.leaves) {
      const dx = l.x + this.water.center.x - at.x, dz = l.z + this.water.center.z - at.z;
      const d = Math.max(0.02, Math.hypot(dx, dz));
      const k = (strength * dt * 0.05) / (d * d);
      l.vx += (dx / d) * k;
      l.vz += (dz / d) * k;
      l.spin += (this.rand() - 0.5) * k * 20;
    }
  }

  update(dt: number, wind: number): void {
    this.time += dt;
    const R = this.water.bowlRadius - 0.03;
    for (const [i, l] of this.leaves.entries()) {
      // a light breeze wanders over the water
      const t = this.time * 0.13 + i * 2.1;
      l.vx += Math.cos(t + Math.sin(t * 0.7)) * wind * 0.004 * dt;
      l.vz += Math.sin(t * 1.3) * wind * 0.004 * dt;
      // water drag: a leaf coasts for a couple of seconds
      const drag = Math.exp(-0.8 * dt);
      l.vx *= drag;
      l.vz *= drag;
      l.spin *= Math.exp(-0.5 * dt);
      l.x += l.vx * dt;
      l.z += l.vz * dt;
      // the wall: turn back, losing most of the speed toward it
      const r = Math.hypot(l.x, l.z);
      if (r > R) {
        const nx = l.x / r, nz = l.z / r, vn = l.vx * nx + l.vz * nz;
        if (vn > 0) {
          l.vx -= 1.6 * vn * nx;
          l.vz -= 1.6 * vn * nz;
        }
        l.x = nx * R;
        l.z = nz * R;
      }
      l.mesh.position.set(this.water.center.x + l.x, this.water.level + 0.0015, this.water.center.z + l.z);
      l.mesh.rotation.y += l.spin * dt;
    }
  }
}
