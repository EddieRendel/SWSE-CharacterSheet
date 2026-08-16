import type { Feature, FeatureRef } from '../types';
import { FEATURES, SKILLS, WEAPON_GROUPS, EQUIPMENT, TALENT_TREES } from '../data';
import type { Derived } from './engine';

export interface SpecOption {
  id: string;
  name: string;
}

const named = (refs: FeatureRef[]): SpecOption[] => {
  const seen = new Set<string>();
  return refs
    .filter(r => FEATURES[r.id] && !seen.has(r.id) && (seen.add(r.id), true))
    .map(r => ({ id: r.id, name: FEATURES[r.id].name }));
};

const byName = (a: SpecOption, b: SpecOption) => a.name.localeCompare(b.name);

/**
 * The specializations a feature can be taken with — the weapon group for Weapon Focus,
 * the skill for Skill Focus, the lightsaber form for Stolen Form. Returns an empty list
 * for features that take no specialization.
 */
export function specOptionsFor(feature: Feature | undefined, derived: Derived): SpecOption[] {
  switch (feature?.specType) {
    case 'weapon-group':
      return (feature.allowedSpecs ?? Object.keys(WEAPON_GROUPS))
        .map(id => ({ id, name: WEAPON_GROUPS[id] ?? id }));
    case 'skill':
      return Object.values(SKILLS)
        // "Choose one Trained Skill" — an untrained one is not on offer.
        .filter(s => !feature.specTrained || derived.skills.find(d => d.id === s.id)?.trained)
        .map(s => ({ id: s.id, name: s.name }));
    case 'force-power':
      // You can only deepen a power you already know.
      return named(derived.forcePowers).sort(byName);
    case 'force-technique':
      return named(derived.forceTechniques).sort(byName);
    case 'force-secret':
      return named(derived.forceSecrets).sort(byName);
    case 'talent': {
      // Either a talent you already have, or any from the trees the rules name.
      const fromTrees = (feature.specTrees ?? [])
        .flatMap(t => TALENT_TREES[t]?.features ?? []);
      const pool = feature.specHeld
        ? derived.talents.filter(r => fromTrees.some(o => o.id === r.id))
        : fromTrees;
      return named(pool).sort(byName);
    }
    case 'weapon':
      return Object.values(EQUIPMENT)
        .filter(i => i.category === 'weapon'
          && (!feature.specWeaponGroup || i.group === feature.specWeaponGroup))
        .map(i => ({ id: i.id, name: i.name }))
        .sort(byName);
    case 'option':
      return feature.specOptions ?? [];
    default:
      return [];
  }
}

/**
 * Spec kinds whose options are features in their own right, with their own rules text and
 * their own prerequisites. A weapon group or a skill is just a name; the talent behind
 * Stolen Form is a whole entry, and both the prerequisite check and the picker have to go
 * one level down to it.
 */
export const PICKS_A_FEATURE = new Set<string>(['talent', 'force-power', 'force-technique', 'force-secret']);

/** What to call the choice in the picker. */
export const SPEC_LABELS: Record<NonNullable<Feature['specType']>, string> = {
  'weapon-group': 'Weapon group',
  weapon: 'Weapon',
  skill: 'Skill',
  'force-power': 'Force power',
  'force-technique': 'Force technique',
  'force-secret': 'Force secret',
  talent: 'Talent',
  option: 'Option',
};

/** The weapon group a specialization belongs to, for proficiency checks. */
export const groupOfSpec = (spec: string): string | undefined =>
  spec in WEAPON_GROUPS ? spec : EQUIPMENT[spec]?.group;
