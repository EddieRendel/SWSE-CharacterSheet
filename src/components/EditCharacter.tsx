import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Character } from '../types';
import { isAbilityIncreaseLevel } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { Levels } from './Levels';
import { Features } from './Features';
import { Abilities } from './Abilities';
import { Skills } from './Skills';
import { setForcedOpen } from '../collapse';

type SectionId = 'levels' | 'features' | 'abilities' | 'skills';

/** Where a section sits once nothing is outstanding. */
const ORDER: SectionId[] = ['levels', 'features', 'abilities', 'skills'];

/**
 * The collapsible panels each section owns, so a section that starts owing you something can
 * open the panel you would fix it in. Only panels that gain a need are opened, and only at
 * the moment it appears — collapse one afterwards and it stays shut, including once the
 * choice is made.
 */
const SECTION_PANELS: Record<SectionId, string[]> = {
  levels: ['edit:levels'],
  features: ['edit:features'],
  abilities: ['edit:abilities', 'edit:ability-increases'],
  skills: ['edit:skills', 'edit:languages'],
};

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
  /** Set when the character has more than they are entitled to, rather than too few. */
  over?: boolean;
}

/**
 * Choices that exceed what the character is entitled to. Removing the level that raised
 * Intelligence is the usual cause: the allowances shrink, but the skills and languages
 * already picked stay put.
 */
export const hasConflicts = (char: Character, derived: Derived) =>
  char.trainedSkills.length > derived.trainedSkillsAllowed
  || derived.languages.chosen.length > derived.languages.allowed;

/**
 * Everything a level still owes the character: unfilled slots, unassigned ability
 * increases, and untrained skills. Exported so the tab can carry the same count.
 */
export function outstandingCount(char: Character, derived: Derived): number {
  if (!char.levels.length) return 0;
  const increases = Array.from({ length: derived.level }, (_, i) => i + 1)
    .filter(isAbilityIncreaseLevel)
    .reduce((n, level) => n + (2 - (char.abilityIncreases[level] ?? []).length), 0);
  // Absolute, so having too many counts as something to deal with just as having too few does.
  return derived.unfilledSlots.length
    + Math.max(0, increases)
    + Math.abs(derived.trainedSkillsAllowed - char.trainedSkills.length)
    + Math.abs(derived.languages.allowed - derived.languages.chosen.length);
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
    // Both can also run the other way: removing the level that raised Intelligence shrinks
    // each allowance while the picks already made stay, leaving the character over the
    // limit. That is surfaced here too, so it is fixed from the top of the page rather than
    // only showing as a red badge on the tab and a line inside the Skills panel.
    const untrained = derived.trainedSkillsAllowed - char.trainedSkills.length;
    const unspoken = derived.languages.allowed - derived.languages.chosen.length;
    const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
    const bits: string[] = [];
    let over = false;
    if (untrained > 0) bits.push(`${plural(untrained, 'skill')} to train`);
    if (untrained < 0) { bits.push(`${plural(-untrained, 'trained skill')} too many`); over = true; }
    if (unspoken > 0) bits.push(`${plural(unspoken, 'language')} to choose`);
    if (unspoken < 0) { bits.push(`${plural(-unspoken, 'language')} too many`); over = true; }
    if (bits.length) {
      out.push({
        id: 'skills',
        count: Math.abs(untrained) + Math.abs(unspoken),
        label: bits.join(', '),
        over,
      });
    }
    return out;
  }, [char, derived]);

  const needs = new Map(outstanding.map(o => [o.id, o]));

  // Hold open the panels of every section that owes something. This never touches the saved
  // preference, so a panel collapsed during a level-up folds itself away again once the
  // choice is made rather than having to be collapsed twice.
  const needKeys = outstanding.map(o => o.id).sort().join(',');
  useEffect(() => {
    setForcedOpen('edit-sections', needKeys ? needKeys.split(',').flatMap(id => SECTION_PANELS[id as SectionId]) : []);
    return () => setForcedOpen('edit-sections', []);
  }, [needKeys]);

  // Building a character starts with its ability scores, so Abilities leads while there are
  // no levels yet, and again whenever an increase is waiting to be assigned. Otherwise the
  // page prefers levels and feats, which is what you come back to between sessions.
  const abilitiesFirst = !char.levels.length || needs.has('abilities');
  const rank = (id: SectionId) => {
    const need = needs.get(id);
    // A conflict is something already wrong rather than something still to do, so it comes
    // before everything — including the ability scores of a character with no levels yet,
    // which is the state you land in after removing them all.
    if (need?.over) return 0;
    if (abilitiesFirst && id === 'abilities') return 1;
    return need ? 2 : 3;
  };
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
                <button
                  key={o.id}
                  className={`sm todo-chip${o.over ? ' over' : ''}`}
                  onClick={() => jumpTo(o.id)}
                >
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
            className={`edit-section${need ? (need.over ? ' conflict' : ' needs-attention') : ''}`}
          >
            {need && (
              <div className={`needs-header${need.over ? ' conflict' : ''}`}>
                <strong>{LABELS[id]}</strong>
                <span className={`badge ${need.over ? 'red' : 'accent'}`}>{need.label}</span>
              </div>
            )}
            {body[id]}
          </div>
        );
      })}
    </>
  );
}
