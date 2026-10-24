// S07 · PR 166 — Cash on Delivery after the door on a real PostgreSQL (throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL). The acceptance tests of the simulation findings:
// - SIM-F-001: the door amount equals the amount due for a COD, a fully prepaid and a part-paid order.
// - SIM-F-005: a partial delivery (waiting for our approval), a return with the delivery charge paid and a failed
//   attempt, each with its money; one closing outcome per parcel.
// - SIM-F-028: a courier statement file flags all five traps of plan §6.3 with reason codes (a charge-paid return marked
//   delivered, a partial, a parcel we do not know, a double deduction, a late settlement), measures the days to settle,
//   lists a delivered parcel missing from every statement, and shows cash in transit; the same file twice is one
//   statement. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { codPosition, decidePartial, importSettlement, orderMoney, recordDoorOutcome, resolveLine } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const DAY = 86_400_000;
const PAIR = [85_000, 85_000]; // hardcode-ok: test fixture, made-up line amounts (two pieces of ৳850)

describe.skipIf(!HAS_TEST_DB)('PR 166 · Cash on Delivery after the door', () => {
  let f: PaymentsFixture;
  let n = 0;
  const key = () => `door-key-${(n += 1).toString().padStart(4, '0')}`;
  const door = (orderId: string, input: Record<string, unknown>) => recordDoorOutcome(f.deps(), f.staff, orderId, input, { idempotencyKey: key() });
  const itemsOf = async (orderId: string) => (await f.t.prisma.orderItem.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' }, select: { id: true } })).map((x) => x.id);

  beforeAll(async () => {
    f = await setUpPayments('payments_166');
  });
  afterAll(async () => f?.t.drop());

  describe('SIM-F-001 · the door amount is the amount due', () => {
    it('COD: the whole due; fully prepaid: nothing; part-paid: the rest', async () => {
      const cod = await f.order({ number: 'C-1001', lines: PAIR, deliveryChargeMinor: 6_000 });
      const prepaid = await f.order({ number: 'C-1002', lines: PAIR, deliveryChargeMinor: 6_000, paymentMethod: 'BKASH', paidMinor: 176_000 });
      const part = await f.order({ number: 'C-1003', lines: PAIR, deliveryChargeMinor: 6_000, paidMinor: 6_000 });
      for (const [o, due] of [
        [cod, 176_000],
        [prepaid, 0],
        [part, 170_000],
      ] as const) {
        const m = (await orderMoney(f.deps(), f.staff, o.id))!;
        expect(m.codToCollectMinor).toBe(due);
        expect((await f.t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).codAmountMinor).toBe(due);
        const r = await door(o.id, { outcome: 'DELIVERED', collectedMinor: due });
        expect(r).toMatchObject({ expectedMinor: due, collectedMinor: due, varianceReason: null, state: 'RECORDED', moneyStatus: 'PROVISIONAL', replay: false });
      }
      // money taken from a customer who had already paid is never silent
      const paid2 = await f.order({ number: 'C-1004', paymentMethod: 'BKASH', paidMinor: 150_000 });
      expect(await door(paid2.id, { outcome: 'DELIVERED', collectedMinor: 150_000 })).toMatchObject({ expectedMinor: 0, varianceReason: 'PAID_ORDER_COLLECTED' });
      const m = (await orderMoney(f.deps(), f.staff, paid2.id))!;
      expect(m.mismatches).toEqual([expect.objectContaining({ kind: 'collection', reason: 'PAID_ORDER_COLLECTED', en: expect.any(String), bn: expect.any(String) })]);
    });

    it('needs the permission, the key, and a known order; one key is one record', async () => {
      const o = await f.order({ number: 'C-1010' });
      expect(await code(recordDoorOutcome(f.deps(), f.viewer, o.id, { outcome: 'DELIVERED', collectedMinor: 150_000 }, { idempotencyKey: 'door-view-01' }))).toBe('FORBIDDEN');
      expect(await code(recordDoorOutcome(f.deps(), f.staff, o.id, { outcome: 'DELIVERED', collectedMinor: 150_000 }))).toBe('INVALID_INPUT');
      expect(await code(door('00000000-0000-4000-8000-000000000000', { outcome: 'DELIVERED', collectedMinor: 1 }))).toBe('NOT_FOUND');
      const a = await recordDoorOutcome(f.deps(), f.staff, o.id, { outcome: 'DELIVERED', collectedMinor: 150_000 }, { idempotencyKey: 'door-same-01' });
      const b = await recordDoorOutcome(f.deps(), f.staff, o.id, { outcome: 'DELIVERED', collectedMinor: 150_000 }, { idempotencyKey: 'door-same-01' });
      expect(b).toMatchObject({ id: a.id, replay: true });
      expect(await code(recordDoorOutcome(f.deps(), f.staff, o.id, { outcome: 'DELIVERED', collectedMinor: 1 }, { idempotencyKey: 'door-same-01' }))).toBe('IDEMPOTENCY_MISMATCH');
      expect(await f.t.prisma.codCollection.count({ where: { orderId: o.id } })).toBe(1);
      expect(await f.t.prisma.auditLog.count({ where: { action: 'cod.record', entityId: a.id } })).toBe(1);
    });
  });

  describe('SIM-F-005 · every door outcome with its money', () => {
    it('a partial delivery waits for our approval, then counts as collected', async () => {
      const o = await f.order({ number: 'C-1101', lines: PAIR, deliveryChargeMinor: 6_000 });
      const [kept] = await itemsOf(o.id);
      expect(await code(door(o.id, { outcome: 'PARTIAL', collectedMinor: 91_000 }))).toBe('INVALID_INPUT');
      expect(await code(door(o.id, { outcome: 'PARTIAL', collectedMinor: 91_000, keptItemIds: await itemsOf(o.id) }))).toBe('INVALID_INPUT');
      const r = await door(o.id, { outcome: 'PARTIAL', collectedMinor: 91_000, keptItemIds: [kept] });
      expect(r).toMatchObject({ state: 'PENDING_APPROVAL', expectedMinor: 91_000, varianceReason: 'PARTIAL_DELIVERY', keptItemIds: [kept] });
      expect(r.returnedItemIds).toHaveLength(1);
      expect((await orderMoney(f.deps(), f.staff, o.id))!).toMatchObject({ cod: null, pill: 'COD_TO_COLLECT' });
      expect(await code(decidePartial(f.deps(), f.viewer, r.id, { decision: 'approve' }))).toBe('FORBIDDEN');
      const ok = await decidePartial(f.deps(), f.staff, r.id, { decision: 'approve', note: 'customer kept the first piece' });
      expect(ok).toMatchObject({ state: 'APPROVED', replay: false });
      expect(await decidePartial(f.deps(), f.staff, r.id, { decision: 'approve' })).toMatchObject({ state: 'APPROVED', replay: true });
      expect(await code(decidePartial(f.deps(), f.staff, r.id, { decision: 'reject' }))).toBe('NOT_PENDING');
      expect((await orderMoney(f.deps(), f.staff, o.id))!).toMatchObject({ cod: 'collected', pill: 'COD_COLLECTED' });
      expect(await f.t.prisma.auditLog.count({ where: { action: 'cod.partial.decide', entityId: r.id } })).toBe(1);
      // one closing outcome per parcel
      expect(await code(door(o.id, { outcome: 'DELIVERED', collectedMinor: 176_000 }))).toBe('ALREADY_RECORDED');
    });

    it('a rejected partial may be recorded again; with the approval switched off a partial is recorded at once', async () => {
      const o = await f.order({ number: 'C-1102', lines: PAIR, deliveryChargeMinor: 6_000 });
      const [kept] = await itemsOf(o.id);
      const r = await door(o.id, { outcome: 'PARTIAL', collectedMinor: 50_000, keptItemIds: [kept] });
      expect(r).toMatchObject({ state: 'PENDING_APPROVAL', varianceReason: 'SHORT_COLLECTED' });
      expect(await decidePartial(f.deps(), f.staff, r.id, { decision: 'reject', note: 'rider must bring the rest' })).toMatchObject({ state: 'REJECTED' });
      f.overrides.set('payments.cod', { partialNeedsApproval: false, toleranceMinor: 0, lateAfterDays: 0, missingAfterDays: 0 });
      try {
        expect(await door(o.id, { outcome: 'PARTIAL', collectedMinor: 91_000, keptItemIds: [kept] })).toMatchObject({ state: 'RECORDED', varianceReason: 'PARTIAL_DELIVERY' });
      } finally {
        f.overrides.delete('payments.cod');
      }
    });

    it('returned with the delivery charge paid: no goods money, the charge collected', async () => {
      const o = await f.order({ number: 'C-1103', lines: PAIR, deliveryChargeMinor: 6_000 });
      const r = await door(o.id, { outcome: 'RETURNED_CHARGE_PAID', collectedMinor: 0, chargeCollectedMinor: 6_000 });
      expect(r).toMatchObject({ expectedMinor: 0, chargeCollectedMinor: 6_000, varianceReason: 'CHARGE_PAID_RETURN', state: 'RECORDED' });
      expect(r.returnedItemIds).toHaveLength(2);
    });

    it('a failed attempt collects nothing and is followed by the next try; nothing after a closing outcome', async () => {
      const o = await f.order({ number: 'C-1104' });
      expect(await door(o.id, { outcome: 'ATTEMPT_FAILED', collectedMinor: 0, note: 'phone off' })).toMatchObject({ expectedMinor: 0, varianceReason: null });
      expect(await door(o.id, { outcome: 'ATTEMPT_FAILED', collectedMinor: 0 })).toMatchObject({ varianceReason: null });
      expect(await door(o.id, { outcome: 'DELIVERED', collectedMinor: 150_000 })).toMatchObject({ varianceReason: null });
      expect(await code(door(o.id, { outcome: 'ATTEMPT_FAILED', collectedMinor: 0 }))).toBe('ALREADY_RECORDED');
      const events = await f.t.prisma.orderEvent.findMany({ where: { orderId: o.id }, select: { type: true } });
      expect(events.map((e) => e.type)).toEqual(['cod.recorded', 'cod.recorded', 'cod.recorded']);
      // the order's status is not moved here (S08's courier steps do that)
      expect((await f.t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PLACED');
    });
  });

  describe('SIM-F-028 · the courier statement, the five traps, days to settle and cash in transit', () => {
    it('flags every trap with its reason, measures the days, lists the missing parcel and shows the cash', async () => {
      const now = f.clock.now;
      const ago = (days: number) => new Date(now.getTime() - days * DAY);
      const c = await f.courier('Sample courier');
      const other = await f.courier('Second courier');
      const order = (number: string) => f.order({ number, lines: PAIR, deliveryChargeMinor: 6_000 });
      // a parcel that fits
      const o1 = await order('S-2001');
      const s1 = await f.shipment(o1.id, { courierAccountId: c.id, consignmentId: 'CN-1', status: 'DELIVERED', chargeMinor: 6_000, deliveredAt: ago(4) });
      await door(o1.id, { outcome: 'DELIVERED', collectedMinor: 176_000, shipmentId: s1.id });
      // trap 1: we know it came back with the charge paid; the courier calls it delivered
      const o2 = await order('S-2002');
      const s2 = await f.shipment(o2.id, { courierAccountId: c.id, consignmentId: 'CN-2', status: 'RETURNED', chargeMinor: 6_000 });
      await door(o2.id, { outcome: 'RETURNED_CHARGE_PAID', collectedMinor: 0, chargeCollectedMinor: 6_000, shipmentId: s2.id });
      // trap 2: a partial nobody approved
      const o3 = await order('S-2003');
      await f.shipment(o3.id, { courierAccountId: c.id, consignmentId: 'CN-3', status: 'PARTIALLY_DELIVERED', chargeMinor: 6_000, deliveredAt: ago(3) });
      // trap 4: the charge deducted twice
      const o4 = await order('S-2004');
      await f.shipment(o4.id, { courierAccountId: c.id, consignmentId: 'CN-4', status: 'DELIVERED', chargeMinor: 6_000, deliveredAt: ago(2) });
      // a delivered parcel on no statement (missing), and the lost parcel still on the road
      const o5 = await order('S-2005');
      await f.shipment(o5.id, { courierAccountId: c.id, consignmentId: 'CN-5', status: 'DELIVERED', chargeMinor: 6_000, deliveredAt: ago(10) });
      // trap 5: paid two weeks after delivery
      const o6 = await order('S-2006');
      await f.shipment(o6.id, { courierAccountId: c.id, consignmentId: 'CN-6', status: 'DELIVERED', chargeMinor: 6_000, deliveredAt: ago(14) });
      const o7 = await f.order({ number: 'S-2007', lines: [270_000] });
      await f.shipment(o7.id, { courierAccountId: c.id, consignmentId: 'CN-7', status: 'OUT_FOR_DELIVERY' });
      const o8 = await order('S-2008');
      await f.shipment(o8.id, { courierAccountId: other.id, consignmentId: 'CN-8', status: 'IN_TRANSIT' });

      f.overrides.set('payments.cod', { partialNeedsApproval: true, toleranceMinor: 0, lateAfterDays: 7, missingAfterDays: 7 });
      const csv = [
        'Consignment ID,Collected Amount,Delivery Charge,Status',
        'CN-1,"1,760",60,Delivered',
        'CN-2,"1,760",60,Delivered',
        'CN-3,910,60,Partial Delivery',
        'CN-404,"2,700",60,Delivered', // trap 3: a parcel we cannot find
        'CN-4,"1,760",120,Delivered',
        'CN-6,"1,760",60,Delivered',
        'CN-1,"1,760",60,Delivered', // the same parcel twice
      ].join('\n');
      const input = { courierAccountId: c.id, reference: 'STM-0001', csv, receivedAs: 'BANK', receivedAccountRef: 'Sample bank ••01' };
      expect(await code(importSettlement(f.deps(), f.viewer, input))).toBe('FORBIDDEN');
      const s = await importSettlement(f.deps(), f.staff, input);
      expect(s).toMatchObject({ replay: false, matched: 1, late: 1, mismatched: 5, receivedAs: 'BANK', totalCodMinor: 1_241_000, chargesMinor: 48_000, netMinor: 1_193_000 });
      expect(s.reasons).toEqual({ RETURN_AS_DELIVERED: 1, PARTIAL_DELIVERY: 1, UNKNOWN_PARCEL: 1, DOUBLE_CHARGE: 1, DOUBLE_LINE: 1 });
      expect(s.lines.map((l) => [l.consignmentId, l.matchState, l.reasonCode, l.settleDays])).toEqual([
        ['CN-1', 'MATCHED', null, 4],
        ['CN-2', 'MISMATCH', 'RETURN_AS_DELIVERED', 0],
        ['CN-3', 'MISMATCH', 'PARTIAL_DELIVERY', 3],
        ['CN-404', 'MISMATCH', 'UNKNOWN_PARCEL', null],
        ['CN-4', 'MISMATCH', 'DOUBLE_CHARGE', 2],
        ['CN-6', 'LATE', 'LATE_SETTLEMENT', 14],
        ['CN-1', 'MISMATCH', 'DOUBLE_LINE', 4],
      ]);
      expect(s.lines[1]).toMatchObject({ expectedMinor: 6_000, codMinor: 176_000 });
      // the same file twice is the same statement; another file under the same reference is refused
      expect(await importSettlement(f.deps(), f.staff, input)).toMatchObject({ settlementId: s.settlementId, replay: true });
      expect(await code(importSettlement(f.deps(), f.staff, { ...input, csv: `${csv}\n` }))).toBe('DUPLICATE_REFERENCE');
      expect(await f.t.prisma.courierSettlement.count({ where: { courierAccountId: c.id } })).toBe(1);
      expect(await f.t.prisma.auditLog.count({ where: { action: 'settlement.import', entityId: s.settlementId } })).toBe(1);

      // the matched parcel's money is reconciled and its order shows the COD settled
      const m1 = (await orderMoney(f.deps(), f.staff, o1.id))!;
      expect(m1).toMatchObject({ cod: 'settled', pill: 'COD_SETTLED' });
      expect(m1.door[0]).toMatchObject({ moneyStatus: 'RECONCILED' });
      const m2 = (await orderMoney(f.deps(), f.staff, o2.id))!;
      expect(m2.mismatches.map((x) => [x.kind, x.reason])).toEqual([
        ['collection', 'CHARGE_PAID_RETURN'],
        ['line', 'RETURN_AS_DELIVERED'],
      ]);

      // cash in transit: the missing parcel's cash is with the courier, the lost parcel's is on the road
      const pos = await codPosition(f.deps(), f.viewer);
      const mine = pos.couriers.find((x) => x.courierAccountId === c.id)!;
      expect(mine).toMatchObject({ withCourierMinor: 176_000, withCourierParcels: 1, onTheRoadMinor: 270_000, onTheRoadParcels: 1 });
      expect(mine.settleDays).toEqual({ lines: 6, average: 4.5, max: 14 });
      expect(pos.couriers.find((x) => x.courierAccountId === other.id)).toMatchObject({ onTheRoadMinor: 176_000, withCourierMinor: 0, settleDays: { lines: 0, average: null, max: null } });
      expect(pos.totalInTransitMinor).toBe(176_000 + 270_000 + 176_000);
      expect(pos.missing).toEqual([expect.objectContaining({ orderId: o5.id, consignmentId: 'CN-5', codMinor: 176_000, reason: 'MISSING' })]);
      expect(pos.openMismatches).toEqual({ RETURN_AS_DELIVERED: 1, PARTIAL_DELIVERY: 1, UNKNOWN_PARCEL: 1, DOUBLE_CHARGE: 1, DOUBLE_LINE: 1 });

      // a person checks a mismatch and marks it resolved; nothing is paid or claimed
      const trap = s.lines[1]!;
      expect(await code(resolveLine(f.deps(), f.staff, trap.id, { note: 'no' }))).toBe('INVALID_INPUT');
      expect(await code(resolveLine(f.deps(), f.staff, s.lines[0]!.id, { note: 'checked with courier' }))).toBe('NOT_PENDING');
      expect(await resolveLine(f.deps(), f.staff, trap.id, { note: 'courier will correct it on the next statement' })).toMatchObject({ moneyStatus: 'RECONCILED', resolvedAt: expect.any(Date) });
      expect(await code(resolveLine(f.deps(), f.staff, trap.id, { note: 'again and again' }))).toBe('ALREADY_RECORDED');
      expect((await codPosition(f.deps(), f.staff)).openMismatches).not.toHaveProperty('RETURN_AS_DELIVERED');
      f.overrides.delete('payments.cod');
      // missing and late are off by default
      const off = await codPosition(f.deps(), f.staff);
      expect(off.missing).toEqual([]);
    });

    it('lines can come as JSON too; a file that cannot be read is refused with every problem named', async () => {
      const c = await f.courier('Third courier');
      expect(await code(importSettlement(f.deps(), f.staff, { courierAccountId: c.id, reference: 'STM-0002', csv: 'Parcel,Money\nCN-9,10\n' }))).toBe('INVALID_INPUT');
      expect(await code(importSettlement(f.deps(), f.staff, { courierAccountId: c.id, reference: 'STM-0002' }))).toBe('INVALID_INPUT');
      expect(await code(importSettlement(f.deps(), { ...f.staff, storeId: f.B }, { courierAccountId: c.id, reference: 'STM-0002', lines: [] }))).toBe('FORBIDDEN');
      const s = await importSettlement(f.deps(), f.staff, { courierAccountId: c.id, reference: 'STM-0002', lines: [{ consignmentId: 'CN-X', codMinor: 100, status: 'delivered' }] });
      expect(s.lines).toEqual([expect.objectContaining({ consignmentId: 'CN-X', matchState: 'MISMATCH', reasonCode: 'UNKNOWN_PARCEL', courierStatus: 'delivered' })]);
    });
  });
});
