/**
 * Import the language list.
 *
 *   node tools-import-languages.mjs ./Foundry-VTT-StarWars-SagaEdition
 *
 * A character speaks Basic plus their species' own languages, and learns one more for
 * every point of Intelligence bonus. Nothing in the extracted data lists what those extra
 * languages could be, so the choice had nowhere to come from.
 *
 * The Foundry pack carries 51. Every language a species speaks is folded in as well, so
 * the list can never be missing one the app already refers to.
 */
import { ClassicLevel } from 'classic-level';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = process.argv[2] ?? './Foundry-VTT-StarWars-SagaEdition';
const DATA = 'src/data';
if (!existsSync(`${ROOT}/packs/languages`)) {
  console.error(`No packs found at ${ROOT}/packs. Pass the path to the cloned system.`);
  process.exit(1);
}

const species = JSON.parse(readFileSync(`${DATA}/species.json`, 'utf8'));

const slug = s => String(s).toLowerCase().trim()
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const text = html => String(html ?? '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').replace(/ +([,.;:])/g, '$1').trim();

const languages = {};
const add = (name, description, book) => {
  // The pack marks a few entries with a trailing asterisk; it is not part of the name.
  const clean = String(name).replace(/\*+$/, '').trim();
  if (!clean) return;
  const id = slug(clean);
  if (languages[id]) {
    if (description && !languages[id].description) languages[id].description = description;
    return;
  }
  languages[id] = { id, name: clean, ...(description ? { description } : {}), ...(book ? { book } : {}) };
};

{
  const db = new ClassicLevel(`${ROOT}/packs/languages`, { valueEncoding: 'json' });
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith('!folders') || !value?.name) continue;
    // The pack's description starts mid-sentence — "is the language spoken by…" — because
    // the name was a heading on the wiki, so it is put back in front.
    const body = text(value.system?.description);
    add(value.name, body ? `${String(value.name).replace(/\*+$/, '').trim()} ${body}` : undefined);
  }
  await db.close();
}

const fromPack = Object.keys(languages).length;

let fromSpecies = 0;
for (const sp of Object.values(species)) {
  for (const name of sp.languages ?? []) {
    if (!languages[slug(name)]) fromSpecies++;
    add(name);
  }
}

const sorted = Object.fromEntries(
  Object.entries(languages).sort(([, a], [, b]) => a.name.localeCompare(b.name)),
);
writeFileSync(`${DATA}/languages.json`, JSON.stringify(sorted, null, 2) + '\n');

console.log(`${fromPack} languages from the pack, ${fromSpecies} more named only by a species.`);
console.log(`${Object.keys(sorted).length} in total.`);
const missing = Object.values(sorted).filter(l => !l.description).length;
console.log(`${missing} carry no description.`);
