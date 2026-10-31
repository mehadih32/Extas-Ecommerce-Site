// S07 · PR 171 — the wallet on a real PostgreSQL (throwaway database; skipped without TEST_DATABASE_ADMIN_URL): the one
// ledger writer (made on first use, one entry per key, never below zero, the balance after every entry), a person's
// own credit and debit (off by default, the owner's limit, confirmed, audited), a correction as a new entry the other
// way (once; money spent or refunded is never reversed by hand), the ledger never edited (append-only), the balance
// worked out from the ledger, and the late-delivery apology credit per order and by rule (CN-018 #8, SIM-F-054).
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { adjustWallet, apologyCandidates, giveApology, postWalletEntry, reverseWalletEntry, walletOf } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const HOUR = 3_600_000;

describe.skipIf(!HAS_TEST_DB)('PR 171 · the wallet', () => {
  let f: PaymentsFixture;
  const MANUAL_ON = { enabled: true, maxMinor: 50_000 };

  beforeAll(async () => {
    f = await setUpPayments('payments_171');
  });
  afterAll(async () => f?.t.drop());

  it('the one writer: made on first use, one entry per key, never below zero, the balance after every entry', async () => {
    const c = await f.customer('Ledger Customer');
    const post = (key: string, direction: 'CREDIT' | 'DEBIT', amountMinor: number) =>
      f.t.prisma.$transaction((tx) => postWalletEntry(tx, { storeId: f.A, customerId: c.id, direction, amountMinor, reason: direction === 'CREDIT' ? 'MANUAL_CREDIT' : 'MANUAL_DEBIT', idempotencyKey: key }));
    const a = await post('k-1', 'CREDIT', 30_000);
    expect(a).toMatchObject({ balanceAfterMinor: 30_000, replay: false });
    expect(await post('k-1', 'CREDIT', 30_000)).toMatchObject({ entryId: a.entryId, replay: true });
    expect(await code(post('k-1', 'CREDIT', 31_000))).toBe('IDEMPOTENCY_MISMATCH');
    expect(await post('k-2', 'DEBIT', 12_000)).toMatchObject({ balanceAfterMinor: 18_000 });
    expect(await code(post('k-3', 'DEBIT', 18_001))).toBe('INSUFFICIENT_BALANCE');
    expect(await code(post('k-4', 'CREDIT', 0))).toBe('INVALID_INPUT');
    // another store's customer has no wallet here
    const other = await f.customer('Store B customer', f.B);
    expect(await code(f.t.prisma.$transaction((tx) => postWalletEntry(tx, { storeId: f.A, customerId: other.id, direction: 'CREDIT', amountMinor: 1, reason: 'OFFER', idempotencyKey: 'k-x' })))).toBe('NOT_FOUND');
    const w = await walletOf(f.deps(), f.viewer, c.id);
    expect(w).toMatchObject({ balanceMinor: 18_000, ledgerMinor: 18_000, drift: false, status: 'ACTIVE', more: false });
    expect(w!.entries.map((e) => [e.direction, e.amountMinor, e.balanceAfterMinor])).toEqual([
      ['DEBIT', 12_000, 18_000],
      ['CREDIT', 30_000, 30_000],
    ]);
    // a frozen wallet takes nothing new
    await f.t.prisma.walletAccount.update({ where: { customerId: c.id }, data: { status: 'FROZEN' } });
    expect(await code(post('k-5', 'CREDIT', 1_000))).toBe('WALLET_CLOSED');
    await f.t.prisma.walletAccount.update({ where: { customerId: c.id }, data: { status: 'ACTIVE' } });
  });

  it('the ledger is never edited at the database; a cached balance written without an entry shows as drift', async () => {
    const c = await f.customer('Append-only Customer');
    const r = await f.t.prisma.$transaction((tx) => postWalletEntry(tx, { storeId: f.A, customerId: c.id, direction: 'CREDIT', amountMinor: 2_000, reason: 'OFFER', idempotencyKey: 'ao-1' }));
    expect(await code(f.t.prisma.walletEntry.update({ where: { id: r.entryId }, data: { amountMinor: 9_000 } }))).not.toBe('OK');
    expect(await code(f.t.prisma.walletEntry.delete({ where: { id: r.entryId } }))).not.toBe('OK');
    await f.t.prisma.walletAccount.update({ where: { customerId: c.id }, data: { balanceMinor: 5_000 } });
    expect(await walletOf(f.deps(), f.viewer, c.id)).toMatchObject({ balanceMinor: 5_000, ledgerMinor: 2_000, drift: true });
  });

  it("a person's own entry: off by default, then with a key, the limit and the amount confirmed; audited", async () => {
    const c = await f.customer('Goodwill Customer');
    const input = { direction: 'CREDIT', amountMinor: 20_000, note: 'sorry for the wrong size label', confirm: true };
    expect(await code(adjustWallet(f.deps(), f.staff, c.id, input, { idempotencyKey: 'adj-0001' }))).toBe('WALLET_OFF');
    f.overrides.set('payments.wallet.manual', MANUAL_ON);
    try {
      expect(await code(adjustWallet(f.deps(), f.viewer, c.id, input, { idempotencyKey: 'adj-0001' }))).toBe('FORBIDDEN');
      expect(await code(adjustWallet(f.deps(), f.staff, c.id, input))).toBe('INVALID_INPUT');
      expect(await code(adjustWallet(f.deps(), f.staff, c.id, { ...input, amountMinor: 50_001 }, { idempotencyKey: 'adj-0002' }))).toBe('OVER_LIMIT');
      expect(await code(adjustWallet(f.deps(), f.staff, c.id, { ...input, confirm: false }, { idempotencyKey: 'adj-0003' }))).toBe('CONFIRM_REQUIRED');
      expect(await code(adjustWallet(f.deps(), f.staff, c.id, { ...input, note: '' }, { idempotencyKey: 'adj-0004' }))).toBe('INVALID_INPUT');
      expect(await code(adjustWallet(f.deps(), f.staff, c.id, { ...input, direction: 'DEBIT', kind: 'OFFER' }, { idempotencyKey: 'adj-0005' }))).toBe('INVALID_INPUT');
      const r = await adjustWallet(f.deps(), f.staff, c.id, input, { idempotencyKey: 'adj-0001' });
      expect(r).toMatchObject({ reason: 'MANUAL_CREDIT', balanceAfterMinor: 20_000, replay: false });
      expect(await adjustWallet(f.deps(), f.staff, c.id, input, { idempotencyKey: 'adj-0001' })).toMatchObject({ entryId: r.entryId, replay: true });
      expect(await code(adjustWallet(f.deps(), f.staff, c.id, { ...input, direction: 'DEBIT', amountMinor: 20_001 }, { idempotencyKey: 'adj-0006' }))).toBe('INSUFFICIENT_BALANCE');
      const debit = await adjustWallet(f.deps(), f.staff, c.id, { ...input, direction: 'DEBIT', amountMinor: 5_000, note: 'customer asked to take it off' }, { idempotencyKey: 'adj-0007' });
      expect(debit).toMatchObject({ reason: 'MANUAL_DEBIT', balanceAfterMinor: 15_000 });
      const audit = await f.t.prisma.auditLog.findMany({ where: { action: 'wallet.adjust', entityId: { in: [r.entryId, debit.entryId] } } });
      expect(audit).toHaveLength(2);
      expect(audit[0]).toMatchObject({ actorType: 'STAFF', actorId: f.staffId });
      const e = await f.t.prisma.walletEntry.findUniqueOrThrow({ where: { id: r.entryId } });
      expect(e).toMatchObject({ actorId: f.staffId, note: 'sorry for the wrong size label', idempotencyKey: 'manual:adj-0001' });
    } finally {
      f.overrides.delete('payments.wallet.manual');
    }
  });

  it('a correction is a new entry the other way, once; money spent on an order is never reversed by hand', async () => {
    const c = await f.customer('Correction Customer');
    f.overrides.set('payments.wallet.manual', MANUAL_ON);
    try {
      const r = await adjustWallet(f.deps(), f.staff, c.id, { direction: 'CREDIT', amountMinor: 7_000, note: 'typed the wrong customer', confirm: true }, { idempotencyKey: 'rev-0001' });
      expect(await code(reverseWalletEntry(f.deps(), f.staff, r.entryId, { note: 'wrong customer' }))).toBe('CONFIRM_REQUIRED');
      const back = await reverseWalletEntry(f.deps(), f.staff, r.entryId, { note: 'wrong customer', confirm: true });
      expect(back).toMatchObject({ direction: 'DEBIT', amountMinor: 7_000, reason: 'CORRECTION', balanceAfterMinor: 0, replay: false });
      expect(await reverseWalletEntry(f.deps(), f.staff, r.entryId, { note: 'again', confirm: true })).toMatchObject({ entryId: back.entryId, replay: true });
      expect(await code(reverseWalletEntry(f.deps(), f.staff, back.entryId, { note: 'undo the undo', confirm: true }))).toBe('NOT_REVERSIBLE');
      const w = await walletOf(f.deps(), f.staff, c.id);
      expect(w!.entries.find((e) => e.id === r.entryId)).toMatchObject({ reversedBy: back.entryId });
      expect(w!.entries.find((e) => e.id === back.entryId)).toMatchObject({ reversesEntryId: r.entryId });
      // the checkout's own debit is a refund's business
      const spent = await f.t.prisma.$transaction((tx) => postWalletEntry(tx, { storeId: f.A, customerId: c.id, direction: 'CREDIT', amountMinor: 1_000, reason: 'OFFER', idempotencyKey: 'rev-offer' }));
      const order = await f.t.prisma.$transaction((tx) => postWalletEntry(tx, { storeId: f.A, customerId: c.id, direction: 'DEBIT', amountMinor: 1_000, reason: 'ORDER', idempotencyKey: 'rev-order' }));
      expect(spent.balanceAfterMinor).toBe(1_000);
      expect(await code(reverseWalletEntry(f.deps(), f.staff, order.entryId, { note: 'give it back', confirm: true }))).toBe('NOT_REVERSIBLE');
      expect(await f.t.prisma.auditLog.count({ where: { action: 'wallet.reverse', entityId: back.entryId } })).toBe(1);
    } finally {
      f.overrides.delete('payments.wallet.manual');
    }
  });

  it('the apology credit per order: off by default, a customer needed, once per order, on the timeline (CN-018 #8)', async () => {
    const c = await f.customer('Late Customer');
    const band = await f.band('dhaka-171', 48);
    const placedAt = new Date(f.clock.now.getTime() - 100 * HOUR);
    const o = await f.order({ number: 'W-1', status: 'DELIVERED', customerId: c.id, placedAt, deliveredAt: new Date(placedAt.getTime() + 60 * HOUR), deliveryBandId: band.id, lines: [100_000] });
    const guest = await f.order({ number: 'W-2', status: 'DELIVERED', placedAt, deliveredAt: f.clock.now, deliveryBandId: band.id });
    expect(await code(giveApology(f.deps(), f.staff, o.id, { amountMinor: 5_000, confirm: true }))).toBe('APOLOGY_OFF');
    expect(await apologyCandidates(f.deps(), f.viewer)).toEqual({ enabled: false, rows: [] });
    f.overrides.set('payments.wallet.apology', { enabled: true, mode: 'PER_ORDER', kind: 'AMOUNT', amountMinor: null, percent: null, capMinor: 10_000, lateAfterHours: 0, to: 'WALLET' });
    try {
      const list = await apologyCandidates(f.deps(), f.viewer);
      expect(list.rows.filter((r) => r.number === 'W-1')).toEqual([{ orderId: o.id, number: 'W-1', customerId: c.id, deliveredAt: expect.any(Date), lateHours: 12, ruleMinor: null }]);
      // gate F-054: one customer's page lists only his own late orders
      expect((await apologyCandidates(f.deps(), f.viewer, { customerIds: [c.id] })).rows.map((r) => r.number)).toEqual(['W-1']);
      expect((await apologyCandidates(f.deps(), f.viewer, { customerIds: [] })).rows).toEqual([]);
      expect(await code(giveApology(f.deps(), f.viewer, o.id, { amountMinor: 5_000, confirm: true }))).toBe('FORBIDDEN');
      expect(await code(giveApology(f.deps(), f.staff, guest.id, { amountMinor: 5_000, confirm: true }))).toBe('NO_CUSTOMER');
      expect(await code(giveApology(f.deps(), f.staff, o.id, { confirm: true }))).toBe('INVALID_INPUT');
      expect(await code(giveApology(f.deps(), f.staff, o.id, { amountMinor: 10_001, confirm: true }))).toBe('OVER_LIMIT');
      expect(await code(giveApology(f.deps(), f.staff, o.id, { amountMinor: 5_000 }))).toBe('CONFIRM_REQUIRED');
      const r = await giveApology(f.deps(), f.staff, o.id, { amountMinor: 5_000, note: 'six days late', confirm: true });
      expect(r).toMatchObject({ amountMinor: 5_000, balanceAfterMinor: 5_000, replay: false, number: 'W-1' });
      expect(await giveApology(f.deps(), f.staff, o.id, { amountMinor: 5_000, confirm: true })).toMatchObject({ entryId: r.entryId, replay: true });
      expect(await code(giveApology(f.deps(), f.staff, o.id, { amountMinor: 6_000, confirm: true }))).toBe('ALREADY_RECORDED');
      expect((await apologyCandidates(f.deps(), f.viewer)).rows.map((x) => x.number)).not.toContain('W-1');
      const events = await f.t.prisma.orderEvent.findMany({ where: { orderId: o.id, type: 'wallet.apology' } });
      expect(events).toHaveLength(1);
      expect(await f.t.prisma.walletEntry.count({ where: { orderId: o.id, reason: 'APOLOGY' } })).toBe(1);
    } finally {
      f.overrides.delete('payments.wallet.apology');
    }
  });

  it('the apology credit by rule: the rule decides the amount, only when late enough (SIM-F-054: late past promise → credit per rule)', async () => {
    const c = await f.customer('Rule Customer');
    const band = await f.band('outside-171', 72);
    const placedAt = new Date(f.clock.now.getTime() - 200 * HOUR);
    const late = await f.order({ number: 'W-3', status: 'DELIVERED', customerId: c.id, placedAt, deliveredAt: new Date(placedAt.getTime() + 100 * HOUR), deliveryBandId: band.id, lines: [80_000, 40_000] });
    const bitLate = await f.order({ number: 'W-4', status: 'DELIVERED', customerId: c.id, placedAt, deliveredAt: new Date(placedAt.getTime() + 80 * HOUR), deliveryBandId: band.id });
    const onTime = await f.order({ number: 'W-5', status: 'DELIVERED', customerId: c.id, placedAt, deliveredAt: new Date(placedAt.getTime() + 70 * HOUR), deliveryBandId: band.id });
    f.overrides.set('payments.wallet.apology', { enabled: true, mode: 'RULE', kind: 'PERCENT', amountMinor: null, percent: 5, capMinor: 5_000, lateAfterHours: 24, to: 'WALLET' });
    try {
      const rows = (await apologyCandidates(f.deps(), f.viewer)).rows.filter((r) => r.customerId === c.id);
      expect(rows.map((r) => [r.number, r.lateHours, r.ruleMinor])).toEqual([['W-3', 28, 5_000]]);
      expect(await code(giveApology(f.deps(), f.staff, late.id, { amountMinor: 1_000, confirm: true }))).toBe('INVALID_INPUT');
      expect(await code(giveApology(f.deps(), f.staff, bitLate.id, { confirm: true }))).toBe('NOT_LATE');
      expect(await code(giveApology(f.deps(), f.staff, onTime.id, { confirm: true }))).toBe('NOT_LATE');
      // 5% of 120,000 is 6,000; the owner's cap gives 5,000
      expect(await giveApology(f.deps(), f.staff, late.id, { confirm: true })).toMatchObject({ amountMinor: 5_000 });
      expect((await walletOf(f.deps(), f.viewer, c.id))!.balanceMinor).toBe(5_000);
    } finally {
      f.overrides.delete('payments.wallet.apology');
    }
  });
});
