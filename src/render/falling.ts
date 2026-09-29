import * as THREE from 'three';
import { leafGeometry, mapleLeafTexture } from '../scene/leaves';
import { mulberry32 } from '../scene/random';
import type { FallingStyle } from '../scene/seasons';
import { ENV_GLSL, type EnvUniforms } from './env';

/**
 * Things drifting down through the air: leaves, petals, snow (docs/SEASONS.md 2.4).
 *
 * The many pieces in the air are drawn as instances whose whole motion is worked out in the vertex
 * shader from the time and four random numbers each (fall, sway, tumble), so they cost the CPU
 * nothing. They are cut-out shapes that write depth, so the depth of field blurs the near ones into
 * soft discs. They vanish just above the ground, and above the basin's rim (they would otherwise
 * fall through the water).
 *
 * A few "hero" leaves (or petals) are moved on the CPU: they fall to a chosen spot on the basin and
 * tell the caller where they landed, so a ripple can be raised and the leaf left afloat there.
 */
const AREA = { xHalf: 1.6, zMin: -1.3, zMax: 0.85, top: 2.2 };
/** The basin, for the "do not fall through it" rule: centre x (z = 0), radius, and the rim's height. */
const BASIN = { x: 0.1, radius: 0.3, rim: 0.29 };

const MAX_COLORS = 6;

export class Falling {
  readonly mesh: THREE.Mesh;
  private readonly uTime = { value: 0 };
  private readonly uWind = { value: 0 };

