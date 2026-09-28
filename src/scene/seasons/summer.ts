import type { Season } from './types';

export const summer: Season = {
  name: 'summer',
  sky: { top: '#9fc3e0', horizon: '#dfe9d8' },
  haze: { color: '#7f9a6a', density: 0.06 },
  sun: { color: '#fff1d6', intensity: 3.0, elevation: 58, azimuth: 35 },
  ambient: { sky: '#cfe3ff', ground: '#3e4a2a', intensity: 0.9 },
  foliage: { leaf: '#3f7a2c', moss: '#6f9a2a', backdrop: '#4d7a36' },
  bamboo: { age: 0.7, fresh: '#7c9a3a', aged: '#b89a5e' },
  stone: { basin: '#77736b', lava: '#4a4541', ground: '#4b3f30' },
  wind: 0.25,
  falling: null,
};
