import { useMemo, useState } from 'react';
import type { Character } from '../types';
import { FEATURES, featureName, groupRefs } from '../data';
import type { Derived, Slot } from '../rules/engine';
import { Panel, Modal, FeatureDetail, Descriptors, FeatureIcon } from './ui';
import { FeaturePicker } from './FeaturePicker';

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

  if (!char.levels.length) {
    return <div className="empty">Add a class level first — feats and talents are granted by your levels.</div>;
  }

  return (
    <>
      {derived.unfilledSlots.length > 0 && (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          <strong>{derived.unfilledSlots.length}</strong> unfilled{' '}
          {derived.unfilledSlots.length === 1 ? 'choice' : 'choices'}:{' '}
          {derived.unfilledSlots.map(s => s.label).join(', ')}
        </div>
      )}

      <Panel
        collapseId="edit:features"
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
            <div key={level}>
              <div className="row" style={{ marginBottom: 6 }}>
                <span className="badge accent">Level {level}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <div className="list">
                {slots.map(slot => {
                  const sel = selections.get(slot.key);
                  const ref = slot.auto ? slot.granted : (sel ? { id: sel.featureId, spec: sel.spec } : undefined);
                  const feature = ref ? FEATURES[ref.id] : undefined;
                  const state = slot.auto ? 'auto' : ref ? 'filled' : 'unfilled';
                  return (
                    <div key={slot.key} className={`item slot ${state}`}>
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
            </div>
          ))}
        </div>
      </Panel>

      <SummaryPanel derived={derived} onView={setViewing} />

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
          <FeatureDetail feature={FEATURES[viewing.id]} spec={viewing.spec} />
        </Modal>
      )}
    </>
  );
}

function SummaryPanel({
  derived, onView,
}: { derived: Derived; onView: (v: { id: string; spec?: string }) => void }) {
  const groups: [string, typeof derived.feats][] = [
    ['Feats', derived.feats],
    ['Talents', derived.talents],
    ['Force powers', derived.forcePowers],
    ['Force techniques', derived.forceTechniques],
    ['Force secrets', derived.forceSecrets],
    ['Starship maneuvers', derived.starshipManeuvers],
  ];
  return (
    <Panel collapseId="edit:features-summary" title="Summary">
      <div className="grid g2">
        {groups.filter(([, list]) => list.length > 0).map(([title, list]) => (
          <div key={title}>
            <h3 style={{ marginBottom: 6 }}>{title} <span className="faint">({list.length})</span></h3>
            <div className="chips">
              {groupRefs(list).map(g => (
                <button
                  key={g.key}
                  className="chip clickable"
                  style={{ width: 'auto' }}
                  onClick={() => onView({ id: g.ref.id, spec: g.ref.spec })}
                >
                  {g.label}
                  {g.count > 1 && <span className="faint"> ×{g.count}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
