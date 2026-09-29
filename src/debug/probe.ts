/**
 * State the tools/ scripts read through Playwright: whether the scene is up, how many frames have
 * been drawn, and which GPU is in use. Kept tiny and stable so the scripts don't depend on internals.
 */
export interface Probe {
  ready: boolean;
  frames: number;
  simTime: number;
  gpu: string;
  /** The quality preset in use (render/quality.ts). */
  quality: string;
  fps: number;
  error: string | null;
  /** With ?at=T: the simulation has reached T and everything is held still. */
  frozen: boolean;
  /** Live objects for inspection from tools/ (the simulation). */
  inspect: Record<string, unknown>;
}

declare global {
  interface Window {
    __shishi: Probe;
  }
}

export const probe: Probe = { ready: false, frames: 0, simTime: 0, gpu: '', quality: '', fps: 0, error: null, frozen: false, inspect: {} };
window.__shishi = probe;
