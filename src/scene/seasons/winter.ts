import type { Season } from './types';

/**
 * Winter (docs/reference/ref4-four-seasons.webp, bottom right): a pale, overcast light with a low
 * cold sun, snow on the tube, the kakei, the stones, the basin's rim and the ground, bare boughs,
 * snowy shrubs out of focus behind, and snow falling. No leaves afloat: the water is dark and clear.
 */
export const winter: Season = {
  name: 'winter',
  label: '冬',
  sky: { top: '#e6edf7' },
  // the sun is a pale, cold disc behind cloud: little direct light, the sky does most of the lighting
  sun: { color: '#dce8ff', intensity: 2.6, elevation: 26, azimuth: 250 },
  ambient: { envIntensity: 1.05, fill: 0.4, sky: '#dfe9f7', ground: '#a9b6c8' },
  // bare twigs only: the light gets through
  canopy: { kind: 'bare', clusters: 70, pieces: 420, size: [3, 90] },
  foliage: { leaf: '#e8eef6', leafLit: '#ffffff', shade: '#6b7f99', moss: '#4a6a30', alt: '#a9b8ca' },
  snow: 1,
  exposure: 1.25,
  bamboo: { age: 0.9, fresh: '#8fa546', aged: '#caa565' },
  wind: 0.12,
  garden: {
    branch: 'bare',
    branchLeaves: null,
    ferns: '#7a6a4a',
    fernScale: 0.45,
    litter: { colors: ['#ffffff'], tone: 1, count: 0, size: 0.05, shape: 'leaf' },
    floaters: [],
    floaterKind: 'leaf',
    shrubs: 9,
  },
  falling: { kind: 'snow', count: 720, colors: ['#ffffff', '#eef4ff', '#f6f9ff'], size: [0.004, 0.026], speed: [0.14, 0.32], sway: 0.14, spin: 0, landsInBasin: false },
};
