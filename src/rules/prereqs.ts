import type { Character, FeatureRef, Requirements, AbilityId } from '../types';
import {
  CLASSES, FEATURES, SKILLS, SPECIES, WEAPON_GROUPS, TALENT_TREES, RULES, specName, FORCE_TALENT_TREES,
} from '../data';
import { countFeature, hasFeature } from './engine';
import type { Derived } from './engine';
import { specOptionsFor, groupOfSpec } from './specs';

export interface ReqCheck {
  text: string;
  met: boolean;
}

export interface ReqResult {
  met: boolean;
  checks: ReqCheck[];
}

const ABILITY_NAMES: Record<AbilityId, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

const refLabel = (r: FeatureRef) => {
  const name = FEATURES[r.id]?.name ?? r.id;
  return r.spec ? `${name} (${specName(r.spec, FEATURES[r.id])})` : name;
};

/**
 * Validate a requirements block.
 * `spec` is the specialization being chosen right now, used by the `matching*` rules
 * (e.g. Weapon Focus requires proficiency with the very weapon group you are picking).
 */
export function checkRequirements(
  reqs: Requirements | undefined,
  char: Character,
  derived: Derived,
  spec?: string,
): ReqResult {
  const checks: ReqCheck[] = [];
  if (!reqs) return { met: true, checks };

  const have = derived.features;

  // "Double Attack or Dual Weapon Mastery I" — one of the options is enough, and the
  // check reads as the whole choice rather than as several failures.
  for (const options of reqs.anyOf ?? []) {
    const results = options.map(o => checkRequirements(o, char, derived, spec));
    checks.push({
      text: results.map(r => r.checks.map(c => c.text).join(' and ')).join(' or '),
      met: results.some(r => r.met),
    });
  }

  for (const r of reqs.features ?? []) {
    if (r.matchingSpec) {
      // Must be held with the same specialization being chosen right now.
      const label = spec
        ? refLabel({ id: r.id, spec })
        : `${FEATURES[r.id]?.name ?? r.id} with the same specialization`;
      checks.push({ text: label, met: !!spec && hasFeature(have, r.id, spec) });
    } else {
      checks.push({ text: refLabel(r), met: hasFeature(have, r.id, r.spec) });
    }
  }

  if (reqs.species?.length) {
    const names = reqs.species.map(s => SPECIES[s]?.name ?? s);
    checks.push({
      text: `Species: ${names.join(' or ')}`,
      met: !!char.speciesId && reqs.species.includes(char.speciesId),
    });
  }

  for (const [ab, min] of Object.entries(reqs.abilities ?? {})) {
    const a = ab as AbilityId;
    // Droids have no Constitution score, so anything gated on one is out of reach.
    if (a === 'con' && derived.isDroid) {
      checks.push({ text: 'Constitution — droids have no Constitution score', met: false });
      continue;
    }
    checks.push({
      text: `${ABILITY_NAMES[a]} ${min}`,
      met: derived.abilities[a] >= (min as number),
    });
  }

  for (const s of reqs.trainedSkills ?? []) {
    checks.push({
      text: `Trained in ${SKILLS[s]?.name ?? s}`,
      met: !!derived.skills.find(k => k.id === s)?.trained,
    });
  }

  if (reqs.baseAttackBonus !== undefined) {
    checks.push({
      text: `Base attack bonus +${reqs.baseAttackBonus}`,
      met: derived.baseAttackBonus >= reqs.baseAttackBonus,
    });
  }

  if (reqs.level !== undefined) {
    checks.push({ text: `Character level ${reqs.level}`, met: derived.level >= reqs.level });
  }

  if (reqs.size !== undefined) {
    checks.push({ text: `Size ${reqs.size} or larger`, met: sizeAtLeast(derived.size, reqs.size) });
  }

  if (reqs.darkSide) {
    checks.push({
      text: 'Dark Side Score of 1 or higher',
      met: char.darkSideScore >= 1,
    });
  }

  if (reqs.talents) {
    const { count, trees, force } = reqs.talents;
    const allowed = new Set<string>([...(force ? FORCE_TALENT_TREES : []), ...(trees ?? [])]);
    // Talents count only if they come from one of the named trees.
    const eligibleIds = new Set<string>();
    for (const t of allowed) {
      for (const f of TALENT_TREES[t]?.features ?? []) eligibleIds.add(f.id);
    }
    const held = derived.talents.filter(r => eligibleIds.has(r.id)).length;
    const treeNames = Array.from(allowed).map(t => TALENT_TREES[t]?.name ?? t);
    checks.push({
      text: force && !trees?.length
        ? `${count} Force ${count === 1 ? 'talent' : 'talents'}`
        : `${count} ${count === 1 ? 'talent' : 'talents'} from ${treeNames.join(', ')}`
          + (held ? ` (you have ${held})` : ''),
      met: held >= count,
    });
  }

  if (reqs.forceTechniques !== undefined) {
    checks.push({
      text: `${reqs.forceTechniques} Force techniques`,
      met: derived.forceTechniques.length >= reqs.forceTechniques,
    });
  }

  // --- "matching" rules: constrain the specialization being selected ---
  if (reqs.matchingWeaponGroupProficiency) {
    checks.push({
      text: spec
        ? `Weapon Proficiency (${WEAPON_GROUPS[spec] ?? spec})`
        : 'Proficiency with the chosen weapon group',
      met: !!spec && hasFeature(have, 'weapon-proficiency', spec),
    });
  }
  if (reqs.matchingWeaponProficiency) {
    // The specialization here is a specific weapon, but proficiency is held by group —
    // so resolve the weapon to its group before checking.
    const group = spec ? groupOfSpec(spec) : undefined;
    checks.push({
      text: group
        ? `Weapon Proficiency (${WEAPON_GROUPS[group] ?? group})`
        : 'Proficiency with the chosen weapon',
      met: !!spec && (
        (!!group && hasFeature(have, 'weapon-proficiency', group))
        || hasFeature(have, 'exotic-weapon-proficiency', spec)
      ),
    });
  }
  if (reqs.matchingForcePower) {
    checks.push({
      text: 'You must know the chosen Force power',
      met: !!spec && have.some(r => r.id === spec),
    });
  }
  if (reqs.matchingTrainedSkill) {
    checks.push({
      text: spec ? `Trained in ${SKILLS[spec]?.name ?? spec}` : 'Trained in the chosen skill',
      met: !!spec && !!derived.skills.find(k => k.id === spec)?.trained,
    });
  }
  if (reqs.matchingUntrainedSkill) {
    checks.push({
      text: spec ? `Not already trained in ${SKILLS[spec]?.name ?? spec}` : 'The chosen skill must be untrained',
      met: !!spec && !derived.skills.find(k => k.id === spec)?.trained,
    });
  }
  if (reqs.matchingClassSkill) {
    checks.push({
      text: spec ? `${SKILLS[spec]?.name ?? spec} must be a class skill` : 'The chosen skill must be a class skill',
      met: !!spec && derived.classSkills.has(spec),
    });
  }

  return { met: checks.every(c => c.met), checks };
}

