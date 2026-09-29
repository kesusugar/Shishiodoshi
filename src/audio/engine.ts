import type { SimEvent } from '../sim/events';
import type { ShishiodoshiSim } from '../sim/shishiodoshi';
import workletUrl from './synth.worklet.ts?worker&url';

/** How far ahead of "now" sound is scheduled, so a strike's exact time survives frame jitter. */
const LOOKAHEAD = 0.05;

export interface AudioGains {
  knock: number;
  water: number;
  ambient: number;
}

/** How loud each of the air's voices is (0..1); the synth glides toward these. */
interface AirLevels { birds: number; insects: number; leaves: number; muffle: number; frogs: number; owl: number }
const QUIET: AirLevels = { birds: 0, insects: 0, leaves: 0, muffle: 0, frogs: 0, owl: 0 };

/**
 * Connects the simulation to the synthesiser (src/audio/synth.worklet.ts). Strikes are scheduled
 * at their simulation time mapped onto the audio clock; continuous quantities (where the stream
 * lands, the air left in the tube, the pour) are sent every frame.
 */
export class AudioEngine {
  readonly node: AudioWorkletNode;
  readonly master: GainNode;
  gains: AudioGains = { knock: 1, water: 1, ambient: 1 };
  /** The season's air (see the synth): set by setSeason. */
  private air: { wind: number; season: AirLevels } = { wind: 0.25, season: { ...QUIET } };
  /** Pour flow keyed by the time it arrives in the basin. */
  private readonly pourHistory: { time: number; flow: number }[] = [];

  private constructor(readonly ctx: BaseAudioContext) {
    this.node = new AudioWorkletNode(ctx, 'shishi-synth', { numberOfInputs: 0, outputChannelCount: [2] });
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.node.connect(this.master).connect(ctx.destination);
  }

  /**
   * The air's sound for a season and hour: birds in spring by day, frogs on spring nights, crickets and leaves in autumn, an owl on winter
   * nights, everything muffled in snow; and the wind.
   */
  setSeason(name: 'spring' | 'summer' | 'autumn' | 'winter', wind: number, time: 'day' | 'dusk' | 'night' = 'day'): void {
    const T: Record<typeof name, Record<typeof time, Partial<AirLevels>>> = {
      spring: { day: { birds: 1 }, dusk: { birds: 0.35 }, night: { frogs: 0.5 } },
      summer: { day: {}, dusk: {}, night: {} }, // the plainest: only the water and the bamboo
      autumn: { day: { birds: 0.3, leaves: 1 }, dusk: { insects: 0.4, leaves: 1 }, night: { insects: 1, leaves: 0.4 } },
      winter: { day: { muffle: 1 }, dusk: { muffle: 1 }, night: { muffle: 1, owl: 1 } },
    };
    this.air = { wind, season: { ...QUIET, ...T[name][time] } };
  }

  static async create(ctx: BaseAudioContext): Promise<AudioEngine> {
    await ctx.audioWorklet.addModule(workletUrl);
    return new AudioEngine(ctx);
  }

  /**
   * @param simNow the simulation time the state is at; events carry their own times, which map
   * to `audioNow + LOOKAHEAD + (event.time - simNow)` (or exactly `offset + event.time` offline).
   */
  send(sim: ShishiodoshiSim, events: SimEvent[], simNow: number, offset?: number): void {
    const base = offset ?? this.ctx.currentTime + LOOKAHEAD - simNow;
    for (const e of events) {
      if (e.type === 'strike') this.node.port.postMessage({ type: 'strike', time: base + e.time, intensity: e.intensity, airLength: e.airLength });
      // the belly landing on the crossbar: intensity relative to a normal tip (about 1.3 m/s at the mouth)
      if (e.type === 'frontStop') this.node.port.postMessage({ type: 'stop', time: base + e.time, intensity: Math.min(1.5, e.speed / 1.3), airLength: 0.05 });
    }
    const cfg = sim.cfg, out = sim.out, st = sim.state;
    // the poured water reaches the basin one fall time after leaving the lip
    const sp = out.spill;
    const lipY = cfg.pivot.y + sp.lipX * Math.sin(st.angle) + sp.lipY * Math.cos(st.angle);
    const fall = Math.sqrt((2 * Math.max(0, lipY - cfg.basinLevel)) / cfg.gravity);
    this.pourHistory.push({ time: st.time + fall, flow: sp.flow });
    while (this.pourHistory.length > 1 && this.pourHistory[1].time <= st.time) this.pourHistory.shift();
    const landFlow = this.pourHistory[0].time <= st.time ? this.pourHistory[0].flow : 0;
    this.node.port.postMessage({
      type: 'params',
      streamTarget: out.stream.target,
      streamFlow: cfg.inflow.flow,
      fallHeight: Math.max(0, cfg.inflow.spout.y - out.stream.y),
      airLength: sim.airLength(),
      pourFlow: sp.flow,
      landFlow,
      wind: this.air.wind,
      season: this.air.season,
      gains: this.gains,
    });
  }
}
