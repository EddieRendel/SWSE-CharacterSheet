/**
 * Import the SWSE Feats/Talents summary spreadsheets over the extracted rules data.
 *
 *   node tools-import-excel.mjs
 *
 * The spreadsheets are authoritative for *structure* — which talents exist, which tree and
 * class they belong to, and which books they come from. The extracted data is authoritative
 * for *rules text*, since the spreadsheets only carry terse summaries. Where both have an
 * entry, the full text wins and only the structure is updated.
 */
import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';

const DATA = 'src/data';
const read = p => JSON.parse(readFileSync(`${DATA}/${p}`, 'utf8'));
const write = (p, d) => writeFileSync(`${DATA}/${p}`, JSON.stringify(d, null, 2) + '\n');

const features = read('features.json');
const classes = read('classes.json');
const trees = read('talentTrees.json');
const species = read('species.json');

const report = { newFeats: 0, newTalents: 0, updated: 0, removed: [], hidden: 0, trees: 0, forked: [], sameEntry: [], prereqsResolved: 0 };

// ---------------------------------------------------------------------------
const slug = s => String(s ?? '').toLowerCase().trim()
  .replace(/\s+/g, ' ')
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const clean = s => s == null ? undefined : String(s).replace(/\s+/g, ' ').trim() || undefined;

/** Spreadsheet book codes -> the keys already used in the data. */
const BOOKS = {
  CR: 'core', K: 'knights', F: 'force', R: 'rebellion', C: 'clone', L: 'legacy',
  J: 'jedi', SV: 'scum', S: 'starships', T: 'threats', GI: 'intrigue',
  UR: 'regions', SGD: 'droids', GW: 'war', W: 'war',
};

/** Spreadsheet class names -> class ids in the data. Anything absent is content we don't have. */
const CLASS_IDS = {
  'Jedi': 'jedi', 'Noble': 'noble', 'Scoundrel': 'scoundrel', 'Scout': 'scout', 'Soldier': 'soldier',
  'Ace Pilot': 'ace-pilot', 'Bounty Hunter': 'bounty-hunter', 'Crime Lord': 'crime-lord',
  'Elite Trooper': 'elite-trooper', 'Force Adept': 'force-adept', 'Gladiator': 'gladiator',
  'Gunslinger': 'gunslinger', 'Imperial Knight': 'imperial-knight',
  'Independent Droid': 'droid-independent', 'Jedi Knight': 'jedi-knight',
  'Master Privateer': 'master-privateer', 'Officer': 'officer', 'Sith Apprentice': 'sith-apprentice',
};

/** Talents any Force-sensitive character may take, regardless of class. */
const FORCE_SENSITIVE = 'Force Sensitive';
/** Groups whose talents belong to content the app doesn't model yet. */
const UNSUPPORTED_GROUPS = {
  'Force-Using Tradition': 'Force traditions are not implemented',
};

const sheetRows = (file, sheets) => {
  const wb = XLSX.readFile(file);
  return sheets.flatMap(s => XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: null }));
};

// ---------------------------------------------------------------------------
// Conservative prerequisite parsing.
// Only patterns we can read unambiguously become machine-checked requirements; everything
// else stays as display text. Under-restricting is safe, mis-restricting is not.
// ---------------------------------------------------------------------------
const ABILITIES = { str: 'str', strength: 'str', dex: 'dex', dexterity: 'dex', con: 'con',
  constitution: 'con', int: 'int', intelligence: 'int', wis: 'wis', wisdom: 'wis',
  cha: 'cha', charisma: 'cha' };

/** The seven weapon groups, matching src/data/index.ts. */
const WEAPON_GROUP_IDS = new Set([
  'simple-weapons', 'pistols', 'rifles', 'advanced-melee-weapons',
  'heavy-weapons', 'lightsabers', 'exotic-weapons',
]);
const SPECIES_IDS = new Map(Object.values(read('species.json')).map(sp => [sp.name.toLowerCase(), sp.id]));

