// CN-029 Phase 1 qa-gate (Gyani lane, PR 615 / 616) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL). Each
// test was written before its fix, from the reviewer's reproduction:
// 1. HISTORY_CHANGED only when a matched day's own money moved (its ledger entries or the ERP's rows), never for a
//    money-neutral change (late, equal fixed costs) or for the shop's own correction and the balances it carries
//    forward; a later run clears it once the day matches; a run re-closes every day whose ledger moved since its close,
//    whatever `books.recheck.days` says — so "a month closes only when every day matched" is reachable.
// 2. The PIN's wrong tries are reserved one by one in the database before the hash is checked: a burst of parallel
//    wrong tries never gets more than `books.pin.maxAttempts` − 1 WRONG_PIN answers.
// 3. Two corrections of the same difference at the same moment: exactly one books, the other is ALREADY (never a 500,
//    never two entries); one correction per difference, ever.
// 4. A month close reads its days under the link's lock: a day close written meanwhile is seen (NOT_MATCHED).
// And: one run at a time per link, one BILL per order, "paid to ERP" kept once per request key, the ERP's matching
// event must belong to the difference, and the daily check A compares closing balances.
// Round 2: a row whose ERP event was lost waits for the pull instead of a hand correction (booked once, the balances
// agree); a PIN count left at its limit with no lock in force is an expired lock (never locked for ever).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { hashPassword } from '@extas/auth';
import {
  adjustDifference,
  appendAccountEntries,
  applyErpEvents,
  balanceOn,
  checkBooksPin,
  closeMonth,
  isAdjustable,
  lockBooksLink,
  pullErpEvents,
  recordBill,
  recordErpPayment,
  reopenMonth,
  runBooksMatch,
  runBooksNow,
  setBooksPin,
  signOffYear,
  syncErpAccount,
} from '../src';
import { day, setUpBooks, type BooksFixture } from './books-fixture';

const OWNER_PASSWORD = 'sample-owner-password-qa-616';
const PIN = '480326';
const COSTS = { salary: 30000, rent: 12000, utilities: 3000, other: 500 };

