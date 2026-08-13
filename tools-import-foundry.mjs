/**
 * Import species, equipment and Force powers from the FoundryVTT Saga Edition system.
 *
 *   git clone --depth 1 https://github.com/kypvalanx/Foundry-VTT-StarWars-SagaEdition
 *   node tools-import-foundry.mjs ./Foundry-VTT-StarWars-SagaEdition
 *
 * Its compendia are Foundry v11+ LevelDB directories. Only sourcebook content is taken:
 * anything tagged "Homebrew Content" or "<author> Creations" is skipped outright.
 *
 * Deliberately does NOT touch feats, talents or talent trees — those come from the
 * spreadsheets and carry structure (trees, bonus-feat lists) this pack does not have.
 */
import { ClassicLevel } from 'classic-level';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import XLSX from 'xlsx';

const ROOT = process.argv[2] ?? './Foundry-VTT-StarWars-SagaEdition';
const DATA = 'src/data';
if (!existsSync(`${ROOT}/packs/species`)) {
  console.error(`No packs found at ${ROOT}/packs. Pass the path to the cloned system.`);
  process.exit(1);
}

const read = p => JSON.parse(readFileSync(`${DATA}/${p}`, 'utf8'));
const write = (p, d) => writeFileSync(`${DATA}/${p}`, JSON.stringify(d, null, 2) + '\n');

async function pack(name) {
  const db = new ClassicLevel(`${ROOT}/packs/${name}`, { valueEncoding: 'json' });
  const items = [], effects = new Map();
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith('!items!')) items.push(v);
    else if (k.startsWith('!items.effects!')) {
      const owner = k.split('!')[2].split('.')[0];
      (effects.get(owner) ?? effects.set(owner, []).get(owner)).push(v);
    }
  }
  await db.close();
  return { items, effects };
}

const slug = s => String(s ?? '').toLowerCase().trim()
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Claim an id for a feature of a given type. Saga Edition reuses names across categories —
 * "Surge" is a Scout talent *and* a Force power, "Recall" a talent and a feat — so writing
 * blind by slug would silently replace one with the other and break the talent trees.
 */
const claimId = (features, baseId, type) => {
  const existing = features[baseId];
  if (!existing || existing.type === type) return baseId;
  const suffixed = `${baseId}-${type}`;
  if (!features[suffixed] || features[suffixed].type === type) return suffixed;
  let n = 2;
  while (features[`${suffixed}-${n}`] && features[`${suffixed}-${n}`].type !== type) n++;
  return `${suffixed}-${n}`;
};

const cats = it => (it.system?.categories ?? []).map(c => c.value ?? c);
const plainText = h => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/**
 * Fan content is marked three ways and each catches what the others miss: a Homebrew
 * category, a fan source string (below), and — with no category at all — a description
 * that says so outright. Four starship maneuvers reached the data through that last gap,
 * their whole rules text being the notice itself.
 */
const isHomebrew = it => cats(it).some(c => /homebrew|creations/i.test(c))
  || /this homebrew content|homebrew content has (not )?been/i.test(plainText(it.system?.description));

/**
 * Everything Wizards of the Coast published for Saga Edition, plus the free web material
 * and the Dawn of Defiance adventures. Anything else is fan work.
 *
 * The equipment packs do not use the Homebrew category at all — they carry the book in a
 * source string instead, and that string is where the fan material shows: the "Clone Wars
 * Saga Edition Fan Sourcebook" series, "DMF's Big List of SWSE NPCs", the fan-made New
 * Jedi Order Campaign Guide, the Dathomir Field Guide, and the Corporate Sector
 * Sourcebook, which is a 1987 d6 book someone converted. None of it is a sourcebook.
 */
const OFFICIAL_SOURCE = new RegExp([
  'Star Wars Saga Edition (?:',
  [
    'Core Rulebook', 'Knights of the Old Republic', 'Force Unleashed', 'Scum and Villainy',
    'Clone Wars', 'Legacy Era', 'Rebellion Era', 'Jedi Academy Training Manual',
    'Galaxy at War', 'Galaxy of Intrigue', 'Unknown Regions', 'Threats of the Galaxy',
    "Scavenger's Guide to Droids", 'Starships of the Galaxy', 'Web Enhancements',
    'Dawn of Defiance',
  ].join('|'),
  ')',
].join(''), 'i');

