import type { EquipmentItem, Feature } from '../types';
import { WEAPON_GROUPS, damageLabel } from '../data';

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
