// S12 · PR 245 — the publish calendar on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the days ahead and
// free times in the shop's time zone; "Fill the free times" places the finished articles with nothing missing, the
// topic's priority first, skips one with words missing, and needs `blog.publish`; the card saved with its version
// (stale and bad times refused); scheduling by hand refused on a full day (DAY_FULL); with "place by itself" on, an
// article whose last review step passes takes the next free time; the month view and a picked day; signed out 401.
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { journalAction } from './journal';
import { calendarHandler, fillCalendar } from './schedule';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.63' };
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
async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › Calendar on PostgreSQL (PR 245)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let ownerActor: Actor;
  let writer: Actor;
  const S = MOTHER_STORE_ID;
  const clock = { now: new Date('2026-11-06T06:00:00Z') }; // 12:00 in Dhaka
  const ctx = { ip: '192.0.2.63', userAgent: 'SampleBrowser/1.0' };
  const cal = async (method: string, body?: unknown, q = '', cookie = owner) => {
    const r = await calendarHandler(call(method, `/api/admin/blog/calendar${q}`, cookie, body), deps);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const post = async (title: string, status: string, body: string, topicPriority?: number) => {
    const topicId = topicPriority ? (await t.prisma.blogTopic.create({ data: { storeId: S, title, source: 'staff', priority: topicPriority, status: 'approved' } })).id : null;
    return (await t.prisma.blogPost.create({ data: { storeId: S, locale: 'en', slug: title.toLowerCase().replace(/\W+/g, '-'), title, body, status: status as never, topicId } })).id;
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('calendar');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    ownerActor = { staffUserId: (await t.prisma.staffUser.findFirstOrThrow({ where: { email: 'owner@example.com' } })).id };
    const role = await createRole(t.prisma, SYSTEM, { key: 'cal-writer', nameEn: 'cal-writer', nameBn: 'cal-writer', permissions: ['blog.read', 'blog.write'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'writer@example.com', displayName: 'writer', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    writer = { staffUserId: u.id };
  });
  afterAll(async () => t?.drop());

  let first = '';
  let second = '';

  it('shows the days ahead in the shop time zone with their free times; signed out 401', async () => {
    expect((await cal('GET', undefined, '', '')).status).toBe(401);
    const g = await cal('GET');
    expect(g.status).toBe(200);
    const c = g.j.calendar;
    expect(c).toMatchObject({ timeZone: 'Asia/Dhaka', today: '2026-11-06', slots: ['09:00', '12:00', '15:00', '18:00', '21:00'], ready: [] });
    expect(c.days).toHaveLength(7);
    // 12:00 is too close to now (15 minutes): today keeps 15:00, 18:00, 21:00
    expect(c.days[0].rows.map((r: any) => r.time)).toEqual(['15:00', '18:00', '21:00']);
    expect(c.free).toBe(3 + 6 * 5);
    expect(c.days[1]).toMatchObject({ count: 0, low: true });
    expect(g.j.cards['blog.schedule'].value.autoFill).toBe(false);
  });

  it('fills the free times with the finished articles, priority first, and skips one with words missing', async () => {
    first = await post('Low priority care guide', 'SEO_CHECKED', 'Wash cold, dry flat.', 2);
    second = await post('Urgent polo guide', 'SEO_CHECKED', 'Button it up before washing.', 1);
    const empty = await post('Empty article', 'SEO_CHECKED', '');
    expect(await code(fillCalendar(t.prisma, deps.resolver, { actor: writer, ctx }, {}, clock.now))).toBe('FORBIDDEN');
    const f = await cal('POST', { action: 'fill' });
    expect(f.j).toMatchObject({ ok: true, placed: 2, skipped: 1, free: 31 });
    const rows = await t.prisma.blogPost.findMany({ where: { id: { in: [first, second] } }, select: { id: true, status: true, scheduledAt: true, publishedAt: true } });
    const at = Object.fromEntries(rows.map((r) => [r.id, r.scheduledAt?.toISOString()]));
    expect(at[second]).toBe('2026-11-06T09:00:00.000Z'); // 15:00 in Dhaka
    expect(at[first]).toBe('2026-11-06T12:00:00.000Z'); // 18:00 in Dhaka
    expect(rows.every((r) => r.status === 'SCHEDULED' && r.publishedAt?.getTime() === r.scheduledAt?.getTime())).toBe(true);
    const c = f.j.calendar;
    expect(c.ready).toEqual([expect.objectContaining({ id: empty, gaps: ['body'] })]);
    expect(c.days[0].rows.map((r: any) => [r.time, r.post?.id ?? null])).toEqual([
      ['15:00', second],
      ['18:00', first],
      ['21:00', null],
    ]);
    expect(c.month.counts['2026-11-06']).toEqual({ live: 0, scheduled: 2 });
    expect(await t.prisma.auditLog.count({ where: { action: 'blog.post.schedule', entityId: { in: [first, second] } } })).toBe(2);
    expect((await cal('POST', { action: 'nope' })).j.error).toBe('INVALID_INPUT');
  });

  it('saves the card with its version, refuses bad times and a stale version; scheduling by hand stops at the most a day', async () => {
    const g = await cal('GET');
    const card = g.j.cards['blog.schedule'];
    expect((await cal('PUT', { key: 'blog.schedule', value: { ...card.value, slots: '9:00' }, version: card.version })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['slots'] });
    expect((await cal('PUT', { key: 'blog.schedule', value: { ...card.value, perDayMin: 3, perDayTarget: 2 }, version: card.version })).j.error).toBe('INVALID_INPUT');
    const saved = await cal('PUT', { key: 'blog.schedule', value: { ...card.value, slots: '21:00,09:00,15:00, 18:00', perDayMin: 1, perDayTarget: 2, perDayMax: 2 }, version: card.version });
    expect(saved.status).toBe(200);
    expect(saved.j.cards['blog.schedule'].value).toMatchObject({ slots: '09:00, 15:00, 18:00, 21:00', perDayMax: 2 });
    expect((await cal('PUT', { key: 'blog.schedule', value: card.value, version: card.version })).j.error).toBe('STALE');
    // today already holds 2 = the most a day
    const third = await post('Third guide', 'SEO_CHECKED', 'Iron inside out.');
    const v = (await t.prisma.blogPost.findUniqueOrThrow({ where: { id: third } })).updatedAt.toISOString();
    const who = { actor: ownerActor, ctx };
    expect(await code(journalAction(t.prisma, deps.resolver, who, third, { action: 'schedule', version: v, scheduledAt: '2026-11-06T14:00:00Z' }, clock.now))).toBe('DAY_FULL');
    const moved = await journalAction(t.prisma, deps.resolver, who, third, { action: 'schedule', version: v, scheduledAt: '2026-11-07T04:00:00Z' }, clock.now);
    expect(moved.status).toBe('SCHEDULED');
  });

  it('with "place by itself" on, an article whose last review step passes takes the next free time', async () => {
    const g = await cal('GET');
    const card = g.j.cards['blog.schedule'];
    expect((await cal('PUT', { key: 'blog.schedule', value: { ...card.value, autoFill: true }, version: card.version })).status).toBe(200);
    const id = await post('Auto placed guide', 'FACT_CHECKED', 'Fold it in thirds.', 2);
    const v = (await t.prisma.blogPost.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
    const after = await journalAction(t.prisma, deps.resolver, { actor: ownerActor, ctx }, id, { action: 'pass', version: v }, clock.now);
    expect(after.status).toBe('SCHEDULED');
    // today is full (2); tomorrow holds one at 10:00, so 09:00 is the next free time
    expect(after.scheduledAt).toBe('2026-11-07T03:00:00.000Z');
    expect(await t.prisma.auditLog.count({ where: { action: 'blog.post.autoSchedule', entityId: id } })).toBe(1);
  });

  it('opens another month and a picked day', async () => {
    const m = await cal('GET', undefined, '?month=2026-12&day=2026-11-06');
    expect(m.j.calendar.month).toMatchObject({ key: '2026-12', prev: '2026-11', next: '2027-01' });
    expect(m.j.calendar.day.key).toBe('2026-11-06');
    expect(m.j.calendar.day.posts.map((p: any) => p.id)).toEqual([second, first]);
    const bad = await cal('GET', undefined, '?month=2026-13&day=nope');
    expect(bad.j.calendar.month.key).toBe('2026-11');
    expect(bad.j.calendar.day).toBeNull();
  });
});
