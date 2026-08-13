import type { Character } from '../types';
import type { Derived } from '../rules/engine';
import { abilityIncreaseLevels } from '../rules/engine';
import { lapsedSelections } from '../rules/prereqs';

/**
 * What a level still owes the player, shared between the Edit page and the tab badge.
 *
 * Kept out of EditCharacter.tsx because a module that exports both components and plain
 * functions breaks React Fast Refresh — the page would remount on every edit.
 */

/**
 * Choices that are now wrong rather than merely missing. Removing the level that raised
 * Intelligence is the usual cause: the allowances shrink, but the skills and languages
 * already picked stay put. Changing an earlier feat or talent does the same to any later
 * pick that named it as a prerequisite.
 */
export const hasConflicts = (char: Character, derived: Derived) =>
  char.trainedSkills.length > derived.trainedSkillsAllowed
  || derived.languages.chosen.length > derived.languages.allowed
  || lapsedSelections(char, derived).length > 0;

/**
 * Everything a level still owes the character: unfilled slots, unassigned ability
 * increases, and untrained skills.
 */
export function outstandingCount(char: Character, derived: Derived): number {
  if (!char.levels.length) return 0;
  const increases = abilityIncreaseLevels(derived.level)
    .reduce((n, level) => n + (2 - (char.abilityIncreases[level] ?? []).length), 0);
  // Absolute, so having too many counts as something to deal with just as having too few does.
  return derived.unfilledSlots.length
    + Math.max(0, increases)
    + Math.abs(derived.trainedSkillsAllowed - char.trainedSkills.length)
    + Math.abs(derived.languages.allowed - derived.languages.chosen.length);
}
