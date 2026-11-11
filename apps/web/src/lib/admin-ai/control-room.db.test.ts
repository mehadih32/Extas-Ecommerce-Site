// S15 · PR 304 — AI › Control room on PostgreSQL (/api/admin/ai): the seven fixed agents appear once, off, with no
// cost and no activity until something real happens; `ai.read` opens it, `ai.control` alone pauses or resumes one
// agent (reversible, audited, a double tap writes once); an unknown agent key or a missing field is refused; costs
// are summed from AiUsageLedger inside the store's own day and month, never a later or earlier one. A throwaway
// database (skipped without TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
//
// S15 · PR 305 — the same route also flips the business-wide master switch ({master}, `ai.control`, a SettingChange
// not a second AuditLog) and one agent's "keep running even with the master off" ({key, keepOnWhenMasterOff},
// `ai.control`, audited); both are a no-op on a double tap, and `workingNow` is true whenever an agent is on AND
// (the master is on OR it is kept on).
//
// S15 · PR 307 — the same route also takes {key, provider} (one agent's model pick). On a fresh installation every
// option but the practice writer is "not ready" and `recommendedProvider` is null; picking an un-Tested or unknown
// provider is refused (422); once a PR 306 connection is enabled and Tested (mode LIVE), it becomes ready, the
// recommendation picks it up, and an agent may be pointed at it (audited `ai.agent.model`, idempotent).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { controlRoomHandler } from './control-room-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.44' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}/api/admin/ai`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

interface Agent {
  key: string;
  enabled: boolean;
  keepOnWhenMasterOff: boolean;
  workingNow: boolean;
  lastActivity: { summaryBn: string; at: string } | null;
  todayMinor: number;
  monthMinor: number;
  selectedProvider: string | null;
  selectedReady: boolean;
}
interface ModelOption {
  provider: string | null;
  modelId: string | null;
  ready: boolean;
}
interface View {
  masterOn: boolean;
  monthlyCapMinor: number | null;
  todayMinor: number;
  monthMinor: number;
  runningNow: number;
  agentCount: number;
  modelOptions: ModelOption[];
  recommendedProvider: string | null;
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  view: View;
  agents: Agent[];
}