const sourceOf = it => String(it.system?.source ?? it.system?.sourceString ?? '').trim();
/** An entry with no source at all is left alone; a named fan source is rejected. */
const isFanMade = it => {
  const src = sourceOf(it);
  return !!src && !OFFICIAL_SOURCE.test(src);
};

/** Source string -> the book keys the rest of the data uses. */
const SOURCE_BOOKS = [
  [/Core Rulebook/i, 'core'], [/Knights of the Old Republic/i, 'knights'],
  [/Force Unleashed/i, 'force'], [/Scum and Villainy/i, 'scum'],
  [/Clone Wars/i, 'clone'], [/Legacy Era/i, 'legacy'], [/Rebellion Era/i, 'rebellion'],
  [/Jedi Academy Training Manual/i, 'jedi'], [/Galaxy at War/i, 'war'],
  [/Galaxy of Intrigue/i, 'intrigue'], [/Unknown Regions/i, 'regions'],
  [/Threats of the Galaxy/i, 'threats'], [/Scavenger's Guide to Droids/i, 'droids'],
  [/Starships of the Galaxy/i, 'starships'], [/Web Enhancements/i, 'web'],
  [/Dawn of Defiance/i, 'dawn'],
];
const bookOfSource = it => {
  const src = sourceOf(it);
  for (const [pattern, book] of SOURCE_BOOKS) if (pattern.test(src)) return book;
  return 'unknown';
};

/** Wiki HTML → plain paragraphs. Tables and links are dropped rather than injected. */
function toParagraphs(html) {
  if (!html) return [];
  return String(html)
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
    // Wiki navigation, not rules. "Reference Book: Star Wars Saga Edition <book>" opens
    // nearly every entry and duplicates the book and page taken from the source string;
    // keeping it meant 377 of 535 equipment notes consisted of nothing but that line, the
    // real text having been discarded as a later paragraph. "See also:" is a cross-reference
    // list. Both are asserted absent by the rules-text tests.
    .filter(p => !/^\s*(Reference Book|See also)\s*:/i.test(p));
}

const changeMap = it => {
  const out = {};
  for (const c of it.system?.changes ?? []) {
    if (!c?.key) continue;
    (out[c.key] ??= []).push(String(c.value));
  }
  return out;
};

const report = { species: 0, droids: 0, skippedHomebrew: 0, skippedFanMade: 0, prunedFanMade: 0, prunedHomebrew: [], keptDespiteNotice: [], fanSources: new Set(), traits: 0, items: 0, powers: 0, booked: 0 };

// ---------------------------------------------------------------------------
// Sourcebook + page for species, from the Omegadex index. The Foundry descriptions
// cite reprints rather than first appearance (Wookiee points at Rebellion Era), so
// they cannot be trusted for this.
// ---------------------------------------------------------------------------
const OMEGA_BOOK = { CORE:'core', KOTOR:'knights', UNLSH:'force', LEG:'legacy', CLONE:'clone',
  SCUM:'scum', INTR:'intrigue', UNKN:'regions', JEDI:'jedi', THRT:'threats', WAR:'war',
  REBEL:'rebellion', SGD:'droids', STAR:'starships' };
// Spelling differs between the two sources.
const ALIAS = { taug:'taung', toff:'tof', lurman:'lurmen', neimodian:'neimoidian',
  gamorean:'gamorrean', nyriaannative:'nyriaanan', duro:'duros' };
/**
 * Every name the Omegadex indexes. It lists official content and nothing else, so it is
 * the tiebreaker whenever the pack's description calls something homebrew: the pack holds
 * a homebrew *variant* of Cryokinesis, and taking that notice at face value would lose a
 * Jedi Academy Training Manual power (p.25).
 */
const officialNames = new Set();
try {
  const book = XLSX.readFile('Omegadex_1.9.xlsx');
  for (const sheet of Object.values(book.Sheets)) {
    for (const row of XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })) {
      for (const cell of row) {
        if (typeof cell === 'string' && cell.trim()) officialNames.add(slug(cell.trim()));
      }
    }
  }
} catch { /* without the index every entry is judged on the pack alone */ }

