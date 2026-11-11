// S23 · PR 437, 438 — Marketing › Studio on a real PostgreSQL: the whole page (accounts, templates, brand assets);
// seeing needs `studio.read`, changing needs `studio.write`; a brand asset's archive/restore also needs
// `media.manage`, uploading one needs `media.upload` (checked by the shared `/api/admin/media`, not exercised
// here). A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { mediaRuntime, type MediaDeps } from '@extas/media';
import { BRAND_ASSET_FOLDER } from '@extas/studio';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { studioHandler } from './studio';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.47', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/studio'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Marketing › Studio on PostgreSQL (PR 437, 438)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let media: MediaDeps;
  let owner = '';
  let writer = '';
  let reader = '';

  const api = async (method: string, body?: unknown, cookie = owner) => {
    const res = await studioHandler(req(method, { body, cookie }), admin, media);
    return { status: res.status, a: (await res.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    t = await createTestDatabase('web_studio');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: null } as unknown as AdminDeps;
    media = mediaRuntime({ db: t.prisma, settings: resolver, vault: null, defer: (task) => void task() });
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));

    const makeStaff = async (key: string, perms: string[]) => {
      const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: key, nameBn: key, permissions: perms } }), admin);
      const roleId = ((await role.json()) as { role: { id: string } }).role.id;
      const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: `${key}@example.com`, displayName: key, password: 'first password from the owner' } }), admin);
      const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
      await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
      const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: `${key}@example.com`, password: 'first password from the owner' } }), admin));
      // Must not contain the account's own email local part (policy issue "contains-email", password.ts).
      return cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'a sentence this account alone chose as its own' } }), admin));
    };
    writer = await makeStaff('w438', ['studio.read', 'studio.write', 'media.manage']);
    reader = await makeStaff('r438', ['studio.read']);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('GET answers accounts, templates and brand assets together; a reader cannot write', async () => {
    const g = await api('GET', undefined, reader);
    expect(g.status).toBe(200);
    expect(g.a).toMatchObject({ ok: true, accounts: [], templates: [], assets: [], canWrite: false });
    const denied = await api('POST', { action: 'account.add', platform: 'facebook', externalId: 'p-1', name: 'Page' }, reader);
    expect(denied.status).toBe(403);
  });

  it('adds an account, a template, names a brand asset\'s kind, and archives/restores the asset', async () => {
    const acc = await api('POST', { action: 'account.add', platform: 'facebook', externalId: 'p-438', name: 'EXTAS Page' }, writer);
    expect(acc.status).toBe(200);
    expect(acc.a).toMatchObject({ ok: true, enabled: false, requireApproval: true });

    const tpl = await api('POST', { action: 'template.add', kind: 'reel', name: 'Launch reel', spec: { aspectRatio: '9:16', durationSeconds: 15, brandAssetIds: [] } }, writer);
    expect(tpl.status).toBe(200);
    expect(tpl.a).toMatchObject({ ok: true, version: 1 });

    const asset = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `studio/${S}/logo.png`, mimeType: 'image/png', bytes: 100n, checksumSha256: 'w438'.padEnd(64, '0'), isOriginal: true, folder: BRAND_ASSET_FOLDER, tags: [] } });
    const named = await api('POST', { action: 'asset.kind', assetId: asset.id, kind: 'logo' }, writer);
    expect(named.status).toBe(200);
    expect(named.a).toMatchObject({ ok: true, kind: 'logo' });

    const archived = await api('POST', { action: 'asset.archive', assetId: asset.id, reason: 'test' }, writer);
    expect(archived.status).toBe(200);
    expect(archived.a).toMatchObject({ ok: true, archived: true });
    const restored = await api('POST', { action: 'asset.restore', assetId: asset.id }, writer);
    expect(restored.a).toMatchObject({ ok: true, archived: false });

    const g = await api('GET', undefined, writer);
    expect((g.a.accounts as unknown[]).length).toBeGreaterThan(0);
    expect((g.a.templates as unknown[]).length).toBeGreaterThan(0);
    expect((g.a.assets as unknown[]).length).toBeGreaterThan(0);
  });

  it('refuses an unknown action and a bad input', async () => {
    const bad = await api('POST', { action: 'nonsense' }, writer);
    expect(bad.status).toBe(400);
    const empty = await api('POST', { action: 'account.add', platform: 'facebook', externalId: '', name: '' }, writer);
    expect(empty.status).toBe(400);
  });
});
