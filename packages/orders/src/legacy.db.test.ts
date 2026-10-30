// CN-028 · PR 612–614 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the old shop-side return paths as
// switches (registry v67 `returns.legacy.*`). The owner's rule: while a store speaks ERP contract v5 the old flow keeps
// working (every switch on by default); each part can be turned off per store (PR 619 turns them off at the switch-over;
// they are never deleted); in v6 the old paths never run, whatever the switches say — the owner decides every returned
// piece in the ERP and there are no returns or refunds after delivery. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { approveExchange, completeExchange, confirmOrder, legacyPaths, openExchange, orderStep, qcReturn, receiveReturn, returnChoices, systemBy } from './index';
import { setUpErpOrders, type ErpFixture } from './test/erp-v6-fixture';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 612–614 · the old return paths are switches; v6 never runs them (PostgreSQL)', () => {
  let f: ErpFixture;
  const db = () => f.t.prisma;
  const d = () => f.erpDeps();
  const by = systemBy('test');
  const off = (k: string) => f.perStore.set(`returns.legacy.${k}@${f.S}`, false);
  const reset = () => {
    for (const k of ['shopQc', 'restock', 'writeOff', 'creditDue']) f.perStore.delete(`returns.legacy.${k}@${f.S}`);
    f.perStore.delete(`erp.model@${f.S}`);
  };

  async function delivered(name: string) {
    const o = await f.place(name);
    const r = { storeId: f.S, orderId: o.orderId };
    await confirmOrder(d(), f.staff, o.orderId);
    await orderStep(d(), r, by, 'pack');
    await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: f.courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(d(), r, by, 'handover');
    await orderStep(d(), r, by, 'delivered');
    return o;
  }
  /** v5: a delivered order's exchange to a cheaper piece, approved — its pick-up waiting for the shop's QC. */
  async function pickup(name: string, newVariantId: string) {
    const o = await delivered(name);
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    await db().orderItem.update({ where: { id: line.id }, data: { unitCostMinor: 45_000 } });
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId }] }, { idempotencyKey: randomUUID() });
    const ap = await approveExchange(d(), f.staff, ex.exchangeId);
    const ret = await db().returnRecord.findUniqueOrThrow({ where: { id: ap.returnId }, include: { items: true } });
    return { o, ex, ret, item: ret.items[0]!, sku: ret.items[0]!.expectedSku! };
  }

  beforeAll(async () => {
    f = await setUpErpOrders('legacy');
  });
  afterAll(async () => {
    f?.restore();
    await f?.t.drop();
  });

  it('v5 by default: every old path on (today`s behaviour); v6: none, whatever the switches say', async () => {
    reset();
    expect(await legacyPaths(d(), f.S)).toEqual({ model: 'v5', shopQc: true, restock: true, writeOff: true, creditDue: true });
    off('restock');
    expect((await legacyPaths(d(), f.S)).restock).toBe(false);
    f.v6();
    expect(await legacyPaths(d(), f.S)).toEqual({ model: 'v6', shopQc: false, restock: false, writeOff: false, creditDue: false });
    reset();
  });

  it('v5 with the shop QC switched off: the check is refused with the switch named', async () => {
    reset();
    const c = await pickup('lg-qc-off', f.v.skyL);
    off('shopQc');
    const e = await qcReturn(d(), f.staff, c.ret.id, { items: [{ returnItemId: c.item.id, scannedSku: c.sku, disposition: 'SELLABLE' }] }).catch((x: unknown) => x as { code: string; data: { setting: string } });
    expect(e).toMatchObject({ code: 'LEGACY_OFF', data: { setting: 'returns.legacy.shopQc' } });
    reset();
    expect((await qcReturn(d(), f.staff, c.ret.id, { items: [{ returnItemId: c.item.id, scannedSku: c.sku, disposition: 'SELLABLE' }] })).status).toBe('QC_DONE');
  });

  it('v5 with restock off: a sellable piece is recorded but no return document goes to the ERP', async () => {
    reset();
    const c = await pickup('lg-restock-off', f.v.skyL);
    off('restock');
    const qc = await qcReturn(d(), f.staff, c.ret.id, { items: [{ returnItemId: c.item.id, scannedSku: c.sku, disposition: 'SELLABLE' }] });
    expect(qc.erpPushId).toBeNull();
    expect(qc.items[0]!.dispositionState).toBe('NO_ERP');
    expect(await db().erpPush.count({ where: { referenceId: c.o.orderId, documentType: 'return.create' } })).toBe(0);
    reset();
  });

  it('v5 with write-off off: a not-sellable piece keeps its reason, but the shop books no return-loss cost', async () => {
    reset();
    const c = await pickup('lg-writeoff-off', f.v.skyL);
    off('writeOff');
    const qc = await qcReturn(d(), f.staff, c.ret.id, { items: [{ returnItemId: c.item.id, scannedSku: c.sku, disposition: 'UNSELLABLE', lossReason: 'stained' }] });
    expect(qc.items[0]).toMatchObject({ dispositionState: 'LOSS_RECORDED', lossCostEntryId: null });
    expect(await db().costEntry.count({ where: { refId: c.item.id, service: 'RETURN_LOSS' } })).toBe(0);
    reset();
    // the same with the switch on (today's behaviour) books it
    const c2 = await pickup('lg-writeoff-on', f.v.skyL);
    const qc2 = await qcReturn(d(), f.staff, c2.ret.id, { items: [{ returnItemId: c2.item.id, scannedSku: c2.sku, disposition: 'UNSELLABLE', lossReason: 'stained' }] });
    expect(qc2.items[0]!.lossCostEntryId).toBeTruthy();
  });

  it('v5 with credit-due off: a cheaper new piece leaves no credit noted', async () => {
    reset();
    // the money box left a credit (the new piece is cheaper)
    const on = await pickup('lg-credit-on', f.v.skyL);
    await db().exchange.update({ where: { id: on.ex.exchangeId }, data: { walletCreditMinor: 20_000 } });
    expect((await qcReturn(d(), f.staff, on.ret.id, { items: [{ returnItemId: on.item.id, scannedSku: on.sku, disposition: 'SELLABLE' }] })).creditDueMinor).toBe(20_000);
    const c = await pickup('lg-credit-off', f.v.skyL);
    await db().exchange.update({ where: { id: c.ex.exchangeId }, data: { walletCreditMinor: 20_000 } });
    off('creditDue');
    const qc = await qcReturn(d(), f.staff, c.ret.id, { items: [{ returnItemId: c.item.id, scannedSku: c.sku, disposition: 'SELLABLE' }] });
    expect(qc.creditDueMinor).toBe(0);
    reset();
  });

  it('v6: the shop never receives or checks a returned piece, completes an exchange, or takes a return after delivery', async () => {
    reset();
    const c = await pickup('lg-v6', f.v.skyL);
    f.v6();
    const e = await receiveReturn(d(), f.staff, c.ret.id).catch((x: unknown) => x as { code: string; data: { use: string } });
    expect(e).toMatchObject({ code: 'ERP_MODEL', data: { use: 'handback' } });
    expect(await code(qcReturn(d(), f.staff, c.ret.id, { items: [{ returnItemId: c.item.id, scannedSku: c.sku, disposition: 'SELLABLE' }] }))).toBe('ERP_MODEL');
    expect(await code(completeExchange(d(), f.staff, c.ex.exchangeId))).toBe('ERP_MODEL');
    // the old approval does not run in v6 (the exchange goes through the ERP, PR 614)
    const o = await delivered('lg-v6-approve');
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] }, { idempotencyKey: randomUUID() });
    expect(await code(approveExchange(d(), f.staff, ex.exchangeId))).toBe('ERP_MODEL');
    // no returns after delivery on v6, whatever the old switches say
    f.perStore.set(`policy.returns.afterDelivery@${f.S}`, true);
    const choices = await returnChoices(d(), f.staff, o.orderId);
    expect(choices.closed).toBe('POLICY');
    expect(choices.reasons).toEqual([]);
    f.perStore.delete(`policy.returns.afterDelivery@${f.S}`);
    reset();
  });
});
