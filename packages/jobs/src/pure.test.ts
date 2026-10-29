// PR 6 — the worker's pure parts: the retry wait, the timetable cut into slots (one run per job, store and slot), the
// job catalogue's payload checks and result summaries, and the leader lock against a stand-in Redis.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { retryDelayMs, retryPolicyOf } from './backoff';
import { compactStats, JOBS, jobDefinition, outcomeOf, QUEUES } from './catalogue';
import { courierPlanner, courierZonesPlanner, packingPhotosPlanner, ZONE_TURN_MINUTES } from './courier';
import { messagesPlanner } from './messages';
import { paymentsPlanner } from './payments';
import { searchPlanner, searchRunKey } from './search';
import { errorLine, MAX_ERROR } from './context';
import { LeaderLock, type LockStore } from './leader';
import { dueRuns, runKey, seriesKey, slotOf, type TimetableEntry } from './scheduler';

describe('PR 6 · retry wait', () => {
  const p = { maxAttempts: 5, baseMs: 30_000, maxMs: 1_800_000 };
  it('doubles from the base and never passes the cap', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => retryDelayMs(n, p))).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000]);
    expect(retryDelayMs(0, p)).toBe(30_000);
    expect(retryDelayMs(500, p)).toBe(1_800_000);
  });
  it('reads its numbers from the settings (defaults: 5 tries, 30 s, 30 min)', async () => {
    const settings = { value: async (k: keyof typeof registry) => registry[k].default } as never;
    expect(await retryPolicyOf(settings)).toEqual({ maxAttempts: 5, baseMs: 30_000, maxMs: 1_800_000 });
  });
});

describe('PR 6 · timetable slots', () => {
  const entries: TimetableEntry[] = [
    { everyMs: 60_000, jobs: [{ name: 'inventory.erp.pullStock', payload: { storeId: 1 } }, { name: 'inventory.erp.pullStock', payload: { storeId: 2 } }] },
    { everyMs: 30_000, jobs: [{ name: 'inventory.reservations.release', payload: {} }] },
    { everyMs: 30_000, jobs: [{ name: 'no.such.job', payload: {} }] },
  ];
  it('names a run by job, store and slot, with no colon (the queue refuses one)', () => {
    expect(seriesKey('inventory.erp.pullStock', { storeId: 3 })).toBe('inventory.erp.pullStock/3');
    expect(seriesKey('inventory.reservations.release', {})).toBe('inventory.reservations.release/-');
    expect(runKey('inventory.erp.pullStock', { storeId: 3 }, 42)).toBe('inventory.erp.pullStock/3/42');
    expect(runKey('a', {}, 1)).not.toContain(':');
    expect(slotOf(125_000, 60_000)).toBe(2);
  });
  it('plans each job once per slot, skips unknown jobs, and plans again in the next slot', () => {
    const planned = new Map<string, number>();
    const t = 1_000 * 60_000 + 5_000;
    const first = dueRuns(entries, t, planned);
    expect(first.map((j) => j.key)).toEqual(['inventory.erp.pullStock/1/1000', 'inventory.erp.pullStock/2/1000', 'inventory.reservations.release/-/2000']);
    expect(first[0]!.nextAt.getTime()).toBe(1_001 * 60_000);
    expect(first[0]!.queue).toBe(jobDefinition('inventory.erp.pullStock')!.queue);
    expect(dueRuns(entries, t + 10_000, planned)).toEqual([]);
    expect(dueRuns(entries, t + 30_000, planned).map((j) => j.key)).toEqual(['inventory.reservations.release/-/2001']);
    // A fresh leader (empty memory) plans the current slot with the same keys: the queue adds each id once.
    expect(dueRuns(entries, t, new Map()).map((j) => j.key)).toEqual(first.map((j) => j.key));
  });
});

