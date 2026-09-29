import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AudioEngine } from './audio/engine';
import { waitForStart } from './audio/startGate';
import { SimGraph } from './debug/graph';
import { gpuName, Hud } from './debug/hud';
import { probe } from './debug/probe';
import { Canopy } from './render/canopy';
import { Post } from './render/post';
import { pickQuality, saveChoice, savedChoice } from './render/quality';
import { BasinWater } from './render/water/basinWater';
import { SimView } from './render/simView';
import { waterBeads } from './render/water/beads';
import { Overflow } from './render/water/overflow';
import { FloatingLeaves } from './render/water/floatingLeaves';
import { Falling, HeroFall } from './render/falling';
import { petalGeometry, petalTexture } from './scene/blossom';
import { buildGarden } from './scene/garden';
import { buildShishiodoshi } from './scene/shishiodoshi';
import { pickSeason, rememberSeason, saveRound, savedRound, seasonNames, seasons, type Season, type SeasonName } from './scene/seasons';
import { disposeTree } from './scene/dispose';
import { setMossColor } from './scene/rockMaterial';
import { setSnow, tubeSnow } from './render/snow';
import { SnowSlide } from './render/snowSlide';
import { buildSeasonBar } from './ui/seasonBar';
import { buildStage, cameraPresets, type CameraPreset } from './scene/stage';
import { FixedStepper } from './sim/fixedStep';
import type { SimEvent } from './sim/events';
import { ShishiodoshiSim } from './sim/shishiodoshi';
import { defaultConfig } from './sim/config';
import { buildSettingsPanel, defaultSettings, loadSettings, type Settings } from './ui/settings';

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