const SKILL_ALIASES = {};
for (const s of Object.values(read('skills.json'))) {
  SKILL_ALIASES[s.name.toLowerCase()] = s.id;
  SKILL_ALIASES[s.id] = s.id;
}
// Shorthand the spreadsheets use.
Object.assign(SKILL_ALIASES, {
  'use comp': 'use-computer', 'use computer': 'use-computer',
  'know (galactic lore)': 'knowledge-galactic-lore', 'knowledge (galactic lore)': 'knowledge-galactic-lore',
  'know (life sciences)': 'knowledge-life-sciences', 'knowledge (life sciences)': 'knowledge-life-sciences',
  'know (physical sciences)': 'knowledge-physical-sciences', 'knowledge (physical sciences)': 'knowledge-physical-sciences',
  'know (social sciences)': 'knowledge-social-sciences', 'knowledge (social sciences)': 'knowledge-social-sciences',
  'know (tactics)': 'knowledge-tactics', 'knowledge (tactics)': 'knowledge-tactics',
  'know (technology)': 'knowledge-technology', 'knowledge (technology)': 'knowledge-technology',
  'know (bureaucracy)': 'knowledge-bureaucracy', 'knowledge (bureaucracy)': 'knowledge-bureaucracy',
  'utf': 'use-the-force', 'use the force': 'use-the-force',
});

/** Shorthand the summary sheets use for feature names. */
const PREREQ_ABBREVIATIONS = [
  [/^atk\b/i, 'Attack'],
  [/^wf\b\s*/i, 'Weapon Focus '],
  [/^ws\b\s*/i, 'Weapon Specialization '],
  [/^sf\b\s*/i, 'Skill Focus '],
  [/^ma\b\s*/i, 'Martial Arts '],
  [/^dwm\b\s*/i, 'Dual Weapon Mastery '],
  [/\bdouble atk\b/i, 'Double Attack'],
  // "Dual Weapon I" is Dual Weapon Mastery I; the sheet drops the middle word.
  [/^dual weapon(?=\s+i{1,3}\b|$)/i, 'Dual Weapon Mastery'],
];

/** Ranks, so "MA I-II" becomes two requirements rather than one unreadable token. */
const ROMAN = ['I', 'II', 'III', 'IV'];

/**
 * Tokens that are sheet bookkeeping rather than a requirement. "Combo" marks the row as a
 * feat combination entry; it is not something the character has to have.
 */
const PREREQ_NOISE = /^(combo|special|see below|any|none|-|n\/a)$/i;

/** Split on separators, but never inside brackets: "Atk Combo (Melee) & (Ranged)" is two. */
function splitPrereq(text) {
  const parts = [];
  let depth = 0, current = '';
  const push = () => { if (current.trim()) parts.push(current.trim()); current = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0) {
      if (ch === ',' || ch === ';') { push(); continue; }
      if (ch === '&') { push(); continue; }
      if (/\s/.test(ch) && /\sand$/i.test(current + ' ') === false && text.slice(i + 1, i + 5).toLowerCase() === 'and ') {
        push(); i += 4; continue;
      }
    }
    current += ch;
  }
  push();
  return parts;
}

