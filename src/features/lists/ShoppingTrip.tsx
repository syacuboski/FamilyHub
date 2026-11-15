// Shopping trip (mockup: Shopping trip · night). Big tap targets in store
// aisle order, progress bar, then "Finish trip" → confirm where things go in
// Inventory → restock. The order you check things off teaches the aisle order.
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useRecords } from '../../lib/sync';
import { finishTrip, setChecked, suggestedLocation, type Bought } from '../../lib/actions';
import { CATEGORIES, LOCATIONS } from '../../lib/categories';
import { fmtListQty } from '../../lib/units';
import { BackLink, Loading, Screen, useToast } from '../../shared/ui';
import type { ListItem, Location } from '../../lib/types';
import './lists.css';

export function ShoppingTrip() {
  const { listId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const lists = useRecords('lists');
  const rows = useRecords('list_items');
  const stores = useRecords('stores');
  const [storeId, setStoreId] = useState<string>('');
  const [finishing, setFinishing] = useState(false);
  const [where, setWhere] = useState<Record<string, Location | 'skip'>>({});
  const [busy, setBusy] = useState(false);

  const list = lists?.find((l) => l.id === listId);
  const sortedStores = useMemo(() => (stores || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), [stores]);
  const store = sortedStores.find((s) => s.id === storeId) || sortedStores[0];
  const mine = useMemo(() => (rows || []).filter((r) => r.list === listId), [rows, listId]);

  const groups = useMemo(() => {
    const order = store?.category_order || [];
    const rank = (c: string) => {
      const i = order.indexOf(c);
      return i === -1 ? 100 + (CATEGORIES.indexOf(c) === -1 ? 99 : CATEGORIES.indexOf(c)) : i;
    };
    const m = new Map<string, ListItem[]>();
    for (const r of mine) {
      const c = r.category || 'Other';
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(r);
    }
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([name, items]) => ({ name, items: items.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [mine, store]);

  if (!lists || !rows) return <Loading />;
  if (!list) return <Screen fab={false} header={<BackLink to="/lists" />}><p className="empty">That list is gone.</p></Screen>;

  const total = mine.length;
  const done = mine.filter((r) => r.checked);
  const pct = total ? Math.round((done.length / total) * 100) : 0;
  const learned = (store?.category_order || []).length > 0;
  const locFor = (r: ListItem) => where[r.id] || (list.kind === 'store' ? suggestedLocation(r) : 'skip');

  async function confirm() {
    setBusy(true);
    const bought: Bought[] = done.map((row) => ({ row, location: locFor(row) }));
    await finishTrip(bought, store?.id);
    const stocked = bought.filter((b) => b.location !== 'skip').length;
    toast({ text: stocked ? `Restocked ${stocked} item${stocked === 1 ? '' : 's'} in Inventory` : 'Trip finished' });
    nav(`/lists/${list!.id}`);
  }

  const cycle = (r: ListItem) => {
    const ids: (Location | 'skip')[] = ['pantry', 'fridge', 'freezer', 'kids', 'skip'];
    const cur = locFor(r);
    setWhere({ ...where, [r.id]: ids[(ids.indexOf(cur) + 1) % ids.length] });
  };
  const locLabel = (l: Location | 'skip') => (l === 'skip' ? "Don't track" : LOCATIONS.find((x) => x.id === l)!.label);

  return (
    <div className="screen">
      <header className="screen-header compact" style={{ gap: 10 }}>
        <div className="header-row">
          <BackLink to={`/lists/${list.id}`} />
          {sortedStores.length > 0 && (
            <select aria-label="Store" className="input glass" style={{ maxWidth: 210, minHeight: 38, fontSize: 13 }} value={store?.id || ''} onChange={(e) => setStoreId(e.target.value)}>
              {sortedStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        <h1 className="display h1">{list.name} trip</h1>
        <div className="stack" style={{ gap: 6 }}>
          <div className="spread small"><span>{done.length} of {total} in the cart</span><span className="muted">{learned ? `In ${store!.name} aisle order` : 'By category'}</span></div>
          <div className="trip-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
          {!finishing && <p className="tiny" style={{ margin: 0, color: 'var(--teal)' }}>Learning this store's layout from the order you check things off.</p>}
        </div>
      </header>

      {!finishing ? (
        <>
          <main className="screen-main no-fab" style={{ paddingBottom: 12 }}>
            {groups.map((g) => (
              <section key={g.name}>
                <h2 className="label" style={{ marginBottom: 6 }}>{g.name}</h2>
                {g.items.map((r) => (
                  <label key={r.id} className={`trip-row${r.checked ? ' done' : ''}`}>
                    <input type="checkbox" checked={r.checked} onChange={(e) => void setChecked(r, e.target.checked)} />
                    <span className="grow name">{r.name}</span>
                    <span className="muted small">{fmtListQty(r.qty, r.unit)}</span>
                  </label>
                ))}
              </section>
            ))}
            {total === 0 && <p className="empty">This list is empty.</p>}
          </main>
          <div className="trip-foot">
            <button type="button" className="btn btn-primary btn-block" disabled={done.length === 0} onClick={() => setFinishing(true)}>Finish trip</button>
          </div>
        </>
      ) : (
        <>
          <main className="screen-main no-fab">
            <section className="glass card">
              <h2 className="label">{list.kind === 'store' ? 'Restock Inventory' : 'Clear checked items'}</h2>
              {list.kind === 'store' && <p className="small muted" style={{ margin: 0 }}>These go into stock. Tap a place to change it.</p>}
              {done.map((r) => (
                <div key={r.id} className="row">
                  <span className="grow">{r.name} <span className="muted small">{fmtListQty(r.qty, r.unit)}</span></span>
                  {list.kind === 'store' && <button type="button" className="chip" onClick={() => cycle(r)}>{locLabel(locFor(r))}</button>}
                </div>
              ))}
            </section>
            {total - done.length > 0 && <p className="small muted">{total - done.length} item{total - done.length === 1 ? '' : 's'} not bought stay on the list for next time.</p>}
          </main>
          <div className="trip-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setFinishing(false)}>Keep shopping</button>
            <button type="button" className="btn btn-primary grow" disabled={busy} onClick={confirm}>{list.kind === 'store' ? 'Confirm & restock' : 'Clear checked'}</button>
          </div>
        </>
      )}
    </div>
  );
}
