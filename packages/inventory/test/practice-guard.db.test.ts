// S28 · PR 706 (CN-049) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a practice order's documents never
// go to the ERP. Queued: the row is kept but marked skipped with the reason PRACTICE_RECORD. Already waiting (queued
// before): the relay marks it skipped before it looks at the ERP. A real order's document is untouched by the guard.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allAdapters, createConnections } from '@extas/adapters';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { enqueueErpDocument, relayErpPushes, type InventoryDeps, type SettingsReader } from '../src';

describe.skipIf(!HAS_TEST_DB)('practice orders never reach the ERP (PR 706)', () => {
  let t: TestDatabase;
  let S = 0;
  let practiceId = '';
  let realId = '';
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): InventoryDeps => ({
    db: t.prisma,
    settings,
    connections: createConnections({
      db: t.prisma,
      vault: { get: async () => null },
      adapters: allAdapters,
      secretCacheMs: 0,
      testTimeoutMs: 5_000,
    }),
    now: () => new Date('2026-11-13T08:00:00Z'),
    sleep: async () => {},
    random: () => 0.5,
  });
  const order = (number: string, isPractice: boolean) =>
    t.prisma.order.create({
      data: {
        storeId: S,
        number,
        status: 'CONFIRMED',
        source: 'WEBSITE',
        currency: 'BDT',
        subtotalMinor: 1000,
        totalMinor: 1000,
        idempotencyKey: `k-${number}`,
        isPractice,
      },
    });
  const doc = (id: string) => ({
    type: 'order.status' as const,
    externalOrderId: `X-${id.slice(0, 6)}`,
    body: { status: 'confirmed' },
  });

  beforeAll(async () => {
    t = await createTestDatabase('practiceguard');
    [S] = await seedSampleStores(t.prisma);
    practiceId = (await order('P-1', true)).id;
    realId = (await order('EX-1', false)).id;
  }, 180_000);
  afterAll(async () => t?.drop());

  it("queueing a practice order's document keeps a skipped row (reason PRACTICE_RECORD), never a waiting one", async () => {
    const r = await enqueueErpDocument(deps(), S, practiceId, `order.status:${practiceId}`, doc(practiceId));
    expect(r.status).toBe('SKIPPED_NO_ERP');
    const row = await t.prisma.erpPush.findFirstOrThrow({
      where: { referenceId: practiceId },
    });
    expect(row).toMatchObject({
      status: 'SKIPPED_NO_ERP',
      lastError: 'PRACTICE_RECORD',
    });
  });

  it("a real order's document is not touched by the guard (it waits or skips for the ordinary reason)", async () => {
    await enqueueErpDocument(deps(), S, realId, `order.status:${realId}`, doc(realId));
    const row = await t.prisma.erpPush.findFirstOrThrow({
      where: { referenceId: realId },
    });
    expect(row.lastError).not.toBe('PRACTICE_RECORD');
  });

  it('the relay marks a practice document that was already waiting as skipped and never sends it', async () => {
    const waiting = await t.prisma.erpPush.create({
      data: {
        storeId: S,
        documentType: 'order.status',
        referenceId: practiceId,
        idempotencyKey: `late:${randomUUID()}`,
        status: 'PENDING',
        requestBody: { ...doc(practiceId), hash: 'x' },
      },
    });
    await relayErpPushes(deps(), { storeId: S });
    const after = await t.prisma.erpPush.findUniqueOrThrow({
      where: { id: waiting.id },
    });
    expect(after).toMatchObject({
      status: 'SKIPPED_NO_ERP',
      lastError: 'PRACTICE_RECORD',
      attempts: 0,
      sentAt: null,
    });
  });
});
