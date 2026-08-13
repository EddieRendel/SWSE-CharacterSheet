/**
 * Fill in rules text for entries the spreadsheets only summarised.
 *
 *   git clone --depth 1 https://github.com/kypvalanx/Foundry-VTT-StarWars-SagaEdition
 *   node tools-import-foundry-text.mjs ./Foundry-VTT-StarWars-SagaEdition
 *
 * The Talents and Feats summary spreadsheets are exactly that — summaries. "Corporate
 * Clout" reads "1/encounter Persuasion v. Will w/in LOS target cannot attack you", which
 * is a reminder, not a rule. The Foundry pack carries the full wording, so this takes the
 * *text* from there and nothing else: talent trees, prerequisites, bonus-feat lists,
 * books and page numbers all stay exactly as the spreadsheets and bundle set them.
 *
 * Text is only ever replaced when the replacement is meaningfully longer, so an entry
 * that already has its full rules cannot be traded down for a shorter wiki paraphrase.
 *
 * Run after `import:excel`, which is what creates the summaries in the first place.
 */
import { ClassicLevel } from 'classic-level';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = process.argv[2] ?? './Foundry-VTT-StarWars-SagaEdition';
const DATA = 'src/data';
if (!existsSync(`${ROOT}/packs/talents`)) {
  console.error(`No packs found at ${ROOT}/packs. Pass the path to the cloned system.`);
  process.exit(1);
}

const cats = it => (it.system?.categories ?? []).map(c => c.value ?? c);
const isHomebrew = it => cats(it).some(c => /homebrew|creations/i.test(c));

/**
 * Homebrew entries never supply text. The packs hold fan talents that share a name with
 * real ones — a "Jumptrooper" tree whose Burning Assault collides with the Knights of the
 * Old Republic talent of that name — and taking text by name alone would quietly rewrite
 * a sourcebook talent as somebody's homebrew.
 */
async function pack(name) {
  const db = new ClassicLevel(`${ROOT}/packs/${name}`, { valueEncoding: 'json' });
  const items = [];
  let homebrew = 0;
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith('!folders') || !value?.name) continue;
    if (isHomebrew(value)) { homebrew++; continue; }
    items.push(value);
  }
  await db.close();
  if (homebrew) skippedHomebrew.set(name, homebrew);
  return items;
}

const skippedHomebrew = new Map();

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The pack stores wiki HTML, and the wiki omits the spaces around its links — you get
 * `spend a<a>Force Point</a>to drain`. Padding every tag with a space fixes that, at the
 * cost of stray spaces before punctuation, which the tidy-up below removes.
 *
 * Bold and italic survive, because the rest of the data uses them to label a power's
 * Time and Target lines and the sheet renders them. Everything else is dropped: this is
 * scraped third-party markup going into `dangerouslySetInnerHTML`, so the tags that get
 * through are an allowlist of two, not whatever the wiki happened to contain.
 */
