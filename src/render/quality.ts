/**
 * Quality presets. PCs get everything (PLAN.md 6章); phones and tablets draw fewer pixels, a smaller
 * and simpler shadow map and a cheaper depth of field, and aim for a lower frame rate, so they stay
 * smooth and do not heat up. The look is the same; only how finely it is drawn changes.
 *
 * Picked automatically (a touch screen with no mouse or trackpad is a phone or tablet), or forced
 * with ?quality=high|low.
 */
export interface Quality {
  name: 'high' | 'low';
  /** Largest device pixel ratio drawn at (phones have 3; the scene does not need it). */
  maxPixelRatio: number;
  /** Lowest fraction of that the adaptive resolution may drop to. */
  minScale: number;
  /** Frame rate the adaptive resolution aims for. */
  targetFps: number;
  shadowMapSize: number;
  softShadows: boolean;
  /** Depth-of-field samples at most (per pixel, where it blurs). */
  dofTaps: number;
  antialias: boolean;
}

const HIGH: Quality = { name: 'high', maxPixelRatio: 2, minScale: 0.55, targetFps: 60, shadowMapSize: 2048, softShadows: true, dofTaps: 28, antialias: true };
const LOW: Quality = { name: 'low', maxPixelRatio: 1.25, minScale: 0.5, targetFps: 45, shadowMapSize: 1024, softShadows: false, dofTaps: 12, antialias: false };

export function pickQuality(params: URLSearchParams): Quality {
  const forced = params.get('quality');
  if (forced === 'high') return HIGH;
  if (forced === 'low') return LOW;
  const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  return touchOnly ? LOW : HIGH;
}
