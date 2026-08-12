/**
 * Hand-verified checks of the rules engine.
 * Run with: npm run test:rules
 */
import { computeCharacter, abilityMod, buildSlots, hasFeature, featureAvailable, isBookAllowed, forcePowerUses } from './engine';
import { checkClassRequirements, canSelect, checkRequirements } from './prereqs';
import { specOptionsFor, SPEC_LABELS } from './specs';
import {
  buildAttack, buildAttacks, buildPowers, buildForcePointAbilities, forcePointDice,
  defaultAttackOptions, unarmedDamage, SITUATIONAL,
} from './attacks';
import { newCharacter } from '../storage';
import type { Character, AbilityId, Feature } from '../types';
import { FEATURES, CLASSES, TALENT_TREES, SPECIES, EQUIPMENT, WEAPON_GROUPS, LANGUAGES, BOOK_NAMES, NEAR_HUMAN, DROIDS, ICONS, featureIcon, featureName, classIcon, weaponIcon, portraitUrl } from '../data';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0, failed = 0;
const results: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; results.push(`  ok   ${label} = ${JSON.stringify(actual)}`); }
  else { failed++; results.push(`  FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

/** Requirements for a feature, evaluated against a character. */
const checkRequirementsFor = (id: string, char: Character, derived: ReturnType<typeof computeCharacter>) =>
  checkRequirements(FEATURES[id].requirements, char, derived);

function make(fn: (c: Character) => void): Character {
  const c = newCharacter('Test');
  fn(c);
  return c;
}

const setAbilities = (c: Character, s: Partial<Record<AbilityId, number>>) =>
  Object.assign(c.baseAbilities, s);

// ---------------------------------------------------------------------------
console.log('\n▸ Human Soldier 1 (Str 14 Dex 13 Con 14 Int 10 Wis 12 Cha 8)');
// ---------------------------------------------------------------------------
{
  const c = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 14, dex: 13, con: 14, int: 10, wis: 12, cha: 8 });
    x.levels = [{ classId: 'soldier' }];
  });
  const d = computeCharacter(c);

  check('level', d.level, 1);
  check('Con modifier', d.mods.con, 2);
  // Soldier starting hit points 30, plus Con modifier.
  check('max hit points', d.maxHitPoints, 32);
  // Full BAB class at 1st level.
  check('base attack bonus', d.baseAttackBonus, 1);
  // Reflex 10 + 1 heroic + 1 class + 1 Dex
  check('Reflex Defense', d.defenses.reflex, 13);
  // Fortitude 10 + 1 heroic + 2 class + 2 Con
  check('Fortitude Defense', d.defenses.fortitude, 15);
  // Will 10 + 1 heroic + 0 class + 1 Wis
  check('Will Defense', d.defenses.will, 12);
  // Medium size adds nothing to damage threshold.
  check('damage threshold', d.damageThreshold, 15);
  // Soldier 3 base + Int 0 + human bonus skill 1
  check('trained skills allowed', d.trainedSkillsAllowed, 4);
  check('Force points', d.forcePoints, 5);
  check('speed', d.speed, 6);
  // Second wind is the better of a quarter of max hp (8) and the Con score (14).
  check('second wind', d.secondWind, 14);
  // Human grants a bonus feat, and 1st level grants a general feat.
  check('feat slots at level 1', d.slots.filter(s => s.kind === 'feat' || s.kind === 'species-feat').length, 2);
  // Soldier starting feats: from the soldier-starting tree.
  check(
    'starting feats granted',
    d.slots.filter(s => s.kind === 'starting-feat').length,
    TALENT_TREES['soldier-starting'].features.length,
  );
}

// ---------------------------------------------------------------------------
console.log('\n▸ Wookiee species modifiers');
// ---------------------------------------------------------------------------
{
  const c = make(x => {
    x.speciesId = 'wookiee';
    setAbilities(x, { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 });
    x.levels = [{ classId: 'soldier' }];
  });
  const d = computeCharacter(c);
  // Wookiee: +4 Str, +2 Con, −2 Dex, −2 Wis, −2 Cha
  check('Strength', d.abilities.str, 18);
  check('Dexterity', d.abilities.dex, 12);
  check('Constitution', d.abilities.con, 16);
  check('Wisdom', d.abilities.wis, 8);
  check('Charisma', d.abilities.cha, 8);
  check('hit points (30 + 3 Con)', d.maxHitPoints, 33);
  check('species traits granted', d.slots.filter(s => s.kind === 'species-trait').length, SPECIES.wookiee.features!.length);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Multiclass: Jedi 7 / Jedi Knight 3');
// ---------------------------------------------------------------------------
{
  const c = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 12, dex: 14, con: 12, int: 12, wis: 14, cha: 12 });
    x.levels = [
      ...Array(7).fill(null).map(() => ({ classId: 'jedi', hitPoints: 6 })),
      ...Array(3).fill(null).map(() => ({ classId: 'jedi-knight', hitPoints: 6 })),
    ];
  });
  const d = computeCharacter(c);

  check('character level', d.level, 10);
  // Both classes are full BAB: 7 + 3.
  check('base attack bonus', d.baseAttackBonus, 10);
  // Jedi 30 + Con 1 for level 1, then 9 levels of 6 + 1.
  check('max hit points', d.maxHitPoints, 30 + 1 + 9 * 7);
  // Defense bonuses take the best class value, never the sum:
  // Jedi is +1/+1/+1, Jedi Knight is +2/+2/+2, so +2 each.
  // Reflex 10 + 10 heroic + 2 class + 2 Dex
  check('Reflex Defense', d.defenses.reflex, 24);
  // Fortitude 10 + 10 + 2 + 1 Con
  check('Fortitude Defense', d.defenses.fortitude, 23);
  // Will 10 + 10 + 2 + 2 Wis
  check('Will Defense', d.defenses.will, 24);
  // Only the first class grants trained skills: Jedi 2 + Int 1 + human 1.
  check('trained skills allowed', d.trainedSkillsAllowed, 4);
  // Starting feats come only from the first class, so Jedi's three, not both classes'.
  check('starting feats', d.slots.filter(s => s.kind === 'starting-feat').length, 3);
  // Feats at levels 1, 3, 6, 9.
  check('general feat slots', d.slots.filter(s => s.kind === 'feat').length, 4);
  // Ability increases at 4 and 8.
  check('ability increase levels', [4, 8].filter(l => l <= d.level).length, 2);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Armor replaces the heroic level bonus to Reflex');
// ---------------------------------------------------------------------------
{
  const base = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 12, dex: 16, con: 12, int: 10, wis: 10, cha: 10 });
    x.levels = Array(8).fill(null).map(() => ({ classId: 'soldier', hitPoints: 6 }));
  });

  const noArmor = computeCharacter(base);
  // 10 + 8 heroic + 1 class + 3 Dex
  check('Reflex without armor', noArmor.defenses.reflex, 22);

  const armored = structuredClone(base);
  // Combat jumpsuit: +4 Reflex, +1 Fortitude, max Dex +4.
  armored.inventory = [{ uid: 'a', itemId: 'combat-jumpsuit', quantity: 1, equipped: true }];
  const dArm = computeCharacter(armored);
  // Armor replaces the heroic level bonus even though it is worse: 10 + 4 + 1 + 3
  check('Reflex with armor, no Armored Defense', dArm.defenses.reflex, 18);
  // The Combat Jumpsuit grants no Fortitude bonus — the hand-written +1 I had
  // originally was wrong, and the imported data corrected it.
  check('armor Fortitude bonus applied', dArm.defenses.fortitude, 10 + 8 + 2 + 1 + (EQUIPMENT['combat-jumpsuit'].fortitude ?? 0));
  check('Combat Jumpsuit has no Fortitude bonus', EQUIPMENT['combat-jumpsuit'].fortitude, 0);

  // Max Dex cap: a high Dex is limited by the armor.
  const capped = structuredClone(armored);
  capped.baseAbilities.dex = 20; // +5, capped to +4
  const dCap = computeCharacter(capped);
  check('Dex capped by armor maxDex', dCap.defenses.reflex, 10 + 4 + 1 + 4);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Prestige class requirements gate correctly');
// ---------------------------------------------------------------------------
{
  const weak = make(x => {
    x.speciesId = 'human';
    x.levels = [{ classId: 'jedi' }];
  });
  const dWeak = computeCharacter(weak);
  check('Jedi Knight locked at level 1', checkClassRequirements('jedi-knight', weak, dWeak).met, false);

  // Jedi 7 has BAB +7, Force Sensitivity and lightsaber proficiency from starting feats,
  // and needs Use the Force trained.
  const ready = make(x => {
    x.speciesId = 'human';
    x.levels = Array(7).fill(null).map(() => ({ classId: 'jedi', hitPoints: 6 }));
    x.trainedSkills = ['use-the-force'];
  });
  const dReady = computeCharacter(ready);
  const req = checkClassRequirements('jedi-knight', ready, dReady);
  check('Jedi Knight unlocked at Jedi 7 with Use the Force', req.met, true);
  if (!req.met) results.push('       ' + req.checks.filter(c => !c.met).map(c => c.text).join('; '));
}

// ---------------------------------------------------------------------------
console.log('\n▸ Feat prerequisites');
// ---------------------------------------------------------------------------
{
  const c = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 });
    x.levels = [{ classId: 'soldier' }];
  });
  const d = computeCharacter(c);

  // Cleave needs Strength 13 and Power Attack; this character has neither.
  const cleave = canSelect('cleave', c, d);
  check('Cleave blocked without Str 13 + Power Attack', cleave.met, false);
  check('Cleave reports two failures', cleave.checks.filter(x => !x.met).length, 2);

  // Skill Focus requires the chosen skill to be trained.
  const untrained = canSelect('skill-focus', c, d, 'perception');
  check('Skill Focus blocked on an untrained skill', untrained.met, false);

  const c2 = structuredClone(c);
  c2.trainedSkills = ['perception'];
  const d2 = computeCharacter(c2);
  check('Skill Focus allowed once trained', canSelect('skill-focus', c2, d2, 'perception').met, true);

  // The "levle" typo fix: Superior Tech must now enforce its level requirement.
  check('superior-tech has a level requirement', FEATURES['superior-tech'].requirements?.level, 9);
  check('superior-tech typo removed', 'levle' in (FEATURES['superior-tech'].requirements as object), false);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Species prerequisites resolve against species, not features');
// ---------------------------------------------------------------------------
{
  const speciesGated = Object.values(FEATURES).filter(f => f.requirements?.species?.length);
  check('at least one species-gated feature exists', speciesGated.length > 0, true);

  const f = speciesGated.find(x => x.requirements!.species!.includes('wookiee'));
  if (f) {
    const human = make(x => { x.speciesId = 'human'; x.levels = [{ classId: 'soldier' }]; });
    const wook = make(x => { x.speciesId = 'wookiee'; x.levels = [{ classId: 'soldier' }]; });
    const dh = computeCharacter(human), dw = computeCharacter(wook);
    const humanCheck = canSelect(f.id, human, dh).checks.find(c => c.text.startsWith('Species'));
    const wookCheck = canSelect(f.id, wook, dw).checks.find(c => c.text.startsWith('Species'));
    check(`"${f.name}" blocked for a Human`, humanCheck?.met, false);
    check(`"${f.name}" allowed for a Wookiee`, wookCheck?.met, true);
  }
}

// ---------------------------------------------------------------------------
console.log('\n▸ Force Sensitivity opens the Force talent trees on any talent slot');
// ---------------------------------------------------------------------------
{
  const talentPool = (c: Character) => {
    const d = computeCharacter(c);
    const slot = d.slots.find(s => s.kind === 'talent');
    return new Set((slot?.pool ?? []).map(r => r.id));
  };

  // A plain Soldier has no access to Force talents.
  const soldier = make(x => {
    x.speciesId = 'human';
    x.levels = [{ classId: 'soldier' }];
  });
  const plain = talentPool(soldier);
  check('Soldier pool excludes Telekinetic Power', plain.has('telekinetic-power'), false);
  check('Soldier pool excludes Force Perception', plain.has('force-perception'), false);
  check('Soldier pool has its own talents', plain.has('armored-defense'), true);
  check('Soldier is not Force-sensitive', computeCharacter(soldier).forceSensitive, false);

  // Taking Force Sensitivity with the level 1 feat slot opens all four Force trees.
  const forceSoldier = structuredClone(soldier);
  forceSoldier.selections = [
    { key: 'feat:1', choiceId: 'feat', featureId: 'force-sensitivity' },
  ];
  const opened = talentPool(forceSoldier);
  check('Force Sensitivity is detected', computeCharacter(forceSoldier).forceSensitive, true);
  check('Alter talent now offered', opened.has('telekinetic-power'), true);
  check('Control talent now offered', opened.has('force-focus'), true);
  check('Sense talent now offered', opened.has('force-perception'), true);
  check('Dark Side talent now offered', opened.has('power-of-the-dark-side'), true);
  check('class talents still offered', opened.has('armored-defense'), true);

  // Tradition-specific trees stay out — they belong to their own prestige classes.
  check('Dathomiri Witch talent not offered', opened.has('adept-spellcaster'), false);
  check('Jensaarai talent not offered', opened.has('force-cloak'), false);

  // A Jedi gets Force Sensitivity as a starting feat, so it applies without any choice.
  const jedi = make(x => {
    x.speciesId = 'human';
    x.levels = [{ classId: 'jedi' }];
  });
  check('Jedi is Force-sensitive from starting feats', computeCharacter(jedi).forceSensitive, true);
  check('Jedi talent pool includes Sense', talentPool(jedi).has('force-perception'), true);

  // Non-talent slots are unaffected: a bonus feat slot must not gain talents.
  const dBonus = computeCharacter(forceSoldier);
  const bonusSlot = dBonus.slots.find(s => s.kind === 'bonus');
  check('bonus feat pool excludes Force talents',
    (bonusSlot?.pool ?? []).some(r => r.id === 'telekinetic-power'), false);

  // No duplicates when a class already lists a Force tree (Force Adept).
  const adept = make(x => {
    x.speciesId = 'human';
    x.levels = [
      ...Array(7).fill(null).map(() => ({ classId: 'jedi', hitPoints: 6 })),
      { classId: 'force-adept', hitPoints: 5 },
    ];
    x.trainedSkills = ['use-the-force'];
  });
  const adeptSlots = computeCharacter(adept).slots.filter(s => s.kind === 'talent');
  const adeptPool = adeptSlots[adeptSlots.length - 1]?.pool ?? [];
  const ids = adeptPool.map(r => r.id);
  check('Force Adept pool has no duplicates', ids.length, new Set(ids).size);
  check('Force Adept pool includes Force talents', ids.includes('telekinetic-power'), true);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Force Training grants 1 + Wis modifier Force powers');
// ---------------------------------------------------------------------------
{
  const powerSlots = (c: Character) =>
    computeCharacter(c).slots.filter(s => s.kind === 'force-power');

  // Jedi 1, Wisdom 14 (+2), Force Training taken with the level 1 feat.
  const jedi = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 10, dex: 12, con: 12, int: 10, wis: 14, cha: 12 });
    x.levels = [{ classId: 'jedi' }];
    x.trainedSkills = ['use-the-force'];
    x.selections = [{ key: 'feat:1', choiceId: 'feat', featureId: 'force-training' }];
  });
  check('Wisdom +2 grants 3 powers', powerSlots(jedi).length, 3);
  check('powers reported per training feat', computeCharacter(jedi).forcePowersPerTraining, 3);
  check('one Force Training feat counted', computeCharacter(jedi).forceTrainingCount, 1);

  // Without the feat there are no Force power slots at all.
  const noTraining = structuredClone(jedi);
  noTraining.selections = [];
  check('no powers without Force Training', powerSlots(noTraining).length, 0);

  // Wisdom 10 (+0) still grants the minimum of 1.
  const dullWits = structuredClone(jedi);
  dullWits.baseAbilities.wis = 8; // −1 modifier
  check('minimum of 1 power at negative Wis', powerSlots(dullWits).length, 1);

  // Taking Force Training twice doubles the grant.
  const twice = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 10, dex: 12, con: 12, int: 10, wis: 14, cha: 12 });
    x.levels = Array(3).fill(null).map(() => ({ classId: 'jedi', hitPoints: 6 }));
    x.trainedSkills = ['use-the-force'];
    x.selections = [
      { key: 'feat:1', choiceId: 'feat', featureId: 'force-training' },
      { key: 'feat:3', choiceId: 'feat', featureId: 'force-training' },
    ];
  });
  check('two Force Training feats grant 6 powers', powerSlots(twice).length, 6);
  check('two feats counted', computeCharacter(twice).forceTrainingCount, 2);

  // A Wisdom increase re-grants powers, which Saga Edition calls out explicitly.
  const wiser = structuredClone(jedi);
  wiser.baseAbilities.wis = 16; // +3
  check('raising Wisdom grants another power', powerSlots(wiser).length, 4);

  // Powers are chosen from the Force power list, and the same power may be taken twice.
  const slot = powerSlots(jedi)[0];
  check('Force power slot has no fixed pool', slot.pool, null);
  const d = computeCharacter(jedi);
  check('Move Object is selectable', canSelect('move-object', jedi, d).met, true);

  const withPower = structuredClone(jedi);
  withPower.selections.push({ key: slot.key, choiceId: 'force-power', featureId: 'move-object' });
  const d2 = computeCharacter(withPower);
  check('chosen power appears in the suite', d2.forcePowers.some(p => p.id === 'move-object'), true);
  check('the same power can be taken again', canSelect('move-object', withPower, d2).met, true);
  // Feats, by contrast, still cannot be duplicated.
  check('non-repeatable feats still blocked', canSelect('force-sensitivity', withPower, d2).duplicate, true);

  // Removing the granting feat removes its power slots.
  const undone = structuredClone(withPower);
  undone.selections = undone.selections.filter(s => s.featureId !== 'force-training');
  check('dropping Force Training removes the slots', powerSlots(undone).length, 0);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Talent slots are grouped by tree');
// ---------------------------------------------------------------------------
{
  const forceSoldier = make(x => {
    x.speciesId = 'human';
    x.levels = [{ classId: 'soldier' }];
    x.selections = [{ key: 'feat:1', choiceId: 'feat', featureId: 'force-sensitivity' }];
  });
  const slot = computeCharacter(forceSoldier).slots.find(s => s.kind === 'talent')!;
  const groups = slot.treeGroups ?? [];

  check('talent slot exposes tree groups', groups.length > 0, true);
  const classGroups = groups.filter(g => g.category === 'class');
  const forceGroups = groups.filter(g => g.category === 'force');
  check('Soldier class trees present', classGroups.length, CLASSES.soldier.trees!.talent!.length);
  check('six universal Force trees present', forceGroups.length, 6);
  check('Force groups are the right trees',
    forceGroups.map(g => g.treeId).sort(),
    ['alter', 'control', 'dark-side', 'guardian-spirit', 'light-side', 'sense']);
  check('every group has a display name', groups.every(g => !!g.treeName), true);
  // The flat pool must stay consistent with the groups.
  check('pool matches the union of the groups',
    slot.pool!.length,
    new Set(groups.flatMap(g => g.features.map(f => f.id))).size);

  // A non-Force character gets class trees only.
  const plain = make(x => { x.speciesId = 'human'; x.levels = [{ classId: 'soldier' }]; });
  const plainSlot = computeCharacter(plain).slots.find(s => s.kind === 'talent')!;
  check('no Force groups without the feat',
    (plainSlot.treeGroups ?? []).filter(g => g.category === 'force').length, 0);

  // A Jedi's class trees include Force trees only via Force Sensitivity, and they
  // must not be double-listed.
  const jedi = make(x => { x.speciesId = 'human'; x.levels = [{ classId: 'jedi' }]; });
  const jediGroups = computeCharacter(jedi).slots.find(s => s.kind === 'talent')!.treeGroups ?? [];
  const ids = jediGroups.map(g => g.treeId);
  check('no duplicate trees for a Jedi', ids.length, new Set(ids).size);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Force power descriptors');
// ---------------------------------------------------------------------------
{
  const powers = Object.values(FEATURES).filter(f => f.type === 'force-power');
  const named = (key: keyof typeof powers[0]) =>
    powers.filter(p => p[key]).map(p => p.name).sort();

  check('dark side powers', named('darkSide'), ['Dark Rage', 'Force Lightning']);
  check('light side powers', named('lightSide'), ['Sever Force', 'Vital Transfer']);
  check('lightsaber form powers', named('lightsaberForm').length, 5);
  check('telekinetic powers', named('telekinetic').length, 7);
  check('mind-affecting powers', named('mindAffecting'), ['Mind Trick']);

  // Every descriptor present anywhere in the data must be one the UI knows how to show.
  const RENDERED = ['darkSide', 'lightSide', 'lightsaberForm', 'telekinetic', 'mindAffecting'];
  const KNOWN_FIELDS = new Set([
    'id', 'name', 'book', 'type', 'description', 'prerequisites', 'benefit', 'special', 'normal',
    'requirements', 'grants', 'multiple', 'maxCount', 'specType', 'allowedSpecs', 'incomplete',
    // how a feature's post-selection choice is offered
    'specTrees', 'specHeld', 'specTrained', 'specOptions',
    'page', 'summaryOnly', 'unparsedPrerequisites', 'hidden', 'hiddenReason',
    // presentational fields the data carries that are not descriptors
    'matchWeaponIcon', 'customSpecIcon', 'additional', 'dogfight',
    ...RENDERED,
  ]);
  const unhandled = new Set<string>();
  for (const f of Object.values(FEATURES)) {
    for (const k of Object.keys(f)) if (!KNOWN_FIELDS.has(k)) unhandled.add(k);
  }
  check('no unrendered descriptor fields', Array.from(unhandled).sort(), []);

  // A dark side power is still just a normal selection — the tag is informational.
  const jedi = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 10, dex: 12, con: 12, int: 10, wis: 14, cha: 12 });
    x.levels = [{ classId: 'jedi' }];
    x.trainedSkills = ['use-the-force'];
    x.selections = [{ key: 'feat:1', choiceId: 'feat', featureId: 'force-training' }];
  });
  check('Force Lightning is selectable', canSelect('force-lightning', jedi, computeCharacter(jedi)).met, true);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Features with a choice are not locked merely for lacking one');
// ---------------------------------------------------------------------------
{
  // A Soldier's starting feats include proficiency with several weapon groups.
  const soldier = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 14, dex: 14, con: 12, int: 10, wis: 12, cha: 10 });
    x.levels = Array(3).fill(null).map(() => ({ classId: 'soldier', hitPoints: 6 }));
    x.trainedSkills = ['perception'];
  });
  const d = computeCharacter(soldier);

  // Weapon Focus needs proficiency with whatever group you pick. Not having picked one
  // must not lock it — the Soldier is proficient with several.
  const focus = canSelect('weapon-focus', soldier, d);
  check('Weapon Focus available before choosing a group', focus.met, true);
  check('Weapon Focus reports it needs a choice', focus.needsSpec, true);
  check('viable groups are those you are proficient with',
    focus.viableSpecs.sort(),
    d.features.filter(f => f.id === 'weapon-proficiency').map(f => f.spec!).sort());

  // Picking a group you are proficient with works; one you are not does not.
  const good = focus.viableSpecs[0];
  check(`Weapon Focus (${good}) allowed`, canSelect('weapon-focus', soldier, d, good).met, true);
  check('Weapon Focus (lightsabers) blocked — no proficiency',
    canSelect('weapon-focus', soldier, d, 'lightsabers').met, false);

  // Every class grants some weapon proficiency via its starting feats, so a Noble is
  // still proficient with pistols and simple weapons — just not with lightsabers.
  const noble = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 14, dex: 14, con: 12, int: 10, wis: 12, cha: 10 });
    x.levels = [{ classId: 'noble' }];
  });
  const dn = computeCharacter(noble);
  check('Noble can still take Weapon Focus', canSelect('weapon-focus', noble, dn).met, true);
  check('but not for lightsabers',
    canSelect('weapon-focus', noble, dn).viableSpecs.includes('lightsabers'), false);

  // With no class levels at all there are no proficiencies, so it is genuinely locked.
  const unlevelled = make(x => { x.speciesId = 'human'; });
  const du = computeCharacter(unlevelled);
  const uFocus = canSelect('weapon-focus', unlevelled, du);
  check('Weapon Focus locked with no proficiencies at all', uFocus.met, false);
  check('and reports no viable groups', uFocus.viableSpecs.length, 0);

  // Skill Focus needs the chosen skill trained; the Soldier has one.
  const skillFocus = canSelect('skill-focus', soldier, d);
  check('Skill Focus available before choosing a skill', skillFocus.met, true);
  check('only trained skills are viable', skillFocus.viableSpecs, ['perception']);

  // Skill Training needs an *untrained* class skill, so Perception must be excluded.
  const training = canSelect('skill-training', soldier, d);
  check('Skill Training available', training.met, true);
  check('Skill Training excludes already-trained skills',
    training.viableSpecs.includes('perception'), false);
  check('Skill Training only offers class skills',
    training.viableSpecs.every(s => d.classSkills.has(s)), true);

  // Force Power Mastery needs a power you know — with none, it is genuinely locked.
  const mastery = canSelect('force-power-mastery', soldier, d);
  check('Force Power Mastery locked with no powers known', mastery.met, false);
  check('and reports no viable options', mastery.viableSpecs.length, 0);

  // Features without a choice are unaffected.
  const noChoice = canSelect('toughness', soldier, d);
  check('choice-less feats report needsSpec false', noChoice.needsSpec, false);
  check('Toughness available', noChoice.met, true);
}

// ---------------------------------------------------------------------------
console.log('\n▸ matchingSpec prerequisites require the same specialization');
// ---------------------------------------------------------------------------
{
  // Weapon Focus (rifles) only. Greater Weapon Focus must therefore be available for
  // rifles and for nothing else — previously any Weapon Focus satisfied it.
  const soldier = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 14, dex: 14, con: 12, int: 10, wis: 12, cha: 10 });
    x.levels = Array(9).fill(null).map(() => ({ classId: 'soldier', hitPoints: 6 }));
    x.selections = [{ key: 'feat:1', choiceId: 'feat', featureId: 'weapon-focus', spec: 'rifles' }];
  });
  const d = computeCharacter(soldier);
  check('has Weapon Focus (rifles)', hasFeature(d.features, 'weapon-focus', 'rifles'), true);

  check('Greater Weapon Focus (rifles) allowed',
    canSelect('greater-weapon-focus', soldier, d, 'rifles').met, true);
  check('Greater Weapon Focus (pistols) blocked despite having focus in rifles',
    canSelect('greater-weapon-focus', soldier, d, 'pistols').met, false);
  check('only rifles is viable',
    canSelect('greater-weapon-focus', soldier, d).viableSpecs, ['rifles']);

  // Weapon Specialization has the same shape.
  check('Weapon Specialization (pistols) blocked',
    canSelect('weapon-specialization', soldier, d, 'pistols').met, false);
  check('Weapon Specialization (rifles) allowed',
    canSelect('weapon-specialization', soldier, d, 'rifles').met, true);

  // Triple Crit takes a specific weapon but proficiency is by group, so the weapon
  // must resolve to its group before the check.
  const sniper = structuredClone(soldier);
  sniper.levels = Array(9).fill(null).map(() => ({ classId: 'soldier', hitPoints: 6 }));
  const ds = computeCharacter(sniper);
  const tripleCrit = canSelect('triple-crit', sniper, ds);
  check('Triple Crit resolves weapons to their group', tripleCrit.viableSpecs.length > 0, true);
  check('a rifle is viable for Triple Crit', tripleCrit.viableSpecs.includes('blaster-rifle'), true);
  check('a lightsaber is not — no proficiency',
    tripleCrit.viableSpecs.includes('lightsaber'), false);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Prestige entry: requirements are checked before the level is added');
// ---------------------------------------------------------------------------
{
  const soldier = (n: number) => make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 10 });
    x.levels = Array.from({ length: n }, (_, i) => ({ classId: 'soldier', hitPoints: i === 0 ? undefined : 6 }));
    x.trainedSkills = ['initiative', 'perception'];
    x.selections = [
      // Elite Trooper also wants Martial Arts I and Point Blank Shot.
      { key: 'feat:1', choiceId: 'feat', featureId: 'point-blank-shot' },
      { key: 'feat:3', choiceId: 'feat', featureId: 'martial-arts-i' },
      // …and one talent from an approved tree.
      { key: '0:0', choiceId: 'talent', featureId: 'armored-defense' },
    ];
  });

  // A full-BAB class reaches +7 at character level 7, so the prestige class can be
  // taken as the 8th level — never as the 7th.
  check('Soldier 6 has BAB +6', computeCharacter(soldier(6)).baseAttackBonus, 6);
  check('Soldier 7 has BAB +7', computeCharacter(soldier(7)).baseAttackBonus, 7);

  const at6 = soldier(6), at7 = soldier(7);
  check('Elite Trooper locked at Soldier 6',
    checkClassRequirements('elite-trooper', at6, computeCharacter(at6)).met, false);
  check('Elite Trooper unlocked at Soldier 7',
    checkClassRequirements('elite-trooper', at7, computeCharacter(at7)).met, true);

  // Taking it makes the character level 8.
  const promoted = structuredClone(at7);
  promoted.levels.push({ classId: 'elite-trooper', hitPoints: 7 });
  check('the prestige level is character level 8', computeCharacter(promoted).level, 8);

  // The talent requirement counts only talents from the named trees.
  const wrongTree = structuredClone(at7);
  // Ambush Specialist is a Soldier talent (Ambusher tree), which Elite Trooper does not accept.
  wrongTree.selections = wrongTree.selections.map(s =>
    s.choiceId === 'talent' ? { ...s, featureId: 'ambush-specialist' } : s);
  const wt = checkClassRequirements('elite-trooper', wrongTree, computeCharacter(wrongTree));
  check('a talent from the wrong tree does not count', wt.met, false);

  // Level-gated classes behave the same way: Ace Pilot wants character level 7.
  const scout = (n: number) => make(x => {
    x.speciesId = 'human';
    x.levels = Array.from({ length: n }, (_, i) => ({ classId: 'scout', hitPoints: i === 0 ? undefined : 5 }));
    x.trainedSkills = ['pilot'];
    x.selections = [{ key: 'feat:1', choiceId: 'feat', featureId: 'vehicular-combat' }];
  });
  const s6 = scout(6), s7 = scout(7);
  check('Ace Pilot locked at level 6',
    checkClassRequirements('ace-pilot', s6, computeCharacter(s6)).met, false);
  check('Ace Pilot unlocked at level 7',
    checkClassRequirements('ace-pilot', s7, computeCharacter(s7)).met, true);

  // A prestige talent requirement is only satisfiable if the trees it names hold enough
  // talents. Force Disciple's do not, because the source never defined them — that is a
  // real content gap, recorded here so it shows up if it changes.
  const unreachable: string[] = [];
  for (const cls of Object.values(CLASSES)) {
    const t = cls.requirements?.talents;
    if (!t) continue;
    const trees = [...(t.force ? ['alter', 'control', 'sense', 'dark-side'] : []), ...(t.trees ?? [])];
    const available = trees.reduce((n, id) => n + (TALENT_TREES[id]?.features?.length ?? 0), 0);
    if (available < t.count) unreachable.push(cls.name);
  }
  check('no prestige class is blocked by missing talent data', unreachable, []);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Data integrity');
// ---------------------------------------------------------------------------
{
  let dangling = 0;
  for (const t of Object.values(TALENT_TREES)) for (const r of t.features ?? []) if (!FEATURES[r.id]) dangling++;
  for (const c of Object.values(CLASSES)) {
    for (const g of c.features ?? []) for (const r of g ?? []) if (!FEATURES[r.id]) dangling++;
    for (const k of Object.values(c.trees ?? {})) for (const t of k) if (!TALENT_TREES[t]) dangling++;
  }
  for (const f of Object.values(FEATURES)) for (const r of f.requirements?.features ?? []) if (!FEATURES[r.id]) dangling++;
  check('dangling references', dangling, 0);

  // Every talent tree a class draws from now has content, and the three Force Adept
  // trees in particular are distinct trees rather than aliases of the generic Force ones.
  const referenced = new Set(
    Object.values(CLASSES).flatMap(c => Object.values(c.trees ?? {}).flat()),
  );
  check('talent trees still awaiting content',
    Array.from(referenced).filter(id => !TALENT_TREES[id]?.features?.length), []);

  check('Dark Side Devotee has talents', TALENT_TREES['dark-side-devotee'].features.length, 6);
  check('Force Adept tree has talents', TALENT_TREES['force-adept'].features.length, 6);
  check('Force Item has talents', TALENT_TREES['force-item'].features.length, 8);
  check('Force Adept class lists all seven of its trees',
    CLASSES['force-adept'].trees!.talent!.slice().sort(),
    ['beastwarden', 'dark-side-devotee', 'force-adept', 'force-item',
     'imperial-inquisitor', 'mystic', 'telepath']);

  // No class may be left with a choice it cannot fill.
  const emptyPools: string[] = [];
  for (const cls of Object.values(CLASSES)) {
    const c = make(x => { x.levels = [{ classId: cls.id }]; });
    for (const s of buildSlots(c)) if (s.pool && s.pool.length === 0) emptyPools.push(cls.name);
  }
  check('classes with an empty option pool', Array.from(new Set(emptyPools)).sort(), []);

  check('ability modifier of 10', abilityMod(10), 0);
  check('ability modifier of 7', abilityMod(7), -2);
  check('ability modifier of 18', abilityMod(18), 4);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Adaptable Talent banks a talent from any class you have');
// ---------------------------------------------------------------------------
{
  const multiclass = (selections: Character['selections'] = []) => make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 12, dex: 14, con: 12, int: 12, wis: 12, cha: 14 });
    x.levels = [
      ...Array(4).fill(null).map((_, i) => ({ classId: 'scoundrel', hitPoints: i === 0 ? undefined : 4 })),
      ...Array(3).fill(null).map(() => ({ classId: 'soldier', hitPoints: 6 })),
    ];
    x.selections = selections;
  });
  const adaptable = (d: ReturnType<typeof computeCharacter>) =>
    d.slots.filter(s => s.key.startsWith('adaptable-talent:'));

  check('no slot without the feat', adaptable(computeCharacter(multiclass())).length, 0);

  const withFeat = multiclass([{ key: 'feat:1', choiceId: 'feat', featureId: 'adaptable-talent' }]);
  const d = computeCharacter(withFeat);
  const slots = adaptable(d);
  check('one slot per Adaptable Talent feat', slots.length, 1);
  check('it is a talent slot', slots[0].kind, 'talent');
  check('it is offered as an unfilled choice', d.unfilledSlots.some(s => s.key === slots[0].key), true);

  // "from a Class you possess" — the pool spans every class, not just one.
  const offered = new Set(slots[0].treeGroups!.map(g => g.treeId));
  check('covers the Scoundrel trees', CLASSES.scoundrel.trees!.talent!.every(t => offered.has(t)), true);
  check('covers the Soldier trees', CLASSES.soldier.trees!.talent!.every(t => offered.has(t)), true);

  // A normal class talent slot must stay scoped to its own class.
  const classSlot = d.slots.find(s => s.kind === 'talent' && s.classId === 'soldier')!;
  const classTrees = new Set(classSlot.treeGroups!.map(g => g.treeId));
  check('a normal Soldier slot excludes Scoundrel trees',
    CLASSES.scoundrel.trees!.talent!.some(t => classTrees.has(t)), false);

  // Prerequisites still apply to whatever gets banked.
  const gated = Object.values(FEATURES).find(f =>
    f.type === 'talent' && f.requirements?.features?.length && offered.size > 0
    && slots[0].pool!.some(r => r.id === f.id))!;
  check('a talent with prerequisites is still gated',
    canSelect(gated.id, withFeat, d).met, false);

  // Picking one records it, and it survives into the talent list.
  const picked = structuredClone(withFeat);
  const easy = slots[0].pool!.find(r => canSelect(r.id, withFeat, d).met)!;
  picked.selections.push({ key: slots[0].key, choiceId: 'talent', featureId: easy.id });
  const d2 = computeCharacter(picked);
  check('the banked talent is recorded', d2.talents.some(t => t.id === easy.id), true);
  check('nothing left unfilled', d2.unfilledSlots.some(s => s.key === slots[0].key), false);

  // Dropping the feat drops its slot and the banked talent with it.
  const dropped = structuredClone(picked);
  dropped.selections = dropped.selections.filter(s => s.featureId !== 'adaptable-talent');
  const d3 = computeCharacter(dropped);
  check('removing the feat removes its slot', adaptable(d3).length, 0);
  check('and the banked talent goes too', d3.talents.some(t => t.id === easy.id), false);

  // Force Sensitivity widens it the same way it widens ordinary talent slots.
  const forceful = multiclass([
    { key: 'feat:1', choiceId: 'feat', featureId: 'adaptable-talent' },
    { key: 'feat:3', choiceId: 'feat', featureId: 'force-sensitivity' },
  ]);
  const df = computeCharacter(forceful);
  const forceGroups = adaptable(df)[0].treeGroups!.filter(g => g.category === 'force');
  check('Force trees included when Force-sensitive', forceGroups.length, 6);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Spreadsheet import');
// ---------------------------------------------------------------------------
{
  const talents = Object.values(FEATURES).filter(f => f.type === 'talent');
  const feats = Object.values(FEATURES).filter(f => f.type === 'feat');
  check('talents imported', talents.length > 1100, true);
  check('feats imported', feats.length > 380, true);

  // No placeholder entries survive. Several ids that *were* stubs now exist for real,
  // because the Foundry import supplied the species traits behind them.
  check('no stub entries remain', Object.values(FEATURES).filter(f => f.incomplete).length, 0);
  for (const id of ["twi'lek", 'cyborg-hybrid']) {
    check(`stub "${id}" removed`, id in FEATURES, false);
  }
  for (const id of ['basic-processor', 'claw', 'hovering']) {
    check(`"${id}" is now a real species trait`, FEATURES[id]?.type, 'trait');
  }

  // Content depending on things the app doesn't model is kept but hidden.
  const hidden = Object.values(FEATURES).filter(f => f.hidden);
  check('unsupported content is hidden, not deleted', hidden.length > 100, true);
  check('every hidden entry says why', hidden.every(f => !!f.hiddenReason), true);

  // Force traditions and droid talents are the bulk of it.
  check('Force tradition talents hidden',
    Object.values(TALENT_TREES).filter(t => t.group === 'Force-Using Tradition').every(t => t.hidden), true);
  // Droid talents are playable now, so they must NOT be hidden.
  check('droid talents are available',
    Object.values(TALENT_TREES).filter(t => t.group === 'Droid').every(t => !t.hidden), true);

  // Nothing hidden may leak into a class's selectable options.
  const leaked: string[] = [];
  for (const cls of Object.values(CLASSES)) {
    const c = make(x => { x.speciesId = 'human'; x.levels = [{ classId: 'jedi' }, { classId: cls.id }]; });
    for (const s of computeCharacter(c).slots) {
      for (const r of s.pool ?? []) if (FEATURES[r.id]?.hidden) leaked.push(`${cls.name}:${r.id}`);
    }
  }
  check('no hidden content reachable from a class', leaked, []);

  // A talent that only exists in a hidden tree must not be selectable anywhere.
  const traditionTalent = Object.values(TALENT_TREES)
    .find(t => t.group === 'Force-Using Tradition')!.features[0].id;
  check('a tradition talent is hidden', FEATURES[traditionTalent].hidden, true);

  // Species prerequisites must resolve against the species list. The source spells them
  // inconsistently ("twi'lek" vs the "twilek" id), so matching ignores punctuation.
  const unknownSpecies = new Set<string>();
  for (const f of Object.values(FEATURES)) {
    for (const s of f.requirements?.species ?? []) if (!(s in SPECIES)) unknownSpecies.add(s);
  }
  check('every species prerequisite resolves', Array.from(unknownSpecies), []);

  const twilekFeats = Object.values(FEATURES).filter(f => f.requirements?.species?.includes('twilek'));
  check('Twi\'lek feats exist', twilekFeats.length, 3);
  check('Twi\'lek feats are not hidden', twilekFeats.every(f => !f.hidden), true);
  {
    const twilek = make(x => { x.speciesId = 'twilek'; x.levels = [{ classId: 'noble' }]; });
    const human = make(x => { x.speciesId = 'human'; x.levels = [{ classId: 'noble' }]; });
    const dt = computeCharacter(twilek), dh = computeCharacter(human);
    const id = twilekFeats[0].id;
    const speciesCheck = (c: Character, d: typeof dt) =>
      canSelect(id, c, d).checks.find(x => x.text.startsWith('Species'))?.met;
    check(`"${twilekFeats[0].name}" allowed for a Twi'lek`, speciesCheck(twilek, dt), true);
    check(`"${twilekFeats[0].name}" blocked for a Human`, speciesCheck(human, dh), false);
  }

  // Saga Edition reuses names across categories — "Surge" is a Scout talent and a Force
  // power, "Recall" a talent and a feat. Importing by slug alone silently replaced one
  // with the other, leaving talent trees pointing at feats.
  const wrongType: string[] = [];
  for (const tree of Object.values(TALENT_TREES)) {
    if (/bonus|starting/.test(tree.id)) continue;      // those hold feats by design
    for (const r of tree.features ?? []) {
      const f = FEATURES[r.id];
      if (!f) wrongType.push(`${tree.name} -> missing ${r.id}`);
      else if (f.type !== 'talent') wrongType.push(`${tree.name} -> ${r.id} is a ${f.type}`);
    }
  }
  check('every talent tree contains only talents', wrongType, []);

  // The colliding names must each survive as their own entry.
  for (const [name, types] of [['Surge', ['talent', 'force-power']], ['Recall', ['talent', 'feat']]] as const) {
    const found = Object.values(FEATURES).filter(f => f.name === name).map(f => f.type).sort();
    check(`"${name}" exists as ${types.join(' and ')}`, found, [...types].sort());
  }

  // Machine-checked prerequisites must never reference something that no longer exists.
  let bad = 0;
  for (const f of Object.values(FEATURES)) {
    for (const r of f.requirements?.features ?? []) if (!FEATURES[r.id]) bad++;
  }
  check('no prerequisite points at a removed entry', bad, 0);

  // Bonus feat lists were rebuilt from the sheet's class columns.
  check('Soldier bonus feat list rebuilt', TALENT_TREES['soldier-bonus'].features.length > 100, true);
  check('Noble bonus feat list rebuilt', TALENT_TREES['noble-bonus'].features.length > 40, true);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Sourcebook filtering');
// ---------------------------------------------------------------------------
{
  const soldier = (books: string[] | null) => make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 10 });
    x.levels = Array(3).fill(null).map((_, i) => ({ classId: 'soldier', hitPoints: i === 0 ? undefined : 6 }));
    x.allowedBooks = books;
  });

  const talentPool = (c: Character) => {
    const slot = computeCharacter(c).slots.find(s => s.kind === 'talent')!;
    return slot.pool ?? [];
  };
  const featPool = (c: Character) =>
    Object.values(FEATURES).filter(f => f.type === 'feat' && featureAvailable(c, f.id));

  const all = soldier(null);
  const core = soldier(['core']);

  check('unrestricted offers every book', new Set(talentPool(all).map(r => FEATURES[r.id].book)).size > 1, true);
  check('core-only offers only Core talents',
    Array.from(new Set(talentPool(core).map(r => FEATURES[r.id].book))), ['core']);
  check('core-only shrinks the talent pool', talentPool(core).length < talentPool(all).length, true);
  check('core-only shrinks the feat pool', featPool(core).length < featPool(all).length, true);
  // Restricting a Soldier to Core leaves exactly the four trees the Core Rulebook prints
  // for the class — a good check that the filter cuts along book lines and not at random.
  check('a Core-only Soldier sees the Core Rulebook trees',
    computeCharacter(core).slots.find(s => s.kind === 'talent')!.treeGroups!.map(g => g.treeName).sort(),
    ['Armor Specialist', 'Brawler', 'Commando', 'Weapon Specialist']);
  // 20, not 19: Armor Mastery is printed in the Core Rulebook's Armor Specialist tree
  // (p.51) and was previously tagged with the Legacy book, whose same-named talent is a
  // different one.
  check('and their 20 Core talents', talentPool(core).length, 20);

  // A two-book selection sits between the two.
  const two = soldier(['core', 'knights']);
  check('two books offer more than one',
    talentPool(two).length > talentPool(core).length, true);
  check('and fewer than everything',
    talentPool(two).length < talentPool(all).length, true);
  check('only the chosen books appear',
    Array.from(new Set(talentPool(two).map(r => FEATURES[r.id].book))).sort(), ['core', 'knights']);

  // Narrowing must never strip choices the character already made.
  const withPick = soldier(null);
  const fromAnotherBook = talentPool(withPick).find(r => FEATURES[r.id].book !== 'core')!;
  const slotKey = computeCharacter(withPick).slots.find(s => s.kind === 'talent')!.key;
  withPick.selections = [{ key: slotKey, choiceId: 'talent', featureId: fromAnotherBook.id }];
  check('the pick is recorded', computeCharacter(withPick).talents.some(t => t.id === fromAnotherBook.id), true);

  const narrowed = structuredClone(withPick);
  narrowed.allowedBooks = ['core'];
  const dn = computeCharacter(narrowed);
  check('narrowing keeps an already-chosen talent', dn.talents.some(t => t.id === fromAnotherBook.id), true);
  check('and does not reopen the slot', dn.unfilledSlots.some(s => s.key === slotKey), false);
  check('but stops offering it',
    talentPool(narrowed).some(r => r.id === fromAnotherBook.id), false);

  // Classes carry a book too, so a Core-only character cannot reach Imperial Knight (Legacy).
  check('every class is book-tagged',
    Object.values(CLASSES).every(c => !!c.book && c.book !== 'unknown'), true);
  check('Imperial Knight is Legacy', CLASSES['imperial-knight'].book, 'legacy');
  check('Gladiator is Knights of the Old Republic', CLASSES['gladiator'].book, 'knights');
  check('base classes are Core',
    ['jedi', 'noble', 'scoundrel', 'scout', 'soldier'].every(id => CLASSES[id].book === 'core'), true);
  check('Core-only blocks a Legacy class', isBookAllowed(core, CLASSES['imperial-knight'].book), false);
  check('Core-only allows a Core class', isBookAllowed(core, CLASSES['elite-trooper'].book), true);

  // Force powers and the other open pools honour it as well.
  const forceCore = soldier(['core']);
  forceCore.selections = [{ key: 'feat:1', choiceId: 'feat', featureId: 'force-sensitivity' }];
  const powers = Object.values(FEATURES).filter(f => f.type === 'force-power');
  check('core-only restricts Force powers',
    powers.filter(f => featureAvailable(forceCore, f.id)).length < powers.length, true);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Foundry import: species and equipment');