function parsePrereq(text, nameToId) {
  const raw = clean(text);
  if (!raw) return { requirements: undefined, unparsed: [] };

  const req = {};
  const unparsed = [];

  /** Resolve a name to a feature id, allowing for the shorthand and the "I" suffix. */
  const featureId = (name) => {
    let n = name.trim();
    for (const [pattern, full] of PREREQ_ABBREVIATIONS) n = n.replace(pattern, full);
    n = n.replace(/\s+/g, ' ').trim();
    const tries = [n, `${n} I`, n.replace(/\s+I$/, '')];
    for (const t of tries) {
      const id = nameToId.get(t.toLowerCase()) ?? (features[slug(t)] ? slug(t) : undefined);
      if (id) return id;
    }
    // "Weapon Focus (lightsabers)" carries its specialization in brackets. A skill
    // specialization brings its own bracket — "Skill Focus Knowledge (social sciences)" —
    // so the split is tried at every word boundary, longest name first.
    const bracket = n.match(/^(.*?)\s*\(([^)]+)\)$/);
    if (bracket) {
      const words = bracket[1].trim().split(/\s+/);
      for (let take = words.length; take >= 1; take--) {
        const name = words.slice(0, take).join(' ');
        const rest = words.slice(take).join(' ');
        const baseId = nameToId.get(name.toLowerCase())
          ?? (features[slug(name)] ? slug(name) : undefined);
        if (!baseId) continue;
        const specText = rest ? `${rest} (${bracket[2]})` : bracket[2];
        const skill = SKILL_ALIASES[specText.trim().toLowerCase()];
        if (skill) return { id: baseId, spec: skill };
        const group = slug(specText);
        if (WEAPON_GROUP_IDS.has(group)) return { id: baseId, spec: group };
        if (!rest) return baseId;
      }
    }
    return undefined;
  };

  /** One token, resolved into `req` if it can be. Returns false when it cannot. */
  const apply = (tokenRaw, target = req) => {
    const token = tokenRaw.replace(/\*+$/, '').replace(/\.$/, '')
      .replace(/^requires?\s+/i, '').trim();
    if (!token || PREREQ_NOISE.test(token)) return true;
    const lower = token.toLowerCase();

    let m;
    if ((m = lower.match(/^(str|dex|con|int|wis|cha|strength|dexterity|constitution|intelligence|wisdom|charisma)\s*(\d+)$/))) {
      (target.abilities ??= {})[ABILITIES[m[1]]] = Number(m[2]); return true;
    }
    if ((m = lower.match(/^(?:bab|base attack bonus)\s*\+?\s*(\d+)$/))) {
      target.baseAttackBonus = Number(m[1]); return true;
    }
    if ((m = lower.match(/^(?:character\s+)?level\s+(\d+)/)) || (m = lower.match(/^(\d+)(?:st|nd|rd|th)\s+level/))) {
      target.level = Number(m[1]); return true;
    }
    // "Dark Side score 1+" — any score above zero.
    if (/^dark side score\s*\d*\+?$/i.test(lower)) { target.darkSide = true; return true; }

    // "Trained in Stealth", "Stealth trained", and the bare "Stealth skill".
    if ((m = lower.match(/^trained\s+(?:in\s+)?(?:the\s+)?(.+?)(?:\s+skill)?$/))
        || (m = lower.match(/^(.+?)\s+trained$/))
        || (m = lower.match(/^(.+?)\s+skill$/))) {
      const skill = SKILL_ALIASES[m[1].trim()];
      if (skill) { (target.trainedSkills ??= []).push(skill); return true; }
    }
    // A bare skill name in a prerequisite list always means trained in it.
    if (SKILL_ALIASES[lower]) { (target.trainedSkills ??= []).push(SKILL_ALIASES[lower]); return true; }

    // "proficient lightsabers" / "proficient with rifles".
    if ((m = lower.match(/^proficient(?:\s+with)?\s+(.+)$/))) {
      const group = slug(m[1]);
      if (WEAPON_GROUP_IDS.has(group)) {
        (target.features ??= []).push({ id: 'weapon-proficiency', spec: group });
        return true;
      }
      return false;   // "proficient with armor worn" is not something we can check
    }

    const feature = featureId(token);
    if (feature) {
      (target.features ??= []).push(typeof feature === 'string' ? { id: feature } : feature);
      return true;
    }

    const speciesId = SPECIES_IDS.get(lower);
    if (speciesId) { (target.species ??= []).push(speciesId); return true; }

    return false;
  };

  // "Atk Combo (Melee) & (Ranged)" and "Martial Arts I & II" name the thing once; the
  // later fragments inherit it.
  const parts = [];
  let base;
  for (const part of splitPrereq(raw)) {
    const rangeMatch = part.match(/^(.*?)\s+(I{1,3})\s*-\s*(I{1,3})$/i);
    if (rangeMatch) {
      const from = ROMAN.indexOf(rangeMatch[2].toUpperCase());
      const to = ROMAN.indexOf(rangeMatch[3].toUpperCase());
      if (from >= 0 && to >= from) {
        for (let i = from; i <= to; i++) parts.push(`${rangeMatch[1]} ${ROMAN[i]}`);
        base = rangeMatch[1];
        continue;
      }
    }
    if (base && /^\([^)]+\)$/.test(part)) { parts.push(`${base} ${part}`); continue; }
    if (base && /^I{1,3}$/i.test(part)) { parts.push(`${base} ${part.toUpperCase()}`); continue; }
    base = part.match(/^(.*?)\s*\([^)]*\)$/)?.[1] ?? part.replace(/\s+I{1,3}$/i, '');
    parts.push(part);
  }

  for (const part of parts) {
    // "Double Attack or Dual Weapon Mastery I" — either one satisfies it.
    if (/\bor\b/i.test(part)) {
      const options = part.split(/\bor\b/i).map(o => o.trim()).filter(Boolean);
      // A bare bracket carries the previous name: "Atk Combo (Melee) or (Ranged)".
      const base = options[0].match(/^(.*?)\s*\([^)]*\)$/)?.[1];
      const groups = [];
      let ok = options.length > 1;
      for (const option of options) {
        const text = base && /^\([^)]+\)$/.test(option) ? `${base} ${option}` : option;
        const group = {};
        if (!apply(text, group) || !Object.keys(group).length) { ok = false; break; }
        groups.push(group);
      }
      if (ok) { (req.anyOf ??= []).push(groups); continue; }
      unparsed.push(part);
      continue;
    }
    if (!apply(part)) unparsed.push(part.replace(/^requires?\s+/i, '').trim());
  }
  return { requirements: Object.keys(req).length ? req : undefined, unparsed };
}

