// S16 · PR 350 — Money → VAT on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the VAT system ships off
// and the rates empty; the switch and the rates are versioned store settings (a stale version refused) and audited; a
// rate for another store's category or product is refused; each category says which rate its products get (its own, a
// parent's, the default, none) and a product found by name or SKU says its rate and why; a reader sees, never writes.
// A rate typed as text: digits (also Bengali), 0–50 %, at most 2 decimals. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { percentToBps, vatRoute, type VatFound, type VatView } from './vat-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.76' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe('a VAT rate as text (PR 350)', () => {
  it('digits (also Bengali), a comma or %, 0–50, at most 2 decimals', () => {
    expect(percentToBps('15')).toBe(1_500);
    expect(percentToBps('7.5')).toBe(750);
    expect(percentToBps('7,05 %')).toBe(705);
    expect(percentToBps('১৫')).toBe(1_500);
    expect(percentToBps('0')).toBe(0);
    expect(percentToBps(50)).toBe(5_000);
    expect(percentToBps('50.01')).toBeNull();
    expect(percentToBps('7.555')).toBeNull();
    expect(percentToBps('')).toBeNull();
    expect(percentToBps('-5')).toBeNull();
  });
});

describe.skipIf(!HAS_TEST_DB)('Money → VAT on PostgreSQL (PR 350)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let B = 0;
  let owner = '';
  let reader = '';
  const ids: Record<string, string> = {};
  const route = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; query?: string } = {}) => {
    const res = await vatRoute(call(method, `/api/admin/money/vat${path.length ? `/${path.join('/')}` : ''}?storeId=${A}${opts.query ?? ''}`, opts), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('vat');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Books reader', nameBn: 'হিসাব পাঠক', permissions: ['books.read'] } }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.role.id } }), deps, staff.staff.id);
    const firstLogin = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: firstLogin, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
    const shirts = await t.prisma.category.create({ data: { storeId: A, slug: 'sample-shirts', nameEn: 'Shirts', sortOrder: 1 } });
    const formal = await t.prisma.category.create({ data: { storeId: A, slug: 'sample-formal', nameEn: 'Formal', parentId: shirts.id } });
    const caps = await t.prisma.category.create({ data: { storeId: A, slug: 'sample-caps', nameEn: 'Caps', sortOrder: 0 } });
    ids.shirts = shirts.id;
    ids.formal = formal.id;
    ids.caps = caps.id;
    ids.otherCat = (await t.prisma.category.create({ data: { storeId: B, slug: 'sample-other', nameEn: 'Other store' } })).id;
    const shirt = await t.prisma.product.create({ data: { storeId: A, slug: 'sample-oxford-shirt', nameEn: 'Oxford shirt', categoryId: formal.id } });
    ids.shirt = shirt.id;
    await t.prisma.productVariant.create({ data: { storeId: A, productId: shirt.id, sku: 'SAMPLE-OX-M', priceMinor: 115_000 } });
    ids.gift = (await t.prisma.product.create({ data: { storeId: A, slug: 'sample-gift-box', nameEn: 'Gift box', categoryId: caps.id } })).id;
    ids.otherProd = (await t.prisma.product.create({ data: { storeId: B, slug: 'sample-other-prod', nameEn: 'Oxford elsewhere' } })).id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships off and empty; categories in tree order, each with no rate; a reader sees but may not change', async () => {
    const v = (await route('GET', [], { cookie: reader })).body as unknown as VatView;
    expect(v.system.value).toEqual({ enabled: false, onDelivery: false });
    expect(v.rates.value).toBeNull();
    expect(v.categories.map((c) => [c.nameEn, c.depth])).toEqual([
      ['Caps', 0],
      ['Shirts', 0],
      ['Formal', 1],
    ]);
    expect(v.categories.every((c) => c.applies.source === 'none' && c.bps === null)).toBe(true);
    expect(v.products).toEqual([]);
    expect((await route('PUT', ['system'], { cookie: reader, body: { value: { enabled: true, onDelivery: false }, version: v.system.version } })).status).toBe(403);
    expect((await route('PUT', ['rates'], { cookie: reader, body: { value: null, version: v.rates.version } })).status).toBe(403);
    expect((await route('GET', [])).status).toBe(401);
    expect((await route('POST', ['system'], { cookie: owner, body: {} })).status).toBe(405);
    expect((await route('GET', ['nope'], { cookie: owner })).status).toBe(404);
  });

  it('the rates are saved with their version, audited; a stale version and another store’s targets are refused', async () => {
    const v0 = (await route('GET', [], { cookie: owner })).body as unknown as VatView;
    const value = { defaultBps: 1_500, categories: [{ categoryId: ids.shirts, bps: 750 }, { categoryId: ids.caps, bps: 0 }], products: [{ productId: ids.gift, bps: 500 }] };
    const saved = await route('PUT', ['rates'], { cookie: owner, body: { value, version: v0.rates.version } });
    expect(saved.status).toBe(200);
    expect(saved.body.value).toEqual(value);
    expect((await route('PUT', ['rates'], { cookie: owner, body: { value: { ...value, defaultBps: 1_000 }, version: v0.rates.version } })).status).toBe(409);
    const foreign = await route('PUT', ['rates'], { cookie: owner, body: { value: { ...value, categories: [{ categoryId: ids.otherCat, bps: 100 }] }, version: saved.body.version } });
    expect(foreign.status).toBe(400);
    expect(String(foreign.body.details)).toContain('categories');
    expect((await route('PUT', ['rates'], { cookie: owner, body: { value: { ...value, products: [{ productId: ids.otherProd, bps: 100 }] }, version: saved.body.version } })).status).toBe(400);
    expect((await route('PUT', ['rates'], { cookie: owner, body: { value: { ...value, defaultBps: 9_000 }, version: saved.body.version } })).status).toBe(400);
    expect((await route('PUT', ['rates'], { cookie: owner, body: { version: saved.body.version } })).status).toBe(400);
    const audits = await t.prisma.auditLog.findMany({ where: { action: 'vat.rates' } });
    expect(audits).toHaveLength(1);

    const v1 = (await route('GET', [], { cookie: owner })).body as unknown as VatView;
    const row = (name: string) => v1.categories.find((c) => c.nameEn === name)!;
    expect(row('Shirts')).toMatchObject({ bps: 750, applies: { bps: 750, source: 'category' } });
    expect(row('Formal')).toMatchObject({ bps: null, applies: { bps: 750, source: 'parent', fromCategoryId: ids.shirts } });
    expect(row('Caps').applies).toEqual({ bps: 0, source: 'category', fromCategoryId: ids.caps });
    expect(v1.products).toEqual([{ productId: ids.gift, nameEn: 'Gift box', nameBn: null, slug: 'sample-gift-box', bps: 500, without: { bps: 0, source: 'category', fromCategoryId: ids.caps } }]);
  });

  it('finds this store’s products by name or SKU with the rate that applies now and why', async () => {
    const byName = (await route('GET', ['find'], { cookie: reader, query: '&q=oxford' })).body.products as VatFound[];
    expect(byName.map((p) => p.nameEn)).toEqual(['Oxford shirt']);
    expect(byName[0]!.rate).toEqual({ bps: 750, source: 'parent', fromCategoryId: ids.shirts });
    const bySku = (await route('GET', ['find'], { cookie: reader, query: '&q=sample-ox-m' })).body.products as VatFound[];
    expect(bySku.map((p) => p.productId)).toEqual([ids.shirt]);
    expect(((await route('GET', ['find'], { cookie: reader, query: '&q=gift' })).body.products as VatFound[])[0]!.rate.source).toBe('product');
    expect((await route('GET', ['find'], { cookie: reader, query: '&q=o' })).body.products).toEqual([]);
  });

  it('the switch is saved with its version and audited; the same value again writes nothing', async () => {
    const v = (await route('GET', [], { cookie: owner })).body as unknown as VatView;
    const on = await route('PUT', ['system'], { cookie: owner, body: { value: { enabled: true, onDelivery: true }, version: v.system.version } });
    expect(on.status).toBe(200);
    expect(on.body.value).toEqual({ enabled: true, onDelivery: true });
    expect((await route('PUT', ['system'], { cookie: owner, body: { value: { enabled: true, onDelivery: true }, version: on.body.version } })).status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'vat.system' } })).toBe(1);
    expect((await route('PUT', ['system'], { cookie: owner, body: { value: { enabled: 'yes' }, version: on.body.version } })).status).toBe(400);
    // Clearing the rates again is allowed (null = none entered).
    const cleared = await route('PUT', ['rates'], { cookie: owner, body: { value: null, version: ((await route('GET', [], { cookie: owner })).body as unknown as VatView).rates.version } });
    expect(cleared.status).toBe(200);
    expect(cleared.body.value).toBeNull();
  });
});
