// Local IndexedDB mirror of the household's data (Dexie).
// One table per collection, plus an outbox of changes waiting to reach the server.
import Dexie, { type Table } from 'dexie';
import type { CollectionMap, CollectionName } from '../types';

export const SYNCED: CollectionName[] = [
  'users', 'items', 'lists', 'list_items', 'stores', 'tasks', 'events', 'recipes', 'recipe_ingredients',
  'tags', 'menu_entries', 'inventory', 'inv_checks', 'bag_items',
];

/** Collections the app never writes to through the outbox. */
export const READ_ONLY: CollectionName[] = ['users'];

export interface OutboxEntry {
  seq?: number;
  c: CollectionName;
  op: 'create' | 'update' | 'delete';
  id: string;
  data?: Record<string, unknown>;
  ts: number;
  tries?: number;
}

export interface MetaRow { key: string; value: unknown }

class FamilyHubDB extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaRow, string>;
  constructor(name = 'familyhub') {
    super(name);
    const stores: Record<string, string> = { outbox: '++seq, c, id', meta: '&key' };
    for (const c of SYNCED) stores[c] = '&id';
    this.version(1).stores(stores);
  }
  t<C extends CollectionName>(c: C): Table<CollectionMap[C] & { _pending?: boolean }, string> {
    return this.table(c);
  }
}

export let db = new FamilyHubDB();

/** Used by sign-out and tests: forget everything cached on this device. */
export async function resetLocal(): Promise<void> {
  await db.delete();
  db = new FamilyHubDB();
  await db.open();
}