const KEEP = { b: 'strong', strong: 'strong', i: 'em', em: 'em' };
function text(html) {
  return String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    // Park the tags we keep out of reach of the strip below.
    .replace(/<(\/?)(b|strong|i|em)\s*>/gi, (_, slash, tag) => `\x01${slash}${KEEP[tag.toLowerCase()]}\x02`)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&[a-z]+;|&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/ +([,.;:!?)\]])/g, '$1')
    .replace(/([([]) +/g, '$1')
    // Deliberate: \x01 and \x02 are placeholders this function itself substitutes in
    // earlier, to carry <strong>/<em> through the entity-stripping pass above without
    // the `&[a-z]+;` rule eating them. They cannot occur in wiki text.
    // oxlint-disable-next-line no-control-regex
    .replace(/\x01(\/?)(strong|em)\x02/g, '<$1$2>')
    // Emphasis that swallowed the padding space reads as `<em> Dark Side </em>`.
    .replace(/<(strong|em)> +/g, '<$1>')
    .replace(/ +<\/(strong|em)>/g, '</$1>')
    .replace(/<(strong|em)>\s*<\/\1>/g, '')
    // The wiki runs its bold labels straight into the sentence after them, and the tags
    // are no longer padded, so `check.</strong>Compare the result` needs the space back.
    .replace(/<\/(strong|em)>(?=[A-Za-z0-9(])/g, '</$1> ')
    .replace(/([A-Za-z0-9,.;:)])(?=<(strong|em)>)/g, '$1 ')
    .trim();
}

/**
 * Tables are either a hatnote — "This article details the X found in Y, you may be
 * looking for…" — which is navigation and goes, or a DC/effect table, which is rules and
 * has to survive as readable lines rather than a column of loose fragments.
 */
function flattenTables(html) {
  return String(html ?? '').replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (whole, inner) => {
    if (/This article details|You may be looking for/i.test(inner)) return ' ';
    let headers = [];
    const lines = [];
    for (const [, row] of inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      // The wiki pads its tables with empty spacer cells; they carry nothing.
      const cells = [...row.matchAll(/<(t[hd])[^>]*>([\s\S]*?)<\/\1>/gi)]
        .map(m => text(m[2]).replace(/<\/?(strong|em)>/g, '').trim())
        .filter(Boolean);
      if (!cells.length) continue;
      if (/<th[\s>]/i.test(row) && !headers.length) { headers = cells; continue; }
      // "DC 20: you create a Force Storm…" reads; "DC", "20", "you create…" does not.
      lines.push(cells.length === 2 && headers.length === 2
        ? `<strong>${headers[0]} ${cells[0]}:</strong> ${cells[1]}`
        : cells.join(' — '));
    }
    return lines.map(l => `<p>${l}</p>`).join('');
  });
}

/**
 * Some wiki pages append a "Homebrew <name> Data" or "Homebrew <name> Effects" section to
 * an otherwise official entry,
 * offering somebody's variant of it. Long Haft Strike (Jedi Academy Training Manual p.23)
 * and Autofire Sweep (Legacy Era p.34) both carry one. Everything from that heading on is
 * cut, so the official rules survive and the variant does not.
 */
const HOMEBREW_SECTION = /^homebrew\b|^this homebrew content/i;

/** Paragraphs, in source order, with the wiki's own furniture dropped. */
function paragraphs(html) {
  const flat = flattenTables(html);
  const blocks = /<\s*p[\s>]/i.test(flat) ? flat.split(/<\/\s*p\s*>/i) : [flat];
  return blocks
    .map(text)
    .flatMap(t => t.split('\n'))
    .map(t => t.trim())
    .filter(Boolean)
    // "Reference Book: …" and "See also: …" are wiki navigation, not rules.
    .filter(t => {
      const plain = t.replace(/<\/?(strong|em)>/g, '');
      return !/^Reference Book:/i.test(plain) && !/^See also:/i.test(plain);
    })
    // Everything from a homebrew heading onwards belongs to somebody's variant.
    .reduce((kept, line) => {
      if (kept.done || HOMEBREW_SECTION.test(line.replace(/<\/?(strong|em)>/g, '').trim())) {
        return { done: true, lines: kept.lines };
      }
      return { done: false, lines: [...kept.lines, line] };
    }, { done: false, lines: [] }).lines;
}

/**
 * Feats are written with headings — Prerequisite, Effect, Special — so they split into
 * the same fields the rest of the app uses. Prerequisites are dropped: the spreadsheets
 * already supply machine-checked ones, and theirs would only disagree.
 */
function splitFeat(html) {
  const out = { description: [], benefit: [], special: [] };
  let current = 'description';
  for (const para of paragraphs(html)) {
    const heading = para.match(/^(Prerequisites?|Effect|Benefit|Special|Normal):\s*/i);
    if (heading) {
      const name = heading[1].toLowerCase();
      current = name.startsWith('prerequisite') ? 'skip'
        : name === 'special' ? 'special'
          : name === 'normal' ? 'skip'
            : 'benefit';
      const rest = para.slice(heading[0].length).trim();
      if (rest && current !== 'skip') out[current].push(rest);
      continue;
    }
    if (current !== 'skip') out[current].push(para);
  }
  return out;
}

const lengthOf = (...lists) => lists.flat().filter(Boolean).join(' ').length;

const features = JSON.parse(readFileSync(`${DATA}/features.json`, 'utf8'));

