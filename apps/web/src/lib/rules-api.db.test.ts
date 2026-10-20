// S10 · PR 208–219 — the Smart Rules admin API end to end on a real PostgreSQL (a throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): login and same-site checks, the starter rules as drafts, a new rule, saving a draft,
// the preview, publishing, history, the conflict list, a notice that starts off, a coupon, and the path table's refusals.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { rulesRoute } from './rules-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.41' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Smart Rules admin API on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  const api = async (method: string, path: string[], body?: unknown, cookie = owner, d: AdminDeps | null = deps) => {
    const res = await rulesRoute(call(method, `/api/admin/rules/${path.join('/')}`, { body, cookie }), d, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('rules_api');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a login, a database and a same-site request; unknown paths and methods are refused', async () => {
    expect((await api('GET', [], undefined, '')).status).toBe(401);
    expect((await api('GET', [], undefined, owner, null)).status).toBe(503);
    const evil = await rulesRoute(call('POST', '/api/admin/rules', { cookie: owner, origin: 'https://evil.example.test', body: { key: 'x', kind: 'policy', nameEn: 'x' } }), deps, []);
    expect(evil.status).toBe(403);
    expect((await api('PUT', [])).status).toBe(405);
    expect((await api('GET', ['not-a-uuid'])).body.error).toBe('INVALID_INPUT');
    expect((await api('GET', ['a', 'b', 'c', 'd'])).status).toBe(404);
    expect((await rulesRoute(call('GET', '/api/admin/rules?storeId=0', { cookie: owner }), deps, [])).status).toBe(400);
  });

  it('the starter rules come in as drafts; a new rule, its draft, preview, publish and history', async () => {
    const s = await api('POST', ['starters']);
    expect(s.status).toBe(200);
    expect(s.body.created.length).toBeGreaterThan(0);
    const list = await api('GET', []);
    expect(list.body.rules.every((r: { status: string }) => r.status === 'DRAFT')).toBe(true);
    expect((await api('GET', ['templates'])).body.templates.length).toBeGreaterThan(0);

    const made = await api('POST', [], { key: 'care-note', kind: 'policy', nameEn: 'Care note' });
    expect(made.status).toBe(201);
    const id = made.body.rule.id as string;
    const content = { ...made.body.rule.live, text: { short: { en: 'Wash cold, dry in the shade' } }, placements: ['product'], status: 'ACTIVE' };
    const saved = await api('PUT', [id, 'draft'], { content, version: made.body.rule.version });
    expect(saved.status).toBe(200);
    expect(saved.body.rule.draft.status).toBe('ACTIVE');
    const prev = await api('POST', [id, 'preview'], {});
    expect(prev.body.preview.places.map((p: { placement: string }) => p.placement)).toEqual(['product']);
    expect(prev.body.preview.ownerOkNeeded).toBe(false);
    const pub = await api('POST', [id, 'publish'], { version: saved.body.rule.version });
    expect([pub.status, pub.body.rule.live.status, pub.body.rule.version]).toEqual([200, 'ACTIVE', 2]);
    expect((await api('POST', [id, 'publish'], {})).body.error).toBe('NOTHING_TO_PUBLISH');
    const h = await api('GET', [id, 'history']);
    expect(h.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect((await api('POST', [id, 'archive'], { archived: true })).body.error).toBe('RULE_ACTIVE');
    expect((await api('GET', ['conflicts'])).body.conflicts).toEqual([]);
    expect((await api('POST', ['check'], { content })).body.issues).toEqual([]);
  });

  it('a notice and a coupon start off', async () => {
    const n = await api('POST', ['notices'], { key: 'care-bar', kind: 'bar', nameEn: 'Care bar', contentEn: 'Wash cold', placement: { pages: ['all'] } });
    expect([n.status, n.body.notice.enabled]).toEqual([201, false]);
    const on = await api('POST', ['notices', n.body.notice.id], { enabled: true });
    expect(on.body.notice.enabled).toBe(true);
    const pop = await api('POST', ['notices'], { key: 'care-pop', kind: 'popup', nameEn: 'Pop', contentEn: 'Hello', placement: { pages: ['all'] }, timing: { trigger: 'time', delaySeconds: 0 } });
    expect(pop.body.notice.issues).toContain('ARRIVAL_POPUP');
    expect((await api('POST', ['notices', pop.body.notice.id], { enabled: true })).body.error).toBe('NOTICE_INVALID');
    expect((await api('GET', ['coupons'])).body.coupons).toEqual([]);
  });
});
