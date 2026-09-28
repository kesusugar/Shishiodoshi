import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { waitForStart } from './audio/startGate';
import { gpuName, Hud } from './debug/hud';
import { probe } from './debug/probe';
import { Post } from './render/post';
import { BasinWater } from './render/water/basinWater';
import { SimView } from './render/simView';
import { buildShishiodoshi } from './scene/shishiodoshi';
import { defaultSeason } from './scene/seasons';
import { buildStage, cameraPresets, type CameraPreset } from './scene/stage';
import { FixedStepper } from './sim/fixedStep';
import { ShishiodoshiSim } from './sim/shishiodoshi';

// URL options: ?view=main|close|mouth|wide picks a camera preset; ?capture hides the UI and skips the
// click-to-start screen (used by tools/ for screenshots and measurements); ?t=20 fast-forwards the
// simulation by 20 s before the first frame (to capture a given moment, e.g. mid-pour).
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const view = (params.get('view') ?? 'main') as CameraPreset;
// ?off=dof,stream,water,shadow switches features off (for measuring what costs what)
const off = new Set((params.get('off') ?? '').split(','));

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
renderer.shadowMap.enabled = !off.has('shadow');
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

probe.gpu = gpuName(renderer.getContext() as WebGL2RenderingContext);
const hud = new Hud(hudEl, probe.gpu);
if (capture) hudEl.hidden = true;

const season = defaultSeason;
const scene = new THREE.Scene();
const stage = buildStage(renderer, scene, season);
const world = buildShishiodoshi(season, stage.env);
scene.add(world.root);
const water = new BasinWater(renderer, { ...world.basin, wind: season.wind }, stage.env);
if (!off.has('water')) scene.add(water.mesh);

// The simulation, and what it moves
const sim = new ShishiodoshiSim();
const simView = new SimView(sim, world, water, stage.env, new THREE.Color('#d9c89a'));
probe.inspect.sim = sim;
if (!off.has('stream')) scene.add(simView.kakeiStream.mesh, simView.pour.mesh);

const preset = cameraPresets[view] ?? cameraPresets.main;
const camera = new THREE.PerspectiveCamera(preset.fov, 1, 0.01, 100);
camera.position.copy(preset.position);

// Look around within limits (PLAN.md 8章).
const controls = new OrbitControls(camera, canvas);
controls.target.copy(preset.target);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 0.35;
controls.maxDistance = 2.5;
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
  post.setSize(w, h);
}
const post = new Post(renderer, scene, camera);
window.addEventListener('resize', resize);
resize();

const stepper = new FixedStepper();
const clock = new THREE.Timer();
const step = (h: number) => {
  simView.beforeStep();
  sim.step(h);
};
for (let t = Number(params.get('t') ?? 0); t > 0; t -= 0.25) stepper.advance(Math.min(t, 0.25), step);
sim.drainEvents();

renderer.compile(scene, camera);
renderer.setAnimationLoop((timestamp) => {
  clock.update(timestamp);
  // a stalled tab (or the first frame after loading) must not dump seconds of forcing at once
  const dt = Math.min(clock.getDelta(), 0.1);
  stepper.advance(dt, step);
  sim.drainEvents(); // the sound engine will consume these (P2)
  simView.update(stepper.alpha, dt);
  if (!off.has('water')) water.update(dt);
  controls.update();
  if (off.has('dof')) renderer.render(scene, camera);
  else post.render(controls.target);

  const st = sim.state;
  hud.frame(dt, `sim ${st.time.toFixed(1)} s  ${THREE.MathUtils.radToDeg(st.angle).toFixed(1)} deg  ${(st.volume * 1e6).toFixed(0)} mL`);
  probe.frames++;
  probe.simTime = st.time;
  probe.fps = hud.currentFps;
  probe.ready = true;
});

// A click (not a drag) on the water makes a ripple.
{
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -water.level);
  const hit = new THREE.Vector3();
  let down: [number, number, number] | null = null;
  canvas.addEventListener('pointerdown', (ev) => (down = [ev.clientX, ev.clientY, performance.now()]));
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6 || performance.now() - down[2] > 500) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, 1 - ((ev.clientY - r.top) / r.height) * 2), camera);
    if (ray.ray.intersectPlane(plane, hit)) water.addDrop(hit, 0.01, 6);
  });
}

if (!capture) {
  void waitForStart(document.querySelector<HTMLElement>('#start')!).then((ctx) => {
    console.info(`[shishi] audio started at ${ctx.sampleRate} Hz`);
  });
}
