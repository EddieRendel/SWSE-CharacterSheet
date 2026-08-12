/**
 * Give every class the talent trees it can actually draw on.
 *
 *   node tools-wire-talent-trees.mjs ./Foundry-VTT-StarWars-SagaEdition
 *
 * The talent spreadsheet names one class per tree — the class the tree is printed under —
 * so a tree shared by several classes only reached one of them. A Sith Apprentice could
 * not take Lightsaber Combat, Duelist or Armor Specialist, which its own class entry
 * lists, because those trees are printed under Jedi, Jedi Knight and Soldier.
 *
 * The Foundry pack records the whole picture: every talent carries `possibleProviders`,
 * the list of classes whose talent trees include the tree it belongs to. Aggregating that
 * per tree gives class -> trees, which is exactly what the spreadsheet is missing.
 *
 * Additive only. A link the spreadsheet already has is never removed, and a tree Foundry
 * claims for a class we do not have — or that we have no talents for — is skipped and
 * reported rather than invented.
 *
 * Run after `import:excel`, which rebuilds each class's tree list from the spreadsheet.
 */
import { ClassicLevel } from 'classic-level';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = process.argv[2] ?? './Foundry-VTT-StarWars-SagaEdition';
const DATA = 'src/data';
if (!existsSync(`${ROOT}/packs/talents`)) {
  console.error(`No packs found at ${ROOT}/packs. Pass the path to the cloned system.`);
  process.exit(1);
}

const read = f => JSON.parse(readFileSync(`${DATA}/${f}.json`, 'utf8'));
const classes = read('classes');
const talentTrees = read('talentTrees');

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---------------------------------------------------------------------------
// tree name -> the classes that can take it
// ---------------------------------------------------------------------------
const providers = new Map();
const notUnanimous = [];
{
  const perTree = new Map();   // tree -> counts per class, plus how many talents it has
  const db = new ClassicLevel(`${ROOT}/packs/talents`, { valueEncoding: 'json' });
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith('!folders') || !value?.name) continue;
    const tree = String(value.system?.talentTree ?? '').replace(/\s*Talent Trees?$/i, '').trim();
    if (!tree) continue;
    if (!perTree.has(tree)) perTree.set(tree, { talents: 0, counts: new Map() });
    const entry = perTree.get(tree);
    entry.talents++;
    for (const provider of value.system?.possibleProviders ?? []) {
      // Providers mix "<Class> Talent Trees" with book names; only the first is a class.
      const match = String(provider).match(/^(.*?)\s+Talent Trees$/);
      if (!match) continue;
      const name = match[1].trim();
      entry.counts.set(name, (entry.counts.get(name) ?? 0) + 1);
    }
  }
  await db.close();

  // The tag lives on each talent rather than on the tree, so a class counts as having
  // the tree only when *every* talent in it agrees. Across the pack 296 of 298 tree and
  // class pairs are unanimous; the two that are not are one talent's stray tag.
  for (const [tree, { talents, counts }] of perTree) {
    providers.set(tree, new Set());
    for (const [name, n] of counts) {
      if (n === talents) providers.get(tree).add(name);
      else notUnanimous.push(`${tree} for ${name}: ${n} of ${talents} talents`);
    }
  }
}

const classByName = new Map(Object.values(classes).map(c => [norm(c.name), c.id]));
const treesByName = new Map();
for (const [id, tree] of Object.entries(talentTrees)) {
  if (!treesByName.has(norm(tree.name))) treesByName.set(norm(tree.name), []);
  treesByName.get(norm(tree.name)).push({ id, group: tree.group });
}

const added = {};
const unknownClass = new Set();
const unknownTree = new Set();
const ambiguous = [];

for (const [treeName, classNames] of providers) {
  const candidates = treesByName.get(norm(treeName));
  if (!candidates) { unknownTree.add(treeName); continue; }

  for (const className of classNames) {
    const classId = classByName.get(norm(className));
    if (!classId) { unknownClass.add(className); continue; }

    // One tree name can cover two trees when two classes print different talents under
    // it; then only the variant belonging to this class applies.
    const tree = candidates.length === 1
      ? candidates[0]
      : candidates.find(c => norm(c.group ?? '') === norm(className));
    if (!tree) { ambiguous.push(`${treeName} for ${className}`); continue; }
    if (!(tree.id in talentTrees)) continue;

    const cls = classes[classId];
    cls.trees ??= {};
    cls.trees.talent ??= [];
    if (cls.trees.talent.includes(tree.id)) continue;
    cls.trees.talent.push(tree.id);
    (added[classId] ??= []).push(tree.id);
  }
}

for (const cls of Object.values(classes)) {
  if (cls.trees?.talent) cls.trees.talent.sort();
}

writeFileSync(`${DATA}/classes.json`, JSON.stringify(classes, null, 2) + '\n');

const total = Object.values(added).reduce((n, l) => n + l.length, 0);
console.log(`${providers.size} trees in the pack carry a provider list.`);
console.log(`${total} shared trees restored across ${Object.keys(added).length} classes:`);
for (const [classId, list] of Object.entries(added).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${classId.padEnd(22)} + ${list.sort().join(', ')}`);
}
if (notUnanimous.length) {
  console.log(`\n${notUnanimous.length} tagged on only some of a tree's talents, so not applied:`);
  for (const n of notUnanimous) console.log(`  ${n}`);
}
if (unknownTree.size) console.log(`\n${unknownTree.size} trees the pack has and we do not, skipped.`);
if (unknownClass.size) console.log(`${unknownClass.size} classes the pack has and we do not, skipped.`);
if (ambiguous.length) {
  console.log(`\n${ambiguous.length} could not be matched to one of our split trees:`);
  for (const a of ambiguous) console.log(`  ${a}`);
}
