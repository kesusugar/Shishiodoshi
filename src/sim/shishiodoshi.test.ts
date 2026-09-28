import { describe, expect, it } from 'vitest';
import { defaultConfig, tubeLowestY, type SimConfig } from './config';
import type { SimEvent } from './events';
import { SIM_DT } from './fixedStep';
import { ShishiodoshiSim } from './shishiodoshi';

function run(sim: ShishiodoshiSim, seconds: number, each?: (sim: ShishiodoshiSim) => void) {
  const strikes: { time: number; speed: number }[] = [];
  for (let i = 0, n = Math.round(seconds / SIM_DT); i < n; i++) {
    sim.step(SIM_DT);
    each?.(sim);
    for (const e of sim.drainEvents()) if (e.type === 'strike') strikes.push(e);
  }
  return strikes;
}

/** Times of the first strike of each cycle (the loud one), ignoring the small bounces after it. */
function cycleStarts(strikes: { time: number; speed: number }[]) {
  const out: number[] = [];
  for (const s of strikes) if (!out.length || s.time - out[out.length - 1] > 3) out.push(s.time);
  return out;
}

const withFlow = (flow: number): SimConfig => ({ ...defaultConfig, inflow: { ...defaultConfig.inflow, flow } });

describe('shishi-odoshi simulation', () => {
  it('conserves water: what went in = what spilled + what is held', { timeout: 30_000 }, () => {
    const sim = new ShishiodoshiSim();
    run(sim, 90, (s) => {
      const st = s.state;
      expect(Math.abs(st.totalIn - st.totalOut - st.volume)).toBeLessThan(1e-12);
    });
    // and everything the kakei gave either went in or missed
    const st = sim.state;
    expect(st.totalIn + st.totalMissed).toBeCloseTo(defaultConfig.inflow.flow * st.time, 12);
    expect(st.totalOut).toBeGreaterThan(0);
  });

  it('tips over and strikes the stone, with smaller bounces after each strike', () => {
    const strikes = run(new ShishiodoshiSim(), 60);
    const starts = cycleStarts(strikes);
    expect(starts.length).toBeGreaterThanOrEqual(2);
    const first = strikes.filter((s) => s.time >= starts[0] && s.time < starts[0] + 3);
    expect(first.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < first.length; i++) expect(first[i].speed).toBeLessThan(first[i - 1].speed);
  });

  it('has a period of 10-40 s at the default flow', { timeout: 30_000 }, () => {
    const starts = cycleStarts(run(new ShishiodoshiSim(), 100));
    const period = starts[2] - starts[1];
    expect(period).toBeGreaterThan(10);
    expect(period).toBeLessThan(40);
  });

  it('cycles faster with more flow (monotone)', { timeout: 60_000 }, () => {
    const periods = [15e-6, 20e-6, 30e-6, 45e-6].map((q) => {
      const starts = cycleStarts(run(new ShishiodoshiSim(withFlow(q)), 130));
      return starts[2] - starts[1];
    });
    for (let i = 1; i < periods.length; i++) expect(periods[i]).toBeLessThan(periods[i - 1]);
  });

  it('never gains energy from the stone (empty tube dropped onto it)', () => {
    const cfg = withFlow(0);
    const sim = new ShishiodoshiSim(cfg);
    sim.state.angle = cfg.restAngle - 0.5;
    const e0 = sim.energy();
    let peakAfterFirstStrike = -Infinity;
    let struck = false;
    run(sim, 4, (s) => {
      expect(s.energy()).toBeLessThan(e0 + 1e-9);
      if (struck) peakAfterFirstStrike = Math.max(peakAfterFirstStrike, s.energy());
      struck ||= s.state.angle > cfg.restAngle;
    });
    expect(peakAfterFirstStrike).toBeLessThan(e0);
  });

  it('never lets the tube reach the basin water: its lowest point stays the clearance above it', { timeout: 30_000 }, () => {
    const cfg = defaultConfig;
    let lowest = Infinity;
    run(new ShishiodoshiSim(), 90, (s) => {
      lowest = Math.min(lowest, tubeLowestY(cfg.pivot, cfg.tube, s.state.angle));
    });
    expect(lowest - cfg.basinLevel).toBeGreaterThanOrEqual(cfg.basinClearance);
    // with the tip button too (a full tube tips hardest)
    const sim = new ShishiodoshiSim();
    sim.topUp();
    lowest = Infinity;
    run(sim, 4, (s) => {
      lowest = Math.min(lowest, tubeLowestY(cfg.pivot, cfg.tube, s.state.angle));
    });
    expect(lowest - cfg.basinLevel).toBeGreaterThanOrEqual(cfg.basinClearance);
  });

  it('reports each strike at the step the tube reaches the stone, with its swing speed and intensity', () => {
    const sim = new ShishiodoshiSim();
    const strikes: Extract<SimEvent, { type: 'strike' }>[] = [];
    // it starts resting on the stone
    let inContact = true, prevOmega = 0, crossings = 0;
    for (let i = 0, n = Math.round(40 / SIM_DT); i < n; i++) {
      prevOmega = sim.state.omega;
      sim.step(SIM_DT);
      const a = sim.state.angle;
      const events = sim.drainEvents().filter((e) => e.type === 'strike');
      const reached = !inContact && a > defaultConfig.restAngle;
      // an event exactly on the steps that reach the stone, and only those
      expect(events.length).toBe(reached ? 1 : 0);
      if (reached) {
        crossings++;
        const e = events[0] as Extract<SimEvent, { type: 'strike' }>;
        expect(e.time).toBeCloseTo(sim.state.time, 12);
        expect(e.omega).toBeCloseTo(Math.abs(prevOmega), 12);
        strikes.push(e);
      }
      inContact = a > defaultConfig.restAngle;
    }
    expect(crossings).toBeGreaterThanOrEqual(2);
    // the first strike of the cycle is a normal one; the bounces are softer
    expect(strikes[0].intensity).toBeGreaterThan(0.8);
    expect(strikes[0].intensity).toBeLessThan(1.2);
    expect(strikes[1].intensity).toBeLessThan(strikes[0].intensity * 0.6);
  });

  it('is deterministic', () => {
    const a = new ShishiodoshiSim(), b = new ShishiodoshiSim();
    run(a, 40);
    run(b, 40);
    expect(a.state).toEqual(b.state);
  });
});
