/**
 * The shishi-odoshi's sound, synthesised sample by sample (PLAN.md 7章). No recordings: every sound
 * starts from a physical event or quantity the simulation reports.
 *
 * - The knock: the tube's bending modes (free-free beam, from its size and stiffness) and the air
 *   column in the compartment (a quarter-wave tube, shortened by the water left in it), excited by
 *   a contact pulse whose strength and shortness follow the strike speed, plus the stone's click.
 * - Water: bubbles (Minnaert resonance f = 3.26 / r, rising slightly as they near the surface,
 *   decaying per van den Doel), spawned at a rate set by where and how much water lands. Water
 *   falling into the tube also rings its air column, whose pitch climbs as the tube fills.
 * - The pour: many large bubbles at once and a broadband rush.
 * - Wind in the leaves, faint.
 */

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

type Target = 'mouth' | 'skin' | 'basin' | 'ground';

interface StrikeMsg { type: 'strike'; time: number; speed: number; airLength: number }
interface ParamsMsg {
  type: 'params';
  streamTarget: Target;
  streamFlow: number; // m^3/s landing
  fallHeight: number; // m the stream fell
  airLength: number; // m of air in the compartment
  pourFlow: number; // m^3/s over the lip
  wind: number;
  gains: { knock: number; water: number; ambient: number };
}

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

// The tube as a free-free beam: f_n = (beta_n L)^2 / (2 pi L^2) sqrt(EI / (rho A))
const TUBE = { length: 0.76, outer: 0.036, inner: 0.03, E: 15e9, density: 750 };
const BEAM = [4.73, 7.853, 10.996, 14.137];
function tubeModes(): { f: number; t60: number; a: number }[] {
  const { length: L, outer: R, inner: r, E, density } = TUBE;
  const I = (Math.PI / 4) * (R ** 4 - r ** 4);
  const A = Math.PI * (R * R - r * r);
  const k = Math.sqrt((E * I) / (density * A));
  // higher modes die faster; the first carries most of the knock
  return BEAM.map((b, i) => ({ f: ((b * b) / (TWO_PI * L * L)) * k, t60: 0.22 / (1 + 0.7 * i), a: [1, 0.55, 0.35, 0.2][i] }));
}

class ShishiSynth extends AudioWorkletProcessor {
  private readonly rng = new Rng();
  private readonly strikes: StrikeMsg[] = [];
  private p: ParamsMsg = {
    type: 'params', streamTarget: 'mouth', streamFlow: 0, fallHeight: 0.1, airLength: 0.4, pourFlow: 0, wind: 0.25,
    gains: { knock: 1, water: 1, ambient: 1 },
  };
  // knock
  private readonly modes = tubeModes().map((m) => {
    const res = new Resonator();
    res.set(m.f, m.t60);
    return { res, a: m.a };
  });
  private readonly airKnock = new Resonator();
  private pulse: { n: number; len: number; amp: number; click: number } | null = null;
  private readonly clickHp = new OnePole();
  // water
  private readonly bubbles: Bubble[] = [];
  private readonly tubeAir = new Resonator();
  private readonly tubeAir2 = new Resonator();
  private airLen = 0.4;
  private readonly splashHp = new OnePole();
  private readonly rushBp1 = new OnePole();
  private readonly rushBp2 = new OnePole();
  private pourEnv = 0;
  private streamEnv = 0;
  // wind
  private readonly windLp = new OnePole();
  private readonly windLp2 = new OnePole();
  private windPhase = 0;
  private brown = 0;

