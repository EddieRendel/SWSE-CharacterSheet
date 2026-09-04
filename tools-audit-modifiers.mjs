/**
 * List the features whose text changes an attack roll, a damage roll or the number of
 * damage dice, and which `src/rules/modifiers.ts` does not model.
 *
 *   node tools-audit-modifiers.mjs           # what is still unmodelled
 *   node tools-audit-modifiers.mjs --all     # every match, modelled or not
 *   node tools-audit-modifiers.mjs --text    # with the sentence that matched
 *
 * Read-only: it writes nothing and never touches the data. Its job is to keep the sweep
 * honest across re-imports — a new book brings new feats, and this says which of them
 * went past the table.
 *
 * It deliberately over-matches. Under-reporting hides a feat the player paid for; an
 * extra line in the report costs a moment's reading. Entries genuinely out of scope are
 * listed in SKIP below with the reason, so the report stays short without going quiet.
 */
import { readFileSync } from 'node:fs';

const FEATURES = JSON.parse(readFileSync('src/data/features.json', 'utf8'));
const SUPPLEMENT = JSON.parse(readFileSync('src/data/supplement.json', 'utf8'));
const MODIFIERS = readFileSync('src/rules/modifiers.ts', 'utf8');
const ATTACKS = readFileSync('src/rules/attacks.ts', 'utf8');

const showAll = process.argv.includes('--all');
const showText = process.argv.includes('--text');

/** The same reading `attacks.ts` does: description, benefit and special as one line. */
const text = f => [...(f.description ?? []), ...(f.benefit ?? []), ...(f.special ?? [])]
  .join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Phrasing that means a number on the roll itself. `reroll` and `take the better result`
 * are deliberately absent: they change the odds, not the arithmetic, so there is nothing
 * for a modifier to carry.
 */
const HITS = [
  /[+-]\s?\d+\s+(?:\w+\s+){0,3}bonus\s+(?:on|to)\s+(?:your\s+)?(?:\w+\s+){0,3}(?:attack|damage)\s+rolls?/i,
  /bonus\s+(?:on|to)\s+(?:your\s+)?(?:\w+\s+){0,3}(?:attack|damage)\s+rolls?/i,
  /penalty\s+(?:on|to)\s+(?:your\s+)?(?:\w+\s+){0,3}attack\s+rolls?/i,
  /[+-]\s?\d+\s+(?:die|dice)\s+of\s+damage/i,
  /(?:extra|additional)\s+(?:die|dice)\s+of\s+damage/i,
  /(?:double|triple)\s+(?:the\s+)?(?:normal\s+)?damage\s+dice/i,
  /maximum\s+damage/i,
  /deals?\s+(?:an\s+)?additional\s+\d+d\d+/i,
  // The importer abbreviates some entries to a stub — every Multiattack Proficiency reads
  // "reduce Atk penalty by 2" and nothing else. The prose patterns above all miss that,
  // which is how the advanced-melee-weapons one went unmodelled with nothing to say so.
  /\bAtk\s+penalty/i,
];

/**
 * Out of scope, with the reason. Kept here rather than dropped silently so the next person
 * can disagree with a call without first having to rediscover that it was made. Each is
 * matched against the feature's `type` or its text, whichever the second field names.
 *
 * These are patterns, not an id list, so a re-import that brings in six more talents about
 * aiding an ally does not need six more lines here.
 */
