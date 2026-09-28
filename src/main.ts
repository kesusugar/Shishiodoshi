import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { waitForStart } from './audio/startGate';
import { gpuName, Hud } from './debug/hud';
import { probe } from './debug/probe';
import { buildPlaceholder } from './scene/placeholder';
import { defaultSeason } from './scene/seasons';
import { buildStage, cameraPresets, type CameraPreset } from './scene/stage';
import { FixedStepper } from './sim/fixedStep';

// URL options: ?view=ref1|close picks a camera preset; ?capture hides the UI and skips the
// click-to-start screen (used by tools/ for screenshots and measurements).
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const view = (params.get('view') ?? 'ref1') as CameraPreset;

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hudEl = document.querySelector<HTMLElement>('#hud')!;

function fail(message: string): never {
  probe.error = message;
  const el = document.querySelector<HTMLElement>('#fatal')!;
  el.textContent = message;
  el.hidden = false;
  throw new Error(message);
}

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  fail(`WebGL2 を初期化できませんでした。\n${e instanceof Error ? e.message : String(e)}`);
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

probe.gpu = gpuName(renderer.getContext() as WebGL2RenderingContext);
const hud = new Hud(hudEl, probe.gpu);
if (capture) hudEl.hidden = true;

const season = defaultSeason;
const scene = new THREE.Scene();
buildStage(scene, season);
const world = buildPlaceholder(season);
scene.add(world.root);

const preset = cameraPresets[view] ?? cameraPresets.ref1;
const camera = new THREE.PerspectiveCamera(preset.fov, 1, 0.02, 50);
camera.position.copy(preset.position);

// Look around within limits (PLAN.md 8章).
const controls = new OrbitControls(camera, canvas);
controls.target.copy(preset.target);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 0.6;
controls.maxDistance = 3.0;
controls.minPolarAngle = THREE.MathUtils.degToRad(35);
controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
controls.minAzimuthAngle = THREE.MathUtils.degToRad(-60);
controls.maxAzimuthAngle = THREE.MathUtils.degToRad(60);
controls.update();

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// The simulation (P1) will plug in here; for now the stepper only keeps sim time.
const stepper = new FixedStepper();
const clock = new THREE.Timer();

renderer.compile(scene, camera);
renderer.setAnimationLoop((timestamp) => {
  clock.update(timestamp);
  const dt = clock.getDelta();
  stepper.advance(dt, () => {});
  controls.update();
  renderer.render(scene, camera);

  hud.frame(dt, `sim ${stepper.time.toFixed(1)} s`);
  probe.frames++;
  probe.simTime = stepper.time;
  probe.fps = hud.currentFps;
  probe.ready = true;
});

if (!capture) {
  void waitForStart(document.querySelector<HTMLElement>('#start')!).then((ctx) => {
    console.info(`[shishi] audio started at ${ctx.sampleRate} Hz`);
  });
}
