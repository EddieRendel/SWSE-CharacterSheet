import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Character } from '../types';
import { signed, hasFeature, countFeature, forcePowerUses } from '../rules/engine';
import type { Derived } from '../rules/engine';
import {
  buildAttacks, buildPowers, buildForcePointAbilities,
  defaultAttackOptions, SITUATIONAL, twoWeaponPenalty, dualWeaponMasteryId,
} from '../rules/attacks';
import type { AttackOptions, AttackProfile } from '../rules/attacks';
import { Panel, Modal, ItemDetail } from './ui';
import { Tip, FeatureTip, FeatureTipBody, ItemTipBody, TipRows } from './Tip';
import { TurnActions } from './TurnActions';
import { FEATURES } from '../data';

/** A toggle is only shown when the character actually has the feat behind it. */
function Toggle({
  on, onChange, label, tip,
}: { on: boolean; onChange: (v: boolean) => void; label: string; tip: ReactNode }) {
  return (
    <Tip content={tip}>
      <button className={`sm ${on ? 'primary' : ''}`} onClick={() => onChange(!on)}>{label}</button>
    </Tip>
  );
}

/** The rules behind a toggle, when a feature grants it; otherwise just the explanation. */
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
        <span className="k">hit</span>
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
            <span className="badge warn-badge">!</span>
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
  const dwmId = dualWeaponMasteryId(have);

  // Only offer a toggle when the character has the feat that makes it matter.
  const available = {
    powerAttack: hasFeature(have, 'power-attack'),
    pointBlank: hasFeature(have, 'point-blank-shot'),
    aim: hasFeature(have, 'careful-shot') || hasFeature(have, 'deadeye'),
    rapidShot: hasFeature(have, 'rapid-shot'),
    burstFire: hasFeature(have, 'burst-fire'),
    sneak: sneakDice > 0,
    fullAttack: hasFeature(have, 'double-attack') || hasFeature(have, 'triple-attack'),
    // Only worth offering when something in hand can actually be switched. Weapons that deal
    // stun and nothing else need no toggle — their damage is already stun.
    stun: attacks.some(a => a.weapon.stun),
  };

  // What a Force Point can be spent on beyond adding a die. The pool itself is read and
  // spent in the vitals band at the top of the sheet, not here.
  const fpAbilities = buildForcePointAbilities(derived);

  const content = (
    <>
      {/* Switches, ruled off from the numbers they change — they used to run straight into
          the attack list as one undifferentiated block of buttons and rows. */}
      <div className="modifiers">
        <div className="modifiers-label">Modifiers</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
        {/* Two hands on one weapon and a weapon in each hand are mutually exclusive, so
            each toggle switches the other off rather than letting both look active. */}
        <Toggle
          on={opts.twoHanded}
          onChange={v => setOpts(o => ({ ...o, twoHanded: v, twoWeapon: v ? false : o.twoWeapon }))}
          label="Two-handed"
          tip={toggleTip('', 'Holding the weapon in two hands applies double your Strength bonus to melee damage. Weapons the data marks two-handed already get this without the toggle.')} />
        <Toggle
          on={opts.twoWeapon}
          onChange={v => setOpts(o => ({ ...o, twoWeapon: v, twoHanded: v ? false : o.twoHanded }))}
          label={`Two weapons ${twoWeapon.value === 0 ? '±0' : signed(twoWeapon.value)}`}
          tip={toggleTip(dwmId,
            `A weapon in each hand, or both ends of a double weapon, as part of a full attack: `
            + `one attack with each, and ${twoWeapon.value === 0 ? 'no penalty' : `${signed(twoWeapon.value)} on every`} `
            + `attack roll until the start of your next turn. `
            + (dwmId
              ? 'Dual Weapon Mastery reduces this, but only with weapons you are proficient with — an unfamiliar weapon still takes the full −10.'
              : 'Dual Weapon Mastery I, II and III reduce it to −5, −2 and nothing.'))} />
        {available.stun && (
          <Toggle on={opts.stunSetting} onChange={v => set('stunSetting', v)} label="Stun setting"
            tip={toggleTip('',
              'Switch every weapon that has a stun setting over to it, or back — a swift action either way. '
              + 'Most roll the same dice on stun; a few roll more. Half the damage comes off hit points, and '
              + 'only creatures are affected.')} />
        )}
        {available.fullAttack && (
          <Toggle on={opts.fullAttack} onChange={v => set('fullAttack', v)} label="Full attack"
            tip={toggleTip(hasFeature(have, 'triple-attack') ? 'triple-attack' : 'double-attack',
              'Enables Double and Triple Attack, at −5 to every attack roll.')} />
        )}
        {available.pointBlank && (
          <Toggle on={opts.pointBlank} onChange={v => set('pointBlank', v)} label="Point blank"
            tip={toggleTip('point-blank-shot', 'Target within point blank range.')} />
        )}
        {available.aim && (
          <Toggle on={opts.aim} onChange={v => set('aim', v)} label="Aimed"
            tip={toggleTip(hasFeature(have, 'deadeye') ? 'deadeye' : 'careful-shot',
              'You aimed as a swift or move action this turn.')} />
        )}
        {available.rapidShot && (
          <Toggle on={opts.rapidShot} onChange={v => set('rapidShot', v)} label="Rapid Shot"
            tip={toggleTip('rapid-shot', '−2 attack, +1 die of damage.')} />
        )}
        {available.burstFire && (
          <Toggle on={opts.burstFire} onChange={v => set('burstFire', v)} label="Burst Fire"
            tip={toggleTip('burst-fire', '−5 attack, +2 dice of damage.')} />
        )}
        {available.sneak && (
          <Toggle on={opts.flatFooted} onChange={v => set('flatFooted', v)} label={`Sneak +${sneakDice}d6`}
            tip={toggleTip('sneak-attack', 'Target flat-footed or otherwise denied its Dexterity bonus.')} />
        )}

        {SITUATIONAL.filter(m => hasFeature(have, m.id)).map(m => {
          const tier = opts.situational[m.id] ?? 0;
          const cycle = () => set('situational', {
            ...opts.situational,
            [m.id]: (tier + 1) % ((m.tiers?.length ?? 1) + 1),
          });
          const label = tier && m.tiers ? `${m.label} ${m.tiers[tier - 1].label}` : m.label;
          return (
            <Toggle key={m.id} on={tier > 0} onChange={cycle} label={label}
              tip={toggleTip(m.id, m.tiers
                ? `${m.hint}. Click to cycle through ${m.tiers.map(t => t.label).join(', ')}.`
                : m.hint)} />
          );
        })}

        {available.powerAttack && (
          <span className="row" style={{ gap: 4 }}>
            <Tip content={toggleTip('power-attack',
              'Trade points of attack for damage, up to your base attack bonus. Melee only; a two-handed weapon gains double the traded amount.')}>
              <span className="hint nowrap breakdown">Power Attack</span>
            </Tip>
            <button className="sm" disabled={opts.powerAttack <= 0}
              onClick={() => set('powerAttack', opts.powerAttack - 1)}>−</button>
            <span className="mono" style={{ minWidth: 14, textAlign: 'center' }}>{opts.powerAttack}</span>
            <button className="sm" disabled={opts.powerAttack >= derived.baseAttackBonus}
              onClick={() => set('powerAttack', opts.powerAttack + 1)}>+</button>
          </span>
        )}
        </div>
      </div>

      <div className="list">
        {/* Two copies of one weapon customized differently are two profiles, so the entry
            they came from is what tells them apart. */}
        {attacks.map(a => <AttackRow key={a.weapon.entryUid ?? a.weapon.id} a={a} />)}
      </div>

      {powers.length > 0 && (
        <>
          <div className="row" style={{ margin: '12px 0 6px' }}>
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
                    <span className="k">use</span>
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
          <h3 style={{ margin: '12px 0 6px' }}>
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
