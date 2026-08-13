import type { Character, EquipmentItem } from '../types';
import { WEAPON_GROUPS, EQUIPMENT, FEATURES, RULES } from '../data';
import { countFeature, hasFeature, getItem } from './engine';
import type { Derived } from './engine';

/** Situational choices the player makes before rolling. */
export interface AttackOptions {
  /** Power Attack: points traded from attack to damage, capped at base attack bonus. */
  powerAttack: number;
  /** Wielding the weapon in two hands — doubles the Strength bonus to damage. */
  twoHanded: boolean;
  /** Target within point blank range. */
  pointBlank: boolean;
  /** Aimed this turn, for Careful Shot and Deadeye. */
  aim: boolean;
  /** Target flat-footed or denied its Dexterity bonus, for Sneak Attack. */
  flatFooted: boolean;
  /** Using the full attack action, which enables Double/Triple Attack. */
  fullAttack: boolean;
  /** Weapons with a stun setting switched to it — a swift action either way. */
  stunSetting: boolean;
  /**
   * A weapon in each hand, or both ends of a double weapon. Only possible as part of a
   * full attack, and it costs every attack roll this turn — see twoWeaponPenalty.
   */
  twoWeapon: boolean;
  /** Rapid Shot: two shots as one attack. */
  rapidShot: boolean;
  /** Burst Fire: an autofire burst as one attack. */
  burstFire: boolean;
  /**
   * Situational bonuses, keyed by the feature that grants them.
   * 0 means off; otherwise it is the 1-based tier chosen (always 1 for simple on/off).
   */
  situational: Record<string, number>;
}

/**
 * Talents, feats and Force powers that grant a clearly-defined bonus to attack or damage
 * under a condition the app cannot know about. Each becomes a toggle when the character
 * has the feature. Adding another is one entry here.
 */
export interface Situational {
  id: string;
  label: string;
  hint: string;
  scope: 'melee' | 'ranged' | 'any';
  attack?: number;
  damage?: number;
  /** Extra dice rolled alongside the weapon's own, e.g. Battle Strike's 1d6. */
  extraDice?: string;
  /** Where the bonus varies, usually by a Use the Force check. */
  tiers?: { label: string; attack?: number; damage?: number; extraDice?: string }[];
}

export const SITUATIONAL: Situational[] = [
  {
    id: 'dark-rage', label: 'Dark Rage', scope: 'melee',
    hint: 'Force power: rage bonus to melee attack and damage, by Use the Force check',
    tiers: [
      { label: 'DC 15 (+2)', attack: 2, damage: 2 },
      { label: 'DC 20 (+4)', attack: 4, damage: 4 },
      { label: 'DC 25 (+6)', attack: 6, damage: 6 },
    ],
  },
  {
    id: 'battle-strike', label: 'Battle Strike', scope: 'any',
    hint: 'Force power: +1 attack and extra damage dice, by Use the Force check',
    tiers: [
      { label: 'DC 15 (+1d6)', attack: 1, extraDice: '1d6' },
      { label: 'DC 20 (+2d6)', attack: 1, extraDice: '2d6' },
      { label: 'DC 25 (+3d6)', attack: 1, extraDice: '3d6' },
    ],
  },
  { id: 'rage', label: 'Rage', scope: 'melee', attack: 2, damage: 2,
    hint: 'Species trait: +2 to melee attack and damage while raging' },
  { id: 'skirmisher', label: 'Skirmisher', scope: 'any', attack: 1,
    hint: 'Moved at least 2 squares and ended somewhere new' },
  { id: 'powerful-charge', label: 'Powerful Charge', scope: 'melee', attack: 2,
    hint: 'Charging — also deals extra damage equal to half your level' },
  { id: 'flurry', label: 'Flurry', scope: 'melee', attack: 2,
    hint: 'Light weapons or lightsabers only; costs 5 Reflex Defense' },
  { id: 'cunning-attack', label: 'Cunning Attack', scope: 'any', attack: 2,
    hint: 'Target flat-footed or denied its Dexterity bonus' },
  { id: 'sniper-shot', label: 'Sniper Shot', scope: 'ranged', attack: 2,
    hint: 'Proficient weapons only; costs 5 Reflex Defense' },
  { id: 'deadly-sniper', label: 'Deadly Sniper', scope: 'ranged', attack: 2,
    hint: 'Target unaware of you — first attack each turn' },
  { id: 'cornered', label: 'Cornered', scope: 'any', attack: 2,
    hint: 'Threatened and unable to withdraw' },
  { id: 'justice-seeker', label: 'Justice Seeker', scope: 'any', damage: 2,
    hint: 'Target damaged an ally since the end of your last turn' },
  { id: 'droid-hunter', label: 'Droid Hunter', scope: 'any', damage: 2,
    hint: 'Against droid enemies' },
];

