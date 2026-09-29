import type { Season } from './types';

/**
 * Spring (docs/reference/ref4-four-seasons.webp, top left): a soft, warm light through cherry
 * blossom, pink bokeh behind, petals on the ground and thick on the basin's water, and petals
 * drifting down.
 */
const PINKS = ['#ffc8d8', '#ffb0c8', '#ffe0ea', '#ff9fbc', '#ffffff'];
const floaters = Array.from({ length: 70 }, (_, i) => PINKS[(i * 3) % PINKS.length]);

export const spring: Season = {
  name: 'spring',
  label: '春',
  sky: { top: '#fff3f7' },
  sun: { color: '#ffe2cc', intensity: 6.5, elevation: 38, azimuth: 250 },
  ambient: { envIntensity: 0.75, fill: 0.2, sky: '#ffe6ef', ground: '#7a6a58' },
  // blossom is thick: many small pieces, and only small gaps for the sun
  canopy: { kind: 'blossom', clusters: 55, pieces: 3000, size: [6, 13] },
  foliage: { leaf: '#ffd6e4', leafLit: '#ffffff', shade: '#d09cb4', moss: '#7fa62c', alt: '#ffffff' },
  snow: 0,
  exposure: 1.3,
  bamboo: { age: 0.9, fresh: '#8fa546', aged: '#caa565' },
  wind: 0.25,
  garden: {
    branch: 'cherry',
    branchLeaves: null,
    ferns: '#6fa03c',
    fernScale: 0.9,
    litter: { colors: PINKS, tone: 1, count: 1400, size: 0.024, shape: 'petal' },
    floaters,
    shrubs: 0,
    floaterKind: 'petal',
  },
  falling: { kind: 'petal', count: 380, colors: PINKS, size: [0.014, 0.024], speed: [0.1, 0.22], sway: 0.25, spin: 2.2, landsInBasin: true },
};
