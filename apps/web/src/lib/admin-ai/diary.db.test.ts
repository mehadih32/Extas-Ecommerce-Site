// S15 · PR 319 — the AI diary writer and the owner's own read screen, on a real PostgreSQL. `recordDiaryEntry` is
// called straight, not through a route (no HTTP handler exists for it — nothing user-facing writes a diary entry;
// a future agent runner will, the same honest gap PR 315's usage ledger already notes of itself). `diaryHandler`
// is the owner-facing GET, tested through the route the same way `permissions-api.db.test.ts` tests its own. A
// throwaway database (skipped without TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { diaryHandler } from './diary-api';
import { diaryView, DIARY_DEFAULT_DAYS, recordDiaryEntry, type DiaryDeps } from './diary';
import { isAiError } from './errors';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-11T10:00:00Z');
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

describe.skipIf(!HAS_TEST_DB)('AI 360 · the diary writer and its read screen on PostgreSQL (PR 319)', () => {
  let t: TestDatabase;
  let deps: DiaryDeps;
  let adminDeps: AdminDeps;
  let owner = '';
  let reader = '';

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: email, nameBn: email, permissions: perms } }), adminDeps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email, displayName: email, password: 'first password from the owner' } }), adminDeps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', '/api/admin/staff-roles', { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), adminDeps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email, password: 'first password from the owner' } }), adminDeps));
    return cookiesOf(await passwordHandler(call('POST', '/api/admin/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), adminDeps));
  };

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, resolver, now: () => NOW };
    adminDeps = { db: t.prisma, resolver, vault: null, now: () => NOW };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), adminDeps));
    reader = await staff('reader@example.com', ['ai.read']);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('throws for an unknown agent key, or an empty summary — never inventing one', async () => {
    await expect(recordDiaryEntry(deps, { storeId: S, agentKey: 'nobody' as never, summaryBn: 'x' })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'UNKNOWN_AGENT');
    await expect(recordDiaryEntry(deps, { storeId: S, agentKey: 'prohori', summaryBn: '   ' })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'INVALID_INPUT');
    expect(await t.prisma.aiDiaryEntry.count()).toBe(0);
  });

  it('writes one line for a real agent, following the store, and shows up newest-first on the view', async () => {
    const { id } = await recordDiaryEntry(deps, { storeId: S, agentKey: 'tirondaj', summaryBn: 'ফেসবুক বিজ্ঞাপনের বাজেট বাড়ানোর প্রস্তাব অনুমোদনে পাঠানো হয়েছে', refType: 'AiApprovalRequest', refId: 'abc-1' });
    const row = await t.prisma.aiDiaryEntry.findUniqueOrThrow({ where: { id } });
    expect(row.storeId).toBe(S);
    expect(row.summaryBn).toContain('বিজ্ঞাপন');
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'tirondaj' } });
    expect(row.agentId).toBe(agent.id);

    const view = await diaryView(deps, S);
    expect(view[0]?.id).toBe(id);
    expect(view[0]?.agentKey).toBe('tirondaj');
    expect(view[0]?.refType).toBe('AiApprovalRequest');
  });

  it('an installation-wide entry (no store) still shows up, tagged as whole-system', async () => {
    const { id } = await recordDiaryEntry(deps, { storeId: null, agentKey: 'prohori', summaryBn: 'সার্ভার, ব্যাকআপ আর ডিস্কের জায়গা দেখা হয়েছে — সব ঠিক আছে' });
    const view = await diaryView(deps, S);
    expect(view.find((r) => r.id === id)?.storeId).toBeNull();
  });

  it('filters by agent, and refuses an unknown agent filter rather than silently showing everyone', async () => {
    const onlyTirondaj = await diaryView(deps, S, { agentKey: 'tirondaj' });
    expect(onlyTirondaj.every((r) => r.agentKey === 'tirondaj')).toBe(true);
    expect(onlyTirondaj.length).toBeGreaterThan(0);
    await expect(diaryView(deps, S, { agentKey: 'nobody' })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'UNKNOWN_AGENT');
  });

  it('an entry older than the window falls out of the default-days view but is still in the database', async () => {
    const old = new Date(NOW.getTime() - (DIARY_DEFAULT_DAYS + 5) * 24 * 60 * 60 * 1000);
    const { id } = await recordDiaryEntry(deps, { storeId: S, agentKey: 'bhandari', summaryBn: 'পুরোনো একটা দিনের এন্ট্রি', at: old });
    await t.prisma.aiDiaryEntry.update({ where: { id }, data: { createdAt: old } });
    expect((await diaryView(deps, S)).some((r) => r.id === id)).toBe(false);
    expect((await diaryView(deps, S, { days: 30 })).some((r) => r.id === id)).toBe(true);
    expect(await t.prisma.aiDiaryEntry.count({ where: { id } })).toBe(1); // never deleted, only out of the default window
  });

  it('GET needs only ai.read; POST is refused outright — the owner reads this screen, never writes to it', async () => {
    expect((await diaryHandler(call('GET', '/api/admin/ai/diary'), adminDeps)).status).toBe(401);
    expect((await diaryHandler(call('GET', '/api/admin/ai/diary', { cookie: reader }), adminDeps)).status).toBe(200);
    expect((await diaryHandler(call('POST', '/api/admin/ai/diary', { cookie: reader }), adminDeps)).status).toBe(405);
  });

  it('GET answers the same rows diaryView would, honouring ?agent= and ?days=', async () => {
    const res = await diaryHandler(call('GET', '/api/admin/ai/diary?agent=tirondaj', { cookie: reader }), adminDeps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; entries: { agentKey: string }[] };
    expect(body.ok).toBe(true);
    expect(body.entries.every((e) => e.agentKey === 'tirondaj')).toBe(true);

    const wide = await diaryHandler(call('GET', '/api/admin/ai/diary?days=30', { cookie: reader }), adminDeps);
    const wideBody = (await wide.json()) as { entries: unknown[] };
    expect(wideBody.entries.length).toBeGreaterThanOrEqual(3);
  });
});
