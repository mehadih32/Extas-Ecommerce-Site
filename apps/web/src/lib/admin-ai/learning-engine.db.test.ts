// S15 · PR 585 — the continuous learning engine on PostgreSQL (/api/admin/ai/learning): ships off, so proposing a
// tip, grading a practice task or proposing a paid tool is refused while curating a source still works; turning it
// on is `ai.control` and a stale card version is refused; a tip passes the quality gate on an official-docs source
// or on `minIndependentSources` distinct sources, never on fewer, and a failed tip is kept with the register row's
// own exact "doesn't work for us"; a verified tip becomes a skill through `fixes.ts`'s own `proposeSkill` (the one
// `AiSkill`/`ai.skill` queue every other skill proposal shares) and only once; a practice task is graded once; a
// paid-tool proposal lands in the one generic `AI › Approvals` queue under its own kind. A throwaway database
// (skipped without TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { learningEngineHandler } from './learning-engine-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const PATH = '/api/admin/ai/learning';

function call(method: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.70' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${PATH}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

interface SourceRow {
  id: string;
  agentKey: string;
  kind: string;
  url: string;
  enabled: boolean;
}
interface TipRow {
  id: string;
  agentKey: string;
  sourceId: string | null;
  tip: string;
  status: string;
  skillKey: string | null;
  verification: { method: string | null; citedSourceIds: string[]; note?: string } | null;
}
interface TaskRow {
  id: string;
  status: string;
  grade: string | null;
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  card?: { key: string; value: { on: boolean; minIndependentSources: number }; version: string };
  sources?: SourceRow[];
  tips?: TipRow[];
  practiceTasks?: TaskRow[];
}

describe.skipIf(!HAS_TEST_DB)('the continuous learning engine for Tirondaj and Doot on PostgreSQL (PR 585)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let agent = '';
  let reader = '';

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(call('POST', { cookie: owner, body: { nameEn: email, nameBn: email, permissions: perms } }), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', { cookie: owner, body: { email, displayName: email, password: 'first password from the owner' } }), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', { body: { email, password: 'first password from the owner' } }), deps));
    return cookiesOf(await passwordHandler(call('POST', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    agent = await staff('learning-agent@example.com', ['ai.read', 'ai.control', 'ai.skills.write']);
    reader = await staff('learning-reader@example.com', ['ai.read']);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, cookie = owner) => {
    const res = await learningEngineHandler(call(method, { cookie, body: b }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  it('ships off: the card says so, and a reader sees the empty screen', async () => {
    expect((await learningEngineHandler(call('GET'), deps)).status).toBe(401);
    const { status, a } = await send('GET', undefined, reader);
    expect(status).toBe(200);
    expect(a.card).toMatchObject({ value: { on: false } });
    expect(a.sources).toEqual([]);
    expect(a.tips).toEqual([]);
    expect(a.practiceTasks).toEqual([]);
  });

  it('curating a source works even while the engine is off (prep, not running)', async () => {
    const bad = await send('POST', { action: 'addSource', agentKey: 'gyani', kind: 'official_docs', url: 'https://ads.google.com/' }, agent);
    expect(bad.a).toMatchObject({ ok: false, error: 'NOT_POWER_AGENT' });
    const noUrl = await send('POST', { action: 'addSource', agentKey: 'doot', kind: 'official_docs', url: 'not-a-url' }, agent);
    expect(noUrl.a.details).toEqual(['url']);
    const ok = await send('POST', { action: 'addSource', agentKey: 'doot', kind: 'official_docs', url: 'https://developers.google.com/search/docs' }, agent);
    expect(ok.status).toBe(200);
    expect(ok.a.sources).toHaveLength(1);
    expect(ok.a.sources![0]).toMatchObject({ agentKey: 'doot', kind: 'official_docs', enabled: false });
  });

  it('every other write is refused while the engine is off', async () => {
    const off = await send('POST', { action: 'proposeTip', agentKey: 'doot', tip: 'ship it anyway' }, agent);
    expect(off.a).toMatchObject({ ok: false, error: 'ENGINE_OFF' });
    const offTask = await send('POST', { action: 'createPracticeTask', agentKey: 'doot', title: 'x', goal: 'y' }, agent);
    expect(offTask.a.error).toBe('ENGINE_OFF');
    const offTool = await send('POST', { action: 'proposePaidTool', agentKey: 'doot', toolName: 'SEMrush', costAmount: 1000, reason: 'keyword data' }, agent);
    expect(offTool.a.error).toBe('ENGINE_OFF');
  });

  it('only the right permission turns the engine on, and a stale version is refused', async () => {
    const card = (await send('GET', undefined, reader)).a.card!;
    expect((await send('PUT', { key: 'learningEngine', value: { on: true, minIndependentSources: 2 }, version: card.version }, reader)).status).toBe(403);
    expect((await send('PUT', { key: 'learningEngine', value: { on: true, minIndependentSources: 2 }, version: 'stale' })).a.error).toBe('BUSY');
    expect((await send('PUT', { key: 'learningEngine', value: { on: true, minIndependentSources: 9 }, version: card.version })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['minIndependentSources'] });
    const on = await send('PUT', { key: 'learningEngine', value: { on: true, minIndependentSources: 2 }, version: card.version });
    expect(on.status).toBe(200);
    expect(on.a.card).toMatchObject({ value: { on: true, minIndependentSources: 2 } });
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.learningEngine.save' } })).toBe(1);
  });

  it('a second practitioner-blog source for Doot, so the two-independent-sources path has something to cite', async () => {
    const res = await send('POST', { action: 'addSource', agentKey: 'doot', kind: 'practitioner_blog', url: 'https://example.com/seo-notes' }, agent);
    expect(res.a.sources).toHaveLength(2);
  });

  it('a tip checked against only one blog (below minIndependentSources, no official doc) fails the gate — kept, not thrown away', async () => {
    const blog = (await send('GET', undefined, reader)).a.sources!.find((s) => s.kind === 'practitioner_blog')!;
    const propose = await send('POST', { action: 'proposeTip', agentKey: 'doot', tip: 'add alt text to every product image', sourceId: blog.id }, agent);
    expect(propose.status).toBe(200);
    const tip = propose.a.tips!.find((x) => x.sourceId === blog.id)!;
    expect(tip.status).toBe('candidate');
    const verify = await send('POST', { action: 'verifyTip', tipId: tip.id, testNote: 'tried it on 3 product pages, no change in a day' }, agent);
    expect(verify.status).toBe(200);
    const failed = verify.a.tips!.find((x) => x.id === tip.id)!;
    expect(failed.status).toBe('failed');
    expect(failed.verification).toMatchObject({ method: null, note: "doesn't work for us" });
    // checking a non-candidate tip again is refused
    expect((await send('POST', { action: 'verifyTip', tipId: tip.id, testNote: 'again' }, agent)).a.error).toBe('NOT_CANDIDATE');
  });

  it('a tip checked against the official-docs source passes, and only then may it become a skill', async () => {
    const docs = (await send('GET', undefined, reader)).a.sources!.find((s) => s.kind === 'official_docs')!;
    const propose = await send('POST', { action: 'proposeTip', agentKey: 'doot', tip: 'submit a sitemap for faster indexing', sourceId: docs.id }, agent);
    const tip = propose.a.tips!.find((x) => x.sourceId === docs.id)!;
    const missingNote = await send('POST', { action: 'verifyTip', tipId: tip.id, testNote: '' }, agent);
    expect(missingNote.a.details).toEqual(['testNote']);
    const verify = await send('POST', { action: 'verifyTip', tipId: tip.id, testNote: 'submitted via Search Console on a sample page; indexed next day', confidence: 'high' }, agent);
    const verified = verify.a.tips!.find((x) => x.id === tip.id)!;
    expect(verified).toMatchObject({ status: 'verified' });
    expect(verified.verification).toMatchObject({ method: 'official_doc' });

    // only ai.skills.write may promote
    expect((await send('POST', { action: 'promoteTip', tipId: tip.id, name: 'Sitemap submission' }, reader)).status).toBe(403);
    const promote = await send('POST', { action: 'promoteTip', tipId: tip.id, name: 'Sitemap submission', purpose: 'Faster indexing' }, agent);
    expect(promote.status).toBe(200);
    const promoted = promote.a.tips!.find((x) => x.id === tip.id)!;
    expect(promoted.status).toBe('promoted');
    expect(promoted.skillKey).toBe(`learned-doot-${tip.id.slice(0, 8)}`);
    const skill = await t.prisma.aiSkill.findUniqueOrThrow({ where: { key: promoted.skillKey! } });
    expect(skill).toMatchObject({ status: 'proposed', enabled: false, sourceRef: 'doot' });
    const version = await t.prisma.aiSkillVersion.findFirstOrThrow({ where: { skillId: skill.id } });
    expect(version.content).toContain('Source: https://developers.google.com/search/docs (official_docs)');
    expect(version.content).toContain('Confidence: high');

    // promoting again is refused — a verified tip is promoted only once
    expect((await send('POST', { action: 'promoteTip', tipId: tip.id, name: 'again' }, agent)).a.error).toBe('ALREADY_PROMOTED');
  });

  it('two independent sources (no official doc among them) also pass the gate', async () => {
    const extra = await send('POST', { action: 'addSource', agentKey: 'doot', kind: 'case_study', url: 'https://example.com/case-study' }, agent);
    const caseStudy = extra.a.sources!.find((s) => s.kind === 'case_study')!;
    const blog = extra.a.sources!.find((s) => s.kind === 'practitioner_blog')!;
    const propose = await send('POST', { action: 'proposeTip', agentKey: 'doot', tip: 'rewrite titles under 60 characters', sourceId: blog.id }, agent);
    const tip = propose.a.tips!.find((x) => x.tip.includes('60 characters'))!;
    const verify = await send('POST', { action: 'verifyTip', tipId: tip.id, testNote: 'rewrote 5 titles, CTR looked steady over a week', supportingSourceIds: [caseStudy.id] }, agent);
    const verified = verify.a.tips!.find((x) => x.id === tip.id)!;
    expect(verified.status).toBe('verified');
    expect(verified.verification).toMatchObject({ method: 'two_sources' });
  });

  it('archiving a source is a soft delete — it keeps enabled off and the tip that cited it keeps its history', async () => {
    const before = (await send('GET', undefined, reader)).a.sources!.find((s) => s.kind === 'case_study')!;
    const citingTip = (await send('GET', undefined, reader)).a.tips!.find((x) => x.verification?.citedSourceIds?.includes(before.id))!;
    expect(citingTip).toBeTruthy();
    const archived = await send('POST', { action: 'archiveSource', id: before.id }, agent);
    expect(archived.a.sources!.some((s) => s.id === before.id)).toBe(false);
    expect(await t.prisma.aiLearningSource.findUniqueOrThrow({ where: { id: before.id } })).toMatchObject({ enabled: false, archivedAt: expect.anything() });
    // the tip that cited the now-archived source still reads its own citation — nothing is deleted
    const after = (await send('GET', undefined, reader)).a.tips!.find((x) => x.id === citingTip.id)!;
    expect(after.verification?.citedSourceIds).toContain(before.id);
  });

  it('a practice task is created, graded once, and a second grading is refused', async () => {
    const created = await send('POST', { action: 'createPracticeTask', agentKey: 'tirondaj', title: 'Keep a test campaign under the CPA cap', goal: 'CPA under the set ceiling for 3 days', deadline: '2026-12-01' }, agent);
    expect(created.status).toBe(200);
    const task = created.a.practiceTasks!.find((x) => x.status === 'open')!;
    const badGrade = await send('POST', { action: 'gradePracticeTask', id: task.id, status: 'done', grade: 'A+' }, agent);
    expect(badGrade.a.details).toEqual(['grade']);
    const graded = await send('POST', { action: 'gradePracticeTask', id: task.id, status: 'done', grade: 'pass' }, agent);
    expect(graded.a.practiceTasks!.find((x) => x.id === task.id)).toMatchObject({ status: 'done', grade: 'pass' });
    expect((await send('POST', { action: 'gradePracticeTask', id: task.id, status: 'missed', grade: 'fail' }, agent)).a.error).toBe('BUSY');
  });

  it('a paid-tool proposal lands in the one generic approvals queue under its own kind', async () => {
    const bad = await send('POST', { action: 'proposePaidTool', agentKey: 'tirondaj', toolName: 'SEMrush', costAmount: -5, reason: 'competitor keywords' }, agent);
    expect(bad.a.details).toEqual(['costAmount']);
    const req = await send('POST', { action: 'proposePaidTool', agentKey: 'tirondaj', toolName: 'SEMrush', costAmount: 4500, costCurrency: 'BDT', reason: 'competitor keyword and ad-spend research' }, agent);
    expect(req.status).toBe(200);
    const row = await t.prisma.aiApprovalRequest.findFirstOrThrow({ where: { kind: 'ai.paidTool' } });
    expect(row).toMatchObject({ status: 'PENDING', agentKey: 'tirondaj', title: 'SEMrush' });
    expect(row.payload).toMatchObject({ toolName: 'SEMrush', costAmount: 4500, costCurrency: 'BDT' });
  });

  it('nothing above was ever deleted', async () => {
    expect(await t.prisma.aiLearningSource.count()).toBe(3);
    expect(await t.prisma.aiLearningTip.count()).toBeGreaterThanOrEqual(3);
    expect(await t.prisma.aiPracticeTask.count()).toBe(1);
  });
});
