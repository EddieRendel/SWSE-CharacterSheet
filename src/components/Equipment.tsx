import { useMemo, useState } from 'react';
import type { Character, EquipmentItem } from '../types';
import { EQUIPMENT, WEAPON_GROUPS } from '../data';
import { getItem, signed } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { Panel, Modal, Field } from './ui';
import { Tip, ItemTipBody, TipRows } from './Tip';

/** How the sheet names each step of the carrying rules. */
const LOAD_LABEL: Record<Derived['carrying']['level'], string> = {
  normal: 'within your limit',
  heavy: 'heavy load',
  strained: 'straining',
  overloaded: 'over your maximum',
};

/** The three thresholds and what passing each one costs. */
function LoadTip({ derived }: { derived: Derived }) {
  const c = derived.carrying;
  return (
    <TipRows
      title="Carrying capacity"
      rows={[
        { label: 'carried', text: `${c.weight.toFixed(1)} kg` },
        { label: 'heavy load — speed drops to ¾, −10 on Acrobatics, Climb, Endurance, Initiative, Jump, Stealth and Swim', text: `${c.heavy.toFixed(0)} kg` },
        { label: 'straining — speed drops to 1 square', text: `${c.strain.toFixed(0)} kg` },
        { label: 'maximum — you cannot move', text: `${c.maximum.toFixed(0)} kg` },
      ]}
      footer={c.level === 'normal'
        ? 'Limits come from your Strength score squared, scaled by size.'
        : `You are ${LOAD_LABEL[c.level]}: speed ${derived.speed} squares.`}
    />
  );
}
import { uid } from '../storage';

const CATEGORIES = ['weapon', 'armor', 'gear'] as const;
/** "Armor" and "Gear" are already plural; only weapons take an s. */
const CATEGORY_LABELS: Record<string, string> = { weapon: 'Weapons', armor: 'Armor', gear: 'Gear' };

