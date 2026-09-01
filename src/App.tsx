import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Character, FeatureType } from './types';
import { computeCharacter } from './rules/engine';
import { loadAll, saveAll, newCharacter, exportCharacter, importCharacterFile, uid } from './storage';
import {
  DATA_REPAIRS, SPECIES, CLASSES, FEATURES, SKILLS, EQUIPMENT, ALL_BOOKS,
} from './data';
import { Overview } from './components/Overview';
import { EditCharacter } from './components/EditCharacter';
import { outstandingCount, hasConflicts } from './components/outstanding';
import { Sheet } from './components/Sheet';
import { FeatureBrowser } from './components/FeaturePicker';
import { Panel, Portrait } from './components/ui';
import { ThemePicker } from './components/ThemePicker';
import { useDismissLayer } from './dismiss';

type Tab = 'overview' | 'edit' | 'sheet';

// Counted from the data rather than written down. These figures were hardcoded and had
// drifted badly out of date (674 features, 22 species), which is the failure this avoids.
// Hidden entries are excluded, since they never appear in a picker.
const VISIBLE = Object.values(FEATURES).filter(f => !f.hidden);
const ofType = (type: FeatureType) => VISIBLE.filter(f => f.type === type).length;
const COUNTS = {
  feats: ofType('feat'),
  talents: ofType('talent'),
  powers: ofType('force-power'),
  traits: ofType('trait'),
  books: ALL_BOOKS.length,
  classes: Object.keys(CLASSES).length,
  species: Object.values(SPECIES).filter(s => !s.hidden).length,
  skills: Object.keys(SKILLS).length,
  equipment: Object.keys(EQUIPMENT).length,
  // Counted for the same reason as the rest. These two used to be read from a generated
  // dataGaps.json that stopped being regenerated: it still listed 55 entries as having no
  // rules text long after every one of them had been filled in by a later import, so the
  // panel promised a "?" badge that nothing could render.
  noText: VISIBLE.filter(f => f.incomplete || !f.description.join('').trim()).length,
  summaryOnly: VISIBLE.filter(f => f.summaryOnly).length,
};

/**
 * The build this page was made from. `define` in vite.config.ts substitutes it; the guard is
 * for anything that loads this module outside Vite, where the identifier does not exist.
 */
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

// Levels, feats, abilities and skills all move together when you gain a level, so they
// live on one page rather than four tabs the player has to remember to visit.
// `short` is what shows on a phone, where the full labels scrolled off the edge.
const TABS: { id: Tab; label: string; short: string }[] = [
  { id: 'overview', label: 'Character', short: 'Character' },
  { id: 'edit', label: 'Edit character', short: 'Edit' },
  { id: 'sheet', label: 'Sheet', short: 'Sheet' },
];

export default function App() {
  const [characters, setCharacters] = useState<Character[]>(() => loadAll());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [browsing, setBrowsing] = useState(false);
  const [pickingTheme, setPickingTheme] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saveAll(characters); }, [characters]);

  // Same dismissal rules as the hover cards: Escape, a press elsewhere, or a
  // resize — the last because the burger itself disappears above the breakpoint.
  // Escape goes through the shared stack rather than a handler of its own, so a dialog
  // opened while the menu is still up closes alone.
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismissLayer(menuOpen, closeMenu);
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onDown = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

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

  // Declared once and rendered twice — inline on wide screens, inside the burger
  // menu on narrow ones — so the two never drift apart.
  const topActions = [
    { label: 'Theme', run: () => setPickingTheme(true) },
    { label: 'Compendium', run: () => setBrowsing(true) },
    ...(active ? [
      { label: 'Export', run: () => exportCharacter(active) },
      { label: 'All characters', run: () => setActiveId(null) },
    ] : []),
  ];

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
    // uid() rather than a timestamp: two copies made in the same millisecond would
    // otherwise share an id, and the id is what every selection is keyed against.
    const copy: Character = { ...structuredClone(c), id: uid(), name: `${c.name} (copy)`, updatedAt: Date.now() };
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
          <span className="hint row topbar-status" style={{ gap: 'var(--sp-4)' }}>
            <Portrait portrait={active.portrait} name={active.name} size={26} />
            <span className="topbar-name">
              {active.name || 'Unnamed'} · level {derived.level}
              {derived.unfilledSlots.length > 0 && (
                <span className="warn"> · {derived.unfilledSlots.length} unfilled</span>
              )}
            </span>
          </span>
        )}

        <div className="topbar-actions">
          {topActions.map(a => (
            <button key={a.label} className="ghost" onClick={a.run}>{a.label}</button>
          ))}
        </div>

        <div className="topbar-menu" ref={menuRef}>
          <button
            className="ghost burger"
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            ☰
          </button>
          {menuOpen && (
            <div className="menu-pop" role="menu">
              {topActions.map(a => (
                <button key={a.label} role="menuitem" onClick={() => { setMenuOpen(false); a.run(); }}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {active && (
        <div className="tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-full">{t.label}</span>
              <span className="tab-short">{t.short}</span>
              {t.id === 'edit' && derived && outstandingCount(active!, derived) > 0 && (
                <span className="badge accent">{outstandingCount(active!, derived)}</span>
              )}
              {t.id === 'edit' && derived && hasConflicts(active!, derived) && (
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
      {pickingTheme && <ThemePicker onClose={() => setPickingTheme(false)} />}
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
            <div style={{ marginTop: 'var(--sp-6)' }}>
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
                  <button className="clickable grow" style={{ background: 'none', border: 'none', padding: '0' }} onClick={() => onOpen(c.id)}>
                    <div className="item-name">{c.name || 'Unnamed'}</div>
                    <div className="item-meta">
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
        {/* A character lives in one browser's local storage and is migrated in place as the
            app changes, so "which version were you on?" is the first question any lost-data
            report needs an answer to. It is here rather than in the header because this is
            the panel someone is already reading when they go looking. */}
        <p className="hint" style={{ marginBottom: 'var(--sp-5)' }}>
          Version <strong>{APP_VERSION}</strong>
        </p>
        <p className="dim">
          Rules content covers <strong>{COUNTS.feats} feats, {COUNTS.talents} talents,{' '}
          {COUNTS.powers} Force powers and {COUNTS.traits} traits</strong> across {COUNTS.books} sourcebooks,
          plus {COUNTS.classes} classes, {COUNTS.species} species, {COUNTS.skills} skills and{' '}
          {COUNTS.equipment} equipment items. Characters are stored in this browser only —
          use <strong>Export</strong> to back one up or move it to another machine.
        </p>
        {COUNTS.noText > 0 && (
          <p className="hint">
            {COUNTS.noText} entries are referenced by the rules data but have no text of their own.
            They are still selectable and are marked <span className="badge red">?</span> where they
            appear — look those up in your sourcebook.
          </p>
        )}
        <p className="hint">
          {COUNTS.summaryOnly} entries are condensed from the summary spreadsheets rather than the
          full rules text, and are marked <span className="badge">summary only</span> where they
          appear — check your sourcebook for the complete wording. Equipment is imported from the
          Foundry compendium rather than transcribed by hand, so check anything that matters
          against your books.
        </p>

        {DATA_REPAIRS.length > 0 && (
          <details style={{ marginTop: 'var(--sp-5)' }}>
            <summary className="hint" style={{ cursor: 'pointer' }}>
              {DATA_REPAIRS.length} corrections applied to the source data
            </summary>
            <ul className="hint" style={{ marginTop: 'var(--sp-4)', paddingLeft: 18, lineHeight: 1.8 }}>
              {DATA_REPAIRS.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </details>
        )}
      </Panel>
    </>
  );
}