describe('PR 6 · catalogue', () => {
  it('knows the inventory jobs and the ERP webhook job (PR 196) on one queue, and the search index (PR 72), the messages (PR 148) and the payments sweep (PR 170) on their own', () => {
    expect([...JOBS.keys()].sort()).toEqual(
      ['courier.track', 'courier.zones', 'erp.webhook.process', 'inventory.erp.pullStock', 'inventory.erp.pushDocuments', 'inventory.erp.reconcile', 'inventory.locations.ensureDefaults', 'inventory.lowStock.evaluate', 'inventory.reservations.release', 'messages.run', 'orders.pii.purge', 'packing.photos.expire', 'payments.pending.sweep', 'search.index'].sort(),
    );
    expect(jobDefinition('messages.run')!.queue).toBe('messages');
    expect(jobDefinition('payments.pending.sweep')!.queue).toBe('payments');
    expect(jobDefinition('search.index')!.queue).toBe('search');
    expect(QUEUES.length).toBeGreaterThanOrEqual(1);
    expect(jobDefinition('nope')).toBeNull();
  });
  it('checks payloads: a store-bound job needs a store; a store must be a positive whole number', () => {
    const pull = jobDefinition('inventory.erp.pullStock')!;
    expect(() => pull.parse({})).toThrow(/storeId is required/);
    expect(() => pull.parse({ storeId: 0 })).toThrow(/positive integer/);
    expect(() => pull.parse({ storeId: '1' })).toThrow(/positive integer/);
    const p = pull.parse({ storeId: 4 });
    expect(p).toEqual({ storeId: 4, name: 'inventory.erp.pullStock' });
    expect(pull.storeOf(p)).toBe(4);
    const sweep = jobDefinition('inventory.reservations.release')!;
    expect(sweep.storeOf(sweep.parse(null))).toBeNull();
  });
  it('PR 72: the search index job needs a store; its run key is the store and the catalogue version', async () => {
    const job = jobDefinition('search.index')!;
    expect(() => job.parse({})).toThrow(/positive integer/);
    expect(job.storeOf(job.parse({ storeId: 2, version: 'abc-1-2' }))).toBe(2);
    expect(searchRunKey(2, 'lq3x-1a:2b')).toBe('search.index/2/lq3x-1a2b');
    // without Meilisearch on the server nothing is planned (the shop searches PostgreSQL)
    expect(await searchPlanner({ search: { meili: null } } as never, new Date())).toEqual([]);
  });
  it('PR 148: the message run needs a store; one run per store and slot of `messages.engine.everySeconds`', async () => {
    const job = jobDefinition('messages.run')!;
    expect(() => job.parse({})).toThrow(/positive integer/);
    expect(job.storeOf(job.parse({ storeId: 3 }))).toBe(3);
    // without senders (no connection layer) nothing is planned and a run does nothing
    expect(await messagesPlanner({} as never, new Date())).toEqual([]);
    expect(await job.run({} as never, { storeId: 3 })).toEqual({ ok: true, stats: { skipped: 'no senders' } });
    const settings = { value: async (k: string) => (k === 'messages.engine' ? { everySeconds: 60, lookbackMinutes: 180, batchSize: 100 } : true) };
    const deps = { messages: { sender: async () => null }, settings, db: { store: { findMany: async () => [{ id: 1 }, { id: 2 }] } } } as never;
    const at = new Date(Date.UTC(2026, 9, 24, 6, 0, 30));
    const planned = await messagesPlanner(deps, at);
    expect(planned.map((p) => p.key)).toEqual([`messages.run/1/${slotOf(at.getTime(), 60_000)}`, `messages.run/2/${slotOf(at.getTime(), 60_000)}`]);
    expect(planned.every((p) => p.queue === 'messages')).toBe(true);
    expect(await searchPlanner({} as never, new Date())).toEqual([]);
  });
  it('PR 176: the courier tracking read needs a store; one run per store and slot of `delivery.courier.tracking.everyMinutes`, none when off', async () => {
    const job = jobDefinition('courier.track')!;
    expect(job.queue).toBe('courier');
    expect(() => job.parse({})).toThrow(/positive integer/);
    expect(job.storeOf(job.parse({ storeId: 5 }))).toBe(5);
    // without the courier connections nothing is planned and a run does nothing
    expect(await courierPlanner({} as never, new Date())).toEqual([]);
    expect(await job.run({} as never, { storeId: 5 })).toEqual({ ok: true, stats: { skipped: 'no couriers' } });
    const settings = { value: async (_k: string, o?: { storeId?: number }) => ({ enabled: o?.storeId !== 2, everyMinutes: 30, batch: 200 }) };
    const deps = { couriers: { connections: { use: async () => null } }, settings, db: { store: { findMany: async () => [{ id: 1 }, { id: 2 }] } } } as never;
    const at = new Date(Date.UTC(2026, 9, 24, 6, 0, 30));
    const planned = await courierPlanner(deps, at);
    expect(planned.map((p) => p.key)).toEqual([`courier.track/1/${slotOf(at.getTime(), 30 * 60_000)}`]);
    expect(planned[0]!.queue).toBe('courier');
  });

  it('PR 182: the packing photo sweep needs a store; one per day slot for a store with a photo past its day, no courier needed', async () => {
    const job = jobDefinition('packing.photos.expire')!;
    expect(job.queue).toBe('courier');
    expect(() => job.parse({})).toThrow(/positive integer/);
    // store 1 has two photos past their day; store 2 none
    const db = { store: { findMany: async () => [{ id: 1 }, { id: 2 }] }, packingPhoto: { count: async (q: { where: { storeId: number } }) => (q.where.storeId === 1 ? 2 : 0) } };
    const at = new Date(Date.UTC(2026, 9, 24, 6, 0, 30));
    const planned = await packingPhotosPlanner({ db } as never, at);
    expect(planned.map((p) => p.key)).toEqual([`packing.photos.expire/1/${slotOf(at.getTime(), 24 * 60 * 60_000)}`]);
    // later the same day: the same run
    expect((await packingPhotosPlanner({ db } as never, new Date(at.getTime() + 3_600_000))).map((p) => p.key)).toEqual(planned.map((p) => p.key));
  });

  it('PR 554: the zone sync turn needs a store; one per store and hour slot with the sync on or a run still going', async () => {
    const job = jobDefinition('courier.zones')!;
    expect(job.queue).toBe('courier');
    expect(() => job.parse({})).toThrow(/positive integer/);
    expect(await courierZonesPlanner({} as never, new Date())).toEqual([]);
    expect(await job.run({} as never, { storeId: 5 })).toEqual({ ok: true, stats: { skipped: 'no couriers' } });
    // store 1: on · store 2: off, nothing going · store 3: off, but a "Read the list now" still going
    const settings = { value: async (_k: string, o?: { storeId?: number }) => ({ enabled: o?.storeId === 1 }) };
    const db = { store: { findMany: async () => [{ id: 1 }, { id: 2 }, { id: 3 }] }, courierZoneSync: { count: async (q: { where: { storeId: number } }) => (q.where.storeId === 3 ? 1 : 0) } };
    const at = new Date(Date.UTC(2026, 9, 24, 6, 0, 30));
    const planned = await courierZonesPlanner({ couriers: { connections: { use: async () => null } }, settings, db } as never, at);
    expect(planned.map((p) => p.key)).toEqual([1, 3].map((s) => `courier.zones/${s}/${slotOf(at.getTime(), ZONE_TURN_MINUTES * 60_000)}`));
  });

  it('PR 170: the payments sweep needs a store; one run per store and slot of `payments.pending.everyMinutes`, none while both marks are off', async () => {
    const job = jobDefinition('payments.pending.sweep')!;
    expect(() => job.parse({})).toThrow(/positive integer/);
    expect(job.storeOf(job.parse({ storeId: 5 }))).toBe(5);
    // without gateways (no connection layer) nothing is planned and a run does nothing
    expect(await paymentsPlanner({} as never, new Date())).toEqual([]);
    expect(await job.run({} as never, { storeId: 5 })).toEqual({ ok: true, stats: { skipped: 'no gateways' } });
    const pending = new Map<number, unknown>([
      [1, registry['payments.pending'].default],
      [2, { ...registry['payments.pending'].default, recoverAfterMinutes: 0, abandonAfterMinutes: 0 }],
    ]);
    const settings = { value: async (_k: string, s: { storeId: number }) => pending.get(s.storeId) };
    const deps = { payments: { gateways: async () => null }, settings, db: { store: { findMany: async () => [{ id: 1 }, { id: 2 }] } } } as never;
    const at = new Date(Date.UTC(2026, 9, 24, 6, 7, 0));
    const every = registry['payments.pending'].default.everyMinutes * 60_000;
    const planned = await paymentsPlanner(deps, at);
    expect(planned.map((p) => p.key)).toEqual([`payments.pending.sweep/1/${slotOf(at.getTime(), every)}`]);
    expect(planned[0]!.queue).toBe('payments');
  });
  it('keeps a small summary and turns a reported failure into a retry', () => {
    const long = 'x'.repeat(300);
    expect(compactStats({ a: 1, b: 'ok', c: [1, 2, 3], d: { e: 2, f: [1], g: long }, h: null, i: true, j: undefined })).toEqual({ a: 1, b: 'ok', c: 3, d: { e: 2, g: 'x'.repeat(200) }, h: null, i: true });
    expect(compactStats(null)).toEqual({});
    expect(outcomeOf({ status: 'succeeded', updated: 3 })).toEqual({ ok: true, stats: { status: 'succeeded', updated: 3 } });
    expect(outcomeOf({ status: 'failed', error: { code: 'ERP_DOWN', text: 'the ERP did not answer' } })).toMatchObject({ ok: false, error: 'the ERP did not answer' });
    expect(outcomeOf({ status: 'failed', error: 'plain' })).toMatchObject({ ok: false, error: 'plain' });
    expect(outcomeOf({ status: 'failed' })).toMatchObject({ ok: false, error: 'the job reported a failure' });
  });
  it('writes a failure as one bounded line', () => {
    expect(errorLine(new Error('first\n  second\n'))).toBe('first · second');
    expect(errorLine('x'.repeat(MAX_ERROR + 50))).toHaveLength(MAX_ERROR);
    expect(errorLine({ code: 1 })).toBe('{"code":1}');
  });
});