const speciesBook = new Map();
try {
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile('Omegadex_1.9.xlsx').Sheets['Table 1'], { header: 1, blankrows: false });
  let started = false;
  const norm = x => { let n = String(x).toLowerCase().replace(/[^a-z]/g, ''); n = ALIAS[n] ?? n;
    return n.endsWith('s') && n.length > 4 ? n.slice(0, -1) : n; };
  for (const r of rows) {
    if (String(r[0]).trim() === 'SPECIES') { started = true; continue; }
    if (!started) continue;
    for (let i = 0; i < r.length; i++) {
      const [name, book, page] = [r[i], r[i + 1], r[i + 2]];
      if (typeof name === 'string' && typeof book === 'string' && OMEGA_BOOK[String(book).trim()] && typeof page === 'number') {
        const k = norm(name);
        if (!speciesBook.has(k)) speciesBook.set(k, { book: OMEGA_BOOK[book.trim()], page });
        i += 2;
      }
    }
  }
  console.log(`  Omegadex book tags for ${speciesBook.size} species`);
} catch (err) {
  console.log('  Omegadex not readable, species will be untagged:', err.message);
}
/**
 * Species the Omegadex (v1.9, 2010) does not index because they come from the online
 * Web Enhancements rather than a printed book.
 */
/** Variants the index lists only under their base name. */
const EXPLICIT_BOOK = {
  'umbaranalternatespeciestraits': { book: 'intrigue', page: 18 },
};

const WEB_ENHANCEMENT = new Set([
  'nazren', 'skakoan', 'pauan', 'polismassan', 'amani',
  'oreenian', 'stereb', 'tuskenraider', 'arcona', 'phindian',
]);

const bookFor = name => {
  let n = String(name).toLowerCase().replace(/[^a-z]/g, '');
  if (EXPLICIT_BOOK[n]) return EXPLICIT_BOOK[n];
  if (WEB_ENHANCEMENT.has(n)) return { book: 'web' };
  n = ALIAS[n] ?? n;
  return speciesBook.get(n) ?? speciesBook.get(n.endsWith('s') && n.length > 4 ? n.slice(0, -1) : n);
};

// ---------------------------------------------------------------------------
// SPECIES
// ---------------------------------------------------------------------------
const features = read('features.json');
const speciesOut = read('species.json');

const ABILITY = { Strength: 'str', Dexterity: 'dex', Constitution: 'con', Intelligence: 'int', Wisdom: 'wis', Charisma: 'cha' };
const SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];

const { items: rawSpecies } = await pack('species');

for (const sp of rawSpecies) {
  if (isHomebrew(sp)) { report.skippedHomebrew++; continue; }

  const id = slug(sp.name);
  const provided = sp.system?.providedItems ?? [];
  const abilities = {};
  let size = 'Medium', speed = 6, bonusFeat = false, bonusSkill = false;
  const traitRefs = [];

  for (const p of provided) {
    const name = String(p.name ?? '').trim();
    if (!name) continue;
    // Age brackets are flavour, not mechanics we model.
    if (p.prerequisite?.type === 'AGE') continue;

    let m;
    if ((m = name.match(/^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s*\(([+-]?\d+)\)$/))) {
      abilities[ABILITY[m[1]]] = Number(m[2]);
      continue;
    }
    if ((m = name.match(/^Base Speed\s*\((\d+)\)$/))) { speed = Number(m[1]); continue; }
    if (SIZES.includes(name)) { size = name; continue; }
    if (/^Bonus Feat$/i.test(name)) { bonusFeat = true; continue; }
    if (/^Bonus Trained Skill$/i.test(name)) { bonusSkill = true; continue; }

    // Everything else is a named species trait.
    const tid = claimId(features, slug(name), 'trait');
    if (!features[tid]) {
      features[tid] = {
        id: tid, name, book: 'unknown', type: 'trait',
        description: ['Species trait. See your sourcebook for the full text.'],
        summaryOnly: true,
      };
      report.traits++;
    }
    traitRefs.push({ id: tid });
  }

  if (cats(sp).includes('Conditional Bonus Feat') || cats(sp).includes('Bonus Feat')) bonusFeat = true;
  if (cats(sp).includes('Bonus Trained Skill')) bonusSkill = true;

  const languages = (changeMap(sp).maySpeak ?? []).filter(Boolean);
  const isDroidModel = /Droid/i.test(sp.name);

  const existing = speciesOut[id];
  const src = bookFor(sp.name);
  if (src) report.booked++;
  speciesOut[id] = {
    id,
    name: sp.name,
    ...(src ? { book: src.book, page: src.page } : {}),
    size,
    speed,
    ...(Object.keys(abilities).length ? { abilities } : {}),
    // Keep hand-verified traits for species we already had; they reference real features.
    features: existing?.features?.length ? existing.features : traitRefs,
    languages: existing?.languages?.length ? existing.languages : (languages.length ? languages : ['Basic']),
    ...(bonusFeat || existing?.bonusFeat ? { bonusFeat: true } : {}),
    ...(bonusSkill || existing?.bonusSkill ? { bonusSkill: true } : {}),
    description: toParagraphs(sp.system?.description).slice(0, 4),
    // Droid models need droid rules the app does not implement.
    ...(isDroidModel ? { hidden: true, hiddenReason: 'droid characters are not implemented' } : {}),
  };
  if (isDroidModel) report.droids++; else report.species++;
}