describe.skipIf(!HAS_TEST_DB)('PR 615 / 616 qa-gate on PostgreSQL', () => {
  let f: BooksFixture;
  const realFetch = globalThis.fetch;
  let owner: { staffUserId: string | null };
  let accounts: { staffUserId: string | null };
  beforeAll(async () => {
    f = await setUpBooks('booksqa');
    owner = await f.owner('qa');
    await f.t.prisma.staffUser.update({ where: { id: owner.staffUserId! }, data: { passwordHash: await hashPassword(OWNER_PASSWORD) } });
    await setBooksPin(f.deps(), f.who(owner, f.storeA), { password: OWNER_PASSWORD, pin: PIN });
    accounts = await f.staff(['books.read', 'books.adjust', 'books.close', 'books.reconcile', 'erp.account.read', 'erp.payments.record'], null, 'qa-accounts');
    // These books run for months without a payment: the practice ERP's own 30-day hold would refuse the later orders.
    for (const s of [f.storeA, f.storeB]) f.world.v6(f.company(s)).holdDays = 10_000;
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await f?.t.drop();
  });
  beforeEach(() => {
    f.clock.now = new Date(f.clock.now.getTime() + 60_000);
  });

  const at = (iso: string) => {
    f.clock.now = new Date(iso);
  };
  const closesOf = async (storeId: number, d: string) => {
    const link = await f.linkOf(storeId);
    return f.t.prisma.booksDayClose.findMany({ where: { linkId: link.id, date: day(d) }, orderBy: { version: 'asc' } });
  };
  const checkOf = (close: { figures: unknown }, check: string) => ((close.figures as { checks?: { check: string; result: string }[] }).checks ?? []).find((c) => c.check === check)?.result;
  const open = async (storeId: number, where: Record<string, unknown> = {}) => {
    const link = await f.linkOf(storeId);
    return f.t.prisma.booksDifference.findMany({ where: { linkId: link.id, status: { in: ['PENDING', 'MISMATCH'] }, ...where }, orderBy: [{ date: 'asc' }, { key: 'asc' }] });
  };
  const historyChanged = async (storeId: number) => {
    const link = await f.linkOf(storeId);
    return f.t.prisma.booksDifference.count({ where: { linkId: link.id, kind: 'HISTORY_CHANGED' } });
  };
  /** The month's fixed costs entered on both sides (Hisabi's screen writes the shop's row, PR 618). */
  const costs = async (storeId: number, month: string, c = COSTS) => {
    const link = await f.linkOf(storeId);
    const version = (await f.t.prisma.erpFixedCostMonth.count({ where: { linkId: link.id, month: day(`${month}-01`) } })) + 1;
    await f.t.prisma.erpFixedCostMonth.create({ data: { storeId, linkId: link.id, month: day(`${month}-01`), version, salaryMinor: BigInt(c.salary * 100), rentMinor: BigInt(c.rent * 100), utilitiesMinor: BigInt(c.utilities * 100), otherMinor: BigInt(c.other * 100) } });
    f.world.v6(f.company(storeId)).putFixedCosts(month, { month, costs: c });
  };
  /** An order the ERP billed at 650 and the shop booked at 650.01 (a wrong shipment answer): a one-paisa difference. */
  const paisaOff = async (storeId: number, ext: string, billedAt: string) => {
    await f.placeAndShip(storeId, ext, [f.line(`${ext}-1`, 'POLO-NAVY-M', 990)]);
    await f.shopOrder(storeId, ext, [{ lineId: `${ext}-1`, sku: 'POLO-NAVY-M', shopPrice: 650 }], null);
    expect(await recordBill(f.deps(), { storeId, externalOrderId: ext, consignmentId: `C-${ext}`, erpTotalMinor: 65001, billedAt: new Date(billedAt) })).toMatchObject({ created: true });
    const link = await f.linkOf(storeId);
    await f.t.prisma.erpOrder.update({ where: { linkId_externalOrderId: { linkId: link.id, externalOrderId: ext } }, data: { billedAt: new Date(billedAt) } });
  };

  it('qa-gate 2: a burst of parallel wrong PIN tries gets at most maxAttempts − 1 WRONG_PIN answers; the rest, and then the right PIN, are PIN_LOCKED', async () => {
    f.overrides.set('books.pin.maxAttempts', 3);
    f.overrides.set('books.pin.lockMinutes', 15);
    const tryer = await f.staff(['books.read', 'books.adjust'], f.storeA, 'burst');
    const who = f.who(tryer, f.storeA);
    const res = await Promise.allSettled(Array.from({ length: 15 }, () => checkBooksPin(f.deps(), who, '000003', 'books.adjust')));
    const codes = res.map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'OK'));
    expect(codes.every((c) => c === 'WRONG_PIN' || c === 'PIN_LOCKED')).toBe(true);
    expect(codes.filter((c) => c === 'WRONG_PIN').length).toBeLessThanOrEqual(2);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'books.pin.wrong', entityId: tryer.staffUserId! } })).toBeLessThanOrEqual(2);
    // The lock holds for the right PIN too, and for a second burst.
    const again = await Promise.allSettled([PIN, '000004', PIN].map((p) => checkBooksPin(f.deps(), who, p, 'books.adjust')));
    expect(again.map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'OK'))).toEqual(['PIN_LOCKED', 'PIN_LOCKED', 'PIN_LOCKED']);
    f.clock.now = new Date(f.clock.now.getTime() + 16 * 60_000);
    await expect(checkBooksPin(f.deps(), who, PIN, 'books.adjust')).resolves.toMatchObject({ ownerId: owner.staffUserId });
    f.overrides.delete('books.pin.maxAttempts');
    f.overrides.delete('books.pin.lockMinutes');
  });

  it('qa-gate 1a: fixed costs entered later, equal on both sides, re-close the month`s days without HISTORY_CHANGED, and the month closes without an override', async () => {
    at('2026-11-02T04:00:00Z');
    await f.placeAndShip(f.storeA, 'WEB-Q1', [f.line('WEB-Q1-1', 'POLO-NAVY-M', 990)]);
    await f.shopOrder(f.storeA, 'WEB-Q1', [{ lineId: 'WEB-Q1-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], new Date('2026-11-02T05:00:00Z'));
    at('2026-12-01T20:00:00Z');
    const first = await runBooksMatch(f.deps(), { storeId: f.storeA });
    expect(first).toMatchObject({ status: 'ok', through: '2026-12-01' });
    expect(first.days.filter((x) => x.date < '2026-12-01').every((x) => x.matched)).toBe(true);
    expect(checkOf((await closesOf(f.storeA, '2026-11-02'))[0]!, 'FIXED_COSTS')).toBe('PARTIAL');
    // Without the costs the month needs an override.
    await expect(closeMonth(f.deps(), f.who(accounts, f.storeA), { month: '2026-11', pin: PIN })).rejects.toMatchObject({ code: 'FIXED_COSTS_MISSING' });

    at('2026-12-02T04:00:00Z');
    await costs(f.storeA, '2026-11');
    at('2026-12-02T20:00:00Z');
    const second = await runBooksMatch(f.deps(), { storeId: f.storeA });
    // The run goes back to the first day the costs touch (not only the last books.recheck.days days).
    expect(second.from).toBe('2026-11-02');
    const v = await closesOf(f.storeA, '2026-11-02');
    expect(v.map((c) => c.version)).toEqual([1, 2]);
    expect(Number(v[1]!.closingBalanceMinor)).toBe(Number(v[0]!.closingBalanceMinor));
    expect(checkOf(v[1]!, 'FIXED_COSTS')).toBe('MATCHED');
    expect(await historyChanged(f.storeA)).toBe(0);
    const closed = await closeMonth(f.deps(), f.who(accounts, f.storeA), { month: '2026-11', pin: PIN });
    expect(closed).toMatchObject({ level: 'MONTH', override: false, totalDays: 29, matchedDays: 29 });
  });

  it('qa-gate 1b + 1c: a back-dated correction re-closes that day although it lies outside books.recheck.days; the matched days after it never raise HISTORY_CHANGED; the month closes', async () => {
    f.overrides.set('books.recheck.days', 2);
    at('2026-12-03T04:00:00Z');
    await costs(f.storeA, '2026-12');
    await paisaOff(f.storeA, 'WEB-Q2', '2026-12-03T05:00:00Z');
    at('2027-01-01T20:00:00Z');
    const r = await runBooksMatch(f.deps(), { storeId: f.storeA });
    expect(r.days.find((x) => x.date === '2026-12-03')).toMatchObject({ result: 'MISMATCH', matched: false });
    // Every later day carries the paisa in its balance, explained by the open difference: matched, no closing difference.
    expect(r.days.filter((x) => x.date > '2026-12-03' && x.date <= '2026-12-31').every((x) => x.matched)).toBe(true);
    expect((await open(f.storeA)).map((x) => x.key)).toEqual(['B:tie', 'F:BILL|WEB-Q2']);
    const diff = (await open(f.storeA)).find((x) => x.key === 'F:BILL|WEB-Q2')!;
    const erpRow = ((diff.detail as { erpRefs?: string[] }).erpRefs ?? [])[0]!;
    await adjustDifference(f.deps(), f.who(accounts, f.storeA), diff.id, { pin: PIN, reason: 'The shipment answer carried 650.01; the ERP billed 650.', erpEventId: erpRow });

    // 1c: two days later the nightly window (2 days) does not reach 3 December; the run still re-closes it.
    at('2027-01-02T20:00:00Z');
    const again = await runBooksMatch(f.deps(), { storeId: f.storeA });
    expect(again.from).toBe('2026-12-03');
    const dec3 = (await closesOf(f.storeA, '2026-12-03')).at(-1)!;
    expect(dec3.result === 'MATCHED' || dec3.result === 'PARTIAL').toBe(true);
    expect(await open(f.storeA, { date: { lte: day('2026-12-31') } })).toEqual([]);
    // 1b: the days after it moved by the correction's paisa (new versions) but their own money did not: no HISTORY_CHANGED.
    expect((await closesOf(f.storeA, '2026-12-10')).length).toBe(2);
    expect(await historyChanged(f.storeA)).toBe(0);
    await expect(closeMonth(f.deps(), f.who(accounts, f.storeA), { month: '2026-12', pin: PIN })).resolves.toMatchObject({ override: false });
    f.overrides.delete('books.recheck.days');
  });

  it('qa-gate 1: a matched day whose own money moves raises HISTORY_CHANGED (in the day close`s transaction); a later run clears it once the day matches', async () => {
    // A payment the ERP dates on 5 January arrives after that day closed: both sides now carry it, the day still ties.
    at('2027-01-05T04:00:00Z');
    await f.placeAndShip(f.storeA, 'WEB-Q3', [f.line('WEB-Q3-1', 'POLO-NAVY-L', 1090)]);
    await f.shopOrder(f.storeA, 'WEB-Q3', [{ lineId: 'WEB-Q3-1', sku: 'POLO-NAVY-L', shopPrice: 700 }], new Date('2027-01-05T05:00:00Z'));
    at('2027-01-05T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA });
    at('2027-01-07T04:00:00Z');
    f.world.v6(f.company(f.storeA)).recordPayment(100, { reference: 'BANK-LATE-Q', date: '2027-01-05' });
    await f.deliverAll(f.storeA);
    at('2027-01-07T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA });
    const raised = await open(f.storeA, { kind: 'HISTORY_CHANGED' });
    expect(raised.map((x) => x.date.toISOString().slice(0, 10))).toEqual(['2027-01-05']);
    // The difference and the new day close were written by the same run.
    const v2 = (await closesOf(f.storeA, '2027-01-05')).at(-1)!;
    expect(raised[0]!.firstRunId).toBe(v2.runId);
    // Accounts records the payment as "paid to ERP"; the next run finds the day matched again: the notice is cleared.
    await recordErpPayment(f.deps(), f.who(accounts, f.storeA), { paidOn: '2027-01-05', amountMinor: 10000, method: 'BANK', reference: 'BANK-LATE-Q' });
    at('2027-01-08T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA, from: '2027-01-05' });
    expect(await open(f.storeA, { kind: 'HISTORY_CHANGED' })).toEqual([]);
  });

  it('qa-gate 1c (manual run): runBooksNow re-closes a day corrected five days back with books.recheck.days 2, and takes a first day of its own', async () => {
    f.overrides.set('books.recheck.days', 2);
    at('2027-01-10T04:00:00Z');
    await paisaOff(f.storeA, 'WEB-Q4', '2027-01-10T05:00:00Z');
    at('2027-01-10T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA });
    at('2027-01-15T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA });
    const diff = (await open(f.storeA, { key: 'F:BILL|WEB-Q4' }))[0]!;
    await adjustDifference(f.deps(), f.who(accounts, f.storeA), diff.id, { pin: PIN, reason: 'The shipment answer carried 650.01; the ERP billed 650.', erpEventId: ((diff.detail as { erpRefs?: string[] }).erpRefs ?? [])[0]! });
    at('2027-01-15T21:00:00Z');
    const now = await runBooksNow(f.deps(), f.who(accounts, f.storeA));
    expect(now.from).toBe('2027-01-10');
    const jan10 = (await closesOf(f.storeA, '2027-01-10')).at(-1)!;
    expect(['MATCHED', 'PARTIAL']).toContain(jan10.result);
    expect(await open(f.storeA, { date: day('2027-01-10') })).toEqual([]);
    const own = await runBooksNow(f.deps(), f.who(accounts, f.storeA), { from: '2027-01-12' });
    expect(own).toMatchObject({ status: 'ok', from: '2027-01-12' });
    await expect(runBooksNow(f.deps(), f.who(accounts, f.storeA), { from: '12 January' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    f.overrides.delete('books.recheck.days');
  });

  it('qa-gate 3: two corrections of one difference at the same moment — exactly one books, the other is ALREADY, one correction entry; the ERP`s event must belong to the difference', async () => {
    at('2026-12-05T04:00:00Z');
    await paisaOff(f.storeB, 'WEB-QB1', '2026-12-05T05:00:00Z');
    at('2026-12-05T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, through: '2026-12-05' });
    const diff = (await open(f.storeB, { key: 'F:BILL|WEB-QB1' }))[0]!;
    const detail = diff.detail as { erpRefs?: string[]; shopRefs?: string[] };
    const link = await f.linkOf(f.storeB);
    // An ERP event of another order is not this difference's event.
    const integ = await f.t.prisma.integration.findFirstOrThrow({ where: { storeId: f.storeB, kind: 'ERP' }, select: { id: true } });
    await f.t.prisma.erpEvent.create({ data: { storeId: f.storeB, linkId: link.id, integrationId: integ.id, eventId: 'evt_other_order_qa', type: 'order.line.short', source: 'WEBHOOK', externalOrderId: 'WEB-QB-OTHER', data: {}, bodyHash: 'sample-hash' } });
    const input = { pin: PIN, reason: 'The shipment answer carried 650.01; the ERP billed 650.' };
    await expect(adjustDifference(f.deps(), f.who(accounts, f.storeB), diff.id, { ...input, erpEventId: 'evt_other_order_qa' })).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['erpEventId'] });

    const refs = [detail.erpRefs![0]!, detail.shopRefs![0]!];
    expect(new Set(refs).size).toBe(2);
    const both = await Promise.allSettled(refs.map((erpEventId) => adjustDifference(f.deps(), f.who(accounts, f.storeB), diff.id, { ...input, erpEventId })));
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const refused = both.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ code: 'ALREADY' });
    expect(await f.t.prisma.booksAdjustment.count({ where: { linkId: link.id, differenceId: diff.id } })).toBe(1);
    expect(await f.t.prisma.erpAccountEntry.count({ where: { linkId: link.id, kind: 'ADJUSTMENT', externalOrderId: 'WEB-QB1' } })).toBe(1);
    expect(await f.t.prisma.erpAccountEntry.count({ where: { linkId: link.id, kind: 'REVERSAL', reverses: 'ship:C-WEB-QB1' } })).toBe(1);
    // The database keeps one correction per difference whatever the code does.
    const adj = await f.t.prisma.booksAdjustment.findFirstOrThrow({ where: { differenceId: diff.id } });
    await expect(f.t.prisma.booksAdjustment.create({ data: { storeId: f.storeB, linkId: link.id, kind: 'ADJUSTMENT', date: adj.date, amountMinor: 0n, reason: 'a second correction of one difference', erpEventId: 'evt_second_qa', differenceId: diff.id, pinVerified: true, createdById: accounts.staffUserId! } })).rejects.toThrow();
  });

  it('qa-gate 3: the database keeps one BILL per order, whatever its key', async () => {
    const link = await f.linkOf(f.storeB);
    await expect(
      f.t.prisma.$transaction((tx) => appendAccountEntries(tx, link, [{ kind: 'BILL', eventId: 'bill:WEB-QB1', businessDate: '2026-12-05', amountMinor: 65000, externalOrderId: 'WEB-QB1', source: 'MANUAL' }])),
    ).rejects.toThrow();
  });

  it('qa-gate 4: a month close reads its days under the link`s lock — a difference written meanwhile by a locked run is seen (NOT_MATCHED)', async () => {
    // Store B's November: one matched order, the costs in, every day closed.
    at('2026-11-05T04:00:00Z');
    await f.placeAndShip(f.storeB, 'WEB-QB0', [f.line('WEB-QB0-1', 'POLO-NAVY-M', 990)]);
    await f.shopOrder(f.storeB, 'WEB-QB0', [{ lineId: 'WEB-QB0-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], new Date('2026-11-05T05:00:00Z'));
    await costs(f.storeB, '2026-11');
    at('2026-12-06T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: '2026-11-01', through: '2026-11-30' });
    expect(await open(f.storeB, { date: { lte: day('2026-11-30') } })).toEqual([]);
    const link = await f.linkOf(f.storeB);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const other = f.t.prisma.$transaction(
      async (tx) => {
        await lockBooksLink(tx, link);
        locked();
        await held;
        await tx.booksDifference.create({ data: { storeId: f.storeB, linkId: link.id, date: day('2026-11-20'), check: 'ACCOUNT', kind: 'AMOUNT_DIFF', key: 'A:OTHER|qa-late', status: 'MISMATCH', amountMinor: 1n, detail: { group: 'OTHER|qa-late', shopMinor: 1, erpMinor: 0 }, firstSeenAt: f.clock.now, lastSeenAt: f.clock.now } });
      },
      { timeout: 20_000, maxWait: 20_000 },
    );
    await isLocked;
    const closing = closeMonth(f.deps(), f.who(accounts, f.storeB), { month: '2026-11', pin: PIN });
    const settled = closing.then(
      () => 'closed',
      (e: { code?: string }) => e.code,
    );
    // Long enough for the PIN check to pass and the close to wait on the lock.
    await new Promise((r) => setTimeout(r, 1500));
    release();
    await other;
    expect(await settled).toBe('NOT_MATCHED');
    await expect(closing).rejects.toMatchObject({ details: ['2026-11-20'] });
    expect(await f.t.prisma.booksPeriodClose.count({ where: { linkId: link.id, level: 'MONTH' } })).toBe(0);
    // The made-up difference has no entry behind it: settle it so the later checks of store B see real books only.
    await f.t.prisma.booksDifference.updateMany({ where: { linkId: link.id, key: 'A:OTHER|qa-late' }, data: { status: 'FIXED', fixedAt: f.clock.now } });
  });

  it('qa-gate: one run at a time per link — two runs at once never fail and never write a day twice', async () => {
    at('2026-12-07T20:00:00Z');
    const runs = await Promise.all([runBooksMatch(f.deps(), { storeId: f.storeB, from: '2026-11-25' }), runBooksMatch(f.deps(), { storeId: f.storeB, from: '2026-11-25' })]);
    expect(runs.every((r) => r.status === 'ok' || (r.status === 'skipped' && r.reason === 'BUSY'))).toBe(true);
    const link = await f.linkOf(f.storeB);
    expect(await f.t.prisma.booksMatchRun.count({ where: { linkId: link.id, status: 'FAILED' } })).toBe(0);
    const rows = await f.t.prisma.booksDayClose.groupBy({ by: ['date', 'version'], where: { linkId: link.id }, _count: { _all: true } });
    expect(rows.every((r) => r._count._all === 1)).toBe(true);
    const weeks = await f.t.prisma.booksPeriodClose.groupBy({ by: ['level', 'periodStart', 'version'], where: { linkId: link.id }, _count: { _all: true } });
    expect(weeks.every((r) => r._count._all === 1)).toBe(true);
  });

  it('qa-gate: the daily check A compares closing balances — an ERP charge on a day outside the run shows as a closing difference', async () => {
    at('2026-12-09T04:00:00Z');
    const practice = f.world.v6(f.company(f.storeB));
    // The ERP books a charge on 1 December the shop never heard of (no event): the run from 7 December cannot see the row.
    practice.ledger.push({ id: 'ST-QA-OTHER', date: '2026-12-01', kind: 'OTHER', amount: 25, externalOrderId: null, reference: 'COURIER-FEE-QA', eventId: null });
    at('2026-12-09T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: '2026-12-07' });
    const closing = await open(f.storeB, { key: 'A:closing' });
    expect(closing.map((x) => [x.date.toISOString().slice(0, 10), x.kind, Number(x.amountMinor)])).toContainEqual(['2026-12-07', 'AMOUNT_DIFF', -2500]);
    // It is found again from the books (never adjusted by hand).
    await expect(adjustDifference(f.deps(), f.who(accounts, f.storeB), closing[0]!.id, { pin: PIN, reason: 'Trying to adjust a closing difference.', erpEventId: 'ST-QA-OTHER' })).rejects.toMatchObject({ code: 'NOT_ADJUSTABLE' });
  });

  it('PR 615 follow-up 551: "paid to ERP" is kept once per request key; the same key with other figures is refused', async () => {
    const who = f.who(accounts, f.storeB);
    const input = { paidOn: '2026-12-08', amountMinor: 500000, method: 'BANK', reference: 'BANK-QA-1' };
    const [a, b] = await Promise.all([recordErpPayment(f.deps(), who, input, { requestKey: 'req-qa-1' }), recordErpPayment(f.deps(), who, input, { requestKey: 'req-qa-1' })]);
    expect(a.id).toBe(b.id);
    const link = await f.linkOf(f.storeB);
    expect(await f.t.prisma.erpPaymentRecord.count({ where: { linkId: link.id, reference: 'BANK-QA-1' } })).toBe(1);
    await expect(recordErpPayment(f.deps(), who, { ...input, amountMinor: 400000 }, { requestKey: 'req-qa-1' })).rejects.toMatchObject({ code: 'CONFLICT' });
    // Without a key, each call is its own record (the form always sends one).
    await recordErpPayment(f.deps(), who, { ...input, reference: 'BANK-QA-2' });
    expect(await f.t.prisma.erpPaymentRecord.count({ where: { linkId: link.id, reference: 'BANK-QA-2' } })).toBe(1);
  });

  it('qa-gate round 2: a return credit whose webhook was lost waits for the pull (never typed by hand), so it is booked once; an ERP row with no event (a courier fee) is still put right by hand', async () => {
    const link = await f.linkOf(f.storeB);
    const practice = f.world.v6(f.company(f.storeB));
    const shopBal = async () => (await balanceOn(f.t.prisma, link, '2026-12-31')).endMinor;
    const erpBal = () => Math.round(practice.balance() * 100);
    // The courier fee the ERP charged on 1 December has no event behind it: nothing will ever bring it, so it is put
    // right by hand from the ERP's row (the qa-gate's A:closing test pushed it).
    at('2026-12-10T04:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: '2026-12-01', through: '2026-12-01' });
    const fee = (await open(f.storeB, { key: 'A:OTHER|COURIER-FEE-QA' }))[0]!;
    expect(fee.kind).toBe('MISSING_EVENT');
    expect(isAdjustable(fee)).toBe(true);
    await adjustDifference(f.deps(), f.who(accounts, f.storeB), fee.id, { pin: PIN, reason: 'The courier fee the ERP charged on 1 December.', erpEventId: 'ST-QA-OTHER' });
    expect(await shopBal()).toBe(erpBal());

    // WEB-501: billed at 650 on both sides, returned, handed back; the ERP approves the piece and the webhook is lost.
    at('2026-12-11T04:00:00Z');
    await f.placeAndShip(f.storeB, 'WEB-501', [f.line('WEB-501-1', 'POLO-NAVY-M', 990)]);
    await f.shopOrder(f.storeB, 'WEB-501', [{ lineId: 'WEB-501-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], null);
    expect(await recordBill(f.deps(), { storeId: f.storeB, externalOrderId: 'WEB-501', consignmentId: 'C-WEB-501', erpTotalMinor: 65000, billedAt: new Date('2026-12-11T04:00:00Z') })).toMatchObject({ created: true });
    await f.t.prisma.erpOrder.update({ where: { linkId_externalOrderId: { linkId: link.id, externalOrderId: 'WEB-501' } }, data: { billedAt: new Date('2026-12-11T04:00:00Z') } });
    await f.push(f.storeB, { type: 'order.delivery', externalOrderId: 'WEB-501', body: { status: 'RETURNED', courier: 'PATHAO', consignmentId: 'C-WEB-501', collected: 0, at: '2026-12-11T12:40:00+06:00' } } as never);
    await f.push(f.storeB, { type: 'returnList.create', body: { returnListId: 'RL-501', courier: 'PATHAO', handedBackAt: '2026-12-11', parcels: [{ consignmentId: 'C-WEB-501', externalOrderId: 'WEB-501', receivedCount: 1 }] } } as never);
    await f.shopDelivery(f.storeB, 'WEB-501', 'RETURNED', new Date('2026-12-11T06:40:00Z'));
    await f.shopHandBack(f.storeB, 'RL-501', '2026-12-11', [{ ext: 'WEB-501', received: 1 }]);
    await f.deliverAll(f.storeB);
    await syncErpAccount(f.deps(), { storeId: f.storeB });
    at('2026-12-11T08:00:00Z');
    const [decided] = practice.decidePiece('WEB-501', 'WEB-501-1', 'APPROVED');
    expect(await f.deliverAll(f.storeB, { drop: true })).toBeGreaterThan(0);
    at('2026-12-11T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: '2026-12-11', through: '2026-12-11' });
    const diff = (await open(f.storeB, { key: 'A:CREDIT|WEB-501|WEB-501-1' }))[0]!;
    expect([diff.kind, Number(diff.amountMinor)]).toEqual(['MISSING_EVENT', 65000]);
    expect((diff.detail as { waitingEvents?: string[] }).waitingEvents).toEqual([decided!.eventId]);
    // The ERP's event has not reached the shop: no "Put right" (the page shows how it settles), and the key refuses it.
    expect(isAdjustable(diff)).toBe(false);
    const entries = await f.t.prisma.erpAccountEntry.count({ where: { linkId: link.id } });
    await expect(adjustDifference(f.deps(), f.who(accounts, f.storeB), diff.id, { pin: PIN, reason: 'The return of WEB-501 was approved in the ERP.', erpEventId: decided!.eventId })).rejects.toMatchObject({ code: 'NOT_ADJUSTABLE' });
    expect(await f.t.prisma.erpAccountEntry.count({ where: { linkId: link.id } })).toBe(entries);
    // A difference kept before this rule (no list of the ERP's events): a non-bill row the ERP has and we lack waits too.
    expect(isAdjustable({ ...diff, detail: { group: 'CREDIT|WEB-501|WEB-501-1', shopMinor: 0, erpMinor: -65000, erpRefs: [decided!.eventId], shopRefs: [] } })).toBe(false);
    expect(isAdjustable({ ...diff, check: 'ORDERS', key: 'F:BILL|WEB-501', detail: { group: 'BILL|WEB-501', shopMinor: 0, erpMinor: 65000, erpRefs: ['ST-1'], shopRefs: [] } })).toBe(true);

    // The pull brings the lost event: one credit, under the ERP's own key; the balances agree to the paisa.
    await pullErpEvents(f.deps(), { storeId: f.storeB });
    await applyErpEvents(f.deps());
    await syncErpAccount(f.deps(), { storeId: f.storeB });
    const mine = await f.t.prisma.erpAccountEntry.findMany({ where: { linkId: link.id, externalOrderId: 'WEB-501', kind: { in: ['RETURN_CREDIT', 'ADJUSTMENT', 'REVERSAL'] } } });
    expect(mine.map((e) => [e.kind, Number(e.amountMinor), e.eventId])).toEqual([['RETURN_CREDIT', -65000, decided!.eventId]]);
    expect(await shopBal()).toBe(erpBal());
    // The next run finds the day matched: the difference settles by itself and nothing new is open on these days.
    at('2026-12-12T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: '2026-12-01', through: '2026-12-11' });
    expect(await f.t.prisma.booksDifference.findUniqueOrThrow({ where: { id: diff.id } })).toMatchObject({ status: 'FIXED', adjustmentId: null });
    const left = await open(f.storeB, { date: { gte: day('2026-12-01') }, kind: { not: 'UNMATCHED_PAYMENT' } });
    expect(left.map((x) => [x.date.toISOString().slice(0, 10), x.kind, x.key])).toEqual([]);
  });

  it('qa-gate round 3: the statement`s eventId is optional in v6 — a credit row without one still waits for the pull (decided by the row`s kind), so a lost credit is booked once', async () => {
    const link = await f.linkOf(f.storeB);
    const practice = f.world.v6(f.company(f.storeB));
    const shopBal = async () => (await balanceOn(f.t.prisma, link, '2026-12-31')).endMinor;
    const erpBal = () => Math.round(practice.balance() * 100);
    // The ERP's GET /account answers its statement rows without an eventId (v6 promises only the date, the amount and
    // what the row belongs to; a stable id per row is a v7 request).
    const inner = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const res = await inner(input, init);
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if ((init?.method ?? 'GET').toUpperCase() !== 'GET' || !url.pathname.endsWith('/account') || !res.ok) return res;
      const body = (await res.json()) as { statement?: Record<string, unknown>[] };
      for (const r of body.statement ?? []) delete r.eventId;
      return new Response(JSON.stringify(body), { status: res.status, headers: res.headers });
    }) as typeof fetch;
    try {
      at('2026-12-13T04:00:00Z');
      await f.placeAndShip(f.storeB, 'WEB-502', [f.line('WEB-502-1', 'POLO-NAVY-M', 990)]);
      await f.shopOrder(f.storeB, 'WEB-502', [{ lineId: 'WEB-502-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], null);
      expect(await recordBill(f.deps(), { storeId: f.storeB, externalOrderId: 'WEB-502', consignmentId: 'C-WEB-502', erpTotalMinor: 65000, billedAt: new Date('2026-12-13T04:00:00Z') })).toMatchObject({ created: true });
      await f.t.prisma.erpOrder.update({ where: { linkId_externalOrderId: { linkId: link.id, externalOrderId: 'WEB-502' } }, data: { billedAt: new Date('2026-12-13T04:00:00Z') } });
      await f.push(f.storeB, { type: 'order.delivery', externalOrderId: 'WEB-502', body: { status: 'RETURNED', courier: 'PATHAO', consignmentId: 'C-WEB-502', collected: 0, at: '2026-12-13T12:40:00+06:00' } } as never);
      await f.push(f.storeB, { type: 'returnList.create', body: { returnListId: 'RL-502', courier: 'PATHAO', handedBackAt: '2026-12-13', parcels: [{ consignmentId: 'C-WEB-502', externalOrderId: 'WEB-502', receivedCount: 1 }] } } as never);
      await f.shopDelivery(f.storeB, 'WEB-502', 'RETURNED', new Date('2026-12-13T06:40:00Z'));
      await f.shopHandBack(f.storeB, 'RL-502', '2026-12-13', [{ ext: 'WEB-502', received: 1 }]);
      await f.deliverAll(f.storeB);
      await syncErpAccount(f.deps(), { storeId: f.storeB });
      at('2026-12-13T08:00:00Z');
      const [decided] = practice.decidePiece('WEB-502', 'WEB-502-1', 'APPROVED');
      expect(await f.deliverAll(f.storeB, { drop: true })).toBeGreaterThan(0);
      at('2026-12-13T20:00:00Z');
      await runBooksMatch(f.deps(), { storeId: f.storeB, from: '2026-12-13', through: '2026-12-13' });
      const diff = (await open(f.storeB, { key: 'A:CREDIT|WEB-502|WEB-502-1' }))[0]!;
      const detail = diff.detail as { erpEvents?: string[]; erpRefs?: string[] };
      expect([diff.kind, Number(diff.amountMinor), detail.erpEvents]).toEqual(['MISSING_EVENT', 65000, []]);
      // A credit comes from an event: it waits for the pull, whatever the row carries.
      expect(isAdjustable(diff)).toBe(false);
      const entries = await f.t.prisma.erpAccountEntry.count({ where: { linkId: link.id } });
      await expect(adjustDifference(f.deps(), f.who(accounts, f.storeB), diff.id, { pin: PIN, reason: 'The return of WEB-502 was approved in the ERP.', erpEventId: detail.erpRefs![0]! })).rejects.toMatchObject({ code: 'NOT_ADJUSTABLE' });
      expect(await f.t.prisma.erpAccountEntry.count({ where: { linkId: link.id } })).toBe(entries);
      // Payments and exchanges come from events too; a charge the ERP typed (OTHER) and a bill do not.
      const as = (kind: string, group: string) => isAdjustable({ ...diff, kind, check: group.startsWith('BILL|') ? 'ORDERS' : 'ACCOUNT', key: `${group.startsWith('BILL|') ? 'F' : 'A'}:${group}`, detail: { group, shopMinor: 0, erpMinor: 1, erpRefs: ['ST-9'], shopRefs: [], erpEvents: [] } });
      expect([as('MISSING_EVENT', 'PAYMENT|ST-9'), as('MISSING_EVENT', 'EXCHANGE|EXG-9'), as('MISSING_EVENT', 'OTHER|FEE-9'), as('MISSING_EVENT', 'BILL|WEB-9')]).toEqual([false, false, true, true]);

      // The pull brings the lost event: one credit, the balances agree to the paisa, the next run settles the difference.
      await pullErpEvents(f.deps(), { storeId: f.storeB });
      await applyErpEvents(f.deps());
      await syncErpAccount(f.deps(), { storeId: f.storeB });
      const mine = await f.t.prisma.erpAccountEntry.findMany({ where: { linkId: link.id, externalOrderId: 'WEB-502', kind: { in: ['RETURN_CREDIT', 'ADJUSTMENT', 'REVERSAL'] } } });
      expect(mine.map((e) => [e.kind, Number(e.amountMinor), e.eventId])).toEqual([['RETURN_CREDIT', -65000, decided!.eventId]]);
      expect(await shopBal()).toBe(erpBal());
      at('2026-12-14T20:00:00Z');
      await runBooksMatch(f.deps(), { storeId: f.storeB, from: '2026-12-13', through: '2026-12-13' });
      expect(await f.t.prisma.booksDifference.findUniqueOrThrow({ where: { id: diff.id } })).toMatchObject({ status: 'FIXED', adjustmentId: null });
      expect(await open(f.storeB, { date: day('2026-12-13'), kind: { not: 'UNMATCHED_PAYMENT' } })).toEqual([]);
    } finally {
      globalThis.fetch = inner;
    }
  });

  it('qa-gate round 2: a PIN count left at its limit with no lock in force (a crash between the try and the lock, or a lower limit) is an expired lock — the count starts again', async () => {
    const tryer = await f.staff(['books.read', 'books.adjust'], f.storeA, 'stuck');
    const who = f.who(tryer, f.storeA);
    const row = () => f.t.prisma.staffUser.findUniqueOrThrow({ where: { id: tryer.staffUserId! }, select: { booksPinFailures: true, booksPinLockedTil: true } });
    f.overrides.set('books.pin.maxAttempts', 3);
    f.overrides.set('books.pin.lockMinutes', 15);
    // A crash after the third try took its number, before the lock was written.
    await f.t.prisma.staffUser.update({ where: { id: tryer.staffUserId! }, data: { booksPinFailures: 3, booksPinLockedTil: null } });
    await expect(checkBooksPin(f.deps(), who, '000003', 'books.adjust')).rejects.toMatchObject({ code: 'WRONG_PIN' });
    expect(await row()).toMatchObject({ booksPinFailures: 1, booksPinLockedTil: null });
    // The limit lowered below the count: the right PIN is taken.
    await f.t.prisma.staffUser.update({ where: { id: tryer.staffUserId! }, data: { booksPinFailures: 3 } });
    f.overrides.set('books.pin.maxAttempts', 2);
    await expect(checkBooksPin(f.deps(), who, PIN, 'books.adjust')).resolves.toMatchObject({ ownerId: owner.staffUserId });
    expect(await row()).toMatchObject({ booksPinFailures: 0, booksPinLockedTil: null });
    // A lock that ended with the count still at the limit: tries are counted again from one.
    await f.t.prisma.staffUser.update({ where: { id: tryer.staffUserId! }, data: { booksPinFailures: 2, booksPinLockedTil: new Date(f.clock.now.getTime() - 60_000) } });
    await expect(checkBooksPin(f.deps(), who, '000003', 'books.adjust')).rejects.toMatchObject({ code: 'WRONG_PIN' });
    expect((await row()).booksPinFailures).toBe(1);
    // The try that reaches the limit locks at once (its lock end is written with its number), right PIN or not after.
    await expect(checkBooksPin(f.deps(), who, '000004', 'books.adjust')).rejects.toMatchObject({ code: 'PIN_LOCKED' });
    expect((await row()).booksPinLockedTil?.getTime()).toBe(f.clock.now.getTime() + 15 * 60_000);
    await expect(checkBooksPin(f.deps(), who, PIN, 'books.adjust')).rejects.toMatchObject({ code: 'PIN_LOCKED' });
    f.overrides.delete('books.pin.maxAttempts');
    f.overrides.delete('books.pin.lockMinutes');
  });

  it('qa-gate: a correction in a closed month is dated today (PRIOR_PERIOD); re-opening names the version it re-opens; a year with a month still open is refused', async () => {
    // Store A's November is closed (1a). A one-paisa bill of 20 November is found late and put right today.
    at('2026-11-20T04:00:00Z');
    await paisaOff(f.storeA, 'WEB-Q5', '2026-11-20T05:00:00Z');
    at('2027-01-20T04:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA, from: '2026-11-20', through: '2026-11-20' });
    const diff = (await open(f.storeA, { key: 'F:BILL|WEB-Q5' }))[0]!;
    const r = await adjustDifference(f.deps(), f.who(accounts, f.storeA), diff.id, { pin: PIN, reason: 'November is closed; the paisa is put right today.', erpEventId: ((diff.detail as { erpRefs?: string[] }).erpRefs ?? [])[0]! });
    expect(r).toMatchObject({ kind: 'PRIOR_PERIOD', date: '2027-01-20' });
    // Re-open November and close it again: the re-opening locks the link and names the version it re-opens.
    const re = await reopenMonth(f.deps(), f.who(accounts, f.storeA), { month: '2026-11', pin: PIN, reason: 'The late bill of 20 November is looked at.' });
    expect(re).toMatchObject({ reopens: 1, version: 2 });
    // The financial year 2026-27 (July to June) has not ended; once it has, November is open again: refused.
    await expect(signOffYear(f.deps(), f.who(accounts, f.storeA), { year: 2026, pin: PIN })).rejects.toMatchObject({ code: 'MONTH_NOT_ENDED' });
    at('2027-07-02T04:00:00Z');
    await expect(signOffYear(f.deps(), f.who(accounts, f.storeA), { year: 2026, pin: PIN })).rejects.toMatchObject({ code: 'NOT_MATCHED' });
  });
});
