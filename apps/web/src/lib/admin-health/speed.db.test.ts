// S21 · PR 417 — /api/admin/health/speed on PostgreSQL: Reports › Site health › Speed reads the latest monthly lab run,
// real visitors and month by month (WebVitalDay + SpeedMeasurement) against `seo.vitals.targets`; the months card
// (`settings.write`, audited, stale versions refused); "Measure now" recorded once until a newer lab run; a read-only
// role sees the page and is refused every change with 403.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { dayIn } from '@extas/cache';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { bucketOf, p75 } from '../seo/vitals';
import { addMonths, type SpeedView } from './speed';
import { speedHandler } from './speed-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const TZ = process.env.EXTAS_TIMEZONE || process.env.TZ || 'UTC';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.24' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/health/speed'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  view: SpeedView;
}

const lcpCounts = (...values: number[]) => {
  const out: number[] = [];
  for (const v of values) out[bucketOf('LCP', v)] = (out[bucketOf('LCP', v)] ?? 0) + 1;
  return Array.from(out, (x) => x ?? 0);
};

describe.skipIf(!HAS_TEST_DB)('Reports › Site health › Speed on PostgreSQL (PR 417)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let watcher = '';
  const dir = mkdtempSync(join(tmpdir(), 'extas-state-'));
  const today = dayIn(TZ, new Date());
  const thisMonth = today.slice(0, 7);
  const lastMonth = addMonths(thisMonth, -1);

  const writeLab = (at: Date, categoryKb: number) =>
    writeFileSync(
      join(dir, 'vitals-lab.json'),
      JSON.stringify({
        at: at.toISOString(),
        sha: 'sample',
        profile: 'phone · slow 4G',
        pages: [
          { path: '/', kind: 'home', lcpMs: 1800, cls: 0.02, ttfbMs: 300, kb: 600 },
          { path: '/c/sample', kind: 'category', lcpMs: 2100, cls: 0.03, ttfbMs: 320, kb: categoryKb },
          { path: '/admin', kind: 'admin', loadMs: 800 },
        ],
      }),
    );

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = await rolesHandler(call('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Watch', nameBn: 'নজর', permissions: ['health.read'] } }), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'watch@example.com', displayName: 'Sample watcher', password: 'first password from the owner' } }), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'watch@example.com', password: 'first password from the owner' } }), deps));
    watcher = cookiesOf(await passwordHandler(call('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, stateDir: string | null = dir, cookie = owner) => {
    const res = await speedHandler(call(method, { cookie, body: b }), deps, { stateDir });
    return { status: res.status, a: (await res.json()) as Answer };
  };

  it('needs a sign-in; before any reading it shows twelve empty months and no lab run', async () => {
    expect((await speedHandler(call('GET'), deps, { stateDir: dir })).status).toBe(401);
    const { status, a } = await send('GET');
    expect(status).toBe(200);
    expect(a.view.lab).toBeNull();
    expect(a.view.runAsked).toBe(false);
    expect(a.view.cards.speed.value).toEqual({ months: 12 });
    expect(a.view.months.map((m) => m.month)).toEqual(Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, -i)));
    expect(a.view.months.every((m) => m.readings === 0 && m.lab === null && m.real.LCP.p75 === null)).toBe(true);
    expect(a.view.targets.lcpMs).toBe(2500);
  });

  it('reads real visitors per month and the lab run against the targets', async () => {
    const fast = lcpCounts(900, 1200, 1300, 1500);
    const slow = lcpCounts(3200, 3400, 3500, 3900);
    await t.prisma.webVitalDay.createMany({
      data: [
        { storeId: MOTHER_STORE_ID, day: new Date(`${today}T00:00:00Z`), metric: 'LCP', pageKind: 'home', device: 'phone', buckets: fast, count: 4 },
        // the 1st of last month: always 28 days back or more, so outside the "last 28 days" overall on any date
        { storeId: MOTHER_STORE_ID, day: new Date(`${lastMonth}-01T00:00:00Z`), metric: 'LCP', pageKind: 'home', device: 'phone', buckets: slow, count: 4 },
        // a desktop reading is not in the phone month table
        { storeId: MOTHER_STORE_ID, day: new Date(`${lastMonth}-01T00:00:00Z`), metric: 'LCP', pageKind: 'home', device: 'desktop', buckets: fast, count: 4 },
      ],
    });
    // an hour ago, unless that is still last month (the first hour of a month): then a second ago
    const hourAgo = new Date(Date.now() - 3_600_000);
    writeLab(dayIn(TZ, hourAgo).startsWith(thisMonth) ? hourAgo : new Date(Date.now() - 1000), 1500);
    const { a } = await send('GET');
    expect(a.view.lab).toMatchObject({ ok: false, profile: 'phone · slow 4G' });
    expect(a.view.lab!.pages.find((p) => p.kind === 'category')!.misses).toEqual(['weight']);
    // count by the report's own window: last month's 1st is normally outside it, but the test must not depend on the date
    const inWindow = `${lastMonth}-01` >= a.view.real.from;
    expect(a.view.real.overall.LCP.phone.count).toBe(inWindow ? 8 : 4);
    const [now, before] = a.view.months;
    expect(now).toMatchObject({ month: thisMonth, readings: 4, real: { LCP: { p75: p75('LCP', fast)!.value, ok: true } } });
    expect(now!.lab).toMatchObject({ pages: 3, ok: false, categoryKb: 1500, worstLcpMs: 2100 });
    expect(before).toMatchObject({ month: lastMonth, readings: 4, real: { LCP: { p75: p75('LCP', slow)!.value, ok: false } }, lab: null });
  });

  it('"Measure now" is recorded once and waits until a newer lab run', async () => {
    const asked = await send('POST', { action: 'run' });
    expect(asked.status).toBe(200);
    expect(asked.a.view.runAsked).toBe(true);
    expect((await send('POST', { action: 'run' })).a.view.runAsked).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'health.speed.run' } })).toBe(1);
    expect((await send('POST', { action: 'nope' })).status).toBe(400);
    // the server measures: a newer run in the same month replaces the month's lab cell
    writeLab(new Date(Date.now() + 60_000), 900);
    const { a } = await send('GET');
    expect(a.view.runAsked).toBe(false);
    expect(a.view.lab!.ok).toBe(true);
    expect(a.view.months[0]!.lab).toMatchObject({ ok: true, categoryKb: 900 });
    expect(await t.prisma.speedMeasurement.count({ where: { source: 'lab' } })).toBe(6);
  });

  it('saves the months shown (audited); a stale version, a bad number or the press itself is refused', async () => {
    const card = (await send('GET')).a.view.cards.speed;
    expect((await send('PUT', { key: 'speed', value: { months: 6 }, version: 'old' })).status).toBe(409);
    const bad = await send('PUT', { key: 'speed', value: { months: 0 }, version: card.version });
    expect(bad.status).toBe(400);
    expect(bad.a.details).toEqual(['months']);
    expect((await send('PUT', { key: 'speed', value: { months: 6, runRequestedAt: null }, version: card.version })).a.details).toEqual(['runRequestedAt']);
    const saved = await send('PUT', { key: 'speed', value: { months: 6 }, version: card.version });
    expect(saved.status).toBe(200);
    expect(saved.a.view.months).toHaveLength(6);
    expect(saved.a.view.cards.speed.value).toEqual({ months: 6 });
    expect(await t.prisma.auditLog.count({ where: { action: 'health.speed.save' } })).toBe(1);
    // the last press is kept as it was
    expect((await deps.resolver.value('health.speed')).runRequestedAt).not.toBeNull();
  });

  it('a read-only role sees the page and is refused every change with 403', async () => {
    const seen = await send('GET', undefined, dir, watcher);
    expect(seen.status).toBe(200);
    expect(seen.a.view.months).toHaveLength(6);
    expect((await send('PUT', { key: 'speed', value: { months: 3 }, version: seen.a.view.cards.speed.version }, dir, watcher)).status).toBe(403);
    expect((await send('POST', { action: 'run' }, dir, watcher)).status).toBe(403);
    expect((await speedHandler(call('DELETE', { cookie: owner }), deps, { stateDir: dir })).status).toBe(405);
  });
});
