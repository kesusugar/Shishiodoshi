/** Everything that changes between seasons lives here (PLAN.md 13章). Only summer is filled in for now. */
export interface Season {
  name: string;
  sky: { top: string; horizon: string };
  /** Distance haze: colour and exponential density (1/m). */
  haze: { color: string; density: number };
  sun: {
    color: string;
    intensity: number;
    /** Degrees above the horizon. */
    elevation: number;
    /** Degrees, 0 = from +z (behind camera), clockwise seen from above. */
    azimuth: number;
  };
  ambient: { sky: string; ground: string; intensity: number };
  foliage: { leaf: string; moss: string; backdrop: string };
  bamboo: {
    /** 0 = fresh green bamboo, 1 = weathered ochre (ref1). */
    age: number;
    fresh: string;
    aged: string;
  };
  stone: { basin: string; lava: string; ground: string };
  /** Mean wind strength 0..1; drives leaf motion and the wind sound together. */
  wind: number;
  /** Things falling from the sky (petals, leaves, snow). Empty in summer. */
  falling: null;
}
