// PR 500 — Keys & connections end to end on a real PostgreSQL (a throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): no access without the permission, save → test → mode switch, a failing test keeps MOCK,
// no secret value in any answer, remove keeps the rows.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { allAdapters, connectionCatalogue, defineAdapter, requireSecret, type ConnectionDeclaration } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { integrationHandler, integrationsHandler, type Catalogue, type ConnectionView } from './integrations';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
// Sample values only. The test adapter passes its test when the key starts with "good-".
const GOOD_KEY = 'good-sample-key-for-the-tests-0001';
const BAD_KEY = 'bad-sample-key-for-the-tests-0002';
const AZURE_KEY = 'c2FtcGxlLWtleS1mb3ItdGhlLXRlc3RzLW5vdC1yZWFs';

/** A test-only adapter (no network): its test passes for a key starting with "good-". */
const probe = defineAdapter<{ key: string }, { region: string }>({
  kind: 'OTHER',
  provider: 'probe',
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['apiKey'],
  configSchema: z.object({ region: z.string().min(2) }),
  async create(ctx) {
    return { key: await requireSecret(ctx, 'apiKey') };
  },
  async mock() {
    return { key: 'mock' };
  },
  async test(api) {
    // A provider that repeats the key in its error: the answer must still never carry it.
    if (!api.key.startsWith('good-')) throw new Error(`provider refused key ${api.key}`);
    return { ok: true, message: 'answered' };
  },
});
const probeDecl: ConnectionDeclaration = {
  id: 'probe', kind: 'OTHER', provider: 'probe', adapter: true, secrets: [{ field: 'apiKey' }], config: [{ field: 'region' }], exclusive: true, targetMode: 'LIVE',
};
const cat: Catalogue = { declarations: [...connectionCatalogue, probeDecl], adapters: [...allAdapters, probe] };

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.30' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Keys & connections API on PostgreSQL (PR 500)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const texts: string[] = [];

  /** Every answer is kept, to check at the end that no key ever left in one. */
  async function read(res: Response) {
    const text = await res.clone().text();
    texts.push(text);
    return { status: res.status, body: JSON.parse(text) as Record<string, unknown> };
  }
  const list = async (cookie: string) => (await read(await integrationsHandler(call('GET', '/api/admin/integrations', { cookie }), deps, cat))).body.connections as ConnectionView[];
  const act = async (id: string, b: unknown, cookie = owner) => read(await integrationHandler(call('POST', `/api/admin/integrations/${id}`, { cookie, body: b }), deps, id, cat));

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('integrations');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));

    // A staff member who may read the page but not change it, and only for one store.
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

  it('needs a login, the permission and a same-site request', async () => {
    expect((await integrationsHandler(call('GET', '/api/admin/integrations'), deps, cat)).status).toBe(401);
    expect((await integrationsHandler(call('GET', '/api/admin/integrations'), null, cat)).status).toBe(503);
    expect((await act('probe', { action: 'save', secrets: { apiKey: GOOD_KEY }, config: { region: 'xx' } }, '')).status).toBe(401);
    // Read-only staff: sees the list, cannot save, test or remove.
    expect((await read(await integrationsHandler(call('GET', '/api/admin/integrations', { cookie: reader }), deps, cat))).status).toBe(200);
    for (const b of [{ action: 'save', secrets: { apiKey: GOOD_KEY }, config: { region: 'xx' } }, { action: 'test' }, { action: 'remove' }]) {
      expect((await act('probe', b, reader)).status).toBe(403);
    }
    const cross = await integrationHandler(call('POST', '/api/admin/integrations/probe', { cookie: owner, origin: 'https://evil.example.test', body: { action: 'save', secrets: { apiKey: GOOD_KEY }, config: { region: 'xx' } } }), deps, 'probe', cat);
    expect(cross.status).toBe(403);
    expect(await t.prisma.installationSecret.count()).toBe(0);
  });

  it('lists every declared connection, on mock and not connected; rows without an adapter offer nothing', async () => {
    const rows = await list(owner);
    expect(rows.map((r) => r.id)).toEqual(cat.declarations.map((d) => d.id));
    expect(rows.every((r) => !r.keySaved && r.integrationId === null)).toBe(true);
    expect(rows.find((r) => r.id === 'cloudflare')).toMatchObject({ adapter: false, secrets: [] });
    expect(rows.find((r) => r.id === 'localDisk')).toMatchObject({ builtIn: true, inUse: true });
    expect((await act('cloudflare', { action: 'save', secrets: {} })).status).toBe(409);
    expect((await act('localDisk', { action: 'remove' })).status).toBe(409);
    expect((await act('nope', { action: 'test' })).status).toBe(404);
  });

  it('refuses a wrong form without storing anything, and names the fields (never their values)', async () => {
    const r = await act('probe', { action: 'save', secrets: { apiKey: '  ', extra: GOOD_KEY }, config: {} });
    expect(r.status).toBe(400);
    expect(r.body.details).toEqual(expect.arrayContaining(['secrets.apiKey', 'secrets.extra', 'config.region']));
    const az = await act('azureBlob', { action: 'save', secrets: { accountKey: AZURE_KEY }, config: { accountName: 'Not Valid!', container: 'media' } });
    expect(az.status).toBe(400);
    expect(az.body.details).toEqual(['config.accountName']);
    expect(await t.prisma.installationSecret.count()).toBe(0);
  });

  it('a failing test keeps the connection on MOCK and switched off', async () => {
    const r = await act('probe', { action: 'save', secrets: { apiKey: BAD_KEY }, config: { region: 'xx' } });
    expect(r.status).toBe(200);
    expect(r.body.test).toMatchObject({ ok: false, mode: 'LIVE' });
    const c = r.body.connection as ConnectionView;
    expect(c).toMatchObject({ keySaved: true, mode: 'MOCK', enabled: false, lastTest: { ok: false } });
    expect(c.lastTest?.message).not.toContain(BAD_KEY);

    // The real Azure Blob adapter against an address nobody answers on: also fails, also stays on MOCK.
    const az = await act('azureBlob', { action: 'save', secrets: { accountKey: AZURE_KEY }, config: { accountName: 'samplestore', container: 'media', endpoint: 'http://127.0.0.1:9/samplestore' } });
    expect(az.body.test).toMatchObject({ ok: false });
    expect(az.body.connection).toMatchObject({ keySaved: true, mode: 'MOCK', enabled: false });
  });

  it('save → test → the connection leaves MOCK and is switched on; the Test button runs again', async () => {
    const r = await act('probe', { action: 'save', secrets: { apiKey: GOOD_KEY }, config: { region: 'xx' } });
    expect(r.body.test).toMatchObject({ ok: true, mode: 'LIVE' });
    expect(r.body.connection).toMatchObject({ keySaved: true, mode: 'LIVE', enabled: true, lastTest: { ok: true }, config: [{ field: 'region', value: 'xx' }] });
    const row = await t.prisma.integration.findFirstOrThrow({ where: { provider: 'probe' } });
    expect([row.mode, row.enabled, row.storeId, row.secretNames]).toEqual(['LIVE', true, null, ['probe.apiKey']]);

    const again = await act('probe', { action: 'test' });
    expect(again.body.test).toMatchObject({ ok: true, mode: 'LIVE' });
    expect(await t.prisma.integrationTestRun.count({ where: { integrationId: row.id } })).toBe(3);

    // The vault holds the value encrypted; the access log names the services, never the value.
    const secret = await t.prisma.installationSecret.findUniqueOrThrow({ where: { name: 'probe.apiKey' } });
    expect(Buffer.from(secret.ciphertext).toString('utf8')).not.toContain(GOOD_KEY);
    expect(await deps.vault!.get('probe.apiKey', { storeId: null }, { service: 'test' })).toBe(GOOD_KEY);
  });

  it('a new key that fails its test takes a live connection back to MOCK and off', async () => {
    const r = await act('probe', { action: 'save', secrets: { apiKey: BAD_KEY }, config: { region: 'xx' } });
    expect(r.body.connection).toMatchObject({ mode: 'MOCK', enabled: false });
    // A good key brings it back.
    const ok = await act('probe', { action: 'save', secrets: { apiKey: GOOD_KEY }, config: { region: 'xx' } });
    expect(ok.body.connection).toMatchObject({ mode: 'LIVE', enabled: true });
  });

  it('remove revokes the key and returns to MOCK; every row stays (nothing is deleted)', async () => {
    const r = await act('probe', { action: 'remove' });
    expect(r.status).toBe(200);
    expect(r.body.connection).toMatchObject({ keySaved: false, mode: 'MOCK', enabled: false });
    const secret = await t.prisma.installationSecret.findUniqueOrThrow({ where: { name: 'probe.apiKey' } });
    expect(secret.revokedAt).not.toBeNull();
    expect(await t.prisma.integration.count({ where: { provider: 'probe' } })).toBe(1);
    expect(await deps.vault!.get('probe.apiKey', { storeId: null }, { service: 'test' })).toBeNull();
    expect((await act('probe', { action: 'test' })).status).toBe(409);
  });

  it('no answer ever carried a key, and every change is audited with where it came from', async () => {
    for (const text of texts) for (const k of [GOOD_KEY, BAD_KEY, AZURE_KEY]) expect(text).not.toContain(k);
    const actions = (await t.prisma.auditLog.findMany({ where: { entityType: 'Integration' } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['integration.save', 'integration.test', 'integration.mode', 'integration.enable', 'integration.disable', 'integration.remove']));
    const ours = await t.prisma.auditLog.findMany({ where: { entityType: 'Integration', source: 'admin-api' } });
    expect(ours.every((a) => a.ip === '192.0.2.30')).toBe(true);
    for (const a of await t.prisma.auditLog.findMany()) for (const k of [GOOD_KEY, BAD_KEY, AZURE_KEY]) expect(JSON.stringify(a)).not.toContain(k);
    const log = await t.prisma.secretAccessLog.findMany({ where: { secretName: 'probe.apiKey' } });
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(['CREATE', 'REPLACE', 'DECRYPT', 'REVOKE']));
  });
});
