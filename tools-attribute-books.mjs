/**
 * Attribute content to the book it was printed in, from the Omegadex index.
 *
 *   node tools-attribute-books.mjs [foundry-path]
 *
 * The Foundry equipment packs carry a source string for only some entries, which left 216
 * items with no book at all — no way to tell whether they are official, and invisible to
 * a "Core Rulebook only" character.
 *
 * The Omegadex is a fan-compiled *index* of official Saga Edition content: every line is
 * a name, a book code and a page in a book Wizards published. It indexes nothing else, so
 * a match is evidence that an item is official, and a page number to go with it.
 *
 * Its equipment tables are laid out in several columns per row, so the parser walks each
 * row looking for a name followed within a few cells by a book code and a page.
 *
 * Run after `import:foundry`, which is what writes the equipment in the first place.
 */
import XLSX from 'xlsx';
import { ClassicLevel } from 'classic-level';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DATA = 'src/data';
const OMEGADEX = 'Omegadex_1.9.xlsx';
/** Optional: the Foundry clone, for the description checks below. */
const FOUNDRY = process.argv[2];
if (!existsSync(OMEGADEX)) {
  console.error(`${OMEGADEX} not found; nothing to attribute from.`);
  process.exit(1);
}

/** Omegadex book codes -> the keys the rest of the data uses. */
const BOOKS = {
  CORE: 'core', KOTOR: 'knights', UNLSH: 'force', LEG: 'legacy', SCUM: 'scum',
  CLONE: 'clone', REBEL: 'rebellion', WAR: 'war', INTR: 'intrigue', UNKN: 'regions',
  JEDI: 'jedi', THRT: 'threats', STAR: 'starships', SGD: 'droids',
};

/**
 * Which tables hold what. Gear is spread over four; the Force table mixes powers,
 * techniques and secrets together. Starship maneuvers are in no table, so they keep
 * whatever the pack gave them.
 */
const EQUIPMENT_SHEETS = ['Table 30', 'Table 31', 'Table 32', 'Table 33'];
const FORCE_SHEETS = ['Table 18'];

const workbook = XLSX.readFile(OMEGADEX);
const readSheets = (sheets) => {
const indexed = [];
for (const sheet of sheets) {
  if (!workbook.Sheets[sheet]) continue;
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, blankrows: false });
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const name = typeof row[i] === 'string' ? row[i].trim() : '';
      // Section headings ("COMMUNICATION DEVICES") carry no book code and fall through.
      if (!name || BOOKS[name]) continue;
      for (let j = i + 1; j <= i + 3 && j < row.length; j++) {
        const code = typeof row[j] === 'string' ? row[j].trim() : '';
        if (!BOOKS[code]) continue;
        let page;
        for (let k = j + 1; k <= j + 3 && k < row.length; k++) {
          const n = Number(row[k]);
          if (Number.isFinite(n) && n > 0) { page = n; break; }
        }
        indexed.push({ name, book: BOOKS[code], page });
        i = j;
        break;
      }
    }
  }
}
  return indexed;
};

const indexed = readSheets(EQUIPMENT_SHEETS);
const forceIndexed = readSheets(FORCE_SHEETS);

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
/** The index writes "Comlink, Earbud" where the pack writes "Earbud Comlink". */
const swapped = s => {
  const m = String(s).match(/^(.*?),\s*(.*)$/);
  return m ? norm(`${m[2]} ${m[1]}`) : null;
};

/**
 * The index and the pack spell things differently: Vibro-Ax against Vibro-Axe, Lt against
 * Light, a trailing plural. Words are reduced to a stem so those meet, and the comparison
 * is on the *set* of words, which also settles "Double-Bladed Lightsaber" against
 * "Lightsaber, Double-Blade".
 */
const ABBREVIATIONS = {
  lt: 'light', hvy: 'heavy', hv: 'heavy', med: 'medium', wpn: 'weapon',
  conc: 'conceal', concealed: 'conceal', rptng: 'repeat', repeating: 'repeat',
  pistl: 'pistol', dbl: 'double',
};
const stem = w => {
  const expanded = ABBREVIATIONS[w] ?? w;
  return expanded
    .replace(/(?:es|s)$/, '')      // plurals
    .replace(/(?:ed|ing)$/, '')    // bladed -> blade, repeating -> repeat
    .replace(/e$/, '');            // axe -> ax, blade -> blad
};
const wordKey = s => String(s).toLowerCase().split(/[^a-z0-9]+/)
  .filter(Boolean).map(stem).filter(w => w.length > 1).sort().join(' ');

const lookup = new Map();
const byWords = new Map();
for (const entry of indexed) {
  for (const key of [norm(entry.name), swapped(entry.name)]) {
    if (key && !lookup.has(key)) lookup.set(key, entry);
  }
  const words = wordKey(entry.name);
  // A word set shared by two different index entries is no use for identifying either.
  if (words) byWords.set(words, byWords.has(words) ? null : entry);
}

