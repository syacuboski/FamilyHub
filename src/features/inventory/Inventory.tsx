// Inventory + reconcile (mockup: Inventory + reconcile · night).
// Pantry / Fridge / Freezer / Kids, stock bars against "full", use-by dates,
// reconcile counts, edit items, send low items to Grocery, diaper bag.
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { add, patch, remove, useRecords } from '../../lib/sync';
import { addToList, defaultList, findOrCreateItem } from '../../lib/actions';
import { parseListItem } from '../../lib/parse';
import { fromPB, relativeAgo } from '../../lib/dates';
import { LOCATIONS } from '../../lib/categories';
import { bagStock, expiryText, markChecked, needsRestock, restockQty, stockPct, stockStatus } from '../../lib/inventory';
import { IconRefresh, IconTrash } from '../../shared/Icons';
import { ChipGroup, Confirm, Loading, Screen, Sheet, useToast } from '../../shared/ui';
import { HomeTabs } from '../home/HomeTabs';
import type { BagItem, InventoryRec, Location } from '../../lib/types';
import './inventory.css';

type Mode = 'view' | 'reconcile';
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));

export function InventoryScreen() {
  const [params, setParams] = useSearchParams();
  const inventory = useRecords('inventory');
  const checks = useRecords('inv_checks');
  const listRows = useRecords('list_items');
  const toast = useToast();
  const loc = (params.get('loc') as Location) || 'pantry';
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [okd, setOkd] = useState<Record<string, boolean>>({});
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<InventoryRec | null>(null);
  const [saving, setSaving] = useState(false);

  const at = useMemo(() => (inventory || []).filter((i) => i.location === loc).sort((a, b) => a.name.localeCompare(b.name)), [inventory, loc]);
  const lowAt = (l: Location) => (inventory || []).filter((i) => i.location === l && needsRestock(i)).length;
  const onList = (name: string) => (listRows || []).some((r) => !r.checked && r.name.toLowerCase() === name.toLowerCase());
  const lowHere = at.filter((i) => needsRestock(i) && !onList(i.name));

  if (!inventory) return <Loading />;

  const label = LOCATIONS.find((l) => l.id === loc)!.label;
  const lastChecked = fromPB((checks || []).find((c) => c.location === loc)?.checked_at);
  const pick = (l: Location) => {
    setParams(new URLSearchParams({ loc: l }), { replace: true });
    setDraft({});
    setOkd({});
    setRemoved({});
  };

  const reconciling = mode === 'reconcile';
  const visible = at.filter((i) => !removed[i.id]);
  const changes = visible.filter((i) => draft[i.id] !== undefined && draft[i.id] !== i.qty).length + Object.keys(removed).length;
  const touched = visible.filter((i) => okd[i.id] || (draft[i.id] !== undefined && draft[i.id] !== i.qty)).length;

  async function saveReconcile() {
    setSaving(true);
    for (const i of at) {
      if (removed[i.id]) await remove('inventory', i.id);
      else if (draft[i.id] !== undefined && draft[i.id] !== i.qty) await patch('inventory', i.id, { qty: draft[i.id] });
    }
    await markChecked(loc);
    setSaving(false);
    setMode('view');
    setDraft({});
    setOkd({});
    setRemoved({});
    toast({ text: changes ? `${label} updated · ${changes} change${changes === 1 ? '' : 's'}` : `${label} checked` });
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const p = parseListItem(newName);
    const item = await findOrCreateItem(p.name, p.category, p.unit);
    await add('inventory', { item, name: p.name, location: loc, qty: p.qty, unit: p.unit, low: 0, par: p.qty } as Omit<InventoryRec, 'id' | 'household'>);
    setNewName('');
    toast({ text: `Added ${p.name} to ${label}. Tap it to set when it counts as low.` });
  }

  async function lowToGrocery() {
    const list = await defaultList();
    if (!list) return;
    for (const i of lowHere) await addToList(list.id, { name: i.name, qty: restockQty(i), unit: i.unit === 'left' ? '' : i.unit, item: i.item, source: 'Running low' });
    toast({ text: `Added ${lowHere.length} item${lowHere.length === 1 ? '' : 's'} to ${list.name}` });
  }

  return (
    <Screen
      fab={!reconciling}
      header={
        <>
          <HomeTabs />
          {reconciling ? (
            <div className="header-row" style={{ marginTop: 6 }}>
              <div className="stack" style={{ gap: 2 }}>
                <h1 className="display" style={{ fontSize: 26 }}>Reconcile {label}</h1>
                <span className="small muted">{touched} of {visible.length} checked{changes ? ` · ${changes} changed` : ''}</span>
              </div>
              <div className="chips" style={{ flexWrap: 'nowrap' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode('view'); setDraft({}); setOkd({}); setRemoved({}); }}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={saveReconcile}>Save</button>
              </div>
            </div>
          ) : (
            <div className="header-row" style={{ marginTop: 6 }}>
              <h1 className="display h1">Inventory</h1>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('reconcile')}>Reconcile</button>
            </div>
          )}
          <div className="loc-tabs" role="tablist" aria-label="Location">
            {LOCATIONS.map((l) => {
              const n = lowAt(l.id);
              const on = l.id === loc;
              return (
                <button key={l.id} type="button" role="tab" aria-selected={on} className={`loc-tab glass${on ? ' on' : ''}`} onClick={() => pick(l.id)} disabled={reconciling && !on}>
                  {l.label}
                  <span className={`loc-sub${n ? ' low' : ''}`}>{n ? `${n} low` : 'all good'}</span>
                </button>
              );
            })}
          </div>
        </>
      }
    >
      {!reconciling && (
        <button type="button" className="glass checked-bar" onClick={() => setMode('reconcile')}>
          <IconRefresh />
          <span className="grow">{label} last checked {relativeAgo(lastChecked)}</span>
          <span style={{ color: 'var(--link)' }}>Reconcile ›</span>
        </button>
      )}
      {reconciling && <p className="small muted" style={{ margin: 0 }}>Fix counts with − and +, tap ✓ when a count is right, × to stop tracking an item, or add something new below.</p>}

      <section className="glass card inv-card" aria-label={`${label} items`}>
        {visible.map((i) => {
          const q = reconciling && draft[i.id] !== undefined ? draft[i.id] : i.qty;
          const changed = reconciling && q !== i.qty;
          const st = stockStatus({ qty: q, low: i.low });
          const exp = expiryText(i.expires_on);
          const ok = okd[i.id] || changed;
          const setQ = (v: number) => setDraft({ ...draft, [i.id]: Math.max(0, +v.toFixed(2)) });
          const Main = (
            <div className="grow stack" style={{ gap: 5, minWidth: 0 }}>
              <div className="spread" style={{ gap: 8 }}>
                <span className="inv-name">{i.name}</span>
                {st !== 'ok' && <span className={`tiny ${st === 'out' ? 'out' : 'lowtxt'}`}>{st === 'out' ? 'Out' : 'Low'}</span>}
              </div>
              <div className="bar"><div className={st === 'ok' ? '' : 'low'} style={{ width: `${stockPct({ qty: q, low: i.low, par: i.par })}%` }} /></div>
              {changed ? <span className="tiny muted">Was {fmtNum(i.qty)} {i.unit}</span> : exp ? <span className={`tiny${exp.warn ? ' lowtxt' : ' muted'}`}>{exp.text}{i.note ? ` · ${i.note}` : ''}</span> : i.note ? <span className="tiny muted">{i.note}</span> : null}
            </div>
          );
          return (
            <div key={i.id} className="inv-row">
              {reconciling && <button type="button" className="inv-x" aria-label={`Stop tracking ${i.name}`} onClick={() => setRemoved({ ...removed, [i.id]: true })}>×</button>}
              {reconciling ? Main : <button type="button" className="inv-open" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}>{Main}</button>}
              {reconciling ? (
                <div className="inv-count">
                  <button type="button" aria-label={`One less ${i.name}`} onClick={() => setQ(q - 1)}>−</button>
                  <span className="q" style={{ color: changed ? 'var(--link)' : undefined }}>{fmtNum(q)}<br /><span className="tiny muted">{i.unit}</span></span>
                  <button type="button" aria-label={`One more ${i.name}`} onClick={() => setQ(q + 1)}>+</button>
                  <button type="button" className={`ok${ok ? ' on' : ''}`} aria-label={`${i.name} count is right`} aria-pressed={!!ok} onClick={() => setOkd({ ...okd, [i.id]: !okd[i.id] })}>✓</button>
                </div>
              ) : (
                <span className="inv-qty">{fmtNum(i.qty)}<br /><span className="tiny muted">{i.unit}</span></span>
              )}
            </div>
          );
        })}
        {visible.length === 0 && <p className="empty">Nothing tracked here yet.</p>}
        <form className="add-bar" style={{ marginTop: 12 }} onSubmit={addItem}>
          <label htmlFor="inv-add" className="sr-only">Add an item to {label}</label>
          <input id="inv-add" className="input" placeholder={`Add to ${label}… (e.g. Rice 2 bags)`} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!newName.trim()}>Add</button>
        </form>
      </section>

      {!reconciling && lowHere.length > 0 && (
        <button type="button" className="btn btn-primary btn-block" onClick={lowToGrocery}>Add {lowHere.length} low item{lowHere.length === 1 ? '' : 's'} to Grocery</button>
      )}

      {!reconciling && loc === 'kids' && <DiaperBag inventory={inventory} onList={onList} />}

      {editing && <ItemSheet item={editing} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

// ---------- edit one item ----------
function ItemSheet({ item, onClose }: { item: InventoryRec; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: item.name, location: item.location, qty: fmtNum(item.qty || 0), unit: item.unit || '', low: item.low ? fmtNum(item.low) : '',
    par: item.par ? fmtNum(item.par) : '', expires: item.expires_on || '', note: item.note || '',
  });
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const n = (s: string) => {
    const v = parseFloat(s);
    return isNaN(v) ? 0 : Math.max(0, v);
  };

  async function save() {
    if (!f.name.trim()) return;
    await patch('inventory', item.id, { name: f.name.trim(), location: f.location, qty: n(f.qty), unit: f.unit.trim(), low: n(f.low), par: n(f.par), expires_on: f.expires, note: f.note.trim() });
    onClose();
  }

  async function toGrocery() {
    const list = await defaultList();
    if (!list) return;
    await addToList(list.id, { name: item.name, qty: restockQty({ qty: n(f.qty), low: n(f.low), par: n(f.par) }), unit: f.unit === 'left' ? '' : f.unit, item: item.item, source: 'Running low' });
    toast({ text: `Added ${item.name} to ${list.name}` });
  }

  return (
    <Sheet title="Edit item" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-block" onClick={save}>Save</button>}>
      <label className="field">Name<input value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
      <div className="field"><span>Where</span>
        <ChipGroup label="Where" value={f.location} onChange={(v) => set('location', v)} options={LOCATIONS.map((l) => ({ value: l.id, label: l.label }))} />
      </div>
      <div className="field-row">
        <label className="field">How many now<input type="number" inputMode="decimal" min={0} step="any" value={f.qty} onChange={(e) => set('qty', e.target.value)} /></label>
        <label className="field">Unit<input value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="e.g. bags, gal, packs" /></label>
      </div>
      <div className="field-row">
        <label className="field">Running low at<input type="number" inputMode="decimal" min={0} step="any" value={f.low} placeholder="0 = never" onChange={(e) => set('low', e.target.value)} /></label>
        <label className="field">Full stock<input type="number" inputMode="decimal" min={0} step="any" value={f.par} placeholder="optional" onChange={(e) => set('par', e.target.value)} /></label>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>At or below "running low" it shows as Low and can go to Grocery. "Full stock" is how much you like to have; the bar fills toward it and restocking buys back up to it.</p>
      <label className="field">Use by (optional)
        <div className="add-bar">
          <input className="input" type="date" value={f.expires} onChange={(e) => set('expires', e.target.value)} />
          {f.expires && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('expires', '')}>Clear</button>}
        </div>
      </label>
      <label className="field">Note<input value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Meal prep · made Oct 26" /></label>
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={toGrocery}>Add to Grocery</button>
      {!confirm ? (
        <button type="button" className="btn btn-danger btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}><IconTrash size={16} /> Stop tracking</button>
      ) : (
        <Confirm text={`Stop tracking ${item.name}?`} confirmLabel="Remove" onCancel={() => setConfirm(false)} onConfirm={async () => { await remove('inventory', item.id); onClose(); }} />
      )}
    </Sheet>
  );
}

