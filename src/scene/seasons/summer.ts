import type { Season } from './types';

export const summer: Season = {
  name: 'summer',
  label: '夏',
  sky: { top: '#dfeaf0' },
  // high and from the left, a little behind: backlit leaves and glints on the water (ref2), while the
  // front of the bamboo still catches some light
  sun: { color: '#ffe3b4', intensity: 7.5, elevation: 42, azimuth: 250 },
  ambient: { envIntensity: 0.45, fill: 0.12, sky: '#f4f6ff', ground: '#6a6450' },
  canopy: { kind: 'leaves', clusters: 70, pieces: 3200, size: [9, 21] },
  foliage: { leaf: '#3f6a2a', leafLit: '#c9dc8a', shade: '#16220f', moss: '#5a7a1e' },
  bamboo: { age: 0.9, fresh: '#8fa546', aged: '#caa565' },
  snow: 0,
  exposure: 1.2,
  wind: 0.25,
  garden: {
    branch: 'maple',
    branchLeaves: null,
    ferns: '#3f6a2a',
    fernScale: 1,
    litter: { colors: ['#c8321c', '#d98b1c', '#b52a18', '#8a6a1a'], tone: 0.8, count: 9, size: 0.05, shape: 'leaf' },
    floaters: ['#c8321c', '#d98b1c', '#b52a18'],
    shrubs: 0,
    floaterKind: 'leaf',
  },
  falling: null,
};