// Feats are written with headings the pack preserves; everything else is plain prose.
const JOBS = [
  { type: 'talent', packName: 'talents', structured: false },
  { type: 'feat', packName: 'feats', structured: true },
  { type: 'force-power', packName: 'force-powers', structured: false },
  { type: 'force-technique', packName: 'force-techniques', structured: false },
  { type: 'force-secret', packName: 'force-secrets', structured: false },
  { type: 'starship-maneuver', packName: 'starship-maneuvers', structured: false },
  { type: 'trait', packName: 'traits', structured: false },
];

/**
 * How much longer the replacement has to be before it is worth taking. A summary is
 * barely text at all, so anything fuller wins; an entry that already reads as rules is
 * only rewritten for a substantial gain, so the corpus does not churn over a stray clause.
 */
const MARGIN_SUMMARY = 40;
const MARGIN_FULL = 120;

/**
 * Names are matched across two independent datasets, so a mismatch is possible — two
 * unrelated entries that happen to share a name. Rules text about the same thing reuses
 * its distinctive words, so a replacement that keeps almost none of them is worth a look.
 */
const STOP = new Set(('a an and or the to of in on at by for with your you can if is are be as it its'
  + ' this that from than then when may must not no all any one each per').split(' '));
const words = s => new Set(
  String(s).toLowerCase().replace(/<[^>]+>/g, ' ').match(/[a-z]{4,}/g)?.filter(w => !STOP.has(w)) ?? [],
);
function overlap(before, after) {
  const a = words(before), b = words(after);
  if (!a.size) return 1;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / a.size;
}

/**
 * The traits pack carries an entry per species as well as an entry per actual trait, and
 * the per-species ones are the wiki's encyclopedia article — three paragraphs on Cathar
 * city-trees and the Mandalorian Wars, and not one rule. A trait sharing its name with a
 * species is one of those, so it keeps whatever the species importer gave it.
 */
const speciesNames = new Set([
  ...(await pack('species')).map(s => norm(s.name)),
  ...Object.values(JSON.parse(readFileSync(`${DATA}/species.json`, 'utf8'))).map(s => norm(s.name)),
]);

const changed = [];
const suspect = [];
const report = [];

for (const job of JOBS) {
  const items = await pack(job.packName);
  const byName = new Map();
  let ambiguous = 0;
  for (const item of items) {
    const key = norm(item.name);
    if (byName.has(key)) { ambiguous++; continue; }
    byName.set(key, item);
  }

  const candidates = Object.values(features).filter(f => f.type === job.type);

  // Two books sometimes print different rules under one name, and the excel importer
  // splits those into separate entries. The pack has only one entry for the name, so
  // there is no way to tell which of ours it describes — giving both the same text would
  // silently merge them back together. Leave them to their spreadsheet summaries.
  const shareName = new Map();
  for (const f of candidates) {
    const key = norm(f.name);
    shareName.set(key, (shareName.get(key) ?? 0) + 1);
  }

  let replaced = 0, missing = 0, notBetter = 0, fromSummary = 0, lore = 0, truncated = 0, sameName = 0;

  for (const feature of candidates) {
    if (job.type === 'trait' && speciesNames.has(norm(feature.name))) { lore++; continue; }
    if (shareName.get(norm(feature.name)) > 1) { sameName++; continue; }
    const hit = byName.get(norm(feature.name));
    if (!hit) { missing++; continue; }

    const previous = [feature.description, feature.benefit, feature.special].flat().filter(Boolean).join(' ');
    const before = previous.length;
    const next = job.structured
      ? splitFeat(hit.system?.description)
      : { description: paragraphs(hit.system?.description), benefit: [], special: [] };
    const after = lengthOf(next.description, next.benefit, next.special);

    // Never trade rules text for a shorter paraphrase.
    const margin = feature.summaryOnly ? MARGIN_SUMMARY : MARGIN_FULL;
    if (after <= before + margin) { notBetter++; continue; }

    // Some pack entries stop at the colon that introduces their list of options — the
    // list itself never made it in. Longer, but missing the rules. Keep the summary
    // underneath so the options that were spelled out are not traded away for prose.
    const tail = next.special.at(-1) ?? next.benefit.at(-1) ?? next.description.at(-1) ?? '';
    if (/:\s*$/.test(tail.replace(/<[^>]+>/g, '')) && before > 40) {
      next.description = [...next.description, ...(feature.description ?? [])];
      truncated++;
    }

    const kept = overlap(previous, [next.description, next.benefit, next.special].flat().join(' '));
    if (before > 60 && kept < 0.3) {
      suspect.push({ name: feature.name, type: feature.type, kept, previous: previous.slice(0, 110) });
    }

    changed.push({ id: feature.id, name: feature.name, type: feature.type, before, after });
    if (feature.summaryOnly) fromSummary++;
    feature.description = next.description;
    if (next.benefit.length) feature.benefit = next.benefit;
    else delete feature.benefit;
    if (next.special.length) feature.special = next.special;
    else delete feature.special;
    // It is no longer a summary — this is the rules text.
    delete feature.summaryOnly;
    replaced++;
  }

  report.push(
    `${job.type.padEnd(18)} pack=${String(items.length).padStart(5)}`
    + `  mine=${String(candidates.length).padStart(4)}`
    + `  replaced=${String(replaced).padStart(4)} (${String(fromSummary).padStart(3)} summaries)`
    + `  absent=${String(missing).padStart(4)}`
    + `  already-as-good=${String(notBetter).padStart(4)}`
    + (lore ? `  species-articles-skipped=${lore}` : '')
    + (truncated ? `  summary-kept-under-truncated-text=${truncated}` : '')
    + (sameName ? `  same-name-variants-skipped=${sameName}` : '')
    + (ambiguous ? `  [${ambiguous} duplicate names in pack, first kept]` : ''),
  );
}

