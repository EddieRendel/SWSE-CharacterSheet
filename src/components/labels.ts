import type { EquipmentItem, FeatCombo, Feature, ItemUpgrade } from '../types';
import type { ReqKind } from '../rules/prereqs';
import { WEAPON_GROUPS, damageLabel, TALENT_TREES, CLASSES, FORCE_TALENT_TREES } from '../data';

/**
 * The parts of the UI that are values rather than components.
 *
 * They live here instead of in `ui.tsx` because a module that exports both components and
 * plain values breaks React Fast Refresh — the whole file remounts on every edit instead of
 * hot-swapping the component.
 */

/**
 * Descriptors carried by Force powers. They matter at the table: dark side powers
 * add to your Dark Side Score, lightsaber forms interact with form talents, and
 * telekinetic / mind-affecting powers are targeted by specific defences.
 */
export const DESCRIPTORS: { key: keyof Feature; label: string; cls: string }[] = [
  { key: 'darkSide', label: 'dark side', cls: 'red' },
  { key: 'lightSide', label: 'light side', cls: 'blue' },
  { key: 'lightsaberForm', label: 'lightsaber form', cls: 'accent' },
  { key: 'telekinetic', label: 'telekinetic', cls: 'purple' },
  { key: 'mindAffecting', label: 'mind-affecting', cls: 'green' },
];

export const descriptorsOf = (feature: Feature) => DESCRIPTORS.filter(d => feature[d.key]);

/**
 * The tag shown against a prerequisite. "Armor Specialist" alone does not tell you whether to
 * look in the feats list or in a talent tree, and the two are obtained in entirely different
 * ways, so each line says which. Colours follow the rest of the sheet: talents purple, feats
 * blue, anything Force-related green, maneuvers accent — `FEATURE_TONES` in Sheet.tsx draws
 * the same kinds the same way. Maneuvers were blue too, which put them and feats in the same
 * colour in the one place both appear at once, the sheet's Feats & powers tab.
 */
export const REQ_TAGS: Record<ReqKind, { label: string; cls: string } | null> = {
  feat: { label: 'feat', cls: 'blue' },
  talent: { label: 'talent', cls: 'purple' },
  trait: { label: 'species trait', cls: '' },
  'force-power': { label: 'Force power', cls: 'green' },
  'force-technique': { label: 'Force technique', cls: 'green' },
  'force-secret': { label: 'Force secret', cls: 'green' },
  'starship-maneuver': { label: 'maneuver', cls: 'accent' },
  ability: { label: 'ability score', cls: 'accent' },
  skill: { label: 'skill', cls: 'accent' },
  species: { label: 'species', cls: '' },
  size: { label: 'size', cls: '' },
  // Hardware, fitted in the Droid panel rather than chosen from a list of features.
  'droid-system': { label: 'droid system', cls: '' },
  'dark-side': { label: 'dark side', cls: 'red' },
  choice: { label: 'any of', cls: '' },
  // Nothing worth adding — "Base attack bonus +9" and "Character level 7" already name
  // themselves, and there is no question of where to go and get either.
  attack: null,
  level: null,
  other: null,
};

/**
 * Where a talent can be picked up: the tree it sits in, and the classes that draw on that
 * tree. A prerequisite naming a talent is otherwise a dead end — the tree is the only route
 * to it, and which class offers the tree decides whether it is open to you at all.
 *
 * `universal` means one of the six trees Force Sensitivity opens to anybody, which is a
 * narrower thing than the tree's own `force` flag: the Force-tradition trees carry that flag
 * too, and those are hidden, so a talent listed in Dathomiri Witch is not a talent this app
 * can offer you. Such a route is reported as unsupported rather than as a way in.
 */
