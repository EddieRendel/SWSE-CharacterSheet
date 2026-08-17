import type {
  Feature, TalentTree, CharacterClass, Species, Skill, EquipmentItem, AbilityId, FeatureRef,
  DroidSystem, DroidDegree, DroidSize,
} from '../types';

import featuresJson from './features.json';
import classesJson from './classes.json';
import speciesJson from './species.json';
import skillsJson from './skills.json';
import treesJson from './talentTrees.json';
import rulesJson from './rules.json';
import languagesJson from './languages.json';
import equipmentJson from './equipment.json';
import supplementJson from './supplement.json';
import forceTreesJson from './forceTrees.json';
import iconsJson from './icons.json';
import nearHumanJson from './nearHuman.json';
import droidsJson from './droids.json';

const supplement = supplementJson as unknown as {
  features?: Record<string, Partial<Feature>>;
  talentTrees?: Record<string, Partial<TalentTree>>;
  species?: Record<string, Partial<Species>>;
};

/**
 * Merge hand-written additions over the extracted data. The upstream data references
 * several class-specific talent trees it never defines; supplement.json is where their
 * talents get filled in from the books.
 */
function applySupplement(
  features: Record<string, Feature>,
  trees: Record<string, TalentTree>,
) {
  const DEFAULT_FEATURE = { book: 'supplement', type: 'talent', description: [] };

  for (const [id, patch] of Object.entries(supplement.features ?? {})) {
    features[id] = {
      ...(features[id] ?? DEFAULT_FEATURE),
      ...patch,
      id,
      incomplete: false,
    } as Feature;
  }

  for (const [id, patch] of Object.entries(supplement.talentTrees ?? {})) {
    const existing = trees[id];
    // Only reference talents that actually exist, so a typo can't create a dead entry.
    const added = (patch.features ?? []).filter(r => r.id in features);
    const merged = [...(existing?.features ?? []), ...added]
      .filter((r, i, all) => all.findIndex(x => x.id === r.id && x.spec === r.spec) === i);
    trees[id] = {
      ...(existing ?? {}),
      ...patch,
      id,
      name: patch.name ?? existing?.name ?? id,
      features: merged,
      // A tree is only still incomplete if nothing ever filled it.
      incomplete: merged.length === 0,
    } as TalentTree;
  }
  return { features, trees };
}

const merged = applySupplement(
  { ...(featuresJson as unknown as Record<string, Feature>) },
  { ...(treesJson as unknown as Record<string, TalentTree>) },
);

export const FEATURES = merged.features;
export const CLASSES = classesJson as unknown as Record<string, CharacterClass>;

/**
 * Species, with `supplement.species` merged over them the same way features are.
 *
 * The traits a species grants are what prerequisites elsewhere are checked against, so a
 * species missing one shuts every feature that asks for it. The Droid entry listed no
 * traits at all — droids are built from a degree, a size and systems rather than a fixed
 * stat block — which left the fourteen features whose line begins "Droid" unobtainable by
 * any droid.
 */
export const SPECIES: Record<string, Species> = {
  ...(speciesJson as unknown as Record<string, Species>),
};
for (const [id, patch] of Object.entries(supplement.species ?? {})) {
  SPECIES[id] = { ...SPECIES[id], ...patch, id } as Species;
}
export const SKILLS = skillsJson as unknown as Record<string, Skill>;
export const TALENT_TREES = merged.trees;

/**
 * The universal Force talent trees — every tree the spreadsheets file under
 * "Force Sensitive". Any character with the Force Sensitivity feat may take a talent
 * from these in place of one from their class, whenever they earn a talent.
 * Tradition-specific trees (Jensaarai Defender, Dathomiri Witch, …) are *not* included;
 * they belong to Force traditions the app does not model.
 */
export const FORCE_TALENT_TREES = forceTreesJson as string[];

/**
 * Equipment, with `supplement.equipment` merged over it the same way features are.
 *
 * The Foundry compendium is the source for gear, but it has gaps a re-import will not fill:
 * the Mortar Launcher's own entry cross-references a "Mortar Shells" page whose four shells
 * exist nowhere in the packs. This is where a hand-checked item or correction goes so that
 * re-running the import does not undo it.
 */
