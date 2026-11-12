// S15 · PR 339 — the saved funnel's own CRUD, on a real throwaway PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createFunnel, getFunnel, isFunnelError, listFunnels, setFunnelArchived, updateFunnel, type FunnelListDeps, type Who } from './funnel-list';

const OWNER = SYSTEM;
const twoSteps = [
  { key: 'view', label: 'Viewed the product', eventName: 'product_view' as const },
  { key: 'bag', label: 'Added to bag', eventName: 'add_to_bag' as const },
];

describe.skipIf(!HAS_TEST_DB)('the saved funnel list (PR 339)', () => {
  let t: TestDatabase;
  let d: FunnelListDeps;
  let who: Who;
  let A = 0;
  let B = 0;

  beforeAll(async () => {
    t = await createTestDatabase('web_funnel_339');
    [A, B] = await seedSampleStores(t.prisma);
    d = { db: t.prisma };
    who = { actor: OWNER, ctx: { ip: '127.0.0.1', userAgent: 'test' } };
  });
  afterAll(async () => t?.drop());

  it('refuses a funnel with only one step — not a funnel', async () => {
    await expect(createFunnel(d, who, A, { name: 'Too short', steps: [twoSteps[0]] })).rejects.toSatisfy((e) => isFunnelError(e) && e.code === 'INVALID_INPUT');
  });

  it('refuses an event name outside the catalogue', async () => {
    const steps = [twoSteps[0], { key: 'x', label: 'Made up', eventName: 'not_a_real_event' }];
    await expect(createFunnel(d, who, A, { name: 'Bad event', steps })).rejects.toSatisfy((e) => isFunnelError(e) && e.code === 'INVALID_INPUT');
  });

  it('creates, lists, updates, archives and restores a saved funnel — nothing ever deleted', async () => {
    const created = await createFunnel(d, who, A, { name: 'Product page', steps: twoSteps });
    expect(created.archived).toBe(false);
    expect(created.steps).toHaveLength(2);

    const listed = await listFunnels(d, A);
    expect(listed.map((f) => f.id)).toContain(created.id);

    const updated = await updateFunnel(d, who, A, created.id, { name: 'Product page (renamed)' });
    expect(updated.name).toBe('Product page (renamed)');
    expect(updated.steps).toHaveLength(2); // untouched by a patch that only names

    const archived = await setFunnelArchived(d, who, A, created.id, true);
    expect(archived.archived).toBe(true);
    expect((await listFunnels(d, A)).map((f) => f.id)).not.toContain(created.id);
    expect((await listFunnels(d, A, { includeArchived: true })).map((f) => f.id)).toContain(created.id);

    const restored = await setFunnelArchived(d, who, A, created.id, false);
    expect(restored.archived).toBe(false);
    expect((await listFunnels(d, A)).map((f) => f.id)).toContain(created.id);
  });

  it('404s on an id from the wrong store', async () => {
    const created = await createFunnel(d, who, A, { name: 'Store A only', steps: twoSteps });
    await expect(getFunnel(d, B, created.id)).rejects.toSatisfy((e) => isFunnelError(e) && e.code === 'NOT_FOUND');
  });
});
