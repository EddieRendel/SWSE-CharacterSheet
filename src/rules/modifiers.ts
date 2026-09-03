import type { AbilityId } from '../types';

/**
 * Everything a character holds that changes an attack roll, a damage roll or the number of
 * damage dice, written down rather than branched on.
 *
 * `attacks.ts` used to test for feature ids one `if` at a time, which is the shape AGENTS.md
 * calls out: a rule keyed on an id belongs in data, not in the engine. This table is that
 * data. The engine reads it generically, so adding a feat is one entry here and no change to
 * the maths.
 *
 * It is TypeScript rather than JSON on purpose. The interesting fields are closed unions —
 * `scope`, `weapon`, `kind` — and `tsc -b` rejects `scope: 'meele'` at build time, where a
 * JSON file would carry the typo silently into a modifier that can never match.
 *
 * ## What is in, and what is deliberately not
 *
 * In: anything that changes the number **you** roll for an ordinary weapon attack.
 *
 * Out, because there is nothing for the attack line to show:
 *
 *   - bonuses you hand to *allies* — Born Leader, Inspire Confidence, Rally, Forewarn Allies.
 *     Where a talent says "you and all allies", it is in, because you are one of them.
 *   - penalties you inflict on *enemies* — Fearsome, Guardian Strike, Personal Vendetta.
 *   - vehicle and starship weapons — Expert Gunner, Vehicle Focus, the Dogfight talents.
 *   - grenades, mines and explosives, which are not attack profiles here — Demolitionist,
 *     Higher Yield, Bigger Bang.
 *   - rerolls and "take the better result" — Power of the Dark Side. They change the odds,
 *     not the arithmetic, so no part of the breakdown moves.
 *   - penalties this app does not model in the first place: range categories (Far Shot),
 *     firing into melee (Precise Shot), concealment (Keen Shot), improvised weapons
 *     (Make Do, Gun Club), and the special attacks — Disarm, Grab, Trip.
 *   - critical hits, which are rolled, not derived — Tae-Jitsu Training.
 *
 * `tools-audit-modifiers.mjs` lists what a re-import has added that is not covered here.
 * Anything genuinely ambiguous is left out rather than guessed at: it still surfaces through
 * the "not applied automatically" note on the attack row, which is the safe direction.
 */

/** A quantity read off the character rather than written down. */
export type Scale = 'half-level' | 'level' | 'str-mod' | 'dex-mod';

/** What a modifier contributes once it applies. A tier is the same shape, with a label. */
export interface ModifierEffect {
  attack?: number;
  damage?: number;
  attackScale?: Scale;
  damageScale?: Scale;
  /** Dice of a fixed size rolled alongside the weapon's own, e.g. Battle Strike's 1d6. */
  extraDice?: string;
  /** Dice of the weapon's *own* size — Rapid Strike's "+1 die of damage". */
  weaponDice?: number;
}

export interface Modifier extends ModifierEffect {
  /** The feature id that grants it. Every entry must resolve in FEATURES — a test asserts it. */
  id: string;
  label: string;
  /** The condition the app cannot know about, shown against the switch in the picker. */
  hint: string;
  /** Which section of the picker it belongs to. */
  kind: 'melee' | 'ranged' | 'force' | 'circumstance';

  /** Which attacks it can reach. `fired` is shot from a weapon, so it excludes thrown ones. */
  scope: 'melee' | 'ranged' | 'fired' | 'any';
  /** A further restriction on the weapon in hand. */
  weapon?: 'proficient' | 'light' | 'light-or-lightsaber' | 'lightsaber' | 'unarmed';
  /** Only these weapon groups. */
  groups?: string[];
  /** Never these groups — "This Feat does not apply to Heavy Weapons". */
  notGroups?: string[];
  /** Only these weapons by name, where the book names the weapon rather than its group. */
  weaponIds?: string[];
  /**
   * Chosen with a weapon, so it is only held for that one. The specialization is matched
   * against the weapon's group and its own id, because the books write these both ways:
   * Savage Attack names a weapon group, Brutal Attack names a single weapon.
   */
  perSpec?: boolean;

  /** Members of a pool do not stack; the largest applies and the rest are named in a note. */
  pool?: string;
  /** A worse penalty when an ability score falls short — Rapid Strike's Dexterity 13. */
  harsher?: { ability: AbilityId; min: number; attack: number; unlessWeapon?: 'light' };

