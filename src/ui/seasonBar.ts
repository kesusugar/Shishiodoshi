import { seasonNames, seasons, type SeasonName } from '../scene/seasons';

/**
 * The season buttons (春 夏 秋 冬), top centre. Only seasons that exist are shown, and the bar is
 * left out while there is just one. `select` marks the current one (after a change).
 */
export function buildSeasonBar(current: SeasonName, onPick: (name: SeasonName) => void): { el: HTMLElement; select(name: SeasonName): void } | null {
  const names = seasonNames();
  if (names.length < 2) return null;
  const el = document.createElement('div');
  el.id = 'seasons';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', '季節');
  const buttons = new Map<SeasonName, HTMLButtonElement>();
  for (const name of names) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = seasons[name]!.label;
    b.addEventListener('click', () => onPick(name));
    buttons.set(name, b);
    el.append(b);
  }
  const select = (name: SeasonName) => {
    for (const [n, b] of buttons) b.setAttribute('aria-pressed', String(n === name));
  };
  select(current);
  return { el, select };
}
