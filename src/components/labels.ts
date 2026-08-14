import type { EquipmentItem, Feature, ItemUpgrade } from '../types';
import type { ReqKind } from '../rules/prereqs';
import { WEAPON_GROUPS, damageLabel, TALENT_TREES, CLASSES, FORCE_TALENT_TREES } from '../data';

/**
 * The parts of the UI that are values rather than components.
 *
 * They live here instead of in `ui.tsx` because a module that exports both components and
 * plain values breaks React Fast Refresh — the whole file remounts on every edit instead of
 * hot-swapping the component.
 */

/**
 * Descriptors carried by Force powers. They matter at the table: dark side powers
 * add to your Dark Side Score, lightsaber forms interact with form talents, and
 * telekinetic / mind-affecting powers are targeted by specific defences.
 */
export const DESCRIPTORS: { key: keyof Feature; label: string; cls: string }[] = [
  { key: 'darkSide', label: 'dark side', cls: 'red' },
  { key: 'lightSide', label: 'light side', cls: 'blue' },
  { key: 'lightsaberForm', label: 'lightsaber form', cls: 'accent' },
  { key: 'telekinetic', label: 'telekinetic', cls: 'purple' },
  { key: 'mindAffecting', label: 'mind-affecting', cls: 'green' },
];

export const descriptorsOf = (feature: Feature) => DESCRIPTORS.filter(d => feature[d.key]);

/**
 * The tag shown against a prerequisite. "Armor Specialist" alone does not tell you whether to
 * look in the feats list or in a talent tree, and the two are obtained in entirely different
 * ways, so each line says which. Colours follow the rest of the sheet: talents purple, feats
 * blue, anything Force-related green.
 */
export const REQ_TAGS: Record<ReqKind, { label: string; cls: string } | null> = {
  feat: { label: 'feat', cls: 'blue' },
  talent: { label: 'talent', cls: 'purple' },
  trait: { label: 'species trait', cls: '' },
  'force-power': { label: 'Force power', cls: 'green' },
  'force-technique': { label: 'Force technique', cls: 'green' },
  'force-secret': { label: 'Force secret', cls: 'green' },
  'starship-maneuver': { label: 'maneuver', cls: 'blue' },
  ability: { label: 'ability score', cls: 'accent' },
  skill: { label: 'skill', cls: 'accent' },
  species: { label: 'species', cls: '' },
  size: { label: 'size', cls: '' },
  'dark-side': { label: 'dark side', cls: 'red' },
  choice: { label: 'any of', cls: '' },
  // Nothing worth adding — "Base attack bonus +9" and "Character level 7" already name
  // themselves, and there is no question of where to go and get either.
  attack: null,
  level: null,
  other: null,
};

/**
 * Where a talent can be picked up: the tree it sits in, and the classes that draw on that
 * tree. A prerequisite naming a talent is otherwise a dead end — the tree is the only route
 * to it, and which class offers the tree decides whether it is open to you at all.
 *
 * `universal` means one of the six trees Force Sensitivity opens to anybody, which is a
 * narrower thing than the tree's own `force` flag: the Force-tradition trees carry that flag
 * too, and those are hidden, so a talent listed in Dathomiri Witch is not a talent this app
 * can offer you. Such a route is reported as unsupported rather than as a way in.
 */
export function talentSources(featureId: string) {
  return Object.values(TALENT_TREES)
    .filter(t => t.features?.some(f => f.id === featureId))
    .map(t => ({
      tree: t.name,
      universal: FORCE_TALENT_TREES.includes(t.id),
      unsupported: !!t.hidden,
      reason: t.hiddenReason,
      classes: Object.values(CLASSES)
        .filter(c => c.trees?.talent?.includes(t.id))
        .map(c => c.name),
    }));
}

/**
 * The item's line from the equipment tables, as label/value pairs. Shared so the hover
 * card and the full dialog can never disagree about a number.
 */
export function itemStatRows(item: EquipmentItem): [string, string][] {
  const stats: [string, string | undefined][] = [
    // Says "varies" or "No damage" rather than dropping the row, so a weapon the compendium
    // gives no dice for does not look like an oversight. The prose below explains which.
    ['Damage', damageLabel(item) && `${damageLabel(item)}${item.stun ? ' (stun setting)' : ''}`],
    // Only present when the stun dice differ from the normal ones.
    ['On stun', item.stunDamage],
    ['Group', item.group ? WEAPON_GROUPS[item.group] ?? item.group : undefined],
    ['Rate of fire', item.rateOfFire],
    ['Area', item.area],
    ['Delay', item.delay],
    ['Thrown', item.thrown ? 'ranged attack, Strength on damage' : undefined],
    ['Reflex', item.reflex ? `+${item.reflex}` : undefined],
    ['Fortitude', item.fortitude ? `+${item.fortitude}` : undefined],
    ['Max Dex', item.maxDex !== undefined ? `+${item.maxDex}` : undefined],
    ['Armor', item.armorType],
    ['Size', item.size],
    ['Cost', item.cost ? `${item.cost.toLocaleString()} cr` : undefined],
    ['Weight', item.weight ? `${item.weight} kg` : undefined],
  ];
  return stats.filter((s): s is [string, string] => Boolean(s[1]));
}

/**
 * What one modification fitted to an item does, as short phrases. Shared by the hover
 * card and the full entry so neither can describe an upgrade the other does not.
 */
export function upgradeEffects(u: ItemUpgrade): string[] {
  const parts: string[] = [];
  const add = (n: number | undefined, label: string) => {
    if (n) parts.push(`${n > 0 ? '+' : ''}${n} ${label}`);
  };
  add(u.attack, 'attack');
  add(u.damage, 'damage');
  if (u.damageDice?.trim()) parts.push(`+${u.damageDice.trim()} damage`);
  add(u.reflexDefense, 'Reflex');
  add(u.fortitudeDefense, 'Fortitude');
  add(u.willDefense, 'Will');
  add(u.weight, 'kg');
  add(u.cost, 'credits');
  return parts;
}
