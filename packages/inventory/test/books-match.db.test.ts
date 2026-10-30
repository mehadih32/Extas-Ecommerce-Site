// CN-028 · PR 616 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the books match engine
// (docs/RETAIL-ERP-MODEL.md §3.4, §4). The owner's rules proved here, each written before the code:
// - both ledgers match with ZERO tolerance: one paisa off is a MISMATCH, named by check, class, day and amount;
// - a difference is fixed only by a reversing entry plus a new entry (`books.adjust`, the owner's PIN, a reason and the
//   ERP's matching event) — never by editing or deleting: the original entry stays, the database refuses an edit;
// - a month closes only when every day matched (`books.close.requireMatched`); the owner's override needs the PIN and a
//   reason and is kept on the close; a closed day that moves raises HISTORY_CHANGED;
// - the PIN is never stored or logged in plain text, and wrong tries lock it for a while;
// - ledgers, day closes and match results are per store and per link: store A never reads or writes store B's.
// In v5 nothing here runs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { hashPassword } from '@extas/auth';
import {
  adjustDifference,
  balanceOn,
  booksCloses,
  booksDifferences,
  booksStatus,
  checkErpAccount,
  closeMonth,
  explainDay,
  inventorySchedule,
  nightlyBooksClose,
  recordBill,
  reopenMonth,
  runBooksMatch,
  runInventoryJob,
  setBooksPin,
  signOffYear,
  verifyAccountChain,
} from '../src';
import { day, setUpBooks, type BooksFixture } from './books-fixture';

const OWNER_PASSWORD = 'sample-owner-password-616';
const PIN = '480326';

