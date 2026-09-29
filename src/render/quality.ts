/**
 * Quality presets. PCs get everything (PLAN.md 6章); phones and tablets draw fewer pixels, a smaller
 * and simpler shadow map that is redrawn less often, and a cheaper depth of field, and aim for a
 * lower frame rate, so they stay smooth and do not heat up. The look is the same; only how finely
 * it is drawn changes.
 *
 * The choice is 自動 (a touch screen with no mouse or trackpad is a phone or tablet: low; otherwise
 * high), or one of the three by hand from the settings panel (kept in this browser), or forced for
 * one visit with ?quality=high|medium|low. First measured on an iPhone 16 (Apple GPU): 44 fps at
 * `low` with the resolution at 100%, so the cost there is per-frame work, not pixels.
 */
export type QualityName = 'high' | 'medium' | 'low';
export type QualityChoice = 'auto' | QualityName;

export interface Quality {
  name: QualityName;
  /** Largest device pixel ratio drawn at (phones have 3; the scene does not need it). */
  maxPixelRatio: number;
  /** Lowest fraction of that the adaptive resolution may drop to. */
  minScale: number;
  /** Frame rate the adaptive resolution aims for. */
  targetFps: number;
  shadowMapSize: number;
  softShadows: boolean;
  /** The sun's shadow map is redrawn every this many frames (the shadows move slowly). */
  shadowEvery: number;
  /** Depth-of-field samples at most (per pixel, where it blurs). */
  dofTaps: number;
  antialias: boolean;
  /** Fraction of the falling leaves / petals / snow drawn. */
  particleScale: number;
}

const HIGH: Quality = { name: 'high', maxPixelRatio: 2, minScale: 0.55, targetFps: 60, shadowMapSize: 2048, softShadows: true, shadowEvery: 1, dofTaps: 28, antialias: true, particleScale: 1 };
const MEDIUM: Quality = { name: 'medium', maxPixelRatio: 1.5, minScale: 0.5, targetFps: 55, shadowMapSize: 1536, softShadows: true, shadowEvery: 2, dofTaps: 20, antialias: false, particleScale: 0.7 };
const LOW: Quality = { name: 'low', maxPixelRatio: 1.25, minScale: 0.55, targetFps: 55, shadowMapSize: 1024, softShadows: false, shadowEvery: 3, dofTaps: 12, antialias: false, particleScale: 0.4 };
const PRESETS: Record<QualityName, Quality> = { high: HIGH, medium: MEDIUM, low: LOW };

const KEY = 'shishiodoshi.quality';

export function savedChoice(): QualityChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'high' || v === 'medium' || v === 'low') return v;
  } catch {
    // storage blocked: automatic
  }
  return 'auto';
}

export function saveChoice(choice: QualityChoice): void {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // private mode: the choice lasts until the page is reloaded (which it does to apply it)
  }
}

/** What 自動 picks on this device. */
export function autoQuality(): QualityName {
  const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  return touchOnly ? 'low' : 'high';
}

export function pickQuality(params: URLSearchParams): Quality {
  const forced = params.get('quality');
  if (forced === 'high' || forced === 'medium' || forced === 'low') return PRESETS[forced];
  const choice = savedChoice();
  return PRESETS[choice === 'auto' ? autoQuality() : choice];
}
