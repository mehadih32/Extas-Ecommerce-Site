// CN-028 · PR 613 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the Returns section on ERP contract v6.
// The courier's parcels are handed back (PR 612), the owner checks every piece in the ERP and the shop reads what the
// ERP decided: the seven tabs, one parcel's timeline (delivery result and colour, the return list, the owner's tick,
// each piece's decision), the losses at the price paid, the courier claims, the countdown to the owner's check, and the
// nightly compare with `GET /returns/summary?date=` — a difference is fixed by pulling again, never by editing a number.
// Store A's rows never reach store B. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { movePipelinePieces, storeDate } from '@extas/inventory';
import { orderStep } from './commands';
import {
  closeHandbackList,
  compareReturns,
  latestReturnsCompare,
  openHandbackList,
  parcelTimeline,
  pullAndCompareReturns,
  returnsClaims,
  returnsErpOverview,
  returnsLosses,
  runErpReturns,
  scanHandbackParcel,
  systemBy,
} from './index';
import { setUpErpOrders, type ErpFixture, type ShippedOrder } from './test/erp-v6-fixture';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 613 · the Returns section on the ERP (PostgreSQL, ERP contract v6)', () => {
  let f: ErpFixture;
  const db = () => f.t.prisma;
  const d = () => f.erpDeps();
  const today = () => storeDate(f.clock.now, 'Asia/Dhaka');
  const erp = () => f.world.v6('SAMPLE-CO-1');
  /** The billed pieces the books (PR 615) would have made, on their way back. */
  const pieces = async (o: ShippedOrder) => {
    const linkId = await f.linkId();
    for (const lineId of o.lineIds)
      await db().erpPipelinePiece.create({ data: { storeId: f.S, linkId, orderId: o.orderId, externalOrderId: o.ext, lineId, sku: 'SAMPLE', buyingPriceMinor: 90_000, state: 'RETURNING', billedOn: new Date(`${today()}T00:00:00Z`), stateDate: new Date(`${today()}T00:00:00Z`) } });
  };
  const handBack = async (parcels: { o: ShippedOrder; count: number; note?: string }[]) => {
    const list = await openHandbackList(d(), f.staff, { courier: 'pathao', handedBackAt: today() });
    for (const p of parcels) await scanHandbackParcel(d(), f.staff, list.id, { code: p.o.consignmentId, receivedCount: p.count, ...(p.note ? { note: p.note } : {}) });
    return closeHandbackList(d(), f.staff, list.id);
  };
  let one: ShippedOrder;
  let two: ShippedOrder;
  let declineEvent = '';

  beforeAll(async () => {
    f = await setUpErpOrders('returns_erp');
    for (const id of Object.values(f.v)) f.world.setStock(await f.sku(id), 'SAMPLE-WH-1', { onHand: 50 });
  });
  afterAll(async () => {
    f?.restore();
    await f?.t.drop();
  });

  it('a store still on v5 has no ERP returns: the section says so and reads nothing', async () => {
    const v = await returnsErpOverview(d(), f.staff, { tab: 'handedBack' });
    expect(v.model).toBe('v5');
    expect(v.rows).toEqual([]);
    expect(await code(pullAndCompareReturns(d(), f.staff))).toBe('ERP_MODEL');
    expect(await code(returnsErpOverview(d(), f.staff, { tab: 'nope' }))).toBe('INVALID_INPUT');
    expect(await code(returnsErpOverview(d(), f.reader))).toBe('FORBIDDEN');
    expect(await code(returnsLosses(d(), f.reader))).toBe('FORBIDDEN');
  });

  it('handed back, in Return stock with the countdown, then the owner`s check: approved and declined (our loss), the claim, the compare', async () => {
    f.v6();
    one = await f.shipped('re-one', [{ variantId: f.v.skyM, quantity: 2 }]);
    two = await f.shipped('re-two');
    await f.returned(one);
    await f.returned(two);
    await pieces(one);
    await pieces(two);
    const sent = await handBack([{ o: one, count: 2 }, { o: two, count: 1 }]);
    expect(sent.status).toBe('ACCEPTED');

    let v = await returnsErpOverview(d(), f.staff, { tab: 'handedBack' });
    expect(v.model).toBe('v6');
    expect(v.checkDays).toBe(7);
    expect(v.counts).toMatchObject({ handedBack: 2, hold: 0, returnStock: 3, approved: 0, declined: 0 });
    expect(v.rows.map((r) => r.externalOrderId).sort()).toEqual([one.ext, two.ext].sort());
    expect(v.rows.find((r) => r.externalOrderId === one.ext)).toMatchObject({ state: 'IN_RETURN_STOCK', pieces: 2, courier: 'PATHAO' });

    v = await returnsErpOverview(d(), f.staff, { tab: 'returnStock' });
    expect(v.rows).toHaveLength(3);
    const due = new Date(Date.parse(`${today()}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    for (const r of v.rows) expect(r).toMatchObject({ dueOn: due, daysLeft: 7, handedBackAt: today() });
    expect(v.rows.find((r) => r.lineId === one.lineIds[0])).toMatchObject({ orderId: one.orderId, valueMinor: 90_000 });

    // the owner checks two pieces in the ERP; the shop knows only once it pulls
    erp().decidePiece(one.ext, one.lineIds[0]!, 'APPROVED');
    declineEvent = erp().decidePiece(one.ext, one.lineIds[1]!, 'DECLINED', 'STAIN_OR_DAMAGE')[0]!.eventId;
    const stale = await compareReturns(d(), f.S, today(), 'manual');
    expect(stale.matched).toBe(false);
    expect(stale.differences.map((x) => x.field).sort()).toEqual(['approved', 'approvedCreditMinor', 'declined', 'inReturnStock', 'waitingCheckMinor']);
    // a difference is never fixed by editing: the compare history cannot be changed
    expect(await code(db().erpReturnsCompare.update({ where: { id: stale.id }, data: { matched: true } }))).not.toBe('ok');

    const fixed = await pullAndCompareReturns(d(), f.staff, { date: today() });
    expect(fixed.matched).toBe(true);
    expect(fixed.trigger).toBe('pull');
    expect(fixed.shop).toMatchObject({ handedBack: 3, onHold: 0, inReturnStock: 1, approved: 1, approvedCreditMinor: 90_000, declined: 1, waitingCheckMinor: 90_000 });
    expect((await latestReturnsCompare(d(), f.staff))!.id).toBe(fixed.id);

    v = await returnsErpOverview(d(), f.staff, { tab: 'approved' });
    expect(v.counts).toMatchObject({ returnStock: 1, approved: 1, declined: 1 });
    expect(v.rows).toEqual([expect.objectContaining({ lineId: one.lineIds[0], state: 'APPROVED', creditMinor: 90_000, decidedAt: today() })]);
    v = await returnsErpOverview(d(), f.staff, { tab: 'declined' });
    expect(v.rows).toEqual([expect.objectContaining({ lineId: one.lineIds[1], state: 'DECLINED', reason: 'STAIN_OR_DAMAGE', valueMinor: 90_000, claim: true })]);

    const claims = await returnsClaims(d(), f.staff);
    expect(claims.claims).toEqual([expect.objectContaining({ externalOrderId: one.ext, lineId: one.lineIds[1], reason: 'STAIN_OR_DAMAGE', status: 'OPEN', valueMinor: 90_000, orderId: one.orderId })]);

    const t = (await parcelTimeline(d(), f.staff, one.consignmentId))!;
    expect(t.externalOrderId).toBe(one.ext);
    expect(t.orderId).toBe(one.orderId);
    const kinds = t.items.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['delivery', 'handedBack', 'erpAnswer', 'decided', 'courierClaim']));
    expect(t.items.find((i) => i.kind === 'delivery')).toMatchObject({ result: 'RETURNED', colour: 'GREEN' });
    expect(t.items.find((i) => i.kind === 'erpAnswer')).toMatchObject({ result: 'IN_RETURN_STOCK', returnListId: sent.returnListId, consignmentId: one.consignmentId });
    expect(t.items.filter((i) => i.kind === 'decided').map((i) => i.decision).sort()).toEqual(['APPROVED', 'DECLINED']);
    expect(t.pieces.map((p) => p.state).sort()).toEqual(['APPROVED', 'DECLINED']);
  });

  it('a decision reversed in the ERP: the piece moves, the claim is kept as reversed, the timeline shows both', async () => {
    erp().reverseDecision(declineEvent, 'APPROVED');
    const c = await pullAndCompareReturns(d(), f.staff, { date: today() });
    expect(c.matched).toBe(true);
    expect(c.shop).toMatchObject({ approved: 2, approvedCreditMinor: 180_000, declined: 0 });
    expect((await returnsErpOverview(d(), f.staff, { tab: 'declined' })).rows).toEqual([]);
    expect((await returnsClaims(d(), f.staff)).claims[0]).toMatchObject({ status: 'REVERSED' });
    const t = (await parcelTimeline(d(), f.staff, one.ext))!;
    const decided = t.items.filter((i) => i.kind === 'decided' && i.lineId === one.lineIds[1]);
    expect(decided.map((i) => [i.decision, i.reversed])).toEqual([
      ['DECLINED', true],
      ['APPROVED', false],
    ]);
  });

  it('a parcel on Hold until the owner ticks it: the pieces that came back go to Return stock, the kept one is no loss', async () => {
    const o = await f.shipped('re-hold', [{ variantId: f.v.whiteM, quantity: 2 }]);
    const price = (await db().erpOrderLine.findFirstOrThrow({ where: { erpOrderId: o.erpOrderId } })).customerPriceMinor / 100;
    // the courier collected an amount no set of pieces explains: the ERP cannot identify it (ORANGE)
    await f.push({ type: 'order.delivery', externalOrderId: o.ext, body: { status: 'PARTIAL', courier: 'PATHAO', consignmentId: o.consignmentId, collected: price + 400, at: f.clock.now.toISOString() } });
    await orderStep(d(), { storeId: f.S, orderId: o.orderId }, systemBy('test'), 'returned');
    await pieces(o);
    const sent = await handBack([{ o, count: 2 }]);
    expect(sent.parcels[0]).toMatchObject({ result: 'HOLD', expectedCount: 2 });
    let v = await returnsErpOverview(d(), f.staff, { tab: 'hold' });
    expect(v.rows).toEqual([expect.objectContaining({ externalOrderId: o.ext, state: 'HOLD', pieces: 2, daysLeft: 7 })]);
    const held = await compareReturns(d(), f.S, today(), 'manual');
    expect(held.differences).toEqual([]);
    expect(held.shop).toMatchObject({ onHold: 2, waitingCheckMinor: 90_000 + 180_000 });

    const resolved = erp().resolveHold(o.ext, [o.lineIds[0]!]);
    const c = await pullAndCompareReturns(d(), f.staff, { date: today() });
    expect(c.differences).toEqual([]);
    // the piece the customer kept was delivered after all: not a decision, not a loss
    expect(c.shop).toMatchObject({ onHold: 0, inReturnStock: 2, declined: 0, waitingCheckMinor: 180_000 });
    v = await returnsErpOverview(d(), f.staff, { tab: 'hold' });
    expect(v.rows).toEqual([]);
    expect((await returnsErpOverview(d(), f.staff, { tab: 'declined' })).rows).toEqual([]);
    v = await returnsErpOverview(d(), f.staff, { tab: 'returnStock' });
    expect(v.rows.find((r) => r.lineId === o.lineIds[0])).toMatchObject({ externalOrderId: o.ext, state: 'IN_RETURN_STOCK', daysLeft: 7 });
    const t = (await parcelTimeline(d(), f.staff, o.ext))!;
    expect(t.items.find((i) => i.kind === 'delivery')).toMatchObject({ result: 'PARTIAL', colour: 'ORANGE' });
    expect(t.items.find((i) => i.kind === 'ownerTick')).toMatchObject({ result: 'RESOLVED', eventId: resolved.eventId, pieces: 1 });
    expect((await returnsErpOverview(d(), f.staff, { tab: 'partial' })).rows).toEqual([expect.objectContaining({ externalOrderId: o.ext, colour: 'ORANGE' })]);
  });

  it('the losses report: declined pieces at the price paid by reason and month, billed exchanges, delivery charges, underpayments', async () => {
    const o = await f.shipped('re-loss');
    await f.returned(o);
    await pieces(o);
    await handBack([{ o, count: 1 }]);
    erp().decidePiece(o.ext, o.lineIds[0]!, 'DECLINED', 'B_GRADE');
    await pullAndCompareReturns(d(), f.staff, { date: today() });
    // the courier's charge of two returned parcels is the shop's loss
    await db().shipment.updateMany({ where: { orderId: { in: [o.orderId, two.orderId] } }, data: { status: 'RETURNED', chargeMinor: 6_000, returnedAt: f.clock.now } });
    // a delivered parcel paid short: a discount promised by phone and 50 taka the courier did not collect
    const paid = await f.shipped('re-short');
    await f.delivered(paid);
    await db().shipment.updateMany({ where: { orderId: paid.orderId }, data: { codAmountMinor: 110_000 } });
    await db().erpDeliveryResult.create({ data: { storeId: f.S, erpOrderId: paid.erpOrderId, outcome: 'DELIVERED', courier: 'PATHAO', consignmentId: paid.consignmentId, collectedMinor: 100_000n, discountGivenMinor: 5_000n, phoneConfirmed: true, at: f.clock.now } });

    const l = await returnsLosses(d(), f.staff);
    expect(l.months).toHaveLength(6);
    const m = l.months.find((x) => x.month === today().slice(0, 7))!;
    expect(m.declined).toMatchObject({ count: 1, valueMinor: 90_000, unknownValue: 0 });
    expect(m.declined.byReason).toEqual({ B_GRADE: { count: 1, valueMinor: 90_000 } });
    expect(m.deliveryCharges).toEqual({ count: 2, valueMinor: 12_000, unknownValue: 0 });
    expect(m.underpaid).toEqual({ count: 1, valueMinor: 10_000 });
    expect(m.exchangeBilledMinor).toBe(0);
    expect(m.totalMinor).toBe(90_000 + 12_000 + 10_000);
    expect(l.totals.totalMinor).toBe(m.totalMinor);
    f.perStore.set(`returns.losses.months@${f.S}`, 3);
    expect((await returnsLosses(d(), f.staff)).months).toHaveLength(3);
    f.perStore.delete(`returns.losses.months@${f.S}`);
  });

  it('the count that differed at the desk is on the claims list with its note', async () => {
    const o = await f.shipped('re-short-count', [{ variantId: f.v.linenM, quantity: 2 }]);
    await f.returned(o);
    await pieces(o);
    await handBack([{ o, count: 1, note: 'one piece missing from the bag' }]);
    const c = await returnsClaims(d(), f.staff);
    expect(c.countDiffers).toEqual([expect.objectContaining({ externalOrderId: o.ext, orderId: o.orderId, expectedCount: 2, receivedCount: 1, note: 'one piece missing from the bag' })]);
  });

  it('the ERP cannot be asked: the compare is kept as not matched with the reason', async () => {
    f.world.failNext({ path: '/returns/summary', network: true, times: 4 });
    const c = await compareReturns(d(), f.S, today(), 'manual');
    expect(c.matched).toBe(false);
    expect(c.error).toBeTruthy();
    expect(c.erp).toBeNull();
  });

  it('every night after the set time, yesterday is compared once (and pulled again when it differs)', async () => {
    const start = f.clock.now;
    // 01:00 in Dhaka: too early
    f.clock.now = new Date(`${storeDate(start, 'Asia/Dhaka', 1)}T01:00:00+06:00`);
    expect((await runErpReturns(d(), f.S)).compare).toBeNull();
    f.clock.now = new Date(`${storeDate(start, 'Asia/Dhaka', 1)}T01:20:00+06:00`);
    // the owner checked a piece after midnight that the shop has not pulled yet: the night's compare differs, so the
    // job pulls again and compares again
    erp().decidePiece(two.ext, two.lineIds[0]!, 'APPROVED');
    const r = await runErpReturns(d(), f.S);
    expect(r.status).toBe('ok');
    expect(r.compare).toMatchObject({ date: storeDate(start, 'Asia/Dhaka'), matched: true, trigger: 'pull' });
    const night = await db().erpReturnsCompare.findFirstOrThrow({ where: { storeId: f.S, trigger: 'night' } });
    expect(night.matched).toBe(false);
    expect(night.differences).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'inReturnStock' })]));
    expect((await runErpReturns(d(), f.S)).compare).toBeNull();
    expect(await db().erpReturnsCompare.count({ where: { storeId: f.S, trigger: 'night', date: new Date(`${storeDate(start, 'Asia/Dhaka')}T00:00:00Z`) } })).toBe(1);
    f.clock.now = start;
  });

  it('CN-029 §16: store B sees none of store A`s returns, claims, losses or timelines', async () => {
    f.v6(f.B);
    for (const tab of ['partial', 'handedBack', 'hold', 'returnStock', 'exchanges', 'approved', 'declined'] as const) expect((await returnsErpOverview(d(), f.staffB, { tab })).rows).toEqual([]);
    expect(await parcelTimeline(d(), f.staffB, one.consignmentId)).toBeNull();
    expect(await parcelTimeline(d(), f.staffB, one.ext)).toBeNull();
    const c = await returnsClaims(d(), f.staffB);
    expect(c.claims).toEqual([]);
    expect(c.countDiffers).toEqual([]);
    expect((await returnsLosses(d(), f.staffB)).totals.totalMinor).toBe(0);
    expect(await latestReturnsCompare(d(), f.staffB)).toBeNull();
  });
  // last: its pieces moved by hand are not the ERP's, so the compares above stay as they are
  it('qa-gate: two writers move the same piece at once — one move, never two, and never from a stale state', async () => {
    const o = await f.shipped('re-race');
    await pieces(o);
    const linkId = await f.linkId();
    const date = new Date(`${today()}T00:00:00Z`);
    const move = (to: 'WAITING_CHECK' | 'APPROVED', cause: string) => movePipelinePieces(db(), { storeId: f.S, linkId, lineIds: o.lineIds, to, businessDate: date, cause });
    // the same fact twice at once (the job and the desk): one move
    const same = await Promise.all([move('WAITING_CHECK', 'race:1'), move('WAITING_CHECK', 'race:1')]);
    expect(same.reduce((a, b) => a + b, 0)).toBe(1);
    // two facts at once to the same place: the second sees the piece already there
    const two = await Promise.all([move('APPROVED', 'race:2'), move('APPROVED', 'race:3')]);
    expect(two.reduce((a, b) => a + b, 0)).toBe(1);
    const moves = await db().erpPipelineMove.findMany({ where: { piece: { lineId: o.lineIds[0]!, linkId } }, orderBy: { createdAt: 'asc' } });
    expect(moves.map((m) => [m.fromState, m.toState])).toEqual([
      ['RETURNING', 'WAITING_CHECK'],
      ['WAITING_CHECK', 'APPROVED'],
    ]);
    expect((await db().erpPipelinePiece.findFirstOrThrow({ where: { lineId: o.lineIds[0]!, linkId } })).state).toBe('APPROVED');
  });
});
