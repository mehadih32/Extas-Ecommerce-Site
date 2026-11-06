// S12 · PR 591 — the blog content pipeline on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the queue's
// counts, what to write next, the review queue with its writer and a stuck article, the refresh list; the pace (off →
// the calendar's own target; on → 5 a day after the ramp while healthy, 3 while indexing is unknown or too many
// articles are sent back) and the calendar's fill following it; the card saved by `blog.publish` only, audited, a stale
// or bad value refused; signed out 401. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, hashPassword, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { pipelineHandler } from './pipeline';
import { calendarHandler } from './schedule';

const HOST = 'admin.example.test';
const PW = 'a long sentence for the tests';
const DAY = 86_400_000;

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.64' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › Pipeline on PostgreSQL (PR 591)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let writerCookie = '';
  let writerId = '';
  const S = MOTHER_STORE_ID;
  const now = new Date('2026-11-06T06:00:00Z'); // 12:00 in Dhaka
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const pipe = async (method: string, body?: unknown, cookie = owner) => {
    const r = await pipelineHandler(call(method, '/api/admin/blog/pipeline', cookie, body), deps);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const card = async (patch: Record<string, unknown>, cookie = owner) => pipe('PUT', { key: 'blog.pipeline', on: true, values: patch }, cookie);
  const free = async () => {
    const r = await calendarHandler(call('GET', '/api/admin/blog/calendar', owner), deps);
    return ((await r.json()) as { calendar: { free: number } }).calendar.free;
  };
  let n = 0;
  const post = (status: string, extra: Record<string, unknown> = {}) => {
    n += 1;
    return t.prisma.blogPost.create({ data: { storeId: S, locale: 'en', slug: `sample-${n}`, title: `Sample article ${n}`, body: 'Sample words.', status: status as never, ...extra } });
  };
  const review = (postId: string, verdict: 'pass' | 'back', at: Date) => t.prisma.blogPostReview.create({ data: { storeId: S, postId, stage: verdict === 'pass' ? 'proofread' : 'writing', verdict, createdAt: at } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('pipeline');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: PW }), deps));
    const role = await createRole(t.prisma, SYSTEM, { key: 'pipe-writer', nameEn: 'pipe-writer', nameBn: 'pipe-writer', permissions: ['blog.read', 'blog.write'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'writer@example.com', displayName: 'Sample writer', passwordHash: await hashPassword(PW), passwordSetAt: new Date() } });
    writerId = u.id;
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    writerCookie = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'writer@example.com', password: PW }), deps));

    // the first live article 200 days ago (not edited since: due a refresh), another 20 days ago
    await post('PUBLISHED', { publishedAt: ago(20), contentUpdatedAt: ago(5) });
    await post('PUBLISHED', { publishedAt: ago(200) });
    // topics: two waiting for a yes, two approved (one started), one rejected
    await t.prisma.blogTopic.createMany({
      data: [
        { storeId: S, title: 'Sample topic waiting A', source: 'staff', priority: 5, status: 'proposed' },
        { storeId: S, title: 'Sample topic waiting B', source: 'staff', priority: 5, status: 'proposed' },
        { storeId: S, title: 'Sample topic next', source: 'staff', priority: 1, status: 'approved', isPillar: true },
        { storeId: S, title: 'Sample topic rejected', source: 'staff', priority: 1, status: 'rejected' },
      ],
    });
    const started = await post('DRAFT');
    await t.prisma.blogTopic.create({ data: { storeId: S, title: 'Sample topic started', source: 'staff', priority: 2, status: 'approved', postId: started.id } });
    // in review: a draft by the writer waiting 6 days (stuck), one proofread yesterday, one facts-checked
    await post('DRAFT', { writerStaffId: writerId, updatedAt: ago(6) });
    const proofread = await post('PROOFREAD');
    await review(proofread.id, 'pass', ago(1));
    await post('FACT_CHECKED');
    // finished, and one scheduled ahead
    await post('SEO_CHECKED');
    await post('SCHEDULED', { scheduledAt: new Date(now.getTime() + 2 * DAY), publishedAt: new Date(now.getTime() + 2 * DAY) });
    // health: two more passes in the window, an old send-back outside it
    await review(proofread.id, 'pass', ago(2));
    await review(proofread.id, 'pass', ago(3));
    await review(proofread.id, 'back', ago(30));
  });
  afterAll(async () => t?.drop());

  it('shows the queue: counts per step, what to write next, the review queue with a stuck draft, the refresh list; signed out 401', async () => {
    expect((await pipe('GET', undefined, '')).status).toBe(401);
    const g = await pipe('GET');
    expect(g.status).toBe(200);
    const s = g.j.screen;
    expect(s).toMatchObject({ today: '2026-11-06', timeZone: 'Asia/Dhaka', firstLive: '2026-04-20' });
    expect(s.flow).toEqual({ topics: 2, approved: 1, writing: 2, proofread: 1, factChecked: 1, finished: 1, scheduled: 1 });
    expect(s.writeNext.map((x: any) => x.title)).toEqual(['Sample topic next']);
    expect(s.writeNext[0].pillar).toBe(true);
    const draft = s.review.find((r: any) => r.writer === 'Sample writer');
    expect(draft).toMatchObject({ step: 'proofread', waitingDays: 6, stuck: true });
    expect(s.review.find((r: any) => r.step === 'facts')).toMatchObject({ waitingDays: 1, stuck: false });
    expect(s.stuck).toBeGreaterThanOrEqual(1);
    expect(s.refresh).toHaveLength(1);
    expect(s.refresh[0].ageDays).toBe(200);
    // off as shipped: the calendar's own target; three passes and no send-back in the window
    expect(s.pace).toEqual({ perDay: 5, reason: 'off', fullFrom: null });
    expect(s.health).toMatchObject({ backPct: 0, quality: 'ok', indexing: 'unknown', healthy: false });
  });

  it('only blog.publish saves the card; a stale or bad value is refused; a save is audited', async () => {
    expect((await card({ waitForIndexing: 'on' }, writerCookie)).status).toBe(403);
    expect((await pipe('PUT', { value: { on: true }, version: 'old' })).status).toBe(409);
    const bad = await card({ startPerDay: 6, fullPerDay: 5 });
    expect(bad.status).toBe(400);
    expect(bad.j.details).toContain('fullPerDay');
    const ok = await card({ waitForIndexing: 'on' });
    expect(ok.status).toBe(200);
    expect(ok.j.screen.card.value).toMatchObject({ on: true, waitForIndexing: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'blog.pipeline.settings' } })).toBe(1);
  });

  it('holds the start pace while indexing is unknown, and the calendar fills only up to it', async () => {
    const s = (await pipe('GET')).j.screen;
    expect(s.pace).toMatchObject({ perDay: 3, reason: 'held', fullFrom: '2026-05-04' });
    // today keeps 15:00, 18:00, 21:00 (12:00 too close); the scheduled article takes one of the 3 on its day
    expect(await free()).toBe(3 + 6 * 3 - 1);
  });

  it('runs the full pace after the ramp while healthy, and drops back when too many are sent back', async () => {
    await card({ waitForIndexing: 'off' });
    expect((await pipe('GET')).j.screen.pace).toMatchObject({ perDay: 5, reason: 'full' });
    expect(await free()).toBe(3 + 6 * 5 - 1);
    const p = await t.prisma.blogPost.findFirstOrThrow({ where: { status: 'PROOFREAD' } });
    for (let i = 0; i < 3; i += 1) await t.prisma.blogPostReview.create({ data: { storeId: S, postId: p.id, stage: 'writing', verdict: 'back', createdAt: ago(1) } });
    const s = (await pipe('GET')).j.screen;
    expect(s.health).toMatchObject({ backPct: 50, quality: 'low', healthy: false });
    expect(s.pace).toMatchObject({ perDay: 3, reason: 'held' });
    expect(s.supply).toEqual({ have: 2, want: 9, days: 0, short: 7 });
  });
});
