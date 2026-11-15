// App-wide sync instance wired to the real PocketBase client, plus React hooks.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { pb, householdId, newId } from '../pb';
import type { CollectionMap, CollectionName } from '../types';
import { db } from './db';
import { SyncEngine, type SyncApi, type SyncStatus } from './engine';

const api: SyncApi = {
  list: (c) => pb.collection(c).getFullList({ batch: 500 }) as Promise<Record<string, unknown>[]>,
  create: (c, data) => pb.collection(c).create(data) as Promise<Record<string, unknown>>,
  update: (c, id, data) => pb.collection(c).update(id, data) as Promise<Record<string, unknown>>,
  remove: (c, id) => pb.collection(c).delete(id),
  subscribe: (c, cb) => pb.collection(c).subscribe('*', (e) => cb(e as never)),
};

export const sync = new SyncEngine(api);

let started = false;
export async function startSync() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => sync.setOnline(true));
  window.addEventListener('offline', () => sync.setOnline(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      sync.setOnline(true);
    }
  });
  await sync.start();
  // After a dropped realtime connection comes back (phone slept, Wi-Fi switch),
  // re-download so nothing that changed in between is missed.
  let first = true;
  await pb.realtime.subscribe('PB_CONNECT', () => {
    if (first) {
      first = false;
      return;
    }
    void sync.flush().then(() => sync.pullAll());
  });
}

export async function stopSync() {
  started = false;
  await sync.stop();
}

/** Live array of a collection from IndexedDB. Re-renders on any change. */
export function useRecords<C extends CollectionName>(c: C): CollectionMap[C][] | undefined {
  return useLiveQuery(() => db.t(c).toArray() as Promise<CollectionMap[C][]>, [c]);
}

export function useRecord<C extends CollectionName>(c: C, id: string | undefined): CollectionMap[C] | undefined | null {
  return useLiveQuery(async () => (id ? ((await db.t(c).get(id)) as CollectionMap[C]) ?? null : null), [c, id]);
}

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState(sync.status);
  useEffect(() => sync.onStatus(setS), []);
  return s;
}

// ---------- write helpers used by screens ----------
type NewRec<C extends CollectionName> = Omit<CollectionMap[C], 'id' | 'household'> & { id?: string };

export async function add<C extends CollectionName>(c: C, data: NewRec<C>): Promise<string> {
  const id = data.id || newId();
  await sync.create(c, { ...(data as object), id, household: householdId() } as unknown as CollectionMap[C] & { id: string });
  return id;
}

export function patch<C extends CollectionName>(c: C, id: string, data: Partial<CollectionMap[C]>) {
  return sync.update(c, id, data);
}

export function remove(c: CollectionName, id: string) {
  return sync.remove(c, id);
}
