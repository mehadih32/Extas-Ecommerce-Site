// PR 182 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout,
// booked with Steadfast on its practice world; skipped without TEST_DATABASE_ADMIN_URL): the packing queue and its bulk
// "Start picking" use one filter that never holds a cancelled, held or in-review order (SIM-F-002); each piece is
// checked against the order's lines; a required packing photo stops "Mark packed" and the booking until it is there
// or the owner waives it with a reason (SIM-F-010); the weight check (follow-up 434); an open packing card stops
// packing; the handover needs packed orders by default (follow-up 433); photos past their days are archived. Every
// value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { cancelOrder, confirmOrder, holdOrder } from '@extas/orders';
import { fulfilmentSettings } from '@extas/settings';
import { addPackingPhoto, bookOrders, checkPiece, expirePackingPhotos, handoverList, markPacked, packingOrder, packingQueue, printStickers, startPicking, startPickingAll, waivePackingPhoto } from './index';
import { setUpShipping, type ShippingFixture } from './testing';
import type { Who } from './context';

async function refusal(p: Promise<unknown>): Promise<{ code: string; data?: Record<string, unknown> }> {
  try {
    await p;
    return { code: 'ok' };
  } catch (e) {
    return { code: (e as { code?: string }).code ?? String(e), data: (e as { data?: Record<string, unknown> }).data };
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 182 · the packing step (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  let packer: Who;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  const d = () => f.shippingDeps();
  let n = 0;
  const phone = () => `0170000${String(1820 + ++n).padStart(4, '0')}`;
  const confirmed = async (name: string, opts: Parameters<ShippingFixture['place']>[1] = {}) => {
    const o = await f.place(name, { phone: phone(), ...opts });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    return o;
  };
  const skuOf = async (orderId: string) => (await db().orderItem.findFirstOrThrow({ where: { orderId, status: 'ACTIVE' } })).sku;
  const status = async (orderId: string) => (await db().order.findUniqueOrThrow({ where: { id: orderId } })).status;
  const photoAsset = async () =>
    (await db().mediaAsset.create({ data: { storeId: f.S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `packing/test-${++n}.jpg`, mimeType: 'image/jpeg', bytes: BigInt(1000), checksumSha256: String(n).padStart(64, '0') } })).id;

  beforeAll(async () => {
    f = await setUpShipping('shipping_packing');
    courierId = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
    // a packer: packs, never waives the owner's photo rule
    const p = f.t.prisma;
    const role = await createRole(p, SYSTEM, { key: 'test-packer', nameEn: 'packer', nameBn: 'packer', permissions: ['fulfilment.read', 'fulfilment.pack'] });
    const u = await p.staffUser.create({ data: { email: 'packer@example.com', displayName: 'Packer', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    packer = { actor: { staffUserId: u.id }, storeId: f.S };
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('SIM-F-002: the steps and "Start picking" for all use one filter — never a cancelled, held or in-review order', async () => {
    const ready = await confirmed('pk-ready');
    const cancelled = await confirmed('pk-cancelled');
    await cancelOrder(f.ordersDeps(), f.staff, cancelled.orderId, { reasonCode: 'NOT_ORDERED' });
    const held = await confirmed('pk-held');
    await holdOrder(f.ordersDeps(), f.staff, held.orderId, { reasonKey: 'customer-wait' });
    const review = await confirmed('pk-review');
    await db().fraudAlert.create({ data: { storeId: f.S, orderId: review.orderId, matchedOrderIds: [], severity: 'high', proposedAction: 'HOLD', status: 'OPEN', summary: { section: 'duplicate' } } });
    const placed = await f.place('pk-placed', { phone: phone() });

    const q = await packingQueue(d(), packer, { step: 'pick' });
    expect(q.rows.map((r) => r.orderId)).toEqual([ready.orderId]);
    expect(q.counts).toEqual({ pick: 1, pack: 0, ready: 0, done: 0 });
    expect(q.rows[0]).toMatchObject({ orderNumber: ready.number, step: 'pick', pieces: 1, gift: null, courierName: null, openIssues: 0, photos: 0 });
    const order = await db().order.findUniqueOrThrow({ where: { id: ready.orderId } });
    expect(JSON.stringify(q)).not.toContain(order.customerName!);

    const all = await startPickingAll(d(), packer);
    expect(all).toEqual({ started: [ready.number], skipped: [] });
    expect(await status(ready.orderId)).toBe('PROCESSING');
    expect([await status(cancelled.orderId), await status(held.orderId), await status(review.orderId), await status(placed.orderId)]).toEqual(['CANCELLED', 'ON_HOLD', 'CONFIRMED', 'PLACED']);
    expect((await packingQueue(d(), packer, { step: 'pack' })).rows.map((r) => r.orderId)).toEqual([ready.orderId]);
    // one by one: the order service refuses what is not confirmed
    expect((await refusal(startPicking(d(), packer, cancelled.orderId))).code).toBe('ILLEGAL_TRANSITION');
    expect((await refusal(startPicking(d(), f.looker, review.orderId))).code).toBe('FORBIDDEN');
    expect((await refusal(packingQueue(d(), f.looker))).code).toBe('FORBIDDEN');
  });

  it('each piece is checked against the order: a code on no line or a complete line is refused and nothing is stored; packed only when all are in', async () => {
    const o = await confirmed('pk-scan', { lines: [{ variantId: f.v.skyM, quantity: 2 }, { variantId: f.v.teeM }] });
    const [sky, tee] = [await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId, variantId: f.v.skyM } }), await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId, variantId: f.v.teeM } })];
    expect((await refusal(checkPiece(d(), packer, o.orderId, { code: 'NO-SUCH-SKU' }))).code).toBe('NOT_IN_ORDER');
    expect(await db().packingScan.count({ where: { orderId: o.orderId } })).toBe(0);
    expect((await refusal(markPacked(d(), packer, o.orderId))).code).toBe('NOT_CHECKED');
    // case and spaces never matter; a scan in "confirmed" is the pick
    let v = await checkPiece(d(), packer, o.orderId, { code: ` ${sky.sku.toLowerCase()} ` });
    expect(v.lines.find((l) => l.lineId === sky.id)).toMatchObject({ checked: 1, quantity: 2, done: false });
    v = await checkPiece(d(), packer, o.orderId, { code: sky.sku, source: 'typed' });
    expect(v.lines.find((l) => l.lineId === sky.id)).toMatchObject({ checked: 2, done: true });
    expect((await refusal(checkPiece(d(), packer, o.orderId, { code: sky.sku }))).code).toBe('ALREADY_CHECKED');
    expect(v).toMatchObject({ allChecked: false, blocked: 'NOT_CHECKED' });
    // typing is the owner's choice; ticking needs the tick mode
    f.overrides.set('fulfilment.packing.check', { mode: 'scan', allowTyped: false });
    try {
      expect((await refusal(checkPiece(d(), packer, o.orderId, { code: tee.sku, source: 'typed' }))).code).toBe('CHECK_MODE');
      expect((await refusal(checkPiece(d(), packer, o.orderId, { lineId: tee.id, source: 'tick' }))).code).toBe('CHECK_MODE');
    } finally {
      f.overrides.delete('fulfilment.packing.check');
    }
    v = await checkPiece(d(), packer, o.orderId, { code: tee.sku });
    expect(v).toMatchObject({ allChecked: true, blocked: null, photo: { state: 'off' }, weight: { enabled: false } });
    expect((await refusal(checkPiece(d(), f.looker, o.orderId, { code: tee.sku }))).code).toBe('FORBIDDEN');

    const r = await markPacked(d(), packer, o.orderId, {}, { idempotencyKey: 'pack-0001-aaaa' });
    expect(r).toMatchObject({ command: 'pack', from: 'CONFIRMED', status: 'PACKED' });
    expect(await markPacked(d(), packer, o.orderId, {}, { idempotencyKey: 'pack-0001-aaaa' })).toMatchObject({ replay: true, status: 'PACKED' });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.pack' } });
    expect(ev.data).toMatchObject({ packing: { pieces: 3, photos: 0 } });
    expect(await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).toHaveProperty('packedAt', expect.any(Date));
    expect((await refusal(checkPiece(d(), packer, o.orderId, { code: tee.sku }))).code).toBe('NOT_PACKING');

    // the tick mode: no scanner, one tick checks the whole line
    const t = await confirmed('pk-tick', { lines: [{ variantId: f.v.skyL, quantity: 3 }] });
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: t.orderId } });
    f.overrides.set('fulfilment.packing.check', { mode: 'tick', allowTyped: false });
    try {
      expect((await refusal(checkPiece(d(), packer, t.orderId, { code: line.sku }))).code).toBe('CHECK_MODE');
      expect(await checkPiece(d(), packer, t.orderId, { lineId: line.id, source: 'tick' })).toMatchObject({ allChecked: true });
      expect(await db().packingScan.findFirstOrThrow({ where: { orderId: t.orderId } })).toMatchObject({ quantity: 3, source: 'tick', scannedById: packer.actor.staffUserId });
    } finally {
      f.overrides.delete('fulfilment.packing.check');
    }
  });

  it('SIM-F-010: a required packing photo stops "Mark packed" and the booking; a photo, or the owner\'s override with a reason, lets it go', async () => {
    f.overrides.set('fulfilment.packing.photo', { ...fulfilmentSettings['fulfilment.packing.photo'].default, enabled: true });
    try {
      const a = await confirmed('pk-photo-a');
      const b = await confirmed('pk-photo-b');
      for (const o of [a, b]) await checkPiece(d(), packer, o.orderId, { code: await skuOf(o.orderId) });
      expect(await packingOrder(d(), packer, a.orderId)).toMatchObject({ blocked: 'PHOTO_REQUIRED', photo: { state: 'missing', count: 0, needed: 1 } });
      expect(await refusal(markPacked(d(), packer, a.orderId))).toMatchObject({ code: 'PHOTO_REQUIRED', data: { photos: 0, needed: 1 } });
      expect(await status(a.orderId)).toBe('CONFIRMED');
      // booking waits for the photo too, on every path (the ticked orders here)
      const booked = await bookOrders(d(), f.shipper, { courierAccountId: courierId, orderIds: [a.orderId, b.orderId] });
      expect(booked.results.map((r) => [r.outcome, r.code])).toEqual([
        ['skipped', 'PHOTO_REQUIRED'],
        ['skipped', 'PHOTO_REQUIRED'],
      ]);
      expect(await db().shipment.count({ where: { orderId: { in: [a.orderId, b.orderId] } } })).toBe(0);

      // a: the photo
      const v = await addPackingPhoto(d(), packer, a.orderId, { mediaAssetId: await photoAsset() });
      expect(v).toMatchObject({ blocked: null, photo: { state: 'ok', count: 1 } });
      expect(await markPacked(d(), packer, a.orderId)).toMatchObject({ status: 'PACKED' });
      expect((await db().orderEvent.findFirstOrThrow({ where: { orderId: a.orderId, type: 'order.pack' } })).data).toMatchObject({ packing: { photos: 1 } });
      // b: the owner's override, with a reason; a packer cannot give it
      expect((await refusal(waivePackingPhoto(d(), packer, b.orderId, { reason: 'Camera broken today' }))).code).toBe('FORBIDDEN');
      expect((await refusal(waivePackingPhoto(d(), f.shipper, b.orderId, { reason: '' }))).code).toBe('INVALID_INPUT');
      expect(await waivePackingPhoto(d(), f.shipper, b.orderId, { reason: 'Camera broken today' })).toMatchObject({ blocked: null, photo: { state: 'waived', waivedReason: 'Camera broken today' } });
      expect(await db().auditLog.count({ where: { action: 'packing.photo.waive', entityId: b.orderId } })).toBe(1);
      expect(await markPacked(d(), packer, b.orderId)).toMatchObject({ status: 'PACKED' });
      expect((await db().orderEvent.findFirstOrThrow({ where: { orderId: b.orderId, type: 'order.pack' } })).data).toMatchObject({ packing: { photoWaived: 'Camera broken today' } });
      const again = await bookOrders(d(), f.shipper, { courierAccountId: courierId, orderIds: [a.orderId, b.orderId] });
      expect(again.results.map((r) => r.outcome)).toEqual(['booked', 'booked']);

      // "reminder": asked for, nothing waits
      f.overrides.set('fulfilment.packing.photo', { ...fulfilmentSettings['fulfilment.packing.photo'].default, enabled: true, mode: 'reminder' });
      const c = await confirmed('pk-photo-c');
      await checkPiece(d(), packer, c.orderId, { code: await skuOf(c.orderId) });
      expect(await packingOrder(d(), packer, c.orderId)).toMatchObject({ blocked: null, photo: { state: 'reminder' } });

      // kept for the owner's days, then archived (never deleted)
      f.clock.now = new Date(f.clock.now.getTime() + 31 * 86_400_000);
      expect(await expirePackingPhotos(d(), f.S)).toEqual({ archived: 1 });
      expect(await db().packingPhoto.findFirstOrThrow({ where: { orderId: a.orderId } })).toHaveProperty('archivedAt', expect.any(Date));
      expect(await expirePackingPhotos(d(), f.S)).toEqual({ archived: 0 });
    } finally {
      f.overrides.delete('fulfilment.packing.photo');
    }
    expect((await refusal(addPackingPhoto(d(), packer, (await confirmed('pk-photo-off')).orderId, { mediaAssetId: await photoAsset() }))).code).toBe('PHOTO_OFF');
  });

  it('follow-up 434: a reading far from the pieces\' weight is weighed again or confirmed; a reading can be required; no weight is guessed', async () => {
    await db().productVariant.update({ where: { id: f.v.whiteM }, data: { weightGrams: 250 } });
    f.overrides.set('fulfilment.packing.weight', { ...fulfilmentSettings['fulfilment.packing.weight'].default, enabled: true, requireReading: true });
    try {
      const o = await confirmed('pk-weight', { lines: [{ variantId: f.v.whiteM, quantity: 2 }] });
      const sku = await skuOf(o.orderId);
      await checkPiece(d(), packer, o.orderId, { code: sku });
      await checkPiece(d(), packer, o.orderId, { code: sku });
      expect(await packingOrder(d(), packer, o.orderId)).toMatchObject({ blocked: 'WEIGHT_REQUIRED', weight: { enabled: true, expectedGrams: 500, weighedGrams: null } });
      expect((await refusal(markPacked(d(), packer, o.orderId))).code).toBe('WEIGHT_REQUIRED');
      expect(await refusal(markPacked(d(), packer, o.orderId, { weighedGrams: 800 }))).toMatchObject({ code: 'WEIGHT_GAP', data: { expectedGrams: 500, weighedGrams: 800, gapGrams: 300, gapPercent: 60, big: true } });
      expect(await status(o.orderId)).toBe('CONFIRMED');
      // within the owner's gap: packed, the reading kept
      expect(await markPacked(d(), packer, o.orderId, { weighedGrams: 540 })).toMatchObject({ status: 'PACKED' });
      expect(await db().packingCheck.findFirstOrThrow({ where: { orderId: o.orderId } })).toMatchObject({ weighedGrams: 540, expectedGrams: 500, weightGapConfirmed: false, weighedById: packer.actor.staffUserId });

      const p = await confirmed('pk-weight-gap', { lines: [{ variantId: f.v.whiteM }] });
      await checkPiece(d(), packer, p.orderId, { code: await skuOf(p.orderId) });
      expect(await markPacked(d(), packer, p.orderId, { weighedGrams: 900, weightConfirmed: true })).toMatchObject({ status: 'PACKED' });
      expect(await db().packingCheck.findFirstOrThrow({ where: { orderId: p.orderId } })).toMatchObject({ weighedGrams: 900, weightGapConfirmed: true });

      // a piece without a weight: nothing is compared (never guessed)
      const q = await confirmed('pk-weight-none', { lines: [{ variantId: f.v.linenM }] });
      await checkPiece(d(), packer, q.orderId, { code: await skuOf(q.orderId) });
      expect(await markPacked(d(), packer, q.orderId, { weighedGrams: 5000 })).toMatchObject({ status: 'PACKED' });
    } finally {
      f.overrides.delete('fulfilment.packing.weight');
    }
  });

  it('an open packing card stops packing; follow-up 433: by default only a packed order goes on the handover sheet', async () => {
    const o = await confirmed('pk-issue');
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    await checkPiece(d(), packer, o.orderId, { code: line.sku });
    const card = await db().packingIssue.create({ data: { storeId: f.S, orderId: o.orderId, orderItemId: line.id, kind: 'SHORTAGE' } });
    expect((await refusal(markPacked(d(), packer, o.orderId))).code).toBe('PACKING_ISSUE_OPEN');
    expect((await packingQueue(d(), packer, { step: 'pick' })).rows.find((r) => r.orderId === o.orderId)).toMatchObject({ openIssues: 1 });
    await db().packingIssue.update({ where: { id: card.id }, data: { resolution: 'STOCK_FOUND', resolvedAt: new Date() } });

    // booked and its sticker printed, but not packed: not ready for the rider
    const booked = await bookOrders(d(), f.shipper, { courierAccountId: courierId, orderIds: [o.orderId] });
    expect(booked.results[0]).toMatchObject({ outcome: 'booked' });
    const s = await db().shipment.findFirstOrThrow({ where: { orderId: o.orderId } });
    await printStickers(d(), f.shipper, { shipmentIds: [s.id] });
    const parcel = () => handoverList(d(), f.shipper).then((l) => l.flatMap((c) => c.parcels).find((p) => p.shipmentId === s.id));
    expect(await parcel()).toMatchObject({ problem: 'NOT_PACKED' });
    await markPacked(d(), packer, o.orderId);
    expect(await parcel()).toMatchObject({ problem: null });
    expect(await packingOrder(d(), packer, o.orderId)).toMatchObject({ step: 'ready', parcel: { shipmentId: s.id, courierName: 'Steadfast main', printCount: 1 } });
    expect((await packingQueue(d(), packer, { step: 'ready' })).rows.find((r) => r.orderId === o.orderId)).toMatchObject({ courierName: 'Steadfast main', consignmentId: s.consignmentId });
  });
});
