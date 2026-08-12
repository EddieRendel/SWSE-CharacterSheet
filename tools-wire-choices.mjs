/**
 * Wire up the features whose rules ask you to choose something when you take them.
 *
 *   node tools-wire-choices.mjs
 *
 * Stolen Form reads "Choose one Talent from the Lightsaber Forms Talent Tree", and until
 * that choice is recorded the talent on your sheet says nothing about which form you
 * stole. The app already has the machinery — `specType` drives a picker and the choice
 * shows next to the name — but only the two dozen entries that arrived with it from the
 * source bundle used it.
 *
 * The classification is curated rather than inferred, because the same phrasing covers
 * two very different things: "choose one Trained Skill" is part of your character, while
 * "choose one enemy within line of sight" is something you do on your turn and must never
 * become a build-time picker. Every feature whose text asks you to choose is therefore
 * listed below as either a CHOICE or IN_PLAY, and anything new that appears in neither
 * fails the run rather than being guessed at.
 *
 * Run after `import:foundry-text`, since fuller rules text is what reveals the choices.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DATA = 'src/data';
const read = f => JSON.parse(readFileSync(`${DATA}/${f}.json`, 'utf8'));
const features = read('features');
const talentTrees = read('talentTrees');

const MELEE_GROUPS = ['advanced-melee-weapons', 'lightsabers', 'simple-weapons'];
const SPEC_GROUPS = ['advanced-melee-weapons', 'heavy-weapons', 'pistols', 'rifles', 'simple-weapons'];

/**
 * Choices that become part of the character. `trees` restricts a talent choice to those
 * talent trees; `held` restricts it to things the character already has, which is what
 * "choose one Talent that you already possess" means.
 */
const CHOICES = {
  // --- a talent, from a named tree ---
  'stolen-form': { specType: 'talent', specTrees: ['lightsaber-forms'] },
  'share-talent': { specType: 'talent', specTrees: ['lightsaber-combat'], specHeld: true },
  'coordinated-leadership': { specType: 'talent', specTrees: ['leadership'], specHeld: true },
  'squadron-maneuvers': { specType: 'talent', specTrees: ['expert-pilot', 'gunner'], specHeld: true },

  // --- a skill ---
  'assured-skill': { specType: 'skill' },
  'exceptional-skill': { specType: 'skill', specTrained: true },
  'skill-boon': { specType: 'skill', specTrained: true },
  'skill-confidence': { specType: 'skill', specTrained: true },
  'skillful-recovery': { specType: 'skill', specTrained: true },
  'task-optimization': { specType: 'skill', specTrained: true },
  'mission-specialist': { specType: 'skill', specTrained: true },
  'logic-upgrade-skill-swap': { specType: 'skill' },

  // --- something Force-related you already know ---
  'force-power-adept': { specType: 'force-power' },
  'focused-force-talisman': { specType: 'force-power' },
  'force-exertion': { specType: 'force-power' },
  'many-shades-of-the-force': { specType: 'force-power' },
  'share-force-secret': { specType: 'force-secret', specHeld: true },
  'share-force-technique': { specType: 'force-technique', specHeld: true },

  // --- a weapon group you are proficient with ---
  'withdrawal-strike': { specType: 'weapon-group' },
  'disarming-attack': { specType: 'weapon-group' },
  'flurry-attack': { specType: 'weapon-group' },
  'accurate-blow': { specType: 'weapon-group', allowedSpecs: MELEE_GROUPS },
  'greater-weapon-specialization-lightsabers': { specType: 'weapon-group', allowedSpecs: SPEC_GROUPS },
  'brutal-attack': { specType: 'weapon' },

  // --- a list spelled out in the rules text and nowhere else ---
  'droid-focus': {
    specType: 'option',
    specOptions: [1, 2, 3, 4, 5].map(n => ({ id: `degree-${n}`, name: `${n}${['st', 'nd', 'rd', 'th', 'th'][n - 1]}-Degree Droid` })),
  },
  'nikto-survival': {
    specType: 'option',
    specOptions: [
      { id: 'kajainsa', name: "Kajain'sa'Nikto (Desert)" },
      { id: 'kadassa', name: "Kadas'sa'Nikto (Forest)" },
      { id: 'esralsa', name: "Esral'sa'Nikto (Mountains)" },
      { id: 'gluss', name: "Gluss'sa'Nikto (Pale)" },
    ],
  },
  'superior-tech': {
    specType: 'option',
    specOptions: ['Armor', 'Weapons', 'Droids', 'Vehicles', 'Devices']
      .map(n => ({ id: n.toLowerCase(), name: n })),
  },
  'near-human-climate-adaptation': {
    specType: 'option',
    specOptions: ['Freezing', 'Rarefied atmosphere', 'Searing', 'Smoky', 'Tropical', 'Watery']
      .map(n => ({ id: n.toLowerCase().replace(/\W+/g, '-'), name: n })),
  },
};

