// S18 · PR 383 — Settings › Store details on a real PostgreSQL: the legal numbers start empty (all four missing); the
// owner fills them in; a stand-in value ("[your DBID number]", "TBD") is refused; an emptied box clears its number;
// saving needs settings.write and a fresh version; the audit row names fields, never values. A throwaway database
// (skipped without TEST_DATABASE_ADMIN_URL). Made-up test values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { storeHandler } from './api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.21' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/store'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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
  cards: { legal: { value: Record<string, string>; version: string }; tax: { value: Record<string, unknown>; version: string } };
  view: { missing: string[] };
}

describe.skipIf(!HAS_TEST_DB)('Settings › Store details on PostgreSQL (PR 383)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, cookie = owner) => {
    const res = await storeHandler(call(method, { cookie, body: b }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  it('starts empty, every number missing; a sign-in is needed', async () => {
    expect((await storeHandler(call('GET'), deps)).status).toBe(401);
    const g = await send('GET');
    expect(g.a.cards.legal.value).toMatchObject({ registeredName: '', tradeLicence: '', dbid: '', ownerName: '' });
    expect(g.a.cards.tax.value).toMatchObject({ bin: '', showVat: false });
    expect(g.a.view.missing).toEqual(['registeredName', 'tradeLicence', 'dbid', 'bin']);
  });

  it('fills, refuses stand-ins, clears an emptied box, and audits field names only', async () => {
    const g = await send('GET');
    const ok = await send('PUT', { key: 'legal', value: { registeredName: 'Sample Fashion Ltd.', tradeLicence: 'TRAD/DNCC/000001/2026', dbid: 'DBID-000001' }, version: g.a.cards.legal.version });
    expect(ok.status).toBe(200);
    expect(ok.a.view.missing).toEqual(['bin']);
    expect(await deps.resolver.value('legal.dbid', { storeId: MOTHER_STORE_ID })).toBe('DBID-000001');

    const filler = await send('PUT', { key: 'legal', value: { dbid: '[your DBID number]' } });
    expect(filler).toMatchObject({ status: 400, a: { error: 'PLACEHOLDER', details: ['dbid'] } });
    expect(await send('PUT', { key: 'tax', value: { bin: 'TBD' } })).toMatchObject({ status: 400, a: { error: 'PLACEHOLDER', details: ['bin'] } });
    expect((await send('PUT', { key: 'legal', value: { dbid: 'D'.repeat(61) } })).a.error).toBe('INVALID_INPUT');
    expect((await send('PUT', { key: 'legal', value: { nope: '1' } })).status).toBe(400);
    expect((await send('PUT', { key: 'legal', value: { dbid: 'DBID-2' }, version: g.a.cards.legal.version })).status).toBe(409);

    const cleared = await send('PUT', { key: 'legal', value: { dbid: '  ' } });
    expect(cleared.a.view.missing).toEqual(['dbid', 'bin']);
    expect(await deps.resolver.value('legal.dbid', { storeId: MOTHER_STORE_ID })).toBeNull();

    const rows = await t.prisma.auditLog.findMany({ where: { action: 'store.legal.save' } });
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows.map((r) => r.after))).not.toContain('DBID-000001');
  });

  it('PR 789 · the other cards save: details and settings of their own, a bad value is refused, a stale card is told', async () => {
    const g = await send('GET');
    const ok = await send('PUT', { key: 'contact', value: { phone: '+8801711000000', supportEmail: 'help@example.test', supportOpens: '10:00', supportCloses: '22:00', closedDay: 'friday' }, version: (g.a.cards as Record<string, { version: string }>).contact!.version });
    expect(ok.status).toBe(200);
    expect(await deps.resolver.value('contact.phone', { storeId: MOTHER_STORE_ID })).toBe('+8801711000000');
    const details = (await deps.resolver.value('store.details', { storeId: MOTHER_STORE_ID })) as { supportEmail: string; closedDay: string };
    expect(details).toMatchObject({ supportEmail: 'help@example.test', closedDay: 'friday' });
    expect((await send('PUT', { key: 'brand', value: { colorMain: 'red' } })).a.error).toBe('INVALID_INPUT');
    expect((await send('PUT', { key: 'contact', value: { supportOpens: '22:00', supportCloses: '10:00' } })).status).toBe(400);
    expect((await send('PUT', { key: 'targets', value: { targetAdPct: 101 } })).status).toBe(400);
    expect((await send('PUT', { key: 'targets', value: { targetSales: 1800000, targetAdPct: 12 } })).status).toBe(200);
    expect((await send('PUT', { key: 'nope', value: {} })).status).toBe(400);
    expect((await send('PUT', { key: 'contact', value: { closedDay: 'none' }, version: (g.a.cards as Record<string, { version: string }>).contact!.version })).status).toBe(409);
  });
});