// ---------------------------------------------------------------------------
// DROIDS — degrees, sizes and the systems catalogue.
//
// Degree and size tables are transcribed from the "Droid Heroes" rules entry; the
// systems come straight from the droid-system pack. Player droids may only be Medium
// or Small, the other sizes existing for GM-run droids.
// ---------------------------------------------------------------------------
{
  const { items: sysItems } = await pack('droid-system');
  const SUBTYPE = {
    'Locomotion Systems': 'locomotion',
    'Appendages': 'appendage',
    'Processor Systems': 'processor',
    'Droid Accessories (Communications Systems)': 'communications',
    'Droid Accessories (Sensor Systems)': 'sensor',
    'Droid Accessories (Translator Units)': 'translator',
    'Droid Accessories (Shield Generator Systems)': 'shield',
    'Droid Accessories (Droid Stations)': 'station',
    'Droid Accessories (Miscellaneous Systems)': 'accessory',
  };
  const systems = {};
  for (const it of sysItems) {
    if (isHomebrew(it) || !it.name) continue;
    const ch = changeMap(it);
    const id = slug(it.name);
    const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : undefined; };
    systems[id] = {
      id, name: it.name,
      category: SUBTYPE[it.system?.subtype] ?? 'accessory',
      // Costs and weights are often size-scaled formulas rather than plain numbers.
      cost: ch.cost?.[0], weight: ch.weight?.[0],
      availability: ch.availability?.[0],
      appendages: num(ch.appendages?.[0]),
      appendageType: ch.appendageType?.[0],
      baseSpeed: num(String(ch.baseSpeedScalable?.[0] ?? '').replace(/\s*squares?/i, '')),
      unarmedDamage: ch.droidUnarmedDamageScalable?.[0],
      actsAs: ch.actsAsForProficiency?.[0],
      requires: ch.requires,
      description: toParagraphs(it.system?.description).slice(0, 3),
    };
    for (const k of Object.keys(systems[id])) if (systems[id][k] === undefined) delete systems[id][k];
  }

  write('droids.json', {
    // Ability generation differs: no Constitution, so fewer points and a shorter array.
    pointBuy: 21,
    standardArray: [15, 14, 13, 12, 10],
    startingSystemCredits: 1000,
    // Droids cannot take the Jedi class or anything Force-related.
    forbiddenClasses: ['jedi'],
    degrees: [
      { id: '1', name: '1st-Degree Droid', abilities: { int: 2, wis: 2, str: -2 }, roles: 'Medical, scientific', tree: 'first-degree-droid' },
      { id: '2', name: '2nd-Degree Droid', abilities: { int: 2, cha: -2 }, roles: 'Astromech, technical', tree: 'second-degree-droid' },
      { id: '3', name: '3rd-Degree Droid', abilities: { wis: 2, cha: 2, str: -2 }, roles: 'Protocol, service', tree: 'third-degree-droid' },
      { id: '4', name: '4th-Degree Droid', abilities: { dex: 2, int: -2, cha: -2 }, roles: 'Combat, security', tree: 'fourth-degree-droid' },
      { id: '5', name: '5th-Degree Droid', abilities: { str: 4, int: -4, cha: -4 }, roles: 'Labor, utility', tree: 'fifth-degree-droid' },
    ],
    sizes: [
      { id: 'Medium', playable: true, abilities: {}, reflex: 0, stealth: 0, extraHitPoints: 0, damageThreshold: 0, carry: 1, costFactor: 1, locomotion: 'walking' },
      { id: 'Small', playable: true, abilities: { str: -2, dex: 2 }, reflex: 1, stealth: 5, extraHitPoints: 0, damageThreshold: 0, carry: 0.75, costFactor: 2, locomotion: 'tracked' },
      { id: 'Tiny', playable: false, abilities: { str: -4, dex: 4 }, reflex: 2, stealth: 10, extraHitPoints: 0, damageThreshold: 0, carry: 0.5, costFactor: 5, locomotion: 'walking' },
      { id: 'Large', playable: false, abilities: { str: 8, dex: -2 }, reflex: -1, stealth: -5, extraHitPoints: 10, damageThreshold: 5, carry: 2, costFactor: 2, locomotion: 'walking' },
      { id: 'Huge', playable: false, abilities: { str: 16, dex: -4 }, reflex: -2, stealth: -10, extraHitPoints: 20, damageThreshold: 10, carry: 5, costFactor: 5, locomotion: 'walking' },
    ],
    // Base speed depends on locomotion and size; players only ever see Medium and Small.
    speeds: {
      walking: { Medium: 6, Small: 4 },
      wheeled: { Medium: 8, Small: 6 },
      tracked: { Medium: 6, Small: 4 },
      flying: { Medium: 12, Small: 9 },
      hovering: { Medium: 6, Small: 6 },
      stationary: { Medium: 0, Small: 0 },
    },
    systems,
  });
  // Droid is a build, like Near-Human — degree, size and systems rather than a stat block.
  speciesOut['droid'] = {
    id: 'droid', name: 'Droid', book: 'core', page: 186,
    size: 'Medium', speed: 6,
    languages: ['Basic'],
    features: [],
    template: 'droid',
    description: [
      'Droids are built rather than born. Choose a degree and a size, then fit locomotion, '
      + 'appendages, a processor and accessories. Droids have no Constitution score: they gain '
      + 'no bonus hit points from it and apply Strength to Fortitude Defense instead. They are '
      + 'immune to poison, disease, radiation, vacuum, mind-affecting and stunning effects, '
      + 'and cannot be Force-sensitive.',
    ],
  };

  const byCat = {};
  for (const s of Object.values(systems)) byCat[s.category] = (byCat[s.category] ?? 0) + 1;
  console.log(`  droid systems      ${Object.keys(systems).length} (${Object.entries(byCat).map(([k,v])=>k+':'+v).join(', ')})`);
}

