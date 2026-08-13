import { useMemo, useState } from 'react';
import type { Character } from '../types';
import { CLASSES, TALENT_TREES, DROIDS, classIcon } from '../data';
import { defaultHitDieValue, isBookAllowed } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { checkClassRequirements } from '../rules/prereqs';
import { Panel, Modal } from './ui';
import { ReqList } from './Requirements';
import { ClassDetail } from './FeaturePicker';

export function Levels({
  char, derived, update, adding: addingProp, onAdding,
}: {
  char: Character;
  derived: Derived;
  update: (fn: (c: Character) => void) => void;
  /** The class picker can be opened from outside, e.g. by the Add level button on top. */
  adding?: boolean;
  onAdding?: (open: boolean) => void;
}) {
  const [addingSelf, setAddingSelf] = useState(false);
  const adding = addingProp ?? addingSelf;
  const setAdding = onAdding ?? setAddingSelf;

  const addLevel = (classId: string) =>
    update(c => {
      const cls = CLASSES[classId];
      c.levels.push({
        classId,
        hitPoints: c.levels.length === 0 ? undefined : defaultHitDieValue(cls.hitDie),
      });
    });

  const removeLevel = () =>
    update(c => {
      const removed = c.levels.length - 1;
      c.levels.pop();
      // Drop any selections and ability increases tied to the level we just removed.
      c.selections = c.selections.filter(s => {
        const lvl = parseInt(s.key.split(':')[0], 10);
        return Number.isNaN(lvl) ? true : lvl < removed;
      });
      delete c.abilityIncreases[String(removed + 1)];
    });

  const setHp = (index: number, hp: number) =>
    update(c => { c.levels[index].hitPoints = Math.max(0, hp || 0); });

  return (
    <>
      <Panel
        collapseId="edit:levels"
        title={`Class progression — level ${derived.level}`}
        actions={
          <div className="row">
            <button className="sm" onClick={removeLevel} disabled={!char.levels.length}>Remove level</button>
            <button className="sm primary" onClick={() => setAdding(true)}>Add level</button>
          </div>
        }
      >
        {char.levels.length === 0 ? (
          <div className="empty">
            No levels yet. Add your first class level to begin.
            <div style={{ marginTop: 12 }}>
              <button className="primary" onClick={() => setAdding(true)}>Add level</button>
            </div>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">Lvl</th>
                  <th>Class</th>
                  <th className="num">Class lvl</th>
                  <th className="num">HP gained</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {char.levels.map((entry, i) => {
                  const cls = CLASSES[entry.classId];
                  const classLevel = char.levels.slice(0, i + 1).filter(l => l.classId === entry.classId).length;
                  const hp = derived.hitPointBreakdown[i];
                  return (
                    <tr key={i}>
                      <td className="num">{i + 1}</td>
                      <td>
                        <strong>{cls?.name ?? entry.classId}</strong>
                        {cls?.prestige && <span className="badge purple" style={{ marginLeft: 6 }}>prestige</span>}
                      </td>
                      <td className="num">{classLevel}</td>
                      <td className="num">
                        {i === 0 ? (
                          <span title="Your first level grants your class's fixed starting hit points.">
                            {hp?.gained} <span className="faint">(fixed)</span>
                          </span>
                        ) : (
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                            <input
                              className="mono center"
                              style={{ width: 56, padding: '2px 4px' }}
                              value={entry.hitPoints ?? ''}
                              onChange={e => setHp(i, parseInt(e.target.value, 10))}
                            />
                            <span className="faint nowrap">→ {hp?.gained}</span>
                          </div>
                        )}
                      </td>
                      <td className="faint">d{cls?.hitDie}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {char.levels.length > 1 && (
          <p className="hint" style={{ marginTop: 10 }}>
            Rolled hit points are editable. New levels default to the average for the die.
            Your Constitution modifier ({derived.mods.con >= 0 ? '+' : ''}{derived.mods.con}) is added to each level.
          </p>
        )}
      </Panel>

      {/* No class summary panel: the progression table above already gives the levels per
          class and the hit die, the sheet's Base Attack Bonus tile shows the per-class
          working, and the class picker gives each class's BAB and defense bonuses. */}

      {adding && (
        <ClassPicker
          char={char}
          derived={derived}
          onPick={id => { addLevel(id); setAdding(false); }}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}

function ClassPicker({
  char, derived, onPick, onClose,
}: { char: Character; derived: Derived; onPick: (id: string) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);

  const entries = useMemo(() => {
    const taken: Record<string, number> = {};
    for (const l of char.levels) taken[l.classId] = (taken[l.classId] ?? 0) + 1;
    return Object.values(CLASSES)
      .filter(cls => (isBookAllowed(char, cls.book) && !(derived.isDroid && DROIDS.forbiddenClasses.includes(cls.id))) || taken[cls.id])
      .map(cls => ({
        cls,
        taken: taken[cls.id] ?? 0,
        req: checkClassRequirements(cls.id, char, derived),
        atMax: (taken[cls.id] ?? 0) >= cls.maxLevel,
      }))
      .sort((a, b) =>
        Number(a.cls.prestige) - Number(b.cls.prestige) || a.cls.name.localeCompare(b.cls.name));
  }, [char, derived]);

  const sel = entries.find(e => e.cls.id === selected);
  const canAdd = sel && sel.req.met && !sel.atMax;

  return (
    <Modal
      wide
      title="Add a class level"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!canAdd} onClick={() => selected && onPick(selected)}>
            {sel?.atMax ? 'At maximum level' : 'Add level'}
          </button>
        </>
      }
    >
      <div className="split">
        <div className="options">
          <div className="hint" style={{ padding: '0 4px 6px' }}>Base classes</div>
          {entries.filter(e => !e.cls.prestige).map(e => (
            <ClassOption key={e.cls.id} e={e} selected={selected} setSelected={setSelected} />
          ))}
          <div className="hint" style={{ padding: '10px 4px 6px' }}>Prestige classes</div>
          {entries.filter(e => e.cls.prestige).map(e => (
            <ClassOption key={e.cls.id} e={e} selected={selected} setSelected={setSelected} />
          ))}
        </div>
        <div className="detail">
          {!sel && <div className="empty">Select a class.</div>}
          {sel && (
            <>
              <div className="row" style={{ marginBottom: 10 }}>
                <h3 style={{ fontSize: 16 }}>{sel.cls.name}</h3>
                {sel.cls.prestige && <span className="badge purple">prestige</span>}
                {sel.taken > 0 && <span className="badge">{sel.taken} level{sel.taken > 1 ? 's' : ''} taken</span>}
              </div>
              <ClassDetail classId={sel.cls.id} />

              {sel.req.checks.length > 0 && (
                <div className="panel" style={{ marginTop: 14, marginBottom: 0 }}>
                  <h3 style={{ marginBottom: 8 }}>Entry requirements</h3>
                  <ReqList checks={sel.req.checks} />
                </div>
              )}

              {(() => {
                const empty = (sel.cls.trees?.talent ?? [])
                  .map(id => TALENT_TREES[id])
                  .filter(t => t && !t.features?.length);
                if (!empty.length) return null;
                const all = empty.length === (sel.cls.trees?.talent ?? []).length;
                return (
                  <div className="notice warn" style={{ marginTop: 12 }}>
                    The rules data has no talents for{' '}
                    <strong>{empty.map(t => t.name).join(', ')}</strong>
                    {all ? ' — every talent tree this class uses.' : '.'}{' '}
                    {all && 'Force-sensitive characters can still take Force talents here. '}
                    Add the missing talents from your books in <code>src/data/supplement.json</code>.
                  </div>
                );
              })()}

              {sel.atMax && (
                <div className="notice warn" style={{ marginTop: 12 }}>
                  You already have the maximum {sel.cls.maxLevel} levels in this class.
                </div>
              )}
              {char.levels.length > 0 && sel.taken === 0 && (
                <div className="notice" style={{ marginTop: 12 }}>
                  Multiclassing: you gain this class's hit die, talents and bonus feats, but not its
                  starting feats, starting hit points or trained skills — those come only from your first class.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ClassOption({
  e, selected, setSelected,
}: {
  e: { cls: { id: string; name: string }; taken: number; req: { met: boolean }; atMax: boolean };
  selected: string | null;
  setSelected: (id: string) => void;
}) {
  return (
    <button
      className={`opt ${selected === e.cls.id ? 'selected' : ''} ${e.req.met && !e.atMax ? '' : 'ineligible'}`}
      onClick={() => setSelected(e.cls.id)}
    >
      {classIcon(e.cls.id) && (
        <img className="feature-icon" src={classIcon(e.cls.id)} alt="" width={22} height={22} loading="lazy" />
      )}
      <span className="grow">{e.cls.name}</span>
      {e.taken > 0 && <span className="badge accent">{e.taken}</span>}
      {!e.req.met && <span className="badge red">locked</span>}
      {e.atMax && <span className="badge">max</span>}
    </button>
  );
}
