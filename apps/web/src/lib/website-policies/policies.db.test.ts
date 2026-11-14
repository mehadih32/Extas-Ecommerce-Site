// PR 718 — Website › Policies on a real PostgreSQL: a sign-in is needed; as shipped no page has words (all are empty
// drafts) and nothing is written for the owner; words already in Settings › Policies & texts become version 1 (live) the
// first time the tab opens, with nothing lost; a draft is saved, edited in place, published (the old live version is marked
// replaced) and for a page the shop already had the words reach `pages.text`; a restore is a NEW draft and removes
// nothing; a stand-in, half a pair and a stale save are refused; a new page needs its title and text to go live and the
// shop reads only published words. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Made-up sample words.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { websitePoliciesHandler } from './api';
import { liveNewPolicies, livePolicyWords } from './shop';
import type { PolicyRow } from './service';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.31' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/website/policies'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  version?: number;
  view: { rows: PolicyRow[] };
}
const pair = (en: string, bn: string) => ({ en, bn });

describe.skipIf(!HAS_TEST_DB)('Website › Policies on PostgreSQL (PR 718)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, cookie = owner) => {
    const res = await websitePoliciesHandler(call(method, { cookie, body: b }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const rowOf = (a: Answer, slug: string) => a.view.rows.find((r) => r.slug === slug)!;

  it('needs a sign-in, lists the nine pages as empty drafts and writes nothing for the owner', async () => {
    expect((await websitePoliciesHandler(call('GET'), deps)).status).toBe(401);
    const g = await send('GET');
    expect(g.a.view.rows.map((r) => r.slug)).toEqual(['terms', 'privacy', 'delivery', 'exchange', 'payment', 'cancellation', 'wallet', 'reviews', 'cookies']);
    for (const r of g.a.view.rows) expect(r).toMatchObject({ state: 'draft', live: null, draft: null, latest: 0, versions: [] });
    expect(g.a.view.rows.filter((r) => r.existing).map((r) => r.slug)).toEqual(['terms', 'privacy', 'delivery', 'exchange', 'payment']);
    expect(rowOf(g.a, 'cookies').path).toBe('/help/cookies');
  });

  it('keeps the words already in Settings as version 1 (live), and adopts a later Settings change as the next version', async () => {
    const target = storeTarget(MOTHER_STORE_ID);
    await deps.resolver.set('pages.text', { pages: { terms: { title: null, lede: null, body: pair('Old terms text.', 'পুরনো লেখা।') } }, faq: [] }, target, { actorId: null, reason: 'test: words before the tab' });
    const g = await send('GET');
    const terms = rowOf(g.a, 'terms');
    expect(terms).toMatchObject({ state: 'published', latest: 1 });
    expect(terms.live).toMatchObject({ version: 1, source: 'settings', words: { body: pair('Old terms text.', 'পুরনো লেখা।') } });
    // opening it again changes nothing
    expect(rowOf((await send('GET')).a, 'terms').versions).toHaveLength(1);

    await deps.resolver.set('pages.text', { pages: { terms: { title: null, lede: null, body: pair('Changed in Settings.', 'সেটিংসে বদল।') } }, faq: [] }, target, { actorId: null, reason: 'test: changed in Settings' });
    const g2 = rowOf((await send('GET')).a, 'terms');
    expect(g2.latest).toBe(2);
    expect(g2.live!.words.body).toEqual(pair('Changed in Settings.', 'সেটিংসে বদল।'));
    expect(g2.versions.map((v) => [v.version, v.status])).toEqual([[2, 'PUBLISHED'], [1, 'SUPERSEDED']]);
  });

  it('saves a draft, edits it in place, publishes it; the words of an existing page reach Settings', async () => {
    const first = await send('PUT', { page: 'terms', words: { title: null, lede: null, body: pair('Draft one.', 'খসড়া এক।') }, version: 2 });
    expect(first.status).toBe(200);
    expect(rowOf(first.a, 'terms')).toMatchObject({ state: 'published-draft', latest: 3, draft: { version: 3, status: 'DRAFT', by: 'Sample owner' } });
    // the same open draft is edited in place: still version 3
    const again = await send('PUT', { page: 'terms', words: { title: null, lede: null, body: pair('Draft two.', 'খসড়া দুই।') }, version: 3 });
    expect(rowOf(again.a, 'terms')).toMatchObject({ latest: 3, draft: { words: { body: pair('Draft two.', 'খসড়া দুই।') } } });
    // not live yet
    expect((await deps.resolver.value('pages.text', { storeId: MOTHER_STORE_ID }))?.pages.terms?.body?.en).toBe('Changed in Settings.');

    const pub = await send('PUT', { page: 'terms', publish: true, version: 3 });
    expect(pub.status).toBe(200);
    const terms = rowOf(pub.a, 'terms');
    expect(terms).toMatchObject({ state: 'published', live: { version: 3, words: { body: pair('Draft two.', 'খসড়া দুই।') } } });
    expect(terms.versions.map((v) => v.status)).toEqual(['PUBLISHED', 'SUPERSEDED', 'SUPERSEDED']);
    expect((await deps.resolver.value('pages.text', { storeId: MOTHER_STORE_ID }))?.pages.terms?.body?.en).toBe('Draft two.');
    // publishing wrote nothing extra into the history (the mirror equals the live version)
    expect(rowOf((await send('GET')).a, 'terms').latest).toBe(3);
    expect((await send('PUT', { page: 'terms', publish: true, version: 3 })).a.error).toBe('NO_DRAFT');
  });

  it('a restore is a new draft and removes nothing; it replaces an open draft by setting it aside', async () => {
    const r = await send('PUT', { page: 'terms', restore: 1, version: 3 });
    expect(r.status).toBe(200);
    let terms = rowOf(r.a, 'terms');
    expect(terms).toMatchObject({ state: 'published-draft', latest: 4, draft: { version: 4, source: 'restore', restoredFrom: 1, words: { body: pair('Old terms text.', 'পুরনো লেখা।') } } });
    expect(terms.versions).toHaveLength(4);
    const r2 = await send('PUT', { page: 'terms', restore: 2, version: 4 });
    terms = rowOf(r2.a, 'terms');
    expect(terms.versions.map((v) => [v.version, v.status])).toEqual([[5, 'DRAFT'], [4, 'DISCARDED'], [3, 'PUBLISHED'], [2, 'SUPERSEDED'], [1, 'SUPERSEDED']]);
    expect((await send('PUT', { page: 'terms', restore: 99, version: 5 })).status).toBe(404);
    expect(await t.prisma.contentRevision.count({ where: { entityType: 'policy', entityId: 'terms' } })).toBe(5);
  });

  it('refuses a stale save, half a pair, a stand-in and a page that is not one of the nine', async () => {
    const w = { title: null, lede: null, body: pair('Some words.', 'কিছু লেখা।') };
    expect((await send('PUT', { page: 'terms', words: w, version: 1 })).status).toBe(409);
    expect(await send('PUT', { page: 'terms', words: { ...w, title: pair('Terms', '') }, version: 5 })).toMatchObject({ status: 400, a: { error: 'INVALID_INPUT', details: ['title'] } });
    expect(await send('PUT', { page: 'terms', words: { ...w, lede: pair('Write to [support email].', 'লিখুন') }, version: 5 })).toMatchObject({ status: 400, a: { error: 'PLACEHOLDER', details: ['lede'] } });
    expect((await send('PUT', { page: 'faq', words: w })).status).toBe(400);
    expect((await send('PUT', { page: 'terms', words: w, version: 5 }).then((x) => x.status))).toBe(200);
  });

  it('a new page goes live only with its title and text, and the shop reads only published words', async () => {
    const db = t.prisma;
    expect(await livePolicyWords(db, MOTHER_STORE_ID, 'cookies')).toBeNull();
    const body = pair('We keep a small file in your browser.', 'আপনার ব্রাউজারে একটা ছোট ফাইল রাখি।');
    await send('PUT', { page: 'cookies', words: { title: null, lede: null, body }, version: 0 });
    expect(await send('PUT', { page: 'cookies', publish: true, version: 1 })).toMatchObject({ status: 400, a: { error: 'INVALID_INPUT', details: ['title'] } });
    expect(await livePolicyWords(db, MOTHER_STORE_ID, 'cookies')).toBeNull();
    expect(await liveNewPolicies(db, MOTHER_STORE_ID)).toEqual([]);

    await send('PUT', { page: 'cookies', words: { title: pair('Cookies', 'কুকি'), lede: null, body }, version: 1 });
    const pub = await send('PUT', { page: 'cookies', publish: true, version: 1 });
    expect(rowOf(pub.a, 'cookies')).toMatchObject({ state: 'published', live: { version: 1 } });
    expect(await livePolicyWords(db, MOTHER_STORE_ID, 'cookies')).toMatchObject({ title: pair('Cookies', 'কুকি'), body });
    expect(await liveNewPolicies(db, MOTHER_STORE_ID)).toEqual(['cookies']);

    // a newer draft does not change what the shop reads until it is published
    await send('PUT', { page: 'cookies', words: { title: pair('Cookies', 'কুকি'), lede: null, body: pair('Newer.', 'নতুন।') }, version: 1 });
    expect((await livePolicyWords(db, MOTHER_STORE_ID, 'cookies'))!.body).toEqual(body);
  });

  it('audits the page and version, never the words', async () => {
    const rows = await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'website.policy.' } } });
    expect(rows.length).toBeGreaterThan(4);
    for (const r of rows) expect(JSON.stringify(r.after)).not.toMatch(/Draft|Some words|browser/);
  });
});
