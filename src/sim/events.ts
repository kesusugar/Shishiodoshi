import type { StreamTarget } from './stream';

/**
 * Physical events the simulation reports (PLAN.md 3章). Each carries its simulation time, so sound
 * can be scheduled exactly even if a frame is late.
 */
export type SimEvent =
  /** The tube's back strikes the stone: `speed` of the contact point (m/s); the air column's length (m). */
  | { type: 'strike'; time: number; speed: number; airLength: number }
  | { type: 'frontStop'; time: number; speed: number }
  | { type: 'pourStart'; time: number }
  | { type: 'pourEnd'; time: number }
  | { type: 'streamTarget'; time: number; target: StreamTarget };
