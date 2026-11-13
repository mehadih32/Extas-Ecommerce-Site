// S28 · PR 706 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the server's purge of Start fresh. It removes the
// orders, customers (with wallets and their append-only entries), order history, chats, coupon uses and analytics of a run's
// store, up to the moment the run began, and nothing else: products, customer problems, the other store and a customer
// with a newer order stay. It refuses a run that is not waiting for it, runs once, and the app role still cannot delete
// from an append-only table afterwards. Every value is made up.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import type { InventoryDeps, SettingsReader } from '@extas/inventory';
import { jobDefinition } from './catalogue';
import type { JobDeps } from './context';
import { runStartFreshPurge, START_FRESH_PURGE_JOB, startFreshPlanner } from './start-fresh-purge';

describe.skipIf(!HAS_TEST_DB)('PR 706 · Start fresh purge on PostgreSQL', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let n = 0;
  const deps = (): JobDeps => ({ db: t.prisma, settings: {} as SettingsReader, inventory: {} as InventoryDeps, now: () => new Date() });
  const order = (storeId: number, customerId?: string, at?: Date) =>
    t.prisma.order.create({ data: { storeId, number: `SF-${++n}`, source: 'WEBSITE', currency: 'BDT', subtotalMinor: 1000, totalMinor: 1000, idempotencyKey: randomUUID(), customerId, ...(at ? { createdAt: at } : {}) }, select: { id: true } });

  beforeAll(async () => {
    t = await createTestDatabase('jobs_fresh');
    [A, B] = await seedSampleStores(t.prisma);
  }, 120_000);
  afterAll(async () => {
    await t?.drop();
  });

  it('removes the test entries with their append-only history, keeps the rest, and runs once', async () => {
    const c = await t.prisma.customer.create({ data: { storeId: A }, select: { id: true } });
    const w = await t.prisma.walletAccount.create({ data: { storeId: A, customerId: c.id, status: 'ACTIVE', balanceMinor: 500 }, select: { id: true } });
    await t.prisma.walletEntry.create({ data: { storeId: A, walletId: w.id, direction: 'CREDIT', amountMinor: 500, balanceAfterMinor: 500, reason: 'TEST', idempotencyKey: randomUUID() } });
    const o = await order(A, c.id);
    await t.prisma.orderEvent.create({ data: { storeId: A, orderId: o.id, type: 'order.placed', actorType: 'SYSTEM', source: 'test' } });
    await t.prisma.customer.create({ data: { storeId: A } });
    // the other store and a customer problem are not roots; they stay
    const otherCustomer = await t.prisma.customer.create({ data: { storeId: B }, select: { id: true } });
    await order(B, otherCustomer.id);
    await t.prisma.customerProblem.create({ data: { storeId: A, fingerprint: 'f-1', kind: 'script_error', step: 'other', path: '/', detail: 'x', firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const product = await t.prisma.product.count({ where: { storeId: A } });

    const run = await t.prisma.startFreshRun.create({ data: { storeId: A, status: 'PARTIAL', requestedById: null, createdAt: new Date(Date.now() + 1000) } });
    // a customer who orders after the run began is left (its order is newer than the run)
    const late = await t.prisma.customer.create({ data: { storeId: A }, select: { id: true } });
    await order(A, late.id, new Date(Date.now() + 60_000));

    expect(await startFreshPlanner(deps(), new Date())).toEqual([expect.objectContaining({ name: START_FRESH_PURGE_JOB, payload: { storeId: A } })]);
    const r = await jobDefinition(START_FRESH_PURGE_JOB)!.run(deps(), { storeId: A });
    expect(r.ok).toBe(true);

    expect(await t.prisma.order.count({ where: { storeId: A } })).toBe(1); // only the newer one
    expect(await t.prisma.orderEvent.count({ where: { storeId: A } })).toBe(0);
    expect(await t.prisma.walletEntry.count({ where: { storeId: A } })).toBe(0);
    expect(await t.prisma.walletAccount.count({ where: { storeId: A } })).toBe(0);
    expect(await t.prisma.customer.count({ where: { storeId: A } })).toBe(1); // the late customer
    expect(await t.prisma.customer.count({ where: { storeId: B } })).toBe(1);
    expect(await t.prisma.order.count({ where: { storeId: B } })).toBe(1);
    expect(await t.prisma.customerProblem.count({ where: { storeId: A } })).toBe(1);
    expect(await t.prisma.product.count({ where: { storeId: A } })).toBe(product);
    const done = await t.prisma.startFreshRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(done.status).toBe('DONE');
    expect(done.purgedAt).not.toBeNull();
    expect((done.purgeResult as Record<string, number>).Order).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'startFresh.purge', entityId: run.id } })).toBe(1);

    // once: nothing is waiting any more, and the function refuses a run that is DONE
    expect(await runStartFreshPurge(t.prisma, A)).toEqual({ status: 'nothing-waiting' });
    await expect(t.prisma.$queryRaw`SELECT extas_start_fresh_purge(${run.id}::uuid)`).rejects.toThrow(/not waiting for its purge/);
    expect(await startFreshPlanner(deps(), new Date())).toEqual([]);
  });

  it('the append-only triggers are back on afterwards, and a run that is not PARTIAL is refused', async () => {
    const o = await order(A);
    await t.prisma.orderEvent.create({ data: { storeId: A, orderId: o.id, type: 'order.placed', actorType: 'SYSTEM', source: 'test' } });
    await expect(t.prisma.$executeRaw`DELETE FROM "OrderEvent" WHERE "orderId" = ${o.id}::uuid`).rejects.toThrow(/append-only/);
    const running = await t.prisma.startFreshRun.create({ data: { storeId: B, status: 'FAILED' } });
    await expect(t.prisma.$queryRaw`SELECT extas_start_fresh_purge(${running.id}::uuid)`).rejects.toThrow(/not waiting for its purge/);
    expect(await t.prisma.order.count({ where: { storeId: B } })).toBe(1);
  });
});
