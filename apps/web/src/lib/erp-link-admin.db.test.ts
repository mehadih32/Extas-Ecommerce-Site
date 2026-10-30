// CN-029 · PR 619 — Settings → ERP link end to end on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL). The
// owner's rule first: every store has its own ERP link — its own API key, webhook secret and signing secret, typed on
// the store's page, kept only in the vault under that store id — and store A's page, keys or calls card never reach
// store B. Then the switch-over's gates through the API: the dry run reads only, the switch is the owner's with his PIN,
// and a handover revokes the store's own three keys (never deleted) and nothing of the other store. The ERP adapter is
// replaced by a test one (no network): its test passes for a key starting with "good-". Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { allAdapters, connectionCatalogue, defineAdapter, ERP_ACCEPTANCE_DEMO_KEY, requireSecret } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import * as inv from '@extas/inventory';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import { erpCallsHandler } from './erp-calls-admin';
import { erpLinkHandler } from './erp-link-admin';
import { integrationHandler, integrationsHandler, type Catalogue, type ConnectionView } from './integrations';
import { inventoryDeps } from './inventory-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const PIN = '480326';
const KEYS = {
  A: { apiKey: 'good-sample-erp-key-store-a-0001', webhookSecret: 'sample-webhook-secret-store-a-0001', signingSecret: 'sample-signing-secret-store-a-0001' },
  B: { apiKey: 'good-sample-erp-key-store-b-0002', webhookSecret: 'sample-webhook-secret-store-b-0002', signingSecret: 'sample-signing-secret-store-b-0002' },
};

