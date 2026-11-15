// PR 746 + 747 — Products › Categories & tags on a real PostgreSQL: the three cards read, saved whole with a fresh version;
// the category order and visibility really change, a category named twice or from another level is refused, the collection
// order and the tag badges are settings the lists then follow, a stale version is refused, and the audit rows name the card.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Made-up test values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { structureHandler } from './api';
import type { CategoryRow, CollectionRow, TagRow } from './service';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.41' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/catalogue/structure'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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
  version?: string;
  cards: {
    categories: { value: { rows: CategoryRow[] }; version: string };
    collections: { value: { rows: CollectionRow[] }; version: string };
    tags: { value: { rows: TagRow[] }; version: string };
  };
}

describe.skipIf(!HAS_TEST_DB)('Products › Categories & tags on PostgreSQL (PR 746, 747)', () => {
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
    const storeId = MOTHER_STORE_ID;
    for (const [i, slug] of ['polos', 'shirts', 'pants'].entries()) await t.prisma.category.create({ data: { storeId, slug, nameEn: slug.toUpperCase(), sortOrder: i * 10, isVisible: true } });
    for (const slug of ['eid', 'winter', 'basics']) await t.prisma.collection.create({ data: { storeId, slug, nameEn: slug.toUpperCase(), kind: 'MANUAL' } });
    for (const [slug, name] of [['new', 'New'], ['bestseller', 'Bestseller'], ['limited', 'Limited']]) await t.prisma.tag.create({ data: { storeId, slug, name } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, cookie = owner) => {
    const res = await structureHandler(call(method, { cookie, body: b }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const at = { storeId: MOTHER_STORE_ID };

  it('needs a sign-in, then reads the three cards in the order the shop shows today', async () => {
    expect((await structureHandler(call('GET'), deps)).status).toBe(401);
    const { status, a } = await send('GET');
    expect(status).toBe(200);
    expect(a.cards.categories.value.rows.map((r) => r.id.length > 0 && r.name.en)).toEqual(['POLOS', 'SHIRTS', 'PANTS']);
    expect(a.cards.categories.value.rows.every((r) => r.on && r.parentId === null)).toBe(true);
    expect(a.cards.collections.value.rows.map((r) => r.id)).toEqual(['basics', 'eid', 'winter']);
    expect(a.cards.tags.value.rows.map((r) => r.id)).toEqual(['bestseller', 'limited', 'new']);
  });

  it('saves a new category order and hides one, and the categories really change', async () => {
    const a0 = (await send('GET')).a.cards.categories;
    const [polos, shirts, pants] = a0.value.rows;
    const rows = [pants!, polos!, { ...shirts!, on: false }].map((r) => ({ id: r.id, on: r.on }));
    const { status, a } = await send('PUT', { key: 'categories', value: { rows }, version: a0.version });
    expect(status).toBe(200);
    expect(a.cards.categories.value.rows.map((r) => [r.name.en, r.on])).toEqual([['PANTS', true], ['POLOS', true], ['SHIRTS', false]]);
    const live = await t.prisma.category.findMany({ where: { storeId: MOTHER_STORE_ID }, orderBy: { sortOrder: 'asc' }, select: { slug: true, isVisible: true } });
    expect(live).toEqual([{ slug: 'pants', isVisible: true }, { slug: 'polos', isVisible: true }, { slug: 'shirts', isVisible: false }]);
    const log = await t.prisma.auditLog.findMany({ where: { action: { in: ['category.reorder', 'structure.categories.save'] } } });
    expect(log.map((l) => l.action).sort()).toEqual(['category.reorder', 'structure.categories.save']);
  });

  it('refuses a category named twice, one that is not there, and a list with one left out', async () => {
    const a0 = (await send('GET')).a.cards.categories;
    const [x, y] = a0.value.rows;
    for (const rows of [[x, x, y], [x, y], [x, y, { id: 'nope', on: true }]]) {
      const r = await send('PUT', { key: 'categories', value: { rows: rows!.map((q) => ({ id: q!.id, on: true })) }, version: a0.version });
      expect(r.status).toBe(400);
      expect(r.a.error).toBe('INVALID_INPUT');
    }
  });

  it('a stale version is refused and says the current one', async () => {
    const a0 = (await send('GET')).a.cards.collections;
    const r = await send('PUT', { key: 'collections', value: { rows: a0.value.rows }, version: 'old-version' });
    expect(r.status).toBe(409);
    expect(r.a.error).toBe('STALE');
    expect(r.a.version).toBe(a0.version);
  });

  it('saves the collection order as a setting and the list follows it', async () => {
    const a0 = (await send('GET')).a.cards.collections;
    const rows = ['winter', 'basics', 'eid'].map((id) => ({ id }));
    const { status, a } = await send('PUT', { key: 'collections', value: { rows }, version: a0.version });
    expect(status).toBe(200);
    expect(a.cards.collections.value.rows.map((r) => r.id)).toEqual(['winter', 'basics', 'eid']);
    expect(await deps.resolver.value('catalogue.collections.order', at)).toEqual(['winter', 'basics', 'eid']);
    expect((await send('PUT', { key: 'collections', value: { rows: [{ id: 'eid' }, { id: 'eid' }, { id: 'winter' }] } })).status).toBe(400);
    expect((await send('PUT', { key: 'collections', value: { rows: [{ id: 'ghost' }] } })).status).toBe(400);
  });

  it('saves the tag badges as a setting: the order, a tag that never shows and the owner\'s own words', async () => {
    const a0 = (await send('GET')).a.cards.tags;
    const rows = [
      { id: 'limited', on: true, label: { en: 'Few left', bn: 'অল্প আছে' } },
      { id: 'new', on: true, label: null },
      { id: 'bestseller', on: false, label: null },
    ];
    const { status, a } = await send('PUT', { key: 'tags', value: { rows }, version: a0.version });
    expect(status).toBe(200);
    expect(await deps.resolver.value('card.tagBadges', at)).toEqual({ order: ['limited', 'new', 'bestseller'], hidden: ['bestseller'], labels: { limited: { en: 'Few left', bn: 'অল্প আছে' } } });
    expect(a.cards.tags.value.rows.map((r) => [r.id, r.on, r.label?.en ?? null])).toEqual([['limited', true, 'Few left'], ['new', true, null], ['bestseller', false, null]]);
    // a half-written pair of words is refused, not guessed
    const half = await send('PUT', { key: 'tags', value: { rows: [{ id: 'new', on: true, label: { en: 'Fresh', bn: '' } }, { id: 'limited', on: true, label: null }, { id: 'bestseller', on: true, label: null }] } });
    expect(half.status).toBe(400);
  });

  it('a person without the product editing permission can look but not save', async () => {
    const r = await send('PUT', { key: 'tags', value: { rows: [] } }, '');
    expect(r.status).toBe(401);
  });
});
