import * as THREE from 'three';
import { bakeEnvironment, buildEnvDome, envUniforms, sunDirection, updateEnvUniforms, type EnvUniforms } from '../render/env';
import type { Season } from './seasons';

/**
 * Camera presets. `main` fills the frame with the whole shishi-odoshi; `close` is on the tube's
 * mouth and the basin's water (ref2); `wide` shows the arrangement in its garden.
 */
export const cameraPresets = {
  main: { position: new THREE.Vector3(0.32, 0.72, 1.1), target: new THREE.Vector3(0.0, 0.5, -0.05), fov: 44 },
  // framed like docs/reference/ref4-four-seasons.webp: the tube from the striker stone to the mouth, the basin, the standing culm
  seasons: { position: new THREE.Vector3(0.3, 0.66, 0.95), target: new THREE.Vector3(0.04, 0.46, 0.0), fov: 40 },
  close: { position: new THREE.Vector3(0.34, 0.74, 0.7), target: new THREE.Vector3(0.07, 0.44, 0.0), fov: 42 },
  stream: { position: new THREE.Vector3(0.24, 0.82, 0.32), target: new THREE.Vector3(0.1, 0.79, 0.0), fov: 34 },
  overflow: { position: new THREE.Vector3(0.55, 0.36, 0.75), target: new THREE.Vector3(0.22, 0.17, 0.2), fov: 38 },
  mouth: { position: new THREE.Vector3(0.22, 0.8, 0.36), target: new THREE.Vector3(0.0, 0.66, 0.0), fov: 40 },
  wide: { position: new THREE.Vector3(0.1, 1.1, 1.9), target: new THREE.Vector3(0.0, 0.5, 0.0), fov: 40 },
} as const;
export type CameraPreset = keyof typeof cameraPresets;

export interface Stage {
  sun: THREE.DirectionalLight;
  env: EnvUniforms;
  /** Change everything the season sets here (sun, fill, surroundings): recolours the shaders in place. */
  setSeason(season: Season): void;
}

/** Surroundings, sun and image-based light for a season. */
export function buildStage(renderer: THREE.WebGLRenderer, scene: THREE.Scene, season: Season): Stage {
  const env = envUniforms(season);
  scene.add(buildEnvDome(env));
  let baked = bakeEnvironment(renderer, env);
  scene.environment = baked.texture;
  scene.environmentIntensity = season.ambient.envIntensity;

  const sun = new THREE.DirectionalLight(season.sun.color, season.sun.intensity);
  sun.position.copy(env.uSunDir.value).multiplyScalar(6); // far enough that the leaves overhead fit in its shadow camera
  sun.castShadow = true;
  // wide enough that the dappled light (render/canopy.ts) covers all the ground in view before the haze
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -2.2;
  s.right = 2.2;
  s.top = 2.2;
  s.bottom = -2.2;
  s.near = 0.5;
  s.far = 12;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.004;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  // a touch of soft fill so shaded sides are not black
  const fill = new THREE.HemisphereLight(season.ambient.sky, season.ambient.ground, season.ambient.fill);
  scene.add(fill);

  return {
    sun,
    env,
    setSeason(next: Season) {
      updateEnvUniforms(env, next);
      sun.color.set(next.sun.color);
      sun.intensity = next.sun.intensity;
      sun.position.copy(sunDirection(next)).multiplyScalar(6);
      fill.color.set(next.ambient.sky);
      fill.groundColor.set(next.ambient.ground);
      fill.intensity = next.ambient.fill;
      // the surroundings are drawn once into a cube and prefiltered: do it again for the new colours
      const old = baked;
      baked = bakeEnvironment(renderer, env);
      scene.environment = baked.texture;
      scene.environmentIntensity = next.ambient.envIntensity;
      old.dispose();
    },
  };
}