// ---------------------------------------------------------------------------
{
  const all = Object.values(SPECIES);
  const playable = all.filter(s => !s.hidden);
  // 132 imported species plus the Near-Human and Droid templates.
  check('species imported', playable.length, 134);
  check('132 come from the compendium', playable.filter(s => !s.template).length, 132);
  check('droid models kept but hidden', all.filter(s => s.hidden).length, 14);
  check('every droid model says why', all.filter(s => s.hidden).every(s => !!s.hiddenReason), true);

  // The 22 we started with must survive intact — their traits were hand-verified.
  for (const id of ['human', 'wookiee', 'twilek', 'bothan', 'zabrak']) {
    check(`${id} still present`, !!SPECIES[id], true);
  }
  check('Wookiee keeps its +4 Strength', SPECIES.wookiee.abilities?.str, 4);
  check('Wookiee keeps its verified traits',
    SPECIES.wookiee.features?.every(f => !!FEATURES[f.id]), true);

  // Book tags come from the Omegadex, so species join the sourcebook filter.
  check('most species are book-tagged', playable.filter(s => s.book).length > 115, true);
  check('Human is Core', SPECIES.human.book, 'core');
  check('every species book is a real book',
    Array.from(new Set(playable.map(s => s.book).filter(Boolean)))
      .every(b => Object.values(SPECIES).some(s => s.book === b)), true);

  // Species that were previously missing and were hiding real feats.
  check('Nikto is now available', !!SPECIES.nikto && !SPECIES.nikto.hidden, true);
  check('Nelvaanian is now available', !!SPECIES.nelvaanian, true);
  const nikto = FEATURES['nikto-survival'];
  check('Nikto Survival is no longer hidden', !!nikto && !nikto.hidden, true);
  check('and is gated on the Nikto species', nikto?.requirements?.species, ['nikto']);

  // Equipment
  const items = Object.values(EQUIPMENT);
  // 535, down from 765: 150 fan-made items, 74 the pack's own descriptions called
  // homebrew, and 6 sourcebook blurbs that had been scraped in as if they were gear.
  check('equipment imported', items.length > 500, true);
  const weapons = items.filter(i => i.category === 'weapon');
  const armor = items.filter(i => i.category === 'armor');
  check('every weapon has a proficiency group', weapons.every(w => !!w.group), true);
  check('weapon groups are all recognised',
    Array.from(new Set(weapons.map(w => w.group!))).every(g => g in WEAPON_GROUPS), true);
  check('worn armor types are light/medium/heavy',
    armor.filter(a => a.armorType).every(a => ['light', 'medium', 'heavy'].includes(a.armorType!)), true);

  // Armor must still drive the defence maths correctly after the swap.
  const trooper = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 12, dex: 14, con: 12, int: 10, wis: 10, cha: 10 });
    x.levels = Array(5).fill(null).map((_, i) => ({ classId: 'soldier', hitPoints: i === 0 ? undefined : 6 }));
    x.inventory = [{ uid: 'a', itemId: 'combat-jumpsuit', quantity: 1, equipped: true }];
  });
  const dt = computeCharacter(trooper);
  check('armor is recognised', dt.equippedArmor?.name, 'Combat Jumpsuit');
  check('and the Soldier is proficient with it', dt.armorProficient, true);
  check('Reflex uses the armor bonus', dt.defenses.reflex, 10 + 4 + 1 + 2);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Droids');
