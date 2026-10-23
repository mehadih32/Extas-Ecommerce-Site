// PR 72 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL),
// with the in-memory Meilisearch stand-in (@extas/search/testing): the leader's planner asks for one `search.index`
// job per store whose index is behind its catalogue, keyed by the version it should reach; the job indexes once (a
// second attempt of the same run is skipped); nothing is planned while the index is current; a changed product makes a
// new version and so a new job; and without Meilisearch nothing is planned at all. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import type { InventoryDeps, SettingsReader } from '@extas/inventory';
import { forgetSearchCache } from '@extas/search';
import { fakeMeili } from '@extas/search/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { jobDefinition, type JobDefinition } from './catalogue';
import type { JobDeps } from './context';
import { runAttempt } from './runs';
import { SEARCH_INDEX_JOB, searchPlanner } from './search';

const settings: SettingsReader = { value: async <K extends Key>(k: K) => registry[k].default as Value<K> };

describe.skipIf(!HAS_TEST_DB)('PR 72 · the search index job on PostgreSQL', () => {
  let t: TestDatabase;
  let storeId = 0;
  let productId = '';
  const fake = fakeMeili();
  const meili = { url: 'http://meili.test', key: 'test-key', fetch: fake.fetch };
  const deps = (withMeili = true): JobDeps => ({ db: t.prisma, settings, inventory: {} as InventoryDeps, search: { meili: withMeili ? meili : null } });
  const attempt = (payload: unknown, key: string, n = 1) => ({
    def: jobDefinition(SEARCH_INDEX_JOB) as JobDefinition<unknown>,
    payload,
    idempotencyKey: key,
    attempt: n,
    maxAttempts: 3,
    policy: { maxAttempts: 3, baseMs: 30_000, maxMs: 1_800_000 },
    workerKey: 'w-search',
    queueJobId: `q-${key}`,
    staleSeconds: 60,
  });

  beforeAll(async () => {
    t = await createTestDatabase('jobs_search');
    [storeId] = await seedSampleStores(t.prisma);
    const db = t.prisma;
    const cat = await db.category.create({ data: { storeId, slug: 'js-polos', nameEn: 'Polos', isVisible: true } });
    const p = await db.product.create({ data: { storeId, slug: 'js-polo', nameEn: 'Test Polo', status: 'PUBLISHED', publishedAt: new Date(), categoryId: cat.id } });
    productId = p.id;
    forgetSearchCache();
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  it('plans one job for a store that is behind, runs it once, then plans nothing until the catalogue changes', async () => {
    expect(await searchPlanner(deps(false), new Date())).toEqual([]);
    const plans = (await searchPlanner(deps(), new Date())).filter((x) => (x.payload as { storeId: number }).storeId === storeId);
    expect(plans).toHaveLength(1);
    const [plan] = plans;
    expect(plan!.name).toBe(SEARCH_INDEX_JOB);
    expect(plan!.key).toMatch(new RegExp(`^search\\.index/${storeId}/`));
    expect(plan!.key).not.toContain(':');

    const first = await runAttempt(deps(), attempt(plan!.payload, plan!.key!));
    expect(first).toMatchObject({ kind: 'succeeded', stats: { status: 'indexed', products: 1 } });
    const again = await runAttempt(deps(), attempt(plan!.payload, plan!.key!, 2));
    expect(again).toMatchObject({ kind: 'skipped', reason: 'ALREADY_DONE' });
    expect((await searchPlanner(deps(), new Date())).filter((x) => (x.payload as { storeId: number }).storeId === storeId)).toEqual([]);

    await t.prisma.product.update({ where: { id: productId }, data: { nameEn: 'Test Polo Shirt' } });
    const next = (await searchPlanner(deps(), new Date())).filter((x) => (x.payload as { storeId: number }).storeId === storeId);
    expect(next).toHaveLength(1);
    expect(next[0]!.key).not.toBe(plan!.key);
  });
});
