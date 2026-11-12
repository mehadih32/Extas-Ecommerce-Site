// S15 · PR 338 — the analytics beacon on a real PostgreSQL (a throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL), called the way the browser calls it: same-site only, the visitor cookie minted on the
// first call and sent back after, the master switch respected, and a bad or unknown payload silently dropped
// (D5.3's own "tracking can fail, the shop cannot" — nothing here ever answers with an error status).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { BAG_COOKIE } from '../shop/bag-model';
import { analyticsIngestHandler, type AnalyticsApiDeps } from './ingest';

const ORIGIN = 'https://shop.example.test';

describe.skipIf(!HAS_TEST_DB)('the analytics beacon on PostgreSQL (PR 338)', () => {
  let t: TestDatabase;
  let A = 0;
  const overrides = new Map<string, unknown>();
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): AnalyticsApiDeps => ({ analytics: { db: t.prisma }, accounts: null, resolver: settings, storeId: A });

  const req = (body: unknown, o: { cookie?: string; site?: string; method?: string } = {}) =>
    new Request(`${ORIGIN}/api/shop/analytics`, {
      method: o.method ?? 'POST',
      headers: { 'sec-fetch-site': o.site ?? 'same-origin', ...(o.cookie ? { cookie: o.cookie } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const visitorOf = (r: Response) =>
    r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0] ?? '')
      .find((c) => c.startsWith(`${BAG_COOKIE}=`))
      ?.slice(BAG_COOKIE.length + 1);

  beforeAll(async () => {
    t = await createTestDatabase('analytics_beacon_338');
    [A] = await seedSampleStores(t.prisma);
  });
  afterAll(async () => t?.drop());
  afterAll(() => overrides.clear());

  it('mints the visitor cookie on a fresh call and stores the event under it', async () => {
    const r = await analyticsIngestHandler(req({ name: 'page_view', pageType: 'home' }), deps());
    expect(r.status).toBe(204);
    const visitor = visitorOf(r);
    expect(visitor).toBeTruthy();
    const row = await t.prisma.analyticsEvent.findFirstOrThrow({ where: { storeId: A, visitorId: decodeURIComponent(visitor!) } });
    expect(row).toMatchObject({ name: 'page_view', pageType: 'home', isLoggedIn: false });
  });

  it('reuses the sent visitor cookie rather than minting a new one', async () => {
    const r1 = await analyticsIngestHandler(req({ name: 'page_view' }), deps());
    const visitor = visitorOf(r1)!;
    const r2 = await analyticsIngestHandler(req({ name: 'search', props: { term: 'polo' } }, { cookie: `${BAG_COOKIE}=${visitor}` }), deps());
    expect(visitorOf(r2)).toBeUndefined(); // the same visitor id sent back: no new cookie needed
    const rows = await t.prisma.analyticsEvent.findMany({ where: { storeId: A, visitorId: decodeURIComponent(visitor) } });
    expect(rows.map((x) => x.name)).toEqual(expect.arrayContaining(['page_view', 'search']));
  });

  it('a cross-site request is refused: nothing stored, no cookie set', async () => {
    const before = await t.prisma.analyticsEvent.count({ where: { storeId: A } });
    const r = await analyticsIngestHandler(req({ name: 'page_view' }, { site: 'cross-site' }), deps());
    expect(r.status).toBe(204);
    expect(visitorOf(r)).toBeUndefined();
    expect(await t.prisma.analyticsEvent.count({ where: { storeId: A } })).toBe(before);
  });

  it('an unknown event name is silently dropped — never invented, never stored, still 204', async () => {
    const before = await t.prisma.analyticsEvent.count({ where: { storeId: A } });
    const r = await analyticsIngestHandler(req({ name: 'made_up_event' }), deps());
    expect(r.status).toBe(204);
    expect(await t.prisma.analyticsEvent.count({ where: { storeId: A } })).toBe(before);
  });

  it('the master switch off: nothing stored, still 204, the visitor cookie still minted', async () => {
    overrides.set('analytics.events', { on: false });
    const before = await t.prisma.analyticsEvent.count({ where: { storeId: A } });
    const r = await analyticsIngestHandler(req({ name: 'page_view' }), deps());
    expect(r.status).toBe(204);
    expect(visitorOf(r)).toBeTruthy();
    expect(await t.prisma.analyticsEvent.count({ where: { storeId: A } })).toBe(before);
    overrides.delete('analytics.events');
  });

  it('a GET is refused (405), never recorded', async () => {
    const r = await analyticsIngestHandler(req({ name: 'page_view' }, { method: 'GET' }), deps());
    expect(r.status).toBe(405);
  });

  it('with no deps (no database configured) answers 204 quietly', async () => {
    const r = await analyticsIngestHandler(req({ name: 'page_view' }), null);
    expect(r.status).toBe(204);
  });
});
