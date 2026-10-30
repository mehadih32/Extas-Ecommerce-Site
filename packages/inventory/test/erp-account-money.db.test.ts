// CN-028 · PR 615 money review on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL). Each test was written
// before its fix, from the reviewer's reproduction, and failed on the code before it:
// 1. The payment catch-up (follow-up 490) keeps the sign of the ERP's statement row and records it as an ERP event, so
//    the normal path books it: a reversing (+) row whose webhook has not come yet is never booked as a second payment
//    (and never takes the correction's key), and a later correction of a caught-up payment finds its original.
// 2. An ERP correction that comes after a shop correction of the same event is booked: it undoes the shop's correction
//    (a reversal of its ADJUSTMENT, the other entries the correction had reversed booked again), never dropped.
// 3. An ERP amount with more decimals than the currency has is refused (the event FAILED, BAD_PAYLOAD, shown), never
//    booked as 0 or skipped in silence.
// Round 2 of the review:
// 4. A lost ERP correction of a payment is never caught up as a second payment (its eventId on two rows, or a reversal
//    row that day): its own webhook books it once, with no conflict.
// 5. The catch-up's statement body meeting the real event already stored is the same payment (no false conflict).
// Round 3: 6. A reversing row holds back only the payment it corrects: one the ledger already booked holds back
//    nothing; 7. one it cannot tie holds back only a payment of its amount, or of its reference. A payment held back is
//    named with its reason (`held`), and the books match shows it.
// Every amount, key and reference is a made-up test value.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { hashPassword } from '@extas/auth';
import { adjustDifference, applyErpEvents, checkErpAccount, ledgerBalance, recordErpEvent, runBooksMatch, setBooksPin, syncErpAccount } from '../src';
import { setUpBooks, type BooksFixture } from './books-fixture';

const OWNER_PASSWORD = 'sample-owner-password-615-money';
const PIN = '480326';

/** The practice ERP's own ledger, written directly for what its public calls cannot do (a payment reversed, an exchange billed). */
type Practice = {
  book: (kind: string, amount: number, ref: { externalOrderId?: string | null; reference?: string | null; eventId?: string | null; date?: string }) => void;
  balance: (upTo?: string) => number;
  recordPayment: (amount: number, opts?: { reference?: string; date?: string }) => { eventId: string; date: string; data: Record<string, unknown> };
};