/**
 * The earlier Foundry import left the wiki's own navigation in the text of powers,
 * secrets, techniques and maneuvers, where it now shows up at the top of every hover
 * card. Nothing else writes those lines, so clear them everywhere while we are here.
 */
let tidied = 0;
for (const feature of Object.values(features)) {
  for (const field of ['description', 'benefit', 'special', 'normal']) {
    const lines = feature[field];
    if (!Array.isArray(lines)) continue;
    // A homebrew section appended to an official entry, from this run or an earlier one.
    // The replacement rule alone cannot undo it: the cleaned text is *shorter*, so it
    // would be rejected as not an improvement.
    const cut = lines.findIndex(l => HOMEBREW_SECTION.test(l.replace(/<\/?(strong|em)>/g, '').trim()));
    const trimmed = cut >= 0 ? lines.slice(0, cut) : lines;
    const kept = trimmed
      .map(l => l.replace(/ {2,}/g, ' ').trim())
      .filter(l => l && !/^(<[^>]+>)*\s*(Reference Book|See also)\s*:/i.test(l));
    if (kept.length !== lines.length || kept.some((l, i) => l !== lines[i])) tidied++;
    if (kept.length) feature[field] = kept;
    else delete feature[field];
  }
}

writeFileSync(`${DATA}/features.json`, JSON.stringify(features, null, 2) + '\n');
console.log(`Tidied wiki navigation and stray spacing out of ${tidied} more fields.\n`);

console.log(report.join('\n'));
const homebrewTotal = [...skippedHomebrew.values()].reduce((n, x) => n + x, 0);
if (homebrewTotal) {
  console.log(`\n${homebrewTotal} homebrew entries in the pack were ignored: `
    + [...skippedHomebrew].map(([name, n]) => `${name} ${n}`).join(', '));
}
console.log(`\n${changed.length} entries rewritten.`);

// The biggest rewrites are the ones most worth eyeballing.
changed.sort((a, b) => (b.after - b.before) - (a.after - a.before));
console.log('\nLargest gains:');
for (const c of changed.slice(0, 15)) {
  console.log(`  ${c.type.padEnd(12)} ${c.name.padEnd(34)} ${c.before} -> ${c.after} chars`);
}

if (suspect.length) {
  console.log(`\nWorth eyeballing — ${suspect.length} rewrites kept little of the old wording,`
    + ' which can mean two unrelated entries share a name:');
  for (const s of suspect.slice(0, 20)) {
    console.log(`  ${s.type.padEnd(10)} ${s.name.padEnd(30)} kept ${(s.kept * 100).toFixed(0)}%  was: ${s.previous}`);
  }
}

const stillSummary = Object.values(features).filter(f => f.summaryOnly);
const remaining = {};
for (const f of stillSummary) remaining[f.type] = (remaining[f.type] ?? 0) + 1;
console.log(`\nStill summary-only: ${stillSummary.length}`, remaining);
