// S15 · PR 318 — the permission matrix on PostgreSQL: every cell of every fixed agent reads as `propose` until the
// owner widens or narrows it; only `ai.read` opens the matrix, only `ai.control` changes a cell; a change is
// audited and idempotent on a repeat of the same value; an unknown agent, resource or level is refused. A
// throwaway database (skipped without TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver, syncSettings, messages } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { permissionsHandler } from './permissions-api';
import { agentPermissionLevel, DEFAULT_LEVEL } from './permissions';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.47' };
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

interface Cell {
  resource: string;
  level: string;
  isDefault: boolean;
}
interface AgentRow {
  key: string;
  cells: Cell[];
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  agents?: AgentRow[];
}

describe.skipIf(!HAS_TEST_DB)('AI › permission matrix on PostgreSQL (PR 318)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  let controller = '';

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: email, nameBn: email, permissions: perms } } as never), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email, displayName: email, password: 'first password from the owner' } } as never), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', '/api/admin/staff-roles', { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } } as never), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email, password: 'first password from the owner' } }), deps));
    return cookiesOf(await passwordHandler(call('POST', '/api/admin/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  };

  const ask = async (method: string, cookie: string, reqBody?: unknown) => {
    const res = await permissionsHandler(call(method, '/api/admin/ai/permissions', { cookie, body: reqBody }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null, now: () => new Date('2026-11-11T10:00:00Z') };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    reader = await staff('reader@example.com', ['ai.read']);
    controller = await staff('controller@example.com', ['ai.read', 'ai.control']);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('starts with all seven fixed agents, every cell at the safe default — "propose", never "alone"', async () => {
    const { status, a } = await ask('GET', reader);
    expect(status).toBe(200);
    expect(a.agents).toHaveLength(7);
    for (const agent of a.agents!) {
      expect(agent.cells).toHaveLength(7);
      for (const cell of agent.cells) {
        expect(cell.level).toBe('propose');
        expect(cell.isDefault).toBe(true);
      }
    }
  });

  it('refuses anyone without ai.read to even see the matrix, and ai.control to change a cell', async () => {
    expect((await ask('GET', 'bad=cookie')).status).toBe(401);
    expect((await ask('POST', reader, { agentKey: 'bhandari', resource: 'stock', level: 'alone' })).status).toBe(403);
  });

  it("widens one cell to \"alone\", audited, leaving every other cell untouched", async () => {
    const auditBefore = await t.prisma.auditLog.count({ where: { action: 'ai.permission.set' } });
    const { status, a } = await ask('POST', controller, { agentKey: 'bhandari', resource: 'stock', level: 'alone' });
    expect(status).toBe(200);
    const bhandari = a.agents!.find((x) => x.key === 'bhandari')!;
    expect(bhandari.cells.find((c) => c.resource === 'stock')).toMatchObject({ level: 'alone', isDefault: false });
    expect(bhandari.cells.find((c) => c.resource === 'prices')).toMatchObject({ level: 'propose', isDefault: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.permission.set' } })).toBe(auditBefore + 1);
    expect(await agentPermissionLevel({ db: t.prisma }, 'bhandari', 'stock')).toBe('alone');
  });

  it('narrows a different cell to "none", and a repeat of the same value is a no-op (no new audit row)', async () => {
    await ask('POST', controller, { agentKey: 'bhandari', resource: 'prices', level: 'none' });
    const auditBefore = await t.prisma.auditLog.count({ where: { action: 'ai.permission.set' } });
    const again = await ask('POST', controller, { agentKey: 'bhandari', resource: 'prices', level: 'none' });
    expect(again.status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.permission.set' } })).toBe(auditBefore);
    expect(again.a.agents!.find((x) => x.key === 'bhandari')!.cells.find((c) => c.resource === 'prices')).toMatchObject({ level: 'none', isDefault: false });
  });

  it('refuses an unknown agent, resource or level', async () => {
    expect((await ask('POST', controller, { agentKey: 'nobody', resource: 'stock', level: 'alone' })).a).toMatchObject({ ok: false, error: 'NOT_FOUND', details: ['agentKey'] });
    expect((await ask('POST', controller, { agentKey: 'bhandari', resource: 'nonsense', level: 'alone' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['resource'] });
    expect((await ask('POST', controller, { agentKey: 'bhandari', resource: 'stock', level: 'maybe' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['level'] });
  });

  it('agentPermissionLevel reads the safe default for a cell nobody has ever set', async () => {
    expect(await agentPermissionLevel({ db: t.prisma }, 'doot', 'money')).toBe(DEFAULT_LEVEL);
  });
});