// The one size ladder lives in rules.json; attacks.ts reads the same array to decide
// what a weapon is light enough to finesse and heavy enough to need both hands.
const sizeAtLeast = (actual: string, min: string) =>
  RULES.sizes.indexOf(actual) >= RULES.sizes.indexOf(min);

/** Can this feature be taken again, given what the character already has? */
export function canTakeAgain(featureId: string, have: FeatureRef[], spec?: string): boolean {
  const f = FEATURES[featureId];
  if (!f) return false;
  // Force Training states outright that you may add the same power to your suite
  // more than once, so Force powers never count as duplicates.
  if (f.type === 'force-power') return true;
  const count = countFeature(have, featureId, f.specType ? spec : undefined);
  if (count === 0) return true;
  if (!f.multiple) return false;
  if (f.maxCount !== undefined) return countFeature(have, featureId) < f.maxCount;
  return true;
}

export interface SelectResult extends ReqResult {
  duplicate: boolean;
  /** True when this feature requires a specialization to be picked. */
  needsSpec: boolean;
  /** Specializations that would actually satisfy the requirements. */
  viableSpecs: string[];
}

const DROID_FORBIDDEN = new Set(['force-sensitivity', 'force-training', 'force-boon']);

/** Spec kinds whose options are features in their own right, with their own prerequisites. */
const PICKS_A_FEATURE = new Set(['talent', 'force-power', 'force-technique', 'force-secret']);