  constructor() {
    super();
    this.clickHp.setCutoff(2500);
    this.splashHp.setCutoff(900);
    this.rushBp1.setCutoff(5000);
    this.rushBp2.setCutoff(700);
    this.windLp.setCutoff(500);
    this.windLp2.setCutoff(180);
    this.setAir(0.4);
    this.port.onmessage = (e: MessageEvent<StrikeMsg | ParamsMsg>) => {
      const m = e.data;
      if (m.type === 'strike') {
        this.strikes.push(m);
        this.strikes.sort((a, b) => a.time - b.time);
      } else this.p = m;
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
    const pourRate = p.pourFlow * 1.2e6;
    for (let i = 0; i < n; i++) {
      const t = currentTime + i * dt;
      let knock = 0, water = 0, tubeIn = 0;

      // strikes that are due now start a contact pulse
      while (this.strikes.length && this.strikes[0].time <= t) {
        const s = this.strikes.shift()!;
        const v = Math.min(s.speed, 2);
        // a harder strike is louder and shorter (brighter): contact time ~ 1.5 ms down to 0.4 ms
        const len = Math.max(4, Math.round(sampleRate * (0.0015 - 0.0005 * Math.min(v, 2))));
        this.pulse = { n: 0, len, amp: Math.pow(v, 1.3) * 2.2, click: v * v * 0.15 };
        this.airKnock.set(SOUND / (4 * (s.airLength + 0.6 * TUBE.inner)), 0.22);
      }
      let exc = 0, click = 0;
      if (this.pulse) {
        const q = this.pulse;
        exc = q.amp * 0.5 * (1 - Math.cos((TWO_PI * q.n) / q.len));
        click = q.click * this.rng.bi() * Math.exp(-q.n / (sampleRate * 0.003));
        if (++q.n >= q.len * 6) this.pulse = null;
        else if (q.n >= q.len) exc = 0;
      }
      for (const m of this.modes) knock += m.a * m.res.tick(exc);
      knock += 1.2 * this.airKnock.tick(exc);
      knock += this.clickHp.hp(click);

      // bubbles
      const dtRate = dt;
      if (streamRate > 0 && this.rng.next() < streamRate * dtRate) this.spawnBubble(0.0012, 0.004, 0.05, intoTube);
      if (pourRate > 0 && this.rng.next() < pourRate * dtRate) this.spawnBubble(0.0015, 0.009, 0.12, false);
      for (let b = this.bubbles.length - 1; b >= 0; b--) {
        const bb = this.bubbles[b];
        const env = Math.exp(-bb.decay * bb.t);
        if (env < 0.001) {
          this.bubbles.splice(b, 1);
          continue;
        }
        bb.phase += TWO_PI * bb.f * (1 + bb.rise * bb.t) * dt;
        const s = bb.amp * env * Math.sin(bb.phase) * Math.min(1, bb.t * 1500);
        bb.t += dt;
        if (bb.tube) tubeIn += s;
        else water += s;
      }
      // water striking water: a splashy noise; inside the tube it rings the air column
      this.streamEnv += ((p.streamFlow > 0 ? 1 : 0) - this.streamEnv) * 0.0005;
      const splash = this.splashHp.hp(this.rng.bi()) * this.streamEnv * 0.02 * Math.min(1, p.fallHeight / 0.2);
      if (intoTube) tubeIn += splash;
      else water += splash;
      const air = this.tubeAir.tick(tubeIn * 6) * 3 + this.tubeAir2.tick(tubeIn * 6) * 1.2;
      water += tubeIn * 0.5 + air;

      // the pour's rush
      this.pourEnv += (Math.min(1, p.pourFlow / 6e-4) - this.pourEnv) * 0.002;
      const nz = this.rng.bi();
      const rush = (this.rushBp1.lp(nz) - this.rushBp2.lp(nz)) * this.pourEnv * 0.35;
      water += rush;

      // wind: brown noise, low-passed, swelling slowly
      this.brown = (this.brown + 0.02 * this.rng.bi()) * 0.995;
      this.windPhase += dt * 0.07;
      const gust = 0.5 + 0.5 * Math.sin(TWO_PI * this.windPhase) * Math.sin(TWO_PI * this.windPhase * 0.37 + 1.3);
      const wind = this.windLp.lp(this.windLp2.lp(this.brown) * 0.5 + this.brown * 0.3) * (0.2 + 0.8 * gust) * p.wind * 0.08;

      // the trickle is a quiet background; the knock rings out over it
      const mono = knock * g.knock + water * g.water * 0.35;
      // the tube and basin sit a little left of centre; the wind is wide
      const l = Math.tanh(mono * 1.05 + wind * g.ambient);
      const r = Math.tanh(mono * 0.95 - wind * g.ambient * 0.6);
      L[i] = l;
      R[i] = r;
    }
    return true;
  }
}

registerProcessor('shishi-synth', ShishiSynth);
