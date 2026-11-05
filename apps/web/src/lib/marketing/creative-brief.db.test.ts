// S13 · PR 270 — Marketing › Ad platforms › Creative briefs on a real PostgreSQL: off as shipped (nothing can be written;
// only `marketing.ads.control` sets the switch); a brief is written from the product (its lowest live price, the higher
// compare-at price, its colours, its own page) and the campaign, with what the ads brought back for that product
// (delivered ROAS, @extas/metrics); its words are corrected while a draft; "Send to the studio" and "Set aside" need the
// confirm and happen once; an approved growth-agent "refresh the creative" proposal is written up once, its campaign's
// best delivered product picked first. Nothing is deleted and no price, budget or campaign changes. A throwaway database
// (skipped without TEST_DATABASE_ADMIN_URL). Sample values; no platform is called.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { creativeBriefHandler, type BriefDeps, type BriefsOverview } from './creative-brief';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const T0 = new Date('2026-11-05T08:00:00Z');

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.45', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/ad-platforms/briefs'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Marketing › Ad platforms · creative briefs on PostgreSQL (PR 270)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let desk = '';
  let camp = '';
  let polo = '';
  let tee = '';
  let first = '';
  type Answer = BriefsOverview & { ok: boolean; error?: string; details?: string[]; id?: string; status?: string; cards?: { brief: BriefsOverview['card'] } };
  const api = async (method: string, body?: unknown, cookie = owner, extra: Partial<BriefDeps> = {}) => {
    const res = await creativeBriefHandler(req(method, { body, cookie }), admin, { now: () => T0, ...extra });
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Campaign desk', nameBn: 'ক্যাম্পেইন ডেস্ক', permissions: ['marketing.campaigns.read', 'marketing.campaigns.write'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
    const acc = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act_270', name: 'Sample Meta', currency: 'BDT' } });
    camp = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: acc.id, externalId: '270-a', name: 'Sample polo push', status: 'ACTIVE', dailyBudgetMinor: 100_000, currency: 'BDT' } })).id;
    await t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId: acc.id, adCampaignId: camp, date: new Date('2026-11-02T00:00:00Z'), platform: 'META', spendMinor: 50_000, currency: 'BDT' } });
    const colour = (key: string, nameEn: string, nameBn: string) => t.prisma.colour.create({ data: { storeId: S, key: `s270-${key}`, nameEn, nameBn, hex: '#123456' } });
    const navy = await colour('navy', 'Sample navy', 'নমুনা নেভি');
    const sky = await colour('sky', 'Sample sky', 'নমুনা আকাশি');
    polo = (await t.prisma.product.create({ data: { storeId: S, slug: 's270-polo', nameEn: 'Sample polo', nameBn: 'নমুনা পোলো' } })).id;
    tee = (await t.prisma.product.create({ data: { storeId: S, slug: 's270-tee', nameEn: 'Sample tee' } })).id;
    for (const [i, c] of [navy, sky].entries()) await t.prisma.productColour.create({ data: { storeId: S, productId: polo, colourId: c.id, sortOrder: i } });
    await t.prisma.productVariant.create({ data: { storeId: S, productId: polo, sku: 'S270-P-1', priceMinor: 120_000, compareAtMinor: 150_000, active: true } });
    await t.prisma.productVariant.create({ data: { storeId: S, productId: polo, sku: 'S270-P-2', priceMinor: 90_000, compareAtMinor: 110_000 } });
    await t.prisma.productVariant.create({ data: { storeId: S, productId: tee, sku: 'S270-T-1', priceMinor: 50_000, compareAtMinor: 50_000 } });
    // one delivered order from the campaign: two polos
    const order = await t.prisma.order.create({ data: { storeId: S, number: 'B270-1', source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date('2026-11-01T06:00:00Z'), deliveredAt: new Date('2026-11-03T06:00:00Z'), subtotalMinor: 180_000, deliveryChargeMinor: 0, totalMinor: 180_000, paymentMethod: 'COD', adCampaignId: camp, idempotencyKey: 'b270-1' } });
    await t.prisma.orderItem.create({ data: { storeId: S, orderId: order.id, productId: polo, sku: 'S270-P-2', productName: 'Sample polo', quantity: 2, unitPriceMinor: 90_000, lineTotalMinor: 180_000 } });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('off as shipped: nothing can be written; only "control ads" switches it on', async () => {
    const g = await api('GET', undefined, desk);
    expect(g.a.card.value).toMatchObject({ on: false, carouselCards: 4, optimiseFor: 'deliveredPurchase' });
    expect(g.a.products.map((p) => p.name)).toEqual(expect.arrayContaining(['Sample polo', 'Sample tee']));
    expect((await api('POST', { action: 'create', productId: polo }, desk)).a.error).toBe('OFF');
    expect((await api('PUT', { key: 'brief', value: { ...g.a.card.value, on: true }, version: g.a.card.version }, desk)).status).toBe(403);
    const bad = await api('PUT', { key: 'brief', value: { ...g.a.card.value, on: true, videoMinSeconds: 20, videoMaxSeconds: 10 }, version: g.a.card.version });
    expect(bad.status).toBe(400);
    const set = await api('PUT', { key: 'brief', value: { ...g.a.card.value, on: true }, version: g.a.card.version });
    expect(set.a.cards!.brief.value.on).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.brief.settings' } })).toBe(1);
  });

  it('writes a brief from the product and the campaign, with what the ads brought back', async () => {
    const r = await api('POST', { action: 'create', productId: polo, adCampaignId: camp }, desk);
    expect(r.status).toBe(200);
    first = r.a.id!;
    const row = await t.prisma.creativeBrief.findUniqueOrThrow({ where: { id: first } });
    expect(row.status).toBe('DRAFT');
    expect(row.answers).toMatchObject({
      kind: 'ad',
      productId: polo,
      adCampaignId: camp,
      priceMinor: 120_000,
      wasMinor: 150_000,
      colours: { en: ['Sample navy', 'Sample sky'], bn: ['নমুনা নেভি', 'নমুনা আকাশি'] },
      landingPath: '/p/s270-polo',
      optimiseFor: 'deliveredPurchase',
      figures: { delivered: 1, deliveredSalesMinor: 180_000, roasPercent: 360 },
    });
    const a = row.answers as { hooks: { en: string; bn: string }; formats: unknown[] };
    expect(a.hooks.en).toContain('Sample polo');
    expect(a.hooks.bn).toContain('নমুনা পোলো');
    expect(a.formats).toHaveLength(3);
    // a product not live yet takes its cheapest variant; a compare-at price not higher is no "was" price
    const tr = await api('POST', { action: 'create', productId: tee }, desk);
    expect(await t.prisma.creativeBrief.findUniqueOrThrow({ where: { id: tr.a.id! } }).then((b) => b.answers)).toMatchObject({ priceMinor: 50_000, wasMinor: null, adCampaignId: null, figures: null });
    expect((await api('POST', { action: 'create', productId: '00000000-0000-7000-8000-000000000270' }, desk)).status).toBe(404);
    const g = await api('GET', undefined, desk);
    expect(g.a.briefs.map((b) => [b.product, b.campaign])).toEqual([
      ['Sample tee', null],
      ['Sample polo', 'Sample polo push'],
    ]);
  });

  it('corrects the words while a draft, then sends it once, after the confirm', async () => {
    expect((await api('POST', { action: 'edit', id: first, hooks: { bn: '  দুটো পোলো, এক দামে  ' }, show: {} }, desk)).status).toBe(200);
    const row = await t.prisma.creativeBrief.findUniqueOrThrow({ where: { id: first } });
    expect((row.answers as { hooks: { bn: string; en: string } }).hooks.bn).toBe('দুটো পোলো, এক দামে');
    expect((await api('POST', { action: 'send', id: first }, desk)).a.details).toEqual(['confirm']);
    expect((await api('POST', { action: 'send', id: first, confirm: true }, desk)).a.status).toBe('SENT');
    expect((await api('POST', { action: 'send', id: first, confirm: true }, desk)).a.error).toBe('DECIDED');
    expect((await api('POST', { action: 'edit', id: first, hooks: { en: 'late' }, show: {} }, desk)).a.error).toBe('DECIDED');
    const sent = await t.prisma.creativeBrief.findUniqueOrThrow({ where: { id: first } });
    expect((sent.answers as { sentAt?: string }).sentAt).toBe(T0.toISOString());
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['marketing.brief.create', 'marketing.brief.edit', 'marketing.brief.send'] } } })).toBe(4);
  });

  it('an approved creative refresh is written up once, its campaign’s best product first; a waiting one is not', async () => {
    const ask = (status: 'APPROVED' | 'PENDING', type = 'refreshCreative') => t.prisma.aiApprovalRequest.create({ data: { storeId: S, agentKey: 'tirondaj', kind: 'ads.growth.proposal', title: 'Growth agent · sample', payload: { type, refId: camp }, refType: 'AdCampaign', refId: camp, channel: 'admin', status, decidedAt: T0 } });
    const ok = await ask('APPROVED');
    const waiting = await ask('PENDING');
    const budget = await ask('APPROVED', 'raiseBudget');
    const g = await api('GET', undefined, desk);
    expect(g.a.refreshes).toEqual([expect.objectContaining({ proposalId: ok.id, adCampaignId: camp, campaign: 'Sample polo push', productId: polo })]);
    expect((await api('POST', { action: 'create', productId: polo, proposalId: waiting.id }, desk)).status).toBe(404);
    expect((await api('POST', { action: 'create', productId: polo, proposalId: budget.id }, desk)).status).toBe(404);
    const made = await api('POST', { action: 'create', productId: polo, proposalId: ok.id }, desk);
    expect(made.status).toBe(200);
    expect(await t.prisma.creativeBrief.findUniqueOrThrow({ where: { id: made.a.id! } }).then((b) => b.answers)).toMatchObject({ adCampaignId: camp, proposalId: ok.id });
    expect((await api('POST', { action: 'create', productId: tee, proposalId: ok.id }, desk)).a.error).toBe('TAKEN');
    expect((await api('GET', undefined, desk)).a.refreshes).toEqual([]);
  });

  it('set aside after the confirm; nothing deleted, no price or budget changed', async () => {
    const g = await api('GET', undefined, desk);
    const draft = g.a.briefs.find((b) => b.status === 'DRAFT')!;
    expect((await api('POST', { action: 'setAside', id: draft.id, confirm: true }, desk)).a.status).toBe('SET_ASIDE');
    expect(await t.prisma.creativeBrief.count()).toBe(3);
    expect((await t.prisma.productVariant.findMany({ where: { productId: polo }, orderBy: { sku: 'asc' } })).map((v) => v.priceMinor)).toEqual([120_000, 90_000]);
    expect((await t.prisma.adCampaign.findUniqueOrThrow({ where: { id: camp } })).dailyBudgetMinor).toBe(100_000);
  });
});
