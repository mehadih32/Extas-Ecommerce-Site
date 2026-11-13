// S15 · PR 580 — AI › Model picks on PostgreSQL (/api/admin/ai/models): off on a fresh installation
// (`ai.modelAutoSuggest.enabled` defaults false, CLAUDE.md's "every AI feature ships off"); turning it on and every
// mutation needs `ai.control`, `ai.read` alone only ever reads; nothing is ever "suggested" until a real Re-test
// has actually run and been persisted; Accept applies exactly the Cost Book's own `setJobSelectedModel`, so the two
// screens can never disagree. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL, like every other
// `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { JOB_CATALOG } from './cost-book';
import { modelQualificationHandler } from './model-qualification-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.44' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}/api/admin/ai/models`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

interface Candidate {
  modelKey: string;
  isFree: boolean;
  blocked: boolean;
  passed: boolean | null;
  costPer100RunsUsdMinor: number;
}
interface Job {
  key: string;
  selectedModelKey: string;
  barPercent: number;
  candidates: Candidate[];
  testedAt: string | null;
  suggested: Candidate | null;
  isOptimal: boolean;
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  enabled: boolean;
  jobs: Job[];
  freeModelCount: number;
  betterPicksWaiting: number;
}

describe.skipIf(!HAS_TEST_DB)('AI › Model picks on PostgreSQL (PR 580)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  let controller = '';
  const now = new Date('2026-11-13T10:00:00Z');

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
    const res = await modelQualificationHandler(call(method, { cookie, body }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null, now: () => now };
    owner = cookiesOf(await loginHandler(call('POST', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    reader = await staff('reader@example.com', ['ai.read']);
    controller = await staff('controller@example.com', ['ai.read', 'ai.control']);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('ships off: GET shows enabled=false and no jobs until the owner turns it on', async () => {
    const { status, a } = await ask('GET', reader);
    expect(status).toBe(200);
    expect(a.enabled).toBe(false);
    expect(a.jobs).toHaveLength(0);
  });

  it('only ai.control may turn it on; ai.read alone is refused', async () => {
    expect((await ask('POST', reader, { enabled: true })).status).toBe(403);
    const ok = await ask('POST', controller, { enabled: true });
    expect(ok.status).toBe(200);
    expect(ok.a.enabled).toBe(true);
    expect(ok.a.jobs).toHaveLength(JOB_CATALOG.length);
    expect(ok.a.freeModelCount).toBeGreaterThan(0);
  });

  it('once on, every job is honestly "not tested yet" and suggests nothing, even though the math would pass', async () => {
    const { a } = await ask('GET', reader);
    const job = a.jobs.find((j) => j.key === 'seoAltText')!; // doot · publicDraft · small — a free model would pass
    expect(job.testedAt).toBeNull();
    expect(job.suggested).toBeNull();
    expect(job.isOptimal).toBe(true); // nothing to suggest yet, so "already optimal" by default
  });

  it('Re-test now (ai.control) persists a real date and a real suggestion; ai.read alone cannot trigger it', async () => {
    expect((await ask('POST', reader, { jobKey: 'seoAltText', retest: true })).status).toBe(403);
    const r = await ask('POST', controller, { jobKey: 'seoAltText', retest: true });
    expect(r.status).toBe(200);
    const job = r.a.jobs.find((j) => j.key === 'seoAltText')!;
    expect(job.testedAt).not.toBeNull();
    expect(job.suggested).not.toBeNull();
    expect(job.candidates.some((c) => c.isFree && c.passed === true)).toBe(true);
    // re-reading (a plain GET) carries the same persisted result, not a fresh random one
    const again = await ask('GET', reader);
    expect(again.a.jobs.find((j) => j.key === 'seoAltText')?.testedAt).toBe(job.testedAt);
  });

  it('a free model is never suggested for a personal-data job, tested or not', async () => {
    await ask('POST', controller, { jobKey: 'supportReply', retest: true }); // gyani · personal
    const { a } = await ask('GET', reader);
    const job = a.jobs.find((j) => j.key === 'supportReply')!;
    expect(job.candidates.find((c) => c.isFree)?.blocked).toBe(true);
    expect(job.suggested?.isFree).not.toBe(true);
  });

  it('Accept applies the suggested model as the job\'s own pick (the same field the Cost Book reads)', async () => {
    const before = (await ask('GET', reader)).a.jobs.find((j) => j.key === 'seoAltText')!;
    expect(before.suggested).not.toBeNull();
    const r = await ask('POST', controller, { jobKey: 'seoAltText', accept: true });
    const after = r.a.jobs.find((j) => j.key === 'seoAltText')!;
    expect(after.selectedModelKey).toBe(before.suggested!.modelKey);
    expect(after.isOptimal).toBe(true);
    // accepting again is a harmless no-op
    const again = await ask('POST', controller, { jobKey: 'seoAltText', accept: true });
    expect(again.a.jobs.find((j) => j.key === 'seoAltText')?.selectedModelKey).toBe(before.suggested!.modelKey);
  });

  it('the quality bar is one of 90/95/98 only, owned per job, and never resets on a reseed', async () => {
    expect((await ask('POST', controller, { jobKey: 'seoAltText', barPercent: 93 })).a).toMatchObject({ ok: false, error: 'INVALID_BAR' });
    const ok = await ask('POST', controller, { jobKey: 'seoAltText', barPercent: 90 });
    expect(ok.a.jobs.find((j) => j.key === 'seoAltText')?.barPercent).toBe(90);
    const again = await ask('GET', reader);
    expect(again.a.jobs.find((j) => j.key === 'seoAltText')?.barPercent).toBe(90);
  });

  it('turning the feature back off hides every job again, without losing the owner\'s own picks or bars underneath', async () => {
    await ask('POST', controller, { enabled: false });
    const off = await ask('GET', reader);
    expect(off.a.enabled).toBe(false);
    expect(off.a.jobs).toHaveLength(0);
    const back = await ask('POST', controller, { enabled: true });
    const job = back.a.jobs.find((j) => j.key === 'seoAltText')!;
    expect(job.barPercent).toBe(90); // the owner's own earlier choice survived the switch-off
  });

  it('an unknown job key is refused on every mutating shape', async () => {
    expect((await ask('POST', controller, { jobKey: 'not-a-job', retest: true })).a).toMatchObject({ ok: false, error: 'UNKNOWN_JOB' });
    expect((await ask('POST', controller, { jobKey: 'not-a-job', accept: true })).a).toMatchObject({ ok: false, error: 'UNKNOWN_JOB' });
  });

  it('Re-test all (ai.control) tests every catalogue job in one call', async () => {
    const r = await ask('POST', controller, { retestAll: true });
    expect(r.status).toBe(200);
    expect(r.a.jobs.every((j) => j.testedAt !== null)).toBe(true);
  });

  it('Accept all applies every job whose suggestion differs from its current pick, in one pass', async () => {
    const r = await ask('POST', controller, { acceptAll: true });
    expect(r.status).toBe(200);
    expect(r.a.jobs.every((j) => j.isOptimal)).toBe(true);
  });
});
