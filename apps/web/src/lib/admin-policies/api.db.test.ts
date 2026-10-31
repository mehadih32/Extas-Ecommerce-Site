// S18 · PR 384 — Settings › Policies & texts on a real PostgreSQL: the seven help pages start with their defaults and no
// words of the owner; a page's words save in both languages and may quote a rule's number (`{exchange.windowHours}`);
// such a token stands "not live" while the rule is a draft and "filled" once it is live; a token that names nothing
// and a stand-in ("[support email]") are refused; the rules a page reads keep their order; clearing every word leaves
// no empty page behind; the audit row names fields, never the words. A throwaway database (skipped without
// TEST_DATABASE_ADMIN_URL). Made-up sample words and a sample rule.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, SYSTEM, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { createRule } from '@extas/rules';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { policiesHandler } from './api';
import type { PoliciesView } from './service';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.22' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/policies'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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
  view: PoliciesView;
}

describe.skipIf(!HAS_TEST_DB)('Settings › Policies & texts on PostgreSQL (PR 384)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let ruleId = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    // a sample exchange rule, still a draft
    ruleId = (await createRule({ db: t.prisma, settings: deps.resolver }, { actor: SYSTEM, storeId: MOTHER_STORE_ID, ctx: { source: 'test' } }, { templateId: 'exchange' })).id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, cookie = owner) => {
    const res = await policiesHandler(call(method, { cookie, body: b }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const words = (en: string, bn: string) => ({ en, bn });

  it('starts with the defaults and none of his words; a sign-in is needed', async () => {
    expect((await policiesHandler(call('GET'), deps)).status).toBe(401);
    const g = await send('GET');
    expect(g.a.view.pages.map((p) => p.slug)).toEqual(['faq', 'delivery', 'exchange', 'privacy', 'terms', 'story', 'contact']);
    expect(g.a.view.pages.every((p) => !p.own)).toBe(true);
    expect(g.a.view.cards.terms.value).toMatchObject({ on: true, details: 'legal', title: null, body: null });
    expect(g.a.view.cards.exchange.value.rules).toEqual({ exchange: true, 'no-return': true, 'exchange-order': true });
    expect(g.a.view.values.some((v) => v.token === '{exchange.windowHours}' && !v.live)).toBe(true);
    // nothing live, nothing written: the terms page says "Coming soon"
    expect(g.a.view.pages.find((p) => p.slug === 'terms')!.shows).toBe(false);
  });

  it('saves his words with a rule token, refuses a token that names nothing and a stand-in', async () => {
    const g = await send('GET');
    const card = g.a.view.cards.terms;
    const body = words('## Exchange\nExchange within {exchange.windowHours} hours of delivery.', '## এক্সচেঞ্জ\nডেলিভারির {exchange.windowHours} ঘণ্টার মধ্যে এক্সচেঞ্জ।');
    const ok = await send('PUT', { key: 'terms', value: { ...card.value, body, rules: { exchange: true } }, version: card.version });
    expect(ok.status).toBe(200);
    const terms = ok.a.view.pages.find((p) => p.slug === 'terms')!;
    expect(terms).toMatchObject({ own: true, shows: true, tokens: [{ raw: '{exchange.windowHours}', state: 'notLive' }] });
    expect(terms.rules).toEqual([{ key: 'exchange', name: expect.any(String), live: false, known: true }]);
    expect((await deps.resolver.value('pages.text', { storeId: MOTHER_STORE_ID }))?.pages.terms?.body).toEqual(body);

    const next = ok.a.view.cards.terms;
    const unknown = await send('PUT', { key: 'terms', value: { ...next.value, body: words('Within {exchange.days} days.', 'Within {windowHours}.') }, version: next.version });
    expect(unknown).toMatchObject({ status: 400, a: { error: 'UNKNOWN_TOKEN', details: ['{exchange.days}', '{windowHours}'] } });
    const stand = await send('PUT', { key: 'terms', value: { ...next.value, lede: words('Write to [support email].', 'লিখুন') }, version: next.version });
    expect(stand).toMatchObject({ status: 400, a: { error: 'PLACEHOLDER', details: ['lede'] } });
    const half = await send('PUT', { key: 'terms', value: { ...next.value, title: words('Terms', '') }, version: next.version });
    expect(half).toMatchObject({ status: 400, a: { error: 'INVALID_INPUT', details: ['title'] } });
    expect((await send('PUT', { key: 'terms', value: next.value, version: card.version })).status).toBe(409);
    expect((await send('PUT', { key: 'nope', value: next.value })).status).toBe(400);
    expect((await send('PUT', { key: 'terms', value: { ...next.value, rules: { 'made-up': true } } })).a.error).toBe('INVALID_INPUT');

    // the rule goes live: the token is filled
    await t.prisma.smartRule.update({ where: { id: ruleId }, data: { status: 'ACTIVE' } });
    const live = await send('GET');
    expect(live.a.view.pages.find((p) => p.slug === 'terms')!.tokens).toEqual([{ raw: '{exchange.windowHours}', state: 'ok' }]);
  });

  it('keeps the order of the rules a page reads, and clearing every word leaves no empty page', async () => {
    const g = await send('GET');
    const ex = g.a.view.cards.exchange;
    const r = await send('PUT', { key: 'exchange', value: { ...ex.value, on: false, rules: { 'exchange-order': true, exchange: true, 'no-return': false } }, version: ex.version });
    expect(r.status).toBe(200);
    expect((await deps.resolver.value('pages.help', { storeId: MOTHER_STORE_ID })).pages.exchange).toEqual({ on: false, rules: ['exchange', 'exchange-order'], details: 'none' });

    const terms = r.a.view.cards.terms;
    const cleared = await send('PUT', { key: 'terms', value: { ...terms.value, body: null }, version: terms.version });
    expect(cleared.a.view.pages.find((p) => p.slug === 'terms')!.own).toBe(false);
    expect(await deps.resolver.value('pages.text', { storeId: MOTHER_STORE_ID })).toBeNull();

    const rows = await t.prisma.auditLog.findMany({ where: { action: 'policies.page.save' }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((x) => x.after)).toEqual([
      { page: 'terms', changed: ['rules', 'body'] },
      { page: 'exchange', changed: ['on', 'rules'] },
      { page: 'terms', changed: ['body'] },
    ]);
    expect(JSON.stringify(rows.map((x) => x.after))).not.toContain('Exchange within');
  });
});
