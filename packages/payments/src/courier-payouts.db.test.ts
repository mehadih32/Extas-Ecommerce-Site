// S28 · PR 671 — courier payouts through the courier's own payment request, on a real PostgreSQL (throwaway database; skipped
// without TEST_DATABASE_ADMIN_URL): off as shipped; asking needs payments.settle AND the owner's PIN; a request is asked once
// (the same key is the same request) and only one is open at a time; the poll reads it back (REQUESTED → PROCESSING → PAID)
// and a PAID one settles the covered parcels on an imported statement; a paid amount that differs is flagged, never
// corrected; a courier that did not answer leaves an open, unconfirmed request for a person to close; a refused request is
// kept with the courier's words; a person without payments.settle is left a PAID request to settle by hand. The courier is a
// stand-in. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CourierApi, CourierPayoutInfo, PayoutRequestResult } from '@extas/adapters';
import { hashPassword } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { couriersV5Settings } from '@extas/settings';
import { closePayout, payoutDifference, payoutView, pollPayouts, requestPayout, settlePayout } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const PIN = '482913'; // hardcode-ok: test fixture, a made-up PIN
const DAY = 86_400_000;

describe('PR 671 · payoutDifference', () => {
  it('is null when equal or unknown, else paid minus covered', () => {
    expect(payoutDifference(null, 100)).toBeNull();
    expect(payoutDifference(100, 100)).toBeNull();
    expect(payoutDifference(95, 100)).toBe(-5);
    expect(payoutDifference(120, 100)).toBe(20);
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 671 · courier payouts', () => {
  let f: PaymentsFixture;
  let courierId = '';
  let n = 0;
  const asked: { merchantRef: string; amountMinor: number | null; note?: string | null }[] = [];
  let answer: PayoutRequestResult = {
    ok: true,
    payout: { ref: 'REQ-1', state: 'REQUESTED', amountMinor: null, paymentRef: null, method: null, paidAt: null, rawStatus: 'pending', note: null, consignmentIds: [] },
  };
  let status: CourierPayoutInfo | null = null;
  const api = {
    provider: 'steadfast',
    payouts: {
      request: async (i: { merchantRef: string; amountMinor: number | null; note?: string | null }) => {
        asked.push(i);
        return answer;
      },
      status: async () => status,
      list: async () => [],
    },
    balance: async () => ({ balanceMinor: 999_000 }),
  } as unknown as CourierApi;
  const deps = () => f.deps({ couriers: async () => ({ api, mode: 'MOCK' as const }) });
  const info = (state: CourierPayoutInfo['state'], extra: Partial<CourierPayoutInfo> = {}): CourierPayoutInfo => ({
    ref: 'REQ-1',
    state,
    amountMinor: null,
    paymentRef: null,
    method: null,
    paidAt: null,
    rawStatus: state.toLowerCase(),
    note: null,
    consignmentIds: [],
    ...extra,
  });
  const key = () => `payout-key-${(n += 1).toString().padStart(4, '0')}`;
  const parcel = async (no: string) => {
    const o = await f.order({ number: no, lines: [100_000] }); // hardcode-ok: test fixture, a made-up price
    await f.shipment(o.id, { courierAccountId: courierId, consignmentId: `CN-${no}`, status: 'DELIVERED', chargeMinor: 6_000, deliveredAt: new Date(f.clock.now.getTime() - 2 * DAY) });
    return o;
  };

  beforeAll(async () => {
    f = await setUpPayments('payments_671');
    const p = f.t.prisma;
    courierId = (await p.courierAccount.create({ data: { storeId: f.A, providerKey: 'steadfast', name: 'Payout courier', enabled: true } })).id;
    // the owner and the owner's PIN (only its hash is stored)
    const ownerRole = await p.role.findFirstOrThrow({ where: { key: 'owner' } });
    const owner = await p.staffUser.create({ data: { email: 'owner671@example.com', displayName: 'Owner', passwordHash: 'not-a-login', booksPinHash: await hashPassword(PIN) } });
    await p.staffRoleAssignment.create({ data: { staffUserId: owner.id, roleId: ownerRole.id, storeId: null } });
  });
  afterAll(async () => f?.t.drop());

  it('when the owner switches it off: nothing is asked and the screen says why', async () => {
    f.overrides.set('delivery.courier.payouts', { enabled: false, pollMinutes: 30, minAmountMinor: 0 });
    await parcel('P-1001');
    await parcel('P-1002');
    expect((await payoutView(deps(), f.viewer, courierId)).blockedBy).toContain('OFF');
    expect(await code(requestPayout(deps(), f.staff, courierId, { pin: PIN, requestKey: key() }))).toBe('PAYOUTS_OFF');
    expect(asked).toHaveLength(0);
  });

  it("asking needs payments.settle and the owner's PIN; the request is asked once; only one is open", async () => {
    f.overrides.set('delivery.courier.payouts', { enabled: true, pollMinutes: 30, minAmountMinor: 0 });
    const v = await payoutView(deps(), f.viewer, courierId);
    expect(v).toMatchObject({ supported: 'request', enabled: true, courierBalanceMinor: 999_000, holds: { parcels: 2, cashMinor: 200_000, chargesMinor: 12_000, netMinor: 188_000 }, blockedBy: [] });
    const k = key();
    expect(await code(requestPayout(deps(), f.viewer, courierId, { pin: PIN, requestKey: k }))).toBe('FORBIDDEN');
    expect(await code(requestPayout(deps(), f.staff, courierId, { pin: '', requestKey: k }))).toBe('PIN_REQUIRED');
    expect(await code(requestPayout(deps(), f.staff, courierId, { pin: '000111', requestKey: k }))).toBe('WRONG_PIN');
    expect(asked).toHaveLength(0);
    const r = await requestPayout(deps(), f.staff, courierId, { pin: PIN, requestKey: k });
    expect(r).toMatchObject({ state: 'REQUESTED', providerRef: 'REQ-1', amountMinor: 188_000, coveredMinor: 188_000, parcels: 2, mode: 'MOCK', replay: false });
    // PR 674: the owner's payout text is the request's note only while its switch is on (off here)
    expect(asked).toEqual([{ merchantRef: r.id, amountMinor: 188_000, note: null }]);
    // the same key is the same request; another key while one is open is refused
    expect(await requestPayout(deps(), f.staff, courierId, { pin: PIN, requestKey: k })).toMatchObject({ id: r.id, replay: true });
    expect(await code(requestPayout(deps(), f.staff, courierId, { pin: PIN, requestKey: key() }))).toBe('PAYOUT_OPEN');
    expect(asked).toHaveLength(1);
    expect((await payoutView(deps(), f.viewer, courierId)).open?.id).toBe(r.id);
    // the PIN is never stored: the audit log keeps the amount, not the PIN
    const logs = await f.t.prisma.auditLog.findMany({ where: { entityType: 'CourierPayout', entityId: r.id } });
    expect(JSON.stringify(logs)).not.toContain(PIN);
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['courier.payout.request', 'courier.payout.asked']));
  });

  it("the poll reads it back on the owner's interval; PAID settles the covered parcels on an imported statement, once", async () => {
    status = info('PROCESSING');
    // just asked: not due yet (the courier answered at the request); after the owner's interval it is read
    expect(await pollPayouts(deps(), f.A)).toMatchObject({ checked: 0 });
    f.advance(31 * 60_000);
    expect(await pollPayouts(deps(), f.A)).toMatchObject({ checked: 1, changed: 1 });
    expect((await payoutView(deps(), f.viewer, courierId)).open?.state).toBe('PROCESSING');
    // asked again within the interval: nothing to check
    expect(await pollPayouts(deps(), f.A)).toMatchObject({ checked: 0 });
    f.advance(31 * 60_000);
    status = info('PAID', { amountMinor: 188_000, paymentRef: 'BANK-7788', method: 'bank', paidAt: new Date(f.clock.now.getTime() - 60_000) });
    expect(await pollPayouts(deps(), f.A)).toMatchObject({ checked: 1, paid: 1, settled: 1, unsettled: 0 });
    const v = await payoutView(deps(), f.viewer, courierId);
    expect(v.open).toBeNull();
    expect(v.rows[0]).toMatchObject({ state: 'PAID', paidMinor: 188_000, differenceMinor: null, paymentRef: 'BANK-7788', settleError: null });
    expect(v.rows[0]!.settledAt).toBeInstanceOf(Date);
    const s = await f.t.prisma.courierSettlement.findFirstOrThrow({ where: { courierAccountId: courierId, reference: 'PAYOUT-REQ-1' }, include: { lines: true } });
    expect(s).toMatchObject({ totalCodMinor: 200_000, chargesMinor: 12_000, netMinor: 188_000, receivedAs: 'BANK' });
    expect(s.lines).toHaveLength(2);
    // the parcels are on a statement now: nothing is held, and settling again changes nothing
    expect(v.holds.parcels).toBe(0);
    expect(await settlePayout(deps(), f.staff, v.rows[0]!.id)).toMatchObject({ settledAt: v.rows[0]!.settledAt });
    expect(await f.t.prisma.courierSettlement.count({ where: { courierAccountId: courierId } })).toBe(1);
    expect(await code(settlePayout(deps(), f.staff, 'not-an-id'))).toBe('NOT_FOUND');
  });

  it('a paid amount that differs is flagged and kept as the courier said; a person without payments.settle leaves it to be settled by hand', async () => {
    await parcel('P-2001');
    answer = { ok: true, payout: info('REQUESTED', { ref: 'REQ-2' }) };
    const r = await requestPayout(deps(), f.staff, courierId, { pin: PIN, requestKey: key() });
    // the person who asked has lost the right: the poll marks it PAID, flags the difference and cannot settle it
    await f.t.prisma.courierPayout.update({ where: { id: r.id }, data: { requestedById: f.viewer.actor.staffUserId } });
    status = info('PAID', { ref: 'REQ-2', amountMinor: 90_000, paymentRef: 'BANK-7790', method: 'bkash' });
    f.advance(31 * 60_000);
    expect(await pollPayouts(deps(), f.A)).toMatchObject({ paid: 1, settled: 0, unsettled: 1 });
    let v = await payoutView(deps(), f.viewer, courierId);
    expect(v.rows[0]).toMatchObject({ id: r.id, state: 'PAID', paidMinor: 90_000, coveredMinor: 94_000, differenceMinor: -4_000, settledAt: null, settleError: 'FORBIDDEN' });
    expect(await code(settlePayout(deps(), f.viewer, r.id))).toBe('FORBIDDEN');
    expect(await settlePayout(deps(), f.staff, r.id)).toMatchObject({ differenceMinor: -4_000, settleError: null });
    expect((await f.t.prisma.courierSettlement.findFirstOrThrow({ where: { courierAccountId: courierId, reference: 'PAYOUT-REQ-2' } })).receivedAs).toBe('BKASH');
    v = await payoutView(deps(), f.viewer, courierId);
    expect(v.rows[0]!.settledAt).toBeInstanceOf(Date);
  });

  it('a courier that did not answer leaves an open request for a person to close; a refused one is kept with its words', async () => {
    // the same courier id again for the stand-in: new parcels, new request references
    await parcel('P-3001');
    answer = { ok: false, error: 'timeout', unknown: true };
    const r = await requestPayout(deps(), f.staff, courierId, { pin: PIN, requestKey: key() });
    expect(r).toMatchObject({ state: 'REQUESTED', providerRef: null, settleError: 'UNKNOWN' });
    expect(await code(requestPayout(deps(), f.staff, courierId, { pin: PIN, requestKey: key() }))).toBe('PAYOUT_OPEN');
    // the poll leaves an unconfirmed request alone
    f.advance(31 * 60_000);
    expect(await pollPayouts(deps(), f.A)).toMatchObject({ checked: 0 });
    expect(await code(closePayout(deps(), f.viewer, r.id, { note: 'checked the courier panel' }))).toBe('FORBIDDEN');
    expect(await code(closePayout(deps(), f.staff, r.id, { note: 'no' }))).toBe('INVALID_INPUT');
    expect(await closePayout(deps(), f.staff, r.id, { note: 'checked the courier panel: no request there' })).toMatchObject({ state: 'REJECTED' });
    // a refusal by the courier: kept as REJECTED with its words
    answer = { ok: false, error: 'balance too low', unknown: false };
    const e = await requestPayout(deps(), f.staff, courierId, { pin: PIN, requestKey: key() }).catch((x) => x as { code: string; data?: { payoutId?: string } });
    expect((e as { code: string }).code).toBe('PAYOUT_REFUSED');
    const kept = await f.t.prisma.courierPayout.findFirstOrThrow({ where: { id: (e as { data: { payoutId: string } }).data.payoutId } });
    expect(kept).toMatchObject({ state: 'REJECTED', note: 'balance too low' });
  });

  it('a minimum below which nothing is asked; a courier with no request of its own is refused', async () => {
    f.overrides.set('delivery.courier.payouts', { enabled: true, pollMinutes: 30, minAmountMinor: 1_000_000 });
    answer = { ok: true, payout: info('REQUESTED', { ref: 'REQ-9' }) };
    expect((await payoutView(deps(), f.viewer, courierId)).blockedBy).toContain('BELOW_MINIMUM');
    expect(await code(requestPayout(deps(), f.staff, courierId, { pin: PIN, requestKey: key() }))).toBe('PAYOUT_NOTHING');
    f.overrides.set('delivery.courier.payouts', { enabled: true, pollMinutes: 30, minAmountMinor: 0 });
    const redx = await f.t.prisma.courierAccount.create({ data: { storeId: f.A, providerKey: 'redx', name: 'RedX courier', enabled: true } });
    expect((await payoutView(deps(), f.viewer, redx.id)).supported).toBe('none');
    expect(await code(requestPayout(deps(), f.staff, redx.id, { pin: PIN, requestKey: key() }))).toBe('PAYOUT_NOT_SUPPORTED');
    expect(await code(requestPayout(deps(), { ...f.staff, storeId: f.B }, courierId, { pin: PIN, requestKey: key() }))).toBe('FORBIDDEN');
  });

  it("PR 674: with the owner's texts on, the payout text is the request's note", async () => {
    f.overrides.set('delivery.courier.payouts', { enabled: true, pollMinutes: 30, minAmountMinor: 0 });
    f.overrides.set('delivery.courier.messages', { ...couriersV5Settings['delivery.courier.messages'].default, enabled: true });
    answer = { ok: true, payout: info('REQUESTED', { ref: 'REQ-77' }) };
    const before = asked.length;
    await requestPayout(deps(), f.staff, courierId, { pin: PIN, requestKey: key() });
    expect(asked[before]?.amountMinor).toBeGreaterThan(0);
    expect(asked[before]?.note).toBe(`Please pay the cash you hold for us: ${((asked[before]?.amountMinor ?? 0) / 100).toFixed(2)}.`);
  });
});
