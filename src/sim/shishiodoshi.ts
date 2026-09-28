import { defaultConfig, type SimConfig } from './config';
import type { SimEvent } from './events';
import { contactTorque, tubeMassProps, type MassProps } from './rigidBody';
import { streamLanding, type StreamLanding } from './stream';
import { TubeHydro, type WaterShape } from './tubeHydro';

/** Everything that changes. Plain numbers, so a state can be copied and compared. */
export interface SimState {
  time: number;
  angle: number;
  omega: number;
  /** Water in the tube (m^3). */
  volume: number;
  /** World tilt of the water surface from sloshing, and its rate. */
  alpha: number;
  alphaDot: number;
  /** Running totals for bookkeeping (m^3): into the tube, spilled out of it, and missed. */
  totalIn: number;
  totalOut: number;
  totalMissed: number;
}

/** What the renderer and the sound need after each step, derived from the state. */
export interface SimOutputs {
  /** The water surface in the tube (TubeHydro's s and phi), or null when empty. */
  surface: { s: number; phi: number } | null;
  /** Spill over the lip: flow (m^3/s), tube-local lip point, and the speed the water leaves at. */
  spill: { flow: number; lipX: number; lipY: number; speed: number };
  stream: StreamLanding;
  /** Torques about the axle (N m), for the debug graph. */
  torqueWater: number;
  torqueTube: number;
}

export class ShishiodoshiSim {
  readonly cfg: SimConfig;
  readonly hydro: TubeHydro;
  readonly mass: MassProps;
  state: SimState;
  out: SimOutputs;
  /** Events since the last drain, in time order. */
  private events: SimEvent[] = [];
  private shape: WaterShape = { volume: 0, cx: 0, cy: 0, dVds: 0 };
  private lastLevel: number | undefined;
  private inContact = false;
  private inFront = false;
  private pouring = false;

