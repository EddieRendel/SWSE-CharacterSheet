export type AbilityId = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITY_IDS: AbilityId[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export type AbilityScores = Record<AbilityId, number>;

/** A reference to a feature, optionally with a chosen specialization
 *  (e.g. Weapon Proficiency [rifles], Skill Focus [perception]). */
export interface FeatureRef {
  id: string;
  spec?: string;
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
  // armor
  armorType?: 'light' | 'medium' | 'heavy';
  reflex?: number;
  fortitude?: number;
  maxDex?: number;
  /** user-created rather than from the bundled data */
  custom?: boolean;
}

export interface InventoryEntry {
  uid: string;
  itemId: string;
  quantity: number;
  equipped: boolean;
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
  /** Extra trained skill from a species bonus (e.g. Human). */
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
