import { useCallback, useSyncExternalStore } from 'react';

/**
 * Which palette the app is wearing.
 *
 * A preference rather than part of a character, so it lives under its own key alongside the
 * collapse state and applies to every character — exporting a character does not carry a
 * theme with it, and importing one cannot change how the app looks.
 *
 * A theme only redefines the chrome tokens in index.css: backgrounds, borders, text and the
 * accent. The hues that mean something — red for nearly dead, green for healthy or trained,
 * blue for defenses, purple for talents, amber for unfinished — are left alone, so the sheet
 * still reads the same way whatever it is painted in. Sith is the one exception and says why.
 */
const KEY = 'swse-character-sheet:theme:v1';

export interface Theme {
  id: string;
  name: string;
  /** One line in the picker, and the reason the palette exists. */
  blurb: string;
  /** Background, panel and accent, for the swatch. Drawn from the palette's own tokens. */
  swatch: [string, string, string];
}

/**
 * `default` is the palette the app was built in and is not a `[data-theme]` block — it is
 * what `:root` already says, so choosing it removes the attribute rather than adding rules.
 */
export const THEMES: Theme[] = [
  { id: 'default', name: 'Holocron', blurb: 'Archive blue and gold. The original.', swatch: ['#0b0f14', '#131b26', '#ffcf4d'] },
  { id: 'jedi', name: 'Jedi', blurb: 'Temple granite, lit by marble.', swatch: ['#131211', '#1a1917', '#f2e7c4'] },
  { id: 'sith', name: 'Sith', blurb: 'Ash and one colour that is not.', swatch: ['#0c0b0c', '#131113', '#c74a4a'] },
  { id: 'mandalorian', name: 'Mandalorian', blurb: 'Beskar plate and a scorched visor.', swatch: ['#0c0e10', '#151a1e', '#e2743a'] },
  { id: 'yoda', name: 'Dagobah', blurb: 'Swamp light through the canopy.', swatch: ['#0a0d0a', '#141a14', '#c9b458'] },
  { id: 'wookiee', name: 'Kashyyyk', blurb: 'Deep bark, and brass that catches the light.', swatch: ['#0a0705', '#120c08', '#f2b360'] },
  { id: 'smuggler', name: 'Smuggler', blurb: 'Scored hull plating and cockpit glow.', swatch: ['#0d0d0f', '#171719', '#d6d3c4'] },
];

const ids = new Set(THEMES.map(t => t.id));

let cache: string | null = null;
const listeners = new Set<() => void>();

/**
 * What is stored may be missing, may be an id a later version dropped, or may be whatever a
 * hand-edited storage entry contains. Anything unrecognised falls back rather than stamping
 * an attribute no stylesheet answers to.
 */
const valid = (id: string | null | undefined) => (id && ids.has(id) ? id : 'default');

function read(): string {
  if (cache) return cache;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    // Private browsing, or storage disabled. The default palette is a fine answer.
  }
  cache = valid(stored);
  return cache;
}

/**
 * Stamped on <html> rather than <body> so the page background — which is painted from the
 * root element, not the body — changes with it.
 */
function apply(id: string) {
  const root = document.documentElement;
  if (id === 'default') delete root.dataset.theme;
  else root.dataset.theme = id;
}

export function setTheme(id: string) {
  if (!ids.has(id) || read() === id) return;
  cache = id;
  apply(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Out of quota. The theme holds for this session and reverts on reload, which is
    // survivable — it is a preference, not the character.
  }
  for (const l of listeners) l();
}

let listening = false;

/** Called once at start-up, before React paints, so there is no flash of the default. */
export function initTheme() {
  apply(read());

  // The palette belongs to the browser, not to a tab, so a second window has to follow the
  // first rather than keep wearing whatever it opened in. `storage` fires only in the *other*
  // tabs on this origin, so there is nothing to echo back and no write to make here — the tab
  // that made the change has already saved it.
  if (listening) return;
  listening = true;
  window.addEventListener('storage', event => {
    // sessionStorage raises the same event, and a null key is localStorage.clear() rather
    // than a change to ours.
    if (event.storageArea && event.storageArea !== localStorage) return;
    if (event.key !== null && event.key !== KEY) return;
    const next = valid(event.key === null ? null : event.newValue);
    if (next === cache) return;
    cache = next;
    apply(next);
    for (const l of listeners) l();
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

/** `[id, choose]` for the picker, shared with anything else reading the current palette. */
export function useTheme() {
  const id = useSyncExternalStore(subscribe, read, () => 'default');
  const choose = useCallback((next: string) => setTheme(next), []);
  return [id, choose] as const;
}
