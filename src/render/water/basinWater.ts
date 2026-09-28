/*
 * Water in the stone basin: ripple simulation, caustics and the surface shader.
 *
 * Ported and adapted from CAUSTIC//LITE (lite/index.html) in ScottieFox/caustic-volume
 * https://github.com/ScottieFox/caustic-volume  (commit d87351b)
 * Copyright (c) 2026 Scottie — MIT License (full text in THIRD_PARTY_NOTICES.md)
 *
 * Changes from the original: a round basin instead of a rectangular glass tank (the ripple grid is
 * masked to the bowl, the refracted view ends on the bowl's floor or its cylindrical wall, and the
 * rim shades part of the floor), a small wind-ruffled sea sized for a 40 cm bowl with proper
 * capillary dispersion, reflections of the shared garden environment instead of a sky dome, and
 * stronger absorption and in-scattering so a shallow bowl reads as clear, pale blue water.
 */
import * as THREE from 'three';
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js';
import { CANOPY_GLSL, type Canopy } from '../canopy';
import { ENV_GLSL, type EnvUniforms } from '../env';

export interface BasinWaterSpec {
  center: THREE.Vector3;
  bowlRadius: number;
  floorY: number;
  waterLevel: number;
  /** Height of the rim above the ground: it shades the water near the sunward wall. */
  rimY: number;
  /** Mean wind 0..1 (season): how much the surface is ruffled. */
  wind: number;
  /** Texture for the stone of the bowl (colour), seen through the water. */
  stone: THREE.Texture;
}

const SIM = 192; // ripple grid cells across the bowl (2 mm cells)
const CAUS = 256; // caustics texture across the bowl (1.5 mm texels)
const SIM_HZ = 180; // ripple steps per second: sets how fast ripples run (about 25 cm/s)
const IOR = 1.333;
// Per metre. Real water barely tints 15 cm; this is stronger so the bowl reads as pale blue water.
const ABSORB = [3.2, 0.75, 0.45];

// small wind waves: lengths from 12 cm down to 1.2 cm, spread over directions (golden angle)
const NW = 16;
interface Wave { kx: number; kz: number; w: number; ph: number; a: number; f1: number; f2: number; p1: number; p2: number }
function makeWaves(): Wave[] {
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: Wave[] = [];
  for (let i = 0; i < NW; i++) {
    const len = 0.12 * 0.1 ** (i / (NW - 1));
    const k = (2 * Math.PI) / len;
    const dir = i * 2.39996 + (rnd() - 0.5) * 0.9;
    out.push({
      kx: k * Math.cos(dir),
      kz: k * Math.sin(dir),
      w: Math.sqrt(9.81 * k + 7.4e-5 * k ** 3), // gravity-capillary dispersion
      ph: rnd() * 6.283,
      a: (0.03 / k) * (0.6 + 0.8 * rnd()), // about the same slope for every length
      f1: 0.05 + 0.25 * rnd(),
      f2: 0.09 + 0.35 * rnd(),
      p1: rnd() * 6.283,
      p2: rnd() * 6.283,
    });
  }
  return out;
}

