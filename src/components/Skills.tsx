import { useState } from 'react';
import type { Character } from '../types';
import { RULES, LANGUAGES } from '../data';
import { signed } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { Panel } from './ui';
import { Tip } from './Tip';

export function Skills({
  char, derived, update,
}: { char: Character; derived: Derived; update: (fn: (c: Character) => void) => void }) {
  const allowed = derived.trainedSkillsAllowed;
  const used = char.trainedSkills.length;

  const toggle = (id: string) =>
    update(c => {
      if (c.trainedSkills.includes(id)) c.trainedSkills = c.trainedSkills.filter(s => s !== id);
      else c.trainedSkills = [...c.trainedSkills, id];
    });

  if (!char.levels.length) {
    return <div className="empty">Add a class level first — your class determines which skills you can train.</div>;
  }

  return (
    <>
      <Panel collapseId="edit:skills" title="Trained skills">
        <div className={`notice ${used > allowed ? 'warn' : ''}`} style={{ marginBottom: 12 }}>
          <strong>{used}</strong> of <strong>{allowed}</strong> trained skills chosen
          {' '}({derived.classLevels[0] ? `${derived.classLevels.find(c => c.cls.id === char.levels[0].classId)?.cls.baseSkills ?? 0} from class` : ''}
          {' '}{signed(derived.mods.int)} Int
          {char.speciesId && derived.speciesMods && ''}).
          {used > allowed && ' You have trained more skills than you are entitled to.'}
          <br />
          You may only train skills on your class list. Being trained grants +5; Skill Focus adds another +5.
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th>Skill</th>
                <th>Ability</th>
                <th className="num">Total</th>
                <th>Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {derived.skills.map(sk => {
                const manual = char.trainedSkills.includes(sk.id);
                const granted = sk.trained && !manual;
                const parts = [
                  `${Math.floor(derived.level / 2)} ½ level`,
                  `${signed(derived.mods[sk.ability])} ${RULES.abilities[sk.ability].name.slice(0, 3)}`,
                  ...(sk.trained ? ['+5 trained'] : []),
                  ...(sk.focused ? ['+5 focus'] : []),
                  ...(sk.sizeMod ? [`${signed(sk.sizeMod)} size`] : []),
                  ...(sk.armorPenalty ? [`${signed(sk.armorPenalty)} armor`] : []),
                  ...(derived.conditionPenalty ? [`${signed(derived.conditionPenalty)} condition`] : []),
                  ...(derived.carrying.penalisedSkills.includes(sk.id)
                    ? [`${RULES.carryingCapacity.heavyLoadPenalty} heavy load`] : []),
                ];
                return (
                  <tr key={sk.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={sk.trained}
                        disabled={granted}
                        title={granted ? 'Granted by a feat or talent' : undefined}
                        onChange={() => toggle(sk.id)}
                      />
                    </td>
                    <td>
                      <strong>{sk.name}</strong>
                      {sk.classSkill && <span className="badge accent" style={{ marginLeft: 6 }}>class</span>}
                      {sk.focused && <span className="badge green" style={{ marginLeft: 6 }}>focus</span>}
                      {granted && <span className="badge blue" style={{ marginLeft: 6 }}>granted</span>}
                      {manual && !sk.classSkill && <span className="badge red" style={{ marginLeft: 6 }}>not a class skill</span>}
                    </td>
                    <td className="faint">{RULES.abilities[sk.ability].name}</td>
                    <td className="num" style={{ fontSize: 15, fontWeight: 700, color: sk.trained ? 'var(--accent)' : undefined }}>
                      {signed(sk.total)}
                    </td>
                    <td className="faint" style={{ fontSize: 11 }}>{parts.join('  ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Languages derived={derived} update={update} />
    </>
  );
}

/**
 * Languages. Your species' come free; an Intelligence bonus buys one more each. The rules
 * put no restriction on which — anything spoken in the galaxy is fair game — so this is a
 * plain list rather than a filtered pool.
 */
function Languages({
  derived, update,
}: { derived: Derived; update: (fn: (c: Character) => void) => void }) {
  const [adding, setAdding] = useState(false);
  const { automatic, chosen, allowed } = derived.languages;
  const left = allowed - chosen.length;

  const take = (name: string) =>
    update(c => { if (!c.languages.includes(name)) c.languages = [...c.languages, name]; });
  const drop = (name: string) =>
    update(c => { c.languages = c.languages.filter(l => l !== name); });

  const known = new Set([...automatic, ...chosen]);
  const offered = Object.values(LANGUAGES).filter(l => !known.has(l.name));

  return (
    <Panel
      collapseId="edit:languages"
      title="Languages"
      actions={
        <div className="row">
          <span className={`hint nowrap${left < 0 ? ' err' : ''}`}>
            {chosen.length} of {allowed} chosen
          </span>
          <button className="sm primary" disabled={left <= 0} onClick={() => setAdding(a => !a)}>
            {adding ? 'Done' : 'Add a language'}
          </button>
        </div>
      }
    >
      <div className="chips" style={{ marginBottom: adding ? 12 : 0 }}>
        {automatic.map(name => (
          <span key={name} className="chip">
            {name}<span className="faint"> species</span>
          </span>
        ))}
        {chosen.map(name => (
          <span key={name} className="chip">
            {name}
            <button title="Forget this language" onClick={() => drop(name)}>×</button>
          </span>
        ))}
        {!automatic.length && !chosen.length && <span className="hint">None yet.</span>}
      </div>

      {left > 0 && !adding && (
        <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
          Your Intelligence bonus is worth {allowed} language{allowed > 1 ? 's' : ''};
          {' '}{left} still to choose.
        </p>
      )}

      {adding && (
        <div className="chips">
          {offered.map(l => (
            <Tip
              key={l.id}
              content={l.description
                ? <div className="tip-body"><div className="tip-head"><strong>{l.name}</strong></div><p>{l.description}</p></div>
                : null}
            >
              <button className="sm" disabled={left <= 0} onClick={() => take(l.name)}>{l.name}</button>
            </Tip>
          ))}
        </div>
      )}
    </Panel>
  );
}
