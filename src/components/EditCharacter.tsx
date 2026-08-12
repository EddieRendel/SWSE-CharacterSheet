import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Character } from '../types';
import { isAbilityIncreaseLevel } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { Levels } from './Levels';
import { Features } from './Features';
import { Abilities } from './Abilities';
import { Skills } from './Skills';

type SectionId = 'levels' | 'features' | 'abilities' | 'skills';

/** Where a section sits once nothing is outstanding. */
const ORDER: SectionId[] = ['levels', 'features', 'abilities', 'skills'];

const LABELS: Record<SectionId, string> = {
  levels: 'Levels',
  features: 'Feats & talents',
  abilities: 'Abilities',
  skills: 'Skills',
};

/** What a new level still owes you, so the page can lead with it. */
interface Outstanding {
  id: SectionId;
  count: number;
  /** Reads as "2 talents to choose". */
  label: string;
}

/**
 * Everything a level still owes the character: unfilled slots, unassigned ability
 * increases, and untrained skills. Exported so the tab can carry the same count.
 */
export function outstandingCount(char: Character, derived: Derived): number {
  if (!char.levels.length) return 0;
  const increases = Array.from({ length: derived.level }, (_, i) => i + 1)
    .filter(isAbilityIncreaseLevel)
    .reduce((n, level) => n + (2 - (char.abilityIncreases[level] ?? []).length), 0);
  return derived.unfilledSlots.length
    + Math.max(0, increases)
    + Math.max(0, derived.trainedSkillsAllowed - char.trainedSkills.length)
    + Math.max(0, derived.languages.allowed - derived.languages.chosen.length);
}

export function EditCharacter({
  char, derived, update,
}: { char: Character; derived: Derived; update: (fn: (c: Character) => void) => void }) {
  const [adding, setAdding] = useState(false);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});

  const outstanding = useMemo<Outstanding[]>(() => {
    const out: Outstanding[] = [];
    if (!char.levels.length) return out;

    // Slots the character has earned but not filled, named by what they are.
    const open = derived.unfilledSlots;
    const byKind: Record<string, number> = {};
    for (const slot of open) {
      const kind = slot.kind === 'species-feat' ? 'feat'
        : slot.kind === 'bonus' ? 'bonus feat'
          : slot.kind.replace('-', ' ');
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
    if (open.length) {
      out.push({
        id: 'features',
        count: open.length,
        label: Object.entries(byKind)
          .map(([kind, n]) => `${n} ${kind}${n > 1 ? 's' : ''}`)
          .join(', ') + ' to choose',
      });
    }

    // 4th, 8th, 12th… each grant +1 to two different abilities.
    const owed = Array.from({ length: derived.level }, (_, i) => i + 1)
      .filter(isAbilityIncreaseLevel)
      .reduce((n, level) => n + (2 - (char.abilityIncreases[level] ?? []).length), 0);
    if (owed > 0) {
      out.push({ id: 'abilities', count: owed, label: `${owed} ability increase${owed > 1 ? 's' : ''} to assign` });
    }

    // Training comes from your first class plus your Intelligence modifier, and an
    // Intelligence bonus also buys languages — so raising it hands you both to pick.
    const untrained = derived.trainedSkillsAllowed - char.trainedSkills.length;
    const unspoken = derived.languages.allowed - derived.languages.chosen.length;
    if (untrained > 0 || unspoken > 0) {
      const bits = [
        ...(untrained > 0 ? [`${untrained} skill${untrained > 1 ? 's' : ''} to train`] : []),
        ...(unspoken > 0 ? [`${unspoken} language${unspoken > 1 ? 's' : ''} to choose`] : []),
      ];
      out.push({ id: 'skills', count: Math.max(untrained, 0) + Math.max(unspoken, 0), label: bits.join(', ') });
    }
    return out;
  }, [char, derived]);

  const needs = new Map(outstanding.map(o => [o.id, o]));

  // Building a character starts with its ability scores, so Abilities leads while there are
  // no levels yet, and again whenever an increase is waiting to be assigned. Otherwise the
  // page prefers levels and feats, which is what you come back to between sessions.
  const abilitiesFirst = !char.levels.length || needs.has('abilities');
  const rank = (id: SectionId) =>
    (abilitiesFirst && id === 'abilities' ? 0 : needs.has(id) ? 1 : 2);
  // A stable sort, so within each rank the sections keep their usual order.
  const order = [...ORDER].sort((a, b) => rank(a) - rank(b));

  const jumpTo = (id: SectionId) =>
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const body: Record<SectionId, ReactNode> = {
    levels: <Levels char={char} derived={derived} update={update} adding={adding} onAdding={setAdding} />,
    features: <Features char={char} derived={derived} update={update} />,
    abilities: <Abilities char={char} derived={derived} update={update} />,
    skills: <Skills char={char} derived={derived} update={update} />,
  };

  return (
    <>
      <div className="level-bar">
        <div>
          <div className="label">Character level</div>
          <div className="level-number">{derived.level || '—'}</div>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          {char.levels.length ? `Add level ${derived.level + 1}` : 'Add your first level'}
        </button>

        <div className="grow">
          {outstanding.length === 0 ? (
            <span className="hint">
              {char.levels.length
                ? 'Everything for this level is chosen. Add a level when you are ready.'
                : 'Set your ability scores first, then add a class level. Feats, talents and skills follow from it.'}
            </span>
          ) : (
            <div className="todo">
              <span className="hint nowrap">Still to do:</span>
              {outstanding.map(o => (
                <button key={o.id} className="sm todo-chip" onClick={() => jumpTo(o.id)}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {order.map(id => {
        const need = needs.get(id);
        return (
          <div
            key={id}
            ref={el => { sectionRefs.current[id] = el; }}
            className={`edit-section${need ? ' needs-attention' : ''}`}
          >
            {need && (
              <div className="needs-header">
                <strong>{LABELS[id]}</strong>
                <span className="badge accent">{need.label}</span>
              </div>
            )}
            {body[id]}
          </div>
        );
      })}
    </>
  );
}