// ---------------------------------------------------------------------------
// NEAR-HUMAN — a template rather than a fixed species (Unknown Regions p.17).
// A Near-Human uses the Human chassis and trades either its bonus feat or its bonus
// trained skill for one Near-Human trait, plus up to three cosmetic variations.
// ---------------------------------------------------------------------------
{
  const { items: traitItems } = await pack('traits');
  const nh = traitItems.filter(t => /\(Near-Human\)$/.test(t.name ?? '') && !isHomebrew(t));
  const consumesSlot = t => (t.system?.changes ?? [])
    .some(c => c.key === 'consumes' && /Near Human Traits/i.test(String(c.value)));

  const mechanical = [], cosmetic = [];
  for (const t of nh) {
    const bare = t.name.replace(/\s*\(Near-Human\)$/, '');
    const id = claimId(features, `near-human-${slug(bare)}`, 'trait');
    features[id] = {
      id, name: bare, book: 'regions', page: 17, type: 'trait',
      description: toParagraphs(t.system?.description),
      summaryOnly: true,
    };
    (consumesSlot(t) ? mechanical : cosmetic).push(id);
  }
  mechanical.sort(); cosmetic.sort();

  speciesOut['near-human'] = {
    id: 'near-human', name: 'Near-Human', book: 'regions', page: 17,
    size: 'Medium', speed: 6,
    bonusFeat: true, bonusSkill: true,
    languages: ['Basic'],
    features: [],
    template: 'near-human',
    description: [
      'Near-Humans are descended from Human stock but differ in one notable way, whether '
      + 'cosmetic or functional. They use the Human species traits, trading either the bonus '
      + 'feat or the bonus trained skill for a single Near-Human trait.',
    ],
  };

  write('nearHuman.json', { cosmeticLimit: 3, mechanical, cosmetic });
  console.log(`  near-human traits  ${mechanical.length} mechanical, ${cosmetic.length} cosmetic`);
}