// ---------------------------------------------------------------------------
{
  check('Droid is a template species', SPECIES.droid?.template, 'droid');
  check('five degrees', DROIDS.degrees.length, 5);
  check('players get Medium or Small',
    DROIDS.sizes.filter(s => s.playable).map(s => s.id), ['Medium', 'Small']);
  check('100 systems catalogued', Object.keys(DROIDS.systems).length, 100);
  check('locomotion systems present',
    Object.values(DROIDS.systems).filter(s => s.category === 'locomotion').length, 12);

  const droid = (fn: (c: Character) => void = () => {}) => make(x => {
    x.speciesId = 'droid';
    setAbilities(x, { str: 12, dex: 14, con: 14, int: 14, wis: 12, cha: 10 });
    x.levels = Array(3).fill(null).map((_, i) => ({ classId: 'scout', hitPoints: i === 0 ? undefined : 5 }));
    x.droid = { degree: '2', size: 'Medium', systems: ['walking', 'heuristic-processor'] };
    fn(x);
  });
  const organic = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 12, dex: 14, con: 14, int: 14, wis: 12, cha: 10 });
    x.levels = Array(3).fill(null).map((_, i) => ({ classId: 'scout', hitPoints: i === 0 ? undefined : 5 }));
  });

  const dd = computeCharacter(droid());
  const doh = computeCharacter(organic);
  check('recognised as a droid', dd.isDroid, true);
  check('a Human is not', doh.isDroid, false);

  // Degree modifiers: 2nd-Degree is +2 Int, −2 Cha. Medium adds nothing.
  check('degree modifiers applied', [dd.abilities.int, dd.abilities.cha], [16, 8]);
  const small = computeCharacter(droid(x => { x.droid.size = 'Small'; }));
  check('size modifiers stack with degree', [small.abilities.str, small.abilities.dex], [10, 16]);

  // No Constitution: no bonus hit points, and Strength drives Fortitude.
  check('no Constitution bonus to hit points',
    dd.maxHitPoints, doh.maxHitPoints - doh.mods.con * 3);
  check('Fortitude uses Strength', dd.defenses.fortitude, 10 + 3 + 1 + dd.mods.str);
  check('the breakdown says so', dd.defenseBreakdown.fortitude.some(p => p.label.includes('Str (droid)')), true);
  check('second wind uses Strength too', dd.secondWind, Math.max(Math.floor(dd.maxHitPoints / 4), dd.abilities.str));

  // Size drives Reflex and Stealth — and Small also grants +2 Dexterity, which is worth
  // another point of modifier on top of the size bonus itself.
  check('Small gives +2 Dex', small.abilities.dex - dd.abilities.dex, 2);
  check('Small droid gains Reflex (+1 size, +1 Dex)', small.defenses.reflex - dd.defenses.reflex, 2);
  check('Small droid gains Stealth (+5 size, +1 Dex)',
    (small.skills.find(s => s.id === 'stealth')!.total) - (dd.skills.find(s => s.id === 'stealth')!.total), 6);

  // Speed comes from the locomotion system and size.
  check('walking Medium droid moves 6', dd.speed, 6);
  check('wheeled Medium droid moves 8',
    computeCharacter(droid(x => { x.droid.systems = ['wheeled']; })).speed, 8);
  check('walking Small droid moves 4',
    computeCharacter(droid(x => { x.droid.size = 'Small'; x.droid.systems = ['walking']; })).speed, 4);
  check('flying Medium droid moves 12',
    computeCharacter(droid(x => { x.droid.systems = ['flying']; })).speed, 12);

  // The degree's talent tree is open on every talent slot.
  const talentSlot = dd.slots.find(s => s.kind === 'talent');
  check('degree talent tree offered',
    talentSlot?.treeGroups?.some(g => g.treeId === 'second-degree-droid'), true);
  check('and a different degree offers a different tree',
    computeCharacter(droid(x => { x.droid.degree = '4'; })).slots
      .find(s => s.kind === 'talent')?.treeGroups?.some(g => g.treeId === 'fourth-degree-droid'), true);

  // Droid talents are no longer hidden.
  const droidTalents = Object.values(TALENT_TREES)
    .filter(t => /-degree-droid$/.test(t.id));
  check('five degree trees exist', droidTalents.length, 5);
  check('they are not hidden', droidTalents.every(t => !t.hidden), true);

  // The Force is closed to droids.
  check('Force Sensitivity blocked', canSelect('force-sensitivity', droid(), dd).met, false);
  check('Force powers blocked', canSelect('move-object', droid(), dd).met, false);
  check('and it says why',
    canSelect('force-sensitivity', droid(), dd).checks[0].text.includes('no connection to the Force'), true);

  // Constitution prerequisites are unreachable.
  const conGated = Object.values(FEATURES).find(f => f.requirements?.abilities?.con);
  if (conGated) {
    const r = canSelect(conGated.id, droid(), dd);
    check(`"${conGated.name}" blocked on Constitution`, r.met, false);
    check('for the right reason',
      r.checks.some(c => c.text.includes('no Constitution score')), true);
  }

  // No Force Points either.
  check('droids have no Force Points', dd.forcePoints, 0);
  check('an organic character does', doh.forcePoints > 0, true);

  // Systems are resolved from the catalogue.
  check('installed systems resolve', dd.droidSystems.map(s => s.id), ['walking', 'heuristic-processor']);
  check('cost factor follows size', [dd.droidCostFactor, small.droidCostFactor], [1, 2]);
  check('appendages counted',
    computeCharacter(droid(x => { x.droid.systems = ['walking', 'tool', 'tool', 'claw']; }))
      .droidSystems.reduce((n, s) => n + (s.appendages ?? 0), 0), 3);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Near-Human template');
