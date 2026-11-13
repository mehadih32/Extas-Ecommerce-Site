// S28 · PR 705 — the People, Roles and Activity log data on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the staff
// list with roles and the role tree; the activity log with its filters, paging and the CSV; field names but never values;
// customer-data views; and a person without `audit.read` is refused. Made-up data.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { audit, createFirstOwner, defaultSecurityPolicy, createStaff, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { activityRoute, activityView, filtersOf } from './activity-log';
import { peopleView, rolesView } from './people';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(path: string, cookie?: string) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.91' };
  if (cookie) headers.cookie = cookie;
  return new Request(`https://${HOST}${path}`, { method: 'GET', headers });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('People, Roles and the Activity log on PostgreSQL (PR 705)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  let ownerId = '';
  let packerId = '';
  const act = (staffUserId: string) => ({ staffUserId });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('people705');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    await deps.resolver.set('store.timeZone', 'Asia/Dhaka', storeTarget(A), { actorId: null, reason: 'test' });
    owner = cookiesOf(await loginHandler(new Request(`https://${HOST}/api/admin/auth/login`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.91' }, body: JSON.stringify({ email: 'owner@example.com', password: OWNER_PW }) }), deps));
    ownerId = (await t.prisma.staffUser.findUniqueOrThrow({ where: { email: 'owner@example.com' } })).id;
    const packer = await createStaff(t.prisma, defaultSecurityPolicy(), act(ownerId), { email: 'packer@example.com', displayName: 'Sample packer', password: 'orchid lantern seven river' });
    packerId = packer.id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('People lists the staff with their roles and counts those without 2-step login', async () => {
    const v = await peopleView(t.prisma, act(ownerId));
    expect(v.people.map((p) => p.email).sort()).toEqual(['owner@example.com', 'packer@example.com']);
    expect(v.people.find((p) => p.email === 'owner@example.com')!.roles.map((r) => r.key)).toContain('owner');
    expect(v.counts.active).toBe(2);
    expect(v.counts.noTwoFactor).toBe(2);
    expect(v.roles.some((r) => r.isOwner)).toBe(true);
    await expect(peopleView(t.prisma, act(packerId))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('Roles lists the roles with their keys and a tree that holds every permission once', async () => {
    const v = await rolesView(t.prisma, act(ownerId));
    const own = v.roles.find((r) => r.isOwner)!;
    const all = v.tree.flatMap((b) => b.keys.map((k) => k.key));
    expect(new Set(all).size).toBe(all.length);
    expect(own.permissions.length).toBeGreaterThan(50);
    expect(v.tree[0]!.label.bn).toBeTruthy();
  });

  it('the log shows who, what and which record, with field names but never values', async () => {
    await audit(t.prisma, act(ownerId), { action: 'customer.update', entityType: 'Customer', entityId: ownerId, before: { phone: '01711000001' }, after: { phone: '01822000002', name: 'N' }, storeId: A });
    await audit(t.prisma, act(ownerId), { action: 'role.update', entityType: 'Role', entityId: ownerId });
    await audit(t.prisma, { staffUserId: null }, { action: 'nightly.clean', entityType: 'System' });
    const v = await activityView(deps, act(ownerId), A, filtersOf(new URLSearchParams()), 'Asia/Dhaka');
    const row = v.rows.find((r) => r.action === 'customer.update')!;
    expect(row).toMatchObject({ who: 'Sample owner', whoType: 'STAFF', entity: 'Customer', fields: ['name', 'phone'] });
    expect(JSON.stringify(v)).not.toContain('01711000001');
    expect(JSON.stringify(v)).not.toContain('01822000002');
    expect(v.rows.find((r) => r.action === 'nightly.clean')!.who).toBe('');
  });

  it('filters by person, words and day; pages by the setting; newest first', async () => {
    const all = await activityView(deps, act(ownerId), A, filtersOf({}), 'Asia/Dhaka');
    expect(all.rows.length).toBeGreaterThanOrEqual(3);
    const times = all.rows.map((r) => r.at);
    expect([...times].sort().reverse()).toEqual(times);
    const words = await activityView(deps, act(ownerId), A, filtersOf({ text: 'CUSTOMER' }), 'Asia/Dhaka');
    expect(words.rows.every((r) => /customer/i.test(r.action + r.entity))).toBe(true);
    expect(words.rows.length).toBeGreaterThan(0);
    const who = await activityView(deps, act(ownerId), A, filtersOf({ who: packerId }), 'Asia/Dhaka');
    expect(who.rows).toEqual([]);
    const future = await activityView(deps, act(ownerId), A, filtersOf({ from: '2999-01-01' }), 'Asia/Dhaka');
    expect(future.rows).toEqual([]);
    await deps.resolver.set('activity.log', { pageSize: 10 }, storeTarget(A), { actorId: null, reason: 'test' });
    for (let i = 0; i < 12; i++) await audit(t.prisma, act(ownerId), { action: `bulk.${i}`, entityType: 'Thing' });
    const p1 = await activityView(deps, act(ownerId), A, filtersOf({}), 'Asia/Dhaka');
    expect(p1.rows).toHaveLength(10);
    expect(p1.more).toBe(true);
    const p2 = await activityView(deps, act(ownerId), A, filtersOf({ page: '2' }), 'Asia/Dhaka');
    expect(p2.rows.length).toBeGreaterThan(0);
    expect(p2.rows.some((r) => p1.rows.some((x) => x.id === r.id))).toBe(false);
    expect(filtersOf({ who: 'not-a-uuid', page: '-3', from: 'x', kind: 'weird' })).toMatchObject({ who: null, page: 1, from: null, kind: 'changes' });
  });

  it('customer-data views are their own list', async () => {
    await t.prisma.customerAccessLog.create({ data: { storeId: A, customerId: '0191a0b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b', staffUserId: ownerId, action: 'view.phone' } });
    const v = await activityView(deps, act(ownerId), A, filtersOf({ kind: 'views' }), 'Asia/Dhaka');
    expect(v.rows[0]).toMatchObject({ who: 'Sample owner', action: 'view.phone', entity: 'Customer' });
  });

  it('the route needs audit.read, answers JSON, and a CSV download is itself written to the log', async () => {
    expect((await activityRoute(call(`/api/admin/activity-log?storeId=${A}`), deps, [])).status).toBe(401);
    const ok = await activityRoute(call(`/api/admin/activity-log?storeId=${A}&text=customer`, owner), deps, []);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
    const csv = await activityRoute(call(`/api/admin/activity-log?storeId=${A}&format=csv`, owner), deps, []);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect((await csv.text()).split('\n')[0]).toBe('when,who,type,action,record,record id,changed fields');
    expect(await t.prisma.auditLog.count({ where: { action: 'activity.export' } })).toBe(1);
    expect((await activityRoute(call('/api/admin/activity-log/x', owner), deps, ['x'])).status).toBe(404);
    expect((await activityRoute(new Request(`https://${HOST}/api/admin/activity-log`, { method: 'POST', headers: { host: HOST } }), deps, [])).status).toBe(405);
  });
});
