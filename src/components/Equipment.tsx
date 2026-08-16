import { useMemo, useState } from 'react';
import type {
  Character, EquipmentItem, InventoryEntry, ItemCustomization, ItemOverrides, ItemUpgrade,
  UpgradeNumber,
} from '../types';
import { ITEM_IDENTITY_KEYS } from '../types';
import { EQUIPMENT, WEAPON_GROUPS, damageLabel } from '../data';
import { getItem, carriedItems, signed, upgradeTotal } from '../rules/engine';
import type { Derived } from '../rules/engine';
import { uid } from '../storage';
import { Panel, Modal, Field, ItemDetail } from './ui';
import { autoFocusSearch } from '../pointer';
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
  /** Which carried copy is being edited, and whether it was created for this dialog. */
  const [editing, setEditing] = useState<{ entryUid: string; created?: boolean } | null>(null);
  const [viewing, setViewing] = useState<EquipmentItem | null>(null);

  const add = (itemId: string) =>
    update(c => {
      // Only gear stacks. A weapon or a suit of armor is one entry per copy, because each
      // copy has its own drawn or worn state — a matched pair of blaster pistols has to be
      // wieldable together, or holsterable one at a time.
      //
      // And then only onto an untouched row: adding a second blaster is how you get one
      // that the crystal in the first is not fitted to, so it must not join that stack.
      const existing = getItem(c, itemId)?.category === 'gear'
        ? c.inventory.find(e => e.itemId === itemId && !e.mods)
        : undefined;
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

  /**
   * What the player changed about their own copy. Upgrades always ride on the inventory
   * entry; the item's own stats go to the entry too — except on a custom item, which
   * nobody else owns, where they belong in the definition itself.
   */
  const saveItem = (entryUid: string, mods: ItemCustomization | undefined, definition?: EquipmentItem) =>
    update(c => {
      const e = c.inventory.find(x => x.uid === entryUid);
      if (!e) return;
      if (mods) e.mods = mods;
      else delete e.mods;
      if (definition) {
        const i = c.customItems.findIndex(x => x.id === definition.id);
        if (i >= 0) c.customItems[i] = definition;
      }
    });

  // A custom item exists as a definition plus the entry that carries it, both created up
  // front so the one editor can be used for it and for anything out of the compendium.
  const createCustom = () => {
    const item: EquipmentItem = {
      id: `custom-${uid()}`, name: '', category: 'gear', weight: 0, cost: 0, custom: true,
    };
    const entryUid = uid();
    update(c => {
      c.customItems.push(item);
      c.inventory.push({ uid: entryUid, itemId: item.id, quantity: 1, equipped: false });
    });
    setEditing({ entryUid, created: true });
  };

  /** Abandoning a brand-new custom item takes the empty row and its definition with it. */
  const discardNew = (entryUid: string) =>
    update(c => {
      const e = c.inventory.find(x => x.uid === entryUid);
      if (!e) return;
      c.inventory = c.inventory.filter(x => x.uid !== entryUid);
      if (!c.inventory.some(x => x.itemId === e.itemId)) {
        c.customItems = c.customItems.filter(i => i.id !== e.itemId);
      }
    });

  // Resolved, so every column shows the item as this character has it rather than as the
  // compendium prints it.
  const rows = carriedItems(char);
  const editingEntry = editing ? char.inventory.find(e => e.uid === editing.entryUid) : undefined;
  const editingBase = editingEntry ? getItem(char, editingEntry.itemId) : undefined;

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
                <strong className="mono">{derived.carrying.weight.toFixed(1)}</strong> of{' '}
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
            <button className="sm" onClick={createCustom}>Custom</button>
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
            <div className="value" style={{ fontSize: 20 }}>{derived.carrying.weight.toFixed(1)}<span style={{ fontSize: 12 }}> kg</span></div>
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
          // One table for the whole kit, with each category as a rule across it. Three
          // tables each repeating Worn / Item / Qty / Weight was more chrome than cargo.
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Worn</th>
                  <th>Item</th>
                  {!compact && <th>Detail</th>}
                  <th className="num">Qty</th>
                  <th className="num">Weight</th>
                  {!compact && <th className="num">Cost</th>}
                  <th />
                </tr>
              </thead>
              {CATEGORIES.map(cat => {
                const list = byCategory(cat);
                if (!list.length) return null;
                return (
                  <tbody key={cat}>
                    <tr className="kit-head">
                      <td colSpan={compact ? 5 : 7}>{CATEGORY_LABELS[cat]}</td>
                    </tr>
                      {list.map(({ entry, item }) => (
                        <tr key={entry.uid} className={`kit-row${entry.equipped ? ' worn' : ''}`}>
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
                              <button
                                type="button"
                                className="linklike"
                                onClick={() => setViewing(item)}
                              >
                                <strong className="breakdown">{item.name}</strong>
                              </button>
                            </Tip>
                            {item.custom && <span className="badge" style={{ marginLeft: 6 }}>custom</span>}
                            {item.modified && !item.custom && (
                              <span className="badge green" style={{ marginLeft: 6 }}>modified</span>
                            )}
                            {item.group && <div className="meta faint">{WEAPON_GROUPS[item.group] ?? item.group}{item.twoHanded ? ' · two-handed' : ''}{item.thrown ? ' · thrown' : ''}</div>}
                            {item.armorType && <div className="meta faint">{item.armorType} armor</div>}
                            {!!item.upgrades?.length && (
                              <div className="meta faint">
                                {item.upgrades.map(u => u.name.trim() || 'modification').join(' · ')}
                              </div>
                            )}
                          </td>
                          {!compact && (
                            <td className="faint">
                              {cat === 'weapon' && <>{damageLabel(item)}{item.stun ? ' · stun' : ''}{item.area ? ` · ${item.area}` : ''}</>}
                              {cat === 'armor' && <>+{item.reflex} / +{item.fortitude} / +{item.maxDex}</>}
                              {cat === 'gear' && (item.notes ?? '—')}
                            </td>
                          )}
                          {/* Only gear has a count. A weapon or a suit of armor is one row
                              per copy, so a quantity box there would be offering to stack
                              things that each need their own worn tick. */}
                          <td className="num">
                            {cat === 'gear' && (
                              <input
                                className="mono center"
                                style={{ width: 50, padding: '2px 4px' }}
                                value={entry.quantity}
                                onChange={e => setQty(entry.uid, parseInt(e.target.value, 10))}
                              />
                            )}
                          </td>
                          <td className="num faint">{(item.weight * entry.quantity).toFixed(1)}</td>
                          {!compact && <td className="num faint">{(item.cost * entry.quantity).toLocaleString()}</td>}
                          <td>
                            <div className="kit-actions">
                              <button
                                className="sm ghost"
                                title={item.custom ? 'Edit this item' : 'Customize this copy'}
                                onClick={() => setEditing({ entryUid: entry.uid })}
                              >
                                ✎
                              </button>
                              <button className="sm ghost" title="Remove" onClick={() => remove(entry.uid)}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}

      {browsing && (
        <ItemBrowser
          onAdd={id => add(id)}
          onView={setViewing}
          onClose={() => setBrowsing(false)}
        />
      )}
      {viewing && (
        <Modal title="Equipment" onClose={() => setViewing(null)}>
          <ItemDetail item={viewing} />
        </Modal>
      )}
      {editing && editingEntry && editingBase && (
        <ItemEditor
          entry={editingEntry}
          base={editingBase}
          onSave={(mods, definition) => { saveItem(editingEntry.uid, mods, definition); setEditing(null); }}
          onClose={() => {
            if (editing.created) discardNew(editing.entryUid);
            setEditing(null);
          }}
        />
      )}
    </>
  );

  return bare ? content : (
    <Panel
      title="Carried equipment"
      actions={
        <div className="row">
          <button className="sm" onClick={createCustom}>Custom item</button>
          <button className="sm primary" onClick={() => setBrowsing(true)}>Add equipment</button>
        </div>
      }
    >
      {content}
    </Panel>
  );
}

function ItemBrowser({
  onAdd, onView, onClose,
}: { onAdd: (id: string) => void; onView: (item: EquipmentItem) => void; onClose: () => void }) {
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
      // Not just "Equipment": the detail dialog opens on top of this one, and two
      // stacked headers reading the same thing tells you nothing about which is which.
      title="Add equipment"
      onClose={onClose}
      footer={<button onClick={onClose}>Done</button>}
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <input autoFocus={autoFocusSearch} placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />
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
        {list.map(item => {
          // Only what tells one item from another at a glance. Gear says nothing: its notes
          // run to a sentence apiece and swamped the list. Armor gives the three numbers
          // bare. Both keep their labelled detail in the hover card. Parts are joined rather
          // than concatenated because plenty of weapons carry no damage line — a grenade, a
          // net — and used to render a stranded separator.
          const meta = item.category === 'weapon'
            ? [
              damageLabel(item),
              WEAPON_GROUPS[item.group ?? ''] ?? item.group,
            ].filter(Boolean).join(' · ')
            : item.category === 'armor'
              ? `+${item.reflex ?? 0}/+${item.fortitude ?? 0}/+${item.maxDex ?? 0}`
                + (item.armorType ? ` · ${item.armorType}` : '')
              : '';

          return (
            <div key={item.id} className="item">
              {/* The row itself carries the full stat card, so you can compare two things
                  without adding either one first, and clicking opens the whole entry. */}
              <Tip className="grow block" content={<ItemTipBody item={item} />}>
                <button type="button" className="linklike block" onClick={() => onView(item)}>
                  <div className="name breakdown">{item.name}</div>
                  {meta && <div className="meta">{meta}</div>}
                </button>
              </Tip>
              <span className="faint nowrap">{item.weight} kg</span>
              <span className="faint nowrap">{item.cost.toLocaleString()} cr</span>
              <button className="sm primary" onClick={() => onAdd(item.id)}>Add</button>
            </div>
          );
        })}
        {!list.length && <div className="empty">No matches.</div>}
      </div>
    </Modal>
  );
}

/** The stats of the item itself, as opposed to what has been bolted onto it. */
function ItemStatFields({
  draft, set, allowCategory,
}: {
  draft: EquipmentItem;
  set: (patch: Partial<EquipmentItem>) => void;
  /** Only a custom item may change what kind of thing it is. */
  allowCategory: boolean;
}) {
  return (
    <>
      <div className="grid g2">
        <Field label="Name">
          <input value={draft.name} onChange={e => set({ name: e.target.value })} autoFocus={autoFocusSearch} />
        </Field>
        {allowCategory && (
          <Field label="Category">
            <select value={draft.category} onChange={e => set({ category: e.target.value as EquipmentItem['category'] })}>
              <option value="weapon">Weapon</option>
              <option value="armor">Armor</option>
              <option value="gear">Gear</option>
            </select>
          </Field>
        )}
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
            <Field label="Handling">
              {/* The compendium keeps all three of these in prose — "Special: Can be Thrown"
                  — so they are set by hand on the copy you carry. */}
              <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
                <label className="row" style={{ gap: 5 }}>
                  <input type="checkbox" checked={!!draft.twoHanded} onChange={e => set({ twoHanded: e.target.checked })} />
                  <span className="hint">two-handed</span>
                </label>
                <label className="row" style={{ gap: 5 }}>
                  <input type="checkbox" checked={!!draft.thrown} onChange={e => set({ thrown: e.target.checked })} />
                  <span className="hint">can be thrown</span>
                </label>
                <label className="row" style={{ gap: 5 }}>
                  <input type="checkbox" checked={!!draft.stun} onChange={e => set({ stun: e.target.checked })} />
                  <span className="hint">stun setting</span>
                </label>
              </div>
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
    </>
  );
}

/**
 * The numbers one modification may carry, and which of them a weapon alone has use for.
 * `total` is how the field reads in the summary line, where "+2 kg" beats "+2 weight".
 */
const UPGRADE_FIELDS: {
  key: UpgradeNumber; label: string; total?: string; weaponOnly?: boolean; step?: string;
}[] = [
  { key: 'attack', label: 'Attack', weaponOnly: true },
  { key: 'damage', label: 'Damage', weaponOnly: true },
  { key: 'reflexDefense', label: 'Reflex' },
  { key: 'fortitudeDefense', label: 'Fortitude' },
  { key: 'willDefense', label: 'Will' },
  { key: 'weight', label: 'Weight kg', total: 'kg', step: '0.1' },
  { key: 'cost', label: 'Cost cr', total: 'credits' },
];

/** An empty field is not a value of zero: it means this modification does not touch that. */
const numberOrNone = (raw: string) => {
  const n = parseFloat(raw);
  return raw.trim() === '' || Number.isNaN(n) ? undefined : n;
};

const upgradeIsEmpty = (u: ItemUpgrade) =>
  !u.name.trim() && !u.damageDice?.trim() && !u.notes?.trim()
  && UPGRADE_FIELDS.every(f => !u[f.key]);

function UpgradeFields({
  upgrade, category, onChange, onRemove,
}: {
  upgrade: ItemUpgrade;
  category: EquipmentItem['category'];
  onChange: (u: ItemUpgrade) => void;
  onRemove: () => void;
}) {
  return (
    <div className="upgrade">
      <div className="row">
        <input
          style={{ flex: 1, minWidth: 0 }}
          placeholder="What it is — Ilum crystal, helmet package, attuned…"
          value={upgrade.name}
          onChange={e => onChange({ ...upgrade, name: e.target.value })}
        />
        <button className="sm ghost" title="Remove this modification" onClick={onRemove}>✕</button>
      </div>
      <div className="grid g4">
        {UPGRADE_FIELDS.filter(f => !f.weaponOnly || category === 'weapon').map(f => (
          <Field key={f.key} label={f.label}>
            <input
              type="number"
              step={f.step}
              value={upgrade[f.key] ?? ''}
              onChange={e => onChange({ ...upgrade, [f.key]: numberOrNone(e.target.value) })}
            />
          </Field>
        ))}
        {category === 'weapon' && (
          <Field label="Extra dice">
            <input
              placeholder="1d6"
              value={upgrade.damageDice ?? ''}
              onChange={e => onChange({ ...upgrade, damageDice: e.target.value })}
            />
          </Field>
        )}
      </div>
      <Field label="Note">
        <input
          placeholder="What the book says it does"
          value={upgrade.notes ?? ''}
          onChange={e => onChange({ ...upgrade, notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

const NOT_OVERRIDABLE = new Set<string>(ITEM_IDENTITY_KEYS);
/** A cleared field and one that was never set both mean "whatever the book says". */
const blankValue = (v: unknown) => v === undefined || v === null || v === '' || v === false;
const sameValue = (a: unknown, b: unknown) => a === b || (blankValue(a) && blankValue(b));

/**
 * One dialog for both halves of owning a thing: the item's own stats, and everything
 * fitted to it afterwards. Changes are kept against the inventory entry, so upgrading
 * one blaster leaves every other copy of that model — on this character and on any
 * other — exactly as the compendium prints it. A custom item is the exception: nobody
 * else owns one, so its stats are written back to the definition itself.
 */
function ItemEditor({
  entry, base, onSave, onClose,
}: {
  entry: InventoryEntry;
  base: EquipmentItem;
  onSave: (mods: ItemCustomization | undefined, definition?: EquipmentItem) => void;
  onClose: () => void;
}) {
  const custom = base.custom === true;
  // The draft starts from the item as owned — the book's stats with the player's edits on
  // top — and deliberately not from the resolved item, whose weight and cost already carry
  // what the upgrades below add. Editing that would count them twice.
  const [draft, setDraft] = useState<EquipmentItem>(() => ({ ...base, ...entry.mods?.overrides }));
  const [upgrades, setUpgrades] = useState<ItemUpgrade[]>(
    () => (entry.mods?.upgrades ?? []).map(u => ({ ...u })),
  );
  const set = (patch: Partial<EquipmentItem>) => setDraft(d => ({ ...d, ...patch }));

  const fitted = upgrades.filter(u => !upgradeIsEmpty(u));
  const totals = UPGRADE_FIELDS
    .map(f => ({ label: f.total ?? f.label.toLowerCase(), value: upgradeTotal(fitted, f.key) }))
    .filter(t => t.value !== 0);

  const save = () => {
    const kept = fitted.map(u => ({ ...u, name: u.name.trim() || 'modification' }));
    if (custom) {
      onSave(kept.length ? { upgrades: kept } : undefined, { ...draft, id: base.id, custom: true });
      return;
    }
    const printed: Record<string, unknown> = { ...base };
    const overrides: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(draft)) {
      if (NOT_OVERRIDABLE.has(key)) continue;
      if (!sameValue(value, printed[key])) overrides[key] = value;
    }
    const changed = Object.keys(overrides).length > 0;
    onSave(changed || kept.length
      ? {
        ...(changed ? { overrides: overrides as ItemOverrides } : {}),
        ...(kept.length ? { upgrades: kept } : {}),
      }
      : undefined);
  };

  return (
    <Modal
      wide
      title={base.name ? `${custom ? 'Edit' : 'Customize'} ${base.name}` : 'Custom item'}
      onClose={onClose}
      footer={
        <>
          {!custom && entry.mods && (
            <button className="danger" onClick={() => onSave(undefined)}>Back to the book</button>
          )}
          <div className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!draft.name.trim()} onClick={save}>Save</button>
        </>
      }
    >
      {!custom && (
        <div className="notice" style={{ marginBottom: 12 }}>
          Changes apply to the copy you are carrying, not to the compendium entry — add the
          item again for an unaltered one.
          {entry.quantity > 1 && ` This row stacks ${entry.quantity}, so all of them are altered together.`}
        </div>
      )}

      <ItemStatFields draft={draft} set={set} allowCategory={custom} />

      <div className="row" style={{ margin: '16px 0 6px' }}>
        <h3>Modifications</h3>
        <div className="spacer" />
        <button className="sm" onClick={() => setUpgrades(u => [...u, { id: uid(), name: '' }])}>
          Add modification
        </button>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Anything fitted to this one item: an armor upgrade, a lightsaber crystal, a talisman's
        blessing, a talent that attunes or empowers a weapon. Attack and damage apply when you
        use it; Reflex, Fortitude and Will apply to your own defenses while it is worn or
        wielded. Numbers are applied as entered — whether two bonuses of the same type stack is
        a question for your table. Change what the armor itself grants above instead.
      </p>

      {upgrades.length === 0 ? (
        <div className="empty">Nothing fitted.</div>
      ) : (
        <div className="col">
          {upgrades.map((u, i) => (
            <UpgradeFields
              key={u.id}
              upgrade={u}
              category={draft.category}
              onChange={next => setUpgrades(list => list.map((x, j) => (j === i ? next : x)))}
              onRemove={() => setUpgrades(list => list.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}

      {totals.length > 0 && (
        <p className="hint">
          Fitted in total: {totals.map(t => `${signed(t.value)} ${t.label}`).join(', ')}.
        </p>
      )}
    </Modal>
  );
}
