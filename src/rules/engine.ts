import type {
  AbilityId, AbilityScores, Character, CharacterClass, Feature, FeatureRef, EquipmentItem, Species,
  DroidSystem, InventoryEntry, ItemUpgrade, ResolvedItem,
} from '../types';
import { ABILITY_IDS } from '../types';
import { CLASSES, FEATURES, SPECIES, SKILLS, TALENT_TREES, EQUIPMENT, RULES, FORCE_TALENT_TREES, DROIDS, droidSize, droidDegree } from '../data';

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Character levels at which a general feat is gained: 1st, then every level divisible by 3. */
export const isFeatLevel = (level: number) => level === 1 || level % 3 === 0;
/** Character levels at which two ability scores each increase by 1. */
export const isAbilityIncreaseLevel = (level: number) => level % 4 === 0;
/** Those levels up to and including `level`: 4th, 8th, 12th, 16th, 20th. */
export const abilityIncreaseLevels = (level: number): number[] =>
  Array.from({ length: level }, (_, i) => i + 1).filter(isAbilityIncreaseLevel);

export type SlotKind =
  | 'starting-feat' | 'class-feature' | 'species-trait'
  | 'talent' | 'bonus' | 'feat' | 'species-feat'
  | 'force-power' | 'force-technique' | 'force-secret' | 'starship-maneuver';

/** The options for a talent slot, split by the tree they come from. */
export interface SlotTreeGroup {
  treeId: string;
  treeName: string;
  category: 'class' | 'force';
  features: FeatureRef[];
}

export interface Slot {
  key: string;
  kind: SlotKind;
  label: string;
  /** character level this slot is granted at */
  level: number;
  classId?: string;
  /** Fixed list of options; null means "any feature of the matching type". */
  pool: FeatureRef[] | null;
  /** For talent slots: the same options, organised by talent tree. */
  treeGroups?: SlotTreeGroup[];
  /** Automatically granted — not a player choice. */
  auto: boolean;
  /** Pre-filled ref for auto slots. */
  granted?: FeatureRef;
}

export interface SlotContext {
  /** Force Sensitivity opens the Force talent trees on every talent slot. */
  forceSensitive?: boolean;
  /** A droid's degree opens its degree talent tree. */
  droidTree?: string;
  /** One entry per Force Training feat taken, each granting `count` Force powers. */
  forceTraining?: { sourceKey: string; level: number; count: number }[];
  /** One entry per Adaptable Talent feat taken, each banking one extra talent. */
  adaptableTalents?: { sourceKey: string; level: number }[];
}

