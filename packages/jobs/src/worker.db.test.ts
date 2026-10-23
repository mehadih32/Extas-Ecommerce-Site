// PR 6 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL)
// and, for the queue part, a real Redis (skipped without TEST_REDIS_URL; its own key prefix, removed afterwards):
// - one JobRun row per attempt: succeeded, failed with the next attempt time, dead-lettered on the last try;
// - the run-level idempotency: an attempt of a run that already succeeded is SKIPPED and never repeats the work;
//   two attempts never run at once; a worker that died mid-job is closed as WORKER_LOST and the job runs again;
// - a worker killed in the middle of a real ERP stock pull (practice ERP behind a LIVE connection): the retry on a
//   live worker adds no second stock movement;
// - the Server page's read model: ok / stale / stopped / never, the leader, the failed jobs (a job that succeeded on
//   a later try is not listed);
// - BullMQ: one leader among two workers, the scheduler's runs land once, a failing job is retried with the backoff
//   and dead-lettered, and a worker killed mid-job is taken over by the other with no duplicate side effect;
// - PR 196: a verified ERP webhook stored by the receiver is planned by the leader and applied once.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { allAdapters, createConnections, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, mockErp, signedErpWebhook } from '@extas/adapters';
import { SYSTEM, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createColour, createProduct, createSize, createVariant, type CatalogueDeps } from '@extas/catalogue';
import { createWarehouse, ERP_WEBHOOK_JOB, pullStock, receiveErpWebhook, type InventoryDeps, type SettingsReader } from '@extas/inventory';
import { registry, type Key, type Value } from '@extas/settings';
import { jobDefinition, type JobDefinition } from './catalogue';
import type { JobDeps } from './context';
import { beat, markStopped, newWorkerIdentity } from './heartbeat';
import { closeLostRuns, runAttempt, type AttemptInput } from './runs';
import { workerStatus } from './status';
import { webhookPlanner, webhookRunKey } from './webhooks';
import { startWorker, type RunningWorker } from './worker';

const T0 = new Date('2026-10-23T06:00:00Z');
const BASE = 'https://erp.example.test';
const REDIS_URL = process.env.TEST_REDIS_URL ?? '';

const until = async (what: string, fn: () => Promise<boolean>, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
};

