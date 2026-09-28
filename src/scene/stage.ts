import * as THREE from 'three';
import { bakeEnvironment, buildEnvDome, envUniforms, type EnvUniforms } from '../render/env';
import type { Season } from './seasons';

/**
 * Camera presets. `main` fills the frame with the whole shishi-odoshi; `close` is on the tube's
 * mouth and the basin's water (ref2); `wide` shows the arrangement in its garden.
 */
export const cameraPresets = {
  main: { position: new THREE.Vector3(0.02, 0.82, 1.3), target: new THREE.Vector3(0.02, 0.46, 0.0), fov: 40 },
  close: { position: new THREE.Vector3(0.34, 0.74, 0.7), target: new THREE.Vector3(0.07, 0.44, 0.0), fov: 42 },
  mouth: { position: new THREE.Vector3(0.22, 0.8, 0.36), target: new THREE.Vector3(0.0, 0.66, 0.0), fov: 40 },
  wide: { position: new THREE.Vector3(0.1, 1.1, 1.9), target: new THREE.Vector3(0.0, 0.5, 0.0), fov: 40 },
} as const;
export type CameraPreset = keyof typeof cameraPresets;

export interface Stage {
  sun: THREE.DirectionalLight;
  env: EnvUniforms;
}

/** Surroundings, sun and image-based light for a season. */
export function buildStage(renderer: THREE.WebGLRenderer, scene: THREE.Scene, season: Season): Stage {
  const env = envUniforms(season);
  scene.add(buildEnvDome(env));
  scene.environment = bakeEnvironment(renderer, env);
  scene.environmentIntensity = season.ambient.envIntensity;

  const sun = new THREE.DirectionalLight(season.sun.color, season.sun.intensity);
  sun.position.copy(env.uSunDir.value).multiplyScalar(3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -0.9;
  s.right = 0.9;
  s.top = 0.9;
  s.bottom = -0.9;
  s.near = 0.5;
  s.far = 6;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.004;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  // a touch of soft fill so shaded sides are not black
  scene.add(new THREE.HemisphereLight('#f4f6ff', '#6a6450', season.ambient.fill));
  return { sun, env };
}
