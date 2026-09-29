export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';

/** The leaves overhead that dapple the light (render/canopy.ts). */
export interface CanopyStyle {
  kind: 'leaves' | 'blossom' | 'bare';
  /** Clusters of foliage, and pieces (leaves / flowers / twigs) drawn across them. */
  clusters: number;
  pieces: number;
  /** Length of a piece in texture pixels (smallest, largest). */
  size: [number, number];
}

/** Everything that changes between seasons lives here (docs/SEASONS.md). */
export interface Season {
  name: SeasonName;
  /** The character on the season button. */
  label: string;
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
  ambient: { envIntensity: number; fill: number; /** the fill light's sky and ground colours */ sky: string; ground: string };
  canopy: CanopyStyle;
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
