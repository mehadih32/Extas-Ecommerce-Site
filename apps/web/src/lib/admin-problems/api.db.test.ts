// S21 · PR 423 (CN-015) — the customer problem recorder and Reports › Site health › Customer problems on a real
// PostgreSQL: same-site reports only, always 204; nothing kept while the recorder is off; one problem per cause with
// its reports; nothing personal kept (scrubbed message, masked address, device and browser families only); a break on
// the checkout is urgent at once and never made less urgent by itself; the list and one problem's page need
// `health.read`; a status needs `health.problems.manage` and a note when it says how or why; leaving an owner's step
// needs `health.problems.approve`; a stale status is refused; every change is audited; the recorder's numbers need
// `settings.write`. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { openProblemCounts } from './service';
import type { ProblemDetail, ProblemsView } from './service';
import { problemHandler, problemsListHandler } from './api';
import { problemsHandler } from '../problems/ingest';

const HOST = 'shop.example.test';
const OWNER_PW = 'a long sentence for the tests';
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

function call(
  method: string,
  opts: {
    body?: unknown;
    cookie?: string;
    path: string;
    origin?: string | null;
    raw?: string;
  },
) {
  const headers: Record<string, string> = {
    host: HOST,
    'user-agent': PHONE_UA,
    'x-forwarded-for': '192.0.2.31',
  };
  if (method !== 'GET' && opts.origin !== null) headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  return new Request(`https://${HOST}${opts.path}`, { method, headers, body });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('Customer problems on PostgreSQL (PR 423)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let fixer = '';
  let now = new Date('2026-10-31T06:00:00Z');

  async function staffWith(email: string, permissions: string[]): Promise<string> {
    const role = await rolesHandler(
      call('POST', {
        path: '/api/admin/roles',
        cookie: owner,
        body: { nameEn: email, nameBn: email, permissions },
      }),
      deps,
    );
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(
      call('POST', {
        path: '/api/admin/staff',
        cookie: owner,
        body: {
          email,
          displayName: 'Sample staff',
          password: 'first password from the owner',
        },
      }),
      deps,
    );
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(
      call('POST', {
        path: `/api/admin/staff/${staffId}/roles`,
        cookie: owner,
        body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID },
      }),
      deps,
      staffId,
    );
    const first = cookiesOf(
      await loginHandler(
        call('POST', {
          path: '/api/admin/auth/login',
          body: { email, password: 'first password from the owner' },
        }),
        deps,
      ),
    );
    return cookiesOf(
      await passwordHandler(
        call('POST', {
          path: '/api/admin/auth/password',
          cookie: first,
          body: {
            current: 'first password from the owner',
            next: 'my own words for this job',
          },
        }),
        deps,
      ),
    );
  }

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), {
      email: 'owner@example.com',
      displayName: 'Sample owner',
      password: OWNER_PW,
      passwordChosenByOwner: true,
    });
    deps = {
      db: t.prisma,
      resolver: new SettingsResolver(prismaBackend(t.prisma), registry),
      vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')),
      now: () => now,
    };
    owner = cookiesOf(
      await loginHandler(
        call('POST', {
          path: '/api/admin/auth/login',
          body: { email: 'owner@example.com', password: OWNER_PW },
        }),
        deps,
      ),
    );
    fixer = await staffWith('fixer@example.com', ['health.read', 'health.problems.manage']);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const report = (body: unknown, origin?: string | null) =>
    problemsHandler(call('POST', { path: '/api/problems', body, origin }), {
      db: deps.db,
      resolver: deps.resolver,
      now: () => now,
    });
  const list = async (when = 'today', cookie = owner) => {
    const res = await problemsListHandler(
      call('GET', {
        path: `/api/admin/health/problems?when=${when}`,
        cookie,
      }),
      deps,
    );
    return {
      status: res.status,
      a: (await res.json()) as {
        ok: boolean;
        error?: string;
        view: ProblemsView;
      },
    };
  };
  const one = async (id: string, body?: unknown, cookie = owner) => {
    const res = await problemHandler(
      call(body === undefined ? 'GET' : 'POST', {
        path: `/api/admin/health/problems/${id}`,
        cookie,
        body,
      }),
      deps,
      id,
    );
    return {
      status: res.status,
      a: (await res.json()) as {
        ok: boolean;
        error?: string;
        detail: ProblemDetail;
      },
    };
  };

  it('takes same-site reports only, answers 204 whatever it keeps, and groups one cause', async () => {
    expect(
      (
        await report(
          {
            v: 'tab-aaaa-0001',
            p: '/p/blue-polo',
            r: [{ k: 'script_error', d: 'x' }],
          },
          'https://evil.example',
        )
      ).status,
    ).toBe(403);
    expect((await report({ nonsense: true })).status).toBe(204);
    const res = await problemsHandler(call('POST', { path: '/api/problems', raw: 'not json' }), { db: deps.db, resolver: deps.resolver });
    expect(res.status).toBe(204);
    expect((await report({ v: 'tab-adm-0001', p: '/admin/orders', r: [{ k: 'error_screen', d: 'x' }] })).status).toBe(204);
    expect(await t.prisma.problemRecord.count()).toBe(0);

    const msg = 'Cannot read 12 of undefined for 01712345678 a.b@mail.com';
    expect(
      (
        await report({
          v: 'tab-aaaa-0001',
          p: '/bn/p/blue-polo?ref=fb',
          n: '3g',
          r: [
            { k: 'script_error', d: msg },
            { k: 'script_error', d: msg },
          ],
        })
      ).status,
    ).toBe(204);
    await report({
      v: 'tab-bbbb-0002',
      p: '/p/green-polo',
      r: [
        {
          k: 'script_error',
          d: 'Cannot read 99 of undefined for 01811111111 c@d.com',
        },
      ],
    });
    const problems = await t.prisma.customerProblem.findMany();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      kind: 'script_error',
      step: 'product',
      path: '/p/:x',
      records: 2,
      severity: 'IMPORTANT',
      status: 'NEW',
    });
    expect(problems[0]!.detail).toBe('Cannot read 12 of undefined for # #');
    const recs = await t.prisma.problemRecord.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(recs.map((r) => [r.device, r.browser])).toEqual([
      ['phone', 'chrome'],
      ['phone', 'chrome'],
    ]);
    expect(JSON.stringify(recs)).not.toMatch(/0171|mail\.com|Mozilla/);
  });

  it('a break on the checkout is urgent at once, and a slow call later never makes it less urgent', async () => {
    await report({
      v: 'tab-cccc-0003',
      p: '/checkout',
      r: [{ k: 'request_failed', d: 'POST /api/checkout/place?x=1 502' }],
    });
    const p = await t.prisma.customerProblem.findFirstOrThrow({
      where: { kind: 'request_failed' },
    });
    expect(p).toMatchObject({
      step: 'checkout',
      severity: 'URGENT',
      detail: 'POST /api/checkout/place 502',
    });
    await report({
      v: 'tab-cccc-0003',
      p: '/checkout',
      r: [{ k: 'slow_request', d: '/api/checkout/quote', ms: 6_000 }],
    });
    expect(
      (
        await t.prisma.customerProblem.findFirstOrThrow({
          where: { kind: 'slow_request' },
        })
      ).severity,
    ).toBe('CAN_WAIT');
    expect(
      (
        await t.prisma.customerProblem.findFirstOrThrow({
          where: { id: p.id },
        })
      ).severity,
    ).toBe('URGENT');
    expect(await openProblemCounts(deps)).toMatchObject({
      enabled: true,
      urgent: 1,
      important: 1,
      canWait: 1,
    });
  });

  it('the list for today, Urgent first, with visitors and reports; a sign-in is needed', async () => {
    expect((await list('today', '')).status).toBe(401);
    const { status, a } = await list();
    expect(status).toBe(200);
    expect(a.view.rows.map((r) => r.severity)).toEqual(['URGENT', 'IMPORTANT', 'CAN_WAIT']);
    expect(a.view.rows[1]).toMatchObject({
      kind: 'script_error',
      visitors: 2,
      records: 2,
    });
    expect(a.view.visitors).toBe(3);
    expect(a.view.open).toEqual({ total: 3, urgent: 1, important: 1 });
    expect(a.view.trend).toHaveLength(14);
    expect(a.view.trend.at(-1)!.records).toBe(4);
    expect((await list('yesterday')).a.view.rows).toHaveLength(0);
    expect(JSON.stringify(a.view)).not.toMatch(/tab-/);
  });

  it("status: a note when it says how; the owner's step is the owner's; stale refused; audited", async () => {
    const id = (
      await t.prisma.customerProblem.findFirstOrThrow({
        where: { kind: 'request_failed' },
      })
    ).id;
    let d = (await one(id)).a.detail;
    expect(d.by.device).toEqual([['phone', 1]]);
    expect(d.last).toHaveLength(1);

    expect((await one(id, { status: 'FIXED', note: '', version: d.row.version }, fixer)).a.error).toBe('NOTE_NEEDED');
    expect((await one(id, { status: 'FIXING', version: 'old' }, fixer)).a.error).toBe('STALE');
    expect((await one(id, { status: 'GONE', version: d.row.version }, fixer)).a.error).toBe('INVALID_INPUT');

    const asked = await one(
      id,
      {
        status: 'NEEDS_OWNER',
        note: 'The courier quote needs the paid plan',
        version: d.row.version,
      },
      fixer,
    );
    expect(asked.status).toBe(200);
    d = asked.a.detail;
    expect(d.row).toMatchObject({
      status: 'NEEDS_OWNER',
      statusNote: 'The courier quote needs the paid plan',
    });
    const refused = await one(id, { status: 'FIXING', version: d.row.version }, fixer);
    expect([refused.status, refused.a.error]).toEqual([403, 'OWNER_ONLY']);
    const ok = await one(id, { status: 'FIXING', version: d.row.version }, owner);
    expect(ok.a.detail.row.status).toBe('FIXING');
    const rows = await t.prisma.auditLog.findMany({
      where: { action: 'health.problem.status' },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect((await one('not-an-id')).status).toBe(404);
  });

  it('a problem marked fixed that comes back shows so', async () => {
    const id = (
      await t.prisma.customerProblem.findFirstOrThrow({
        where: { kind: 'script_error' },
      })
    ).id;
    const v = (await one(id)).a.detail.row.version;
    expect(
      (
        await one(
          id,
          {
            status: 'FIXED',
            note: 'Guarded the empty size list',
            version: v,
          },
          fixer,
        )
      ).status,
    ).toBe(200);
    now = new Date(now.getTime() + 60_000);
    await report({
      v: 'tab-dddd-0004',
      p: '/p/red-polo',
      r: [
        {
          k: 'script_error',
          d: 'Cannot read 5 of undefined for 01700000000 e@f.com',
        },
      ],
    });
    expect((await one(id)).a.detail.row.back).toBe(true);
  });

  it('the recorder card needs settings.write; off keeps nothing', async () => {
    const card = (await list()).a.view.cards.problems;
    const put = (value: unknown, cookie = owner) =>
      problemsListHandler(
        call('PUT', {
          path: '/api/admin/health/problems',
          cookie,
          body: { key: 'problems', value, version: card.version },
        }),
        deps,
      );
    expect((await put({ ...card.value, enabled: false }, fixer)).status).toBe(403);
    expect((await put({ ...card.value, rageClicks: 99 })).status).toBe(400);
    const saved = await put({ ...card.value, enabled: false });
    expect(saved.status).toBe(200);
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'health.problems.save' },
      }),
    ).toBe(1);
    const before = await t.prisma.problemRecord.count();
    expect(
      (
        await report({
          v: 'tab-eeee-0005',
          p: '/bag',
          r: [{ k: 'page_failed', d: '' }],
        })
      ).status,
    ).toBe(204);
    expect(await t.prisma.problemRecord.count()).toBe(before);
    expect((await list()).a.view.enabled).toBe(false);
  });
});