/**
 * The index sometimes carries a word we do not: "Light Repeating Blaster" is filed as
 * "Blaster Rifle, Lt Repeating", and "Vonduun Crabshell" as "Vonduun Crabshell Armor".
 * A subset match handles those, but only when exactly one index entry contains all of our
 * words — "Blaster Cannon" sits inside both itself and "Blaster Cannon, Heavy", and a
 * guess between them would be worse than no attribution at all.
 */
const indexWordSets = indexed.map(entry => ({ entry, words: new Set(wordKey(entry.name).split(' ')) }));
function containedIn(name) {
  const mine = wordKey(name).split(' ').filter(Boolean);
  if (mine.length < 2) return null;
  const supersets = indexWordSets.filter(({ words }) => mine.every(w => words.has(w)));
  const names = new Set(supersets.map(s => norm(s.entry.name)));
  return names.size === 1 ? supersets[0].entry : null;
}

/**
 * A third way the pack marks fan content, which neither the Homebrew category nor the
 * source string catches: the description simply says so, with no category at all.
 * Alongside it are wiki pages scraped as if they were items — "Climatic Hazards",
 * "Weapons by size", and the back-cover blurb for Galaxy at War.
 *
 * Neither decides anything on its own. An entry the Omegadex indexes is official whatever
 * its description claims, which is what keeps Utility Belt, Power Pack and Spice.
 */
const SAYS_HOMEBREW = /this homebrew content|homebrew content has (not )?been/i;
const NOT_AN_ITEM = /^(see also:|this category groups|this page |get ready to dig)/i;

/** The wiki's page for a sourcebook, swept up as though the book were a piece of gear. */
const BOOK_TITLES = [
  'Core Rulebook', 'Knights of the Old Republic Campaign Guide', 'The Force Unleashed Campaign Guide',
  'Scum and Villainy', 'Clone Wars Campaign Guide', 'Legacy Era Campaign Guide',
  'Rebellion Era Campaign Guide', 'Jedi Academy Training Manual', 'Galaxy at War',
  'Galaxy of Intrigue', 'The Unknown Regions', 'Threats of the Galaxy',
  "Scavenger's Guide to Droids", 'Starships of the Galaxy', 'Dawn of Defiance',
  'Web Enhancements',
].map(t => t.toLowerCase().replace(/[^a-z0-9]+/g, ''));

const suspect = new Map();
if (FOUNDRY && existsSync(`${FOUNDRY}/packs/weapon`)) {
  const plain = h => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
  for (const packName of ['weapon', 'armor', 'equipment', 'upgrade', 'implant']) {
    const db = new ClassicLevel(`${FOUNDRY}/packs/${packName}`, { valueEncoding: 'json' });
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith('!folders') || !value?.name) continue;
      const description = plain(value.system?.description);
      const reason = SAYS_HOMEBREW.test(description) ? 'declares itself homebrew'
        : NOT_AN_ITEM.test(description) ? 'is a wiki page, not an item'
          : null;
      const id = norm(value.name);
      // A clean printing of the same name clears it.
      if (!suspect.has(id)) suspect.set(id, reason);
      else if (!reason) suspect.set(id, null);
    }
    await db.close();
  }
}

const equipment = JSON.parse(readFileSync(`${DATA}/equipment.json`, 'utf8'));
let attributed = 0, confirmed = 0;
const corrected = [];
const unindexed = [];
const spellingVariants = [];

for (const item of Object.values(equipment.items)) {
  if (item.custom) continue;
  let hit = lookup.get(norm(item.name)) ?? lookup.get(swapped(item.name) ?? '');
  let loose = false;
  if (!hit) {
    // Same words, different spelling: reliable enough to correct an attribution.
    hit = byWords.get(wordKey(item.name));
    if (hit) spellingVariants.push(`${item.name} = ${hit.name} (${hit.book} p${hit.page ?? '?'})`);
  }
  if (!hit) {
    // Our name inside a longer one. "Assault Armor" sitting inside "Venom Assault Armor"
    // might be the same item shortened, or an item the index does not list at all — so
    // this may fill an empty book but never overrules one we already have.
    const contained = containedIn(item.name);
    if (contained && (!item.book || item.book === 'unknown')) {
      hit = contained;
      loose = true;
      spellingVariants.push(`${item.name} ⊂ ${contained.name} (${contained.book} p${contained.page ?? '?'})`);
    }
  }
  if (!hit) { unindexed.push(item); continue; }

  if (!item.book || item.book === 'unknown') {
    attributed++;
  } else if (item.book === hit.book) {
    confirmed++;
  } else {
    // Gear is often reprinted. The index records the first printing, which is the more
    // useful attribution and the one a book filter should go by.
    corrected.push(`${item.name}: ${item.book} -> ${hit.book} p${hit.page ?? '?'}`);
  }
  item.book = hit.book;
  if (hit.page) item.page = hit.page;
  // A guess from a longer name is recorded as such, so the audit can show its working.
  if (loose) item.attribution = 'by name, from the Omegadex index';
}

