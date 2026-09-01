import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Feature, ResolvedItem } from '../types';
import { FEATURES, BOOK_NAMES, featureName } from '../data';
import { signed } from '../rules/engine';
import { useDismissLayer } from '../dismiss';
import { descriptorsOf, itemStatRows, talentSources, upgradeEffects } from './labels';

const GAP = 8;

type Placement = 'bottom' | 'top' | 'right' | 'left';
const HIDDEN: CSSProperties = { left: 0, top: 0, opacity: 0 };

/**
 * A hover card. Richer than a `title` attribute — it can hold rules text, badges and
 * tables — and it is rendered into a portal so it is never clipped by a panel.
 */
export function Tip({
  content, children, className, wide,
}: {
  /** Nothing renders when this is empty, so callers can pass a maybe-tooltip. */
  content: ReactNode;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>(HIDDEN);
  const [placement, setPlacement] = useState<Placement>('bottom');
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);

  // Measure the card, then try each side in turn and take the first it fits on whole.
  // A tall card hovered from the middle of the page has no room above or below, so it
  // goes beside the anchor instead of being cut off at the edge of the window.
  useLayoutEffect(() => {
    if (!open || !anchor.current || !card.current) return;
    const a = anchor.current.getBoundingClientRect();
    const c = card.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const clamp = (v: number, max: number) => Math.max(GAP, Math.min(v, max - GAP));

    // Room on each side, and where the card would sit if placed there.
    const room = {
      bottom: vh - a.bottom - GAP * 2,
      top: a.top - GAP * 2,
      right: vw - a.right - GAP * 2,
      left: a.left - GAP * 2,
    };
    const centredX = () => clamp(a.left + a.width / 2 - c.width / 2, vw - c.width);
    const centredY = () => clamp(a.top + a.height / 2 - c.height / 2, vh - c.height);
    const spots: Record<Placement, { left: number; top: number; fits: boolean }> = {
      bottom: { left: centredX(), top: a.bottom + GAP, fits: c.height <= room.bottom },
      top: { left: centredX(), top: a.top - c.height - GAP, fits: c.height <= room.top },
      right: { left: a.right + GAP, top: centredY(), fits: c.width <= room.right },
      left: { left: a.left - c.width - GAP, top: centredY(), fits: c.width <= room.left },
    };

    const order: Placement[] = ['bottom', 'top', 'right', 'left'];
    const chosen = order.find(p => spots[p].fits);
    if (chosen) {
      setPlacement(chosen);
      setStyle({ ...spots[chosen], opacity: 1 });
      return;
    }

    // Nowhere fits whole — a very tall card in a short window. Use the roomiest side
    // and clip it there rather than letting it run off the screen.
    const sideways = Math.max(room.right, room.left) >= c.width * 0.8;
    if (sideways) {
      const p: Placement = room.right >= room.left ? 'right' : 'left';
      setPlacement(p);
      setStyle({ ...spots[p], top: GAP, maxHeight: vh - GAP * 2, opacity: 1 });
    } else {
      const p: Placement = room.bottom >= room.top ? 'bottom' : 'top';
      setPlacement(p);
      setStyle({
        left: centredX(),
        top: p === 'bottom' ? a.bottom + GAP : GAP,
        maxHeight: Math.max(room[p], 120),
        opacity: 1,
      });
    }
  }, [open, content]);

  // A tooltip pinned to a stale position is worse than none, so dismiss on any move.
  useLayoutEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // Escape closes the card and nothing else. A card hovered over a picker is the newer
  // layer, so it goes first and the picker underneath stays open — which it would not if
  // this listened for Escape on its own, alongside the dialog's listener.
  const close = useCallback(() => setOpen(false), []);
  useDismissLayer(open, close);

  if (!content) return <>{children}</>;

  return (
    <>
      <span
        ref={anchor}
        className={`tip-anchor${className ? ` ${className}` : ''}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { setOpen(false); setStyle(HIDDEN); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open && createPortal(
        <div
          ref={card}
          className={`tip-card${wide ? ' wide' : ''}`}
          data-placement={placement}
          style={style}
          role="tooltip"
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Rules prose, with the small amount of inline HTML the sources carry. */
function Prose({ lines, limit }: { lines?: string[]; limit?: number }) {
  if (!lines?.length) return null;
  const shown = limit ? lines.slice(0, limit) : lines;
  return (
    <>
      {shown.map((line, i) => <p key={i} dangerouslySetInnerHTML={{ __html: line }} />)}
      {shown.length < lines.length && <p className="faint">…</p>}
    </>
  );
}

/**
 * Which trees a talent comes from, and who can reach them. Only shown for talents: it is the
 * one thing you cannot work out from the talent's own name, and a prerequisite that names a
 * talent is unanswerable without it.
 */
function TalentTrees({ id }: { id: string }) {
  const sources = talentSources(id);
  if (!sources.length) return null;
  // Routes you can actually take first, so the cap never trims a real one in favour of a
  // tradition tree the app does not implement.
  const shown = [...sources].sort((a, b) => Number(a.unsupported) - Number(b.unsupported)).slice(0, 4);
  return (
    <>
      <div className="tip-label">Talent tree{sources.length > 1 ? 's' : ''}</div>
      <table className="tip-rows">
        <tbody>
          {shown.map(s => (
            <tr key={s.tree}>
              <td className={s.unsupported ? 'faint' : undefined}>{s.tree}</td>
              <td className="faint">
                {s.unsupported ? (s.reason ?? 'not supported')
                  : s.classes.length ? s.classes.join(', ')
                    : s.universal ? 'any Force-sensitive character'
                      : '—'}
              </td>
            </tr>
          ))}
          {shown.length < sources.length && (
            <tr><td className="faint">…</td><td className="faint">{sources.length - shown.length} more</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function Section({ title, lines }: { title: string; lines?: string[] }) {
  if (!lines?.length) return null;
  return (
    <>
      <div className="tip-label">{title}</div>
      <Prose lines={lines} limit={3} />
    </>
  );
}

/**
 * What a feat, talent or power actually does. Prerequisites are deliberately left out:
 * by the time it is on your sheet you have met them, and they crowd out the rules.
 *
 * So is the kind of thing it is. Every caller already says it: the sheet groups its chips
 * under Feats / Talents / Force powers, the Force power rows sit under their own heading,
 * a toggle is named after the feat behind it, and a prerequisite line carries its own tag.
 * Repeating it here bought nothing and pushed itself onto a second line whenever the name
 * was long. The descriptors stay — "dark side" is not derivable from where you found it.
 */
export function FeatureTipBody({ feature, spec, note }: { feature: Feature; spec?: string; note?: ReactNode }) {
  const descriptors = descriptorsOf(feature);
  return (
    <div className="tip-body">
      <div className="tip-head">
        <strong>{featureName(feature.id, spec)}</strong>
        {descriptors.map(d => <span key={d.label} className={`badge ${d.cls}`}>{d.label}</span>)}
      </div>
      <div className="tip-source">
        {BOOK_NAMES[feature.book] ?? feature.book}{feature.page ? ` p.${feature.page}` : ''}
      </div>
      {note && <div className="tip-note">{note}</div>}
      {feature.type === 'talent' && <TalentTrees id={feature.id} />}
      <Prose lines={feature.description} limit={4} />
      <Section title="Benefit" lines={feature.benefit} />
      <Section title="Special" lines={feature.special} />
      {feature.incomplete && <p className="faint">No rules text in the data — look it up in the sourcebook.</p>}
    </div>
  );
}

/** Convenience for the common case: a tooltip for a feature we only have the id of. */
export function FeatureTip({
  id, spec, children, className, note,
}: {
  id: string;
  spec?: string;
  children: ReactNode;
  className?: string;
  note?: ReactNode;
}) {
  const feature = FEATURES[id];
  return (
    <Tip
      className={className}
      content={feature ? <FeatureTipBody feature={feature} spec={spec} note={note} /> : null}
    >
      {children}
    </Tip>
  );
}

/** What a piece of gear is, at a glance: its line from the equipment tables. */
export function ItemTipBody({ item, note }: { item: ResolvedItem; note?: ReactNode }) {
  const rows = itemStatRows(item);
  return (
    <div className="tip-body">
      <div className="tip-head">
        <strong>{item.name}</strong>
        <span className="badge">{item.category}</span>
        {item.twoHanded && <span className="badge">two-handed</span>}
        {item.thrown && <span className="badge">thrown</span>}
        {item.custom && <span className="badge green">custom</span>}
        {item.modified && !item.custom && <span className="badge green">modified</span>}
      </div>
      {item.book && item.book !== 'unknown' && (
        <div className="tip-source">{BOOK_NAMES[item.book] ?? item.book}</div>
      )}
      {note && <div className="tip-note">{note}</div>}
      <table className="tip-rows">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}><td className="mono">{value}</td><td>{label}</td></tr>
          ))}
        </tbody>
      </table>
      {!!item.upgrades?.length && (
        <>
          <div className="tip-label">Fitted</div>
          {item.upgrades.map(u => (
            <p key={u.id}>
              <strong>{u.name}</strong>
              {upgradeEffects(u).length ? ` — ${upgradeEffects(u).join(', ')}` : ''}
            </p>
          ))}
        </>
      )}
      {item.notes && <p className="tip-clamp" style={{ marginTop: 'var(--sp-3)' }}>{item.notes}</p>}
    </div>
  );
}

export interface TipRow {
  label: string;
  /** Rendered as a signed modifier; use `text` instead for dice and other values. */
  value?: number;
  text?: string;
}

/** The working behind a number: one row per contributing modifier, then the total. */
export function TipRows({
  title, rows, total, footer,
}: { title?: string; rows: TipRow[]; total?: string; footer?: ReactNode }) {
  const shown = rows.filter(r => r.text !== undefined || (r.value ?? 0) !== 0);
  return (
    <div className="tip-body">
      {title && <div className="tip-head"><strong>{title}</strong></div>}
      {shown.length === 0
        ? <p className="faint">No modifiers apply.</p>
        : (
          <table className="tip-rows">
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.text ?? signed(r.value ?? 0)}</td>
                  <td>{r.label}</td>
                </tr>
              ))}
              {total !== undefined && (
                <tr className="tip-total">
                  <td className="mono">{total}</td>
                  <td>total</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      {footer && <div className="tip-note">{footer}</div>}
    </div>
  );
}
