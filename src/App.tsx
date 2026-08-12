import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Character } from './types';
import { computeCharacter } from './rules/engine';
import { loadAll, saveAll, newCharacter, exportCharacter, importCharacterFile } from './storage';
import { DATA_GAPS, DATA_REPAIRS, SPECIES, CLASSES } from './data';
import { Overview } from './components/Overview';
import { EditCharacter, outstandingCount } from './components/EditCharacter';
import { Sheet } from './components/Sheet';
import { FeatureBrowser } from './components/FeaturePicker';
import { Panel, Portrait } from './components/ui';

type Tab = 'overview' | 'edit' | 'sheet';

// Levels, feats, abilities and skills all move together when you gain a level, so they
// live on one page rather than four tabs the player has to remember to visit.
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Character' },
  { id: 'edit', label: 'Edit character' },
  { id: 'sheet', label: 'Sheet' },
];

export default function App() {
  const [characters, setCharacters] = useState<Character[]>(() => loadAll());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [browsing, setBrowsing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { saveAll(characters); }, [characters]);

  const active = characters.find(c => c.id === activeId) ?? null;

  const update = useCallback((fn: (c: Character) => void) => {
    setCharacters(prev => prev.map(c => {
      if (c.id !== activeId) return c;
      const draft: Character = structuredClone(c);
      fn(draft);
      draft.updatedAt = Date.now();
      return draft;
    }));
  }, [activeId]);

  const derived = useMemo(() => (active ? computeCharacter(active) : null), [active]);

  const create = () => {
    const c = newCharacter();
    setCharacters(prev => [c, ...prev]);
    setActiveId(c.id);
    setTab('overview');
  };

  const remove = (id: string) => {
    const c = characters.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    setCharacters(prev => prev.filter(x => x.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const duplicate = (id: string) => {
    const c = characters.find(x => x.id === id);
    if (!c) return;
    const copy: Character = { ...structuredClone(c), id: `${Date.now().toString(36)}-copy`, name: `${c.name} (copy)`, updatedAt: Date.now() };
    setCharacters(prev => [copy, ...prev]);
  };

  const onImport = async (file: File) => {
    try {
      const c = await importCharacterFile(file);
      setCharacters(prev => [c, ...prev]);
      setActiveId(c.id);
    } catch {
      alert('That file could not be read as a SWSE character.');
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand" onClick={() => setActiveId(null)}>
          ⬢ SWSE Character Sheet <small>Star Wars Saga Edition</small>
        </div>
        <div className="spacer" />
        {active && derived && (
          <span className="hint nowrap row" style={{ gap: 8 }}>
            <Portrait portrait={active.portrait} name={active.name} size={26} />
            {active.name || 'Unnamed'} · level {derived.level}
            {derived.unfilledSlots.length > 0 && (
              <span className="warn"> · {derived.unfilledSlots.length} unfilled</span>
            )}
          </span>
        )}
        <button className="ghost" onClick={() => setBrowsing(true)}>Compendium</button>
        {active && <button className="ghost" onClick={() => exportCharacter(active)}>Export</button>}
        {active && <button className="ghost" onClick={() => setActiveId(null)}>All characters</button>}
      </div>

      {active && (
        <div className="tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'edit' && derived && outstandingCount(active!, derived) > 0 && (
                <span className="badge accent">{outstandingCount(active!, derived)}</span>
              )}
              {t.id === 'edit' && derived && derived.trainedSkillsUsed > derived.trainedSkillsAllowed && (
                <span className="badge red">!</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="content">
        <div className="wrap">
          {!active ? (
            <CharacterList
              characters={characters}
              onOpen={id => { setActiveId(id); setTab('overview'); }}
              onCreate={create}
              onDelete={remove}
              onDuplicate={duplicate}
              onImportClick={() => fileInput.current?.click()}
            />
          ) : derived && (
            <>
              {tab === 'overview' && <Overview char={active} derived={derived} update={update} />}
              {tab === 'edit' && <EditCharacter char={active} derived={derived} update={update} />}
              {tab === 'sheet' && <Sheet char={active} derived={derived} update={update} />}
            </>
          )}
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.target.value = '';
        }}
      />

      {browsing && <FeatureBrowser onClose={() => setBrowsing(false)} />}
    </div>
  );
}

function CharacterList({
  characters, onOpen, onCreate, onDelete, onDuplicate, onImportClick,
}: {
  characters: Character[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onImportClick: () => void;
}) {
  return (
    <>
      <Panel
        title="Characters"
        actions={
          <div className="row">
            <button className="sm" onClick={onImportClick}>Import JSON</button>
            <button className="sm primary" onClick={onCreate}>New character</button>
          </div>
        }
      >
        {characters.length === 0 ? (
          <div className="empty">
            No characters yet.
            <div style={{ marginTop: 12 }}>
              <button className="primary" onClick={onCreate}>Create your first character</button>
            </div>
          </div>
        ) : (
          <div className="list">
            {characters.map(c => {
              const level = c.levels.length;
              const classes = Object.entries(
                c.levels.reduce<Record<string, number>>((acc, l) => {
                  acc[l.classId] = (acc[l.classId] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([id, n]) => `${CLASSES[id]?.name ?? id} ${n}`).join(' / ');
              return (
                <div key={c.id} className="item">
                  <Portrait portrait={c.portrait} name={c.name} size={38} />
                  <button className="clickable grow" style={{ background: 'none', border: 'none', padding: 0 }} onClick={() => onOpen(c.id)}>
                    <div className="name">{c.name || 'Unnamed'}</div>
                    <div className="meta">
                      {c.speciesId ? SPECIES[c.speciesId]?.name : 'No species'}
                      {level > 0 ? ` · ${classes} · level ${level}` : ' · no levels'}
                    </div>
                  </button>
                  <button className="sm ghost" onClick={() => onDuplicate(c.id)}>Duplicate</button>
                  <button className="sm ghost" onClick={() => exportCharacter(c)}>Export</button>
                  <button className="sm danger" onClick={() => onDelete(c.id)}>Delete</button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="About this data">
        <p className="dim">
          Rules content covers <strong>674 feats, talents, Force powers and traits</strong> across 14 sourcebooks,
          plus 21 classes, 22 species and 25 skills. Characters are stored in this browser only —
          use <strong>Export</strong> to back one up or move it to another machine.
        </p>
        <p className="hint">
          {DATA_GAPS.length} entries are referenced by the rules data but have no text of their own.
          They are still selectable and are marked <span className="badge red">?</span> where they appear —
          look those up in your sourcebook. Equipment was written by hand from the Core Rulebook,
          so check anything that matters against your books.
        </p>

        <details style={{ marginTop: 10 }}>
          <summary className="hint" style={{ cursor: 'pointer' }}>
            {DATA_REPAIRS.length} corrections applied to the source data
          </summary>
          <ul className="hint" style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.8 }}>
            {DATA_REPAIRS.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <p className="hint" style={{ marginTop: 6 }}>
            The tree remappings are inferred: those classes pointed at talent trees that were never
            defined, while the trees they need sat unused under other names. Without the remapping,
            Force Adept, Force Disciple and Sith Lord had no selectable talents at all.
          </p>
        </details>
      </Panel>
    </>
  );
}