  constructor(style: FallingStyle, env: EnvUniforms, texture: THREE.Texture | null, countScale = 1) {
    const count = Math.max(1, Math.round(style.count * countScale));
    const rand = mulberry32(2024);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry);
    geo.instanceCount = count;
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));

    const colors = style.colors.slice(0, MAX_COLORS).map((c) => new THREE.Color(c));
    while (colors.length < MAX_COLORS) colors.push(colors[colors.length - 1]);
    const snow = style.kind === 'snow';
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...env,
        uTime: this.uTime,
        uWind: this.uWind,
        uKind: { value: snow ? 1 : 0 },
        uTex: { value: texture },
        uColors: { value: colors },
        uNColors: { value: Math.min(style.colors.length, MAX_COLORS) },
        uSize: { value: new THREE.Vector2(...style.size) },
        uSpeed: { value: new THREE.Vector2(...style.speed) },
        uSway: { value: style.sway },
        uSpin: { value: style.spin },
      },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uWind, uKind, uSway, uSpin;
        uniform vec2 uSize, uSpeed;
        uniform vec3 uColors[${MAX_COLORS}];
        uniform int uNColors;
        varying vec2 vUv;
        varying vec3 vCol, vN, vPos;
        mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
        mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
        mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
        void main() {
          float r1 = aSeed.x, r2 = aSeed.y, r3 = aSeed.z, r4 = aSeed.w;
          float top = ${AREA.top.toFixed(2)};
          float speed = mix(uSpeed.x, uSpeed.y, r1);
          float y = top - mod(uTime * speed + r2 * top, top);
          float ph = r3 * 62.83;
          vec3 c = vec3((fract(r3 * 7.13) * 2.0 - 1.0) * ${AREA.xHalf.toFixed(2)}, y, mix(${AREA.zMin.toFixed(2)}, ${AREA.zMax.toFixed(2)}, fract(r4 * 5.31)));
          c.x += sin(uTime * (0.5 + r1 * 0.6) + ph) * uSway + uWind * sin(uTime * 0.23 + ph) * uSway * 0.6;
          c.z += cos(uTime * (0.4 + r2 * 0.5) + ph * 1.3) * uSway;
          // the ground, or the rim of the basin: a piece is gone once it reaches it (it shrinks away)
          float floorY = length(c.xz - vec2(${BASIN.x.toFixed(2)}, 0.0)) < ${BASIN.radius.toFixed(2)} ? ${BASIN.rim.toFixed(3)} : 0.012;
          float life = smoothstep(floorY, floorY + 0.05, y) * smoothstep(0.0, 0.2, top - y);
          float sz = fract(r1 * 13.7);
          float size = mix(uSize.x, uSize.y, uKind > 0.5 ? sz * sz * sz : sz) * life;
          vec3 local, n;
          if (uKind < 0.5) {
            // a leaf or petal tumbling as it falls
            float yaw = uTime * uSpin * (0.4 + r4) + ph;
            mat3 R = rotY(yaw) * rotX(sin(uTime * uSpin * 0.9 + ph * 2.0) * 0.9) * rotZ(cos(uTime * uSpin * 1.2 + ph) * 0.7);
            local = R * vec3(position.x, 0.0, -position.y) * size;
            n = R * vec3(0.0, 1.0, 0.0);
          } else {
            // a flake: a round disc facing the camera
            vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            local = (right * position.x + up * position.y) * size;
            n = normalize(cameraPosition - c);
          }
          vec3 w = c + local;
          vCol = uColors[int(floor(fract(r2 * 3.77 + r1) * float(uNColors)))];
          vUv = uv;
          vN = n;
          vPos = w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader:
        ENV_GLSL +
        /* glsl */ `
        uniform sampler2D uTex;
        uniform float uKind;
        varying vec2 vUv;
        varying vec3 vCol, vN, vPos;
        void main() {
          vec3 base;
          if (uKind < 0.5) {
            vec4 t = texture2D(uTex, vUv);
            if (t.a < 0.5) discard;
            base = vCol * t.rgb;
          } else {
            if (length(vUv - 0.5) > 0.5) discard;
            base = vCol;
          }
          vec3 n = normalize(vN);
          if (dot(n, normalize(cameraPosition - vPos)) < 0.0) n = -n;
          // the surroundings' light, and the sun through a thin piece from either side
          vec3 light = envColor(n) * 0.8 + uSunCol * (abs(dot(n, uSunDir)) * 0.5 + 0.1) * 0.3;
          gl_FragColor = vec4(base * light, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  update(time: number, wind: number): void {
    this.uTime.value = time;
    this.uWind.value = wind;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

interface Hero { mesh: THREE.Mesh; t: number; dur: number; x0: number; z0: number; tx: number; tz: number; phase: number; color: string; active: boolean }

/** A few leaves (or petals) that fall to the basin and stay afloat where they land. */
export class HeroFall {
  readonly group = new THREE.Group();
  private readonly heroes: Hero[] = [];
  private readonly rand = mulberry32(5150);
  private next = 3;
  private time = 0;

  constructor(
    private readonly style: FallingStyle,
    private readonly basin: { center: THREE.Vector3; bowlRadius: number; level: number },
    private readonly onLand: (x: number, z: number, color: string) => void,
    geometry: THREE.BufferGeometry = leafGeometry(0.055),
    texture: THREE.Texture = mapleLeafTexture(),
  ) {
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.visible = false;
      mesh.castShadow = false;
      this.group.add(mesh);
      this.heroes.push({ mesh, t: 0, dur: 1, x0: 0, z0: 0, tx: 0, tz: 0, phase: 0, color: '#c8321c', active: false });
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.time >= this.next) {
      const h = this.heroes.find((x) => !x.active);
      if (h) this.launch(h);
      this.next = this.time + 6 + this.rand() * 8;
    }
    const level = this.basin.level + 0.002;
    const top = 1.25;
    for (const h of this.heroes) {
      if (!h.active) continue;
      h.t += dt;
      const p = Math.min(1, h.t / h.dur);
      // drifts in from the side, its sway dying away as it settles
      const sway = (1 - p) * (1 - p);
      const x = h.tx + (h.x0 - h.tx) * sway + Math.sin(h.t * 2.1 + h.phase) * 0.05 * sway;
      const z = h.tz + (h.z0 - h.tz) * sway + Math.cos(h.t * 1.7 + h.phase) * 0.05 * sway;
      const y = level + (top - level) * (1 - p);
      h.mesh.position.set(x, y, z);
      const flat = 1 - Math.min(1, sway * 1.4);
      h.mesh.rotation.set(
        -Math.PI / 2 + Math.sin(h.t * this.style.spin + h.phase) * 0.9 * (1 - flat),
        h.phase + h.t * 0.9,
        Math.cos(h.t * this.style.spin * 1.2 + h.phase) * 0.7 * (1 - flat),
        'YXZ',
      );
      if (p >= 1) {
        h.active = false;
        h.mesh.visible = false;
        this.onLand(h.tx, h.tz, h.color);
      }
    }
  }

  private launch(h: Hero): void {
    const r = this.rand;
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * this.basin.bowlRadius * 0.7;
    h.tx = this.basin.center.x + Math.cos(a) * d;
    h.tz = this.basin.center.z + Math.sin(a) * d;
    h.x0 = h.tx + (r() - 0.5) * 0.5;
    h.z0 = h.tz + (r() - 0.5) * 0.5;
    h.dur = 3 + r() * 1.5;
    h.t = 0;
    h.phase = r() * 6.28;
    h.color = this.style.colors[Math.floor(r() * this.style.colors.length)];
    (h.mesh.material as THREE.MeshStandardMaterial).color.set(h.color);
    h.active = true;
    h.mesh.visible = true;
  }

  dispose(): void {
    for (const h of this.heroes) (h.mesh.material as THREE.Material).dispose();
  }
}
