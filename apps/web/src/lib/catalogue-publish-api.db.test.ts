// PR 21, 26, 29, 35 — the product admin's own routes end to end on a real PostgreSQL (a throwaway database; skipped
// without TEST_DATABASE_ADMIN_URL): sign-in and same-site checks, the checklist, publish refused until it passes, the
// edit form's save (answering with the product, its names and the checklist), bulk actions and the queue.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { coloursHandler, productsHandler, sizesHandler } from './catalogue-api';
import { productFormHandler, productPublishHandler, productReadinessHandler, productsBulkHandler, publishQueueHandler } from './catalogue-publish-api';

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

describe.skipIf(!HAS_TEST_DB)('product admin API (PR 21, 26, 29, 35) on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let id = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('publish_api');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const p = await read(await productsHandler(call('POST', '/api/admin/catalogue/products', { cookie: owner, body: { nameEn: 'Sample Polo' } }), deps));
    id = p.body.created.id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a login, a same-site request, a real id and the right method', async () => {
    expect((await productReadinessHandler(call('GET', `/x/${id}/readiness`), deps, id)).status).toBe(401);
    expect((await productPublishHandler(call('POST', `/x/${id}/publish`, { cookie: owner, origin: 'https://evil.example.test', body: { action: 'publish' } }), deps, id)).status).toBe(403);
    expect((await productReadinessHandler(call('GET', '/x/nope/readiness', { cookie: owner }), deps, 'nope')).status).toBe(400);
    expect((await productReadinessHandler(call('POST', `/x/${id}/readiness`, { cookie: owner, body: {} }), deps, id)).status).toBe(405);
    expect((await productsBulkHandler(call('GET', '/x/bulk', { cookie: owner }), deps)).status).toBe(405);
    const bad = await read(await productPublishHandler(call('POST', `/x/${id}/publish`, { cookie: owner, body: { action: 'launch' } }), deps, id));
    expect([bad.status, bad.body.error]).toEqual([400, 'INVALID_INPUT']);
  });

  it('a half-done product is refused with the checks it misses; the form saves in order and answers with its names', async () => {
    const r = await read(await productReadinessHandler(call('GET', `/x/${id}/readiness`, { cookie: owner }), deps, id));
    expect(r.body.readiness.ready).toBe(false);
    expect(r.body.readiness.blocking).toEqual(expect.arrayContaining(['category', 'variants', 'photos', 'fabric']));

    const refused = await read(await productPublishHandler(call('POST', `/x/${id}/publish`, { cookie: owner, body: { action: 'publish' } }), deps, id));
    expect([refused.status, refused.body.error]).toEqual([409, 'CHECKLIST_FAILED']);
    expect(refused.body.details).toEqual(r.body.readiness.blocking);

    const navy = await read(await coloursHandler(call('POST', '/x/colours', { cookie: owner, body: { nameEn: 'Navy', hex: '#1b2a4a' } }), deps));
    const m = await read(await sizesHandler(call('POST', '/x/sizes', { cookie: owner, body: { label: 'M' } }), deps));
    const colourId = navy.body.created.colour.id as string;
    const sizeId = m.body.created.id as string;
    const saved = await read(
      await productFormHandler(
        call('POST', `/x/${id}/form`, {
          cookie: owner,
          body: { product: { descriptionEn: 'A sample polo.' }, naming: { seoTitleEn: 'Sample Polo for tests' }, colours: [colourId], create: [{ sku: 'SMP-9-NV-M', colourId, sizeId, priceMinor: 99000 }] },
        }),
        deps,
        id,
      ),
    );
    expect(saved.status).toBe(200);
    expect(saved.body.saved).toEqual(['product', 'naming', 'colours', 'create']);
    expect(saved.body.product.variants.map((v: { sku: string }) => v.sku)).toEqual(['SMP-9-NV-M']);
    expect(saved.body.naming.seoTitle.en).toMatchObject({ value: 'Sample Polo for tests', source: 'own' });
    expect(saved.body.readiness.checks.find((c: { key: string }) => c.key === 'variants').ok).toBe(true);

    const stopped = await read(await productFormHandler(call('POST', `/x/${id}/form`, { cookie: owner, body: { product: { careEn: 'Cold wash.' }, create: [{ sku: 'SMP-9-NV-M', colourId, sizeId }] } }), deps, id));
    expect([stopped.status, stopped.body.error]).toEqual([409, 'SKU_TAKEN']);
    expect(stopped.body.details).toEqual(expect.arrayContaining(['step:create', 'saved:product']));
  });

  it('bulk actions run per product and the queue lists what waits', async () => {
    const recheck = await read(await productsBulkHandler(call('POST', '/x/bulk', { cookie: owner, body: { action: 'recheck', productIds: [id] } }), deps));
    expect(recheck.body.bulk).toMatchObject({ action: 'recheck', done: 1, failed: 0 });
    const pub = await read(await productsBulkHandler(call('POST', '/x/bulk', { cookie: owner, body: { action: 'publish', productIds: [id] } }), deps));
    expect(pub.body.bulk.results[0]).toMatchObject({ ok: false, error: 'CHECKLIST_FAILED' });
    const dup = await read(await productsBulkHandler(call('POST', '/x/bulk', { cookie: owner, body: { action: 'archive', productIds: [id, id] } }), deps));
    expect([dup.status, dup.body.error]).toEqual([400, 'INVALID_INPUT']);

    const q = await read(await publishQueueHandler(call('GET', '/x/publish-queue?filter=waiting', { cookie: owner }), deps));
    expect(q.body.queue.items.map((i: { productId: string }) => i.productId)).toEqual([id]);
    expect(q.body.queue.counts).toMatchObject({ all: 1, ready: 0, waiting: 1, live: 0 });
    const badFilter = await read(await publishQueueHandler(call('GET', '/x/publish-queue?filter=soon', { cookie: owner }), deps));
    expect([badFilter.status, badFilter.body.error]).toEqual([400, 'INVALID_INPUT']);

    const archived = await read(await productsBulkHandler(call('POST', '/x/bulk', { cookie: owner, body: { action: 'archive', productIds: [id] } }), deps));
    expect(archived.body.bulk).toMatchObject({ done: 1 });
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id } })).archivedAt).not.toBeNull();
    const restored = await read(await productsBulkHandler(call('POST', '/x/bulk', { cookie: owner, body: { action: 'restore', productIds: [id] } }), deps));
    expect(restored.body.bulk).toMatchObject({ done: 1 });
  });
});