export const defaultAttackOptions = (): AttackOptions => ({
  powerAttack: 0, twoHanded: false, pointBlank: false, aim: false,
  flatFooted: false, fullAttack: false, twoWeapon: false, stunSetting: false,
  rapidShot: false, burstFire: false, situational: {},
});

/** Dual Weapon Mastery I also reaches characters as a species trait. */
const DWM = {
  i: ['dual-weapon-mastery-i', 'dual-weapon-mastery-i-trait'],
  ii: ['dual-weapon-mastery-ii'],
  iii: ['dual-weapon-mastery-iii'],
};
const hasAny = (have: { id: string }[], ids: string[]) => ids.some(id => hasFeature(have, id));

/**
 * Fighting with two weapons costs −10 on every attack roll until the start of your next
 * turn. Dual Weapon Mastery buys that down to −5, then −2, then nothing — but each tier
 * says the reduced penalty applies only while wielding a weapon you are proficient with,
 * so without proficiency the full −10 stands however many tiers you hold.
 */
export function twoWeaponPenalty(
  have: { id: string }[],
  proficient: boolean,
): { value: number; label: string } {
  if (!proficient) return { value: -10, label: 'two weapons (not proficient)' };
  if (hasAny(have, DWM.iii)) return { value: 0, label: 'two weapons (Dual Weapon Mastery III)' };
  if (hasAny(have, DWM.ii)) return { value: -2, label: 'two weapons (Dual Weapon Mastery II)' };
  if (hasAny(have, DWM.i)) return { value: -5, label: 'two weapons (Dual Weapon Mastery I)' };
  return { value: -10, label: 'two weapons' };
}

/** The best Dual Weapon Mastery tier held, for tips. '' when the character has none. */
export const dualWeaponMasteryId = (have: { id: string }[]) =>
  [...DWM.iii, ...DWM.ii, ...DWM.i].find(id => hasFeature(have, id)) ?? '';

/**
 * Whether a weapon takes both hands, which is what doubles the Strength bonus to damage
 * and Power Attack's damage.
 *
 * Saga Edition ties this to size: a weapon a category larger than you needs two hands. The
 * data carries a `twoHanded` flag but only on 15 of 241 weapons — six of them melee — while
 * 49 Large weapons go unflagged, so the flag alone would miss the Power Hammer, Wan-Shen,
 * Vibrosword and two dozen others. Taking the flag first and falling back to size covers
 * both, and scales with the wielder: a Medium weapon is two-handed for a Small character.
 *
 * Wookiee Grip lifts the requirement — you need only one hand for weapons that normally
 * take two.
 */
/**
 * A weapon a size category smaller than you is a Light Weapon — the other end of the ladder
 * that makes a larger one take both hands. Weapon Finesse names "a Light Melee Weapon or a
 * Lightsaber" separately precisely because a lightsaber is your own size, so it is not light.
 */
export function isLightWeapon(weapon: EquipmentItem, wielderSize: string): boolean {
  const ladder = RULES.sizes;
  const w = ladder.indexOf(weapon.size ?? '');
  const c = ladder.indexOf(wielderSize);
  return w >= 0 && c >= 0 && w < c;
}