// PC or phone (render/quality.ts)
const quality = pickQuality(params);
probe.quality = quality.name;

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' });
} catch (e) {
  fail(`WebGL2 を初期化できませんでした。\n${e instanceof Error ? e.message : String(e)}`);
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = pickSeason(params).exposure; // summer 1.2: ref3 is a bright photo, mid-tones up, the sun's highlights still held by AgX
renderer.shadowMap.enabled = !off.has('shadow');
renderer.shadowMap.type = quality.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
// on phones the shadow map is redrawn every few frames (the sun and the leaves overhead move slowly)
renderer.shadowMap.autoUpdate = quality.shadowEvery === 1;
renderer.shadowMap.needsUpdate = true;

probe.gpu = gpuName(renderer.getContext() as WebGL2RenderingContext);
const hud = new Hud(hudEl, `${probe.gpu}  [${quality.name}]`);
if (capture) hudEl.hidden = true;

let season: Season = pickSeason(params);
setSnow(season.snow);
probe.season = season.name;
const scene = new THREE.Scene();
const stage = buildStage(renderer, scene, season);
stage.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
const canopy = new Canopy(season.canopy);
if (!off.has('canopy')) scene.add(canopy.mesh);
const world = buildShishiodoshi(season, stage.env, canopy.uniforms);
scene.add(world.root);
const gardenSpec = { center: world.basin.center, bowlRadius: world.basin.bowlRadius, level: world.basin.waterLevel };
let garden = buildGarden(season, canopy.uniforms, gardenSpec);
if (!off.has('garden')) scene.add(garden.root);
const waterSpec = { ...world.basin, wind: season.wind };
const water = new BasinWater(renderer, waterSpec, stage.env, canopy.uniforms);
if (!off.has('water')) scene.add(water.mesh);

// Settings (flow and volumes; the tools always run with the defaults)
const settings: Settings = capture ? { ...defaultSettings } : loadSettings();

// The simulation (with its own copy of the inflow, which the settings change), and what it moves
const sim = new ShishiodoshiSim({ ...defaultConfig, inflow: { ...defaultConfig.inflow, flow: settings.flow * 1e-6 } });
const simView = new SimView(sim, world, water, stage.env, new THREE.Color('#d9c89a'));
probe.inspect.sim = sim;
probe.inspect.water = water;
// Winter: the snow on the tube slides off when it tips (the amount on the tube alone is `tubeSnow`,
// which falls quickly and builds up again slowly), and lumps of it fly and fall.
const snowSlide = new SnowSlide(
  { center: world.basin.center, bowlRadius: world.basin.bowlRadius, level: world.basin.waterLevel },
  (x, z) => water.addDrop(new THREE.Vector3(x, world.basin.waterLevel, z), 0.008, -0.25),
);
scene.add(snowSlide.mesh);
let tubeSnowLevel = season.snow;
tubeSnow.value = season.snow;
function shakeSnow(): void {
  if (season.snow <= 0 || tubeSnow.value < 0.35) return;
  const t = sim.cfg.tube;
  world.tube.updateMatrixWorld();
  snowSlide.trigger(world.tube, -t.back * 0.6, t.front - t.cut - 0.02, t.radius, new THREE.Vector3(Math.cos(sim.state.angle), Math.sin(sim.state.angle), 0), 12);
  tubeSnowLevel = 0.1;
}
// offline sound for tools/audio.mjs: WAV bytes as base64
probe.inspect.renderAudio = async (seconds: number, start: number) => {
  const { renderOffline } = await import('./audio/offline');
  const bytes = new Uint8Array(await renderOffline(seconds, start, 48000, season));
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
let audio: AudioEngine | null = null;
const graph = new SimGraph(document.body, params.has('debug'));
// "tip it now" (PLAN.md 8章): fill the tube to its lip, so the moment comes without waiting
const tipButton = document.querySelector<HTMLButtonElement>('#tip')!;
tipButton.addEventListener('click', () => sim.topUp());
if (capture) tipButton.hidden = true;
if (!off.has('stream')) scene.add(simView.kakeiStream.mesh, simView.pour.mesh, simView.splash.mesh);
// Everything the season puts in the air and on the water: leaves afloat on the basin (riding its
// ripples and pushed about by the water), and leaves / petals / snow falling. Rebuilt on a change.
const waterRef = { uSurf: water.surfaceUniform, center: world.basin.center, bowlRadius: world.basin.bowlRadius, level: world.basin.waterLevel };
let falling: Falling | null = null;
let hero: HeroFall | null = null;
function buildSeasonLife(): void {
  if (simView.floating) {
    scene.remove(simView.floating.group);
    simView.floating.dispose();
  }
  const petals = season.garden.floaterKind === 'petal';
  simView.floating = new FloatingLeaves(
    waterRef,
    petals ? petalTexture() : garden.leafTexture,
    season.garden.floaters,
    petals ? petalGeometry(0.03, 6) : undefined,
  );
  if (!off.has('garden')) scene.add(simView.floating.group);
  if (falling) {
    scene.remove(falling.mesh);
    falling.dispose();
    falling = null;
  }
  if (hero) {
    scene.remove(hero.group);
    hero.dispose();
    hero = null;
  }
  const style = season.falling;
  if (style && !off.has('falling')) {
    const tex = style.kind === 'leaf' ? garden.leafTexture : style.kind === 'petal' ? petalTexture() : null;
    falling = new Falling(style, stage.env, tex, quality.particleScale);
    scene.add(falling.mesh);
    if (style.landsInBasin) {
      hero = new HeroFall(
        style,
        waterRef,
        (x, z, color) => {
          // it touches down: a small ring, and it stays afloat
          water.addDrop(new THREE.Vector3(x, waterRef.level, z), 0.01, -0.35);
          simView.floating?.spawn(x, z, color);
        },
        style.kind === 'petal' ? petalGeometry(0.03, 4) : undefined,
        style.kind === 'petal' ? petalTexture() : undefined,
      );
      scene.add(hero.group);
    }
  }
}
buildSeasonLife();
// the basin brims over at a low point of its rim, toward the front right
simView.overflow = new Overflow(stage.env, world.basinMesh, world.basin.center, world.basin.rimY, 1.0);
if (!off.has('water')) scene.add(simView.overflow.mesh);
probe.inspect.overflow = simView.overflow;
// beads of water on the wet bamboo, riding with the tube
{
  const t = sim.cfg.tube;
  world.tube.add(waterBeads(stage.env, { radius: t.radius, from: 0.0, to: t.front - t.cut }, 260, 3));
}

const preset = cameraPresets[view] ?? cameraPresets.main;
const camera = new THREE.PerspectiveCamera(preset.fov, 1, 0.01, 100);
camera.position.copy(preset.position);

// Look around within limits (PLAN.md 8章).
const controls = new OrbitControls(camera, canvas);
controls.target.copy(preset.target);
// on a portrait screen, look a little further left so the striker stone (where the knock comes
// from) is in view as well as the basin
if (canvas.clientWidth < canvas.clientHeight) {
  const shift = new THREE.Vector3(-0.1, 0, 0);
  camera.position.add(shift);
  controls.target.add(shift);
}
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
  // the presets are framed for a 16:9 window: on a narrower (portrait phone) screen, widen the view
  // part of the way, so the whole shishi-odoshi still fits without a strong wide-angle look
  const narrow = Math.max(1, 16 / 9 / camera.aspect);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(preset.fov) / 2) * Math.sqrt(narrow)));
  camera.updateProjectionMatrix();
  post.setSize(w, h);
}
const post = new Post(renderer, scene, camera, { taps: quality.dofTaps, targetFps: quality.targetFps, minScale: quality.minScale });
window.addEventListener('resize', resize);
resize();

