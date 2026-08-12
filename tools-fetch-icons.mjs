/**
 * Fetch the icon artwork sagaworkshop.net serves for classes, features and weapon groups.
 *
 *   node tools-fetch-icons.mjs
 *
 * The site builds icon URLs unconditionally, which is why so many entries there show a broken
 * image — it asks for /static/features/<id>.jpg whether or not one exists. This probes first and
 * records what is actually present in src/data/icons.json, so the app only ever renders an icon
 * it knows is there.
 *
 * Already-downloaded files are skipped, so re-runs are cheap and only fetch what is new.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://sagaworkshop.net/static';
const OUT = 'public/icons';
const CONCURRENCY = 8;

const features = JSON.parse(readFileSync('src/data/features.json', 'utf8'));
const classes = JSON.parse(readFileSync('src/data/classes.json', 'utf8'));
const WEAPON_GROUPS = [
  'simple-weapons', 'pistols', 'rifles', 'advanced-melee-weapons',
  'heavy-weapons', 'lightsabers', 'exotic-weapons',
];

for (const d of ['features', 'classes', 'weapons']) mkdirSync(join(OUT, d), { recursive: true });

/** Every icon the site might hold, mirroring how its own bundle builds the URLs. */
const targets = [
  ...Object.values(classes)
    .filter(c => c.icon)
    .map(c => ({ kind: 'classes', key: c.id, file: c.icon })),
  ...Object.values(features)
    .map(f => ({ kind: 'features', key: f.id, file: `${f.id}.jpg` })),
  ...WEAPON_GROUPS.map(g => ({ kind: 'weapons', key: g, file: `${g}.jpg` })),
];

const manifest = { classes: {}, features: {}, weapons: {} };
let found = 0, missing = 0, cached = 0, failed = 0;

async function fetchOne({ kind, key, file }) {
  const dest = join(OUT, kind, file);
  if (existsSync(dest)) {
    manifest[kind][key] = file;
    cached++;
    return;
  }
  try {
    const res = await fetch(`${BASE}/${kind}/${file}`);
    if (!res.ok) { missing++; return; }
    const buf = Buffer.from(await res.arrayBuffer());
    // A stub error page would be tiny; real artwork is not.
    if (buf.length < 200) { missing++; return; }
    writeFileSync(dest, buf);
    manifest[kind][key] = file;
    found++;
  } catch {
    failed++;
  }
}

// Modest concurrency — this is someone else's static host.
const queue = [...targets];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const next = queue.shift();
    if (next) await fetchOne(next);
    const done = targets.length - queue.length;
    if (done % 200 === 0) process.stdout.write(`\r  ${done}/${targets.length} probed…`);
  }
});
await Promise.all(workers);

writeFileSync('src/data/icons.json', JSON.stringify(manifest, null, 2) + '\n');

const pct = n => `${((n / targets.length) * 100).toFixed(1)}%`;
console.log(`\n\nICONS`);
console.log(`  probed        ${targets.length}`);
console.log(`  downloaded    ${found}`);
console.log(`  already had   ${cached}`);
console.log(`  not on site   ${missing}  (${pct(missing)} — these are the broken images upstream)`);
if (failed) console.log(`  request errors ${failed}`);
console.log(`  classes  ${Object.keys(manifest.classes).length}/${Object.values(classes).filter(c => c.icon).length}`);
console.log(`  features ${Object.keys(manifest.features).length}/${Object.keys(features).length}`);
console.log(`  weapons  ${Object.keys(manifest.weapons).length}/${WEAPON_GROUPS.length}`);