// ---------------------------------------------------------------------------
{
  check('Near-Human is a template species', SPECIES['near-human']?.template, 'near-human');
  check('it uses the Human chassis',
    [SPECIES['near-human'].size, SPECIES['near-human'].speed, !!SPECIES['near-human'].abilities],
    [SPECIES.human.size, SPECIES.human.speed, !!SPECIES.human.abilities]);
  check('24 mechanical traits', NEAR_HUMAN.mechanical.length, 24);
  check('11 cosmetic variations', NEAR_HUMAN.cosmetic.length, 11);
  check('three cosmetic picks allowed', NEAR_HUMAN.cosmeticLimit, 3);
  check('every listed trait exists',
    [...NEAR_HUMAN.mechanical, ...NEAR_HUMAN.cosmetic].every(id => !!FEATURES[id]), true);

  const build = (fn: (c: Character) => void) => make(x => {
    x.speciesId = 'near-human';
    setAbilities(x, { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 });
    x.levels = [{ classId: 'scout' }];
    fn(x);
  });
  const human = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 });
    x.levels = [{ classId: 'scout' }];
  });
  const dh = computeCharacter(human);
  const featSlots = (d: typeof dh) => d.slots.filter(s => s.kind === 'species-feat').length;

  // Baseline: a Human gets both the bonus feat and the bonus trained skill.
  check('Human gets a bonus feat', featSlots(dh), 1);
  const humanSkills = dh.trainedSkillsAllowed;

  // Giving up the feat: no bonus feat slot, skills unchanged.
  const gaveFeat = build(x => {
    x.nearHuman = { trait: NEAR_HUMAN.mechanical[0], sacrifice: 'feat', cosmetic: [] };
  });
  const dF = computeCharacter(gaveFeat);
  check('sacrificing the feat removes the bonus feat slot', featSlots(dF), 0);
  check('and leaves the trained skill count alone', dF.trainedSkillsAllowed, humanSkills);

  // Giving up the skill: bonus feat kept, one fewer trained skill.
  const gaveSkill = build(x => {
    x.nearHuman = { trait: NEAR_HUMAN.mechanical[0], sacrifice: 'skill', cosmetic: [] };
  });
  const dS = computeCharacter(gaveSkill);
  check('sacrificing the skill keeps the bonus feat', featSlots(dS), 1);
  check('and costs one trained skill', dS.trainedSkillsAllowed, humanSkills - 1);

  // The chosen trait is granted like any species trait.
  const traitId = NEAR_HUMAN.mechanical[0];
  check('the chosen trait is granted',
    dF.features.some(f => f.id === traitId), true);
  check('it arrives as an automatic species trait',
    dF.slots.some(s => s.kind === 'species-trait' && s.granted?.id === traitId && s.auto), true);

  // Cosmetic variations are granted too, and are flavour only.
  const withCosmetic = build(x => {
    x.nearHuman = { trait: traitId, sacrifice: 'feat', cosmetic: NEAR_HUMAN.cosmetic.slice(0, 3) };
  });
  const dC = computeCharacter(withCosmetic);
  check('cosmetic variations are granted',
    NEAR_HUMAN.cosmetic.slice(0, 3).every(id => dC.features.some(f => f.id === id)), true);
  check('they do not change the trained skill count', dC.trainedSkillsAllowed, humanSkills);

  // An unconfigured Near-Human is still a valid character, just Human-equivalent.
  const blank = build(() => {});
  const dB = computeCharacter(blank);
  check('an unconfigured Near-Human keeps both Human bonuses',
    [featSlots(dB), dB.trainedSkillsAllowed], [1, humanSkills]);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Portraits and icons');
