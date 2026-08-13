import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Character } from '../types';
import { ABILITY_IDS } from '../types';
import { RULES, SPECIES, FEATURES, groupRefs } from '../data';
import { signed } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { forcePointDice } from '../rules/attacks';
import { Panel, Stat, Descriptors, PortraitButton, Field, Modal, FeatureDetail } from './ui';
import { Tip, FeatureTip, TipRows } from './Tip';
import type { TipRow } from './Tip';
import { Attacks } from './Attacks';
import { Equipment } from './Equipment';

type SheetTab = 'actions' | 'features' | 'equipment';

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

  // Feats, talents and everything Force-related share one tab.
  const featureGroups = ([
    ['Feats', derived.feats],
    ['Talents', derived.talents],
    ['Force powers', derived.forcePowers],
    ['Force techniques', derived.forceTechniques],
    ['Force secrets', derived.forceSecrets],
    ['Starship maneuvers', derived.starshipManeuvers],
  ] as const).filter(([, items]) => items.length > 0);

  const featureCount = featureGroups.reduce((n, [, items]) => n + items.length, 0);
  const carried = char.inventory.length;

  const SHEET_TABS: { id: SheetTab; label: string; count?: number }[] = [
    { id: 'actions', label: 'Actions' },
    { id: 'features', label: 'Feats & powers', count: featureCount },
    { id: 'equipment', label: 'Equipment', count: carried },
  ];

  return (
    <>
      <Panel>
        <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
          <PortraitButton char={char} update={update} size={72} />
          <div className="grow">
            <h1 style={{ color: 'var(--accent)' }}>{char.name || 'Unnamed'}</h1>
            <div className="dim">
              {species?.name ?? 'No species'} · {classLine} · Level {derived.level}
              {char.playerName && ` · played by ${char.playerName}`}
            </div>
          </div>
          <button onClick={() => window.print()}>Print</button>
        </div>
      </Panel>

      <div className={`grid ${derived.isDroid ? 'g5' : 'g6'}`} style={{ marginBottom: 16 }}>
        {ABILITY_IDS
          // Droids have no Constitution score at all.
          .filter(a => !(derived.isDroid && a === 'con'))
          .map(a => (
            <Stat
              key={a}
              label={RULES.abilities[a].name}
              value={derived.abilities[a]}
              sub={<strong style={{ color: 'var(--accent)' }}>{signed(derived.mods[a])}</strong>}
            />
          ))}
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <StatTip rows={derived.defenseBreakdown.reflex} title="Reflex Defense"
          total={String(derived.defenses.reflex)}
          footer={`Flat-footed ${derived.defenses.flatFooted} — your Dexterity bonus does not apply.`}>
          <Stat label="Reflex Defense" value={derived.defenses.reflex}
            sub={`flat-footed ${derived.defenses.flatFooted}`} />
        </StatTip>
        <StatTip rows={derived.defenseBreakdown.fortitude} title="Fortitude Defense"
          total={String(derived.defenses.fortitude)}>
          <Stat label="Fortitude Defense" value={derived.defenses.fortitude} />
        </StatTip>
        <StatTip rows={derived.defenseBreakdown.will} title="Will Defense"
          total={String(derived.defenses.will)}>
          <Stat label="Will Defense" value={derived.defenses.will} />
        </StatTip>
        <StatTip
          title="Damage Threshold"
          rows={[
            { label: 'Fortitude Defense', value: derived.defenses.fortitude },
            { label: 'size and Improved Damage Threshold', value: derived.damageThreshold - derived.defenses.fortitude },
          ]}
          total={String(derived.damageThreshold)}
          footer="Take this much damage from a single hit and you move one step down the condition track."
        >
          <Stat label="Damage Threshold" value={derived.damageThreshold} />
        </StatTip>
        <StatTip
          title="Hit Points"
          rows={[
            { label: 'maximum', text: String(derived.maxHitPoints) },
            { label: 'damage taken', text: String(char.damage) },
          ]}
          total={String(derived.maxHitPoints - char.damage)}
          footer={`Second wind restores ${derived.secondWind}, once per encounter.`}
        >
          <Stat label="Hit Points" value={`${derived.maxHitPoints - char.damage}/${derived.maxHitPoints}`}
            sub={`second wind ${derived.secondWind}`} />
        </StatTip>
        <StatTip
          title="Base Attack Bonus"
          rows={derived.classLevels.map(c => ({ label: `${c.cls.name} ${c.levels}`, value: c.bab }))}
          total={signed(derived.baseAttackBonus)}
          footer="Every class contributes; multiclass characters add them together."
        >
          <Stat label="Base Attack Bonus" value={signed(derived.baseAttackBonus)} />
        </StatTip>
        <StatTip
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
        >
          <Stat
            label="Speed"
            value={`${derived.speed} sq`}
            sub={derived.carrying.level === 'normal'
              ? derived.size
              : <span className="err">{derived.carrying.level === 'heavy' ? 'heavy load' : derived.carrying.level === 'strained' ? 'straining' : 'overloaded'}</span>}
          />
        </StatTip>
        {derived.isDroid
          ? <Stat label="Destiny Points" value={char.destinyPoints} sub="droids have no Force Points" />
          : (
            <StatTip
              title="Force Points"
              rows={[
                { label: 'left to spend', text: String(Math.max(0, derived.forcePoints - char.forcePointsSpent)) },
                { label: 'this level', text: String(derived.forcePoints) },
              ]}
              footer={`Each one spent adds ${forcePointDice(derived.level)} to a roll. Spend them from the Actions tab.`}
            >
              <Stat label="Force Points" value={Math.max(0, derived.forcePoints - char.forcePointsSpent)}
                sub={`destiny ${char.destinyPoints} · dark side ${char.darkSideScore}`} />
            </StatTip>
          )}
      </div>

      {/* Everything that changes during play rather than while building the character. It
          used to sit on the Character tab, which is for the build. The tiles above show the
          resulting numbers; these are the controls behind them. */}
      <Panel title="Condition &amp; resources">
        <div className="grid g2">
          <Field label="Hit points">
            <div className="row">
              <button className="sm" disabled={hpStep === 0 || currentHp <= 0}
                title="Take that much damage"
                onClick={() => moveHp(-1)}>−</button>
              <input
                className="mono center" style={{ width: 64 }}
                inputMode="numeric" aria-label="Hit points to add or remove" placeholder="hp"
                value={hpAmount}
                onChange={e => setHpAmount(e.target.value.replace(/\D/g, ''))}
              />
              <button className="sm" disabled={hpStep === 0 || char.damage <= 0}
                title="Heal that many hit points"
                onClick={() => moveHp(1)}>+</button>
              <button className="sm ghost" disabled={char.damage <= 0} title="Back to full"
                onClick={() => update(c => { c.damage = 0; })}>Full</button>
              <span className="hint nowrap">
                {currentHp} / {derived.maxHitPoints}
              </span>
            </div>
          </Field>

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

      <div className="grid g2">
        <div>
          <Panel title="Skills">
            <div className="table-scroll">
              <table>
                <tbody>
                  {derived.skills.map(sk => (
                    <tr key={sk.id}>
                      <td style={{ width: 20 }}>{sk.trained ? '●' : <span className="faint">○</span>}</td>
                      <td>
                        <Tip content={
                          <TipRows
                            title={sk.name}
                            rows={sk.parts}
                            total={signed(sk.total)}
                            footer={sk.classSkill ? undefined : 'Not a class skill — you can only train it through a feat.'}
                          />
                        }>
                          <span className="breakdown">{sk.name}</span>
                        </Tip>
                        {sk.focused && <span className="badge green" style={{ marginLeft: 6 }}>focus</span>}
                      </td>
                      <td className="faint">{sk.ability.toUpperCase()}</td>
                      <td className="num" style={{ fontWeight: 700, color: sk.trained ? 'var(--accent)' : undefined }}>
                        {signed(sk.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(derived.languages.automatic.length > 0 || derived.languages.chosen.length > 0) && (
              <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
                <span className="hint nowrap">Languages</span>
                {[...derived.languages.automatic, ...derived.languages.chosen]
                  .map(l => <span key={l} className="chip">{l}</span>)}
              </div>
            )}
          </Panel>
        </div>

        <div>
          <Panel
            title={SHEET_TABS.find(t => t.id === tab)!.label}
            actions={
              <div className="row" style={{ gap: 2 }}>
                {SHEET_TABS.map(t => (
                  <button
                    key={t.id}
                    className={`sm ${tab === t.id ? 'primary' : 'ghost'}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    {t.count !== undefined && <span className="faint"> {t.count}</span>}
                  </button>
                ))}
              </div>
            }
          >
            {tab === 'actions' && <Attacks char={char} derived={derived} update={update} bare />}

            {tab === 'features' && (
              featureGroups.length === 0
                ? <div className="empty">Nothing chosen yet.</div>
                : featureGroups.map(([title, items]) => (
                  <div key={title} style={{ marginBottom: 12 }}>
                    <h3 style={{ marginBottom: 6 }}>
                      {title} <span className="faint">({items.length})</span>
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
                                same dialog the Edit page uses. */}
                            <button
                              type="button"
                              className="chip"
                              disabled={!FEATURES[g.ref.id]}
                              onClick={() => setViewing({ id: g.ref.id, spec: g.ref.spec })}
                            >
                              {g.label}{g.count > 1 && <span className="faint"> x{g.count}</span>}
                              {via && <span className="faint"> · via {via}</span>}
                              {FEATURES[g.ref.id] && <Descriptors feature={FEATURES[g.ref.id]} compact />}
                            </button>
                          </FeatureTip>
                        );
                      })}
                    </div>
                  </div>
                ))
            )}

            {tab === 'equipment' && (
              <Equipment char={char} derived={derived} update={update} compact bare />
            )}
          </Panel>

          {(char.traits.background || char.traits.appearance || char.traits.personality || char.notes) && (
            <Panel title="Notes">
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
          <FeatureDetail feature={FEATURES[viewing.id]} spec={viewing.spec} />
        </Modal>
      )}
    </>
  );
}
