import type { Season } from './types';

/**
 * Autumn (docs/reference/ref4-four-seasons.webp, bottom left): a low, golden sun, red / orange /
 * yellow maples overhead and behind, leaves thick on the ground and afloat on the basin, and
 * leaves drifting down.
 */
const REDS = ['#c8321c', '#d9481a', '#b52a18', '#e07a1c', '#e8a820', '#a01e14'];
const floaters = Array.from({ length: 16 }, (_, i) => REDS[(i * 5) % REDS.length]);

export const autumn: Season = {
  name: 'autumn',
  label: '秋',
  sky: { top: '#ffe2b0' },
  sun: { color: '#ffcf8a', intensity: 9.0, elevation: 30, azimuth: 250 },
  ambient: { envIntensity: 0.8, fill: 0.2, sky: '#ffe0b4', ground: '#6a4630' },
  // the leaves have thinned: more gaps for the low sun
  canopy: { kind: 'leaves', clusters: 60, pieces: 1800, size: [9, 20] },
  foliage: { leaf: '#e0561c', leafLit: '#ffc23c', shade: '#6a2c10', moss: '#6a8a2a', alt: '#c02a1a', gain: 1.5 },
  snow: 0,
  exposure: 1.35,
  bamboo: { age: 0.9, fresh: '#8fa546', aged: '#caa565' },
  wind: 0.3,
  garden: {
    branch: 'maple',
    branchLeaves: [
      { color: '#c8321c', weight: 3 },
      { color: '#d9581a', weight: 3 },
      { color: '#e8a820', weight: 2 },
      { color: '#a01e14', weight: 1.5 },
      { color: '#8a9a2a', weight: 0.4 },
    ],
    ferns: '#8a5a20',
    fernScale: 0.55,
    litter: { colors: REDS, tone: 0.95, count: 480, size: 0.062, shape: 'leaf' },
    floaters,
    shrubs: 0,
    floaterKind: 'leaf',
  },
  falling: { kind: 'leaf', count: 220, colors: REDS, size: [0.045, 0.07], speed: [0.16, 0.34], sway: 0.16, spin: 1.4, landsInBasin: true },
};