// ---------------------------------------------------------------------------
{
  // Icons resolve to a URL only when a file was actually downloaded, so the UI can
  // never render a broken image.
  check('a known feature icon resolves', !!featureIcon('block'), true);
  check('an unknown one resolves to nothing', featureIcon('no-such-feature-xyz'), undefined);
  check('every class has an icon', Object.values(CLASSES).every(c => !!classIcon(c.id)), true);
  check('every manifest entry names a file',
    Object.values(ICONS.features).every(f => typeof f === 'string' && f.length > 0), true);

  // A weapon-group specialisation falls back to the weapon artwork.
  check('weapon group artwork resolves', !!weaponIcon('lightsabers'), true);
  check('exotic weapons have no icon upstream', weaponIcon('exotic-weapons'), undefined);

  // Portraits: a class reference resolves to that class's icon; a data URL passes through.
  check('class portrait resolves', portraitUrl('class:jedi'), classIcon('jedi'));
  check('uploaded portrait passes through',
    portraitUrl('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
  check('no portrait resolves to nothing', portraitUrl(null), undefined);
  check('a portrait for a class without an icon degrades safely',
    portraitUrl('class:not-a-class'), undefined);

  // New characters start with none, and old saves without the field still load.
  check('new characters have no portrait', newCharacter().portrait, null);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Attacks');
// ---------------------------------------------------------------------------
{
  const soldier = (selections: Character['selections'] = []) => make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 16, dex: 14, con: 12, int: 10, wis: 10, cha: 10 });
    x.levels = Array(8).fill(null).map((_, i) => ({ classId: 'soldier', hitPoints: i === 0 ? undefined : 6 }));
    // A Soldier is proficient with pistols, rifles and simple weapons — not advanced melee,
    // so the melee cases use a club to keep proficiency out of the arithmetic.
    x.inventory = ['blaster-rifle', 'club'].map((id, i) => ({ uid: `i${i}`, itemId: id, quantity: 1, equipped: true }));
    x.selections = selections;
  });
  const c = soldier();
  const d = computeCharacter(c);
  const opts = defaultAttackOptions();
  const rifle = buildAttack(c, d, EQUIPMENT['blaster-rifle'], opts);
  const blade = buildAttack(c, d, EQUIPMENT['club'], opts);

  // Soldier 8 has base attack bonus +8. Ranged uses Dexterity, melee uses Strength.
  check('ranged attack uses Dexterity', rifle.attack, 8 + 2);
  check('melee attack uses Strength', blade.attack, 8 + 3);
  check('rifle is ranged', rifle.melee, false);
  check('club is melee', blade.melee, true);

  // Damage adds half character level always, and Strength in melee only.
  check('ranged damage adds half level only', rifle.damageBonus, 4);
  check('melee damage adds half level and Strength', blade.damageBonus, 4 + 3);
  check('dice come from the weapon', rifle.damageDice, EQUIPMENT['blaster-rifle'].damage);
  check('the dice breakdown names the weapon', blade.diceParts[0].label, 'Club');

  // A two-handed grip doubles the Strength bonus, and only in melee.
  check('two-handed doubles Strength to damage',
    buildAttack(c, d, EQUIPMENT['club'], { ...opts, twoHanded: true }).damageBonus, 4 + 6);
  check('two-handed does nothing for a ranged weapon',
    buildAttack(c, d, EQUIPMENT['blaster-rifle'], { ...opts, twoHanded: true }).damageBonus, 4);

  // Power Attack trades attack for damage, melee only, capped at base attack bonus.
  const pa = soldier([{ key: 'feat:1', choiceId: 'feat', featureId: 'power-attack' }]);
  const dpa = computeCharacter(pa);
  const paBlade = buildAttack(pa, dpa, EQUIPMENT['club'], { ...opts, powerAttack: 3 });
  check('Power Attack lowers the attack roll', paBlade.attack, 8 + 3 - 3);
  check('and raises damage by the same amount', paBlade.damageBonus, 4 + 3 + 3);
  check('Power Attack is capped at base attack bonus',
    buildAttack(pa, dpa, EQUIPMENT['club'], { ...opts, powerAttack: 99 }).attack, 8 + 3 - 8);
  check('Power Attack does not apply to ranged weapons',
    buildAttack(pa, dpa, EQUIPMENT['blaster-rifle'], { ...opts, powerAttack: 3 }).attack, 8 + 2);

  // Weapon Focus applies automatically, but only to its own group.
  const focused = soldier([{ key: 'feat:1', choiceId: 'feat', featureId: 'weapon-focus', spec: 'rifles' }]);
  const df = computeCharacter(focused);
  check('Weapon Focus adds to the matching group',
    buildAttack(focused, df, EQUIPMENT['blaster-rifle'], opts).attack, 8 + 2 + 1);
  check('Weapon Focus does not help another group',
    buildAttack(focused, df, EQUIPMENT['club'], opts).attack, 8 + 3);

  // Wielding something you are not proficient with costs 5.
  const saber = buildAttack(c, d, EQUIPMENT['lightsaber'], opts);
  check('non-proficiency costs 5', saber.attack, 8 + 3 - 5);
  check('and is flagged', saber.proficient, false);

  // Rapid Shot, Burst Fire and Deadeye explicitly do not stack.
  const shooter = soldier([
    { key: 'feat:1', choiceId: 'feat', featureId: 'rapid-shot' },
    { key: 'feat:3', choiceId: 'feat', featureId: 'burst-fire' },
  ]);
  const ds = computeCharacter(shooter);
  const both = buildAttack(shooter, ds, EQUIPMENT['blaster-rifle'], { ...opts, rapidShot: true, burstFire: true });
  check('the larger die bonus wins', both.damageDice, '5d8');
  check('and the clash is explained', both.notes.some(n => n.includes('do not stack')), true);

  // Full attack: Double Attack adds an attack and -5 to every roll.
  const doubler = soldier([{ key: 'feat:1', choiceId: 'feat', featureId: 'double-attack', spec: 'rifles' }]);
  const dd2 = computeCharacter(doubler);
  const fa = buildAttack(doubler, dd2, EQUIPMENT['blaster-rifle'], { ...opts, fullAttack: true });
  check('Double Attack grants two attacks', fa.fullAttack?.attacks, 2);
  check('at -5 to all of them', fa.attack, 8 + 2 - 5);
  check('and only when taking a full attack',
    buildAttack(doubler, dd2, EQUIPMENT['blaster-rifle'], opts).attack, 8 + 2);

  // Two weapons drawn, plus unarmed strike, which is always available.
  check('a profile per drawn weapon plus unarmed', buildAttacks(c, d, opts).length, 3);

  // The "worn" checkbox is what puts a weapon in hand.
  const stowed = structuredClone(c);
  stowed.inventory = stowed.inventory.map(e => ({ ...e, equipped: false }));
  const dst = computeCharacter(stowed);
  check('a stowed weapon is not an attack option',
    buildAttacks(stowed, dst, opts).map(a => a.weapon.id), ['unarmed']);
  const oneDrawn = structuredClone(c);
  oneDrawn.inventory = oneDrawn.inventory.map(e => ({ ...e, equipped: e.itemId === 'club' }));
  check('drawing one weapon lists just that one',
    buildAttacks(oneDrawn, computeCharacter(oneDrawn), opts).map(a => a.weapon.id).sort(),
    ['club', 'unarmed']);

  // ---- situational modifiers from talents, traits and Force powers ----
  const raging = soldier([
    { key: 'feat:1', choiceId: 'feat', featureId: 'cornered' },
  ]);
  raging.speciesId = 'wookiee';   // Wookiees have the Rage trait
  const dr = computeCharacter(raging);
  const rageBlade = (tier: number) =>
    buildAttack(raging, dr, EQUIPMENT['club'], { ...opts, situational: { rage: tier } });
  check('Rage is off by default', rageBlade(0).attack, buildAttack(raging, dr, EQUIPMENT['club'], opts).attack);
  check('Rage adds +2 to melee attack', rageBlade(1).attack - rageBlade(0).attack, 2);
  check('and +2 to melee damage', rageBlade(1).damageBonus - rageBlade(0).damageBonus, 2);
  check('but nothing to a ranged weapon',
    buildAttack(raging, dr, EQUIPMENT['blaster-rifle'], { ...opts, situational: { rage: 1 } }).attack,
    buildAttack(raging, dr, EQUIPMENT['blaster-rifle'], opts).attack);

  // Cornered applies to any weapon.
  check('Cornered helps a ranged weapon too',
    buildAttack(raging, dr, EQUIPMENT['blaster-rifle'], { ...opts, situational: { cornered: 1 } }).attack
    - buildAttack(raging, dr, EQUIPMENT['blaster-rifle'], opts).attack, 2);

  // A modifier the character does not have must never apply.
  check('a modifier you lack does nothing',
    buildAttack(c, d, EQUIPMENT['club'], { ...opts, situational: { 'dark-rage': 3 } }).attack,
    buildAttack(c, d, EQUIPMENT['club'], opts).attack);

  // Tiered Force powers: Dark Rage scales +2/+4/+6.
  const sith = soldier([
    { key: 'feat:1', choiceId: 'feat', featureId: 'force-sensitivity' },
    { key: 'feat:3', choiceId: 'feat', featureId: 'force-training' },
    { key: 'force-power:feat:3:0', choiceId: 'force-power', featureId: 'dark-rage' },
    { key: 'force-power:feat:3:1', choiceId: 'force-power', featureId: 'battle-strike' },
  ]);
  // Force Training grants 1 + Wisdom modifier powers, so two picks need Wisdom 12+.
  sith.baseAbilities.wis = 14;
  const dsith = computeCharacter(sith);
  const base = buildAttack(sith, dsith, EQUIPMENT['club'], opts);
  for (const [tier, bonus] of [[1, 2], [2, 4], [3, 6]] as const) {
    const t = buildAttack(sith, dsith, EQUIPMENT['club'], { ...opts, situational: { 'dark-rage': tier } });
    check(`Dark Rage tier ${tier} gives +${bonus}`, [t.attack - base.attack, t.damageBonus - base.damageBonus], [bonus, bonus]);
  }

  // Battle Strike adds a flat +1 and extra dice that are rolled separately.
  const bs = buildAttack(sith, dsith, EQUIPMENT['club'], { ...opts, situational: { 'battle-strike': 2 } });
  check('Battle Strike adds +1 to the attack', bs.attack - base.attack, 1);
  check('and its dice are listed separately', bs.damageDice.includes('2d6'), true);
  check('named in the dice breakdown', bs.diceParts.some(p => p.label === 'Battle Strike'), true);

  // Every situational entry must name a feature that exists.
  check('every situational modifier maps to a real feature',
    SITUATIONAL.filter(m => !FEATURES[m.id]).map(m => m.id), []);

  // ---- unarmed strike is always available and steps up with Martial Arts ----
  const bare = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 14, dex: 12, con: 12, int: 10, wis: 10, cha: 10 });
    x.levels = [{ classId: 'soldier' }];
  });
  const dbare = computeCharacter(bare);
  const bareAttacks = buildAttacks(bare, dbare, opts);
  check('unarmed strike is offered with no weapons', bareAttacks.map(a => a.weapon.id), ['unarmed']);
  check('and is melee', bareAttacks[0].melee, true);
  check('base unarmed damage is 1d4', bareAttacks[0].damageDice, '1d4');

  check('Martial Arts I steps it to 1d6', unarmedDamage([{ id: 'martial-arts-i' }]), '1d6');
  check('II steps it again',
    unarmedDamage([{ id: 'martial-arts-i' }, { id: 'martial-arts-ii' }]), '1d8');
  check('III steps it once more',
    unarmedDamage([{ id: 'martial-arts-i' }, { id: 'martial-arts-ii' }, { id: 'martial-arts-iii' }]), '1d10');
  check('no Martial Arts leaves it alone', unarmedDamage([]), '1d4');
  check('unarmed is never duplicated when carrying weapons',
    buildAttacks(c, d, opts).filter(a => a.weapon.id === 'unarmed').length, 1);

  // ---- Force powers that deal damage ----
  const caster = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 12, dex: 12, con: 12, int: 12, wis: 16, cha: 16 });
    x.levels = Array(9).fill(null).map((_, i) => ({ classId: 'jedi', hitPoints: i === 0 ? undefined : 6 }));
    x.trainedSkills = ['use-the-force'];
    x.selections = [
      { key: 'feat:3', choiceId: 'feat', featureId: 'force-training' },
      { key: 'force-power:feat:3:0', choiceId: 'force-power', featureId: 'force-lightning' },
      { key: 'force-power:feat:3:1', choiceId: 'force-power', featureId: 'force-slam' },
      { key: 'force-power:feat:3:2', choiceId: 'force-power', featureId: 'mind-trick' },
    ];
  });
  const dcast = computeCharacter(caster);
  const powers = buildPowers(dcast);
  check('only damaging powers are listed', powers.map(p => p.id).sort(), ['force-lightning', 'force-slam']);
  check('Mind Trick deals no damage, so is excluded',
    powers.some(p => p.id === 'mind-trick'), false);

  const lightning = powers.find(p => p.id === 'force-lightning')!;
  check('Force Lightning deals 8d6', lightning.damage, '8d6');
  check('against Reflex Defense', lightning.versus, 'Reflex Defense');
  check('as Force damage', lightning.damageType, 'force');
  check('and is tagged dark side', lightning.descriptors.includes('dark side'), true);
  check('Force Slam targets Fortitude',
    powers.find(p => p.id === 'force-slam')!.versus, 'Fortitude Defense');

  // The roll is Use the Force, not an attack bonus.
  check('powers roll Use the Force',
    lightning.useTheForce, dcast.skills.find(s => s.id === 'use-the-force')!.total);
  check('a character with no powers lists none', buildPowers(d).length, 0);

  // ---- Force power uses: each copy in the suite is one use per encounter ----
  const multi = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 12, dex: 12, con: 12, int: 12, wis: 16, cha: 16 });
    x.levels = Array(9).fill(null).map((_, i) => ({ classId: 'jedi', hitPoints: i === 0 ? undefined : 6 }));
    x.trainedSkills = ['use-the-force'];
    x.selections = [
      { key: 'feat:3', choiceId: 'feat', featureId: 'force-training' },
      // Force Training allows the same power more than once; each copy is another use.
      { key: 'force-power:feat:3:0', choiceId: 'force-power', featureId: 'force-lightning' },
      { key: 'force-power:feat:3:1', choiceId: 'force-power', featureId: 'force-lightning' },
      { key: 'force-power:feat:3:2', choiceId: 'force-power', featureId: 'force-slam' },
    ];
  });
  const dmulti = computeCharacter(multi);
  const uses = forcePowerUses(dmulti.forcePowers);
  check('a power taken twice grants two uses', uses['force-lightning'], 2);
  check('a power taken once grants one', uses['force-slam'], 1);
  check('an unknown power has none', uses['move-object'], undefined);

  // Duplicates collapse to a single row in the attack list, not two.
  check('duplicates are one row, not two',
    buildPowers(dmulti).filter(p => p.id === 'force-lightning').length, 1);
  check('both powers still appear', buildPowers(dmulti).length, 2);

  // Spending is tracked per power and starts empty.
  check('nothing is spent on a new character', newCharacter().powersSpent, {});

  // ---- Force Points: a per-level pool, not a per-encounter one ----
  check('a Force Point adds 1d6 up to 7th level', forcePointDice(7), '1d6');
  check('2d6 from 8th', forcePointDice(8), '2d6');
  check('3d6 from 15th', forcePointDice(15), '3d6');

  const fpAbilities = buildForcePointAbilities(dcast);
  check('abilities that spend a Force Point are listed', fpAbilities.length > 0, true);
  check('Force Lightning is one of them',
    fpAbilities.some(a => a.id === 'force-lightning'), true);
  check('each carries the sentence describing the cost',
    fpAbilities.every(a => /Force Point/i.test(a.effect)), true);
  check('a character with none lists none', buildForcePointAbilities(d).length, 0);

  // Force powers are Use the Force checks, so the weapon toggles must not touch them.
  const boosted = buildPowers(computeCharacter(caster));
  check('weapon toggles do not change a power',
    boosted.find(p => p.id === 'force-lightning')!.damage, '8d6');
}

