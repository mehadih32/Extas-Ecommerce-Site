// PR 620 (CN-028, docs/erp/site-changes-v6.md §2.7) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the
// ERP's own signed calls to the shop. Which store is asking is decided by the secret that verifies the signature, never
// by anything in the request. CN-029 §16: store A and store B each have their own ERP connection and their own secrets
// in the vault under the store's id; a call signed with one store's secret is answered for that store only, and a
// secret two stores share is refused. Every key and secret is made up here; the clock is fixed at 23 Oct 2026.
// qa-gate (30 Oct): a call refused from the request alone (another path or method, no or a broken signature) touches
// no database, setting or vault; refusals are never one row each (a bounded summary instead), and past
// `erp.siteApi.refusedPerMinute` refused calls a minute, unverified calls are refused before any store is looked at.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allAdapters, createConnections, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, signedErpSiteCall } from '@extas/adapters';
import { syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  checkErpSiteCall,
  ERP_SITE_CALL_EVENT,
  ERP_SITE_REFUSED_EVENT,
  erpSiteCalls,
  erpSiteRefusals,
  flushErpSiteRefusals,
  logErpSiteCall,
  newErpSiteGuard,
  type ErpSiteGuard,
  type SettingsReader,
  type WebhookDeps,
} from '../src';

const T0 = new Date('2026-10-23T04:00:00Z');
const BASE = 'https://erp.example.test';
const PATH = '/erp-api/customers';
const QUERY = 'page=1&pageSize=50';

