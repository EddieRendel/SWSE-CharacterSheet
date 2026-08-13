import { useCallback, useSyncExternalStore } from 'react';

/**
 * Which panels the player has collapsed.
 *
 * This is a UI preference rather than part of a character, so it lives under its own key and
 * applies to every character rather than being exported with one. Only collapsed panels are
 * recorded, which is what makes everything open the first time the app is used and any panel
 * added later open by default.
 */
const KEY = 'swse-character-sheet:collapsed:v1';

type State = Record<string, true>;

let cache: State | null = null;
const listeners = new Set<() => void>();

function read(): State {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    cache = parsed && typeof parsed === 'object' ? parsed as State : {};
  } catch {
    // A corrupt preference is not worth failing over; start from everything open.
    cache = {};
  }
  return cache;
}

export const isCollapsed = (id: string) => read()[id] === true;

/**
 * Panels held open because the section owes the player something. Deliberately not saved and
 * never written into the preference: when the need is met the panel returns to whatever the
 * player last chose, so collapsing one during a level-up does not have to be done twice.
 */
let forced = new Set<string>();

export const isOpen = (id: string) => forced.has(id) || !isCollapsed(id);

export function setForcedOpen(ids: Iterable<string>) {
  const next = new Set(ids);
  if (next.size === forced.size && [...next].every(id => forced.has(id))) return;
  forced = next;
  for (const l of listeners) l();
}

export function setCollapsed(id: string, collapsed: boolean) {
  if (!id || isCollapsed(id) === collapsed) return;
  const next: State = { ...read() };
  if (collapsed) next[id] = true;
  else delete next[id];
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Out of storage quota — the preference is lost on reload, which is survivable.
  }
  for (const l of listeners) l();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

/** `[open, toggle]` for one panel, shared across every component reading that id. */
export function useCollapsePanel(id: string) {
  const open = useSyncExternalStore(subscribe, () => isOpen(id), () => true);
  const toggle = useCallback(() => {
    const wasOpen = isOpen(id);
    // Closing one that a need is holding open has to drop the hold as well, or the click
    // would do nothing. The need can reassert it the next time the outstanding set changes.
    forced.delete(id);
    setCollapsed(id, wasOpen);
    for (const l of listeners) l();
  }, [id]);
  return [open, toggle] as const;
}
