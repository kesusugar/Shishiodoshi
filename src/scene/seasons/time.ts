import * as THREE from 'three';
import type { Season, TimeName } from './types';

/**
 * The hour of the day, laid over a season: the season's own values stay (its leaves, snow, wind),
 * and only the light changes. Dusk: the sun sinks low and red, the surroundings warm and darken.
 * Night: no sun, a faint cold light from above (enough to make the shapes out), the surroundings
 * near black, and the stone lantern is the one warm light, glowing in its window and on the stones
 * around it.
 */
export const timeNames: TimeName[] = ['day', 'dusk', 'night'];
export const timeLabels: Record<TimeName, string> = { day: '昼', dusk: '夕', night: '夜' };

const mix = (a: string, b: string, k: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
const scale = (a: string, k: number) => '#' + new THREE.Color(a).multiplyScalar(k).getHexString();

export function atTime(base: Season, time: TimeName): Season {
  if (time === 'day') return base;
  const f = base.foliage;
  if (time === 'dusk') {
    return {
      ...base,
      sky: { top: mix(base.sky.top, '#f2a26a', 0.7) },
      sun: { color: '#ff9a56', intensity: base.sun.intensity * 0.95, elevation: 10, azimuth: 250 },
      ambient: { ...base.ambient, envIntensity: base.ambient.envIntensity * 0.75, fill: base.ambient.fill * 0.8, sky: mix(base.ambient.sky, '#f0a070', 0.55), ground: scale(base.ambient.ground, 0.6) },
      foliage: { ...f, leaf: mix(f.leaf, '#8a4a2a', 0.3), leafLit: mix(f.leafLit, '#ffb060', 0.6), shade: scale(f.shade, 0.6), alt: f.alt ? mix(f.alt, '#8a4a2a', 0.3) : undefined },
      exposure: base.exposure * 1.05,
      lamp: 0.35,
      time: 'dusk',
    };
  }
  return {
    ...base,
    sky: { top: '#101c33' },
    sun: { color: '#7f9ad0', intensity: 1.0, elevation: 55, azimuth: 250 },
    ambient: { ...base.ambient, envIntensity: base.ambient.envIntensity * 0.4, fill: 0.16, sky: '#35507f', ground: '#0b0f18' },
    foliage: { ...f, leaf: scale(mix(f.leaf, '#1a2a40', 0.6), 0.5), leafLit: '#3f5a86', shade: '#04070d', alt: f.alt ? scale(mix(f.alt, '#1a2a40', 0.6), 0.5) : undefined, gain: 1 },
    exposure: base.exposure * 1.15,
    lamp: 1,
    time: 'night',
  };
}