describe.skipIf(!HAS_TEST_DB)('PR 615 money review on PostgreSQL: the account ledger', () => {
  let f: BooksFixture;
  const realFetch = globalThis.fetch;
  let accounts: { staffUserId: string | null };
  beforeAll(async () => {
    f = await setUpBooks('acctmoney');
    const owner = await f.owner('acctmoney');
    await f.t.prisma.staffUser.update({ where: { id: owner.staffUserId! }, data: { passwordHash: await hashPassword(OWNER_PASSWORD) } });
    await setBooksPin(f.deps(), f.who(owner, f.storeA), { password: OWNER_PASSWORD, pin: PIN });
    accounts = await f.staff(['books.read', 'books.adjust', 'books.close', 'erp.account.read', 'erp.payments.record'], null, 'acctmoney-accounts');
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
  const practiceOf = (storeId: number) => f.world.v6(f.company(storeId)) as unknown as Practice;
  const entriesOf = async (storeId: number) => {
    const link = await f.linkOf(storeId);
    return f.t.prisma.erpAccountEntry.findMany({ where: { linkId: link.id }, orderBy: { seq: 'asc' } });
  };
  const balances = async (storeId: number) => [await ledgerBalance(f.t.prisma, await f.linkOf(storeId)), Math.round(practiceOf(storeId).balance() * 100)];
  /** An ERP event reaching the shop as its webhook would (recorded, applied, booked). */
  const shopEvent = async (storeId: number, ev: { eventId: string; type: string; date: string; reverses?: string | null; data: Record<string, unknown> }) => {
    const link = await f.linkOf(storeId);
    const integ = await f.t.prisma.integration.findFirstOrThrow({ where: { storeId, kind: 'ERP' }, select: { id: true } });
    await recordErpEvent(f.deps(), { integrationId: integ.id, storeId, linkId: link.id, source: 'WEBHOOK', event: { eventId: ev.eventId, type: ev.type as never, occurredAt: new Date(`${ev.date}T06:00:00Z`), date: ev.date, reverses: ev.reverses ?? null, data: ev.data } });
    await applyErpEvents(f.deps());
    await syncErpAccount(f.deps(), { storeId });
  };
  const eventOf = async (storeId: number, eventId: string) => {
    const link = await f.linkOf(storeId);
    return f.t.prisma.erpEvent.findUnique({ where: { linkId_eventId: { linkId: link.id, eventId } } });
  };

  it('1a: a reversing (+) payment row caught up before its webhook is not booked as money paid; its correction books once and the balances agree', async () => {
    const practice = practiceOf(f.storeA);
    at('2026-11-02T04:00:00Z');
    const pay = practice.recordPayment(1000, { reference: 'BANK-M1', date: '2026-11-02' });
    await f.deliverAll(f.storeA);
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    // The ERP's Accounts team reverses the payment (recorded in error); its webhook has not come yet.
    practice.book('PAYMENT', 1000, { reference: 'BANK-M1', eventId: 'evt-m1-corr', date: '2026-11-02' });
    const c = await checkErpAccount(f.deps(), { storeId: f.storeA });
    expect(c).toMatchObject({ status: 'ok', caughtUp: 0 });
    expect((await entriesOf(f.storeA)).map((e) => [e.kind, e.eventId, Number(e.amountMinor)])).toEqual([['PAYMENT', pay.eventId, -100000]]);
    // The correction's webhook comes: one reversal, and the two ledgers agree.
    await shopEvent(f.storeA, { eventId: 'evt-m1-corr', type: 'payment.recorded', date: '2026-11-02', reverses: pay.eventId, data: { amount: '0', reference: 'BANK-M1' } });
    expect((await entriesOf(f.storeA)).map((e) => [e.kind, e.eventId, Number(e.amountMinor), e.reverses])).toEqual([
      ['PAYMENT', pay.eventId, -100000, null],
      ['REVERSAL', 'evt-m1-corr', 100000, pay.eventId],
    ]);
    const [shop, erp] = await balances(f.storeA);
    expect(shop).toBe(erp);
  });

  it('1b: a lost payment caught up from the statement is an ERP event: its late webhook is the same event, and a later correction of it is booked', async () => {
    const practice = practiceOf(f.storeA);
    at('2026-11-04T04:00:00Z');
    const pay = practice.recordPayment(700, { reference: 'BANK-M2', date: '2026-11-04' });
    await f.deliverAll(f.storeA, { drop: true });
    expect(await checkErpAccount(f.deps(), { storeId: f.storeA })).toMatchObject({ status: 'ok', caughtUp: 1 });
    expect(await eventOf(f.storeA, pay.eventId)).toMatchObject({ type: 'payment.recorded', source: 'PULL', moneyEvent: true });
    const caught = (await entriesOf(f.storeA)).filter((e) => e.eventId === pay.eventId);
    expect(caught.map((e) => [e.kind, Number(e.amountMinor), e.paymentRef, e.source])).toEqual([['PAYMENT', -70000, 'BANK-M2', 'PULL']]);
    // The real webhook arrives after all: the same event (no conflict raised for a person, no second entry).
    await shopEvent(f.storeA, { eventId: pay.eventId, type: 'payment.recorded', date: pay.date, data: pay.data });
    expect(await eventOf(f.storeA, pay.eventId)).toMatchObject({ conflictCount: 0 });
    expect((await entriesOf(f.storeA)).filter((e) => e.eventId === pay.eventId)).toHaveLength(1);
    // The ERP then reverses that payment: its correction finds its original and is booked once.
    at('2026-11-05T04:00:00Z');
    practice.book('PAYMENT', 700, { reference: 'BANK-M2', eventId: 'evt-m2-corr', date: '2026-11-05' });
    await shopEvent(f.storeA, { eventId: 'evt-m2-corr', type: 'payment.recorded', date: '2026-11-05', reverses: pay.eventId, data: { amount: '0', reference: 'BANK-M2' } });
    expect(await eventOf(f.storeA, 'evt-m2-corr')).toMatchObject({ status: 'STORED' });
    expect((await entriesOf(f.storeA)).filter((e) => e.reverses === pay.eventId).map((e) => [e.kind, e.eventId, Number(e.amountMinor)])).toEqual([['REVERSAL', 'evt-m2-corr', 70000]]);
    const [shop, erp] = await balances(f.storeA);
    expect(shop).toBe(erp);
  });

  it('2a: an ERP correction after the shop corrected the same event undoes the shop`s correction (never dropped); the balances agree', async () => {
    const practice = practiceOf(f.storeB);
    const D = '2026-11-03';
    at('2026-11-03T06:00:00Z');
    practice.book('EXCHANGE', 1050, { externalOrderId: 'WEB-M3', reference: 'EXG-M3', eventId: 'evt-m3-1', date: D });
    await shopEvent(f.storeB, { eventId: 'evt-m3-1', type: 'exchange.billed', date: D, data: { exchangeId: 'EXG-M3', externalOrderId: 'WEB-M3', amount: '1000', reason: 'DEADLINE_PASSED' } });
    at('2026-11-03T20:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: D });
    const link = await f.linkOf(f.storeB);
    const diff = await f.t.prisma.booksDifference.findFirstOrThrow({ where: { linkId: link.id, key: 'A:EXCHANGE|EXG-M3', status: { in: ['PENDING', 'MISMATCH'] } } });
    const adj = await adjustDifference(f.deps(), f.who(accounts, f.storeB), diff.id, { pin: PIN, reason: 'The ERP billed 1050 for the exchange piece.', erpEventId: 'evt-m3-1' });
    // The ERP cancels the event the next day.
    at('2026-11-04T06:00:00Z');
    practice.book('EXCHANGE', -1050, { externalOrderId: 'WEB-M3', reference: 'EXG-M3', eventId: 'evt-m3-c', date: '2026-11-04' });
    await shopEvent(f.storeB, { eventId: 'evt-m3-c', type: 'exchange.cancelled', date: '2026-11-04', reverses: 'evt-m3-1', data: { exchangeId: 'EXG-M3', externalOrderId: 'WEB-M3', amount: '0' } });
    const booked = (await entriesOf(f.storeB)).filter((e) => e.eventId.startsWith('evt-m3-c'));
    expect(booked.map((e) => [e.kind, Number(e.amountMinor), e.reverses, e.adjustmentId])).toEqual([['REVERSAL', -105000, `adj:${adj.id}`, null]]);
    const [shop, erp] = await balances(f.storeB);
    expect(shop).toBe(erp);
  });

  it('2b: a shop correction that covered two events: the ERP cancelling one of them books the rest again, so the balances agree', async () => {
    const practice = practiceOf(f.storeB);
    const D = '2026-11-05';
    at('2026-11-05T06:00:00Z');
    practice.book('EXCHANGE', 1050, { externalOrderId: 'WEB-M4', reference: 'EXG-M4', eventId: 'evt-m4-a', date: D });
    practice.book('EXCHANGE', 1000, { externalOrderId: 'WEB-M4', reference: 'EXG-M4', eventId: 'evt-m4-b', date: D });
    await shopEvent(f.storeB, { eventId: 'evt-m4-a', type: 'exchange.billed', date: D, data: { exchangeId: 'EXG-M4', externalOrderId: 'WEB-M4', amount: '1000', reason: 'DEADLINE_PASSED' } });
    await shopEvent(f.storeB, { eventId: 'evt-m4-b', type: 'exchange.billed', date: D, data: { exchangeId: 'EXG-M4', externalOrderId: 'WEB-M4', amount: '1000', reason: 'DEADLINE_PASSED' } });
    at('2026-11-05T20:30:00Z');
    await runBooksMatch(f.deps(), { storeId: f.storeB, from: D, through: D });
    const link = await f.linkOf(f.storeB);
    const diff = await f.t.prisma.booksDifference.findFirstOrThrow({ where: { linkId: link.id, key: 'A:EXCHANGE|EXG-M4', status: { in: ['PENDING', 'MISMATCH'] } } });
    const adj = await adjustDifference(f.deps(), f.who(accounts, f.storeB), diff.id, { pin: PIN, reason: 'The ERP billed 1050 for the first piece.', erpEventId: 'evt-m4-a' });
    at('2026-11-06T06:00:00Z');
    practice.book('EXCHANGE', -1050, { externalOrderId: 'WEB-M4', reference: 'EXG-M4', eventId: 'evt-m4-ac', date: '2026-11-06' });
    await shopEvent(f.storeB, { eventId: 'evt-m4-ac', type: 'exchange.cancelled', date: '2026-11-06', reverses: 'evt-m4-a', data: { exchangeId: 'EXG-M4', externalOrderId: 'WEB-M4', amount: '0' } });
    const booked = (await entriesOf(f.storeB)).filter((e) => e.eventId.startsWith('evt-m4-ac'));
    expect(booked.map((e) => [e.kind, e.eventId, Number(e.amountMinor), e.reverses])).toEqual([
      ['REVERSAL', 'evt-m4-ac', -205000, `adj:${adj.id}`],
      ['EXCHANGE_BILL', 'evt-m4-ac:keep:evt-m4-b', 100000, null],
    ]);
    const [shop, erp] = await balances(f.storeB);
    expect(shop).toBe(erp);
  });

  it('3: an ERP amount with more decimals than the currency has is refused (FAILED, BAD_PAYLOAD), never booked as 0 or skipped in silence', async () => {
    at('2026-11-07T06:00:00Z');
    await shopEvent(f.storeA, { eventId: 'evt-m5-x', type: 'exchange.billed', date: '2026-11-07', data: { exchangeId: 'EXG-M5', externalOrderId: 'WEB-M5', amount: '1000.005', reason: 'DEADLINE_PASSED' } });
    const ev = await eventOf(f.storeA, 'evt-m5-x');
    expect(ev?.status).toBe('FAILED');
    expect(ev?.error).toMatch(/^BAD_PAYLOAD/);
    expect((await entriesOf(f.storeA)).filter((e) => e.eventId.startsWith('evt-m5-x'))).toEqual([]);
    // Running the books again changes nothing (the refused event stays refused, nothing is booked).
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    expect((await entriesOf(f.storeA)).filter((e) => e.eventId.startsWith('evt-m5-x'))).toEqual([]);
  });

  // Round 2: a lost correction of a payment is never caught up as a second payment.
  const integrationOf = async (storeId: number) => (await f.t.prisma.integration.findFirstOrThrow({ where: { storeId, kind: 'ERP' }, select: { id: true } })).id;

  it('4a: the ERP corrects a payment and the webhook is lost (both rows carry the correction`s eventId): nothing is caught up; the webhook books it once', async () => {
    const practice = practiceOf(f.storeB);
    at('2026-11-10T04:00:00Z');
    const pay = practice.recordPayment(1000, { date: '2026-11-10' });
    await f.deliverAll(f.storeB);
    await syncErpAccount(f.deps(), { storeId: f.storeB });
    practice.book('PAYMENT', 1000, { eventId: 'evt-m6-c', date: '2026-11-10' });
    practice.book('PAYMENT', -800, { eventId: 'evt-m6-c', date: '2026-11-10' });
    expect(await checkErpAccount(f.deps(), { storeId: f.storeB })).toMatchObject({ status: 'ok', caughtUp: 0, notTaken: 2 });
    const mine = async () => (await entriesOf(f.storeB)).filter((e) => e.eventId === pay.eventId || e.eventId.startsWith('evt-m6-c'));
    expect((await mine()).map((e) => e.eventId)).toEqual([pay.eventId]);
    await shopEvent(f.storeB, { eventId: 'evt-m6-c', type: 'payment.recorded', date: '2026-11-10', reverses: pay.eventId, data: { amount: '800', reference: null } });
    const ev = await eventOf(f.storeB, 'evt-m6-c');
    expect([ev?.status, ev?.conflictCount]).toEqual(['STORED', 0]);
    expect((await mine()).map((e) => [e.kind, e.eventId, Number(e.amountMinor)])).toEqual([
      ['PAYMENT', pay.eventId, -100000],
      ['REVERSAL', 'evt-m6-c', 100000],
      ['PAYMENT', 'evt-m6-c:new', -80000],
    ]);
    const [shop, erp] = await balances(f.storeB);
    expect(shop).toBe(erp);
  });

  it('4b: a correction whose reversal row names the original: its new row is not caught up either (a reversal that day), the webhook books it once', async () => {
    const practice = practiceOf(f.storeB);
    at('2026-11-11T04:00:00Z');
    const pay = practice.recordPayment(500, { date: '2026-11-11' });
    await f.deliverAll(f.storeB);
    await syncErpAccount(f.deps(), { storeId: f.storeB });
    practice.book('PAYMENT', 500, { eventId: pay.eventId, date: '2026-11-11' });
    practice.book('PAYMENT', -450, { eventId: 'evt-m7-c', date: '2026-11-11' });
    const c = await checkErpAccount(f.deps(), { storeId: f.storeB });
    expect(c).toMatchObject({ status: 'ok', caughtUp: 0 });
    // Round 3: it is held with its reason (the books match shows it), never dropped in silence.
    expect(c.held).toEqual([{ eventId: 'evt-m7-c', date: '2026-11-11', amountMinor: -45000, reason: 'CORRECTION_IN_FLIGHT' }]);
    await shopEvent(f.storeB, { eventId: 'evt-m7-c', type: 'payment.recorded', date: '2026-11-11', reverses: pay.eventId, data: { amount: '450', reference: null } });
    expect((await eventOf(f.storeB, 'evt-m7-c'))?.conflictCount).toBe(0);
    const [shop, erp] = await balances(f.storeB);
    expect(shop).toBe(erp);
  });

  it('5: the catch-up meeting a webhook already stored for the same payment is the same event (no conflict on the health panel)', async () => {
    const link = await f.linkOf(f.storeB);
    const integrationId = await integrationOf(f.storeB);
    at('2026-11-12T04:00:00Z');
    await recordErpEvent(f.deps(), { integrationId, storeId: f.storeB, linkId: link.id, source: 'WEBHOOK', event: { eventId: 'evt-m8', type: 'payment.recorded', occurredAt: new Date('2026-11-12T04:00:00Z'), date: '2026-11-12', reverses: null, data: { amount: '700', reference: 'BANK-M8', method: 'BANK' } } });
    const again = await recordErpEvent(f.deps(), { integrationId, storeId: f.storeB, linkId: link.id, source: 'PULL', event: { eventId: 'evt-m8', type: 'payment.recorded', occurredAt: null, date: '2026-11-12', reverses: null, data: { amount: '700.00', reference: 'BANK-M8', fromStatement: true } } });
    expect(again.conflict).toBeUndefined();
    expect((await eventOf(f.storeB, 'evt-m8'))?.conflictCount).toBe(0);
    // A statement row of another amount is still a conflict.
    expect((await recordErpEvent(f.deps(), { integrationId, storeId: f.storeB, linkId: link.id, source: 'PULL', event: { eventId: 'evt-m8', type: 'payment.recorded', occurredAt: null, date: '2026-11-12', reverses: null, data: { amount: '70', reference: 'BANK-M8', fromStatement: true } } })).conflict).toBe(true);
  });

  // Round 3: a reversing row holds back only the payment it corrects.
  it('6: a lost payment on a day another payment was corrected (that correction booked) is still caught up; nothing goes missing', async () => {
    const practice = practiceOf(f.storeB);
    await applyErpEvents(f.deps());
    await syncErpAccount(f.deps(), { storeId: f.storeB });
    const [shop0, erp0] = await balances(f.storeB);
    at('2026-11-14T04:00:00Z');
    const p1 = practice.recordPayment(1000, { date: '2026-11-14' });
    await f.deliverAll(f.storeB);
    await syncErpAccount(f.deps(), { storeId: f.storeB });
    // The ERP corrects P1 to 800 (both rows under the correction's eventId) and its webhook comes.
    practice.book('PAYMENT', 1000, { eventId: 'evt-m9-c', date: '2026-11-14' });
    practice.book('PAYMENT', -800, { eventId: 'evt-m9-c', date: '2026-11-14' });
    await shopEvent(f.storeB, { eventId: 'evt-m9-c', type: 'payment.recorded', date: '2026-11-14', reverses: p1.eventId, data: { amount: '800', reference: null } });
    // An unrelated payment P2 the same day: its webhook is lost.
    at('2026-11-14T08:00:00Z');
    const p2 = practice.recordPayment(300, { date: '2026-11-14', reference: 'BANK-M9' });
    await f.deliverAll(f.storeB, { drop: true });
    at('2026-11-14T09:00:00Z');
    const c = await checkErpAccount(f.deps(), { storeId: f.storeB });
    expect([c.caughtUp, c.held]).toEqual([1, []]);
    expect((await entriesOf(f.storeB)).filter((e) => e.eventId === p2.eventId).map((e) => [e.kind, Number(e.amountMinor)])).toEqual([['PAYMENT', -30000]]);
    const [shop, erp] = await balances(f.storeB);
    expect(shop! - erp!).toBe(shop0! - erp0!);
  });

  it('7: a reversing row the ledger cannot tie holds back only a payment of its amount; one of the same reference holds back that reference', async () => {
    const practice = practiceOf(f.storeB);
    at('2026-11-16T04:00:00Z');
    practice.book('PAYMENT', 200, { eventId: 'evt-m10-x', date: '2026-11-16' });
    practice.book('PAYMENT', -200, { eventId: 'evt-m10-a', date: '2026-11-16' });
    practice.book('PAYMENT', 150, { eventId: 'evt-m10-y', reference: 'BANK-M10', date: '2026-11-16' });
    practice.book('PAYMENT', -90, { eventId: 'evt-m10-b', reference: 'BANK-M10', date: '2026-11-16' });
    practice.book('PAYMENT', -350, { eventId: 'evt-m10-c', date: '2026-11-16' });
    const c = await checkErpAccount(f.deps(), { storeId: f.storeB });
    expect(c.caughtUp).toBe(1);
    expect(c.held.filter((x) => x.eventId.startsWith('evt-m10-')).map((x) => [x.eventId, x.reason])).toEqual([
      ['evt-m10-a', 'SAME_AMOUNT_REVERSAL'],
      ['evt-m10-b', 'CORRECTION_SAME_REFERENCE'],
    ]);
    expect((await entriesOf(f.storeB)).filter((e) => e.eventId === 'evt-m10-c').map((e) => Number(e.amountMinor))).toEqual([-35000]);
  });
});