// ---------- diaper bag ----------
function DiaperBag({ inventory, onList }: { inventory: InventoryRec[]; onList: (name: string) => boolean }) {
  const bag = useRecords('bag_items');
  const toast = useToast();
  const [editingBag, setEditingBag] = useState(false);
  const [newItem, setNewItem] = useState('');
  const items = useMemo(() => (bag || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), [bag]);
  const packed = items.filter((b) => b.packed).length;

  async function restock(stock: InventoryRec) {
    const list = await defaultList();
    if (!list) return;
    await addToList(list.id, { name: stock.name, qty: restockQty(stock), unit: stock.unit === 'left' ? '' : stock.unit, item: stock.item, source: 'Running low' });
    toast({ text: `Added ${stock.name} to ${list.name}` });
  }

  async function addBagItem(e: FormEvent) {
    e.preventDefault();
    const name = newItem.trim();
    if (!name) return;
    await add('bag_items', { name, target_qty: 1, packed: false, sort: items.length } as Omit<BagItem, 'id' | 'household'>);
    setNewItem('');
  }

  return (
    <section className="glass card" aria-label="Diaper bag" style={{ gap: 4 }}>
      <div className="spread" style={{ marginBottom: 4 }}>
        <h2 className="label">Diaper bag</h2>
        <span className="small" style={{ color: 'var(--link)' }}>{packed} of {items.length} packed</span>
      </div>
      {items.map((b) => {
        const stock = bagStock(b, inventory);
        const low = stock && needsRestock(stock);
        return (
          <div key={b.id} className="bag-row">
            {editingBag && <button type="button" className="inv-x" aria-label={`Remove ${b.name} from the bag list`} onClick={() => remove('bag_items', b.id)}>×</button>}
            <label className="grow bag-main">
              <input type="checkbox" checked={b.packed} onChange={() => patch('bag_items', b.id, { packed: !b.packed })} />
              <span className="grow">{b.name}</span>
            </label>
            {low && stock ? (
              onList(stock.name)
                ? <span className="pill" style={{ opacity: 0.75 }}>On list</span>
                : <button type="button" className="pill pill-warn restock" onClick={() => restock(stock)} aria-label={`Restock ${stock.name}: add to Grocery`}>Restock</button>
            ) : b.target_qty > 1 ? (
              <span className="small muted">×{b.target_qty}</span>
            ) : null}
          </div>
        );
      })}
      {editingBag && (
        <form className="add-bar" style={{ marginTop: 8 }} onSubmit={addBagItem}>
          <label htmlFor="bag-add" className="sr-only">Add to the diaper bag list</label>
          <input id="bag-add" className="input" placeholder="e.g. Sunscreen" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!newItem.trim()}>Add</button>
        </form>
      )}
      <div className="chips" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!packed} onClick={async () => { for (const b of items) if (b.packed) await patch('bag_items', b.id, { packed: false }); }}>Unpack all</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingBag(!editingBag)}>{editingBag ? 'Done' : 'Edit list'}</button>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>Restock appears when the matching Kids supply is low.</p>
    </section>
  );
}