export function needsTwoHands(
  weapon: EquipmentItem,
  wielderSize: string,
  have: { id: string }[],
): boolean {
  if (hasFeature(have, 'wookiee-grip')) return false;
  if (weapon.twoHanded === true) return true;
  const ladder = RULES.sizes;
  const w = ladder.indexOf(weapon.size ?? '');
  const c = ladder.indexOf(wielderSize);
  // An unrecognised size is left alone rather than guessed at.
  return w >= 0 && c >= 0 && w > c;
}

export interface Part { label: string; value: number }

export interface AttackProfile {
  weapon: EquipmentItem;
  melee: boolean;
  proficient: boolean;
  attack: number;
  attackParts: Part[];
  /** Weapon dice plus any extra dice, e.g. "3d8 + 2d6". */
  damageDice: string;
  /** Where those dice come from, so the total can be read rather than trusted. */
  diceParts: { label: string; dice: string }[];
  damageBonus: number;
  damageParts: Part[];
  /** Number of attacks and the penalty when taking a full attack action. */
  fullAttack: { attacks: number; penalty: number } | null;
  notes: string[];
  /** Feats and talents that affect this weapon but are not applied automatically. */
  unapplied: string[];
}

/** Martial Arts steps unarmed damage up one die at a time. */
const DIE_STEPS = ['1d3', '1d4', '1d6', '1d8', '1d10', '1d12'];
export function unarmedDamage(have: { id: string }[], base = '1d4'): string {
  let i = Math.max(0, DIE_STEPS.indexOf(base));
  for (const feat of ['martial-arts-i', 'martial-arts-ii', 'martial-arts-iii']) {
    if (have.some(r => r.id === feat)) i = Math.min(i + 1, DIE_STEPS.length - 1);
  }
  return DIE_STEPS[i];
}

const MELEE_GROUPS = new Set(['simple-weapons', 'advanced-melee-weapons', 'lightsabers', 'exotic-weapons']);
const isMelee = (w: EquipmentItem) => !w.rateOfFire && MELEE_GROUPS.has(w.group ?? '');

/** Add `n` dice of the weapon's own size, e.g. 3d8 + 2 dice -> 5d8. */
function addWeaponDice(damage: string | undefined, extra: number): string {
  if (!damage || extra <= 0) return damage ?? '—';
  const m = damage.match(/^(\d+)d(\d+)/);
  if (!m) return damage;
  return damage.replace(/^\d+d\d+/, `${Number(m[1]) + extra}d${m[2]}`);
}

/**
 * Everything the character has that touches attacks with this weapon but which the
 * app does not model automatically — surfaced so nothing silently goes missing.
 */
const AUTOMATIC = new Set([
  'weapon-focus', 'greater-weapon-focus', 'weapon-specialization', 'greater-weapon-specialization',
  'melee-smash', 'point-blank-shot', 'careful-shot', 'deadeye', 'sneak-attack', 'power-attack',
  'double-attack', 'triple-attack', 'rapid-shot', 'burst-fire', 'weapon-proficiency',
  'exotic-weapon-proficiency', 'dual-weapon-mastery-i', 'dual-weapon-mastery-ii', 'dual-weapon-mastery-iii',
  'weapon-finesse', 'ataru',
]);

