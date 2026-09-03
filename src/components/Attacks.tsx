import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { Character } from '../types';
import { signed, hasFeature, countFeature, forcePowerUses } from '../rules/engine';
import type { Derived } from '../rules/engine';
import {
  buildAttacks, buildPowers, buildForcePointAbilities,
  defaultAttackOptions, MODIFIERS, twoWeaponPenalty, dualWeaponMasteryId,
} from '../rules/attacks';
import type { AttackOptions, AttackProfile, ModifierEffect } from '../rules/attacks';
import { Panel, Modal, ItemDetail, NumberField } from './ui';
import { Tip, FeatureTip, FeatureTipBody, ItemTipBody, TipRows } from './Tip';
import { TurnActions } from './TurnActions';
import { useCollapsePanel } from '../collapse';
import { autoFocusSearch } from '../pointer';
import { FEATURES } from '../data';

/** The rules behind a control, when a feature grants it; otherwise just the explanation. */
function toggleTip(id: string, hint: string) {
  const feature = FEATURES[id];
  return feature
    ? <FeatureTipBody feature={feature} note={hint} />
    : <div className="tip-body"><p>{hint}</p></div>;
}

const NUM = { fontWeight: 700, color: 'var(--sheet-accent)' } as const;

/** The total, with its working shown on hover rather than cluttering the sheet. */
function Breakdown({
  title, rows, total, footer, children,
}: {
  title: string;
  rows: { label: string; value?: number; text?: string }[];
  total: string;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Tip content={<TipRows title={title} rows={rows} total={total} footer={footer} />}>
      <span className="mono breakdown" style={NUM}>{children ?? total}</span>
    </Tip>
  );
}

// ---------------------------------------------------------------------------
// The Modifiers band.
//
// It used to be every switch the character had, laid out in one wrapping row. That was
// fine at 3rd level and unreadable by 15th, where a dozen feats and talents each want a
// button. The band shows what is *on* now, and everything else lives behind one button —
// so it stays a line or two however many modifiers a character collects.
// ---------------------------------------------------------------------------

/**
 * How many active modifiers the band names before it stops and points at the picker.
 *
 * A phone gets fewer, because a chip there is a different size of thing: every button grows
 * to a 44px tap target under `pointer: coarse`, so a pill that is one line on the sheet is
 * sixty pixels tall and takes the row to itself. Six of those is most of a screen before the
 * first attack row. Three is two rows either way, which is what the band is for.
 */
const BAND_CHIPS = { wide: 6, phone: 3 };

/**
 * Whether this is a phone-shaped screen, watched rather than read once: a window is resized
 * and a phone is rotated mid-session, where the pointer type in `pointer.ts` genuinely
 * cannot change. Both halves matter — a tablet has the coarse pointer but not the width, and
 * a narrow desktop window has the width but keeps its small controls.
 */
const PHONE = window.matchMedia('(pointer: coarse) and (max-width: 640px)');
const watchPhone = (cb: () => void) => {
  PHONE.addEventListener('change', cb);
  return () => PHONE.removeEventListener('change', cb);
};
const usePhone = () => useSyncExternalStore(watchPhone, () => PHONE.matches);

type Section = 'action' | 'melee' | 'ranged' | 'force' | 'circumstance';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'action', label: 'Action' },
  { id: 'melee', label: 'Melee' },
  { id: 'ranged', label: 'Ranged' },
  { id: 'force', label: 'Force' },
  { id: 'circumstance', label: 'Circumstance' },
];

/** One row in the picker, and one chip in the band when it is on. */
interface Switch {
  key: string;
  section: Section;
  label: string;
  /** What it does to the numbers, read off the table rather than written down twice. */
  detail: string;
  hint: string;
  /** The feature behind it, so the row can show the book's own words. '' when there is none. */
  featureId: string;
  /** 0 is off; otherwise the 1-based tier. */
  tier: number;
  tierLabels?: string[];
  set: (tier: number) => void;
}