export function talentSources(featureId: string) {
  return Object.values(TALENT_TREES)
    .filter(t => t.features?.some(f => f.id === featureId))
    .map(t => ({
      tree: t.name,
      universal: FORCE_TALENT_TREES.includes(t.id),
      unsupported: !!t.hidden,
      reason: t.hiddenReason,
      classes: Object.values(CLASSES)
        .filter(c => c.trees?.talent?.includes(t.id))
        .map(c => c.name),
    }));
}

/**
 * The item's line from the equipment tables, as label/value pairs. Shared so the hover
 * card and the full dialog can never disagree about a number.
 */
export function itemStatRows(item: EquipmentItem): [string, string][] {
  const stats: [string, string | undefined][] = [
    // Says "varies" or "No damage" rather than dropping the row, so a weapon the compendium
    // gives no dice for does not look like an oversight. The prose below explains which.
    ['Damage', damageLabel(item) && `${damageLabel(item)}${item.stun ? ' (stun setting)' : ''}`],
    // Only present when the stun dice differ from the normal ones.
    ['On stun', item.stunDamage],
    ['Group', item.group ? WEAPON_GROUPS[item.group] ?? item.group : undefined],
    ['Rate of fire', item.rateOfFire],
    ['Area', item.area],
    ['Delay', item.delay],
    ['Thrown', item.thrown ? 'ranged attack, Strength on damage' : undefined],
    ['Reflex', item.reflex ? `+${item.reflex}` : undefined],
    ['Fortitude', item.fortitude ? `+${item.fortitude}` : undefined],
    ['Max Dex', item.maxDex !== undefined ? `+${item.maxDex}` : undefined],
    ['Armor', item.armorType],
    ['Size', item.size],
    ['Cost', item.cost ? `${item.cost.toLocaleString()} cr` : undefined],
    ['Weight', item.weight ? `${item.weight} kg` : undefined],
  ];
  return stats.filter((s): s is [string, string] => Boolean(s[1]));
}

/**
 * What one modification fitted to an item does, as short phrases. Shared by the hover
 * card and the full entry so neither can describe an upgrade the other does not.
 */
export function upgradeEffects(u: ItemUpgrade): string[] {
  const parts: string[] = [];
  const add = (n: number | undefined, label: string) => {
    if (n) parts.push(`${n > 0 ? '+' : ''}${n} ${label}`);
  };
  add(u.attack, 'attack');
  add(u.damage, 'damage');
  if (u.damageDice?.trim()) parts.push(`+${u.damageDice.trim()} damage`);
  add(u.reflexDefense, 'Reflex');
  add(u.fortitudeDefense, 'Fortitude');
  add(u.willDefense, 'Will');
  add(u.weight, 'kg');
  add(u.cost, 'credits');
  return parts;
}

/** The rules sections a panel gives a heading of its own. */
export const SECTION_LABELS = ['Benefit', 'Effect', 'Normal', 'Special'] as const;
export type SectionLabel = typeof SECTION_LABELS[number];

/** One run of a description: the lead paragraphs, or a headed section. */
export interface DescriptionBlock {
  /** Absent for the lead-in prose and for the trailing "Additional … Effects" material. */
  label?: SectionLabel;
  lines: string[];
}