  /** Reads a situation the player has already set, instead of getting a switch of its own. */
  needs?: 'pointBlank' | 'aim' | 'flatFooted' | 'fullAttack' | 'stunSetting';
  /** Only applies while another modifier is also on. */
  withModifier?: string;
  /**
   * Raises the penalty of the modifier named by `withModifier` to this value, rather than
   * adding a fixed amount to it. The books write these as a target — "you take no penalty",
   * "reduced to -2" — and the target is the whole point: Rapid Shot and Burst Fire each cost
   * more when an ability falls short, and a fixed offset would leave the difference behind.
   */
  floorsAttack?: number;
  /** Applies with no choice at all: no switch, no picker row. */
  always?: true;
  /** Buys down the full-attack penalty rather than adding a bonus. Never past zero. */
  relieves?: 'fullAttack';
  /** Taken more than once, and the effect multiplies with the number held. */
  repeats?: true;
  /** Stands in for another entry, which is then not offered — Dreadful Rage for Rage. */
  replaces?: string;
  /** Said out loud on any attack it touches, for a reading the numbers cannot carry alone. */
  note?: string;

  /** Where the effect varies, usually by a Use the Force check. */
  tiers?: (ModifierEffect & { label: string })[];
}

/**
 * Multiclassing makes "your class level" ambiguous, and the character sheet does not record
 * which class a talent was taken from. Everything scaled by class level says so.
 */
const CLASS_LEVEL = 'Scaled by your character level. Where you have multiclassed, the book '
  + 'means the level of the class this came from — use the lower figure.';

