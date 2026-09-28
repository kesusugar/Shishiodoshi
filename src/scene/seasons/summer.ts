import type { Season } from './types';

export const summer: Season = {
  name: 'summer',
  sky: { top: '#dfeaf0' },
  // high and from the left, a little behind: backlit leaves and glints on the water (ref2), while the
  // front of the bamboo still catches some light
  sun: { color: '#ffe9c8', intensity: 6.0, elevation: 42, azimuth: 250 },
  ambient: { envIntensity: 0.5, fill: 0.15 },
  foliage: { leaf: '#3f6a2a', leafLit: '#c9dc8a', shade: '#16220f', moss: '#5a7a1e' },
  bamboo: { age: 0.9, fresh: '#8fa546', aged: '#caa565' },
  wind: 0.25,
  falling: null,
};
