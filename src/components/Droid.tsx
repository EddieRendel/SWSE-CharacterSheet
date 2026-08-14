import type { Character } from '../types';
import { DROIDS, droidSize } from '../data';
import { signed } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { Panel, Field } from './ui';

const CATEGORIES: [string, string][] = [
  ['locomotion', 'Locomotion'], ['appendage', 'Appendages'], ['processor', 'Processor'],
  ['sensor', 'Sensors'], ['communications', 'Communications'], ['translator', 'Translator'],
  ['shield', 'Shields'], ['station', 'Stations'], ['accessory', 'Accessories'],
];

/**
 * Costs are size-scaled formulas as often as plain numbers. Resolve the ones we can
 * read and leave the rest showing their formula rather than inventing a figure.
 */
function resolveCost(formula: string | undefined, costFactor: number): number | null {
  if (!formula) return null;
  const plain = Number(String(formula).replace(/,/g, ''));
  if (Number.isFinite(plain)) return plain;
  const m = String(formula).match(/^(\d+)\s*x\s*Cost Factor$/i);
  return m ? Number(m[1]) * costFactor : null;
}

/** Droid build: degree, size and installed systems. */
export function Droid({
  char, derived, update,
}: { char: Character; derived: Derived; update: (fn: (c: Character) => void) => void }) {
  const d = char.droid;
  const size = droidSize(d.size);
  const degree = DROIDS.degrees.find(x => x.id === d.degree);
  const installed = derived.droidSystems;

  const setDegree = (id: string) => update(c => { c.droid.degree = id || null; });
  const setSize = (id: string) => update(c => { c.droid.size = id; });
  const addSystem = (id: string) => update(c => { c.droid.systems = [...c.droid.systems, id]; });
  const removeSystem = (i: number) =>
    update(c => { c.droid.systems = c.droid.systems.filter((_, n) => n !== i); });

  const appendages = installed.reduce((n, s) => n + (s.appendages ?? 0), 0);
  const hasProcessor = installed.some(s => s.category === 'processor');
  const hasLocomotion = installed.some(s => s.category === 'locomotion');

  const priced = installed.map(s => resolveCost(s.cost, size.costFactor));
  const totalKnown = priced.reduce<number>((a, b) => a + (b ?? 0), 0);
  const unresolved = priced.filter(p => p === null).length;

  return (
    <Panel title="Droid chassis" className="framed tint-green">
      <p className="hint" style={{ marginBottom: 12 }}>
        Droids have no Constitution score: no bonus hit points from it, and Strength applies to
        Fortitude Defense instead. They are immune to poison, disease, radiation, vacuum,
        mind-affecting and stunning effects, cannot be Force-sensitive, and cannot take the Jedi class.
      </p>

      {(!degree || !hasProcessor || !hasLocomotion) && (
        <div className="notice warn" style={{ marginBottom: 12 }}>
          {!degree && 'Choose a degree. '}
          {!hasLocomotion && 'Fit a locomotion system. '}
          {!hasProcessor && 'Fit a processor — a droid hero needs a Basic or Heuristic Processor.'}
        </div>
      )}

      <div className="grid g2">
        <Field label="Degree">
          <select value={d.degree ?? ''} onChange={e => setDegree(e.target.value)}>
            <option value="">— choose —</option>
            {DROIDS.degrees.map(x => (
              <option key={x.id} value={x.id}>{x.name} — {x.roles}</option>
            ))}
          </select>
          {degree && (
            <p className="hint" style={{ marginTop: 6 }}>
              {Object.entries(degree.abilities)
                .map(([a, v]) => `${signed(v as number)} ${a.toUpperCase()}`).join(', ')}
              {' · '}talent tree available on every talent slot
            </p>
          )}
        </Field>

        <Field label="Size">
          <div className="row">
            {DROIDS.sizes.filter(x => x.playable).map(x => (
              <button
                key={x.id}
                className={`sm ${d.size === x.id ? 'primary' : ''}`}
                onClick={() => setSize(x.id)}
              >
                {x.id}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            {Object.entries(size.abilities).length
              ? Object.entries(size.abilities)
                .map(([a, v]) => `${signed(v as number)} ${a.toUpperCase()}`).join(', ') + ' · '
              : ''}
            {signed(size.reflex)} Reflex · {signed(size.stealth)} Stealth · carry ×{size.carry}
            {' · '}cost factor ×{size.costFactor}
          </p>
          <p className="hint">Player droids are Medium or Small; larger chassis are GM-run.</p>
        </Field>
      </div>

      <div className="grid g4" style={{ marginTop: 14 }}>
        <div className="stat">
          <div className="label">Appendages</div>
          <div className="value">{appendages}</div>
        </div>
        <div className="stat">
          <div className="label">Speed</div>
          <div className="value">{derived.speed}<span style={{ fontSize: 12 }}> sq</span></div>
        </div>
        <div className="stat">
          <div className="label">Systems fitted</div>
          <div className="value">{installed.length}</div>
        </div>
        <div className="stat">
          <div className="label">Systems cost</div>
          <div className="value" style={{ fontSize: 18 }}>{totalKnown.toLocaleString()}</div>
          <div className="sub">{unresolved ? `${unresolved} priced by formula` : 'credits'}</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Field label="Installed systems">
          {installed.length === 0 ? (
            <div className="empty">Nothing fitted yet.</div>
          ) : (
            <div className="list">
              {installed.map((s, i) => (
                <div key={`${s.id}-${i}`} className="item">
                  <span className="badge">{s.category}</span>
                  <div className="grow">
                    <div className="name">{s.name}</div>
                    <div className="meta">
                      {priced[i] !== null ? `${priced[i]!.toLocaleString()} credits` : (s.cost ?? 'cost unlisted')}
                      {s.appendages ? ` · ${s.appendages} appendage${s.appendages > 1 ? 's' : ''}` : ''}
                      {s.unarmedDamage ? ` · unarmed ${s.unarmedDamage}` : ''}
                      {s.baseSpeed ? ` · base speed ${s.baseSpeed}` : ''}
                    </div>
                  </div>
                  <button className="sm ghost" onClick={() => removeSystem(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </Field>
      </div>

      <div style={{ marginTop: 14 }}>
        <Field label="Fit a system">
          <div className="grid g3">
            {CATEGORIES.map(([cat, label]) => (
              <select
                key={cat}
                value=""
                onChange={e => { if (e.target.value) addSystem(e.target.value); }}
              >
                <option value="">{label}…</option>
                {Object.values(DROIDS.systems)
                  .filter(s => s.category === cat)
                  .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            A droid hero starts with a Heuristic Processor, two appendages, and up to{' '}
            {DROIDS.startingSystemCredits.toLocaleString()} credits of further systems. Costs given
            as a formula scale with the chassis and are left for you to work out.
          </p>
        </Field>
      </div>
    </Panel>
  );
}
