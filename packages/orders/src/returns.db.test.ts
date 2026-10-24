// PR 187 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): Receive & QC of an exchange's old piece. The
// SIM-F-022 acceptance test: a wrong item came back — QC restocks the SKU scanned (the piece really packed), never the
// one ordered, and the case keeps its root cause; a scan that is not the expected SKU is refused unless a person
// accepts it with a note (and never when the owner switched that off). A not-sellable piece is a loss at its cost,
// never sent to the ERP. The relay's outcome lands on the piece (no ERP → NO_ERP). Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { relayErpPushes } from '@extas/inventory';
import { approveExchange, completeExchange, confirmOrder, exchangeDetail, inventoryOf, listReturns, openExchange, orderStep, qcReturn, receiveReturn, returnDetail, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 187 · Receive & QC, restock or write-off (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const by = systemBy('test');
  const lineOf = (orderId: string) => db().orderItem.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  const skuOf = async (id: string) => (await db().productVariant.findUniqueOrThrow({ where: { id } })).sku;

  async function delivered(name: string, lines?: { variantId: string; quantity?: number }[]) {
    const o = await f.place(name, lines ? { lines } : {});
    const r = { storeId: f.S, orderId: o.orderId };
    await confirmOrder(d(), f.staff, o.orderId);
    await orderStep(d(), r, by, 'pack');
    await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(d(), r, by, 'handover');
    await orderStep(d(), r, by, 'delivered');
    return o;
  }

  /** A delivered order, its exchange opened and approved: the pick-up return waiting. */
  async function approved(name: string, open: (line: { id: string }) => Record<string, unknown>, lines?: { variantId: string; quantity?: number }[]) {
    const o = await delivered(name, lines);
    const line = await lineOf(o.orderId);
    const ex = await openExchange(d(), f.staff, o.orderId, open(line), { idempotencyKey: `qc-${randomUUID()}` });
    const ap = await approveExchange(d(), f.staff, ex.exchangeId);
    const ret = await db().returnRecord.findUniqueOrThrow({ where: { id: ap.returnId }, include: { items: true } });
    return { o, line, ex, ap, ret, item: ret.items[0]! };
  }

  beforeAll(async () => {
    f = await setUpOrders('returns_qc');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('SIM-F-022: a wrong item came back — QC restocks the SKU scanned, the case keeps its root cause, the exchange moves on', async () => {
    const linenSku = await skuOf(f.v.linenM);
    const skySku = await skuOf(f.v.skyM);
    // sky M was ordered, a white linen shirt was packed; the right piece (sky M) goes out again
    const c = await approved('qc-wrong', (line) => ({ reason: 'wrong', rootCause: 'wrong-pick', items: [{ orderItemId: line.id, newVariantId: f.v.skyM, receivedSku: linenSku }] }));
    expect(c.item.expectedSku).toBe(linenSku);
    expect(c.item.expectedSku).not.toBe(skySku);

    const rec = await receiveReturn(d(), f.staff, c.ret.id, {}, { version: c.ret.version });
    expect(rec.status).toBe('RECEIVED');
    expect((await exchangeDetail(d(), f.staff, c.ex.exchangeId)).status).toBe('RECEIVED');
    expect(await code(receiveReturn(d(), f.staff, c.ret.id))).toBe('RETURN_STATE');

    // scanning the ordered SKU (not what came back) is refused: the stock would go wrong
    const asOrdered = { items: [{ returnItemId: c.item.id, scannedSku: skySku, disposition: 'SELLABLE' }] };
    expect(await code(qcReturn(d(), f.staff, c.ret.id, asOrdered))).toBe('SKU_MISMATCH');
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [{ ...asOrdered.items[0]!, otherSku: true }] }))).toBe('SKU_MISMATCH');
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [{ returnItemId: c.item.id, scannedSku: 'NO-SUCH-SKU', disposition: 'SELLABLE' }] }))).toBe('UNKNOWN_SKU');
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [] }))).toBe('INVALID_INPUT');
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [{ returnItemId: randomUUID(), scannedSku: linenSku, disposition: 'SELLABLE' }] }))).toBe('QC_INCOMPLETE');
    expect(await code(qcReturn(d(), f.reader, c.ret.id, { items: [{ returnItemId: c.item.id, scannedSku: linenSku, disposition: 'SELLABLE' }] }))).toBe('FORBIDDEN');

    const qc = await qcReturn(d(), f.staff, c.ret.id, { items: [{ returnItemId: c.item.id, scannedSku: linenSku.toLowerCase(), disposition: 'SELLABLE' }] });
    expect(qc).toMatchObject({ status: 'QC_DONE', exchangeStatus: 'QC_PASSED', items: [{ scannedSku: linenSku, disposition: 'SELLABLE', dispositionState: 'ERP_PENDING' }] });
    const push = await db().erpPush.findUniqueOrThrow({ where: { id: qc.erpPushId! } });
    expect(push).toMatchObject({ documentType: 'return.create', referenceId: c.o.orderId, idempotencyKey: `return:${c.ret.id}:v1` });
    const doc = push.requestBody as { body: { externalOrderId: string; items: { sku: string; quantity: number; qc: string }[] } };
    // what goes back into stock is the linen shirt that came back, not the sky shirt that was ordered
    expect(doc.body).toMatchObject({ externalOrderId: c.o.number, items: [{ sku: linenSku, quantity: 1, qc: 'good' }] });
    expect(JSON.stringify(push.requestBody)).not.toContain(skySku);
    const item = await db().returnItem.findUniqueOrThrow({ where: { id: c.item.id } });
    expect(item).toMatchObject({ scannedSku: linenSku, variantId: f.v.linenM, qcStatus: 'GOOD', erpPushId: push.id, qcById: f.staffId });
    const view = await exchangeDetail(d(), f.staff, c.ex.exchangeId);
    expect(view).toMatchObject({ status: 'QC_PASSED', rootCause: 'wrong-pick', pickup: { status: 'QC_DONE', items: [{ scannedSku: linenSku, dispositionState: 'ERP_PENDING' }] } });
    expect(view.items[0]).toMatchObject({ receivedSku: linenSku, qcStatus: 'GOOD', restockAction: 'ERP_RETURN' });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: c.o.orderId, type: 'return.qc' } });
    expect(ev).toMatchObject({ actorId: f.staffId });
    expect(await db().auditLog.count({ where: { entityId: c.ret.id, action: { in: ['return.received', 'return.qc'] } } })).toBe(2);
    // checked once: never edited after
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [{ returnItemId: c.item.id, scannedSku: linenSku, disposition: 'UNSELLABLE', lossReason: 'stained' }] }))).toBe('RETURN_STATE');

    expect((await completeExchange(d(), f.staff, c.ex.exchangeId)).status).toBe('COMPLETED');
    expect(await code(completeExchange(d(), f.staff, c.ex.exchangeId))).toBe('EXCHANGE_STATE');
  });

  it('another SKU may be accepted with a note (what is scanned is restocked) — never when the owner switched it off', async () => {
    const skySku = await skuOf(f.v.skyM);
    const whiteSku = await skuOf(f.v.whiteM);
    const c = await approved('qc-other', (line) => ({ reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] }));
    expect(c.item.expectedSku).toBe(skySku);
    const line = { returnItemId: c.item.id, scannedSku: whiteSku, disposition: 'SELLABLE' as const, otherSku: true, note: 'customer sent his white M back' };
    f.overrides.set('orders.returns.qc', { acceptOtherSku: false, photoForLoss: false });
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [line] }))).toBe('SKU_MISMATCH');
    f.overrides.delete('orders.returns.qc');
    // saving straight from EXPECTED also marks the parcel received
    const qc = await qcReturn(d(), f.staff, c.ret.id, { items: [line] });
    expect(qc.items[0]).toMatchObject({ scannedSku: whiteSku, dispositionState: 'ERP_PENDING' });
    const r = await returnDetail(d(), f.staff, c.ret.id);
    expect(r).toMatchObject({ status: 'QC_DONE', exchangeNumber: c.ex.number, items: [{ expectedSku: skySku, scannedSku: whiteSku, note: line.note, erp: { status: 'PENDING' } }] });
    expect(r.receivedAt).not.toBeNull();

    // a store without an ERP: the relay skips the documents and the piece says so
    f.overrides.set('erp.defaultMode', 'NONE');
    await relayErpPushes(inventoryOf(d()), { storeId: f.S });
    f.overrides.delete('erp.defaultMode');
    expect((await db().returnItem.findUniqueOrThrow({ where: { id: c.item.id } })).dispositionState).toBe('NO_ERP');
  });

  it('a not-sellable piece is a loss at its cost with its reason, never sent to the ERP; the exchange waits for a person', async () => {
    const c = await approved('qc-loss', (line) => ({ reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] }));
    await db().orderItem.update({ where: { id: c.line.id }, data: { unitCostMinor: 45_000 } });
    const sku = c.item.expectedSku!;
    const base = { returnItemId: c.item.id, scannedSku: sku, disposition: 'UNSELLABLE' as const };
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [base] }))).toBe('LOSS_REASON_REQUIRED');
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [{ ...base, lossReason: 'no-such-reason' }] }))).toBe('LOSS_REASON_REQUIRED');
    f.overrides.set('orders.returns.qc', { acceptOtherSku: true, photoForLoss: true });
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [{ ...base, lossReason: 'stained' }] }))).toBe('LOSS_REASON_REQUIRED');
    f.overrides.delete('orders.returns.qc');
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [{ ...base, lossReason: 'stained' }] }, { version: c.ret.version + 3 }))).toBe('STALE');

    const qc = await qcReturn(d(), f.staff, c.ret.id, { items: [{ ...base, lossReason: 'stained', note: 'ink on the collar' }] });
    expect(qc).toMatchObject({ erpPushId: null, exchangeStatus: 'QC_FAILED', items: [{ disposition: 'UNSELLABLE', dispositionState: 'LOSS_RECORDED' }] });
    const cost = await db().costEntry.findUniqueOrThrow({ where: { id: qc.items[0]!.lossCostEntryId! } });
    expect(cost).toMatchObject({ service: 'RETURN_LOSS', amountMinor: 45_000, refType: 'ReturnItem', refId: c.item.id, detail: 'stained' });
    expect(await db().erpPush.count({ where: { documentType: 'return.create', idempotencyKey: { startsWith: `return:${c.ret.id}` } } })).toBe(0);
    expect((await db().returnItem.findUniqueOrThrow({ where: { id: c.item.id } })).qcStatus).toBe('DAMAGED');
    // a failed check is completed only with a person's note
    expect(await code(completeExchange(d(), f.staff, c.ex.exchangeId))).toBe('INVALID_INPUT');
    expect((await completeExchange(d(), f.staff, c.ex.exchangeId, { note: 'customer agreed, piece written off' })).status).toBe('COMPLETED');

    const waiting = await listReturns(d(), f.staff, { status: ['QC_DONE'] });
    expect(waiting.map((r) => r.id)).toContain(c.ret.id);
    expect((await listReturns(d(), f.staff, { orderNumber: c.o.number })).map((r) => r.id)).toEqual([c.ret.id]);
    expect(await code(listReturns(d(), f.reader))).toBe('FORBIDDEN');
  });
});
