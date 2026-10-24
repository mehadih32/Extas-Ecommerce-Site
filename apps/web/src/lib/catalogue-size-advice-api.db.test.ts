// S02 · PR 59 — the size report and the ease model through their admin API, end to end on a real PostgreSQL (a
// throwaway database; skipped without TEST_DATABASE_ADMIN_URL): the login, the same-site check, the methods, the
// report of recorded answers, a trained version that arrives switched off, and switching one on.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, reviewSettings, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { categoriesHandler, garmentTypesHandler, productsHandler, sizesHandler, variantsHandler } from './catalogue-api';
import { sizeChartAssignHandler, sizeChartsHandler } from './catalogue-merch-api';
import { sizeAdviceHandler, sizeReportHandler } from './catalogue-size-advice-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.41' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
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
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, any> });

describe.skipIf(!HAS_TEST_DB)('the Find My Size size report and ease model admin API on PostgreSQL (PR 59)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let storeId = 0;
  let productId = '';
  let sizeL = '';
  let sizeXl = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('catalogue_size_advice_api');
    [storeId] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));

    const post = (h: (r: Request, d: AdminDeps | null) => Promise<Response>, path: string, b: unknown) => h(call('POST', path, { cookie: owner, body: b }), deps).then(read);
    const gt = await post(garmentTypesHandler, '/api/admin/catalogue/garment-types', {
      nameEn: 'Polo',
      nameBn: 'পোলো',
      measurementFields: [{ key: 'chest', labelEn: 'Chest', labelBn: 'বুক', unit: 'inch' }],
    });
    const l = await post(sizesHandler, '/api/admin/catalogue/sizes', { label: 'L', sortOrder: 30 });
    const xl = await post(sizesHandler, '/api/admin/catalogue/sizes', { label: 'XL', sortOrder: 40 });
    sizeL = l.body.created.id;
    sizeXl = xl.body.created.id;
    const cat = await post(categoriesHandler, '/api/admin/catalogue/categories', { nameEn: 'Polos', garmentTypeId: gt.body.created.id });
    const p = await post(productsHandler, '/api/admin/catalogue/products', { nameEn: 'Classic Polo', categoryId: cat.body.created.id, slug: 'classic-polo' });
    productId = p.body.created.id;
    for (const [sku, sizeId] of [
      ['CP-L', sizeL],
      ['CP-XL', sizeXl],
    ])
      await post(variantsHandler, '/api/admin/catalogue/variants', { sku, productId, sizeId, priceMinor: 85000 });
    const chart = await post(sizeChartsHandler, '/api/admin/catalogue/size-charts', {
      name: 'Polo regular',
      garmentTypeId: gt.body.created.id,
      fitKey: 'regular',
      easeInch: 2,
      rows: [
        { size: 'l', values: [42] },
        { size: 'xl', values: [44] },
      ],
    });
    await post(sizeChartAssignHandler, '/api/admin/catalogue/size-charts/assign', { sizeChartId: chart.body.created.id, categoryId: cat.body.created.id });
    // five recorded answers: four shoppers took one size up from what the chart said (PR 58 writes these rows)
    for (let i = 0; i < 5; i++) {
      await t.prisma.sizeRecommendation.create({
        data: { storeId, productId, heightCm: 170, weightKg: 72, recommendedSizeId: sizeL, chosenSizeId: i < 4 ? sizeXl : sizeL, reasoning: { engine: 'rules', ease: 2 } },
      });
    }
    const base = reviewSettings['catalogue.sizeAdvice'].default;
    await deps.resolver.set('catalogue.sizeAdvice', { ...base, report: { ...base.report, minAnswers: 5 } }, storeTarget(storeId));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a login, a database, a same-site request, the right method and a known path', async () => {
    expect((await sizeReportHandler(call('GET', '/api/admin/catalogue/size-report'), deps)).status).toBe(401);
    expect((await sizeReportHandler(call('GET', '/api/admin/catalogue/size-report', { cookie: owner }), null)).status).toBe(503);
    expect((await sizeReportHandler(call('POST', '/api/admin/catalogue/size-report', { cookie: owner, body: {} }), deps)).status).toBe(405);
    expect((await sizeReportHandler(call('POST', '/api/admin/catalogue/size-report/link', { cookie: owner, origin: 'https://evil.example.test', body: {} }), deps, ['link'])).status).toBe(403);
    expect((await sizeReportHandler(call('GET', '/api/admin/catalogue/size-report?days=zero', { cookie: owner }), deps)).status).toBe(400);
    expect((await sizeAdviceHandler(call('POST', '/api/admin/catalogue/size-advice', { cookie: owner, body: {} }), deps)).status).toBe(405);
    expect((await sizeAdviceHandler(call('POST', '/api/admin/catalogue/size-advice/not-a-uuid/active', { cookie: owner, body: { active: true } }), deps, ['not-a-uuid', 'active'])).status).toBe(404);
  });

  it('the report reads the recorded answers; a version is trained switched off and then switched on', async () => {
    const report = await read(await sizeReportHandler(call('GET', '/api/admin/catalogue/size-report', { cookie: owner }), deps));
    expect(report.status).toBe(200);
    expect(report.body.report.answers).toBe(5);
    expect(report.body.report.useTrainedEase).toBe(false);
    const group = report.body.report.groups[0];
    expect(group.stats).toMatchObject({ signals: 5, tight: 4, right: 1, flag: 'tight' });
    expect(group.proposal).toMatchObject({ enough: true, verdict: 'tight' });
    expect(report.body.report.products[0]).toMatchObject({ productId });

    // the link pass runs and says what it looked at (nothing to link here: no orders in this test)
    const linked = await read(await sizeReportHandler(call('POST', '/api/admin/catalogue/size-report/link', { cookie: owner, body: {} }), deps, ['link']));
    expect(linked.body.result).toMatchObject({ linked: 0, ambiguous: 0 });

    const trained = await read(await sizeAdviceHandler(call('POST', '/api/admin/catalogue/size-advice/train', { cookie: owner, body: {} }), deps, ['train']));
    expect(trained.status).toBe(200);
    const version = trained.body.result.trained[0];
    expect(version).toMatchObject({ version: 1, isActive: false, baseEaseInch: 2, verdict: 'tight' });
    expect(version.easeInch).toBeGreaterThan(2);

    const bad = await sizeAdviceHandler(call('POST', `/api/admin/catalogue/size-advice/${version.id}/active`, { cookie: owner, body: {} }), deps, [version.id, 'active']);
    expect(bad.status).toBe(400);
    const on = await read(await sizeAdviceHandler(call('POST', `/api/admin/catalogue/size-advice/${version.id}/active`, { cookie: owner, body: { active: true } }), deps, [version.id, 'active']));
    expect(on.body.model).toMatchObject({ isActive: true, garmentTypeKey: 'polo' });
    const list = await read(await sizeAdviceHandler(call('GET', '/api/admin/catalogue/size-advice', { cookie: owner }), deps));
    expect(list.body.models.filter((m: { isActive: boolean }) => m.isActive)).toHaveLength(1);
  });
});
