/**
 * The shishi-odoshi's sound, synthesised sample by sample (PLAN.md 7章). No recordings: every sound
 * starts from a physical event or quantity the simulation reports.
 *
 * Loudness order (the knock is THE sound; the water stays in the background):
 *   knock (high) > pour off the lip, water landing in the basin (low-medium) > the kakei's trickle (low)
 *
 * - The knock ("kon!"), started exactly at the strike's time, as a sum of decaying modes:
 *   a hard contact transient (a few ms of bright noise), the culm wall's ovalling modes (the
 *   hollow woody tone, ~1 kHz and ~2.7 kHz for this culm), its bending modes (free-free beam), a
 *   faint air column (quarter-wave, shortened by water left in it) and a very faint stone thud.
 *   Bamboo is heavily damped, so everything dies within ~0.2 s: no bell-like ring.
 *   The strike's intensity (its angular speed before contact, relative to a normal cycle) sets
 *   the gain, the brightness (how much the upper modes are excited), a slight rise in pitch and a
 *   slightly longer ring; each strike also detunes its modes a little, so no two are identical.
 * - The kakei's trickle: small bubbles (Minnaert f = 3.26 / r, van den Doel decay) where it lands;
 *   into the tube it also rings the air column, whose pitch climbs as the tube fills.
 * - The pour: a soft, band-limited rush following the drain rate over the lip.
 * - The landing: bubbles and a soft splash where the poured water reaches the basin, following
 *   the flow arriving there (the pour's flow delayed by its fall time).
 * - Wind in the leaves, faint.
 */

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

type Target = 'mouth' | 'skin' | 'basin' | 'ground';

interface StrikeMsg { type: 'strike' | 'stop'; time: number; intensity: number; airLength: number }
interface ParamsMsg {
  type: 'params';
  streamTarget: Target;
  streamFlow: number; // m^3/s landing
  fallHeight: number; // m the stream fell
  airLength: number; // m of air in the compartment
  pourFlow: number; // m^3/s over the lip (the drain rate)
  landFlow: number; // m^3/s of poured water reaching the basin now
  wind: number;
  gains: { knock: number; water: number; ambient: number };
}

// Mix: the knock's level at a normal strike, and the water layers under it (see the header)
const MIX = { knock: 0.7, trickle: 0.14, pour: 0.07, landBubbles: 0.06, landSplash: 0.016, stop: 0.45, roomKnock: 0.3, roomWater: 0.12 };

const TWO_PI = Math.PI * 2;
const SOUND = 343;

