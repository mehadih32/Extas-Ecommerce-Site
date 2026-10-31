// S08 · PR 193 — Delivery › Delivery settings API on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the
// holiday mode card ships off with no dates; a reader with `delivery.read` sees it but may not save; the owner saves it
// whole against the version the page showed (a stale one is refused), switching on needs both days in order, and each
// save is in the audit log. Every date is a made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { deliverySettingsHandler } from './delivery-settings-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.93' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}/api/admin/delivery/settings`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

type Card = { key: string; value: Record<string, unknown>; version: string };

describe.skipIf(!HAS_TEST_DB)('Delivery settings API on PostgreSQL (PR 193 holiday mode)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const api = async (method: string, opts: { body?: unknown; cookie?: string } = {}) => {
    const res = await deliverySettingsHandler(call(method, opts), deps);
    return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; details?: string[]; cards?: Record<string, Card> } };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('delivery_settings');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(new Request(`https://${HOST}/api/admin/roles`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'user-agent': 'SampleBrowser/1.0', 'content-type': 'application/json', cookie: owner }, body: JSON.stringify({ nameEn: 'Delivery reader', nameBn: 'ডেলিভারি দেখা', permissions: ['delivery.read'] }) }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(new Request(`https://${HOST}/api/admin/staff`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'user-agent': 'SampleBrowser/1.0', 'content-type': 'application/json', cookie: owner }, body: JSON.stringify({ email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' }) }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(new Request(`https://${HOST}/api/admin/staff/${staff.staff.id}/roles`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'user-agent': 'SampleBrowser/1.0', 'content-type': 'application/json', cookie: owner }, body: JSON.stringify({ action: 'assign', roleId: role.role.id }) }), deps, staff.staff.id);
    const first = cookiesOf(await loginHandler(call('POST', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(new Request(`https://${HOST}/api/admin/auth/password`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'user-agent': 'SampleBrowser/1.0', 'content-type': 'application/json', cookie: first }, body: JSON.stringify({ current: 'first password from the owner', next: 'my own words for this job' }) }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('ships off with no dates; a reader sees the card but may not save it', async () => {
    const g = await api('GET', { cookie: reader });
    expect(g.status).toBe(200);
    const card = g.body.cards!['delivery.holiday']!;
    expect(card.value).toMatchObject({ enabled: false, from: null, to: null });
    const put = await api('PUT', { cookie: reader, body: { key: 'delivery.holiday', value: { ...card.value, from: '2027-04-08' }, version: card.version } });
    expect(put.status).toBe(403);
    expect((await api('GET')).status).toBe(401);
  });

  it('the owner saves it whole against the version shown; switching on needs both days in order; audited', async () => {
    const card = (await api('GET', { cookie: owner })).body.cards!['delivery.holiday']!;
    const on = { ...card.value, enabled: true };
    const noDays = await api('PUT', { cookie: owner, body: { key: 'delivery.holiday', value: on, version: card.version } });
    expect(noDays).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
    const backwards = await api('PUT', { cookie: owner, body: { key: 'delivery.holiday', value: { ...on, from: '2027-04-11', to: '2027-04-08' }, version: card.version } });
    expect(backwards.status).toBe(400);
    const ok = await api('PUT', { cookie: owner, body: { key: 'delivery.holiday', value: { ...on, from: '2027-04-08', to: '2027-04-11' }, version: card.version } });
    expect(ok.status).toBe(200);
    expect(ok.body.cards!['delivery.holiday']!.value).toMatchObject({ enabled: true, from: '2027-04-08', to: '2027-04-11' });
    expect(await deps.resolver.value('delivery.holiday', { storeId: MOTHER_STORE_ID })).toMatchObject({ enabled: true, from: '2027-04-08' });
    // the page's old version is stale now
    const stale = await api('PUT', { cookie: owner, body: { key: 'delivery.holiday', value: { ...on, from: '2027-04-09', to: '2027-04-11' }, version: card.version } });
    expect(stale).toMatchObject({ status: 409, body: { error: 'STALE' } });
    expect(await t.prisma.auditLog.count({ where: { action: 'delivery.holiday.save' } })).toBe(1);
    expect((await api('PUT', { cookie: owner, body: { key: 'delivery.other', value: {}, version: 'x' } })).status).toBe(400);
  });
});