const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export class BasinWater {
  readonly mesh: THREE.Mesh;
  private readonly gpu: GPUComputationRenderer;
  private readonly sim: Variable;
  private readonly surfRT: THREE.WebGLRenderTarget;
  private readonly surfMat: THREE.ShaderMaterial;
  private readonly causRT: THREE.WebGLRenderTarget;
  private readonly causScene = new THREE.Scene();
  private readonly flatCam = new THREE.Camera();
  private readonly U: Record<string, THREE.IUniform>;
  private readonly waves = makeWaves();
  private readonly waveU = new Float32Array(NW * 4);
  private readonly ampU = new Float32Array(NW);
  private readonly dropU = new Float32Array(32);
  private readonly drops: [number, number, number, number][] = [];
  private acc = 0;
  private time = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly spec: BasinWaterSpec,
    env: EnvUniforms,
    canopy: Canopy['uniforms'],
  ) {
    const RB = spec.bowlRadius;
    this.waves.forEach((W, i) => this.waveU.set([W.kx, W.kz, W.w, W.ph], i * 4));

    // --- ripple simulation: height (mm) in r, previous height in g. The wave equation on a grid;
    // cells outside the bowl are held at zero, so ripples reflect off the stone wall.
    this.gpu = new GPUComputationRenderer(SIM, SIM, renderer);
    this.gpu.setDataType(THREE.HalfFloatType);
    this.sim = this.gpu.addVariable(
      'heightmap',
      /* glsl */ `
      uniform vec4 uDrops[8];   // x, z (m, bowl-local), radius (m), height (mm)
      void main() {
        vec2 cell = 1.0 / resolution.xy, uv = gl_FragCoord.xy * cell;
        vec2 p = (uv - 0.5) * ${f(2 * RB)};
        if (length(p) > ${f(RB)}) { gl_FragColor = vec4(0.0); return; }
        vec4 c = texture2D(heightmap, uv);
        float nb = texture2D(heightmap, uv + vec2(0.0, cell.y)).r + texture2D(heightmap, uv - vec2(0.0, cell.y)).r
                 + texture2D(heightmap, uv + vec2(cell.x, 0.0)).r + texture2D(heightmap, uv - vec2(cell.x, 0.0)).r;
        float h = (nb * 0.5 - c.g) * 0.996;
        // foam (b): made where water plunges in, spreading a little and fading over about a second
        float fb = texture2D(heightmap, uv + vec2(0.0, cell.y)).b + texture2D(heightmap, uv - vec2(0.0, cell.y)).b
                 + texture2D(heightmap, uv + vec2(cell.x, 0.0)).b + texture2D(heightmap, uv - vec2(cell.x, 0.0)).b;
        float foam = mix(c.b, fb * 0.25, 0.15) * 0.994;
        for (int i = 0; i < 8; i++) {
          vec2 q = (p - uDrops[i].xy) / uDrops[i].z;
          float k = exp(-dot(q, q));
          h += uDrops[i].w * k;
          foam += max(-uDrops[i].w - 0.3, 0.0) * 1.5 * k;   // only plunging water (a pour), not a trickle
        }
        gl_FragColor = vec4(h, c.r, min(foam, 1.5), 1.0);
      }`,
      this.gpu.createTexture(),
    );
    this.gpu.setVariableDependencies(this.sim, [this.sim]);
    this.sim.minFilter = this.sim.magFilter = THREE.LinearFilter;
    this.sim.material.uniforms.uDrops = { value: this.dropU };
    const err = this.gpu.init();
    if (err) throw new Error(err);

    this.U = {
      ...env,
      ...canopy,
      uTime: { value: 0 },
      uW: { value: this.waveU },
      uA: { value: this.ampU },
      uSim: { value: null },
      uSurf: { value: null },
      uCaus: { value: null },
      uStone: { value: spec.stone },
      uCenter: { value: spec.center.clone() },
      uAmb: { value: new THREE.Vector3(0.9, 1.0, 1.0) },
      uGlow: { value: new THREE.Vector3(0.02, 0.085, 0.1) },
    };

    // --- once a frame: the wind waves plus the ripples, with slopes, into one texture
    this.surfRT = this.gpu.createRenderTarget(SIM, SIM, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.LinearFilter, THREE.LinearFilter);
    this.surfMat = this.gpu.createShaderMaterial(
      /* glsl */ `
      uniform float uTime;
      uniform vec4 uW[${NW}];
      uniform float uA[${NW}];
      uniform sampler2D uSim;
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy, e = 1.0 / resolution.xy, p = (uv - 0.5) * ${f(2 * RB)};
        vec3 w = vec3(0.0);
        for (int i = 0; i < ${NW}; i++) {   // each wave's crests are bent by a slower wave running along them
          vec2 kd = uW[i].xy, side = vec2(-kd.y, kd.x) / length(kd);
          float kb = 0.37 * length(kd), pb = kb * dot(side, p) + 0.9 * uTime + 7.1 * float(i);
          float ph = dot(kd, p) - uW[i].z * uTime + uW[i].w + 1.6 * sin(pb);
          w += uA[i] * vec3(sin(ph), cos(ph) * (kd + 1.6 * kb * cos(pb) * side));
        }
        // calmer against the stone: waves die out toward the wall
        w *= smoothstep(${f(RB)}, ${f(RB * 0.8)}, length(p));
        float h = texture2D(uSim, uv).r;
        float hx = texture2D(uSim, uv + vec2(e.x, 0.0)).r - texture2D(uSim, uv - vec2(e.x, 0.0)).r;
        float hz = texture2D(uSim, uv + vec2(0.0, e.y)).r - texture2D(uSim, uv - vec2(0.0, e.y)).r;
        gl_FragColor = vec4(w + 0.001 * vec3(h, hx * ${f(SIM / (4 * RB))}, hz * ${f(SIM / (4 * RB))}), texture2D(uSim, uv).b);
      }`,
      { uTime: this.U.uTime, uW: this.U.uW, uA: this.U.uA, uSim: this.U.uSim },
    );

    const COMMON = /* glsl */ `
      uniform sampler2D uSurf, uCaus, uStone;
      uniform vec3 uCenter, uAmb, uGlow;
      const float PI = 3.14159265, IOR = ${f(IOR)};
      const float RB = ${f(RB)}, LEVEL = ${f(spec.waterLevel)}, FLOOR = ${f(spec.floorY)}, RIM = ${f(spec.rimY)};
      const vec3 ABSORB = vec3(${ABSORB.map(f).join(', ')});
      // height above LEVEL (m) and slope at a bowl-local point
      vec3 wave(vec2 p) { return textureLod(uSurf, p / (2.0 * RB) + 0.5, 0.0).xyz; }
      float foamAt(vec2 p) { return textureLod(uSurf, p / (2.0 * RB) + 0.5, 0.0).w; }
      vec3 normalOf(vec3 w) { return normalize(vec3(-w.y, 1.0, -w.z)); }
      float fresnel(float c) { return 0.02 + 0.98 * pow(1.0 - clamp(c, 0.0, 1.0), 5.0); }
      // distance along d from p (inside the bowl) to its cylindrical wall
      float wallHit(vec2 p, vec2 d) {
        float a = dot(d, d), b = dot(p, d), c = dot(p, p) - RB * RB;
        return a < 1e-8 ? 1e9 : (-b + sqrt(max(b * b - a * c, 0.0))) / a;
      }
    `;
    const OUT = '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

    // --- caustics: every vertex of a fine grid on the surface sends a ray of sunlight through the
    // water to the floor; the grid is drawn where the rays land, and each fragment gets the ratio of
    // surface area to floor area (from screen-space derivatives), so focused light adds up.
    this.causRT = new THREE.WebGLRenderTarget(CAUS, CAUS, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const grid = new THREE.PlaneGeometry(2 * RB, 2 * RB, SIM, SIM).rotateX(-Math.PI / 2);
    const causMesh = new THREE.Mesh(
      grid,
      new THREE.ShaderMaterial({
        uniforms: this.U,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        vertexShader:
          ENV_GLSL +
          CANOPY_GLSL +
          COMMON +
          /* glsl */ `
          varying vec2 vSurf; varying vec3 vI;
          void main() {
            vec3 w = wave(position.xz), P = vec3(position.x, LEVEL + w.x, position.z), n = normalOf(w);
            vec3 Lin = -uSunDir;
            vec3 r = refract(Lin, n, 1.0 / IOR);
            float t = (P.y - FLOOR) / max(-r.y, 0.05);
            vec3 F = P + r * t;
            vI = vec3(max(-Lin.y, 0.0) * (1.0 - fresnel(dot(-Lin, n)))) * exp(-ABSORB * t);
            // outside the bowl, or the ray meets the wall before the floor
            if (length(P.xz) > RB || length(F.xz) > RB) vI = vec3(0.0);
            // the rim above the water shades the surface near the sunward wall
            float s = wallHit(P.xz, uSunDir.xz);
            if (P.y + uSunDir.y * s < RIM) vI *= 0.0;
            // and the leaves overhead
            vI *= canopyLight(P + vec3(uCenter.x, 0.0, uCenter.z), uSunDir);
            vSurf = position.xz;
            gl_Position = vec4(F.x / RB, F.z / RB, 0.0, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vSurf; varying vec3 vI;
          void main() {
            vec2 a = dFdx(vSurf), b = dFdy(vSurf);
            gl_FragColor = vec4(vI * min(abs(a.x * b.y - a.y * b.x) / ${((4 * RB * RB) / (CAUS * CAUS)).toExponential(6)}, 40.0), 1.0);
          }`,
      }),
    );
    causMesh.frustumCulled = false;
    this.causScene.add(causMesh);

    // --- the surface: reflects the garden, refracts the view down to the bowl's floor and wall
    // concentric rings, fine enough for the vertex shader to move the surface
    const rings = new THREE.RingGeometry(0.0, RB + 0.004, 160, 96).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(
      rings,
      new THREE.ShaderMaterial({
        uniforms: this.U,
        vertexShader:
          COMMON +
          /* glsl */ `
          varying vec3 vPos;
          void main() {
            vec2 p = position.xz;
            vPos = vec3(p.x + uCenter.x, LEVEL + wave(clamp(p, -RB, RB)).x, p.y + uCenter.z);
            gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
          }`,
        fragmentShader:
          ENV_GLSL +
          CANOPY_GLSL +
          COMMON +
          /* glsl */ `
          varying vec3 vPos;
          vec3 stoneAt(vec2 uv) { return texture(uStone, uv).rgb; }
          // light reaching a point on the bowl's floor (bowl-local): the caustics and dim sky light
          vec3 floorColor(vec3 q) {
            vec2 uv = q.xz / (2.0 * RB) + 0.5, o = vec2(0.6 / ${f(CAUS)});
            vec3 caus = 0.25 * (texture(uCaus, uv + o).rgb + texture(uCaus, uv - o).rgb
                              + texture(uCaus, uv + vec2(o.x, -o.y)).rgb + texture(uCaus, uv - vec2(o.x, -o.y)).rgb);
            vec3 alb = stoneAt(q.xz * 2.5) * 0.9;
            float edge = smoothstep(0.0, 0.05, RB - length(q.xz));   // darker where the wall meets the floor
            return alb / PI * (uSunCol * caus + uAmb * exp(-ABSORB * (LEVEL - FLOOR) * 1.5) * (0.5 + 0.5 * edge));
          }
          // the bowl's wall under water: sky light from above, and the sun where it reaches
          vec3 wallColor(vec3 q) {
            vec3 n = vec3(-q.x, 0.0, -q.z) / RB;
            vec3 t = refract(-uSunDir, vec3(0.0, 1.0, 0.0), 1.0 / IOR);
            float depth = LEVEL - q.y;
            float u = depth / max(-t.y, 0.05);
            vec3 e = q - t * u;   // back along the light to the surface
            float lit = length(e.xz) < RB ? 1.0 : 0.0;
            lit *= e.y + uSunDir.y * wallHit(e.xz, uSunDir.xz) < RIM ? 0.0 : 1.0;
            lit *= canopyLight(e + vec3(uCenter.x, 0.0, uCenter.z), uSunDir);
            vec3 E = uSunCol * lit * max(dot(-t, n), 0.0) * exp(-ABSORB * u) * 0.9 + uAmb * 0.6 * exp(-ABSORB * depth * 1.5);
            vec3 alb = stoneAt(vec2(atan(q.z, q.x) * 0.6, q.y * 2.5)) * 0.8;
            return alb / PI * E;
          }
          // a ray inside the water from p (bowl-local), going down: absorbed and lit as it goes
          vec3 water(vec3 p, vec3 d) {
            float tf = d.y < 0.0 ? (FLOOR - p.y) / d.y : 1e9;
            float tw = wallHit(p.xz, d.xz);
            float t = min(tf, tw);
            vec3 q = p + d * t;
            vec3 T = exp(-ABSORB * t);
            vec3 hit = t == tf ? floorColor(q) : wallColor(q);
            return uGlow * (1.0 - T) + T * hit;
          }
          void main() {
            vec3 lp = vPos - vec3(uCenter.x, 0.0, uCenter.z);
            float r = length(lp.xz);
            if (r > RB + 0.002) discard;
            vec3 n = normalOf(wave(lp.xz)), d = normalize(vPos - cameraPosition);
            if (dot(d, n) > -0.02) n = normalize(n - d * (dot(d, n) + 0.02));
            float F = fresnel(-dot(d, n));
            vec3 rd = reflect(d, n);
            // reflection: the garden, the sun's glint, and the dark stone wall at low angles
            vec3 refl = envColor(rd) + uSunCol * pow(max(dot(rd, uSunDir), 0.0), 1500.0) * 40.0 * canopyLight(vPos, uSunDir);
            float s = wallHit(lp.xz, rd.xz);
            if (lp.y + rd.y * s < RIM) refl = stoneAt(vec2(atan(lp.z, lp.x), 0.3)) * uAmb * 0.55;
            vec3 col = F * refl + (1.0 - F) * water(lp, refract(d, n, 1.0 / IOR));
            // the meniscus: a faint bright line where the water meets the stone
            col += uAmb * 0.08 * smoothstep(RB - 0.004, RB, r);
            // foam: a froth of tiny bubbles, broken up into patches, lit by the sky and the sun
            float fm = foamAt(lp.xz);
            if (fm > 0.01) {
              vec2 fq = lp.xz * 900.0;
              float cells = fract(sin(dot(floor(fq), vec2(12.9898, 78.233))) * 43758.5453);
              float froth = smoothstep(0.1, 0.9, fm * (0.6 + 0.8 * cells));
              vec3 white = vec3(0.85, 0.9, 0.9) * (uAmb * 0.35 + uSunCol * 0.12 * canopyLight(vPos, uSunDir));
              col = mix(col, white, froth * 0.85);
            }
            gl_FragColor = vec4(col, 1.0);
            ${OUT}
          }`,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** A splash at a world point: radius (m), height (mm; negative pushes the water down). */
  addDrop(world: THREE.Vector3, radius = 0.008, height = 4): void {
    const x = world.x - this.spec.center.x, z = world.z - this.spec.center.z;
    if (Math.hypot(x, z) < this.spec.bowlRadius) this.drops.push([x, z, radius, height]);
  }

  /** The world-space plane of the water at rest (for picking). */
  get level(): number {
    return this.spec.waterLevel;
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time, wind = this.spec.wind;
    const swing = 0.35 + 0.55 * wind;
    this.waves.forEach((W, i) => {
      this.ampU[i] = W.a * Math.max(0.05, 1 + swing * (0.6 * Math.sin(W.f1 * t + W.p1) + 0.4 * Math.sin(W.f2 * t + W.p2))) * wind * 2;
    });
    for (this.acc = Math.min(this.acc + dt, 0.1); this.acc >= 1 / SIM_HZ; this.acc -= 1 / SIM_HZ) {
      for (let i = 0; i < 8; i++) this.dropU.set(this.drops.length ? this.drops.shift()! : [0, 0, 1, 0], i * 4);
      this.gpu.compute();
    }
    this.U.uTime.value = t;
    this.U.uSim.value = this.gpu.getCurrentRenderTarget(this.sim).texture;
    this.gpu.doRenderTarget(this.surfMat, this.surfRT);
    this.U.uSurf.value = this.surfRT.texture;

    const r = this.renderer;
    const prev = r.getRenderTarget();
    const clear = r.getClearColor(new THREE.Color());
    const alpha = r.getClearAlpha();
    this.U.uCaus.value = null;
    r.setRenderTarget(this.causRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.causScene, this.flatCam);
    r.setRenderTarget(prev);
    r.setClearColor(clear, alpha);
    this.U.uCaus.value = this.causRT.texture;
  }
}
