import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Character, FeatCombo, Feature, FeatureRef, ResolvedItem } from '../types';
import { BOOK_NAMES, CLASSES, specName, featureName, featureIcon, portraitUrl, classIcon, combosForFeature } from '../data';
import { combosForFeatureState, isSameHalf } from '../rules/engine';
import { readPortrait } from '../storage';
import { useCollapsePanel } from '../collapse';
import { useDismissLayer } from '../dismiss';
import { descriptorsOf, itemStatRows, prerequisiteText, readDescription, upgradeEffects } from './labels';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

/**
 * Pass `collapseId` to let the player fold the panel away. The id keys the saved preference,
 * so it must stay stable even where the title does not — "Class progression — level 7"
 * changes every level.
 */
export function Panel({
  title, actions, children, collapseId, className,
}: {
  title?: string; actions?: ReactNode; children: ReactNode;
  collapseId?: string;
  /** `reference` sits the panel flatter than the live surfaces on the sheet. */
  className?: string;
}) {
  const [openPref, toggle] = useCollapsePanel(collapseId ?? '');
  const foldable = !!collapseId && !!title;
  const open = !foldable || openPref;

  return (
    <section className={`panel${foldable && !open ? ' collapsed' : ''}${className ? ` ${className}` : ''}`}>
      {title && (
        <header>
          {foldable ? (
            <button
              type="button"
              className="panel-toggle"
              aria-expanded={open}
              title={open ? 'Collapse' : 'Expand'}
              onClick={toggle}
            >
              <span className="caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
              <h2>{title}</h2>
            </button>
          ) : <h2>{title}</h2>}
          <div className="spacer" />
          {actions}
        </header>
      )}
      {open && children}
    </section>
  );
}

/** Wrap one in a `Tip` to explain where the number comes from. */
export function Stat({
  label, value, sub,
}: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Rules text may contain a small amount of inline HTML (<strong>, <em>). */
export function RulesText({ lines }: { lines?: string[] }) {
  if (!lines?.length) return null;
  return (
    <div className="rules-text">
      {lines.map((line, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: line }} />
      ))}
    </div>
  );
}

