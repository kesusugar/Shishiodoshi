import * as THREE from 'three';
import { chainCompile } from './shaderChain';

/**
 * Snow lying on anything (winter, docs/SEASONS.md 2.6). One patch that can be added to any
 * standard / physical material:
 *
 * - where: on faces that look up, in an uneven edge (noise moves the line where the snow stops, and
 *   makes it lumpy), judged in world space (so a tube that turns carries its snow line with it), lumps in the object's own coordinates;
 * - vertex shader: the surface is pushed out along its normal by `depth` where snow lies, so a
 *   culm, a rim or a roof gets a real thick cap and a silhouette, not just a white paint;
 * - fragment shader: the colour turns to snow white (its shade comes from the bluish sky light),
 *   rough and matt, with a few glints where the low sun catches a crystal.
 *
 * `snowUniform` is the amount for the whole scene (the season sets it: 0 = none, 1 = winter). At 0
 * the patch changes nothing, so the same materials serve every season.
 *
 * Anchors are chosen not to collide with the moss patches (which sit on map_fragment,
 * roughnessmap_fragment and normal_fragment_maps): snow comes after them, so it lies on the moss.
 */
export const snowUniform = { value: 0 };
/** The snow on the tube alone, so it can slide off when the tube tips (the season's amount otherwise). */
export const tubeSnow = { value: 0 };

export function setSnow(amount: number): void {
  snowUniform.value = amount;
}

const SNOW_GLSL = /* glsl */ `
uniform float uSnow;
float snHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float snNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(snHash(i), snHash(i + vec3(1, 0, 0)), f.x), mix(snHash(i + vec3(0, 1, 0)), snHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(snHash(i + vec3(0, 0, 1)), snHash(i + vec3(1, 0, 1)), f.x), mix(snHash(i + vec3(0, 1, 1)), snHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// how much snow lies here (0..1): on what faces up, with an uneven edge; fine = 1 adds small lumps
float snowCover(vec3 n, vec3 p, float fine) {
  float lump = snNoise(p * 9.0) * 0.65 + snNoise(p * 23.0) * 0.35 * fine;
  return uSnow * smoothstep(0.28, 0.6, n.y + (lump - 0.5) * 0.6);
}
`;

/**
 * @param depth how thick a fully covered surface grows (m): a stone 0.014, a bamboo culm 0.011
 * @param amount the uniform holding how much snow there is (default: the whole scene's)
 * @param drift extra depth (m) that comes and goes across the surface in broad drifts (the ground):
 *   the surface is raised and its normal tilted along the slope of the drifts
 */
export function snowify(mat: THREE.Material, depth: number, drift = 0, amount: { value: number } = snowUniform): void {
  chainCompile(
    mat,
    (sh) => {
      sh.uniforms.uSnow = amount;
      const driftAt = (p: string) => `${drift.toFixed(4)} * (snNoise(vec3(${p}.x * 0.8, 0.0, ${p}.z * 0.8)) + 0.25 * snNoise(vec3(${p}.x * 3.5, 1.0, ${p}.z * 3.5)))`;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${SNOW_GLSL}\nvarying vec3 vSnowN;\nvarying vec3 vSnowP;`)
        .replace(
          '#include <beginnormal_vertex>',
          drift > 0
            ? `#include <beginnormal_vertex>
          {
            // tilt the normal along the slope of the drifts, so they show in the light
            vec3 dp = position;
            float d0 = ${driftAt('dp')};
            vec3 dx = dp + vec3(0.04, 0.0, 0.0), dz = dp + vec3(0.0, 0.0, 0.04);
            float gx = (${driftAt('dx')} - d0) / 0.04, gz = (${driftAt('dz')} - d0) / 0.04;
            objectNormal = normalize(objectNormal + vec3(-gx, 0.0, -gz) * uSnow);
          }`
            : '#include <beginnormal_vertex>',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            // which way it faces is judged in the world (a tube that turns carries its snow line with it);
            // the lumps come from the object's own coordinates, so they stay put on it
            mat3 sN = mat3(modelMatrix);
            #ifdef USE_INSTANCING
              sN = mat3(modelMatrix) * mat3(instanceMatrix);
            #endif
            vSnowN = normalize(sN * objectNormal);
            vSnowP = transformed;
            transformed += normalize(objectNormal) * (${depth.toFixed(4)}${drift > 0 ? ` + ${driftAt('vSnowP')}` : ''}) * snowCover(vSnowN, vSnowP, 0.0);
          }`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${SNOW_GLSL}\nvarying vec3 vSnowN;\nvarying vec3 vSnowP;`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float snowK = snowCover(normalize(vSnowN), vSnowP, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98) * (0.94 + 0.06 * snNoise(vSnowP * 60.0)), snowK);`,
        )
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, snowK);')
        // snow is matt: no varnish on it (bamboo has a clearcoat)
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - snowK;\n#endif')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          // a few crystals glint where the sun catches them
          totalEmissiveRadiance += vec3(1.0, 0.97, 0.92) * step(0.9965, snHash(floor(vSnowP * 420.0))) * snowK * 1.6;`,
        );
    },
    `snow ${depth} ${drift}`,
  );
}
