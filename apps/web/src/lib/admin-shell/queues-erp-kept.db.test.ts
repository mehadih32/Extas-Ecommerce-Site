// Follow-up 578 (PR 619, 530) — "Needs you now" names the v5 orders kept at the switch (`erp.switchOver.queuedV5Orders`
// = hold) still waiting for a person more than a day after they were kept, oldest first, this store only; one sent
// again since (a newer order row) no longer counts. On a throwaway PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { countQueues, QUEUES, visibleQueues, type QueueDeps } from './queues';
import type { ShellViewer } from './sections';

describe.skipIf(!HAS_TEST_DB)('follow-up 578 · v5 orders kept at the switch longer than a day in "Needs you now" (PostgreSQL)', () => {
  let t: TestDatabase;
  let S = 0;
  let other = 0;
  const now = new Date('2026-11-06T10:00:00.000Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  let deps: QueueDeps;
  let n = 0;
  const kept = (storeId: number, referenceId: string, updatedAt: Date) =>
    t.prisma.erpPush.create({ data: { storeId, documentType: 'order.create', referenceId, idempotencyKey: `q578-${++n}`, status: 'FAILED', lastError: 'SWITCH_V5_ORDER', requestBody: { body: { externalOrderId: referenceId } }, createdAt: updatedAt, updatedAt } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_q578');
    [S, other] = await seedSampleStores(t.prisma);
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, settings: { value: (key: string, scope?: { storeId?: number | null }) => resolver.value(key as never, scope as never) }, now: () => now };
    await kept(S, 'old-1', hoursAgo(50));
    await kept(S, 'old-2', hoursAgo(26));
    await kept(S, 'new-1', hoursAgo(3)); // kept only this morning
    await kept(S, 'resent-1', hoursAgo(60));
    await t.prisma.erpPush.create({ data: { storeId: S, documentType: 'order.create', referenceId: 'resent-1', idempotencyKey: `q578-${++n}`, status: 'SENT', requestBody: {} } }); // sent again as v6
    await kept(other, 'b-1', hoursAgo(70)); // another store
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('one row for those who see the ERP link page, pointing at it', () => {
    expect(QUEUES.find((q) => q.id === 'erpKeptAtSwitch')).toMatchObject({ perm: 'vault.read', href: '/admin/settings/erp-link', section: 'settings', tone: 'warn', badge: false, group: 'stock' });
  });

  it('counts this store`s kept orders older than a day, oldest first; not one sent again, not another store`s', async () => {
    const counts = await countQueues(deps, S);
    expect(counts.find((c) => c.id === 'erpKeptAtSwitch')).toEqual({ id: 'erpKeptAtSwitch', n: 2, oldest: hoursAgo(50).toISOString() });
    const keys: ShellViewer = { owner: false, perms: new Set(['vault.read']) };
    const stock: ShellViewer = { owner: false, perms: new Set(['inventory.read']) };
    expect(visibleQueues(counts, keys).map((r) => r.id)).toContain('erpKeptAtSwitch');
    expect(visibleQueues(counts, stock).map((r) => r.id)).not.toContain('erpKeptAtSwitch');
    expect((await countQueues(deps, other)).find((c) => c.id === 'erpKeptAtSwitch')).toMatchObject({ n: 1 });
  });
});
