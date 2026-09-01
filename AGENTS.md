# AGENTS.md

A character builder for **Star Wars Roleplaying Game: Saga Edition**. React 19 + Vite + TypeScript,
client-only, no backend and no network calls. Characters live in the browser's local storage.

```
src/rules/       the game rules — engine.ts (derived stats), prereqs.ts, attacks.ts, specs.ts
src/rules/engine.test.ts   hand-written assertions, run with `npm run test:rules`
src/data/*.json  generated from the Foundry compendium and the Omegadex index — not hand-edited
src/data/supplement.json   hand-written corrections merged over the generated data
src/data/rules.json, skills.json, combos.json   hand-maintained — see below
src/components/  the UI
tools-*.mjs      the import pipeline
```

**The pipeline, in order.** Each stage reads what the one before it wrote:

```
import:foundry → import:excel → import:foundry-text → wire:trees → wire:choices
              → attribute:books → import:languages → dedupe → audit:provenance → fetch:icons
```

`import:foundry` and friends need a clone of the Foundry SagaEdition packs; `import:excel` and
`attribute:books` need the spreadsheets, which are gitignored. `audit:provenance` verifies and
writes nothing.

**`rules.json` and `skills.json` have no generator.** They were produced once by a bootstrap
script that has since been deleted, because it rewrote six other data files wholesale from a
frozen scrape and would have undone every import run since. Those two are now hand-maintained
like `supplement.json`: edit them directly, and note that `rules.json` is the single definition
of the size ladder, size modifiers, the condition track and carrying capacity.

**`combos.json` has no generator either.** It holds the Combined Feats — pairs of feats that do
something extra for anyone holding both, which are not feats, cost no slot and are never chosen.
The engine turns one on when every feat it names is held. The importer cannot produce this file:
the summary spreadsheets list each pair twice, once under each half, and each of those rows names
only the *other* feat as a prerequisite, so imported straight they become selectable feats that
demand half of what they should. Those rows are hidden in `supplement.json`, which explains it at
length. Add a pair by copying its wording from the `Combined Feat (…)` line in the feats' own
text; a test fails the build if a feat states one and no entry here covers it.

```bash
npm run dev         # local dev server
npm run build       # tsc -b && vite build — a type error fails the build
npm run lint        # oxlint
npm run test:rules  # the rules assertions
```

## Code Review Rules

**Never edit the generated data files.** `features.json`, `equipment.json`, `species.json`,
`classes.json` and their siblings are rewritten wholesale by `npm run import:foundry`. A
correction made in one of them disappears the next time anyone re-imports. Corrections belong in
`src/data/supplement.json`, which is merged over the generated data at load time. Flag any diff
that changes a generated file outside of a commit that re-runs the importer.

The supplement merge is a **shallow spread**, so naming a nested key such as `requirements`
replaces the whole block rather than one entry inside it. A patch that sets `requirements` must
restate every part of it, including the ones it does not mean to change.

**Every rules change needs an assertion.** Anything touching `src/rules/` should come with cases
in `src/rules/engine.test.ts` covering both the new behaviour and what it must not break — the
usual failure here is a fix that quietly widens a prerequisite so unrelated things become
selectable. Prefer asserting on the specific character that motivated the change.

**Prefer data over code for one-off rules.** The engine is generic on purpose. A special case
keyed on a feature id in `prereqs.ts` or `attacks.ts` is nearly always the wrong shape; the same
fix usually belongs in `supplement.json` as a `specType`, `allowedSpecs` or `requirements` patch.
Flag new id-specific branches in the rules code.

**A `matchingSpec` requirement needs a specialization to match against.** It is checked against
the specialization being chosen right now, so a feature carrying one while offering no
`specType` or `allowedSpecs` can never be selected by anyone. A test asserts this invariant —
if a change makes it fail, the fix is the data, not the test.

**Saved characters must keep loading.** Characters are JSON in local storage under a versioned
key. Selections are keyed `feat:<character level>` and similar, and ability increases by level
number. Changing the shape of anything persisted needs a migration or a key version bump, not a
silent format change — there is no server to re-derive from.

**Collapsible panels: a need holds a panel open, it does not save that.** A panel owing the
player a choice is forced open through a transient scope in `src/collapse.ts`. Writing the open
state to the stored preference instead is a bug: it means a panel the player collapsed during a
level-up reopens forever after. Same for the per-level groups in the feats list.