/**
 * Full eligibility for selecting a feature into a slot.
 *
 * When a feature takes a specialization and none has been chosen yet, it counts as
 * available if *any* specialization would qualify — not having picked one yet is not
 * a reason to lock it. Weapon Focus is open to anyone proficient with at least one
 * weapon group, and only locked for someone proficient with none.
 */
export function canSelect(
  featureId: string,
  char: Character,
  derived: Derived,
  spec?: string,
): SelectResult {
  const f = FEATURES[featureId];
  if (!f) return { met: false, checks: [], duplicate: false, needsSpec: false, viableSpecs: [] };

  // Droids have no connection to the Force.
  if (derived.isDroid && (DROID_FORBIDDEN.has(featureId) || f.type === 'force-power'
      || f.type === 'force-technique' || f.type === 'force-secret')) {
    return {
      met: false, duplicate: false, needsSpec: false, viableSpecs: [],
      checks: [{ text: 'Droids have no connection to the Force', met: false }],
    };
  }

  const options = specOptionsFor(f, derived);
  const needsSpec = options.length > 0;

  // "Choose one Talent from the Lightsaber Forms Talent Tree… You must meet all the
  // prerequisites as normal for the chosen Talent." A form you could not take on its
  // own is not one you can steal, so the option carries its own requirements too.
  const optionAllowed = (optionId: string) =>
    !PICKS_A_FEATURE.has(f.specType ?? '')
    || checkRequirements(FEATURES[optionId]?.requirements, char, derived).met;

  // A specialization has been chosen, or the feature takes none: check it directly.
  if (!needsSpec || spec !== undefined) {
    const result = checkRequirements(f.requirements, char, derived, spec);
    const duplicate = !canTakeAgain(featureId, derived.features, spec);
    const optionMet = spec === undefined || optionAllowed(spec);
    return {
      ...result,
      checks: optionMet ? result.checks : [
        ...result.checks,
        { text: `Prerequisites for ${FEATURES[spec!]?.name ?? spec}`, met: false },
      ],
      duplicate,
      met: result.met && !duplicate && optionMet,
      needsSpec,
      viableSpecs: needsSpec && spec !== undefined ? [spec] : [],
    };
  }

  // No specialization chosen yet — find the ones that would work.
  const viableSpecs = options
    .filter(o =>
      checkRequirements(f.requirements, char, derived, o.id).met
      && optionAllowed(o.id)
      && canTakeAgain(featureId, derived.features, o.id))
    .map(o => o.id);

  // Report against a viable specialization when there is one, so the checks list reads
  // as satisfied; otherwise against the first option, to show a representative failure.
  const probe = viableSpecs[0] ?? options[0].id;
  const result = checkRequirements(f.requirements, char, derived, probe);

  // Only a duplicate if every specialization has already been taken.
  const duplicate = viableSpecs.length === 0
    && options.every(o => !canTakeAgain(featureId, derived.features, o.id));

  return {
    ...result,
    duplicate,
    met: viableSpecs.length > 0,
    needsSpec,
    viableSpecs,
  };
}

/** Prestige class entry requirements. */
export function checkClassRequirements(classId: string, char: Character, derived: Derived): ReqResult {
  return checkRequirements(CLASSES[classId]?.requirements, char, derived);
}