describe.skipIf(!HAS_TEST_DB)('PR 6 on PostgreSQL: job runs, idempotency, heartbeat, Server page', () => {
  let t: TestDatabase;
  let storeId = 0;
  let clock = T0;
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const vaultValues = new Map<string, string>();
  let connections: ReturnType<typeof createConnections>;
  const world = mockErp();
  const realFetch = globalThis.fetch;
  let inventory: InventoryDeps;
  const deps = (): JobDeps => ({ db: t.prisma, settings, inventory, now: () => clock });
  const policy = { maxAttempts: 3, baseMs: 30_000, maxMs: 1_800_000 };
  const movements = () => t.prisma.stockMovement.count();

  /** A test job: counts its calls, and fails or succeeds as told. */
  let calls = 0;
  let failWith: string | null = null;
  const counter: JobDefinition<{ n: number }> = {
    key: 'test.counter',
    queue: 'test',
    parse: (p) => ({ n: Number((p as { n?: number } | null)?.n ?? 0) }),
    storeOf: () => null,
    run: async () => {
      calls++;
      return failWith ? { ok: false, error: failWith, stats: { calls } } : { ok: true, stats: { calls } };
    },
  };
  const attempt = (over: Partial<AttemptInput> = {}): AttemptInput => ({
    def: counter as JobDefinition<unknown>,
    payload: { n: 1 },
    idempotencyKey: 'test.counter/-/1',
    attempt: 1,
    maxAttempts: 3,
    policy,
    workerKey: 'w-a',
    queueJobId: 'q-1',
    staleSeconds: 60,
    ...over,
  });
  const liveWorker = async (key: string, at = clock) => {
    const id = { ...newWorkerIdentity({ queues: ['test'], now: at }), workerKey: key };
    await beat(t.prisma, id, { isLeader: false, activeJobs: 1 }, at);
    return id;
  };

  beforeAll(async () => {
    t = await createTestDatabase('jobs');
    [storeId] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string) => vaultValues.get(name) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    inventory = { db: t.prisma, settings, connections, now: () => clock, sleep: async () => {}, random: () => 0.5 };
    const cat = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
    const sys = { actor: SYSTEM, storeId };
    await createWarehouse(inventory, sys, { code: 'WH-A', name: 'Sample warehouse A', erpWarehouseId: 'SAMPLE-WH-1' });
    const navy = (await createColour(cat(), sys, { nameEn: 'Navy', hex: '1b2a4a' })).colour;
    const m = await createSize(cat(), sys, { label: 'M' });
    const tee = await createProduct(cat(), sys, { nameEn: 'Sample Tee', erpStyleCode: 'TEE' });
    await createVariant(cat(), sys, { sku: 'TEE-NAVY-M', productId: tee.id, colourId: navy.id, sizeId: m.id });
    world.reset();
    world.now = () => clock;
    const key = randomBytes(16).toString('hex');
    vaultValues.set('extasErp.apiKey', key);
    world.acceptKey(key, 'SAMPLE-CO-1');
    globalThis.fetch = world.fetch as typeof fetch;
    await t.prisma.integration.create({ data: { storeId: null, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } });
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 4 });
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await t?.drop();
  });

  it('the Server page says "never" before any worker started', async () => {
    expect(await workerStatus(deps())).toMatchObject({ state: 'never', workers: [], leader: null, failed: [], lastBeatAt: null });
  });

  it('a run that succeeded is never run again: the second delivery is SKIPPED (ALREADY_DONE)', async () => {
    await liveWorker('w-a');
    const first = await runAttempt(deps(), attempt());
    expect(first).toMatchObject({ kind: 'succeeded', stats: { calls: 1 } });
    const again = await runAttempt(deps(), attempt({ workerKey: 'w-b', queueJobId: 'q-1' }));
    expect(again).toMatchObject({ kind: 'skipped', reason: 'ALREADY_DONE' });
    expect(calls).toBe(1);
    const rows = await t.prisma.jobRun.findMany({ where: { idempotencyKey: 'test.counter/-/1' }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => [r.status, r.attempt, r.workerKey])).toEqual([
      ['SUCCEEDED', 1, 'w-a'],
      ['SKIPPED', 2, 'w-b'],
    ]);
    expect(rows[1]!.stats).toMatchObject({ reason: 'ALREADY_DONE', sameAs: rows[0]!.id });
    expect((await t.prisma.scheduledJob.findUniqueOrThrow({ where: { key: 'test.counter' } })).lastRunAt?.toISOString()).toBe(clock.toISOString());
  });

  it('a failing run: FAILED with the reason and the next attempt time, then DEAD_LETTERED on the last try', async () => {
    failWith = 'the ERP did not answer';
    const key = 'test.counter/-/2';
    const r1 = await runAttempt(deps(), attempt({ idempotencyKey: key, queueJobId: 'q-2' }));
    expect(r1).toMatchObject({ kind: 'failed', final: false, error: 'the ERP did not answer' });
    expect(r1.kind === 'failed' && r1.nextAttemptAt?.getTime()).toBe(clock.getTime() + 30_000);
    advance(30_000);
    const r2 = await runAttempt(deps(), attempt({ idempotencyKey: key, queueJobId: 'q-2', attempt: 2 }));
    expect(r2.kind === 'failed' && r2.nextAttemptAt?.getTime()).toBe(clock.getTime() + 60_000);
    advance(60_000);
    const r3 = await runAttempt(deps(), attempt({ idempotencyKey: key, queueJobId: 'q-2', attempt: 3 }));
    expect(r3).toMatchObject({ kind: 'failed', final: true, nextAttemptAt: null });
    const rows = await t.prisma.jobRun.findMany({ where: { idempotencyKey: key }, orderBy: { attempt: 'asc' } });
    expect(rows.map((r) => [r.status, r.attempt, r.maxAttempts, r.error])).toEqual([
      ['FAILED', 1, 3, 'the ERP did not answer'],
      ['FAILED', 2, 3, 'the ERP did not answer'],
      ['DEAD_LETTERED', 3, 3, 'the ERP did not answer'],
    ]);
    failWith = null;
  });

  it('two attempts never run at once; a dead worker\'s attempt is closed as WORKER_LOST and the job runs again', async () => {
    const key = 'test.counter/-/3';
    // A RUNNING attempt of another queue job of this run on a live worker: the new one is SKIPPED.
    await liveWorker('w-busy');
    const busy = await t.prisma.jobRun.create({ data: { jobKey: 'test.counter', queue: 'test', status: 'RUNNING', idempotencyKey: key, queueJobId: 'q-3a', workerKey: 'w-busy', startedAt: clock } });
    expect(await runAttempt(deps(), attempt({ idempotencyKey: key, queueJobId: 'q-3b', workerKey: 'w-a' }))).toMatchObject({ kind: 'skipped', reason: 'RUNNING_ELSEWHERE' });
    const before = calls;
    // The busy worker stops beating: after `jobs.heartbeat.staleSeconds` its attempt is lost and the job runs.
    advance(61_000);
    await liveWorker('w-a');
    expect(await runAttempt(deps(), attempt({ idempotencyKey: key, queueJobId: 'q-3b', workerKey: 'w-a' }))).toMatchObject({ kind: 'succeeded' });
    expect(calls).toBe(before + 1);
    expect(await t.prisma.jobRun.findUniqueOrThrow({ where: { id: busy.id } })).toMatchObject({ status: 'FAILED', error: expect.stringMatching(/^WORKER_LOST/) });
    // The same queue job delivered again (the queue took it from a worker that lost it) is lost even when that
    // worker's heartbeat still looks fresh.
    const key2 = 'test.counter/-/4';
    await liveWorker('w-killed');
    const killed = await t.prisma.jobRun.create({ data: { jobKey: 'test.counter', queue: 'test', status: 'RUNNING', idempotencyKey: key2, queueJobId: 'q-4', workerKey: 'w-killed', startedAt: clock } });
    expect(await runAttempt(deps(), attempt({ idempotencyKey: key2, queueJobId: 'q-4', workerKey: 'w-a', attempt: 1 }))).toMatchObject({ kind: 'succeeded' });
    expect((await t.prisma.jobRun.findUniqueOrThrow({ where: { id: killed.id } })).status).toBe('FAILED');
    // The attempt number goes on from the tries already made.
    expect((await t.prisma.jobRun.findFirstOrThrow({ where: { idempotencyKey: key2, status: 'SUCCEEDED' } })).attempt).toBe(2);
  });

  it('closeLostRuns closes only the RUNNING rows of workers that stopped beating or stopped', async () => {
    await liveWorker('w-alive');
    await liveWorker('w-gone', new Date(clock.getTime() - 120_000));
    await liveWorker('w-stopped');
    await markStopped(t.prisma, 'w-stopped', clock);
    const mk = (w: string, i: number) => t.prisma.jobRun.create({ data: { jobKey: 'test.counter', queue: 'test', status: 'RUNNING', idempotencyKey: `test.counter/-/lost-${i}`, workerKey: w, startedAt: clock } });
    const [alive, gone, stopped] = await Promise.all([mk('w-alive', 1), mk('w-gone', 2), mk('w-stopped', 3)]);
    expect(await closeLostRuns(deps(), 60)).toBe(2);
    const st = async (id: string) => (await t.prisma.jobRun.findUniqueOrThrow({ where: { id } })).status;
    expect([await st(alive.id), await st(gone.id), await st(stopped.id)]).toEqual(['RUNNING', 'FAILED', 'FAILED']);
    await t.prisma.jobRun.updateMany({ where: { id: alive.id }, data: { status: 'CANCELLED', finishedAt: clock } });
  });

  it('a worker killed in the middle of a real ERP stock pull: the retry adds no second stock movement', async () => {
    let hang = true;
    let release!: () => void;
    const hung = new Promise<void>((r) => (release = r));
    let pulled!: () => void;
    const firstPullDone = new Promise<void>((r) => (pulled = r));
    // The real stock pull, then (first time only) the process "dies" before the attempt is closed.
    const pull: JobDefinition<{ storeId: number }> = {
      key: 'test.pullThenDie',
      queue: 'test',
      parse: (p) => p as { storeId: number },
      storeOf: (p) => p.storeId,
      run: async (d, p) => {
        const r = await pullStock(d.inventory, { storeId: p.storeId });
        if (hang) {
          hang = false;
          pulled();
          await hung;
        }
        return { ok: r.status === 'succeeded', error: 'pull failed', stats: { status: r.status } };
      },
    };
    const before = await movements();
    await liveWorker('w-dies');
    const input = attempt({ def: pull as JobDefinition<unknown>, payload: { storeId }, idempotencyKey: `test.pullThenDie/${storeId}/1`, queueJobId: 'q-pull', workerKey: 'w-dies' });
    const dying = runAttempt(deps(), input);
    await firstPullDone;
    const afterFirst = await movements();
    expect(afterFirst).toBe(before + 1);
    // The queue gives the job to a live worker (same queue job id): the dead attempt is closed, the pull runs again.
    await liveWorker('w-live');
    expect(await runAttempt(deps(), { ...input, workerKey: 'w-live', attempt: 2 })).toMatchObject({ kind: 'succeeded' });
    expect(await movements()).toBe(afterFirst);
    // The killed attempt finishing late never rewrites its row.
    release();
    await dying;
    const rows = await t.prisma.jobRun.findMany({ where: { idempotencyKey: input.idempotencyKey }, orderBy: { attempt: 'asc' } });
    expect(rows.map((r) => [r.status, r.workerKey])).toEqual([
      ['FAILED', 'w-dies'],
      ['SUCCEEDED', 'w-live'],
    ]);
    expect(rows[0]!.error).toMatch(/^WORKER_LOST/);
    expect(rows[1]!.storeId).toBe(storeId);
  });

  it('the Server page: ok with the leader, failed jobs (newest try failed only), then stale, then stopped', async () => {
    const leader = { ...newWorkerIdentity({ queues: ['test'], version: 'abc123', color: 'blue', now: clock }), workerKey: 'w-leader' };
    await beat(t.prisma, leader, { isLeader: true, activeJobs: 2 }, clock);
    const s = await workerStatus(deps());
    expect(s).toMatchObject({ state: 'ok', staleAfterSeconds: 60, leader: { workerKey: 'w-leader', version: 'abc123', color: 'blue', activeJobs: 2 } });
    // Run 2 was dead-lettered (listed); runs 3 and 4 failed once then succeeded (not listed); the two runs closed as
    // WORKER_LOST above wait for their next try (listed, with the reason).
    expect(s.failed.map((f) => [f.status, f.attempt, f.error?.slice(0, 11) ?? null]).sort()).toEqual([
      ['DEAD_LETTERED', 3, 'the ERP did'],
      ['FAILED', 1, 'WORKER_LOST'],
      ['FAILED', 1, 'WORKER_LOST'],
    ]);
    expect(s.failed.find((f) => f.status === 'DEAD_LETTERED')?.nextAttemptAt).toBeNull();
    expect(s.failedCounts).toEqual({ retrying: 2, dead: 1 });
    // A run still being retried shows when it is tried next.
    failWith = 'courier down';
    await runAttempt(deps(), attempt({ idempotencyKey: 'test.counter/-/9', queueJobId: 'q-9', workerKey: 'w-leader' }));
    failWith = null;
    const s2 = await workerStatus(deps());
    expect(s2.failed[0]).toMatchObject({ status: 'FAILED', error: 'courier down', nextAttemptAt: new Date(clock.getTime() + 30_000).toISOString() });
    expect(s2.failedCounts).toEqual({ retrying: 3, dead: 1 });
    overrides.set('jobs.serverPage.failedLimit', 1);
    expect((await workerStatus(deps())).failed).toHaveLength(1);
    overrides.delete('jobs.serverPage.failedLimit');
    // No beat for longer than the stale limit: "stale", and nobody leads.
    advance(61_000);
    expect(await workerStatus(deps())).toMatchObject({ state: 'stale', leader: null });
    // Every worker stopped cleanly: "stopped".
    for (const w of await t.prisma.workerHeartbeat.findMany()) await markStopped(t.prisma, w.workerKey, clock);
    expect((await workerStatus(deps())).state).toBe('stopped');
    // Nothing is deleted: every attempt and heartbeat is still there.
    expect(await t.prisma.workerHeartbeat.count()).toBeGreaterThanOrEqual(6);
  });

  describe.skipIf(!REDIS_URL)('BullMQ on Redis', () => {
    const prefix = `extas-test-${randomBytes(4).toString('hex')}`;
    const workers: RunningWorker[] = [];
    // Real time here (the queue's locks and backoff run on the wall clock).
    const live = (): JobDeps => ({ db: t.prisma, settings, inventory: { ...inventory, now: () => new Date() } });
    const quiet = () => {};

    beforeAll(() => {
      overrides.set('jobs.lockSeconds', 1);
      overrides.set('jobs.retry.maxAttempts', 3);
      overrides.set('jobs.retry.backoffBaseSeconds', 0.1);
      overrides.set('jobs.retry.backoffMaxSeconds', 0.2);
      overrides.set('jobs.heartbeat.everySeconds', 1);
      overrides.set('jobs.scheduler.tickSeconds', 300);
    });
    afterAll(async () => {
      for (const w of workers) await w.stop().catch(() => {});
      const r = new Redis(REDIS_URL);
      const keys = await r.keys(`${prefix}:*`);
      if (keys.length) await r.del(...keys);
      await r.quit();
      for (const k of ['jobs.lockSeconds', 'jobs.retry.maxAttempts', 'jobs.retry.backoffBaseSeconds', 'jobs.retry.backoffMaxSeconds', 'jobs.heartbeat.everySeconds', 'jobs.scheduler.tickSeconds']) overrides.delete(k);
    });

    it('one leader among two workers; a failing job is retried with the backoff and then dead-lettered', async () => {
      let n = 0;
      const flaky: JobDefinition<object> = { key: 'test.flaky', queue: 'test-q', parse: () => ({}), storeOf: () => null, run: async () => ((n += 1), { ok: false, error: `try ${n} failed`, stats: {} }) };
      const jobs = new Map([[flaky.key, flaky as JobDefinition<unknown>]]);
      const a = await startWorker({ deps: live(), redisUrl: REDIS_URL, prefix, jobs, log: quiet });
      const b = await startWorker({ deps: live(), redisUrl: REDIS_URL, prefix, jobs, log: quiet });
      workers.push(a, b);
      await a.tick();
      await b.tick();
      expect([a.isLeader(), b.isLeader()]).toEqual([true, false]);
      await a.enqueue({ queue: 'test-q', name: 'test.flaky', payload: {}, key: 'test.flaky/-/1' });
      await a.enqueue({ queue: 'test-q', name: 'test.flaky', payload: {}, key: 'test.flaky/-/1' }); // same id: added once
      await until('the dead letter', async () => (await t.prisma.jobRun.count({ where: { idempotencyKey: 'test.flaky/-/1', status: 'DEAD_LETTERED' } })) === 1);
      const rows = await t.prisma.jobRun.findMany({ where: { idempotencyKey: 'test.flaky/-/1' }, orderBy: { attempt: 'asc' } });
      expect(rows.map((r) => [r.status, r.attempt, r.error])).toEqual([
        ['FAILED', 1, 'try 1 failed'],
        ['FAILED', 2, 'try 2 failed'],
        ['DEAD_LETTERED', 3, 'try 3 failed'],
      ]);
      expect(n).toBe(3);
      // The leader stops cleanly: the other takes the lead at its next tick; the stopped worker's row says so.
      await a.stop();
      expect(await b.tick()).toBe(0);
      expect(b.isLeader()).toBe(true);
      expect((await t.prisma.workerHeartbeat.findUniqueOrThrow({ where: { workerKey: a.identity.workerKey } })).stoppedAt).not.toBeNull();
      await b.stop();
    });

    it('the leader plans the scheduled jobs once per slot', async () => {
      const seen: string[] = [];
      const sweep: JobDefinition<object> = { key: 'inventory.reservations.release', queue: 'test-s', parse: () => ({}), storeOf: () => null, run: async () => (seen.push('sweep'), { ok: true, stats: {} }) };
      const w = await startWorker({ deps: live(), redisUrl: REDIS_URL, prefix, jobs: new Map([[sweep.key, sweep as JobDefinition<unknown>]]), log: quiet });
      workers.push(w);
      const n1 = await w.tick();
      const n2 = await w.tick();
      expect(n1).toBeGreaterThanOrEqual(1);
      expect(n2).toBe(0);
      await until('the sweep to run', async () => seen.length === 1);
      expect(await t.prisma.jobRun.count({ where: { jobKey: 'inventory.reservations.release', status: 'SUCCEEDED' } })).toBe(1);
      expect((await t.prisma.scheduledJob.findUniqueOrThrow({ where: { key: 'inventory.reservations.release' } })).nextRunAt).not.toBeNull();
      await w.stop();
    });

    it('a worker killed mid-job: the other takes the job over after its lock runs out, with no second stock movement', async () => {
      let first = true;
      let started!: () => void;
      const inJob = new Promise<void>((r) => (started = r));
      const pull: JobDefinition<{ storeId: number }> = {
        key: 'test.queuePull',
        queue: 'test-k',
        parse: (p) => p as { storeId: number },
        storeOf: (p) => p.storeId,
        run: async (d, p) => {
          const r = await pullStock(d.inventory, { storeId: p.storeId });
          if (first) {
            first = false;
            started();
            await new Promise(() => {}); // the process dies here: never returns
          }
          return { ok: r.status === 'succeeded', error: 'pull failed', stats: { status: r.status } };
        },
      };
      world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 7, updatedAt: new Date(Math.max(Date.now(), clock.getTime()) + 3_600_000) });
      const before = await movements();
      const jobs = new Map([[pull.key, pull as JobDefinition<unknown>]]);
      const a = await startWorker({ deps: live(), redisUrl: REDIS_URL, prefix, jobs, log: quiet });
      await a.enqueue({ queue: 'test-k', name: 'test.queuePull', payload: { storeId }, key: `test.queuePull/${storeId}/1` });
      await inJob;
      expect(await movements()).toBe(before + 1);
      await a.kill();
      const b = await startWorker({ deps: live(), redisUrl: REDIS_URL, prefix, jobs, log: quiet });
      workers.push(b);
      await until('the takeover', async () => (await t.prisma.jobRun.count({ where: { jobKey: 'test.queuePull', status: 'SUCCEEDED' } })) === 1);
      expect(await movements()).toBe(before + 1);
      const rows = await t.prisma.jobRun.findMany({ where: { jobKey: 'test.queuePull' }, orderBy: { startedAt: 'asc' } });
      expect(rows.map((r) => [r.status, r.workerKey])).toEqual([
        ['FAILED', a.identity.workerKey],
        ['SUCCEEDED', b.identity.workerKey],
      ]);
      expect(rows[0]!.error).toMatch(/^WORKER_LOST/);
      await b.stop();
    });

    it('PR 196: a stored ERP webhook is planned by the leader, applied once by the worker, and planned no more', async () => {
      const secret = randomBytes(24).toString('hex');
      vaultValues.set('extasErp.webhookSecret', secret);
      const at = new Date(Math.max(Date.now(), clock.getTime()) + 2 * 3_600_000);
      const data = { sku: 'TEE-NAVY-M', warehouseId: 'SAMPLE-WH-1', onHand: 11, reserved: 0, available: 11, updatedAt: at.toISOString() };
      const signed = signedErpWebhook(secret, { id: `evt_${randomBytes(6).toString('hex')}`, type: 'stock.changed', data }, new Date());
      const got = await receiveErpWebhook(
        { ...inventory, connections, now: () => new Date() },
        { rawBody: signed.body, signature: signed.headers[ERP_SIGNATURE_HEADER] ?? null, timestamp: signed.headers[ERP_TIMESTAMP_HEADER] ?? null, idempotencyKey: null },
      );
      expect(got).toMatchObject({ status: 202, code: 'ACCEPTED' });
      const before = await movements();
      const def = jobDefinition(ERP_WEBHOOK_JOB)!;
      const w = await startWorker({ deps: live(), redisUrl: REDIS_URL, prefix, jobs: new Map([[def.key, def]]), planners: [webhookPlanner], log: quiet });
      workers.push(w);
      expect(await w.tick()).toBe(1);
      await until('the webhook to be applied', async () => (await t.prisma.webhookEvent.findUniqueOrThrow({ where: { id: got.eventId! } })).status === 'PROCESSED');
      expect(await movements()).toBe(before + 1);
      expect(await t.prisma.jobRun.findMany({ where: { idempotencyKey: webhookRunKey(got.eventId!) }, select: { status: true } })).toEqual([{ status: 'SUCCEEDED' }]);
      // Handled: the next tick plans nothing for it.
      expect(await w.tick()).toBe(0);
      await w.stop();
      vaultValues.delete('extasErp.webhookSecret');
    });
  });
});