const SCALE_WORDS: Record<NonNullable<ModifierEffect['damageScale']>, string> = {
  'half-level': 'half your level',
  'level': 'your level',
  'str-mod': 'Strength again',
  'dex-mod': 'Dexterity again',
};

const diceWord = (n: number) => `+${n} ${n === 1 ? 'die' : 'dice'}`;

/** The numbers a modifier contributes, as a phrase short enough to sit on a chip. */
function summarise(e: ModifierEffect): string {
  return [
    e.attack ? `${signed(e.attack)} attack` : '',
    e.attackScale ? `${SCALE_WORDS[e.attackScale]} on attack` : '',
    e.damage ? `${signed(e.damage)} damage` : '',
    e.damageScale ? `${SCALE_WORDS[e.damageScale]} on damage` : '',
    e.weaponDice ? diceWord(e.weaponDice) : '',
    e.extraDice ? `+${e.extraDice}` : '',
  ].filter(Boolean).join(', ');
}

/** Every modifier row, in picker order, for this character and the weapons in hand. */
function buildSwitches(
  have: { id: string; spec?: string }[],
  attacks: AttackProfile[],
  opts: AttackOptions,
  setOpts: (fn: (o: AttackOptions) => AttackOptions) => void,
  extras: { twoWeaponLabel: string; sneakDice: number; anyStun: boolean; dwmId: string },
): Switch[] {
  const flag = (k: 'stunSetting' | 'fullAttack' | 'pointBlank' | 'aim' | 'flatFooted') =>
    (tier: number) => setOpts(o => ({ ...o, [k]: tier > 0 }));

  // What is actually in hand. A character with no blaster drawn has no use for a page of
  // ranged switches, and the picker is shorter for leaving them out.
  const hasMelee = attacks.some(a => a.melee);
  const hasRanged = attacks.some(a => !a.melee);
  const drawnGroups = new Set(attacks.map(a => a.weapon.group ?? ''));

  // Which feats each shared situation actually turns on, so the switch can say so rather
  // than leaving the player to wonder what "Aimed" is for.
  const because = (need: string, base: string) => {
    const names = MODIFIERS.filter(m => m.needs === need && hasFeature(have, m.id)).map(m => m.label);
    return names.length ? `${base} Turns on ${names.join(', ')}.` : base;
  };

  const out: Switch[] = [];
  const situation = (
    key: string, label: string, detail: string, hint: string, featureId: string,
    on: boolean, set: (tier: number) => void,
  ) => out.push({ key, section: 'action', label, detail, hint, featureId, tier: on ? 1 : 0, set });

  // Two hands on one weapon and a weapon in each hand are mutually exclusive, so each
  // switches the other off rather than letting both look active.
  if (hasMelee) {
    situation('twoHanded', 'Two-handed', 'doubles Strength on damage',
      'Holding the weapon in two hands applies double your Strength bonus to melee damage. '
      + 'Weapons the data marks two-handed already get this without the switch.',
      '', opts.twoHanded,
      t => setOpts(o => ({ ...o, twoHanded: t > 0, twoWeapon: t > 0 ? false : o.twoWeapon })));
  }
  situation('twoWeapon', 'Two weapons', extras.twoWeaponLabel,
    'A weapon in each hand, or both ends of a double weapon, as part of a full attack: one '
    + 'attack with each, and a penalty on every attack roll until the start of your next turn. '
    + (extras.dwmId
      ? 'Dual Weapon Mastery reduces this, but only with weapons you are proficient with — an '
        + 'unfamiliar weapon still takes the full −10.'
      : 'Dual Weapon Mastery I, II and III reduce it to −5, −2 and nothing.'),
    // The tier held is what explains the number on the switch, so the row opens its entry.
    extras.dwmId, opts.twoWeapon,
    t => setOpts(o => ({ ...o, twoWeapon: t > 0, twoHanded: t > 0 ? false : o.twoHanded })));

  if (extras.anyStun) {
    situation('stunSetting', 'Stun setting', 'switches to stun',
      because('stunSetting',
        'Switch every weapon that has a stun setting over to it, or back — a swift action either '
        + 'way. Half the damage comes off hit points, and only creatures are affected.'),
      '', opts.stunSetting, flag('stunSetting'));
  }
  if (hasFeature(have, 'double-attack') || hasFeature(have, 'triple-attack')
    || MODIFIERS.some(m => m.needs === 'fullAttack' && hasFeature(have, m.id))) {
    situation('fullAttack', 'Full attack', '−5 per extra attack',
      because('fullAttack', 'Enables Double and Triple Attack, at −5 to every attack roll.'),
      hasFeature(have, 'triple-attack') ? 'triple-attack' : 'double-attack',
      opts.fullAttack, flag('fullAttack'));
  }
  if (hasRanged && MODIFIERS.some(m => m.needs === 'pointBlank' && hasFeature(have, m.id))) {
    situation('pointBlank', 'Point blank', '',
      because('pointBlank', 'The target is within point blank range.'),
      'point-blank-shot', opts.pointBlank, flag('pointBlank'));
  }
  if (hasRanged && MODIFIERS.some(m => m.needs === 'aim' && hasFeature(have, m.id))) {
    situation('aim', 'Aimed', '',
      because('aim', 'You aimed as a swift or move action this turn.'),
      hasFeature(have, 'deadeye') ? 'deadeye' : 'careful-shot', opts.aim, flag('aim'));
  }
  if (extras.sneakDice > 0 || MODIFIERS.some(m => m.needs === 'flatFooted' && hasFeature(have, m.id))) {
    situation('flatFooted',
      extras.sneakDice > 0 ? `Sneak +${extras.sneakDice}d6` : 'Flat-footed target',
      extras.sneakDice > 0 ? `+${extras.sneakDice}d6` : '',
      because('flatFooted', 'The target is flat-footed, or otherwise denied its Dexterity bonus.'),
      'sneak-attack', opts.flatFooted, flag('flatFooted'));
  }

  // Dreadful Rage is Rage read at a higher number, not a second switch beside it.
  const superseded = new Set(
    MODIFIERS.filter(m => m.replaces && hasFeature(have, m.id)).map(m => m.replaces),
  );

  for (const m of MODIFIERS) {
    // The automatic ones have nothing to decide, and the ones riding a situation are
    // already named in that situation's own hint.
    if (m.always || m.needs || !hasFeature(have, m.id) || superseded.has(m.id)) continue;
    if (m.scope === 'melee' && !hasMelee) continue;
    if ((m.scope === 'ranged' || m.scope === 'fired') && !hasRanged) continue;
    if (m.groups && !m.groups.some(g => drawnGroups.has(g))) continue;

    const tier = opts.modifiers[m.id] ?? 0;
    out.push({
      key: m.id,
      section: m.kind,
      label: m.label,
      detail: summarise(m.tiers ? m.tiers[Math.max(tier, 1) - 1] : m),
      hint: m.hint,
      featureId: m.id,
      tier,
      tierLabels: m.tiers?.map(t => t.label),
      set: next => setOpts(o => ({ ...o, modifiers: { ...o.modifiers, [m.id]: next } })),
    });
  }
  return out;
}

