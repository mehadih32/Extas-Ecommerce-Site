// PR 726 — Website › Brand & menus on a real PostgreSQL: the three cards read, saved whole with a fresh version, the
// settings they stand for really change (name, slogans, browser-tab title, menu, footer, social addresses), a stale
// version is refused, a picture that is not in the library is refused, and the audit rows name the card. A throwaway
// database (skipped without TEST_DATABASE_ADMIN_URL). Made-up test values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { brandHandler } from './api';
import type { BrandCardValue, FooterCardValue, MenuCardValue } from './model';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.31' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/website/brand'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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
  cards: { brand: { value: BrandCardValue; version: string }; menu: { value: MenuCardValue; version: string }; footer: { value: FooterCardValue; version: string } };
}

describe.skipIf(!HAS_TEST_DB)('Website › Brand & menus on PostgreSQL (PR 726)', () => {
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
    const res = await brandHandler(call(method, { cookie, body: b }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const at = { storeId: MOTHER_STORE_ID };
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  it('needs a sign-in, then reads the three cards with the shop\'s own defaults', async () => {
    expect((await brandHandler(call('GET'), deps)).status).toBe(401);
    const g = await send('GET');
    expect(g.status).toBe(200);
    expect(g.a.cards.brand.value).toMatchObject({ name: '', slogan: null, logo: null, favicon: null, logoStyle: 0, logoSize: { desk: 36, phone: 28, footer: 32 } });
    expect(g.a.cards.brand.value.tabTitle.en).not.toBe('');
    expect(g.a.cards.menu.value.items.every((i) => i.builtIn)).toBe(true);
    expect(g.a.cards.footer.value.columns.map((c) => c.id)).toEqual(['shop', 'help', 'about']);
  });

  it('saves the brand card: name, slogans, tab title and the logo style reach their settings; an emptied tab title goes back', async () => {
    const g = await send('GET');
    const v = clone(g.a.cards.brand.value);
    v.name = 'Sample Wear';
    v.slogan = { en: 'Made for you', bn: 'আপনার জন্য' };
    v.tabTitle = { en: '{shop} | Menswear', bn: '{shop} | পুরুষের পোশাক' };
    v.logoStyle = 3;
    v.logoSize = { desk: 40, phone: 30, footer: 32 };
    const ok = await send('PUT', { key: 'brand', value: v, version: g.a.cards.brand.version });
    expect(ok.status).toBe(200);
    expect(await deps.resolver.value('store.name', at)).toBe('Sample Wear');
    expect(await deps.resolver.value('brand.slogan', at)).toEqual({ en: 'Made for you', bn: 'আপনার জন্য' });
    expect((await deps.resolver.value('seo.titles', at)).home.title.en).toBe('{shop} | Menswear');
    expect((await deps.resolver.value('seo.titles', at)).category).toEqual(registry['seo.titles'].default.category);
    expect(await deps.resolver.value('brand.logoStyle', at)).toBe(3);
    expect(ok.a.cards.brand.value.name).toBe('Sample Wear');

    const again = clone(ok.a.cards.brand.value);
    again.tabTitle = { en: '', bn: '' };
    again.slogan = null;
    const back = await send('PUT', { key: 'brand', value: again, version: ok.a.cards.brand.version });
    expect(back.status).toBe(200);
    expect((await deps.resolver.value('seo.titles', at)).home.title).toEqual(registry['seo.titles'].default.home.title);
    expect(await deps.resolver.value('brand.slogan', at)).toBeNull();
  });

  it('refuses a half-written slogan, a size out of range, a stale version and a picture that is not in the library', async () => {
    const g = await send('GET');
    const v = clone(g.a.cards.brand.value);
    expect((await send('PUT', { key: 'brand', value: { ...v, slogan: { en: 'Only English', bn: '' } } })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['slogan'] });
    expect((await send('PUT', { key: 'brand', value: { ...v, logoSize: { desk: 500, phone: 28, footer: 32 } } })).a.details).toEqual(['logoSize']);
    expect((await send('PUT', { key: 'brand', value: v, version: 'old-version' })).status).toBe(409);
    const missing = await send('PUT', { key: 'brand', value: { ...v, logo: '3f2b8c1e-5d4a-4e8b-9c7d-1a2b3c4d5e6f' } });
    expect(missing).toMatchObject({ status: 400, a: { error: 'MEDIA_NOT_FOUND', details: ['logo'] } });
    expect(await deps.resolver.value('brand.logo', at)).toBeNull();
    expect((await send('PUT', { key: 'nope', value: {} })).status).toBe(400);
  });

  it('saves the menu card: order, hiding, rewording and an own link reach the shop\'s settings', async () => {
    const g = await send('GET');
    const v = clone(g.a.cards.menu.value);
    v.items.reverse();
    v.items.find((i) => i.id === 'journal')!.on = false;
    v.items.push({ id: 'sale', kind: 'link', label: { en: 'Sale', bn: 'সেল' }, cat: '', href: '/collections/sale', editHref: true, on: true, desk: true, phone: true, builtIn: false });
    v.icons.reverse();
    v.announceOn = false;
    const ok = await send('PUT', { key: 'menu', value: v, version: g.a.cards.menu.version });
    expect(ok.status).toBe(200);
    const menu = await deps.resolver.value('shell.menu', at);
    expect(menu.items.map((i) => i.id)).toEqual([...registry['shell.menu'].default.items.map((i) => i.id)].reverse().concat('sale'));
    expect(menu.items.find((i) => i.id === 'journal')!.on).toBe(false);
    expect(menu.items.at(-1)).toMatchObject({ kind: 'link', href: '/collections/sale' });
    expect((await deps.resolver.value('shell.header', at)).icons[0]!.id).toBe('bag');
    expect((await deps.resolver.value('shell.announce', at)).on).toBe(false);
    const bad = clone(ok.a.cards.menu.value);
    bad.items = bad.items.filter((i) => i.id !== 'combos');
    expect((await send('PUT', { key: 'menu', value: bad })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['items.combos'] });
  });

  it('saves the footer card: a link moved between columns, a column hidden, social addresses (https only)', async () => {
    const g = await send('GET');
    const v = clone(g.a.cards.footer.value);
    const moved = v.columns[0]!.links.shift()!;
    v.columns[1]!.links.push(moved);
    v.columns[2]!.on = false;
    v.urls.instagram = 'https://instagram.com/samplewear';
    v.joinOn = false;
    const ok = await send('PUT', { key: 'footer', value: v, version: g.a.cards.footer.version });
    expect(ok.status).toBe(200);
    const f = await deps.resolver.value('shell.footer', at);
    expect(f.columns[1]!.links.at(-1)!.id).toBe(moved.id);
    expect(f.columns[2]!.on).toBe(false);
    expect(f.join.on).toBe(false);
    expect(await deps.resolver.value('social.instagram', at)).toBe('https://instagram.com/samplewear');
    expect(ok.a.cards.footer.value.urls.instagram).toBe('https://instagram.com/samplewear');
    const insecure = clone(ok.a.cards.footer.value);
    insecure.urls.facebook = 'http://facebook.com/x';
    expect((await send('PUT', { key: 'footer', value: insecure })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['urls.facebook'] });
    expect(await deps.resolver.value('social.facebook', at)).toBeNull();
    // clearing an address clears it
    const clear = clone(ok.a.cards.footer.value);
    clear.urls.instagram = '';
    await send('PUT', { key: 'footer', value: clear });
    expect(await deps.resolver.value('social.instagram', at)).toBeNull();
  });

  it('audits every save by card, and a no-change save writes nothing', async () => {
    const rows = await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'website.' } } });
    const actions = new Set(rows.map((r) => r.action));
    expect(actions).toEqual(new Set(['website.brand.save', 'website.menu.save', 'website.footer.save']));
    const g = await send('GET');
    const before = await t.prisma.auditLog.count({ where: { action: { startsWith: 'website.' } } });
    await send('PUT', { key: 'menu', value: g.a.cards.menu.value, version: g.a.cards.menu.version });
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'website.' } } })).toBe(before);
  });
});
