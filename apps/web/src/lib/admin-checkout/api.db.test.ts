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
import type { FormValue, GiftValue, PaymentsValue } from './service';

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
  cards: { payments: { value: PaymentsValue; version: string }; form: { value: FormValue; version: string }; gift: { value: GiftValue; version: string } };
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
    expect(p.showNumbers).toBe(false);
    expect(p.cod).toBe('unset');
    expect(p.wallets).toEqual([]);
    expect(p.banks).toEqual([]);
  });

  it('saves the wallet order, a switched-off way, and the numbers and bank accounts; the settings really change', async () => {
    const a0 = (await send('GET')).a.cards.payments;
    const v = clone(a0.value);
    v.mobile.list = [{ id: 'nagad', on: true }, { id: 'bkash', on: true }, { id: 'rocket', on: false }, { id: 'upay', on: true }];
    v.online = false;
    v.showNumbers = true;
    v.wallets = [{ id: 'w1', provider: 'bkash', number: '01711000000', kind: 'merchant' }];
    v.banks = [{ id: 'b1', bankName: 'Sample Bank', accountName: 'Sample Shop', accountNumber: '1234567890', branch: '', routingNumber: '' }];
    const { status, a } = await send('PUT', { key: 'payments', value: v, version: a0.version });
    expect(status).toBe(200);
    expect(await deps.resolver.value('checkout.pay.mobile.list', at)).toEqual(['nagad', 'bkash', 'upay']);
    expect(await deps.resolver.value('checkout.pay.online.enabled', at)).toBe(false);
    expect(await deps.resolver.value('checkout.pay.showNumbers', at)).toBe(true);
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

  it('PR 749: reads the details card with the shop\'s own defaults, saves the field order and the lines, and the settings really change', async () => {
    const a0 = (await send('GET')).a.cards.form;
    expect(a0.value).toEqual({ order: [{ id: 'name' }, { id: 'phone' }, { id: 'address' }], help: true, tryOn: false, nameMin: 2, addressMin: 8, note: true, noteMax: 200, confirm: 'ask', many: true, manyMin: 3 });
    const v = { ...clone(a0.value), order: [{ id: 'phone' }, { id: 'name' }, { id: 'address' }], help: false, nameMin: 3, addressMin: 12, noteMax: 120, confirm: 'disable' as const, tryOn: true };
    const { status, a } = await send('PUT', { key: 'form', value: v, version: a0.version });
    expect(status).toBe(200);
    expect(await deps.resolver.value('checkout.fieldOrder', at)).toEqual(['phone', 'name', 'address']);
    expect(await deps.resolver.value('checkout.help.enabled', at)).toBe(false);
    expect(await deps.resolver.value('checkout.form.addressMin', at)).toBe(12);
    expect(await deps.resolver.value('checkout.confirm.style', at)).toBe('disable');
    expect(a.cards.form.value.order.map((f) => f.id)).toEqual(['phone', 'name', 'address']);
    expect(await t.prisma.auditLog.count({ where: { action: 'settings.checkout.form.save' } })).toBe(1);
  });

  it('PR 749: a box left out or named twice, a number outside its range and an unknown button style are refused, and nothing is written', async () => {
    const a0 = (await send('GET')).a.cards.form;
    const was = await deps.resolver.value('checkout.note.maxChars', at);
    for (const bad of [
      { ...clone(a0.value), noteMax: was + 1, order: [{ id: 'name' }, { id: 'name' }, { id: 'phone' }] },
      { ...clone(a0.value), noteMax: was + 1, order: [{ id: 'name' }, { id: 'phone' }] },
      { ...clone(a0.value), noteMax: 5 },
      { ...clone(a0.value), addressMin: 3 },
      { ...clone(a0.value), manyMin: 21 },
      { ...clone(a0.value), noteMax: was + 1, confirm: 'shout' },
    ]) {
      const r = await send('PUT', { key: 'form', value: bad, version: a0.version });
      expect(r.status).toBe(400);
      expect(r.a.error).toBe('INVALID_INPUT');
    }
    expect(await deps.resolver.value('checkout.note.maxChars', at)).toBe(was);
  });

  it('PR 749: a name the owner does not ask for (shortest name 0) is accepted; 21 is refused', async () => {
    const a0 = (await send('GET')).a.cards.form;
    const ok = await send('PUT', { key: 'form', value: { ...clone(a0.value), nameMin: 0 }, version: a0.version });
    expect(ok.status).toBe(200);
    expect(await deps.resolver.value('checkout.form.nameMin', at)).toBe(0);
    const a1 = ok.a.cards.form;
    expect((await send('PUT', { key: 'form', value: { ...clone(a1.value), nameMin: 21 }, version: a1.version })).status).toBe(400);
    expect((await send('PUT', { key: 'form', value: { ...clone(a1.value), nameMin: 2 }, version: a1.version })).status).toBe(200);
  });

  it('PR 748: the gift card reads the shop\'s defaults, an owner saves it (a fixed advance in whole units), and the setting really changes', async () => {
    const a0 = (await send('GET')).a.cards.gift;
    expect(a0.value).toEqual({ enabled: false, noteMax: 200, maxDays: 30, hidePrices: true, advanceRequired: true, advanceType: 'full', amount: null, percent: null });
    const v = { ...clone(a0.value), enabled: true, advanceType: 'fixed' as const, amount: 250.5, noteMax: 150 };
    const r = await send('PUT', { key: 'gift', value: v, version: a0.version });
    expect(r.status).toBe(200);
    const g = await deps.resolver.value('checkout.gift', at);
    expect(g).toEqual({ enabled: true, advance: { required: true, type: 'fixed', amountMinor: 25050, percent: null }, noteMaxChars: 150, deliverAfterMaxDays: 30, hidePricesDefault: true });
    expect(r.a.cards.gift.value.amount).toBe(250.5);
    expect(await t.prisma.auditLog.count({ where: { action: 'settings.checkout.gift.save' } })).toBe(1);
  });

  it('PR 748: a gift card with a fixed advance and no amount, or a percentage of 0, is refused and writes nothing', async () => {
    const a0 = (await send('GET')).a.cards.gift;
    const before = await deps.resolver.value('checkout.gift', at);
    for (const bad of [{ ...clone(a0.value), advanceType: 'fixed' as const, amount: null }, { ...clone(a0.value), advanceType: 'percent' as const, percent: 0 }, { ...clone(a0.value), noteMax: 1001 }]) {
      expect((await send('PUT', { key: 'gift', value: bad, version: a0.version })).status).toBe(400);
    }
    expect(await deps.resolver.value('checkout.gift', at)).toEqual(before);
  });

  it('a stale version is refused and says the current one', async () => {
    const a0 = (await send('GET')).a.cards.payments;
    const r = await send('PUT', { key: 'payments', value: clone(a0.value), version: 'old-version' });
    expect(r.status).toBe(409);
    expect(r.a.error).toBe('STALE');
    expect(r.a.version).toBe(a0.version);
  });
});