/** A row is the whole hit target: the name, what it does to the numbers, and when it applies. */
function PickerRow({ row }: { row: Switch }) {
  const feature = FEATURES[row.featureId];
  const tiered = !!row.tierLabels?.length;
  // Stepping forward off the last tier would cost as many taps as there are tiers, and
  // each one rewrites the attack line on the way past as though it had been chosen — so a
  // tiered row keeps its own way off.
  const next = () => row.set(tiered ? (row.tier + 1) % (row.tierLabels!.length + 1) : (row.tier ? 0 : 1));
  return (
    <div className={`mod-row ${row.tier > 0 ? 'on' : ''}`}>
      <button type="button" className="mod-pick" aria-pressed={row.tier > 0} onClick={next}>
        <span className="mod-name">
          {row.label}
          {row.tier > 0 && tiered && <span className="badge accent">{row.tierLabels![row.tier - 1]}</span>}
        </span>
        {row.detail && <span className="mono mod-detail">{row.detail}</span>}
        <span className="mod-hint">{row.hint}{tiered ? ' · tap to step through the tiers' : ''}</span>
      </button>
      {feature ? (
        <Tip content={<FeatureTipBody feature={feature} />}>
          <span className="mod-book breakdown">rules</span>
        </Tip>
      ) : (
        // A grip or an action has no entry to open, but it keeps the column so the rows
        // either side of it still line up.
        <span className="mod-book" />
      )}
      {row.tier > 0 && tiered && (
        <button className="sm ghost" title={`Turn off ${row.label}`}
          aria-label={`Turn off ${row.label}`} onClick={() => row.set(0)}>✕</button>
      )}
    </div>
  );
}

