import { useMemo, useState } from 'react';
import type { Character, Feature, FeatureRef } from '../types';
import type { Derived, Slot } from '../rules/engine';
import { canSelect } from '../rules/prereqs';
import { specOptionsFor, SPEC_LABELS } from '../rules/specs';
import { featureAvailable } from '../rules/engine';
import { FEATURES, BOOK_NAMES, TALENT_TREES, CLASSES, classIcon } from '../data';
import { Modal, FeatureDetail, specLabel, Descriptors, descriptorsOf, FeatureIcon } from './ui';

/** Which feature type a slot draws from when it has no explicit pool. */
const TYPE_FOR_KIND: Record<string, Feature['type']> = {
  feat: 'feat',
  'species-feat': 'feat',
  bonus: 'feat',
  talent: 'talent',
  'force-technique': 'force-technique',
  'force-secret': 'force-secret',
  'starship-maneuver': 'starship-maneuver',
  'force-power': 'force-power',
};

export function FeaturePicker({
  slot, char, derived, onPick, onClose,
}: {
  slot: Slot;
  char: Character;
  derived: Derived;
  onPick: (featureId: string, spec?: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [showIneligible, setShowIneligible] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spec, setSpec] = useState<string | undefined>();
  // Folded trees are deliberately not remembered: the picker is a fresh mount each time it
  // opens, so every tree starts expanded and you always see what is on offer.
  const [closedTrees, setClosedTrees] = useState<Set<string>>(() => new Set());

  // Options come from the slot's explicit pool, or from every feature of the matching type.
  const options = useMemo(() => {
    let refs: FeatureRef[];
    if (slot.pool) {
      // De-duplicate: several trees can offer the same talent.
      const seen = new Set<string>();
      refs = slot.pool.filter(r => {
        const k = r.spec ? `${r.id}::${r.spec}` : r.id;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } else {
      const type = TYPE_FOR_KIND[slot.kind] ?? 'feat';
      refs = Object.values(FEATURES)
        .filter(f => f.type === type && featureAvailable(char, f.id))
        .map(f => ({ id: f.id }));
    }
    return refs
      .map(r => ({ ref: r, feature: FEATURES[r.id] }))
      .filter(o => !!o.feature)
      .sort((a, b) => a.feature.name.localeCompare(b.feature.name));
  }, [slot, char]);

  const evaluated = useMemo(() => options.map(o => ({
    ...o,
    result: canSelect(o.feature.id, char, derived, o.ref.spec),
  })), [options, char, derived]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (feature: Feature, result: { met: boolean }) => {
      if (!showIneligible && !result.met) return false;
      if (!q) return true;
      return feature.name.toLowerCase().includes(q)
        || (BOOK_NAMES[feature.book] ?? '').toLowerCase().includes(q)
        // Descriptors are searchable, so "dark side" finds every dark side power.
        || descriptorsOf(feature).some(d => d.label.includes(q))
        || feature.description.join(' ').toLowerCase().includes(q);
    };
  }, [query, showIneligible]);

  const filtered = useMemo(
    () => evaluated.filter(o => matches(o.feature, o.result)),
    [evaluated, matches],
  );

  // Talent slots are presented by tree, split into the class's own trees and the
  // Force trees that Force Sensitivity opens up.
  const sections = useMemo(() => {
    if (!slot.treeGroups?.length) return null;
    const byId = new Map(evaluated.map(o => [o.feature.id, o]));
    const build = (category: 'class' | 'force') =>
      slot.treeGroups!
        .filter(g => g.category === category)
        .map(g => ({
          ...g,
          entries: g.features
            .map(f => byId.get(f.id))
            .filter((o): o is NonNullable<typeof o> => !!o)
            .filter(o => matches(o.feature, o.result))
            .sort((a, b) => a.feature.name.localeCompare(b.feature.name)),
        }))
        .filter(g => g.entries.length > 0);
    return { class: build('class'), force: build('force') };
  }, [slot.treeGroups, evaluated, matches]);

  // Trees this class draws from that have no talents in the data at all.
  const emptyClassTrees = useMemo(() => {
    if (slot.kind !== 'talent' || !slot.classId) return [];
    return (CLASSES[slot.classId]?.trees?.talent ?? [])
      .map(id => TALENT_TREES[id])
      .filter(t => t && !t.hidden && !t.features?.length);
  }, [slot.kind, slot.classId]);

  const selected = selectedId ? FEATURES[selectedId] : null;
  const selectedRef = evaluated.find(o => o.feature.id === selectedId);
  // Some pools offer a feature with its specialization already fixed,
  // e.g. a tree granting Weapon Specialization (lightsabers).
  const presetSpec = selectedRef?.ref.spec;
  const specs = selected ? specOptionsFor(selected, derived) : [];
  const needsSpec = specs.length > 0 && !presetSpec;
  const effectiveSpec = presetSpec ?? spec;

  // Evaluated with no specialization, this reports which ones would actually qualify.
  const openResult = selected && needsSpec ? canSelect(selected.id, char, derived) : null;
  const viable = new Set(openResult?.viableSpecs ?? []);
  const selectableSpecs = specs.filter(s => viable.has(s.id));
  const hiddenSpecs = specs.length - selectableSpecs.length;

  // Re-check with the chosen specialization, since "matching" rules depend on it.
  const finalResult = selected
    ? canSelect(selected.id, char, derived, effectiveSpec)
    : null;

  const canConfirm = !!selected && (!needsSpec || !!spec) && !!finalResult?.met;

  // Which talent trees offer the selected talent (helpful context).
  const treesFor = selected
    ? Object.values(TALENT_TREES).filter(t => t.features?.some(f => f.id === selected.id))
    : [];

  const eligibleCount = evaluated.filter(o => o.result.met).length;

  return (
    <Modal
      wide
      title={<>Choose: <span style={{ color: 'var(--accent)' }}>{slot.label}</span> <span className="faint" style={{ fontWeight: 400 }}>· level {slot.level}</span></>}
      onClose={onClose}
      footer={
        <>
          <span className="hint" style={{ marginRight: 'auto' }}>
            {eligibleCount} of {evaluated.length} available
          </span>
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!canConfirm}
            onClick={() => selected && onPick(selected.id, effectiveSpec)}
          >
            {needsSpec && !spec ? 'Choose an option first' : 'Select'}
          </button>
        </>
      }
    >
      {emptyClassTrees.length > 0 && (
        <div className="notice warn" style={{ marginBottom: 12 }}>
          <strong>{emptyClassTrees.map(t => t.name).join(', ')}</strong>{' '}
          {emptyClassTrees.length === 1 ? 'is a talent tree' : 'are talent trees'} this class draws
          from, but the rules data contains none of their talents. Add them from your books in{' '}
          <code>src/data/supplement.json</code> and they will appear here.
        </div>
      )}

      {slot.key.startsWith('adaptable-talent:') && (
        <div className="notice" style={{ marginBottom: 12 }}>
          <strong>Adaptable Talent</strong> banks one talent from any class you have levels in, and
          you must meet its prerequisites. After 6 hours' rest you may swap it for one of your
          current talents — the one you swap out cannot be a prerequisite for another talent you have.
        </div>
      )}

      {sections && sections.force.length > 0 && (
        <div className="notice" style={{ marginBottom: 12 }}>
          You have <strong>Force Sensitivity</strong>, so the Force talent trees below are open to
          you on any talent slot, in addition to your class's own trees.
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <input
          autoFocus
          placeholder="Search by name or rules text…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <label className="row nowrap hint" style={{ gap: 6 }}>
          <input type="checkbox" checked={showIneligible} onChange={e => setShowIneligible(e.target.checked)} />
          Show unavailable
        </label>
      </div>

      <div className="split">
        <div className="options">
          {sections ? (
            <>
              {sections.class.length === 0 && sections.force.length === 0 && (
                <div className="empty">No matches.</div>
              )}
              {([
                ['Class talent trees', sections.class],
                ['Force talent trees', sections.force],
              ] as const).map(([heading, groups]) => groups.length > 0 && (
                <div key={heading}>
                  <div className="tree-category">{heading}</div>
                  {groups.map(g => {
                    const shut = closedTrees.has(g.treeId);
                    return (
                      <div key={g.treeId} className="tree-group">
                        <button
                          type="button"
                          className="tree-name"
                          aria-expanded={!shut}
                          title={shut ? 'Expand' : 'Collapse'}
                          onClick={() => setClosedTrees(prev => {
                            const next = new Set(prev);
                            if (!next.delete(g.treeId)) next.add(g.treeId);
                            return next;
                          })}
                        >
                          <span className="caret" aria-hidden="true">{shut ? '▸' : '▾'}</span>
                          {g.treeName}
                          <span className="faint"> · {g.entries.length}</span>
                          {TALENT_TREES[g.treeId]?.incomplete && <span className="badge red" style={{ marginLeft: 6 }}>?</span>}
                        </button>
                        {!shut && g.entries.map(o => (
                          <OptionRow
                            key={`${g.treeId}:${o.feature.id}`}
                            o={o}
                            selected={selectedId === o.feature.id}
                            onSelect={() => { setSelectedId(o.feature.id); setSpec(o.ref.spec); }}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          ) : (
            <>
              {filtered.length === 0 && <div className="empty">No matches.</div>}
              {filtered.map(o => (
                <OptionRow
                  key={o.ref.spec ? `${o.feature.id}::${o.ref.spec}` : o.feature.id}
                  o={o}
                  selected={selectedId === o.feature.id}
                  onSelect={() => { setSelectedId(o.feature.id); setSpec(o.ref.spec); }}
                />
              ))}
            </>
          )}
        </div>

        <div className="detail">
          {!selected && <div className="empty">Select an entry to see its rules.</div>}
          {selected && (
            <>
              <FeatureDetail feature={selected} spec={effectiveSpec} />

              {needsSpec && (
                <div className="panel" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="field">
                    <label>{SPEC_LABELS[selected.specType!] ?? 'Option'}</label>
                    <select value={spec ?? ''} onChange={e => setSpec(e.target.value || undefined)}>
                      <option value="">— choose —</option>
                      {selectableSpecs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {selectableSpecs.length === 0 ? (
                      <p className="hint err" style={{ marginTop: 6 }}>
                        {specs.length === 0
                          ? 'There are no options to choose from yet.'
                          : `None of the ${specs.length} options meet this feat's prerequisites.`}
                      </p>
                    ) : hiddenSpecs > 0 && (
                      <p className="hint" style={{ marginTop: 6 }}>
                        {hiddenSpecs} of {specs.length} options are not listed because they don't
                        meet the prerequisites.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {finalResult && finalResult.checks.length > 0 && (
                <div className="panel" style={{ marginTop: 12, marginBottom: 0 }}>
                  <h3 style={{ marginBottom: 8 }}>
                    Prerequisites
                    {needsSpec && !spec && selectableSpecs.length > 0 && (
                      <span className="faint" style={{ fontWeight: 400 }}>
                        {' '}· shown for {selectableSpecs[0].name}
                      </span>
                    )}
                  </h3>
                  {needsSpec && !spec && selectableSpecs.length > 0 && (
                    <p className="hint" style={{ marginBottom: 8 }}>
                      Some of these depend on which option you pick.{' '}
                      {selectableSpecs.length} of {specs.length} qualify.
                    </p>
                  )}
                  <div className="list">
                    {finalResult.checks.map((c, i) => (
                      <div key={i} className="row" style={{ gap: 8 }}>
                        <span className={c.met ? 'ok' : 'err'}>{c.met ? '✓' : '✕'}</span>
                        <span className={c.met ? 'dim' : 'err'}>{c.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {finalResult?.duplicate && (
                <div className="notice warn" style={{ marginTop: 12 }}>
                  You already have this{selected.multiple ? ' the maximum number of times' : ''}.
                </div>
              )}

              {treesFor.length > 0 && (
                <p className="hint" style={{ marginTop: 12 }}>
                  Talent tree{treesFor.length > 1 ? 's' : ''}: {treesFor.map(t => t.name).join(', ')}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

type EvaluatedOption = {
  ref: FeatureRef;
  feature: Feature;
  result: { met: boolean; duplicate: boolean };
};

function OptionRow({
  o, selected, onSelect,
}: { o: EvaluatedOption; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`opt ${selected ? 'selected' : ''} ${o.result.met ? '' : 'ineligible'}`}
      onClick={onSelect}
    >
      <FeatureIcon id={o.feature.id} spec={o.ref.spec} />
      <span className="grow">
        {o.feature.name}{o.ref.spec ? ` (${specLabel(o.ref.spec, o.feature)})` : ''}
      </span>
      <Descriptors feature={o.feature} compact />
      {o.result.duplicate && <span className="badge">taken</span>}
      {!o.result.met && !o.result.duplicate && <span className="badge red">locked</span>}
      {o.feature.incomplete && <span className="badge">?</span>}
    </button>
  );
}

/** Read-only browser over the whole rules database. */
export function FeatureBrowser({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string>('feat');
  const [book, setBook] = useState<string>('');
  const [showHidden, setShowHidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hiddenCount = useMemo(() => Object.values(FEATURES).filter(f => f.hidden).length, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(FEATURES)
      .filter(f => showHidden || !f.hidden)
      .filter(f => (!type || f.type === type) && (!book || f.book === book))
      .filter(f => !q || f.name.toLowerCase().includes(q) || f.description.join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query, type, book, showHidden]);

  const books = useMemo(
    () => Array.from(new Set(Object.values(FEATURES).map(f => f.book))).sort(),
    [],
  );

  return (
    <Modal wide title="Rules compendium" onClose={onClose}>
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} style={{ flex: 2, minWidth: 180 }} />
        <select value={type} onChange={e => setType(e.target.value)} style={{ flex: 1, minWidth: 130 }}>
          <option value="">All types</option>
          <option value="feat">Feats</option>
          <option value="talent">Talents</option>
          <option value="force-power">Force powers</option>
          <option value="force-technique">Force techniques</option>
          <option value="force-secret">Force secrets</option>
          <option value="starship-maneuver">Starship maneuvers</option>
          <option value="trait">Traits</option>
        </select>
        <select value={book} onChange={e => setBook(e.target.value)} style={{ flex: 1, minWidth: 130 }}>
          <option value="">All books</option>
          {books.map(b => <option key={b} value={b}>{BOOK_NAMES[b] ?? b}</option>)}
        </select>
        <label className="row nowrap hint" style={{ gap: 6 }}>
          <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
          Unsupported ({hiddenCount})
        </label>
      </div>
      {showHidden && (
        <div className="notice" style={{ marginBottom: 12 }}>
          Showing entries that depend on content this app doesn't model — Force traditions, droid
          characters and species outside the supported list. They are kept in the data and become
          selectable if that content is added.
        </div>
      )}
      <div className="split">
        <div className="options">
          <div className="hint" style={{ padding: '0 4px 6px' }}>{list.length} entries</div>
          {list.map(f => (
            <button
              key={f.id}
              className={`opt ${selectedId === f.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(f.id)}
            >
              <FeatureIcon id={f.id} />
              <span className="grow">{f.name}</span>
              {f.hidden && <span className="badge">unsupported</span>}
            </button>
          ))}
        </div>
        <div className="detail">
          {selectedId && FEATURES[selectedId]
            ? <FeatureDetail feature={FEATURES[selectedId]} />
            : <div className="empty">Select an entry.</div>}
        </div>
      </div>
    </Modal>
  );
}

export function ClassDetail({ classId }: { classId: string }) {
  const cls = CLASSES[classId];
  if (!cls) return null;
  const icon = classIcon(classId);
  return (
    <div>
      {icon && (
        <img className="class-icon" src={icon} alt="" width={96} height={96} loading="lazy" />
      )}
      <div className="grid g4" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">Hit die</div><div className="value">d{cls.hitDie}</div></div>
        <div className="stat"><div className="label">BAB</div><div className="value" style={{ fontSize: 18 }}>{cls.fullBaseAttackBonus ? 'Full' : '3/4'}</div></div>
        <div className="stat"><div className="label">Ref / Fort / Will</div><div className="value" style={{ fontSize: 18 }}>+{cls.defenseBonuses.join(' / +')}</div></div>
        <div className="stat"><div className="label">Max level</div><div className="value">{cls.maxLevel}</div></div>
      </div>
      {!cls.prestige && (
        <p className="hint">
          Starting hit points {cls.startingHitPoints} · {cls.baseSkills} + Int modifier trained skills
        </p>
      )}
      {cls.trees?.talent && (
        <p className="hint">
          Talent trees: {cls.trees.talent.map(t => TALENT_TREES[t]?.name ?? t).join(', ')}
        </p>
      )}
    </div>
  );
}
