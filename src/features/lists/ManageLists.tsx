// Manage lists (mockup: Manage lists · night): rename, reorder, delete, add.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { add, patch, remove, useRecords } from '../../lib/sync';
import { db } from '../../lib/sync/db';
import { IconTrash } from '../../shared/Icons';
import { BackLink, ChipGroup, Confirm, Screen, useMembers } from '../../shared/ui';
import type { List, ListKind } from '../../lib/types';
import './lists.css';

const PALETTE = ['#D9B36C', '#7FC4C9', '#9C8BD6', '#E9A27C', '#7FC4C9'];
const KINDS: { value: ListKind; label: string; hint: string }[] = [
  { value: 'store', label: 'Store', hint: 'Store lists sort by that store’s aisles on a shopping trip, and restock Inventory.' },
  { value: 'errands', label: 'Errands', hint: 'A simple checklist for stops around town.' },
  { value: 'wish', label: 'Wish list', hint: 'Things to buy someday; nothing restocks Inventory.' },
  { value: 'other', label: 'Other', hint: 'A plain list for anything else.' },
];
const KIND_LABEL: Record<ListKind, string> = { store: 'Store', errands: 'Errands', wish: 'Wish list', other: 'Other' };

export function ManageLists() {
  const lists = useRecords('lists');
  const rows = useRecords('list_items');
  const members = useMembers();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>('store');
  const [shared, setShared] = useState(true);

  const sorted = useMemo(() => (lists || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), [lists]);
  const count = (id: string) => (rows || []).filter((r) => r.list === id).length;
  const partner = members.others[0]?.name || 'the family';

  async function move(i: number, to: number) {
    if (to < 0 || to >= sorted.length) return;
    const next = sorted.slice();
    const [it] = next.splice(i, 1);
    next.splice(to, 0, it);
    for (const [idx, l] of next.entries()) if (l.sort !== idx) await patch('lists', l.id, { sort: idx });
  }

  async function del(l: List) {
    // delete the rows explicitly too so the offline copy is tidy right away
    const mine = await db.t('list_items').filter((r) => r.list === l.id).toArray();
    for (const r of mine) await remove('list_items', r.id);
    await remove('lists', l.id);
    setConfirm(null);
  }

  async function create() {
    if (!name.trim()) return;
    await add('lists', { name: name.trim(), kind, shared, sort: sorted.length, color: PALETTE[sorted.length % PALETTE.length] } as Omit<List, 'id' | 'household'>);
    setName('');
  }

  return (
    <Screen
      fab={false}
      header={
        <>
          <div className="header-row">
            <BackLink to="/lists" />
            <Link to="/lists" className="btn btn-primary btn-sm">Done</Link>
          </div>
          <h1 className="display h1">Manage lists</h1>
          <p className="muted small" style={{ margin: 0 }}>Rename, reorder or remove. The top list is the default for Quick add.</p>
        </>
      }
    >
      <section aria-label="Your lists" className="stack">
        {sorted.map((l, i) => (
          <div key={l.id} className="stack" style={{ gap: 6 }}>
            <div className={`manage-row glass${i === 0 ? ' default' : ''}`}>
              <div className="moves">
                <button type="button" aria-label={`Move ${l.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>▲</button>
                <button type="button" aria-label={`Move ${l.name} down`} disabled={i === sorted.length - 1} onClick={() => move(i, i + 1)}>▼</button>
              </div>
              <span className="swatch" style={{ background: l.color || 'var(--accent)' }} />
              <div className="grow stack" style={{ gap: 2 }}>
                <input aria-label="List name" className="input" defaultValue={l.name} onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && patch('lists', l.id, { name: e.target.value.trim() })} />
                <span className="tiny muted">
                  {KIND_LABEL[l.kind] || 'Other'} · {count(l.id)} items · {l.shared ? 'shared' : 'only you'}
                  {i === 0 ? ' · default' : ''}
                </span>
              </div>
              <button type="button" className="row-del" aria-label={`Delete ${l.name}`} onClick={() => setConfirm(l.id)}><IconTrash /></button>
            </div>
            {confirm === l.id && <Confirm text={`Delete ${l.name} and its ${count(l.id)} items?`} onCancel={() => setConfirm(null)} onConfirm={() => del(l)} />}
          </div>
        ))}
        {sorted.length === 0 && <p className="empty">No lists yet. Add one below.</p>}
      </section>

      <section aria-label="New list" className="glass card" style={{ gap: 12 }}>
        <h2 className="label">New list</h2>
        <label className="field">
          Name
          <input placeholder="e.g. Target, Pharmacy, Birthday party" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Kind of list</span>
          <ChipGroup label="Kind of list" options={KINDS} value={kind} onChange={setKind} />
          <span className="small muted">{KINDS.find((k) => k.value === kind)!.hint}</span>
        </div>
        <label className="row" style={{ borderBottom: 'none', minHeight: 36 }}>
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share with {partner}
        </label>
        <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={create}>Add list</button>
      </section>
    </Screen>
  );
}
