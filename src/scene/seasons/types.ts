export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';
/** The hour of the day (scene/seasons/time.ts): the season's own daylight, the low sun before dark, or night. */
export type TimeName = 'day' | 'dusk' | 'night';

/** The leaves overhead that dapple the light (render/canopy.ts). */
export interface CanopyStyle {
  kind: 'leaves' | 'blossom' | 'bare';
  /** Clusters of foliage, and pieces (leaves / flowers / twigs) drawn across them. */
  clusters: number;
  pieces: number;
  /** Length of a piece in texture pixels (smallest, largest). */
  size: [number, number];
}

/** Things falling through the air (render/falling.ts). */
export interface FallingStyle {
  kind: 'leaf' | 'petal' | 'snow';
  /** How many are in the air at once around the scene (a phone gets a third of this). */
  count: number;
  /** Each piece takes one of these colours. */
  colors: string[];
  /** Size in metres (smallest, largest) and fall speed in m/s (slowest, fastest). */
  size: [number, number];
  speed: [number, number];
  /** How far it sways from side to side (m), and how quickly it tumbles (rad/s). */
  sway: number;
  spin: number;
  /** Now and then one falls into the basin and stays afloat (leaves and petals; not snow). */
  landsInBasin: boolean;
}

/** The garden around the shishi-odoshi (scene/garden.ts). */
export interface GardenStyle {
  /** The foreground bough: a maple, a flowering cherry, or bare twigs (winter). */
  branch: 'maple' | 'cherry' | 'bare';
  /**
   * Colours of the foreground maple's leaves, chosen per leaf by weight; `null` = greens taken from
   * the season's foliage colours (summer).
   */
  branchLeaves: { color: string; weight: number }[] | null;
  /** Fern colour. */
  ferns: string;
  /** How big the fern clumps are (1 = summer's). */
  fernScale: number;
  /** Fallen leaves on the ground: their colours, how dark (1 = as is), and how many. */
  litter: { colors: string[]; tone: number; count: number; /** a leaf's size in metres */ size: number; shape: 'leaf' | 'petal' };
  /** Leaves (or petals) afloat on the basin: one entry per piece. */
  floaters: string[];
  floaterKind: 'leaf' | 'petal';
  /** Snow-laden shrubs standing behind the boulders (winter). */
  shrubs: number;
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
  foliage: { leaf: string; leafLit: string; shade: string; moss: string; /** a second colour among the leaves (autumn's crimson among the orange); default = leaf */ alt?: string; /** brightens the out-of-focus surroundings (default 1) */ gain?: number };
  /** Tone-mapping exposure (brightness of the whole picture). */
  exposure: number;
  /** How much snow lies on everything (0 = none, 1 = winter); see render/snow.ts. */
  snow: number;
  bamboo: {
    /** 0 = fresh green bamboo, 1 = weathered ochre (ref1). */
    age: number;
    fresh: string;
    aged: string;
  };
  /** Mean wind strength 0..1; drives leaf motion, ripples and the wind sound together. */
  wind: number;
  garden: GardenStyle;
  /** The hour, when it is not day (set by atTime): the sounds of the air follow it. */
  time?: TimeName;
  /** How brightly the stone lantern burns (0 = as by day; 1 = night: its window glows and lights the stones near it). */
  lamp?: number;
  /** Things falling from the sky (petals, leaves, snow); none in summer. */
  falling: FallingStyle | null;
}
