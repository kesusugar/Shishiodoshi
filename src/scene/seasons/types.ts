/** Everything that changes between seasons lives here (PLAN.md 13章). Only summer is filled in for now. */
export interface Season {
  name: string;
  sky: { top: string };
  sun: {
    color: string;
    intensity: number;
    /** Degrees above the horizon. */
    elevation: number;
    /** Degrees; 0 = from +z (behind the camera), 180 = from behind the scene. */
    azimuth: number;
  };
  /** Image-based light from the surroundings, and a little extra fill. */
  ambient: { envIntensity: number; fill: number };
  /** The out-of-focus garden around the scene (see render/env.ts). */
  foliage: { leaf: string; leafLit: string; shade: string; moss: string };
  bamboo: {
    /** 0 = fresh green bamboo, 1 = weathered ochre (ref1). */
    age: number;
    fresh: string;
    aged: string;
  };
  /** Mean wind strength 0..1; drives leaf motion, ripples and the wind sound together. */
  wind: number;
  /** Things falling from the sky (petals, leaves, snow). Empty in summer. */
  falling: null;
}
