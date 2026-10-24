// S04 · PR 558 — the Parameter for Checkout's admin API end to end on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): a login, the same-site check and the permissions (a reader of orders may not see or save the
// panel); the panel as it ships (off, no layer); a save through the real settings resolver (its change log), switching
// on only with a confirmation, a stale screen refused. The screen's words exist in both languages. Every value is a
// made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import bn from '../../messages/admin-advance.bn.json';
import en from '../../messages/admin-advance.en.json';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { checkoutLayersRoute } from './checkout-layers-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the checkout layer tests';
const READER_PW = 'another long sentence for the checkout layer tests';

function call(method: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.45' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}/api/admin/risk/checkout-layers`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

const keysOf = (o: unknown, at = ''): string[] =>
  o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keysOf(v, at ? `${at}.${k}` : k)) : [at];

describe('PR 558 · the Checkout advance screen words', () => {
  it('every word exists in English and Bengali', () => {
    expect(keysOf(bn).sort()).toEqual(keysOf(en).sort());
  });
});

describe.skipIf(!HAS_TEST_DB)('Parameter for Checkout admin API on PostgreSQL (PR 558)', () => {
  let f: OrdersFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const api = async (method: string, opts: { body?: unknown; cookie?: string; origin?: string } = {}) => {
    const res = await checkoutLayersRoute(call(method, { body: opts.body, cookie: opts.cookie ?? owner, origin: opts.origin }), deps);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  const layer = { name: 'Sample layer', enabled: true, conditions: { minScore: 80, bands: [], signals: [] }, requirement: 'DELIVERY_CHARGE' };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpOrders('advance_api');
    const db = f.t.prisma;
    await syncSettings(db, { registry, messages });
    await createFirstOwner(db, defaultSecurityPolicy(), { email: 'advance-owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db, resolver: new SettingsResolver(prismaBackend(db), registry), vault: null };
    owner = cookiesOf(await loginHandler(new Request(`https://${HOST}/api/admin/auth/login`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.45' }, body: JSON.stringify({ email: 'advance-owner@example.com', password: OWNER_PW }) }), deps));
    await db.staffUser.update({ where: { email: 'reader@example.com' }, data: { passwordHash: await hashPassword(READER_PW), passwordSetAt: new Date() } });
    reader = cookiesOf(await loginHandler(new Request(`https://${HOST}/api/admin/auth/login`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.45' }, body: JSON.stringify({ email: 'reader@example.com', password: READER_PW }) }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await f?.t.drop();
  });

  it('ships off with no layer; a login, the permission and the same site are needed', async () => {
    const got = await api('GET');
    expect(got.status).toBe(200);
    expect(got.body.panel).toMatchObject({ enabled: false, maxLayers: registry['checkout.advance'].default.maxLayers, layers: [] });
    expect((await api('GET', { cookie: '' })).status).toBe(401);
    expect((await api('GET', { cookie: reader })).status).toBe(403);
    expect((await api('PUT', { cookie: reader, body: { enabled: false, layers: [] } })).status).toBe(403);
    expect((await api('PUT', { origin: 'https://evil.example.test', body: { enabled: false, layers: [] } })).status).toBe(403);
    expect((await api('POST', { body: {} })).status).toBe(405);
  });

  it('saves a layer; switching on needs a confirmation and goes through the settings; a stale screen is refused', async () => {
    const p0 = (await api('GET')).body.panel;
    const saved = await api('PUT', { body: { version: p0.version, enabled: false, layers: [layer] } });
    expect(saved.status).toBe(200);
    expect(saved.body.panel.layers).toMatchObject([{ name: 'Sample layer', position: 1, requirement: 'DELIVERY_CHARGE' }]);
    const keep = saved.body.panel.layers.map(({ position: _p, ...x }: Record<string, unknown>) => x);
    const ask = await api('PUT', { body: { version: saved.body.panel.version, enabled: true, layers: keep } });
    expect(ask).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT', details: ['confirm'] } });
    expect((await deps.resolver.value('checkout.advance', { storeId: f.S })).enabled).toBe(false);
    const on = await api('PUT', { body: { version: saved.body.panel.version, enabled: true, layers: keep, confirm: true, reason: 'sample' } });
    expect(on.status).toBe(200);
    expect(await deps.resolver.value('checkout.advance', { storeId: f.S })).toEqual({ enabled: true, maxLayers: registry['checkout.advance'].default.maxLayers });
    expect(await f.t.prisma.settingChange.count({ where: { key: 'checkout.advance' } })).toBeGreaterThanOrEqual(1);
    const stale = await api('PUT', { body: { version: p0.version, enabled: false, layers: keep } });
    expect(stale).toMatchObject({ status: 409, body: { ok: false, error: 'STALE' } });
  });
});
