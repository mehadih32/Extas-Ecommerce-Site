// CN-028 · PR 615 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): Retail's ERP account ledger and the
// pipeline stock (docs/RETAIL-ERP-MODEL.md §3.1, §3.2). The owner's rules proved here: the ledger is append-only and
// hash-chained, one entry per ERP event forever (a webhook twice, or webhook and pull, is one entry), a correction is a
// reversing entry plus a new one, the shop's balance equals the ERP's with zero tolerance, the pipeline comes from the
// shop's own piece states, a payment to the ERP is only recorded (nothing moves money) by Accounts or the owner, a lost
// `payment.recorded` or `account.*` webhook is caught up from `GET /account` (follow-up 490), and store A's ledger is
// never store B's. In v5 nothing here runs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import {
  accountEntries,
  accountOverview,
  balanceOn,
  BooksError,
  checkErpAccount,
  importOpeningBalance,
  paymentMatch,
  pipelineOn,
  recordBill,
  recordErpEvent,
  recordErpPayment,
  recordSwitchTransfer,
  reverseErpPayment,
  syncErpAccount,
  verifyAccountChain,
  applyErpEvents,
} from '../src';
import { day, setUpBooks, type BooksFixture } from './books-fixture';

describe.skipIf(!HAS_TEST_DB)('PR 615 on PostgreSQL: the ERP account ledger and the pipeline stock', () => {
  let f: BooksFixture;
  const realFetch = globalThis.fetch;
  beforeAll(async () => {
    f = await setUpBooks('erpaccount');
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await f?.t.drop();
  });
  beforeEach(() => {
    f.clock.now = new Date(f.clock.now.getTime() + 60_000);
  });

  const entriesOf = async (storeId: number) => {
    const link = await f.linkOf(storeId);
    return f.t.prisma.erpAccountEntry.findMany({ where: { linkId: link.id }, orderBy: { seq: 'asc' } });
  };
  const erpBalance = async (storeId: number) => f.world.v6(f.company(storeId)).balance() * 100;
  const shopBalance = async (storeId: number, d = '2026-12-31') => (await balanceOn(f.t.prisma, await f.linkOf(storeId), d)).endMinor;

  it('PR 615: in v5 nothing runs — no entry, no account check, the overview says the books start at the switch', async () => {
    f.setV6(f.storeA, false);
    expect(await syncErpAccount(f.deps(), { storeId: f.storeA })).toMatchObject({ status: 'skipped', reason: 'ERP_MODEL_V5' });
    expect(await checkErpAccount(f.deps(), { storeId: f.storeA })).toMatchObject({ status: 'skipped', reason: 'ERP_MODEL_V5' });
    const owner = await f.owner('v5');
    expect(await accountOverview(f.deps(), f.who(owner, f.storeA))).toMatchObject({ model: 'v5', link: null });
    expect(await f.t.prisma.erpAccountEntry.count()).toBe(0);
    f.setV6(f.storeA);
  });

  it('PR 615: the bill comes when the parcel leaves, once per order, at erpTotal; its pieces enter the pipeline at their shop prices', async () => {
    await f.placeAndShip(f.storeA, 'WEB-101', [f.line('WEB-101-1', 'POLO-NAVY-M', 990), f.line('WEB-101-2', 'POLO-NAVY-L', 1090)]);
    const billedAt = new Date('2026-11-02T06:00:00Z');
    await f.shopOrder(f.storeA, 'WEB-101', [{ lineId: 'WEB-101-1', sku: 'POLO-NAVY-M', shopPrice: 650 }, { lineId: 'WEB-101-2', sku: 'POLO-NAVY-L', shopPrice: 700 }], billedAt);
    // An order not billed yet (not picked up) is never in the books.
    await f.shopOrder(f.storeA, 'WEB-102', [{ lineId: 'WEB-102-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], null);
    const r = await syncErpAccount(f.deps(), { storeId: f.storeA });
    expect(r).toMatchObject({ status: 'ok', bills: 1 });
    // The shop's own call from the shipment answer (PR 611) is the same bill, never a second one.
    expect(await recordBill(f.deps(), { storeId: f.storeA, externalOrderId: 'WEB-101', consignmentId: 'C-WEB-101', erpTotalMinor: 135000, billedAt })).toMatchObject({ created: false });
    expect((await syncErpAccount(f.deps(), { storeId: f.storeA })).bills).toBe(0);
    const entries = await entriesOf(f.storeA);
    expect(entries.map((e) => [e.seq, e.kind, e.eventId, Number(e.amountMinor), e.businessDate.toISOString().slice(0, 10), e.externalOrderId, e.source])).toEqual([[1, 'BILL', 'ship:C-WEB-101', 135000, '2026-11-02', 'WEB-101', 'ANSWER']]);
    expect(await shopBalance(f.storeA)).toBe(await erpBalance(f.storeA));
    const link = await f.linkOf(f.storeA);
    expect(await pipelineOn(f.t.prisma, link.id, '2026-11-02')).toEqual({ totalMinor: 135000, waitingCheckMinor: 0, pieces: 2 });
    expect(await pipelineOn(f.t.prisma, link.id, '2026-11-01')).toEqual({ totalMinor: 0, waitingCheckMinor: 0, pieces: 0 });
    expect(await verifyAccountChain(f.t.prisma, link.id)).toEqual({ ok: true, entries: 1 });
  });

  it('PR 615: approved = a credit at the price paid (once, even when the webhook comes twice); declined = no entry, a return loss; the shop balance equals the ERP balance', async () => {
    await f.push(f.storeA, { type: 'order.delivery', externalOrderId: 'WEB-101', body: { status: 'RETURNED', courier: 'PATHAO', consignmentId: 'C-WEB-101', collected: 0, at: '2026-11-03T15:40:00+06:00' } } as never);
    await f.push(f.storeA, { type: 'returnList.create', body: { returnListId: 'RL-101', courier: 'PATHAO', handedBackAt: '2026-11-04', parcels: [{ consignmentId: 'C-WEB-101', externalOrderId: 'WEB-101', receivedCount: 2 }] } } as never);
    await f.shopDelivery(f.storeA, 'WEB-101', 'RETURNED', new Date('2026-11-03T09:40:00Z'));
    await f.shopHandBack(f.storeA, 'RL-101', '2026-11-04', [{ ext: 'WEB-101', received: 2 }]);
    f.clock.now = new Date('2026-11-04T05:00:00Z');
    await f.deliverAll(f.storeA);
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    const link = await f.linkOf(f.storeA);
    // Handed back, not checked yet: still Retail's, in the pipeline as waiting for the check (= the ERP's waitingCheck).
    expect(await pipelineOn(f.t.prisma, link.id, '2026-11-04')).toEqual({ totalMinor: 135000, waitingCheckMinor: 135000, pieces: 2 });
    expect(f.world.v6(f.company(f.storeA)).waitingCheck() * 100).toBe(135000);

    f.clock.now = new Date('2026-11-05T05:00:00Z');
    const practice = f.world.v6(f.company(f.storeA));
    practice.decidePiece('WEB-101', 'WEB-101-1', 'APPROVED');
    practice.decidePiece('WEB-101', 'WEB-101-2', 'DECLINED', 'B_GRADE');
    await f.deliverAll(f.storeA, { twice: true });
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    const credits = (await entriesOf(f.storeA)).filter((e) => e.kind === 'RETURN_CREDIT');
    expect(credits.map((e) => [Number(e.amountMinor), e.businessDate.toISOString().slice(0, 10), e.externalOrderId, e.lineId, e.source])).toEqual([[-65000, '2026-11-05', 'WEB-101', 'WEB-101-1', 'WEBHOOK']]);
    expect(await shopBalance(f.storeA)).toBe(70000);
    expect(await shopBalance(f.storeA)).toBe(await erpBalance(f.storeA));
    // Out of the pipeline: approved (no cost), declined (Retail's loss on the decision day).
    expect(await pipelineOn(f.t.prisma, link.id, '2026-11-05')).toEqual({ totalMinor: 0, waitingCheckMinor: 0, pieces: 0 });
    const moves = await f.t.prisma.erpPipelineMove.findMany({ where: { linkId: link.id, businessDate: day('2026-11-05') }, orderBy: { createdAt: 'asc' } });
    expect(moves.map((m) => [m.toState, m.buyingPriceMinor])).toEqual([
      ['APPROVED', 65000],
      ['DECLINED', 70000],
    ]);
  });

  it('PR 615: a reversed decision is a REVERSAL entry plus the new effect — never an edit — and the balances still match', async () => {
    const practice = f.world.v6(f.company(f.storeA));
    const approved = practice.events.find((e) => e.type === 'return.piece.decided' && e.data.lineId === 'WEB-101-1')!;
    f.clock.now = new Date('2026-11-06T05:00:00Z');
    practice.reverseDecision(approved.eventId, 'DECLINED', 'STAIN_OR_DAMAGE');
    await f.deliverAll(f.storeA);
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    const all = await entriesOf(f.storeA);
    const rev = all.filter((e) => e.kind === 'REVERSAL');
    expect(rev.map((e) => [Number(e.amountMinor), e.reverses, e.businessDate.toISOString().slice(0, 10), e.lineId])).toEqual([[65000, approved.eventId, '2026-11-06', 'WEB-101-1']]);
    // The original credit is still there, unchanged.
    expect(all.filter((e) => e.kind === 'RETURN_CREDIT').map((e) => Number(e.amountMinor))).toEqual([-65000]);
    expect(await shopBalance(f.storeA)).toBe(135000);
    expect(await shopBalance(f.storeA)).toBe(await erpBalance(f.storeA));
    const link = await f.linkOf(f.storeA);
    const piece = await f.t.prisma.erpPipelinePiece.findFirstOrThrow({ where: { linkId: link.id, lineId: 'WEB-101-1' } });
    expect(piece.state).toBe('DECLINED');
    expect(await verifyAccountChain(f.t.prisma, link.id)).toMatchObject({ ok: true });
  });

  it('PR 615: exchange events make their entries with the right sign; settled EVEN and cancelled make none (on store B, whose ERP never sees them)', async () => {
    const link = await f.linkOf(f.storeB);
    const integ = await f.t.prisma.integration.findFirstOrThrow({ where: { storeId: f.storeB, kind: 'ERP' } });
    const ev = (eventId: string, type: string, data: Record<string, unknown>) =>
      recordErpEvent(f.deps(), { integrationId: integ.id, storeId: f.storeB, linkId: link.id, source: 'PULL', event: { eventId, type: type as never, occurredAt: f.clock.now, date: '2026-11-07', reverses: null, data } });
    await ev('evt_x_extra', 'exchange.settled', { exchangeId: 'EXG-1', externalOrderId: 'WEB-101-X1', kind: 'EXTRA', amount: '50' });
    await ev('evt_x_adj', 'exchange.settled', { exchangeId: 'EXG-2', externalOrderId: 'WEB-103-X1', kind: 'ADJUSTMENT', amount: '30' });
    await ev('evt_x_even', 'exchange.settled', { exchangeId: 'EXG-3', externalOrderId: 'WEB-104-X1', kind: 'EVEN', amount: '0' });
    await ev('evt_x_bill', 'exchange.billed', { exchangeId: 'EXG-4', externalOrderId: 'WEB-105-X1', amount: '700', reason: 'DEADLINE_PASSED' });
    await ev('evt_x_credit', 'exchange.credited', { exchangeId: 'EXG-4', externalOrderId: 'WEB-105-X1', amount: '650' });
    await ev('evt_x_cancel', 'exchange.cancelled', { exchangeId: 'EXG-5', externalOrderId: 'WEB-106-X1', amount: '0' });
    await applyErpEvents(f.deps());
    const before = await shopBalance(f.storeB);
    await syncErpAccount(f.deps(), { storeId: f.storeB });
    const x = (await entriesOf(f.storeB)).filter((e) => e.kind.startsWith('EXCHANGE_'));
    expect(x.map((e) => [e.kind, Number(e.amountMinor), e.exchangeId])).toEqual([
      ['EXCHANGE_EXTRA', 5000, 'EXG-1'],
      ['EXCHANGE_ADJUSTMENT', -3000, 'EXG-2'],
      ['EXCHANGE_BILL', 70000, 'EXG-4'],
      ['EXCHANGE_CREDIT', -65000, 'EXG-4'],
    ]);
    expect((await shopBalance(f.storeB)) - before).toBe(5000 - 3000 + 70000 - 65000);
  });

  it('PR 615 · follow-up 490: a lost payment.recorded webhook is caught up from GET /account; the late webhook makes no second entry; a lost hold is caught up too', async () => {
    const practice = f.world.v6(f.company(f.storeA));
    f.clock.now = new Date('2026-11-08T05:00:00Z');
    const pay = practice.recordPayment(500, { reference: 'BANK-0001', date: '2026-11-08' });
    practice.hold('No payment for 31 days');
    const lost = await f.deliverAll(f.storeA, { drop: true });
    expect(lost).toBe(2);
    const r = await checkErpAccount(f.deps(), { storeId: f.storeA });
    expect(r).toMatchObject({ status: 'ok', caughtUp: 1, onHold: true });
    const payments = (await entriesOf(f.storeA)).filter((e) => e.kind === 'PAYMENT');
    expect(payments.map((e) => [e.eventId, Number(e.amountMinor), e.paymentRef, e.source, e.businessDate.toISOString().slice(0, 10)])).toEqual([[pay.eventId, -50000, 'BANK-0001', 'PULL', '2026-11-08']]);
    const link = await f.linkOf(f.storeA);
    const state = await f.t.prisma.erpAccountState.findUniqueOrThrow({ where: { linkId: link.id } });
    expect([state.onHold, state.reason, Number(state.balanceMinor), state.heldAt?.getTime()]).toEqual([true, 'No payment for 31 days', (practice.balance()) * 100, f.clock.now.getTime()]);
    // The webhook comes after all (the ERP retries): stored once, no second entry.
    const integ = await f.t.prisma.integration.findFirstOrThrow({ where: { storeId: f.storeA, kind: 'ERP' } });
    await recordErpEvent(f.deps(), { integrationId: integ.id, storeId: f.storeA, linkId: link.id, source: 'WEBHOOK', event: { eventId: pay.eventId, type: 'payment.recorded', occurredAt: new Date(pay.occurredAt), date: pay.date, reverses: null, data: pay.data } });
    await applyErpEvents(f.deps());
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    expect((await entriesOf(f.storeA)).filter((e) => e.kind === 'PAYMENT')).toHaveLength(1);
    expect(await shopBalance(f.storeA)).toBe(await erpBalance(f.storeA));
    // The hold is released in the ERP and that webhook is lost too: the next check sees it.
    f.clock.now = new Date('2026-11-08T07:00:00Z');
    practice.release();
    await f.deliverAll(f.storeA, { drop: true });
    expect(await checkErpAccount(f.deps(), { storeId: f.storeA })).toMatchObject({ status: 'ok', onHold: false, caughtUp: 0 });
    const after = await f.t.prisma.erpAccountState.findUniqueOrThrow({ where: { linkId: link.id } });
    expect([after.onHold, after.releasedAt?.getTime()]).toEqual([false, f.clock.now.getTime()]);
  });

  it('PR 615: "paid to ERP" is recorded by Accounts or the owner only, sends nothing to the ERP, and is matched to the ERP payment (amount, ±2 days, reference)', async () => {
    const reader = await f.staff(['erp.account.read'], f.storeA, 'reader');
    const accounts = await f.staff(['erp.account.read', 'erp.payments.record'], f.storeA, 'accounts');
    const input = { paidOn: '2026-11-09', amountMinor: 50000, method: 'BANK', reference: 'BANK-0001', note: 'sample transfer' };
    await expect(recordErpPayment(f.deps(), f.who(reader, f.storeA), input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const calls = f.world.calls.length;
    const rec = await recordErpPayment(f.deps(), f.who(accounts, f.storeA), input);
    expect(f.world.calls.length).toBe(calls);
    const stray = await recordErpPayment(f.deps(), f.who(accounts, f.storeA), { paidOn: '2026-11-09', amountMinor: 30000, method: 'CASH', reference: null, note: null });
    const link = await f.linkOf(f.storeA);
    let m = await paymentMatch(f.deps(), link);
    expect(m.matched.map((p) => [p.recordId, p.entryEventId])).toEqual([[rec.id, (await entriesOf(f.storeA)).find((e) => e.kind === 'PAYMENT')!.eventId]]);
    expect(m.shopOnly.map((p) => p.recordId)).toEqual([stray.id]);
    expect(m.erpOnly).toEqual([]);
    // A wrong record is put right by a reversing record (never edited); it cannot be reversed twice.
    const rev = await reverseErpPayment(f.deps(), f.who(accounts, f.storeA), stray.id, { reason: 'typed twice by mistake' });
    expect([Number(rev.amountMinor), rev.reversesId]).toEqual([-30000, stray.id]);
    await expect(reverseErpPayment(f.deps(), f.who(accounts, f.storeA), stray.id, { reason: 'again' })).rejects.toMatchObject({ code: 'ALREADY' });
    m = await paymentMatch(f.deps(), link);
    expect(m.shopOnly).toEqual([]);
    // The records are append-only at the database.
    await expect(f.t.prisma.erpPaymentRecord.update({ where: { id: rec.id }, data: { amountMinor: 1n } })).rejects.toThrow(/append-only/);
    // Another store's staff cannot record on this store.
    const other = await f.staff(['erp.payments.record'], f.storeB, 'other');
    await expect(recordErpPayment(f.deps(), f.who(other, f.storeA), input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('PR 615: the ledger is append-only at the database and its hash chain shows any change', async () => {
    const link = await f.linkOf(f.storeA);
    const first = (await entriesOf(f.storeA))[0]!;
    await expect(f.t.prisma.erpAccountEntry.update({ where: { id: first.id }, data: { amountMinor: 1n } })).rejects.toThrow(/append-only/);
    await expect(f.t.prisma.erpAccountEntry.delete({ where: { id: first.id } })).rejects.toThrow(/append-only/);
    expect(await verifyAccountChain(f.t.prisma, link.id)).toMatchObject({ ok: true });
    // Someone with the database's own powers changes a number behind the shop's back: the chain names the entry.
    await f.t.prisma.$executeRawUnsafe('ALTER TABLE "ErpAccountEntry" DISABLE TRIGGER "ErpAccountEntry_append_only"');
    await f.t.prisma.$executeRawUnsafe(`UPDATE "ErpAccountEntry" SET "amountMinor" = 1 WHERE "id" = '${first.id}'`);
    expect(await verifyAccountChain(f.t.prisma, link.id)).toEqual({ ok: false, seq: 1, why: 'HASH', entries: expect.any(Number) });
    await f.t.prisma.$executeRawUnsafe(`UPDATE "ErpAccountEntry" SET "amountMinor" = ${first.amountMinor} WHERE "id" = '${first.id}'`);
    await f.t.prisma.$executeRawUnsafe('ALTER TABLE "ErpAccountEntry" ENABLE TRIGGER "ErpAccountEntry_append_only"');
    expect(await verifyAccountChain(f.t.prisma, link.id)).toMatchObject({ ok: true });
  });

  it('PR 615: partial delivery, a courier correction, a Hold parcel resolved (one kept) and a missing parcel move the pieces from the shop\'s own records', async () => {
    const billedAt = new Date('2026-11-10T06:00:00Z');
    await f.placeAndShip(f.storeA, 'WEB-110', [f.line('WEB-110-1', 'POLO-NAVY-M', 990), f.line('WEB-110-2', 'POLO-NAVY-L', 1090), f.line('WEB-110-3', 'TEE-WHITE-M', 690)]);
    await f.placeAndShip(f.storeA, 'WEB-111', [f.line('WEB-111-1', 'POLO-NAVY-M', 990)]);
    await f.shopOrder(f.storeA, 'WEB-110', [{ lineId: 'WEB-110-1', sku: 'POLO-NAVY-M', shopPrice: 650 }, { lineId: 'WEB-110-2', sku: 'POLO-NAVY-L', shopPrice: 700 }, { lineId: 'WEB-110-3', sku: 'TEE-WHITE-M', shopPrice: 450 }], billedAt);
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    const link = await f.linkOf(f.storeA);
    // PARTIAL: the ERP's identification (GREEN) says line 2 was kept; the others come back.
    await f.shopDelivery(f.storeA, 'WEB-110', 'PARTIAL', new Date('2026-11-11T08:00:00Z'), { answerKept: ['WEB-110-2'], identification: 'GREEN' });
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    const states = async () => Object.fromEntries((await f.t.prisma.erpPipelinePiece.findMany({ where: { linkId: link.id, externalOrderId: 'WEB-110' } })).map((p) => [p.lineId, p.state]));
    expect(await states()).toEqual({ 'WEB-110-1': 'RETURNING', 'WEB-110-2': 'DELIVERED', 'WEB-110-3': 'RETURNING' });
    expect((await pipelineOn(f.t.prisma, link.id, '2026-11-11')).totalMinor).toBe(65000 + 45000);
    // The courier corrects it: the customer kept line 3 as well.
    await f.shopDelivery(f.storeA, 'WEB-110', 'PARTIAL', new Date('2026-11-11T12:00:00Z'), { answerKept: ['WEB-110-2', 'WEB-110-3'], identification: 'GREEN' });
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    expect(await states()).toEqual({ 'WEB-110-1': 'RETURNING', 'WEB-110-2': 'DELIVERED', 'WEB-110-3': 'DELIVERED' });
    // The returned piece is handed back on a Hold parcel; the owner's tick says it never came back (the customer kept it).
    await f.shopHandBack(f.storeA, 'RL-110', '2026-11-12', [{ ext: 'WEB-110', received: 1, result: 'HOLD' }]);
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    expect((await states())['WEB-110-1']).toBe('WAITING_CHECK');
    const integ = await f.t.prisma.integration.findFirstOrThrow({ where: { storeId: f.storeA, kind: 'ERP' } });
    await recordErpEvent(f.deps(), { integrationId: integ.id, storeId: f.storeA, linkId: link.id, source: 'PULL', event: { eventId: 'evt_resolved_110', type: 'return.parcel.resolved', occurredAt: f.clock.now, date: '2026-11-13', reverses: null, data: { externalOrderId: 'WEB-110', result: 'RESOLVED', pieces: [] } } });
    await applyErpEvents(f.deps());
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    expect((await states())['WEB-110-1']).toBe('DELIVERED');
    expect((await pipelineOn(f.t.prisma, link.id, '2026-11-13')).totalMinor).toBe(0);
    expect((await pipelineOn(f.t.prisma, link.id, '2026-11-12')).waitingCheckMinor).toBe(65000);
    // A parcel lost on the way back: PARCEL_MISSING makes its pieces Retail's loss.
    await f.shopOrder(f.storeA, 'WEB-111', [{ lineId: 'WEB-111-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], billedAt);
    await f.shopDelivery(f.storeA, 'WEB-111', 'RETURNED', new Date('2026-11-11T08:00:00Z'));
    await f.shopHandBack(f.storeA, 'RL-111', '2026-11-12', [{ ext: 'WEB-111', received: 0, result: 'HOLD' }]);
    await recordErpEvent(f.deps(), { integrationId: integ.id, storeId: f.storeA, linkId: link.id, source: 'PULL', event: { eventId: 'evt_resolved_111', type: 'return.parcel.resolved', occurredAt: f.clock.now, date: '2026-11-14', reverses: null, data: { externalOrderId: 'WEB-111', result: 'PARCEL_MISSING', pieces: [] } } });
    await applyErpEvents(f.deps());
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    expect((await f.t.prisma.erpPipelinePiece.findFirstOrThrow({ where: { linkId: link.id, lineId: 'WEB-111-1' } })).state).toBe('DECLINED');
  });

  it('PR 615: the opening balance at the switch and the switch transfer are written once; the balance counts the opening from its day', async () => {
    const link = await f.linkOf(f.storeB);
    expect(await importOpeningBalance(f.deps(), { storeId: f.storeB, amountMinor: 1_250_000, date: '2026-11-01' })).toMatchObject({ created: true });
    await expect(importOpeningBalance(f.deps(), { storeId: f.storeB, amountMinor: 1, date: '2026-11-01' })).rejects.toMatchObject({ code: 'ALREADY' });
    expect(await recordSwitchTransfer(f.deps(), { storeId: f.storeB, switchDate: '2026-11-01', amountMinor: 230_000, reference: 'SWITCH-LIST-1' })).toMatchObject({ created: true });
    expect(await recordSwitchTransfer(f.deps(), { storeId: f.storeB, switchDate: '2026-11-01', amountMinor: 230_000, reference: 'SWITCH-LIST-1' })).toMatchObject({ created: false });
    expect(await balanceOn(f.t.prisma, link, '2026-10-31')).toEqual({ startMinor: 0, endMinor: 0 });
    expect(await balanceOn(f.t.prisma, link, '2026-11-01')).toEqual({ startMinor: 1_250_000, endMinor: 1_480_000 });
  });

  it("CN-029 §16: store B's events never reach store A's ledger; A's reader sees only A; a row can never sit on another store's link", async () => {
    await f.placeAndShip(f.storeB, 'WEB-B1', [f.line('WEB-B1-1', 'POLO-NAVY-M', 990)]);
    await f.shopOrder(f.storeB, 'WEB-B1', [{ lineId: 'WEB-B1-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], new Date('2026-11-15T06:00:00Z'));
    const pb = f.world.v6(f.company(f.storeB));
    pb.recordPayment(100, { reference: 'B-PAY-1', date: '2026-11-15' });
    await f.deliverAll(f.storeB);
    const beforeA = (await entriesOf(f.storeA)).length;
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    expect((await entriesOf(f.storeA)).length).toBe(beforeA);
    await syncErpAccount(f.deps(), { storeId: f.storeB });
    const b = await entriesOf(f.storeB);
    expect(b.every((e) => e.storeId === f.storeB)).toBe(true);
    expect(b.map((e) => e.kind)).toEqual(expect.arrayContaining(['BILL', 'PAYMENT', 'SWITCH_TRANSFER', 'EXCHANGE_BILL']));
    // A's reader with only store A's role reads A's ledger; asking for store B is refused.
    const readerA = await f.staff(['erp.account.read'], f.storeA, 'readerA');
    const pageA = await accountEntries(f.deps(), f.who(readerA, f.storeA), {});
    expect(pageA.rows.every((r) => r.storeId === f.storeA)).toBe(true);
    await expect(accountEntries(f.deps(), f.who(readerA, f.storeB), {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // The database itself refuses an entry of store B on store A's link (composite foreign key).
    const linkA = await f.linkOf(f.storeA);
    await expect(
      f.t.prisma.erpAccountEntry.create({ data: { storeId: f.storeB, linkId: linkA.id, seq: 999, kind: 'BILL', eventId: 'x', businessDate: day('2026-11-15'), amountMinor: 1n, source: 'MANUAL', hash: 'x' } }),
    ).rejects.toThrow();
    // Both stores' balances still equal their own ERP company's.
    expect(await shopBalance(f.storeA)).toBe(await erpBalance(f.storeA));
    const ov = await accountOverview(f.deps(), f.who(readerA, f.storeA));
    expect(ov).toMatchObject({ model: 'v6', balanceMinor: await erpBalance(f.storeA), chain: { ok: true } });
    expect(BooksError).toBeTypeOf('function');
  });
});