/**
 * A feature's description, read into the blocks a panel draws.
 *
 * The compendium writes a feat as one run of paragraphs with the section names bolded inline
 * — "Prerequisite: …", "Effect: …", "Normal: …" — while the spreadsheets put the same
 * material in fields beside it. The panel drew the first as plain text and the second under
 * headings, so Effect and Normal read as prose while Benefit and Special read as sections,
 * for no reason a player could see. Every one of them is a heading now, and the inline label
 * is stripped from the line it opened, since the heading says it.
 *
 * Only these four are promoted. Descriptions carry about 130 distinct bolded openers, and
 * the rest are a Force power's stat block — "Time:", "Targets:", "Make a Use the Force
 * check.", "DC 25:" — which belong in the run they are read in and would drown the power in
 * headings.
 *
 * Order is the book's, and is kept: paragraphs that follow a labelled one without a label of
 * their own continue it, which is how Metamorph's two size clauses stay under its Effect. An
 * "Additional … Effects" heading opens a block of its own instead of being swallowed by the
 * section above, so Dodge's Starships of the Galaxy rule does not end up inside its Effect.
 *
 * Two things are cut on the way. The prerequisite paragraph, because the hint says the same
 * thing and the picker checks it besides — but only where the hint covers it, since for nine
 * feats the hint was the spreadsheet's shorthand until supplement.json rewrote them, and a
 * re-import can introduce another. And the "Combined Feat (…)" prose, for the reason below.
 *
 * The compendium states each Combined Feat inside the text of both feats it belongs to. The
 * card below the text says the same sentence *and* whether you actually hold the other half,
 * so printing the prose too was the same rule twice on one panel.
 *
 * It only ever removes what the card puts back: `combos` is what the panel is about to
 * render, and an empty list returns the description untouched. That matters for Force Disarm,
 * which quotes the Force Training + Improved Disarm wording without being a half of it and so
 * has no card — cut there, the sentence would be gone from the app entirely.
 *
 * The compendium's own markup is inconsistent — the clause is split across two <strong> tags
 * on Running Attack, and shares a line with the heading above it on Weapon Focus — so the cut
 * runs from wherever "Combined Feat" starts to the end of the line rather than matching a
 * shape. A heading left with nothing under it goes as well: "Additional Charging Fire Effects
 * Reference Book: …" introduced only the line just removed. One that still introduces
 * something stays, which is why Dodge keeps its Starships of the Galaxy paragraph.
 */
export function readDescription(feature: Feature, combos: FeatCombo[]): DescriptionBlock[] {
  const plain = (line: string) => line.replace(/<[^>]*>/g, '').trim();
  const isHeading = (line: string) => /^Additional\b/i.test(plain(line));
  const PREREQ = /^\s*<strong>\s*Prerequisites?:?\s*<\/strong>/i;

  // Pass one: cut what is shown elsewhere. A line that was nothing else is dropped outright.
  const cut = feature.description.map(line => {
    // One word is enough to judge here, unlike a rules section: both sides are the same
    // field, and five feats state nothing but a species — "Prerequisite: Ithorian".
    if (PREREQ.test(line)
      && wordCoverage([line.replace(PREREQ, '')], [feature.prerequisites ?? ''], 1) >= 0.8) {
      return null;
    }
    const trimmed = combos.length
      ? line.replace(/(?:<strong>\s*)?Combined Feat\b[\s\S]*$/i, '')
      : line;
    return plain(trimmed) ? trimmed : null;
  });

  // Pass two: drop a heading whose whole run went with it.
  const kept = cut
    .filter((line, i) => {
      if (line === null || !isHeading(line)) return line !== null;
      for (let j = i + 1; j < cut.length; j++) {
        if (cut[j] === null) continue;
        // The next heading starts its own run, so this one introduced nothing.
        return !isHeading(cut[j]!);
      }
      return false;
    })
    .map(line => line!);

  // Pass three: gather the runs. A known label opens a section, an "Additional …" heading
  // ends one without opening another, and anything else continues whatever is open.
  const blocks: DescriptionBlock[] = [];
  let open: DescriptionBlock | null = null;
  for (const line of kept) {
    const label = SECTION_LABELS.find(l =>
      new RegExp(`^\\s*<strong>\\s*${l}s?:?\\s*</strong>`, 'i').test(line));
    if (label) {
      open = { label, lines: [] };
      blocks.push(open);
      const body = line.replace(/^\s*<strong>[^<]*<\/strong>\s*/i, '');
      if (plain(body)) open.lines.push(body);
      continue;
    }
    if (isHeading(line)) open = null;
    if (!open) { open = { lines: [] }; blocks.push(open); }
    open.lines.push(line);
  }

  // The spreadsheets' fields join the blocks their label already opened rather than adding a
  // second heading of the same name — Implant Training is the one feat whose Normal field
  // says more than its description, and it reads as one section, not two.
  const FIELDS: Partial<Record<SectionLabel, string[] | undefined>> = {
    // No `Effect`: the compendium writes one but the spreadsheets have no field for it.
    Benefit: feature.benefit, Normal: feature.normal, Special: feature.special,
  };
  for (const label of SECTION_LABELS) {
    const field = FIELDS[label];
    if (!field?.length || restatesDescription(feature.description, field)) continue;
    const existing = blocks.find(b => b.label === label);
    if (existing) existing.lines.push(...field);
    else blocks.push({ label, lines: field });
  }

  return blocks.filter(b => b.lines.length);
}

