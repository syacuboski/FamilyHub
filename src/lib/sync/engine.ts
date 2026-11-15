// Offline-first sync.
//
//  • Reads come from IndexedDB, so screens open instantly and work with no signal.
//  • Writes land in IndexedDB at once and are queued in the outbox.
//  • The outbox is replayed in order whenever we're online (create → update → delete).
//  • PocketBase realtime pushes the other phone's changes into IndexedDB.
//  • Conflicts: last write wins per record. Fine for a two-person household.
import { db, READ_ONLY, SYNCED, type OutboxEntry } from './db';
import type { CollectionMap, CollectionName } from '../types';

export interface RealtimeEvent { action: 'create' | 'update' | 'delete'; record: Record<string, unknown> & { id: string } }

/** The slice of the PocketBase SDK the engine needs (swappable in tests). */
export interface SyncApi {
  list(c: CollectionName): Promise<Record<string, unknown>[]>;
  create(c: CollectionName, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(c: CollectionName, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  remove(c: CollectionName, id: string): Promise<unknown>;
  subscribe(c: CollectionName, cb: (e: RealtimeEvent) => void): Promise<() => void>;
}

export type SyncStatus = { online: boolean; pending: number; syncing: boolean; lastSync: number | null; error: string | null };

type Listener = (s: SyncStatus) => void;

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

const isNetworkError = (e: unknown) => {
  const err = e as { status?: number; isAbort?: boolean };
  return err.status === 0 || err.status === undefined || err.isAbort === true;
};

const strip = (rec: Record<string, unknown>) => {
  const { _pending, expand, ...rest } = rec as Record<string, unknown> & { _pending?: boolean; expand?: unknown };
  void _pending; void expand;
  return rest;
};

export class SyncEngine {
  private api: SyncApi;
  private unsubs: (() => void)[] = [];
  private flushing: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  status: SyncStatus = { online: isOnline(), pending: 0, syncing: false, lastSync: null, error: null };

  constructor(api: SyncApi) {
    this.api = api;
  }

  onStatus(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  private async refreshPending() {
    this.setStatus({ pending: await db.outbox.count() });
  }

  /** Initial load + realtime. Call once after sign-in. */
  async start(): Promise<void> {
    await this.refreshPending();
    // Listen first, then download: anything the other phone changes while we
    // download arrives as a realtime event instead of being missed.
    await this.subscribeAll();
    await this.flush();
    await this.pullAll();
  }

  async stop(): Promise<void> {
    for (const u of this.unsubs) {
      try { u(); } catch { /* ignore */ }
    }
    this.unsubs = [];
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  setOnline(online: boolean) {
    this.setStatus({ online });
    if (online) {
      void this.flush().then(() => this.pullAll());
    }
  }

  /** Replace the local copy of each collection with the server's, keeping
   *  records that still have changes waiting in the outbox. */
  async pullAll(): Promise<void> {
    if (!this.status.online) return;
    this.setStatus({ syncing: true });
    try {
      for (const c of SYNCED) await this.pull(c);
      this.setStatus({ lastSync: Date.now(), error: null });
    } catch (e) {
      if (isNetworkError(e)) this.setStatus({ online: false });
      else this.setStatus({ error: String((e as Error).message || e) });
    } finally {
      this.setStatus({ syncing: false });
    }
  }

  async pull(c: CollectionName): Promise<void> {
    const rows = await this.api.list(c);
    const pendingIds = new Set((await db.outbox.where('c').equals(c).toArray()).map((o) => o.id));
    const table = db.t(c);
    await db.transaction('rw', table, async () => {
      const localIds = (await table.toCollection().primaryKeys()) as string[];
      const serverIds = new Set(rows.map((r) => r.id as string));
      const gone = localIds.filter((id) => !serverIds.has(id) && !pendingIds.has(id));
      if (gone.length) await table.bulkDelete(gone);
      const fresh = rows.filter((r) => !pendingIds.has(r.id as string)).map((r) => strip(r));
      if (fresh.length) await table.bulkPut(fresh as never[]);
    });
  }

  private async subscribeAll() {
    for (const c of SYNCED) {
      try {
        const un = await this.api.subscribe(c, (e) => void this.applyRemote(c, e));
        this.unsubs.push(un);
      } catch {
        /* realtime is a bonus; pulls on focus/online still keep us current */
      }
    }
  }

  async applyRemote(c: CollectionName, e: RealtimeEvent) {
    const pending = await db.outbox.where('id').equals(e.record.id).count();
    if (pending) return; // our own queued change wins until it lands
    const table = db.t(c);
    if (e.action === 'delete') await table.delete(e.record.id);
    else await table.put(strip(e.record) as never);
  }

  // ---------- writes ----------
  async create<C extends CollectionName>(c: C, rec: CollectionMap[C] & { id: string }): Promise<void> {
    this.guard(c);
    const now = new Date().toISOString().replace('T', ' ');
    const row = { created: now, updated: now, ...rec, _pending: true };
    await db.transaction('rw', db.t(c), db.outbox, async () => {
      await db.t(c).put(row as never);
      await db.outbox.add({ c, op: 'create', id: rec.id, data: strip(rec as never), ts: Date.now() });
    });
    await this.afterWrite();
  }

  async update<C extends CollectionName>(c: C, id: string, patch: Partial<CollectionMap[C]>): Promise<void> {
    this.guard(c);
    await db.transaction('rw', db.t(c), db.outbox, async () => {
      await db.t(c).update(id, { ...(patch as object), _pending: true } as never);
      await db.outbox.add({ c, op: 'update', id, data: strip(patch as never), ts: Date.now() });
    });
    await this.afterWrite();
  }

  async remove(c: CollectionName, id: string): Promise<void> {
    this.guard(c);
    await db.transaction('rw', db.t(c), db.outbox, async () => {
      await db.t(c).delete(id);
      // a create that never reached the server can simply be forgotten
      const queued = await db.outbox.where('id').equals(id).toArray();
      const neverSent = queued.some((q) => q.op === 'create');
      if (neverSent) await db.outbox.bulkDelete(queued.map((q) => q.seq!));
      else await db.outbox.add({ c, op: 'delete', id, ts: Date.now() });
    });
    await this.afterWrite();
  }

  private guard(c: CollectionName) {
    if (READ_ONLY.includes(c)) throw new Error(`${c} is read-only in the app`);
  }

  private async afterWrite() {
    await this.refreshPending();
    void this.flush();
  }

  /** Replay the outbox in order. Stops at the first network failure. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush() {
    if (!this.status.online) return;
    for (;;) {
      const next = await db.outbox.orderBy('seq').first();
      if (!next) break;
      try {
        const saved = await this.send(next);
        await db.outbox.delete(next.seq!);
        const morePending = await db.outbox.where('id').equals(next.id).count();
        if (saved && !morePending) await db.t(next.c).put(strip(saved) as never);
      } catch (e) {
        if (isNetworkError(e)) {
          this.setStatus({ online: false });
          this.scheduleRetry();
          break;
        }
        // The server rejected this change (validation/permissions). Drop it so the
        // queue isn't stuck, and re-pull that collection to undo the local edit.
        const msg = (e as { message?: string }).message || String(e);
        console.warn('[sync] dropped change', next, msg);
        await db.outbox.delete(next.seq!);
        this.setStatus({ error: `A change to ${next.c} was refused: ${msg}` });
        try { await this.pull(next.c); } catch { /* offline again */ }
      }
      await this.refreshPending();
    }
    await this.refreshPending();
  }

  private async send(o: OutboxEntry): Promise<Record<string, unknown> | null> {
    switch (o.op) {
      case 'create':
        try {
          return await this.api.create(o.c, o.data!);
        } catch (e) {
          // Already there (e.g. the request landed but the reply was lost): update instead.
          if ((e as { status?: number }).status === 400 && /id|unique|exists/i.test(JSON.stringify((e as { response?: unknown }).response || ''))) {
            const { id, ...rest } = o.data!;
            void id;
            return await this.api.update(o.c, o.id, rest);
          }
          throw e;
        }
      case 'update':
        try {
          return await this.api.update(o.c, o.id, o.data!);
        } catch (e) {
          if ((e as { status?: number }).status === 404) return null; // deleted elsewhere
          throw e;
        }
      case 'delete':
        try {
          await this.api.remove(o.c, o.id);
        } catch (e) {
          if ((e as { status?: number }).status !== 404) throw e;
        }
        return null;
    }
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.setStatus({ online: isOnline() });
      void this.flush();
    }, 15000);
  }
}
