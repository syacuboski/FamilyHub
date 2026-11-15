// Outbox replay: offline edits queue up and land in order once back online.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetLocal } from '../../src/lib/sync/db';
import { SyncEngine, type SyncApi } from '../../src/lib/sync/engine';
import type { CollectionName } from '../../src/lib/types';

type Row = Record<string, unknown> & { id: string };

function fakeServer() {
  const data = new Map<string, Map<string, Row>>();
  const tbl = (c: string) => data.get(c) ?? data.set(c, new Map()).get(c)!;
  const state = { online: true, calls: [] as string[], reject: new Set<string>() };
  const net = () => {
    if (!state.online) throw Object.assign(new Error('offline'), { status: 0 });
  };
  const api: SyncApi = {
    async list(c) { net(); return [...tbl(c).values()]; },
    async create(c, d) {
      net();
      state.calls.push(`create ${c} ${d.id}`);
      if (state.reject.has(String(d.id))) throw Object.assign(new Error('Failed to create record.'), { status: 400, response: { data: { name: 'bad' } } });
      if (tbl(c).has(String(d.id))) throw Object.assign(new Error('exists'), { status: 400, response: { data: { id: { code: 'validation_not_unique' } } } });
      const r = { ...d, updated: 'srv' } as unknown as Row;
      tbl(c).set(r.id, r);
      return r;
    },
    async update(c, id, d) {
      net();
      state.calls.push(`update ${c} ${id}`);
      const cur = tbl(c).get(id);
      if (!cur) throw Object.assign(new Error('nf'), { status: 404 });
      const r = { ...cur, ...d, updated: 'srv' };
      tbl(c).set(id, r);
      return r;
    },
    async remove(c, id) {
      net();
      state.calls.push(`delete ${c} ${id}`);
      if (!tbl(c).delete(id)) throw Object.assign(new Error('nf'), { status: 404 });
      return true;
    },
    async subscribe() { return () => {}; },
  };
  return { api, state, tbl };
}

const C: CollectionName = 'list_items';
const row = (id: string, name: string) => ({ id, household: 'h', list: 'l', name, qty: 1, unit: '', category: '', checked: false });

describe('sync engine', () => {
  beforeEach(async () => {
    await resetLocal();
  });

  it('writes locally at once and replays the outbox when back online', async () => {
    const s = fakeServer();
    const eng = new SyncEngine(s.api);
    eng.setOnline(false);
    s.state.online = false;

    await eng.create(C, row('aaaaaaaaaaaaaa1', 'Milk') as never);
    await eng.create(C, row('aaaaaaaaaaaaaa2', 'Eggs') as never);
    await eng.update(C, 'aaaaaaaaaaaaaa1', { checked: true } as never);
    await eng.remove(C, 'aaaaaaaaaaaaaa2'); // never reached server → dropped from queue

    expect((await db.t(C).get('aaaaaaaaaaaaaa1'))?.checked).toBe(true);
    expect(await db.t(C).get('aaaaaaaaaaaaaa2')).toBeUndefined();
    expect(await db.outbox.count()).toBe(2);

    s.state.online = true;
    eng.setOnline(true);
    await eng.flush();
    expect(s.state.calls).toEqual(['create list_items aaaaaaaaaaaaaa1', 'update list_items aaaaaaaaaaaaaa1']);
    expect(s.tbl(C).get('aaaaaaaaaaaaaa1')?.checked).toBe(true);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.t(C).get('aaaaaaaaaaaaaa1'))?._pending).toBeUndefined();
  });

  it('keeps pending local changes when pulling from the server', async () => {
    const s = fakeServer();
    s.tbl(C).set('srv000000000001', row('srv000000000001', 'From server'));
    const eng = new SyncEngine(s.api);
    s.state.online = false;
    eng.setOnline(false);
    await eng.create(C, row('loc000000000001', 'Local only') as never);
    s.state.online = true;
    // pull without flushing first: the local row must survive
    eng.status.online = true;
    await eng.pull(C);
    const names = (await db.t(C).toArray()).map((r) => r.name).sort();
    expect(names).toEqual(['From server', 'Local only']);
  });

  it('turns a duplicate create into an update, and drops refused changes', async () => {
    const s = fakeServer();
    s.tbl(C).set('dup000000000001', row('dup000000000001', 'Old'));
    s.state.reject.add('bad000000000001');
    const eng = new SyncEngine(s.api);
    await eng.create(C, row('dup000000000001', 'New') as never);
    await eng.create(C, row('bad000000000001', 'Nope') as never);
    await eng.flush();
    expect(s.tbl(C).get('dup000000000001')?.name).toBe('New');
    expect(await db.outbox.count()).toBe(0);
    expect(eng.status.error).toMatch(/refused/);
    expect(await db.t(C).get('bad000000000001')).toBeUndefined(); // re-pulled → local edit undone
  });

  it('ignores realtime echoes for records with queued changes', async () => {
    const s = fakeServer();
    const eng = new SyncEngine(s.api);
    s.state.online = false;
    eng.setOnline(false);
    await eng.create(C, row('rt0000000000001', 'Mine') as never);
    await eng.applyRemote(C, { action: 'update', record: { ...row('rt0000000000001', 'Theirs') } });
    expect((await db.t(C).get('rt0000000000001'))?.name).toBe('Mine');
    await eng.applyRemote(C, { action: 'create', record: { ...row('rt0000000000002', 'Other phone') } });
    expect((await db.t(C).get('rt0000000000002'))?.name).toBe('Other phone');
  });
});
