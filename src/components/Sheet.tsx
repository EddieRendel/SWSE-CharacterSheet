import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Character } from '../types';
import { ABILITY_IDS } from '../types';
import { RULES, SPECIES, FEATURES, BOOK_NAMES, groupRefs } from '../data';
import { signed } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { forcePointDice } from '../rules/attacks';
import { Panel, PortraitButton, Modal, FeatureDetail, RulesText } from './ui';
import { Tip, FeatureTip, TipRows } from './Tip';
import type { TipRow } from './Tip';
import { Attacks } from './Attacks';
import { Equipment } from './Equipment';

type SheetTab = 'actions' | 'features' | 'equipment';

/**
 * What each kind of feature is drawn in, so the groups separate without being read. These
 * mirror `REQ_TAGS` in labels.ts: the same kind of thing is the same colour whether you are
 * looking at what you have or at what something else wants of you.
 */
const FEATURE_TONES: Record<string, string> = {
  // A species trait has no colour of its own there and gets none here.
  'Species traits': '',
  'Feats': 'blue',
  'Talents': 'purple',
  'Force powers': 'green',
  'Force techniques': 'green',
  'Force secrets': 'green',
  'Starship maneuvers': 'accent',
};

/** A stat tile whose working appears on hover. */
function StatTip({
  title, rows, total, footer, children,
}: {
  title: string;
  rows: TipRow[];
  total?: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <Tip className="block" content={<TipRows title={title} rows={rows} total={total} footer={footer} />}>
      {children}
    </Tip>
  );
}

/**
 * One of the three defenses, or the damage threshold hanging off Fortitude — `minor` draws
 * it a size down, because a threshold is a consequence of a defense rather than a fourth one.
 */
function DefCell({
  label, title, value, sub, rows, footer, minor,
}: {
  label: string;
  /** The heading on the hover card, where the short column label would read oddly. */
  title: string;
  value: number;
  sub?: string;
  rows: TipRow[];
  footer?: string;
  minor?: boolean;
}) {
  return (
    <div className={`def-cell${minor ? ' minor' : ''}`}>
      <StatTip title={title} rows={rows} total={String(value)} footer={footer}>
        <div>
          <div className="vital-label">{label}</div>
          <div className="def-value">{value}</div>
          <div className="def-cell-sub">{sub}</div>
        </div>
      </StatTip>
    </div>
  );
}

