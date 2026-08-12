/**
 * Prove that nothing in the data is homebrew.
 *
 *   node tools-audit-provenance.mjs ./Foundry-VTT-StarWars-SagaEdition
 *
 * Exits non-zero if anything fails, so it can be run whenever the data changes.
 *
 * The Foundry pack marks fan content two different ways and each catches things the other
 * misses:
 *
 *   - a `Homebrew Content` or `<author> Creations` category. Used by the species, talent,
 *     feat and Force power packs.
 *   - a source string naming a fan publication. Used by the equipment packs, which carry
 *     no Homebrew category at all — that is how 150 items from the "Clone Wars Saga
 *     Edition Fan Sourcebook" series sat in the data looking perfectly official.
 *
 * A name shared with a homebrew entry is not itself proof: our Burning Assault, Improved
 * Trajectory and Jet Pack Withdraw come from the Knights of the Old Republic Campaign
 * Guide p.30, and the pack happens to hold unrelated homebrew talents of the same names.
 * So a name is only reported when our *text* matches the homebrew entry's.
 */
import { ClassicLevel } from 'classic-level';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = process.argv[2] ?? './Foundry-VTT-StarWars-SagaEdition';
if (!existsSync(`${ROOT}/packs/species`)) {
  console.error(`No packs found at ${ROOT}/packs. Pass the path to the cloned system.`);
  process.exit(1);
}

const read = f => JSON.parse(readFileSync(`src/data/${f}.json`, 'utf8'));
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const body = h => String(h ?? '').replace(/<[^>]+>/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, '');

const cats = it => (it.system?.categories ?? []).map(c => c.value ?? c);
const plain = h => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Three signals, because the pack uses all three and each catches what the others miss:
 * a Homebrew category, a source string naming a fan publication, and — with no category
 * at all — a description that simply says so.
 */
const isHomebrew = it => cats(it).some(c => /homebrew|creations/i.test(c))
  || /this homebrew content|homebrew content has (not )?been/i.test(plain(it.system?.description));

const OFFICIAL_SOURCE = new RegExp(
  'Star Wars Saga Edition (?:Core Rulebook|Knights of the Old Republic|Force Unleashed'
  + '|Scum and Villainy|Clone Wars|Legacy Era|Rebellion Era|Jedi Academy Training Manual'
  + '|Galaxy at War|Galaxy of Intrigue|Unknown Regions|Threats of the Galaxy'
  + "|Scavenger's Guide to Droids|Starships of the Galaxy|Web Enhancements|Dawn of Defiance)",
  'i',
);
const sourceOf = it => String(it.system?.source ?? it.system?.sourceString ?? '').trim();
const isFanMade = it => !!sourceOf(it) && !OFFICIAL_SOURCE.test(sourceOf(it));

async function pack(name) {
  const db = new ClassicLevel(`${ROOT}/packs/${name}`, { valueEncoding: 'json' });
  const out = [];
  for await (const [key, value] of db.iterator()) {
    if (!key.startsWith('!folders') && value?.name) out.push(value);
  }
  await db.close();
  return out;
}

const failures = [];
const notes = [];

/**
 * Compare one of our datasets against a pack. Anything the pack calls fan-made is a
 * failure; anything whose text also matches a homebrew entry of the same name is too.
 */
async function audit(label, ours, packNames, textOf = () => '') {
  const flagged = new Map();   // name -> reason
  for (const packName of packNames) {
    for (const item of await pack(packName)) {
      const key = norm(item.name);
      if (isFanMade(item)) flagged.set(key, `fan source: ${sourceOf(item)}`);
      else if (sourceOf(item)) flagged.delete(key);   // printed in a real book somewhere
      else if (isHomebrew(item) && !flagged.has(key)) {
        flagged.set(key, `homebrew, matching text: ${body(item.system?.description).slice(0, 60)}`);
      }
    }
  }

  const bad = [];
  for (const entry of ours) {
    const reason = flagged.get(norm(entry.name));
    if (!reason) continue;
    // A homebrew entry that merely shares a name is fine; matching text is not.
    if (reason.startsWith('homebrew')) {
      const theirs = reason.split('matching text: ')[1] ?? '';
      const mine = body(textOf(entry));
      if (!theirs || !mine || !mine.includes(theirs.slice(0, 40))) continue;
    }
    bad.push(`${entry.name} — ${reason.split(', matching text')[0]}`);
  }

  if (bad.length) failures.push(`${label}: ${bad.length}\n    ${bad.slice(0, 10).join('\n    ')}`);
  console.log(`  ${label.padEnd(20)} ${String(ours.length).padStart(5)} entries — ${bad.length ? `${bad.length} FAILED` : 'clean'}`);
}

const features = Object.values(read('features'));
const featureText = f => [...(f.description ?? []), ...(f.benefit ?? []), ...(f.special ?? [])].join(' ');
const ofType = t => features.filter(f => f.type === t);

console.log('Checking every dataset against the pack:\n');
await audit('species', Object.values(read('species')), ['species']);
await audit('classes', Object.values(read('classes')), ['classes']);
await audit('feats', ofType('feat'), ['feats'], featureText);
await audit('talents', ofType('talent'), ['talents'], featureText);
await audit('force powers', ofType('force-power'), ['force-powers'], featureText);
await audit('force techniques', ofType('force-technique'), ['force-techniques'], featureText);
await audit('force secrets', ofType('force-secret'), ['force-secrets'], featureText);
await audit('starship maneuvers', ofType('starship-maneuver'), ['starship-maneuvers'], featureText);
await audit('species traits', ofType('trait'), ['traits'], featureText);
await audit('equipment', Object.values(read('equipment').items).filter(i => !i.custom),
  ['weapon', 'armor', 'equipment', 'upgrade', 'implant']);
await audit('languages', Object.values(read('languages')), ['languages']);
await audit('droid systems', Object.values(read('droids').systems ?? {}), ['droid-system']);

// Talent trees are ours, but a tree whose talents are all homebrew would be too.
const talentPack = await pack('talents');
const perTree = new Map();
for (const t of talentPack) {
  const tree = String(t.system?.talentTree ?? '').replace(/\s*Talent Trees?$/i, '').trim();
  if (!tree) continue;
  if (!perTree.has(tree)) perTree.set(tree, { total: 0, homebrew: 0 });
  const e = perTree.get(tree);
  e.total++;
  if (isHomebrew(t)) e.homebrew++;
}
const homebrewTrees = Object.values(read('talentTrees'))
  .filter(t => { const e = perTree.get(t.name); return e && e.homebrew === e.total; });
console.log(`  ${'talent trees'.padEnd(20)} ${String(Object.keys(read('talentTrees')).length).padStart(5)} entries — ${homebrewTrees.length ? 'FAILED' : 'clean'}`);
if (homebrewTrees.length) failures.push(`talent trees: ${homebrewTrees.map(t => t.name).join(', ')}`);

// Provenance we cannot prove either way, reported rather than failed.
const noBook = Object.values(read('equipment').items).filter(i => !i.book || i.book === 'unknown');
notes.push(`${noBook.length} equipment entries carry no book: the pack has no source string for them.`);
const featuresNoBook = features.filter(f => !f.book || f.book === 'unknown');
notes.push(`${featuresNoBook.length} features carry no book, of which ${featuresNoBook.filter(f => f.type === 'trait').length} are species traits that inherit their species' book.`);

console.log();
if (notes.length) { for (const n of notes) console.log(`note: ${n}`); console.log(); }
if (failures.length) {
  console.error('FAILED:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('No homebrew or fan-made content found in any dataset.');
