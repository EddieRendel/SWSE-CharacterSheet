import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Character } from '../types';
import type { Derived } from '../rules/engine';
import { RULES, BOOK_NAMES, FEATURES } from '../data';
import { Modal, RulesText, FeatureDetail } from './ui';
import { Tip, FeatureTip } from './Tip';

const { book: BOOK, description: TURN, kinds: KINDS, list: ACTIONS } = RULES.actions;
const BOOK_NAME = BOOK_NAMES[BOOK] ?? BOOK;
const cite = (page?: number) => `${BOOK_NAME}${page ? ` p.${page}` : ''}`;
const actionsOf = (kindId: string) => ACTIONS.filter(a => a.kinds.includes(kindId));

/** "reflex-defense" -> "Reflex Defense", so the table can head its own column. */
const titleCase = (id: string) =>
  id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

/**
 * The size modifiers a check uses, read from the one place rules.json defines them.
 *
 * Written out ascending, the way the size ladder is, rather than in the descending order the
 * `sizeModifiers` blocks happen to be stored in — the ladder is the thing being read along.
 */
function SizeModifiers({ id }: { id: string }) {
  const table = RULES.sizeModifiers[id as keyof typeof RULES.sizeModifiers];
  if (!table) return null;
  return (
    <table className="size-mods">
      <thead>
        <tr><th>Size</th><th>{titleCase(id)} Modifier</th></tr>
      </thead>
      <tbody>
        {RULES.sizes.map(size => (
          <tr key={size}>
            <td>{size}</td>
            <td className="mono">{table[size] > 0 ? `+${table[size]}` : table[size]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The feats and talents an action's text names, as chips that open the same rules dialog the
 * rest of the sheet does — prerequisites included, which is the thing you want when the entry
 * says "if you have the Quick Draw feat" and you cannot remember whether you qualify.
 *
 * The heading names what is actually in the row: Ranged Disarm is a talent, not a feat, and a
 * row headed "Feats" with a talent in it would be wrong about the one thing it says.
 */
function Mentioned({ ids, onOpen }: { ids: string[]; onOpen: (id: string) => void }) {
  const known = ids.filter(id => FEATURES[id]);
  if (!known.length) return null;
  const types = new Set(known.map(id => FEATURES[id].type));
  const label = types.has('feat') && types.has('talent') ? 'Feats and talents'
    : types.has('talent') ? 'Talents' : 'Feats';
  return (
    <>
      <div className="rules-section-label">{label}</div>
      <div className="chips">
        {known.map(id => (
          <FeatureTip key={id} id={id}>
            <button type="button" className="chip" onClick={() => onOpen(id)}>
              {FEATURES[id].name}
            </button>
          </FeatureTip>
        ))}
      </div>
    </>
  );
}

/**
 * What anyone gets to do in a turn — the Core Rulebook's actions in combat.
 *
 * Six buttons and one dialog rather than six dialogs: the question at the table is rarely
 * about one kind on its own — "can I do that and still move?" — so the switcher inside is the
 * point, and closing to reopen would lose the thread.
 *
 * Stores nothing: everything above it on this tab is derived from the character, this is the
 * same for everybody, and which kind you last read is not a preference worth keeping. The
 * character comes in only so that a feat opened from an entry is judged against them, the way
 * it is everywhere else the rules dialog appears.
 */
export function TurnActions({ char, derived }: { char: Character; derived: Derived }) {
  const [kindId, setKindId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const kind = KINDS.find(k => k.id === kindId);

  return (
    <div className="turn-actions">
      <h3 style={{ margin: '12px 0 6px' }}>Actions in combat</h3>
      <p className="hint" style={{ margin: '0 0 8px' }}>
        What a turn holds, as the book has it. None of this depends on your character.
      </p>
      {/* Wrapping, not a `.seg`: six labels run past the width of a phone, and `.seg` hides
          its overflow rather than scrolling it, so the last two would be invisible and
          untappable rather than merely cramped. The modifiers strip above does the same. */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        {KINDS.map(k => {
          const count = actionsOf(k.id).length;
          return (
            <Tip
              key={k.id}
              content={
                <div className="tip-body">
                  <div className="tip-head"><strong>{k.name}</strong></div>
                  <div className="tip-source">{cite(k.page)}</div>
                  {/* One paragraph, the way a feature's tip shows four: the card is a peek,
                      and the whole of it is one click away. A kind with no framing text of
                      its own says what it holds instead of showing an empty card. */}
                  <p dangerouslySetInnerHTML={{ __html: k.description[0] }} />
                  {k.description.length > 1 && <p className="faint">…</p>}
                </div>
              }
            >
              <button
                type="button"
                className="sm kind"
                style={{ '--cost': k.cost } as CSSProperties}
                onClick={() => setKindId(k.id)}
              >
                {k.name}
                {count > 0 && <span className="faint"> {count}</span>}
              </button>
            </Tip>
          );
        })}
      </div>

      {kind && (
        <Modal title="Actions in combat" onClose={() => setKindId(null)}>
          {/* The switcher: the same wrapping row, `primary` for the one being read. The
              resting `.primary` style is what "on" looks like and its only hover rule is
              already inside `@media (hover: hover)`, so a hover latched by a tap cannot
              leave a second button looking chosen. */}
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)', marginBottom: 'var(--sp-6)' }}>
            {KINDS.map(k => (
              <button
                key={k.id}
                type="button"
                className={`sm kind ${k.id === kind.id ? 'primary' : ''}`}
                style={{ '--cost': k.cost } as CSSProperties}
                aria-pressed={k.id === kind.id}
                onClick={() => setKindId(k.id)}
              >
                {k.name}
              </button>
            ))}
          </div>

          {/* What a turn holds, and what may be traded for what. It stands above the
              switcher's choice because it is true of all six, and because "can I do that and
              still move?" is the question this dialog was built to answer — a reader who gets
              only the entries for one kind never finds out how many of it they get. */}
          <div className="turn-economy">
            <RulesText lines={TURN} />
          </div>

          <div className="row" style={{ gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
            <h3 className="text-tone-accent" style={{ fontSize: 'var(--fs-lg)' }}>{kind.name}</h3>
            <span className="badge accent">{cite(kind.page)}</span>
          </div>
          <RulesText lines={kind.description} />

          {/* `--cost` shades every card below by how much of a turn this kind spends, so
              switching kinds changes the weight of the whole list rather than redrawing the
              same grey stack. Set once here and inherited. */}
          <div
            className="col"
            style={{ gap: 'var(--sp-4)', marginTop: 'var(--sp-5)', '--cost': kind.cost } as CSSProperties}
          >
            {actionsOf(kind.id).map(a => (
              <div key={a.id} className="turn-action">
                <div className="row" style={{ gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' }}>
                  <span className="turn-action-name grow">{a.name}</span>
                  {/* An action the book files under two headings says so, rather than reading
                      as a duplicate of one already met under the other. */}
                  {a.kinds.filter(k => k !== kind.id).map(k => (
                    <span key={k} className="badge">
                      also {KINDS.find(x => x.id === k)?.name ?? k}
                    </span>
                  ))}
                  {a.page && <span className="badge">p.{a.page}</span>}
                </div>
                <RulesText lines={a.description} />
                {a.sizeModifiers && <SizeModifiers id={a.sizeModifiers} />}
                {a.features && <Mentioned ids={a.features} onOpen={setViewing} />}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Stacked over the dialog above it. `Modal` shares one dismiss stack, so Escape closes
          this and leaves the actions open behind it — no handler of its own. */}
      {viewing && FEATURES[viewing] && (
        <Modal title="Rules" onClose={() => setViewing(null)}>
          <FeatureDetail feature={FEATURES[viewing]} char={char} held={derived.features} />
        </Modal>
      )}
    </div>
  );
}