export const dedupeRefs = (refs: FeatureRef[]): FeatureRef[] => {
  const seen = new Set<string>();
  return refs.filter(r => {
    const k = refKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * A Near-Human trades one of the Human bonuses for its trait, so whichever was given
 * up is no longer granted.
 */
export const speciesGrantsBonusFeat = (char: Character, species: Species | null) =>
  !!species?.bonusFeat
  && !(species.template === 'near-human' && char.nearHuman?.sacrifice === 'feat');

export const speciesGrantsBonusSkill = (char: Character, species: Species | null) =>
  !!species?.bonusSkill
  && !(species.template === 'near-human' && char.nearHuman?.sacrifice === 'skill');

/** Droids are built rather than picked from a stat block. */
export const isDroid = (char: Character) =>
  !!char.speciesId && SPECIES[char.speciesId]?.template === 'droid';

/** Installed systems, resolved against the catalogue. */
export const droidSystems = (char: Character) =>
  (char.droid?.systems ?? []).map(id => DROIDS.systems[id]).filter(Boolean);

export const isBookAllowed = (char: Character, book: string | undefined) =>
  !char.allowedBooks || !book || char.allowedBooks.includes(book);

/**
 * Whether a feature is available to a character, given the sourcebooks they allow.
 * `allowedBooks: null` means every book. Content already selected is unaffected —
 * this only governs what new pickers offer.
 */
export const featureAvailable = (char: Character, id: string) => {
  const f = FEATURES[id];
  return !!f && !f.hidden && isBookAllowed(char, f.book);
};

/** Turn a list of tree ids into display groups, dropping anything unavailable. */
function makeTreeGroups(char: Character, treeIds: string[]): SlotTreeGroup[] {
  return treeIds
    .map(t => {
      const tree = TALENT_TREES[t];
      if (!tree || tree.hidden) return null;
      const features = (tree.features ?? []).filter(r => featureAvailable(char, r.id));
      if (!features.length) return null;
      return {
        treeId: t,
        treeName: tree.name,
        category: FORCE_TALENT_TREES.includes(t) ? 'force' : 'class',
        features,
      } satisfies SlotTreeGroup;
    })
    .filter((g): g is SlotTreeGroup => !!g);
}

/** Every feat/talent/etc. slot the character has earned, in level order. */
export function buildSlots(char: Character, ctx: SlotContext = {}): Slot[] {
  const { forceSensitive = false, droidTree } = ctx;
  const slots: Slot[] = [];
  const classLevelCount: Record<string, number> = {};

  // Species traits and the species bonus feat are granted at 1st level.
  const species = char.speciesId ? SPECIES[char.speciesId] : null;
  if (species) {
    for (const [i, ref] of (species.features ?? []).entries()) {
      slots.push({
        key: `species-trait:${i}`, kind: 'species-trait', label: 'Species trait',
        level: 1, pool: null, auto: true, granted: ref,
      });
    }
    // A Near-Human's chosen trait and cosmetic variations behave like species traits.
    if (species.template === 'near-human') {
      const chosen = [
        ...(char.nearHuman?.trait ? [char.nearHuman.trait] : []),
        ...(char.nearHuman?.cosmetic ?? []),
      ];
      for (const [i, id] of chosen.entries()) {
        if (!FEATURES[id]) continue;
        slots.push({
          key: `near-human:${i}`, kind: 'species-trait', label: 'Near-Human trait',
          level: 1, pool: null, auto: true, granted: { id },
        });
      }
    }
    if (speciesGrantsBonusFeat(char, species)) {
      slots.push({
        key: 'species-feat:0', kind: 'species-feat',
        label: `${species.name} bonus feat`, level: 1, pool: null, auto: false,
      });
    }
  }

  char.levels.forEach((entry, i) => {
    const level = i + 1;
    const cls = CLASSES[entry.classId];
    if (!cls) return;
    classLevelCount[cls.id] = (classLevelCount[cls.id] ?? 0) + 1;
    const classLevel = classLevelCount[cls.id];

    // Starting feats come only from your very first class.
    if (level === 1) {
      for (const treeId of cls.trees?.starting ?? []) {
        for (const [j, ref] of (TALENT_TREES[treeId]?.features ?? []).entries()) {
          slots.push({
            key: `starting:${treeId}:${j}`, kind: 'starting-feat',
            label: `${cls.name} starting feat`, level, classId: cls.id,
            pool: null, auto: true, granted: ref,
          });
        }
      }
    }

    // Automatic class features at this class level.
    for (const [j, ref] of (cls.features?.[classLevel - 1] ?? []).entries()) {
      slots.push({
        key: `classfeat:${cls.id}:${classLevel}:${j}`, kind: 'class-feature',
        label: `${cls.name} feature`, level, classId: cls.id,
        pool: null, auto: true, granted: ref,
      });
    }

    // Selectable class choices (talents, bonus feats, Force techniques…).
    for (const [j, choice] of (cls.choices?.[classLevel - 1] ?? []).entries()) {
      const kind = choice.id as SlotKind;
      let pool: FeatureRef[] | null = null;
      let treeGroups: SlotTreeGroup[] | undefined;

      if (kind === 'talent') {
        // A talent slot draws from the class's own trees, plus — if the character is
        // Force-sensitive — the universal Force talent trees.
        const treeIds = [...(cls.trees?.talent ?? [])];
        if (forceSensitive) {
          for (const t of FORCE_TALENT_TREES) if (!treeIds.includes(t)) treeIds.push(t);
        }
        // A droid may always draw on its own degree's tree.
        if (droidTree && !treeIds.includes(droidTree)) treeIds.push(droidTree);
        treeGroups = makeTreeGroups(char, treeIds);
        pool = dedupeRefs(treeGroups.flatMap(g => g.features));
      } else if (kind === 'bonus') {
        pool = dedupeRefs((cls.trees?.bonus ?? [])
          .flatMap(t => TALENT_TREES[t]?.features ?? [])
          .filter(r => featureAvailable(char, r.id)));
      }

      slots.push({
        key: `${i}:${j}`, kind, classId: cls.id, level,
        label: `${cls.name} ${choice.name}`,
        pool, treeGroups, auto: false,
      });
    }

    // General feats, available to every character regardless of class.
    if (isFeatLevel(level)) {
      slots.push({
        key: `feat:${level}`, kind: 'feat', label: `Feat (level ${level})`,
        level, pool: null, auto: false,
      });
    }
  });

  // Adaptable Talent banks one talent "from a Class you possess", so its options are the
  // union of every class the character has levels in — not just the one that granted it.
  if (ctx.adaptableTalents?.length) {
    const treeIds: string[] = [];
    for (const id of new Set(char.levels.map(l => l.classId))) {
      for (const t of CLASSES[id]?.trees?.talent ?? []) if (!treeIds.includes(t)) treeIds.push(t);
    }
    if (forceSensitive) {
      for (const t of FORCE_TALENT_TREES) if (!treeIds.includes(t)) treeIds.push(t);
    }
    const treeGroups = makeTreeGroups(char, treeIds);
    const pool = dedupeRefs(treeGroups.flatMap(g => g.features));
    for (const at of ctx.adaptableTalents) {
      slots.push({
        key: `adaptable-talent:${at.sourceKey}`,
        kind: 'talent',
        label: 'Adaptable Talent',
        level: at.level,
        pool, treeGroups,
        auto: false,
      });
    }
  }

  // Each Force Training feat adds 1 + Wisdom modifier powers to your suite.
  // Keys are derived from the granting feat's slot so they survive level changes.
  for (const ft of ctx.forceTraining ?? []) {
    for (let n = 0; n < ft.count; n++) {
      slots.push({
        key: `force-power:${ft.sourceKey}:${n}`,
        kind: 'force-power',
        label: `Force power ${n + 1} of ${ft.count}`,
        level: ft.level,
        pool: null,
        auto: false,
      });
    }
  }

  return slots;
}

/** Slots paired with whatever feature currently fills them. */
export function resolveSlotRefs(char: Character, slots: Slot[]): { slot: Slot; ref: FeatureRef }[] {
  const byKey = new Map(char.selections.map(s => [s.key, s]));
  const out: { slot: Slot; ref: FeatureRef }[] = [];
  for (const slot of slots) {
    if (slot.auto && slot.granted) out.push({ slot, ref: slot.granted });
    else {
      const sel = byKey.get(slot.key);
      if (sel?.featureId) out.push({ slot, ref: { id: sel.featureId, spec: sel.spec } });
    }
  }
  return out;
}

/** Every feature the character actually has, resolved from auto grants + selections. */
export function resolveFeatures(char: Character, slots: Slot[]): FeatureRef[] {
  const refs = resolveSlotRefs(char, slots).map(r => r.ref);
  // A feature marked `specGrants` hands over the one it chose: Stolen Form says "you gain
  // the benefits of this Talent and are considered to have this Talent for the purpose of
  // satisfying prerequisites". Held only as stolen-form(ataru), nothing keyed on the form's
  // own id can fire — Ataru's Dexterity-for-Strength damage does nothing at all — so the
  // chosen feature joins the list in its own right, marked with where it came from.
  const granted = refs
    .filter(r => r.spec && FEATURES[r.id]?.specGrants && FEATURES[r.spec])
    .map(r => ({ id: r.spec!, via: r.id }));
  return granted.length ? [...refs, ...granted] : refs;
}

export const refKey = (r: FeatureRef) => (r.spec ? `${r.id}::${r.spec}` : r.id);

/**
 * How many times each Force power can be used before the encounter ends. A power taken
 * more than once through Force Training grants a use per copy.
 */
export const forcePowerUses = (powers: FeatureRef[]): Record<string, number> => {
  const uses: Record<string, number> = {};
  for (const p of powers) uses[p.id] = (uses[p.id] ?? 0) + 1;
  return uses;
};

export function countFeature(refs: FeatureRef[], id: string, spec?: string) {
  return refs.filter(r => r.id === id && (spec === undefined || r.spec === spec)).length;
}

export function hasFeature(refs: FeatureRef[], id: string, spec?: string) {
  return countFeature(refs, id, spec) > 0;
}

/** One contribution to a defense score, for the hover breakdown. */
export interface DefensePart { label: string; value: number }

/** How close to your limit you are carrying. */
export type LoadLevel = 'normal' | 'heavy' | 'strained' | 'overloaded';

export interface Carrying {
  /** Everything in the inventory, worn or stowed, in kilograms. */
  weight: number;
  /** The three thresholds, already scaled for size. */
  heavy: number;
  strain: number;
  maximum: number;
  level: LoadLevel;
  /** Speed after the load is taken into account. */
  speed: number;
  /** Skills the load hampers, when it does. */
  penalisedSkills: string[];
}

export interface DerivedSkill {
  id: string;
  name: string;
  ability: AbilityId;
  trained: boolean;
  focused: boolean;
  classSkill: boolean;
  armorPenalty: number;
  sizeMod: number;
  total: number;
  /** Every contribution to the total, so a check can be read rather than trusted. */
  parts: { label: string; value: number }[];
}

export interface Derived {
  level: number;
  abilities: AbilityScores;
  mods: Record<AbilityId, number>;
  speciesMods: Partial<Record<AbilityId, number>>;
  /** One entry per class taken, with the base attack bonus that class contributes. */
  classLevels: { cls: CharacterClass; levels: number; bab: number }[];
  baseAttackBonus: number;
  maxHitPoints: number;
  hitPointBreakdown: { level: number; className: string; gained: number }[];
  defenses: { reflex: number; fortitude: number; will: number; flatFooted: number };
  defenseBreakdown: Record<'reflex' | 'fortitude' | 'will', DefensePart[]>;
  damageThreshold: number;
  size: string;
  speed: number;
  /** Load, limits and what they cost you. */
  carrying: Carrying;
  /** Species languages, the ones chosen on top, and how many more may be chosen. */
  languages: { automatic: string[]; chosen: string[]; allowed: number };
  forcePoints: number;
  destinyPoints: number;
  skills: DerivedSkill[];
  trainedSkillsAllowed: number;
  classSkills: Set<string>;
  features: FeatureRef[];
  feats: FeatureRef[];
  talents: FeatureRef[];
  forcePowers: FeatureRef[];
  forceTechniques: FeatureRef[];
  forceSecrets: FeatureRef[];
  starshipManeuvers: FeatureRef[];
  /** The suit actually worn, as this character has it — upgrades and edits included. */
  equippedArmor: ResolvedItem | null;
  armorProficient: boolean;
  armorPenalty: number;
  conditionPenalty: number;
  secondWind: number;
  forceSensitive: boolean;
  isDroid: boolean;
  droidSystems: DroidSystem[];
  droidCostFactor: number;
  forceTrainingCount: number;
  forcePowersPerTraining: number;
  slots: Slot[];
  unfilledSlots: Slot[];
}

/** The catalogue entry behind an id: the item as the book has it, before anyone owned one. */
export function getItem(char: Character, itemId: string): EquipmentItem | undefined {
  return EQUIPMENT[itemId] ?? char.customItems.find(i => i.id === itemId);
}

/** Kilograms and credits are worth two decimal places; nothing else is. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The numbers an upgrade may carry; the rest of it is a name, dice and a note. */
export type UpgradeNumber =
  'attack' | 'damage' | 'reflexDefense' | 'fortitudeDefense' | 'willDefense' | 'weight' | 'cost';

/** One of those numbers, summed over everything fitted to the item. */
export const upgradeTotal = (upgrades: ItemUpgrade[] | undefined, key: UpgradeNumber): number =>
  (upgrades ?? []).reduce((n, u) => n + (u[key] ?? 0), 0);

/**
 * An item as this character carries it: the catalogue entry, the stats they rewrote on
 * their own copy, and the weight and cost of everything fitted to it. The bonuses an
 * upgrade grants are left on `upgrades` rather than folded away, so the attack and
 * defense breakdowns can name each one instead of showing an unexplained total.
 *
 * An entry with no customization returns the catalogue object itself, so nothing is
 * copied for the overwhelmingly common case.
 */
export function resolveItem(char: Character, entry: InventoryEntry): ResolvedItem | undefined {
  const base = getItem(char, entry.itemId);
  if (!base) return undefined;
  const overrides = entry.mods?.overrides;
  const upgrades = entry.mods?.upgrades?.length ? entry.mods.upgrades : undefined;
  if (!upgrades && !overrides) return base;

  const item: ResolvedItem = { ...base, entryUid: entry.uid, modified: true };
  // Key by key rather than by spread: a stored `undefined` — which an imported character
  // may well carry — would otherwise erase the catalogue value instead of inheriting it.
  Object.assign(item, Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, value]) => value !== undefined),
  ));
  if (upgrades) {
    item.upgrades = upgrades;
    item.weight = round2(item.weight + upgradeTotal(upgrades, 'weight'));
    item.cost = round2(item.cost + upgradeTotal(upgrades, 'cost'));
  }
  return item;
}