/** A stand-in Redis for the lock: SET NX PX and the two compare scripts, with a clock. */
function fakeStore() {
  let now = 0;
  const data = new Map<string, { v: string; until: number }>();
  const live = (k: string) => {
    const e = data.get(k);
    if (e && e.until <= now) data.delete(k);
    return data.get(k);
  };
  const store: LockStore = {
    async set(key, value, _px, ms) {
      if (live(key)) return null;
      data.set(key, { v: value, until: now + ms });
      return 'OK';
    },
    async eval(script, _n, key, owner, ms) {
      const e = live(String(key));
      if (!e || e.v !== owner) return 0;
      if (script.includes('pexpire')) e.until = now + Number(ms);
      else data.delete(String(key));
      return 1;
    },
    async get(key) {
      return live(key)?.v ?? null;
    },
  };
  return { store, advance: (ms: number) => (now += ms) };
}

describe('PR 6 · one scheduler leader', () => {
  it('one worker takes the lock; the other waits; renewal keeps it; a dead leader is replaced after the lock runs out', async () => {
    const r = fakeStore();
    const a = new LeaderLock(r.store, 'worker-a', 30_000, 'k');
    const b = new LeaderLock(r.store, 'worker-b', 30_000, 'k');
    expect(await a.acquireOrRenew()).toBe(true);
    expect(await b.acquireOrRenew()).toBe(false);
    r.advance(20_000);
    expect(await a.acquireOrRenew()).toBe(true); // renewed for another 30 s
    r.advance(20_000);
    expect(await b.acquireOrRenew()).toBe(false);
    expect(await a.holder()).toBe('worker-a');
    // a stops beating (killed): after the lock runs out, b leads; a's late renewal fails and never steals it back.
    r.advance(31_000);
    expect(await b.acquireOrRenew()).toBe(true);
    expect(await a.acquireOrRenew()).toBe(false);
    expect(a.isLeader).toBe(false);
    // a's release cannot delete b's lock.
    await a.release();
    expect(await b.holder()).toBe('worker-b');
    // b stops cleanly: the lock is free at once.
    await b.release();
    expect(await a.acquireOrRenew()).toBe(true);
  });
  it('leads nobody when Redis is unreachable', async () => {
    const broken: LockStore = {
      set: async () => {
        throw new Error('down');
      },
      eval: async () => {
        throw new Error('down');
      },
      get: async () => null,
    };
    const l = new LeaderLock(broken, 'w', 1000);
    expect(await l.acquireOrRenew()).toBe(false);
    await l.release();
  });
  it('every jobs setting is an installation setting in the system group, never owner data', () => {
    const keys = Object.keys(registry).filter((k) => k.startsWith('jobs.'));
    expect(keys.length).toBe(14);
    for (const k of keys) {
      const s = registry[k as keyof typeof registry];
      expect([k, s.scope, s.group, s.isOwnerData]).toEqual([k, 'installation', 'system', false]);
    }
  });
});
