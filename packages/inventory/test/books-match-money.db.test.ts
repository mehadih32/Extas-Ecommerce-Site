// CN-028 · PR 616 money review on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the books match, the
// corrections and the month close. Each test was written before its fix, from the reviewer's reproduction, and failed
// on the code before it:
// 1. A payment matches when the ERP's statement rows carry no eventId (v6 does not promise one): both sides are grouped
//    by the same key, paired by eventId when both carry it, else by reference and amount.
// 2. A "paid to ERP" record dated in a closed day is raised (the day is closed again), so a month never closes on it.
// 3. A month never closes on a stale day close: anything dated in it that moved after its day's close is refused
//    ("run the match first") under the link's lock.
// 4. An event group (credit, payment, exchange) waits while the ERP has more rows than the shop has entries for it, so
//    a correction never counts an event that is still on its way; a corrected group whose money moves again is open
//    again (a new difference of the same group).
// 5. A correction of an exchange group counts in the day's exchange figures (the tie holds, the day matches), and an
//    ERP correction that undoes the shop's correction does too; PR 617: the daily summary counts them the same way.
// 6. After a hand correction of a payment group the ERP's payment still pairs with its "paid to ERP" record.
// 7. A correction of a closed month (PRIOR_PERIOD) counts on the day it is booked, as its own earlier-month figure of
//    the tie (never dropped, never rewriting the closed month); PR 617: the shop's day figures carry it too, apart
//    from the exchange lines (contract v6 has no summary line for it).
// Round 2 of the review:
// 8. An ERP correction of a payment whose statement rows carry neither eventId nor reference meets its group (no
//    missing event plus unknown row that can never be put right).
// 9. The ERP undoing a closed-month correction matches on its own day and counts as an earlier-month correction; PR 617:
//    the books screen shows it on that day's summary row, never in the summary sent.
// 10. A day close keeps the moment its run read the books: an entry booked between that read and the close, a late
//    pipeline move or return list of the day, make it stale, so the month does not close on it.
// Round 3: 11. An ERP payment the catch-up held back shows with its reason and waits. 12. A pair made only by a guess
//    waits (never a correction by hand). 13. A fact committed after the run read the books but created before it still
//    makes the day stale (judged by what the run saw, not by a clock).
// Every amount, key and reference is a made-up test value.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { hashPassword } from '@extas/auth';
import {
  adjustDifference,
  applyErpEvents,
  closeMonth,
  dayFigures,
  isAdjustable,
  ledgerBalance,
  movedSinceClose,
  paymentMatch,
  recordErpEvent,
  recordErpPayment,
  reverseErpPayment,
  runBooksMatch,
  setBooksPin,
  summaryLog,
  summaryTick,
  syncErpAccount,
  writePeriodClose,
} from '../src';
import { day, setUpBooks, type BooksFixture } from './books-fixture';

const OWNER_PASSWORD = 'sample-owner-password-616-money';
const PIN = '480326';
const COSTS = { salary: 30000, rent: 12000, utilities: 3000, other: 500 };

/** The practice ERP's own ledger, written directly for what its public calls cannot do (an exchange billed twice). */
type Practice = {
  book: (kind: string, amount: number, ref: { externalOrderId?: string | null; reference?: string | null; eventId?: string | null; date?: string }) => void;
  balance: (upTo?: string) => number;
  recordPayment: (amount: number, opts?: { reference?: string; date?: string }) => { eventId: string; date: string; data: Record<string, unknown> };
  putFixedCosts: (month: string, body: unknown) => unknown;
};

