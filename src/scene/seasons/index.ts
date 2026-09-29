import { summer } from './summer';
import type { Season, SeasonName } from './types';

export type { Season, SeasonName };
export type { CanopyStyle } from './types';

/** The seasons that exist so far, in the order of the buttons (spring, summer, autumn, winter). */
const ORDER: SeasonName[] = ['spring', 'summer', 'autumn', 'winter'];
export const seasons: Partial<Record<SeasonName, Season>> = { summer };
export const seasonNames = (): SeasonName[] => ORDER.filter((n) => seasons[n]);
export const defaultSeason: Season = summer;

const KEY = 'shishiodoshi.season';

/** ?season=... wins, then the one chosen last time (kept in this browser), then summer. */
export function pickSeason(params: URLSearchParams): Season {
  const asked = params.get('season');
  if (asked && seasons[asked as SeasonName]) return seasons[asked as SeasonName]!;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && seasons[saved as SeasonName]) return seasons[saved as SeasonName]!;
  } catch {
    // storage blocked: just use the default
  }
  return defaultSeason;
}

export function rememberSeason(name: SeasonName): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // private mode: the choice lasts for this visit only
  }
}
