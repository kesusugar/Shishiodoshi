/**
 * The settings panel (PLAN.md 8章): how much water the kakei gives (which sets how often the tube
 * knocks), and the volume of the knock, the water and the garden. A gear button opens it; the
 * values are remembered in this browser (and simply not remembered if storage is unavailable).
 */
export interface Settings {
  /** Kakei flow (mL/s). */
  flow: number;
  /** Volumes, 0..1.5 (1 = as designed). */
  knock: number;
  water: number;
  ambient: number;
}

export const defaultSettings: Settings = { flow: 16, knock: 1, water: 1, ambient: 1 };
const KEY = 'shishiodoshi.settings';

/** Water the tube holds when it tips (about 0.43 L): the time between knocks is about this / flow. */
const TIP_VOLUME_ML = 427;

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { ...defaultSettings, ...saved };
  } catch {
    return { ...defaultSettings };
  }
}

function save(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private mode or storage blocked: the settings just last for this visit
  }
}

export function buildSettingsPanel(initial: Settings, onChange: (s: Settings) => void): HTMLElement {
  const s = { ...initial };
  const root = document.createElement('div');
  root.id = 'settings';
  root.innerHTML = `
    <button type="button" class="gear" aria-expanded="false" aria-controls="settings-panel" title="設定">⚙ 設定</button>
    <div id="settings-panel" class="panel" hidden>
      <label>水の量 <span data-out="flow"></span>
        <input type="range" data-key="flow" min="6" max="45" step="1" />
      </label>
      <label>コツンの音量 <span data-out="knock"></span>
        <input type="range" data-key="knock" min="0" max="1.5" step="0.05" />
      </label>
      <label>水の音量 <span data-out="water"></span>
        <input type="range" data-key="water" min="0" max="1.5" step="0.05" />
      </label>
      <label>まわりの音量 <span data-out="ambient"></span>
        <input type="range" data-key="ambient" min="0" max="1.5" step="0.05" />
      </label>
      <button type="button" class="reset">元に戻す</button>
    </div>`;
  const gear = root.querySelector<HTMLButtonElement>('.gear')!;
  const panel = root.querySelector<HTMLElement>('.panel')!;
  gear.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    gear.setAttribute('aria-expanded', String(!panel.hidden));
  });

  const inputs = [...root.querySelectorAll<HTMLInputElement>('input[data-key]')];
  const show = () => {
    for (const input of inputs) {
      const key = input.dataset.key as keyof Settings;
      input.value = String(s[key]);
      const out = root.querySelector<HTMLElement>(`[data-out="${key}"]`)!;
      out.textContent = key === 'flow' ? `${s.flow} mL/秒（約 ${Math.round(TIP_VOLUME_ML / s.flow)} 秒ごと）` : `${Math.round(s[key] * 100)}%`;
    }
  };
  for (const input of inputs) {
    input.addEventListener('input', () => {
      s[input.dataset.key as keyof Settings] = Number(input.value);
      show();
      save(s);
      onChange({ ...s });
    });
  }
  root.querySelector<HTMLButtonElement>('.reset')!.addEventListener('click', () => {
    Object.assign(s, defaultSettings);
    show();
    save(s);
    onChange({ ...s });
  });
  show();
  return root;
}
