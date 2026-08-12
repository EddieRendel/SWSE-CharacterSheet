import type { Character, AbilityScores } from './types';

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

/** Fill in fields added after a character was saved, so old saves keep working. */
function migrate(c: Partial<Character>): Character {
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
    inventory: c.inventory ?? [],
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
