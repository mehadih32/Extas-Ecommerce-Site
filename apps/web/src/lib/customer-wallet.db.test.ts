// Go-live gate F-054 (follow-up of PR 171) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a customer's
// Wallet tab. No wallet yet; a hand entry refused while the owner's switch is off, then (switched on) a credit with its
// reason saved once per request key, over the largest line refused, a debit past the balance refused; each line names
// who wrote it and its order; a line put right with a new line the other way, once, the first line kept; his late order
// waits for the apology credit (only his); a reader without the money permission sees none of it. Nothing is deleted.
// Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, hashPassword, type Actor } from '@extas/auth';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { customerWallets } from './money-refunds';
import { paymentsDeps, paymentsRoute } from './payments-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const READER_PW = 'another long sentence for the tests';
const HOUR = 3_600_000;

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; key?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.43' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.key) headers['idempotency-key'] = opts.key;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)("a customer's Wallet tab on PostgreSQL (gate F-054)", () => {
  let f: OrdersFixture;
  let deps: AdminDeps;
  let owner = '';
  let ownerActor: Actor;
  const pay = async (path: string[], body: unknown, key?: string) => {
    const res = await paymentsRoute(call('POST', `/api/admin/payments/${path.join('/')}`, { body, cookie: owner, key }), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  const view = async (ids: string[], actor = ownerActor) =>
    customerWallets({ db: deps.db, resolver: deps.resolver, payments: await paymentsDeps(deps) }, { actor, ctx: { ip: '192.0.2.43', userAgent: 'SampleBrowser/1.0' } }, ids);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpOrders('customer_wallet');
    const db = f.t.prisma;
    await syncSettings(db, { registry, messages });
    await createFirstOwner(db, defaultSecurityPolicy(), { email: 'admin-owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db, resolver: new SettingsResolver(prismaBackend(db), registry), vault: null, now: () => f.clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'admin-owner@example.com', password: OWNER_PW } }), deps));
    await db.staffUser.update({ where: { email: 'reader@example.com' }, data: { passwordHash: await hashPassword(READER_PW), passwordSetAt: new Date() } });
    const o = await db.staffUser.findUniqueOrThrow({ where: { email: 'admin-owner@example.com' }, select: { id: true } });
    ownerActor = { staffUserId: o.id };
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await f?.t.drop();
  });

  it('hand entries only while the owner allows them; each line says who and which order; a line put right once', async () => {
    const db = f.t.prisma;
    const c = await db.customer.create({ data: { storeId: f.S, name: 'Wallet Sample', phone: '+8801700099001' }, select: { id: true } }); // hardcode-ok: a made-up test number
    const other = await db.customer.create({ data: { storeId: f.S, name: 'Someone Else', phone: '+8801700099002' }, select: { id: true } }); // hardcode-ok: a made-up test number

    let v = await view([c.id]);
    expect(v.wallets).toMatchObject([{ customerId: c.id, walletId: null, balanceMinor: 0, entries: [] }]);
    expect(v.can).toEqual({ wallet: true, apology: true, settings: true });
    expect(v.manual).toEqual({ enabled: false, maxMinor: null });
    expect((await pay(['wallets', c.id, 'entries'], { direction: 'CREDIT', amountMinor: 5_000, note: 'promised on the phone', confirm: true }, randomUUID())).body).toMatchObject({ ok: false, error: 'WALLET_OFF' });

    await deps.resolver.set('payments.wallet.manual', { enabled: true, maxMinor: 20_000 }, storeTarget(f.S), { actorId: null, reason: 'test' });
    v = await view([c.id]);
    expect(v.manual).toEqual({ enabled: true, maxMinor: 20_000 });
    const key = randomUUID();
    const credit = { direction: 'CREDIT', amountMinor: 15_000, kind: 'OFFER', note: 'promised on the phone', confirm: true };
    expect((await pay(['wallets', c.id, 'entries'], { ...credit, confirm: undefined }, key)).body).toMatchObject({ error: 'CONFIRM_REQUIRED' });
    expect((await pay(['wallets', c.id, 'entries'], { ...credit, amountMinor: 20_001 }, key)).body).toMatchObject({ error: 'OVER_LIMIT' });
    const first = await pay(['wallets', c.id, 'entries'], credit, key);
    expect(first.status).toBe(201);
    // the same press again is the same line
    expect((await pay(['wallets', c.id, 'entries'], credit, key)).body.entry).toMatchObject({ replay: true });
    expect((await pay(['wallets', c.id, 'entries'], { direction: 'DEBIT', amountMinor: 15_001, note: 'too much', confirm: true }, randomUUID())).body).toMatchObject({ error: 'INSUFFICIENT_BALANCE' });

    v = await view([c.id, other.id]);
    expect(v.wallets).toHaveLength(2);
    expect(v.wallets[0]).toMatchObject({ customerId: c.id, balanceMinor: 15_000, drift: false, status: 'ACTIVE' });
    expect(v.wallets[0]!.entries).toMatchObject([{ direction: 'CREDIT', amountMinor: 15_000, reason: 'OFFER', note: 'promised on the phone', by: 'Sample owner', reversible: true, reversedBy: null }]);
    expect(v.wallets[1]).toMatchObject({ customerId: other.id, walletId: null });

    // put right: a new line the other way, once; the first line stays and can no longer be put right
    const entryId = v.wallets[0]!.entries[0]!.id;
    expect((await pay(['wallets', 'entries', entryId, 'reverse'], { note: 'given to the wrong person' })).body).toMatchObject({ error: 'CONFIRM_REQUIRED' });
    expect((await pay(['wallets', 'entries', entryId, 'reverse'], { note: 'given to the wrong person', confirm: true })).status).toBe(201);
    expect((await pay(['wallets', 'entries', entryId, 'reverse'], { note: 'given to the wrong person', confirm: true })).body.entry).toMatchObject({ replay: true });
    v = await view([c.id]);
    expect(v.wallets[0]!.balanceMinor).toBe(0);
    expect(v.wallets[0]!.entries).toMatchObject([
      { direction: 'DEBIT', reason: 'CORRECTION', reversesEntryId: entryId, reversible: false, by: 'Sample owner' },
      { id: entryId, reversedBy: expect.any(String), reversible: false },
    ]);
    expect(await db.walletEntry.count({ where: { wallet: { customerId: c.id } } })).toBe(2);
    expect(await db.auditLog.count({ where: { action: { in: ['wallet.adjust', 'wallet.reverse'] } } })).toBe(2);
  });

  it("his late delivered order waits for the apology credit on his page (only his); a reader without money permission is refused", async () => {
    const db = f.t.prisma;
    const c = await db.customer.create({ data: { storeId: f.S, name: 'Late Sample', phone: '+8801700099003' }, select: { id: true } }); // hardcode-ok: a made-up test number
    const band = await db.deliveryBand.create({ data: { storeId: f.S, key: 'cw-band', nameEn: 'cw-band', chargeMinor: 0, hoursMax: 48, enabled: true }, select: { id: true } }); // hardcode-ok: a made-up test band
    const mine = await f.place('cw-late', { customerId: c.id });
    const theirs = await f.place('cw-late-other');
    const placedAt = new Date(f.clock.now.getTime() - 100 * HOUR);
    for (const id of [mine.orderId, theirs.orderId]) await db.order.update({ where: { id }, data: { status: 'DELIVERED', placedAt, deliveredAt: new Date(placedAt.getTime() + 60 * HOUR), deliveryBandId: band.id } });
    expect((await view([c.id])).apology).toEqual({ enabled: false, mode: 'PER_ORDER', rows: [] });
    await deps.resolver.set('payments.wallet.apology', { enabled: true, mode: 'PER_ORDER', kind: 'AMOUNT', amountMinor: null, percent: null, capMinor: 10_000, lateAfterHours: 0, to: 'WALLET' }, storeTarget(f.S), { actorId: null, reason: 'test' });
    const v = await view([c.id]);
    expect(v.apology.rows).toMatchObject([{ orderId: mine.orderId, number: mine.number, customerId: c.id, lateHours: 12 }]);
    expect((await pay(['orders', mine.orderId, 'apology'], { amountMinor: 3_000, note: 'sorry for the wait', confirm: true })).status).toBe(201);
    const after = await view([c.id]);
    expect(after.apology.rows).toEqual([]);
    expect(after.wallets[0]!.entries).toMatchObject([{ reason: 'APOLOGY', amountMinor: 3_000, orderId: mine.orderId, orderNumber: mine.number, reversible: true }]);

    const reader = await db.staffUser.findUniqueOrThrow({ where: { email: 'reader@example.com' }, select: { id: true } });
    await expect(view([c.id], { staffUserId: reader.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