export function buildAttack(
  _char: Character,
  derived: Derived,
  weapon: EquipmentItem,
  opts: AttackOptions,
): AttackProfile {
  const have = derived.features;
  const group = weapon.group ?? '';
  const melee = isMelee(weapon);
  const notes: string[] = [];

  const proficient = hasFeature(have, 'weapon-proficiency', group)
    || hasFeature(have, 'exotic-weapon-proficiency', weapon.id);

  // Weapon Finesse swaps Dexterity for Strength on attack rolls with a light melee weapon
  // or a lightsaber. The feat says "may", so take whichever modifier is actually higher.
  const lightsaber = group === 'lightsabers';
  const finesse = melee && hasFeature(have, 'weapon-finesse')
    && (lightsaber || isLightWeapon(weapon, derived.size));
  const finesseAttack = finesse && derived.mods.dex > derived.mods.str;

  // ---- attack ----
  const attackParts: Part[] = [
    { label: 'base attack bonus', value: derived.baseAttackBonus },
    !melee ? { label: 'Dexterity', value: derived.mods.dex }
      : finesseAttack ? { label: 'Dexterity (Weapon Finesse)', value: derived.mods.dex }
        : { label: 'Strength', value: derived.mods.str },
  ];
  if (finesse && !finesseAttack && derived.mods.dex < derived.mods.str) {
    notes.push('Weapon Finesse could use Dexterity on the attack roll, but your Strength bonus is higher.');
  }
  if (!proficient) attackParts.push({ label: 'not proficient', value: -5 });
  if (hasFeature(have, 'weapon-focus', group)) attackParts.push({ label: 'Weapon Focus', value: 1 });
  if (hasFeature(have, 'greater-weapon-focus', group)) attackParts.push({ label: 'Greater Weapon Focus', value: 1 });
  if (derived.armorPenalty) attackParts.push({ label: 'armor', value: derived.armorPenalty });
  if (derived.conditionPenalty) attackParts.push({ label: 'condition', value: derived.conditionPenalty });

  // Power Attack is melee only and capped at your base attack bonus.
  const power = melee ? Math.max(0, Math.min(opts.powerAttack, derived.baseAttackBonus)) : 0;
  if (power) attackParts.push({ label: 'Power Attack', value: -power });
  if (power && !hasFeature(have, 'power-attack')) notes.push('You do not have the Power Attack feat.');

  if (!melee && opts.pointBlank && hasFeature(have, 'point-blank-shot')) {
    attackParts.push({ label: 'Point Blank Shot', value: 1 });
  }
  if (!melee && opts.aim && hasFeature(have, 'careful-shot')) {
    attackParts.push({ label: 'Careful Shot', value: 1 });
  }
  if (!melee && opts.rapidShot && hasFeature(have, 'rapid-shot')) {
    attackParts.push({ label: 'Rapid Shot', value: -2 });
  }
  if (!melee && opts.burstFire && hasFeature(have, 'burst-fire')) {
    attackParts.push({ label: 'Burst Fire', value: -5 });
  }

  // ---- full attack: Double and Triple Attack each add an attack and -5 to all rolls,
  // and a weapon in each hand adds one more at its own penalty ----
  let fullAttack: AttackProfile['fullAttack'] = null;
  // Two-weapon fighting is only available as part of a full attack, so asking for it is
  // asking for the action.
  if (opts.fullAttack || opts.twoWeapon) {
    let attacks = 1, twoWeapon = 0, extra = 0;

    if (opts.twoWeapon) {
      const p = twoWeaponPenalty(have, proficient);
      attacks += 1;
      twoWeapon = p.value;
      // Recorded even at 0, so the breakdown data says the penalty was considered. Tips
      // hide zero rows by convention, and with Mastery III the ×2 badge reports the net
      // penalty as +0, which is where the player sees it landed.
      attackParts.push({ label: p.label, value: p.value });
      if (!proficient && dualWeaponMasteryId(have)) {
        notes.push('Dual Weapon Mastery reduces the two-weapon penalty only with weapons you are proficient with, so the full −10 applies here.');
      }
    }

    if (hasFeature(have, 'double-attack', group)) { attacks += 1; extra -= 5; }
    if (hasFeature(have, 'triple-attack', group)) { attacks += 1; extra -= 5; }
    if (extra) attackParts.push({ label: 'full attack', value: extra });

    fullAttack = { attacks, penalty: twoWeapon + extra };
    if (attacks === 1) notes.push('Double Attack with this weapon group would grant a second attack.');
  }

  // Situational modifiers are applied further down, once damage parts exist.

  // ---- damage ----
  // Switching a weapon to its stun setting, or back, is a swift action. Most keep the same
  // dice; a few hit harder on stun, which is what stunDamage records.
  const stunMode = !!opts.stunSetting && weapon.stun === true;
  const weaponDice = (stunMode ? weapon.stunDamage ?? weapon.damage : weapon.damage);

  const extraDice: { label: string; dice: string }[] = [];
  const damageParts: Part[] = [
    { label: 'half character level', value: Math.floor(derived.level / 2) },
  ];
  // A weapon that takes two hands is always held that way, so it does not wait on the
  // toggle; a one-handed one counts only when the player says they are gripping it in two.
  // Neither is possible while holding a weapon in each hand.
  const inherent = needsTwoHands(weapon, derived.size, have);
  const bothHands = !opts.twoWeapon && (inherent || opts.twoHanded);

  // Ataru puts Dexterity on lightsaber damage in place of Strength, and says so for the
  // doubled case too — two-handed it is double Dexterity rather than double Strength. Also
  // a "may", so the higher modifier wins.
  const ataru = lightsaber && hasFeature(have, 'ataru');
  const ataruDamage = ataru && derived.mods.dex > derived.mods.str;

  if (melee) {
    const mod = ataruDamage ? derived.mods.dex : derived.mods.str;
    const ability = ataruDamage ? 'Dexterity' : 'Strength';
    const grip = inherent ? 'two-handed weapon' : 'two-handed grip';
    damageParts.push({
      label: bothHands
        ? `${ability} ×2 (${grip}${ataruDamage ? ', Ataru' : ''})`
        : ataruDamage ? 'Dexterity (Ataru)' : 'Strength',
      value: bothHands ? mod * 2 : mod,
    });
    if (ataru && !ataruDamage && derived.mods.dex < derived.mods.str) {
      notes.push('Ataru could use Dexterity on damage, but your Strength bonus is higher.');
    }
    if (opts.twoWeapon && (inherent || opts.twoHanded)) {
      notes.push('A weapon in each hand cannot also be held in two, so the doubled Strength bonus does not apply.');
    }
  }
  if (hasFeature(have, 'weapon-specialization', group)) damageParts.push({ label: 'Weapon Specialization', value: 2 });
  if (hasFeature(have, 'greater-weapon-specialization', group)) damageParts.push({ label: 'Greater Weapon Specialization', value: 2 });
  if (melee && hasFeature(have, 'melee-smash')) damageParts.push({ label: 'Melee Smash', value: 1 });
  // Power Attack's own Special clause: held in two hands, it adds twice what you gave up.
  if (power) {
    damageParts.push({
      label: bothHands ? 'Power Attack ×2 (two-handed)' : 'Power Attack',
      value: bothHands ? power * 2 : power,
    });
    if (bothHands) {
      notes.push('Power Attack adds twice the number subtracted when the weapon is held in two hands. It never applies to damage against an object or vehicle.');
    }
  }
  if (!melee && opts.pointBlank && hasFeature(have, 'point-blank-shot')) {
    damageParts.push({ label: 'Point Blank Shot', value: 1 });
  }

  // ---- extra dice: Rapid Shot, Burst Fire and Deadeye explicitly do not stack ----
  const diceOptions: { label: string; dice: number }[] = [];
  if (!melee && opts.rapidShot && hasFeature(have, 'rapid-shot')) diceOptions.push({ label: 'Rapid Shot', dice: 1 });
  if (!melee && opts.burstFire && hasFeature(have, 'burst-fire')) diceOptions.push({ label: 'Burst Fire', dice: 2 });
  if (!melee && opts.aim && hasFeature(have, 'deadeye')) diceOptions.push({ label: 'Deadeye', dice: 1 });
  const best = diceOptions.sort((a, b) => b.dice - a.dice)[0];
  if (diceOptions.length > 1) {
    notes.push(`${diceOptions.map(d => d.label).join(', ')} do not stack — using ${best.label}.`);
  }

  const diceParts: { label: string; dice: string }[] = [
    { label: stunMode ? `${weapon.name} (stun)` : weapon.name, dice: weaponDice ?? '—' },
  ];
  let damageDice = addWeaponDice(weaponDice, best?.dice ?? 0);
  if (best) {
    const die = weaponDice?.match(/d(\d+)/)?.[1];
    diceParts.push({ label: best.label, dice: `+${best.dice}d${die ?? '?'}` });
  }
  // ---- situational bonuses the player has switched on ----
  for (const mod of SITUATIONAL) {
    const tier = opts.situational?.[mod.id] ?? 0;
    if (!tier || !hasFeature(have, mod.id)) continue;
    if (mod.scope === 'melee' && !melee) continue;
    if (mod.scope === 'ranged' && melee) continue;
    const effect = mod.tiers ? mod.tiers[tier - 1] : mod;
    if (!effect) continue;
    const label = mod.tiers ? `${mod.label} (${mod.tiers[tier - 1].label})` : mod.label;
    if (effect.attack) attackParts.push({ label, value: effect.attack });
    if (effect.damage) damageParts.push({ label, value: effect.damage });
    if (effect.extraDice) extraDice.push({ label: mod.label, dice: effect.extraDice });
  }

  const sneakDice = countFeature(have, 'sneak-attack');
  if (opts.flatFooted && sneakDice) {
    damageDice += ` + ${sneakDice}d6`;
    diceParts.push({ label: 'Sneak Attack', dice: `+${sneakDice}d6` });
  }

  for (const e of extraDice) {
    damageDice += ` + ${e.dice}`;
    diceParts.push({ label: e.label, dice: `+${e.dice}` });
  }

  const attack = attackParts.reduce((n, p) => n + p.value, 0);
  const damageBonus = damageParts.reduce((n, p) => n + p.value, 0);

  // ---- anything else the character has that mentions this weapon group ----
  const unapplied: string[] = [];
  for (const ref of have) {
    if (AUTOMATIC.has(ref.id)) continue;
    if (ref.spec && ref.spec === group) {
      const name = ref.id.replace(/-/g, ' ');
      if (!unapplied.includes(name)) unapplied.push(name);
    }
  }

  if (!proficient) notes.push(`You are not proficient with ${WEAPON_GROUPS[group] ?? group}.`);
  if (stunMode) {
    notes.push('Set to stun: half the damage comes off the target’s hit points, and it moves −5 steps and falls unconscious if that reaches 0. Only creatures are affected — droids, vehicles and objects are immune. A blaster’s stun setting reaches 6 squares unless its own entry says otherwise.');
    if (weapon.stunDamage) notes.push(`Its stun setting rolls ${weapon.stunDamage} rather than ${weapon.damage}.`);
  } else if (weapon.stun) {
    notes.push(`Can be switched to stun as a swift action${weapon.stunDamage ? `, rolling ${weapon.stunDamage}` : ''}.`);
  }
  if (weapon.area) notes.push(`Area: ${weapon.area}.`);

  return {
    weapon, melee, proficient, attack, attackParts,
    damageDice, diceParts, damageBonus, damageParts, fullAttack, notes, unapplied,
  };
}