// ---------------------------------------------------------------------------
console.log('\n▸ What you can carry');
// ---------------------------------------------------------------------------
{
  // Limits are the square of the Strength score, scaled by size (Core Rulebook p.146):
  // Str 14 gives a heavy load at 49 kg, straining at 98 and a maximum of 196.
  const soldier = (str: number, inventory: Character['inventory'] = []) => make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str, dex: 12, con: 12, int: 12, wis: 12, cha: 12 });
    x.levels = [{ classId: 'soldier' }];
    x.inventory = inventory;
  });
  const packed = (n: number) => [{ uid: 'a', itemId: 'battle-armor', quantity: n, equipped: false }];

  const empty = computeCharacter(soldier(14));
  check('heavy load is a quarter of Strength squared', empty.carrying.heavy, 49);
  check('straining is half of it', empty.carrying.strain, 98);
  check('and the maximum is all of it', empty.carrying.maximum, 196);
  check('an empty pack is within the limit', empty.carrying.level, 'normal');
  check('speed is unaffected', empty.speed, 6);

  // Battle armor is 16 kg, so four is one kilo over the heavy threshold.
  const heavy = computeCharacter(soldier(14, packed(4)));
  check('a heavy load is recognised', [heavy.carrying.weight, heavy.carrying.level], [64, 'heavy']);
  check('speed drops to three quarters', heavy.speed, 4);
  check('and seven skills take the penalty', heavy.carrying.penalisedSkills.length, 7);
  const stealth = (d: typeof heavy) => d.skills.find(s => s.id === 'stealth')!.total;
  check('Stealth takes −10', stealth(empty) - stealth(heavy), 10);
  check('the breakdown names it',
    heavy.skills.find(s => s.id === 'stealth')!.parts.some(p => p.label === 'heavy load' && p.value === -10), true);
  check('a skill the load does not touch is unchanged',
    computeCharacter(soldier(14)).skills.find(s => s.id === 'perception')!.total,
    heavy.skills.find(s => s.id === 'perception')!.total);

  const strained = computeCharacter(soldier(14, packed(7)));
  check('straining leaves one square of movement', [strained.carrying.level, strained.speed], ['strained', 1]);
  const stuck = computeCharacter(soldier(14, packed(13)));
  check('past the maximum you cannot move', [stuck.carrying.level, stuck.speed], ['overloaded', 0]);

  // Size scales the whole scale: a Small character carries three quarters as much.
  const ewok = make(x => {
    x.speciesId = 'ewok';
    setAbilities(x, { str: 14, dex: 12, con: 12, int: 12, wis: 12, cha: 12 });
    x.levels = [{ classId: 'scout' }];
  });
  const small = computeCharacter(ewok);
  check('a Small character carries three quarters as much',
    [small.size, Math.round(small.carrying.heavy * 100) / 100],
    ['Small', Math.round(49 * 0.75 * ((small.abilities.str / 14) ** 2) * 100) / 100]);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Languages');