// ---------------------------------------------------------------------------
// Load the spreadsheets
// ---------------------------------------------------------------------------
const featRows = sheetRows('SWSE Feats Summary (all books).xlsx', ['Table 1', 'Table 2'])
  .filter(r => r.FEAT);
const talentRows = sheetRows('SWSE Talents Summary (all books).xlsx', ['Table 1', 'Table 2'])
  .filter(r => r.TALENT);

// Resolve prerequisite names against every feature name we will end up with.
const nameToId = new Map();
for (const f of Object.values(features)) nameToId.set(f.name.toLowerCase(), f.id);
for (const r of featRows) nameToId.set(clean(r.FEAT).toLowerCase(), slug(r.FEAT));
for (const r of talentRows) nameToId.set(clean(r.TALENT).toLowerCase(), slug(r.TALENT));

/**
 * Claim an id for a feature of a given type.
 *
 * Saga Edition reuses names across categories — "Surge" is a Scout talent and a Force
 * power, "Recall" a talent and a feat. Writing blind by slug would leave a talent tree
 * pointing at a feat. Entries typed 'trait' are the ones the source left untyped, so an
 * explicit type from the sheet corrects them rather than forking a duplicate.
 */
function claimId(baseId, type) {
  const existing = features[baseId];
  if (!existing || existing.type === type) return baseId;
  if (existing.type === 'trait') { existing.type = type; return baseId; }
  const suffixed = `${baseId}-${type}`;
  if (!features[suffixed] || features[suffixed].type === type) return suffixed;
  let n = 2;
  while (features[`${suffixed}-${n}`] && features[`${suffixed}-${n}`].type !== type) n++;
  return `${suffixed}-${n}`;
}

/**
 * Two books sometimes print *different* talents under the same name: the Sith talent tree
 * has a "Sith Alchemy" that makes a Sith Talisman (KotOR p.41), and the Sith Alchemy tree
 * has a "Sith Alchemy" that makes amulets, armor, talismans and weapons (JATM p.21).
 * Keyed by name alone the second silently overwrites the first, and the survivor is then
 * listed in both trees — one entry, showing up twice, reading the same both times.
 *
 * A name that recurs with the same summary is a reprint and stays one entry. A name that
 * recurs with different rules is forked, the first occurrence keeping the plain id so that
 * characters who already selected it are unaffected.
 */