/**
 * Attack profiles for every weapon the character has drawn — the "worn" checkbox on the
 * equipment list is what puts a weapon in hand — plus unarmed strike, which is always
 * available and steps up with Martial Arts.
 */
export function buildAttacks(char: Character, derived: Derived, opts: AttackOptions): AttackProfile[] {
  const seen = new Set<string>(['unarmed']);
  const carried = char.inventory
    .filter(e => e.equipped)
    .map(e => getItem(char, e.itemId))
    .filter((w): w is EquipmentItem => {
      if (w?.category !== 'weapon' || seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    });

  const unarmed: EquipmentItem = {
    ...EQUIPMENT.unarmed,
    damage: unarmedDamage(derived.features, EQUIPMENT.unarmed?.damage ?? '1d4'),
  };
  return [...carried, unarmed].map(w => buildAttack(char, derived, w, opts));
}

// ---------------------------------------------------------------------------
// Force powers that deal damage. These are resolved with a Use the Force check
// against a defence rather than an attack roll, so they get their own profile.
// ---------------------------------------------------------------------------
export interface PowerProfile {
  id: string;
  name: string;
  /** The Use the Force modifier the check is made with. */
  useTheForce: number;
  /** Which defence the check is compared against, when the text names one. */
  versus: string | null;
  damage: string | null;
  damageType: string | null;
  /** How the Use the Force modifier is arrived at. */
  checkParts: Part[];
  /** True when the effect scales with the check result rather than being flat. */
  scales: boolean;
  descriptors: string[];
}

const DAMAGE_RE = /(\d+d\d+)\s*(?:points of\s*)?([A-Za-z]+)?\s*damage/i;
const DEFENCE_RE = /(Reflex|Fortitude|Will)\s+Defense/i;

export function buildPowers(derived: Derived): PowerProfile[] {
  const utfSkill = derived.skills.find(s => s.id === 'use-the-force');
  const utf = utfSkill?.total ?? 0;
  const out: PowerProfile[] = [];
  const seen = new Set<string>();

  for (const ref of derived.forcePowers) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    const f = FEATURES[ref.id];
    if (!f) continue;
    const text = [...(f.description ?? []), ...(f.benefit ?? []), ...(f.special ?? [])]
      .join(' ').replace(/<[^>]+>/g, ' ');
    const dmg = text.match(DAMAGE_RE);
    if (!dmg) continue;                       // only powers that actually deal damage
    const def = text.match(DEFENCE_RE);
    out.push({
      id: f.id,
      name: f.name,
      useTheForce: utf,
      checkParts: utfSkill?.parts ?? [],
      versus: def ? `${def[1]} Defense` : null,
      damage: dmg[1],
      damageType: dmg[2] && !/points/i.test(dmg[2]) ? dmg[2].toLowerCase() : null,
      scales: /DC\s*\d+/.test(text),
      descriptors: [
        ...(f.darkSide ? ['dark side'] : []),
        ...(f.lightSide ? ['light side'] : []),
        ...(f.telekinetic ? ['telekinetic'] : []),
        ...(f.mindAffecting ? ['mind-affecting'] : []),
      ],
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Force Points. Unlike Force powers, these are a per-level pool rather than a
// per-encounter one: you spend them to add a die to a roll, or to fuel specific
// abilities, and the pool refreshes when you gain a level.
// ---------------------------------------------------------------------------

/** The die a Force Point adds to an attack roll, skill check or ability check. */
export function forcePointDice(level: number): string {
  if (level >= 15) return '3d6';
  if (level >= 8) return '2d6';
  return '1d6';
}

export interface ForcePointAbility {
  id: string;
  name: string;
  type: string;
  /** The sentence that describes what spending a Force Point buys. */
  effect: string;
}

const SPENDS_FP = /spend(?:ing)?\s+(?:a|one|1|two|2)\s+Force\s+Points?/i;

/** Everything the character has that a Force Point can be spent on. */
export function buildForcePointAbilities(derived: Derived): ForcePointAbility[] {
  const seen = new Set<string>();
  const out: ForcePointAbility[] = [];

  for (const ref of derived.features) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    const f = FEATURES[ref.id];
    if (!f) continue;
    const text = [...(f.description ?? []), ...(f.benefit ?? []), ...(f.special ?? [])]
      .join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (!SPENDS_FP.test(text)) continue;
    // Pull just the sentence that mentions the cost, not the whole entry.
    const sentence = text.split(/(?<=\.)\s+/).find(s => SPENDS_FP.test(s)) ?? text;
    out.push({ id: f.id, name: f.name, type: f.type, effect: sentence.trim() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