export function Sheet({
  char, derived, update,
}: { char: Character; derived: Derived; update: (fn: (c: Character) => void) => void }) {
  const species = char.speciesId ? SPECIES[char.speciesId] : null;
  const classLine = derived.classLevels.map(c => `${c.cls.name} ${c.levels}`).join(' / ') || 'No levels';

  const [tab, setTab] = useState<SheetTab>('actions');
  const [viewing, setViewing] = useState<{ id: string; spec?: string } | null>(null);

  // How many hit points the − and + buttons move. It is a scratch amount for the hit you just
  // took or the healing you just rolled, not part of the character, so it is not persisted — and
  // it clears once applied, ready for the next roll.
  const [hpAmount, setHpAmount] = useState('');
  const hpStep = Math.max(0, parseInt(hpAmount, 10) || 0);
  const currentHp = Math.max(0, derived.maxHitPoints - char.damage);

  /** Move current hit points by `hpStep`, clamped to 0…max, then empty the input. */
  const moveHp = (dir: 1 | -1) => {
    update(c => {
      // Stored damage can exceed the maximum — the old input let you type any number, and removing
      // levels lowers the maximum under it. Normalise before adding `hpStep`, or a heal is spent
      // dragging damage back into range instead of restoring hit points.
      const damage = Math.min(derived.maxHitPoints, Math.max(0, c.damage));
      c.damage = Math.min(derived.maxHitPoints, Math.max(0, damage - dir * hpStep));
    });
    setHpAmount('');
  };

  // Feats, talents and everything Force-related share one tab. Species traits lead it: they
  // are what the character was before any of the rest was chosen, and Rage or Expert Climber
  // is as much a thing you do at the table as any feat under them.
  const featureGroups = ([
    ['Species traits', derived.speciesTraits],
    ['Feats', derived.feats],
    ['Talents', derived.talents],
    ['Force powers', derived.forcePowers],
    ['Force techniques', derived.forceTechniques],
    ['Force secrets', derived.forceSecrets],
    ['Starship maneuvers', derived.starshipManeuvers],
  ] as const).filter(([, items]) => items.length > 0);

  // Combos join the count: they are things this character can do that nothing else on the
  // tab lists, and a tab that says 12 while showing 13 entries reads as a miscount.
  const featureCount = featureGroups.reduce((n, [, items]) => n + items.length, 0)
    + derived.combos.length;
  const carried = char.inventory.length;

  const SHEET_TABS: { id: SheetTab; label: string; count?: number }[] = [
    { id: 'actions', label: 'Actions' },
    { id: 'features', label: 'Feats & powers', count: featureCount },
    { id: 'equipment', label: 'Equipment', count: carried },
  ];

  const hpFraction = derived.maxHitPoints > 0 ? currentHp / derived.maxHitPoints : 0;
  const hpState = hpFraction > 0.5 ? '' : hpFraction > 0.25 ? 'hurt' : 'bad';

  const track = RULES.conditionTrack;
  const bottomStep = track[track.length - 1].index;
  const trainedCount = derived.skills.filter(s => s.trained).length;
  // Split in half rather than flowed across, so the two columns read A–K then L–Z. An odd
  // count leaves the extra row on the right: the left column carries the long names that
  // wrap, so giving it the shorter half is what makes the two ends up level.
  const skillSplit = Math.floor(derived.skills.length / 2);
  const skillColumns = [derived.skills.slice(0, skillSplit), derived.skills.slice(skillSplit)];

  // Force points are read and spent in the vitals band — the Actions tab used to carry a
  // second copy of the same pips, which after the band arrived was the same pool twice.
  const fpLeft = Math.max(0, derived.forcePoints - char.forcePointsSpent);
  const spendFP = (n: number) =>
    update(c => {
      c.forcePointsSpent = Math.max(0, Math.min(derived.forcePoints, c.forcePointsSpent + n));
    });

  // The dark side score is measured against Wisdom, and how near it is repoints the whole
  // sheet's accent. Two characters at the same level should not produce the same page, and
  // this is the state that says the most about who one of them has become.
  const wisdom = derived.abilities.wis;
  const fallen = !derived.isDroid && wisdom > 0 && char.darkSideScore >= wisdom;
  const tempted = !derived.isDroid && wisdom > 0 && !fallen && char.darkSideScore * 2 >= wisdom;
  const fallFraction = wisdom > 0 ? Math.min(1, char.darkSideScore / wisdom) : 0;

  // Both shifts name tokens rather than hexes, so a palette can restate what "tempted" and
  // "fallen" look like in its own colours along with everything else.
  const accentVars = fallen
    ? { '--sheet-accent': 'var(--red)', '--sheet-accent-dim': 'var(--accent-fallen-dim)' }
    : tempted
      ? { '--sheet-accent': 'var(--accent-tempted)', '--sheet-accent-dim': 'var(--accent-tempted-dim)' }
      : undefined;

  const loadWord = derived.carrying.level === 'heavy' ? 'heavy load'
    : derived.carrying.level === 'strained' ? 'straining'
      : derived.carrying.level === 'normal' ? '' : 'overloaded';

  return (
    <div className="sheet" style={accentVars as CSSProperties | undefined}>
      <section className={`frame ${fallen ? 'lit-red' : 'lit'}`}>
        <div className="frame-body identity">
          <PortraitButton char={char} update={update} size={68} />
          <div className="grow">
            <h1>{char.name || 'Unnamed'}</h1>
            <div className="identity-line">
              <span>{species?.name ?? 'No species'}</span>
              <span className="sep">·</span>
              <span>{classLine}</span>
              <span className="sep">·</span>
              <span className="identity-level">Level {derived.level}</span>
              {char.playerName && (
                <>
                  <span className="sep">·</span>
                  <span className="faint">played by {char.playerName}</span>
                </>
              )}
              {fallen && <span className="badge red">fallen</span>}
            </div>
          </div>
          <button onClick={() => window.print()}>Print</button>
        </div>
      </section>

      {/* Tier one: the numbers that move during play. They used to be three tiles among
          fourteen identical ones, with their controls in a separate panel further down the
          page — the reading and the editing of the same number, half a screen apart. */}
      <section className={`frame vitals-frame ${fallen ? 'lit-red' : 'lit'}`}>
        <div className="frame-body vitals">
          <div className={`vital hp ${hpState}`}>
            <div className="vital-label">Hit points</div>
            <StatTip
              title="Hit Points"
              rows={[
                { label: 'maximum', text: String(derived.maxHitPoints) },
                { label: 'damage taken', text: String(char.damage) },
              ]}
              total={String(currentHp)}
              footer={`Second wind restores ${derived.secondWind}, once per encounter.`}
            >
              <div>
                <div className="vital-value">
                  {currentHp}<span className="vital-value-of">/{derived.maxHitPoints}</span>
                </div>
                <div className="hp-bar">
                  <div className={`hp-fill ${hpState}`} style={{ width: `${hpFraction * 100}%` }} />
                </div>
              </div>
            </StatTip>
            <div className="row hp-controls">
              <button className="sm" disabled={hpStep === 0 || currentHp <= 0}
                title="Take that much damage"
                onClick={() => moveHp(-1)}>−</button>
              <input
                className="mono center"
                inputMode="numeric" aria-label="Hit points to add or remove" placeholder="hp"
                value={hpAmount}
                onChange={e => setHpAmount(e.target.value.replace(/\D/g, ''))}
              />
              <button className="sm" disabled={hpStep === 0 || char.damage <= 0}
                title="Heal that many hit points"
                onClick={() => moveHp(1)}>+</button>
              <button className="sm ghost" disabled={char.damage <= 0} title="Back to full"
                onClick={() => update(c => { c.damage = 0; })}>Full</button>
            </div>
            <div className="hint">
              Second wind {derived.secondWind} · threshold {derived.damageThreshold}
            </div>
          </div>

          <div className="vital">
            <div className="vital-label">Condition track</div>
            <div className="ctrack">
              {track.map(step => (
                <button
                  key={step.index}
                  type="button"
                  className={`ctrack-step${char.conditionIndex === step.index ? ' here' : ''}`
                    + `${char.conditionIndex > step.index ? ' passed' : ''}`
                    + `${step.index === bottomStep ? ' out' : ''}`}
                  title={step.index === 0 ? 'Normal — no penalty'
                    : step.index === bottomStep ? 'Unconscious'
                      : `${step.defenses} to defenses, attack rolls, skill checks and ability checks`}
                  onClick={() => update(c => { c.conditionIndex = step.index; })}
                >
                  <span className="ctrack-mark" />
                  <span className="ctrack-name">
                    {step.index === 0 ? 'OK' : step.index === bottomStep ? 'Out' : step.name}
                  </span>
                </button>
              ))}
            </div>
            {char.conditionIndex >= bottomStep ? (
              <p className="hint err">Unconscious — helpless until you are revived.</p>
            ) : derived.conditionPenalty !== 0 ? (
              <p className="hint warn">
                {signed(derived.conditionPenalty)} to all defenses, attack rolls, skill checks
                and ability checks.{derived.speed === 0 ? ' You cannot move.' : ''}
              </p>
            ) : (
              <p className="hint">Unharmed. Take damage past your threshold and you drop a step.</p>
            )}
          </div>

          <div className="vital">
            {derived.isDroid ? (
              <div className="vital-label">Destiny &amp; the dark side</div>
            ) : (
              <>
                <div className="vital-label">Force points</div>
                <StatTip
                  title="Force Points"
                  rows={[
                    { label: 'left to spend', text: String(fpLeft) },
                    { label: 'this level', text: String(derived.forcePoints) },
                  ]}
                  footer={`A reaction, once per round, on a single attack roll, skill check or `
                    + `ability check. Spend one with the button below.`}
                >
                  <div>
                    <div className="vital-value">
                      {fpLeft}<span className="vital-value-of">/{derived.forcePoints}</span>
                    </div>
                    <span className="uses">
                      {Array.from({ length: Math.min(derived.forcePoints, 12) }, (_, i) => (
                        <span key={i} className={`pip ${i < fpLeft ? 'full' : ''}`} />
                      ))}
                    </span>
                  </div>
                </StatTip>
                <div className="row hp-controls">
                  <button className="sm" disabled={fpLeft <= 0} title="Spend a Force Point"
                    onClick={() => spendFP(1)}>Spend</button>
                  <button className="sm ghost" disabled={char.forcePointsSpent <= 0}
                    title="Take one back" onClick={() => spendFP(-1)}>↺</button>
                  {/* The rules for spending one used to hang off the Force Point bar in the
                      Actions tab. That bar was a second copy of this pool and went, so the
                      explanation moves here, next to the button that does it — and says which
                      rolls qualify rather than "a roll", which reads as any of them. */}
                  <Tip content={
                    <div className="tip-body">
                      <div className="tip-head"><strong>Spending a Force Point</strong></div>
                      <p>
                        A reaction, once per round: add {forcePointDice(derived.level)} to a single
                        attack roll, skill check or ability check — before or after you know
                        whether it succeeded.
                      </p>
                      <p>
                        The die grows with your level: 1d6, 2d6 from 8th, 3d6 from 15th. Some
                        feats, talents and powers spend one for a specific effect instead; those
                        are listed under Actions.
                      </p>
                      <p className="faint">The pool refreshes each time you gain a level.</p>
                    </div>
                  }>
                    <span className="hint breakdown">
                      adds {forcePointDice(derived.level)} to one attack, skill or ability check
                    </span>
                  </Tip>
                </div>
              </>
            )}

            <div className="mini-fields">
              <div className="mini-field">
                <label htmlFor="destiny-points">Destiny pts</label>
                <input
                  id="destiny-points" className="mono" value={char.destinyPoints}
                  onChange={e => update(c => { c.destinyPoints = parseInt(e.target.value, 10) || 0; })}
                />
              </div>
              <div className="mini-field">
                <label htmlFor="dark-side">Dark side</label>
                <input
                  id="dark-side" className="mono" value={char.darkSideScore}
                  onChange={e => update(c => { c.darkSideScore = parseInt(e.target.value, 10) || 0; })}
                />
                <div
                  className="fall-bar"
                  title={fallen
                    ? 'You have fallen to the dark side.'
                    : `Reaching your Wisdom score (${wisdom}) turns you to the dark side.`}
                >
                  <div className={`fall-fill ${fallen || tempted ? 'near' : ''}`}
                    style={{ width: `${fallFraction * 100}%` }} />
                </div>
              </div>
              <div className="mini-field wide">
                <label htmlFor="destiny">Destiny</label>
                <input
                  id="destiny" value={char.destiny} placeholder="Destruction, Discovery…"
                  onChange={e => update(c => { c.destiny = e.target.value; })}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tier two: what the galaxy rolls against. A set, framed as a set. */}
      <section className="frame">
        <div className="frame-body defenses">
          <DefCell
            label="Reflex" title="Reflex Defense" value={derived.defenses.reflex}
            sub={`flat-footed ${derived.defenses.flatFooted}`}
            rows={derived.defenseBreakdown.reflex}
            footer={`Flat-footed ${derived.defenses.flatFooted} — your Dexterity bonus does not apply.`}
          />
          <DefCell label="Fortitude" title="Fortitude Defense" value={derived.defenses.fortitude}
            rows={derived.defenseBreakdown.fortitude} />
          <DefCell label="Will" title="Will Defense" value={derived.defenses.will}
            rows={derived.defenseBreakdown.will} />
          <DefCell
            minor label="Threshold" title="Damage Threshold"
            value={derived.damageThreshold} sub="one step down"
            rows={[
              { label: 'Fortitude Defense', value: derived.defenses.fortitude },
              { label: 'size and Improved Damage Threshold', value: derived.damageThreshold - derived.defenses.fortitude },
            ]}
            footer="Take this much damage from a single hit and you move one step down the condition track."
          />
        </div>
      </section>

      {/* Tier three: what is simply true about the character. The modifier is what you add
          at the table, so it is the number here; the score below it is where it came from. */}
      <section className="frame">
        <div className={`frame-body abil-strip${derived.isDroid ? ' five' : ''}`}>
          {ABILITY_IDS
            // Droids have no Constitution score at all.
            .filter(a => !(derived.isDroid && a === 'con'))
            .map(a => (
              <div key={a} className="abil" title={RULES.abilities[a].name}>
                <div className="abil-name">{a.toUpperCase()}</div>
                <div className="abil-mod">{signed(derived.mods[a])}</div>
                <div className="abil-score">{derived.abilities[a]}</div>
              </div>
            ))}
        </div>
      </section>

      <div className="factline">
        <Tip content={
          <TipRows
            title="Base Attack Bonus"
            rows={derived.classLevels.map(c => ({ label: `${c.cls.name} ${c.levels}`, value: c.bab }))}
            total={signed(derived.baseAttackBonus)}
            footer="Every class contributes; multiclass characters add them together."
          />
        }>
          <span className="factline-fact">
            <span className="factline-key">Base attack</span>
            <span className="factline-value breakdown">{signed(derived.baseAttackBonus)}</span>
          </span>
        </Tip>
        <Tip content={
          <TipRows
            title="Speed"
            rows={[
              { label: 'base', text: `${derived.size} ${species?.name ?? ''}`.trim() },
              { label: 'carrying', text: `${derived.carrying.weight.toFixed(1)} of ${derived.carrying.heavy.toFixed(0)} kg` },
            ]}
            total={`${derived.speed} squares`}
            footer={derived.carrying.level === 'normal'
              ? undefined
              : `Carrying a ${derived.carrying.level === 'heavy' ? 'heavy load' : derived.carrying.level === 'strained' ? 'straining load' : 'load over your maximum'} — `
                + (derived.carrying.level === 'heavy'
                  ? 'speed is three quarters and seven skills take −10.'
                  : derived.carrying.level === 'strained' ? 'you can move one square a turn.' : 'you cannot move.')}
          />
        }>
          <span className="factline-fact">
            <span className="factline-key">Speed</span>
            <span className="factline-value breakdown">{derived.speed} sq</span>
          </span>
        </Tip>
        <span className="factline-fact">
          <span className="factline-key">Size</span>
          <span className="factline-value">{derived.size}</span>
        </span>
        <span className="factline-fact">
          <span className="factline-key">Carrying</span>
          <span className={`factline-value ${loadWord ? 'err' : ''}`}>
            {derived.carrying.weight.toFixed(1)} / {derived.carrying.heavy.toFixed(0)} kg
          </span>
          {loadWord && <span className="badge red" style={{ marginLeft: 'var(--sp-3)' }}>{loadWord}</span>}
        </span>
      </div>

      <div className="grid g2">
        <div>
          <Panel
            title="Skills"
            className="reference framed panel-tone-green"
            actions={<span className="hint nowrap">{trainedCount} trained</span>}
          >
            {/* Two columns on a wide screen. The list is the longest thing on the page and
                a single column of it left the tabbed box beside it staring at dead space.

                Two real columns rather than one grid flowing down them: a grid ties the two
                together row by row, so a name long enough to wrap — Knowledge (Physical
                Sciences) — stretched whatever sat beside it in the other column. Split here
                and each column is free to be its own height. Stacked on a narrow screen the
                halves still read in order. */}
            <div className="skill-cols">
              {skillColumns.map((column, i) => (
                <div key={i} className="skill-col">
                  {column.map(sk => (
                    <div key={sk.id} className={`skill${sk.trained ? ' trained' : ''}`}>
                      <span
                        className={`pip ${sk.trained ? 'full' : ''}`}
                        title={sk.trained ? 'Trained' : 'Untrained'}
                      />
                      {/* No hover card here. The total is already on the row, and whether
                          something is a class skill only bears on training it, which happens
                          on the edit page. */}
                      <span className="skill-name">{sk.name}</span>
                      {sk.focused && <span className="badge green">focus</span>}
                      <span className="skill-ability">{sk.ability.toUpperCase()}</span>
                      <span className="skill-total">{signed(sk.total)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {(derived.languages.automatic.length > 0 || derived.languages.chosen.length > 0) && (
              <div className="row" style={{ marginTop: 'var(--sp-5)', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
                <span className="hint nowrap">Languages</span>
                {[...derived.languages.automatic, ...derived.languages.chosen]
                  .map(l => <span key={l} className="chip">{l}</span>)}
              </div>
            )}
          </Panel>
        </div>

        <div>
          <Panel
            className="framed panel-tone-purple"
            title={SHEET_TABS.find(t => t.id === tab)!.label}
            actions={
              <div className="seg">
                {SHEET_TABS.map(t => (
                  <button
                    key={t.id}
                    className={tab === t.id ? 'on' : ''}
                    aria-pressed={tab === t.id}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    {t.count !== undefined && <span className="count">{t.count}</span>}
                  </button>
                ))}
              </div>
            }
          >
            {tab === 'actions' && <Attacks char={char} derived={derived} update={update} bare />}

            {tab === 'features' && featureCount === 0 && (
              <div className="empty">Nothing chosen yet.</div>
            )}

            {tab === 'features' && featureCount > 0 && (
              <>
                {featureGroups.map(([title, items]) => {
                  const tone = FEATURE_TONES[title] ? `text-tone-${FEATURE_TONES[title]}` : '';
                  return (
                  <div key={title} className="feature-group">
                    <h3 className={tone}>
                      {title} <span className="faint">({items.length})</span>
                      <span className="rule" />
                    </h3>
                    <div className="chips">
                      {groupRefs(items).map(g => {
                        // A talent held through another one — Stolen Form's — is a real
                        // holding, but it cost no slot of its own, so it says where it
                        // came from rather than reading as a second pick.
                        const via = g.ref.via ? FEATURES[g.ref.via]?.name ?? g.ref.via : undefined;
                        return (
                          <FeatureTip
                            key={g.key}
                            id={g.ref.id}
                            spec={g.ref.spec}
                            note={via ? `Gained through ${via}.`
                              : g.count > 1 ? `Taken ${g.count} times.` : undefined}
                          >
                            {/* Hovering peeks at the rules; clicking opens the full text, the
                                same dialog the Edit page uses. Descriptors — dark side,
                                telekinetic — are on both of those and not on the chip: this
                                is a list of what you have, and a badge on every second pill
                                buried the names it was sitting next to. They still tag the
                                options in the picker, where they bear on what to choose. */}
                            <button
                              type="button"
                              className={`chip ${tone}`.trim()}
                              disabled={!FEATURES[g.ref.id]}
                              onClick={() => setViewing({ id: g.ref.id, spec: g.ref.spec })}
                            >
                              {g.label}{g.count > 1 && <span className="faint"> x{g.count}</span>}
                              {via && <span className="faint"> · via {via}</span>}
                            </button>
                          </FeatureTip>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}

                {/* Last, and outside the map above, because it is the one group here that is
                    not a thing you hold: the benefit is simply on while both feats are. */}
                {derived.combos.length > 0 && (
                  <div className="feature-group">
                    <h3 className="text-tone-accent">
                      Combined feats <span className="faint">({derived.combos.length})</span>
                      <span className="rule" />
                    </h3>
                    <p className="hint" style={{ margin: '0 0 8px' }}>
                      On because you hold both feats. They cost no slot and were never chosen —
                      change either feat and its Combined Feat goes with it.
                    </p>
                    <div className="col" style={{ gap: 'var(--sp-4)' }}>
                      {derived.combos.map(combo => (
                        <div key={combo.id} className="combo on">
                          <div className="row" style={{ gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' }}>
                            <span className="name grow">{combo.name}</span>
                            {combo.sources.map(source => (
                              <span key={source.book} className="badge">
                                {BOOK_NAMES[source.book] ?? source.book}
                                {source.page ? ` p.${source.page}` : ''}
                              </span>
                            ))}
                          </div>
                          <RulesText lines={combo.effect} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'equipment' && (
              <Equipment char={char} derived={derived} update={update} compact bare />
            )}
          </Panel>

          {/* Framed like its neighbours but untoned — a rounded panel down here would be the
              only one left from the old styling. `print-only` keeps it off the screen sheet:
              it is the player's own prose, already editable on the Character page, and on
              screen it sat under everything they came here to read. It is still on the
              printout, which is where a character's notes earn their place. */}
          {(char.traits.background || char.traits.appearance || char.traits.personality || char.notes) && (
            <Panel title="Notes" className="reference framed print-only">
              {char.traits.appearance && <p><strong>Appearance.</strong> {char.traits.appearance}</p>}
              {char.traits.personality && <p><strong>Personality.</strong> {char.traits.personality}</p>}
              {char.traits.background && <p><strong>Background.</strong> {char.traits.background}</p>}
              {char.notes && <p className="dim" style={{ whiteSpace: 'pre-wrap' }}>{char.notes}</p>}
            </Panel>
          )}
        </div>
      </div>

      {viewing && FEATURES[viewing.id] && (
        <Modal title="Rules" onClose={() => setViewing(null)}>
          <FeatureDetail
            feature={FEATURES[viewing.id]}
            spec={viewing.spec}
            char={char}
            held={derived.features}
          />
        </Modal>
      )}
    </div>
  );
}
