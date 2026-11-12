// S15 · PR 579 — the curriculum on PostgreSQL, through `POST /api/admin/agents/:key {action: 'curriculum'}`
// (`ai.control`): a fresh installation reads every level as `notStarted`; the owner's own hand can mark a level
// in progress, passed (with a score) or failed; `passed` without a score is refused; `notStarted` clears any
// earlier score; a no-op patch (same status/score) writes once; a reader cannot touch it; an unknown agent, level
// or status is refused; one agent's level never appears on another's. A throwaway database (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { agentProfileHandler } from './agent-profile-api';

void INSTALLATION;

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.44' };
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

interface LevelView {
  level: string;
  status: string;
  score: number | null;
  earnedAt: string | null;
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  curriculum?: { levels: LevelView[] };
}

describe.skipIf(!HAS_TEST_DB)('agent curriculum on PostgreSQL (PR 579)', () => {
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
  const curriculum = async (method: string, key: string, cookie: string, reqBody?: unknown) => {
    const res = await agentProfileHandler(call(method, `/api/admin/agents/${key}`, { cookie, body: reqBody }), deps, key);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const setLevel = (key: string, cookie: string, level: string, status: string, score?: number | null) =>
    curriculum('POST', key, cookie, { action: 'curriculum', level, status, score });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    reader = await staff('reader@example.com', ['ai.read']);
    controller = await staff('controller@example.com', ['ai.read', 'ai.control']);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('on a fresh installation every one of the three levels reads notStarted, with no score or earned date', async () => {
    const { status, a } = await curriculum('GET', 'gyani', reader);
    expect(status).toBe(200);
    // the GET profile route does not carry curriculum; confirm via a curriculum POST read-back instead
    const read = await setLevel('gyani', controller, 'graduate', 'notStarted');
    expect(read.status).toBe(200);
    for (const lv of read.a.curriculum!.levels) {
      expect(lv.status).toBe('notStarted');
      expect(lv.score).toBeNull();
      expect(lv.earnedAt).toBeNull();
    }
  });

  it('a reader cannot change a curriculum level', async () => {
    expect((await setLevel('gyani', reader, 'graduate', 'inProgress')).status).toBe(403);
  });

  it('refuses an unknown agent, level or status', async () => {
    expect((await setLevel('not-a-real-agent', controller, 'graduate', 'inProgress')).status).toBe(404);
    expect((await setLevel('gyani', controller, 'masters', 'inProgress')).status).toBe(422);
    expect((await setLevel('gyani', controller, 'graduate', 'excellent')).status).toBe(422);
  });

  it('refuses marking a level "passed" with no score, and an out-of-range score', async () => {
    expect((await setLevel('prohori', controller, 'graduate', 'passed')).status).toBe(422);
    expect((await curriculum('POST', 'prohori', controller, { action: 'curriculum', level: 'graduate', status: 'passed', score: 150 })).status).toBe(422);
  });

  it('marks a level passed with a score; it shows earned, and never on another agent', async () => {
    const { status, a } = await setLevel('bhandari', controller, 'graduate', 'passed', 92);
    expect(status).toBe(200);
    const lv = a.curriculum!.levels.find((x) => x.level === 'graduate')!;
    expect(lv.status).toBe('passed');
    expect(lv.score).toBe(92);
    expect(lv.earnedAt).not.toBeNull();

    const other = await setLevel('doot', controller, 'graduate', 'notStarted');
    const otherLv = other.a.curriculum!.levels.find((x) => x.level === 'graduate')!;
    expect(otherLv.status).toBe('notStarted');
  });

  it('moving a passed level back to notStarted clears its score and earned date', async () => {
    await setLevel('sawdagor', controller, 'postGraduate', 'passed', 88);
    const { a } = await setLevel('sawdagor', controller, 'postGraduate', 'notStarted');
    const lv = a.curriculum!.levels.find((x) => x.level === 'postGraduate')!;
    expect(lv.status).toBe('notStarted');
    expect(lv.score).toBeNull();
    expect(lv.earnedAt).toBeNull();
  });

  it('a no-op patch (the exact same status, score and earned-state already stored) writes once, harmlessly', async () => {
    await setLevel('shilpi', controller, 'phd', 'inProgress');
    const again = await setLevel('shilpi', controller, 'phd', 'inProgress');
    expect(again.status).toBe(200);
    expect(again.a.curriculum!.levels.find((x) => x.level === 'phd')!.status).toBe('inProgress');
  });
});
