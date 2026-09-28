/** Corner readout of fps and GPU name, so reports from a real machine carry both (PLAN.md 14章). */
export class Hud {
  private frames = 0;
  private elapsed = 0;
  private fps = 0;
  private extra = '';

  constructor(
    private readonly el: HTMLElement,
    private readonly gpu: string,
  ) {
    this.render();
  }

  get currentFps(): number {
    return this.fps;
  }

  /** Call once per rendered frame with the wall time since the previous frame. */
  frame(dt: number, extra: string): void {
    this.frames++;
    this.elapsed += dt;
    this.extra = extra;
    if (this.elapsed >= 0.5) {
      this.fps = this.frames / this.elapsed;
      this.frames = 0;
      this.elapsed = 0;
      this.render();
    }
  }

  private render(): void {
    this.el.textContent = `${this.fps.toFixed(1)} fps\n${this.gpu}${this.extra ? `\n${this.extra}` : ''}`;
  }
}

export function gpuName(gl: WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return String(name);
}
