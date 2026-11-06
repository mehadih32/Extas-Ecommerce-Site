// Follow-up 539 (b, PR 610) — "Needs you now" names the documents the ERP keeps refusing for now: still HELD
// `erp.orders.heldAlertAfterHours` after they were queued, oldest first, this store only. Nothing while that setting is
// empty (as shipped). On a throwaway PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { countQueues, QUEUES, visibleQueues, type QueueDeps } from './queues';
import type { ShellViewer } from './sections';

describe.skipIf(!HAS_TEST_DB)('follow-up 539 · ERP documents refused too long in "Needs you now" (PostgreSQL)', () => {
  let t: TestDatabase;
  let S = 0;
  let other = 0;
  const now = new Date('2026-11-06T10:00:00.000Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const hours = new Map<number, number | null>();
  let deps: QueueDeps;
  let n = 0;
  const push = (storeId: number, status: 'HELD' | 'PENDING' | 'SENT', createdAt: Date) =>
    t.prisma.erpPush.create({ data: { storeId, documentType: 'order.create', referenceId: `q539-${++n}`, idempotencyKey: `q539-${n}`, status, heldReason: status === 'HELD' ? 'INSUFFICIENT_STOCK' : null, requestBody: {}, createdAt } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_q539');
    [S, other] = await seedSampleStores(t.prisma);
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = {
      db: t.prisma,
      settings: {
        value: (key: string, scope?: { storeId?: number | null }) =>
          key === 'erp.orders.heldAlertAfterHours' ? Promise.resolve(hours.get(scope?.storeId ?? 0) ?? null) : resolver.value(key as never, scope as never),
      },
      now: () => now,
    };
    await push(S, 'HELD', hoursAgo(30));
    await push(S, 'HELD', hoursAgo(7));
    await push(S, 'HELD', hoursAgo(1)); // refused only an hour ago
    await push(S, 'SENT', hoursAgo(50)); // the ERP took it
    await push(other, 'HELD', hoursAgo(40)); // another store
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('one row under Stock for those who read stock, pointing at the documents', () => {
    expect(QUEUES.find((q) => q.id === 'erpHeldLong')).toMatchObject({ perm: 'inventory.read', href: '/admin/stock#st-docs', section: 'products', tone: 'warn', badge: false, group: 'stock' });
  });

  it('counts nothing while the setting is empty; with hours set, this store`s documents HELD that long, oldest first', async () => {
    expect((await countQueues(deps, S)).find((c) => c.id === 'erpHeldLong')).toEqual({ id: 'erpHeldLong', n: 0, oldest: null });
    hours.set(S, 6);
    const counts = await countQueues(deps, S);
    expect(counts.find((c) => c.id === 'erpHeldLong')).toEqual({ id: 'erpHeldLong', n: 2, oldest: hoursAgo(30).toISOString() });
    const stock: ShellViewer = { owner: false, perms: new Set(['inventory.read']) };
    const agent: ShellViewer = { owner: false, perms: new Set(['support.read']) };
    expect(visibleQueues(counts, stock).map((r) => r.id)).toContain('erpHeldLong');
    expect(visibleQueues(counts, agent).map((r) => r.id)).not.toContain('erpHeldLong');
    expect((await countQueues(deps, other)).find((c) => c.id === 'erpHeldLong')?.n).toBe(0);
  });
});
