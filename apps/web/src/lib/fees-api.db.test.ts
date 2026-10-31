// S16 · PR 345 — Money → Costs & fees on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): everything ships
// empty; gateway fees and packaging are kept as versioned store settings (a stale version is refused) and audited; a USD
// rate is a new row from now, the old one stays; a courier rate is added and ended (never deleted), never twice; a
// reader sees, never writes. The fee arithmetic: a share plus a fixed amount, unknown is null (never 0). Every value is
// made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { gatewayFeeMinor, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { feesRoute, rateText, type FeesView } from './fees-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.75' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe('costs & fees arithmetic (PR 345)', () => {
  it('a share plus a fixed amount; a provider with no figure is unknown, never 0', () => {
    const fees = [{ provider: 'bkash', percentBps: 185, fixedMinor: 0 }, { provider: 'card', percentBps: 250, fixedMinor: 500 }];
    expect(gatewayFeeMinor(100_000, 'bkash', fees)).toBe(1_850);
    expect(gatewayFeeMinor(100_000, 'CARD', fees)).toBe(3_000);
    expect(gatewayFeeMinor(100_000, 'nagad', fees)).toBeNull();
    expect(gatewayFeeMinor(100_000, 'bkash', null)).toBeNull();
  });
  it('a rate as text: digits (also Bengali), at most 6 decimals, above 0', () => {
    expect(rateText('121.50')).toBe('121.50');
    expect(rateText('১২১.৫')).toBe('121.5');
    expect(rateText(122)).toBe('122');
    expect(rateText('0')).toBeNull();
    expect(rateText('1,21')).toBeNull();
    expect(rateText('1.1234567')).toBeNull();
  });
});

describe.skipIf(!HAS_TEST_DB)('costs & fees on PostgreSQL (PR 345)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  let reader = '';
  const route = async (method: string, path: string[], opts: { body?: unknown; cookie?: string } = {}) => {
    const res = await feesRoute(call(method, `/api/admin/money/fees${path.length ? `/${path.join('/')}` : ''}?storeId=${A}`, opts), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('fees');
    [A] = await seedSampleStores(t.prisma);
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
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships empty; settings saved with their version, a stale one refused; audited; a reader may not', async () => {
    const v0 = (await route('GET', [], { cookie: reader })).body as unknown as FeesView;
    expect(v0.gatewayFees.value).toBeNull();
    expect(v0.packaging.value).toBeNull();
    expect(v0.usd.current).toBeNull();
    const fees = [{ provider: 'bkash', percentBps: 185, fixedMinor: 0 }];
    const s1 = await route('PUT', ['gateway-fees'], { cookie: owner, body: { value: fees, version: v0.gatewayFees.version } });
    expect(s1.status).toBe(200);
    expect(s1.body.value).toEqual(fees);
    expect((await route('PUT', ['gateway-fees'], { cookie: owner, body: { value: [...fees, { provider: 'nagad', percentBps: 150, fixedMinor: 0 }], version: v0.gatewayFees.version } })).status).toBe(409);
    expect((await route('PUT', ['gateway-fees'], { cookie: owner, body: { value: [fees[0], fees[0]], version: s1.body.version } })).status).toBe(400);
    expect((await route('PUT', ['packaging'], { cookie: owner, body: { value: { perOrderMinor: 2_500 }, version: v0.packaging.version } })).status).toBe(200);
    expect((await route('PUT', ['packaging'], { cookie: reader, body: { value: null, version: 1 } })).status).toBe(403);
    expect(await t.prisma.auditLog.count({ where: { action: 'costs.fees', storeId: A } })).toBe(2);
    expect(await deps.resolver.value('costs.packaging', { storeId: A })).toEqual({ perOrderMinor: 2_500 });
  });

  it('a USD rate is a new row; the old one stays', async () => {
    expect((await route('POST', ['usd-rate'], { cookie: owner, body: { rate: '120.25' } })).status).toBe(201);
    expect((await route('POST', ['usd-rate'], { cookie: owner, body: { rate: 'abc' } })).status).toBe(400);
    await new Promise((r) => setTimeout(r, 5));
    expect((await route('POST', ['usd-rate'], { cookie: owner, body: { rate: '122' } })).status).toBe(201);
    const v = (await route('GET', [], { cookie: owner })).body as unknown as FeesView;
    expect(Number(v.usd.current?.rate)).toBe(122);
    expect(v.usd.history.map((h) => Number(h.rate))).toEqual([120.25]);
    expect(await t.prisma.exchangeRate.count({ where: { storeId: A } })).toBe(2);
  });

  it('a courier rate is added and ended, never twice, never deleted', async () => {
    const acct = await t.prisma.courierAccount.create({ data: { storeId: A, providerKey: 'sampleCourier', name: 'Sample courier', enabled: true } });
    const add = await route('POST', ['rate-cards'], { cookie: owner, body: { courierAccountId: acct.id, zoneKey: 'inside', weightFromGrams: 0, weightToGrams: 1_000, chargeMinor: 6_000, codFeeBps: 100, returnChargeMinor: 3_000 } });
    expect(add.status).toBe(201);
    expect((await route('POST', ['rate-cards'], { cookie: owner, body: { courierAccountId: acct.id, zoneKey: 'inside', weightFromGrams: 1_000, weightToGrams: 500, chargeMinor: 1 } })).status).toBe(400);
    let v = (await route('GET', [], { cookie: owner })).body as unknown as FeesView;
    expect(v.couriers[0]!.cards).toHaveLength(1);
    const id = String(add.body.id);
    expect((await route('POST', ['rate-cards', id, 'end'], { cookie: reader })).status).toBe(403);
    expect((await route('POST', ['rate-cards', id, 'end'], { cookie: owner })).status).toBe(200);
    expect((await route('POST', ['rate-cards', id, 'end'], { cookie: owner })).status).toBe(409);
    v = (await route('GET', [], { cookie: owner })).body as unknown as FeesView;
    expect(v.couriers[0]!.cards).toHaveLength(0);
    expect(await t.prisma.courierRateCard.count({ where: { id } })).toBe(1);
  });
});
