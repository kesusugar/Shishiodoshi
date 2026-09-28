import { describe, expect, it } from 'vitest';
import { FixedStepper, SIM_DT } from './fixedStep';

describe('FixedStepper', () => {
  it('takes whole 240Hz steps and carries the remainder', () => {
    const s = new FixedStepper();
    expect(s.advance(SIM_DT * 2.5, () => {})).toBe(2);
    expect(s.alpha).toBeCloseTo(0.5);
    expect(s.advance(SIM_DT * 0.5, () => {})).toBe(1);
    expect(s.stepCount).toBe(3);
  });

  it('simulates the same steps no matter how frames are sliced', () => {
    const run = (frames: number[]) => {
      const s = new FixedStepper();
      const times: number[] = [];
      for (const f of frames) s.advance(f, (_dt, t) => times.push(t));
      return times;
    };
    const even = run(Array(60).fill(1 / 60));
    const jittery = run(Array.from({ length: 60 }, (_, i) => (i % 2 ? 1 / 45 : 2 / 60 - 1 / 45)));
    expect(jittery).toEqual(even);
  });

  it('caps the backlog after a long stall', () => {
    const s = new FixedStepper();
    const n = s.advance(10, () => {});
    expect(n).toBe(s.maxStepsPerAdvance);
    expect(s.alpha).toBe(0);
  });

  it('ignores negative elapsed time', () => {
    const s = new FixedStepper();
    expect(s.advance(-1, () => {})).toBe(0);
  });
});