describe.skipIf(!HAS_TEST_DB)('PR 616 on PostgreSQL: the books match engine', () => {
  let f: BooksFixture;
  const realFetch = globalThis.fetch;
  let owner: { staffUserId: string | null };
  beforeAll(async () => {
    f = await setUpBooks('booksmatch');
    owner = await f.owner('books');
    await f.t.prisma.staffUser.update({ where: { id: owner.staffUserId! }, data: { passwordHash: await hashPassword(OWNER_PASSWORD) } });
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
  const entriesOf = async (storeId: number) => {
    const link = await f.linkOf(storeId);
    return f.t.prisma.erpAccountEntry.findMany({ where: { linkId: link.id }, orderBy: { seq: 'asc' } });
  };
  const closesOf = async (storeId: number, d: string) => {
    const link = await f.linkOf(storeId);
    return f.t.prisma.booksDayClose.findMany({ where: { linkId: link.id, date: day(d) }, orderBy: { version: 'asc' } });
  };
  const openDiffs = async (storeId: number) => {
    const link = await f.linkOf(storeId);
    return f.t.prisma.booksDifference.findMany({ where: { linkId: link.id, status: { in: ['PENDING', 'MISMATCH'] } }, orderBy: [{ date: 'asc' }, { key: 'asc' }] });
  };

  it('PR 616: in v5 nothing runs — no match, no close, the status says the books start at the switch', async () => {
    f.setV6(f.storeA, false);
    expect(await runBooksMatch(f.deps(), { storeId: f.storeA, through: '2026-11-01' })).toMatchObject({ status: 'skipped', reason: 'ERP_MODEL_V5' });
    expect(await nightlyBooksClose(f.deps(), { storeId: f.storeA })).toMatchObject({ status: 'skipped', reason: 'ERP_MODEL_V5' });
    expect(await booksStatus(f.deps(), f.who(owner, f.storeA))).toMatchObject({ model: 'v5', link: null });
    expect(await f.t.prisma.booksMatchRun.count()).toBe(0);
    f.setV6(f.storeA);
  });

  it('PR 616: a day whose ledger equals the ERP row for row closes once with zero remainder; running again writes no new version', async () => {
    at('2026-11-02T04:00:00Z');
    await f.placeAndShip(f.storeA, 'WEB-201', [f.line('WEB-201-1', 'POLO-NAVY-M', 990), f.line('WEB-201-2', 'POLO-NAVY-L', 1090)]);
    await f.shopOrder(f.storeA, 'WEB-201', [{ lineId: 'WEB-201-1', sku: 'POLO-NAVY-M', shopPrice: 650 }, { lineId: 'WEB-201-2', sku: 'POLO-NAVY-L', shopPrice: 700 }], new Date('2026-11-02T05:00:00Z'));
    at('2026-11-02T20:00:00Z');
    const r = await runBooksMatch(f.deps(), { storeId: f.storeA, through: '2026-11-02' });
    expect(r).toMatchObject({ status: 'ok' });
    const d = r.days.find((x) => x.date === '2026-11-02')!;
    // D (no summary sent yet) and E (no fixed costs yet) can only be partial; every comparison that can be made matched.
    expect(d).toMatchObject({ result: 'PARTIAL', matched: true, differences: 0 });
    expect(Object.fromEntries(d.checks.map((c) => [c.check, c.result]))).toEqual({ ACCOUNT: 'MATCHED', TIES: 'MATCHED', RETURNS: 'MATCHED', SUMMARY: 'PARTIAL', FIXED_COSTS: 'PARTIAL', ORDERS: 'MATCHED' });
    const closes = await closesOf(f.storeA, '2026-11-02');
    expect(closes.map((c) => [c.version, c.result, Number(c.closingBalanceMinor), Number(c.erpClosingBalanceMinor), Number(c.tieRemainderMinor), Number(c.pipelineEndMinor)])).toEqual([[1, 'PARTIAL', 135000, 135000, 0, 135000]]);
    await runBooksMatch(f.deps(), { storeId: f.storeA, through: '2026-11-02' });
    expect(await closesOf(f.storeA, '2026-11-02')).toHaveLength(1);
    // The append-only rule holds for the closes too.
    await expect(f.t.prisma.booksDayClose.update({ where: { id: closes[0]!.id }, data: { closingBalanceMinor: 1n } })).rejects.toThrow(/append-only/);
  });

  it('PR 616: zero tolerance — a bill one paisa above the ERP`s is a MISMATCH on the orders check and breaks the tie by exactly that paisa', async () => {
    at('2026-11-03T04:00:00Z');
    await f.placeAndShip(f.storeA, 'WEB-202', [f.line('WEB-202-1', 'POLO-NAVY-M', 990)]);
    await f.shopOrder(f.storeA, 'WEB-202', [{ lineId: 'WEB-202-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], null);
    // The shipment answer carried a wrong total: the shop's bill is 650.01 where the ERP billed 650.
    expect(await recordBill(f.deps(), { storeId: f.storeA, externalOrderId: 'WEB-202', consignmentId: 'C-WEB-202', erpTotalMinor: 65001, billedAt: new Date('2026-11-03T05:00:00Z') })).toMatchObject({ created: true });
    const link = await f.linkOf(f.storeA);
    await f.t.prisma.erpOrder.update({ where: { linkId_externalOrderId: { linkId: link.id, externalOrderId: 'WEB-202' } }, data: { billedAt: new Date('2026-11-03T05:00:00Z') } });
    at('2026-11-03T20:00:00Z');
    const r = await runBooksMatch(f.deps(), { storeId: f.storeA, through: '2026-11-03' });
    const d = r.days.find((x) => x.date === '2026-11-03')!;
    expect(d).toMatchObject({ result: 'MISMATCH', matched: false });
    const diffs = await openDiffs(f.storeA);
    expect(diffs.map((x) => [x.date.toISOString().slice(0, 10), x.check, x.kind, x.status, Number(x.amountMinor), x.externalOrderId])).toEqual([
      ['2026-11-03', 'TIES', 'TIE_BROKEN', 'MISMATCH', 1, null],
      ['2026-11-03', 'ORDERS', 'AMOUNT_DIFF', 'MISMATCH', 1, 'WEB-202'],
    ]);
    expect(Number((await closesOf(f.storeA, '2026-11-03'))[0]!.tieRemainderMinor)).toBe(1);
  });

  it('PR 616: the owner`s PIN is set with his password, kept only as a scrypt hash, never written to the audit log; a weak PIN or a non-owner is refused', async () => {
    const accounts = await f.staff(['books.read', 'books.adjust'], f.storeA, 'accounts');
    await expect(setBooksPin(f.deps(), f.who(accounts, f.storeA), { password: OWNER_PASSWORD, pin: PIN })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(setBooksPin(f.deps(), f.who(owner, f.storeA), { password: 'not-his-password', pin: PIN })).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    for (const weak of ['111111', '123456', '987654', '12ab56', '4803']) await expect(setBooksPin(f.deps(), f.who(owner, f.storeA), { password: OWNER_PASSWORD, pin: weak })).rejects.toMatchObject({ code: 'WEAK_PIN' });
    await setBooksPin(f.deps(), f.who(owner, f.storeA), { password: OWNER_PASSWORD, pin: PIN });
    const row = await f.t.prisma.staffUser.findUniqueOrThrow({ where: { id: owner.staffUserId! } });
    expect(row.booksPinHash).toMatch(/^scrypt\$/);
    expect(row.booksPinHash).not.toContain(PIN);
    const logs = await f.t.prisma.auditLog.findMany({ where: { action: { startsWith: 'books.pin' } } });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(PIN);
  });

  it('PR 616: a difference is fixed only by a reversing entry plus a new entry, with books.adjust, the owner`s PIN, a reason and the ERP`s matching event; the original entry is never edited', async () => {
    const accounts = await f.staff(['books.read', 'books.adjust'], f.storeA, 'accounts2');
    const reader = await f.staff(['books.read'], f.storeA, 'reader');
    const diff = (await openDiffs(f.storeA)).find((x) => x.check === 'ORDERS')!;
    const erpRow = ((diff.detail as { erpRefs?: string[] }).erpRefs ?? [])[0]!;
    expect(erpRow).toBeTruthy();
    const before = (await entriesOf(f.storeA)).length;
    const input = { pin: PIN, reason: 'The shipment answer carried 650.01; the ERP billed 650.', erpEventId: erpRow };
    await expect(adjustDifference(f.deps(), f.who(reader, f.storeA), diff.id, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adjustDifference(f.deps(), f.who(accounts, f.storeA), diff.id, { ...input, pin: '' })).rejects.toMatchObject({ code: 'PIN_REQUIRED' });
    await expect(adjustDifference(f.deps(), f.who(accounts, f.storeA), diff.id, { ...input, pin: '000001' })).rejects.toMatchObject({ code: 'WRONG_PIN' });
    await expect(adjustDifference(f.deps(), f.who(accounts, f.storeA), diff.id, { ...input, reason: 'short' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(adjustDifference(f.deps(), f.who(accounts, f.storeA), diff.id, { ...input, erpEventId: 'evt_not_in_the_erp' })).rejects.toMatchObject({ code: 'INVALID_INPUT', details: ['erpEventId'] });
    // A tie difference is found again from the entries: it is never adjusted by hand.
    const tie = (await openDiffs(f.storeA)).find((x) => x.check === 'TIES')!;
    await expect(adjustDifference(f.deps(), f.who(accounts, f.storeA), tie.id, input)).rejects.toMatchObject({ code: 'NOT_ADJUSTABLE' });
    expect((await entriesOf(f.storeA)).length).toBe(before);

    const r = await adjustDifference(f.deps(), f.who(accounts, f.storeA), diff.id, input);
    expect(r).toMatchObject({ kind: 'ADJUSTMENT', amountMinor: -1 });
    const all = await entriesOf(f.storeA);
    const bill = all.find((e) => e.eventId === 'ship:C-WEB-202')!;
    expect(Number(bill.amountMinor)).toBe(65001);
    const added = all.slice(before);
    expect(added.map((e) => [e.kind, Number(e.amountMinor), e.reverses, e.adjustmentId === r.id])).toEqual([
      ['REVERSAL', -65001, 'ship:C-WEB-202', true],
      ['ADJUSTMENT', 65000, null, true],
    ]);
    const adj = await f.t.prisma.booksAdjustment.findUniqueOrThrow({ where: { id: r.id } });
    expect([adj.erpEventId, adj.pinVerified, adj.createdById, adj.kind, Number(adj.amountMinor)]).toEqual([erpRow, true, accounts.staffUserId, 'ADJUSTMENT', -1]);
    // Never edited, never deleted: the database refuses both.
    await expect(f.t.prisma.erpAccountEntry.update({ where: { id: bill.id }, data: { amountMinor: 65000n } })).rejects.toThrow(/append-only/);
    await expect(f.t.prisma.booksAdjustment.delete({ where: { id: adj.id } })).rejects.toThrow(/append-only/);
    // The same ERP event is never used for a second adjustment.
    await expect(adjustDifference(f.deps(), f.who(accounts, f.storeA), diff.id, input)).rejects.toMatchObject({ code: 'ALREADY' });
    // The day matches again, the tie with it; the shop's balance equals the ERP's.
    const day3 = (await runBooksMatch(f.deps(), { storeId: f.storeA, through: '2026-11-03' })).days.find((x) => x.date === '2026-11-03')!;
    expect(day3).toMatchObject({ matched: true, differences: 0 });
    expect((await openDiffs(f.storeA)).filter((x) => x.date.toISOString().startsWith('2026-11-03'))).toEqual([]);
    expect((await f.t.prisma.booksDifference.findUniqueOrThrow({ where: { id: diff.id } })).status).toBe('FIXED');
    const link = await f.linkOf(f.storeA);
    expect((await balanceOn(f.t.prisma, link, '2026-11-03')).endMinor).toBe(f.world.v6(f.company(f.storeA)).balance('2026-11-03') * 100);
    expect(await verifyAccountChain(f.t.prisma, link.id)).toMatchObject({ ok: true });
  });

  it('PR 616: wrong PIN tries lock the PIN for a while (even the right one), then it works again', async () => {
    const accounts = await f.staff(['books.read', 'books.close'], f.storeA, 'locker');
    f.overrides.set('books.pin.maxAttempts', 3);
    f.overrides.set('books.pin.lockMinutes', 15);
    for (let i = 0; i < 2; i++) await expect(closeMonth(f.deps(), f.who(accounts, f.storeA), { month: '2026-10', pin: '000002' })).rejects.toMatchObject({ code: 'WRONG_PIN' });
    await expect(closeMonth(f.deps(), f.who(accounts, f.storeA), { month: '2026-10', pin: '000002' })).rejects.toMatchObject({ code: 'PIN_LOCKED' });
    await expect(closeMonth(f.deps(), f.who(accounts, f.storeA), { month: '2026-10', pin: PIN })).rejects.toMatchObject({ code: 'PIN_LOCKED' });
    f.clock.now = new Date(f.clock.now.getTime() + 16 * 60_000);
    // Past the lock the right PIN is accepted again (October had no books yet: nothing to close).
    await expect(closeMonth(f.deps(), f.who(accounts, f.storeA), { month: '2026-10', pin: PIN })).rejects.toMatchObject({ code: 'NOTHING_TO_CLOSE' });
    f.overrides.delete('books.pin.maxAttempts');
    f.overrides.delete('books.pin.lockMinutes');
  });

  it('PR 616: a closed day that moves raises HISTORY_CHANGED; the month closes only when every day matched, else with the owner`s override (PIN, reason), kept on the close', async () => {
    // A payment the ERP dates on 2 November arrives two days later: the closed day moves.
    at('2026-11-04T04:00:00Z');
    const practice = f.world.v6(f.company(f.storeA));
    practice.recordPayment(100, { reference: 'BANK-LATE-1', date: '2026-11-02' });
    await f.deliverAll(f.storeA);
    at('2026-11-04T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA, through: '2026-11-04' });
    const v = await closesOf(f.storeA, '2026-11-02');
    expect(v.map((c) => c.version)).toEqual([1, 2]);
    expect(Number(v[1]!.closingBalanceMinor)).toBe(135000 - 10000);
    expect((await openDiffs(f.storeA)).map((x) => [x.date.toISOString().slice(0, 10), x.kind])).toContainEqual(['2026-11-02', 'HISTORY_CHANGED']);
    // The chain of day closes is intact.
    const status = await booksStatus(f.deps(), f.who(owner, f.storeA));
    expect(status).toMatchObject({ model: 'v6', closesChain: { ok: true } });

    // December: the nightly close runs after books.close.runAt (01:30 in the store's time zone) and catches up every day.
    at('2026-12-01T19:00:00Z'); // 01:00 on 2 December in Dhaka
    expect(await nightlyBooksClose(f.deps(), { storeId: f.storeA })).toMatchObject({ status: 'skipped', reason: 'NOT_YET' });
    at('2026-12-01T19:31:00Z');
    const night = await nightlyBooksClose(f.deps(), { storeId: f.storeA });
    expect(night).toMatchObject({ status: 'ok' });
    expect(await nightlyBooksClose(f.deps(), { storeId: f.storeA })).toMatchObject({ status: 'skipped', reason: 'DONE' });
    const link = await f.linkOf(f.storeA);
    const closedDays = await f.t.prisma.booksDayClose.findMany({ where: { linkId: link.id, date: { gte: day('2026-11-02'), lte: day('2026-11-30') } }, distinct: ['date'], select: { date: true } });
    expect(closedDays).toHaveLength(29);

    const closer = await f.staff(['books.read', 'books.close'], f.storeA, 'closer');
    await expect(closeMonth(f.deps(), f.who(closer, f.storeA), { month: '2026-12', pin: PIN })).rejects.toMatchObject({ code: 'MONTH_NOT_ENDED' });
    await expect(closeMonth(f.deps(), f.who(closer, f.storeA), { month: '2026-11', pin: '' })).rejects.toMatchObject({ code: 'PIN_REQUIRED' });
    // books.close.requireMatched (on): 2 November is not matched (its history moved).
    const refused = closeMonth(f.deps(), f.who(closer, f.storeA), { month: '2026-11', pin: PIN });
    await expect(refused).rejects.toMatchObject({ code: 'NOT_MATCHED' });
    await expect(refused).rejects.toMatchObject({ details: expect.arrayContaining(['2026-11-02']) });
    expect(await f.t.prisma.booksPeriodClose.count({ where: { linkId: link.id, level: 'MONTH' } })).toBe(0);
    // The override: PIN and a reason. Fixed costs are not in either; the override covers both and says so.
    await expect(closeMonth(f.deps(), f.who(closer, f.storeA), { month: '2026-11', pin: PIN, overrideReason: 'short' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const closed = await closeMonth(f.deps(), f.who(closer, f.storeA), { month: '2026-11', pin: PIN, overrideReason: 'The late payment is checked with the ERP and is right.' });
    expect(closed).toMatchObject({ level: 'MONTH', version: 1, override: true, pinVerified: true });
    const row = await f.t.prisma.booksPeriodClose.findFirstOrThrow({ where: { linkId: link.id, level: 'MONTH' } });
    expect([row.periodStart.toISOString().slice(0, 10), row.periodEnd.toISOString().slice(0, 10), row.override, row.overrideReason, row.totalDays, row.closedById]).toEqual(['2026-11-01', '2026-11-30', true, 'The late payment is checked with the ERP and is right.', 29, closer.staffUserId]);
    expect((row.figures as { fixedCostsMissing?: boolean }).fixedCostsMissing).toBe(true);
    expect((await openDiffs(f.storeA)).filter((x) => x.date.toISOString() < '2026-12-01')).toEqual([]);
    expect(await f.t.prisma.booksDifference.count({ where: { linkId: link.id, status: 'OVERRIDDEN' } })).toBeGreaterThan(0);
    await expect(closeMonth(f.deps(), f.who(closer, f.storeA), { month: '2026-11', pin: PIN, overrideReason: 'Again, the same month once more.' })).rejects.toMatchObject({ code: 'ALREADY' });
    // Re-opening needs the PIN and writes a new version; the month can then be closed again.
    const re = await reopenMonth(f.deps(), f.who(closer, f.storeA), { month: '2026-11', pin: PIN, reason: 'The ERP sent a correction for November.' });
    expect(re).toMatchObject({ version: 2, reopens: 1 });
    expect((await booksCloses(f.deps(), f.who(closer, f.storeA))).months.find((m) => m.month === '2026-11')).toMatchObject({ closed: false, versions: 2 });
  });

  it('PR 616: the explain view opens a day`s figures to their entries and ERP rows; the status card has the shape the Books card reads', async () => {
    const e = await explainDay(f.deps(), f.who(owner, f.storeA), '2026-11-03');
    expect(e).toMatchObject({ date: '2026-11-03' });
    expect(e!.tie).toMatchObject({ remainderMinor: 0 });
    const g = e!.groups.find((x) => x.group === 'BILL|WEB-202')!;
    expect([g.shopMinor, g.erpMinor]).toEqual([65000, 65000]);
    expect(g.entries.map((x) => x.kind)).toEqual(['BILL', 'REVERSAL', 'ADJUSTMENT']);
    const s = await booksStatus(f.deps(), f.who(owner, f.storeA));
    expect(Object.keys(s).sort()).toEqual(['balanceMinor', 'closesChain', 'erpBalanceMinor', 'exchangesAtRiskMinor', 'lastRun', 'link', 'matchedDays', 'model', 'monthsClosed', 'open', 'partialChecks', 'totalDays', 'waitingCheckMinor'].sort());
    expect(s.open).toMatchObject({ total: expect.any(Number), byClass: expect.any(Object) });
  });

  it('PR 616: the nightly close is a job of its own, looked for every books.close.checkMinutes; a year is signed off only once it has ended, with books in it', async () => {
    const plan = await inventorySchedule(f.deps());
    const entry = plan.find((e) => e.jobs.some((j) => j.name === 'inventory.books.close'));
    expect(entry?.everyMs).toBe(15 * 60_000);
    expect(entry?.jobs).toContainEqual({ name: 'inventory.books.close', storeId: f.storeA });
    expect(await runInventoryJob(f.deps(), { name: 'inventory.books.close', storeId: f.storeA })).toMatchObject({ status: 'skipped', reason: 'DONE' });
    // The financial year starts in July (books.fiscalYear.startMonth): 2026-27 has not ended; 2025-26 has no books.
    await expect(signOffYear(f.deps(), f.who(owner, f.storeA), { year: 2026, pin: PIN })).rejects.toMatchObject({ code: 'MONTH_NOT_ENDED' });
    await expect(signOffYear(f.deps(), f.who(owner, f.storeA), { year: 2025, pin: PIN })).rejects.toMatchObject({ code: 'NOTHING_TO_CLOSE' });
  });

  it("CN-029 §16: store B's match, closes and differences are its own; store A's staff cannot read or fix them", async () => {
    at('2026-12-02T04:00:00Z');
    await f.placeAndShip(f.storeB, 'WEB-B201', [f.line('WEB-B201-1', 'POLO-NAVY-M', 990)]);
    await f.shopOrder(f.storeB, 'WEB-B201', [{ lineId: 'WEB-B201-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], new Date('2026-12-02T05:00:00Z'));
    at('2026-12-02T20:00:00Z');
    await checkErpAccount(f.deps(), { storeId: f.storeB });
    const rb = await runBooksMatch(f.deps(), { storeId: f.storeB, through: '2026-12-02' });
    expect(rb.days.find((x) => x.date === '2026-12-02')).toMatchObject({ matched: true });
    const linkA = await f.linkOf(f.storeA);
    const linkB = await f.linkOf(f.storeB);
    const runsB = await f.t.prisma.booksMatchRun.findMany({ where: { storeId: f.storeB } });
    expect(runsB.every((x) => x.linkId === linkB.id)).toBe(true);
    expect((await f.t.prisma.booksDayClose.findMany({ where: { linkId: linkB.id } })).every((c) => c.storeId === f.storeB)).toBe(true);
    // A's staff reads A's differences only; asking for B is refused.
    const readerA = await f.staff(['books.read', 'books.adjust'], f.storeA, 'readerA');
    const pageA = await booksDifferences(f.deps(), f.who(readerA, f.storeA), { status: 'all' });
    expect(pageA.rows.every((x) => x.storeId === f.storeA)).toBe(true);
    await expect(booksDifferences(f.deps(), f.who(readerA, f.storeB), {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // A difference of A cannot be fixed from B's side, even by an owner.
    const aDiff = await f.t.prisma.booksDifference.findFirstOrThrow({ where: { linkId: linkA.id } });
    await expect(adjustDifference(f.deps(), f.who(owner, f.storeB), aDiff.id, { pin: PIN, reason: 'Trying from the other store.', erpEventId: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // The database refuses a close of store B on store A's link.
    await expect(
      f.t.prisma.booksDayClose.create({
        data: { storeId: f.storeB, linkId: linkA.id, date: day('2026-12-02'), version: 99, result: 'MATCHED', openingBalanceMinor: 0n, closingBalanceMinor: 0n, goodsMinor: 0n, returnLossesMinor: 0n, pipelineStartMinor: 0n, pipelineEndMinor: 0n, paymentsMinor: 0n, tieRemainderMinor: 0n, figures: {}, hash: 'x' },
      }),
    ).rejects.toThrow();
  });

  it('PR 616 (with PR 611): a shipment whose answer had no bill date is never booked on a guessed day — the ERP`s bill row is a difference until the bill is booked from it, and the order check never books it twice', async () => {
    at('2026-12-03T04:00:00Z');
    await f.placeAndShip(f.storeB, 'WEB-B202', [f.line('WEB-B202-1', 'POLO-NAVY-M', 990)]);
    await f.shopOrder(f.storeB, 'WEB-B202', [{ lineId: 'WEB-B202-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], null);
    at('2026-12-03T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, through: '2026-12-03' });
    const link = await f.linkOf(f.storeB);
    const bills = () => f.t.prisma.erpAccountEntry.findMany({ where: { linkId: link.id, kind: 'BILL', externalOrderId: 'WEB-B202' } });
    expect(await bills()).toEqual([]);
    const key = { linkId_date_kind_key: { linkId: link.id, date: day('2026-12-03'), kind: 'MISSING_EVENT' as const, key: 'F:BILL|WEB-B202' } };
    const diff = await f.t.prisma.booksDifference.findUniqueOrThrow({ where: key });
    expect([diff.check, diff.status, (diff.detail as { billedAtMissing?: boolean }).billedAtMissing]).toEqual(['ORDERS', 'PENDING', true]);
    // Past books.timing.maxMinutes it is a MISMATCH to put right.
    at('2026-12-03T23:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, through: '2026-12-03' });
    expect((await f.t.prisma.booksDifference.findUniqueOrThrow({ where: key })).status).toBe('MISMATCH');
    const erpRow = ((diff.detail as { erpRefs?: string[] }).erpRefs ?? [])[0]!;
    const r = await adjustDifference(f.deps(), f.who(owner, f.storeB), diff.id, { pin: PIN, reason: 'The shipment answer had no bill date; booked from the ERP statement.', erpEventId: erpRow });
    const booked = await bills();
    expect(booked.map((e) => [e.kind, Number(e.amountMinor), e.businessDate.toISOString().slice(0, 10), e.adjustmentId === r.id])).toEqual([['BILL', 65000, '2026-12-03', true]]);
    // The order check fills billedAt later: the bill is not booked a second time, and the day matches.
    await f.t.prisma.erpOrder.update({ where: { linkId_externalOrderId: { linkId: link.id, externalOrderId: 'WEB-B202' } }, data: { billedAt: new Date('2026-12-03T05:00:00Z') } });
    await checkErpAccount(f.deps(), { storeId: f.storeB });
    expect(await bills()).toHaveLength(1);
    await runBooksMatch(f.deps(), { storeId: f.storeB, through: '2026-12-03' });
    expect(await f.t.prisma.booksDifference.count({ where: { linkId: link.id, date: day('2026-12-03'), check: 'ORDERS', status: { in: ['PENDING', 'MISMATCH'] } } })).toBe(0);
  });
});