describe.skipIf(!HAS_TEST_DB)('PR 620 on PostgreSQL: the ERP`s signed calls to the shop', () => {
  let t: TestDatabase;
  let storeA = 0;
  let storeB = 0;
  const clock = T0;
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      if (overrides.has(sk)) return overrides.get(sk) as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const vaultValues = new Map<string, string>();
  const vaultKey = (name: string, storeId: number | null) => `${storeId ?? '-'}:${name}`;
  let connections: ReturnType<typeof createConnections>;
  const deps = (): WebhookDeps => ({ db: t.prisma, settings, connections, now: () => clock, sleep: async () => {}, random: () => 0.5 });
  const hook = { a: randomBytes(24).toString('hex'), b: randomBytes(24).toString('hex') };
  const signing = { a: randomBytes(24).toString('hex') };
  const call = (secret: string, o: { method?: string; path?: string; query?: string; at?: Date } = {}) => {
    const method = o.method ?? 'GET';
    const path = o.path ?? PATH;
    const query = o.query ?? QUERY;
    const h = signedErpSiteCall(secret, method, query ? `${path}?${query}` : path, o.at ?? clock).headers;
    return checkErpSiteCall(deps(), { method, path, query, signature: h[ERP_SIGNATURE_HEADER] ?? null, timestamp: h[ERP_TIMESTAMP_HEADER] ?? null }, guard);
  };
  let guard: ErpSiteGuard = newErpSiteGuard();
  beforeEach(() => {
    guard = newErpSiteGuard();
  });
  const brief = (r: Awaited<ReturnType<typeof checkErpSiteCall>>) => (r.ok ? { ok: true, store: r.storeId, endpoint: r.endpoint } : { ok: false, status: r.status, code: r.code });

  beforeAll(async () => {
    t = await createTestDatabase('erpsite');
    [storeA, storeB] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string, scope?: { storeId?: number | null }) => vaultValues.get(vaultKey(name, scope?.storeId ?? null)) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    // Store A has a signing secret of its own; store B has none, so its webhook secret signs its calls (the contract).
    vaultValues.set(vaultKey('extasErp.apiKey', storeA), randomBytes(16).toString('hex'));
    vaultValues.set(vaultKey('extasErp.webhookSecret', storeA), hook.a);
    vaultValues.set(vaultKey('extasErp.signingSecret', storeA), signing.a);
    vaultValues.set(vaultKey('extasErp.apiKey', storeB), randomBytes(16).toString('hex'));
    vaultValues.set(vaultKey('extasErp.webhookSecret', storeB), hook.b);
    const connection = (storeId: number) => ({ storeId, kind: 'ERP' as const, provider: 'extasErp', name: 'extasErp', mode: 'LIVE' as const, enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret', 'extasErp.signingSecret'] });
    await t.prisma.integration.create({ data: connection(storeA) });
    await t.prisma.integration.create({ data: connection(storeB) });
  });
  afterAll(async () => t?.drop());

  it('only the two calls, only GET', async () => {
    expect(brief(await call(signing.a, { path: '/erp-api/orders' }))).toEqual({ ok: false, status: 404, code: 'NOT_FOUND' });
    expect(brief(await call(signing.a, { method: 'POST' }))).toEqual({ ok: false, status: 405, code: 'METHOD' });
    // An unsigned call is refused before anything else is looked at, switched on or not (the smoke test's check).
    const unsigned = await checkErpSiteCall(deps(), { method: 'GET', path: PATH, query: '', signature: null, timestamp: null }, guard);
    expect(brief(unsigned)).toEqual({ ok: false, status: 401, code: 'UNSIGNED' });
  });

  it('qa-gate: a call refused from the request alone touches no database, setting or vault', async () => {
    const boom = (what: string) =>
      new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => { throw new Error(`${what} touched (${String(k)})`); }) });
    const none = { db: boom('db'), settings: boom('settings'), connections: boom('vault'), now: () => clock } as unknown as WebhookDeps;
    const ask = (c: Partial<Parameters<typeof checkErpSiteCall>[1]>) => checkErpSiteCall(none, { method: 'GET', path: PATH, query: QUERY, signature: null, timestamp: null, ...c }, guard).then(brief);
    const good = signedErpSiteCall(signing.a, 'GET', `${PATH}?${QUERY}`, clock).headers;
    expect(await ask({ path: '/erp-api/orders', signature: good[ERP_SIGNATURE_HEADER]!, timestamp: good[ERP_TIMESTAMP_HEADER]! })).toEqual({ ok: false, status: 404, code: 'NOT_FOUND' });
    expect(await ask({ method: 'POST' })).toEqual({ ok: false, status: 405, code: 'METHOD' });
    expect(await ask({ method: 'HEAD' })).toEqual({ ok: false, status: 405, code: 'METHOD' });
    expect(await ask({})).toEqual({ ok: false, status: 401, code: 'UNSIGNED' });
    expect(await ask({ signature: good[ERP_SIGNATURE_HEADER]! })).toEqual({ ok: false, status: 401, code: 'UNSIGNED' });
    expect(await ask({ timestamp: good[ERP_TIMESTAMP_HEADER]! })).toEqual({ ok: false, status: 401, code: 'UNSIGNED' });
    // A signature or a timestamp that cannot be one is refused before any store or secret is read.
    expect(await ask({ signature: 'sha256=zz', timestamp: good[ERP_TIMESTAMP_HEADER]! })).toEqual({ ok: false, status: 401, code: 'BAD_SIGNATURE' });
    expect(await ask({ signature: 'md5=00', timestamp: good[ERP_TIMESTAMP_HEADER]! })).toEqual({ ok: false, status: 401, code: 'BAD_SIGNATURE' });
    expect(await ask({ signature: good[ERP_SIGNATURE_HEADER]!, timestamp: 'yesterday' })).toEqual({ ok: false, status: 401, code: 'BAD_SIGNATURE' });
    // qa-gate (re-check): a well-formed signature too old or too far ahead is refused before any store lookup (the
    // allowed age is a setting, the only thing read).
    const onlySettings = { ...none, settings } as unknown as WebhookDeps;
    const old = signedErpSiteCall(signing.a, 'GET', `${PATH}?${QUERY}`, new Date(clock.getTime() - 301_000)).headers;
    const ahead = signedErpSiteCall(signing.a, 'GET', `${PATH}?${QUERY}`, new Date(clock.getTime() + 301_000)).headers;
    for (const h of [old, ahead]) {
      const r = await checkErpSiteCall(onlySettings, { method: 'GET', path: PATH, query: QUERY, signature: h[ERP_SIGNATURE_HEADER]!, timestamp: h[ERP_TIMESTAMP_HEADER]! }, guard);
      expect(brief(r)).toEqual({ ok: false, status: 401, code: 'STALE' });
    }
    // Counted in the app only (bounded: one counter per address and reason), never written.
    expect(guard.pending.size).toBeLessThanOrEqual(5);
    expect([...guard.pending.values()].reduce((a, b) => a + b, 0)).toBe(11);
  });

  it('qa-gate: 100 unsigned calls write no row; a flood of wrong signatures is cut off and summed in one row', async () => {
    overrides.set(`erp.siteApi.enabled@${storeA}`, true);
    overrides.set(`erp.model@${storeA}`, 'v6');
    const rows = () => t.prisma.securityEvent.count({ where: { kind: { in: [ERP_SITE_CALL_EVENT, ERP_SITE_REFUSED_EVENT] } } });
    const before = await rows();
    const since = new Date(clock.getTime() - 86_400_000);
    const s0 = await erpSiteRefusals(t.prisma, since);
    for (let i = 0; i < 100; i++) await checkErpSiteCall(deps(), { method: 'GET', path: PATH, query: `page=${i}`, signature: null, timestamp: null }, guard);
    expect(await rows()).toBe(before);
    // Well-formed but wrong: each is looked up until `refusedPerMinute`, then refused at once (429) for the minute.
    overrides.set('erp.siteApi.refusedPerMinute', 5);
    const wrong = randomBytes(24).toString('hex');
    const codes: string[] = [];
    for (let i = 0; i < 20; i++) codes.push(brief(await call(wrong)).code as string);
    expect(codes.filter((c) => c === 'BAD_SIGNATURE')).toHaveLength(5);
    expect(codes.slice(5).every((c) => c === 'RATE_LIMITED')).toBe(true);
    expect(brief(await call(wrong))).toEqual({ ok: false, status: 429, code: 'RATE_LIMITED' });
    // At most one summary row in `refusedLogMinutes` (the first lookup wrote it; the rest wait in the counter).
    expect((await rows()) - before).toBeLessThanOrEqual(1);
    const flushed = await flushErpSiteRefusals(t.prisma, guard, clock, { force: true });
    expect(flushed).toBe(true);
    expect((await rows()) - before).toBeLessThanOrEqual(2);
    expect(guard.pending.size).toBe(0);
    const sum = await erpSiteRefusals(t.prisma, since);
    expect(sum.total - s0.total).toBe(121);
    expect((sum.byCode.UNSIGNED ?? 0) - (s0.byCode.UNSIGNED ?? 0)).toBe(100);
    expect((sum.byCode.RATE_LIMITED ?? 0) - (s0.byCode.RATE_LIMITED ?? 0)).toBe(16);
    // A new minute: lookups again.
    const later = new Date(clock.getTime() + 61_000);
    const h = signedErpSiteCall(signing.a, 'GET', `${PATH}?${QUERY}`, later).headers;
    const ok = await checkErpSiteCall({ ...deps(), now: () => later }, { method: 'GET', path: PATH, query: QUERY, signature: h[ERP_SIGNATURE_HEADER]!, timestamp: h[ERP_TIMESTAMP_HEADER]! }, guard);
    expect(brief(ok)).toEqual({ ok: true, store: storeA, endpoint: 'customers' });
    overrides.delete('erp.siteApi.refusedPerMinute');
    overrides.delete(`erp.siteApi.enabled@${storeA}`);
    overrides.delete(`erp.model@${storeA}`);
  });

  it('off by default, and while the store still speaks v5: a good signature changes nothing', async () => {
    expect(registry['erp.siteApi.enabled'].default).toBe(false);
    expect(brief(await call(signing.a))).toEqual({ ok: false, status: 503, code: 'OFF' });
    overrides.set(`erp.siteApi.enabled@${storeA}`, true);
    // Store A is still on contract v5 (erp.model empty): nothing of v6 is answered.
    expect(brief(await call(signing.a))).toEqual({ ok: false, status: 503, code: 'OFF' });
    overrides.set(`erp.model@${storeA}`, 'v6');
    overrides.set(`erp.model@${storeB}`, 'v6');
    expect(brief(await call(signing.a))).toEqual({ ok: true, store: storeA, endpoint: 'customers' });
    // Store B is on v6 but its switch is off: its own secret opens nothing.
    expect(brief(await call(hook.b))).toEqual({ ok: false, status: 401, code: 'BAD_SIGNATURE' });
  });

  it('§16: each secret answers for its own store only; a signing secret replaces the webhook secret for these calls', async () => {
    overrides.set(`erp.siteApi.enabled@${storeB}`, true);
    expect(brief(await call(signing.a))).toEqual({ ok: true, store: storeA, endpoint: 'customers' });
    expect(brief(await call(hook.b, { path: '/erp-api/top-products', query: 'from=2026-10-01&to=2026-10-22' }))).toEqual({ ok: true, store: storeB, endpoint: 'top-products' });
    // Store A has its own signing secret, so its webhook secret no longer opens these calls.
    expect(brief(await call(hook.a))).toEqual({ ok: false, status: 401, code: 'BAD_SIGNATURE' });
    expect(brief(await call(randomBytes(24).toString('hex')))).toEqual({ ok: false, status: 401, code: 'BAD_SIGNATURE' });
    const r = await call(signing.a);
    const link = await t.prisma.erpStoreLink.findFirstOrThrow({ where: { storeId: storeA, endedAt: null } });
    expect(r.ok && [r.linkId, r.storeId]).toEqual([link.id, storeA]);
  });

  it('a signature for another request or another moment, an old one or none is refused', async () => {
    const h = signedErpSiteCall(signing.a, 'GET', `${PATH}?${QUERY}`, clock).headers;
    const other = await checkErpSiteCall(deps(), { method: 'GET', path: PATH, query: 'page=2&pageSize=50', signature: h[ERP_SIGNATURE_HEADER]!, timestamp: h[ERP_TIMESTAMP_HEADER]! }, guard);
    expect(brief(other)).toEqual({ ok: false, status: 401, code: 'BAD_SIGNATURE' });
    expect(brief(await call(signing.a, { at: new Date(clock.getTime() - 301_000) }))).toEqual({ ok: false, status: 401, code: 'STALE' });
    expect(brief(await call(signing.a, { at: new Date(clock.getTime() + 301_000) }))).toEqual({ ok: false, status: 401, code: 'STALE' });
    const unsigned = await checkErpSiteCall(deps(), { method: 'GET', path: PATH, query: QUERY, signature: null, timestamp: null }, guard);
    expect(brief(unsigned)).toEqual({ ok: false, status: 401, code: 'UNSIGNED' });
    // The allowed age is a setting.
    overrides.set('erp.siteApi.maxAgeSeconds', 600);
    expect(brief(await call(signing.a, { at: new Date(clock.getTime() - 301_000) }))).toEqual({ ok: true, store: storeA, endpoint: 'customers' });
    overrides.delete('erp.siteApi.maxAgeSeconds');
  });

  it('§16: a secret two stores share is refused for both (it could be either store)', async () => {
    vaultValues.set(vaultKey('extasErp.signingSecret', storeB), signing.a);
    try {
      expect(brief(await call(signing.a))).toEqual({ ok: false, status: 401, code: 'SHARED_SECRET' });
    } finally {
      vaultValues.delete(vaultKey('extasErp.signingSecret', storeB));
    }
    expect(brief(await call(hook.b))).toEqual({ ok: true, store: storeB, endpoint: 'customers' });
  });

  it('every verified call is logged (never a customer, never a search text); a store sees only its own calls', async () => {
    await logErpSiteCall(t.prisma, { storeId: storeA, linkId: 'link-a', endpoint: 'customers', status: 200, code: 'OK', rows: 2, searched: true, at: new Date(clock.getTime() + 1_000) });
    await logErpSiteCall(t.prisma, { storeId: storeB, linkId: 'link-b', endpoint: 'top-products', status: 200, code: 'OK', rows: 5, searched: false, at: new Date(clock.getTime() + 2_000) });
    const a = await erpSiteCalls(t.prisma, storeA, 10);
    expect(a.map((c) => [c.storeId, c.endpoint, c.status, c.code, c.rows, c.searched])).toEqual([[storeA, 'customers', 200, 'OK', 2, true]]);
    expect((await erpSiteCalls(t.prisma, storeB, 10)).map((c) => c.storeId)).toEqual([storeB]);
    // Refused calls never push a store's real calls out of its list: they are only summed.
    const g = newErpSiteGuard();
    for (let i = 0; i < 30; i++) await checkErpSiteCall(deps(), { method: 'GET', path: PATH, query: '', signature: null, timestamp: null }, g);
    await flushErpSiteRefusals(t.prisma, g, new Date(clock.getTime() + 3_000), { force: true });
    expect(await erpSiteCalls(t.prisma, storeA, 1)).toHaveLength(1);
    expect((await erpSiteCalls(t.prisma, storeA, 1))[0]!.code).toBe('OK');
    const kept = await t.prisma.securityEvent.findMany({ where: { kind: { in: [ERP_SITE_CALL_EVENT, ERP_SITE_REFUSED_EVENT] } } });
    expect(JSON.stringify(kept)).not.toMatch(/pageSize|search=|\+880/);
  });
});