**Prerequisites that cannot be parsed are shown, not guessed.** Unparsed prerequisites surface as
"not enforced automatically". Under-restricting is safe; mis-restricting blocks a legal
character. Do not invent a `requirements` block from prose that is genuinely ambiguous — say so
in the UI instead.

**Rules text is quoted, not paraphrased.** Descriptions, prerequisites and damage values come
from the books. When a change turns on the reading of a rule, the commit or comment should quote
the wording it relies on, so the next person can check it without the book.

**The UI must survive a 320px screen.** Every panel, table and dialog is expected to work down to
320px wide with no horizontal page scroll — wide content scrolls inside its own container. Flag
fixed pixel widths on anything in a grid or table row.

**A phone is not a small desktop, and three of its rules are invisible in a desktop run.**
*Height comes from `dvh`, never `vh`* — a mobile browser draws its toolbars over the viewport
`vh` measures, so a `vh`-sized dialog hangs about 100px below what can be seen or touched, and
the overlay behind it does not scroll: the footer, and the button that commits the choice, are
simply unreachable. *Fields are 16px on a touch screen* — below that iOS zooms the page on focus
and does not zoom back, so everything after is tapped at the wrong scale. *Hover that stands in
for "selected" or "on" is wrapped in `@media (hover: hover)`* — a tap latches `:hover` onto
whatever it lands on and nothing takes it off again, so an unguarded rule leaves a row the finger
merely passed over looking exactly like the one that was chosen. `e2e.mjs` checks what it can at
phone size, but emulation has no toolbars: a `vh` dialog measures as fitting perfectly there, so
that one is only caught in review. Autofocus is the same trade — `autoFocusSearch` in
`src/pointer.ts` — since raising the keyboard on open buries the dialog's own buttons.

**The document is the scroller on a touch screen.** A mobile browser retracts its toolbars only
when the *document* scrolls, so an inner `overflow-y: auto` box means they never retract and
about 130px of the screen is spent for the whole session. Under `@media (pointer: coarse)` the
app shell comes apart — `.content` stops scrolling and the page scrolls instead, with `.tabs`
sticky as the only fixed row. Two things follow, and both are load-bearing: a dialog **must**
hold the page still behind it (`useScrollLock` in `src/scrolllock.ts`, ref-counted because
dialogs nest, and saving the scroll offset because `position: fixed` otherwise jumps the sheet
to the top), and anything pinned to an edge needs its `env(safe-area-inset-*)`. Re-introducing
an inner scroller for a phone undoes all of it.

**A number the player types is a string until they are done.** `value={aNumber}` with
`parseInt(field) || 0` writes the fallback back on every keystroke, so the box cannot be
cleared: backspacing over a quantity leaves a 1 in it and the next digit joins that 1. Use
`NumberField` in `src/components/ui.tsx`, which holds a draft string, commits whatever parses,
and clamps **only on blur** — mid-typing, `1` on the way to `18` is unfinished, not
out-of-range. It also selects on focus, so a tap replaces rather than appends.

**A floor in the UI has to agree with the floor on load.** `splitStack` in `src/storage.ts`
re-clamps quantities when a character is read back, so a field that allows 0 against a loader
that clamps to 1 silently puts the copy back on the next reload. Change both, or neither.

**Dismissal is not just Escape.** A phone has no Escape key, so `Modal` also closes on a
backdrop *tap* — both ends of the press on the backdrop and the pointer barely moved, or a
flick to scroll dismisses the dialog the instant the finger lands — and on a downward pull of
its grab handle. Browser Back is deliberately **not** wired up: pushing history entries per
layer raced React's double-invoked effects against the async `popstate` badly enough to leave
the Back button wedged, and a Back the player cannot use to leave the page is worse than a
Back that does nothing.

**Modals stack.** `Modal` keeps a stack so Escape closes only the top one. A new dialog opened
from inside another must not add its own window-level Escape handler.

Do not re-report what CI already covers: `npm run build` type-checks, `npm run lint` runs oxlint,
and `npm run test:rules` runs the assertions. Review for correctness of the game rules, the
data-vs-code split, and the persistence and layout constraints above.
