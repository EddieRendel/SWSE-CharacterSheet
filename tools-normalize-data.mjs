import * as M from './tools-source-bundle.mjs';
import fs from 'fs';
const OUT = 'src/data';
fs.mkdirSync(OUT, { recursive: true });

const fixes = [], gaps = [];
const titleize = id => id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

// ---- FEATURES ----
const features = {};
for (const [id, f] of Object.entries(M.F)) {
  const o = { id, ...structuredClone(f) };
  if (o.requirements && 'levle' in o.requirements) {
    o.requirements.level = o.requirements.levle;
    delete o.requirements.levle;
    fixes.push(`feature "${id}": requirements.levle -> requirements.level (prereq was never enforced)`);
  }
  if (!o.type) o.type = 'trait';
  features[id] = o;
}

// Match species loosely: the data references them by name as well as id, and the
// punctuation differs ("twi'lek" vs the "twilek" id, "Kel Dor" vs "kel-dor").
const norm = x => String(x).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '');
const speciesByKey = new Map();
for (const [id, sp] of Object.entries(M.b)) {
  speciesByKey.set(norm(id), id);
  speciesByKey.set(norm(sp.name), id);
}

// ---- SPECIES-AS-PREREQUISITE ----
// Source encodes species prerequisites as feature refs (e.g. {id:"wookiee"}). Retarget them.
let retargeted = 0;
for (const f of Object.values(features)) {
  const reqs = f.requirements;
  if (!reqs?.features) continue;
  const keep = [];
  for (const r of reqs.features) {
    const speciesId = speciesByKey.get(norm(r.id));
    if (!(r.id in features) && speciesId) {
      (reqs.species ??= []).push(speciesId); retargeted++;
    } else keep.push(r);
  }
  reqs.features = keep;
  if (!reqs.features.length) delete reqs.features;
}
if (retargeted) fixes.push(`${retargeted} species prerequisites retargeted from features -> species`);

// ---- TALENT TREES ----
const talentTrees = {};
for (const [id, t] of Object.entries(M.T)) talentTrees[id] = { id, ...structuredClone(t) };

// ---- CLASSES ----
const classes = {};
for (const [id, c] of Object.entries(M.C)) {
  const o = { id, ...structuredClone(c) };
  o.maxLevel = o.maxLevel ?? o.maxLevels ?? 10;   // base classes use maxLevel, prestige use maxLevels
  delete o.maxLevels;
  o.prestige = !!c.requirements;
  if (o.prestige) {
    o.startingHitPoints ??= 0;
    o.baseSkills ??= 0;
    o.classSkills ??= [];
  }
  classes[id] = o;
}

// ---- SPECIES ----
const species = {};
for (const [id, s] of Object.entries(M.b)) species[id] = { id, ...structuredClone(s) };

// ---- SKILLS ----
const skills = {};
for (const [id, s] of Object.entries(M.S)) skills[id] = { id, ...structuredClone(s) };

// Class-specific talent trees that the source references but never defines. They are
// real, distinct trees — NOT synonyms for the generic Force trees — so they are stubbed
// with their proper names and left for content to be supplied via supplement.json.
const TREE_NAMES = {
  'dark-side-devotee': 'Dark Side Devotee',
  'force-adept': 'Force Adept',
  'force-item': 'Force Item',
  'sith': 'Sith',
  'expert-pilot': 'Expert Pilot',
  'gunner': 'Gunner',
  'knights-resolve': "Knight's Resolve",
  'piracy': 'Piracy',
  'military-tactics': 'Military Tactics',
};

// ---- STUB DANGLING REFERENCES ----
// The source references content it never defines. Stub it so trees stay browsable
// and selections remain possible, but flag it as incomplete in the UI.
const needFeat = new Set(), needTree = new Set();
for (const t of Object.values(talentTrees)) for (const r of t.features ?? []) if (!(r.id in features)) needFeat.add(r.id);
for (const c of Object.values(classes)) {
  for (const g of c.features ?? []) for (const r of g ?? []) if (!(r.id in features)) needFeat.add(r.id);
  for (const k of Object.values(c.trees ?? {})) for (const t of k) if (!(t in talentTrees)) needTree.add(t);
}
for (const s of Object.values(species)) for (const r of s.features ?? []) if (!(r.id in features)) needFeat.add(r.id);
for (const f of Object.values(features)) for (const r of f.requirements?.features ?? []) if (!(r.id in features)) needFeat.add(r.id);

// Infer a stub's type from where it is referenced.
const treeFeatureIds = new Set();
for (const t of Object.values(talentTrees)) for (const r of t.features ?? []) treeFeatureIds.add(r.id);
for (const id of needFeat) {
  features[id] = {
    id, name: titleize(id), book: 'unknown',
    type: treeFeatureIds.has(id) ? 'talent' : 'feat',
    description: ['This entry is referenced by the rules data but its text is not included. Check your sourcebook for the full rules.'],
    incomplete: true,
  };
  gaps.push(`feature "${id}"`);
}
for (const id of needTree) {
  talentTrees[id] = {
    id, name: TREE_NAMES[id] ?? titleize(id),
    description: ['The talents in this tree are not included in the rules data. Check your sourcebook.'],
    features: [], incomplete: true,
  };
  gaps.push(`talent tree "${id}"`);
}

/**
 * Carrying capacity, which the bundle does not carry. A character's limits come from the
 * square of their Strength score, scaled by size (Core Rulebook p.146):
 *   heavy load     (Str x 0.5)^2   speed drops to three quarters, -10 on the skills below
 *   strain         Str^2 x 0.5     speed drops to one square
 *   maximum        Str^2           you cannot move at all
 */
const carryingCapacity = {
  sizeMultiplier: {
    Colossal: 20, Gargantuan: 10, Huge: 5, Large: 2, Medium: 1,
    Small: 0.75, Tiny: 0.5, Diminutive: 0.25, Fine: 0.01,
  },
  heavyLoadPenalty: -10,
  heavyLoadSkills: ['acrobatics', 'climb', 'endurance', 'initiative', 'jump', 'stealth', 'swim'],
};

const rules = {
  abilities: M.A, defenses: M.D, sizes: M.a, sizeModifiers: M.d, conditionTrack: M.c,
  carryingCapacity,
};

const write = (n, d) => fs.writeFileSync(`${OUT}/${n}.json`, JSON.stringify(d, null, 2));
write('features', features); write('classes', classes); write('species', species);
write('skills', skills); write('talentTrees', talentTrees); write('rules', rules);
write('dataGaps', gaps);
write('dataRepairs', fixes);

// Re-verify integrity
let bad = 0;
for (const t of Object.values(talentTrees)) for (const r of t.features ?? []) if (!(r.id in features)) bad++;
for (const c of Object.values(classes)) {
  for (const g of c.features ?? []) for (const r of g ?? []) if (!(r.id in features)) bad++;
  for (const k of Object.values(c.trees ?? {})) for (const t of k) if (!(t in talentTrees)) bad++;
}
for (const f of Object.values(features)) for (const r of f.requirements?.features ?? []) if (!(r.id in features)) bad++;
for (const s of Object.values(species)) for (const r of s.features ?? []) if (!(r.id in features)) bad++;

console.log('FIXES:'); fixes.forEach(f => console.log('  - ' + f));
console.log(`\nSTUBBED ${gaps.length} missing entries`);
console.log(`COUNTS: features=${Object.keys(features).length} classes=${Object.keys(classes).length} species=${Object.keys(species).length} trees=${Object.keys(talentTrees).length} skills=${Object.keys(skills).length}`);
console.log(`REMAINING DANGLING REFS: ${bad}`);
