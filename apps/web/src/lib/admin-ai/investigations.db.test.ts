// S15 · PR 583 — "Ask the chief" on PostgreSQL (/api/admin/ai/agents-chief, /close, /warn): a question naming an
// agent, its code or an area keyword creates an open investigation AND assigns the fix to that agent
// (`source: 'chief-investigation'`); a question naming nothing routes to the chief itself with no new assignment;
// closing is idempotent (a double tap writes once); a warning lands in the named agent's own work log, never
// another agent's; `ensureAgentRows` wires every non-chief agent's `reportsToId` to the chief. `ai.read` opens the
// list, `ai.control` alone asks, closes or warns. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL,
// like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { ensureAgentRows } from './control-room';
import { agentsChiefCloseHandler, agentsChiefHandler, agentsChiefWarnHandler } from './investigations-api';

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

interface Evidence {
  label: string;
  detail: string;
}
interface Investigation {
  id: string;
  question: string;
  status: string;
  responsibleAgent: string | null;
  findings: string | null;
  evidence: Evidence[];
  assignmentId: string | null;
  closedAt: string | null;
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  investigation?: Investigation;
  investigations?: Investigation[];
}

describe.skipIf(!HAS_TEST_DB)('Ask the chief on PostgreSQL (PR 583)', () => {
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
  const ask = async (cookie: string, question: string) => {
    const res = await agentsChiefHandler(call('POST', '/api/admin/ai/agents-chief', { cookie, body: { question } }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const list = async (cookie: string) => {
    const res = await agentsChiefHandler(call('GET', '/api/admin/ai/agents-chief', { cookie }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const close = async (cookie: string, id: string) => {
    const res = await agentsChiefCloseHandler(call('POST', '/api/admin/ai/agents-chief/close', { cookie, body: { id } }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const warn = async (cookie: string, body: Record<string, unknown>) => {
    const res = await agentsChiefWarnHandler(call('POST', '/api/admin/ai/agents-chief/warn', { cookie, body }), deps);
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

  it('wires the chain of command: every non-chief agent reports to the chief', async () => {
    await ensureAgentRows(t.prisma);
    const rows = await t.prisma.aiAgent.findMany();
    const chief = rows.find((r) => r.key === 'gyani')!;
    expect(chief.reportsToId).toBeNull();
    for (const r of rows) {
      if (r.key === 'gyani') continue;
      expect(r.reportsToId).toBe(chief.id);
    }
  });

  it('lists no investigations on a fresh installation', async () => {
    const { status, a } = await list(reader);
    expect(status).toBe(200);
    expect(a.investigations).toEqual([]);
  });

  it('refuses a GET with no permission, and a reader cannot ask', async () => {
    expect((await list('')).status).toBe(401);
    expect((await ask(reader, 'Why is stock wrong?')).status).toBe(403);
  });

  it('refuses an empty question', async () => {
    expect((await ask(controller, '  ')).status).toBe(400);
  });

  it('routes a question naming an employee code to that agent, with real evidence, and assigns the fix to it', async () => {
    const { status, a } = await ask(controller, 'A360-03 courier entries keep failing this week');
    expect(status).toBe(200);
    const inv = a.investigation!;
    expect(inv.status).toBe('open');
    expect(inv.responsibleAgent).toBe('bhandari');
    expect(inv.assignmentId).not.toBeNull();
    expect(inv.evidence.length).toBeGreaterThan(0);
    expect(inv.evidence[0]!.label).toContain('open assignments');

    const assignment = await t.prisma.aiAgentAssignment.findUnique({ where: { id: inv.assignmentId! } });
    expect(assignment?.source).toBe('chief-investigation');
    expect(assignment?.status).toBe('todo');
  });

  it('routes a question naming nothing to the chief itself, with no new assignment', async () => {
    const { status, a } = await ask(controller, 'Why are sales down this month?');
    expect(status).toBe(200);
    const inv = a.investigation!;
    expect(inv.responsibleAgent).toBe('gyani');
    expect(inv.assignmentId).toBeNull();
  });

  it('closes an investigation; a double close is a no-op, not an error', async () => {
    const asked = await ask(controller, 'Why did the ad budget get paused?');
    const id = asked.a.investigation!.id;
    const closed = await close(controller, id);
    expect(closed.status).toBe(200);
    expect(closed.a.investigations!.find((i) => i.id === id)!.status).toBe('closed');

    const again = await close(controller, id);
    expect(again.status).toBe(200);
  });

  it('refuses closing an unknown investigation, and a reader may not close one', async () => {
    expect((await close(controller, '00000000-0000-7000-8000-000000000000')).status).toBe(404);
    const asked = await ask(controller, 'Why did Shilpi change the layout?');
    expect((await close(reader, asked.a.investigation!.id)).status).toBe(403);
  });

  it('writes a warning into the named agent’s own work log, never another agent’s', async () => {
    const { status } = await warn(controller, { agentKey: 'bhandari', why: 'Missed the reorder point on two best-sellers' });
    expect(status).toBe(200);
    const agent = await t.prisma.aiAgent.findUnique({ where: { key: 'bhandari' } });
    const log = await t.prisma.aiWorkLog.findMany({ where: { agentId: agent!.id, outcome: 'warning' } });
    expect(log).toHaveLength(1);
    expect(log[0]!.summary).toBe('Missed the reorder point on two best-sellers');

    const otherAgent = await t.prisma.aiAgent.findUnique({ where: { key: 'doot' } });
    const otherLog = await t.prisma.aiWorkLog.findMany({ where: { agentId: otherAgent!.id, outcome: 'warning' } });
    expect(otherLog).toEqual([]);
  });

  it('refuses a warning with an unknown agent key or an empty reason', async () => {
    expect((await warn(controller, { agentKey: 'not-a-real-agent', why: 'x' })).status).toBe(404);
    expect((await warn(controller, { agentKey: 'bhandari', why: '' })).status).toBe(400);
  });
});
