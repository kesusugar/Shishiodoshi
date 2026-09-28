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

/**
 * Connects the simulation to the synthesiser (src/audio/synth.worklet.ts). Strikes are scheduled
 * at their simulation time mapped onto the audio clock; continuous quantities (where the stream
 * lands, the air left in the tube, the pour) are sent every frame.
 */
export class AudioEngine {
  readonly node: AudioWorkletNode;
  readonly master: GainNode;
  gains: AudioGains = { knock: 1, water: 1, ambient: 1 };

  private constructor(readonly ctx: BaseAudioContext) {
    this.node = new AudioWorkletNode(ctx, 'shishi-synth', { numberOfInputs: 0, outputChannelCount: [2] });
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.node.connect(this.master).connect(ctx.destination);
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
      if (e.type === 'strike') this.node.port.postMessage({ type: 'strike', time: base + e.time, speed: e.speed, airLength: e.airLength });
    }
    const cfg = sim.cfg, out = sim.out;
    this.node.port.postMessage({
      type: 'params',
      streamTarget: out.stream.target,
      streamFlow: cfg.inflow.flow,
      fallHeight: Math.max(0, cfg.inflow.spout.y - out.stream.y),
      airLength: sim.airLength(),
      pourFlow: out.spill.flow,
      wind: 0.25,
      gains: this.gains,
    });
  }
}
