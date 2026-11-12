// S15 · PR 577 — the 360° profile on PostgreSQL (/api/admin/agents, /api/admin/agents/:key): the team list and one
// agent's profile both read real `AiAgent`/`AiAgentAssignment`/`AiWorkLog` rows; `ai.read` opens both, `ai.control`
// alone edits the owner's own identity fields, gives a reward, assigns a task or marks one done; an edit that
// changes nothing writes once (double-tap rule); an unknown agent key is refused everywhere; a reward and an
// assignment on one agent never appear on another's profile. A throwaway database (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { agentProfileHandler, agentsListHandler } from './agent-profile-api';

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

interface Assignment {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
}
interface Profile {
  key: string;
  nameEn: string;
  bio: string | null;
  photoUrl: string | null;
  joinedOn: string | null;
  verified: boolean;
  catalogue: { role: string; owns: string; plan: string[] };
  openAssignments: Assignment[];
  doneAssignments: Assignment[];
  rewards: { id: string; label: string; note: string | null }[];
  openCount: number;
  doneCount: number;
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  agents?: { key: string; openCount: number; doneCount: number }[];
  profile?: Profile;
}

describe.skipIf(!HAS_TEST_DB)('360° agent profile on PostgreSQL (PR 577)', () => {
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
  const list = async (cookie: string) => {
    const res = await agentsListHandler(call('GET', '/api/admin/agents', { cookie }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const one = async (method: string, key: string, cookie: string, reqBody?: unknown) => {
    const res = await agentProfileHandler(call(method, `/api/admin/agents/${key}`, { cookie, body: reqBody }), deps, key);
    return { status: res.status, a: (await res.json()) as Answer };
  };

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

  it('lists the seven fixed agents with no assignments on a fresh installation', async () => {
    const { status, a } = await list(reader);
    expect(status).toBe(200);
    expect(a.agents).toHaveLength(7);
    for (const ag of a.agents!) {
      expect(ag.openCount).toBe(0);
      expect(ag.doneCount).toBe(0);
    }
  });

  it('refuses a GET with no permission at all, and an unknown agent key', async () => {
    expect((await one('GET', 'gyani', '')).status).toBe(401);
    expect((await one('GET', 'not-a-real-agent', reader)).status).toBe(404);
  });

  it("reads gyani's profile: its structural catalogue from docs/agents/gyani.md, honestly empty log and assignments", async () => {
    const { status, a } = await one('GET', 'gyani', reader);
    expect(status).toBe(200);
    const p = a.profile!;
    expect(p.key).toBe('gyani');
    expect(p.verified).toBe(true); // ensureAgentRows seeds every fixed agent verified
    expect(p.bio).toBeNull();
    expect(p.joinedOn).toBeNull();
    expect(p.catalogue.owns).toContain('S15 AI 360 Control Room');
    expect(p.catalogue.plan.length).toBeGreaterThan(0);
    expect(p.openAssignments).toEqual([]);
    expect(p.doneAssignments).toEqual([]);
    expect(p.rewards).toEqual([]);
  });

  it('a reader cannot edit the profile, give a reward or assign a task', async () => {
    expect((await one('PATCH', 'gyani', reader, { bio: 'no' })).status).toBe(403);
    expect((await one('POST', 'gyani', reader, { action: 'reward', label: 'no' })).status).toBe(403);
    expect((await one('POST', 'gyani', reader, { action: 'assign', title: 'no' })).status).toBe(403);
  });

  it('a controller edits bio, photo URL, joining date and the verified star; a double-save writes once', async () => {
    const patch = { bio: 'Keeps the shop honest.', photoUrl: 'https://example.com/gyani.jpg', joinedOn: '2026-10-19', verified: false };
    const { status, a } = await one('PATCH', 'gyani', controller, patch);
    expect(status).toBe(200);
    expect(a.profile).toMatchObject({ bio: patch.bio, photoUrl: patch.photoUrl, joinedOn: patch.joinedOn, verified: false });

    const again = await one('PATCH', 'gyani', controller, patch); // the exact same patch again
    expect(again.status).toBe(200);
    expect(again.a.profile).toMatchObject(patch);
  });

  it('refuses a photo URL that is not http(s), and a badly-shaped joining date', async () => {
    expect((await one('PATCH', 'prohori', controller, { photoUrl: 'javascript:alert(1)' })).status).toBe(422);
    expect((await one('PATCH', 'prohori', controller, { joinedOn: '19 Oct 2026' })).status).toBe(422);
  });

  it('gives a reward, which shows on the profile and never on another agent', async () => {
    const { status, a } = await one('POST', 'bhandari', controller, { action: 'reward', label: 'Fastest courier fix this week', note: 'Saved a stuck parcel' });
    expect(status).toBe(200);
    expect(a.profile!.rewards).toHaveLength(1);
    expect(a.profile!.rewards[0]).toMatchObject({ label: 'Fastest courier fix this week', note: 'Saved a stuck parcel' });

    const other = await one('GET', 'doot', reader);
    expect(other.a.profile!.rewards).toEqual([]);
  });

  it('refuses an empty reward label', async () => {
    expect((await one('POST', 'bhandari', controller, { action: 'reward', label: '' })).status).toBe(422);
  });

  it('assigns a task with a due date, counts it as open on the team list, then marks it done', async () => {
    const assigned = await one('POST', 'shilpi', controller, { action: 'assign', title: 'Check the category page on small phones', dueAt: '2026-12-01' });
    expect(assigned.status).toBe(200);
    expect(assigned.a.profile!.openAssignments).toHaveLength(1);
    const task = assigned.a.profile!.openAssignments[0]!;
    expect(task).toMatchObject({ title: 'Check the category page on small phones', status: 'todo', dueAt: '2026-12-01T00:00:00.000Z', completedAt: null });

    const listed = await list(reader);
    expect(listed.a.agents!.find((x) => x.key === 'shilpi')).toMatchObject({ openCount: 1, doneCount: 0 });

    const completed = await one('POST', 'shilpi', controller, { action: 'complete', assignmentId: task.id });
    expect(completed.status).toBe(200);
    expect(completed.a.profile!.openAssignments).toEqual([]);
    expect(completed.a.profile!.doneAssignments).toHaveLength(1);
    expect(completed.a.profile!.doneAssignments[0]!.completedAt).not.toBeNull();

    // marking it done again is a no-op, not an error
    const again = await one('POST', 'shilpi', controller, { action: 'complete', assignmentId: task.id });
    expect(again.status).toBe(200);
    expect(again.a.profile!.doneAssignments).toHaveLength(1);
  });

  it('refuses completing an assignment that belongs to a different agent', async () => {
    const assigned = await one('POST', 'doot', controller, { action: 'assign', title: 'Write a blog brief' });
    const taskId = assigned.a.profile!.openAssignments[0]!.id;
    const wrong = await one('POST', 'tirondaj', controller, { action: 'complete', assignmentId: taskId });
    expect(wrong.status).toBe(404);
  });
});
