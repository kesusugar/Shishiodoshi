import * as THREE from 'three';
import { ENV_GLSL, type EnvUniforms } from '../env';

/**
 * The basin brims over (ref3): at one low point of the rim a thin sheet of water spills and runs down
 * the outside of the stone, spreading as it goes, streaked where it thickens and thins. The sheet is
 * fitted to the stone by casting rays at it, so it clings to every bump. Its flow comes from the
 * simulation: a steady trickle while the kakei's water collects, a surge after the tube empties.
 */
export class Overflow {
  readonly mesh: THREE.Mesh;
  private readonly uTime = { value: 0 };
  private readonly uFlow = { value: 0.3 };
  private surge = 0;

  constructor(env: EnvUniforms, basin: THREE.Mesh, center: THREE.Vector3, rimY: number, angle: number) {
    basin.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    // hit the stone whichever way its faces are wound
    const mat0 = basin.material as THREE.Material;
    const side0 = mat0.side;
    mat0.side = THREE.DoubleSide;
    let misses = 0;
    const ROWS = 32, COLS = 7;
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    const dir = new THREE.Vector3();
    for (let r = 0; r <= ROWS; r++) {
      const t = r / ROWS;
      const y = rimY + 0.004 - t * (rimY - 0.01);
      const spread = 0.025 + t * 0.07; // half-width (m), wider as it runs down
      for (let c = 0; c <= COLS; c++) {
        const s = (c / COLS) * 2 - 1;
        const a = angle + (s * spread) / 0.3;
        dir.set(-Math.cos(a), 0, -Math.sin(a));
        const from = new THREE.Vector3(center.x + Math.cos(a) * 1.2, y, center.z + Math.sin(a) * 1.2);
        // over the rim the sheet lies on the top surface: cast downward there
        if (r === 0) {
          from.set(center.x + Math.cos(a) * 0.235, rimY + 0.2, center.z + Math.sin(a) * 0.235);
          dir.set(0, -1, 0);
        }
        ray.set(from, dir);
        const hit = ray.intersectObject(basin, false)[0];
        if (!hit) misses++;
        const p = hit ? hit.point : from;
        const n = hit?.face ? hit.face.normal.clone().transformDirection(basin.matrixWorld) : new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        p.addScaledVector(n, 0.0018);
        pos.push(p.x, p.y, p.z);
        nrm.push(n.x, n.y, n.z);
        uv.push(c / COLS, t);
      }
    }
    mat0.side = side0;
    if (misses) console.warn(`[overflow] ${misses} rays missed the basin`);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const a = r * (COLS + 1) + c, b = a + 1, d = a + COLS + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);

    const mat = new THREE.ShaderMaterial({
      uniforms: { ...env, uTime: this.uTime, uFlow: this.uFlow },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vPos, vNrm;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vNrm = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
        }`,
      fragmentShader:
        ENV_GLSL +
        /* glsl */ `
        uniform float uTime, uFlow;
        varying vec3 vPos, vNrm;
        varying vec2 vUv;
        float h(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
        void main() {
          // rivulets: streaks that run downhill, faster where the stone is steep
          float x = vUv.x * 6.0;
          float flowY = vUv.y * 5.0 - uTime * (0.8 + uFlow);
          float streak = n2(vec2(x * 1.7 + 0.3 * sin(vUv.y * 9.0), flowY)) * 0.6 + n2(vec2(x * 4.1, flowY * 2.3)) * 0.4;
          // the sheet is thickest in the middle, fraying at its sides and toward the bottom
          float body = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x) * smoothstep(1.0, 0.55, vUv.y);
          float thick = clamp(body * (0.35 + uFlow) * (0.4 + streak), 0.0, 1.0);
          if (thick < 0.08) discard;
          vec3 n = normalize(vNrm + vec3(streak - 0.5, 0.0, streak - 0.5) * 0.4);
          vec3 v = normalize(vPos - cameraPosition);
          float c = clamp(abs(dot(v, n)), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
          vec3 r = reflect(v, n);
          // a film of water on stone reads by what it reflects: bright threads along the rivulets
          // where it bulges and catches the sky, and glints of sun
          float thread = smoothstep(0.62, 0.8, streak) * body;
          vec3 sky = envColor(normalize(r + vec3(0.0, 0.6, 0.0)));
          vec3 e = envColor(r);
          vec3 grey = vec3(dot(e, vec3(0.3, 0.5, 0.2)));
          vec3 skyG = vec3(dot(sky, vec3(0.3, 0.5, 0.2)));
          // mostly a dark, glassy wetness over the stone, with pale threads and glints on it
          vec3 col = mix(e, grey, 0.7) * (0.25 + F) + skyG * thread * 1.4 + uSunCol * pow(max(dot(r, uSunDir), 0.0), 60.0) * (0.4 + 1.5 * thread);
          float a = clamp(thick * 0.45 + F * 0.3 + thread * 0.45, 0.0, 0.85);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.renderOrder = 3;
  }

  /** A surge of water into the basin (m^3/s arriving): the overflow swells, then eases back. */
  feed(flow: number, dt: number): void {
    this.surge = Math.min(1.5, this.surge + flow * dt * 2500);
  }

  update(dt: number): void {
    this.uTime.value += dt;
    this.surge *= Math.exp(-dt / 2.5);
    this.uFlow.value = 0.25 + this.surge;
  }
}