export const EQUIPMENT: Record<string, EquipmentItem> = {
  ...(equipmentJson as { items: Record<string, EquipmentItem> }).items,
};
for (const [id, patch] of Object.entries(
  (supplement as { equipment?: Record<string, Partial<EquipmentItem>> }).equipment ?? {},
)) {
  EQUIPMENT[id] = { ...EQUIPMENT[id], ...patch, id } as EquipmentItem;
}
/**
 * What to print for a weapon's damage.
 *
 * The Foundry compendium carries no damage attribute for 27 of the 245 weapons, and a blank
 * read as missing data when it usually is not. Weapons fed by ammunition say so in their
 * damage type — the launchers, and the Amphistaff, whose damage depends which of its three
 * forms it is in. The rest deal a condition rather than wounds: nets and snares entangle,
 * smoke and gas obscure, the Carbonite Rifle immobilises, and the gauntlets only add to an
 * unarmed attack.
 *
 * "see notes" catches anything whose damage exists only in its prose. Nothing in the data
 * needs it now that the three that did have been filled in from the books via
 * supplement.json, but a re-import can reintroduce the case.
 */
export const damageLabel = (item: EquipmentItem): string | undefined => {
  if (item.category !== 'weapon') return undefined;
  if (item.damage) return `${item.damage}${item.damageType ? ` ${item.damageType}` : ''}`;
  if (/varies/i.test(item.damageType ?? '')) return 'varies';
  return /\b\d+d\d+\b/.test(item.notes ?? '') ? 'see notes' : 'No damage';
};

/**
 * Corrections applied to the source data, for the About panel.
 *
 * These used to live in a generated `dataRepairs.json`, written by a bootstrap script that
 * has since been deleted — so the file froze while the data moved on, and the panel went on
 * quoting it. They are hand-written notes now, which is what they always were, and they sit
 * in supplement.json beside the corrections they describe.
 */
export const DATA_REPAIRS =
  (supplementJson as { provenance?: string[] }).provenance ?? [];

export const RULES = rulesJson as unknown as {
  abilities: Record<AbilityId, { id: AbilityId; name: string; description: string[] }>;
  defenses: Record<string, { id: string; name: string; description: string[] }>;
  sizes: string[];
  sizeModifiers: Record<'damage-threshold' | 'grapple' | 'reflex-defense' | 'stealth', Record<string, number>>;
  conditionTrack: { index: number; name: string; defenses: number; checks: number; speedFactor: number }[];
  /** Carrying capacity: limits scale with size, and a heavy load hampers seven skills. */
  carryingCapacity: {
    sizeMultiplier: Record<string, number>;
    heavyLoadPenalty: number;
    heavyLoadSkills: string[];
  };
};

/** Every language a character can speak, from the sourcebooks and the species list. */
export const LANGUAGES = languagesJson as unknown as Record<string, { id: string; name: string; description?: string }>;

export const BOOK_NAMES: Record<string, string> = {
  core: 'Core Rulebook',
  knights: 'Knights of the Old Republic',
  force: 'The Force Unleashed',
  rebellion: 'Rebellion Era',
  clone: 'Clone Wars',
  legacy: 'Legacy Era',
  jedi: 'Jedi Academy Training Manual',
  scum: 'Scum and Villainy',
  starships: 'Starships of the Galaxy',
  threats: 'Threats of the Galaxy',
  regions: 'Galaxy of Intrigue / Regions',
  intrigue: 'Galaxy of Intrigue',
  droids: 'Scavenger’s Guide to Droids',
  war: 'Galaxy at War',
  unknown: 'Unknown source',
};

export const WEAPON_GROUPS: Record<string, string> = {
  'simple-weapons': 'Simple Weapons',
  'pistols': 'Pistols',
  'rifles': 'Rifles',
  'advanced-melee-weapons': 'Advanced Melee Weapons',
  'heavy-weapons': 'Heavy Weapons',
  'lightsabers': 'Lightsabers',
  'exotic-weapons': 'Exotic Weapons',
};

/**
 * What to call a chosen specialization: a skill, a weapon group, a weapon, a talent, or
 * an option that exists only in the rules text.
 *
 * The single definition on purpose. This used to be written out three times — here, in
 * `ui.tsx` and in `prereqs.ts` — and two of them ordered the fallbacks differently, so an
 * id carried by both a feature and an item could read one way in the picker and another on
 * the sheet. A test pins the four ids that are in both maps to the same name.
 */