/** Everything carried, resolved, paired with the entry that holds the quantity. */
export function carriedItems(char: Character): { entry: InventoryEntry; item: ResolvedItem }[] {
  return char.inventory
    .map(entry => ({ entry, item: resolveItem(char, entry) }))
    .filter((r): r is { entry: InventoryEntry; item: ResolvedItem } => !!r.item);
}

export function computeAbilities(char: Character): { scores: AbilityScores; speciesMods: Partial<Record<AbilityId, number>> } {
  const species = char.speciesId ? SPECIES[char.speciesId] : null;
  let speciesMods: Partial<Record<AbilityId, number>> = species?.abilities ?? {};

  // A droid's modifiers come from its degree and its size, not a fixed species entry.
  if (species?.template === 'droid') {
    const merged: Partial<Record<AbilityId, number>> = {};
    for (const src of [droidDegree(char.droid?.degree ?? null)?.abilities, droidSize(char.droid?.size ?? 'Medium').abilities]) {
      for (const [k, v] of Object.entries(src ?? {})) {
        merged[k as AbilityId] = (merged[k as AbilityId] ?? 0) + (v as number);
      }
    }
    speciesMods = merged;
  }
  const scores = {} as AbilityScores;
  for (const a of ABILITY_IDS) {
    let v = char.baseAbilities[a] + (speciesMods[a] ?? 0);
    for (const ids of Object.values(char.abilityIncreases)) v += ids.filter(x => x === a).length;
    scores[a] = v;
  }
  return { scores, speciesMods };
}

