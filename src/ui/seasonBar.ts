import { seasonNames, seasons, timeLabels, timeNames, type SeasonName, type TimeName } from '../scene/seasons';

/**
 * The season buttons (春 夏 秋 冬) and a ⟳ button that lets the seasons come round by themselves,
 * top centre. Only seasons that exist are shown, and the bar is left out while there is just one.
 * `select` marks the current one (after a change); `setAuto` shows whether the round is on.
 */
export interface SeasonBar {
  el: HTMLElement;
  select(name: SeasonName, time?: TimeName): void;
  setAuto(on: boolean): void;
}

export function buildSeasonBar(current: SeasonName, onPick: (name: SeasonName) => void, onAuto: (on: boolean) => void, auto: boolean, time: TimeName, onTime: (t: TimeName) => void): SeasonBar | null {
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
  const round = document.createElement('button');
  round.type = 'button';
  round.className = 'round';
  round.textContent = '⟳';
  round.title = '季節が自動でめぐる';
  round.setAttribute('aria-label', '季節が自動でめぐる');
  const setAuto = (on: boolean) => round.setAttribute('aria-pressed', String(on));
  round.addEventListener('click', () => onAuto(round.getAttribute('aria-pressed') !== 'true'));
  el.append(round);
  // the hour: 昼 夕 夜
  const hours = new Map<TimeName, HTMLButtonElement>();
  const sep = document.createElement('span');
  sep.className = 'sep';
  el.append(sep);
  for (const t of timeNames) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = timeLabels[t];
    b.addEventListener('click', () => onTime(t));
    hours.set(t, b);
    el.append(b);
  }
  const select = (name: SeasonName, at: TimeName = time) => {
    for (const [n, b] of buttons) b.setAttribute('aria-pressed', String(n === name));
    for (const [t, b] of hours) b.setAttribute('aria-pressed', String(t === at));
  };
  select(current);
  setAuto(auto);
  return { el, select, setAuto };
}
