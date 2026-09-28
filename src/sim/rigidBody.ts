import type { SimConfig, TubeConfig } from './config';

/** Mass, centre of mass (tube-local) and moment of inertia about the axle of the empty tube. */
export interface MassProps {
  mass: number;
  cx: number;
  cy: number;
  inertia: number;
}

/**
 * Integrate the bamboo: the wall (a ring between the outer and inner radius, minus what the slanted
 * cut removed at the mouth), a disc at each node, and the back plug.
 */
export function tubeMassProps(t: TubeConfig): MassProps {
  const r = t.radius - t.wall;
  const NX = 400, NA = 64;
  const len = t.back + t.front;
  const dx = len / NX;
  const ringArea = Math.PI * (t.radius * t.radius - r * r);
  const rho = 0.5 * (t.radius + r);
  let m = 0, mx = 0, my = 0, I = 0;
  const add = (dm: number, x: number, y: number, extraI = 0) => {
    m += dm;
    mx += dm * x;
    my += dm * y;
    I += dm * (x * x + y * y) + extraI;
  };
  for (let i = 0; i < NX; i++) {
    const x = -t.back + (i + 0.5) * dx;
    const dmPoint = (t.density * ringArea * dx) / NA;
    for (let j = 0; j < NA; j++) {
      const a = ((j + 0.5) / NA) * Math.PI * 2;
      const y = rho * Math.sin(a);
      if (x > t.front - (t.cut * (1 + y / t.radius)) / 2) continue; // cut away
      add(dmPoint, x, y);
    }
  }
  const nodeThickness = 0.005;
  for (const xn of t.nodes) {
    const dm = t.density * Math.PI * r * r * nodeThickness;
    add(dm, xn, 0, dm * (r * r) / 4);
  }
  // the back end is closed by a node too, plus the plug that makes the empty tube back-heavy
  add(t.density * Math.PI * r * r * nodeThickness + t.backPlug, -t.back + 0.015, 0);
  return { mass: m, cx: mx / m, cy: my / m, inertia: I };
}

/**
 * Contact torque of the stops: the striker stone under the back end (at restAngle, mouth up) and
 * the front stop (mouth down). A stiff spring with damping chosen for the coefficient of restitution;
 * it only pushes, never pulls. Returns the torque about the axle (N m).
 */
export function contactTorque(cfg: SimConfig, angle: number, omega: number, inertia: number): number {
  const c = cfg.contact;
  let tau = 0;
  const dampFor = (k: number, e: number) => {
    const ln = Math.log(e);
    const zeta = -ln / Math.sqrt(Math.PI * Math.PI + ln * ln);
    return 2 * zeta * Math.sqrt(k * inertia);
  };
  const pen = angle - cfg.restAngle;
  if (pen > 0) tau += Math.min(0, -c.stiffness * pen - dampFor(c.stiffness, c.restitution) * omega);
  const penF = cfg.frontStopAngle - angle;
  if (penF > 0) tau += Math.max(0, c.frontStiffness * penF - dampFor(c.frontStiffness, c.frontRestitution) * omega);
  return tau;
}
