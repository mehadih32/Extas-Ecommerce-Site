// PR 180 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout and
// booked with Steadfast on its practice world; skipped without TEST_DATABASE_ADMIN_URL): every press of Print is one
// print job; the same press key again is the same job, counted once; a reprint is the same parcel and needs its reason
// when the owner asks why; the recent prints; the rider's handover sheet (one open batch per courier, only parcels whose
// sticker was printed, the amounts to collect, the receiver's name by the owner's setting) and "handed over" through
// the order machine, packed first when nobody packed. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { shippingSettings } from '@extas/settings';
import { bookOrders, completeHandover, copyHandover, handoverHistory, handoverList, printHandover, printJobs, printRun, printStickers } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

async function refusal(p: Promise<unknown>): Promise<{ code: string; data?: Record<string, unknown> }> {
  try {
    await p;
    return { code: 'ok' };
  } catch (e) {
    return { code: (e as { code?: string }).code ?? String(e), data: (e as { data?: Record<string, unknown> }).data };
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 180 · the print queue and the handover sheet (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const phone = () => `0170000${String(1930 + ++n).padStart(4, '0')}`;
  const booked = async (name: string, courier = courierId) => {
    const o = await f.place(name, { phone: phone() });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    const r = await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courier, orderIds: [o.orderId] });
    expect(r.results[0]).toMatchObject({ outcome: 'booked' });
    const s = await db().shipment.findFirstOrThrow({ where: { orderId: o.orderId } });
    return { ...o, shipmentId: s.id, shipment: s };
  };
  const print = (shipmentIds: string[], extra: Record<string, unknown> = {}) => printStickers(f.shippingDeps(), f.shipper, { shipmentIds, ...extra });
  // PR 182 (follow-up 433): "mark packed on handover" is off by default now; these tests hand over unpacked orders, so
  // they turn it on (the packing tests in packing.db.test.ts cover the default)
  const PACKS = { ...shippingSettings['delivery.handover.sheet'].default, packOnHandover: true };

  beforeAll(async () => {
    f = await setUpShipping('shipping_handover');
    courierId = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
    f.overrides.set('delivery.handover.sheet', PACKS);
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('every press is one print job; the same press key returns the same job and counts nothing twice', async () => {
    const a = await booked('pq-key');
    const first = await print([a.shipmentId], { requestKey: 'press-0001-aaaa' });
    expect(first).toMatchObject({ replay: false, parcels: [expect.objectContaining({ shipmentId: a.shipmentId, reprint: null })] });
    const twice = await print([a.shipmentId], { requestKey: 'press-0001-aaaa' });
    expect(twice).toMatchObject({ replay: true, jobId: first.jobId, parcels: [expect.objectContaining({ reprint: null })] });
    expect((await db().shipment.findUniqueOrThrow({ where: { id: a.shipmentId } })).labelPrintCount).toBe(1);
    expect(await db().printJob.count({ where: { requestKey: 'press-0001-aaaa' } })).toBe(1);
    expect(await db().printJob.findUniqueOrThrow({ where: { id: first.jobId } })).toMatchObject({ kind: 'STICKER', status: 'SUCCEEDED', shipmentIds: [a.shipmentId], isReprint: false, data: { prints: { [a.shipmentId]: 1 } } });
    // the key belongs to that print: another parcel with it is refused
    const b = await booked('pq-key-2');
    expect((await refusal(print([b.shipmentId], { requestKey: 'press-0001-aaaa' }))).code).toBe('INVALID_INPUT');
  });

  it('a reprint is the same parcel: it needs a reason when the owner asks why, the reason is logged, and no second parcel is made', async () => {
    const a = await booked('pq-reprint');
    await print([a.shipmentId]);
    const r = await refusal(print([a.shipmentId]));
    expect(r).toMatchObject({ code: 'REASON_REQUIRED', data: { reprints: [expect.objectContaining({ shipmentId: a.shipmentId, printCount: 1 })] } });
    const again = await print([a.shipmentId], { reason: 'Sticker torn' });
    expect(again.parcels[0]).toMatchObject({ reprint: 1, consignmentId: a.shipment.consignmentId });
    expect(await db().printJob.findUniqueOrThrow({ where: { id: again.jobId } })).toMatchObject({ isReprint: true, reason: 'Sticker torn' });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: a.orderId, type: 'shipment.stickerPrinted' }, orderBy: { createdAt: 'desc' } });
    expect(ev.data).toMatchObject({ print: 2, reprint: true, reason: 'Sticker torn', jobId: again.jobId });
    expect(await db().shipment.count({ where: { orderId: a.orderId } })).toBe(1);
    // the owner may turn the question off
    f.overrides.set('delivery.sticker.queue', { ...shippingSettings['delivery.sticker.queue'].default, reprintReason: false });
    try {
      expect((await print([a.shipmentId])).parcels[0]).toMatchObject({ reprint: 2 });
    } finally {
      f.overrides.delete('delivery.sticker.queue');
    }
    const recent = await printJobs(f.shippingDeps(), f.shipper);
    expect(recent[0]).toMatchObject({ kind: 'STICKER', isReprint: true, orderNumbers: [a.number] });
    expect(recent.find((j) => j.id === again.jobId)).toMatchObject({ reason: 'Sticker torn', parcels: 1 });
  });

  it('the handover sheet: only parcels whose sticker was printed, one open batch per courier, counted, the same key the same sheet', async () => {
    const other = await f.courier(STEADFAST_PROVIDER, 'Steadfast second');
    const a = await booked('ho-a', other);
    const b = await booked('ho-b', other);
    await print([a.shipmentId]);
    const list = (await handoverList(f.shippingDeps(), f.shipper)).find((c) => c.courierAccountId === other)!;
    expect(list.parcels.find((p) => p.shipmentId === a.shipmentId)).toMatchObject({ problem: null, printCount: 1 });
    expect(list.parcels.find((p) => p.shipmentId === b.shipmentId)).toMatchObject({ problem: 'NOT_PRINTED' });
    expect(list.ready).toMatchObject({ parcels: 1, collectMinor: a.shipment.codAmountMinor });
    expect(list.openBatch).toBeNull();
    const order = await db().order.findUniqueOrThrow({ where: { id: a.orderId } });
    expect(JSON.stringify(list)).not.toContain(order.customerName!);

    const sheet = await printHandover(f.shippingDeps(), f.shipper, { courierAccountId: other, requestKey: 'sheet-0001-aaaa' });
    expect(sheet).toMatchObject({ courierName: 'Steadfast second', practice: true, printCount: 1, replay: false, totals: { parcels: 1, collectMinor: a.shipment.codAmountMinor } });
    expect(sheet.lines).toEqual([expect.objectContaining({ orderNumber: a.number, consignmentId: a.shipment.consignmentId, receiverName: order.customerName })]);
    expect(await printHandover(f.shippingDeps(), f.shipper, { courierAccountId: other, requestKey: 'sheet-0001-aaaa' })).toMatchObject({ batchId: sheet.batchId, printCount: 1, replay: true });

    // b's sticker printed: the next sheet is the same batch, now with both parcels, printed a second time
    await print([b.shipmentId]);
    f.overrides.set('delivery.handover.sheet', { ...PACKS, receiverName: false });
    try {
      const second = await printHandover(f.shippingDeps(), f.shipper, { courierAccountId: other });
      expect(second).toMatchObject({ batchId: sheet.batchId, printCount: 2, totals: { parcels: 2 } });
      expect(second.lines.every((l) => l.receiverName === null)).toBe(true);
    } finally {
      f.overrides.set('delivery.handover.sheet', PACKS);
    }
    expect(await db().handoverBatch.count({ where: { courierAccountId: other } })).toBe(1);
    expect(await db().printJob.count({ where: { batchId: sheet.batchId, kind: 'HANDOVER_SHEET' } })).toBe(2);
    expect((await handoverList(f.shippingDeps(), f.shipper)).find((c) => c.courierAccountId === other)!.openBatch).toMatchObject({ id: sheet.batchId, printCount: 2, parcels: 2 });

    // handed over: both orders move on (packed first), the batch is closed, and the parcels leave the print run
    const done = await completeHandover(f.shippingDeps(), f.shipper, { batchId: sheet.batchId, receivedBy: 'Rider Karim' });
    expect(done.handedOver.sort()).toEqual([a.number, b.number].sort());
    expect(done.skipped).toEqual([]);
    expect(await db().order.findUniqueOrThrow({ where: { id: a.orderId } })).toMatchObject({ status: 'HANDED_OVER' });
    expect(await db().order.findUniqueOrThrow({ where: { id: a.orderId } })).toHaveProperty('packedAt', expect.any(Date));
    expect(await db().handoverBatch.findUniqueOrThrow({ where: { id: sheet.batchId } })).toMatchObject({ receivedBy: 'Rider Karim', handedOverById: f.staffId, handedOverAt: expect.any(Date) });
    expect((await printRun(f.shippingDeps(), f.shipper)).rows.map((r) => r.shipmentId)).not.toContain(a.shipmentId);
    expect(await refusal(print([a.shipmentId], { reason: 'Sticker torn' }))).toMatchObject({ code: 'NOT_PRINTABLE', data: { refused: [expect.objectContaining({ problem: 'NOT_WITH_US' })] } });
    expect((await refusal(completeHandover(f.shippingDeps(), f.shipper, { batchId: sheet.batchId, receivedBy: 'Rider Karim' }))).code).toBe('ALREADY_HANDED_OVER');
    expect((await refusal(printHandover(f.shippingDeps(), f.shipper, { courierAccountId: other }))).code).toBe('NOTHING_TO_HAND_OVER');
  });

  it('an order that changed after the sheet is left out and named; without "mark packed" an unpacked order waits; permissions hold', async () => {
    const third = await f.courier(STEADFAST_PROVIDER, 'Steadfast third');
    const a = await booked('ho-c', third);
    const b = await booked('ho-d', third);
    await print([a.shipmentId, b.shipmentId]);
    const sheet = await printHandover(f.shippingDeps(), f.shipper, { courierAccountId: third });
    const order = await db().order.findUniqueOrThrow({ where: { id: b.orderId } });
    await db().order.update({ where: { id: b.orderId }, data: { paidMinor: order.paidMinor + 10_000 } });
    f.overrides.set('delivery.handover.sheet', { ...PACKS, packOnHandover: false });
    try {
      const r = await refusal(completeHandover(f.shippingDeps(), f.shipper, { batchId: sheet.batchId, receivedBy: 'Rider Rahim' }));
      expect(r).toMatchObject({ code: 'NOTHING_TO_HAND_OVER' });
      expect(r.data?.skipped).toEqual(expect.arrayContaining([{ orderNumber: a.number, reason: 'NOT_PACKED' }, { orderNumber: b.number, reason: 'COD_CHANGED' }]));
      // PR 182: the list shows why: the unpacked order is not ready
      const list = (await handoverList(f.shippingDeps(), f.shipper)).find((c) => c.courierAccountId === third)!;
      expect(list.parcels.find((x) => x.shipmentId === a.shipmentId)).toMatchObject({ problem: 'NOT_PACKED' });
    } finally {
      f.overrides.set('delivery.handover.sheet', PACKS);
    }
    const done = await completeHandover(f.shippingDeps(), f.shipper, { batchId: sheet.batchId, receivedBy: 'Rider Rahim' });
    expect(done).toMatchObject({ handedOver: [a.number], skipped: [{ orderNumber: b.number, reason: 'COD_CHANGED' }] });
    expect(await db().order.findUniqueOrThrow({ where: { id: b.orderId } })).toMatchObject({ status: 'CONFIRMED' });

    expect((await refusal(printHandover(f.shippingDeps(), f.looker, { courierAccountId: third }))).code).toBe('FORBIDDEN');
    expect((await refusal(completeHandover(f.shippingDeps(), f.looker, { batchId: sheet.batchId, receivedBy: 'x y' }))).code).toBe('FORBIDDEN');
    expect((await refusal(handoverList(f.shippingDeps(), f.looker))).code).toBe('FORBIDDEN');
    expect((await refusal(completeHandover(f.shippingDeps(), f.shipper, { batchId: '00000000-0000-7000-8000-000000000000', receivedBy: 'x y' }))).code).toBe('NOT_FOUND');
  });

  it('PR 406: the handed-over history per courier (rider, who, parcels, amount) and a COPY of a handed sheet with only the parcels that went', async () => {
    const third = await f.courier(STEADFAST_PROVIDER, 'Steadfast history');
    const a = await booked('hh-a', third);
    const b = await booked('hh-b', third);
    await print([a.shipmentId, b.shipmentId]);
    const sheet = await printHandover(f.shippingDeps(), f.shipper, { courierAccountId: third });
    // the open batch is not in the history and has no copy
    expect((await handoverHistory(f.shippingDeps(), f.shipper)).find((c) => c.courierAccountId === third)).toBeUndefined();
    expect((await refusal(copyHandover(f.shippingDeps(), f.shipper, { batchId: sheet.batchId }))).code).toBe('NOT_HANDED_OVER');
    // b changes after the sheet: it is left out when the batch is handed over
    await db().order.update({ where: { id: b.orderId }, data: { paidMinor: { increment: 1000 } } });
    const done = await completeHandover(f.shippingDeps(), f.shipper, { batchId: sheet.batchId, receivedBy: 'Rider Rahim' });
    expect(done.handedOver).toEqual([a.number]);

    const mine = (await handoverHistory(f.shippingDeps(), f.shipper)).find((c) => c.courierAccountId === third)!;
    expect(mine).toMatchObject({ courierName: 'Steadfast history', totals: { batches: 1, parcels: 1, collectMinor: a.shipment.codAmountMinor } });
    expect(mine.batches).toEqual([expect.objectContaining({ batchId: sheet.batchId, receivedBy: 'Rider Rahim', by: expect.any(String), parcels: 1, collectMinor: a.shipment.codAmountMinor, leftOut: 1, printCount: 1 })]);

    const copy = await copyHandover(f.shippingDeps(), f.shipper, { batchId: sheet.batchId });
    expect(copy).toMatchObject({ batchId: sheet.batchId, printCount: 2, totals: { parcels: 1 }, copy: { receivedBy: 'Rider Rahim', handedOverAt: expect.any(String) } });
    expect(copy.lines.map((l) => l.orderNumber)).toEqual([a.number]);
    expect(await db().printJob.count({ where: { batchId: sheet.batchId, kind: 'HANDOVER_SHEET', isReprint: true, reason: 'copy' } })).toBe(1);
    // nothing about the orders changed
    expect(await db().order.findUniqueOrThrow({ where: { id: b.orderId } })).toMatchObject({ status: 'CONFIRMED' });

    // the owner's days: a batch older than them leaves the history
    f.overrides.set('fulfilment.handover.history', { days: 1, perCourier: 10 });
    try {
      f.clock.now = new Date(f.clock.now.getTime() + 2 * 86_400_000);
      expect((await handoverHistory(f.shippingDeps(), f.shipper)).find((c) => c.courierAccountId === third)).toBeUndefined();
    } finally {
      f.overrides.delete('fulfilment.handover.history');
    }
    expect((await refusal(copyHandover(f.shippingDeps(), f.looker, { batchId: sheet.batchId }))).code).toBe('FORBIDDEN');
    expect((await refusal(copyHandover(f.shippingDeps(), f.shipper, { batchId: '00000000-0000-7000-8000-000000000406' }))).code).toBe('NOT_FOUND');
  });
});
