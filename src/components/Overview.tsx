import { useMemo, useState } from 'react';
import type { AbilityId, Character, Species } from '../types';
import { SPECIES, FEATURES, CLASSES, ALL_BOOKS, BOOK_NAMES, NEAR_HUMAN, RULES, featureName } from '../data';
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

      {/* Condition, damage, Force points, destiny and Dark Side score live on the sheet —
          they change during play, not while building the character. */}

      <Panel collapseId="character:description" title="Description">
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
  const [query, setQuery] = useState('');

  const available = useMemo(
    () => Object.values(SPECIES)
      // Droid models and species outside the character's books stay out, but never
      // hide the one already chosen.
      .filter(sp => sp.id === current || (!sp.hidden && isBookAllowed(char, sp.book)))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [char.allowedBooks, current],
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    const byName = (sp: Species) => sp.name.toLowerCase().includes(q);
    const matched = available.filter(sp =>
      byName(sp)
      || sp.size.toLowerCase().includes(q)
      || (BOOK_NAMES[sp.book ?? ''] ?? sp.book ?? '').toLowerCase().includes(q)
      // Both "dex" and "dexterity" find the species that modify it.
      || Object.keys(sp.abilities ?? {}).some(a =>
        a.includes(q) || RULES.abilities[a as AbilityId].name.toLowerCase().includes(q))
      || (sp.languages ?? []).some(l => l.toLowerCase().includes(q))
      // Traits are the usual reason to want a species, so search their rules too.
      || (sp.features ?? []).some(f => {
        const feat = FEATURES[f.id];
        return featureName(f.id, f.spec).toLowerCase().includes(q)
          || !!feat?.description.join(' ').toLowerCase().includes(q);
      })
      || (sp.description ?? []).join(' ').toLowerCase().includes(q));
    // Searching the rules text means "wookiee" also finds everyone whose prose
    // mentions them, so the species actually named that comes first.
    return [...matched.filter(byName), ...matched.filter(sp => !byName(sp))];
  }, [available, query]);

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
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          autoFocus
          placeholder="Search by name, trait, ability or book…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span className="hint nowrap">{list.length} of {available.length}</span>
      </div>

      <div className="split">
        <div className="options">
          {list.length === 0 && <div className="empty">No matches.</div>}
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
      collapseId="character:sourcebooks"
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