export const MODIFIERS: Modifier[] = [
  // ---------------------------------------------------------------------------
  // Applied with no switch: nothing about them is a choice or a circumstance.
  // ---------------------------------------------------------------------------
  { id: 'melee-smash', label: 'Melee Smash', kind: 'melee', scope: 'melee', always: true,
    damage: 1, hint: 'Adds to every melee damage roll' },
  { id: 'primitive-warrior', label: 'Primitive Warrior', kind: 'melee', scope: 'melee',
    always: true, groups: ['simple-weapons'], weaponDice: 1,
    hint: '+1 die of damage with Simple Weapons (melee)' },
  { id: 'trusty-sidearm', label: 'Trusty Sidearm', kind: 'ranged', scope: 'ranged',
    always: true, groups: ['pistols'], damageScale: 'half-level', note: CLASS_LEVEL,
    hint: 'Half your class level on damage, wielding a pistol' },

  // ---------------------------------------------------------------------------
  // Melee: the extra-dice family. The books tie these together explicitly — "do not
  // stack with the extra damage provided by the Rapid Strike feat" — so they share a
  // pool with the ranged three below and the largest of whatever is on wins.
  // ---------------------------------------------------------------------------
  { id: 'mighty-swing', label: 'Mighty Swing', kind: 'melee', scope: 'melee',
    weaponDice: 1, pool: 'extra-dice',
    hint: 'Two swift actions this round, for your next melee attack' },
  { id: 'rapid-strike', label: 'Rapid Strike', kind: 'melee', scope: 'melee',
    weapon: 'proficient', attack: -2, weaponDice: 1, pool: 'extra-dice',
    harsher: { ability: 'dex', min: 13, attack: -5, unlessWeapon: 'light' },
    hint: 'Two strikes as one attack against a single target' },
  { id: 'improved-rapid-strike', label: 'Improved Rapid Strike', kind: 'melee', scope: 'melee',
    weapon: 'light-or-lightsaber', attack: -5, weaponDice: 2, pool: 'extra-dice',
    harsher: { ability: 'dex', min: 13, attack: -10 },
    hint: 'Rapid Strike with a light melee weapon or a lightsaber' },

  // ---------------------------------------------------------------------------
  // Melee, everything else.
  // ---------------------------------------------------------------------------
  { id: 'attack-combo-melee', label: 'Attack Combo (Melee)', kind: 'melee', scope: 'melee',
    weaponDice: 1, hint: 'Two consecutive melee hits on this target already this turn' },
  { id: 'accurate-blow', label: 'Accurate Blow', kind: 'melee', scope: 'melee',
    perSpec: true, weaponDice: 1, hint: 'The attack roll beat Reflex Defense by 5 or more' },
  { id: 'brutal-attack', label: 'Brutal Attack', kind: 'melee', scope: 'any',
    perSpec: true, weaponDice: 1, hint: "The damage exceeds the target's damage threshold" },
  { id: 'melee-assault', label: 'Melee Assault', kind: 'melee', scope: 'melee',
    weaponDice: 1, hint: "An ally is adjacent, and the roll beat Fortitude Defense too" },
  { id: 'momentum-strike', label: 'Momentum Strike', kind: 'melee', scope: 'melee',
    weaponDice: 1, hint: 'Riding a mount or speeder bike that has moved its speed this turn' },
  { id: 'deathstrike', label: 'Deathstrike', kind: 'melee', scope: 'melee',
    needs: 'flatFooted', weaponDice: 1,
    hint: 'Species trait: the target is denied its Dexterity bonus' },
  { id: 'melee-opportunist', label: 'Melee Opportunist', kind: 'melee', scope: 'melee',
    attack: 2,
    hint: 'The reaction attack after an ally hits an adjacent target — once per encounter' },
  { id: 'close-quarters-fighter', label: 'Close-Quarters Fighter', kind: 'melee', scope: 'melee',
    attack: 1, hint: 'Adjacent to the target, or sharing its square' },
  { id: 'crushing-assault', label: 'Crushing Assault', kind: 'melee', scope: 'melee',
    attack: 2, damage: 2,
    hint: 'A bludgeoning weapon you have Weapon Specialization for, against an opponent you already damaged' },
  { id: 'staggering-attack-gaw', label: 'Staggering Attack', kind: 'melee', scope: 'melee',
    weapon: 'proficient', attack: -2,
    hint: "Trades accuracy to break the target's concentration" },
  { id: 'swarm', label: 'Swarm', kind: 'melee', scope: 'melee',
    hint: '+1 on melee attacks for each ally adjacent to your target',
    tiers: [
      { label: '1 ally', attack: 1 }, { label: '2 allies', attack: 2 },
      { label: '3 allies', attack: 3 }, { label: '4 allies', attack: 4 },
    ] },
  { id: 'channel-anger', label: 'Channel Anger', kind: 'melee', scope: 'melee',
    attack: 2, damage: 2, hint: 'Raging, for a Force Point' },
  { id: 'attune-weapon', label: 'Attune Weapon', kind: 'melee', scope: 'melee',
    attack: 1, hint: 'This melee weapon is the one you attuned with a Force Point' },
  { id: 'rapid-alchemy', label: 'Rapid Alchemy', kind: 'melee', scope: 'melee',
    attack: 2, hint: 'This melee weapon is the one you altered this encounter' },
  { id: 'empower-weapon', label: 'Empower Weapon', kind: 'melee', scope: 'melee',
    weaponDice: 1, hint: 'This melee weapon is the one you empowered with a Force Point' },
  { id: 'power-surge', label: 'Power Surge', kind: 'melee', scope: 'melee',
    attack: 1, weaponDice: 1, hint: 'Droid talent: surging, for half your level in rounds' },

  // The Strength bonus is already on the damage line; each of these adds a second copy,
  // which is what "double your Strength bonus" comes to.
  { id: 'droid-smash', label: 'Droid Smash', kind: 'melee', scope: 'melee',
    damageScale: 'str-mod', hint: 'Doubles Strength on damage, wielding the weapon in one hand' },
  { id: 'heavy-duty-actuators', label: 'Heavy-Duty Actuators', kind: 'melee', scope: 'melee',
    damageScale: 'str-mod', hint: 'Doubles Strength on melee and unarmed damage' },
  { id: 'blaster-and-blade-ii', label: 'Blaster and Blade II', kind: 'melee', scope: 'melee',
    groups: ['advanced-melee-weapons'], damageScale: 'str-mod',
    hint: 'Doubles Strength on damage while you also hold a pistol',
    // "treat the advanced melee weapon as though you were wielding it two-handed (including
    // doubling your Strength bonus on damage rolls)". Read strictly, "as though two-handed"
    // would also double Power Attack, which is the other thing a two-handed grip does here.
    // The parenthetical reads as naming the whole effect, so only Strength is doubled — and
    // the narrower reading is the safe one. Said out loud rather than decided quietly.
    note: 'Blaster and Blade II says to treat the weapon as though wielded two-handed. Only the '
      + 'doubled Strength bonus is applied here; if your table reads it as a true two-handed '
      + 'grip, Power Attack would double as well.' },

  // Lightsabers.
  { id: 'prime-targets', label: 'Prime Targets', kind: 'melee', scope: 'melee',
    weapon: 'lightsaber', weaponDice: 1,
    hint: 'The target has not been attacked since the end of your last turn' },
  { id: 'praetoria-vonil', label: 'Praetoria Vonil', kind: 'melee', scope: 'melee',
    weapon: 'lightsaber', weaponDice: 1,
    hint: 'A single lightsaber in two hands, having moved at least 1 square this turn' },
  { id: 'master-of-the-great-hunt', label: 'Master of the Great Hunt', kind: 'melee', scope: 'melee',
    weapon: 'lightsaber', attack: 1, weaponDice: 1,
    hint: 'Against a beast with a Dark Side Score of 1 or more' },
  { id: 'strength-of-the-empire', label: 'Strength of the Empire', kind: 'melee', scope: 'melee',
    weapon: 'lightsaber', weaponDice: 1,
    hint: 'An ally hit with a lightsaber since the end of your last turn' },
  { id: 'defensive-acuity', label: 'Defensive Acuity', kind: 'melee', scope: 'melee',
    weapon: 'lightsaber', weaponDice: 1, hint: 'You took the Fight Defensively action' },
  { id: 'shoto-focus', label: 'Shoto Focus', kind: 'melee', scope: 'melee',
    weaponIds: ['short-lightsaber', 'guard-shoto'], attack: 2,
    hint: 'The short lightsaber or guard shoto, while also wielding a one-handed lightsaber' },

  // Unarmed.
  { id: 'ktara-training', label: "K'tara Training", kind: 'melee', scope: 'melee',
    weapon: 'unarmed', needs: 'flatFooted', weaponDice: 1,
    hint: 'One unarmed attack per turn against a flat-footed enemy' },
  { id: 'stunning-shockboxer', label: 'Stunning Shockboxer', kind: 'melee', scope: 'melee',
    weapon: 'unarmed', weaponDice: 1,
    hint: 'Unarmed stun damage — the extra die is added after the stun is halved' },
  { id: 'flurry-of-blows', label: 'Flurry of Blows', kind: 'melee', scope: 'melee',
    weapon: 'unarmed', needs: 'fullAttack', relieves: 'fullAttack', repeats: true, attack: 2,
    hint: 'Buys down the full-attack penalty on unarmed attacks' },

  // ---------------------------------------------------------------------------
  // Ranged.
  // ---------------------------------------------------------------------------
  { id: 'point-blank-shot', label: 'Point Blank Shot', kind: 'ranged', scope: 'ranged',
    needs: 'pointBlank', attack: 1, damage: 1, hint: 'The target is within point blank range' },
  { id: 'careful-shot', label: 'Careful Shot', kind: 'ranged', scope: 'ranged',
    needs: 'aim', attack: 1, hint: 'You aimed as a swift or move action this turn' },
  { id: 'deadeye', label: 'Deadeye', kind: 'ranged', scope: 'ranged',
    needs: 'aim', weaponDice: 1, pool: 'extra-dice',
    hint: 'You aimed as a swift or move action this turn' },
  { id: 'rapid-shot', label: 'Rapid Shot', kind: 'ranged', scope: 'fired',
    weapon: 'proficient', attack: -2, weaponDice: 1, pool: 'extra-dice',
    harsher: { ability: 'str', min: 13, attack: -5 },
    hint: 'Two shots as one attack against a single target' },
  { id: 'burst-fire', label: 'Burst Fire', kind: 'ranged', scope: 'fired',
    weapon: 'proficient', attack: -5, weaponDice: 2, pool: 'extra-dice',
    harsher: { ability: 'str', min: 13, attack: -10 },
    hint: 'A five-shot autofire burst as one attack, from a weapon that can lay down autofire' },
  { id: 'zero-range', label: 'Zero Range', kind: 'ranged', scope: 'ranged',
    notGroups: ['heavy-weapons'], attack: 1, weaponDice: 1, pool: 'extra-dice',
    hint: 'The target is adjacent, or in your own square. Not heavy weapons' },
  { id: 'trigger-work', label: 'Trigger Work', kind: 'ranged', scope: 'fired',
    always: true, withModifier: 'rapid-shot', floorsAttack: 0,
    hint: "Cancels Rapid Shot's penalty outright, however deep it runs" },
  { id: 'twin-shot', label: 'Twin Shot', kind: 'ranged', scope: 'fired',
    withModifier: 'rapid-shot', groups: ['pistols'], damage: 2,
    hint: 'Rapid Shot while wielding two pistols' },
  { id: 'controlled-burst', label: 'Controlled Burst', kind: 'ranged', scope: 'fired',
    always: true, withModifier: 'burst-fire', floorsAttack: -2,
    hint: "Buys Burst Fire's penalty down to −2, however deep it runs" },
  { id: 'attack-combo-ranged', label: 'Attack Combo (Ranged)', kind: 'ranged', scope: 'ranged',
    weaponDice: 1, hint: 'Two consecutive ranged hits on this target already this turn' },
  { id: 'invisible-attacker', label: 'Invisible Attacker', kind: 'ranged', scope: 'ranged',
    weaponDice: 1, hint: 'The target is unaware of you' },
  { id: 'nonlethal-tactics', label: 'Nonlethal Tactics', kind: 'ranged', scope: 'any',
    needs: 'stunSetting', attack: 1, weaponDice: 1,
    hint: 'A weapon set to stun — a stun baton counts, and it is a melee weapon' },
  { id: 'ion-mastery', label: 'Ion Mastery', kind: 'ranged', scope: 'ranged',
    attack: 1, weaponDice: 1, hint: 'Attacking with an ion weapon' },
  { id: 'shien', label: 'Shien', kind: 'ranged', scope: 'ranged', attack: 5,
    hint: 'Redirecting a deflected blaster bolt, with the Redirect Shot talent' },
  { id: 'prime-shot', label: 'Prime Shot', kind: 'ranged', scope: 'ranged',
    attack: 1, hint: 'No ally is closer to the target, which is at short range or nearer' },
  { id: 'trench-warrior', label: 'Trench Warrior', kind: 'circumstance', scope: 'any',
    attack: 1, hint: "Adjacent to something giving you cover from the target's fire" },
  { id: 'sentinels-observation', label: "Sentinel's Observation", kind: 'circumstance', scope: 'any',
    attack: 2, hint: 'You have concealment against the target' },
  { id: 'face-the-foe', label: 'Face the Foe', kind: 'circumstance', scope: 'any',
    attack: 1, hint: 'You do not have cover from the target' },
  { id: 'hotwired-processor', label: 'Hotwired Processor', kind: 'ranged', scope: 'ranged',
    attack: 1, hint: 'Droid talent: hotwired, for half your level in rounds' },

  // ---------------------------------------------------------------------------
  // Circumstance: it depends on the fight rather than on the weapon.
  // ---------------------------------------------------------------------------
  { id: 'rage', label: 'Rage', kind: 'circumstance', scope: 'melee', attack: 2, damage: 2,
    hint: 'Species trait: +2 to melee attack and damage while raging' },
  { id: 'dreadful-rage', label: 'Dreadful Rage', kind: 'circumstance', scope: 'melee',
    replaces: 'rage', attack: 5, damage: 5,
    hint: 'Raging — Dreadful Rage raises the Rage bonus from +2 to +5' },
  { id: 'skirmisher', label: 'Skirmisher', kind: 'circumstance', scope: 'any', attack: 1,
    hint: 'Moved at least 2 squares and ended somewhere new' },
  { id: 'powerful-charge', label: 'Powerful Charge', kind: 'circumstance', scope: 'melee',
    attack: 2, damageScale: 'half-level',
    hint: 'Charging — and half your level again on the damage' },
  { id: 'aggressive', label: 'Aggressive', kind: 'circumstance', scope: 'melee', attack: 2,
    hint: 'Species trait: a charge that hit keeps its +2 for the rest of the encounter' },
  { id: 'flurry', label: 'Flurry', kind: 'circumstance', scope: 'melee',
    weapon: 'light-or-lightsaber', attack: 2,
    hint: 'Light weapons or lightsabers only; costs 5 Reflex Defense' },
  { id: 'cunning-attack', label: 'Cunning Attack', kind: 'circumstance', scope: 'any',
    needs: 'flatFooted', attack: 2,
    hint: 'Target flat-footed or denied its Dexterity bonus' },
  { id: 'sniper-shot', label: 'Sniper Shot', kind: 'circumstance', scope: 'ranged',
    weapon: 'proficient', notGroups: ['heavy-weapons'], attack: 2,
    hint: 'Proficient weapons only, never heavy ones; costs 5 Reflex Defense' },
  { id: 'deadly-sniper', label: 'Deadly Sniper', kind: 'circumstance', scope: 'ranged',
    attack: 2, weaponDice: 1,
    hint: 'Target unaware of you — first attack each turn' },
  { id: 'cornered', label: 'Cornered', kind: 'circumstance', scope: 'any', attack: 2,
    hint: 'Threatened and unable to withdraw' },
  { id: 'justice-seeker', label: 'Justice Seeker', kind: 'circumstance', scope: 'any', damage: 2,
    hint: 'Target damaged an ally since the end of your last turn' },
  { id: 'droid-hunter', label: 'Droid Hunter', kind: 'circumstance', scope: 'any',
    weapon: 'proficient',
    hint: 'Against droid enemies, with a weapon you are proficient with',
    tiers: [
      { label: '+2', damage: 2 },
      { label: 'ion weapon (+4)', damage: 4 },
    ] },
  { id: 'attack-combo-fire-and-strike', label: 'Attack Combo (Fire and Strike)',
    kind: 'circumstance', scope: 'any', weaponDice: 1,
    hint: 'Two consecutive hits on this target already this turn, in any mix of ranged and melee' },
  { id: 'inquisition', label: 'Inquisition', kind: 'circumstance', scope: 'any',
    attack: 1, weaponDice: 1, hint: 'Against a target with the Force Sensitivity feat' },
  { id: 'jedi-hunter', label: 'Jedi Hunter', kind: 'circumstance', scope: 'any',
    weaponDice: 1, hint: 'Against a target with the Force Sensitivity feat' },
  { id: 'dark-scourge', label: 'Dark Scourge', kind: 'circumstance', scope: 'any',
    attack: 1, hint: 'Against a Jedi' },
  { id: 'hunters-target', label: "Hunter's Target", kind: 'circumstance', scope: 'any',
    damageScale: 'level', note: CLASS_LEVEL,
    hint: 'Against the opponent you designated this encounter' },
  { id: 'familiar-foe', label: 'Familiar Foe', kind: 'circumstance', scope: 'any',
    attackScale: 'half-level', note: CLASS_LEVEL,
    hint: 'Species trait: you spent a full-round action observing this opponent' },
  { id: 'destructive-ambusher', label: 'Destructive Ambusher', kind: 'circumstance', scope: 'any',
    weaponDice: 1, hint: 'Against your prime target' },
  { id: 'ambush-specialist', label: 'Ambush Specialist', kind: 'circumstance', scope: 'any',
    attack: 2, hint: 'Against your prime target' },
  { id: 'vindication', label: 'Vindication', kind: 'circumstance', scope: 'any',
    weaponDice: 1, hint: 'Your next attack after an enemy you damaged went down' },
  { id: 'target-acquisition', label: 'Target Acquisition', kind: 'circumstance', scope: 'any',
    attack: 1, damage: 1, hint: 'Against your acquired target, while it stays in line of sight' },
  { id: 'targeting-package', label: 'Targeting Package', kind: 'circumstance', scope: 'any',
    attack: 2, damage: 2, hint: 'Two swift actions, for one attack at point-blank range or within reach' },
  { id: 'knowledge-is-strength', label: 'Knowledge is Strength', kind: 'circumstance', scope: 'any',
    attack: 2, hint: 'Against a target your Knowledge (Galactic Lore) check identified' },
  { id: 'retribution', label: 'Retribution', kind: 'circumstance', scope: 'any',
    attack: 2, hint: 'Against a target that moved an ally down the condition track' },
  { id: 'find-openings', label: 'Find Openings', kind: 'circumstance', scope: 'any',
    attack: 2, hint: 'Your next attack after being missed' },
  { id: 'omens', label: 'Omens', kind: 'circumstance', scope: 'any',
    attack: 2, hint: 'An ally rolled a natural 1 or 20 on an attack' },
  { id: 'revenge', label: 'Revenge', kind: 'circumstance', scope: 'any',
    attack: 2, damage: 2, hint: 'An ally of equal or higher level fell this encounter' },
  { id: 'for-the-cause', label: 'For the Cause', kind: 'circumstance', scope: 'any',
    attack: 2, damage: 2, hint: 'You or a nearby ally took damage past your damage threshold' },
  { id: 'predators-heritage', label: "Predator's Heritage", kind: 'circumstance', scope: 'any',
    damage: 2, hint: 'Species trait: the target has been damaged since your last turn began' },
  { id: 'mercenarys-teamwork', label: "Mercenary's Teamwork", kind: 'circumstance', scope: 'any',
    hint: '+2 damage for each ally that has damaged your target since your last turn',
    tiers: [
      { label: '1 ally', damage: 2 }, { label: '2 allies', damage: 4 },
      { label: '3 allies', damage: 6 }, { label: '4 allies', damage: 8 },
      { label: '5 allies', damage: 10 },
    ] },
  { id: 'consumed-by-darkness', label: 'Consumed by Darkness', kind: 'circumstance', scope: 'any',
    attack: 2, hint: 'Costs 5 Will Defense until the start of your next turn' },
  { id: 'fools-luck', label: "Fool's Luck", kind: 'circumstance', scope: 'any',
    attack: 1, hint: 'A Force Point spent on the attack-roll benefit' },
  { id: 'veteran-privateer', label: 'Veteran Privateer', kind: 'circumstance', scope: 'any',
    attack: 2, hint: 'Half your class level times per encounter, as a free action' },
  { id: 'personalized-modifications', label: 'Personalized Modifications', kind: 'circumstance',
    scope: 'any', attack: 1, damage: 2,
    hint: 'A powered weapon you tailored this encounter' },
  { id: 'relentless-attack', label: 'Relentless Attack', kind: 'circumstance', scope: 'any',
    perSpec: true, attack: 2, hint: 'Against a target you missed on your last attack' },
  { id: 'savage-attack', label: 'Savage Attack', kind: 'circumstance', scope: 'any',
    perSpec: true, needs: 'fullAttack', weaponDice: 1,
    hint: 'Every attack after the first hit of a full attack on the same target' },
  { id: 'separatist-military-training', label: 'Separatist Military Training',
    kind: 'circumstance', scope: 'any', attack: 1,
    hint: 'One attack per turn, while adjacent to an ally' },
  { id: 'pick-a-fight', label: 'Pick a Fight', kind: 'circumstance', scope: 'any', attack: 1,
    hint: 'The surprise round, and afterwards against anything damaged during it' },
  { id: 'starship-raider', label: 'Starship Raider', kind: 'circumstance', scope: 'any', attack: 1,
    hint: 'Aboard a starship' },
  { id: 'assault-tactics', label: 'Assault Tactics', kind: 'circumstance', scope: 'any',
    extraDice: '1d6', hint: 'A DC 15 Knowledge (Tactics) check named this target' },
  { id: 'deployment-tactics', label: 'Deployment Tactics', kind: 'circumstance', scope: 'any',
    attack: 1, hint: 'A DC 15 Knowledge (Tactics) check, against a flanked opponent' },
  { id: 'spotter', label: 'Spotter', kind: 'circumstance', scope: 'any', attack: 1,
    hint: 'A Perception check picked this target out' },
  { id: 'surveillance', label: 'Surveillance', kind: 'circumstance', scope: 'any', attack: 2,
    hint: 'A Perception check picked this target out' },
  { id: 'manifest-guardian-spirit', label: 'Manifest Guardian Spirit', kind: 'circumstance',
    scope: 'any', attack: 1, hint: 'Your Guardian Spirit is manifested within 12 squares' },
  { id: 'battle-meditation', label: 'Battle Meditation', kind: 'circumstance', scope: 'any',
    attack: 1, hint: 'A Force Point spent on Battle Meditation this encounter' },
  { id: 'jedi-battle-commander', label: 'Jedi Battle Commander', kind: 'circumstance', scope: 'any',
    replaces: 'battle-meditation', attack: 2,
    hint: 'Battle Meditation, raised from +1 to +2 by Jedi Battle Commander' },

  // Buying down the full-attack penalty. Repeatable, and the relief never turns into a bonus.
  { id: 'multiattack-proficiency-simple-weapons', label: 'Multiattack Proficiency (simple weapons)',
    kind: 'circumstance', scope: 'any', groups: ['simple-weapons'],
    needs: 'fullAttack', relieves: 'fullAttack', repeats: true, attack: 2,
    hint: 'Buys down the full-attack penalty with simple weapons' },
  { id: 'multiattack-proficiency-lightsabers', label: 'Multiattack Proficiency (lightsabers)',
    kind: 'circumstance', scope: 'any', groups: ['lightsabers'],
    needs: 'fullAttack', relieves: 'fullAttack', repeats: true, attack: 2,
    hint: 'Buys down the full-attack penalty with lightsabers' },
  { id: 'multiattack-proficiency-pistols', label: 'Multiattack Proficiency (pistols)',
    kind: 'circumstance', scope: 'any', groups: ['pistols'],
    needs: 'fullAttack', relieves: 'fullAttack', repeats: true, attack: 2,
    hint: 'Buys down the full-attack penalty with pistols' },
  { id: 'multiattack-proficiency-rifles', label: 'Multiattack Proficiency (rifles)',
    kind: 'circumstance', scope: 'any', groups: ['rifles'],
    needs: 'fullAttack', relieves: 'fullAttack', repeats: true, attack: 2,
    hint: 'Buys down the full-attack penalty with rifles' },
  { id: 'multiattack-proficiency-heavy-weapons', label: 'Multiattack Proficiency (heavy weapons)',
    kind: 'circumstance', scope: 'any', groups: ['heavy-weapons'],
    needs: 'fullAttack', relieves: 'fullAttack', repeats: true, attack: 2,
    hint: 'Buys down the full-attack penalty with heavy weapons' },
  { id: 'multiattack-proficiency-advanced-melee-weapons',
    label: 'Multiattack Proficiency (advanced melee weapons)',
    kind: 'circumstance', scope: 'any', groups: ['advanced-melee-weapons'],
    needs: 'fullAttack', relieves: 'fullAttack', repeats: true, attack: 2,
    hint: 'Buys down the full-attack penalty with advanced melee weapons' },
  { id: 'multiattack-proficiency-exotic-weapons', label: 'Multiattack Proficiency (exotic weapons)',
    kind: 'circumstance', scope: 'any', groups: ['exotic-weapons'],
    needs: 'fullAttack', relieves: 'fullAttack', repeats: true, attack: 2,
    hint: 'Buys down the full-attack penalty with exotic weapons' },
  { id: 'near-human-additional-arms', label: 'Additional Arms', kind: 'circumstance', scope: 'any',
    needs: 'fullAttack', relieves: 'fullAttack', attack: 2,
    hint: 'Species trait: buys down the full-attack penalty' },

  // ---------------------------------------------------------------------------
  // Force powers, where the tier is the Use the Force result.
  // ---------------------------------------------------------------------------
  { id: 'dark-rage', label: 'Dark Rage', kind: 'force', scope: 'melee',
    hint: 'Rage bonus to melee attack and damage, by Use the Force check',
    tiers: [
      { label: 'DC 15 (+2)', attack: 2, damage: 2 },
      { label: 'DC 20 (+4)', attack: 4, damage: 4 },
      { label: 'DC 25 (+6)', attack: 6, damage: 6 },
    ] },
  { id: 'battle-strike', label: 'Battle Strike', kind: 'force', scope: 'any',
    hint: '+1 attack and extra damage dice, by Use the Force check',
    note: 'Battle Strike: a Force Point spent on it deals an additional 2d6 on top of the tier rolled.',
    tiers: [
      { label: 'DC 15 (+1d6)', attack: 1, extraDice: '1d6' },
      { label: 'DC 20 (+2d6)', attack: 1, extraDice: '2d6' },
      { label: 'DC 25 (+3d6)', attack: 1, extraDice: '3d6' },
    ] },
  { id: 'prescience', label: 'Prescience', kind: 'force', scope: 'any',
    hint: 'Insight bonus against one target, by Use the Force check',
    tiers: [
      { label: 'DC 15 (+1)', attack: 1 },
      { label: 'DC 20 (+2)', attack: 2 },
      { label: 'DC 25 (+3)', attack: 3 },
    ] },
  { id: 'vornskrs-ferocity', label: "Vornskr's Ferocity", kind: 'force', scope: 'melee',
    weapon: 'lightsaber',
    hint: 'One lightsaber attack, extra dice by Use the Force check',
    tiers: [
      { label: 'DC 20 (+1 die)', weaponDice: 1 },
      { label: 'DC 25 (+2 dice)', weaponDice: 2 },
      { label: 'DC 30 (+3 dice)', weaponDice: 3 },
      { label: 'DC 35 (+4 dice)', weaponDice: 4 },
    ] },
  { id: 'contentious-opportunity', label: 'Contentious Opportunity', kind: 'force', scope: 'melee',
    hint: 'An attack of opportunity, extra dice by Use the Force check',
    tiers: [
      { label: 'DC 20 (+1 die)', weaponDice: 1 },
      { label: 'DC 25 (+2 dice)', weaponDice: 2 },
      { label: 'DC 30 (+3 dice)', weaponDice: 3 },
      { label: 'DC 35 (+4 dice)', weaponDice: 4 },
    ] },
  { id: 'twin-strike', label: 'Twin Strike', kind: 'force', scope: 'melee',
    weapon: 'lightsaber',
    hint: 'Wielding two lightsabers, by Use the Force check',
    // "If this attack hits, add the base damage of your other Lightsaber to the damage
    // roll" — dice from a second weapon, which no field here can name. Said out loud
    // instead, since it is the larger half of what the power does.
    note: 'Twin Strike also adds the base damage of your other lightsaber to the damage roll — '
      + 'the attack line cannot read a second weapon, so add those dice yourself — and a Force '
      + 'Point spent on it adds one more die.',
    tiers: [
      { label: 'DC 15 (no bonus)', attack: 0 },
      { label: 'DC 25 (+1)', attack: 1 },
      { label: 'DC 30 (+2)', attack: 2 },
    ] },
  { id: 'hawk-bat-swoop', label: 'Hawk-Bat Swoop', kind: 'force', scope: 'melee',
    weapon: 'lightsaber', weaponDice: 2,
    hint: 'A Force Point spent on the lightsaber attack at the end of the swoop' },
  { id: 'tempered-aggression', label: 'Tempered Aggression', kind: 'force', scope: 'melee',
    weapon: 'lightsaber', weaponDice: 2,
    hint: 'A Force Point spent on the attack — the dice are added after a critical doubles' },
];
