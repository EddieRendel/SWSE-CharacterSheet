import { useState } from 'react';
import type { Character, AbilityId } from '../types';
import { ABILITY_IDS } from '../types';
import { RULES } from '../data';
import { abilityMod, signed, isAbilityIncreaseLevel } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { Panel } from './ui';

/** Saga Edition point-buy costs, from a base score of 8. */
const POINT_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16,
};
const POINT_BUDGET = 25;

const costOf = (score: number) => POINT_COST[score] ?? (score < 8 ? 0 : 16 + (score - 18) * 4);

export function Abilities({
  char, derived, update,
}: { char: Character; derived: Derived; update: (fn: (c: Character) => void) => void }) {
  const [mode, setMode] = useState<'point-buy' | 'manual'>('manual');

  const spent = ABILITY_IDS.reduce((s, a) => s + costOf(char.baseAbilities[a]), 0);
  const remaining = POINT_BUDGET - spent;

  const setBase = (a: AbilityId, v: number) =>
    update(c => { c.baseAbilities[a] = Math.max(1, Math.min(30, v || 0)); });

  // Levels 4, 8, 12, 16 and 20 each grant +1 to two different abilities.
  const increaseLevels = Array.from({ length: derived.level }, (_, i) => i + 1)
    .filter(isAbilityIncreaseLevel);

  const toggleIncrease = (level: number, a: AbilityId) =>
    update(c => {
      const cur = c.abilityIncreases[level] ?? [];
      if (cur.includes(a)) c.abilityIncreases[level] = cur.filter(x => x !== a);
      else if (cur.length < 2) c.abilityIncreases[level] = [...cur, a];
    });

  return (
    <>
      <Panel
        title="Ability scores"
        actions={
          <div className="row">
            <button className={`sm ${mode === 'manual' ? 'primary' : ''}`} onClick={() => setMode('manual')}>Manual</button>
            <button className={`sm ${mode === 'point-buy' ? 'primary' : ''}`} onClick={() => setMode('point-buy')}>Point buy</button>
          </div>
        }
      >
        {derived.isDroid && (
          <div className="notice" style={{ marginBottom: 12 }}>
            Droids have no Constitution score. They gain no bonus hit points from it, apply
            Strength to Fortitude Defense, and cannot take anything with a Constitution prerequisite.
          </div>
        )}
        {mode === 'point-buy' && (
          <div className={`notice ${remaining < 0 ? 'warn' : ''}`} style={{ marginBottom: 12 }}>
            <strong>{remaining}</strong> of {POINT_BUDGET} points remaining ({spent} spent).
            Scores run 8–18 before species modifiers. {remaining < 0 && ' You are over budget.'}
          </div>
        )}

        <div className={`grid ${derived.isDroid ? 'g5' : 'g6'}`}>
          {ABILITY_IDS.filter(a => !(derived.isDroid && a === 'con')).map(a => {
            const base = char.baseAbilities[a];
            const speciesMod = derived.speciesMods[a] ?? 0;
            const levelBonus = Object.values(char.abilityIncreases).flat().filter(x => x === a).length;
            const total = derived.abilities[a];
            return (
              <div key={a} className="stat" style={{ padding: 12 }}>
                <div className="label">{RULES.abilities[a].name}</div>
                <div className="value" style={{ color: 'var(--accent)' }}>{total}</div>
                <div className="sub mono" style={{ fontSize: 14, color: 'var(--text)' }}>
                  {signed(abilityMod(total))}
                </div>

                <div className="row" style={{ marginTop: 10, gap: 4, justifyContent: 'center' }}>
                  <button className="sm" onClick={() => setBase(a, base - 1)} disabled={base <= 1}>−</button>
                  <input
                    className="mono center"
                    style={{ width: 52, padding: '3px 4px' }}
                    value={base}
                    onChange={e => setBase(a, parseInt(e.target.value, 10))}
                  />
                  <button className="sm" onClick={() => setBase(a, base + 1)} disabled={base >= 30}>+</button>
                </div>

                <div className="sub" style={{ marginTop: 6, lineHeight: 1.6 }}>
                  base {base}
                  {speciesMod !== 0 && <><br /><span style={{ color: speciesMod > 0 ? 'var(--green)' : 'var(--red)' }}>{signed(speciesMod)} species</span></>}
                  {levelBonus > 0 && <><br /><span style={{ color: 'var(--blue)' }}>+{levelBonus} level</span></>}
                  {mode === 'point-buy' && <><br /><span className="faint">{costOf(base)} pts</span></>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Level-based increases">
        {increaseLevels.length === 0 ? (
          <div className="empty">
            At 4th level and every four levels after, you raise two different ability scores by 1.
            <br />You are level {derived.level}.
          </div>
        ) : (
          <div className="list">
            {increaseLevels.map(level => {
              const chosen = char.abilityIncreases[level] ?? [];
              return (
                <div key={level} className="item">
                  <span className="badge accent nowrap">Level {level}</span>
                  <div className="grow row" style={{ flexWrap: 'wrap' }}>
                    {ABILITY_IDS.map(a => (
                      <button
                        key={a}
                        className={`sm ${chosen.includes(a) ? 'primary' : ''}`}
                        onClick={() => toggleIncrease(level, a)}
                        disabled={!chosen.includes(a) && chosen.length >= 2}
                      >
                        {a.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <span className={chosen.length === 2 ? 'ok' : 'warn'}>
                    {chosen.length}/2
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
