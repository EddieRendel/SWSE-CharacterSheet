import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Character } from '../types';
import { FEATURES, featureName } from '../data';
import type { Derived, Slot } from '../rules/engine';
import { lapsedSelections } from '../rules/prereqs';
import { Panel, Modal, FeatureDetail, Descriptors, FeatureIcon } from './ui';
import { FeaturePicker } from './FeaturePicker';
import { ReqList } from './Requirements';
import { setForcedOpen, useCollapsePanel } from '../collapse';

const levelKey = (level: number) => `edit:features:level:${level}`;

/**
 * One level's worth of slots, foldable on its own. A level still owing a choice is held open
 * by the effect below, on the same terms as the panels: collapse it anyway and it stays shut
 * once the choice is made.
 */
function LevelGroup({
  level, unfilled, children,
}: { level: number; unfilled: number; children: ReactNode }) {
  const [open, toggle] = useCollapsePanel(levelKey(level));
  return (
    <div>
      <button
        type="button"
        className="level-divider"
        aria-expanded={open}
        title={open ? 'Collapse this level' : 'Expand this level'}
        onClick={toggle}
      >
        <span className="caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="badge accent">Level {level}</span>
        {unfilled > 0 && (
          <span className="badge red">{unfilled} to choose</span>
        )}
        <span className="rule" />
      </button>
      {open && children}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  'starting-feat': 'Starting feat',
  'class-feature': 'Class feature',
  'species-trait': 'Species trait',
  'species-feat': 'Species bonus feat',
  talent: 'Talent',
  bonus: 'Bonus feat',
  feat: 'Feat',
  'force-power': 'Force power',
  'force-technique': 'Force technique',
  'force-secret': 'Force secret',
  'starship-maneuver': 'Starship maneuver',
};

export function Features({
  char, derived, update,
}: { char: Character; derived: Derived; update: (fn: (c: Character) => void) => void }) {
  const [picking, setPicking] = useState<Slot | null>(null);
  const [viewing, setViewing] = useState<{ id: string; spec?: string } | null>(null);
  const [hideAuto, setHideAuto] = useState(false);

  const selections = useMemo(
    () => new Map(char.selections.map(s => [s.key, s])),
    [char.selections],
  );

  // Picks whose prerequisites have since lapsed — see the notice at the top of the page.
  const lapsed = useMemo(() => lapsedSelections(char, derived), [char, derived]);

  const pick = (slot: Slot, featureId: string, spec?: string) =>
    update(c => {
      const existing = c.selections.findIndex(s => s.key === slot.key);
      const entry = { key: slot.key, choiceId: slot.kind, featureId, spec };
      if (existing >= 0) c.selections[existing] = entry;
      else c.selections.push(entry);
    });

  const clear = (slot: Slot) =>
    update(c => { c.selections = c.selections.filter(s => s.key !== slot.key); });

  // Group by the character level that granted the slot.
  const byLevel = useMemo(() => {
    const map = new Map<number, Slot[]>();
    for (const s of derived.slots) {
      if (hideAuto && s.auto) continue;
      if (!map.has(s.level)) map.set(s.level, []);
      map.get(s.level)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [derived.slots, hideAuto]);

  // Hold open every level that still owes a choice, so a folded one unfolds itself the
  // moment a new level lands rather than hiding the thing you came here to do. A level
  // holding a pick that has lost its prerequisites counts as owing one too — the notice at
  // the top says to change or clear it, which is no help if it is folded out of sight.
  const slotLevel = new Map(derived.slots.map(s => [s.key, s.level]));
  const owing = [
    ...derived.unfilledSlots.map(s => s.level),
    ...lapsed.map(l => slotLevel.get(l.key)).filter((l): l is number => l !== undefined),
  ].map(levelKey).join(',');
  useEffect(() => {
    setForcedOpen('feature-levels', owing ? owing.split(',') : []);
    return () => setForcedOpen('feature-levels', []);
  }, [owing]);

  if (!char.levels.length) {
    return <div className="empty">Add a class level first — feats and talents are granted by your levels.</div>;
  }

  return (
    <>
      {lapsed.length > 0 && (
        <div className="notice conflict" style={{ marginBottom: 16 }}>
          <strong>
            {lapsed.length} {lapsed.length === 1 ? 'choice no longer meets' : 'choices no longer meet'}
            {' '}its prerequisites.
          </strong>{' '}
          Changing an earlier pick can pull the ground out from under a later one. Nothing has
          been removed — change or clear {lapsed.length === 1 ? 'it' : 'them'} below, or put back
          what {lapsed.length === 1 ? 'it' : 'they'} rested on.
          <div className="col" style={{ gap: 8, marginTop: 8 }}>
            {lapsed.map(l => (
              <div key={l.key}>
                <div className="name">{l.name}</div>
                <ReqList checks={l.missing} />
              </div>
            ))}
          </div>
        </div>
      )}

      {derived.unfilledSlots.length > 0 && (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          <strong>{derived.unfilledSlots.length}</strong> unfilled{' '}
          {derived.unfilledSlots.length === 1 ? 'choice' : 'choices'}:{' '}
          {derived.unfilledSlots.map(s => s.label).join(', ')}
        </div>
      )}

      <Panel
        collapseId="edit:features"
        className="framed tint-blue"
        title="Feats, talents & features by level"
        actions={
          <label className="row nowrap hint" style={{ gap: 6 }}>
            <input type="checkbox" checked={hideAuto} onChange={e => setHideAuto(e.target.checked)} />
            Choices only
          </label>
        }
      >
        <div className="col" style={{ gap: 14 }}>
          {byLevel.map(([level, slots]) => (
            <LevelGroup
              key={level}
              level={level}
              unfilled={slots.filter(s => !s.auto && !selections.get(s.key)).length}
            >
              <div className="list">
                {slots.map(slot => {
                  const sel = selections.get(slot.key);
                  const ref = slot.auto ? slot.granted : (sel ? { id: sel.featureId, spec: sel.spec } : undefined);
                  const feature = ref ? FEATURES[ref.id] : undefined;
                  const state = slot.auto ? 'auto' : ref ? 'filled' : 'unfilled';
                  const lost = lapsed.find(l => l.key === slot.key);
                  return (
                    <div key={slot.key} className={`item slot ${state}${lost ? ' conflict' : ''}`}>
                      {ref && <FeatureIcon id={ref.id} spec={ref.spec} size={26} />}
                      <div className="grow">
                        {feature ? (
                          <button
                            className="clickable"
                            style={{ background: 'none', border: 'none', padding: 0 }}
                            onClick={() => setViewing({ id: ref!.id, spec: ref!.spec })}
                          >
                            <div className="name">
                              {featureName(ref!.id, ref!.spec)}{' '}
                              <Descriptors feature={feature} compact />
                              {feature.incomplete && <span className="badge red" style={{ marginLeft: 6 }}>?</span>}
                            </div>
                            <div className="meta">{KIND_LABEL[slot.kind] ?? slot.kind} · {slot.label}</div>
                          </button>
                        ) : (
                          <>
                            <div className="name warn">Choose a {KIND_LABEL[slot.kind]?.toLowerCase() ?? slot.kind}</div>
                            <div className="meta">{slot.label}</div>
                          </>
                        )}
                      </div>

                      {lost && (
                        <span className="badge red" title={`Needs ${lost.missing.map(m => m.text).join(', ')}`}>
                          prerequisite lost
                        </span>
                      )}

                      {slot.auto ? (
                        <span className="badge blue">granted</span>
                      ) : (
                        <div className="row">
                          <button className="sm" onClick={() => setPicking(slot)}>
                            {ref ? 'Change' : 'Choose'}
                          </button>
                          {ref && <button className="sm ghost" onClick={() => clear(slot)}>✕</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </LevelGroup>
          ))}
        </div>
      </Panel>

      {/* No summary panel: every feat, talent and power it listed is already above, laid
          out by the level that granted it, and gathered again on the sheet's Feats &
          powers tab — where clicking one opens the same rules dialog. */}

      {picking && (
        <FeaturePicker
          slot={picking}
          char={char}
          derived={derived}
          onPick={(id, spec) => { pick(picking, id, spec); setPicking(null); }}
          onClose={() => setPicking(null)}
        />
      )}

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
    </>
  );
}

