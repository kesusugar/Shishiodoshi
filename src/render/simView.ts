import * as THREE from 'three';
import type { ShishiodoshiSim } from '../sim/shishiodoshi';
import { mulberry32 } from '../scene/random';
import type { ShishiodoshiScene } from '../scene/shishiodoshi';
import type { EnvUniforms } from './env';
import type { BasinWater } from './water/basinWater';
import { Splash } from './water/splash';
import { Stream } from './water/stream';
import { TubeWater } from './water/tubeWater';

/**
 * Everything seen that the simulation decides: the tube's angle, the water held in it, where the
 * kakei's stream ends, the pour over the lip, and the ripples where water lands in the basin.
 */
export class SimView {
  readonly kakeiStream: Stream;
  readonly pour: Stream;
  readonly tubeWater: TubeWater;
  readonly splash: Splash;
  private splashAcc = 0;
  private prevAngle: number;
  private readonly rand = mulberry32(9);
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly sim: ShishiodoshiSim,
    private readonly world: ShishiodoshiScene,
    private readonly basin: BasinWater,
    env: EnvUniforms,
    fleshColor: THREE.Color,
  ) {
    const cfg = sim.cfg;
    this.kakeiStream = new Stream(env);
    const { spout, velocity, flow } = cfg.inflow;
    this.kakeiStream.set(new THREE.Vector3(spout.x, spout.y, 0), new THREE.Vector3(velocity.x, velocity.y, 0), flow, 0, 0);
    this.pour = new Stream(env, 0.8);
    this.pour.uFoam.value = 0.55;
    this.tubeWater = new TubeWater(cfg.tube, env, fleshColor);
    this.splash = new Splash(env, basin, { center: new THREE.Vector3(cfg.basin.x, 0, 0), bowlRadius: cfg.basin.radius, level: cfg.basinLevel });
    world.tube.add(this.tubeWater.mesh);
    this.prevAngle = sim.state.angle;
  }

  /** Call before each simulation step, so the drawn angle can be interpolated between steps. */
  beforeStep(): void {
    this.prevAngle = this.sim.state.angle;
  }

  /** @param alpha fraction of a step since the last one (0..1); @param dt frame time (s). */
  update(alpha: number, dt: number): void {
    const sim = this.sim, st = sim.state, out = sim.out, cfg = sim.cfg;
    const angle = this.prevAngle + (st.angle - this.prevAngle) * alpha;
    const tube = this.world.tube;
    tube.rotation.z = angle;
    tube.updateMatrixWorld();

    // the kakei's stream ends where the simulation says it lands
    const land = out.stream;
    this.kakeiStream.setEnd(land.y);
    this.kakeiStream.update(st.time);
    let hit: { x: number; z: number } | null = null;
    if (land.target === 'mouth') {
      const c = Math.cos(st.angle), s = Math.sin(st.angle);
      const px = land.x - cfg.pivot.x, py = land.y - cfg.pivot.y;
      hit = { x: px * c + py * s, z: 0 };
    } else if (land.target === 'basin') {
      // a steady stream into the basin: a small crater, jittering
      for (let i = 0; i < 2; i++) {
        this.tmp.set(land.x + (this.rand() - 0.5) * 0.006, land.y, (this.rand() - 0.5) * 0.006);
        this.basin.addDrop(this.tmp, 0.004, -(0.6 + this.rand()) * 12 * dt);
      }
      // and a few small drops thrown up
      this.splashAcc += 25 * dt;
      const n = Math.floor(this.splashAcc);
      this.splashAcc -= n;
      this.splash.emit(this.tmp.set(land.x, land.y, 0), n, [0.2, 0.7], [0.0004, 0.0012]);
    }
    this.tubeWater.update(out.surface, hit, st.time);

    // the pour over the lip
    const sp = out.spill;
    if (sp.flow > 1e-6) {
      const lip = tube.localToWorld(new THREE.Vector3(sp.lipX, sp.lipY, 0));
      const axis = new THREE.Vector3(Math.cos(st.angle), Math.sin(st.angle), 0);
      // water leaves along the tube, plus the lip's own motion as the tube swings
      const rx = lip.x - cfg.pivot.x, ry = lip.y - cfg.pivot.y;
      // (water spilling over a lip only partly takes up the lip's swing, and is never flung upward:
      // as the tube swings back up, the last of it slides off rather than being thrown)
      const vel = axis.multiplyScalar(Math.max(sp.speed, 0.2)).add(new THREE.Vector3(-ry * st.omega, rx * st.omega, 0).multiplyScalar(0.4));
      vel.y = Math.min(vel.y, 0.05);
      const endY = this.landsInBasin(lip, vel) ? cfg.basinLevel : 0;
      this.pour.set(lip, vel, sp.flow, endY, endY);
      this.pour.update(st.time);
      // where it lands in the basin: a trough and a burst of ripples, stronger with more flow
      if (endY > 0) {
        const t = this.fallTime(lip.y, vel.y, cfg.basinLevel);
        const k = Math.min(1, sp.flow / 4e-4);
        for (let i = 0; i < 3; i++) {
          this.tmp.set(lip.x + vel.x * t + (this.rand() - 0.5) * 0.02, cfg.basinLevel, (this.rand() - 0.5) * 0.02);
          this.basin.addDrop(this.tmp, 0.008 + 0.01 * k, -(0.5 + this.rand()) * 35 * k * dt);
        }
        // a spray of drops, thrown onward in the direction the water was going
        this.splashAcc += 900 * k * dt;
        const n = Math.floor(this.splashAcc);
        this.splashAcc -= n;
        this.splash.emit(this.tmp.set(lip.x + vel.x * t, cfg.basinLevel, 0), n, [0.4, 1.4], [0.0008, 0.003], new THREE.Vector3(vel.x * 0.3, 0, 0));
      }
    } else {
      this.pour.set(this.tmp, this.tmp, 0, 0, 0);
    }
    this.splash.update(dt);
  }

  private fallTime(y0: number, vy: number, y1: number): number {
    const g = this.sim.cfg.gravity;
    return (vy + Math.sqrt(Math.max(vy * vy + 2 * g * (y0 - y1), 0))) / g;
  }

  private landsInBasin(p: THREE.Vector3, v: THREE.Vector3): boolean {
    const cfg = this.sim.cfg;
    const x = p.x + v.x * this.fallTime(p.y, v.y, cfg.basinLevel);
    return Math.abs(x - cfg.basin.x) < cfg.basin.radius;
  }
}
