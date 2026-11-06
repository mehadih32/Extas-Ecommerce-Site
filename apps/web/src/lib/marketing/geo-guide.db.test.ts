// S13 · PR 569 — Marketing › Where to advertise on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): districts
// by settled orders with their return rate; off → no words; on → more / hold / less / too few and the lines to copy;
// Sales only with `books.read`; a category narrows it; the card needs `marketing.campaigns.write`, is audited, refuses
// "more" not below "less"; nothing else in the shop changes. Signed out 401. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, hashPassword, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { geoGuideHandler } from './geo-guide';

const HOST = 'admin.example.test';
const PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.69' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('Marketing › Where to advertise on PostgreSQL (PR 569)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const S = MOTHER_STORE_ID;
  const now = new Date('2026-11-06T06:00:00Z');
  const areas: Record<string, string> = {};
  let shirts = '';
  let n = 0;
  const geo = async (method: string, body?: unknown, q = '', cookie = owner) => {
    const r = await geoGuideHandler(call(method, `/api/admin/marketing/geo-guide${q}`, cookie, body), deps);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  async function orders(area: string, delivered: number, returned: number, product: string | null = null) {
    for (const [status, k] of [['DELIVERED', delivered], ['RETURNED', returned]] as const)
      for (let i = 0; i < k; i += 1) {
        n += 1;
        const at = new Date(now.getTime() - (5 + (n % 20)) * 86_400_000);
        const o = await t.prisma.order.create({
          data: { storeId: S, number: `G569-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: at, deliveredAt: status === 'DELIVERED' ? at : null, returnedAt: status === 'RETURNED' ? at : null, areaId: areas[area]!, subtotalMinor: 100_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 100_000, paymentMethod: 'COD', idempotencyKey: `g569-${n}` },
        });
        await t.prisma.orderItem.create({ data: { storeId: S, orderId: o.id, productId: product, sku: `SKU-569-${n}`, productName: 'Sample', quantity: 1, unitPriceMinor: 100_000, lineTotalMinor: 100_000, status: 'ACTIVE' } });
      }
  }

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('geo-guide');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: PW }), deps));
    const role = await createRole(t.prisma, SYSTEM, { key: 'geo-reader', nameEn: 'geo-reader', nameBn: 'geo-reader', permissions: ['marketing.campaigns.read'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'reader@example.com', displayName: 'Sample reader', passwordHash: await hashPassword(PW), passwordSetAt: new Date() } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    reader = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'reader@example.com', password: PW }), deps));

    const div = await t.prisma.geoArea.create({ data: { level: 'DIVISION', nameEn: 'Sample division', code: 'test.div', ancestorIds: [], aliases: [], postcodes: [] } });
    for (const [k, en, bn] of [['dhaka', 'Sample Dhaka', 'নমুনা ঢাকা'], ['bogura', 'Sample Bogura', null], ['sylhet', 'Sample Sylhet', null], ['ctg', 'Sample Chattogram', null]] as const)
      areas[k] = (await t.prisma.geoArea.create({ data: { level: 'DISTRICT', nameEn: en, nameBn: bn, code: `test.${k}`, parentId: div.id, ancestorIds: [div.id], aliases: [], postcodes: [] } })).id;
    const cat = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-shirts-569', nameEn: 'Sample shirts' } });
    shirts = cat.id;
    const shirt = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-shirt-569', nameEn: 'Sample shirt', categoryId: cat.id } })).id;
    await orders('dhaka', 12, 1, shirt); // 8 % → more
    await orders('bogura', 7, 3); // 30 % → less
    await orders('sylhet', 8, 2); // 20 % → hold
    await orders('ctg', 3, 0); // too few
  });
  afterAll(async () => t?.drop());

  it('shows each district’s outcome, without words while off; Sales only with books.read; signed out 401', async () => {
    expect((await geo('GET', undefined, '', '')).status).toBe(401);
    const s = (await geo('GET')).j.screen;
    expect(s.rows.map((r: any) => [r.nameEn, r.delivered, r.returned, r.returnPct, r.word])).toEqual([
      ['Sample Dhaka', 12, 1, 8, null],
      ['Sample Bogura', 7, 3, 30, null],
      ['Sample Sylhet', 8, 2, 20, null],
      ['Sample Chattogram', 3, 0, 0, null],
    ]);
    expect(s.rows[0].salesMinor).toBe(1_200_000);
    expect(s.copy.more.en).toBe('');
    const r = (await geo('GET', undefined, '', reader)).j.screen;
    expect(r.rows[0].salesMinor).toBeNull();
  });

  it('only marketing.campaigns.write saves the card; it is audited; "more" must stay below "less"', async () => {
    expect((await geo('PUT', { key: 'ads.geoGuide', on: true, values: {} }, '', reader)).status).toBe(403);
    const bad = await geo('PUT', { key: 'ads.geoGuide', on: true, values: { goodReturnPct: 40 } });
    expect(bad.status).toBe(400);
    expect(bad.j.details).toContain('badReturnPct');
    expect((await geo('PUT', { key: 'ads.geoGuide', on: true, values: {} })).status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'ads.geoGuide.settings' } })).toBe(1);
  });

  it('gives each district its word and the lines to copy (Bengali names where known); a category narrows it', async () => {
    const s = (await geo('GET')).j.screen;
    expect(s.rows.map((r: any) => r.word)).toEqual(['more', 'less', 'hold', 'few']);
    expect(s.counts).toEqual({ more: 1, hold: 1, less: 1, few: 1 });
    expect(s.copy).toEqual({ more: { en: 'Sample Dhaka', bn: 'নমুনা ঢাকা' }, less: { en: 'Sample Bogura', bn: 'Sample Bogura' } });
    const c = (await geo('GET', undefined, `?category=${shirts}`)).j.screen;
    expect(c.categoryId).toBe(shirts);
    expect(c.rows.map((r: any) => r.nameEn)).toEqual(['Sample Dhaka']);
    // a made-up category is ignored
    expect((await geo('GET', undefined, '?category=not-a-category')).j.screen.categoryId).toBeNull();
  });
});