const SKIP = [
  [/^starship-maneuver$/, 'type', 'vehicle combat — the Actions tab does not model it'],
  [/Vehicle Weapon|Starship|Dogfight|\bGunner|\bPilot\b|Capital Ship/i, 'text',
    'vehicle or starship combat'],
  [/Grenade|\bMine\b|Explosive|\bPoison/i, 'text', 'not a weapon attack profile'],
  [/damage\s+threshold\s+as\s+if\s+it\s+were/i, 'text', "lowers the target's damage threshold, not a roll"],
  [/damage\s+reduction\s+as\s+if\s+it\s+were/i, 'text', "lowers the target's damage reduction, not a roll"],
  [/\breroll\b|take the (?:best|better) result/i, 'text', 'changes the odds, not the arithmetic'],
  [/Armor Check Penalty/i, 'text', 'the armour penalty is already on the attack line'],
  [/Critical Hit/i, 'text', 'criticals are rolled, not derived'],
  [/\bDisarm\b|\bGrapple|\bGrabbing\b|Coup de Grace|\bTrip\b/i, 'text',
    'a special attack, not an attack profile'],
  [/Aid Another|allies (?:gain|within)|all your allies|your allies gain/i, 'text',
    'a bonus handed to allies'],
  [/(?:opponents?|enemies|enemy|targets?) (?:takes?|suffers?) a -\d/i, 'text',
    'a penalty inflicted on the enemy'],
  [/Improvised Weapon|concealment|Range category|standard -5 penalty/i, 'text',
    'removes a penalty this app does not model'],
  // The generic Multiattack Proficiency stub names no weapon group and carries no
  // specType, so there is nothing to scope it to. Its seven per-group siblings are the
  // ones that can be modelled, and they are.
  [/^multiattack-proficiency$/, 'id', 'the generic stub names no weapon group'],
  // A power that rolls its own damage against a defence is a profile of its own on the
  // Actions tab — buildPowers reads it — not a modifier on a weapon attack.
  [/\d+d\d+\s*(?:points of\s*)?\w*\s*damage/i, 'power', 'a Force power with a profile of its own'],
];

const modelled = new Set(
  // Both halves of the split: ids in the table, and the ones attacks.ts still names
  // itself (the Dual Weapon Mastery ladder, Weapon Finesse, Ataru, Martial Arts).
  [...MODIFIERS.matchAll(/\bid:\s*'([a-z0-9-]+)'/g)].map(m => m[1])
    .concat([...ATTACKS.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1])),
);

/**
 * The Weapon Focus family is in the books twice: once generic, taken with a weapon group,
 * and once written into a tree for a single weapon. `treeCopyOf` in attacks.ts finds the
 * tree copies by shape — `<generic>-<group>` or `<generic>-<weapon>` — so they are covered
 * without any of them being named anywhere.
 */
const TREE_COPY = /^(?:greater-)?weapon-(?:focus|specialization)-/;
const covered = id => modelled.has(id) || TREE_COPY.test(id);

const rows = [];
for (const f of Object.values(FEATURES)) {
  if (f.hidden) continue;
  const body = text(f);
  if (!HITS.some(re => re.test(body))) continue;

  const skipped = SKIP.find(([re, where]) => {
    if (where === 'type') return re.test(f.type);
    if (where === 'id') return re.test(f.id);
    if (where === 'power') return f.type === 'force-power' && re.test(body);
    return re.test(body);
  });
  const known = covered(f.id);
  if (!showAll && (known || skipped)) continue;

  rows.push({
    id: f.id, name: f.name, type: f.type, book: f.book, page: f.page,
    state: known ? 'modelled' : skipped ? `skipped — ${skipped[2]}` : 'UNMODELLED',
    body,
  });
}

const order = ['feat', 'talent', 'trait', 'force-power', 'force-technique', 'force-secret', 'starship-maneuver'];
rows.sort((a, b) => (order.indexOf(a.type) - order.indexOf(b.type)) || a.id.localeCompare(b.id));

let type = '';
for (const r of rows) {
  if (r.type !== type) { type = r.type; console.log(`\n## ${type}\n`); }
  console.log(`${r.id.padEnd(38)} ${r.name}`
    + `  [${r.book}${r.page ? ` p.${r.page}` : ''}]`
    + (showAll ? `  — ${r.state}` : ''));
  if (showText) console.log(`    ${r.body.slice(0, 400)}`);
}

const open = rows.filter(r => r.state === 'UNMODELLED').length;
console.log(`\n${rows.length} listed, ${open} unmodelled.`);

// Supplement corrections are merged over the generated data at load, so a feat patched
// there reads differently in the app than it does here. Say so rather than quietly
// auditing the wrong text.
const patched = Object.keys(SUPPLEMENT.features ?? {}).filter(covered);
if (patched.length) console.log(`Note: ${patched.length} modelled ids are also patched in supplement.json.`);
