import type { ShishiodoshiSim } from '../sim/shishiodoshi';

/**
 * Debug plot of the last 40 s of simulation (PLAN.md 8章): the tube's angle, the water held, and the
 * water's torque about the axle. Strikes are marked. Toggle with G (or open with ?debug).
 */
const SPAN = 40;
const W = 420, H = 180;

export class SimGraph {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly samples: { t: number; angle: number; volume: number; torque: number }[] = [];
  private readonly strikes: { t: number; speed: number }[] = [];
  private lastSample = -1;

  constructor(parent: HTMLElement, visible: boolean) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W * devicePixelRatio;
    this.canvas.height = H * devicePixelRatio;
    Object.assign(this.canvas.style, {
      position: 'fixed', right: '8px', bottom: '8px', width: `${W}px`, height: `${H}px`,
      background: 'rgba(0,0,0,0.55)', borderRadius: '4px', pointerEvents: 'none',
    });
    this.canvas.hidden = !visible;
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'g' || e.key === 'G') this.canvas.hidden = !this.canvas.hidden;
    });
  }

  record(sim: ShishiodoshiSim, strikes: { time: number; speed: number }[]): void {
    const st = sim.state;
    for (const s of strikes) this.strikes.push({ t: s.time, speed: s.speed });
    if (st.time - this.lastSample >= 1 / 60) {
      this.samples.push({ t: st.time, angle: (st.angle * 180) / Math.PI, volume: st.volume * 1e6, torque: sim.out.torqueWater });
      this.lastSample = st.time;
    }
    while (this.samples.length && this.samples[0].t < st.time - SPAN) this.samples.shift();
    while (this.strikes.length && this.strikes[0].t < st.time - SPAN) this.strikes.shift();
  }

  draw(now: number): void {
    if (this.canvas.hidden) return;
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    const x = (t: number) => 34 + ((t - (now - SPAN)) / SPAN) * (W - 42);
    const series: [string, string, (s: (typeof this.samples)[number]) => number, number, number, string][] = [
      ['angle', '#ffd479', (s) => s.angle, -35, 20, '°'],
      ['water', '#7fd8ff', (s) => s.volume, 0, 500, 'mL'],
      ['torque', '#ff8f8f', (s) => s.torque, -0.4, 0.1, 'N·m'],
    ];
    c.font = '11px ui-monospace, Consolas, monospace';
    series.forEach(([name, col, get, lo, hi, unit], k) => {
      const y = (v: number) => H - 14 - ((v - lo) / (hi - lo)) * (H - 28);
      c.strokeStyle = col;
      c.lineWidth = 1.5;
      c.beginPath();
      this.samples.forEach((s, i) => (i ? c.lineTo(x(s.t), y(get(s))) : c.moveTo(x(s.t), y(get(s)))));
      c.stroke();
      const last = this.samples[this.samples.length - 1];
      c.fillStyle = col;
      c.fillText(`${name} ${last ? get(last).toFixed(name === 'torque' ? 3 : 1) : '-'} ${unit}`, 8 + k * 136, 12);
    });
    c.fillStyle = '#ffffff';
    for (const s of this.strikes) c.fillRect(x(s.t) - 1, H - 14 - Math.min(40, s.speed * 40), 2, Math.min(40, s.speed * 40));
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillText(`-${SPAN}s`, 4, H - 3);
    c.fillText('strikes: white bars (height = speed)', 60, H - 3);
  }
}