const summaryWords = s => new Set(
  String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2),
);

/** How much two summaries share: 1 is identical wording, 0 nothing in common. */
function similarity(a, b) {
  const A = summaryWords(a), B = summaryWords(b);
  if (!A.size && !B.size) return { overlap: 1, containment: 1 };
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return {
    overlap: shared / (A.size + B.size - shared),
    // One summary being a subset of the other means one is an abbreviation of it.
    containment: shared / Math.max(1, Math.min(A.size, B.size)),
  };
}

/**
 * Forking is a judgement, so it takes two independent signals agreeing. The summaries must
 * share little wording *and* neither may be a condensed version of the other. Echani
 * Training's KotOR summary is word-for-word the start of its Galaxy at War one, and
 * Notorious is the same talent summarised twice in the same book — those stay single.
 */
const DIFFERENT_RULES = 0.4;
const IS_ABBREVIATION = 0.9;
const areDifferent = (a, b) => {
  const { overlap, containment } = similarity(a, b);
  return overlap < DIFFERENT_RULES && containment < IS_ABBREVIATION;
};

function variantIds(rows, nameKey) {
  const byName = new Map();
  for (const row of rows) {
    const name = clean(row[nameKey]);
    if (!name) continue;
    const key = slug(name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }

  const ids = new Map();   // row -> id to use
  for (const [key, group] of byName) {
    if (group.length === 1) continue;

    // Collect the genuinely distinct rules printed under this name.
    const variants = [];
    for (const row of group) {
      const summary = clean(row.BENEFIT) ?? '';
      const match = variants.find(v => !areDifferent(v.summary, summary));
      if (match) { match.rows.push(row); continue; }
      variants.push({ summary, rows: [row] });
    }

    const where = r => `${clean(r.BOOK) ?? '?'}${r.PAGE ?? ''}`;
    if (variants.length === 1) {
      report.sameEntry.push(`${clean(group[0][nameKey])} — ${group.map(where).join(', ')}`);
      continue;
    }

    // The plain id keeps whichever variant already owns it, so a character who selected
    // this talent still has the same one, and its text still matches its book and page.
    const existing = features[key];
    const existingText = existing
      ? [...(existing.description ?? []), ...(existing.benefit ?? [])].join(' ').replace(/<[^>]+>/g, ' ')
      : '';
    const scored = variants.map(v => ({ v, score: similarity(v.summary, existingText).containment }));
    const owner = existing
      ? scored.reduce((best, x) => (x.score > best.score ? x : best), scored[0]).v
      : variants[0];

    const used = new Set([key]);
    for (const variant of variants) {
      let id = key;
      if (variant !== owner) {
        const book = BOOKS[clean(variant.rows[0].BOOK)] ?? slug(clean(variant.rows[0].BOOK)) ?? 'variant';
        id = `${key}-${book}`;
        if (used.has(id)) id = `${key}-${book}-${variant.rows[0].PAGE ?? used.size}`;
        report.forked.push(
          `${clean(variant.rows[0][nameKey])}: ${id} (${variant.rows.map(where).join(', ')})`
          + ` — shares ${(similarity(variant.summary, owner.summary).overlap * 100).toFixed(0)}%`
          + ` of its wording with ${key} (${owner.rows.map(where).join(', ')})`,
        );
      }
      used.add(id);
      for (const row of variant.rows) ids.set(row, id);
    }
  }
  return ids;
}

/** Merge one spreadsheet row into the feature table. */
function upsert(row, { nameKey, type, forcedId }) {
  const name = clean(row[nameKey]);
  const id = forcedId ?? claimId(slug(name), type);
  const existing = features[id];
  const book = BOOKS[clean(row.BOOK)] ?? existing?.book ?? 'unknown';
  const prereqText = clean(row[nameKey === 'FEAT' ? 'PREREQUISITES' : 'PREREQUISITES\n*multiple']);
  const benefit = clean(row.BENEFIT);

  if (existing && !existing.incomplete) {
    // Keep the full rules text; take only structural fields from the sheet.
    existing.book = book;
    if (row.PAGE) existing.page = Number(row.PAGE);
    if (!existing.prerequisites && prereqText) existing.prerequisites = prereqText;

    // An entry carrying leftovers had its requirements parsed from this same sheet text
    // on an earlier run, so re-reading it is safe and picks up parser improvements.
    // Entries whose requirements came from the extracted data have no leftovers and are
    // left alone.
    if (existing.unparsedPrerequisites?.length) {
      const source = prereqText ?? existing.prerequisites;
      const { requirements, unparsed } = parsePrereq(source, nameToId);
      const before = existing.unparsedPrerequisites.length;
      if (requirements) existing.requirements = requirements;
      else delete existing.requirements;
      if (unparsed.length) existing.unparsedPrerequisites = unparsed;
      else delete existing.unparsedPrerequisites;
      report.prereqsResolved += before - unparsed.length;
    }
    report.updated++;
    return existing;
  }

  // New entry, or one that was a bare stub. Only a summary is available.
  const { requirements, unparsed } = parsePrereq(prereqText, nameToId);
  const f = {
    id, name, book, type,
    page: row.PAGE ? Number(row.PAGE) : undefined,
    description: benefit ? [benefit] : ['No summary available.'],
    prerequisites: prereqText,
    requirements,
    summaryOnly: true,
    ...(unparsed.length ? { unparsedPrerequisites: unparsed } : {}),
  };
  for (const k of Object.keys(f)) if (f[k] === undefined) delete f[k];
  if (existing?.incomplete) report.updated++;
  else if (type === 'feat') report.newFeats++;
  else report.newTalents++;
  features[id] = f;
  return f;
}

// ---------------------------------------------------------------------------
// Feats
// ---------------------------------------------------------------------------
const BONUS_COLUMNS = { Jedi: 'jedi', Noble: 'noble', Scoundrel: 'scoundrel', Scout: 'scout', Soldier: 'soldier' };
const bonusLists = Object.fromEntries(Object.values(BONUS_COLUMNS).map(c => [c, []]));

const featVariants = variantIds(featRows, 'FEAT');
for (const row of featRows) {
  const f = upsert(row, { nameKey: 'FEAT', type: 'feat', forcedId: featVariants.get(row) });
  for (const [col, classId] of Object.entries(BONUS_COLUMNS)) {
    if (row[col]) bonusLists[classId].push({ id: f.id });
  }
}

// ---------------------------------------------------------------------------
// Talents, and the trees they belong to
// ---------------------------------------------------------------------------
const treeInfo = new Map();   // treeId -> { id, name, group, features[] }

// A tree name used by two classes with different talents is two trees, not one —
// merging them would hand each class talents the sheet never lists for it.
const groupsPerTreeName = {};
for (const row of talentRows) {
  const name = clean(row.TREE);
  if (name) (groupsPerTreeName[name] ??= new Set()).add(clean(row.CLASS));
}
const shared = new Set(Object.entries(groupsPerTreeName).filter(([, g]) => g.size > 1).map(([n]) => n));
if (shared.size) console.log(`  note: tree names split per class: ${[...shared].join(', ')}`);

const talentVariants = variantIds(talentRows, 'TALENT');
for (const row of talentRows) {
  const f = upsert(row, { nameKey: 'TALENT', type: 'talent', forcedId: talentVariants.get(row) });
  const treeName = clean(row.TREE);
  const group = clean(row.CLASS);
  if (!treeName) continue;
  const treeId = shared.has(treeName) ? `${slug(treeName)}-${slug(group)}` : slug(treeName);
  if (!treeInfo.has(treeId)) treeInfo.set(treeId, { id: treeId, name: treeName, group, features: [] });
  const t = treeInfo.get(treeId);
  if (!t.features.some(r => r.id === f.id)) t.features.push({ id: f.id });
}

// ---------------------------------------------------------------------------
// Rebuild the talent trees
// ---------------------------------------------------------------------------
const KEEP_TREES = new Set(
  Object.keys(trees).filter(id => /-starting$/.test(id) || ['feat', 'force-power', 'force-secret', 'force-technique', 'starship-maneuvers'].includes(id)),
);
const rebuilt = {};
for (const id of KEEP_TREES) rebuilt[id] = trees[id];

for (const t of treeInfo.values()) {
  const previous = trees[t.id];
  const unsupported = UNSUPPORTED_GROUPS[t.group];
  rebuilt[t.id] = {
    id: t.id,
    name: t.name,
    description: previous?.description,
    icon: previous?.icon,
    group: t.group,
    force: t.group === FORCE_SENSITIVE || t.group === 'Force-Using Tradition' || previous?.force,
    features: t.features,
    ...(unsupported ? { hidden: true, hiddenReason: unsupported } : {}),
  };
  for (const k of Object.keys(rebuilt[t.id])) if (rebuilt[t.id][k] === undefined) delete rebuilt[t.id][k];
  report.trees++;
}

// Class bonus-feat trees, rebuilt from the spreadsheet's class columns.
for (const [classId, list] of Object.entries(bonusLists)) {
  const id = `${classId}-bonus`;
  rebuilt[id] = {
    id, name: `${classes[classId].name} bonus feats`,
    features: list.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

// ---------------------------------------------------------------------------
// Which book each class comes from, so characters can be restricted by source.
// The Omegadex index is the only sheet that records this.
// ---------------------------------------------------------------------------
const OMEGADEX_BOOKS = {
  CORE: 'core', KOTOR: 'knights', UNLSH: 'force', LEG: 'legacy', SCUM: 'scum',
  CLONE: 'clone', REBEL: 'rebellion', WAR: 'war', INTR: 'intrigue', UNKN: 'regions',
  JEDI: 'jedi', THREAT: 'threats', STAR: 'starships', SGD: 'droids',
};
try {
  const rows = XLSX.utils.sheet_to_json(
    XLSX.readFile('Omegadex_1.9.xlsx').Sheets['Table 2'], { header: 1, blankrows: false });
  const bookOf = {};
  for (const row of rows.slice(1)) {
    for (let i = 0; i < row.length; i++) {
      const name = row[i], code = row[i + 1];
      if (typeof name === 'string' && typeof code === 'string' && /^[A-Z]{3,6}$/.test(code)) {
        bookOf[name.trim()] = OMEGADEX_BOOKS[code] ?? 'unknown';
        i += 3;
      }
    }
  }
  let tagged = 0;
  for (const cls of Object.values(classes)) {
    // The five base classes are Core; prestige classes come from the index.
    cls.book = cls.prestige ? (bookOf[cls.name] ?? 'unknown') : 'core';
    if (cls.book !== 'unknown') tagged++;
  }
  console.log(`  class books tagged: ${tagged}/${Object.keys(classes).length}`);
} catch (err) {
  console.log('  could not read Omegadex for class books:', err.message);
}

// ---------------------------------------------------------------------------
// Point classes at their trees
// ---------------------------------------------------------------------------
const treesByGroup = {};
for (const t of treeInfo.values()) (treesByGroup[t.group] ??= []).push(t.id);

for (const [className, classId] of Object.entries(CLASS_IDS)) {
  const cls = classes[classId];
  if (!cls) continue;
  const own = (treesByGroup[className] ?? []).sort();
  if (own.length) cls.trees = { ...cls.trees, talent: own };
  if (cls.trees?.bonus) cls.trees.bonus = [`${classId}-bonus`, ...cls.trees.bonus.filter(t => /-starting$/.test(t))];
}
// Classes the sheet has no talents for keep whatever they had.
for (const cls of Object.values(classes)) {
  if (cls.trees?.talent) cls.trees.talent = cls.trees.talent.filter(t => rebuilt[t]);
}

// The universal Force trees, now six rather than four.
const forceTrees = (treesByGroup[FORCE_SENSITIVE] ?? []).sort();

// ---------------------------------------------------------------------------
// Hide content that depends on things the app doesn't model
// ---------------------------------------------------------------------------
const knownSpecies = new Set(Object.keys(species));
const treeOf = new Map();
for (const t of Object.values(rebuilt)) for (const r of t.features ?? []) treeOf.set(r.id, t);

for (const f of Object.values(features)) {
  const reasons = [];
  const tree = treeOf.get(f.id);
  if (tree?.hidden) reasons.push(tree.hiddenReason);
  for (const s of f.requirements?.species ?? []) {
    if (!knownSpecies.has(s)) reasons.push(`requires the ${s} species, which is not implemented`);
  }
  if (reasons.length) {
    f.hidden = true;
    f.hiddenReason = reasons[0];
    report.hidden++;
  } else {
    delete f.hidden;
    delete f.hiddenReason;
  }
}

// ---------------------------------------------------------------------------
// Drop leftover stubs: entries the source referenced but nothing ever defined.
// ---------------------------------------------------------------------------
const stillStubbed = Object.values(features).filter(f => f.incomplete);
const referencedBy = id => {
  const users = [];
  for (const f of Object.values(features)) {
    if (f.requirements?.features?.some(r => r.id === id)) users.push(f);
  }
  return users;
};

for (const stub of stillStubbed) {
  // Anything requiring a stub depends on content we don't have, so hide it…
  for (const user of referencedBy(stub.id)) {
    user.requirements.features = user.requirements.features.filter(r => r.id !== stub.id);
    if (!user.requirements.features.length) delete user.requirements.features;
    if (!Object.keys(user.requirements).length) delete user.requirements;
    if (!user.hidden) {
      user.hidden = true;
      user.hiddenReason = `depends on "${stub.name}", which is not in the rules data`;
      report.hidden++;
    }
  }
  // …then drop the placeholder itself.
  delete features[stub.id];
  report.removed.push(stub.id);
}

// Strip references to anything that no longer exists.
for (const t of Object.values(rebuilt)) {
  if (t.features) t.features = t.features.filter(r => features[r.id]);
}
for (const cls of Object.values(classes)) {
  if (cls.features) cls.features = cls.features.map(g => (g ?? []).filter(r => features[r.id]));
}

// ---------------------------------------------------------------------------
write('features.json', features);
write('talentTrees.json', rebuilt);
write('classes.json', classes);
write('forceTrees.json', forceTrees);

// ---------------------------------------------------------------------------
const counts = t => Object.values(features).filter(f => f.type === t).length;
console.log('IMPORT COMPLETE');
console.log(`  feats            ${counts('feat')}  (+${report.newFeats} new)`);
console.log(`  talents          ${counts('talent')}  (+${report.newTalents} new)`);
console.log(`  entries updated  ${report.updated}`);
console.log(`  prerequisites newly machine-checked: ${report.prereqsResolved}`);
console.log(`  talent trees     ${Object.keys(rebuilt).length}  (${report.trees} from the sheet)`);
console.log(`  hidden           ${report.hidden}`);
console.log(`  stubs removed    ${report.removed.length}: ${report.removed.join(', ')}`);
console.log(`  names printed more than once, kept as one entry: ${report.sameEntry.length}`);
for (const f of report.sameEntry) console.log(`    ${f}`);
console.log(`  names printed more than once with different rules, forked: ${report.forked.length}`);
for (const f of report.forked) console.log(`    ${f}`);
console.log(`  universal Force trees: ${forceTrees.join(', ')}`);

// Integrity
let dangling = 0;
for (const t of Object.values(rebuilt)) for (const r of t.features ?? []) if (!features[r.id]) dangling++;
for (const f of Object.values(features)) for (const r of f.requirements?.features ?? []) if (!features[r.id]) dangling++;
for (const cls of Object.values(classes)) for (const k of Object.values(cls.trees ?? {})) for (const t of k) if (!rebuilt[t]) dangling++;
console.log(`  dangling refs    ${dangling}`);

const empty = Object.entries(rebuilt).filter(([id, t]) => !t.features?.length && !KEEP_TREES.has(id));
console.log(`  empty trees      ${empty.length}${empty.length ? ': ' + empty.map(([id]) => id).join(', ') : ''}`);