/** Two-pole resonator: rings at f with a given 60 dB decay time when fed an input. */
class Resonator {
  private y1 = 0;
  private y2 = 0;
  private a1 = 0;
  private a2 = 0;
  private g = 0;
  set(f: number, t60: number): void {
    const r = Math.exp(-6.91 / (t60 * sampleRate));
    this.a1 = 2 * r * Math.cos((TWO_PI * f) / sampleRate);
    this.a2 = -r * r;
    this.g = 1 - r; // keeps the peak gain roughly independent of the decay
  }
  tick(x: number): number {
    const y = this.a1 * this.y1 + this.a2 * this.y2 + this.g * x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** One-pole filters. */
class OnePole {
  private z = 0;
  constructor(private k = 0.1) {}
  setCutoff(f: number): void {
    this.k = 1 - Math.exp((-TWO_PI * f) / sampleRate);
  }
  lp(x: number): number {
    this.z += this.k * (x - this.z);
    return this.z;
  }
  hp(x: number): number {
    return x - this.lp(x);
  }
}

interface Bubble { f: number; rise: number; decay: number; amp: number; t: number; phase: number; tube: boolean }

/** Deterministic noise (so offline renders repeat exactly). */
class Rng {
  constructor(private s = 12345) {}
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  bi(): number {
    return this.next() * 2 - 1;
  }
}

// The culm. E along the fibres for bending, across them for the wall's ovalling.
const TUBE = { length: 0.76, outer: 0.036, inner: 0.03, E: 15e9, Etrans: 1.5e9, density: 750 };
const BEAM = [4.73, 7.853, 10.996];

interface Mode { f: number; t60: number; a: number; /** how much a harder strike brings this mode up (brightness) */ bright: number }

/**
 * The knock's modes, loudest first:
 * - ovalling of the wall (ring modes n = 2, 3 of a thin shell):
 *   f_n = h / (2 pi R^2) sqrt(E / (12 rho (1 - nu^2))) n (n^2 - 1) / sqrt(n^2 + 1)
 * - bending of the whole culm (free-free beam): f_n = (beta_n L)^2 / (2 pi L^2) sqrt(E I / (rho A))
 */
function knockModes(): Mode[] {
  const { length: L, outer: R, inner: r, E, Etrans, density } = TUBE;
  const h = R - r, Rm = (R + r) / 2;
  const shell = (h / (TWO_PI * Rm * Rm)) * Math.sqrt(Etrans / (12 * density * (1 - 0.3 * 0.3)));
  const ring = (n: number) => shell * (n * (n * n - 1)) / Math.sqrt(n * n + 1);
  const I = (Math.PI / 4) * (R ** 4 - r ** 4);
  const A = Math.PI * (R * R - r * r);
  const k = Math.sqrt((E * I) / (density * A));
  const beam = (i: number) => ((BEAM[i] * BEAM[i]) / (TWO_PI * L * L)) * k;
  return [
    { f: ring(2), t60: 0.22, a: 1.0, bright: 0 }, // ~1 kHz: the "kon"
    { f: ring(3), t60: 0.08, a: 0.45, bright: 0.8 }, // ~2.7 kHz: the edge of the "k"
    { f: beam(0), t60: 0.15, a: 0.4, bright: 0 }, // ~650 Hz: body
    { f: beam(1), t60: 0.07, a: 0.3, bright: 0.5 },
    { f: beam(2), t60: 0.045, a: 0.18, bright: 1 },
  ];
}
const MODES = knockModes();

/** One knock: modes that start together at the strike and decay; overlapping knocks (bounces) add. */
class Knock {
  private readonly f: number[];
  private readonly amp: number[];
  private readonly dec: number[];
  private readonly air: { f: number; amp: number; dec: number };
  private t = 0;
  private readonly contact: number; // s, the contact time: the modes swell over it
  private readonly clickAmp: number;
  private readonly thudAmp: number;
  private readonly hp = new OnePole();
  private readonly lp = new OnePole();
  readonly gain: number;
  /**
   * @param stop the tube's belly landing on the crossbar instead: wood on wood, with the tube still
   * full of water, so dull and short (its wall barely rings, no hollow air column, no hard click)
   */
  constructor(intensity: number, airLength: number, rng: Rng, stop = false) {
    this.hp.setCutoff(2000);
    this.lp.setCutoff(stop ? 500 : 800);
    const I = Math.max(0, intensity);
    // harder: a touch sharper (the wall stiffens under the blow) and rings a little longer
    const pitch = 1 + 0.008 * Math.min(I, 1.5);
    const ring = 0.85 + 0.2 * Math.min(I, 1.5);
    this.f = MODES.map((m) => m.f * pitch * (1 + 0.006 * rng.bi()));
    this.amp = MODES.map((m) => m.a * Math.pow(Math.min(I, 1.5), m.bright) * (1 + 0.1 * rng.bi()));
    this.dec = MODES.map((m) => 6.91 / (m.t60 * ring * (stop ? 0.3 : 1)));
    if (stop) this.amp.forEach((a, i) => (this.amp[i] = a * [0.8, 0.1, 0.6, 0.15, 0][i]));
    // the air column: the hollowness under the knock, faint
    const fa = SOUND / (4 * (airLength + 0.6 * TUBE.inner));
    this.air = { f: fa * (1 + 0.004 * rng.bi()), amp: stop ? 0 : 0.22, dec: 6.91 / (0.1 * ring) };
    this.contact = stop ? 0.003 : 0.0012 - 0.0006 * Math.min(I, 1.5);
    this.clickAmp = stop ? 0.08 * I : 0.6 * Math.pow(Math.min(I, 1.5), 1.2);
    this.thudAmp = stop ? 0.5 : 0.08;
    // gain: a firmer knock with more swing, but gently (a bounce at a third of the speed is ~1/4 as loud)
    this.gain = Math.pow(I, 1.25) * (stop ? MIX.stop : 1);
  }
  get done(): boolean {
    return this.t > 0.4;
  }
  tick(dt: number, noise: number): number {
    const t = this.t;
    // modes swell over the contact time, then ring down
    const swell = t < this.contact ? 0.5 - 0.5 * Math.cos((Math.PI * t) / this.contact) : 1;
    let y = 0;
    for (let i = 0; i < this.f.length; i++) y += this.amp[i] * Math.exp(-this.dec[i] * t) * Math.sin(TWO_PI * this.f[i] * t);
    y += this.air.amp * Math.exp(-this.air.dec * t) * Math.sin(TWO_PI * this.air.f * t);
    y *= swell;
    // the contact itself: a few ms of bright noise (the hard "k")
    y += this.hp.hp(noise * this.clickAmp * Math.exp(-t / 0.0015));
    // the stone: a dull, very faint thud
    y += this.lp.lp(noise * this.thudAmp * Math.exp(-t / 0.006)) + 0.05 * Math.exp(-t / 0.03) * Math.sin(TWO_PI * 120 * t);
    this.t += dt;
    return y * this.gain;
  }
}

/**
 * The garden's acoustics: outdoors, so no hall, just a few early reflections off the stones, the
 * basin and the posts nearby (a little different in each ear) and a very short, darkened tail
 * (Schroeder: parallel damped combs, then an allpass). Makes the knock sit in a place.
 */
class GardenRoom {
  private readonly buf = new Float32Array(8192);
  private w = 0;
  // early reflections: delay (ms), gain, left / right
  private readonly taps: { d: number; g: number; l: number; r: number }[];
  private readonly combs: { buf: Float32Array; i: number; fb: number; z: number }[];
  private readonly ap = { buf: new Float32Array(256), i: 0 };
  private readonly dark = new OnePole();
  constructor() {
    const ms = (x: number) => Math.round((x / 1000) * sampleRate);
    this.taps = [
      { d: ms(4.7), g: 0.45, l: 1, r: 0.6 },
      { d: ms(9.3), g: 0.32, l: 0.5, r: 1 },
      { d: ms(13.9), g: 0.24, l: 1, r: 0.8 },
      { d: ms(21.1), g: 0.16, l: 0.7, r: 1 },
      { d: ms(33.7), g: 0.1, l: 1, r: 0.5 },
    ];
    // tail of about a third of a second
    this.combs = [29.7, 37.1, 41.1, 43.7].map((d) => ({ buf: new Float32Array(ms(d)), i: 0, fb: 0.62, z: 0 }));
    this.dark.setCutoff(3500);
  }
  /** Feed one sample; returns the wet [left, right]. */
  tick(x: number, out: [number, number]): void {
    this.buf[this.w] = x;
    let l = 0, r = 0;
    for (const t of this.taps) {
      const v = this.buf[(this.w - t.d + 8192) & 8191] * t.g;
      l += v * t.l;
      r += v * t.r;
    }
    this.w = (this.w + 1) & 8191;
    // tail
    const xin = this.dark.lp(x) * 0.25;
    let tail = 0;
    for (const c of this.combs) {
      const y = c.buf[c.i];
      c.z += 0.4 * (y - c.z); // damping: highs die first
      c.buf[c.i] = xin + c.z * c.fb;
      c.i = (c.i + 1) % c.buf.length;
      tail += y;
    }
    const a = this.ap, yb = a.buf[a.i];
    const ya = -0.5 * tail + yb;
    a.buf[a.i] = tail + 0.5 * ya;
    a.i = (a.i + 1) % a.buf.length;
    out[0] = l + ya;
    out[1] = r + ya * 0.9;
  }
}

class ShishiSynth extends AudioWorkletProcessor {
  private readonly rng = new Rng();
  private readonly strikes: StrikeMsg[] = [];
  private p: ParamsMsg = {
    type: 'params', streamTarget: 'mouth', streamFlow: 0, fallHeight: 0.1, airLength: 0.4, pourFlow: 0, landFlow: 0, wind: 0.25,
    gains: { knock: 1, water: 1, ambient: 1 },
  };
  // knocks ringing (a strike and its bounces can overlap)
  private readonly knocks: Knock[] = [];
  private readonly room = new GardenRoom();
  private readonly wet: [number, number] = [0, 0];
  // water
  private readonly bubbles: Bubble[] = [];
  private readonly tubeAir = new Resonator();
  private readonly tubeAir2 = new Resonator();
  private airLen = 0.4;
  private readonly splashHp = new OnePole();
  private readonly rushHp = new OnePole();
  private readonly rushLp = new OnePole();
  private readonly landHp = new OnePole();
  private readonly landLp = new OnePole();
  private pourEnv = 0;
  private landEnv = 0;
  private streamEnv = 0;
  // wind
  private readonly windLp = new OnePole();
  private readonly windLp2 = new OnePole();
  private windPhase = 0;
  private brown = 0;

  constructor() {
    super();
    this.splashHp.setCutoff(900);
    // the pour: water sliding off a lip is a soft, mid-band rush, not a hiss
    this.rushHp.setCutoff(350);
    this.rushLp.setCutoff(1800);
    this.landHp.setCutoff(500);
    this.landLp.setCutoff(3000);
    this.windLp.setCutoff(500);
    this.windLp2.setCutoff(180);
    this.setAir(0.4);
    this.port.onmessage = (e: MessageEvent<StrikeMsg | ParamsMsg>) => {
      const m = e.data;
      if (m.type === 'params') this.p = m;
      else {
        this.strikes.push(m);
        this.strikes.sort((a, b) => a.time - b.time);
      }
    };
  }

  /** The compartment's air column: closed at the node, open at the mouth (quarter wave + end correction). */
  private setAir(len: number): void {
    this.airLen = len;
    const f = SOUND / (4 * (len + 0.6 * TUBE.inner));
    this.tubeAir.set(f, 0.09);
    this.tubeAir2.set(3 * f, 0.05);
  }

  private spawnBubble(rMin: number, rMax: number, amp: number, tube: boolean): void {
    if (this.bubbles.length > 96) return;
    // log-uniform radius: many small bubbles, fewer large
    const r = rMin * Math.pow(rMax / rMin, this.rng.next());
    const f = 3.26 / r;
    const decay = 0.13 * f + 0.0072 * Math.pow(f, 1.5);
    this.bubbles.push({ f, rise: 0.1 * decay * (0.5 + this.rng.next()), decay, amp: amp * Math.sqrt(r / 0.003), t: 0, phase: 0, tube });
  }

  process(_in: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const L = out[0], R = out[1] ?? out[0];
    const n = L.length;
    const dt = 1 / sampleRate;
    const p = this.p, g = p.gains;
    // air column follows the water level smoothly
    this.setAir(this.airLen + (p.airLength - this.airLen) * 0.05);
    // bubble rates from where the water lands (per second)
    const intoTube = p.streamTarget === 'mouth';
    const streamRate = p.streamFlow > 0 ? 40 + p.streamFlow * 3e6 * Math.min(1, p.fallHeight / 0.2) : 0;
    const land = Math.min(1, p.landFlow / 6e-4);
    const landRate = land > 0.01 ? 80 + 500 * land : 0;
    for (let i = 0; i < n; i++) {
      const t = currentTime + i * dt;
      let knock = 0, trickle = 0, tubeIn = 0, landing = 0;

      // strikes due by this sample start a knock (sample-accurate)
      while (this.strikes.length && this.strikes[0].time <= t) {
        const s = this.strikes.shift()!;
        if (s.intensity > 0.03) this.knocks.push(new Knock(s.intensity, s.airLength, this.rng, s.type === 'stop'));
      }
      for (let k = this.knocks.length - 1; k >= 0; k--) {
        knock += this.knocks[k].tick(dt, this.rng.bi());
        if (this.knocks[k].done) this.knocks.splice(k, 1);
      }

      // bubbles: the trickle's (into the tube or the basin) and the poured water's in the basin
      if (streamRate > 0 && this.rng.next() < streamRate * dt) this.spawnBubble(0.0012, 0.004, 0.05, intoTube);
      if (landRate > 0 && this.rng.next() < landRate * dt) this.spawnBubble(0.0015, 0.006, -1, false);
      for (let b = this.bubbles.length - 1; b >= 0; b--) {
        const bb = this.bubbles[b];
        const env = Math.exp(-bb.decay * bb.t);
        if (env < 0.001) {
          this.bubbles.splice(b, 1);
          continue;
        }
        bb.phase += TWO_PI * bb.f * (1 + bb.rise * bb.t) * dt;
        // (a negative amplitude marks a landing bubble: its level is set by the mix below)
        const s = Math.abs(bb.amp) * env * Math.sin(bb.phase) * Math.min(1, bb.t * 1500);
        bb.t += dt;
        if (bb.amp < 0) landing += s * MIX.landBubbles;
        else if (bb.tube) tubeIn += s;
        else trickle += s;
      }
      // water striking water: a splashy noise; inside the tube it rings the air column
      this.streamEnv += ((p.streamFlow > 0 ? 1 : 0) - this.streamEnv) * 0.0005;
      const splash = this.splashHp.hp(this.rng.bi()) * this.streamEnv * 0.02 * Math.min(1, p.fallHeight / 0.2);
      if (intoTube) tubeIn += splash;
      else trickle += splash;
      const air = this.tubeAir.tick(tubeIn * 6) * 3 + this.tubeAir2.tick(tubeIn * 6) * 1.2;
      trickle += tubeIn * 0.5 + air;

      // the pour off the lip: follows the drain rate
      this.pourEnv += (Math.min(1, p.pourFlow / 6e-4) - this.pourEnv) * 0.002;
      const nz = this.rng.bi();
      const rush = this.rushLp.lp(this.rushHp.hp(nz)) * this.pourEnv * MIX.pour;
      // the landing: a soft splash under the bubbles, following the flow arriving in the basin
      this.landEnv += (land - this.landEnv) * 0.003;
      landing += this.landLp.lp(this.landHp.hp(this.rng.bi())) * this.landEnv * MIX.landSplash;

      // wind: brown noise, low-passed, swelling slowly
      this.brown = (this.brown + 0.02 * this.rng.bi()) * 0.995;
      this.windPhase += dt * 0.07;
      const gust = 0.5 + 0.5 * Math.sin(TWO_PI * this.windPhase) * Math.sin(TWO_PI * this.windPhase * 0.37 + 1.3);
      const wind = this.windLp.lp(this.windLp2.lp(this.brown) * 0.5 + this.brown * 0.3) * (0.2 + 0.8 * gust) * p.wind * 0.08;

      const water = trickle * MIX.trickle + rush + landing;
      const dryKnock = knock * MIX.knock * g.knock, dryWater = water * g.water;
      const mono = dryKnock + dryWater;
      this.room.tick(dryKnock * MIX.roomKnock + dryWater * MIX.roomWater, this.wet);
      // the tube and basin sit a little left of centre; the wind is wide
      const l = Math.tanh(mono * 1.05 + this.wet[0] + wind * g.ambient);
      const r = Math.tanh(mono * 0.95 + this.wet[1] - wind * g.ambient * 0.6);
      L[i] = l;
      R[i] = r;
    }
    return true;
  }
}

registerProcessor('shishi-synth', ShishiSynth);
