import * as THREE from 'three';
import type { Season } from './seasons';

/** Camera presets. `ref1` matches the framing of docs/reference/ref1; `close` is the ref2-style close-up. */
export const cameraPresets = {
  ref1: { position: new THREE.Vector3(-0.15, 1.05, 1.75), target: new THREE.Vector3(0.0, 0.5, -0.05), fov: 42 },
  close: { position: new THREE.Vector3(0.7, 0.95, 1.0), target: new THREE.Vector3(-0.05, 0.45, 0.0), fov: 35 },
} as const;
export type CameraPreset = keyof typeof cameraPresets;

/** Sky, haze, sun and ambient light for a season. */
export function buildStage(scene: THREE.Scene, season: Season): THREE.DirectionalLight {
  scene.background = new THREE.Color(season.sky.horizon);
  scene.fog = new THREE.FogExp2(season.haze.color, season.haze.density);

  scene.add(new THREE.HemisphereLight(season.ambient.sky, season.ambient.ground, season.ambient.intensity));

  const sun = new THREE.DirectionalLight(season.sun.color, season.sun.intensity);
  const el = THREE.MathUtils.degToRad(season.sun.elevation);
  const az = THREE.MathUtils.degToRad(season.sun.azimuth);
  sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -1.8;
  s.right = 1.8;
  s.top = 1.8;
  s.bottom = -1.8;
  s.near = 0.5;
  s.far = 10;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  scene.add(sun);
  return sun;
}
