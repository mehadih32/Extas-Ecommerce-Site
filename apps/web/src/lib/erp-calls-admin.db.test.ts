// PR 620 — the "The ERP asks the shop" card on Keys & connections, end to end on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): the address to put into the ERP, the switch (off as it ships; only someone who may change
// keys turns it on, logged and audited), the latest verified calls of the store, and the refused calls summed apart
// (qa-gate 30 Oct: they never push the store's own calls out of its list). Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ERP_WEBHOOK_REFUSED_EVENT, erpSiteGuard, erpSiteRequestRefusal, erpWebhookGuard, erpWebhookRequestRefusal, logErpSiteCall } from '@extas/inventory';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { erpCallsHandler, erpCallsState } from './erp-calls-admin';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.62' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');
const PATH = '/api/admin/integrations/erp-calls';

describe.skipIf(!HAS_TEST_DB)('PR 620 · the ERP calls card on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const ask = async (method: string, cookie: string, b?: unknown) => {
    const res = await erpCallsHandler(call(method, PATH, { cookie, body: b }), deps);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('erpcalls');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = (await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Reader', nameBn: 'পাঠক', permissions: ['vault.read'] } }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.role.id, storeId: null } }), deps, staff.staff.id);
    const first = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('shows the address for the ERP, off as it ships, and no call yet', async () => {
    const r = await ask('GET', owner);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, enabled: false, v6: false, base: `https://${HOST}/erp-api`, calls: [], refused: { total: 0, byCode: {}, days: 7, lastAt: null }, refusedWebhooks: { total: 0, byCode: {}, days: 7, lastAt: null }, canWrite: true });
    // The preview host the server was given wins over the address the page was opened on.
    await deps.resolver.set('system.stagingHost', 'new.example.test', { level: 'installation' }, { actorId: null, reason: 'test' });
    expect((await erpCallsState(deps, MOTHER_STORE_ID, `https://${HOST}`)).base).toBe('https://new.example.test/erp-api');
  });

  it('needs a login; one who may only read keys sees it and cannot switch it', async () => {
    expect((await ask('GET', '')).status).toBe(401);
    const r = await ask('GET', reader);
    expect([r.status, r.body.canWrite]).toEqual([200, false]);
    expect((await ask('PUT', reader, { enabled: true })).status).toBe(403);
    expect((await ask('PUT', owner, { enabled: 'yes' })).status).toBe(400);
  });

  it('the owner switches it on: saved for this store, with who did it in the settings log and the audit log', async () => {
    const r = await ask('PUT', owner, { enabled: true });
    expect([r.status, r.body.enabled]).toEqual([200, true]);
    expect(await deps.resolver.value('erp.siteApi.enabled', { storeId: MOTHER_STORE_ID })).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'erp.siteApi.enabled' } })).toBe(1);
    expect((await ask('PUT', owner, { enabled: false })).body.enabled).toBe(false);
  });

  it("lists the store's latest verified calls, newest first, never a customer; refused calls only as a count", async () => {
    const at = new Date();
    await logErpSiteCall(t.prisma, { storeId: MOTHER_STORE_ID, linkId: null, endpoint: 'customers', status: 200, code: 'OK', rows: 3, searched: true, at });
    // Refused calls from the internet: counted in this app, written as one summary when the card is opened.
    for (let i = 0; i < 25; i++) erpSiteRequestRefusal({ method: 'GET', path: '/erp-api/customers', query: '', signature: null, timestamp: null }, at);
    erpSiteRequestRefusal({ method: 'POST', path: '/erp-api/top-products', query: '', signature: null, timestamp: null }, at);
    const r = await ask('GET', owner);
    expect(r.body.calls.map((c: Record<string, unknown>) => [c.endpoint, c.code, c.rows, c.searched])).toEqual([['customers', 'OK', 3, true]]);
    expect([r.body.refused.total, r.body.refused.byCode, r.body.refused.days]).toEqual([26, { UNSIGNED: 25, METHOD: 1 }, 7]);
    expect(erpSiteGuard().pending.size).toBe(0);
    // Opening the card again adds no row when nothing new was refused.
    const rows = await t.prisma.securityEvent.count();
    expect((await ask('GET', owner)).body.refused.total).toBe(26);
    expect(await t.prisma.securityEvent.count()).toBe(rows);
  });

  it('p3 review round 2: refused webhooks are written when the card is opened, and shown apart from refused calls', async () => {
    const at = new Date();
    for (let i = 0; i < 3; i++) erpWebhookRequestRefusal({ signature: null, timestamp: null, address: '192.0.2.70' }, at);
    erpWebhookRequestRefusal({ signature: 'not-hex', timestamp: String(Math.floor(at.getTime() / 1000)), address: '192.0.2.70' }, at);
    const r = await ask('GET', owner);
    expect([r.body.refusedWebhooks.total, r.body.refusedWebhooks.byCode, r.body.refusedWebhooks.days]).toEqual([4, { UNSIGNED: 3, BAD_SIGNATURE: 1 }, 7]);
    expect(r.body.refusedWebhooks.lastAt).not.toBeNull();
    // The ERP's calls keep their own count.
    expect(r.body.refused.total).toBe(26);
    expect(erpWebhookGuard().pending.size).toBe(0);
    expect(await t.prisma.securityEvent.count({ where: { kind: ERP_WEBHOOK_REFUSED_EVENT } })).toBe(1);
    // Opened again with nothing new: no second row.
    expect((await ask('GET', owner)).body.refusedWebhooks.total).toBe(4);
    expect(await t.prisma.securityEvent.count({ where: { kind: ERP_WEBHOOK_REFUSED_EVENT } })).toBe(1);
  });
});
