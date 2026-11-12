// S15 · PR 578 — Agent reports (/api/admin/ai/appraisals) on PostgreSQL: `ai.read` reads the saved history, only
// `ai.control` generates (or regenerates) a report; a fresh installation honestly has none yet; a generated report's
// KPIs match the AiWorkLog/AiUsageLedger rows actually seeded (bug_self/bug_owner/reward/plain-task outcomes, cost
// summed from the ledger); generating twice for the same agent/period/day refreshes the one row instead of piling up
// duplicates; an unknown agent key or a bad period is refused. A throwaway database (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { appraisalHandler } from './appraisal-api';
import { ensureAgentRows } from './control-room';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; query?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.44' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}/api/admin/ai/appraisals${opts.query ?? ''}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

interface Kpis {
  tasksDone: number;
  bugsSelfFound: number;
  bugsOwnerFound: number;
  rewards: number;
  costMinor: number;
  firstTimeRightRate: number | null;
}
interface Row {
  id: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  kpis: Kpis;
  report: string;
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  rows?: Row[];
  row?: Row;
}

describe.skipIf(!HAS_TEST_DB)('AI › Agent reports on PostgreSQL (PR 578)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  let controller = '';
  const now = new Date('2026-11-12T10:00:00Z'); // 2026-11-12 16:00 Asia/Dhaka

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(call('POST', { cookie: owner, body: { nameEn: email, nameBn: email, permissions: perms } } as never), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', { cookie: owner, body: { email, displayName: email, password: 'first password from the owner' } } as never), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } } as never), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', { body: { email, password: 'first password from the owner' } }), deps));
    return cookiesOf(await passwordHandler(call('POST', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  };
  const ask = async (method: string, cookie: string, opts: { body?: unknown; query?: string } = {}) => {
    const res = await appraisalHandler(call(method, { cookie, ...opts }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  const agentRow = async (key: string) => {
    await ensureAgentRows(t.prisma);
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key } });
    return agent;
  };

  let seq = 0;
  const workLog = (agentId: string, outcome: string | null, at: Date) => t.prisma.aiWorkLog.create({ data: { agentId, summary: 'test task', outcome, createdAt: at } });
  const usage = (agentId: string, costMinor: number, at: Date) =>
    t.prisma.aiUsageLedger.create({ data: { agentId, providerKey: 'anthropic', modelKey: 'test-model', idempotencyKey: `test-${seq++}`, costUsdMicros: BigInt(costMinor * 10), costMinor, createdAt: at } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => now };
    owner = cookiesOf(await loginHandler(call('POST', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    reader = await staff('reader@example.com', ['ai.read']);
    controller = await staff('controller@example.com', ['ai.read', 'ai.control']);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('a fresh installation honestly has no report yet for any agent/period', async () => {
    const { status, a } = await ask('GET', reader, { query: '?key=shilpi&period=daily' });
    expect(status).toBe(200);
    expect(a.rows).toEqual([]);
  });

  it('only ai.read can read history; only ai.control can generate', async () => {
    expect((await ask('GET', 'bad=cookie', { query: '?key=shilpi&period=daily' })).status).toBe(401);
    expect((await ask('GET', 'bad=cookie', { query: '?key=shilpi&period=daily' })).status).not.toBe(200);
    expect((await ask('POST', reader, { body: { key: 'shilpi', period: 'daily' } })).status).toBe(403);
    const ok = await ask('POST', controller, { body: { key: 'shilpi', period: 'daily' } });
    expect(ok.status).toBe(200);
  });

  it('an unknown agent key, or an invalid period, is refused with no row written', async () => {
    const before = await t.prisma.aiAppraisal.count();
    expect((await ask('POST', controller, { body: { key: 'not-an-agent', period: 'daily' } })).a).toMatchObject({ ok: false, error: 'NOT_FOUND' });
    expect((await ask('POST', controller, { body: { key: 'shilpi', period: 'fortnightly' } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['period'] });
    expect((await ask('POST', controller, { body: { key: 'shilpi' } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect(await t.prisma.aiAppraisal.count()).toBe(before);
  });

  it('KPIs are computed honestly from the seeded work log and usage ledger', async () => {
    const agent = await agentRow('doot');
    const inWindow = new Date('2026-11-12T06:00:00Z');
    await workLog(agent.id, null, inWindow); // a plain finished task
    await workLog(agent.id, null, inWindow);
    await workLog(agent.id, 'bug_self', inWindow);
    await workLog(agent.id, 'bug_owner', inWindow);
    await workLog(agent.id, 'reward', inWindow);
    await workLog(agent.id, null, new Date('2026-11-01T06:00:00Z')); // outside the daily window
    await usage(agent.id, 300, inWindow);
    await usage(agent.id, 200, new Date('2026-11-01T06:00:00Z')); // outside the daily window

    const gen = await ask('POST', controller, { body: { key: 'doot', period: 'daily' } });
    expect(gen.status).toBe(200);
    const kpis = gen.a.row!.kpis;
    expect(kpis.tasksDone).toBe(4); // 2 plain + bug_self + bug_owner, reward excluded
    expect(kpis.bugsSelfFound).toBe(1);
    expect(kpis.bugsOwnerFound).toBe(1);
    expect(kpis.rewards).toBe(1);
    expect(kpis.costMinor).toBe(300); // only the in-window usage row
    expect(kpis.firstTimeRightRate).toBe(75); // (4-1)/4

    const read = await ask('GET', reader, { query: '?key=doot&period=daily' });
    expect(read.a.rows).toHaveLength(1);
    expect(read.a.rows![0]!.kpis).toEqual(kpis);
  });

  it('generating twice for the same agent/period/day refreshes the one row, not a duplicate', async () => {
    const agent = await agentRow('bhandari');
    const before = await t.prisma.aiAppraisal.count({ where: { agentId: agent.id } });
    const first = await ask('POST', controller, { body: { key: 'bhandari', period: 'weekly' } });
    expect(await t.prisma.aiAppraisal.count({ where: { agentId: agent.id } })).toBe(before + 1);
    await workLog(agent.id, 'bug_owner', now); // change the facts, then regenerate
    const second = await ask('POST', controller, { body: { key: 'bhandari', period: 'weekly' } });
    expect(await t.prisma.aiAppraisal.count({ where: { agentId: agent.id } })).toBe(before + 1); // still one row
    expect(second.a.row!.id).toBe(first.a.row!.id);
    expect(second.a.row!.kpis.bugsOwnerFound).toBeGreaterThan(first.a.row!.kpis.bugsOwnerFound);
  });

  it('an agent with no work at all reads honestly as all zeros and a null rate, not invented numbers', async () => {
    const gen = await ask('POST', controller, { body: { key: 'tirondaj', period: 'yearly' } });
    expect(gen.status).toBe(200);
    expect(gen.a.row!.kpis).toMatchObject({ tasksDone: 0, bugsSelfFound: 0, bugsOwnerFound: 0, rewards: 0, costMinor: 0, firstTimeRightRate: null });
    expect(gen.a.row!.report).toContain('এই সময়ে কোনো কাজ রেকর্ড হয়নি');
  });

  it('history reads newest period first and is scoped to the requested period only', async () => {
    await ask('POST', controller, { body: { key: 'prohori', period: 'daily' } });
    await ask('POST', controller, { body: { key: 'prohori', period: 'weekly' } });
    const daily = await ask('GET', controller, { query: '?key=prohori&period=daily' });
    expect(daily.a.rows!.every((r) => r.period === 'daily')).toBe(true);
    expect(daily.a.rows!.length).toBeGreaterThanOrEqual(1);
  });
});
