import { summer } from './summer';
import type { Season } from './types';

export type { Season };
export const seasons = { summer } as const satisfies Record<string, Season>;
export const defaultSeason: Season = summer;