// ---------------------------------------------------------------------------
// EQUIPMENT — weapons, armor and general gear
// ---------------------------------------------------------------------------
const equipment = read('equipment.json');
const GROUPS = {
  'Simple Weapons': 'simple-weapons', 'Simple Melee Weapons': 'simple-weapons',
  'Simple Ranged Weapons': 'simple-weapons', 'Grenades': 'simple-weapons',
  'Mines': 'simple-weapons', 'Explosives': 'simple-weapons',
  'Pistols': 'pistols', 'Rifles': 'rifles',
  'Advanced Melee Weapons': 'advanced-melee-weapons', 'Heavy Weapons': 'heavy-weapons',
  'Lightsabers': 'lightsabers',
  'Exotic Weapons': 'exotic-weapons', 'Exotic Ranged Weapons': 'exotic-weapons',
  'Exotic Melee Weapons': 'exotic-weapons',
};
/** "Light Armor" -> "light"; droid armour is not a wearable category we model. */
const armorTypeOf = sub => {
  const m = String(sub ?? '').match(/^(Light|Medium|Heavy)\s+Armor$/i);
  return m ? m[1].toLowerCase() : undefined;
};
const num = v => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Names the packs attribute to a fan source, so earlier imports of them can be undone. */
const fanMadeNames = new Set();

for (const [packName, category] of [['weapon', 'weapon'], ['armor', 'armor'], ['equipment', 'gear']]) {
  const { items } = await pack(packName);
  // An entry printed in an official book somewhere is official, whatever else lists it.
  for (const it of items) {
    if (!it.name) continue;
    const key = slug(it.name);
    if (isFanMade(it)) fanMadeNames.add(key);
    else if (sourceOf(it)) fanMadeNames.delete(key);
  }
  for (const it of items) {
    if (isHomebrew(it)) { report.skippedHomebrew++; continue; }
    if (isFanMade(it)) { report.skippedFanMade++; report.fanSources.add(sourceOf(it)); continue; }
    const ch = changeMap(it);
    const id = slug(it.name);
    if (!it.name || equipment.items[id]?.custom) continue;

    const base = {
      id, name: it.name, category,
      book: bookOfSource(it),
      weight: num(ch.weight?.[0] ?? it.system?.weight),
      cost: num(ch.cost?.[0] ?? it.system?.cost),
      // The whole description, not a clipped opening line. Several weapons carry no damage
      // attribute at all and explain themselves only in prose — the Neuronic Whip's 1d4
      // slashing, the Amphistaff's three forms, the Carbonite Rifle immobilising rather than
      // wounding — so the text is the only place that answer exists. The hover card clamps
      // it to six lines, so length costs nothing on screen.
      notes: toParagraphs(it.system?.description).join(' ') || undefined,
    };
    if (category === 'weapon') {
      Object.assign(base, {
        group: GROUPS[it.system?.subtype] ?? undefined,
        damage: ch.damage?.[0],
        damageType: ch.damageType?.[0]?.toLowerCase(),
        size: ch.size?.[0] ?? it.system?.size,
        stun: (ch.damageType ?? []).some(d => /stun/i.test(d)) || undefined,
      });
    } else if (category === 'armor') {
      Object.assign(base, {
        armorType: armorTypeOf(it.system?.subtype),
        reflex: num(ch.reflexDefenseBonus?.[0] ?? ch.armorReflexDefenseBonus?.[0]),
        fortitude: num(ch.fortitudeDefenseBonus?.[0] ?? ch.equipmentFortitudeDefenseBonus?.[0]),
        maxDex: num(ch.maximumDexterityBonus?.[0]),
        size: ch.size?.[0],
      });
    }
    for (const k of Object.keys(base)) if (base[k] === undefined || base[k] === '') delete base[k];
    equipment.items[id] = { ...equipment.items[id], ...base };
    report.items++;
  }
}

// ---------------------------------------------------------------------------
// FORCE POWERS, SECRETS, TECHNIQUES AND STARSHIP MANEUVERS
// Same shape as each other, and the app already has slots for all four.
// ---------------------------------------------------------------------------
for (const [packName, type] of [
  ['force-powers', 'force-power'],
  ['force-secrets', 'force-secret'],
  ['force-techniques', 'force-technique'],
  ['starship-maneuvers', 'starship-maneuver'],
]) {
  const { items } = await pack(packName);
  for (const p of items) {
    if (isHomebrew(p) && !(officialNames.size && officialNames.has(slug(p.name)))) {
      report.skippedHomebrew++;
      continue;
    }
    const id = claimId(features, slug(p.name), type);
    const text = toParagraphs(p.system?.description);
    const existing = features[id];
    // Keep the fuller rules text we already have rather than the wiki summary.
    if (existing?.type === type && !existing.summaryOnly) continue;
    features[id] = {
      ...existing,
      id, name: p.name, type,
      book: existing?.book ?? 'unknown',
      description: text.length ? text : (existing?.description ?? ['No description available.']),
      prerequisites: existing?.prerequisites ?? p.system?.prerequisite?.text ?? undefined,
      ...(existing ? {} : { summaryOnly: true }),
    };
    for (const k of Object.keys(features[id])) if (features[id][k] === undefined) delete features[id][k];
    report.powers++;
  }
}

