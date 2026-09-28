import type { Season } from './types';

export const summer: Season = {
  name: 'summer',
  sky: { top: '#dfeaf0' },
  // high and from the left, a little behind: backlit leaves and glints on the water (ref2), while the
  // front of the bamboo still catches some light
  sun: { color: '#fff0d4', intensity: 4.5, elevation: 50, azimuth: 250 },
  ambient: { envIntensity: 0.55, fill: 0.35 },
  foliage: { leaf: '#6f9a4a', leafLit: '#e2ecb0', shade: '#2e4024', moss: '#58751f' },
  bamboo: { age: 0.9, fresh: '#8fa546', aged: '#caa565' },
  wind: 0.25,
  falling: null,
};
