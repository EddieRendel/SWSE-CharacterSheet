import type { Character, EquipmentItem, Feature, ResolvedItem } from '../types';
import { WEAPON_GROUPS, EQUIPMENT, FEATURES, RULES } from '../data';
import { countFeature, hasFeature, carriedItems, signed } from './engine';
import type { Derived } from './engine';
import { MODIFIERS } from './modifiers';
import type { Modifier, ModifierEffect, Scale } from './modifiers';

export type { Modifier, ModifierEffect } from './modifiers';
export { MODIFIERS } from './modifiers';

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
  /**
   * The modifiers the player has switched on, keyed by the feature that grants them.
   * 0 means off; otherwise it is the 1-based tier chosen (always 1 for a simple on/off).
   *
   * Rapid Shot and Burst Fire live here too. They are feats you choose to use, not
   * circumstances of the fight, and the fields above are only the latter.
   */
  modifiers: Record<string, number>;
}

export const defaultAttackOptions = (): AttackOptions => ({
  powerAttack: 0, twoHanded: false, pointBlank: false, aim: false,
  flatFooted: false, fullAttack: false, twoWeapon: false, stunSetting: false,
  modifiers: {},
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
  weapon: ResolvedItem;
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
  // A die the ladder does not carry — a customized unarmed strike rolling 2d6 — is left as
  // written. There is no next rung to step it to, and snapping it to the bottom one would
  // quietly turn a stronger attack into 1d3.
  let i = DIE_STEPS.indexOf(base);
  if (i < 0) return base;
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

/** The four entries whose bonus the builder applies from either the generic id or a tree copy. */
const FOCUS_FAMILY = [
  'weapon-focus', 'greater-weapon-focus', 'weapon-specialization', 'greater-weapon-specialization',
];

/**
 * Weapon Focus and the three that follow it are in the books twice over: once as the
 * generic entry taken with a weapon group, and once written into a tree for a single
 * weapon — the Duelist tree's Weapon Specialization (lightsabers), CR p.41. The tree's
 * copies are separate features with their own ids, `<generic>-<group>` or
 * `<generic>-<weapon>`, so a check for the generic id alone missed them and a Jedi's
 * lightsaber damage silently lost the +2 the talent had granted.
 *
 * Returns the id of the copy the character holds, if any.
 */
const treeCopyOf = (have: { id: string }[], id: string, weapon: ResolvedItem): string | undefined =>
  [`${id}-${weapon.group ?? ''}`, `${id}-${weapon.id}`].find(v => hasFeature(have, v));

/**
 * Whether the bonus applies at all, from either form.
 *
 * The two forms are not interchangeable, and this is the seam: the generic entries are
 * written for "all attack rolls" and "damage rolls" with the group, while every tree copy
 * names melee — "a +2 bonus on melee damage rolls with Lightsabers". A lightsaber marked
 * thrown is a ranged attack, so it keeps a generic Weapon Focus (lightsabers) and leaves
 * the Duelist talents behind.
 */
const hasWeaponFeature = (
  have: { id: string; spec?: string }[], id: string, weapon: ResolvedItem, melee: boolean,
) => hasFeature(have, id, weapon.group ?? '') || (melee && !!treeCopyOf(have, id, weapon));

/**
 * Everything the character has that touches attacks with this weapon but which the
 * app does not model automatically — surfaced so nothing silently goes missing.
 *
 * The list used to be written out by hand, which meant every entry added to the modifier
 * table had to be remembered here as well or the row went on claiming a feat was ignored
 * after it had started applying. It is read off the table now, plus the handful of ids the
 * maths above still names itself.
 */
const AUTOMATIC = new Set([
  ...MODIFIERS.map(m => m.id),
  'weapon-focus', 'greater-weapon-focus', 'weapon-specialization', 'greater-weapon-specialization',
  'sneak-attack', 'power-attack', 'double-attack', 'triple-attack', 'weapon-proficiency',
  'exotic-weapon-proficiency', 'dual-weapon-mastery-i', 'dual-weapon-mastery-ii', 'dual-weapon-mastery-iii',
  'weapon-finesse', 'ataru', 'wookiee-grip', 'martial-arts-i', 'martial-arts-ii', 'martial-arts-iii',
]);

/** A modifier that reaches this weapon, with its tier already chosen. */
interface Applied {
  mod: Modifier;
  /** The label shown in the breakdown — the modifier's, with the tier named where it has one. */
  label: string;
  effect: ModifierEffect;
  /** How many copies are held, for the ones that stack with themselves. */
  count: number;
}

/** The situations a modifier can wait on, which the player sets rather than the table. */
const situationHolds = (need: NonNullable<Modifier['needs']>, opts: AttackOptions, stunMode: boolean) => {
  switch (need) {
    case 'pointBlank': return opts.pointBlank;
    case 'aim': return opts.aim;
    case 'flatFooted': return opts.flatFooted;
    case 'fullAttack': return opts.fullAttack || opts.twoWeapon;
    case 'stunSetting': return stunMode;
  }
};

/** A quantity the table names rather than writes down. */
const scaled = (scale: Scale, derived: Derived): number => {
  switch (scale) {
    case 'half-level': return Math.floor(derived.level / 2);
    case 'level': return derived.level;
    case 'str-mod': return derived.mods.str;
    case 'dex-mod': return derived.mods.dex;
  }
};

/** Whether the weapon in hand is the kind this modifier is written for. */
function weaponAllows(mod: Modifier, weapon: ResolvedItem, ctx: {
  proficient: boolean; lightsaber: boolean; light: boolean;
}): boolean {
  if (mod.groups && !mod.groups.includes(weapon.group ?? '')) return false;
  if (mod.notGroups?.includes(weapon.group ?? '')) return false;
  if (mod.weaponIds && !mod.weaponIds.includes(weapon.id)) return false;
  switch (mod.weapon) {
    case undefined: return true;
    case 'proficient': return ctx.proficient;
    case 'light': return ctx.light;
    case 'light-or-lightsaber': return ctx.light || ctx.lightsaber;
    case 'lightsaber': return ctx.lightsaber;
    // A copy the player has made their own — armored gauntlets, a species' natural
    // weapon — stands in for the catalogue entry, so match on what it was built from.
    case 'unarmed': return weapon.id === 'unarmed';
  }
}

/**
 * Which modifiers reach this weapon, given what the character holds and what the player
 * has switched on. The order of the tests is the order they are cheapest to fail in, and
 * every one of them is a field in the table rather than a branch on an id.
 */
function activeModifiers(
  derived: Derived, weapon: ResolvedItem, opts: AttackOptions,
  ctx: {
    melee: boolean; fired: boolean; stunMode: boolean;
    proficient: boolean; lightsaber: boolean; light: boolean;
  },
): Applied[] {
  const have = derived.features;
  const group = weapon.group ?? '';
  // Dreadful Rage is not a bonus on top of Rage, it is Rage read at a higher number, so
  // the entry it stands in for is dropped before anything else is considered.
  const superseded = new Set(
    MODIFIERS.filter(m => m.replaces && hasFeature(have, m.id)).map(m => m.replaces as string),
  );

  const out: Applied[] = [];
  for (const mod of MODIFIERS) {
    if (superseded.has(mod.id)) continue;

    const count = mod.perSpec
      ? countFeature(have, mod.id, group) + countFeature(have, mod.id, weapon.id)
      : countFeature(have, mod.id);
    if (!count) continue;

    if (mod.scope === 'melee' && !ctx.melee) continue;
    if (mod.scope === 'ranged' && ctx.melee) continue;
    if (mod.scope === 'fired' && !ctx.fired) continue;
    if (!weaponAllows(mod, weapon, ctx)) continue;

    const tier = opts.modifiers?.[mod.id] ?? 0;
    if (!mod.always && !(mod.needs ? situationHolds(mod.needs, opts, ctx.stunMode) : true)) continue;
    // A switch of its own is only skipped for the ones that have none: the automatic
    // entries, and the ones that ride on a situation the player has already set.
    if (!mod.always && !mod.needs && !tier) continue;
    if (mod.tiers && !tier) continue;

    const effect = mod.tiers ? mod.tiers[tier - 1] : mod;
    if (!effect) continue;

    out.push({
      mod,
      label: mod.tiers ? `${mod.label} (${mod.tiers[tier - 1].label})` : mod.label,
      effect,
      count: mod.repeats ? count : 1,
    });
  }

  // One that only applies alongside another — Trigger Work cancelling Rapid Shot's
  // penalty — is settled last, once it is known what else got through.
  const on = new Set(out.map(a => a.mod.id));
  return out.filter(a => !a.mod.withModifier || on.has(a.mod.withModifier));
}

export function buildAttack(
  _char: Character,
  derived: Derived,
  weapon: ResolvedItem,
  opts: AttackOptions,
): AttackProfile {
  const have = derived.features;
  const group = weapon.group ?? '';
  // A weapon marked thrown is hurled rather than swung, which makes the attack a ranged
  // one: Dexterity on the roll, no Power Attack, no melee talents. The Strength modifier
  // still lands on the damage, as it does for any weapon thrown by hand. Where a weapon
  // is used both ways — a spear kept for either — carry it twice and mark one copy.
  const thrown = weapon.thrown === true;
  const melee = isMelee(weapon) && !thrown;
  /** Shot from a weapon rather than thrown by hand — what the fire modes need. */
  const fired = !melee && !thrown;
  const notes: string[] = [];

  const proficient = hasFeature(have, 'weapon-proficiency', group)
    || hasFeature(have, 'exotic-weapon-proficiency', weapon.id);

  // Weapon Finesse swaps Dexterity for Strength on attack rolls with a light melee weapon
  // or a lightsaber. The feat says "may", so take whichever modifier is actually higher.
  const lightsaber = group === 'lightsabers';
  const light = isLightWeapon(weapon, derived.size);
  const finesse = melee && hasFeature(have, 'weapon-finesse') && (lightsaber || light);
  const finesseAttack = finesse && derived.mods.dex > derived.mods.str;

  // Switching a weapon to its stun setting, or back, is a swift action. Most keep the same
  // dice; a few hit harder on stun, which is what stunDamage records. Settled here rather
  // than beside the damage, because a modifier can wait on it.
  const stunMode = !!opts.stunSetting && weapon.stun === true;

  // Everything the table says reaches this weapon, resolved once. What follows only reads
  // it: the arithmetic no longer knows any feature by name.
  const active = activeModifiers(derived, weapon, opts, {
    melee, fired, stunMode, proficient, lightsaber, light,
  });

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
  if (hasWeaponFeature(have, 'weapon-focus', weapon, melee)) attackParts.push({ label: 'Weapon Focus', value: 1 });
  if (hasWeaponFeature(have, 'greater-weapon-focus', weapon, melee)) attackParts.push({ label: 'Greater Weapon Focus', value: 1 });
  if (derived.armorPenalty) attackParts.push({ label: 'armor', value: derived.armorPenalty });
  if (derived.conditionPenalty) attackParts.push({ label: 'condition', value: derived.conditionPenalty });

  // Power Attack is melee only and capped at your base attack bonus.
  const power = melee ? Math.max(0, Math.min(opts.powerAttack, derived.baseAttackBonus)) : 0;
  if (power) attackParts.push({ label: 'Power Attack', value: -power });
  if (power && !hasFeature(have, 'power-attack')) notes.push('You do not have the Power Attack feat.');

  // Rapid Shot fires two shots as one attack and Burst Fire needs a weapon that can lay
  // down autofire; neither is a thing a hurled spear can do, so the table scopes them to
  // `fired` and a thrown weapon is ranged for everything else.
  if (thrown && (opts.modifiers['rapid-shot'] || opts.modifiers['burst-fire'])
    && (hasFeature(have, 'rapid-shot') || hasFeature(have, 'burst-fire'))) {
    notes.push('Rapid Shot fires two shots and Burst Fire needs autofire, so neither reaches a weapon you throw.');
  }

  // ---- what the table contributes to the attack roll ----
  // Two passes, because Trigger Work and Controlled Burst are written against what another
  // modifier already cost — "you take no penalty when using the Rapid Shot feat" — and that
  // figure is not settled until the harsher clause below has had its say.
  //
  // The ones that buy down the full-attack penalty are held back for the block after next:
  // they are relief against a penalty, and applied here they would read as a bonus on a
  // character who never took the action.
  const attackOf = new Map<string, number>();
  for (const a of active) {
    if (a.mod.relieves || a.mod.floorsAttack !== undefined) continue;
    let value = (a.effect.attack ?? 0) * a.count;
    if (a.effect.attackScale) value += scaled(a.effect.attackScale, derived);
    // A feat written for a stronger or nimbler character costs more when you fall short.
    const h = a.mod.harsher;
    if (h && derived.abilities[h.ability] < h.min && !(h.unlessWeapon === 'light' && light)) {
      value = h.attack;
      notes.push(`${a.mod.label} costs ${signed(h.attack)} rather than ${signed(a.effect.attack ?? 0)} `
        + `without ${RULES.abilities[h.ability].name} ${h.min}.`);
    }
    attackOf.set(a.mod.id, value);
    if (value) attackParts.push({ label: a.label, value });
    if (a.mod.note && !notes.includes(a.mod.note)) notes.push(a.mod.note);
  }

  // `withModifier` already guarantees the one being floored is switched on, so the figure
  // is there to read. Kept as its own row rather than folded into the driver's, so the
  // breakdown still shows the penalty and what cancelled it.
  for (const a of active) {
    if (a.mod.floorsAttack === undefined) continue;
    const paid = attackOf.get(a.mod.withModifier ?? '') ?? 0;
    const relief = a.mod.floorsAttack - paid;
    if (relief > 0) attackParts.push({ label: a.label, value: relief });
    if (a.mod.note && !notes.includes(a.mod.note)) notes.push(a.mod.note);
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

    // Multiattack Proficiency and its kin "reduce the penalty on your attack rolls", so they
    // buy those −5s down and stop at nothing: a character holding more relief than penalty
    // pays nothing rather than collecting a bonus. Kept as a row of its own beside the
    // penalty it answers, so the breakdown shows the trade rather than a netted figure.
    const relievers = active.filter(a => a.mod.relieves === 'fullAttack');
    const relief = relievers.reduce((n, a) => n + (a.effect.attack ?? 0) * a.count, 0);
    const used = Math.min(relief, -extra);
    if (used > 0) attackParts.push({ label: relievers.map(a => a.mod.label).join(', '), value: used });

    fullAttack = { attacks, penalty: twoWeapon + extra + used };
    if (attacks === 1) notes.push('Double Attack with this weapon group would grant a second attack.');
  }

  // ---- damage ----
  const weaponDice = (stunMode ? weapon.stunDamage ?? weapon.damage : weapon.damage);

  const extraDice: { label: string; dice: string }[] = [];
  const damageParts: Part[] = [
    { label: 'half character level', value: Math.floor(derived.level / 2) },
  ];
  // A weapon that takes two hands is always held that way, so it does not wait on the
  // toggle; a one-handed one counts only when the player says they are gripping it in two.
  // Neither is possible while holding a weapon in each hand.
  // Nothing is gripped in two hands on the way out of them, so a throw takes neither the
  // doubled Strength bonus nor the two-handed half of Power Attack.
  const inherent = !thrown && needsTwoHands(weapon, derived.size, have);
  const bothHands = !thrown && !opts.twoWeapon && (inherent || opts.twoHanded);

  // Ataru puts Dexterity on lightsaber damage in place of Strength, and says so for the
  // doubled case too — two-handed it is double Dexterity rather than double Strength. Also
  // a "may", so the higher modifier wins.
  const ataru = lightsaber && !thrown && hasFeature(have, 'ataru');
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
  } else if (thrown) {
    damageParts.push({ label: 'Strength (thrown)', value: derived.mods.str });
    notes.push(
      'Marked as thrown: the attack roll is a ranged one made with Dexterity, and your '
      + 'Strength modifier is added to the damage. Clear the flag on the item to swing it instead.',
    );
  }
  if (hasWeaponFeature(have, 'weapon-specialization', weapon, melee)) damageParts.push({ label: 'Weapon Specialization', value: 2 });
  if (hasWeaponFeature(have, 'greater-weapon-specialization', weapon, melee)) damageParts.push({ label: 'Greater Weapon Specialization', value: 2 });
  // Dropping a bonus is the kind of thing that has to be said out loud — the whole point of
  // holding the tree copies separately is that they are melee-only.
  if (!melee) {
    const shelved = FOCUS_FAMILY
      .map(id => treeCopyOf(have, id, weapon))
      .filter((id): id is string => !!id)
      .map(id => FEATURES[id]?.name ?? id);
    if (shelved.length) {
      notes.push(`${shelved.join(', ')} ${shelved.length > 1 ? 'add' : 'adds'} to melee rolls only, so `
        + `${shelved.length > 1 ? 'they do' : 'it does'} not apply to the ${weapon.name} thrown.`);
    }
  }
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

  // ---- what the table contributes to damage ----
  // Dice of the weapon's own size are collected rather than added as they are found: the
  // books tie several of them together — "do not stack with the extra damage provided by
  // the Rapid Strike feat" — and a pool is where that is settled. Entries outside a pool
  // stack freely, which is what Attack Combo says in as many words.
  const pools = new Map<string, { label: string; dice: number }[]>();
  const loose: { label: string; dice: number }[] = [];

  for (const a of active) {
    if (a.mod.relieves) continue;
    let value = (a.effect.damage ?? 0) * a.count;
    if (a.effect.damageScale) value += scaled(a.effect.damageScale, derived);
    if (value) damageParts.push({ label: a.label, value });
    if (a.effect.extraDice) extraDice.push({ label: a.mod.label, dice: a.effect.extraDice });

    const dice = (a.effect.weaponDice ?? 0) * a.count;
    if (!dice) continue;
    if (!a.mod.pool) { loose.push({ label: a.label, dice }); continue; }
    const pool = pools.get(a.mod.pool) ?? [];
    pool.push({ label: a.label, dice });
    pools.set(a.mod.pool, pool);
  }

  const chosen = [...loose];
  for (const entries of pools.values()) {
    const ranked = [...entries].sort((x, y) => y.dice - x.dice);
    chosen.push(ranked[0]);
    if (ranked.length > 1) {
      notes.push(`${entries.map(e => e.label).join(', ')} do not stack — using ${ranked[0].label}.`);
    }
  }

  const diceParts: { label: string; dice: string }[] = [
    { label: stunMode ? `${weapon.name} (stun)` : weapon.name, dice: weaponDice ?? '—' },
  ];
  // Every one of them rolls the weapon's own die, so they are added together and each is
  // still named on its own row — a total of 5d8 that says which feat brought which pair.
  const die = weaponDice?.match(/d(\d+)/)?.[1];
  let damageDice = addWeaponDice(weaponDice, chosen.reduce((n, c) => n + c.dice, 0));
  for (const c of chosen) diceParts.push({ label: c.label, dice: `+${c.dice}d${die ?? '?'}` });

  // ---- modifications fitted to this particular weapon ----
  // A crystal, an attunement, whatever the player recorded against their own copy. Each
  // is named in the breakdown rather than summed into one anonymous line, so a bonus can
  // be traced back to the thing that granted it.
  for (const up of weapon.upgrades ?? []) {
    const label = up.name.trim() || 'modification';
    if (up.attack) attackParts.push({ label, value: up.attack });
    if (up.damage) damageParts.push({ label, value: up.damage });
    if (up.damageDice) extraDice.push({ label, dice: up.damageDice });
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
  const inventory = carriedItems(char);
  // One profile per drawn copy. Two identical blasters used to collapse into a single line,
  // which made a matched pair impossible to wield — the whole point of carrying two. Each
  // inventory entry is one weapon now, with its own drawn state.
  //
  // Unarmed is the exception, and is excluded here: it is always available and appended
  // once below, so an entry for it would put your fists on the list twice.
  const carried = inventory
    .filter(r => r.entry.equipped && r.item.category === 'weapon' && r.item.id !== 'unarmed')
    // resolveItem hands back the catalogue object itself when nothing was customized, so
    // two untouched blasters are literally the same object. Copy, and stamp the entry on,
    // or the two lines would be indistinguishable to anything downstream.
    .map((r): ResolvedItem => ({ ...r.item, entryUid: r.entry.uid }));

  // Your fists are always to hand, so unarmed never waits on the "worn" tick. A copy of it
  // the player has made their own — armored gauntlets, a species' natural weapon — stands
  // in for the default entry rather than appearing beside it.
  const ownUnarmed = inventory.find(r => r.item.id === 'unarmed' && r.item.modified)?.item;
  const base = ownUnarmed ?? EQUIPMENT.unarmed;
  const unarmed: ResolvedItem = {
    ...base,
    damage: unarmedDamage(derived.features, base?.damage ?? '1d4'),
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

/**
 * Everything a feature says, as one line of plain text: the sources carry a little inline
 * HTML, and the rules text is split across description, benefit and special. Both readers
 * below scan the whole entry rather than the description alone — Battle Strike puts its
 * dice in the benefit, not the summary.
 */
const featureText = (f: Feature): string =>
  [...(f.description ?? []), ...(f.benefit ?? []), ...(f.special ?? [])]
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

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
    const text = featureText(f);
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
    const text = featureText(f);
    if (!SPENDS_FP.test(text)) continue;
    // Pull just the sentence that mentions the cost, not the whole entry.
    const sentence = text.split(/(?<=\.)\s+/).find(s => SPENDS_FP.test(s)) ?? text;
    out.push({ id: f.id, name: f.name, type: f.type, effect: sentence.trim() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
