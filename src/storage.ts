import type { Character, AbilityScores, InventoryEntry, ItemCustomization, ItemUpgrade } from './types';
import { ITEM_IDENTITY_KEYS, UPGRADE_NUMBERS } from './types';
import { EQUIPMENT } from './data';

/**
 * The key is not versioned per shape change on purpose: reading a new one would orphan
 * every character already saved, and there is no server to re-derive them from. Fields
 * are added optionally and `migrate` below brings older and hand-edited saves up to the
 * current shape — which is what has to happen for anything persisted.
 */
const KEY = 'swse-forge:characters:v1';

export const emptyAbilities = (): AbilityScores => ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function newCharacter(name = 'New Character'): Character {
  const now = Date.now();
  return {
    id: uid(),
    name,
    playerName: '',
    speciesId: null,
    portrait: null,
    nearHuman: { trait: null, sacrifice: null, cosmetic: [] },
    droid: { degree: null, size: 'Medium', systems: [] },
    allowedBooks: null,
    baseAbilities: emptyAbilities(),
    abilityIncreases: {},
    levels: [],
    selections: [],
    trainedSkills: [],
    languages: [],
    inventory: [],
    customItems: [],
    credits: 0,
    forcePointsSpent: 0,
    powersSpent: {},
    destinyPoints: 0,
    destiny: '',
    darkSideScore: 0,
    damage: 0,
    conditionIndex: 0,
    secondWindUsed: false,
    traits: {
      age: '', gender: '', height: '', weight: '',
      eyes: '', hair: '', skin: '',
      homeworld: '', affiliation: '',
      appearance: '', personality: '', background: '',
    },
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

const finiteNumber = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const nonEmpty = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

/** One fitted modification, with anything the file got wrong dropped rather than trusted. */
function migrateUpgrade(raw: unknown, index: number): ItemUpgrade | null {
  if (!raw || typeof raw !== 'object') return null;
  const from = raw as Record<string, unknown>;
  // An upgrade with no id is still an upgrade; it just needs one, since the id is what
  // the editor keys its rows by.
  const upgrade: ItemUpgrade = {
    id: nonEmpty(from.id) ?? `${uid()}-${index}`,
    name: typeof from.name === 'string' ? from.name : '',
  };
  for (const key of UPGRADE_NUMBERS) {
    const value = finiteNumber(from[key]);
    if (value !== undefined) upgrade[key] = value;
  }
  const dice = nonEmpty(from.damageDice);
  if (dice) upgrade.damageDice = dice;
  const notes = nonEmpty(from.notes);
  if (notes) upgrade.notes = notes;
  return upgrade;
}

/**
 * Customizations were added to inventory entries after characters were already being
 * saved. A save from before them has none and needs nothing; what needs handling is an
 * entry carrying a malformed one — an exported file edited by hand, or one written by a
 * future shape — so the rules engine never has to defend itself against it.
 */
function migrateCustomization(raw: unknown): ItemCustomization | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const from = raw as Record<string, unknown>;
  const mods: ItemCustomization = {};

  if (from.overrides && typeof from.overrides === 'object') {
    // What an item is stays what it is: an override naming its id, category or book is
    // describing a different item, not a modified one.
    const identity = new Set<string>(ITEM_IDENTITY_KEYS);
    const overrides = Object.fromEntries(
      Object.entries(from.overrides as Record<string, unknown>)
        .filter(([key, value]) => value !== undefined && !identity.has(key)),
    );
    if (Object.keys(overrides).length) mods.overrides = overrides;
  }

  const upgrades = Array.isArray(from.upgrades)
    ? from.upgrades.map(migrateUpgrade).filter((u): u is ItemUpgrade => !!u)
    : [];
  if (upgrades.length) mods.upgrades = upgrades;

  return mods.overrides || mods.upgrades ? mods : undefined;
}

function migrateEntry(raw: InventoryEntry): InventoryEntry {
  const entry: InventoryEntry = { ...raw };
  delete entry.mods;
  const mods = migrateCustomization(raw.mods);
  if (mods) entry.mods = mods;
  return entry;
}

/**
 * Weapons and armor are one entry per copy: each carries its own drawn or worn state, which
 * is what lets a matched pair of blasters be wielded together. Saves written before that
 * split hold a stack with a single tick over it, so unpack it into a row per copy.
 *
 * Only the first copy stays drawn. A stack showed one attack profile however many it held,
 * so leaving them all drawn would hand a character a second attack they did not have when
 * they were put away. The rest are there to be drawn when the player wants them.
 *
 * Split uids are derived from the original rather than freshly generated, so a character
 * that is loaded and never saved does not come back with different ones each time.
 */
function splitStack(entry: InventoryEntry, category: string | undefined): InventoryEntry[] {
  // Floor of 0, not 1: a stack the player has emptied is a real state, and clamping it back
  // up here would undo the quantity box on the next load. `|| 0` still catches a NaN out of
  // a hand-edited or truncated save.
  const n = Math.max(0, Math.floor(entry.quantity) || 0);
  // Unknown items are left exactly as they are: without a category there is no telling
  // whether the stack means three of a thing or one thing weighing triple.
  // `<= 1` rather than `=== 1`: a zero-quantity weapon is not split into no rows at all,
  // which would drop it from the character entirely.
  if (n <= 1 || (category !== 'weapon' && category !== 'armor')) {
    return [{ ...entry, quantity: n }];
  }
  return Array.from({ length: n }, (_, i) => ({
    ...entry,
    uid: i === 0 ? entry.uid : `${entry.uid}-${i}`,
    quantity: 1,
    equipped: i === 0 && entry.equipped,
  }));
}

/** Fill in fields added after a character was saved, so old saves keep working. */
export function migrate(c: Partial<Character>): Character {
  const base = newCharacter();
  return {
    ...base,
    ...c,
    baseAbilities: { ...base.baseAbilities, ...(c.baseAbilities ?? {}) },
    traits: { ...base.traits, ...(c.traits ?? {}) },
    portrait: c.portrait ?? null,
    nearHuman: { trait: null, sacrifice: null, cosmetic: [], ...(c.nearHuman ?? {}) },
    droid: { degree: null, size: 'Medium', systems: [], ...(c.droid ?? {}) },
    allowedBooks: c.allowedBooks ?? null,
    abilityIncreases: c.abilityIncreases ?? {},
    levels: c.levels ?? [],
    selections: c.selections ?? [],
    trainedSkills: c.trainedSkills ?? [],
    languages: c.languages ?? [],
    // Custom definitions come from the save itself, so a home-made rifle unpacks the same
    // way a compendium one does.
    inventory: (() => {
      const custom = new Map((c.customItems ?? []).map(i => [i.id, i]));
      return (c.inventory ?? []).map(migrateEntry).flatMap(e =>
        splitStack(e, (custom.get(e.itemId) ?? EQUIPMENT[e.itemId])?.category));
    })(),
    customItems: c.customItems ?? [],
    powersSpent: c.powersSpent ?? {},
    id: c.id ?? base.id,
  };
}

export function loadAll(): Character[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrate).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.error('Could not read saved characters', err);
    return [];
  }
}

export function saveAll(chars: Character[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(chars));
  } catch (err) {
    // Almost always the storage quota, and almost always a portrait that is too large.
    console.error('Could not save characters', err);
    alert(
      'Your characters could not be saved — browser storage is full.\n\n'
      + 'Portraits are the usual cause. Remove one, or export characters you are not '
      + 'currently working on and delete them here.',
    );
  }
}

/**
 * Downscale an uploaded image to a square portrait. Characters are kept in localStorage,
 * so the stored string has to stay small: 256px JPEG lands around 15–25 KB.
 */
export async function readPortrait(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  // Cover-fit so the portrait fills the square without distortion.
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale, h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function exportCharacter(c: Character) {
  const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'character'}.swse.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importCharacterFile(file: File): Promise<Character> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const c = migrate(parsed);
  // A fresh id avoids clobbering an existing character with the same one.
  c.id = uid();
  c.updatedAt = Date.now();
  return c;
}
