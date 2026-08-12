import { useMemo, useState } from 'react';
import type { Character } from '../types';
import { SPECIES, FEATURES, CLASSES, RULES, ALL_BOOKS, BOOK_NAMES, NEAR_HUMAN, featureName } from '../data';
import { signed, isBookAllowed } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { Panel, Field, Modal, FeatureDetail, RulesText, PortraitButton } from './ui';
import { Droid } from './Droid';

export function Overview({
  char, derived, update,
}: { char: Character; derived: Derived; update: (fn: (c: Character) => void) => void }) {
  const [pickingSpecies, setPickingSpecies] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const species = char.speciesId ? SPECIES[char.speciesId] : null;

  const t = char.traits;
  const setTrait = (k: keyof Character['traits'], v: string) =>
    update(c => { c.traits[k] = v; });

  return (
    <>
      <Panel title="Identity">
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <PortraitButton char={char} update={update} size={96} />
          <div className="grow" style={{ flex: 1 }}>
            <div className="grid g2">
              <Field label="Character name">
                <input value={char.name} onChange={e => update(c => { c.name = e.target.value; })} />
              </Field>
              <Field label="Player name">
                <input value={char.playerName} onChange={e => update(c => { c.playerName = e.target.value; })} />
              </Field>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Species">
            <div className="row">
              <button className="clickable item grow" onClick={() => setPickingSpecies(true)}>
                {species ? (
                  <>
                    <span className="name">{species.name}</span>
                    <span className="meta" style={{ marginLeft: 8 }}>
                      {species.size} · speed {species.speed} squares
                      {species.abilities && ' · ' + Object.entries(species.abilities).map(([a, v]) => `${signed(v)} ${a.toUpperCase()}`).join(', ')}
                    </span>
                  </>
                ) : <span className="warn">Choose a species…</span>}
              </button>
              {species && (
                <button className="ghost" onClick={() => update(c => { c.speciesId = null; })}>Clear</button>
              )}
            </div>
          </Field>
        </div>

        {species && (
          <div style={{ marginTop: 12 }}>
            <div className="row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
              {species.bonusFeat && <span className="badge green">bonus feat</span>}
              {species.bonusSkill && <span className="badge green">bonus trained skill</span>}
              {(species.languages ?? []).map(l => <span key={l} className="badge">{l}</span>)}
            </div>
            {(species.features ?? []).length > 0 && (
              <>
                <h3 style={{ marginBottom: 6 }}>Species traits</h3>
                <div className="chips">
                  {(species.features ?? []).map((f, i) => (
                    <button key={i} className="chip clickable" style={{ width: 'auto' }} onClick={() => setViewing(f.id)}>
                      {featureName(f.id, f.spec)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Panel>

      {species?.template === 'droid' && (
        <Droid char={char} derived={derived} update={update} />
      )}

      {species?.template === 'near-human' && (
        <NearHuman char={char} update={update} onView={setViewing} />
      )}

      <Sources char={char} update={update} />

      <Panel title="Condition & resources">
        <div className="grid g4">
          <div className="stat">
            <div className="label">Hit points</div>
            <div className="value" style={{ fontSize: 20 }}>
              {derived.maxHitPoints - char.damage}<span className="faint" style={{ fontSize: 14 }}> / {derived.maxHitPoints}</span>
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 4, marginTop: 6 }}>
              <button className="sm" onClick={() => update(c => { c.damage = Math.min(derived.maxHitPoints, c.damage + 1); })}>−1</button>
              <input
                className="mono center" style={{ width: 54, padding: '2px 4px' }}
                value={char.damage}
                onChange={e => update(c => { c.damage = Math.max(0, parseInt(e.target.value, 10) || 0); })}
              />
              <button className="sm" onClick={() => update(c => { c.damage = Math.max(0, c.damage - 1); })}>+1</button>
            </div>
            <div className="sub">damage taken</div>
          </div>

          <div className="stat">
            <div className="label">Damage threshold</div>
            <div className="value">{derived.damageThreshold}</div>
            <div className="sub">exceed it → −1 condition</div>
          </div>

          <div className="stat">
            <div className="label">Second wind</div>
            <div className="value">{derived.secondWind}</div>
            <div className="sub">once per encounter</div>
          </div>

          <div className="stat" style={{ display: derived.isDroid ? 'none' : undefined }}>
            <div className="label">Force points</div>
            <div className="value">{Math.max(0, derived.forcePoints - char.forcePointsSpent)}<span className="faint" style={{ fontSize: 14 }}> / {derived.forcePoints}</span></div>
            <div className="row" style={{ justifyContent: 'center', gap: 4, marginTop: 6 }}>
              <button className="sm" onClick={() => update(c => { c.forcePointsSpent = Math.min(derived.forcePoints, c.forcePointsSpent + 1); })}>Spend</button>
              <button className="sm ghost" onClick={() => update(c => { c.forcePointsSpent = 0; })}>Reset</button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <Field label="Condition track">
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {RULES.conditionTrack.map(step => (
                <button
                  key={step.index}
                  className={`sm ${char.conditionIndex === step.index ? 'primary' : ''}`}
                  onClick={() => update(c => { c.conditionIndex = step.index; })}
                >
                  {step.name}
                </button>
              ))}
            </div>
            {derived.conditionPenalty !== 0 && (
              <p className="hint warn" style={{ marginTop: 6 }}>
                {signed(derived.conditionPenalty)} to all defenses, attack rolls, skill checks and ability checks.
                {derived.speed === 0 ? ' You cannot move.' : ''}
              </p>
            )}
          </Field>
        </div>

        <div className="grid g3" style={{ marginTop: 14 }}>
          <Field label="Destiny points">
            <input
              className="mono" value={char.destinyPoints}
              onChange={e => update(c => { c.destinyPoints = parseInt(e.target.value, 10) || 0; })}
            />
          </Field>
          <Field label="Dark Side score">
            <input
              className="mono" value={char.darkSideScore}
              onChange={e => update(c => { c.darkSideScore = parseInt(e.target.value, 10) || 0; })}
            />
            <p className="hint" style={{ marginTop: 4 }}>
              Reaching your Wisdom score ({derived.abilities.wis}) turns you to the dark side.
              {char.darkSideScore >= derived.abilities.wis && <span className="err"> You have fallen.</span>}
            </p>
          </Field>
          <Field label="Destiny">
            <input value={char.destiny} onChange={e => update(c => { c.destiny = e.target.value; })} placeholder="Destruction, Discovery…" />
          </Field>
        </div>
      </Panel>

      <Panel title="Description">
        <div className="grid g4">
          <Field label="Age"><input value={t.age} onChange={e => setTrait('age', e.target.value)} /></Field>
          <Field label="Gender"><input value={t.gender} onChange={e => setTrait('gender', e.target.value)} /></Field>
          <Field label="Height"><input value={t.height} onChange={e => setTrait('height', e.target.value)} /></Field>
          <Field label="Weight"><input value={t.weight} onChange={e => setTrait('weight', e.target.value)} /></Field>
          <Field label="Eyes"><input value={t.eyes} onChange={e => setTrait('eyes', e.target.value)} /></Field>
          <Field label="Hair"><input value={t.hair} onChange={e => setTrait('hair', e.target.value)} /></Field>
          <Field label="Skin"><input value={t.skin} onChange={e => setTrait('skin', e.target.value)} /></Field>
          <Field label="Homeworld"><input value={t.homeworld} onChange={e => setTrait('homeworld', e.target.value)} /></Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Affiliation"><input value={t.affiliation} onChange={e => setTrait('affiliation', e.target.value)} /></Field>
        </div>
        <div className="grid g2" style={{ marginTop: 12 }}>
          <Field label="Appearance"><textarea value={t.appearance} onChange={e => setTrait('appearance', e.target.value)} /></Field>
          <Field label="Personality"><textarea value={t.personality} onChange={e => setTrait('personality', e.target.value)} /></Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Background"><textarea value={t.background} onChange={e => setTrait('background', e.target.value)} /></Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Notes"><textarea value={char.notes} onChange={e => update(c => { c.notes = e.target.value; })} style={{ minHeight: 120 }} /></Field>
        </div>
      </Panel>

      {pickingSpecies && (
        <SpeciesPicker
          char={char}
          current={char.speciesId}
          onPick={id => { update(c => { c.speciesId = id; }); setPickingSpecies(false); }}
          onClose={() => setPickingSpecies(false)}
        />
      )}
      {viewing && FEATURES[viewing] && (
        <Modal title="Species trait" onClose={() => setViewing(null)}>
          <FeatureDetail feature={FEATURES[viewing]} />
        </Modal>
      )}
    </>
  );
}

function SpeciesPicker({
  char, current, onPick, onClose,
}: { char: Character; current: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(current);
  const list = Object.values(SPECIES)
    // Droid models and species outside the character's books stay out, but never
    // hide the one already chosen.
    .filter(sp => sp.id === current || (!sp.hidden && isBookAllowed(char, sp.book)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const s = selected ? SPECIES[selected] : null;

  return (
    <Modal
      wide
      title="Choose a species"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!selected} onClick={() => selected && onPick(selected)}>Select</button>
        </>
      }
    >
      <div className="split">
        <div className="options">
          {list.map(sp => (
            <button key={sp.id} className={`opt ${selected === sp.id ? 'selected' : ''}`} onClick={() => setSelected(sp.id)}>
              <span className="grow">{sp.name}</span>
              <span className="badge">{sp.size}</span>
            </button>
          ))}
        </div>
        <div className="detail">
          {!s && <div className="empty">Select a species.</div>}
          {s && (
            <>
              <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 16 }}>{s.name}</h3>
                {s.book && (
                  <span className="badge">
                    {BOOK_NAMES[s.book] ?? s.book}{s.page ? ` p.${s.page}` : ''}
                  </span>
                )}
              </div>
              <div className="grid g3" style={{ marginBottom: 12 }}>
                <div className="stat"><div className="label">Size</div><div className="value" style={{ fontSize: 15 }}>{s.size}</div></div>
                <div className="stat"><div className="label">Speed</div><div className="value" style={{ fontSize: 15 }}>{s.speed} sq</div></div>
                <div className="stat">
                  <div className="label">Ability modifiers</div>
                  <div className="value" style={{ fontSize: 13 }}>
                    {s.abilities
                      ? Object.entries(s.abilities).map(([a, v]) => `${signed(v)} ${a.toUpperCase()}`).join(' ')
                      : 'None'}
                  </div>
                </div>
              </div>

              <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                {s.bonusFeat && <span className="badge green">bonus feat at 1st level</span>}
                {s.bonusSkill && <span className="badge green">bonus trained skill</span>}
                {(s.languages ?? []).map(l => <span key={l} className="badge">{l}</span>)}
              </div>

              {s.description?.length ? <RulesText lines={s.description.slice(0, 2)} /> : null}

              {(s.features ?? []).map((f, i) => {
                const feat = FEATURES[f.id];
                if (!feat) return null;
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <h3>{feat.name}</h3>
                    <RulesText lines={feat.description} />
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Per-character sourcebook restriction. */
function Sources({
  char, update,
}: { char: Character; update: (fn: (c: Character) => void) => void }) {
  const allowed = char.allowedBooks;
  /** Is this book ticked? Used for the checkboxes themselves. */
  const isOn = (b: string) => !allowed || allowed.includes(b);
  /** Would content from this book be offered? Untagged content is always allowed,
   *  matching isBookAllowed — we cannot exclude what we cannot attribute. */
  const offers = (b: string | undefined) => isBookAllowed(char, b);

  const setBooks = (books: string[] | null) => update(c => { c.allowedBooks = books; });

  const toggle = (b: string) =>
    update(c => {
      // Switching from "everything" to a subset starts from the full list.
      const current = c.allowedBooks ?? [...ALL_BOOKS];
      const next = current.includes(b) ? current.filter(x => x !== b) : [...current, b];
      c.allowedBooks = next.length === ALL_BOOKS.length ? null : next;
    });

  // What the current restriction actually costs, so the effect is visible.
  const counts = useMemo(() => {
    const all = Object.values(FEATURES).filter(f => !f.hidden);
    const visible = all.filter(f => offers(f.book));
    const classes = Object.values(CLASSES);
    return {
      features: visible.length,
      totalFeatures: all.length,
      classes: classes.filter(c => offers(c.book)).length,
      totalClasses: classes.length,
      species: Object.values(SPECIES).filter(sp => !sp.hidden && offers(sp.book)).length,
      totalSpecies: Object.values(SPECIES).filter(sp => !sp.hidden).length,
    };
  }, [allowed, char]);

  return (
    <Panel
      title="Sourcebooks"
      actions={
        <div className="row">
          <button className="sm" onClick={() => setBooks(['core'])}>Core only</button>
          <button className="sm" onClick={() => setBooks(null)}>All books</button>
        </div>
      }
    >
      <p className="hint" style={{ marginBottom: 10 }}>
        Limits what the pickers offer for this character. {allowed
          ? <>Currently <strong>{allowed.length}</strong> of {ALL_BOOKS.length} books:{' '}
              <strong>{counts.features}</strong> of {counts.totalFeatures} feats and talents,{' '}
              <strong>{counts.classes}</strong> of {counts.totalClasses} classes,{' '}
              <strong>{counts.species}</strong> of {counts.totalSpecies} species.</>
          : <>All {ALL_BOOKS.length} books are in play.</>}
      </p>

      <div className="grid g3">
        {ALL_BOOKS.map(b => (
          <label key={b} className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={isOn(b)} onChange={() => toggle(b)} />
            <span className={isOn(b) ? '' : 'faint'}>{BOOK_NAMES[b] ?? b}</span>
          </label>
        ))}
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Anything already chosen stays on the character — narrowing this only limits what is offered
        from here on.
      </p>
    </Panel>
  );
}

/** Near-Human build: one trait bought with a Human bonus, plus cosmetic variations. */
function NearHuman({
  char, update, onView,
}: {
  char: Character;
  update: (fn: (c: Character) => void) => void;
  onView: (id: string) => void;
}) {
  const nh = char.nearHuman;
  const chosen = nh.trait ? FEATURES[nh.trait] : null;

  const setTrait = (id: string | null) => update(c => { c.nearHuman.trait = id; });
  const setSacrifice = (v: 'feat' | 'skill') => update(c => { c.nearHuman.sacrifice = v; });
  const toggleCosmetic = (id: string) =>
    update(c => {
      const list = c.nearHuman.cosmetic;
      if (list.includes(id)) c.nearHuman.cosmetic = list.filter(x => x !== id);
      else if (list.length < NEAR_HUMAN.cosmeticLimit) c.nearHuman.cosmetic = [...list, id];
    });

  const incomplete = !nh.trait || !nh.sacrifice;

  return (
    <Panel title="Near-Human">
      <p className="hint" style={{ marginBottom: 12 }}>
        A Near-Human uses the Human stat block and trades <strong>either</strong> its bonus feat{' '}
        <strong>or</strong> its bonus trained skill for a single Near-Human trait, plus up to{' '}
        {NEAR_HUMAN.cosmeticLimit} cosmetic variations.
      </p>

      {incomplete && (
        <div className="notice warn" style={{ marginBottom: 12 }}>
          {!nh.trait && 'Choose a trait. '}
          {!nh.sacrifice && 'Choose what to give up for it.'}
        </div>
      )}

      <div className="grid g2">
        <Field label="Trait">
          <select value={nh.trait ?? ''} onChange={e => setTrait(e.target.value || null)}>
            <option value="">— choose —</option>
            {NEAR_HUMAN.mechanical.map(id => (
              <option key={id} value={id}>{FEATURES[id]?.name ?? id}</option>
            ))}
          </select>
          {chosen && (
            <p className="hint" style={{ marginTop: 6 }}>
              {chosen.description?.[0]}{' '}
              <button className="ghost sm" onClick={() => onView(chosen.id)}>Full text</button>
            </p>
          )}
        </Field>

        <Field label="Paid for by giving up">
          <div className="row">
            <button
              className={`sm ${nh.sacrifice === 'feat' ? 'primary' : ''}`}
              onClick={() => setSacrifice('feat')}
            >
              Bonus feat
            </button>
            <button
              className={`sm ${nh.sacrifice === 'skill' ? 'primary' : ''}`}
              onClick={() => setSacrifice('skill')}
            >
              Bonus trained skill
            </button>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            {nh.sacrifice === 'feat' && 'You no longer get the Human bonus feat.'}
            {nh.sacrifice === 'skill' && 'You train one fewer skill than a Human would.'}
            {!nh.sacrifice && 'Pick one — the other is kept.'}
          </p>
        </Field>
      </div>

      <div style={{ marginTop: 14 }}>
        <Field label={`Cosmetic variations (${nh.cosmetic.length}/${NEAR_HUMAN.cosmeticLimit})`}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {NEAR_HUMAN.cosmetic.map(id => {
              const on = nh.cosmetic.includes(id);
              const full = !on && nh.cosmetic.length >= NEAR_HUMAN.cosmeticLimit;
              return (
                <button
                  key={id}
                  className={`sm ${on ? 'primary' : ''}`}
                  disabled={full}
                  title={FEATURES[id]?.description?.[0]}
                  onClick={() => toggleCosmetic(id)}
                >
                  {FEATURES[id]?.name ?? id}
                </button>
              );
            })}
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            Purely descriptive — they have no mechanical effect.
          </p>
        </Field>
      </div>
    </Panel>
  );
}
