// CN-029 Phase 3 qa-gate I4 (PR 619; docs/RETAIL-ERP-MODEL.md §8) — the ERP account's hold shows on the dashboard: a
// store on contract v6 whose ERP put the account on hold has one "Needs you now" row (under "Urgent", since the hold
// stops new orders), from when the hold began, for those who may read the ERP account; gone once the ERP releases it,
// and never on a v5 store or another store. On a throwaway PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { noteHold, openErpLink } from '@extas/inventory';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { countQueues, QUEUES, visibleQueues, type QueueDeps } from './queues';
import type { ShellViewer } from './sections';

describe.skipIf(!HAS_TEST_DB)('I4 · the ERP hold in "Needs you now" (PostgreSQL)', () => {
  let t: TestDatabase;
  let deps: QueueDeps;
  const models = new Map<number, string>();
  let linkId = '';
  const heldAt = new Date('2026-10-30T04:00:00.000Z');
  let S = MOTHER_STORE_ID;
  let other = 0;
  const row = async (storeId = S) => (await countQueues(deps, storeId)).find((q) => q.id === 'erpHold');

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_hold');
    [S, other] = await seedSampleStores(t.prisma);
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    // the store's contract is a per-store setting; the test reads it from this map (everything else as shipped)
    deps = {
      db: t.prisma,
      settings: { value: (key: string, scope?: { storeId?: number | null }) => (key === 'erp.model' && scope?.storeId && models.has(scope.storeId) ? Promise.resolve(models.get(scope.storeId)) : resolver.value(key as never, scope as never)) },
      now: () => new Date('2026-10-30T07:00:00.000Z'),
    };
    const integration = await t.prisma.integration.create({ data: { storeId: S, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'MOCK', enabled: true, config: {}, secretNames: [] } });
    linkId = (await openErpLink(t.prisma, S, integration.id)).id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('is an urgent row that opens the books, for those who may read the ERP account', () => {
    expect(QUEUES.find((q) => q.id === 'erpHold')).toMatchObject({ perm: 'erp.account.read', href: '/admin/money/books', section: 'money', tone: 'bad', group: 'urgent' });
  });

  it('shows while the ERP holds a v6 store, from when the hold began; gone on release; never on v5', async () => {
    models.set(S, 'v6');
    expect((await row())?.n ?? 0).toBe(0);
    await noteHold(t.prisma, S, linkId, { onHold: true, reason: 'PAYMENT_OVERDUE' }, heldAt);
    expect(await row()).toEqual({ id: 'erpHold', n: 1, oldest: heldAt.toISOString() });
    const owner: ShellViewer = { owner: true, perms: new Set() };
    const reader: ShellViewer = { owner: false, perms: new Set(['erp.account.read']) };
    const packer: ShellViewer = { owner: false, perms: new Set(['orders.read']) };
    const counts = await countQueues(deps, S);
    expect(visibleQueues(counts, owner).map((r) => r.id)).toContain('erpHold');
    expect(visibleQueues(counts, reader).map((r) => r.id)).toContain('erpHold');
    expect(visibleQueues(counts, packer).map((r) => r.id)).not.toContain('erpHold');
    // another store has no hold
    models.set(other, 'v6');
    expect((await row(other))?.n ?? 0).toBe(0);
    // on contract v5 a hold never shows (it pauses nothing there)
    models.set(S, 'v5');
    expect((await row())?.n ?? 0).toBe(0);
    models.set(S, 'v6');
    await noteHold(t.prisma, S, linkId, { onHold: false }, new Date('2026-10-30T06:00:00.000Z'));
    expect((await row())?.n ?? 0).toBe(0);
  });
});
