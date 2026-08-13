import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Character, Feature } from '../types';
import { BOOK_NAMES, WEAPON_GROUPS, SKILLS, CLASSES, FEATURES, EQUIPMENT, featureIcon, portraitUrl, classIcon } from '../data';
import { readPortrait } from '../storage';
import { useCollapsePanel } from '../collapse';

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
  title, actions, children, collapseId,
}: { title?: string; actions?: ReactNode; children: ReactNode; collapseId?: string }) {
  const [openPref, toggle] = useCollapsePanel(collapseId ?? '');
  const foldable = !!collapseId && !!title;
  const open = !foldable || openPref;

  return (
    <section className={`panel${foldable && !open ? ' collapsed' : ''}`}>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={wide ? { maxWidth: 1040 } : undefined}>
        <header>
          <h2 style={{ fontSize: 15 }}>{title}</h2>
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
      <div className="row" style={{ marginBottom: 14 }}>
        <Portrait portrait={char.portrait} name={char.name} size={64} />
        <div className="grow">
          <button className="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? 'Processing…' : 'Upload an image'}
          </button>
          {char.portrait && (
            <button
              className="danger"
              style={{ marginLeft: 8 }}
              onClick={() => { update(c => { c.portrait = null; }); onClose(); }}
            >
              Remove
            </button>
          )}
          <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
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

      <h3 style={{ marginBottom: 8 }}>Or pick a class image</h3>
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

/** A chosen specialization, by name: a skill, a weapon group, a talent, or a plain option. */
export const specLabel = (spec: string, feature?: Feature) =>
  SKILLS[spec]?.name
  ?? WEAPON_GROUPS[spec]
  ?? FEATURES[spec]?.name
  ?? EQUIPMENT[spec]?.name
  ?? feature?.specOptions?.find(o => o.id === spec)?.name
  ?? spec;

/**
 * Descriptors carried by Force powers. They matter at the table: dark side powers
 * add to your Dark Side Score, lightsaber forms interact with form talents, and
 * telekinetic / mind-affecting powers are targeted by specific defences.
 */
export const DESCRIPTORS: { key: keyof Feature; label: string; cls: string }[] = [
  { key: 'darkSide', label: 'dark side', cls: 'red' },
  { key: 'lightSide', label: 'light side', cls: 'blue' },
  { key: 'lightsaberForm', label: 'lightsaber form', cls: 'accent' },
  { key: 'telekinetic', label: 'telekinetic', cls: 'purple' },
  { key: 'mindAffecting', label: 'mind-affecting', cls: 'green' },
];

export const descriptorsOf = (feature: Feature) => DESCRIPTORS.filter(d => feature[d.key]);

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

/** Full rules display for a feat / talent / power. */
export function FeatureDetail({ feature, spec }: { feature: Feature; spec?: string }) {
  return (
    <div>
      <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
        <FeatureIcon id={feature.id} spec={spec} size={40} />
        <h3 style={{ fontSize: 16 }}>
          {feature.name}{spec ? ` (${specLabel(spec, feature)})` : ''}
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
        <div className="notice warn" style={{ marginBottom: 10 }}>
          Hidden from the pickers: {feature.hiddenReason}. It stays in the data and becomes
          selectable if that content is added.
        </div>
      )}

      {feature.summaryOnly && (
        <div className="notice" style={{ marginBottom: 10 }}>
          Condensed from the summary spreadsheets rather than the full rules text — check your
          sourcebook{feature.page ? ` (page ${feature.page})` : ''} for the complete wording.
        </div>
      )}

      {feature.incomplete && (
        <div className="notice warn" style={{ marginBottom: 10 }}>
          The rules data references this entry but never defines it. You can still select it —
          look the full text up in your sourcebook.
        </div>
      )}

      <RulesText lines={feature.description} />

      {feature.prerequisites && (
        <p className="hint"><span className="label">Prerequisites:</span> {feature.prerequisites}</p>
      )}
      {feature.unparsedPrerequisites?.length && (
        <p className="hint warn">
          Not enforced automatically: {feature.unparsedPrerequisites.join('; ')}
        </p>
      )}
      {feature.benefit && (<><div className="label" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 10 }}>Benefit</div><RulesText lines={feature.benefit} /></>)}
      {feature.normal && (<><div className="label" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 10 }}>Normal</div><RulesText lines={feature.normal} /></>)}
      {feature.special && (<><div className="label" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 10 }}>Special</div><RulesText lines={feature.special} /></>)}
    </div>
  );
}