/**
 * Whether a Benefit / Normal / Special section only restates what the description already
 * says, and so should not be printed under a heading of its own a second time.
 *
 * Two importers describe the same feat. `import:foundry-text` writes the description, which
 * carries the book's own run of labelled paragraphs — "Prerequisite: …", "Effect: …",
 * "Normal: …" — and `import:excel` writes the structured fields beside it. Where the sheet
 * and the compendium both had a Normal line, the panel printed it inline and then again as a
 * NORMAL section. That is 57 of the 62 feats that have one, Melee Defense among them.
 *
 * The comparison is on distinct words rather than on the text, because the two copies drift:
 * "with which they are not proficient" against "with which she is not proficient", "+2 bonus"
 * against "+2 rage bonus", "penalty to attack rolls" against "penalty on attack rolls". None
 * of that is a different rule. The threshold sits well clear of both sides of the real gap —
 * every genuine restatement measures 0.85 or above, and the closest thing that is *not* one
 * is Force Stun's Special at 0.76, which shares the power's vocabulary and nothing else.
 *
 * Failing this test is the safe outcome: both copies print, which is untidy but loses
 * nothing. Implant Training is the one that fails it, and rightly — its field explains that
 * the penalty is "due to the Implant's interference with normal brain functions", which the
 * description does not say anywhere.
 */
export function restatesDescription(description: string[], section?: string[]): boolean {
  if (!section?.length) return false;
  // Too short to judge: a handful of common words can all turn up in a long description by
  // chance, and suppressing on that would hide a real rule.
  return wordCoverage(section, description, 6) >= 0.85;
}

/**
 * How much of `part` already appears in `whole`, as a fraction of `part`'s distinct words.
 * Returns 0 when `part` has fewer than `minWords` of them, which is the "do not judge this"
 * answer — every caller treats a low score as "keep both copies".
 *
 * "Feat" is ignored throughout. The compendium writes "Point-Blank Shot Feat" where the
 * spreadsheet writes "Point Blank Shot", and that one word is never the difference between
 * two rules.
 */
export function wordCoverage(part: string[], whole: string[], minWords: number): number {
  const words = (lines: string[]) =>
    new Set((lines.join(' ').replace(/<[^>]*>/g, ' ').toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .filter(w => w !== 'feat' && w !== 'feats'));

  const wanted = words(part);
  if (wanted.size < minWords) return 0;
  const have = words(whole);
  let found = 0;
  for (const word of wanted) if (have.has(word)) found++;
  return found / wanted.size;
}

/**
 * A feat's prerequisites line as plain text, for the hint that is now its only appearance.
 *
 * Fourteen of them arrive with markup the field is not supposed to carry — "<strong>Must
 * possess an Implant</strong>" — and the hint prints its content rather than parsing it, so
 * the tags were showing literally. Stripping rather than rendering them keeps every hint in
 * one voice; a bold clause inside small faint text reads as emphasis nobody meant.
 *
 * The second replace is for Visions, whose line ends "<em>farseeing</em." — a closing tag
 * with a full stop where its bracket should be, which the first pattern cannot see.
 */
export const prerequisiteText = (prerequisites: string): string =>
  prerequisites
    .replace(/<[^>]*>/g, '')
    .replace(/<\/?[a-z][^<>]*$/i, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
