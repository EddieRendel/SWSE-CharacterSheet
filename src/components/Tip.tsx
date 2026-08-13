import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { EquipmentItem, Feature } from '../types';
import { FEATURES, BOOK_NAMES, WEAPON_GROUPS, damageLabel } from '../data';
import { signed } from '../rules/engine';
import { descriptorsOf, specLabel } from './ui';

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
 */
export function FeatureTipBody({ feature, spec, note }: { feature: Feature; spec?: string; note?: ReactNode }) {
  const descriptors = descriptorsOf(feature);
  return (
    <div className="tip-body">
      <div className="tip-head">
        <strong>{feature.name}{spec ? ` (${specLabel(spec, feature)})` : ''}</strong>
        <span className="badge">{feature.type.replace('-', ' ')}</span>
        {descriptors.map(d => <span key={d.label} className={`badge ${d.cls}`}>{d.label}</span>)}
      </div>
      <div className="tip-source">
        {BOOK_NAMES[feature.book] ?? feature.book}{feature.page ? ` p.${feature.page}` : ''}
      </div>
      {note && <div className="tip-note">{note}</div>}
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
export function ItemTipBody({ item, note }: { item: EquipmentItem; note?: ReactNode }) {
  const stats: [string, string | undefined][] = [
    // Says "varies" or "No damage" rather than dropping the row, so a weapon the compendium
    // gives no dice for does not look like an oversight. The prose below explains which.
    ['Damage', damageLabel(item) && `${damageLabel(item)}${item.stun ? ' (stun setting)' : ''}`],
    ['Group', item.group ? WEAPON_GROUPS[item.group] ?? item.group : undefined],
    ['Rate of fire', item.rateOfFire],
    ['Area', item.area],
    ['Delay', item.delay],
    ['Reflex', item.reflex ? `+${item.reflex}` : undefined],
    ['Fortitude', item.fortitude ? `+${item.fortitude}` : undefined],
    ['Max Dex', item.maxDex !== undefined ? `+${item.maxDex}` : undefined],
    ['Armor', item.armorType],
    ['Size', item.size],
    ['Cost', item.cost ? `${item.cost.toLocaleString()} cr` : undefined],
    ['Weight', item.weight ? `${item.weight} kg` : undefined],
  ];
  const rows = stats.filter((s): s is [string, string] => Boolean(s[1]));
  return (
    <div className="tip-body">
      <div className="tip-head">
        <strong>{item.name}</strong>
        <span className="badge">{item.category}</span>
        {item.twoHanded && <span className="badge">two-handed</span>}
        {item.custom && <span className="badge green">custom</span>}
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
      {item.notes && <p className="tip-clamp" style={{ marginTop: 6 }}>{item.notes}</p>}
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
