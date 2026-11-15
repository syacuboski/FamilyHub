// Lists (mockup: Lists · night). Tabs per list, add bar, rows grouped by
// category, "In the cart" section, live check-off shared with the other phone.
import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useRecords } from '../../lib/sync';
import { addToList, setChecked } from '../../lib/actions';
import { parseListItem } from '../../lib/parse';
import { fmtListQty } from '../../lib/units';
import { CATEGORIES } from '../../lib/categories';
import { remove } from '../../lib/sync';
import { IconEdit, IconPlus, IconTrash } from '../../shared/Icons';
import { Loading, Screen, SyncLine, useMembers, useToast } from '../../shared/ui';
import type { ListItem } from '../../lib/types';
import './lists.css';

export function ListsScreen() {
  const { listId } = useParams();
  const lists = useRecords('lists');
  const rows = useRecords('list_items');
  const members = useMembers();
  const toast = useToast();
  const [text, setText] = useState('');

  const sorted = useMemo(() => (lists || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), [lists]);
  const list = sorted.find((l) => l.id === listId) || sorted[0];
  const mine = useMemo(() => (rows || []).filter((r) => r.list === list?.id), [rows, list]);
  const open = mine.filter((r) => !r.checked);
  const inCart = mine.filter((r) => r.checked).sort((a, b) => (a.check_order || 0) - (b.check_order || 0));
  const groups = useMemo(() => {
    const m = new Map<string, ListItem[]>();
    for (const r of open) {
      const c = r.category || 'Other';
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(r);
    }
    const order = (c: string) => (CATEGORIES.indexOf(c) === -1 ? 99 : CATEGORIES.indexOf(c));
    return [...m.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([name, items]) => ({ name, items: items.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [open]);

  if (!lists) return <Loading />;
  if (!list) return <Navigate to="/lists/manage" replace />;

  const others = members.others.map((u) => u.name).join(' & ');
  const counts = (id: string) => (rows || []).filter((r) => r.list === id && !r.checked).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const p = parseListItem(text);
    await addToList(list!.id, p);
    setText('');
  }

  async function del(r: ListItem) {
    await remove('list_items', r.id);
    toast({ text: `Removed ${r.name}`, action: { label: 'Undo', run: () => void addToList(r.list, r) } });
  }

  return (
    <Screen
      header={
        <>
          <p className="eyebrow">Lists</p>
          <h1 className="display" style={{ fontSize: 34 }}>{list.name}</h1>
          <div className="header-row">
            <SyncLine prefix={list.shared && others ? `Shared with ${others}` : undefined} />
            {list.kind === 'store' && (
              <Link to={`/lists/${list.id}/trip`} className="btn btn-ghost btn-sm">Start trip</Link>
            )}
          </div>
        </>
      }
    >
      <div className="chips scroll" role="tablist" aria-label="Lists" style={{ margin: '0 -18px', padding: '0 18px' }}>
        {sorted.map((l) => (
          <Link key={l.id} to={`/lists/${l.id}`} role="tab" aria-selected={l.id === list.id} className="chip" replace>
            {l.name} · {counts(l.id)}
          </Link>
        ))}
        <Link to="/lists/manage" className="chip chip-dashed" aria-label="Add or edit lists">
          <IconEdit />
        </Link>
      </div>

      <form className="add-bar" onSubmit={submit}>
        <label htmlFor="add-item" className="sr-only">Add an item</label>
        <input id="add-item" className="input glass" placeholder="Add an item… (e.g. Milk 2 gal)" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" enterKeyHint="done" />
        <button type="submit" className="btn btn-primary btn-icon" aria-label="Add item"><IconPlus /></button>
      </form>

      {groups.length === 0 && inCart.length === 0 && <p className="empty">Nothing on {list.name} yet. Add something above or with the ✦ button.</p>}

      {groups.map((g) => (
        <section key={g.name} className="list-group">
          <h2 className="label">{g.name}</h2>
          {g.items.map((r) => (
            <Row key={r.id} r={r} onDelete={() => del(r)} />
          ))}
        </section>
      ))}

      {inCart.length > 0 && (
        <section className="list-group">
          <h2 className="label">In the cart · {inCart.length}</h2>
          {inCart.map((r) => (
            <Row key={r.id} r={r} who={members.name(r.checked_by, '')} onDelete={() => del(r)} />
          ))}
          {list.kind === 'store' && <p className="muted small" style={{ margin: '8px 0 0' }}>Checked items restock Inventory when you finish the trip.</p>}
        </section>
      )}
    </Screen>
  );
}

function Row({ r, who, onDelete }: { r: ListItem; who?: string; onDelete: () => void }) {
  const low = r.source === 'Running low';
  return (
    <div className={`row list-row${r.checked ? ' done' : ''}${r._pending ? ' pending' : ''}`}>
      <label className="grow list-row-main">
        <input type="checkbox" checked={r.checked} onChange={(e) => void setChecked(r, e.target.checked)} />
        <span className="grow name">{r.name}</span>
      </label>
      {r.source && !r.checked && <span className={`pill${low ? ' pill-warn' : ''}`}>{r.source}</span>}
      {who && <span className="tiny faint">{who}</span>}
      <span className="qty">{fmtListQty(r.qty, r.unit)}</span>
      <button type="button" className="row-del" aria-label={`Remove ${r.name}`} onClick={onDelete}><IconTrash size={16} /></button>
    </div>
  );
}
