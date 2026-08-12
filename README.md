# SWSE Character Sheet

A character builder for **Star Wars Roleplaying Game: Saga Edition** — species, classes,
multiclassing, feats, talents, Force powers, skills, equipment and a printable sheet, with
prerequisites checked as you build.

Runs entirely in the browser. No account, no server, no network calls.

**Live site: <https://eddierendel.github.io/SWSE-CharacterSheet/>** — nothing to install if you
just want to use it.

## Running it on your own machine

You need [Node.js](https://nodejs.org) 22 or newer. Then:

```bash
git clone https://github.com/EddieRendel/SWSE-CharacterSheet.git
cd SWSE-CharacterSheet
npm install
npm run dev
```

That prints a `http://localhost:5173` URL — open it and you're done.

Other commands, none of them required:

```bash
npm run build       # production build into dist/
npm run preview     # serve the built dist/ locally
npm run test:rules  # 459 assertions against the rules engine
npm run test:e2e    # drives a real browser (needs `npm run dev` already running)
```

> **Windows:** if `npm` fails with *"running scripts is disabled on this system"*, that's the
> PowerShell execution policy blocking `npm.ps1`. Use **`npm.cmd`** instead (`npm.cmd install`,
> `npm.cmd run dev`) — it skips the wrapper and needs no configuration change. Git Bash and
> cmd.exe are unaffected.

Your characters are saved in your browser's local storage, so they stay on the machine you
built them on. Use the JSON export/import to move one somewhere else or to share it.

## What it does

**Building a character**
- **134 species** with ability modifiers, traits, bonus feat/skill and languages applied
  automatically, plus two templates you configure yourself: **Near-Human** (24 traits, 11
  cosmetic variations) and **Droid**.
- **21 base and prestige classes** with multiclassing. Base attack bonus is summed per class;
  class defense bonuses take the single best value instead of stacking. Prestige entry
  requirements are checked and shown.
- **Droids as a full build** — no Constitution (Strength covers Fortitude and second wind),
  degree 1–5, chosen size, speed from locomotion × size, no Force, and 100 droid systems.
- **386 feats and 1188 talents** across 192 talent trees. Every slot your levels grant is laid
  out by level, with what you still owe flagged. The picker shows full rules text, marks what
  you can't take, and names the prerequisite that failed.
- **Force powers** — 89 powers, 57 techniques, 15 secrets. Force Training grants 1 + Wisdom
  modifier powers as its own slots, and re-grants when Wisdom permanently rises. Powers carry
  searchable descriptors (dark side, light side, lightsaber form, telekinetic, mind-affecting).
- **Force talents** — Force Sensitivity opens the six universal trees (Alter, Control, Sense,
  Dark Side, Light Side, Guardian Spirit) on *any* talent slot, for any class.
- **Specializations** — feats that make you choose (Weapon Focus, Skill Focus, Triple Crit…)
  lock only when *no* choice would qualify, and the dropdown lists just the options that
  actually qualify.
- **25 skills** with trained-skill budget from class + Intelligence + species, class-skill
  validation, Skill Focus, size modifiers and armor penalties. **57 languages**, with an
  Intelligence bonus buying one more each.
- **Levelling up is one page.** **Add level** works out what it owes you — unfilled feat, talent
  and power slots, unassigned ability increases, new skill training from a raised Intelligence —
  and lifts exactly those sections to the top with a "still to do" strip.
- **Sourcebook filtering** — restrict a character to any of the 14 books, with *Core only* and
  *All books* shortcuts. Narrowing never removes what's already chosen.

**Playing the character**
- **Attacks** — every worn weapon gets an attack and damage line with the full breakdown.
  Applied automatically: proficiency penalties, Weapon Focus and Specialization (and greater
  forms), Melee Smash, half-level damage. Toggled per roll: Power Attack, two-handed grip,
  Point Blank Shot, Careful Shot, Deadeye, Rapid Shot, Burst Fire, Sneak Attack, full attack.
  Toggles appear only for feats you have, and Rapid Shot / Burst Fire / Deadeye correctly
  refuse to stack. Talents, species traits and powers are covered too (Rage, Dark Rage, Battle
  Strike, Skirmisher, Cunning Attack, Sniper Shot and more).
- **Two-weapon fighting** — a weapon in each hand costs −10 on every attack roll, which
  **Dual Weapon Mastery** I/II/III buys down to −5, −2 and nothing. The reduction needs
  proficiency with the weapon in hand, so an unfamiliar one still takes the full −10. It
  grants an attack with each weapon, stacks with Double and Triple Attack, and is mutually
  exclusive with a two-handed grip — you cannot hold two weapons and also hold one in two.
- **Two-handed weapons are worked out, not asked about.** Saga Edition ties handedness to
  size — a weapon a category larger than you needs both hands — so the 34 Large melee
  weapons (Quarterstaff, Vibro-Axe, Power Hammer, Wan-Shen, Double-Bladed Lightsaber…) get
  the doubled Strength bonus on their own. The data's `twoHanded` flag is honoured first but
  covers only 15 of 241 weapons, so size fills the gap, and it scales with the wielder: a
  Medium weapon takes both hands from a Small character. **Wookiee Grip** lifts the
  requirement. The toggle remains for holding a one-handed weapon in two.
- **Power Attack doubles when two-handed**, per its own Special clause: held in two hands it
  adds twice the number you subtracted from your attack rolls.
- **Unarmed strike** is always listed, stepping up with Martial Arts I/II/III.
- **Damaging Force powers** get their own section, resolved as a Use the Force check against a
  defense — *Force Lightning: +12 vs Reflex Defense, 8d6 force*.
- **Powers are metered like spell slots** — one use per copy in your suite, with pips, Use, ↺
  and **End encounter**. Spent uses save with the character.
- **Force Points** as a per-level pool, with the die it currently adds (1d6 / 2d6 at 8th /
  3d6 at 15th) and a list of everything you own that a point can be spent on.
- **535 equipment items** — weapons, armor and gear, plus custom items. Ticking a weapon as
  **worn** is what puts it in hand and on the attack list. Credits editable inline.
- **Carrying capacity is enforced**, not just shown: heavy load at (Str × ½)², straining at
  Str² × ½, maximum at Str², scaled by size, each band applying its real speed and skill
  penalties.
- **Live derived stats** — hit points, all three defenses, damage threshold, second wind, speed
  and the condition track.
- **Hover cards explain every number** — rules text for features, the equipment line for gear,
  and a row-by-row sum for attacks, damage, skills, defenses and hit points.
- **Portraits** — upload an image or pick one of the 21 class images; cropped square and scaled
  to 256px JPEG so localStorage isn't blown.
- **384 icons** for classes, feats, talents and powers, shown in pickers and lists.
- **Characters** — local-storage saves, with JSON export/import and duplication.

## Possible enhancements

- **Force traditions** — 120 talents are imported but hidden because traditions aren't modelled.
  Adding them makes those selectable with no re-import.
- **Vehicle and starship combat** — 27 starship maneuvers sit in the data with no rules around
  them. 14 droid stat blocks are likewise hidden as NPC content.
- **Prerequisites that arrive as unreadable prose** are shown as *"not enforced automatically"*
  rather than guessed at. Extending the parser shrinks that set; under-restricting is safe,
  mis-restricting isn't.
- **Icon coverage** is 384 of 2184 entries — good for the Core Rulebook and every Force power,
  thin for talents from later books. `exotic-weapons` is the one weapon group with no art.
- **Faster first load.** All the game data compiles into a single 2 MB JS bundle (489 KB
  gzipped). Lazy-loading the large JSON would cut the initial download.
- **Cross-device characters.** Local storage means no sync and no backup beyond manual JSON
  export. A sync target or a shared party view would need a server.
- **Run the test suites in CI.** The Pages workflow only type-checks; `test:rules` and
  `test:e2e` still run by hand.
- **Homebrew** goes in `src/data/supplement.json`, merged over imported data at load time and
  surviving re-imports — but nothing in it is validated.

## Licence

Star Wars and Saga Edition are trademarks of their respective owners. This is an unofficial
personal tool with no affiliation to Wizards of the Coast, Lucasfilm or Disney.