/**
 * One picker section: a divider that counts what is on, and the rows under it.
 *
 * A search holds the section open for as long as it is running. Without that, a query
 * matching something inside a section the player had collapsed showed a header and nothing
 * under it — the row was found and then hidden. Held rather than saved, so the section goes
 * back to whatever the player last chose once the box is cleared: the same rule the rest of
 * the app follows for a panel forced open by a need.
 */
function PickerSection({ label, rows, searching }: { label: string; rows: Switch[]; searching: boolean }) {
  const [open, toggle] = useCollapsePanel(`modifiers:${label.toLowerCase()}`);
  if (!rows.length) return null;
  const on = rows.filter(r => r.tier > 0).length;
  const shown = open || searching;
  return (
    <div>
      <button type="button" className="level-divider" aria-expanded={shown}
        title={shown ? `Collapse ${label}` : `Expand ${label}`} onClick={toggle}>
        <span className="caret" aria-hidden="true">{shown ? '▾' : '▸'}</span>
        <span className="badge">{label}</span>
        {on > 0 && <span className="badge accent">{on} on</span>}
        <span className="faint">· {rows.length}</span>
        <span className="rule" />
      </button>
      {shown && rows.map(r => <PickerRow key={r.key} row={r} />)}
    </div>
  );
}

function ModifierPicker({ rows, onClose }: { rows: Switch[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matching = q
    ? rows.filter(r => `${r.label} ${r.hint} ${r.detail}`.toLowerCase().includes(q))
    : rows;
  return (
    <Modal title="Modifiers" onClose={onClose} wide
      footer={<button className="primary" onClick={onClose}>Done</button>}>
      <div className="row" style={{ marginBottom: 'var(--sp-5)' }}>
        <input
          autoFocus={autoFocusSearch}
          placeholder="Search modifiers…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      {matching.length === 0
        ? <p className="faint">Nothing here matches that.</p>
        : SECTIONS.map(sec => (
          <PickerSection key={sec.id} label={sec.label} searching={!!q}
            rows={matching.filter(r => r.section === sec.id)} />
        ))}
    </Modal>
  );
}

function AttackRow({ a }: { a: AttackProfile }) {
  const damage = a.damageBonus !== 0 ? `${a.damageDice} ${signed(a.damageBonus)}` : a.damageDice;
  const warnings = [
    ...a.notes,
    ...(a.unapplied.length ? [`Also has, not applied automatically: ${a.unapplied.join(', ')}`] : []),
  ];
  // A weapon's own rules — a double weapon, a net, a stun setting's range — are in its
  // description rather than its stat line, so the name opens the full entry.
  const [viewing, setViewing] = useState(false);
  return (
    <div className={`attack-row ${a.melee ? 'melee' : 'ranged'}`}>
      {/* The roll comes first and largest: it is what you reach for, and the damage only
          matters once it has landed. */}
      <div className="attack-roll">
        <Breakdown title="Attack roll" rows={a.attackParts} total={signed(a.attack)} />
        <span className="attack-roll-key">hit</span>
      </div>
      <div className="grow">
      <div className="attack-name">
        <Tip content={<ItemTipBody item={a.weapon} note={a.proficient ? undefined : 'You are not proficient — attacks take −5.'} />}>
          <button type="button" className="linklike" onClick={() => setViewing(true)}>
            <span className="breakdown">{a.weapon.name}</span>
          </button>
        </Tip>
        <span className="faint">· {a.melee ? 'melee' : 'ranged'}</span>
        {!a.proficient && <span className="badge red">not proficient</span>}
        {a.fullAttack && a.fullAttack.attacks > 1 && (
          <Tip content={
            <div className="tip-body">
              <div className="tip-head"><strong>Full attack</strong></div>
              <p>{a.fullAttack.attacks} attacks this round, each at {signed(a.fullAttack.penalty)} to the attack roll.</p>
            </div>
          }>
            <span className="badge accent">×{a.fullAttack.attacks}</span>
          </Tip>
        )}
        {warnings.length > 0 && (
          <Tip content={
            <div className="tip-body">
              <div className="tip-head"><strong>Worth knowing</strong></div>
              {warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          }>
            <span className="badge badge-warn">!</span>
          </Tip>
        )}
      </div>
      <div className="attack-nums">
        {/* Both halves of the damage: where the dice come from, and every flat modifier. */}
        <Breakdown
          title="Damage"
          rows={[
            ...a.diceParts.map(d => ({ label: d.label, text: d.dice })),
            ...a.damageParts,
          ]}
          total={damage}
          footer={`Rolled as ${damage} ${a.weapon.damageType ?? ''}`.trim()}
        />
        <span className="faint">{a.weapon.damageType}</span>
      </div>
      </div>
      {viewing && (
        <Modal title="Equipment" onClose={() => setViewing(false)}>
          <ItemDetail item={a.weapon} />
        </Modal>
      )}
    </div>
  );
}

export function Attacks({
  char, derived, update, bare,
}: {
  char: Character;
  derived: Derived;
  update: (fn: (c: Character) => void) => void;
  /** Render the contents only, for use inside a shared tabbed panel. */
  bare?: boolean;
}) {
  const [opts, setOpts] = useState<AttackOptions>(defaultAttackOptions());
  const [picking, setPicking] = useState(false);
  const phone = usePhone();
  const set = <K extends keyof AttackOptions>(k: K, v: AttackOptions[K]) =>
    setOpts(o => ({ ...o, [k]: v }));

  const have = derived.features;
  const attacks = buildAttacks(char, derived, opts);
  const powers = buildPowers(derived);

  // Each copy of a power in the suite is one use per encounter, so a power taken twice
  // through Force Training can be cast twice before it is exhausted.
  const uses = forcePowerUses(derived.forcePowers);
  const spentOf = (id: string) => Math.min(char.powersSpent?.[id] ?? 0, uses[id] ?? 0);
  const spend = (id: string, n: number) =>
    update(c => {
      const total = uses[id] ?? 0;
      c.powersSpent = { ...c.powersSpent, [id]: Math.max(0, Math.min(total, (c.powersSpent[id] ?? 0) + n)) };
    });
  const anySpent = powers.some(p => spentOf(p.id) > 0);
  const sneakDice = countFeature(have, 'sneak-attack');
  // Shown on the toggle as the best case; a weapon you are not proficient with still
  // takes the full −10, which buildAttack works out per weapon.
  const twoWeapon = twoWeaponPenalty(have, true);

  // Every switch the character could reach, worked out from the modifier table rather than
  // a second list kept in step by hand: a feat added to the table turns up here on its own.
  //
  // Only worth offering the stun switch when something in hand can actually be switched —
  // weapons that deal stun and nothing else need none, their damage is already stun.
  const switches = buildSwitches(have, attacks, opts, setOpts, {
    twoWeaponLabel: twoWeapon.value === 0 ? '±0' : signed(twoWeapon.value),
    sneakDice,
    anyStun: attacks.some(a => a.weapon.stun),
    dwmId: dualWeaponMasteryId(have),
  });
  const active = switches.filter(r => r.tier > 0);
  const offered = switches.length - active.length;
  // A chip apiece was still a wall at high level: fifteen of them wrapped to five rows on
  // the sheet and past a whole screen on a phone. The band names the first few and hands
  // the rest to the picker, which is where the full list belongs anyway — the attack row's
  // own breakdown is what accounts for every one of them.
  const shown = active.slice(0, phone ? BAND_CHIPS.phone : BAND_CHIPS.wide);
  const spilled = active.length - shown.length;

  // What a Force Point can be spent on beyond adding a die. The pool itself is read and
  // spent in the vitals band at the top of the sheet, not here.
  const fpAbilities = buildForcePointAbilities(derived);

  const content = (
    <>
      {/* Switches, ruled off from the numbers they change. Only what is on shows here;
          the rest is one tap away, so the band cannot grow past a line or two. */}
      <div className="attack-modifiers">
        <div className="attack-modifiers-label">Modifiers</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
          {shown.map(r => {
            // The numbers ride in the tip rather than on the chip: spelled out inline they
            // roughly doubled every pill, and the attack row's breakdown already carries them.
            const note = [r.detail, r.hint].filter(Boolean).join(' · ');
            return (
              <span key={r.key} className="chip mod-chip">
                {r.featureId && FEATURES[r.featureId] ? (
                  <FeatureTip id={r.featureId} note={note}>
                    <span className="breakdown">{r.label}</span>
                  </FeatureTip>
                ) : (
                  <Tip content={<div className="tip-body"><p>{note}</p></div>}>
                    <span className="breakdown">{r.label}</span>
                  </Tip>
                )}
                {r.tierLabels && <span className="badge accent">{r.tierLabels[r.tier - 1]}</span>}
                <button type="button" title={`Turn off ${r.label}`}
                  aria-label={`Turn off ${r.label}`} onClick={() => r.set(0)}>✕</button>
              </span>
            );
          })}
          {spilled > 0 && (
            <button type="button" className="chip mod-chip mod-more" onClick={() => setPicking(true)}>
              +{spilled} more on
            </button>
          )}
          {active.length === 0 && <span className="faint">None — nothing is changing the numbers below.</span>}
          <div className="spacer" />
          <button className="sm" onClick={() => setPicking(true)}>
            Add modifier{offered > 0 && <span className="count">{offered}</span>}
          </button>
        </div>

        {/* Power Attack keeps its place in the band: it is a number to dial in, not a
            switch, and it reads badly as a chip. One control does not crowd the row. */}
        {hasFeature(have, 'power-attack') && (
          <div className="row" style={{ gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
            <Tip content={toggleTip('power-attack',
              'Trade points of attack for damage, up to your base attack bonus. Melee only; a two-handed weapon gains double the traded amount.')}>
              <span className="hint nowrap breakdown">Power Attack</span>
            </Tip>
            <button className="sm" disabled={opts.powerAttack <= 0}
              onClick={() => set('powerAttack', opts.powerAttack - 1)}>−</button>
            {/* Typed as well as stepped: at a high base attack bonus, trading the lot was
                as many taps as the bonus itself. */}
            <NumberField
              className="mono center"
              style={{ width: 44, padding: 'var(--sp-1) var(--sp-2)' }}
              ariaLabel="Points of attack traded for damage"
              value={opts.powerAttack}
              onChange={v => set('powerAttack', v ?? 0)}
              min={0}
              max={derived.baseAttackBonus}
            />
            <button className="sm" disabled={opts.powerAttack >= derived.baseAttackBonus}
              onClick={() => set('powerAttack', opts.powerAttack + 1)}>+</button>
          </div>
        )}
      </div>

      {picking && <ModifierPicker rows={switches} onClose={() => setPicking(false)} />}

      <div className="list">
        {/* Two copies of one weapon customized differently are two profiles, so the entry
            they came from is what tells them apart. */}
        {attacks.map(a => <AttackRow key={a.weapon.entryUid ?? a.weapon.id} a={a} />)}
      </div>

      {powers.length > 0 && (
        <>
          <div className="row" style={{ margin: 'var(--sp-6) 0 var(--sp-3)' }}>
            <h3>Force powers</h3>
            <div className="spacer" />
            {anySpent && (
              <button className="sm ghost" title="Regain every spent power"
                onClick={() => update(c => { c.powersSpent = {}; })}>
                End encounter
              </button>
            )}
          </div>
          <div className="list">
            {powers.map(p => {
              const total = uses[p.id] ?? 0;
              const left = total - spentOf(p.id);
              const exhausted = left <= 0;
              return (
                <div key={p.id} className={`attack-row power ${exhausted ? 'exhausted' : ''}`}>
                  <div className="attack-roll">
                    <Breakdown title="Use the Force" rows={p.checkParts ?? []} total={signed(p.useTheForce)}
                      footer={`Rolled against the target's ${p.versus ?? 'defense'}.`} />
                    <span className="attack-roll-key">use</span>
                  </div>
                  <div className="grow">
                  <div className="attack-name">
                    <FeatureTip id={p.id} note={`${left} of ${total} uses left this encounter.`}>
                      <span className="breakdown">{p.name}</span>
                    </FeatureTip>
                    {p.descriptors.map(d => <span key={d} className="badge">{d}</span>)}
                    {p.scales && (
                      <Tip content={
                        <div className="tip-body">
                          <div className="tip-head"><strong>Scaling</strong></div>
                          <p>The effect improves with your Use the Force result — the higher the check, the better the outcome. The damage shown is the first tier.</p>
                        </div>
                      }>
                        <span className="badge">scales</span>
                      </Tip>
                    )}
                    <div className="spacer" />
                    <span className="uses" title={`${left} of ${total} uses left this encounter`}>
                      {Array.from({ length: total }, (_, i) => (
                        <span key={i} className={`pip ${i < left ? 'full' : ''}`} />
                      ))}
                    </span>
                    <button className="sm ghost" disabled={exhausted} title="Spend a use"
                      onClick={() => spend(p.id, 1)}>Use</button>
                    <button className="sm ghost" disabled={left >= total} title="Take a use back"
                      onClick={() => spend(p.id, -1)}>↺</button>
                  </div>
                  <div className="attack-nums">
                    <span className="faint">vs {p.versus?.replace(' Defense', '') ?? '—'}</span>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--sheet-accent)' }}>{p.damage}</span>
                    <span className="faint">{p.damageType ?? ''}</span>
                    {exhausted && <span className="badge red">spent</span>}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {fpAbilities.length > 0 && (
        <>
          <h3 style={{ margin: 'var(--sp-6) 0 var(--sp-3)' }}>
            Spends a Force Point <span className="faint">({fpAbilities.length})</span>
          </h3>
          <div className="chips">
            {fpAbilities.map(a => (
              <FeatureTip key={a.id} id={a.id} note={a.effect}>
                <span className="chip breakdown">{a.name}</span>
              </FeatureTip>
            ))}
          </div>
        </>
      )}

      {/* Last: everything above is what this character can do, and this is what anyone gets
          in a turn. The character rides along only so a feat opened from an entry is read
          against them. */}
      <TurnActions char={char} derived={derived} />
    </>
  );

  return bare ? content : <Panel title="Actions">{content}</Panel>;
}
