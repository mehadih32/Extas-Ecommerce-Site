// PR 72 follow-up 100 — what shoppers search for, on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): words
// counted per day with the "found nothing" count, a period's sums, and the card saved through Reports › Searches
// (`settings.write`, audited, a stale card refused). Made-up values only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { countSearch, foundWords, searchReport } from './search-insights';
import { insightsHandler } from './search-insights-api';

const HOST = 'shop.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;

function call(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.84' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('search insights on PostgreSQL (follow-up 100)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';

  beforeAll(async () => {
    t = await createTestDatabase('search_insights');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
  });
  afterAll(async () => t?.drop());

  it('counts each search per word and day, and the ones that found nothing; never a phone number', async () => {
    expect(await countSearch(t.prisma, S, { q: 'Kabli', found: false, day: '2026-11-06' })).toBe(true);
    await Promise.all([countSearch(t.prisma, S, { q: 'kabli ', found: false, day: '2026-11-07' }), countSearch(t.prisma, S, { q: 'KABLI', found: false, day: '2026-11-07' })]);
    await countSearch(t.prisma, S, { q: 'polo', found: true, day: '2026-11-07' });
    await countSearch(t.prisma, S, { q: 'polo', found: true, day: '2026-10-01' });
    expect(await countSearch(t.prisma, S, { q: '01712345678', found: false, day: '2026-11-07' })).toBe(false);
    const rows = await t.prisma.searchTerm.findMany({ where: { storeId: S }, orderBy: [{ day: 'asc' }, { term: 'asc' }], select: { term: true, searches: true, emptySearches: true } });
    expect(rows).toEqual([
      { term: 'polo', searches: 1, emptySearches: 0 },
      { term: 'kabli', searches: 1, emptySearches: 1 },
      { term: 'kabli', searches: 2, emptySearches: 2 },
      { term: 'polo', searches: 1, emptySearches: 0 },
    ]);
  });

  it('sums a period: the most searched words and the words that found nothing', async () => {
    const r = await searchReport(t.prisma, S, { today: '2026-11-07', days: 7, rows: 10 });
    expect(r).toMatchObject({ from: '2026-11-01', to: '2026-11-07', searches: 4, empty: 3, words: 2 });
    expect(r.top).toEqual([
      { term: 'kabli', searches: 3, empty: 3 },
      { term: 'polo', searches: 1, empty: 0 },
    ]);
    expect(r.missing).toEqual([{ term: 'kabli', searches: 3, empty: 3 }]);
    expect((await searchReport(t.prisma, S, { today: '2026-11-07', days: 90, rows: 1 })).top).toEqual([{ term: 'kabli', searches: 3, empty: 3 }]);
  });

  it('the card: off as shipped, saved whole by the owner, audited; a stale card refused', async () => {
    const got = (await (await insightsHandler(call('GET', '/api/admin/search-insights', { cookie: owner }), deps)).json()) as { cards: Record<string, { version: string; value: Record<string, unknown> }> };
    const card = got.cards['search.insights']!;
    expect(card.value).toEqual({ keep: false, days: 90, rows: 50 });
    expect(got.cards['search.popular']!.value).toEqual({ on: false, days: 30, min: 3, max: 6 });
    const bad = await insightsHandler(call('PUT', '/api/admin/search-insights', { cookie: owner, body: { key: 'search.insights', version: card.version, value: { ...card.value, days: 2 } } }), deps);
    expect(bad.status).toBe(400);
    const ok = await insightsHandler(call('PUT', '/api/admin/search-insights', { cookie: owner, body: { key: 'search.insights', version: card.version, value: { ...card.value, keep: true } } }), deps);
    expect(ok.status).toBe(200);
    expect((await deps.resolver.value('search.insights', { storeId: S })).keep).toBe(true);
    const stale = await insightsHandler(call('PUT', '/api/admin/search-insights', { cookie: owner, body: { key: 'search.insights', version: card.version, value: card.value } }), deps);
    expect(stale.status).toBe(409);
    expect(await t.prisma.auditLog.count({ where: { action: 'search.insights.save' } })).toBe(1);
    expect((await insightsHandler(call('GET', '/api/admin/search-insights'), deps)).status).toBe(401);
  });

  it('follow-up 101: the words that found products, searched at least `min` times, most first; the popular card saved', async () => {
    for (let i = 0; i < 3; i += 1) await countSearch(t.prisma, S, { q: 'linen shirt', found: true, day: '2026-11-05' });
    expect(await foundWords(t.prisma, S, { today: '2026-11-07', days: 7, min: 1, max: 6 })).toEqual(['linen shirt', 'polo']);
    expect(await foundWords(t.prisma, S, { today: '2026-11-07', days: 7, min: 2, max: 6 })).toEqual(['linen shirt']);
    expect(await foundWords(t.prisma, S, { today: '2026-11-07', days: 90, min: 1, max: 1 })).toEqual(['linen shirt']);
    const got = (await (await insightsHandler(call('GET', '/api/admin/search-insights', { cookie: owner }), deps)).json()) as { cards: Record<string, { version: string; value: Record<string, unknown> }> };
    const pop = got.cards['search.popular']!;
    const bad = await insightsHandler(call('PUT', '/api/admin/search-insights', { cookie: owner, body: { key: 'search.popular', version: pop.version, value: { ...pop.value, max: 13 } } }), deps);
    expect(bad.status).toBe(400);
    const ok = await insightsHandler(call('PUT', '/api/admin/search-insights', { cookie: owner, body: { key: 'search.popular', version: pop.version, value: { ...pop.value, on: true } } }), deps);
    expect(ok.status).toBe(200);
    expect((await deps.resolver.value('search.popular', { storeId: S })).on).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'search.popular.save' } })).toBe(1);
    expect((await insightsHandler(call('PUT', '/api/admin/search-insights', { cookie: owner, body: { key: 'other', version: pop.version, value: pop.value } }), deps)).status).toBe(400);
  });
});
