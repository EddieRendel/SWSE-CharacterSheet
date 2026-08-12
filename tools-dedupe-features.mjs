/**
 * Collapse features that exist twice under two ids.
 *
 *   node tools-dedupe-features.mjs
 *
 * Three sources feed the feature table and they spell ids differently, so the same entry
 * can arrive twice: `elder's-knowledge` and `elders-knowledge`, `teras-kasi-training` and
 * `ter-s-k-si-training`, `supression-fire` beside `suppression-fire`. Both show in the
 * compendium, reading identically, and there is no way to tell which one is "the" entry.
 *
 * Only exact duplicates are touched: same name, same type, and — once markup and
 * punctuation are stripped — the same rules text. Two entries that share a name but print
 * different rules are two talents, and the excel importer forks those deliberately.
 *
 * The surviving id is the one the rest of the data already points at, so nothing that
 * references a feature has to change and no saved character loses a selection.
 *
 * Run last, once every source has contributed.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const DATA = 'src/data';
const features = JSON.parse(readFileSync(`${DATA}/features.json`, 'utf8'));

// Every other data file, so "is this id referenced anywhere?" is answered from all of them.
const others = readdirSync(DATA)
  .filter(f => f.endsWith('.json') && f !== 'features.json')
  .map(f => ({ file: f, text: readFileSync(`${DATA}/${f}`, 'utf8') }));

const referenceCount = id => {
  const needle = `"${id}"`;
  return others.reduce((n, o) => n + o.text.split(needle).length - 1, 0);
};

/** Rules text with markup, punctuation and casing removed, for comparing like with like. */
const body = f => [...(f.description ?? []), ...(f.benefit ?? []), ...(f.special ?? [])]
  .join(' ').replace(/<[^>]+>/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, '');

const groups = new Map();
for (const f of Object.values(features)) {
  const key = `${f.type}|${f.name.toLowerCase()}|${body(f)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(f);
}

const dropped = [];
for (const group of groups.values()) {
  if (group.length < 2) continue;

  // Keep whichever id the rest of the data already uses; failing that, the tidiest id.
  const ranked = group
    .map(f => ({ f, refs: referenceCount(f.id) }))
    .sort((a, b) => b.refs - a.refs
      || (/['’]/.test(a.f.id) ? 1 : 0) - (/['’]/.test(b.f.id) ? 1 : 0)
      // Diacritics slugged badly leave `ter-s-k-si-training` next to `teras-kasi-training`.
      || a.f.id.split('-').length - b.f.id.split('-').length
      || a.f.id.length - b.f.id.length
      || a.f.id.localeCompare(b.f.id));

  const keep = ranked[0];
  for (const { f, refs } of ranked.slice(1)) {
    if (refs > 0) {
      // Referenced by name in another file: leave it be rather than break that reference.
      dropped.push(`kept ${f.id} (still referenced ${refs}x) alongside ${keep.f.id}`);
      continue;
    }
    delete features[f.id];
    dropped.push(`${f.id} -> ${keep.f.id}`);
  }
}

writeFileSync(`${DATA}/features.json`, JSON.stringify(features, null, 2) + '\n');

console.log(`${dropped.length} duplicate entries collapsed:`);
for (const d of dropped) console.log(`  ${d}`);
console.log(`features now: ${Object.keys(features).length}`);