describe.skipIf(!HAS_TEST_DB)('AI › Control room on PostgreSQL (PR 304)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  let controller = '';
  const now = new Date('2026-11-11T10:00:00Z'); // 2026-11-11 16:00 Asia/Dhaka

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(call('POST', { cookie: owner, body: { nameEn: email, nameBn: email, permissions: perms } } as never), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', { cookie: owner, body: { email, displayName: email, password: 'first password from the owner' } } as never), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } } as never), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', { body: { email, password: 'first password from the owner' } }), deps));
    return cookiesOf(await passwordHandler(call('POST', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  };
  const ask = async (method: string, cookie: string, body?: unknown) => {
    const res = await controlRoomHandler(call(method, { cookie, body }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };

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

  it('the seven fixed agents, off, with no activity and no cost on a fresh installation', async () => {
    const { status, a } = await ask('GET', reader);
    expect(status).toBe(200);
    expect(a.view).toMatchObject({ masterOn: false, monthlyCapMinor: null, todayMinor: 0, monthMinor: 0, runningNow: 0, agentCount: 7 });
    expect(a.agents).toHaveLength(7);
    expect(new Set(a.agents.map((x) => x.key))).toEqual(new Set(['gyani', 'prohori', 'bhandari', 'sawdagor', 'shilpi', 'doot', 'tirondaj']));
    for (const ag of a.agents) {
      expect(ag.enabled).toBe(false);
      expect(ag.workingNow).toBe(false);
      expect(ag.lastActivity).toBeNull();
      expect(ag.todayMinor).toBe(0);
      expect(ag.monthMinor).toBe(0);
    }
    // reading again is unchanged — the identity rows are not re-created on every read
    const again = (await ask('GET', reader)).a;
    expect(again.agents).toHaveLength(7);
  });

  it('only ai.read opens it; only ai.control pauses or resumes an agent', async () => {
    expect((await ask('GET', 'bad=cookie')).status).toBe(401);
    expect((await ask('POST', reader, { key: 'doot', enabled: true })).status).toBe(403);
    const ok = await ask('POST', controller, { key: 'doot', enabled: true });
    expect(ok.status).toBe(200);
    expect(ok.a.agents.find((x) => x.key === 'doot')?.enabled).toBe(true);
    // the master switch is off by default, so the agent is paused, not working, even though it is on
    expect(ok.a.agents.find((x) => x.key === 'doot')?.workingNow).toBe(false);
    expect(ok.a.view.runningNow).toBe(0);
  });

  it('an unknown agent key or a missing field is refused; nothing changes', async () => {
    const before = await t.prisma.aiAgent.count({ where: { enabled: true } });
    expect((await ask('POST', controller, { key: 'not-an-agent', enabled: true })).a).toMatchObject({ ok: false, error: 'NOT_FOUND' });
    expect((await ask('POST', controller, { enabled: true })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['key'] });
    expect((await ask('POST', controller, { key: 'doot' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['enabled'] });
    expect(await t.prisma.aiAgent.count({ where: { enabled: true } })).toBe(before);
  });

  it('a double tap writes once (idempotent); each real change is audited', async () => {
    const countBefore = await t.prisma.auditLog.count({ where: { action: { in: ['ai.agent.pause', 'ai.agent.resume'] } } });
    await ask('POST', controller, { key: 'gyani', enabled: true });
    await ask('POST', controller, { key: 'gyani', enabled: true }); // same value again
    const afterSame = await t.prisma.auditLog.count({ where: { action: { in: ['ai.agent.pause', 'ai.agent.resume'] } } });
    expect(afterSame).toBe(countBefore + 1);
    const back = await ask('POST', controller, { key: 'gyani', enabled: false });
    expect(back.a.agents.find((x) => x.key === 'gyani')?.enabled).toBe(false);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['ai.agent.pause', 'ai.agent.resume'] } } })).toBe(countBefore + 2);
  });

  it('only ai.control can flip the business-wide master switch (PR 305); a double tap writes once', async () => {
    expect((await ask('POST', reader, { master: true })).status).toBe(403);
    const on = await ask('POST', controller, { master: true });
    expect(on.status).toBe(200);
    expect(on.a.view.masterOn).toBe(true);
    const again = await ask('POST', controller, { master: true }); // same value again
    expect(again.status).toBe(200);
    expect(again.a.view.masterOn).toBe(true);
    const off = await ask('POST', controller, { master: false });
    expect(off.a.view.masterOn).toBe(false);
  });

  it('an agent kept on works even while the master switch is off (PR 305); an unknown key is refused; a double tap writes once', async () => {
    expect((await ask('POST', controller, { key: 'not-an-agent', keepOnWhenMasterOff: true })).a).toMatchObject({ ok: false, error: 'NOT_FOUND' });
    expect((await ask('POST', controller, { keepOnWhenMasterOff: true })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['key'] });
    expect((await ask('POST', reader, { key: 'sawdagor', keepOnWhenMasterOff: true })).status).toBe(403);

    await ask('POST', controller, { key: 'sawdagor', enabled: true });
    const before = await ask('GET', reader);
    expect(before.a.view.masterOn).toBe(false);
    expect(before.a.agents.find((x) => x.key === 'sawdagor')).toMatchObject({ keepOnWhenMasterOff: false, workingNow: false });

    const kept = await ask('POST', controller, { key: 'sawdagor', keepOnWhenMasterOff: true });
    expect(kept.a.view.masterOn).toBe(false); // the master switch itself never moves
    expect(kept.a.agents.find((x) => x.key === 'sawdagor')).toMatchObject({ keepOnWhenMasterOff: true, workingNow: true });

    const auditBefore = await t.prisma.auditLog.count({ where: { action: { in: ['ai.agent.keepOn', 'ai.agent.keepOff'] } } });
    await ask('POST', controller, { key: 'sawdagor', keepOnWhenMasterOff: true }); // same value again
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['ai.agent.keepOn', 'ai.agent.keepOff'] } } })).toBe(auditBefore);

    const dropped = await ask('POST', controller, { key: 'sawdagor', keepOnWhenMasterOff: false });
    expect(dropped.a.agents.find((x) => x.key === 'sawdagor')).toMatchObject({ keepOnWhenMasterOff: false, workingNow: false });
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['ai.agent.keepOn', 'ai.agent.keepOff'] } } })).toBe(auditBefore + 1);
  });

  it('once the master switch is on, an enabled agent shows as working; the monthly cap is read, not invented', async () => {
    await deps.resolver.set('ai.enabled', true, INSTALLATION, {});
    await deps.resolver.set('ai.monthlyCapMinor', 500_00, INSTALLATION, { ownerApproved: true });
    await ask('POST', controller, { key: 'bhandari', enabled: true });
    const { a } = await ask('GET', reader);
    expect(a.view.masterOn).toBe(true);
    expect(a.view.monthlyCapMinor).toBe(500_00);
    expect(a.agents.find((x) => x.key === 'bhandari')?.workingNow).toBe(true);
    // 'doot' was also left on by an earlier test in this file (shared state, like audit.db.test.ts); both now work
    expect(a.view.runningNow).toBe(a.agents.filter((x) => x.enabled).length);
    expect(a.view.runningNow).toBeGreaterThanOrEqual(1);
  });

  it("sums today's and this month's cost from AiUsageLedger, in the store's own day — never an earlier or later one", async () => {
    const doot = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'doot' } });
    await t.prisma.aiUsageLedger.createMany({
      data: [
        { agentId: doot.id, storeId: MOTHER_STORE_ID, providerKey: 'mock', modelKey: 'mock', idempotencyKey: 'u1', costUsdMicros: 1n, costMinor: 150, createdAt: now }, // today
        { agentId: doot.id, storeId: MOTHER_STORE_ID, providerKey: 'mock', modelKey: 'mock', idempotencyKey: 'u2', costUsdMicros: 1n, costMinor: 90, createdAt: new Date('2026-11-05T10:00:00Z') }, // earlier this month
        { agentId: doot.id, storeId: MOTHER_STORE_ID, providerKey: 'mock', modelKey: 'mock', idempotencyKey: 'u3', costUsdMicros: 1n, costMinor: 777, createdAt: new Date('2026-10-20T10:00:00Z') }, // last month: excluded
      ],
    });
    await t.prisma.aiDiaryEntry.create({ data: { agentId: doot.id, storeId: MOTHER_STORE_ID, date: new Date('2026-11-11T00:00:00Z'), summaryBn: 'পরীক্ষার কাজ' } });
    const { a } = await ask('GET', reader);
    const d = a.agents.find((x) => x.key === 'doot')!;
    expect(d.todayMinor).toBe(150);
    expect(d.monthMinor).toBe(240);
    expect(d.lastActivity).toMatchObject({ summaryBn: 'পরীক্ষার কাজ' });
    expect(a.view.todayMinor).toBe(150);
    expect(a.view.monthMinor).toBe(240);
  });

  it('model options (PR 307): the practice writer plus four not-ready providers until one is keyed and Tested', async () => {
    const { a } = await ask('GET', reader);
    expect(a.view.recommendedProvider).toBeNull();
    expect(a.view.modelOptions).toHaveLength(5);
    expect(a.view.modelOptions.find((o) => o.provider === null)).toMatchObject({ ready: true, modelId: null });
    for (const p of ['anthropic', 'openAi', 'googleAi', 'openRouter']) {
      expect(a.view.modelOptions.find((o) => o.provider === p)).toMatchObject({ ready: false, modelId: null });
    }
    for (const ag of a.agents) expect(ag).toMatchObject({ selectedProvider: null, selectedReady: true });
  });

  it('a model pick is refused for an unknown agent, an unknown provider, or a provider not yet Tested (PR 307)', async () => {
    expect((await ask('POST', reader, { key: 'doot', provider: 'anthropic' })).status).toBe(403);
    expect((await ask('POST', controller, { key: 'not-an-agent', provider: 'anthropic' })).a).toMatchObject({ ok: false, error: 'NOT_FOUND' });
    expect((await ask('POST', controller, { key: 'doot', provider: 'not-a-provider' })).a).toMatchObject({ ok: false, error: 'UNKNOWN_PROVIDER' });
    expect((await ask('POST', controller, { key: 'doot', provider: 'anthropic' })).a).toMatchObject({ ok: false, error: 'PROVIDER_NOT_READY' });
    const again = await ask('GET', reader);
    expect(again.a.agents.find((x) => x.key === 'doot')?.selectedProvider).toBeNull();
  });

  it('once a provider is enabled and Tested it becomes ready, is recommended, and an agent can be pointed at it (PR 307); a double tap writes once; falling back is honest', async () => {
    await t.prisma.integration.create({
      data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] },
    });
    const ready = await ask('GET', reader);
    expect(ready.a.view.recommendedProvider).toBe('anthropic');
    expect(ready.a.view.modelOptions.find((o) => o.provider === 'anthropic')).toMatchObject({ ready: true, modelId: 'claude-sonnet-5' });

    const auditBefore = await t.prisma.auditLog.count({ where: { action: 'ai.agent.model' } });
    const picked = await ask('POST', controller, { key: 'doot', provider: 'anthropic' });
    expect(picked.status).toBe(200);
    expect(picked.a.agents.find((x) => x.key === 'doot')).toMatchObject({ selectedProvider: 'anthropic', selectedReady: true });
    await ask('POST', controller, { key: 'doot', provider: 'anthropic' }); // same value again
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.agent.model' } })).toBe(auditBefore + 1);

    // the connection goes dark again (disabled) — the stored pick stays, but it is honestly no longer ready
    await t.prisma.integration.updateMany({ where: { kind: 'AI_PROVIDER', provider: 'anthropic' }, data: { enabled: false } });
    const fallen = await ask('GET', reader);
    expect(fallen.a.agents.find((x) => x.key === 'doot')).toMatchObject({ selectedProvider: 'anthropic', selectedReady: false });

    const back = await ask('POST', controller, { key: 'doot', provider: null });
    expect(back.a.agents.find((x) => x.key === 'doot')).toMatchObject({ selectedProvider: null, selectedReady: true });
  });
});
