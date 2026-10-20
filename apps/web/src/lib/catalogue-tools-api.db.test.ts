// PR 33, 36, 39 — the catalogue tools' routes end to end on a real PostgreSQL (a throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): import from a link through the page reader connection (on its mock: no key, no network),
// the back-in-stock list (public form, counts, contacts behind catalogue.interest) and the product audit.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, hashPassword, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { backInStockHandler, backInStockRequestsHandler, linkImportHandler, productAuditHandler, publicBackInStockHandler } from './catalogue-tools-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.41' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe.skipIf(!HAS_TEST_DB)('catalogue tools API (PR 33, 36, 39) on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let looker = '';
  let A = 0;

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('tools_api');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    // Someone who may see the catalogue but not the contacts.
    const role = await createRole(t.prisma, SYSTEM, { key: 'viewer', nameEn: 'Viewer', nameBn: 'দর্শক', permissions: ['catalogue.read'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'viewer@example.com', displayName: 'Viewer', passwordHash: await hashPassword(OWNER_PW), passwordSetAt: new Date() } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
    looker = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'viewer@example.com', password: OWNER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('import from a link: reads through the page reader mock, shows it, makes one draft and never a price', async () => {
    expect((await linkImportHandler(call('GET', '/x/link-import'), deps)).status).toBe(401);
    expect((await linkImportHandler(call('POST', '/x/link-import', { cookie: owner, origin: 'https://evil.example.test', body: { action: 'preview', url: 'https://a.example.com/p' } }), deps)).status).toBe(403);
    const screen = await read(await linkImportHandler(call('GET', '/x/link-import', { cookie: owner }), deps));
    expect(screen.body.view).toMatchObject({ enabled: true, reader: { mode: 'MOCK', provider: 'pageReader' }, jobs: [] });

    const url = 'https://supplier.example.com/products/black-oxford-shirt';
    const p = await read(await linkImportHandler(call('POST', '/x/link-import', { cookie: owner, body: { action: 'preview', url } }), deps));
    expect(p.status).toBe(200);
    expect(p.body.preview).toMatchObject({ sourceUrl: url, reader: { mode: 'MOCK' }, draft: { nameEn: 'Black Oxford Shirt' }, facts: { price: null }, method: 'rules', notes: ['ai-off'] });
    const bad = await read(await linkImportHandler(call('POST', '/x/link-import', { cookie: owner, body: { action: 'preview', url: 'ftp://x.example.com/' } }), deps));
    expect([bad.status, bad.body.error]).toEqual([400, 'HOST_NOT_ALLOWED']);
    expect((await read(await linkImportHandler(call('POST', '/x/link-import', { cookie: owner, body: { action: 'draft', jobId: 'nope' } }), deps))).status).toBe(400);

    const made = await read(await linkImportHandler(call('POST', '/x/link-import', { cookie: owner, body: { action: 'draft', jobId: p.body.preview.jobId, edits: { nameEn: 'Black Oxford' } } }), deps));
    expect(made.status).toBe(200);
    const product = await t.prisma.product.findUniqueOrThrow({ where: { id: made.body.draft.productId }, include: { variants: true } });
    expect(product).toMatchObject({ nameEn: 'Black Oxford', status: 'DRAFT', erpStyleCode: null, minPriceMinor: null, publishedAt: null, variants: [] });
    const twice = await read(await linkImportHandler(call('POST', '/x/link-import', { cookie: owner, body: { action: 'draft', jobId: p.body.preview.jobId } }), deps));
    expect([twice.status, twice.body.error]).toEqual([409, 'CONFLICT']);
    expect((await linkImportHandler(call('GET', '/x/link-import', { cookie: looker }), deps)).status).toBe(403);
  });

  it('back in stock: the public form takes a request once; counts for the catalogue, contacts only with catalogue.interest', async () => {
    const p = await t.prisma.product.create({ data: { storeId: A, slug: 'sold-out-sample', nameEn: 'Sold Out Sample', status: 'PUBLISHED', publishedAt: new Date(), inStock: false } });
    const ask = (body: unknown, origin?: string | null) => publicBackInStockHandler(call('POST', '/api/back-in-stock', { body, origin }), deps);
    expect((await ask({ productId: p.id, phone: '01711000000' }, 'https://evil.example.test')).status).toBe(403);
    const first = await read(await ask({ productId: p.id, phone: '01711000000' }));
    expect(first).toEqual({ status: 201, body: { ok: true, created: true } });
    expect(await read(await ask({ productId: p.id, phone: '+880 1711 000000' }))).toEqual({ status: 200, body: { ok: true, created: false } });
    expect((await read(await ask({ productId: p.id }))).body.error).toBe('INVALID_INPUT');
    expect((await publicBackInStockHandler(call('GET', '/api/back-in-stock'), deps)).status).toBe(405);

    const sum = await read(await backInStockHandler(call('GET', '/x/back-in-stock', { cookie: looker }), deps));
    expect(sum.body.summary.items).toEqual([expect.objectContaining({ productId: p.id, waiting: 1, reason: 'soldOut' })]);
    expect(JSON.stringify(sum.body)).not.toContain('1711000000');
    expect((await backInStockRequestsHandler(call('GET', `/x/back-in-stock/requests?productId=${p.id}`, { cookie: looker }), deps)).status).toBe(403);
    const list = await read(await backInStockRequestsHandler(call('GET', `/x/back-in-stock/requests?productId=${p.id}`, { cookie: owner }), deps));
    expect(list.body.requests.items.map((i: { phone: string }) => i.phone)).toEqual(['+8801711000000']);
    const told = await read(await backInStockRequestsHandler(call('POST', '/x/back-in-stock/requests', { cookie: owner, body: { action: 'told', ids: [list.body.requests.items[0].id] } }), deps));
    expect(told.body.result).toEqual({ action: 'told', changed: 1 });
    expect(await t.prisma.backInStockRequest.count()).toBe(1);
  });

  it('the product audit lists what is missing and checks products again within the limit', async () => {
    const r = await read(await productAuditHandler(call('GET', '/x/audit', { cookie: looker }), deps));
    expect(r.status).toBe(200);
    expect(r.body.audit.incomplete).toBeGreaterThanOrEqual(2);
    expect(r.body.audit.items.every((i: { failing: unknown[] }) => i.failing.length > 0)).toBe(true);
    const photos = await read(await productAuditHandler(call('GET', '/x/audit?check=photos&status=draft', { cookie: looker }), deps));
    expect(photos.body.audit.items.every((i: { status: string }) => i.status === 'DRAFT')).toBe(true);
    const bad = await read(await productAuditHandler(call('GET', '/x/audit?check=nope', { cookie: looker }), deps));
    expect([bad.status, bad.body.error]).toEqual([400, 'INVALID_INPUT']);
    expect((await productAuditHandler(call('POST', '/x/audit', { cookie: looker, body: {} }), deps)).status).toBe(405);
  });
});