// ---------------------------------------------------------------------------
{
  const bothan = (int: number, chosen: string[] = []) => make(x => {
    x.speciesId = 'bothan';
    setAbilities(x, { str: 10, dex: 12, con: 12, int, wis: 12, cha: 12 });
    x.levels = [{ classId: 'noble' }];
    x.languages = chosen;
  });

  const plain = computeCharacter(bothan(10));
  check('species languages come free', plain.languages.automatic, ['Basic', 'Bothese']);
  check('an average Intelligence buys none', plain.languages.allowed, 0);

  const clever = computeCharacter(bothan(16, ['Huttese']));
  check('an Intelligence bonus buys that many', clever.languages.allowed, 3);
  check('chosen ones are listed apart from the species ones', clever.languages.chosen, ['Huttese']);

  // Species languages are not double-counted when they are also on the character.
  const overlap = computeCharacter(bothan(16, ['Basic', 'Huttese']));
  check('a species language does not use up an allowance', overlap.languages.chosen, ['Huttese']);

  check('every species language is in the list',
    Object.values(SPECIES).flatMap(s => s.languages ?? [])
      .filter(name => !Object.values(LANGUAGES).some(l => l.name === name)), []);
  check('the list is a real one', Object.keys(LANGUAGES).length > 40, true);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Prerequisites the sheet can check');
// ---------------------------------------------------------------------------
{
  // Prerequisites arrive as prose. Anything left unparsed is shown to the player as "not
  // enforced automatically", so the fewer of those the better — as long as none of them
  // is *wrong*, since over-restricting locks content that should be available.
  const all = Object.values(FEATURES);
  const leftover = all.flatMap(f => f.unparsedPrerequisites ?? []);
  check('fewer than a hundred phrases are still unparsed', leftover.length < 100, true);

  // The shorthand the sheets use has to resolve to the right thing.
  check('"Atk Combo (Melee) & (Ranged)" becomes both feats',
    FEATURES['attack-combo-fire-strike'].requirements?.features?.map(r => r.id).sort(),
    ['attack-combo-melee', 'attack-combo-ranged']);
  check('"Deception & Persuasion trained" trains both',
    FEATURES['noble-fencing-style'].requirements?.trainedSkills?.sort(), ['deception', 'persuasion']);
  check('"SF Knowledge (social sciences) or (galactic lore)" is an either/or',
    FEATURES['elders-knowledge'].requirements?.anyOf?.[0].map(o => o.features?.[0].spec),
    ['knowledge-social-sciences', 'knowledge-galactic-lore']);

  // An alternative is met when any one option is.
  const bare = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 14, dex: 16, con: 12, int: 12, wis: 14, cha: 12 });
    x.levels = Array.from({ length: 7 }, () => ({ classId: 'jedi' }));
    x.trainedSkills = ['use-the-force'];
  });
  // Fill a real talent slot, since a selection only counts when it matches one.
  const talentSlot = computeCharacter(bare).slots.find(sl => sl.kind === 'talent')!;
  const jedi = make(x => {
    Object.assign(x, structuredClone(bare));
    x.selections = [{ key: talentSlot.key, choiceId: 'talent', featureId: 'block' }];
  });
  const withBlock = computeCharacter(jedi);
  check('the test character really holds Block', hasFeature(withBlock.features, 'block'), true);
  const defensive = checkRequirementsFor('defensive-circle', jedi, withBlock);
  check('holding one of two alternatives satisfies it',
    defensive.checks.some(c => c.met && / or /.test(c.text)), true);

  // And unmet when neither is.
  check('holding neither does not', checkRequirementsFor('defensive-circle', bare, computeCharacter(bare))
    .checks.some(c => !c.met && / or /.test(c.text)), true);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Talent trees shared between classes');
// ---------------------------------------------------------------------------
{
  // The talent spreadsheet names one class per tree — the one it is printed under — so a
  // tree several classes can draw on only reached one of them. A Sith Apprentice could
  // not take Lightsaber Combat, Duelist or Armor Specialist, which its own class lists.
  const treesOf = (id: string) => (CLASSES[id].trees?.talent ?? []).map(t => TALENT_TREES[t]?.name).sort();

  check('a Sith Apprentice can reach the trees its class lists', treesOf('sith-apprentice'),
    ['Armor Specialist', 'Duelist', 'Lightsaber Combat', 'Sith', 'Sith Alchemy', 'Sith Commander']);
  check('so can an Imperial Knight', treesOf('imperial-knight').includes('Lightsaber Combat'), true);
  check('an Officer draws on Leadership and Commando',
    ['Leadership', 'Commando'].every(t => treesOf('officer').includes(t)), true);
  check('a Gunslinger draws on the Scoundrel trees',
    ['Awareness', 'Fortune'].every(t => treesOf('gunslinger').includes(t)), true);

  // Sharing goes one way only: nothing gained a tree it has no business with.
  check('a Jedi did not gain the Sith tree', treesOf('jedi').includes('Sith'), false);
  check('a Soldier did not gain Lightsaber Combat', treesOf('soldier').includes('Lightsaber Combat'), false);

  // Squad Leader is printed by two classes with *different* talents, so it is two trees.
  // Each class must see its own and not the other's.
  check('a split tree stays split',
    [CLASSES['soldier'].trees!.talent!.includes('squad-leader-soldier'),
      CLASSES['soldier'].trees!.talent!.includes('squad-leader-elite-trooper')],
    [true, false]);

  // Every tree a class points at has to exist and have something in it, or its slot
  // would show an empty heading.
  const broken: string[] = [];
  for (const cls of Object.values(CLASSES)) {
    for (const id of cls.trees?.talent ?? []) {
      const tree = TALENT_TREES[id];
      if (!tree) broken.push(`${cls.id} -> ${id} (missing)`);
      else if (!(tree.features ?? []).length) broken.push(`${cls.id} -> ${id} (empty)`);
    }
  }
  check('every class tree exists and has talents', broken, []);

  // The same tree must not be listed twice for one class.
  const doubled = Object.values(CLASSES)
    .filter(c => new Set(c.trees?.talent ?? []).size !== (c.trees?.talent ?? []).length)
    .map(c => c.id);
  check('no class lists a tree twice', doubled, []);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Nothing homebrew');
// ---------------------------------------------------------------------------
{
  // `npm run audit:provenance` does the full comparison against the Foundry pack, which
  // needs the clone. These are the checks that can be made from the shipped data alone,
  // so a regression cannot slip through on a machine without it.

  // The fan gear that used to be here all came from a handful of publications. Nothing
  // from them should ever reappear.
  const FAN_GEAR = [
    'stormtrooper-armor', 'dc-15a-blaster-rifle', 'clone-trooper-armor-phase-i',
    'espo-sound-pistol', 'nightsister-dagger', 'villip', 'z-6-rotary-blaster',
    'throwing-knife', 'molytex-light-battle-armor',
  ];
  check('the fan-made gear is gone', FAN_GEAR.filter(id => id in EQUIPMENT), []);

  // Equipment now carries the book it was printed in wherever the pack knew it, and every
  // one of those has to be a book we recognise.
  const KNOWN_BOOKS = new Set([...Object.keys(BOOK_NAMES), 'unknown', 'web', 'dawn']);
  const strangeBooks = [...new Set(Object.values(EQUIPMENT).map(i => i.book))]
    .filter(b => b && !KNOWN_BOOKS.has(b));
  check('every equipment book is one we know', strangeBooks, []);
  const attributed = Object.values(EQUIPMENT).filter(i => i.book && i.book !== 'unknown');
  check('most equipment now names its book', attributed.length > 350, true);

  const featureBooks = [...new Set(Object.values(FEATURES).map(f => f.book))]
    .filter(b => b && !KNOWN_BOOKS.has(b));
  check('and every feature book too', featureBooks, []);

  const speciesBooks = [...new Set(Object.values(SPECIES).map(s => s.book))]
    .filter(b => b && !KNOWN_BOOKS.has(b));
  check('and every species book', speciesBooks, []);

  // The pack also marks fan content in the description alone, with no category at all.
  // Anything carrying that notice as its rules text got in through that gap.
  const rulesText = (f: Feature) =>
    [...(f.description ?? []), ...(f.benefit ?? []), ...(f.special ?? [])].join(' ');
  const declared = Object.values(FEATURES)
    .filter(f => /this homebrew content|homebrew content has/i.test(rulesText(f)))
    .map(f => f.name);
  check('nothing carries the homebrew notice as its rules', declared, []);
  const declaredGear = Object.values(EQUIPMENT)
    .filter(i => /this homebrew content/i.test(i.notes ?? ''))
    .map(i => i.name);
  check('nor does any piece of gear', declaredGear, []);

  // Wiki pages and sourcebook blurbs that had been scraped in as items.
  const NOT_GEAR = ['climatic-hazards', 'weapons-by-size', 'galaxy-at-war', 'droid-heroes',
    'the-unknown-regions', 'dawn-of-defiance', 'falling-damage', 'poisons'];
  check('no wiki pages masquerading as gear', NOT_GEAR.filter(id => id in EQUIPMENT), []);

  // The four homebrew starship maneuvers are gone.
  check('the homebrew starship maneuvers are gone',
    ['Shield Group', 'Shield Trio', 'Missile Defense', 'Shadow Bomb']
      .filter(n => Object.values(FEATURES).some(f => f.name === n && f.type === 'starship-maneuver')), []);

  // Equipment now carries a page as well as a book wherever the Omegadex indexed it.
  const paged = Object.values(EQUIPMENT).filter(i => i.page);
  check('most equipment cites a page', paged.length > 300, true);

  // The three talents whose names collide with homebrew are the Knights of the Old
  // Republic ones, not the fan "Jumptrooper" tree.
  for (const id of ['burning-assault', 'improved-trajectory', 'jet-pack-withdraw']) {
    check(`${id} is the sourcebook talent`, [FEATURES[id]?.book, FEATURES[id]?.page], ['knights', 30]);
  }
  check('and none of them mentions a jumptrooper',
    ['burning-assault', 'improved-trajectory', 'jet-pack-withdraw']
      .filter(id => /jumptrooper/i.test((FEATURES[id]?.description ?? []).join(' '))), []);
}

// ---------------------------------------------------------------------------
console.log('\n▸ One entry per thing');
// ---------------------------------------------------------------------------
{
  // Three sources feed the feature table, and a name can arrive from more than one of
  // them. Two rules for that: the same thing must never exist twice, and two different
  // things that share a name must stay apart with the text that belongs to each.
  const all = Object.values(FEATURES);
  const body = (f: Feature) => [...(f.description ?? []), ...(f.benefit ?? []), ...(f.special ?? [])]
    .join(' ').replace(/<[^>]+>/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, '');

  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const f of all) {
    // The Near-Human template offers its own parallel set of traits, listed by id in
    // nearHuman.json, so `near-human-scent` beside `scent` is the design and not a clash.
    if (f.id.startsWith('near-human-')) continue;
    const key = `${f.type}|${f.name.toLowerCase()}|${body(f)}`;
    if (seen.has(key)) duplicates.push(`${seen.get(key)} = ${f.id}`);
    else seen.set(key, f.id);
  }
  check('nothing exists twice under two ids', duplicates, []);

  // Sith Alchemy: the Sith tree's makes a Sith Talisman (KotOR p.41), the Sith Alchemy
  // tree's makes amulets, armor, talismans and weapons (JATM p.21). One entry shown in
  // both trees read the same in each, which is what gave the duplicate away.
  const sith = FEATURES['sith-alchemy'];
  const jatm = FEATURES['sith-alchemy-jedi'];
  check('the two Sith Alchemy talents are separate entries', [sith?.name, jatm?.name],
    ['Sith Alchemy', 'Sith Alchemy']);
  check('each cites the book it came from', [sith.book, sith.page, jatm.book, jatm.page],
    ['knights', 41, 'jedi', 21]);
  check('and carries that book\'s rules',
    [/Talisman/.test(sith.description.join(' ')) && !/Amulet/.test(sith.description.join(' ')),
      /Amulet/.test(jatm.description.join(' '))],
    [true, true]);

  const treeIds = (id: string) => Object.entries(TALENT_TREES)
    .filter(([, t]) => (t.features ?? []).some(r => r.id === id)).map(([k]) => k);
  check('the Sith tree lists only its own', treeIds('sith-alchemy'), ['sith']);
  check('and the Sith Alchemy tree only its own', treeIds('sith-alchemy-jedi'), ['sith-alchemy']);

  // No tree may list the same talent twice, whatever its id.
  // A tree may legitimately list one feature twice with different specializations —
  // a starting-feat tree grants Weapon Proficiency for two groups — so the check is on
  // the pair, not the name alone.
  const repeated: string[] = [];
  for (const [id, tree] of Object.entries(TALENT_TREES)) {
    const shown = (tree.features ?? [])
      .map(r => `${FEATURES[r.id]?.name}${r.spec ? ` (${r.spec})` : ''}`)
      .filter(n => !n.startsWith('undefined'));
    const dupes = shown.filter((n, i) => shown.indexOf(n) !== i);
    if (dupes.length) repeated.push(`${id}: ${[...new Set(dupes)].join(', ')}`);
  }
  check('no talent tree offers the same thing twice', repeated, []);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Choices made when a feature is taken');
// ---------------------------------------------------------------------------
{
  // "Choose one Talent from the Lightsaber Forms Talent Tree" has to become a choice you
  // can actually make, and one the sheet then shows.
  const jedi = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 14, dex: 16, con: 12, int: 12, wis: 14, cha: 12 });
    x.levels = Array.from({ length: 9 }, () => ({ classId: 'jedi' }));
    x.trainedSkills = ['use-the-force'];
  });
  const d = computeCharacter(jedi);

  const stolen = FEATURES['stolen-form'];
  check('Stolen Form asks for a talent', stolen.specType, 'talent');
  const forms = specOptionsFor(stolen, d);
  check('and offers the Lightsaber Forms tree',
    forms.length, TALENT_TREES['lightsaber-forms'].features.length);
  check('by name', forms.some(o => o.name === 'Ataru'), true);

  // Its own rules say you must meet the chosen talent's prerequisites as well, so a form
  // that is out of reach is not on offer either.
  const open = canSelect('stolen-form', jedi, d);
  check('only forms whose own prerequisites are met are viable',
    open.viableSpecs.length < forms.length, true);
  const blocked = forms.find(o => !open.viableSpecs.includes(o.id))!;
  const withBlocked = canSelect('stolen-form', jedi, d, blocked.id);
  check('and picking a blocked one is refused', withBlocked.met, false);
  check('with a check naming it',
    withBlocked.checks.some(c => !c.met && c.text.includes(blocked.name)), true);

  // The choice reads as part of the name once made.
  check('the choice shows on the sheet', featureName('stolen-form', 'ataru'), 'Stolen Form (Ataru)');

  // "…that you already possess" only offers what the character actually has.
  const shared = FEATURES['share-talent'];
  check('Share Talent draws on talents you hold', shared.specHeld, true);
  check('so a character with none is offered none', specOptionsFor(shared, d).length, 0);

  // "Choose one Trained Skill" should not offer skills you are untrained in.
  const skillful = specOptionsFor(FEATURES['skillful-recovery'], d);
  check('a trained-skill choice offers only trained skills',
    skillful.map(o => o.id), ['use-the-force']);
  check('while an any-skill choice offers them all',
    specOptionsFor(FEATURES['assured-skill'], d).length > skillful.length, true);

  // Lists that exist only in prose still become a real choice.
  const degrees = specOptionsFor(FEATURES['droid-focus'], d);
  check('Droid Focus offers the five degrees', degrees.length, 5);
  check('named properly', degrees[0].name, '1st-Degree Droid');
  check('and the pick is labelled on the sheet',
    featureName('droid-focus', 'degree-3'), 'Droid Focus (3rd-Degree Droid)');

  // Every kind the data uses must have somewhere to draw options from and a label.
  const kinds = new Set(Object.values(FEATURES).map(f => f.specType).filter(Boolean));
  check('every spec kind in the data has a picker label',
    [...kinds].filter(k => !(k! in SPEC_LABELS)), []);

  // A feature that asks for a choice but can never offer one would lock its slot.
  const empty = Object.values(FEATURES).filter(f =>
    f.specType && f.specType !== 'force-power' && f.specType !== 'force-technique'
    && f.specType !== 'force-secret' && !f.specHeld && !f.specTrained
    && specOptionsFor(f, d).length === 0);
  check('no feature asks for a choice it cannot offer', empty.map(f => f.id), []);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Rules text quality');