  constructor(cfg: SimConfig = defaultConfig) {
    this.cfg = cfg;
    this.hydro = new TubeHydro(cfg.tube);
    this.mass = tubeMassProps(cfg.tube);
    this.state = { time: 0, angle: cfg.restAngle, omega: 0, volume: 0, alpha: 0, alphaDot: 0, totalIn: 0, totalOut: 0, totalMissed: 0 };
    this.inContact = true;
    this.out = {
      surface: null,
      spill: { flow: 0, lipX: cfg.tube.front, lipY: 0, speed: 0 },
      stream: streamLanding(cfg, cfg.restAngle, null),
      torqueWater: 0,
      torqueTube: 0,
    };
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Energy of the tube and its water (J): kinetic plus potential, for tests. */
  energy(): number {
    const st = this.state, m = this.mass, g = this.cfg.gravity;
    const c = Math.cos(st.angle), s = Math.sin(st.angle);
    const yTube = m.cx * s + m.cy * c;
    return 0.5 * m.inertia * st.omega * st.omega + m.mass * g * yTube;
  }

  step(dt: number): void {
    const cfg = this.cfg, st = this.state, g = cfg.gravity;
    const c = Math.cos(st.angle), s = Math.sin(st.angle);

    // water in the tube: where its surface is, where its weight acts, and how much spills
    const phi = st.angle + st.alpha;
    let mw = 0, wx = 0, wy = 0, spillFlow = 0, speed = 0;
    let surface: SimOutputs['surface'] = null;
    let lip = this.hydro.lipPoint(phi);
    if (st.volume > 1e-9) {
      const sLevel = this.hydro.levelFor(phi, st.volume, this.shape, this.lastLevel);
      this.lastLevel = sLevel;
      this.hydro.shape(phi, sLevel, this.shape);
      surface = { s: sLevel, phi };
      mw = 1000 * st.volume;
      wx = this.shape.cx;
      wy = this.shape.cy;
      const h = sLevel - this.hydro.lipLevel(phi);
      if (h > 0) {
        // the mouth as a weir: Q = Cd (2/3) sqrt(2 g) w h^1.5, w the width of the crest wetted
        const r = this.hydro.r;
        const w = h < r ? 2 * Math.sqrt(h * (2 * r - h)) : 2 * r;
        spillFlow = Math.min(cfg.weirCd * (2 / 3) * Math.sqrt(2 * g) * w * Math.pow(h, 1.5), st.volume / dt);
        // the water leaving the lip has also slid down the tilted tube from its centroid to the lip
        const lipX = this.hydro.lipPoint(phi).x;
        const slide = Math.max(0, (lipX - this.shape.cx) * -Math.sin(st.angle));
        speed = Math.sqrt(2 * g * (h + slide));
      }
    }

    // the kakei's stream: into the mouth, or elsewhere
    const landing = streamLanding(cfg, st.angle, surface ? { s: surface.s, alpha: st.alpha } : null);
    const inflow = landing.target === 'mouth' ? cfg.inflow.flow : 0;

    // torques about the axle: weight acts at each centroid's horizontal offset from the axle
    const m = this.mass;
    const tauTube = -m.mass * g * (m.cx * c - m.cy * s);
    const tauWater = -mw * g * (wx * c - wy * s);
    const inertia = m.inertia + mw * (wx * wx + wy * wy);
    const f = cfg.friction;
    let tau = tauTube + tauWater - f.viscous * st.omega - f.dry * Math.tanh(st.omega / 0.02);
    tau += contactTorque(cfg, st.angle, st.omega, inertia);
    const acc = tau / inertia;

    // semi-implicit Euler: stable for the stiff stone contact at 240 Hz
    const prevOmega = st.omega;
    st.omega += acc * dt;
    st.angle += st.omega * dt;

    // slosh: the surface tilts against the tube's angular acceleration and settles back
    const sl = cfg.slosh;
    st.alphaDot += (-sl.omega * sl.omega * st.alpha - 2 * sl.zeta * sl.omega * st.alphaDot - sl.coupling * acc) * dt;
    st.alpha += st.alphaDot * dt;
    st.alpha = Math.max(-0.6, Math.min(0.6, st.alpha));

    // water bookkeeping
    const vin = inflow * dt, vout = spillFlow * dt;
    st.volume = Math.max(0, st.volume + vin - vout);
    st.totalIn += vin;
    st.totalOut += vout;
    st.totalMissed += cfg.inflow.flow * dt - vin;
    st.time += dt;

    // events
    const contact = st.angle > cfg.restAngle;
    if (contact && !this.inContact) {
      // speed of the tube's back end where it meets the stone
      this.events.push({ type: 'strike', time: st.time, speed: Math.abs(prevOmega) * cfg.tube.back, airLength: this.airLength() });
    }
    this.inContact = contact;
    const front = st.angle < cfg.frontStopAngle;
    if (front && !this.inFront) this.events.push({ type: 'frontStop', time: st.time, speed: Math.abs(prevOmega) * cfg.tube.front });
    this.inFront = front;
    const pouring = spillFlow > 2e-5;
    if (pouring !== this.pouring) this.events.push({ type: pouring ? 'pourStart' : 'pourEnd', time: st.time });
    this.pouring = pouring;
    if (landing.target !== this.out.stream.target) this.events.push({ type: 'streamTarget', time: st.time, target: landing.target });

    lip = this.hydro.lipPoint(phi);
    this.out = {
      surface,
      spill: { flow: spillFlow, lipX: lip.x, lipY: lip.y, speed },
      stream: landing,
      torqueWater: tauWater,
      torqueTube: tauTube,
    };
  }

  /**
   * Fill the tube almost to its lip at once (the "tip it now" button): it then tips over within a
   * moment. The water added is counted as inflow, so the bookkeeping still balances.
   */
  topUp(): void {
    const phi = this.state.angle + this.state.alpha;
    const capacity = this.hydro.shape(phi, this.hydro.lipLevel(phi)).volume;
    const add = Math.max(0, capacity * 0.98 - this.state.volume);
    this.state.volume += add;
    this.state.totalIn += add;
  }

  /** Length of the air column in the compartment (m): the water shortens it (for the knock's pitch). */
  airLength(): number {
    const t = this.cfg.tube;
    const len = t.front - t.cut / 2 - t.diaphragm;
    const area = Math.PI * this.hydro.r * this.hydro.r;
    return Math.max(0.01, len - this.state.volume / area);
  }
}
