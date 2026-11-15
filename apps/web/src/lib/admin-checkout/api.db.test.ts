// PR 748 + 749 — Settings › Checkout on a real PostgreSQL: the cards read with the shop's own defaults, saved whole with a
// fresh version, the settings they stand for really change, Cash on Delivery has no value until an owner sets one and only an
// owner changes it, a number that is not a phone number or a stale version is refused, and a refused card writes nothing.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Made-up test values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { checkoutHandler } from './api';
import type { FormValue, PaymentsValue } from './service';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.51' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/settings/checkout'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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
  version?: string;
  owner: boolean;
  cards: { payments: { value: PaymentsValue; version: string }; form: { value: FormValue; version: string } };
}

describe.skipIf(!HAS_TEST_DB)('Settings › Checkout on PostgreSQL (PR 748, 749)', () => {
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
    const res = await checkoutHandler(call(method, { cookie, body: b }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const at = { storeId: MOTHER_STORE_ID };
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  it('needs a sign-in, then reads the payments card with the shop\'s own defaults and no Cash on Delivery decision', async () => {
    expect((await checkoutHandler(call('GET'), deps)).status).toBe(401);
    const { status, a } = await send('GET');
    expect(status).toBe(200);
    expect(a.owner).toBe(true);
    const p = a.cards.payments.value;
    expect(p.mobile).toEqual({ on: true, list: [{ id: 'bkash', on: true }, { id: 'nagad', on: true }, { id: 'rocket', on: true }, { id: 'upay', on: false }] });
    expect(p.card.on).toBe(true);
    expect(p.online).toBe(true);
    expect(p.cod).toBe('unset');
    expect(p.wallets).toEqual([]);
    expect(p.banks).toEqual([]);
  });

  it('saves the wallet order, a switched-off way, and the numbers and bank accounts; the settings really change', async () => {
    const a0 = (await send('GET')).a.cards.payments;
    const v = clone(a0.value);
    v.mobile.list = [{ id: 'nagad', on: true }, { id: 'bkash', on: true }, { id: 'rocket', on: false }, { id: 'upay', on: true }];
    v.online = false;
    v.wallets = [{ id: 'w1', provider: 'bkash', number: '01711000000', kind: 'merchant' }];
    v.banks = [{ id: 'b1', bankName: 'Sample Bank', accountName: 'Sample Shop', accountNumber: '1234567890', branch: '', routingNumber: '' }];
    const { status, a } = await send('PUT', { key: 'payments', value: v, version: a0.version });
    expect(status).toBe(200);
    expect(await deps.resolver.value('checkout.pay.mobile.list', at)).toEqual(['nagad', 'bkash', 'upay']);
    expect(await deps.resolver.value('checkout.pay.online.enabled', at)).toBe(false);
    // a Bangladesh mobile typed the way it is dialled at home is kept in +880 form
    expect(await deps.resolver.value('payment.wallet.numbers', at)).toEqual([{ provider: 'bkash', number: '+8801711000000', kind: 'merchant' }]);
    expect(await deps.resolver.value('payment.bank.accounts', at)).toEqual([{ bankName: 'Sample Bank', accountName: 'Sample Shop', accountNumber: '1234567890' }]);
    expect(a.cards.payments.value.wallets[0]?.number).toBe('+8801711000000');
    const log = await t.prisma.auditLog.findMany({ where: { action: 'settings.checkout.payments.save' } });
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log[0]!.after)).not.toContain('1711000000');
  });

  it('Cash on Delivery: an owner decides it (with his OK), it stays off the list of things a page can reset to nothing', async () => {
    const a0 = (await send('GET')).a.cards.payments;
    const on = { ...clone(a0.value), cod: 'on' as const };
    const r = await send('PUT', { key: 'payments', value: on, version: a0.version });
    expect(r.status).toBe(200);
    expect(await deps.resolver.value('payment.cod.enabled', at)).toBe(true);
    // going back to "not decided" is not a thing a page does
    const a1 = r.a.cards.payments;
    const back = await send('PUT', { key: 'payments', value: { ...clone(a1.value), cod: 'unset' }, version: a1.version });
    expect(back.status).toBe(400);
    expect(await deps.resolver.value('payment.cod.enabled', at)).toBe(true);
    const off = await send('PUT', { key: 'payments', value: { ...clone(a1.value), cod: 'off' }, version: a1.version });
    expect(off.status).toBe(200);
    expect(await deps.resolver.value('payment.cod.enabled', at)).toBe(false);
  });

  it('refuses a number that is not a phone number, a way that is on with nothing shown, and writes nothing', async () => {
    const a0 = (await send('GET')).a.cards.payments;
    const before = await deps.resolver.value('checkout.pay.online.enabled', at);
    const bad = { ...clone(a0.value), online: !before, wallets: [{ id: 'w1', provider: 'bkash', number: 'not a number', kind: 'merchant' as const }] };
    const r = await send('PUT', { key: 'payments', value: bad, version: a0.version });
    expect(r.status).toBe(400);
    expect(r.a.error).toBe('INVALID_INPUT');
    expect(await deps.resolver.value('checkout.pay.online.enabled', at)).toBe(before);
    const none = { ...clone(a0.value), mobile: { on: true, list: a0.value.mobile.list.map((x) => ({ ...x, on: false })) } };
    expect((await send('PUT', { key: 'payments', value: none, version: a0.version })).status).toBe(400);
  });

  it('a stale version is refused and says the current one', async () => {
    const a0 = (await send('GET')).a.cards.payments;
    const r = await send('PUT', { key: 'payments', value: clone(a0.value), version: 'old-version' });
    expect(r.status).toBe(409);
    expect(r.a.error).toBe('STALE');
    expect(r.a.version).toBe(a0.version);
  });
});
