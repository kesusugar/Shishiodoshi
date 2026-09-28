/**
 * State the tools/ scripts read through Playwright: whether the scene is up, how many frames have
 * been drawn, and which GPU is in use. Kept tiny and stable so the scripts don't depend on internals.
 */
export interface Probe {
  ready: boolean;
  frames: number;
  simTime: number;
  gpu: string;
  fps: number;
  error: string | null;
  /** Live objects for inspection from tools/ (the simulation). */
  inspect: Record<string, unknown>;
}

declare global {
  interface Window {
    __shishi: Probe;
  }
}

export const probe: Probe = { ready: false, frames: 0, simTime: 0, gpu: '', fps: 0, error: null, inspect: {} };
window.__shishi = probe;