const stepper = new FixedStepper();
const clock = new THREE.Timer();
/** Events waiting for the sound engine (P2). */
const pending: SimEvent[] = [];
const step = (h: number) => {
  simView.beforeStep();
  sim.step(h);
  const events = sim.drainEvents();
  graph.record(sim, events.flatMap((e) => (e.type === 'strike' ? [e] : [])));
  for (const e of events) if (e.type === 'frontStop') shakeSnow();
  pending.push(...events);
};
// ?at=T (for screenshots): fast-forward to 0.6 s before T, run on (so ripples develop), and freeze at T
const at = Number(params.get('at') ?? 0);
for (let t = at > 0 ? Math.max(0, at - 0.6) : Number(params.get('t') ?? 0); t > 0; t -= 0.25) stepper.advance(Math.min(t, 0.25), step);
pending.length = 0;

renderer.compile(scene, camera);
renderer.setAnimationLoop((timestamp) => {
  clock.update(timestamp);
  // a stalled tab (or the first frame after loading) must not dump seconds of forcing at once;
  // and the first frame can come out negative (its timestamp predates heavy work before it)
  const real = Math.min(Math.max(clock.getDelta(), 0), 0.1);
  // screenshots advance exactly 1/60 s per frame, so a given frame count is a given moment
  let dt = capture ? 1 / 60 : real;
  if (at > 0 && sim.state.time >= at - 1e-9) {
    dt = 0;
    probe.frozen = true;
  }
  stepper.advance(dt, step);
  audio?.send(sim, pending, sim.state.time);
  pending.length = 0;
  simView.update(stepper.alpha, dt);
  canopy.update(sim.state.time, season.wind);
  snowSlide.update(dt);
  tubeSnowLevel = Math.min(season.snow, tubeSnowLevel + dt * 0.012);
  tubeSnow.value = tubeSnow.value > tubeSnowLevel ? tubeSnowLevel + (tubeSnow.value - tubeSnowLevel) * Math.exp(-dt / 0.18) : tubeSnowLevel;
  if (quality.shadowEvery > 1 && probe.frames % quality.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
  garden.update(sim.state.time, season.wind);
  falling?.update(sim.state.time, season.wind);
  hero?.update(dt);
  if (!off.has('water')) water.update(dt);
  controls.update();
  if (off.has('dof')) renderer.render(scene, camera);
  else {
    post.adapt(dt);
    post.render(controls.target);
  }

  const st = sim.state;
  hud.frame(dt, `res ${(post.scale * 100).toFixed(0)}%  sim ${st.time.toFixed(1)} s  ${THREE.MathUtils.radToDeg(st.angle).toFixed(1)} deg  ${(st.volume * 1e6).toFixed(0)} mL`);
  graph.draw(st.time);
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

// Changing the season while running: fade to black, swap everything the season sets, fade back in
// (the sound carries on). The fade hides the one-off cost of re-baking the surroundings.
const fadeEl = document.querySelector<HTMLElement>('#fade')!;
let switching = false;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function changeSeason(name: SeasonName, instant = false): Promise<void> {
  const next = seasons[name];
  if (!next || switching || next.name === season.name) return;
  switching = true;
  if (!instant) {
    fadeEl.style.opacity = '1';
    await wait(480);
  }
  season = next;
  setMossColor(next.foliage.moss);
  setSnow(next.snow);
  tubeSnowLevel = next.snow;
  tubeSnow.value = next.snow;
  stage.setSeason(next);
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMappingExposure = next.exposure;
  canopy.setStyle(next.canopy);
  waterSpec.wind = next.wind;
  scene.remove(garden.root);
  disposeTree(garden.root);
  garden = buildGarden(next, canopy.uniforms, gardenSpec);
  if (!off.has('garden')) scene.add(garden.root);
  buildSeasonLife();
  probe.season = next.name;
  rememberSeason(next.name);
  seasonBar?.select(next.name);
  audio?.setSeason(next.name, next.wind);
  if (!instant) {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    fadeEl.style.opacity = '0';
  }
  switching = false;
}
probe.inspect.changeSeason = changeSeason;
// The seasons can come round by themselves (⟳): every ROUND_SECONDS the next one; picking one by hand stops it.
const ROUND_SECONDS = Number(params.get('round')) || 50; // (?round=5 for testing)
let roundTimer: ReturnType<typeof setInterval> | undefined;
function setRound(on: boolean): void {
  clearInterval(roundTimer);
  roundTimer = undefined;
  if (on) {
    roundTimer = setInterval(() => {
      const names = seasonNames();
      void changeSeason(names[(names.indexOf(season.name) + 1) % names.length]);
    }, ROUND_SECONDS * 1000);
  }
  seasonBar?.setAuto(on);
  saveRound(on);
}
const seasonBar = capture
  ? null
  : buildSeasonBar(
      season.name,
      (n) => {
        setRound(false);
        void changeSeason(n);
      },
      setRound,
      false,
    );
if (seasonBar) document.body.append(seasonBar.el);
if (seasonBar && savedRound()) setRound(true);
probe.inspect.setRound = setRound;

const applySettings = (st: Settings) => {
  sim.cfg.inflow.flow = st.flow * 1e-6;
  simView.setInflow(sim.cfg.inflow.flow);
  if (audio) audio.gains = { knock: st.knock, water: st.water, ambient: st.ambient };
};
if (!capture) {
  document.body.append(
    buildSettingsPanel(
      settings,
      (st) => {
        Object.assign(settings, st);
        applySettings(settings);
      },
      {
        choice: savedChoice(),
        current: quality.name,
        // antialiasing and the shadow map's size are fixed when the page starts: apply by loading it again
        onPick: (choice) => {
          saveChoice(choice);
          const url = new URL(location.href);
          url.searchParams.delete('quality');
          location.href = url.toString();
        },
      },
    ),
  );
  void waitForStart(document.querySelector<HTMLElement>('#start')!).then(async (ctx) => {
    audio = await AudioEngine.create(ctx);
    audio.setSeason(season.name, season.wind);
    applySettings(settings);
  });
}