// Anything its own description condemns and the index does not vouch for goes.
const removed = [];
for (const [id, item] of Object.entries(equipment.items)) {
  if (item.custom) continue;
  const reason = BOOK_TITLES.includes(norm(item.name))
    ? 'is a sourcebook, not a piece of gear'
    : suspect.get(norm(item.name));
  if (reason && (!item.book || item.book === 'unknown')) {
    removed.push(`${item.name} — ${reason}`);
    delete equipment.items[id];
  }
}

writeFileSync(`${DATA}/equipment.json`, JSON.stringify(equipment, null, 2) + '\n');

// ---------------------------------------------------------------------------
// Force powers, techniques and secrets, which the index files together in one table.
// ---------------------------------------------------------------------------
const forceLookup = new Map();
const forceByWords = new Map();
for (const entry of forceIndexed) {
  for (const key of [norm(entry.name), swapped(entry.name)]) {
    if (key && !forceLookup.has(key)) forceLookup.set(key, entry);
  }
  const words = wordKey(entry.name);
  if (words) forceByWords.set(words, forceByWords.has(words) ? null : entry);
}

/**
 * The index abbreviates hard — "Imp Force Grip" for Improved Force Grip, "Grtr" for
 * Greater. Those are expanded before matching, or half the table would miss.
 */
const FORCE_SHORTHAND = {
  imp: 'improved', impr: 'improved', grtr: 'greater', gr: 'greater', adv: 'advanced',
  def: 'defense', dam: 'damage', resist: 'resistance',
};
const forceKey = name => String(name).toLowerCase().split(/[^a-z0-9']+/).filter(Boolean)
  .map(w => FORCE_SHORTHAND[w] ?? w).map(w => w.replace(/(?:es|s)$/, '').replace(/e$/, ''))
  .filter(w => w.length > 1).sort().join(' ');

const forceByShorthand = new Map();
for (const entry of forceIndexed) {
  const key = forceKey(entry.name);
  if (key) forceByShorthand.set(key, forceByShorthand.has(key) ? null : entry);
}

const FORCE_TYPES = ['force-power', 'force-technique', 'force-secret'];
const features = JSON.parse(readFileSync(`${DATA}/features.json`, 'utf8'));
let forceAttributed = 0, forceConfirmed = 0, forceMissed = [];
for (const feature of Object.values(features)) {
  if (!FORCE_TYPES.includes(feature.type)) continue;
  const hit = forceLookup.get(norm(feature.name))
    ?? forceByWords.get(wordKey(feature.name))
    ?? forceByShorthand.get(forceKey(feature.name));
  if (!hit) { forceMissed.push(feature.name); continue; }
  if (!feature.book || feature.book === 'unknown') forceAttributed++;
  else forceConfirmed++;
  feature.book = hit.book;
  if (hit.page) feature.page = hit.page;
}
writeFileSync(`${DATA}/features.json`, JSON.stringify(features, null, 2) + "\n");

const items = Object.values(equipment.items);
const stillUnknown = items.filter(i => !i.custom && (!i.book || i.book === 'unknown'));
console.log(`${indexed.length} equipment entries indexed in the Omegadex.`);
console.log(`  newly attributed   ${attributed}`);
console.log(`  already agreed     ${confirmed}`);
console.log(`  matched through a spelling difference: ${spellingVariants.length}`);
for (const v of spellingVariants) console.log(`    ${v}`);
console.log(`  first printing preferred over the pack's reprint: ${corrected.length}`);
for (const c of corrected) console.log(`    ${c}`);
console.log(`  not in the index   ${unindexed.length}`);
if (removed.length) {
  console.log(`\n${removed.length} removed — flagged by their own description, and not in the index:`);
  for (const r of removed) console.log(`    ${r}`);
}
console.log(`\n${items.length} items total, ${items.length - stillUnknown.length} now name their book,`
  + ` ${stillUnknown.length} still do not.`);

console.log(`\n${forceIndexed.length} Force entries indexed.`);
console.log(`  newly attributed   ${forceAttributed}`);
console.log(`  already agreed     ${forceConfirmed}`);
console.log(`  not in the index   ${forceMissed.length}`
  + (forceMissed.length && forceMissed.length <= 12 ? `: ${forceMissed.join(', ')}` : ''));
