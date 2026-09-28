import * as THREE from 'three';
import type { Season } from '../scene/seasons';
import { CANOPY_GLSL, type Canopy } from './canopy';

/**
 * The surroundings, seen out of focus as in ref2: a garden of sunlit greenery with bright bokeh where
 * the sun comes through the leaves, darker trunks and shade, a pale sky above the canopy.
 * It is drawn procedurally once, into a cube texture; after that every shader (the backdrop, the
 * ground's haze, the water's reflections) looks it up with `envColor(dir)`, and the image-based
 * lighting is prefiltered from the same cube, so they all agree. Linear HDR radiance.
 */
const ENV_PROCEDURAL_GLSL = /* glsl */ `
uniform vec3 uSunDir, uLeafCol, uLeafLit, uShadeCol, uSkyCol;

float envHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float envNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(envHash(i), envHash(i + vec2(1, 0)), u.x), mix(envHash(i + vec2(0, 1)), envHash(i + vec2(1, 1)), u.x), u.y);
}
float envFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * envNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }

// soft discs of sunlit leaves, like out-of-focus highlights
float envBokeh(vec2 p, float scale, float seed) {
  vec2 q = p * scale, i = floor(q), f = fract(q);
  float b = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(x, y);
    float h = envHash(c + seed);
    if (h < 0.55) continue;
    vec2 o = vec2(envHash(c + seed + 3.1), envHash(c + seed + 7.7));
    float r = 0.2 + 0.25 * envHash(c + seed + 1.9);
    float d = length(q - c - o);
    b += (h - 0.55) * 2.2 * (1.0 - smoothstep(r * 0.35, r, d));
  }
  return b;
}

vec3 envProcedural(vec3 d) {
  d = normalize(d);
  float az = atan(d.z, d.x), el = asin(clamp(d.y, -1.0, 1.0));
  vec2 p = vec2(az * 2.2, el * 3.0);
  // how much foliage fills this direction (the canopy thins toward the zenith)
  float leaves = smoothstep(0.3, 0.6, envFbm(p * 1.3) + 0.7 - 0.35 * smoothstep(0.5, 1.4, el));
  float sunward = pow(max(dot(d, uSunDir), 0.0), 2.0);
  float lit = envFbm(p * 2.1 + 5.0);
  vec3 foliage = mix(uShadeCol, uLeafCol, smoothstep(0.3, 0.7, lit));
  foliage = mix(foliage, uLeafLit, 0.6 * smoothstep(0.55, 0.85, lit) * (0.5 + sunward));
  // trunks: a few dark vertical bands
  float trunk = smoothstep(0.93, 0.97, envNoise(vec2(az * 9.0, 0.3))) * smoothstep(0.5, -0.1, el);
  foliage = mix(foliage, uShadeCol * 0.35, trunk);
  vec3 sky = uSkyCol * (1.0 + 2.5 * pow(max(dot(d, uSunDir), 0.0), 16.0));
  vec3 c = mix(sky, foliage, leaves);
  // bokeh: sunlight glinting through the leaves, bigger and warmer toward the sun
  float bk = 0.12 * envBokeh(p, 5.0, 0.0) + 0.15 * envBokeh(p, 9.0, 11.0);
  c += uLeafLit * bk * leaves * (0.45 + 1.4 * sunward) * smoothstep(-0.25, 0.1, el);
  // below the horizon: the garden floor, mossy and shaded
  float g = smoothstep(0.08, -0.35, el);
  vec3 floorCol = mix(uShadeCol * 0.9, uLeafCol * 0.7, envFbm(p * 3.0 + 2.0));
  c = mix(c, floorCol, g);
  return c;
}
`;

/** What other shaders include: the sun, and the baked surroundings. */
export const ENV_GLSL = /* glsl */ `
uniform vec3 uSunDir, uSunCol;
uniform samplerCube uEnvCube;
vec3 envColor(vec3 d) { return textureLod(uEnvCube, d, 0.0).rgb; }
`;

export function envUniforms(season: Season) {
  const el = THREE.MathUtils.degToRad(season.sun.elevation);
  const az = THREE.MathUtils.degToRad(season.sun.azimuth);
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const lin = (hex: string, k = 1) => {
    const c = new THREE.Color(hex);
    return new THREE.Vector3(c.r * k, c.g * k, c.b * k);
  };
  return {
    uSunDir: { value: sunDir },
    uSunCol: { value: lin(season.sun.color, season.sun.intensity) },
    uLeafCol: { value: lin(season.foliage.leaf, 0.6) },
    uLeafLit: { value: lin(season.foliage.leafLit, 1.1) },
    uShadeCol: { value: lin(season.foliage.shade, 0.5) },
    uSkyCol: { value: lin(season.sky.top, 1.2) },
    uEnvCube: { value: null as THREE.CubeTexture | null },
  };
}
export type EnvUniforms = ReturnType<typeof envUniforms>;

/** The backdrop: a large sphere showing the surroundings, behind everything. */
export function buildEnvDome(uniforms: EnvUniforms, procedural = false): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader:
      (procedural ? ENV_PROCEDURAL_GLSL : ENV_GLSL) +
      /* glsl */ `
      varying vec3 vDir;
      void main() {
        gl_FragColor = vec4(${procedural ? 'envProcedural' : 'envColor'}(vDir), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), mat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  return dome;
}

/**
 * Draw the surroundings once into a cube texture (`uEnvCube`, for envColor), and prefilter it for
 * image-based lighting on the bamboo, wood and stone. Returns the prefiltered environment.
 */
export function bakeEnvironment(renderer: THREE.WebGLRenderer, uniforms: EnvUniforms): THREE.Texture {
  const scene = new THREE.Scene();
  const dome = buildEnvDome(uniforms, true);
  (dome.material as THREE.ShaderMaterial).toneMapped = false;
  scene.add(dome);
  const cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cam = new THREE.CubeCamera(0.1, 100, cubeRT);
  cam.update(renderer, scene);
  uniforms.uEnvCube.value = cubeRT.texture;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromCubemap(cubeRT.texture);
  pmrem.dispose();
  return rt.texture;
}

/**
 * Fade a standard material into the surroundings with distance, so the ground has no visible edge
 * and dissolves into the same out-of-focus garden as the backdrop. Beyond the reach of the sun's
 * shadow map the leaves' dappling is taken straight from the canopy texture, so it carries on.
 */
export function addGardenFog(mat: THREE.Material, uniforms: EnvUniforms, near: number, far: number, canopy: Canopy['uniforms']): void {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, canopy);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGardenPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGardenPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGardenPos;\n' + ENV_GLSL + CANOPY_GLSL)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        #if NUM_DIR_LIGHT_SHADOWS > 0
          vec3 gsc = vDirectionalShadowCoord[0].xyz / vDirectionalShadowCoord[0].w;
          float inMap = smoothstep(0.0, 0.06, min(min(gsc.x, gsc.y), min(1.0 - gsc.x, 1.0 - gsc.y)));
          reflectedLight.directDiffuse *= mix(canopyLight(vGardenPos, uSunDir), 1.0, inMap);
        #endif`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `float gardenK = smoothstep(${near.toFixed(3)}, ${far.toFixed(3)}, length(vGardenPos - cameraPosition));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, envColor(vGardenPos - cameraPosition), gardenK);
        #include <tonemapping_fragment>`,
      );
  };
}