export function Equipment({
  char, derived, update, compact, bare,
}: {
  char: Character;
  derived: Derived;
  update: (fn: (c: Character) => void) => void;
  /** Side-column layout for the sheet: fewer stat tiles, tighter table. */
  compact?: boolean;
  /** Render the contents only, for use inside a shared tabbed panel. */
  bare?: boolean;
}) {
  const [browsing, setBrowsing] = useState(false);
  const [editing, setEditing] = useState<EquipmentItem | null>(null);

  const add = (itemId: string) =>
    update(c => {
      const existing = c.inventory.find(e => e.itemId === itemId);
      if (existing) existing.quantity += 1;
      else c.inventory.push({ uid: uid(), itemId, quantity: 1, equipped: false });
    });

  const remove = (entryUid: string) =>
    update(c => { c.inventory = c.inventory.filter(e => e.uid !== entryUid); });

  const setQty = (entryUid: string, q: number) =>
    update(c => {
      const e = c.inventory.find(x => x.uid === entryUid);
      if (e) e.quantity = Math.max(1, q || 1);
    });

  const toggleEquip = (entryUid: string) =>
    update(c => {
      const e = c.inventory.find(x => x.uid === entryUid);
      if (!e) return;
      const item = getItem(c, e.itemId);
      // Only one suit of armor can be worn at a time.
      if (item?.category === 'armor' && !e.equipped) {
        for (const other of c.inventory) {
          if (other.uid !== e.uid && getItem(c, other.itemId)?.category === 'armor') other.equipped = false;
        }
      }
      e.equipped = !e.equipped;
    });

  const saveCustom = (item: EquipmentItem) =>
    update(c => {
      const i = c.customItems.findIndex(x => x.id === item.id);
      if (i >= 0) c.customItems[i] = item;
      else c.customItems.push(item);
      if (!c.inventory.some(e => e.itemId === item.id)) {
        c.inventory.push({ uid: uid(), itemId: item.id, quantity: 1, equipped: false });
      }
    });

  const rows = char.inventory
    .map(e => ({ entry: e, item: getItem(char, e.itemId) }))
    .filter(r => !!r.item) as { entry: Character['inventory'][0]; item: EquipmentItem }[];

  const byCategory = (cat: string) => rows.filter(r => r.item.category === cat);

  const spendCredits = (n: number) =>
    update(c => { c.credits = Math.max(0, c.credits + n); });

  const content = (
    <>
        {compact ? (
          <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <span className="row" style={{ gap: 4 }} title="Credits on hand">
              <button className="sm ghost" onClick={() => spendCredits(-100)} disabled={char.credits <= 0}>−100</button>
              <input
                className="mono center" style={{ width: 88, padding: '2px 4px' }}
                value={char.credits}
                onChange={e => update(c => { c.credits = Math.max(0, parseInt(e.target.value, 10) || 0); })}
              />
              <button className="sm ghost" onClick={() => spendCredits(100)}>+100</button>
              <span className="hint">credits</span>
            </span>
            <Tip content={<LoadTip derived={derived} />}>
              <span className={`hint breakdown${derived.carrying.level !== 'normal' ? ' err' : ''}`}>
                <strong className="mono">{derived.totalWeight.toFixed(1)}</strong> of{' '}
                <span className="mono">{derived.carrying.heavy.toFixed(0)}</span> kg
                {derived.carrying.level !== 'normal' && ` · ${LOAD_LABEL[derived.carrying.level]}`}
              </span>
            </Tip>
            {derived.equippedArmor && (
              <span className="hint">
                wearing <strong>{derived.equippedArmor.name}</strong>
                {derived.armorPenalty ? ` (${signed(derived.armorPenalty)} not proficient)` : ''}
              </span>
            )}
            <div className="spacer" />
            <button className="sm" onClick={() => setEditing(blankItem())}>Custom</button>
            <button className="sm primary" onClick={() => setBrowsing(true)}>Add</button>
          </div>
        ) : (
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="label">Credits</div>
            <input
              className="mono center"
              style={{ fontSize: 18, marginTop: 4 }}
              value={char.credits}
              onChange={e => update(c => { c.credits = parseInt(e.target.value, 10) || 0; })}
            />
          </div>
          <div className="stat">
            <div className="label">Total weight</div>
            <div className="value" style={{ fontSize: 20 }}>{derived.totalWeight.toFixed(1)}<span style={{ fontSize: 12 }}> kg</span></div>
            <div className={`sub${derived.carrying.level !== 'normal' ? ' err' : ''}`}>
              {LOAD_LABEL[derived.carrying.level]} · heavy at {derived.carrying.heavy.toFixed(0)} kg
            </div>
          </div>
          <div className="stat">
            <div className="label">Armor worn</div>
            <div className="value" style={{ fontSize: 14, marginTop: 6 }}>{derived.equippedArmor?.name ?? '—'}</div>
          </div>
          <div className="stat">
            <div className="label">Armor penalty</div>
            <div className="value" style={{ fontSize: 20, color: derived.armorPenalty ? 'var(--red)' : undefined }}>
              {derived.armorPenalty ? signed(derived.armorPenalty) : '—'}
            </div>
            <div className="sub">{derived.equippedArmor && !derived.armorProficient ? 'not proficient' : 'proficient'}</div>
          </div>
        </div>
        )}

        {derived.equippedArmor && !derived.armorProficient && (
          <div className="notice warn" style={{ marginBottom: 12 }}>
            You are not proficient with <strong>{derived.equippedArmor.name}</strong> ({derived.equippedArmor.armorType} armor).
            You take a {signed(derived.armorPenalty)} penalty on attack rolls and on Strength- and
            Dexterity-based skill checks. Take the{' '}
            <em>Armor Proficiency ({derived.equippedArmor.armorType})</em> feat to remove it.
          </div>
        )}

        {rows.length === 0 ? (
          <div className="empty">Nothing carried yet.</div>
        ) : (
          CATEGORIES.map(cat => {
            const list = byCategory(cat);
            if (!list.length) return null;
            return (
              <div key={cat} style={{ marginBottom: 14 }}>
                <h3 style={{ marginBottom: 6 }}>{CATEGORY_LABELS[cat]}</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 44 }}>Worn</th>
                        <th>Item</th>
                        {!compact && (
                          <th>{cat === 'weapon' ? 'Damage' : cat === 'armor' ? 'Ref / Fort / Max Dex' : 'Notes'}</th>
                        )}
                        <th className="num">Qty</th>
                        <th className="num">Weight</th>
                        {!compact && <th className="num">Cost</th>}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(({ entry, item }) => (
                        <tr key={entry.uid}>
                          <td>
                            <input type="checkbox" checked={entry.equipped} onChange={() => toggleEquip(entry.uid)} />
                          </td>
                          <td>
                            <Tip content={
                              <ItemTipBody
                                item={item}
                                note={entry.equipped
                                  ? 'Worn or wielded — weapons appear in the Actions tab and armor is applied to your defenses.'
                                  : 'Not worn, so it has no effect on your attacks or defenses.'}
                              />
                            }>
                              <strong className="breakdown">{item.name}</strong>
                            </Tip>
                            {item.custom && <span className="badge" style={{ marginLeft: 6 }}>custom</span>}
                            {item.group && <div className="meta faint">{WEAPON_GROUPS[item.group] ?? item.group}{item.twoHanded ? ' · two-handed' : ''}</div>}
                            {item.armorType && <div className="meta faint">{item.armorType} armor</div>}
                          </td>
                          {!compact && (
                            <td className="faint">
                              {cat === 'weapon' && <>{item.damage} {item.damageType}{item.stun ? ' · stun' : ''}{item.area ? ` · ${item.area}` : ''}</>}
                              {cat === 'armor' && <>+{item.reflex} / +{item.fortitude} / +{item.maxDex}</>}
                              {cat === 'gear' && (item.notes ?? '—')}
                            </td>
                          )}
                          <td className="num">
                            <input
                              className="mono center"
                              style={{ width: 50, padding: '2px 4px' }}
                              value={entry.quantity}
                              onChange={e => setQty(entry.uid, parseInt(e.target.value, 10))}
                            />
                          </td>
                          <td className="num faint">{(item.weight * entry.quantity).toFixed(1)}</td>
                          {!compact && <td className="num faint">{(item.cost * entry.quantity).toLocaleString()}</td>}
                          <td>
                            <div className="row">
                              {item.custom && <button className="sm ghost" onClick={() => setEditing(item)}>✎</button>}
                              <button className="sm ghost" onClick={() => remove(entry.uid)}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}

      {browsing && (
        <ItemBrowser
          onAdd={id => add(id)}
          onClose={() => setBrowsing(false)}
        />
      )}
      {editing && (
        <CustomItemEditor
          item={editing}
          onSave={item => { saveCustom(item); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );

  return bare ? content : (
    <Panel
      title="Carried equipment"
      actions={
        <div className="row">
          <button className="sm" onClick={() => setEditing(blankItem())}>Custom item</button>
          <button className="sm primary" onClick={() => setBrowsing(true)}>Add equipment</button>
        </div>
      }
    >
      {content}
    </Panel>
  );
}

function ItemBrowser({ onAdd, onClose }: { onAdd: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(EQUIPMENT)
      .filter(i => (!cat || i.category === cat) && (!q || i.name.toLowerCase().includes(q)))
      // Straight alphabetical. Grouping by category first meant looking up which of the
      // three blocks a thing was in before you could find it; the filter above is there
      // when you do want only one kind.
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query, cat]);

  return (
    <Modal
      title="Equipment"
      onClose={onClose}
      footer={<button onClick={onClose}>Done</button>}
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <input autoFocus placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ width: 150 }}>
          <option value="">All</option>
          <option value="weapon">Weapons</option>
          <option value="armor">Armor</option>
          <option value="gear">Gear</option>
        </select>
      </div>
      <div className="notice" style={{ marginBottom: 12 }}>
        Imported from the Foundry compendium rather than transcribed by hand. Check anything that
        matters against your book, and use <strong>Custom item</strong> for gear from other sources.
      </div>
      <div className="list" style={{ maxHeight: '46vh', overflowY: 'auto' }}>
        {list.map(item => (
          <div key={item.id} className="item">
            {/* The row itself carries the full stat card, so you can compare two things
                without adding either one first. */}
            <Tip className="grow block" content={<ItemTipBody item={item} />}>
              <div className="name breakdown">{item.name}</div>
              <div className="meta">
                {item.category === 'weapon' && <>{item.damage} {item.damageType} · {WEAPON_GROUPS[item.group ?? ''] ?? item.group}</>}
                {item.category === 'armor' && <>+{item.reflex} Ref / +{item.fortitude} Fort / max Dex +{item.maxDex} · {item.armorType}</>}
                {item.category === 'gear' && (item.notes ?? 'General equipment')}
              </div>
            </Tip>
            <span className="faint nowrap">{item.weight} kg</span>
            <span className="faint nowrap">{item.cost.toLocaleString()} cr</span>
            <button className="sm primary" onClick={() => onAdd(item.id)}>Add</button>
          </div>
        ))}
        {!list.length && <div className="empty">No matches.</div>}
      </div>
    </Modal>
  );
}

const blankItem = (): EquipmentItem => ({
  id: `custom-${uid()}`, name: '', category: 'gear', weight: 0, cost: 0, custom: true,
});

function CustomItemEditor({
  item, onSave, onClose,
}: { item: EquipmentItem; onSave: (i: EquipmentItem) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<EquipmentItem>({ ...item });
  const set = (patch: Partial<EquipmentItem>) => setDraft(d => ({ ...d, ...patch }));

  return (
    <Modal
      title={item.name ? `Edit ${item.name}` : 'Custom item'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!draft.name.trim()} onClick={() => onSave(draft)}>Save</button>
        </>
      }
    >
      <div className="grid g2">
        <Field label="Name">
          <input value={draft.name} onChange={e => set({ name: e.target.value })} autoFocus />
        </Field>
        <Field label="Category">
          <select value={draft.category} onChange={e => set({ category: e.target.value as EquipmentItem['category'] })}>
            <option value="weapon">Weapon</option>
            <option value="armor">Armor</option>
            <option value="gear">Gear</option>
          </select>
        </Field>
        <Field label="Weight (kg)">
          <input type="number" step="0.1" value={draft.weight} onChange={e => set({ weight: parseFloat(e.target.value) || 0 })} />
        </Field>
        <Field label="Cost (credits)">
          <input type="number" value={draft.cost} onChange={e => set({ cost: parseInt(e.target.value, 10) || 0 })} />
        </Field>

        {draft.category === 'weapon' && (
          <>
            <Field label="Damage">
              <input placeholder="3d8" value={draft.damage ?? ''} onChange={e => set({ damage: e.target.value })} />
            </Field>
            <Field label="Damage type">
              <input placeholder="energy" value={draft.damageType ?? ''} onChange={e => set({ damageType: e.target.value })} />
            </Field>
            <Field label="Weapon group">
              <select value={draft.group ?? ''} onChange={e => set({ group: e.target.value })}>
                <option value="">—</option>
                {Object.entries(WEAPON_GROUPS).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </Field>
            <Field label="Rate of fire">
              <input placeholder="S, A" value={draft.rateOfFire ?? ''} onChange={e => set({ rateOfFire: e.target.value })} />
            </Field>
          </>
        )}

        {draft.category === 'armor' && (
          <>
            <Field label="Armor type">
              <select value={draft.armorType ?? 'light'} onChange={e => set({ armorType: e.target.value as EquipmentItem['armorType'] })}>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="heavy">Heavy</option>
              </select>
            </Field>
            <Field label="Reflex Defense bonus">
              <input type="number" value={draft.reflex ?? 0} onChange={e => set({ reflex: parseInt(e.target.value, 10) || 0 })} />
            </Field>
            <Field label="Fortitude Defense bonus">
              <input type="number" value={draft.fortitude ?? 0} onChange={e => set({ fortitude: parseInt(e.target.value, 10) || 0 })} />
            </Field>
            <Field label="Maximum Dexterity bonus">
              <input type="number" value={draft.maxDex ?? 0} onChange={e => set({ maxDex: parseInt(e.target.value, 10) || 0 })} />
            </Field>
          </>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="Notes">
          <textarea value={draft.notes ?? ''} onChange={e => set({ notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
