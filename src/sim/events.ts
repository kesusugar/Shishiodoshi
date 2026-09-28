import type { StreamTarget } from './stream';

/**
 * Physical events the simulation reports (PLAN.md 3章). Each carries its simulation time, so sound
 * can be scheduled exactly even if a frame is late.
 */
export type SimEvent =
  /**
   * The tube's back strikes the stone (the step in which it first reaches it): `omega` the angular
   * speed just before contact (rad/s), `speed` of the contact point (m/s), `intensity` omega relative
   * to a typical return (1 = a normal cycle's first strike), the air column's length (m).
   */
  | { type: 'strike'; time: number; omega: number; speed: number; intensity: number; airLength: number }
  | { type: 'frontStop'; time: number; speed: number }
  | { type: 'pourStart'; time: number }
  | { type: 'pourEnd'; time: number }
  | { type: 'streamTarget'; time: number; target: StreamTarget };
