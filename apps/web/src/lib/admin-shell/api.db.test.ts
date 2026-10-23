// PR 12, PR 6 (follow-up 84) — the shell's admin API on a real PostgreSQL: badges and "Needs you now" from the real
// tables, only what the person may open; the palette's search; the person's notifications (honestly empty); and the
// guides. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { badgesHandler, helpHandler, notificationsHandler, queuesHandler, searchHandler } from './api';
import type { SearchGroup } from './search';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.21' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('admin shell API on PostgreSQL (PR 12)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let staff = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    // One product waiting to launch (the Products badge), counted before the first badge call fills the short cache.
    await t.prisma.publishQueueItem.create({ data: { storeId: MOTHER_STORE_ID, productId: randomUUID(), reason: 'launch', status: 'OPEN' } });
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));

    const role = await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Catalogue', nameBn: 'ক্যাটালগ', permissions: ['catalogue.read'] } }), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'catalogue@example.com', displayName: 'Sample catalogue', password: 'first password from the owner' } }), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', `/api/admin/staff/${staffId}/roles`, { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'catalogue@example.com', password: 'first password from the owner' } }), deps));
    staff = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('every shell route needs a session (401), and says when there is no database (503)', async () => {
    for (const r of [badgesHandler(call('GET', '/api/admin/shell/badges'), deps), searchHandler(call('GET', '/api/admin/search?q=x'), deps), notificationsHandler(call('GET', '/api/admin/notifications'), deps), helpHandler(call('GET', '/api/admin/help/README'), 'README', deps), queuesHandler(call('GET', '/api/admin/dashboard/queues'), deps)])
      expect((await r).status).toBe(401);
    expect((await badgesHandler(call('GET', '/api/admin/shell/badges'), null)).status).toBe(503);
  });

  it('badges and "Needs you now" come from the real tables, only what the person may open', async () => {
    const b = (await (await badgesHandler(call('GET', '/api/admin/shell/badges', { cookie: owner }), deps)).json()) as { badges: Record<string, number> };
    expect(b.badges).toEqual({ products: 1 });
    const q = (await (await queuesHandler(call('GET', '/api/admin/dashboard/queues', { cookie: owner }), deps)).json()) as { queues: { id: string; n: number; href: string; oldest: string | null }[] };
    expect(q.queues).toEqual([expect.objectContaining({ id: 'launch', n: 1, href: '/admin/products/queue' })]);
    expect(q.queues[0]!.oldest).toBeTruthy();

    const sb = (await (await badgesHandler(call('GET', '/api/admin/shell/badges', { cookie: staff }), deps)).json()) as { badges: Record<string, number> };
    expect(sb.badges).toEqual({ products: 1 });
    // The Dashboard's list needs dashboard.read, which a catalogue role does not hold.
    expect((await queuesHandler(call('GET', '/api/admin/dashboard/queues', { cookie: staff }), deps)).status).toBe(403);
  });

  it('search: an empty box lists the sections the person may open; words find pages and settings', async () => {
    const groups = async (cookie: string, q: string) => ((await (await searchHandler(call('GET', `/api/admin/search?q=${encodeURIComponent(q)}`, { cookie }), deps)).json()) as { groups: SearchGroup[] }).groups;
    const ownerJump = (await groups(owner, '')).find((g) => g.id === 'jump')!;
    expect(ownerJump.items).toHaveLength(14);
    const staffJump = (await groups(staff, '')).find((g) => g.id === 'jump')!;
    expect(staffJump.items.map((i) => i.href)).toEqual(['/admin/products']);

    const stock = await groups(owner, 'stock');
    expect(stock.find((g) => g.id === 'pages')?.items.map((i) => i.href)).toContain('/admin/stock');
    expect((await groups(staff, 'stock')).find((g) => g.id === 'pages')?.items.map((i) => i.href) ?? []).not.toContain('/admin/stock');
    const help = await groups(owner, '?stock');
    expect(help.map((g) => g.id)).toEqual(['help']);
    expect(help[0]!.items.map((i) => i.guide?.slug)).toContain('stock');
  });

  it('notifications: the person\'s own, an honest empty list until a source exists', async () => {
    const n = (await (await notificationsHandler(call('GET', '/api/admin/notifications', { cookie: staff }), deps)).json()) as { items: unknown[]; unread: number; source: string };
    expect(n).toMatchObject({ items: [], unread: 0, source: 'none' });
  });

  it('guides: one parsed guide by name; an unknown or unsafe name is 404', async () => {
    const res = await helpHandler(call('GET', '/api/admin/help/dashboard', { cookie: staff }), 'dashboard', deps);
    expect(res.status).toBe(200);
    const g = ((await res.json()) as { guide: { slug: string; title: string; blocks: unknown[] } }).guide;
    expect(g.slug).toBe('dashboard');
    expect(g.title).toBeTruthy();
    expect(g.blocks.length).toBeGreaterThan(3);
    expect((await helpHandler(call('GET', '/api/admin/help/x', { cookie: staff }), '../../CLAUDE', deps)).status).toBe(404);
    expect((await helpHandler(call('GET', '/api/admin/help/x', { cookie: staff }), 'no-such-guide', deps)).status).toBe(404);
  });
});