function harness(label: string) {
  const h = {
    f: undefined as unknown as BooksFixture,
    accounts: { staffUserId: null as string | null },
  };
  const realFetch = globalThis.fetch;
  beforeAll(async () => {
    h.f = await setUpBooks(label);
    const owner = await h.f.owner(label);
    await h.f.t.prisma.staffUser.update({ where: { id: owner.staffUserId! }, data: { passwordHash: await hashPassword(OWNER_PASSWORD) } });
    await setBooksPin(h.f.deps(), h.f.who(owner, h.f.storeA), { password: OWNER_PASSWORD, pin: PIN });
    h.accounts = await h.f.staff(['books.read', 'books.adjust', 'books.close', 'books.reconcile', 'erp.account.read', 'erp.payments.record'], null, `${label}-accounts`);
    for (const s of [h.f.storeA, h.f.storeB]) h.f.world.v6(h.f.company(s)).holdDays = 10_000;
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await h.f?.t.drop();
  });
  beforeEach(() => {
    h.f.clock.now = new Date(h.f.clock.now.getTime() + 60_000);
  });
  const at = (iso: string) => {
    h.f.clock.now = new Date(iso);
  };
  const practiceOf = (storeId: number) => h.f.world.v6(h.f.company(storeId)) as unknown as Practice;
  const open = async (storeId: number) => {
    const link = await h.f.linkOf(storeId);
    return h.f.t.prisma.booksDifference.findMany({ where: { linkId: link.id, status: { in: ['PENDING', 'MISMATCH'] } }, orderBy: [{ date: 'asc' }, { key: 'asc' }] });
  };
  const balances = async (storeId: number) => [await ledgerBalance(h.f.t.prisma, await h.f.linkOf(storeId)), Math.round(practiceOf(storeId).balance() * 100)];
  /** An ERP event reaching the shop as its webhook would (recorded, applied, booked). */
  const shopEvent = async (storeId: number, ev: { eventId: string; type: string; date: string; reverses?: string | null; data: Record<string, unknown> }) => {
    const link = await h.f.linkOf(storeId);
    const integ = await h.f.t.prisma.integration.findFirstOrThrow({ where: { storeId, kind: 'ERP' }, select: { id: true } });
    await recordErpEvent(h.f.deps(), { integrationId: integ.id, storeId, linkId: link.id, source: 'WEBHOOK', event: { eventId: ev.eventId, type: ev.type as never, occurredAt: new Date(`${ev.date}T06:00:00Z`), date: ev.date, reverses: ev.reverses ?? null, data: ev.data } });
    await applyErpEvents(h.f.deps());
    await syncErpAccount(h.f.deps(), { storeId });
  };
  const billed = (storeId: number, eventId: string, date: string, exchangeId: string, amount: string) =>
    shopEvent(storeId, { eventId, type: 'exchange.billed', date, data: { exchangeId, externalOrderId: `WEB-${exchangeId}`, amount, reason: 'DEADLINE_PASSED' } });
  /** The ERP's `GET /account` answered without the statement rows' eventId (v6 does not promise one). */
  const stripIds = (references = false) => {
    const inner = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const res = await inner(input, init);
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if ((init?.method ?? 'GET').toUpperCase() !== 'GET' || !url.pathname.endsWith('/account') || !res.ok) return res;
      const body = (await res.json()) as { statement?: Record<string, unknown>[] };
      for (const r of body.statement ?? []) {
        delete r.eventId;
        if (references) delete r.reference;
      }
      return new Response(JSON.stringify(body), { status: res.status, headers: res.headers });
    }) as typeof fetch;
    return () => {
      globalThis.fetch = inner;
    };
  };
  const costs = async (storeId: number, month: string) => {
    const link = await h.f.linkOf(storeId);
    await h.f.t.prisma.erpFixedCostMonth.create({ data: { storeId, linkId: link.id, month: day(`${month}-01`), version: 1, salaryMinor: BigInt(COSTS.salary * 100), rentMinor: BigInt(COSTS.rent * 100), utilitiesMinor: BigInt(COSTS.utilities * 100), otherMinor: BigInt(COSTS.other * 100) } });
    practiceOf(storeId).putFixedCosts(month, { month, costs: COSTS });
  };
  /** A payment the ERP records and the shop records too ("paid to ERP"). */
  const paidBoth = async (storeId: number, amount: number, date: string, reference: string) => {
    practiceOf(storeId).recordPayment(amount, { reference, date });
    await h.f.deliverAll(storeId);
    await syncErpAccount(h.f.deps(), { storeId });
    return recordErpPayment(h.f.deps(), h.f.who(h.accounts, storeId), { paidOn: date, amountMinor: amount * 100, method: 'BANK', reference });
  };
  /** The day's figures as the daily summary builds them (PR 617). */
  const figuresOf = async (storeId: number, d: string) => dayFigures(h.f.t.prisma, { storeId, linkId: (await h.f.linkOf(storeId)).id, day: d, timeZone: 'Asia/Dhaka', currency: 'BDT' });
  return { h, at, practiceOf, open, balances, shopEvent, billed, stripIds, costs, paidBoth, figuresOf };
}

