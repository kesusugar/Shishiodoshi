/**
 * Physical description of the shishi-odoshi. Metres, kilograms, seconds, radians. World: y up,
 * the tube swings in the x-y plane about the axle at `pivot`; +angle raises the mouth.
 *
 * Tube-local frame: x along the tube toward the mouth, y "up" when the angle is 0, z sideways,
 * origin on the axle. The water compartment runs from the node diaphragm at x = `diaphragm` to the
 * mouth, which is cut on the plane x = front - cut * (1 + y / radius) / 2 (the lower lip reaches
 * `front`, the upper lip stops `cut` short of it, so the opening faces up and forward).
 *
 * Shared by the simulation and the scene (the scene builds its meshes from these numbers); it has
 * no dependency on rendering.
 */
export interface TubeConfig {
  back: number;
  front: number;
  radius: number;
  wall: number;
  cut: number;
  diaphragm: number;
  nodes: number[];
  /** Bamboo density (kg/m^3) and the extra mass of the solid node plug at the back end (kg). */
  density: number;
  backPlug: number;
}

export interface SimConfig {
  gravity: number;
  pivot: { x: number; y: number };
  tube: TubeConfig;
  /** The tube's back rests on the striker stone at this angle (mouth up). */
  restAngle: number;
  /**
   * The front stop (the tube's belly meets the crossbar) at this angle (mouth down). It is placed
   * from `basinClearance` (see frontStopFor), so the tube can never reach the basin water.
   */
  frontStopAngle: number;
  /** The smallest gap (m) allowed between the tube and the basin's water surface. */
  basinClearance: number;
  contact: {
    /** Stiffness (N m / rad) and coefficient of restitution of bamboo on stone. */
    stiffness: number;
    restitution: number;
    frontStiffness: number;
    frontRestitution: number;
  };
  /** Axle friction: viscous (N m s) and dry (N m). */
  friction: { viscous: number; dry: number };
  /** The kakei's water: flow (m^3/s), where it leaves the lip and its velocity there. */
  inflow: { flow: number; spout: { x: number; y: number }; velocity: { x: number; y: number } };
  /** Discharge coefficient of the mouth as a weir. */
  weirCd: number;
  /** Slosh of the water surface in the tube: natural frequency (rad/s), damping ratio, coupling. */
  slosh: { omega: number; zeta: number; coupling: number };
  /** Water level of the basin (where missed and poured water lands). */
  basinLevel: number;
  basin: { x: number; radius: number };
}

const deg = Math.PI / 180;

// The kakei: a small culm from a standing post, sloping down 4 degrees toward the tube's mouth.
export const kakei = {
  postX: 0.42,
  y: 0.9,
  tipX: 0.1,
  slope: 4 * deg,
  radius: 0.019,
  wall: 0.004,
  cut: 0.05,
};
// its lower lip, where the water leaves
const lipDrop = kakei.radius - kakei.wall;
const spout = {
  x: kakei.tipX + Math.sin(kakei.slope) * lipDrop,
  y: kakei.y - (kakei.postX - kakei.tipX) * Math.tan(kakei.slope) - lipDrop * Math.cos(kakei.slope),
};

// a gentle kakei: about a tablespoon a second, barely pushed off its lip, so it falls almost straight
const flow = 16e-6; // 16 mL/s
const lipSpeed = 0.18;
const lipR = Math.sqrt(flow / (Math.PI * lipSpeed));

/**
 * World height of the tube's lowest point at a mouth-down angle: the outside of the lower lip at the
 * mouth (tube-local (front, -radius)); nothing else on the tube hangs lower once the mouth is down.
 */
export function tubeLowestY(pivot: { y: number }, tube: TubeConfig, angle: number): number {
  return pivot.y + tube.front * Math.sin(angle) - tube.radius * Math.cos(angle);
}

/**
 * The front stop's angle for a clearance: the angle at which the lowest point of the tube is
 * `clearance + margin` above the water (the margin absorbs the little the stiff stop gives).
 * Solves front sin a - radius cos a = y, i.e. R sin(a - d) = y with R = |(front, radius)|.
 */
export function frontStopFor(pivot: { y: number }, tube: TubeConfig, basinLevel: number, clearance: number, margin = 0.015): number {
  const y = basinLevel + clearance + margin - pivot.y;
  const R = Math.hypot(tube.front, tube.radius);
  return Math.asin(Math.max(-1, Math.min(1, y / R))) + Math.atan2(tube.radius, tube.front);
}

const pivot = { x: -0.34, y: 0.58 };
const tube: TubeConfig = {
  back: 0.3,
  front: 0.46,
  radius: 0.036,
  wall: 0.006,
  cut: 0.12,
  diaphragm: -0.011,
  nodes: [-0.288, -0.015, 0.2],
  density: 750,
  backPlug: 0.2,
};
const basinLevel = 0.255;
// the tube's lip stays at least 10 cm above the water (about 7 cm above the basin's rim)
const basinClearance = 0.1;

export const defaultConfig: SimConfig = {
  gravity: 9.81,
  pivot,
  tube,
  restAngle: 16 * deg,
  frontStopAngle: frontStopFor(pivot, tube, basinLevel, basinClearance), // about -23 degrees
  basinClearance,
  // the crossbar is a hard stop (it bounds the swing; the old soft one let the lip sink to 4 cm above the water)
  contact: { stiffness: 400, restitution: 0.35, frontStiffness: 800, frontRestitution: 0.15 },
  friction: { viscous: 0.002, dry: 0.004 },
  inflow: {
    flow,
    // the stream's centre starts half its thickness above the lip
    spout: { x: spout.x, y: spout.y + lipR },
    velocity: { x: -lipSpeed * Math.cos(kakei.slope), y: -lipSpeed * Math.sin(kakei.slope) },
  },
  weirCd: 0.6,
  slosh: { omega: 4.8, zeta: 0.12, coupling: 0.4 },
  basinLevel,
  basin: { x: 0.1, radius: 0.19 },
};