export function Modal({
  title, onClose, children, footer, wide,
}: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  // Escape closes the topmost layer only, and hover cards share that stack — see dismiss.ts.
  useDismissLayer(true, onClose);

  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={wide ? { maxWidth: 1040 } : undefined}>
        <header>
          <h2 style={{ fontSize: 'var(--fs-md)' }}>{title}</h2>
          <div className="spacer" />
          <button className="ghost" onClick={onClose}>✕</button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/** A character portrait, falling back to their initial when none is set. */
export function Portrait({
  portrait, name, size = 40,
}: { portrait: string | null | undefined; name?: string; size?: number }) {
  const src = portraitUrl(portrait);
  if (src) {
    return <img className="portrait" src={src} alt="" width={size} height={size} />;
  }
  return (
    <div
      className="portrait placeholder"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {(name ?? '?').trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}

/** A clickable portrait that opens the portrait editor. */
export function PortraitButton({
  char, update, size = 96, title = 'Change portrait',
}: {
  char: Character;
  update: (fn: (c: Character) => void) => void;
  size?: number;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <button
        className="portrait-button"
        title={title}
        aria-label={title}
        onClick={() => setEditing(true)}
        style={{ width: size, height: size }}
      >
        <Portrait portrait={char.portrait} name={char.name} size={size} />
        <span className="portrait-overlay">Change</span>
      </button>
      {editing && <PortraitEditor char={char} update={update} onClose={() => setEditing(false)} />}
    </>
  );
}

function PortraitEditor({
  char, update, onClose,
}: { char: Character; update: (fn: (c: Character) => void) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl = await readPortrait(file);
      update(c => { c.portrait = dataUrl; });
      onClose();
    } catch {
      alert('That image could not be read. Try a JPEG or PNG.');
    } finally {
      setBusy(false);
    }
  };

  const withIcons = Object.values(CLASSES).filter(c => classIcon(c.id));

  return (
    <Modal title="Portrait" onClose={onClose} footer={<button onClick={onClose}>Done</button>}>
      <div className="row" style={{ marginBottom: 'var(--sp-7)' }}>
        <Portrait portrait={char.portrait} name={char.name} size={64} />
        <div className="grow">
          <button className="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? 'Processing…' : 'Upload an image'}
          </button>
          {char.portrait && (
            <button
              className="danger"
              style={{ marginLeft: 'var(--sp-4)' }}
              onClick={() => { update(c => { c.portrait = null; }); onClose(); }}
            >
              Remove
            </button>
          )}
          <p className="hint" style={{ marginTop: 'var(--sp-3)', marginBottom: '0' }}>
            Images are cropped square and scaled to 256px before being stored.
          </p>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      <h3 style={{ marginBottom: 'var(--sp-4)' }}>Or pick a class image</h3>
      <div className="portrait-choices">
        {withIcons.map(c => (
          <button
            key={c.id}
            className={`portrait-choice ${char.portrait === `class:${c.id}` ? 'selected' : ''}`}
            title={c.name}
            onClick={() => { update(x => { x.portrait = `class:${c.id}`; }); onClose(); }}
          >
            <img src={classIcon(c.id)} alt={c.name} loading="lazy" />
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Artwork for a feature, or nothing at all when there is no file for it. */
export function FeatureIcon({
  id, spec, size = 22,
}: { id: string; spec?: string; size?: number }) {
  const src = featureIcon(id, spec);
  if (!src) return null;
  return <img className="feature-icon" src={src} alt="" width={size} height={size} loading="lazy" />;
}

export function Descriptors({ feature, compact }: { feature: Feature; compact?: boolean }) {
  const tags = descriptorsOf(feature);
  if (!tags.length) return null;
  return (
    <>
      {tags.map(t => (
        <span key={t.label} className={`badge ${t.cls}`} title={`${t.label} descriptor`}>
          {compact ? t.label.replace('lightsaber form', 'form').replace('mind-affecting', 'mind') : t.label}
        </span>
      ))}
    </>
  );
}

/**
 * Everything the data holds about one item, the way FeatureDetail does for a feat. The
 * hover card clamps its description at six lines, which is short of half of what the
 * longest entries carry, so clicking gets you the rest.
 */
export function ItemDetail({ item }: { item: ResolvedItem }) {
  const rows = itemStatRows(item);
  return (
    <div>
      <div className="row" style={{ marginBottom: 'var(--sp-5)', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 'var(--fs-lg)' }}>{item.name}</h3>
        <span className={`badge ${item.category === 'weapon' ? 'blue' : item.category === 'armor' ? 'purple' : ''}`}>
          {item.category}
        </span>
        {item.twoHanded && <span className="badge">two-handed</span>}
        {item.thrown && <span className="badge">thrown</span>}
        {item.stun && <span className="badge">stun setting</span>}
        {item.custom && <span className="badge green">custom</span>}
        {item.modified && !item.custom && <span className="badge green">modified</span>}
        {item.book && item.book !== 'unknown' && (
          <span className="badge">{BOOK_NAMES[item.book] ?? item.book}</span>
        )}
      </div>

      {rows.length > 0 && (
        <div className="table-scroll" style={{ marginBottom: 'var(--sp-6)' }}>
          <table>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td className="faint" style={{ width: '40%' }}>{label}</td>
                  <td className="mono">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* What has been fitted to this one copy, above the printed entry it started as. */}
      {!!item.upgrades?.length && (
        <>
          <div className="rules-section-label">Modifications</div>
          <div className="rules-text">
            {item.upgrades.map(u => {
              const effects = upgradeEffects(u).join(', ');
              return (
                <p key={u.id}>
                  <strong>{u.name}</strong>
                  {effects && ` — ${effects}`}
                  {u.notes && `. ${u.notes}`}
                </p>
              );
            })}
          </div>
        </>
      )}

      {/* The importer joins the compendium's paragraphs into one string, so there are no
          breaks left to honour — a single block is all the data supports. */}
      {item.notes
        ? <div className="rules-text"><p>{item.notes}</p></div>
        : (
          <p className="hint">
            {item.custom
              ? 'No notes on this custom item — use ✎ to add some.'
              : 'The compendium carries no description for this item. Look it up in your sourcebook.'}
          </p>
        )}
    </div>
  );
}

/** The other halves of a Combined Feat, named the way the picker names them. */
const otherHalves = (combo: FeatCombo, id: string) =>
  combo.features.filter(f => f.id !== id).map(f => featureName(f.id, f.spec));

/**
 * The Combined Feats a feat takes part in, shown on both halves so that either one tells you
 * the other exists. Nothing at all for the features that are in none, which is nearly all
 * of them.
 *
 * The wording repeats the "Combined Feat (…)" line in the feat's own text above, deliberately:
 * that line is the same however the character is built, and the only thing worth knowing —
 * whether you actually have the other half — is what the prose cannot say and this does.
 *
 * The state is worked out from `held` rather than stored, so the block says the same thing
 * wherever it is opened from. In the picker `held` does not yet include the feat being looked
 * at — that is the "completes this" case, and the one worth shouting about, since it is the
 * only moment the player can act on it.
 */
function ComboBlock({
  feature, spec, char, held,
}: { feature: Feature; spec?: string; char?: Character; held?: FeatureRef[] }) {
  // Without a character — the rules compendium — there is no state to report, only the fact
  // that the combo exists and what it takes.
  const states = char && held
    ? combosForFeatureState(char, feature.id, held)
    : combosForFeature(feature.id).map(combo => ({ combo, missing: [], active: false }));
  if (!states.length) return null;
  const known = !!(char && held);

  return (
    <>
      <div className="rules-section-label">
        Combined feat{states.length > 1 ? 's' : ''}
      </div>
      <div className="col" style={{ gap: 'var(--sp-4)' }}>
        {states.map(({ combo, missing, active }) => {
          const wanting = missing
            .filter(f => !isSameHalf(f, feature.id, spec))
            .map(f => featureName(f.id, f.spec));
          const completes = known && !active && wanting.length === 0;
          return (
            <div key={combo.id} className={`combo${active ? ' on' : ''}`}>
              <div className="row" style={{ gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' }}>
                <span className="name grow">{combo.name}</span>
                {active && <span className="badge green">active</span>}
                {completes && <span className="badge accent">completes this</span>}
                {known && !active && !completes && <span className="badge">inactive</span>}
                {/* One badge per printing. Two books carry two of these, and naming only the
                    first would leave a Jedi Academy character wondering why a KotOR rule is
                    on — the answer is the book their own feat came from. */}
                {combo.sources.map(source => (
                  <span key={source.book} className="badge">
                    {BOOK_NAMES[source.book] ?? source.book}{source.page ? ` p.${source.page}` : ''}
                  </span>
                ))}
              </div>
              <RulesText lines={combo.effect} />
              <p className={`hint${completes ? ' ok' : ''}`} style={{ margin: '0' }}>
                {active
                  ? `On, because you hold both halves — it costs no feat and was never chosen.`
                  : completes
                    ? `You already have ${otherHalves(combo, feature.id).join(' and ')}. Take this and it turns on, at no further cost.`
                    : wanting.length > 0
                      ? `Also needs ${wanting.join(' and ')}.`
                      : `Held together with ${otherHalves(combo, feature.id).join(' and ')}.`}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function FeatureDetail({
  feature, spec, char, held,
}: {
  feature: Feature;
  spec?: string;
  /** The character reading it, when there is one — combos are judged against them. */
  char?: Character;
  /** Every feature that character holds, i.e. `derived.features`. */
  held?: FeatureRef[];
}) {
  // The book's own order: a sentence saying what the feat is, then what it takes, then the
  // rules. So the hint sits between the lead-in prose and the first headed section rather
  // than below everything — which is also where the line it replaced used to be.
  const blocks = readDescription(feature, combosForFeature(feature.id));
  const firstSection = blocks.findIndex(b => b.label);
  const [intro, sections] = firstSection < 0
    ? [blocks, []]
    : [blocks.slice(0, firstSection), blocks.slice(firstSection)];

  return (
    <div>
      <div className="row" style={{ marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <FeatureIcon id={feature.id} spec={spec} size={40} />
        <h3 style={{ fontSize: 'var(--fs-lg)' }}>
          {feature.name}{spec ? ` (${specName(spec, feature)})` : ''}
        </h3>
        <span className={`badge ${feature.type === 'talent' ? 'purple' : 'blue'}`}>{feature.type.replace('-', ' ')}</span>
        <Descriptors feature={feature} />
        <span className="badge">
          {BOOK_NAMES[feature.book] ?? feature.book}{feature.page ? ` p.${feature.page}` : ''}
        </span>
        {feature.multiple && (
          <span className="badge green">
            repeatable{feature.maxCount ? ` ×${feature.maxCount}` : ''}
          </span>
        )}
        {feature.summaryOnly && <span className="badge">summary only</span>}
        {feature.hidden && <span className="badge red">unsupported</span>}
        {feature.incomplete && <span className="badge red">text unavailable</span>}
      </div>

      {feature.hidden && (
        <div className="notice warn" style={{ marginBottom: 'var(--sp-5)' }}>
          Hidden from the pickers: {feature.hiddenReason}. It stays in the data and becomes
          selectable if that content is added.
        </div>
      )}

      {feature.summaryOnly && (
        <div className="notice" style={{ marginBottom: 'var(--sp-5)' }}>
          Condensed from the summary spreadsheets rather than the full rules text — check your
          sourcebook{feature.page ? ` (page ${feature.page})` : ''} for the complete wording.
        </div>
      )}

      {feature.incomplete && (
        <div className="notice warn" style={{ marginBottom: 'var(--sp-5)' }}>
          The rules data references this entry but never defines it. You can still select it —
          look the full text up in your sourcebook.
        </div>
      )}

      {/* Effect, Normal, Special and Benefit all read as headed sections now, wherever the
          data happened to put them — see readDescription, which also cuts the prerequisite
          paragraph the hint restates and the "Combined Feat (…)" lines the cards below
          restate. Both cuts are conditional on the replacement actually being there. */}
      {intro.map((block, i) => <RulesText key={i} lines={block.lines} />)}

      {feature.prerequisites && (
        <p className="hint">
          <span className="label">Prerequisites:</span> {prerequisiteText(feature.prerequisites)}
        </p>
      )}
      {feature.unparsedPrerequisites?.length && (
        <p className="hint warn">
          Not enforced automatically: {feature.unparsedPrerequisites.join('; ')}
        </p>
      )}
      {sections.map((block, i) => (block.label
        ? <RulesSection key={i} label={block.label} lines={block.lines} />
        : <RulesText key={i} lines={block.lines} />))}
      <ComboBlock feature={feature} spec={spec} char={char} held={held} />
    </div>
  );
}

/** One headed block of rules text — Benefit, Normal, Special. Nothing when the data has none. */
function RulesSection({ label, lines }: { label: string; lines?: string[] }) {
  if (!lines?.length) return null;
  return (
    <>
      <div className="rules-section-label">{label}</div>
      <RulesText lines={lines} />
    </>
  );
}
