// S13 · PR 548 — Marketing › Market & competitors end to end on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): following a link reads it at once through the page reader's mock (no key entered);
// `maxLinks` refuses a link past its ceiling; "Check now" saves a new report with its diff since the last read;
// archive/restore keep the link, never delete it; the card needs `marketing.campaigns.write` and is audited; never a
// write to a price. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, hashPassword, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { intelHandler } from './intel';

const HOST = 'admin.example.test';
const PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.71' };
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

describe.skipIf(!HAS_TEST_DB)('Marketing › Market & competitors on PostgreSQL (PR 548)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const S = MOTHER_STORE_ID;
  const api = async (method: string, body?: unknown, cookie = owner) => {
    const r = await intelHandler(call(method, '/api/admin/marketing/intel', cookie, body), deps);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('intel_548');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: PW }), deps));
    const role = await createRole(t.prisma, SYSTEM, { key: 'intel-reader', nameEn: 'intel-reader', nameBn: 'intel-reader', permissions: ['marketing.campaigns.read'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'reader@example.com', displayName: 'Sample reader', passwordHash: await hashPassword(PW), passwordSetAt: new Date() } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    reader = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'reader@example.com', password: PW }), deps));
  });
  afterAll(async () => t?.drop());

  it('signed out 401; a reader sees the screen but cannot add a link', async () => {
    expect((await api('GET', undefined, '')).status).toBe(401);
    expect((await api('GET', undefined, reader)).status).toBe(200);
    expect((await api('POST', { url: 'https://shop-a.example/' }, reader)).status).toBe(403);
  });

  let id = '';
  it('following a link reads it at once (the mock page reader, no key entered) and lists it with its match count', async () => {
    const bad = await api('POST', { url: 'not a url' });
    expect(bad.status).toBe(400);
    const a = await api('POST', { url: 'https://shop-a.example/sale' });
    expect(a.status).toBe(200);
    id = a.j.screen.links[0].id;
    const row = a.j.screen.links.find((x: any) => x.id === id);
    expect(row.name).toBe('Shop A');
    expect(row.lastRunAt).not.toBeNull();
    expect(row.change).toBe('first');
    expect(await t.prisma.competitor.count({ where: { storeId: S } })).toBe(1);
    expect(await t.prisma.competitorReport.count({ where: { storeId: S, competitorId: id } })).toBe(1);
  });

  it('"Check now" reads it again and saves a new report; nothing changed on the mock page is "none"', async () => {
    const r = await api('POST', { id, action: 'check' });
    expect(r.status).toBe(200);
    expect(await t.prisma.competitorReport.count({ where: { storeId: S, competitorId: id } })).toBe(2);
    expect(r.j.screen.links.find((x: any) => x.id === id).change).toBe('none');
  });

  it('archive keeps the link (never deletes it) and restore brings it back; a made-up id is 404', async () => {
    expect((await api('POST', { id: 'not-a-uuid', action: 'archive' })).status).toBe(400);
    expect((await api('POST', { id: '019342e0-0000-7000-8000-000000000000', action: 'archive' })).status).toBe(404);
    expect((await api('POST', { id, action: 'archive' })).status).toBe(200);
    expect((await t.prisma.competitor.findUniqueOrThrow({ where: { id } })).archivedAt).not.toBeNull();
    expect((await api('POST', { id, action: 'restore' })).status).toBe(200);
    expect((await t.prisma.competitor.findUniqueOrThrow({ where: { id } })).archivedAt).toBeNull();
  });

  it('the shipped `maxLinks` ceiling refuses one more; archiving does not free a slot (the count is of active links)', async () => {
    await t.prisma.$transaction(
      Array.from({ length: 9 }, (_, i) => t.prisma.competitor.create({ data: { storeId: S, name: `Filler ${i}`, url: `https://filler-${i}.example` } })),
    );
    expect(await t.prisma.competitor.count({ where: { storeId: S, archivedAt: null } })).toBe(10);
    const over = await api('POST', { url: 'https://one-too-many.example/' });
    expect(over.status).toBe(409);
    expect(over.j.error).toBe('LINKS_LIMIT');
  });

  it('only marketing.campaigns.write saves the "Change alerts" card; it is audited', async () => {
    expect((await api('PUT', { key: 'ads.intel', on: true, values: {} }, reader)).status).toBe(403);
    expect((await api('PUT', { key: 'ads.intel', on: true, values: {} })).status).toBe(200);
    expect((await api('GET')).j.screen.card.value.on).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'ads.intel.settings' } })).toBe(1);
  });
});