/**
 * Everything else whose text says "choose", and why it is not a specialization. Listed
 * explicitly so the audit below can tell "someone decided this" from "nobody has looked
 * at it yet".
 */
const NOT_A_SPEC = new Set([
  // Chosen at the table, not on the sheet: a target, an ally, an effect for this turn.
  'deceptive-shot', 'dodge', 'unbalance-opponent', 'know-your-enemy', 'cast-suspicion',
  'revolutionary-rhetoric', 'consulars-wisdom', 'try-your-luck', 'advanced-planning',
  'prudent-escape', 'tactical-superiority', 'targeted-area', 'forceful-recovery',
  'mind-trick', 'technometry', 'deep-space-raider', 'tripwire', 'force-directed-shot',
  'negate-and-redirect', 'device-jammer', 'quick-modifications', 'linked-power',
  'angle-deflector-shields', 'overwhelming-assault', 'critical-skill-success',
  'prophet', 'droid-traits', 'beastly-traits',

  // These grant a whole extra slot, which is a better fit than a specialization: what
  // you pick lands in the slot itself rather than as a label on the feature that gave
  // it to you. Adaptable Talent already works this way; Telekinetic Prodigy does not
  // yet — it should add a Force power slot, and until it does the pick is manual.
  'adaptable-talent', 'telekinetic-prodigy',
  // "Choose two Talents" — the sheet records one specialization, so this needs its own
  // treatment rather than a picker that would silently drop the second.
  'done-it-all', 'recurring-success',
  // The rules text lists the vehicle types in a table the source dropped, so there is
  // nothing to offer yet.
  'vehicle-focus',
  // Equipment chosen at character creation, which the inventory already covers.
  'near-human-biotech-augmentation', 'near-human-cultural-cybernetics', 'signature-item',
]);

// ---------------------------------------------------------------------------

const errors = [];
let wired = 0;

for (const [id, config] of Object.entries(CHOICES)) {
  const feature = features[id];
  if (!feature) { errors.push(`${id}: no such feature`); continue; }

  for (const tree of config.specTrees ?? []) {
    if (!talentTrees[tree]) errors.push(`${id}: no talent tree "${tree}"`);
  }

  Object.assign(feature, config);
  wired++;
}

// Anything whose text asks for a choice must be classified one way or the other, so that
// a future import cannot quietly add an unwired choice.
const textOf = f => [...(f.description ?? []), ...(f.benefit ?? []), ...(f.special ?? [])]
  .join(' ').replace(/<[^>]+>/g, ' ');
const ASKS = /\b(?:choose|select|pick)\s+(?:one|a|an|any|two|three|1|2)\b/i;

const unclassified = Object.values(features)
  .filter(f => ASKS.test(textOf(f)) && !f.specType && !NOT_A_SPEC.has(f.id))
  .map(f => f.id);

if (errors.length) {
  console.error('Errors:\n  ' + errors.join('\n  '));
  process.exit(1);
}
if (unclassified.length) {
  console.error(`${unclassified.length} features ask you to choose something but are in neither list.`);
  console.error('Add each to CHOICES or IN_PLAY in this file:\n  ' + unclassified.join('\n  '));
  process.exit(1);
}

writeFileSync(`${DATA}/features.json`, JSON.stringify(features, null, 2) + '\n');

const byType = {};
for (const f of Object.values(features)) {
  if (f.specType) byType[f.specType] = (byType[f.specType] ?? 0) + 1;
}
console.log(`Wired ${wired} choices. ${NOT_A_SPEC.size} more choices are deliberately not specializations.`);
console.log('Features that now take a choice, by kind:', byType);
