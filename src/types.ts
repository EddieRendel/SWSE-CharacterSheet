export type AbilityId = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITY_IDS: AbilityId[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export type AbilityScores = Record<AbilityId, number>;

/** A reference to a feature, optionally with a chosen specialization
 *  (e.g. Weapon Proficiency [rifles], Skill Focus [perception]). */
export interface FeatureRef {
  id: string;
  spec?: string;
  /**
   * Set on a feature the character has only through another one — the talent Stolen Form
   * stole. Display only: it is a real holding for every rules purpose.
   */
  via?: string;
  /**
   * Only meaningful inside a requirements block: the prerequisite must be held with the
   * *same* specialization currently being chosen. Greater Weapon Focus (rifles) requires
   * Weapon Focus (rifles) specifically, not Weapon Focus with any group.
   */
  matchingSpec?: boolean;
}

export interface Requirements {
  features?: FeatureRef[];
  /**
   * Alternatives: each entry is a list of options, any one of which satisfies it.
   * "Double Attack or Dual Weapon Mastery I" is one entry with two options.
   */
  anyOf?: Requirements[][];
  species?: string[];
  abilities?: Partial<Record<AbilityId, number>>;
  trainedSkills?: string[];
  baseAttackBonus?: number;
  level?: number;
  size?: string;
  darkSide?: boolean;
  /**
   * A number of talents drawn from particular trees — e.g. Elite Trooper wants one talent
   * from any of Armor Specialist, Commando, Critical Master, Mercenary or Weapon Specialist.
   * `force: true` means any of the Force talent trees instead.
   */
  talents?: { count: number; trees?: string[]; force?: boolean };
  forceTechniques?: number;
  /**
   * Hardware bolted to a droid chassis, rather than anything the character has learned:
   * "Hovering or Flying Locomotion", "2+ Appendages", "2+ Tool Appendages". `anyOf` names
   * system ids and one of them is enough; `appendages` counts them, narrowed to a single
   * `appendageType` when the rule asks for a particular kind.
   */
  droidSystems?: { anyOf?: string[]; appendages?: number; appendageType?: string };
  matchingWeaponGroupProficiency?: boolean;
  matchingWeaponProficiency?: boolean;
  matchingForcePower?: boolean;
  matchingTrainedSkill?: boolean;
  matchingUntrainedSkill?: boolean;
  matchingClassSkill?: boolean;
}

export type FeatureType =
  | 'feat' | 'talent' | 'trait'
  | 'force-power' | 'force-secret' | 'force-technique' | 'starship-maneuver';

/**
 * A Combined Feat: a pair of feats that does something extra for anyone holding both.
 *
 * "Combined Feat" is the Knights of the Old Republic Campaign Guide's own term, and the one
 * the UI uses, because the compendium prints the very same phrase inside the description of
 * each feat involved — a card headed anything else would read as a second, unrelated rule.
 * `combo` is kept as the name in code, which is what everyone calls them at the table.
 *
 * These are not feats and cost no slot: the benefit is simply on once both halves are held,
 * and off again if either is changed away. The source spreadsheets file each one twice, once
 * under each half, which is why the imported data carried two entries per combo that each
 * named only the *other* feat as a prerequisite; those rows are hidden in supplement.json and
 * the real thing lives in combos.json, written once with both halves named.
 *
 * A half with no `spec` is satisfied by any specialization — Weapon Focus counts whichever
 * weapon group it was taken for. One that names a spec must match it exactly.
 */
export interface FeatCombo {
  id: string;
  name: string;
  /**
   * Every book that prints this interaction. Allowing any ONE of them is enough: these are
   * alternative printings of a single rule, not conditions to be met together.
   *
   * Most are the KotOR Campaign Guide's alone, but two are also printed by the book their
   * second half comes from, in that feat's own entry and with no reference back to KotOR —
   * Follow Through's Special grants the Cleave interaction in the Jedi Academy Training
   * Manual, and Return Fire's description grants the Combat Reflexes one in the Legacy Era
   * Campaign Guide. Filed under KotOR alone, a Core + Jedi Academy character would hold
   * Follow Through and be refused a rule printed in the entry they are reading.
   */
  sources: { book: string; page?: number }[];
  /** The feats that must all be held, in the order they should be read. */
  features: FeatureRef[];
  /** What holding all of them gets you. */
  effect: string[];
  /** Only a one-line summary is available, not the full rules text. */
  summaryOnly?: boolean;
}

/**
 * One kind of action a turn is spent on, and one generic action of that kind — the Core
 * Rulebook's Actions in Combat, transcribed.
 *
 * None of it is character-specific and nothing derives from it: the engine never reads these,
 * the sheet only shows them, the way `RULES.defenses` is shown rather than computed with. It
 * answers the question the sheet could not before — how much do I get to do in a turn — which
 * is the same for everybody at the table.
 */
export interface TurnActionKind {
  id: string;
  name: string;
  page?: number;
  /**
   * How much of a turn this kind spends: 4 for a Full-Round Action, which is all of it, down
   * to 0 for a Free Action or a Reaction, which cost none and can happen when it is not even
   * your turn.
   *
   * The books print no such number — it is the ladder the kinds already form, written down so
   * the sheet can shade them by weight. The palette leaves only the accent to spend (green,
   * blue, purple and amber all mean something else), so the one colour is spent at six
   * strengths rather than six colours being invented.
   */
  cost: number;
  /** The book's own framing: how many of this kind a turn holds, and what trades for what. */
  description: string[];
}

export interface TurnAction {
  id: string;
  name: string;
  /**
   * Every kind this is listed under, in the book's order.
   *
   * Plural because the book files some actions under two headings — aiming is a swift action
   * or a move action. A single-valued `kind` would force the same quoted paragraph into two
   * entries, and two copies of book text that must stay in step is the thing quoting it
   * rather than paraphrasing it is meant to avoid.
   */
  kinds: string[];
  page?: number;
  description: string[];
  /**
   * A block of `RULES.sizeModifiers` to show under the text, named rather than restated.
   *
   * Grapple's entry ends "size modifiers for Grapple checks are as follows" and then a table
   * this file already holds — and rules.json is the single definition of the size modifiers.
   * Transcribing the numbers a second time would leave two copies to correct, so the entry
   * names the block and the dialog renders it.
   */
  sizeModifiers?: string;
  /**
   * Feats and talents the entry names, as ids — Disarm points at Improved Disarm, Full Attack
   * at Double and Triple Attack.
   *
   * Listed rather than marked up inside the prose: the text is transcribed from the book and
   * threading anchors through it would mean editing a quotation, and `RulesText` hands each
   * line to `dangerouslySetInnerHTML` with nothing wired to a click. As ids they open the same
   * rules dialog as everywhere else, prerequisites included, and a test can check they resolve.
   */
  features?: string[];
}

export interface Feature {
  id: string;
  name: string;
  book: string;
  type: FeatureType;
  description: string[];
  prerequisites?: string;
  benefit?: string[];
  special?: string[];
  normal?: string[];
  requirements?: Requirements;
  grants?: { classSkills?: string[]; trainedSkills?: string[] };
  multiple?: boolean;
  maxCount?: number;
  /** The kind of choice this feature asks you to make when you take it. */
  specType?: 'weapon-group' | 'weapon' | 'skill' | 'force-power'
    | 'talent' | 'force-secret' | 'force-technique' | 'option';
  allowedSpecs?: string[];
  /** For a talent choice: the trees it may come from. */
  specTrees?: string[];
  /**
   * For a `weapon` choice: the weapon group it must come from. Exotic Weapon Proficiency
   * chooses "a single Exotic Weapon", which is every weapon in the exotic group and not a
   * list written down here — a re-import that adds one must put it on offer too.
   */
  specWeaponGroup?: string;
  /**
   * The chosen option is gained outright, not merely referred to. Stolen Form says "you gain
   * the benefits of this Talent and are considered to have this Talent for the purpose of
   * satisfying prerequisites"; Share Talent and Force Power Mastery, which also choose a
   * feature, only qualify one you already hold and must not carry this.
   */
  specGrants?: boolean;
  /** "…that you already possess": only offer what the character already has. */
  specHeld?: boolean;
  /** "…one Trained Skill": only offer skills the character is trained in. */
  specTrained?: boolean;
  /** For `option`: a list that exists only in the rules text. */
  specOptions?: { id: string; name: string }[];
  // Descriptors — mostly on Force powers, and mechanically relevant at the table.
  lightsaberForm?: boolean;
  darkSide?: boolean;
  lightSide?: boolean;
  telekinetic?: boolean;
  mindAffecting?: boolean;
  /** True when the upstream data referenced this entry but never defined it. */
  incomplete?: boolean;
  /** Page number in its sourcebook. */
  page?: number;
  /** Only a one-line summary is available, not the full rules text. */
  summaryOnly?: boolean;
  /** Prerequisite phrases the importer could not turn into machine-checked rules. */
  unparsedPrerequisites?: string[];
  /**
   * Hidden from the pickers because it depends on content this app doesn't model —
   * a Force tradition, a droid character, or a species outside the supported list.
   * Kept in the data so it becomes available if that content is added.
   */
  hidden?: boolean;
  hiddenReason?: string;
}

export interface TalentTree {
  id: string;
  name: string;
  description?: string[];
  icon?: string;
  force?: boolean;
  features: FeatureRef[];
  incomplete?: boolean;
  /** The class or category the sheet lists this tree under. */
  group?: string;
  hidden?: boolean;
  hiddenReason?: string;
}

/** One selectable slot granted at a given class level. */
export interface ClassChoice {
  id: 'talent' | 'bonus' | 'force-technique' | 'force-secret' | 'starship-maneuver' | string;
  name: string;
  classId?: string;
}

export interface CharacterClass {
  id: string;
  name: string;
  icon?: string;
  prestige: boolean;
  /** Sourcebook this class comes from. */
  book?: string;
  fullBaseAttackBonus?: boolean;
  startingHitPoints?: number;
  hitDie: number;
  forcePoints?: number;
  /** [Reflex, Fortitude, Will] */
  defenseBonuses: [number, number, number];
  maxLevel: number;
  baseSkills?: number;
  classSkills?: string[];
  requirements?: Requirements;
  trees?: { bonus?: string[]; starting?: string[]; talent?: string[] };
  /** features[classLevel - 1] = features granted automatically at that level */
  features?: FeatureRef[][];
  /** choices[classLevel - 1] = selectable slots granted at that level */
  choices?: ClassChoice[][];
}

export interface DroidSystem {
  id: string;
  name: string;
  category: 'locomotion' | 'appendage' | 'processor' | 'communications' | 'sensor'
    | 'translator' | 'shield' | 'station' | 'accessory';
  /** Often a size-scaled formula rather than a plain number. */
  cost?: string;
  weight?: string;
  availability?: string;
  appendages?: number;
  appendageType?: string;
  baseSpeed?: number;
  unarmedDamage?: string;
  actsAs?: string;
  requires?: string[];
  description?: string[];
}

export interface DroidDegree {
  id: string;
  name: string;
  abilities: Partial<Record<AbilityId, number>>;
  roles: string;
  tree: string;
}

export interface DroidSize {
  id: string;
  playable: boolean;
  abilities: Partial<Record<AbilityId, number>>;
  reflex: number;
  stealth: number;
  extraHitPoints: number;
  damageThreshold: number;
  carry: number;
  costFactor: number;
  locomotion: string;
}

export interface Species {
  id: string;
  name: string;
  size: string;
  speed: number;
  /** Sourcebook and page, from the Omegadex index. */
  book?: string;
  page?: number;
  description?: string[];
  /** Droid models need droid rules the app does not implement. */
  hidden?: boolean;
  hiddenReason?: string;
  /** A species built by choosing traits rather than a fixed stat block. */
  template?: 'near-human' | 'droid';
  abilities?: Partial<Record<AbilityId, number>>;
  features?: FeatureRef[];
  languages?: string[];
  bonusFeat?: boolean;
  bonusSkill?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  modifier: AbilityId;
  armorCheck?: boolean;
}

export interface EquipmentItem {
  id: string;
  name: string;
  category: 'weapon' | 'armor' | 'gear';
  book?: string;
  /** Page in that sourcebook, wherever the Omegadex indexed it — 347 of 535 items. */
  page?: number;
  /** How the book attribution was arrived at, when it was not a direct index hit. */
  attribution?: string;
  weight: number;
  cost: number;
  notes?: string;
  // weapon
  group?: string;
  damage?: string;
  damageType?: string;
  /** Can be switched between normal and stun damage as a swift action. */
  stun?: boolean;
  /** The dice on the stun setting, when they differ from the normal ones. */
  stunDamage?: string;
  size?: string;
  rateOfFire?: string;
  area?: string;
  /** Rounds between firing and detonation, for indirect-fire ordnance like mortar shells. */
  delay?: string;
  twoHanded?: boolean;
  /**
   * Hurled rather than swung or fired: the attack roll is a ranged one. Nothing in the
   * compendium marks this — "Special: Can be Thrown" is prose — so it is set by hand on
   * the copy you carry.
   */
  thrown?: boolean;
  // armor
  armorType?: 'light' | 'medium' | 'heavy';
  reflex?: number;
  fortitude?: number;
  maxDex?: number;
  /** user-created rather than from the bundled data */
  custom?: boolean;
}

/**
 * One modification fitted to a single carried item: a lightsaber crystal, an armor
 * upgrade such as a helmet package, the bonus an attunement talent or a Sith talisman
 * grants. The numbers are the player's to enter and are applied as written — the app has
 * no way to know which of them are equipment bonuses that would not stack at the table.
 */
export const UPGRADE_NUMBERS = [
  'attack', 'damage', 'reflexDefense', 'fortitudeDefense', 'willDefense', 'weight', 'cost',
] as const;

/** The numbers an upgrade may carry; the rest of it is a name, dice and a note. */
export type UpgradeNumber = typeof UPGRADE_NUMBERS[number];

export interface ItemUpgrade {
  id: string;
  name: string;
  /** Bonus on attack rolls made with this weapon. */
  attack?: number;
  /** Bonus on its damage rolls. */
  damage?: number;
  /** Extra dice rolled alongside the weapon's own, e.g. "1d6". */
  damageDice?: string;
  /** Bonus to the bearer's defenses while the item is worn or wielded. */
  reflexDefense?: number;
  fortitudeDefense?: number;
  willDefense?: number;
  /** Added to the item's own weight and cost. */
  weight?: number;
  cost?: number;
  notes?: string;
}

/**
 * What an item is rather than what it is like: which catalogue entry it is, what kind of
 * thing, and where it was printed. Rewriting these on a copy is not customization but a
 * different item, so they are the keys an override may not carry.
 */
export const ITEM_IDENTITY_KEYS = ['id', 'category', 'custom', 'book', 'page', 'attribution'] as const;

/** Stats of the item itself that a player may rewrite on their copy. */
export type ItemOverrides = Partial<Omit<EquipmentItem, typeof ITEM_IDENTITY_KEYS[number]>>;

/**
 * How one character's copy of an item differs from the catalogue entry. Kept on the
 * inventory entry rather than on the item, so upgrading one blaster does not upgrade
 * every other copy of that model in the galaxy.
 */
export interface ItemCustomization {
  /** Only the keys the player actually changed; the rest are inherited. */
  overrides?: ItemOverrides;
  upgrades?: ItemUpgrade[];
}

/** An item as one character actually carries it, with their changes already applied. */
export interface ResolvedItem extends EquipmentItem {
  /** The inventory entry it came from, present only on a customized copy. */
  entryUid?: string;
  upgrades?: ItemUpgrade[];
  /** True when an override or an upgrade changed something. */
  modified?: boolean;
}

export interface InventoryEntry {
  uid: string;
  itemId: string;
  quantity: number;
  equipped: boolean;
  /** Set once the player customizes this copy — see ItemCustomization. */
  mods?: ItemCustomization;
}

/** A selection the player made to fill a class-granted choice slot. */
export interface Selection {
  /** `${characterLevelIndex}:${choiceIndex}` */
  key: string;
  choiceId: string;
  featureId: string;
  spec?: string;
}

export interface LevelEntry {
  classId: string;
  /** hit points gained at this level (0 for the very first level, which uses the class's fixed value) */
  hitPoints?: number;
}

export interface Character {
  id: string;
  name: string;
  playerName: string;
  speciesId: string | null;
  /**
   * Portrait: either `class:<classId>` to reuse a class icon, or a `data:` URL for an
   * uploaded image. Uploads are downscaled before storing, since characters live in
   * localStorage and a full-size photo would blow the quota.
   */
  portrait: string | null;
  /**
   * Near-Human build (Unknown Regions p.17). A Near-Human uses the Human chassis and
   * trades either its bonus feat or its bonus trained skill for one Near-Human trait,
   * plus up to three purely cosmetic variations.
   */
  nearHuman: {
    trait: string | null;
    /** Which Human benefit was given up to pay for the trait. */
    sacrifice: 'feat' | 'skill' | null;
    cosmetic: string[];
  };
  /**
   * Droid build. Droids have no Constitution score, choose their degree and size,
   * and derive speed from their locomotion system.
   */
  droid: {
    degree: string | null;
    size: string;
    /** Installed droid system ids; duplicates are allowed (two Tool appendages). */
    systems: string[];
  };
  /**
   * Sourcebooks this character may draw from. `null` means every book.
   * Already-selected content is never removed by narrowing this — it only limits
   * what new pickers offer.
   */
  allowedBooks: string[] | null;
  /** Base scores before species modifiers and level increases. */
  baseAbilities: AbilityScores;
  /** Ability increases taken at 4th/8th/12th/16th/20th level: level -> ability ids */
  abilityIncreases: Record<string, AbilityId[]>;
  levels: LevelEntry[];
  selections: Selection[];
  trainedSkills: string[];
  languages: string[];
  inventory: InventoryEntry[];
  customItems: EquipmentItem[];
  credits: number;
  forcePointsSpent: number;
  /**
   * Force powers spent this encounter, by power id. Each copy of a power in the suite is
   * one use, so taking Move Object twice means two uses before it is exhausted.
   */
  powersSpent: Record<string, number>;
  destinyPoints: number;
  destiny: string;
  darkSideScore: number;
  damage: number;
  conditionIndex: number;
  secondWindUsed: boolean;
  traits: {
    age: string; gender: string; height: string; weight: string;
    eyes: string; hair: string; skin: string;
    homeworld: string; affiliation: string;
    appearance: string; personality: string; background: string;
  };
  notes: string;
  createdAt: number;
  updatedAt: number;
}
