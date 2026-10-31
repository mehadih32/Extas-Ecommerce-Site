// PR 190 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): who pays the second delivery. SIM-F-021 (the
// required acceptance test): a parcel refused at the door for size after a try-on takes a size re-ship linked to the
// refused order — the old piece covers nothing that was not paid, the refused parcel's own return is the pick-up, the
// charge follows the owner's rule, and the refusal no longer counts against the number. CN-018 (5): the customer pays
// for his own size choice; staff waive with a logged reason; a "your mistake" claim needs a photo and is approved by a
// person. CN-014e: the one-trip swap only where the owner offers it. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { approveExchange, confirmOrder, decideExchangeClaim, exchangeChoices, exchangeDetail, openExchange, orderPhoneHistory, orderStep, qcReturn, recordExchangeClaim, systemBy, waiveExchangeCharge } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 190 · exchange delivery charge and who pays (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const by = systemBy('test');
  const charge = { sizePays: 'customer', fallbackMinor: 6_000, claimPhoto: true, reshipRefusals: ['size-fit'], reshipFree: false };

  async function shipped(name: string) {
    const o = await f.place(name);
    const r = { storeId: f.S, orderId: o.orderId };
    await confirmOrder(d(), f.staff, o.orderId);
    await orderStep(d(), r, by, 'pack');
    await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(d(), r, by, 'handover');
    return { o, r };
  }
  async function requested(name: string, extra: Record<string, unknown> = {}) {
    const s = await shipped(name);
    await orderStep(d(), s.r, by, 'delivered');
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: s.o.orderId } });
    const ex = await openExchange(d(), f.staff, s.o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }], ...extra });
    return { ...s, line, ex };
  }

  beforeAll(async () => {
    f = await setUpOrders('exchange_charge');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
    f.overrides.set('orders.exchange.charge', charge);
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('SIM-F-021: a size refusal after a try-on is re-shipped linked to the refused order, paid as a size choice, not counted against him', async () => {
    const { o, r } = await shipped('ch-tryon');
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    await orderStep(d(), r, by, 'returned', { refusalKey: 'size-fit' });
    const ch = await exchangeChoices(d(), f.staff, o.orderId, { orderItemId: line.id, reason: 'size', sizeKey: 'l' });
    expect(ch).toMatchObject({ closed: null, reship: true, item: { paidPerPieceMinor: 0 } });
    const opt = ch.options.find((x) => x.variantId === f.v.skyL)!;
    // nothing was paid for the refused parcel: the re-ship costs its full price plus the size-choice charge
    // (the sample exchange rule's charge for his band wins over the owner's fallback figure)
    const fee = opt.money.chargeMinor;
    expect(fee).toBeGreaterThan(0);
    expect(opt.money).toMatchObject({ differenceMinor: opt.priceMinor, chargeState: 'SET', codMinor: opt.priceMinor + fee });
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    await db().order.update({ where: { id: o.orderId }, data: { lang: 'en' } });
    const ap = await approveExchange(d(), f.staff, ex.exchangeId);
    // review R3 (customer minor 2): the new parcel keeps the language he ordered in
    expect((await db().order.findUniqueOrThrow({ where: { id: ap.newOrderId } })).lang).toBe('en');
    const refusedReturn = await db().returnRecord.findFirstOrThrow({ where: { orderId: o.orderId, kind: 'REFUSED_AT_DOOR' }, include: { items: true } });
    expect(ap.returnId).toBe(refusedReturn.id);
    expect(refusedReturn.exchangeId).toBe(ex.exchangeId);
    expect(await db().returnRecord.count({ where: { orderId: o.orderId, kind: 'EXCHANGE_PICKUP' } })).toBe(0);
    const n = await db().order.findUniqueOrThrow({ where: { id: ap.newOrderId } });
    expect(n).toMatchObject({ flags: ['EXCHANGE'], deliveryChargeMinor: fee, codAmountMinor: opt.priceMinor + fee });
    expect((await exchangeDetail(d(), f.staff, ex.exchangeId)).pickup).toMatchObject({ returnId: refusedReturn.id });
    // the refusal is a try-on now: shown, never counted against the number
    const h = await orderPhoneHistory(d(), f.staff, ap.newOrderId);
    expect(h!.summary).toMatchObject({ refused: 0, ourFault: 1 });
    expect(h!.recent.find((x) => x.id === o.orderId)).toMatchObject({ ourFault: true });
    // QC of the refused parcel moves the re-ship on
    f.overrides.set('erp.defaultMode', 'NONE');
    await qcReturn(d(), f.staff, refusedReturn.id, { items: [{ returnItemId: refusedReturn.items[0]!.id, scannedSku: line.sku, disposition: 'SELLABLE' }] });
    f.overrides.delete('erp.defaultMode');
    expect((await exchangeDetail(d(), f.staff, ex.exchangeId)).status).toBe('QC_PASSED');

    // a refusal for another reason is no try-on: no re-ship; the perk makes a re-ship free
    const other = await shipped('ch-changed');
    const l2 = await db().orderItem.findFirstOrThrow({ where: { orderId: other.o.orderId } });
    await orderStep(d(), other.r, by, 'returned', { refusalKey: 'changed-mind' });
    expect(await code(openExchange(d(), f.staff, other.o.orderId, { reason: 'size', items: [{ orderItemId: l2.id, newVariantId: f.v.skyL }] }))).toBe('EXCHANGE_CLOSED');
    f.overrides.set('orders.exchange.charge', { ...charge, reshipFree: true });
    const free = await shipped('ch-free');
    const l3 = await db().orderItem.findFirstOrThrow({ where: { orderId: free.o.orderId } });
    await orderStep(d(), free.r, by, 'returned', { refusalKey: 'size-fit' });
    const fx = await openExchange(d(), f.staff, free.o.orderId, { reason: 'size', items: [{ orderItemId: l3.id, newVariantId: f.v.skyL }] });
    expect(fx.money).toMatchObject({ chargeMinor: 0, chargeState: 'STORE' });
    f.overrides.set('orders.exchange.charge', charge);
  });

  it('CN-018 (5): staff waive the size-choice charge with a logged reason, only before approval', async () => {
    const { ex } = await requested('ch-waive');
    const fee = ex.money.chargeMinor;
    expect(fee).toBeGreaterThan(0);
    expect(ex.money).toMatchObject({ chargeState: 'SET', codMinor: fee });
    expect(await code(waiveExchangeCharge(d(), f.reader, ex.exchangeId, { reason: 'loyal customer' }))).toBe('FORBIDDEN');
    expect(await code(waiveExchangeCharge(d(), f.staff, ex.exchangeId, {}))).toBe('INVALID_INPUT');
    const w = await waiveExchangeCharge(d(), f.staff, ex.exchangeId, { reason: 'loyal customer' });
    expect(w).toEqual({ exchangeId: ex.exchangeId, chargeState: 'WAIVED', waivedMinor: fee, codMinor: 0 });
    expect(await code(waiveExchangeCharge(d(), f.staff, ex.exchangeId, { reason: 'again' }))).toBe('NOTHING_CHANGED');
    const row = await db().exchange.findUniqueOrThrow({ where: { id: ex.exchangeId } });
    expect(row).toMatchObject({ waiveReason: 'loyal customer', waivedById: f.staffId, chargePayer: 'STORE', deliveryChargeMinor: 0 });
    const audit = await db().auditLog.findFirstOrThrow({ where: { action: 'exchange.waived', entityId: ex.exchangeId } });
    expect(audit.after).toMatchObject({ waivedMinor: fee });
    const ap = await approveExchange(d(), f.staff, ex.exchangeId);
    expect(await db().order.findUniqueOrThrow({ where: { id: ap.newOrderId } })).toMatchObject({ deliveryChargeMinor: 0, codAmountMinor: 0 });

    const late = await requested('ch-waive-late');
    await approveExchange(d(), f.staff, late.ex.exchangeId);
    expect(await code(waiveExchangeCharge(d(), f.staff, late.ex.exchangeId, { reason: 'too late' }))).toBe('EXCHANGE_STATE');
  });

  it('CN-018 (5): a "your mistake" claim needs a photo and a person who decides it', async () => {
    const { ex } = await requested('ch-claim');
    expect(await code(recordExchangeClaim(d(), f.staff, ex.exchangeId, { note: 'you sent XL, I ordered L' }))).toBe('PHOTO_REQUIRED');
    expect(await recordExchangeClaim(d(), f.staff, ex.exchangeId, { note: 'you sent XL, I ordered L', photoAssetIds: [randomUUID()] })).toEqual({ exchangeId: ex.exchangeId, claimState: 'PENDING' });
    expect(await code(decideExchangeClaim(d(), f.reader, ex.exchangeId, { accept: true }))).toBe('FORBIDDEN');
    expect(await code(decideExchangeClaim(d(), f.staff, ex.exchangeId, { accept: false }))).toBe('INVALID_INPUT');
    const ok = await decideExchangeClaim(d(), f.staff, ex.exchangeId, { accept: true });
    expect(ok).toMatchObject({ claimState: 'ACCEPTED', chargeState: 'CLAIM_ACCEPTED', waivedMinor: ex.money.chargeMinor, codMinor: 0 });
    expect(await code(decideExchangeClaim(d(), f.staff, ex.exchangeId, { accept: true }))).toBe('EXCHANGE_STATE');

    const no = await requested('ch-claim-no');
    await recordExchangeClaim(d(), f.staff, no.ex.exchangeId, { note: 'wrong size', photoAssetIds: [randomUUID()] });
    expect(await decideExchangeClaim(d(), f.staff, no.ex.exchangeId, { accept: false, note: 'the label shows L' })).toMatchObject({ claimState: 'REFUSED', codMinor: no.ex.money.codMinor });
  });

  it('CN-014e: the one-trip size swap only where the owner offers it, at its own price', async () => {
    const s = await shipped('ch-swap');
    await orderStep(d(), s.r, by, 'delivered');
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: s.o.orderId } });
    const band = (await db().order.findUniqueOrThrow({ where: { id: s.o.orderId }, include: { deliveryBand: true } })).deliveryBand!.key;
    const body = { reason: 'size', oneTrip: true, items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] };
    expect(await code(openExchange(d(), f.staff, s.o.orderId, body))).toBe('NOT_EXCHANGEABLE');
    f.overrides.set('orders.exchange.swap', { enabled: true, chargeMinor: 9_000, bandKeys: [band] });
    expect((await exchangeChoices(d(), f.staff, s.o.orderId, { orderItemId: line.id, reason: 'size', sizeKey: 'l' })).oneTrip).toEqual({ chargeMinor: 9_000 });
    const ex = await openExchange(d(), f.staff, s.o.orderId, body);
    expect(ex.money).toMatchObject({ chargeMinor: 9_000, chargeState: 'ONE_TRIP', codMinor: 9_000 });
    expect(await db().exchange.findUniqueOrThrow({ where: { id: ex.exchangeId } })).toMatchObject({ oneTrip: true });
    f.overrides.delete('orders.exchange.swap');
  });
});
