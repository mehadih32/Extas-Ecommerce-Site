// S01 · PR 27, 28, 32, 34, 38 — the admin API for size charts, collections and tags, the CSV and the "was" price, end to
// end on a real PostgreSQL (a throwaway database; skipped without TEST_DATABASE_ADMIN_URL): login, same-site check,
// error codes, a chart from creation to a product's choice, a collection, the CSV file round trip and the "was" price.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { categoriesHandler, garmentTypesHandler, productsHandler, sizesHandler, variantsHandler } from './catalogue-api';
import {
  collectionProductsHandler,
  collectionsHandler,
  csvExportHandler,
  csvImportHandler,
  productTagsHandler,
  sizeChartAssignHandler,
  sizeChartCopyHandler,
  sizeChartHandler,
  sizeChartResolveHandler,
  sizeChartsHandler,
  sizeChartUnassignHandler,
  tagsHandler,
  wasPriceHandler,
  wasPriceResolveHandler,
} from './catalogue-merch-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = {
    host: HOST,
    'user-agent': 'SampleBrowser/1.0',
    'x-forwarded-for': '192.0.2.41',
  };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');
async function read(res: Response) {
  return {
    status: res.status,
    body: (await res.json()) as Record<string, any>,
  };
}

describe.skipIf(!HAS_TEST_DB)('size charts, collections, CSV and "was" price admin API on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('catalogue_merch_api');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), {
      email: 'owner@example.com',
      displayName: 'Sample owner',
      password: OWNER_PW,
      passwordChosenByOwner: true,
    });
    deps = {
      db: t.prisma,
      resolver: new SettingsResolver(prismaBackend(t.prisma), registry),
      vault: null,
    };
    owner = cookiesOf(
      await loginHandler(
        call('POST', '/api/admin/auth/login', {
          body: { email: 'owner@example.com', password: OWNER_PW },
        }),
        deps,
      ),
    );
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a login, a database, a same-site request and the right method', async () => {
    expect((await sizeChartsHandler(call('GET', '/api/admin/catalogue/size-charts'), deps)).status).toBe(401);
    expect((await sizeChartsHandler(call('GET', '/api/admin/catalogue/size-charts', { cookie: owner }), null)).status).toBe(503);
    expect(
      (
        await sizeChartsHandler(
          call('POST', '/api/admin/catalogue/size-charts', {
            cookie: owner,
            origin: 'https://evil.example.test',
            body: {},
          }),
          deps,
        )
      ).status,
    ).toBe(403);
    expect((await csvImportHandler(call('GET', '/api/admin/catalogue/csv/import', { cookie: owner }), deps)).status).toBe(405);
    expect(
      (
        await sizeChartHandler(
          call('GET', '/api/admin/catalogue/size-charts/x', {
            cookie: owner,
          }),
          deps,
          'x',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await wasPriceResolveHandler(
          call('GET', '/api/admin/catalogue/was-price/resolve', {
            cookie: owner,
          }),
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it('a chart from creation to the chart a product gets; a collection and tags; the CSV round trip; the "was" price', async () => {
    const post = (h: (r: Request, d: AdminDeps | null) => Promise<Response>, path: string, b: unknown) =>
      h(call('POST', path, { cookie: owner, body: b }), deps).then(read);
    const gt = await post(garmentTypesHandler, '/api/admin/catalogue/garment-types', {
      nameEn: 'Polo',
      nameBn: 'পোলো',
      measurementFields: [{ key: 'chest', labelEn: 'Chest', labelBn: 'বুক', unit: 'inch' }],
    });
    const s = await post(sizesHandler, '/api/admin/catalogue/sizes', {
      label: 'M',
    });
    const c = await post(categoriesHandler, '/api/admin/catalogue/categories', { nameEn: 'Polos', garmentTypeId: gt.body.created.id });
    const p = await post(productsHandler, '/api/admin/catalogue/products', {
      nameEn: 'Classic Polo',
      categoryId: c.body.created.id,
      slug: 'classic-polo',
    });
    await post(variantsHandler, '/api/admin/catalogue/variants', {
      sku: 'SMP-1-M',
      productId: p.body.created.id,
      sizeId: s.body.created.id,
      priceMinor: 120000,
    });

    const list0 = await read(await sizeChartsHandler(call('GET', '/api/admin/catalogue/size-charts', { cookie: owner }), deps));
    expect(list0.body.sizeCharts).toEqual([]);
    expect(list0.body.options.fits.map((f: { key: string }) => f.key)).toEqual(expect.arrayContaining(['regular', 'slim']));

    const chart = await post(sizeChartsHandler, '/api/admin/catalogue/size-charts', {
      name: 'Polo regular',
      garmentTypeId: gt.body.created.id,
      fitKey: 'regular',
      rows: [{ size: 'm', values: [40] }],
    });
    expect(chart.status).toBe(201);
    const bad = await post(sizeChartsHandler, '/api/admin/catalogue/size-charts', {
      name: 'Bad',
      garmentTypeId: gt.body.created.id,
      fitKey: 'nope',
      rows: [{ size: 'm', values: [40] }],
    });
    expect([bad.status, bad.body.error]).toEqual([400, 'UNKNOWN_KEY']);
    const id = chart.body.created.id as string;
    const assigned = await post(sizeChartAssignHandler, '/api/admin/catalogue/size-charts/assign', { sizeChartId: id, categoryId: c.body.created.id });
    expect(assigned.status).toBe(200);
    const resolved = await read(
      await sizeChartResolveHandler(call('GET', `/api/admin/catalogue/size-charts/resolve?productId=${p.body.created.id}`, { cookie: owner }), deps),
    );
    expect(resolved.body.resolution.chart.name).toBe('Polo regular');
    const copy = await read(
      await sizeChartCopyHandler(
        call('POST', `/api/admin/catalogue/size-charts/${id}/copy`, {
          cookie: owner,
          body: { name: 'Classic own', productId: p.body.created.id },
        }),
        deps,
        id,
      ),
    );
    expect(copy.status).toBe(201);
    const inUse = await read(
      await sizeChartHandler(
        call('PATCH', `/api/admin/catalogue/size-charts/${id}`, {
          cookie: owner,
          body: { archived: true },
        }),
        deps,
        id,
      ),
    );
    expect([inUse.status, inUse.body.error]).toEqual([409, 'CHART_IN_USE']);
    const auto = await post(sizeChartUnassignHandler, '/api/admin/catalogue/size-charts/unassign', { productId: p.body.created.id });
    expect(auto.body).toEqual({ ok: true, removed: 1 });

    const tag = await post(tagsHandler, '/api/admin/catalogue/tags', {
      slug: 'eid',
      name: 'Eid',
    });
    const pid = p.body.created.id as string;
    const tags = await read(
      await productTagsHandler(
        call('PUT', `/api/admin/catalogue/products/${pid}/tags`, {
          cookie: owner,
          body: { tagIds: [tag.body.created.id] },
        }),
        deps,
        pid,
      ),
    );
    expect(tags.body.tags.map((x: { slug: string }) => x.slug)).toEqual(['eid']);
    const col = await post(collectionsHandler, '/api/admin/catalogue/collections', {
      slug: 'eid-edit',
      nameEn: 'Eid edit',
      kind: 'SEASONAL',
      season: 'eid',
    });
    expect(col.body.created.path).toBe('/collections/eid-edit');
    const colId = col.body.created.id as string;
    const filled = await read(
      await collectionProductsHandler(
        call('PUT', `/api/admin/catalogue/collections/${colId}/products`, {
          cookie: owner,
          body: { productIds: [pid] },
        }),
        deps,
        colId,
      ),
    );
    expect(filled.body.item.items.map((i: { slug: string }) => i.slug)).toEqual(['classic-polo']);

    const file = await csvExportHandler(call('GET', '/api/admin/catalogue/csv/export', { cookie: owner }), deps);
    expect(file.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(file.headers.get('content-disposition')).toMatch(/^attachment; filename="catalogue-\d{4}-\d{2}-\d{2}\.csv"$/);
    const csv = await file.text();
    expect(csv).toContain('SMP-1-M');
    expect(csv).toContain('eid-edit');
    const edited = csv.replace('Classic Polo', 'Classic Polo Shirt');
    const preview = await post(csvImportHandler, '/api/admin/catalogue/csv/import', { action: 'preview', csv: edited });
    expect(preview.body.preview.totals).toMatchObject({
      rows: 1,
      update: 1,
      error: 0,
    });
    const noHash = await post(csvImportHandler, '/api/admin/catalogue/csv/import', { action: 'apply', csv: edited });
    expect(noHash.status).toBe(400);
    const applied = await post(csvImportHandler, '/api/admin/catalogue/csv/import', { action: 'apply', csv: edited, hash: preview.body.preview.hash });
    expect(applied.body.result).toMatchObject({ applied: 1, failed: [] });
    const stale = await post(csvImportHandler, '/api/admin/catalogue/csv/import', { action: 'apply', csv: edited, hash: preview.body.preview.hash });
    expect([stale.status, stale.body.error]).toEqual([409, 'PREVIEW_CHANGED']);

    const sources = await read(await wasPriceHandler(call('GET', '/api/admin/catalogue/was-price', { cookie: owner }), deps));
    expect(sources.body.store).toBeNull();
    const set = await read(
      await wasPriceHandler(
        call('PUT', '/api/admin/catalogue/was-price', {
          cookie: owner,
          body: { categoryId: c.body.created.id, source: 'MRP' },
        }),
        deps,
      ),
    );
    expect(set.body.choice).toMatchObject({
      source: 'MRP',
      from: 'category',
    });
    const was = await read(await wasPriceResolveHandler(call('GET', `/api/admin/catalogue/was-price/resolve?productId=${pid}`, { cookie: owner }), deps));
    expect(was.body.product.variants[0]).toMatchObject({
      sku: 'SMP-1-M',
      wasMinor: null,
      reason: 'NO_MRP',
    });

    const other = await read(
      await sizeChartHandler(
        call('GET', `/api/admin/catalogue/size-charts/${id}?storeId=2`, {
          cookie: owner,
        }),
        deps,
        id,
      ),
    );
    expect([other.status, other.body.error]).toEqual([404, 'NOT_FOUND']);
  });
});