// ---------------------------------------------------------------------------
{
  // The talent and feat spreadsheets carry summaries — "1/encounter Persuasion v. Will
  // w/in LOS" — and the Foundry pack supplies the real wording. That text is scraped wiki
  // HTML, so these guard the cleaning as much as the coverage.
  const all = Object.values(FEATURES);
  const lines = all.flatMap(f => [
    ...(f.description ?? []), ...(f.benefit ?? []), ...(f.special ?? []), ...(f.normal ?? []),
  ]);

  // Rules text is rendered as HTML, so only the two tags the sheet styles may appear.
  const strayTag = lines.filter(l => /<(?!\/?(strong|em)>)[a-z!/][^>]*>/i.test(l));
  check('no markup beyond <strong> and <em> survives the import', strayTag.slice(0, 3), []);
  check('no unresolved HTML entities', lines.filter(l => /&[a-z]+;|&#\d/i.test(l)).slice(0, 3), []);

  // Wiki links carry no surrounding spaces, so stripping them naively runs words together.
  check('no text runs into an emphasis tag',
    lines.filter(l => /<\/(strong|em)>[A-Za-z0-9(]|[A-Za-z0-9,.;:)]<(strong|em)>/.test(l)).slice(0, 3), []);
  check('no space stranded before punctuation', lines.filter(l => / [,.;:)]/.test(l)).slice(0, 3), []);
  check('no doubled spaces', lines.filter(l => / {2}/.test(l)).slice(0, 3), []);

  // "Reference Book: …" and "See also: …" are wiki navigation and must not reach a tooltip.
  check('no wiki navigation lines',
    lines.filter(l => /^(<[^>]+>)*\s*(Reference Book|See also)\s*:/i.test(l)).slice(0, 3), []);
  check('no disambiguation hatnotes',
    lines.filter(l => /This article details|You may be looking for/i.test(l)).slice(0, 3), []);

  // Prerequisites are enforced from the spreadsheets; the wiki's prose copy would only
  // disagree with them, so the importer drops it.
  check('imported feats carry no prose prerequisite line',
    lines.filter(l => /^Prerequisites?:/i.test(l)).slice(0, 3), []);

  // Coverage: the great majority of talents now carry real rules text.
  const talents = all.filter(f => f.type === 'talent');
  const summarised = talents.filter(f => f.summaryOnly).length;
  check('fewer than a tenth of talents are still summaries', summarised < talents.length / 10, true);

  // Spot checks against the sourcebooks, including the clause the summary had dropped.
  const clout = FEATURES['corporate-clout'];
  check('Corporate Clout has its full text', clout.summaryOnly, undefined);
  check('including the tier the summary left out',
    clout.description.join(' ').includes('Attitude toward you is now Friendly'), true);
  const drain = FEATURES['drain-knowledge'];
  check('Drain Knowledge is no longer a summary', drain.summaryOnly, undefined);
  check('and reads as rules rather than shorthand',
    drain.description.join(' ').includes('you may not try again on the same target for one day'), true);

  // Entries that already read as rules are rewritten too, but only for a real gain —
  // Battle Analysis had lost a whole clause about vehicles.
  check('Battle Analysis regains its vehicle clause',
    FEATURES['battle-analysis'].description.join(' ').includes('Use Computer'), true);
  check('a species trait gains its rules',
    FEATURES['prehensile-tail'].description.join(' ').includes('Small or smaller item'), true);

  // The traits pack also holds an entry per species, which is the wiki's encyclopedia
  // article — three paragraphs on Cathar city-trees and not one rule. Those stay out.
  check('species articles are not imported as trait rules',
    FEATURES['cathar'].description.join(' ').includes('city-trees'), false);

  // Some pack entries stop at the colon introducing their options, and the options never
  // arrived. Longer, but missing rules — so the summary is kept underneath.
  const twoFaced = FEATURES['two-faced'].description;
  check('a truncated entry keeps the summary that listed its options',
    twoFaced.length > 1 && /1\/enc/.test(twoFaced.at(-1)!), true);

  // A DC table has to survive as readable lines, not a column of loose fragments.
  const storm = FEATURES['force-storm'].description.join('\n');
  check('a DC table becomes readable lines', /<strong>DC 20:<\/strong> You create/.test(storm), true);
  check('and its dark side tag is not spaced apart', storm.includes('<strong>[<em>Dark Side</em>]</strong>'), true);

  // Fuller text feeds the attack engine, which reads damage straight out of it.
  const ionize = FEATURES['ionize'].description.join(' ');
  check('Ionize now states its first damage tier', /4d6 points of Ion damage/.test(ionize), true);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Hover breakdowns');
// ---------------------------------------------------------------------------
{
  // Every number the sheet shows is explained on hover, so the parts behind each one
  // have to add up to the number itself — a breakdown that does not is worse than none.
  const c = make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 14, dex: 14, con: 12, int: 12, wis: 16, cha: 14 });
    x.levels = [
      ...Array.from({ length: 5 }, () => ({ classId: 'jedi' })),
      ...Array.from({ length: 4 }, () => ({ classId: 'soldier' })),
    ];
    x.trainedSkills = ['use-the-force'];
    x.inventory = [{ uid: 'a', itemId: 'combat-jumpsuit', quantity: 1, equipped: true }];
    x.selections = [
      { key: 'feat:3', choiceId: 'feat', featureId: 'force-training' },
      { key: 'force-power:feat:3:0', choiceId: 'force-power', featureId: 'force-lightning' },
    ];
  });
  const d = computeCharacter(c);
  const sum = (parts: { value: number }[]) => parts.reduce((n, p) => n + p.value, 0);

  for (const key of ['reflex', 'fortitude', 'will'] as const) {
    check(`the ${key} breakdown adds up to the defense`, sum(d.defenseBreakdown[key]), d.defenses[key]);
  }

  const utf = d.skills.find(s => s.id === 'use-the-force')!;
  check('a skill breakdown adds up to its total', sum(utf.parts), utf.total);
  check('and names every source', utf.parts.map(p => p.label).includes('trained'), true);
  const untrained = d.skills.find(s => s.id === 'pilot')!;
  check('an untrained skill still breaks down', sum(untrained.parts), untrained.total);

  // Base attack bonus is summed across classes, so each class carries its own share.
  // Jedi and Soldier both have a full base attack bonus, so five levels give five.
  check('each class reports the base attack bonus it contributes',
    d.classLevels.map(x => `${x.cls.id} ${x.bab}`), ['jedi 5', 'soldier 4']);
  check('which add up to the total', d.classLevels.reduce((n, x) => n + x.bab, 0), d.baseAttackBonus);

  // The Use the Force modifier a power rolls with is explained the same way.
  const power = buildPowers(d).find(p => p.id === 'force-lightning')!;
  check('a power carries the working behind its check', sum(power.checkParts), power.useTheForce);

  // Armor caps Dexterity, and the breakdown has to say so rather than silently differ.
  const capped = computeCharacter(make(x => {
    x.speciesId = 'human';
    setAbilities(x, { str: 12, dex: 18, con: 12, int: 12, wis: 12, cha: 12 });
    x.levels = [{ classId: 'soldier' }];
    x.inventory = [{ uid: 'a', itemId: 'battle-armor', quantity: 1, equipped: true }];
  }));
  const dexPart = capped.defenseBreakdown.reflex.find(p => p.label.startsWith('Dex'))!;
  check('a Dexterity bonus capped by armor is labelled as such',
    dexPart.label.includes('capped by armor'), true);
  check('and the capped value is the one used', sum(capped.defenseBreakdown.reflex), capped.defenses.reflex);
}

// ---------------------------------------------------------------------------
console.log('\n▸ Source hygiene');
// ---------------------------------------------------------------------------
{
  // Vite's dev-mode transform has dropped value bindings from imports that mix values
  // with an inline `type` specifier, producing a ReferenceError that neither `tsc` nor
  // the production build catches. Keep type imports on their own line.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
          if (/^import\s*\{[^}]*,\s*type\s/.test(line)) offenders.push(`${full}:${i + 1}`);
        });
      }
    }
  };
  walk(join(import.meta.dirname, '..'));
  check('no imports mixing values with an inline `type` specifier', offenders, []);
}

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
