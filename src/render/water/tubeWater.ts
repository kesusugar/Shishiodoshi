import * as THREE from 'three';
import type { TubeConfig } from '../../sim/config';
import { ENV_GLSL, type EnvUniforms } from '../env';

/**
 * The water held in the tube, drawn from the simulation: its free surface is the plane
 * x sin(phi) + y cos(phi) = s in the tube's frame (TubeHydro), clipped to the bore, the node and the
 * slanted mouth. Seen from above it shows the bamboo inside through a little water, the garden
 * reflected, and rings where the kakei's stream lands. Add it as a child of the tube.
 */
export class TubeWater {
  readonly mesh: THREE.Mesh;
  private readonly U: Record<string, THREE.IUniform>;

  constructor(tube: TubeConfig, env: EnvUniforms, fleshColor: THREE.Color) {
    const r = tube.radius - tube.wall;
    const len = tube.front - tube.diaphragm;
    // a grid over the compartment in (x, z); the vertex shader lifts it onto the surface plane
    const g = new THREE.PlaneGeometry(len, 2 * r, 48, 8);
    g.rotateX(-Math.PI / 2);
    g.translate(tube.diaphragm + len / 2, 0, 0);
    this.U = {
      ...env,
      uS: { value: 0 },
      uPhi: { value: 0 },
      uTime: { value: 0 },
      uHit: { value: new THREE.Vector3(0, 0, 0) }, // local x, z of the stream's landing; strength
      uFlesh: { value: fleshColor },
    };
    const f = (v: number) => v.toFixed(6);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.U,
      vertexShader: /* glsl */ `
        uniform float uS, uPhi;
        varying vec3 vLocal, vWorld;
        varying mat3 vToWorld;
        void main() {
          vec3 p = position;
          p.y = (uS - p.x * sin(uPhi)) / cos(uPhi);
          vLocal = p;
          vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
          vToWorld = mat3(modelMatrix);
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader:
        ENV_GLSL +
        /* glsl */ `
        uniform float uPhi, uTime;
        uniform vec3 uHit, uFlesh;
        varying vec3 vLocal, vWorld;
        varying mat3 vToWorld;
        const float R = ${f(tube.radius)}, RI = ${f(r)}, FRONT = ${f(tube.front)}, CUT = ${f(tube.cut)}, DIA = ${f(tube.diaphragm)};
        void main() {
          vec3 p = vLocal;
          // inside the bore, in front of the node, behind the slanted cut
          if (p.y * p.y + p.z * p.z > RI * RI || p.x < DIA || p.x > FRONT - CUT * (1.0 + p.y / R) * 0.5) discard;
          // the plane's normal, in the tube's frame, then in the world
          vec3 nl = vec3(sin(uPhi), cos(uPhi), 0.0);
          // rings from the stream's landing point
          vec2 d = p.xz - uHit.xy;
          float dist = length(d);
          float ring = uHit.z * sin(dist * 900.0 - uTime * 40.0) * exp(-dist / 0.012);
          nl = normalize(nl + vec3(d.x, 0.0, d.y) / max(dist, 1e-4) * ring * 0.35);
          vec3 n = normalize(vToWorld * nl);
          vec3 v = normalize(vWorld - cameraPosition);
          float c = clamp(-dot(v, n), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
          vec3 refl = envColor(reflect(v, n)) * 0.8;
          // below: the pale inside of the bamboo, seen through water that deepens toward the bottom
          float depth = p.y + sqrt(max(RI * RI - p.z * p.z, 0.0));
          vec3 absorb = exp(-vec3(5.0, 1.6, 1.1) * depth * 6.0);
          vec3 below = uFlesh * 0.35 * absorb + vec3(0.01, 0.03, 0.035) * (1.0 - absorb);
          gl_FragColor = vec4(mix(below, refl, F), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** From the simulation: the surface (or null when empty), and where the stream lands (tube-local). */
  update(surface: { s: number; phi: number } | null, hit: { x: number; z: number } | null, time: number): void {
    this.mesh.visible = !!surface;
    if (!surface) return;
    this.U.uS.value = surface.s;
    this.U.uPhi.value = surface.phi;
    this.U.uTime.value = time;
    const h = this.U.uHit.value as THREE.Vector3;
    if (hit) h.set(hit.x, hit.z, 1);
    else h.z = 0;
  }
}