export const specName = (spec: string, feature?: Feature): string =>
  SKILLS[spec]?.name
  ?? WEAPON_GROUPS[spec]
  ?? EQUIPMENT[spec]?.name
  ?? FEATURES[spec]?.name
  ?? feature?.specOptions?.find(o => o.id === spec)?.name
  ?? spec;

export const featureName = (id: string, spec?: string) => {
  const f = FEATURES[id];
  const base = f?.name ?? id;
  return spec ? `${base} (${specName(spec, f)})` : base;
};

/**
 * Collapse repeated selections into one entry with a count — Force powers and
 * repeatable feats such as Sneak Attack can legitimately appear several times.
 */
export const groupRefs = (refs: FeatureRef[]) => {
  const map = new Map<string, { key: string; label: string; count: number; ref: FeatureRef }>();
  for (const r of refs) {
    const key = r.spec ? `${r.id}::${r.spec}` : r.id;
    const seen = map.get(key);
    if (seen) seen.count += 1;
    else map.set(key, { key, label: featureName(r.id, r.spec), count: 1, ref: r });
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
};

/** Every sourcebook that content is tagged with, in display order. */
export const ALL_BOOKS = Array.from(new Set([
  ...Object.values(FEATURES).map(f => f.book),
  ...Object.values(CLASSES).map(c => c.book ?? 'unknown'),
])).filter(b => b && b !== 'unknown').sort((a, b) =>
  a === 'core' ? -1 : b === 'core' ? 1 : (BOOK_NAMES[a] ?? a).localeCompare(BOOK_NAMES[b] ?? b));

/**
 * Icon artwork, keyed by id. Only entries listed here have a file on disk — the app never
 * renders an <img> for anything else, which is why nothing shows a broken image.
 *
 * To add your own: drop the file in `public/icons/features/` (or `classes/`, `weapons/`)
 * and name it under `icons` in supplement.json.
 */
type IconManifest = { classes: Record<string, string>; features: Record<string, string>; weapons: Record<string, string> };

const baseIcons = iconsJson as IconManifest;
const extraIcons = (supplementJson as { icons?: Partial<IconManifest> }).icons ?? {};

export const ICONS: IconManifest = {
  classes: { ...baseIcons.classes, ...extraIcons.classes },
  features: { ...baseIcons.features, ...extraIcons.features },
  weapons: { ...baseIcons.weapons, ...extraIcons.weapons },
};

// Guarded so the module still loads outside Vite (the rules test suite runs in plain Node).
const BASE_URL = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

const iconUrl = (kind: keyof IconManifest, key: string | undefined) => {
  if (!key) return undefined;
  const file = ICONS[kind][key];
  return file ? `${BASE_URL}icons/${kind}/${file}` : undefined;
};

export const featureIcon = (id: string, spec?: string) =>
  // Weapon-group specialisations get the weapon's artwork when the feature has none.
  iconUrl('features', spec ? `${id}-${spec}` : id)
  ?? iconUrl('features', id)
  ?? (spec ? iconUrl('weapons', spec) : undefined);

export const classIcon = (id: string) => iconUrl('classes', id);
export const weaponIcon = (group: string) => iconUrl('weapons', group);

/** Resolve a character's stored portrait to something an <img> can use. */
export const portraitUrl = (portrait: string | null | undefined) => {
  if (!portrait) return undefined;
  if (portrait.startsWith('class:')) return classIcon(portrait.slice(6));
  return portrait;
};

/** The Near-Human trait menu: one mechanical trait, up to three cosmetic variations. */
export const NEAR_HUMAN = nearHumanJson as {
  cosmeticLimit: number;
  mechanical: string[];
  cosmetic: string[];
};

/** Droid degrees, sizes and the systems catalogue. */
export const DROIDS = droidsJson as unknown as {
  pointBuy: number;
  standardArray: number[];
  startingSystemCredits: number;
  forbiddenClasses: string[];
  degrees: DroidDegree[];
  sizes: DroidSize[];
  speeds: Record<string, Record<string, number>>;
  systems: Record<string, DroidSystem>;
};

export const droidSize = (id: string) => DROIDS.sizes.find(s => s.id === id) ?? DROIDS.sizes[0];
export const droidDegree = (id: string | null) => DROIDS.degrees.find(d => d.id === id);
