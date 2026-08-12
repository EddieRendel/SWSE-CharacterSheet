# Saga Forge

A character builder for **Star Wars Roleplaying Game: Saga Edition** — species, classes,
multiclassing, feats, talents, Force powers, skills, equipment and a printable sheet, with
prerequisites checked as you build.

Runs entirely in the browser. No account, no server, no network calls.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run test:rules # verify the rules engine
npm run test:e2e   # drive the app in a real browser (needs `npm run dev` running)
npm run import:excel # re-import the feat/talent spreadsheets
npm run import:foundry <path-to-foundry-system>  # re-import species/equipment/powers
```

> **Windows PowerShell:** this machine's execution policy is `Restricted`, which blocks
> `npm.ps1` with *"running scripts is disabled on this system"*. Use **`npm.cmd`** instead —
> `npm.cmd install`, `npm.cmd run dev`, and so on. It skips the PowerShell wrapper entirely
> and needs no configuration change. (Git Bash and cmd.exe are unaffected and can use plain `npm`.)

## What it does

- **Species** — 132 sourcebook species with ability modifiers, traits, bonus feat/skill and
  languages applied automatically, plus two templates you build yourself: **Near-Human** and
  **Droid**.
- **Classes and multiclassing** — 21 base and prestige classes. Base attack bonus is computed per
  class and summed; class defense bonuses correctly take the single best value rather than stacking.
  Prestige class entry requirements are checked and shown.
- **Feats and talents** — every slot your levels grant, laid out by level, with the ones you still
  owe flagged. The picker shows full rules text, marks options you can't take, and explains exactly
  which prerequisite failed.
- **Specializations** — feats that make you choose something (Weapon Focus, Skill Focus, Skill
  Training, Triple Crit…) are locked only when *no* choice would qualify, never merely because you
  haven't picked one yet. The dropdown lists just the options that actually meet the prerequisites
  and says how many were filtered out.
- **Force talents** — any character with the **Force Sensitivity** feat may take a talent from the
  six universal Force trees (Alter, Control, Sense, Dark Side, Light Side, Guardian Spirit) in place
  of a class talent, on *any* talent slot. The talent picker lists everything by tree, split into
  **Class talent trees** and **Force talent trees**.
- **Feats that grant choices** — **Force Training** and **Adaptable Talent** create their own slots
  rather than sitting inert in a list. Adaptable Talent banks one talent drawn from *every* class
  you have levels in (a normal talent slot stays scoped to the class that granted it), with
  prerequisites still enforced.
- **Force powers** — taking **Force Training** adds 1 + your Wisdom modifier powers (minimum 1) to
  your suite, as its own set of slots under the feat that granted them. Take the feat again for
  another batch. The same power may be selected more than once, which the feat explicitly allows.
  Powers carry their descriptors — **dark side**, **light side**, **lightsaber form**, **telekinetic**
  and **mind-affecting** — in the picker, on the slot list and on the sheet, and the descriptors
  are searchable.
- **Skills** — trained-skill budget from class + Intelligence + species, class-skill validation,
  Skill Focus, size modifiers and armor penalties.
- **Carrying capacity is enforced, not just displayed.** Your limits are the square of your
  Strength score scaled by size: heavy load at (Str × ½)², straining at Str² × ½, maximum at
  Str². Cross the first and speed drops to three quarters with −10 on Acrobatics, Climb,
  Endurance, Initiative, Jump, Stealth and Swim; cross the second and you move one square a
  turn; cross the third and you do not move. The Speed tile and the equipment total both say
  which band you are in, and hovering either shows all three thresholds.
- **Languages.** Your species' come free and an Intelligence bonus buys one more each, from a
  list of 57. Unspent ones show up in the level-up flow alongside untrained skills, since both
  come from the same modifier.
- **One page for levelling up.** Levels, feats and talents, abilities and skills used to be
  four tabs you had to remember to visit. They are one **Edit character** page with an
  **Add level** button on top. Gaining a level works out what it owes you — unfilled feat,
  talent and power slots, unassigned ability increases, and any skill training a raised
  Intelligence just handed you — and lifts exactly those sections to the top, outlined,
  with a "still to do" strip that jumps to each. Once nothing is outstanding the page
  settles back into **levels → feats → abilities → skills**, and the tab's badge clears.
- **One tabbed box on the sheet** holds **Actions**, **Feats & powers** and **Equipment**, so the
  three things you reach for in play share a single place rather than three stacked panels.
- **Hover cards explain everything.** Every feat, talent, Force power, weapon and derived
  number on the sheet carries one: rules text and Benefit/Special for features (prerequisites
  are left out — you have already met them), the equipment-table line for gear, and a
  row-by-row sum for attack rolls, damage, skills, defenses and hit points. They render into
  a portal so a panel never clips them, and they close on scroll, resize or Escape.
  Placement tries below, above, right, then left, taking the first side the whole card
  fits on — so a tall card hovered from the middle of the page moves beside the cursor
  instead of running off the bottom edge.
- **Force Points** sit at the top of the Actions tab as a per-level pool — pips, a running total,
  Spend and ↺, and the die they currently add to a roll (1d6, 2d6 from 8th level, 3d6 from 15th).
  Below the attacks, everything the character has that a Force Point can be spent on is listed,
  each showing the exact sentence that describes what it buys.
- **Equipment** — weapons, armor and gear with custom items, managed from that tab. Ticking a
  weapon as **worn** is what puts it in hand and adds it to the attack list. Credits are editable
  there too, by typing or with −100 / +100 buttons.
- **Attacks** — on the character sheet, every carried weapon gets an attack and damage line with
  the full breakdown, plus toggles for the situational feats you actually have. Applied
  automatically: proficiency penalties, Weapon Focus and Greater Weapon Focus, Weapon
  Specialization and its greater form, Melee Smash, and the half-level damage bonus every
  character adds. Toggled per roll: **Power Attack** (with a spinner, capped at your base attack
  bonus), two-handed grip (doubling Strength to damage), Point Blank Shot, aiming for Careful
  Shot and Deadeye, Rapid Shot, Burst Fire, Sneak Attack, and full attack for Double/Triple
  Attack. Toggles only appear for feats the character has, and Rapid Shot, Burst Fire and
  Deadeye correctly refuse to stack — the largest die bonus wins and says so.
  Talents, species traits and Force powers are covered too: Wookiee **Rage**, **Dark Rage** and
  **Battle Strike** (both stepping through their Use the Force tiers), Skirmisher, Powerful Charge,
  Flurry, Cunning Attack, Sniper Shot, Deadly Sniper, Cornered, Justice Seeker and Droid Hunter.
  Adding another is one entry in `SITUATIONAL` in `src/rules/attacks.ts`.
  Totals stay uncluttered — hover any number to see its working.
- **Unarmed strike is always listed**, stepping up with Martial Arts I/II/III (1d4 → 1d6 → 1d8 → 1d10).
- **Damaging Force powers** get their own section, since they are resolved with a Use the Force
  check against a defence rather than an attack roll — Force Lightning shows *+12 vs Reflex
  Defense, 8d6 force*. Powers that deal no damage are left out.
- **What shows up is a checkbox.** A weapon appears once ticked as worn. Unarmed strike and
  damaging Force powers are always there, since they need no equipment.
- **Force powers are metered like spell slots.** Each copy of a power in your suite is one use
  per encounter, so taking Force Lightning three times through Force Training gives three uses.
  Pips show what is left, **Use** spends one, **↺** takes one back, and a power greys out and is
  marked *spent* when exhausted. **End encounter** restores everything. Spent uses are saved with
  the character.
- **Live derived stats** — hit points, all three defenses, damage threshold, second wind,
  Force Points, speed and the condition track. Hover any defense tile for its working
  (`10 base · 4 armor (replaces heroic level) · +1 class · +3 Dex`) rather than reading it
  from a separate box.
- **Portraits** — click the portrait on the Character tab or the sheet to upload an image, pick
  one of the 21 class images, or remove the current one. It shows in the topbar, the character
  list, the Identity panel and the printed sheet, falling back to the character's initial when
  none is set. Uploads are cropped square and scaled to 256px JPEG before being stored, because
  characters live in localStorage — a 3 MB photo becomes about 2 KB.
- **Icons** — class, feat, talent and Force power artwork, shown in the pickers, the rules
  display and the level list. Only icons that actually exist are rendered, so nothing ever
  shows as a broken image.
- **Sourcebook filtering** — each character has a **Sourcebooks** panel listing all 14 books, with
  *Core only* and *All books* shortcuts. Restricting a character limits what every picker offers —
  feats, talents, Force powers and classes alike. Narrowing never removes anything already chosen;
  it only limits what is offered from then on. Species carry no book tag in the data, so they stay
  available regardless.
- **Characters** — saved in browser local storage, with JSON export/import and duplication.

## Where the data came from

Three sources, merged:

1. **Structure** — the *SWSE Feats Summary* and *SWSE Talents Summary* spreadsheets. These decide
   which feats and talents exist, which talent tree and class each belongs to, and which book and
   page it comes from. Re-run the import with `npm run import:excel` after editing them.
2. **Rules text** — the public client-side data bundle of
   [sagaworkshop.net](https://sagaworkshop.net), which carries full rules wording for ~670 entries.
   Vendored as `tools-source-bundle.mjs`, so `node tools-normalize-data.mjs` reproduces
   `src/data/*.json` from scratch; run the Excel import after it.

Class sourcebooks come from the *Omegadex* index — the only sheet that records them. All 21 classes
are tagged, which is what makes per-character book filtering work for classes as well as content.

Where both have an entry the full text wins and only the structure is updated, because the
spreadsheets carry only terse summaries. Entries that exist *only* in the spreadsheets are marked
**summary only** in the UI so you know to check the book for the complete wording.

3. **Species, equipment and Force powers** — the compendia of the
   [FoundryVTT Saga Edition system](https://github.com/kypvalanx/Foundry-VTT-StarWars-SagaEdition).
   Clone it and run `npm run import:foundry <path>`. Its packs are Foundry v11+ LevelDB
   directories, read with `classic-level`.

Current totals: **394 feats, 1171 talents, 192 talent trees, 132 species, 765 equipment items,
88 Force powers, 57 Force techniques, 15 Force secrets, 31 starship maneuvers**, 21 classes and
25 skills across 15 sourcebooks.

All 132 species carry a book and page. Ten come from the online **Web Enhancements** rather than a
printed book, which is why the 2010 Omegadex does not index them: Nazren, Skakoan, Pau'an,
Polis Massan, Amani, O'reenian, Stereb, Tusken Raider, Arcona and Phindian.

Where the two sources spell a species differently the canonical singular is kept —
Taung not Taug, Tof not Toff, Lurmen not Lurman, Neimoidian not Neimodian, Nyriaanan not
Nyriaan Native, Gamorrean not Gamorean. *Near-Human* is handled separately, as a template rather than a fixed species — see below.

### Droids

Droids are a build rather than a stat block, and the rules differ enough to touch the whole engine:

- **No Constitution score.** No bonus hit points from it, and **Strength** applies to Fortitude
  Defense instead. Second wind uses Strength too, and anything with a Constitution prerequisite
  is permanently out of reach.
- **Degree** (1st–5th) sets ability modifiers and opens that degree's talent tree on every talent slot.
- **Size** is chosen, not fixed. Player droids are Medium or Small; Small grants −2 Str / +2 Dex,
  +1 Reflex, +5 Stealth and a ×2 cost factor. Larger chassis exist in the data for GM use.
- **Speed comes from the locomotion system** crossed with size — Walking Medium 6, Wheeled Medium 8,
  Flying Medium 12, Walking Small 4.
- **No Force.** Force Sensitivity, Force Training, powers, techniques and secrets are all refused,
  Force Points are zero, and the Jedi class is not offered.
- **100 droid systems** across locomotion, appendages, processors, sensors, communications,
  translators, shields, stations and accessories. Costs are often size-scaled formulas
  (`10 × Cost Factor`), which resolve against the chassis where they can and show the formula where
  they cannot.

Ability generation differs as well: 21 points rather than 25, and a five-score standard array of
15/14/13/12/10.

### Near-Human

Near-Human (Unknown Regions p.17) is a build, not a stat block: it uses the Human chassis and
trades **either** the bonus feat **or** the bonus trained skill for a single Near-Human trait,
plus up to three purely cosmetic variations.

Choosing it opens a panel offering the **24 mechanical traits** and **11 cosmetic variations**,
which the importer separates using the `consumes: Near Human Traits` flag in the Foundry data.

### Prerequisites the sheet can actually check

Prerequisites arrive as prose — "BAB +9, Atk Combo (Melee) & (Ranged)" — and whatever the
parser cannot read is shown to the player as *"not enforced automatically"*. That was 177
phrases across 152 features. It is now **90 across 85**, from:

- **the sheets' shorthand**: `Atk` → Attack, `WF` → Weapon Focus, `SF` → Skill Focus,
  `MA` → Martial Arts, `DWM`/`Dual Weapon` → Dual Weapon Mastery
- **splitting that respects brackets**, so "Atk Combo (Melee) & (Ranged)" is two requirements
  and not a stray "(Ranged)"
- **fragments that inherit the name before them** — "(Ranged)", a bare "II", and ranges like
  "MA I-II"
- **alternatives**: "Double Attack or Dual Weapon Mastery I" becomes a new `anyOf` requirement
  that the checker satisfies with any one option and displays as a single line
- bare skill names, `<skill> skill`, "Dark Side score 1+", `proficient <group>`, and
  specializations that carry their own bracket like "SF Knowledge (social sciences)"

What is left is mostly content the app does not have — Teras Kasi Basics, Recon Team Leader,
"Familiar foe special quality" — or things no tool can check, like "proficient with armor
worn". Those still display as unenforced, which is the honest answer.

Under-restricting is safe and mis-restricting is not, so nothing is guessed at: a phrase that
does not match a known feature, skill, species or weapon group stays unparsed.

### Attributing gear: `npm run attribute:equipment <foundry-path>`

The Omegadex is a fan-compiled **index** of official Saga Edition content — a name, a book
code and a page, for books Wizards published and nothing else. So a match is evidence an
item is official, and a page number with it. Its four equipment tables hold 458 entries
across several columns per row.

Matching had to cope with the index and the pack spelling things differently: **Vibro-Ax**
against Vibro-Axe, **Lt** against Light, plurals, and inversions like "Comlink, Earbud"
against "Earbud Comlink". Words are stemmed and compared as a set, which settles those and
"Double-Bladed Lightsaber" against "Lightsaber, Double-Blade". Where our name sits *inside*
a longer one — "Light Repeating Blaster" inside "Blaster Rifle, Lt Repeating", "Vonduun
Crabshell" inside "Vonduun Crabshell Armor" — the match is only taken when exactly one
index entry contains all our words, and it may fill an empty book but never overrule one we
already have: "Assault Armor" sits inside "Venom Assault Armor" and might not be the same
item at all.

The result: **94 items newly attributed, 252 confirmed, 10 matched through a spelling
difference**, and 8 where the index's first printing replaced the pack's reprint — Comlink
is Core p.134, not Scum and Villainy. Equipment now carries a page as well as a book.

It also settled a question the pack could not. **A third homebrew signal** turned up here:
entries with no Homebrew category and no source string whose *description* simply says so —
The Darksaber, Bo-Rifle, an Amban Phase-Pulse Blaster. The index arbitrates: flagged and
unindexed means gone (**74 removed**), flagged but indexed means official, which is what
kept Utility Belt, Power Pack and Spice. Six sourcebook blurbs that had been scraped in as
gear went too, along with wiki pages like "Climatic Hazards" and "Weapons by size".

The same signal caught **four homebrew starship maneuvers** whose entire rules text was the
homebrew notice, and two sourcebook feats — Long Haft Strike and Autofire Sweep — that had
a "Homebrew … Data" section appended by the wiki. Those are now cut at the heading, keeping
the official rules.

**535 items, 493 naming their book.** The 42 that do not are droid and vehicle components —
armor plating, shells, shield generators by rating, hardened systems — which the Omegadex's
equipment tables do not cover.

### Proving nothing is homebrew: `npm run audit:provenance <path>`

The Foundry pack marks fan content **two different ways**, and each catches what the other
misses:

- a `Homebrew Content` or `<author> Creations` **category** — used by the species, talent,
  feat and Force power packs, and what the species import has always filtered on;
- a **source string** naming a fan publication — used by the equipment packs, which carry
  no Homebrew category at all.

Auditing on the category alone reported every dataset clean. The source strings told a
different story: **150 of 765 equipment entries were fan-made** and had been sitting there
looking perfectly official — the whole "Clone Wars Saga Edition Fan Sourcebook" series
(Stormtrooper Armor, the DC-15 rifles, Katarn-class armor…), plus *DMF's Big List of SWSE
NPCs*, the fan *New Jedi Order Campaign Guide*, the *Dathomir Field Guide*, and the
*Corporate Sector Sourcebook*, which is a 1987 d6 book somebody converted. They are gone,
and `import:foundry` now rejects them on the way in and removes any that an earlier run
left behind. Equipment also carries the book it was printed in wherever the pack knew it,
which is 398 of the remaining 614.

**A shared name is not evidence.** Our Burning Assault, Improved Trajectory and Jet Pack
Withdraw come from the Knights of the Old Republic Campaign Guide p.30; the pack holds a
homebrew "Jumptrooper" tree with talents of exactly those names. The audit only reports a
name when our *text* matches the homebrew entry's, and `import:foundry-text` now skips all
601 homebrew entries outright so it can never rewrite a sourcebook talent as somebody's
homebrew — which it came within a margin threshold of doing.

Official means anything Wizards of the Coast published for Saga Edition, plus its free web
enhancements and the Dawn of Defiance adventures.

Every dataset — species, classes, feats, talents, Force powers, techniques, secrets,
starship maneuvers, species traits, equipment, languages, droid systems and talent trees —
now passes. `test:rules` carries the checks that work without the clone, so a regression
cannot slip through on a machine that does not have it.

### Trees shared between classes: `npm run wire:trees <path>`

The talent spreadsheet names **one** class per tree — the class the tree is printed under —
so a tree several classes can draw on only ever reached one of them. A Sith Apprentice
could not take Lightsaber Combat, Duelist or Armor Specialist, all of which its class
entry lists, because those trees are printed under Jedi, Jedi Knight and Soldier.

The Foundry pack has the missing half: every talent carries `possibleProviders`, the
classes whose tree lists include the tree it belongs to. Aggregating that per tree gives
class → trees. **22 links were missing across 11 classes**, every one of them a prestige
class:

| | gains |
|---|---|
| Sith Apprentice, Imperial Knight | Armor Specialist, Duelist, Lightsaber Combat |
| Jedi Knight | Armor Specialist, Lightsaber Combat |
| Officer | Commando, Leadership |
| Bounty Hunter | Awareness, Misfortune |
| Gunslinger | Awareness, Fortune |
| Gladiator | Armor Specialist, Awareness |
| Elite Trooper | Camouflage, Commando |
| Master Privateer | Infamy, Spacer |
| Crime Lord | Influence |
| Ace Pilot | Spacer |

The tag sits on each talent rather than on the tree, so a class earns a tree only when
**every** talent in it agrees. Across the pack 296 of 298 tree/class pairs are unanimous.
The two that are not are both Squad Leader — which Soldier and Elite Trooper print with
*different* talents, so it is two trees in our data and each class already points at its
own. The rule caught exactly the case that needed catching.

The pass is additive: a link the spreadsheet already has is never removed, and a tree
claimed for a class we do not have, or that we have no talents for, is skipped and
reported rather than invented. `test:rules` then checks that no class gained a tree it
should not have, that every tree a class lists exists and has talents in it, and that
split trees stay split.

### One entry per thing: `npm run dedupe`

Two books sometimes print **different** talents under the same name. The Sith talent tree
has a "Sith Alchemy" that makes a Sith Talisman (KotOR p.41); the Sith Alchemy tree has a
"Sith Alchemy" that makes amulets, armor, talismans and weapons (JATM p.21). Keyed by name
alone the second silently overwrote the first, and the survivor was then listed in *both*
trees — one entry, appearing twice, reading the same in each.

`import:excel` now forks these. Forking is a judgement, so it takes **two independent
signals agreeing**: the summaries must share under 40% of their wording *and* neither may
be a condensed version of the other. Both matter — Echani Training's KotOR summary is
word-for-word the opening of its Galaxy at War one, and Notorious is the same talent
summarised twice within the Core Rulebook. Of 25 names printed more than once, **18 fork
and 7 stay single**, and the run prints both lists with the percentage behind each call.

The plain id goes to whichever variant already owns it — decided by matching the text
that is on it today against each variant's summary — so no saved character silently
changes which talent it selected. That also corrected 16 entries whose book and page had
been overwritten by the other variant's: Armor Mastery is Core p.51, not Legacy p.45.

`tools-dedupe-features.mjs` then collapses entries that really are the same thing arriving
twice from different sources — `elder's-knowledge` beside `elders-knowledge`,
`ter-s-k-si-training` beside `teras-kasi-training`. Only exact duplicates are touched: same
name, same type, and identical rules text once markup and punctuation are stripped. The id
that survives is the one the rest of the data already points at. **11 were collapsed.**

Two guards keep this honest. `import:foundry-text` skips any name held by more than one
entry, because the pack has a single entry for that name and giving both our variants the
same text would silently merge them back together. And `test:rules` fails if any two
entries share a name, type and text, or if a talent tree ever offers the same thing twice.

### Choices a feature asks you to make: `npm run wire:choices`

Some features ask a question when you take them. Stolen Form reads *"Choose one Talent from
the Lightsaber Forms Talent Tree"*, and until that choice is recorded your sheet says only
"Stolen Form" — it never says which form you stole. The app already had the machinery for
this (`specType` drives a picker, and the pick shows in the name), but only the two dozen
entries that arrived with it from the source bundle used it.

`tools-wire-choices.mjs` wires up the rest — **28 features**, covering:

- **a talent from a named tree** — Stolen Form, Share Talent, Coordinated Leadership,
  Squadron Maneuvers. Where the rules say "that you already possess", only talents the
  character actually holds are offered.
- **a skill**, honouring "one *Trained* Skill" where the rules say so
- **a Force power, technique or secret** you already know
- **a weapon group** you are proficient with
- **a list that exists only in the prose** — the five droid degrees, the four Nikto
  subspecies, Superior Tech's equipment types, a Near-Human's climate

Options carry their own prerequisites where the rules say they do: Stolen Form's *"You must
meet all the prerequisites as normal for the chosen Talent"* means a Jedi 7 / Sith Apprentice
with no lightsaber talents is offered Ataru, Djem So and Niman, and told that 9 of the 12
forms are hidden because their prerequisites are not met.

The classification is **curated, not inferred**, because one phrasing covers two very
different things: "choose one Trained Skill" is part of your character, while "choose one
enemy within line of sight" happens on your turn and must never become a build-time picker.
Every feature whose text says *choose* is listed as either a choice or explicitly not one —
36 are in the second list — and anything new that appears in neither **fails the run** rather
than being guessed at. That is how Telekinetic Prodigy was caught: it grants an extra Force
power, which wants a slot rather than a label, and is noted as such.

### Rules text: `npm run import:foundry-text <path>`

The Talents and Feats summary spreadsheets are exactly that. "Corporate Clout" arrived as
*"1/encounter Persuasion v. Will w/in LOS target cannot attack you"* — a reminder for someone
who already knows the talent, not a rule. `tools-import-foundry-text.mjs` fills those in from
the same Foundry pack, taking **only** the prose: talent trees, prerequisites, bonus-feat
lists, books and page numbers all stay as the spreadsheets and bundle set them.

It rewrote **1,246 entries** across every category the pack covers:

| | rewritten | of which summaries | absent from pack | already as good |
|---|---|---|---|---|
| Talents | 903 | 891 | 43 | 225 |
| Feats | 129 | 14 | 28 | 237 |
| Force powers | 62 | 51 | 0 | 26 |
| Species traits | 129 | 129 | 146 | 81 |
| Starship maneuvers | 22 | 22 | 0 | 9 |
| Force techniques | 1 | 0 | 0 | 56 |
| Force secrets | 0 | 0 | 0 | 15 |

Text is only replaced when the replacement is meaningfully longer — 40 characters for a
summary, 120 for an entry that already reads as rules, so the corpus does not churn over a
stray clause and nothing is ever traded down for a shorter paraphrase.

Three things the pack gets wrong, which the importer handles:

- **Species articles masquerading as traits.** The traits pack holds an entry per species as
  well as per trait, and the per-species ones are the wiki's encyclopedia article — three
  paragraphs on Cathar city-trees and the Mandalorian Wars, without a single rule. A trait
  sharing its name with a species is skipped; 66 were.
- **Entries truncated at a dangling colon.** Thirteen talents end on "…once per encounter as a
  Standard Action:" with the list of options missing. Longer than the summary, but *poorer* —
  so the summary is kept underneath rather than traded away.
- **Names matched across two datasets can collide.** Every rewrite that keeps almost none of
  the old wording is printed for review. All 19 flagged turned out to be correct matches whose
  summaries were pure abbreviation ("each 1/enc after you Atk: if dam target -5 Ref").

The pack stores scraped wiki HTML, which needs real cleaning rather than a tag strip:

- The wiki omits spaces around its links — `spend a<a>Force Point</a>to drain` — so tags are
  padded and the resulting stray spaces before punctuation are tidied up afterwards.
- Only `<strong>` and `<em>` are allowed through, as an allowlist. Rules text is rendered with
  `dangerouslySetInnerHTML`, so third-party markup does not get a vote.
- Disambiguation hatnotes ("This article details the Force Storm found in…") are dropped, and
  DC tables are flattened into readable lines — `**DC 20:** You create a Force Storm…` — rather
  than a column of loose fragments.
- `Reference Book:` and `See also:` lines are wiki navigation. The earlier Foundry import had
  left 306 of them sitting at the top of powers and techniques; they are now gone everywhere.

Fuller text also feeds the attack engine, which reads damage and target defence straight out of
it: seven more Force powers now parse as damaging, Mind Shard and Memory Walk gained the defence
they are rolled against, and Ionize reads 4d6 rather than 2d6 because its DC table had previously
been truncated before the first tier.
The trait is granted like any species trait, and whichever Human bonus you spend genuinely
disappears — give up the feat and the species bonus-feat slot goes; give up the skill and your
trained-skill allowance drops by one.

### Names are not unique across categories

Saga Edition reuses names — **Surge** is a Scout talent *and* a Force power, **Recall** a talent
*and* a feat. Importing by slug alone made one silently replace the other, leaving seven talent
trees pointing at feats. Both importers now namespace a colliding id (`surge-force-power`), and a
test asserts every talent tree contains only talents.

### Keeping homebrew out

The Foundry species pack is 391 entries, but **245 are tagged `Homebrew Content` or
`<author> Creations`** and are skipped outright — only sourcebook content is imported. That leaves
146: **132 playable species and 14 droid models**, the latter hidden because droid rules are not
implemented.

That filtering was cross-checked against the Omegadex species index, an independent list of 134
species with book and page. 116 of the 146 match directly; the rest are spelling variants
(Taung/Taug, Tof/Toff, Neimoidian/Neimodian) or species the 2010 index predates. Species book tags
come from the Omegadex rather than Foundry, because Foundry's "Reference Book" line cites
*reprints* — Wookiee points at the Rebellion Era Campaign Guide, not the Core Rulebook.

Importing species also resolved content that had been stranded: **Nikto** and **Nelvaanian** now
exist, so the feats gated on them are selectable instead of hidden.

### Content that is hidden rather than deleted

Some content depends on things this app doesn't model — Force traditions, droid characters, and
species outside the supported 22. It is imported and kept, but flagged `hidden` so it never appears
in a picker. Add the missing class or species and it becomes selectable with no re-import. The
compendium has an **Unsupported** toggle to browse it, and each entry says why it is hidden.

| Hidden because | Count |
| --- | --- |
| Force traditions are not implemented | 120 |
| droid characters are not implemented | 35 |
| requires the Nikto or Nelvaanian species | 2 |
| depends on a droid/cyborg trait not in the data | 9 |

Eleven placeholder entries the original data referenced but never defined — `basic-processor`,
`claw`, `hovering`, `nikto`, `cyborg-hybrid` and similar — were **removed**. They were never real
feats. Anything that required one is hidden rather than silently unsatisfiable.

Species prerequisites are matched ignoring punctuation and case, because the source spells them
inconsistently — `twi'lek` in a prerequisite against the `twilek` species id. Sixteen species gate
feats this way; all of them resolve, and a test fails if any stops resolving.

### Defects fixed along the way

| Problem | Fix |
| --- | --- |
| `superior-tech` had its level prerequisite spelled `levle`, so it was silently never enforced | Renamed to `level` |
| 49 species prerequisites (Wookiee, Bothan, Twi'lek, …) were stored as references to feats that don't exist, so they never applied | Retargeted to a proper `species` requirement, matching on normalized names |
| `matchingSpec` on prerequisite references was ignored, so Greater Weapon Focus (rifles) was satisfied by Weapon Focus in *any* group | Prerequisites flagged `matchingSpec` now require the same specialization you are choosing |
| `matchingWeaponProficiency` compared a specific weapon against group proficiencies, so Triple Crit could never be taken | The weapon is resolved to its group before the check |
| Prestige `requirements.talents` is an object (`{count, trees}`), not a number — comparing it as a number was always false, permanently locking seven prestige classes | Counts talents held from the named trees |
| Nine class-specific talent trees were referenced but never defined, leaving Force Adept, Force Disciple and Sith Lord with no talents at all | All filled from the spreadsheets |
| "Squad Leader" is used by both Soldier and Elite Trooper with *different* talents | Kept as two trees, so neither class gains talents the sheet doesn't list for it |

**Equipment** started as ~75 items I wrote by hand from the Core Rulebook, and is now 765 imported
from Foundry. That swap corrected real errors in my hand-written values — the Combat Jumpsuit has
no Fortitude bonus, which I had wrongly given +1. Custom items still work and are never overwritten.

### Icons

`npm run fetch:icons` probes sagaworkshop.net for the artwork it serves and downloads what is
there into `public/icons/`, recording the result in `src/data/icons.json`. Re-runs skip files
already on disk.

The site builds its icon URLs unconditionally — it requests `/static/features/<id>.jpg` for every
entry whether one exists or not, which is why so many feats there show a broken image. This app
renders an `<img>` only for ids listed in the manifest, so a missing icon simply shows nothing.

Coverage is **384 icons**: all 21 classes, 6 of 7 weapon groups (no `exotic-weapons`), and 357 of
1647 features — but that headline number understates it, because the misses are almost all talents
from books the site never covered. By what you are likely to see:

| | with icons |
| --- | --- |
| Core Rulebook features | 292 / 342 |
| Force powers, secrets, techniques, maneuvers | 36 / 36 |
| Species traits and class features | 49 / 53 |
| Feats (all books) | 73 / 394 |
| Talents (all books) | 199 / 1164 |

To add your own, drop a file in `public/icons/features/` (or `classes/`, `weapons/`) and name it
under `icons` in `supplement.json`. Nothing else needs changing, and it survives re-running the
fetcher.

### Filling remaining gaps

`src/data/supplement.json` is merged over the imported data at load time and survives re-imports.
Add a talent under `features`, list its id under a tree in `talentTrees`, and it appears in the
picker. Nothing there is validated against the books; it is whatever you type.

## How the rules are implemented

The engine lives in `src/rules/`:

- `engine.ts` — ability scores, level slots, hit points, base attack bonus, defenses, skills,
  Force Points and the condition track.
- `prereqs.ts` — all 14 requirement types the data uses, including the `matching*` rules where a
  prerequisite depends on the specialization you're choosing right now (Weapon Focus needing
  proficiency with the very group you picked, Skill Focus needing that skill trained, and so on).

`npm run test:rules` checks 459 hand-verified assertions against known-correct characters —
a Human Soldier 1, a Wookiee, a Jedi 7 / Jedi Knight 3 multiclass, armor interactions,
prestige gating, Force powers, descriptors, specialization handling, talent-tree grouping
and data integrity.

A few rules worth calling out, because they are easy to get backwards:

- **Armor replaces your heroic level bonus to Reflex Defense**, even when the armor bonus is lower.
  *Armored Defense* is what lets you keep the better of the two; *Improved Armored Defense* adds
  half the armor bonus on top of your heroic level. Both require proficiency.
- **Class defense bonuses never stack** across a multiclass — you take the best single value for
  each defense.
- **Only your first class** grants starting feats, fixed starting hit points and trained skills.
- **Prestige requirements are checked against the character you already are**, before the new level
  is added. A full-BAB class reaches +7 at character level 7, so a prestige class needing +7 becomes
  available *at* level 7 and is taken as your 8th level — you never take it as your 7th.
- **Force Training re-grants on a Wisdom increase.** The feat says that if your Wisdom modifier
  permanently rises you immediately gain one more power per Force Training feat taken, so the
  number of power slots is recomputed rather than frozen at the level you took it.
- **The Force talent trees are not class-restricted.** Force Sensitivity opens Alter, Control,
  Sense and Dark Side to *any* character on *any* talent slot — a Soldier who takes the feat can
  spend a Soldier talent on a Force talent. The tradition-specific trees that the data also flags
  as Force trees (Dathomiri Witch, Jensaarai Defender) stay tied to their own prestige classes.

## Gotcha: type imports

Keep `import type` on its own line. Vite's dev transform has dropped value bindings from
imports that mix values with an inline `type` specifier:

```ts
// this silently became `import { countFeature, hasFeature }` in dev — ReferenceError at runtime
import { countFeature, hasFeature, FORCE_TALENT_TREES, type Derived } from './engine';

// do this instead
import { countFeature, hasFeature, FORCE_TALENT_TREES } from './engine';
import type { Derived } from './engine';
```

Neither `tsc` nor `npm run build` catches this — only the dev server is affected — so
`npm run test:rules` scans the source for the pattern and fails if it reappears.

## Notes and assumptions

- Force Points use the most recently gained class's value plus half your character level. Saga
  Edition's wording varies by table, so treat this as a default.
- Force powers are chosen from the 21 in the rules data. Force techniques and secrets remain tied
  to the prestige classes that grant them.
- Hit points default to the average for the die and are editable per level.
- Carrying capacity is shown as total weight only — no load limits are enforced.
- Characters, portraits included, live in browser localStorage. If it ever fills up, saving warns
  you rather than failing silently; portraits are the usual cause.

## Licence

Star Wars and Saga Edition are trademarks of their respective owners. This is an unofficial
personal tool with no affiliation to Wizards of the Coast, Lucasfilm or Disney.