/** The ERP adapter for the test: no network; its test passes for an API key starting with "good-". */
const testErp = defineAdapter<{ key: string }, { baseUrl: string }>({
  kind: 'ERP',
  provider: 'extasErp',
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['apiKey', 'webhookSecret'],
  configSchema: z.object({ baseUrl: z.string().url() }),
  async create(ctx) {
    return { key: await requireSecret(ctx, 'apiKey') };
  },
  async mock() {
    return { key: 'mock' };
  },
  async test(api) {
    if (!api.key.startsWith('good-')) throw new Error('refused');
    return { ok: true, message: 'answered' };
  },
});
const cat: Catalogue = { declarations: connectionCatalogue, adapters: [...allAdapters.filter((a) => a.provider !== 'extasErp'), testErp] };

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.71' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('PR 619 · the ERP link page per store (PostgreSQL)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let B = 0;
  let owner = '';
  let ownerId = '';
  let readerA = '';
  const texts: string[] = [];

  async function read(res: Response) {
    const text = await res.clone().text();
    texts.push(text);
    return { status: res.status, body: JSON.parse(text) as Record<string, any> };
  }
  const save = async (storeId: number | string, k: Record<string, string>, cookie = owner) =>
    read(await integrationHandler(call('POST', `/api/admin/integrations/extasErp?storeId=${storeId}`, { cookie, body: { action: 'save', secrets: k, config: { baseUrl: 'https://erp.example.test' } } }), deps, 'extasErp', cat));
  const list = async (q: string, cookie = owner) => read(await integrationsHandler(call('GET', `/api/admin/integrations${q}`, { cookie }), deps, cat));
  const page = async (method: 'GET' | 'POST', storeId: number, cookie = owner, b?: unknown) => read(await erpLinkHandler(call(method, `/api/admin/erp-link?storeId=${storeId}`, { cookie, body: b }), deps));

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('erplink');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    const first = await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    ownerId = first.id;
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    // A staff member who may see the ERP link of store A only, and change nothing.
    const role = (await (await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Reader', nameBn: 'পাঠক', permissions: ['vault.read'] } }), deps)).json()) as { role: { id: string } };
    const staff = (await (await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), deps)).json()) as { staff: { id: string } };
    await staffRolesHandler(call('POST', `/api/admin/staff/${staff.staff.id}/roles`, { cookie: owner, body: { action: 'assign', roleId: role.role.id, storeId: A } }), deps, staff.staff.id);
    const firstLogin = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: 'first password from the owner' } }), deps));
    readerA = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: firstLogin, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it("each store's ERP keys go to the vault under its own id; another store and the installation see none of them", async () => {
    const a = await save(A, KEYS.A);
    expect(a.status).toBe(200);
    expect(a.body.test).toMatchObject({ ok: true });
    const secrets = await t.prisma.storeSecret.findMany({ orderBy: { name: 'asc' } });
    expect(secrets.map((s) => [s.storeId, s.name])).toEqual([
      [A, 'extasErp.apiKey'],
      [A, 'extasErp.signingSecret'],
      [A, 'extasErp.webhookSecret'],
    ]);
    expect(await t.prisma.installationSecret.count()).toBe(0);
    const row = await t.prisma.integration.findFirstOrThrow({ where: { kind: 'ERP' } });
    expect(row).toMatchObject({ storeId: A, provider: 'extasErp', mode: 'LIVE', enabled: true });
    // The store's list: only the per-store kinds (the ERP), saved for A, not for B; the installation's ERP row untouched.
    const la = (await list(`?storeId=${A}`)).body.connections as ConnectionView[];
    const lb = (await list(`?storeId=${B}`)).body.connections as ConnectionView[];
    const li = (await list('')).body.connections as ConnectionView[];
    expect(la.map((c) => c.kind)).toEqual(['ERP']);
    expect(la[0]).toMatchObject({ id: 'extasErp', keySaved: true, integrationId: row.id });
    expect(lb[0]).toMatchObject({ id: 'extasErp', keySaved: false, integrationId: null });
    expect(li.find((c) => c.id === 'extasErp')).toMatchObject({ keySaved: false, integrationId: null });
    expect(li.length).toBeGreaterThan(1);
    // Store B's own keys: its own rows; "one per kind" counts B's rows alone, so A's stays on.
    expect((await save(B, KEYS.B)).status).toBe(200);
    const rows = await t.prisma.integration.findMany({ where: { kind: 'ERP' }, orderBy: { storeId: 'asc' } });
    expect(rows.map((r) => [r.storeId, r.enabled])).toEqual([
      [A, true],
      [B, true],
    ]);
    expect(await t.prisma.storeSecret.count({ where: { storeId: B } })).toBe(3);
    // Each store's key opens only its own value (the vault binds the value to the store id).
    expect(await deps.vault!.get('extasErp.apiKey', { storeId: A }, { service: 'test' })).toBe(KEYS.A.apiKey);
    expect(await deps.vault!.get('extasErp.apiKey', { storeId: B }, { service: 'test' })).toBe(KEYS.B.apiKey);
    expect(await deps.vault!.get('extasErp.apiKey', { storeId: null }, { service: 'test' })).toBeNull();
    // The secret the ERP's calls to each store are checked with (PR 620's site API) is that store's own signing secret.
    const idp = await inventoryDeps(deps);
    for (const [s, k] of [
      [A, KEYS.A],
      [B, KEYS.B],
    ] as const) {
      expect(await (idp.connections as unknown as { secretOf(kind: 'ERP', field: string, where: { storeId: number; provider: string }): Promise<unknown> }).secretOf('ERP', 'signingSecret', { storeId: s, provider: 'extasErp' })).toMatchObject({ value: k.signingSecret, storeId: s });
    }
  });

  it('a store scope takes only the ERP; a bad store id is refused', async () => {
    const other = await integrationHandler(call('POST', `/api/admin/integrations/bkash?storeId=${A}`, { cookie: owner, body: { action: 'test' } }), deps, 'bkash', cat);
    expect(other.status).toBe(404);
    expect((await list('?storeId=x')).status).toBe(400);
    expect((await page('GET', A, owner)).status).toBe(200);
    expect((await erpLinkHandler(call('GET', '/api/admin/erp-link?storeId=0', { cookie: owner }), deps)).status).toBe(400);
  });

  it('qa-gate N2: a store that does not exist, or is archived, has no ERP link page: 404 NOT_FOUND, never a made-up state', async () => {
    const missing = Math.max(A, B) + 999;
    for (const m of ['GET', 'POST'] as const) expect([m, await page(m, missing, owner, m === 'POST' ? { action: 'dryRun' } : undefined)]).toEqual([m, { status: 404, body: { ok: false, error: 'NOT_FOUND', details: ['storeId'] } }]);
    expect(await t.prisma.erpStoreLink.count({ where: { storeId: missing } })).toBe(0);
    const was = (await t.prisma.store.findUniqueOrThrow({ where: { id: B }, select: { status: true } })).status;
    await t.prisma.store.update({ where: { id: B }, data: { status: 'ARCHIVED' } });
    try {
      expect((await page('GET', B, owner)).status).toBe(404);
    } finally {
      await t.prisma.store.update({ where: { id: B }, data: { status: was } });
    }
    expect((await page('GET', B, owner)).status).toBe(200);
    // Signed out it is still 401 first: the answer never says which stores exist.
    expect((await page('GET', missing, '')).status).toBe(401);
  });

  it("store A's reader sees A's page only, and changes nothing", async () => {
    const own = await page('GET', A, readerA);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ storeId: A, canWrite: false, owner: false });
    expect(own.body.stores.map((s: { id: number }) => s.id)).toEqual([A]);
    expect(own.body.connections[0]).toMatchObject({ id: 'extasErp', keySaved: true });
    expect((await page('GET', B, readerA)).status).toBe(403);
    expect((await list(`?storeId=${B}`, readerA)).status).toBe(403);
    expect((await save(A, KEYS.A, readerA)).status).toBe(403);
    expect((await read(await erpCallsHandler(call('GET', `/api/admin/integrations/erp-calls?storeId=${B}`, { cookie: readerA }), deps))).status).toBe(403);
    expect((await read(await erpCallsHandler(call('PUT', `/api/admin/integrations/erp-calls?storeId=${A}`, { cookie: readerA, body: { enabled: true } }), deps))).status).toBe(403);
    // The owner's page lists both stores.
    const mine = await page('GET', B, owner);
    expect(mine.body.stores.map((s: { id: number }) => s.id)).toEqual([A, B]);
    expect(mine.body).toMatchObject({ canWrite: true, owner: true, state: { storeId: B, model: 'v5', link: null } });
  });

  it("the ERP calls card switches the page's store only", async () => {
    const r = await read(await erpCallsHandler(call('PUT', `/api/admin/integrations/erp-calls?storeId=${B}`, { cookie: owner, body: { enabled: true } }), deps));
    expect(r.status).toBe(200);
    expect(await deps.resolver.value('erp.siteApi.enabled', { storeId: B })).toBe(true);
    expect(await deps.resolver.value('erp.siteApi.enabled', { storeId: A })).toBe(false);
  });

  it('the switch-over through the API: the dry run reads only, the switch is the owner’s with his PIN, the contract never changes without it', async () => {
    // Store A's reader cannot run the dry run (it needs the key to change keys) nor switch (the owner only).
    expect((await page('POST', A, readerA, { action: 'dryRun' })).status).toBe(403);
    const notOwner = await page('POST', A, readerA, { action: 'switch', pin: PIN, confirmDate: '2026-11-05' });
    expect(notOwner).toMatchObject({ status: 403, body: { error: 'OWNER_ONLY' } });
    // A dry run for a store whose ERP is not its own (the test ERP cannot be asked): a report with its blockers, nothing kept.
    await t.prisma.integration.updateMany({ where: { storeId: B }, data: { archivedAt: new Date() } });
    const dry = await page('POST', B, owner, { action: 'dryRun' });
    expect(dry.status).toBe(200);
    expect(dry.body.result).toMatchObject({ kind: 'DRY_RUN', ok: false });
    expect(dry.body.result.blockers).toContain('NO_OWN_CONNECTION');
    expect(await t.prisma.erpSwitchRun.count()).toBe(0);
    // The switch: the PIN first; then the plan's blockers.
    expect(await page('POST', B, owner, { action: 'switch', confirmDate: '2026-11-05' })).toMatchObject({ status: 403, body: { error: 'PIN_REQUIRED' } });
    await inv.setBooksPin(await inventoryDeps(deps), { actor: { staffUserId: ownerId }, storeId: A }, { password: OWNER_PW, pin: PIN });
    const blocked = await page('POST', B, owner, { action: 'switch', pin: PIN, confirmDate: '2026-11-05' });
    expect(blocked).toMatchObject({ status: 409, body: { error: 'SWITCH_BLOCKED' } });
    expect(blocked.body.details).toContain('NO_OWN_CONNECTION');
    for (const s of [A, B]) expect(await deps.resolver.value('erp.model', { storeId: s })).toBeNull();
    expect((await page('POST', B, owner, { action: 'unknown' })).status).toBe(400);
    expect(await page('POST', B, owner, { action: 'sendHeld', orderId: 'no-such-order' })).toMatchObject({ status: 404, body: { error: 'NOT_FOUND' } });
  });

  it("a handover ends store A's link and revokes A's three keys (kept, never deleted); store B keeps everything", async () => {
    const rowA = await t.prisma.integration.findFirstOrThrow({ where: { storeId: A, kind: 'ERP' } });
    await inv.openErpLink(t.prisma, A, rowA.id, { erpCompanyId: 'SAMPLE-CO-A' });
    const bKeys = await t.prisma.storeSecret.findMany({ where: { storeId: B }, select: { name: true, revokedAt: true } });
    expect(await page('POST', A, owner, { action: 'newLink', reason: 'HANDOVER', note: 'sold to a new owner', pin: '000000' })).toMatchObject({ body: { error: 'WRONG_PIN' } });
    const r = await page('POST', A, owner, { action: 'newLink', reason: 'HANDOVER', note: 'sold to a new owner', pin: PIN });
    expect(r.status).toBe(200);
    expect([...r.body.result.revoked].sort()).toEqual(['extasErp.apiKey', 'extasErp.signingSecret', 'extasErp.webhookSecret']);
    const aKeys = await t.prisma.storeSecret.findMany({ where: { storeId: A } });
    expect(aKeys).toHaveLength(3);
    expect(aKeys.every((k) => k.revokedAt !== null)).toBe(true);
    expect(await t.prisma.integration.findUniqueOrThrow({ where: { id: rowA.id } })).toMatchObject({ mode: 'MOCK', enabled: false });
    expect(await t.prisma.erpStoreLink.findFirstOrThrow({ where: { storeId: A } })).toMatchObject({ endedReason: 'HANDOVER' });
    expect(await t.prisma.storeSecret.findMany({ where: { storeId: B }, select: { name: true, revokedAt: true } })).toEqual(bKeys);
    expect(await t.prisma.erpSwitchRun.findFirstOrThrow({ where: { storeId: A } })).toMatchObject({ kind: 'NEW_LINK' });
    // The page shows A with no open link and its keys not saved.
    const after = await page('GET', A, owner);
    expect(after.body.state.link).toBeNull();
    expect(after.body.connections[0]).toMatchObject({ keySaved: false });
  });

  const DEMO_KEY = 'sample-demo-erp-key-621';
  it('PR 621: the demo ERP key for the acceptance run is the installation`s, saved by a person with keys for every store, never shown, removed by revoking', async () => {
    expect((await page('GET', A, owner)).body.demoKey).toEqual({ canEdit: true, saved: false, savedAt: null });
    // A reader of one store neither sees a way to change it nor may change it.
    expect((await page('GET', A, readerA)).body.demoKey).toMatchObject({ canEdit: false, saved: false });
    expect(await page('POST', A, readerA, { action: 'demoKey', key: DEMO_KEY })).toMatchObject({ status: 403 });
    expect(await page('POST', A, owner, { action: 'demoKey', key: 'short' })).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
    const r = await page('POST', B, owner, { action: 'demoKey', key: ` ${DEMO_KEY} ` });
    expect(r).toMatchObject({ status: 200, body: { result: { saved: true }, demoKey: { saved: true } } });
    // Kept for the installation (storeId null), never under a store; the value is the one typed (trimmed).
    expect(await deps.vault!.get(ERP_ACCEPTANCE_DEMO_KEY, { storeId: null }, { service: 'test' })).toBe(DEMO_KEY);
    expect(await t.prisma.storeSecret.count({ where: { name: ERP_ACCEPTANCE_DEMO_KEY } })).toBe(0);
    expect((await page('GET', A, readerA)).body.demoKey).toMatchObject({ canEdit: false, saved: true });
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'vault.put', entityId: ERP_ACCEPTANCE_DEMO_KEY } });
    expect(JSON.stringify(audit)).not.toContain(DEMO_KEY);
    // Removed: revoked (the row stays), and the run goes back to waiting.
    expect(await page('POST', A, owner, { action: 'demoKeyRemove' })).toMatchObject({ status: 200, body: { result: { saved: false }, demoKey: { saved: false } } });
    expect(await deps.vault!.get(ERP_ACCEPTANCE_DEMO_KEY, { storeId: null }, { service: 'test' })).toBeNull();
    expect(await t.prisma.installationSecret.count({ where: { name: ERP_ACCEPTANCE_DEMO_KEY } })).toBe(1);
  });

  it('no answer ever carried a key', () => {
    const all = texts.join('\n');
    for (const k of [...Object.values(KEYS.A), ...Object.values(KEYS.B), DEMO_KEY]) expect(all).not.toContain(k);
  });
});
