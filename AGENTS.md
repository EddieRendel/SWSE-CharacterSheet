# AGENTS.md

A character builder for **Star Wars Roleplaying Game: Saga Edition**. React 19 + Vite + TypeScript,
client-only, no backend and no network calls. Characters live in the browser's local storage.

```
src/rules/       the game rules — engine.ts (derived stats), prereqs.ts, attacks.ts, specs.ts
src/rules/engine.test.ts   558 hand-written assertions, run with `npm run test:rules`
src/data/*.json  generated from the Foundry compendium and the Omegadex index — not hand-edited
src/data/supplement.json   hand-written corrections merged over the generated data
src/components/  the UI
tools-*.mjs      the import pipeline
```

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

**Modals stack.** `Modal` keeps a stack so Escape closes only the top one. A new dialog opened
from inside another must not add its own window-level Escape handler.

Do not re-report what CI already covers: `npm run build` type-checks, `npm run lint` runs oxlint,
and `npm run test:rules` runs the assertions. Review for correctness of the game rules, the
data-vs-code split, and the persistence and layout constraints above.
