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
  /** A soft stop in front (the tube's belly meets the crossbar) at this angle (mouth down). */
  frontStopAngle: number;
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

const flow = 20e-6; // 20 mL/s
const lipSpeed = 0.35;
const lipR = Math.sqrt(flow / (Math.PI * lipSpeed));

export const defaultConfig: SimConfig = {
  gravity: 9.81,
  pivot: { x: -0.34, y: 0.58 },
  tube: {
    back: 0.3,
    front: 0.46,
    radius: 0.036,
    wall: 0.006,
    cut: 0.12,
    diaphragm: -0.011,
    nodes: [-0.288, -0.015, 0.2],
    density: 750,
    backPlug: 0.2,
  },
  restAngle: 16 * deg,
  frontStopAngle: -30 * deg,
  contact: { stiffness: 400, restitution: 0.35, frontStiffness: 60, frontRestitution: 0.2 },
  friction: { viscous: 0.002, dry: 0.004 },
  inflow: {
    flow,
    // the stream's centre starts half its thickness above the lip
    spout: { x: spout.x, y: spout.y + lipR },
    velocity: { x: -lipSpeed * Math.cos(kakei.slope), y: -lipSpeed * Math.sin(kakei.slope) },
  },
  weirCd: 0.6,
  slosh: { omega: 4.8, zeta: 0.12, coupling: 0.4 },
  basinLevel: 0.255,
  basin: { x: 0.1, radius: 0.19 },
};