describe.skipIf(!HAS_TEST_DB)('PR 616 money review on PostgreSQL: payments and month closes', () => {
  const { h, at, open, stripIds, costs, paidBoth } = harness('booksmoney1');

  it('1: a payment matches when the statement rows carry no eventId (paired by reference and amount)', async () => {
    const { f } = h;
    at('2026-10-20T04:00:00Z');
    await paidBoth(f.storeA, 1000, '2026-10-20', 'BANK-P1');
    const restore = stripIds();
    try {
      at('2026-10-23T20:00:00Z');
      const r = await runBooksMatch(f.deps(), { storeId: f.storeA, from: '2026-10-20', through: '2026-10-20' });
      expect(r.status).toBe('ok');
      expect(r.days.map((d) => [d.date, d.matched])).toEqual([['2026-10-20', true]]);
      expect((await open(f.storeA)).map((d) => [d.kind, d.key])).toEqual([]);
    } finally {
      restore();
    }
  });

  it('2: a "paid to ERP" record dated in a closed day is raised, the month does not close on it, and its reversal puts the day right', async () => {
    const { f } = h;
    await costs(f.storeA, '2026-11');
    at('2026-12-01T20:00:00Z');
    const r1 = await runBooksMatch(f.deps(), { storeId: f.storeA });
    expect(r1.days.filter((d) => !d.matched).map((d) => d.date)).toEqual([]);
    // 2 December: Accounts writes down a payment made on 10 November that the ERP never received.
    at('2026-12-02T04:00:00Z');
    const rec = await recordErpPayment(f.deps(), f.who(h.accounts, f.storeA), { paidOn: '2026-11-10', amountMinor: 500000, method: 'BANK', reference: 'BANK-A-LOST' });
    at('2026-12-02T20:00:00Z');
    const r2 = await runBooksMatch(f.deps(), { storeId: f.storeA });
    expect(r2.from! <= '2026-11-10').toBe(true);
    expect((await open(f.storeA)).map((d) => [d.date.toISOString().slice(0, 10), d.kind, d.key, d.status, Number(d.amountMinor)])).toEqual([['2026-11-10', 'UNMATCHED_PAYMENT', `A:paid:${rec.id}`, 'MISMATCH', 500000]]);
    await expect(closeMonth(f.deps(), f.who(h.accounts, f.storeA), { month: '2026-11', pin: PIN })).rejects.toMatchObject({ code: 'NOT_MATCHED', details: ['2026-11-10'] });
    // The record was a mistake: its reversal (a new record) is seen by the next run and the month closes.
    at('2026-12-03T04:00:00Z');
    await reverseErpPayment(f.deps(), f.who(h.accounts, f.storeA), rec.id, { reason: 'Typed twice; the bank shows no such payment.' });
    at('2026-12-03T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA });
    expect(await open(f.storeA)).toEqual([]);
    expect(await closeMonth(f.deps(), f.who(h.accounts, f.storeA), { month: '2026-11', pin: PIN })).toMatchObject({ level: 'MONTH', override: false });
  });

  it('3: a month does not close on a stale day close — a payment dated 30 November booked on 2 December is refused until the match runs', async () => {
    const { f } = h;
    at('2026-11-02T04:00:00Z');
    await paidBoth(f.storeB, 1000, '2026-11-02', 'BANK-B1');
    await costs(f.storeB, '2026-11');
    at('2026-12-01T20:00:00Z');
    const r1 = await runBooksMatch(f.deps(), { storeId: f.storeB });
    expect(r1.days.filter((d) => !d.matched).map((d) => d.date)).toEqual([]);
    // 2 December 03:00: the ERP records a payment dated 30 November; the shop books it and writes it down too.
    at('2026-12-02T03:00:00Z');
    await paidBoth(f.storeB, 700, '2026-11-30', 'BANK-B-LATE');
    await expect(closeMonth(f.deps(), f.who(h.accounts, f.storeB), { month: '2026-11', pin: PIN })).rejects.toMatchObject({ code: 'RUN_MATCH_FIRST', details: ['2026-11-30'] });
    // The owner's override does not pass it either: the days must be looked at first.
    await expect(closeMonth(f.deps(), f.who(h.accounts, f.storeB), { month: '2026-11', pin: PIN, overrideReason: 'Closing the month for the accountant.' })).rejects.toMatchObject({ code: 'RUN_MATCH_FIRST' });
    at('2026-12-02T20:00:00Z');
    const r2 = await runBooksMatch(f.deps(), { storeId: f.storeB });
    expect(r2.from! <= '2026-11-30').toBe(true);
    // The day had matched and its own money moved: the owner sees HISTORY_CHANGED until a later run finds it matched.
    expect((await open(f.storeB)).map((d) => [d.date.toISOString().slice(0, 10), d.kind])).toEqual([['2026-11-30', 'HISTORY_CHANGED']]);
    await expect(closeMonth(f.deps(), f.who(h.accounts, f.storeB), { month: '2026-11', pin: PIN })).rejects.toMatchObject({ code: 'NOT_MATCHED', details: ['2026-11-30'] });
    at('2026-12-03T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB });
    expect(await open(f.storeB)).toEqual([]);
    expect(await closeMonth(f.deps(), f.who(h.accounts, f.storeB), { month: '2026-11', pin: PIN })).toMatchObject({ level: 'MONTH', override: false, result: expect.stringMatching(/^(MATCHED|PARTIAL)$/) });
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 616 money review on PostgreSQL: event groups and exchange corrections', () => {
  const { h, at, practiceOf, open, balances, shopEvent, billed, stripIds, figuresOf } = harness('booksmoney2');

  it('4a: an exchange group with one event still on its way is not put right by hand (the ERP has more rows); its event comes and the day matches', async () => {
    const { f } = h;
    const practice = practiceOf(f.storeA);
    const D = '2026-11-03';
    at('2026-11-03T06:00:00Z');
    practice.book('EXCHANGE', 1000, { externalOrderId: 'WEB-EXG-Q5', reference: 'EXG-Q5', eventId: 'evt-q5-1', date: D });
    practice.book('EXCHANGE', 1000, { externalOrderId: 'WEB-EXG-Q5', reference: 'EXG-Q5', eventId: 'evt-q5-2', date: D });
    await billed(f.storeA, 'evt-q5-1', D, 'EXG-Q5', '1000');
    const restore = stripIds();
    try {
      at('2026-11-03T20:30:00Z');
      await runBooksMatch(f.deps(), { storeId: f.storeA, from: D, through: D });
      const diff = (await open(f.storeA)).find((d) => d.key === 'A:EXCHANGE|EXG-Q5')!;
      expect(diff.kind).toBe('AMOUNT_DIFF');
      expect(isAdjustable(diff)).toBe(false);
      await expect(adjustDifference(f.deps(), f.who(h.accounts, f.storeA), diff.id, { pin: PIN, reason: 'The ERP billed both pieces of the exchange.', erpEventId: 'evt-q5-1' })).rejects.toMatchObject({ code: 'NOT_ADJUSTABLE' });
      // The second webhook arrives: booked once, the day matches, nothing was corrected by hand.
      at('2026-11-03T22:00:00Z');
      await billed(f.storeA, 'evt-q5-2', D, 'EXG-Q5', '1000');
      at('2026-11-04T20:30:00Z');
      const r = await runBooksMatch(f.deps(), { storeId: f.storeA, from: D, through: D });
      expect(r.days.map((d) => [d.date, d.matched])).toEqual([[D, true]]);
      expect(await open(f.storeA)).toEqual([]);
    } finally {
      restore();
    }
    const [shop, erp] = await balances(f.storeA);
    expect(shop).toBe(erp);
  });

  it('4b + 5: a corrected exchange group ties and matches; when its money moves again the group is open again and is put right again', async () => {
    const { f } = h;
    const practice = practiceOf(f.storeB);
    const D = '2026-11-03';
    at('2026-11-03T06:00:00Z');
    practice.book('EXCHANGE', 1050, { externalOrderId: 'WEB-EXG-Q6', reference: 'EXG-Q6', eventId: 'evt-q6-1', date: D });
    await billed(f.storeB, 'evt-q6-1', D, 'EXG-Q6', '1000');
    at('2026-11-03T20:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: D });
    const first = (await open(f.storeB)).find((d) => d.key === 'A:EXCHANGE|EXG-Q6')!;
    expect(isAdjustable(first)).toBe(true);
    await adjustDifference(f.deps(), f.who(h.accounts, f.storeB), first.id, { pin: PIN, reason: 'The ERP charged 1050 for the exchange piece.', erpEventId: 'evt-q6-1' });
    at('2026-11-03T21:00:00Z');
    const r1 = await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: D });
    expect((await open(f.storeB)).map((d) => [d.kind, d.key])).toEqual([]);
    expect(r1.days.map((d) => [d.date, d.matched])).toEqual([[D, true]]);
    // PR 617: the day's summary counts the correction too — the exchange loss is what the ERP charged, not 0.
    expect((await figuresOf(f.storeB, D)).returnLosses).toEqual({ declinedMinor: 0, exchangeMinor: 105000 });
    // The ERP bills the exchange's second piece the same day, at 1050 again; the shop's webhook says 1000.
    at('2026-11-03T22:00:00Z');
    practice.book('EXCHANGE', 1050, { externalOrderId: 'WEB-EXG-Q6', reference: 'EXG-Q6', eventId: 'evt-q6-2', date: D });
    await billed(f.storeB, 'evt-q6-2', D, 'EXG-Q6', '1000');
    at('2026-11-04T20:30:00Z');
    const r2 = await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: D });
    expect(r2.days.map((d) => [d.date, d.matched])).toEqual([[D, false]]);
    const again = (await open(f.storeB)).filter((d) => (d.detail as { group?: string }).group === 'EXCHANGE|EXG-Q6');
    expect(again.map((d) => [d.kind, d.status, Number(d.amountMinor)])).toEqual([['AMOUNT_DIFF', 'MISMATCH', -5000]]);
    expect(isAdjustable(again[0]!)).toBe(true);
    // The first difference stays as it was put right, with its correction.
    expect(await f.t.prisma.booksDifference.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: 'FIXED' });
    expect((await f.t.prisma.booksDifference.findUniqueOrThrow({ where: { id: first.id } })).adjustmentId).toBeTruthy();
    await adjustDifference(f.deps(), f.who(h.accounts, f.storeB), again[0]!.id, { pin: PIN, reason: 'The ERP charged 1050 for the second piece too.', erpEventId: 'evt-q6-2' });
    at('2026-11-04T21:00:00Z');
    const r3 = await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: D });
    expect(r3.days.map((d) => [d.date, d.matched])).toEqual([[D, true]]);
    expect((await figuresOf(f.storeB, D)).returnLosses).toEqual({ declinedMinor: 0, exchangeMinor: 210000 });
    expect(await open(f.storeB)).toEqual([]);
    const [shop, erp] = await balances(f.storeB);
    expect(shop).toBe(erp);
  });

  it('5b: the ERP cancelling an event the shop corrected by hand is booked against the correction; that day ties and matches', async () => {
    const { f } = h;
    const practice = practiceOf(f.storeB);
    const D = '2026-11-05';
    at('2026-11-05T06:00:00Z');
    practice.book('EXCHANGE', 1050, { externalOrderId: 'WEB-EXG-Q7', reference: 'EXG-Q7', eventId: 'evt-q7-1', date: D });
    await billed(f.storeB, 'evt-q7-1', D, 'EXG-Q7', '1000');
    at('2026-11-05T20:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: D });
    const diff = (await open(f.storeB)).find((d) => d.key === 'A:EXCHANGE|EXG-Q7')!;
    await adjustDifference(f.deps(), f.who(h.accounts, f.storeB), diff.id, { pin: PIN, reason: 'The ERP charged 1050 for the exchange piece.', erpEventId: 'evt-q7-1' });
    const D2 = '2026-11-06';
    at('2026-11-06T06:00:00Z');
    practice.book('EXCHANGE', -1050, { externalOrderId: 'WEB-EXG-Q7', reference: 'EXG-Q7', eventId: 'evt-q7-c', date: D2 });
    await shopEvent(f.storeB, { eventId: 'evt-q7-c', type: 'exchange.cancelled', date: D2, reverses: 'evt-q7-1', data: { exchangeId: 'EXG-Q7', externalOrderId: 'WEB-EXG-Q7', amount: '0' } });
    at('2026-11-06T20:30:00Z');
    const r = await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: D2 });
    expect(r.days.map((d) => [d.date, d.matched])).toEqual([
      [D, true],
      [D2, true],
    ]);
    // PR 617: the ERP's cancel undoes the corrected charge in the summary of its own day.
    expect((await figuresOf(f.storeB, D)).returnLosses.exchangeMinor).toBe(105000);
    expect((await figuresOf(f.storeB, D2)).returnLosses.exchangeMinor).toBe(-105000);
    expect(await open(f.storeB)).toEqual([]);
    const [shop, erp] = await balances(f.storeB);
    expect(shop).toBe(erp);
  });

  it('6: after a hand correction of a payment group the ERP`s payment still pairs with its "paid to ERP" record (never unmatched for being corrected)', async () => {
    const { f } = h;
    const practice = practiceOf(f.storeA);
    const D = '2026-11-07';
    at('2026-11-07T06:00:00Z');
    // The ERP received 900; its webhook said 1000. Accounts wrote down the 900 that left the bank.
    practice.book('PAYMENT', -900, { reference: 'BANK-Q8', eventId: 'evt-q8', date: D });
    await shopEvent(f.storeA, { eventId: 'evt-q8', type: 'payment.recorded', date: D, data: { amount: '1000', reference: 'BANK-Q8' } });
    await recordErpPayment(f.deps(), f.who(h.accounts, f.storeA), { paidOn: D, amountMinor: 90000, method: 'BANK', reference: 'BANK-Q8' });
    at('2026-11-07T20:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA, from: D, through: D });
    const diff = (await open(f.storeA)).find((d) => d.key === 'A:PAYMENT|evt-q8')!;
    expect([diff.kind, isAdjustable(diff)]).toEqual(['AMOUNT_DIFF', true]);
    await adjustDifference(f.deps(), f.who(h.accounts, f.storeA), diff.id, { pin: PIN, reason: 'The ERP received 900, the webhook said 1000.', erpEventId: 'evt-q8' });
    const link = await f.linkOf(f.storeA);
    const pm = await paymentMatch(f.deps(), link);
    expect(pm.matched.filter((x) => x.reference === 'BANK-Q8').map((x) => [x.amountMinor, x.paidOn, x.erpDate, x.entryEventId])).toEqual([[90000, D, D, 'evt-q8']]);
    expect([...pm.shopOnly, ...pm.erpOnly].filter((x) => x.reference === 'BANK-Q8')).toEqual([]);
    // Past the matching window: still paired, the day matches.
    at('2026-11-10T20:30:00Z');
    const r = await runBooksMatch(f.deps(), { storeId: f.storeA, from: D, through: D });
    expect(r.days.map((d) => [d.date, d.matched])).toEqual([[D, true]]);
    expect(await open(f.storeA)).toEqual([]);
  });

  it('7: a correction of a closed month counts on the day it is booked, as its own earlier-month figure of the tie; the closed day stays as it was', async () => {
    const { f } = h;
    const practice = practiceOf(f.storeB);
    const link = await f.linkOf(f.storeB);
    const D = '2026-10-20';
    at('2026-10-20T06:00:00Z');
    practice.book('EXCHANGE', 1050, { externalOrderId: 'WEB-EXG-Q9', reference: 'EXG-Q9', eventId: 'evt-q9-1', date: D });
    await billed(f.storeB, 'evt-q9-1', D, 'EXG-Q9', '1000');
    // October is closed (the owner's close, as books-close.ts writes it).
    await f.t.prisma.$transaction((tx) => writePeriodClose(tx, link, { level: 'MONTH', start: '2026-10-01', end: '2026-10-31', result: 'MATCHED', openingMinor: 0, closingMinor: 0, matchedDays: 31, totalDays: 31, figures: {}, pinVerified: true }));
    at('2026-11-07T20:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: D });
    const diff = (await open(f.storeB)).find((d) => d.key === 'A:EXCHANGE|EXG-Q9')!;
    const adj = await adjustDifference(f.deps(), f.who(h.accounts, f.storeB), diff.id, { pin: PIN, reason: 'October is closed; the ERP charged 1050.', erpEventId: 'evt-q9-1' });
    expect(adj).toMatchObject({ kind: 'PRIOR_PERIOD', date: '2026-11-08', amountMinor: 5000 });
    at('2026-11-08T20:30:00Z');
    const r = await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: '2026-11-08' });
    expect(r.days.filter((d) => !d.matched).map((d) => d.date)).toEqual([]);
    const close = await f.t.prisma.booksDayClose.findFirstOrThrow({ where: { linkId: link.id, date: day('2026-11-08') }, orderBy: { version: 'desc' } });
    expect((close.figures as { tie: Record<string, unknown> }).tie).toMatchObject({ priorPeriodMinor: 5000, adjustmentsMinor: 0, remainderMinor: 0 });
    expect(Number(close.tieRemainderMinor)).toBe(0);
    // PR 617: the shop's own figures of the day carry it as an earlier-month correction, not in the exchange lines.
    const fig = await figuresOf(f.storeB, '2026-11-08');
    expect([fig.priorPeriod, fig.returnLosses.exchangeMinor, fig.goods.exchangeMinor]).toEqual([{ minor: 5000, corrections: 1 }, 0, 0]);
    expect((await figuresOf(f.storeB, D)).returnLosses.exchangeMinor).toBe(100000);
    // The closed day keeps its difference as it was put right.
    expect((await f.t.prisma.booksDifference.findUniqueOrThrow({ where: { id: diff.id } })).status).toBe('FIXED');
    const [shop, erp] = await balances(f.storeB);
    expect(shop).toBe(erp);
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 616 money review round 2 on PostgreSQL: corrections without ids, closed-month undo, stale closes', () => {
  const { h, at, practiceOf, open, balances, shopEvent, billed, stripIds, costs, paidBoth, figuresOf } = harness('booksmoney3');

  it('8: the ERP corrects a payment on a later day and its statement rows carry neither eventId nor reference: the group matches', async () => {
    const { f } = h;
    const practice = practiceOf(f.storeA);
    const link = await f.linkOf(f.storeA);
    at('2026-11-02T04:00:00Z');
    const pay = practice.recordPayment(1000, { date: '2026-11-02' });
    await f.deliverAll(f.storeA);
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    // 3 November: the ERP corrects it to 800 (its reversal and new rows), and its webhook says so.
    at('2026-11-03T04:00:00Z');
    practice.book('PAYMENT', 1000, { eventId: 'evt-r8', date: '2026-11-03' });
    practice.book('PAYMENT', -800, { eventId: 'evt-r8', date: '2026-11-03' });
    await shopEvent(f.storeA, { eventId: 'evt-r8', type: 'payment.recorded', date: '2026-11-03', reverses: pay.eventId, data: { amount: '800', reference: null } });
    const restore = stripIds();
    try {
      at('2026-11-05T20:30:00Z');
      const r = await runBooksMatch(f.deps(), { storeId: f.storeA, from: '2026-11-02', through: '2026-11-03' });
      expect(r.status).toBe('ok');
      // No "paid to ERP" record was written, so that is all that is open: never a missing event or an unknown row.
      expect((await open(f.storeA)).filter((d) => d.kind !== 'UNMATCHED_PAYMENT').map((d) => [d.kind, d.key])).toEqual([]);
      const close = await f.t.prisma.booksDayClose.findFirstOrThrow({ where: { linkId: link.id, date: day('2026-11-03') }, orderBy: { version: 'desc' } });
      expect(Number(close.tieRemainderMinor)).toBe(0);
    } finally {
      restore();
    }
    const [shop, erp] = await balances(f.storeA);
    expect(shop).toBe(erp);
  });

  it('9: the ERP cancelling an event the shop corrected in a closed month matches on its own day, as an earlier-month correction', async () => {
    const { f } = h;
    const practice = practiceOf(f.storeB);
    const link = await f.linkOf(f.storeB);
    const D = '2026-10-20';
    at('2026-10-20T06:00:00Z');
    practice.book('EXCHANGE', 1050, { externalOrderId: 'WEB-EXG-R9', reference: 'EXG-R9', eventId: 'evt-r9-1', date: D });
    await billed(f.storeB, 'evt-r9-1', D, 'EXG-R9', '1000');
    await f.t.prisma.$transaction((tx) => writePeriodClose(tx, link, { level: 'MONTH', start: '2026-10-01', end: '2026-10-31', result: 'MATCHED', openingMinor: 0, closingMinor: 0, matchedDays: 31, totalDays: 31, figures: {}, pinVerified: true }));
    at('2026-11-07T20:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: D });
    const diff = (await open(f.storeB)).find((d) => d.key === 'A:EXCHANGE|EXG-R9')!;
    expect(await adjustDifference(f.deps(), f.who(h.accounts, f.storeB), diff.id, { pin: PIN, reason: 'October is closed; the ERP charged 1050.', erpEventId: 'evt-r9-1' })).toMatchObject({ kind: 'PRIOR_PERIOD', date: '2026-11-08' });
    // 9 November: the ERP cancels the exchange; its row lies in the exchange group of that day.
    at('2026-11-09T06:00:00Z');
    practice.book('EXCHANGE', -1050, { externalOrderId: 'WEB-EXG-R9', reference: 'EXG-R9', eventId: 'evt-r9-c', date: '2026-11-09' });
    await shopEvent(f.storeB, { eventId: 'evt-r9-c', type: 'exchange.cancelled', date: '2026-11-09', reverses: 'evt-r9-1', data: { exchangeId: 'EXG-R9', externalOrderId: 'WEB-EXG-R9', amount: '0' } });
    at('2026-11-09T20:30:00Z');
    const r = await runBooksMatch(f.deps(), { storeId: f.storeB, from: '2026-11-08', through: '2026-11-09' });
    expect(r.days.map((d) => [d.date, d.matched])).toEqual([
      ['2026-11-08', true],
      ['2026-11-09', true],
    ]);
    expect(await open(f.storeB)).toEqual([]);
    const close = await f.t.prisma.booksDayClose.findFirstOrThrow({ where: { linkId: link.id, date: day('2026-11-09') }, orderBy: { version: 'desc' } });
    expect((close.figures as { tie: Record<string, unknown> }).tie).toMatchObject({ priorPeriodMinor: -105000, adjustmentsMinor: 0, remainderMinor: 0 });
    const fig = await figuresOf(f.storeB, '2026-11-09');
    expect([fig.priorPeriod, fig.returnLosses.exchangeMinor, fig.goods.exchangeMinor]).toEqual([{ minor: -105000, corrections: 1 }, 0, 0]);
    // The books screen (Money → Daily summary) shows it on that day's row; the summary sent has no line for it.
    await summaryTick(f.deps(), f.storeB);
    const row = (await summaryLog(f.deps(), f.who(h.accounts, f.storeB), { days: 31 })).find((x) => x.date === '2026-11-09');
    expect(row?.priorPeriod).toEqual({ minor: -105000, corrections: 1 });
    const sent = await f.t.prisma.erpDailySummary.findFirstOrThrow({ where: { linkId: link.id, date: day('2026-11-09') }, orderBy: { version: 'desc' } });
    expect(JSON.stringify(sent.body)).not.toMatch(/prior/i);
    const [shop, erp] = await balances(f.storeB);
    expect(shop).toBe(erp);
  });

  it('10: an entry booked while the run is between its read and the day`s close leaves that close stale: the month does not close on it; late pipeline moves and return lists count too', async () => {
    const { f } = h;
    const practice = practiceOf(f.storeB);
    const link = await f.linkOf(f.storeB);
    at('2026-12-01T04:00:00Z');
    await paidBoth(f.storeB, 300, '2026-12-01', 'BANK-R10A');
    await costs(f.storeB, '2026-12');
    // While the run asks the ERP for 31 December's returns (after it read the books, before it closes that day), the
    // ERP records a payment dated that day and the shop books it.
    const inner = globalThis.fetch;
    let booked = false;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (!booked && url.pathname.endsWith('/returns/summary') && url.searchParams.get('date') === '2026-12-31') {
        booked = true;
        practice.recordPayment(600, { reference: 'BANK-R10', date: '2026-12-31' });
        await f.deliverAll(f.storeB);
        await syncErpAccount(f.deps(), { storeId: f.storeB });
      }
      return inner(input, init);
    }) as typeof fetch;
    try {
      at('2027-01-01T20:00:00Z');
      const r = await runBooksMatch(f.deps(), { storeId: f.storeB, through: '2026-12-31' });
      expect(r.days.filter((d) => d.date.startsWith('2026-12') && !d.matched).map((d) => d.date)).toEqual([]);
    } finally {
      globalThis.fetch = inner;
    }
    expect(booked).toBe(true);
    expect(await movedSinceClose(f.t.prisma, link, '2026-12-31', '2026-12-01')).toBe('2026-12-31');
    await expect(closeMonth(f.deps(), f.who(h.accounts, f.storeB), { month: '2026-12', pin: PIN })).rejects.toMatchObject({ code: 'RUN_MATCH_FIRST', details: ['2026-12-31'] });
    // The next run reads it: the day's close is new and no longer stale.
    at('2027-01-02T20:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, through: '2026-12-31' });
    expect(await movedSinceClose(f.t.prisma, link, '2026-12-31', '2026-12-01')).toBeNull();
    // A courier return list handed back on a closed day, and a pipeline move dated in one, written after the close.
    await f.shopHandBack(f.storeB, 'RL-R10', '2026-12-10', [{ ext: 'WEB-R10', received: 1 }]);
    expect(await movedSinceClose(f.t.prisma, link, '2026-12-31', '2026-12-01')).toBe('2026-12-10');
    const piece = await f.t.prisma.erpPipelinePiece.create({ data: { storeId: f.storeB, linkId: link.id, externalOrderId: 'WEB-R10', lineId: 'L1', sku: 'SKU-R10', buyingPriceMinor: 40000, state: 'BILLED', billedOn: day('2026-12-05'), stateDate: day('2026-12-05') } });
    await f.t.prisma.erpPipelineMove.create({ data: { storeId: f.storeB, linkId: link.id, pieceId: piece.id, fromState: null, toState: 'BILLED', businessDate: day('2026-12-05'), buyingPriceMinor: 40000, cause: 'evt-r10-bill' } });
    expect(await movedSinceClose(f.t.prisma, link, '2026-12-31', '2026-12-01')).toBe('2026-12-05');
  });

  // Round 3 of the review.
  it('11: an ERP payment the catch-up holds back (a correction on its way) shows with its reason and waits; its event comes and the group matches', async () => {
    const { f } = h;
    const practice = practiceOf(f.storeA);
    at('2026-11-20T04:00:00Z');
    const pay = practice.recordPayment(500, { date: '2026-11-20' });
    await f.deliverAll(f.storeA);
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    // The ERP corrects it to 450: its reversal row names the payment, the new row has its own eventId; the webhook is late.
    practice.book('PAYMENT', 500, { eventId: pay.eventId, date: '2026-11-20' });
    practice.book('PAYMENT', -450, { eventId: 'evt-r11-c', date: '2026-11-20' });
    at('2026-11-21T20:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA, from: '2026-11-20', through: '2026-11-20' });
    const held = (await open(f.storeA)).find((d) => d.key === 'A:PAYMENT|evt-r11-c')!;
    expect([held.kind, (held.detail as { heldBy?: string }).heldBy, isAdjustable(held)]).toEqual(['MISSING_EVENT', 'CORRECTION_IN_FLIGHT', false]);
    await shopEvent(f.storeA, { eventId: 'evt-r11-c', type: 'payment.recorded', date: '2026-11-20', reverses: pay.eventId, data: { amount: '450', reference: null } });
    at('2026-11-21T21:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA, from: '2026-11-20', through: '2026-11-20' });
    expect((await open(f.storeA)).filter((d) => d.date.toISOString().startsWith('2026-11-20') && d.kind !== 'UNMATCHED_PAYMENT').map((d) => [d.kind, d.key])).toEqual([]);
  });

  it('12: a shop payment short met only by a guess (an ERP row with no eventId and no reference) waits instead of inviting a correction; the late event settles it', async () => {
    const { f } = h;
    const practice = practiceOf(f.storeA);
    at('2026-11-25T04:00:00Z');
    // The shop has payment A (300) whose ERP row is not on this day; the ERP has X (200) whose webhook has not come.
    await shopEvent(f.storeA, { eventId: 'evt-r12-a', type: 'payment.recorded', date: '2026-11-25', data: { amount: '300', reference: null } });
    const x = practice.recordPayment(200, { date: '2026-11-25' });
    await f.deliverAll(f.storeA, { drop: true });
    const restore = stripIds(true);
    try {
      at('2026-11-26T20:30:00Z');
      await runBooksMatch(f.deps(), { storeId: f.storeA, from: '2026-11-25', through: '2026-11-25' });
      const g = (await open(f.storeA)).find((d) => d.key === 'A:PAYMENT|evt-r12-a')!;
      expect([g.kind, g.status, (g.detail as { guessed?: boolean }).guessed, isAdjustable(g)]).toEqual(['AMOUNT_DIFF', 'PENDING', true, false]);
      // X's event comes: X meets its row, and A is what it really is — the shop's payment the ERP has no row for.
      await shopEvent(f.storeA, { eventId: x.eventId, type: 'payment.recorded', date: '2026-11-25', data: { amount: '200', reference: null, method: 'BANK' } });
      at('2026-11-26T21:30:00Z');
      await runBooksMatch(f.deps(), { storeId: f.storeA, from: '2026-11-25', through: '2026-11-25' });
    } finally {
      restore();
    }
    const after = (await open(f.storeA)).filter((d) => d.date.toISOString().startsWith('2026-11-25') && d.kind !== 'UNMATCHED_PAYMENT');
    expect(after.map((d) => [d.kind, d.key, (d.detail as { guessed?: boolean }).guessed ?? false])).toEqual([['UNKNOWN_ROW', 'A:PAYMENT|evt-r12-a', false]]);
  });

  it('13: a fact whose transaction was open at the run`s read (committed later, created earlier) still makes the day stale; idle runs write no new close', async () => {
    const { f } = h;
    const link = await f.linkOf(f.storeA);
    const D = '2026-11-27';
    at('2026-11-27T04:00:00Z');
    await paidBoth(f.storeA, 400, D, 'BANK-R13');
    at('2026-11-28T20:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA, from: D, through: D });
    const closes = () => f.t.prisma.booksDayClose.count({ where: { linkId: link.id, date: day(D) } });
    const n0 = await closes();
    at('2026-11-28T21:00:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA, from: D, through: D });
    expect([await closes(), await movedSinceClose(f.t.prisma, link, D, D)]).toEqual([n0, null]);
    // Rows as a writer whose transaction was open at that read leaves them: committed now, created an hour before.
    const before = new Date(Date.now() - 3_600_000);
    await f.t.prisma.erpPaymentRecord.create({ data: { storeId: f.storeA, linkId: link.id, paidOn: day(D), amountMinor: 5000n, method: 'BANK', reference: 'BANK-R13-LATE', recordedById: h.accounts.staffUserId!, createdAt: before } });
    expect(await movedSinceClose(f.t.prisma, link, D, D)).toBe(D);
    at('2026-11-28T21:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeA, from: D, through: D });
    expect(await movedSinceClose(f.t.prisma, link, D, D)).toBeNull();
    const piece = await f.t.prisma.erpPipelinePiece.create({ data: { storeId: f.storeA, linkId: link.id, externalOrderId: 'WEB-R13', lineId: 'L1', sku: 'SKU-R13', buyingPriceMinor: 40000, state: 'BILLED', billedOn: day(D), stateDate: day(D) } });
    await f.t.prisma.erpPipelineMove.create({ data: { storeId: f.storeA, linkId: link.id, pieceId: piece.id, fromState: null, toState: 'BILLED', businessDate: day(D), buyingPriceMinor: 40000, cause: 'evt-r13-bill', createdAt: before } });
    expect(await movedSinceClose(f.t.prisma, link, D, D)).toBe(D);
  });
});
