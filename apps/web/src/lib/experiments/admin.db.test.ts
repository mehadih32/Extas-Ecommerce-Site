// S02 · PR 83 — Reports › Experiments on a real PostgreSQL: the module's card (off as shipped; STALE; audited); a draft
// written, refused whole when B speaks of money or changes a price part, edited while a draft; started only while the
// module is on and never beside a running test that changes the same part; the shop's running tests (live.ts) and a
// visitor counted once; the result from real bag lines (only after he was counted), a winner only at the owner's
// confidence, "keep B" writes B into the shop's own settings (and needs the Website permissions); archive and restore,
// nothing deleted; seeing needs `reports.experiments.read`, changing `reports.experiments.write`.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, readEye, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { defaultWord, WORD_KEYS } from '../website/words';
import { experimentsHandler, type ExperimentsView, type ModuleCard, type TestRow } from './admin';
import { clearLive, liveTests, recordSeen, showing } from './live';
import { testableWord } from './model';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const NOTE = 'pdp.colour:note';
const WA = 'shell.header:icons.#whatsapp.on';
const word = WORD_KEYS.find((k) => testableWord(k) && !/\{/.test(defaultWord('en', k)))!;

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.83', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/reports/experiments'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

type Answer = Partial<ExperimentsView> & { ok: boolean; error?: string; details?: string[]; id?: string; test?: TestRow; cards?: { module: ModuleCard } };

describe.skipIf(!HAS_TEST_DB)('Reports › Experiments on PostgreSQL (PR 83)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let reader = '';
  const saved = process.env.DATABASE_URL;
  const api = async (method: string, o: { body?: unknown; cookie?: string; id?: string } = {}) => {
    const res = await experimentsHandler(req(method, { body: o.body, cookie: o.cookie ?? owner, path: `/api/admin/reports/experiments${o.id ? `/${o.id}` : ''}` }), admin, o.id ?? null);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const step = async (id: string, action: string, extra: Record<string, unknown> = {}, cookie?: string) => {
    const now = await api('GET', { id });
    return api('POST', { id, cookie, body: { action, version: now.a.test!.version, ...extra } });
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_experiments');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Report reader', nameBn: 'রিপোর্ট পাঠক', permissions: ['reports.experiments.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'reader@example.com', password: 'first password from the owner' } }), admin));
    reader = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  });
  afterAll(async () => {
    clearLive();
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('the module card: off as shipped, saved with its version, STALE, audited; reading needs .read, writing .write', async () => {
    const first = await api('GET', { cookie: reader });
    expect(first.status).toBe(200);
    expect(first.a.card!.value).toEqual({ enabled: false, confidence: 95, minVisitors: 100, cookieDays: 30 });
    expect(first.a.tests).toEqual([]);
    expect((await api('PUT', { cookie: reader, body: { key: 'module', version: first.a.card!.version, value: { ...first.a.card!.value, enabled: true } } })).status).toBe(403);
    expect((await api('PUT', { body: { key: 'module', version: first.a.card!.version, value: { ...first.a.card!.value, confidence: 100 } } })).a.details).toEqual(['confidence']);
    const on = await api('PUT', { body: { key: 'module', version: first.a.card!.version, value: { ...first.a.card!.value, minVisitors: 10 } } });
    expect(on.status).toBe(200);
    expect(on.a.cards!.module.value.minVisitors).toBe(10);
    expect((await api('PUT', { body: { key: 'module', version: first.a.card!.version, value: first.a.card!.value } })).a.error).toBe('STALE');
    expect(await t.prisma.auditLog.count({ where: { action: 'experiments.module.save' } })).toBe(1);
  });

  it('a draft: written, refused whole when B touches money, edited while a draft only', async () => {
    const money = await api('POST', { body: { name: 'Price line', goal: 'addToBag', shareB: 50, endsOn: null, b: { eye: { 'pdp.price:discountAfterBar': true, [NOTE]: true }, words: { [word]: { en: 'Free delivery today' } } } } });
    expect(money.status).toBe(400);
    expect(money.a.details).toEqual(['eye.pdp.price:discountAfterBar', `words.${word}.en`]);
    expect((await api('POST', { cookie: reader, body: { name: 'x', goal: 'order', shareB: 50, b: { eye: { [NOTE]: true } } } })).status).toBe(403);
    const made = await api('POST', { body: { name: 'Colour note', goal: 'addToBag', shareB: 50, endsOn: null, note: 'Does the note help?', b: { eye: { [NOTE]: true }, words: {} } } });
    expect(made.status).toBe(201);
    const id = made.a.id!;
    const one = await api('GET', { id });
    expect(one.a.test).toMatchObject({ status: 'DRAFT', name: 'Colour note', note: 'Does the note help?', shareB: 50, b: { eye: { [NOTE]: true }, words: {} } });
    const edit = await api('PUT', { id, body: { version: one.a.test!.version, name: 'Colour note on', goal: 'addToBag', shareB: 40, endsOn: null, b: { eye: { [NOTE]: true }, words: { [word]: { en: 'Calmer words' } } } } });
    expect(edit.status).toBe(200);
    expect((await api('PUT', { id, body: { version: one.a.test!.version, name: 'Late', goal: 'addToBag', shareB: 40, b: { eye: { [NOTE]: true } } } })).a.error).toBe('STALE');
    expect((await api('GET', { id })).a.test).toMatchObject({ name: 'Colour note on', shareB: 40, b: { words: { [word]: { en: 'Calmer words' } } } });
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['experiments.create', 'experiments.update'] } } })).toBe(2);
  });

  it('starts only while the module is on and never beside a running test that changes the same thing', async () => {
    const id = (await api('GET')).a.tests!.find((x) => x.name === 'Colour note on')!.id;
    const card = (await api('GET')).a.card!;
    expect((await step(id, 'start')).a.error).toBe('MODULE_OFF');
    await api('PUT', { body: { key: 'module', version: card.version, value: { ...card.value, enabled: true } } });
    const started = await step(id, 'start');
    expect(started.status).toBe(200);
    expect(started.a.test).toMatchObject({ status: 'RUNNING' });
    expect((await api('PUT', { id, body: { version: started.a.test!.version, name: 'x', goal: 'addToBag', shareB: 50, b: { eye: { [NOTE]: true } } } })).a.error).toBe('NOT_DRAFT');
    const other = (await api('POST', { body: { name: 'Same note', goal: 'order', shareB: 50, b: { eye: { [NOTE]: false, [WA]: false } } } })).a.id!;
    const refused = await step(other, 'start');
    expect(refused.a.error).toBe('CLASH');
    expect(refused.a.details).toEqual([`${NOTE} · Colour note on`]);
    clearLive();
    const live = await liveTests(S);
    expect(showing(live).map((x) => x.id)).toEqual([id]);
    expect(showing(live)[0]!.shareB).toBe(40);
  });

  it('counts each visitor once and a bag line only after he was counted; a winner only when sure; keep B writes it', async () => {
    const test = (await api('GET')).a.tests!.find((x) => x.name === 'Colour note on')!;
    const cart = async (visitor: string, before: boolean, raisedAt?: Date) => {
      const c = await t.prisma.cart.create({ data: { storeId: S, visitorId: visitor } });
      await t.prisma.cartItem.create({ data: { storeId: S, cartId: c.id, variantId: randomUUID(), quantity: 1, unitPriceMinor: 100, ...(before ? { createdAt: new Date(Date.now() - 86_400_000) } : {}), ...(raisedAt ? { raisedAt } : {}) } });
    };
    // 40 visitors in A (4 add to the bag), 40 in B (20 add, plus one whose bag line was before he was counted)
    const rows = [...Array.from({ length: 40 }, (_, i) => ({ v: `visitor-a-${i}-xxxxxxxxxx`, variant: 'a' })), ...Array.from({ length: 40 }, (_, i) => ({ v: `visitor-b-${i}-xxxxxxxxxx`, variant: 'b' }))];
    await t.prisma.abAssignment.createMany({ data: rows.map((r) => ({ storeId: S, testId: test.id, visitorId: r.v, variant: r.variant })) });
    for (let i = 0; i < 4; i++) await cart(`visitor-a-${i}-xxxxxxxxxx`, false);
    for (let i = 0; i < 20; i++) await cart(`visitor-b-${i}-xxxxxxxxxx`, false);
    await cart('visitor-b-39-xxxxxxxxxx', true);
    // PR 83 follow-up (683): an older bag line whose quantity he raised after he was counted counts; one raised before does not
    await cart('visitor-a-38-xxxxxxxxxx', true, new Date());
    await cart('visitor-a-39-xxxxxxxxxx', true, new Date(Date.now() - 86_400_000));
    recordSeen(S, test.id, 'visitor-a-0-xxxxxxxxxx', 'a');
    await new Promise((r) => setTimeout(r, 200));
    const now = (await api('GET', { id: test.id })).a.test!;
    expect(now.a).toEqual({ n: 40, c: 5 });
    expect(now.bTally).toEqual({ n: 40, c: 20 });
    expect(now.verdict.enough).toBe(true);
    expect(now.verdict.confidence!).toBeGreaterThan(0.99);
    expect(now.verdict.winner).toBe('b');
    expect((await step(test.id, 'keep', { winner: 'a' })).a.error).toBe('NOT_SURE');
    expect((await step(test.id, 'keep', { winner: 'b' }, reader)).status).toBe(403);
    const kept = await step(test.id, 'keep', { winner: 'b' });
    expect(kept.status).toBe(200);
    expect(kept.a.test).toMatchObject({ status: 'ENDED', winner: 'b' });
    expect(readEye(await resolver.value('pdp.colour' as never, { storeId: S }), 'note')).toBe(true);
    expect(((await resolver.value('language.labels', { storeId: S })) as Record<string, { en?: string }>)[word]).toEqual({ en: 'Calmer words' });
    clearLive();
    expect(showing(await liveTests(S))).toEqual([]);
    expect(await t.prisma.auditLog.count({ where: { action: 'experiments.keep' } })).toBe(1);
  });

  it('pause, end, archive and restore — nothing deleted; an archived test is listed only when asked', async () => {
    const id = (await api('GET')).a.tests!.find((x) => x.name === 'Same note')!.id;
    expect((await step(id, 'start')).a.test!.status).toBe('RUNNING');
    expect((await step(id, 'archive')).a.error).toBe('NOT_ALLOWED');
    expect((await step(id, 'pause')).a.test!.status).toBe('PAUSED');
    const ended = await step(id, 'end');
    expect(ended.a.test).toMatchObject({ status: 'ENDED', winner: null });
    expect(ended.a.test!.verdict.confidence).toBeNull();
    expect((await step(id, 'archive')).a.test!.archived).toBe(true);
    expect((await api('GET')).a.tests!.map((x) => x.id)).not.toContain(id);
    const res = await experimentsHandler(req('GET', { cookie: owner, path: '/api/admin/reports/experiments?show=archived' }), admin);
    expect(((await res.json()) as Answer).tests!.map((x) => x.id)).toEqual([id]);
    expect((await step(id, 'restore')).a.test!.archived).toBe(false);
    expect(await t.prisma.abTest.count()).toBe(2);
    expect((await step(id, 'fly')).a.error).toBe('INVALID_INPUT');
    expect((await api('GET', { id: randomUUID() })).status).toBe(404);
  });
});
