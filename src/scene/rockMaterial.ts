import * as THREE from 'three';
import { andesite } from '../render/textures';
import type { Season } from './seasons';

/**
 * Dark wet stone with moss growing on whatever faces the sky, in fuzzy patches (ref3). The moss is
 * decided per pixel from the world-space normal, so it stays on top however a rock is placed.
 * The bare stone is wet unevenly (glossy streaks and matt patches), pitted, and darker and soiled
 * where it goes into the ground, so it sits in the soil rather than on it.
 */
export function mossyRockMaterial(season: Season, seed: number): THREE.MeshStandardMaterial {
  const stone = andesite(seed);
  const mossCol = new THREE.Color(season.foliage.moss);
  const mat = new THREE.MeshStandardMaterial({ map: stone.color, bumpMap: stone.bump, bumpScale: 4, roughnessMap: stone.rough, roughness: 1 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMoss = { value: mossCol };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUp;\nvarying vec3 vObjPos;\nvarying float vWorldY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUp = normalize(mat3(modelMatrix) * normal);\nvObjPos = position;\nvWorldY = (modelMatrix * vec4(position, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vUp;
        varying vec3 vObjPos;
        varying float vWorldY;
        uniform vec3 uMoss;
        float mh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float mn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(mh(i), mh(i + vec3(1,0,0)), f.x), mix(mh(i + vec3(0,1,0)), mh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(mh(i + vec3(0,0,1)), mh(i + vec3(1,0,1)), f.x), mix(mh(i + vec3(0,1,1)), mh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // moss on what faces the sky, in patches, fuzzy at the edges
        float patchy = mn(vObjPos * 5.0) * 0.6 + mn(vObjPos * 17.0) * 0.4;
        float mossK = smoothstep(0.15, 0.5, vUp.y + (patchy - 0.5) * 1.1);
        float fuzz = mn(vObjPos * 90.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, uMoss * (0.35 + 0.9 * fuzz) * (0.7 + 0.5 * patchy), mossK);
        // bare stone: pits (small dark specks), and wet streaks that run downward
        float pits = smoothstep(0.72, 0.8, mn(vObjPos * 140.0));
        float wetStreak = mn(vec3(vObjPos.x * 22.0, vObjPos.y * 4.0, vObjPos.z * 22.0));
        diffuseColor.rgb *= (1.0 - 0.45 * pits * (1.0 - mossK)) * (1.0 - 0.25 * smoothstep(0.45, 0.75, wetStreak) * (1.0 - mossK));
        // into the ground: damp, soil-stained and in the shade of its own base
        float sunk = 1.0 - smoothstep(0.0, 0.08, vWorldY + 0.015 * (patchy - 0.5));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.04, 0.03), sunk * 0.7);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor *= mix(1.1, 0.45, smoothstep(0.45, 0.75, wetStreak));\nroughnessFactor = mix(roughnessFactor, 1.0, max(mossK, sunk * 0.6));',
      );
  };
  return mat;
}
