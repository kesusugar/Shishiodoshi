/** Physics runs at a fixed rate regardless of the render frame rate (PLAN.md 3章). */
export const SIM_HZ = 240;
export const SIM_DT = 1 / SIM_HZ;

/**
 * Accumulates wall-clock time and advances the simulation in whole fixed steps.
 * Simulation time is `steps * dt`, so it never drifts from float accumulation.
 */
export class FixedStepper {
  readonly dt: number;
  /** Upper bound on steps per advance(), so a stalled tab doesn't spiral. */
  readonly maxStepsPerAdvance: number;
  private acc = 0;
  private steps = 0;

  constructor(dt = SIM_DT, maxStepsPerAdvance = Math.ceil(0.25 / dt)) {
    this.dt = dt;
    this.maxStepsPerAdvance = maxStepsPerAdvance;
  }

  /** Total simulated time in seconds. */
  get time(): number {
    return this.steps * this.dt;
  }

  get stepCount(): number {
    return this.steps;
  }

  /** Fraction of a step left over, for interpolating render state (0..1). */
  get alpha(): number {
    return this.acc / this.dt;
  }

  /** Advance by `elapsed` seconds of wall time; calls `step(dt, time)` for each fixed step. Returns steps taken. */
  advance(elapsed: number, step: (dt: number, time: number) => void): number {
    this.acc += Math.max(0, elapsed);
    let n = 0;
    // The epsilon keeps exact multiples of dt from being lost to rounding.
    while (this.acc >= this.dt * (1 - 1e-9)) {
      if (n === this.maxStepsPerAdvance) {
        // Drop the backlog rather than trying to catch up.
        this.acc = 0;
        break;
      }
      step(this.dt, this.time);
      this.steps++;
      this.acc = Math.max(0, this.acc - this.dt);
      n++;
    }
    return n;
  }
}