export function computeCharacter(char: Character): Derived {
  const level = char.levels.length;
  const { scores: abilities, speciesMods } = computeAbilities(char);
  const mods = {} as Record<AbilityId, number>;
  for (const a of ABILITY_IDS) mods[a] = abilityMod(abilities[a]);

  // Force Sensitivity widens talent slots and Force Training grants Force power slots, but
  // both are features that may themselves have been chosen — so resolve once, then rebuild.
  const baseSlots = buildSlots(char);
  const baseRefs = resolveSlotRefs(char, baseSlots);
  const forceSensitive = baseRefs.some(r => r.ref.id === 'force-sensitivity');

  // 1 + Wisdom modifier powers per Force Training feat, minimum 1. Saga Edition
  // explicitly re-grants these if your Wisdom modifier later increases, so this recomputes.
  const powersPerTraining = Math.max(1, 1 + mods.wis);
  const forceTraining = baseRefs
    .filter(r => r.ref.id === 'force-training')
    .map(r => ({ sourceKey: r.slot.key, level: r.slot.level, count: powersPerTraining }));

  const adaptableTalents = baseRefs
    .filter(r => r.ref.id === 'adaptable-talent')
    .map(r => ({ sourceKey: r.slot.key, level: r.slot.level }));

  const droidTree = isDroid(char)
    ? droidDegree(char.droid?.degree ?? null)?.tree
    : undefined;

  const slots = buildSlots(char, { forceSensitive, forceTraining, adaptableTalents, droidTree });
  const features = resolveFeatures(char, slots);
  const byKey = new Map(char.selections.map(s => [s.key, s]));
  const unfilledSlots = slots.filter(s => !s.auto && !byKey.get(s.key)?.featureId);

  const featureOf = (r: FeatureRef): Feature | undefined => FEATURES[r.id];
  const ofType = (t: Feature['type']) => features.filter(r => featureOf(r)?.type === t);

  // ---- class levels ----
  const counts: Record<string, number> = {};
  for (const l of char.levels) counts[l.classId] = (counts[l.classId] ?? 0) + 1;
  // ---- base attack bonus: computed per class, then summed ----
  const classLevels = Object.entries(counts)
    .filter(([id]) => CLASSES[id])
    .map(([id, n]) => ({
      cls: CLASSES[id],
      levels: n,
      bab: CLASSES[id].fullBaseAttackBonus ? n : Math.floor(n * 3 / 4),
    }));

  const baseAttackBonus = classLevels.reduce((sum, c) => sum + c.bab, 0);

  // ---- hit points ----
  const droid = isDroid(char);
  const dSize = droid ? droidSize(char.droid?.size ?? 'Medium') : null;
  // Droids gain no bonus hit points from Constitution, having no such score.
  const hpPerLevel = droid ? 0 : mods.con;

  const hitPointBreakdown: Derived['hitPointBreakdown'] = [];
  let maxHitPoints = 0;
  char.levels.forEach((entry, i) => {
    const cls = CLASSES[entry.classId];
    if (!cls) return;
    // The first level of your first class grants the class's fixed starting hit points.
    const base = i === 0 ? (cls.startingHitPoints ?? cls.hitDie) : (entry.hitPoints ?? defaultHitDieValue(cls.hitDie));
    const gained = base + hpPerLevel;
    maxHitPoints += gained;
    hitPointBreakdown.push({ level: i + 1, className: cls.name, gained });
  });
  // Larger droid chassis carry extra hit points outright.
  if (dSize?.extraHitPoints) maxHitPoints += dSize.extraHitPoints;
  // Toughness grants +1 hp per character level.
  if (hasFeature(features, 'toughness')) maxHitPoints += level;

  // ---- equipment ----
  // Resolved once: every reading below is of the item as this character has it, upgrades
  // and hand-edited stats included, rather than of the catalogue entry it started as.
  const carried = carriedItems(char);
  const equipped = carried.filter(r => r.entry.equipped);
  const equippedArmor = equipped.map(r => r.item).find(i => i.category === 'armor') ?? null;

  const armorProfFeat = equippedArmor
    ? `armor-proficiency-${equippedArmor.armorType}`
    : null;
  const armorProficient = !equippedArmor || hasFeature(features, armorProfFeat!);
  // Wearing armor you are not proficient with costs you its Reflex bonus on
  // attack rolls and Strength-/Dexterity-based skill checks.
  const armorPenalty = equippedArmor && !armorProficient ? -(equippedArmor.reflex ?? 0) : 0;

  // Everything in the inventory counts, whether it is worn or stowed. Summed once here
  // and reported only as `carrying.weight`, so the sheet and the equipment list cannot
  // drift apart the way two separate reduces let them.
  const carriedWeight = carried.reduce((kg, { entry, item }) => kg + item.weight * entry.quantity, 0);

  // Upgrades fitted to what you are wearing — a talisman's blessing, an armor package —
  // add to your defenses on top of whatever the armor itself grants. Each is listed under
  // the item it came from rather than summed away, and the numbers are taken as entered:
  // the app cannot know which of them are equipment bonuses that would not stack.
  const itemDefenses: Record<'reflex' | 'fortitude' | 'will', DefensePart[]> = {
    reflex: [], fortitude: [], will: [],
  };
  for (const { item } of equipped) {
    for (const up of item.upgrades ?? []) {
      const label = `${item.name}: ${up.name.trim() || 'modification'}`;
      if (up.reflexDefense) itemDefenses.reflex.push({ label, value: up.reflexDefense });
      if (up.fortitudeDefense) itemDefenses.fortitude.push({ label, value: up.fortitudeDefense });
      if (up.willDefense) itemDefenses.will.push({ label, value: up.willDefense });
    }
  }
  const sumParts = (parts: DefensePart[]) => parts.reduce((n, p) => n + p.value, 0);

  // ---- defenses ----
  const species = char.speciesId ? SPECIES[char.speciesId] : null;
  // A droid's size is chosen at build time rather than fixed by its species entry.
  const size = droid ? (char.droid?.size ?? 'Medium') : (species?.size ?? 'Medium');
  const sizeRef = RULES.sizeModifiers['reflex-defense'][size] ?? 0;
  const sizeDt = (RULES.sizeModifiers['damage-threshold'][size] ?? 0) + (dSize?.damageThreshold ?? 0);

  // With multiple classes you take the single best bonus for each defense, never the sum.
  const best = (idx: 0 | 1 | 2) =>
    classLevels.reduce((m, { cls }) => Math.max(m, cls.defenseBonuses?.[idx] ?? 0), 0);
  const classRef = best(0), classFort = best(1), classWill = best(2);

  const condition = RULES.conditionTrack[char.conditionIndex] ?? RULES.conditionTrack[0];
  const conditionPenalty = condition.defenses;

  // Dexterity applied to Reflex is capped by the armor's maximum Dexterity bonus.
  const dexToReflex = equippedArmor && equippedArmor.maxDex !== undefined
    ? Math.min(mods.dex, equippedArmor.maxDex)
    : mods.dex;

  // Armor replaces your heroic level bonus to Reflex Defense — even when it is lower.
  // Armored Defense lets you keep whichever is higher; the improved version adds half
  // the armor bonus on top of your heroic level. Both require proficiency.
  const armorRef = equippedArmor?.reflex ?? 0;
  const hasArmoredDefense = armorProficient && hasFeature(features, 'armored-defense');
  const hasImprovedArmoredDefense = armorProficient && hasFeature(features, 'improved-armored-defense');
  let reflexBase = level;
  let reflexBaseLabel = 'heroic level';
  if (equippedArmor) {
    if (hasImprovedArmoredDefense) {
      const withHalf = level + Math.floor(armorRef / 2);
      reflexBase = Math.max(withHalf, armorRef);
      reflexBaseLabel = withHalf >= armorRef ? 'heroic level + ½ armor' : 'armor';
    } else if (hasArmoredDefense) {
      reflexBase = Math.max(armorRef, level);
      reflexBaseLabel = armorRef >= level ? 'armor' : 'heroic level';
    } else {
      reflexBase = armorRef;
      reflexBaseLabel = 'armor (replaces heroic level)';
    }
  }

  // Niman: "When wielding a lightsaber, you gain a +1 bonus to your Reflex Defense and Will
  // Defense." Standing, unlike every other Lightsaber Form — the rest turn on a swift action,
  // a reaction or a Force Point — so it is the one that belongs in the defenses rather than
  // in a note. Wielding is read the way the attack list reads it: a lightsaber equipped.
  const wieldingLightsaber = equipped
    .some(({ item }) => item.category === 'weapon' && item.group === 'lightsabers');
  const niman = wieldingLightsaber && hasFeature(features, 'niman') ? 1 : 0;

  const reflex = 10 + reflexBase + classRef + dexToReflex + sizeRef + conditionPenalty + niman
    + sumParts(itemDefenses.reflex);
  // Droids apply Strength to Fortitude Defense, since they have no Constitution.
  const fortAbility = droid ? 'str' as const : 'con' as const;
  const fortitude = 10 + level + classFort + mods[fortAbility] + (equippedArmor?.fortitude ?? 0)
    + conditionPenalty + sumParts(itemDefenses.fortitude);
  const will = 10 + level + classWill + mods.wis + conditionPenalty + niman
    + sumParts(itemDefenses.will);
  const flatFooted = reflex - Math.max(0, dexToReflex);

  const defenseBreakdown: Record<'reflex' | 'fortitude' | 'will', DefensePart[]> = {
    reflex: [
      { label: 'base', value: 10 },
      { label: reflexBaseLabel, value: reflexBase },
      { label: 'class bonus', value: classRef },
      {
        label: `Dex${equippedArmor && mods.dex > dexToReflex ? ' (capped by armor)' : ''}`,
        value: dexToReflex,
      },
      { label: 'size', value: sizeRef },
      { label: 'Niman (lightsaber)', value: niman },
      ...itemDefenses.reflex,
      { label: 'condition track', value: conditionPenalty },
    ],
    fortitude: [
      { label: 'base', value: 10 },
      { label: 'heroic level', value: level },
      { label: 'class bonus', value: classFort },
      { label: droid ? 'Str (droid)' : 'Con', value: mods[fortAbility] },
      { label: 'armor', value: equippedArmor?.fortitude ?? 0 },
      ...itemDefenses.fortitude,
      { label: 'condition track', value: conditionPenalty },
    ],
    will: [
      { label: 'base', value: 10 },
      { label: 'heroic level', value: level },
      { label: 'class bonus', value: classWill },
      { label: 'Wis', value: mods.wis },
      { label: 'Niman (lightsaber)', value: niman },
      ...itemDefenses.will,
      { label: 'condition track', value: conditionPenalty },
    ],
  };

  const dtBonus = countFeature(features, 'improved-damage-threshold') * 5;
  const damageThreshold = fortitude + sizeDt + dtBonus;

  // ---- what you can carry ----
  // Limits are the square of the Strength score, scaled by size.
  const carrySize = RULES.carryingCapacity.sizeMultiplier[size] ?? 1;
  const strScore = abilities.str;
  const capacity = {
    heavy: (strScore * 0.5) ** 2 * carrySize,
    strain: strScore ** 2 * 0.5 * carrySize,
    maximum: strScore ** 2 * carrySize,
  };
  const load: LoadLevel = carriedWeight >= capacity.maximum ? 'overloaded'
    : carriedWeight >= capacity.strain ? 'strained'
      : carriedWeight >= capacity.heavy ? 'heavy'
        : 'normal';
  const overHeavy = load !== 'normal';
  const heavyLoadSkills = new Set(RULES.carryingCapacity.heavyLoadSkills);

  // ---- skills ----
  const classSkills = new Set<string>();
  // Only your first class contributes its class skill list.
  const firstClass = char.levels[0] ? CLASSES[char.levels[0].classId] : null;
  for (const s of firstClass?.classSkills ?? []) classSkills.add(s);
  for (const r of features) {
    for (const s of featureOf(r)?.grants?.classSkills ?? []) classSkills.add(s);
  }

  const grantedTrained = new Set<string>();
  for (const r of features) {
    for (const s of featureOf(r)?.grants?.trainedSkills ?? []) grantedTrained.add(s);
    // Skill Training makes an additional skill a trained skill.
    if (r.id === 'skill-training' && r.spec) grantedTrained.add(r.spec);
  }

  const halfLevel = Math.floor(level / 2);
  const skills: DerivedSkill[] = Object.values(SKILLS).map(sk => {
    const trained = char.trainedSkills.includes(sk.id) || grantedTrained.has(sk.id);
    const focused = hasFeature(features, 'skill-focus', sk.id);
    const sizeMod = sk.id === 'stealth' ? (RULES.sizeModifiers.stealth[size] ?? 0) : 0;
    const pen = sk.armorCheck ? armorPenalty : 0;
    // Carrying a heavy load hampers the skills that need you to move freely.
    const loadPenalty = overHeavy && heavyLoadSkills.has(sk.id)
      ? RULES.carryingCapacity.heavyLoadPenalty : 0;
    const total = halfLevel + mods[sk.modifier] + (trained ? 5 : 0) + (focused ? 5 : 0)
      + sizeMod + pen + loadPenalty + condition.checks;
    const parts = [
      { label: 'half character level', value: halfLevel },
      { label: `${sk.modifier.toUpperCase()} modifier`, value: mods[sk.modifier] },
      { label: 'trained', value: trained ? 5 : 0 },
      { label: 'Skill Focus', value: focused ? 5 : 0 },
      { label: 'size', value: sizeMod },
      { label: 'armor check penalty', value: pen },
      { label: 'heavy load', value: loadPenalty },
      { label: 'condition track', value: condition.checks },
    ];
    return {
      id: sk.id, name: sk.name, ability: sk.modifier, trained, focused,
      classSkill: classSkills.has(sk.id), armorPenalty: pen, sizeMod, total, parts,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const trainedSkillsAllowed = firstClass
    ? (firstClass.baseSkills ?? 0) + mods.int + (speciesGrantsBonusSkill(char, species) ? 1 : 0)
    : 0;

  // ---- force / destiny points ----
  const lastClass = char.levels.length ? CLASSES[char.levels[char.levels.length - 1].classId] : null;
  const fpBase = lastClass?.forcePoints ?? 5;
  // Droids have no connection to the Force, so no Force Points.
  let forcePoints = droid ? 0 : (level ? fpBase + halfLevel : 0);
  if (!droid && hasFeature(features, 'force-boon')) forcePoints += 3;

  // A droid's speed comes from its locomotion system and size.
  let baseSpeed = species?.speed ?? 6;
  if (droid) {
    const loco = droidSystems(char).find(sy => sy.category === 'locomotion' && DROIDS.speeds[sy.id]);
    const locoId = loco?.id ?? dSize?.locomotion ?? 'walking';
    baseSpeed = DROIDS.speeds[locoId]?.[size] ?? DROIDS.speeds.walking[size] ?? 6;
  }
  const conditionSpeed = Math.floor(baseSpeed * condition.speedFactor);
  // A heavy load slows you to three quarters, straining stops you at a single square,
  // and past your maximum you cannot move at all.
  const speed = load === 'overloaded' ? 0
    : load === 'strained' ? Math.min(1, conditionSpeed)
      : load === 'heavy' ? Math.floor(conditionSpeed * 3 / 4)
        : conditionSpeed;
  const carrying: Carrying = {
    weight: carriedWeight,
    heavy: capacity.heavy,
    strain: capacity.strain,
    maximum: capacity.maximum,
    level: load,
    speed,
    penalisedSkills: overHeavy ? RULES.carryingCapacity.heavyLoadSkills : [],
  };
  // ---- languages ----
  // Your species' languages come free; an Intelligence bonus buys that many more.
  const automaticLanguages = species?.languages ?? [];
  const languages = {
    automatic: automaticLanguages,
    chosen: char.languages.filter(l => !automaticLanguages.includes(l)),
    allowed: Math.max(0, mods.int),
  };

  const secondWind = Math.max(Math.floor(maxHitPoints / 4), abilities[fortAbility]);

  return {
    level, abilities, mods, speciesMods, classLevels, baseAttackBonus,
    maxHitPoints, hitPointBreakdown,
    defenses: { reflex, fortitude, will, flatFooted },
    defenseBreakdown, damageThreshold, size, speed, carrying, languages,
    forcePoints, destinyPoints: char.destinyPoints,
    skills, trainedSkillsAllowed, classSkills,
    features,
    feats: ofType('feat'),
    talents: ofType('talent'),
    forcePowers: ofType('force-power'),
    forceTechniques: ofType('force-technique'),
    forceSecrets: ofType('force-secret'),
    starshipManeuvers: ofType('starship-maneuver'),
    equippedArmor, armorProficient, armorPenalty,
    conditionPenalty, secondWind, forceSensitive,
    isDroid: droid,
    droidSystems: droid ? droidSystems(char) : [],
    droidCostFactor: dSize?.costFactor ?? 1,
    forceTrainingCount: forceTraining.length, forcePowersPerTraining: powersPerTraining,
    slots, unfilledSlots,
  };
}

/** Average hit points for a die, the usual "take the average" convention (d10 -> 6). */
export const defaultHitDieValue = (die: number) => Math.floor(die / 2) + 1;