// ---------------------------------------------------------------------------
// Re-resolve content that was hidden for a species we now have. Nikto, Nelvaanian
// and the Twi'lek variants gate real feats that were unreachable before this import.
// ---------------------------------------------------------------------------
const norm = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
const speciesByName = new Map();
for (const sp of Object.values(speciesOut)) {
  speciesByName.set(norm(sp.name), sp.id);
  speciesByName.set(norm(sp.id), sp.id);
}
let unhidden = 0;
for (const f of Object.values(features)) {
  const m = f.hidden && /depends on "([^"]+)", which is not in the rules data/.exec(f.hiddenReason ?? '');
  if (!m) continue;
  const speciesId = speciesByName.get(norm(m[1]));
  if (!speciesId) continue;
  // Restore it as a proper species prerequisite rather than a dangling reference.
  (f.requirements ??= {}).species ??= [];
  if (!f.requirements.species.includes(speciesId)) f.requirements.species.push(speciesId);
  delete f.hidden;
  delete f.hiddenReason;
  unhidden++;
}
if (unhidden) console.log(`  unhidden by new species: ${unhidden}`);

/**
 * Force content an earlier run imported before descriptions were checked.
 *
 * The description alone must not decide this. The pack holds a homebrew *variant* of
 * Cryokinesis whose notice was imported over the real one, and dropping it on that basis
 * would lose a Jedi Academy Training Manual power (p.25). So the Omegadex — an index of
 * official content and nothing else — gets the final say, exactly as it does for gear.
 */
const FORCE_TYPES = new Set(['force-power', 'force-technique', 'force-secret', 'starship-maneuver']);
for (const [id, f] of Object.entries(features)) {
  if (!FORCE_TYPES.has(f.type)) continue;
  if (!/this homebrew content|homebrew content has (not )?been/i.test((f.description ?? []).join(' '))) continue;
  if (officialNames.size && officialNames.has(slug(f.name))) {
    report.keptDespiteNotice.push(`${f.type} ${f.name}`);
    continue;
  }
  delete features[id];
  report.prunedHomebrew.push(`${f.type} ${f.name}`);
}

write('features.json', features);
write('species.json', speciesOut);
// Fan-made gear from an earlier import is dropped; anything the user made is theirs to keep.
for (const [id, item] of Object.entries(equipment.items)) {
  if (fanMadeNames.has(id) && !item.custom) {
    delete equipment.items[id];
    report.prunedFanMade++;
  }
}

write('equipment.json', equipment);

console.log('FOUNDRY IMPORT');
console.log(`  species            ${report.species} playable + ${report.droids} droid models (hidden)`);
console.log(`  new species traits ${report.traits}`);
console.log(`  equipment          ${report.items}`);
console.log(`  force content      ${report.powers}`);
console.log(`  species book-tagged ${report.booked}`);
console.log(`  homebrew skipped   ${report.skippedHomebrew}`);
console.log(`  fan-made skipped   ${report.skippedFanMade} from ${report.fanSources.size} sources`);
console.log(`  fan-made removed   ${report.prunedFanMade} already in the data`);
if (report.prunedHomebrew.length) {
  console.log(`  homebrew removed   ${report.prunedHomebrew.length}: ${report.prunedHomebrew.join(', ')}`);
}
if (report.keptDespiteNotice.length) {
  console.log(`  kept despite a homebrew notice, being in the Omegadex: ${report.keptDespiteNotice.join(', ')}`);
}
for (const src of [...report.fanSources].sort()) console.log(`    ${src}`);
console.log(`  totals: species ${Object.keys(speciesOut).length}, equipment ${Object.keys(equipment.items).length}, features ${Object.keys(features).length}`);
