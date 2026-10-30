// PR 610, 611 (CN-028, ERP contract v6) on a real PostgreSQL (a throwaway database with the real migrations; skipped
// without TEST_DATABASE_ADMIN_URL): orders to the ERP v6 — one line per piece with its whole-taka price, the answer
// kept (erpTotal, shop prices, Return stock), the "not now" refusals HELD and sent again by themselves with a new key
// round (account on hold → checkout paused; stock; shop price; a short line), the catch-up of lost line webhooks
// (follow-up 490), the shipment at pickup and every delivery result. The ERP is the practice ERP behind LIVE
// connections (its fetch replaces the network); every key and secret is made up here; the clock is fixed.
// CN-029 §16: store A and store B are each their own ERP company, and nothing of one ever reaches the other.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allAdapters, createConnections, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, mockErp } from '@extas/adapters';
import { SYSTEM, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createColour, createProduct, createSize, createVariant, type CatalogueDeps } from '@extas/catalogue';
import { registry, type Key, type Value } from '@extas/settings';
import {
  applyErpEvents,
  BILLED_AT_MISSING,
  checkErpOrders,
  createWarehouse,
  enqueueErpDelivery,
  enqueueErpShipment,
  enqueueOrderPush,
  erpCheckoutPaused,
  erpHoldNotice,
  erpOrderLinesOf,
  erpOrderOf,
  erpOrderView,
  holdCart,
  orderLinkOf,
  pushCounts,
  receiveErpWebhook,
  relayErpPushes,
  SUPERSEDED_BY_REVISION,
  syncHealth,
  v6OrderDocument,
  type OrderPushInput,
  type SettingsReader,
  type WebhookDeps,
} from '../src';

const T0 = new Date('2026-10-23T04:00:00Z');
const COMBO = randomUUID();
const BASE = 'https://erp.example.test';

describe.skipIf(!HAS_TEST_DB)('PR 610, 611 on PostgreSQL: orders, shipments and delivery results to the ERP v6', () => {
  let t: TestDatabase;
  let storeA = 0;
  let storeB = 0;
  let clock = T0;
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      if (overrides.has(sk)) return overrides.get(sk) as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const vaultValues = new Map<string, string>();
  const vaultKey = (name: string, storeId: number | null) => `${storeId ?? '-'}:${name}`;
  let connections: ReturnType<typeof createConnections>;
  const deps = (): WebhookDeps => ({ db: t.prisma, settings, connections, now: () => clock, sleep: async () => {}, random: () => 0.5 });
  const catDeps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const world = mockErp();
  const realFetch = globalThis.fetch;
  const secret = randomBytes(24).toString('hex');
  const secretB = randomBytes(24).toString('hex');
  const deliver = (w: { body: string; headers: Record<string, string> }) =>
    receiveErpWebhook(deps(), { rawBody: w.body, signature: w.headers[ERP_SIGNATURE_HEADER] ?? null, timestamp: w.headers[ERP_TIMESTAMP_HEADER] ?? null, idempotencyKey: null, deliveryId: w.headers['x-extas-delivery'] ?? null });
  /** Every v6 event the practice ERP has for a store, delivered as its signed webhook, then applied. */
  const deliverAll = async (company?: string) => {
    for (const h of world.v6Webhooks(company === 'SAMPLE-CO-2' ? secretB : secret, company)) await deliver(h);
    return applyErpEvents(deps());
  };
  let n = 0;
  /** A confirmed order as the order service queues it (its order items have their own ids). */
  const order = (storeId: number, lines: { sku: string; quantity?: number; unit: number; total?: number; combo?: string }[], extra: Partial<OrderPushInput> = {}) => {
    n++;
    const orderId = randomUUID();
    const input: OrderPushInput = {
      storeId,
      orderId,
      externalOrderId: `SAMPLE-${n}`,
      customerName: 'Sample customer',
      customerPhone: '01700000000',
      shippingAddress: 'Sample address',
      paymentMethod: 'COD',
      items: lines.map((l) => ({
        sku: l.sku,
        quantity: l.quantity ?? 1,
        unitPriceMinor: l.unit * 100,
        orderItemId: randomUUID(),
        lineTotalMinor: Math.round((l.total ?? l.unit * (l.quantity ?? 1)) * 100),
        ...(l.combo ? { comboId: COMBO, comboGroupKey: l.combo } : {}),
      })),
      shippingFeeMinor: 6_000,
      ...extra,
    };
    return { orderId, ext: input.externalOrderId, input };
  };
  const pushOf = (storeId: number, referenceId: string, documentType = 'order.create') => t.prisma.erpPush.findFirstOrThrow({ where: { storeId, referenceId, documentType }, orderBy: { createdAt: 'desc' } });

  beforeAll(async () => {
    t = await createTestDatabase('erpord6');
    [storeA, storeB] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string, scope?: { storeId?: number | null }) => vaultValues.get(vaultKey(name, scope?.storeId ?? null)) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    await createWarehouse(deps(), { actor: SYSTEM, storeId: storeA }, { code: 'WH-A', name: 'Sample warehouse A', erpWarehouseId: 'SAMPLE-WH-1' });
    // One shop variant whose ERP shop price is not set yet (NO_SHOP_PRICE).
    const navy = (await createColour(catDeps(), { actor: SYSTEM, storeId: storeA }, { nameEn: 'Navy', hex: '1b2a4a' })).colour;
    const m = await createSize(catDeps(), { actor: SYSTEM, storeId: storeA }, { label: 'M' });
    const tee = await createProduct(catDeps(), { actor: SYSTEM, storeId: storeA }, { nameEn: 'Sample Tee', erpStyleCode: 'TEE' });
    await createVariant(catDeps(), { actor: SYSTEM, storeId: storeA }, { sku: 'TEE-NAVY-M', productId: tee.id, colourId: navy.id, sizeId: m.id, barcode: 'BC-TEE-M' });

    world.reset();
    world.now = () => clock;
    const keyA = randomBytes(16).toString('hex');
    const keyB = randomBytes(16).toString('hex');
    for (const [store, key, hook] of [[storeA, keyA, secret], [storeB, keyB, secretB]] as const) {
      vaultValues.set(vaultKey('extasErp.apiKey', store), key);
      vaultValues.set(vaultKey('extasErp.webhookSecret', store), hook);
      vaultValues.set(vaultKey('extasErp.signingSecret', store), randomBytes(24).toString('hex'));
    }
    world.acceptKey(keyA, 'SAMPLE-CO-1');
    world.acceptKey(keyB, 'SAMPLE-CO-2');
    globalThis.fetch = world.fetch as typeof fetch;
    for (const co of ['SAMPLE-CO-1', 'SAMPLE-CO-2']) {
      const wh = co === 'SAMPLE-CO-1' ? 'SAMPLE-WH-1' : 'SAMPLE-WH-3';
      for (const [sku, price] of [['POLO-NAVY-M', 650], ['POLO-NAVY-L', 700], ['POLO-BLACK-XL', 650]] as const) {
        world.setVariant({ sku, styleCode: 'POLO', styleName: 'Sample polo', color: 'NAVY', size: 'M', shopPrice: price, grade: 'A' }, co);
        world.setStock(sku, wh, { onHand: 20 }, co);
      }
    }
    world.setVariant({ sku: 'TEE-NAVY-M', barcode: 'BC-TEE-M', styleCode: 'TEE' });
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 4 });
    const connection = (storeId: number) => ({ storeId, kind: 'ERP' as const, provider: 'extasErp', name: 'extasErp', mode: 'LIVE' as const, enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] });
    await t.prisma.integration.create({ data: connection(storeA) });
    await t.prisma.integration.create({ data: connection(storeB) });
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await t?.drop();
  });
  beforeEach(() => {
    clock = new Date(clock.getTime() + 60_000);
  });

  it('v5 is unchanged: the same order goes as one line per SKU with its quantity, and no ErpOrder rows are written', async () => {
    const o = order(storeA, [{ sku: 'POLO-NAVY-M', quantity: 2, unit: 650 }]);
    await enqueueOrderPush(deps(), o.input);
    const row = await pushOf(storeA, o.orderId);
    const items = (row.requestBody as { body: { items: Record<string, unknown>[] } }).body.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sku: 'POLO-NAVY-M', quantity: 2 });
    expect(items[0]).not.toHaveProperty('lineId');
    expect(await t.prisma.erpOrder.count()).toBe(0);
    // Kept as it is (never sent in this file: the store moves to v6 next, which retires nothing of order.create).
    await t.prisma.erpPush.update({ where: { id: row.id }, data: { status: 'FAILED', lastError: 'TEST_V5_ONLY' } });
  });

  let a1 = { orderId: '', ext: '' };
  it('PR 610: a v6 order is one line per piece (quantity 1, its own lineId) priced in whole taka, with delivery charge and advance', async () => {
    overrides.set(`erp.model@${storeA}`, 'v6');
    overrides.set(`erp.model@${storeB}`, 'v6');
    const o = order(storeA, [{ sku: 'POLO-NAVY-M', quantity: 2, unit: 650 }, { sku: 'POLO-NAVY-L', unit: 700, total: 533.33, combo: 'set' }, { sku: 'POLO-BLACK-XL', unit: 650, total: 533.33, combo: 'set' }, { sku: 'POLO-NAVY-M', unit: 650, total: 533.34, combo: 'set' }], { orderDiscountMinor: 0, advancePaidMinor: 50_000 });
    a1 = { orderId: o.orderId, ext: o.ext };
    await enqueueOrderPush(deps(), o.input);
    const row = await pushOf(storeA, o.orderId);
    const body = (row.requestBody as { body: Record<string, unknown> }).body;
    expect(body).toMatchObject({ deliveryCharge: 60, advancePaid: 500 });
    const items = body.items as Record<string, unknown>[];
    expect(items.map((i) => [i.lineId, i.sku, i.quantity, i.customerPrice])).toEqual([
      [`${o.ext}-1`, 'POLO-NAVY-M', 1, 650],
      [`${o.ext}-2`, 'POLO-NAVY-M', 1, 650],
      [`${o.ext}-3`, 'POLO-NAVY-L', 1, 533],
      [`${o.ext}-4`, 'POLO-BLACK-XL', 1, 533],
      [`${o.ext}-5`, 'POLO-NAVY-M', 1, 534],
    ]);
    expect(items[2]).toMatchObject({ unitPrice: '700.00', discount: '167.00', grade: 'A' });
    expect([items[0]!.comboId, items[2]!.comboId, items[3]!.comboId, items[4]!.comboId]).toEqual([null, COMBO, COMBO, COMBO]);
    const eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: o.orderId }))!;
    expect(eo.externalOrderId).toBe(o.ext);
    expect((await erpOrderLinesOf(t.prisma, eo.id)).map((l) => [l.lineId, l.piece, l.customerPriceMinor, l.state])).toEqual([
      [`${o.ext}-1`, 1, 65_000, 'OPEN'],
      [`${o.ext}-2`, 2, 65_000, 'OPEN'],
      [`${o.ext}-3`, 1, 53_300, 'OPEN'],
      [`${o.ext}-4`, 1, 53_300, 'OPEN'],
      [`${o.ext}-5`, 1, 53_400, 'OPEN'],
    ]);
  });

  it("PR 610: the ERP's answer is kept: erpTotal, each line's shop price, accepted", async () => {
    const out = await relayErpPushes(deps(), { storeId: storeA });
    expect(out).toMatchObject({ sent: 1, held: 0, failed: 0 });
    const eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: a1.orderId }))!;
    expect(eo.acceptedAt?.getTime()).toBe(clock.getTime());
    expect(Number(eo.erpTotalMinor)).toBe((650 * 3 + 700 + 650) * 100);
    expect(eo.erpOrderId).toMatch(/^SAMPLE-SO/);
    const lines = await erpOrderLinesOf(t.prisma, eo.id);
    expect(lines.map((l) => [l.shopPriceMinor, l.fromReturnStock])).toEqual([
      [65_000, false],
      [65_000, false],
      [70_000, false],
      [65_000, false],
      [65_000, false],
    ]);
  });

  it('PR 610: a revision keeps every line id; a new piece gets the next id, a piece that left is REMOVED', async () => {
    const link = (await orderLinkOf(deps(), storeA))!;
    const eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: a1.orderId }))!;
    const before = await erpOrderLinesOf(t.prisma, eo.id);
    const items = before.filter((l) => l.piece === 1 && l.lineId !== `${a1.ext}-5`).map((l) => ({ orderItemId: l.orderItemId!, sku: l.sku, quantity: 1, unitPriceMinor: 65_000, lineTotalMinor: 65_000 }));
    const doc = await t.prisma.$transaction((tx) =>
      v6OrderDocument(tx, link.id, { storeId: storeA, orderId: a1.orderId, externalOrderId: a1.ext, customerName: 'S', customerPhone: '01700000000', shippingAddress: 'S', paymentMethod: 'COD', note: null, items: [...items, { orderItemId: randomUUID(), sku: 'POLO-NAVY-L', quantity: 1, unitPriceMinor: 70_000, lineTotalMinor: 70_000 }], orderDiscountMinor: 0, deliveryChargeMinor: 0, advancePaidMinor: 0 }, 2),
    );
    const ids = (doc as { body: { items: { lineId: string }[] } }).body.items.map((i) => i.lineId);
    expect(ids).toEqual([`${a1.ext}-1`, `${a1.ext}-3`, `${a1.ext}-4`, `${a1.ext}-6`]);
    const after = await erpOrderLinesOf(t.prisma, eo.id);
    expect(after.filter((l) => l.state === 'REMOVED').map((l) => l.lineId)).toEqual([`${a1.ext}-2`, `${a1.ext}-5`]);
    // Put back as the ERP has it (the revision was only built, never queued).
    await t.prisma.erpOrderLine.updateMany({ where: { erpOrderId: eo.id, lineId: { in: [`${a1.ext}-2`, `${a1.ext}-5`] } }, data: { state: 'OPEN' } });
    await t.prisma.erpOrderLine.deleteMany({ where: { erpOrderId: eo.id, lineId: `${a1.ext}-6` } });
  });

  it('PR 610: 409 ACCOUNT_ON_HOLD — the order waits HELD, checkout pauses (v6 store only, while the setting is on), and goes again on account.released with a new key', async () => {
    world.v6().hold('PAYMENT_OVERDUE');
    const o = order(storeA, [{ sku: 'POLO-NAVY-M', unit: 650 }]);
    await enqueueOrderPush(deps(), o.input);
    expect(await relayErpPushes(deps(), { storeId: storeA })).toMatchObject({ held: 1, sent: 0, failed: 0 });
    let row = await pushOf(storeA, o.orderId);
    expect([row.status, row.heldReason, row.keyRound]).toEqual(['HELD', 'ACCOUNT_ON_HOLD', 0]);
    const eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: o.orderId }))!;
    expect([eo.refusal, eo.acceptedAt]).toEqual(['ACCOUNT_ON_HOLD', null]);
    expect((await pushCounts(t.prisma, storeA)).held).toBe(1);
    // Checkout pauses in store A only; never in store B; never with the owner's switch off.
    expect(await erpCheckoutPaused(deps(), storeA)).toMatchObject({ paused: true, reason: 'PAYMENT_OVERDUE' });
    expect((await erpCheckoutPaused(deps(), storeB)).paused).toBe(false);
    overrides.set(`erp.hold.pauseCheckout@${storeA}`, false);
    expect((await erpCheckoutPaused(deps(), storeA)).paused).toBe(false);
    overrides.delete(`erp.hold.pauseCheckout@${storeA}`);
    expect(await erpHoldNotice(deps(), storeA)).toMatchObject({ onHold: true, warn: true, checkoutPaused: true });
    // In v5 a hold never pauses anything.
    overrides.set(`erp.model@${storeA}`, 'v5');
    expect((await erpCheckoutPaused(deps(), storeA)).paused).toBe(false);
    overrides.set(`erp.model@${storeA}`, 'v6');
    // The relay leaves it alone while it is HELD.
    expect((await relayErpPushes(deps(), { storeId: storeA })).sent).toBe(0);

    world.v6().release();
    const applied = await deliverAll();
    expect(applied.applied).toBeGreaterThanOrEqual(2); // account.hold, then account.released
    row = await pushOf(storeA, o.orderId);
    expect([row.status, row.heldReason, row.keyRound]).toEqual(['PENDING', null, 1]);
    expect((await erpCheckoutPaused(deps(), storeA)).paused).toBe(false);
    // The ERP kept its 409 against the first key; the new round's key gets a real answer.
    expect(await relayErpPushes(deps(), { storeId: storeA })).toMatchObject({ sent: 1, replayed: 0 });
    row = await pushOf(storeA, o.orderId);
    expect(row.status).toBe('SENT');
    const sent = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: o.orderId }))!;
    expect([sent.refusal, !!sent.acceptedAt]).toEqual([null, true]);
  });

  it('PR 610: 409 INSUFFICIENT_STOCK — HELD; the order check sends it again (a new key) once the ERP has the stock', async () => {
    world.setStock('POLO-BLACK-XL', 'SAMPLE-WH-1', { onHand: 0 });
    const o = order(storeA, [{ sku: 'POLO-BLACK-XL', quantity: 2, unit: 650 }]);
    await enqueueOrderPush(deps(), o.input);
    expect((await relayErpPushes(deps(), { storeId: storeA })).held).toBe(1);
    const eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: o.orderId }))!;
    expect(eo.refusal).toBe('INSUFFICIENT_STOCK');
    expect(eo.refusalDetails).toMatchObject({ shortSkus: [{ sku: 'POLO-BLACK-XL', wanted: 2, available: 0 }] });
    // Still short: it waits.
    expect(await checkErpOrders(deps(), { storeId: storeA })).toMatchObject({ status: 'ok', onHold: false, woken: 0 });
    world.setStock('POLO-BLACK-XL', 'SAMPLE-WH-1', { onHand: 5 });
    expect((await checkErpOrders(deps(), { storeId: storeA })).woken).toBe(1);
    expect((await pushOf(storeA, o.orderId)).keyRound).toBe(1);
    expect((await relayErpPushes(deps(), { storeId: storeA })).sent).toBe(1);
  });

  it('PR 610 (qa-gate): a HELD order that staff changed since — the old revision never goes out again and never rolls the ERP order back', async () => {
    world.setStock('POLO-BLACK-XL', 'SAMPLE-WH-1', { onHand: 0 });
    const o = order(storeA, [{ sku: 'POLO-BLACK-XL', quantity: 2, unit: 650 }]);
    await enqueueOrderPush(deps(), o.input);
    expect((await relayErpPushes(deps(), { storeId: storeA })).held).toBe(1);
    const r0 = await pushOf(storeA, o.orderId);
    expect([r0.status, r0.heldReason]).toEqual(['HELD', 'INSUFFICIENT_STOCK']);
    // Staff change the order to a SKU the ERP has (the order page's "send again"): revision 1, which the ERP takes.
    const r1 = order(storeA, [{ sku: 'POLO-NAVY-M', unit: 650 }]);
    await enqueueOrderPush(deps(), { ...r1.input, orderId: o.orderId, externalOrderId: o.ext, revision: 1 });
    // The old revision is kept, never deleted: FAILED, superseded by the new one.
    const old = await t.prisma.erpPush.findUniqueOrThrow({ where: { id: r0.id } });
    expect([old.status, old.lastError, old.heldReason]).toEqual(['FAILED', SUPERSEDED_BY_REVISION, 'INSUFFICIENT_STOCK']);
    expect(await relayErpPushes(deps(), { storeId: storeA })).toMatchObject({ sent: 1, held: 0 });
    const eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: o.orderId }))!;
    expect([eo.refusal, eo.refusedAt, !!eo.acceptedAt]).toEqual([null, null, true]);
    const pushesOut = async () => (await t.prisma.erpPush.findMany({ where: { storeId: storeA, referenceId: o.orderId, documentType: 'order.create', sentAt: { not: null } }, select: { idempotencyKey: true } })).map((r) => r.idempotencyKey);
    expect(await pushesOut()).toEqual([`order:${o.orderId}:create:r1`]);
    // A row left HELD from before this fix (or a race): past the wait and with the stock back, neither the order check
    // nor the relay sends it; it is marked superseded instead.
    await t.prisma.erpPush.update({ where: { id: r0.id }, data: { status: 'HELD', lastError: null } });
    world.setStock('POLO-BLACK-XL', 'SAMPLE-WH-1', { onHand: 5 });
    clock = new Date(clock.getTime() + (registry['erp.orders.refusedRetryMinutes'].default + 1) * 60_000);
    expect((await checkErpOrders(deps(), { storeId: storeA })).woken).toBe(0);
    expect((await t.prisma.erpPush.findUniqueOrThrow({ where: { id: r0.id } })).status).toBe('FAILED');
    // ...and a superseded row put back by hand (PENDING) is not sent by the relay either.
    await t.prisma.erpPush.update({ where: { id: r0.id }, data: { status: 'PENDING', lastError: null, keyRound: 1 } });
    expect(await relayErpPushes(deps(), { storeId: storeA })).toMatchObject({ sent: 0 });
    const after = await t.prisma.erpPush.findUniqueOrThrow({ where: { id: r0.id } });
    expect([after.status, after.lastError, after.sentAt]).toEqual(['FAILED', SUPERSEDED_BY_REVISION, null]);
    expect(await pushesOut()).toEqual([`order:${o.orderId}:create:r1`]);
    const lines = await erpOrderLinesOf(t.prisma, eo.id);
    expect(lines.filter((l) => l.state !== 'REMOVED').map((l) => l.sku)).toEqual(['POLO-NAVY-M']);
  });

  it('PR 610: 409 NO_SHOP_PRICE — HELD, and that SKU stops selling until the ERP takes it', async () => {
    const o = order(storeA, [{ sku: 'TEE-NAVY-M', unit: 900 }]);
    await enqueueOrderPush(deps(), o.input);
    expect((await relayErpPushes(deps(), { storeId: storeA })).held).toBe(1);
    expect((await pushOf(storeA, o.orderId)).heldReason).toBe('NO_SHOP_PRICE');
    const v = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku: 'TEE-NAVY-M' }, select: { shopPriceMissingAt: true } });
    expect(v.shopPriceMissingAt?.getTime()).toBe(clock.getTime());
    // The owner sets the shop price in the ERP; the order check sends it again after the owner's wait at the latest.
    world.setShopPrice('TEE-NAVY-M', 900);
    world.v6().takeEvents();
    expect((await checkErpOrders(deps(), { storeId: storeA })).woken).toBe(0);
    clock = new Date(clock.getTime() + (registry['erp.orders.refusedRetryMinutes'].default + 1) * 60_000);
    expect((await checkErpOrders(deps(), { storeId: storeA })).woken).toBe(1);
    expect((await relayErpPushes(deps(), { storeId: storeA })).sent).toBe(1);
    expect((await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku: 'TEE-NAVY-M' }, select: { shopPriceMissingAt: true } })).shopPriceMissingAt).toBeNull();
  });

  it('PR 610 (qa-gate): NO_SHOP_PRICE, then the order is cancelled — after the wait the order check lets the SKU sell again', async () => {
    const s = await createSize(catDeps(), { actor: SYSTEM, storeId: storeA }, { label: 'S' });
    const tee = await t.prisma.product.findFirstOrThrow({ where: { storeId: storeA, erpStyleCode: 'TEE' }, select: { id: true } });
    const navy = await t.prisma.productVariant.findFirstOrThrow({ where: { storeId: storeA, sku: 'TEE-NAVY-M' }, select: { colourId: true } });
    const v = await createVariant(catDeps(), { actor: SYSTEM, storeId: storeA }, { sku: 'TEE-NAVY-S', productId: tee.id, colourId: navy.colourId!, sizeId: s.id, barcode: 'BC-TEE-S' });
    world.setVariant({ sku: 'TEE-NAVY-S', barcode: 'BC-TEE-S', styleCode: 'TEE' });
    world.setStock('TEE-NAVY-S', 'SAMPLE-WH-1', { onHand: 4 });
    const loc = await t.prisma.inventoryLocation.findFirstOrThrow({ where: { warehouse: { code: 'WH-A' } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    await t.prisma.stockLevel.create({ data: { variantId: v.id, locationId: loc.id, onHand: 4, available: 4, erpUpdatedAt: clock } });
    const o = order(storeA, [{ sku: 'TEE-NAVY-S', unit: 900 }]);
    await t.prisma.order.create({ data: { id: o.orderId, storeId: storeA, number: o.ext, source: 'WEBSITE', currency: 'BDT', status: 'CONFIRMED', subtotalMinor: 90_000, totalMinor: 90_000, paymentMethod: 'COD', idempotencyKey: `nsp-${o.orderId}` } });
    await enqueueOrderPush(deps(), o.input);
    expect((await relayErpPushes(deps(), { storeId: storeA })).held).toBe(1);
    const cart = async () => (await t.prisma.cart.create({ data: { storeId: storeA, visitorId: `sample-${randomUUID()}`, lastActivityAt: clock } })).id;
    const hold = async () => holdCart(deps(), { storeId: storeA, cartId: await cart(), lines: [{ variantId: v.id, quantity: 1 }] }).then(() => 'held', (e: { details?: string[] }) => (e.details ?? []).join(','));
    expect(await hold()).toBe('TEE-NAVY-S:0');
    // The admin sees which SKUs are not sold and why.
    expect((await syncHealth(deps(), { actor: SYSTEM, storeId: storeA })).noShopPrice).toMatchObject({ count: 1, skus: ['TEE-NAVY-S'] });
    // The customer cancels; the order never reached the ERP. Before the wait nothing changes.
    await t.prisma.order.update({ where: { id: o.orderId }, data: { status: 'CANCELLED' } });
    expect((await checkErpOrders(deps(), { storeId: storeA })).skusFreed).toBe(0);
    expect(await hold()).toBe('TEE-NAVY-S:0');
    // After the wait: the cancelled order is never sent (kept FAILED) and the SKU sells again; the next real order asks the ERP again.
    clock = new Date(clock.getTime() + (registry['erp.orders.refusedRetryMinutes'].default + 1) * 60_000);
    expect(await checkErpOrders(deps(), { storeId: storeA })).toMatchObject({ woken: 0, skusFreed: 1 });
    expect((await pushOf(storeA, o.orderId)).status).toBe('FAILED');
    expect(await hold()).toBe('held');
    expect((await syncHealth(deps(), { actor: SYSTEM, storeId: storeA })).noShopPrice).toMatchObject({ count: 0, skus: [] });
    expect((await relayErpPushes(deps(), { storeId: storeA })).sent).toBe(0);
  });

  let short = { orderId: '', ext: '' };
  it('PR 610: a piece from Return stock is marked; it fails the packing check → order.line.short; the shipment waits HELD (LINE_WAITING)', async () => {
    world.setVariant({ sku: 'POLO-GREY-M', styleCode: 'POLO', styleName: 'Sample polo', color: 'GREY', size: 'M', shopPrice: 600, grade: 'A' });
    world.setStock('POLO-GREY-M', 'SAMPLE-WH-1', { onHand: 0, returnStock: 1 });
    const o = order(storeA, [{ sku: 'POLO-GREY-M', unit: 800 }, { sku: 'POLO-NAVY-M', unit: 650 }]);
    short = { orderId: o.orderId, ext: o.ext };
    await enqueueOrderPush(deps(), o.input);
    expect((await relayErpPushes(deps(), { storeId: storeA })).sent).toBe(1);
    const eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: o.orderId }))!;
    expect((await erpOrderLinesOf(t.prisma, eo.id)).map((l) => [l.lineId, l.fromReturnStock])).toEqual([
      [`${o.ext}-1`, true],
      [`${o.ext}-2`, false],
    ]);
    const view = (await erpOrderView(deps(), { actor: SYSTEM, storeId: storeA }, o.orderId))!;
    expect(view.lines[0]).toMatchObject({ fromReturnStock: true, shopPriceMinor: 60_000, state: 'OPEN' });

    world.v6().failPackingCheck(o.ext, `${o.ext}-1`);
    await deliverAll();
    const line = await t.prisma.erpOrderLine.findFirstOrThrow({ where: { erpOrderId: eo.id, lineId: `${o.ext}-1` } });
    expect([line.state, line.shortReason]).toEqual(['SHORT', 'RETURN_PIECE_FAILED_CHECK']);
    await enqueueErpShipment(deps(), { storeId: storeA, orderId: o.orderId, courier: 'PATHAO', consignmentId: `C-${o.ext}`, chargeMinor: 6_000, pickedUpAt: clock });
    expect((await relayErpPushes(deps(), { storeId: storeA })).held).toBe(1);
    expect((await pushOf(storeA, o.orderId, 'shipment.create')).heldReason).toBe('LINE_WAITING');
    expect((await erpOrderView(deps(), { actor: SYSTEM, storeId: storeA }, o.orderId))!.held).toMatchObject({ reason: 'LINE_WAITING' });
  });

  it('PR 610: WAIT at the ERP, then the stock comes → order.line.filled: the line is open and the shipment goes again', async () => {
    world.v6().lineDecision(short.ext, `${short.ext}-1`, { action: 'WAIT' });
    world.setStock('POLO-GREY-M', 'SAMPLE-WH-1', { onHand: 1 });
    world.v6().fillWaiting();
    await deliverAll();
    const eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: short.orderId }))!;
    expect((await t.prisma.erpOrderLine.findFirstOrThrow({ where: { erpOrderId: eo.id, lineId: `${short.ext}-1` } })).state).toBe('OPEN');
    const ship = await pushOf(storeA, short.orderId, 'shipment.create');
    expect([ship.status, ship.keyRound]).toEqual(['PENDING', 1]);
    expect((await relayErpPushes(deps(), { storeId: storeA })).sent).toBe(1);
    const billed = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: short.orderId }))!;
    expect(!!billed.billedAt && !!billed.shipmentSentAt).toBe(true);
    expect([billed.consignmentId, billed.courier]).toEqual([`C-${short.ext}`, 'PATHAO']);
  });

  it('Follow-up 490: a lost order.line.short webhook is caught up from GET /orders/{id} by the order check', async () => {
    world.setVariant({ sku: 'POLO-OLIVE-M', styleCode: 'POLO', styleName: 'Sample polo', color: 'OLIVE', size: 'M', shopPrice: 600, grade: 'A' });
    world.setStock('POLO-OLIVE-M', 'SAMPLE-WH-1', { onHand: 0, returnStock: 1 });
    const o = order(storeA, [{ sku: 'POLO-OLIVE-M', unit: 800 }]);
    await enqueueOrderPush(deps(), o.input);
    await relayErpPushes(deps(), { storeId: storeA });
    world.v6().failPackingCheck(o.ext, `${o.ext}-1`);
    world.v6().takeEvents(); // the webhook is lost
    const r = await checkErpOrders(deps(), { storeId: storeA });
    expect(r.status).toBe('ok');
    expect(r.caughtUp).toBeGreaterThanOrEqual(1);
    expect(r.linesFixed).toBeGreaterThanOrEqual(1);
    const eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: o.orderId }))!;
    expect((await t.prisma.erpOrderLine.findFirstOrThrow({ where: { erpOrderId: eo.id } })).state).toBe('SHORT');
    // The ERP's admin cancels the line there: the next check reads it, and nothing of it is billed.
    world.v6().lineDecision(o.ext, `${o.ext}-1`, { action: 'CANCEL', reason: 'sample' });
    await checkErpOrders(deps(), { storeId: storeA });
    expect((await t.prisma.erpOrderLine.findFirstOrThrow({ where: { erpOrderId: eo.id } })).state).toBe('CANCELLED');
  });

  it('PR 611: the shipment at pickup bills the order once; every courier result goes once by PUT /orders/{id}/delivery', async () => {
    const pick = { storeId: storeA, orderId: a1.orderId, courier: 'PATHAO', consignmentId: 'C-A1', chargeMinor: 6_000, pickedUpAt: clock };
    expect((await enqueueErpShipment(deps(), pick))!.created).toBe(true);
    expect((await enqueueErpShipment(deps(), pick))!.created).toBe(false);
    expect((await relayErpPushes(deps(), { storeId: storeA })).sent).toBe(1);
    let eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: a1.orderId }))!;
    expect(!!eo.billedAt).toBe(true);
    const doc = (await pushOf(storeA, a1.orderId, 'shipment.create')).requestBody as { body: Record<string, unknown> };
    expect(doc.body).toMatchObject({ externalOrderId: a1.ext, courier: 'PATHAO', consignmentId: 'C-A1', charge: '60.00' });

    // The courier says partial; the box names the kept lines (2 of 5), what was paid and the discount promised by phone.
    const mark = { keptLineIds: [`${a1.ext}-1`, `${a1.ext}-3`], discountGivenMinor: 5_000, phoneConfirmed: true, note: 'sample', markedById: null };
    const r1 = (await enqueueErpDelivery(deps(), { storeId: storeA, orderId: a1.orderId, outcome: 'PARTIAL', courier: 'PATHAO', consignmentId: 'C-A1', collectedMinor: 118_300, at: clock, mark }))!;
    expect(r1.created).toBe(true);
    // The same result again is not sent again.
    expect((await enqueueErpDelivery(deps(), { storeId: storeA, orderId: a1.orderId, outcome: 'PARTIAL', courier: 'PATHAO', consignmentId: 'C-A1', collectedMinor: 118_300, at: clock, mark }))!.created).toBe(false);
    // A line that is not the order's is refused.
    await expect(enqueueErpDelivery(deps(), { storeId: storeA, orderId: a1.orderId, outcome: 'PARTIAL', courier: 'PATHAO', consignmentId: 'C-A1', collectedMinor: 0, at: clock, mark: { ...mark, keptLineIds: ['NOT-A-LINE'] } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const push = await pushOf(storeA, a1.orderId, 'order.delivery');
    expect((push.requestBody as { body: Record<string, unknown> }).body).toMatchObject({ status: 'PARTIAL', collected: 1183, mark: { keptLines: [`${a1.ext}-1`, `${a1.ext}-3`], discountGiven: 50, phoneConfirmed: true } });
    expect((await relayErpPushes(deps(), { storeId: storeA })).sent).toBe(1);
    eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: a1.orderId }))!;
    expect(eo.identification).toBe('GREEN');
    const res = await t.prisma.erpDeliveryResult.findUniqueOrThrow({ where: { id: r1.resultId } });
    expect(res.sentAt?.getTime()).toBe(clock.getTime());
    // delivery.identified arrives as well: the same identification, applied once.
    await deliverAll();
    expect((await erpOrderOf(t.prisma, { storeId: storeA, orderId: a1.orderId }))!.identification).toBe('GREEN');
  });

  it('PR 611 (qa-gate): a parcel re-booked after pickup sends no second shipment; an answer without billedAt leaves the bill date empty and flagged until the ERP gives it', async () => {
    const o = order(storeA, [{ sku: 'POLO-NAVY-M', unit: 650 }]);
    await enqueueOrderPush(deps(), o.input);
    expect((await relayErpPushes(deps(), { storeId: storeA })).sent).toBe(1);
    const first = (await enqueueErpShipment(deps(), { storeId: storeA, orderId: o.orderId, courier: 'PATHAO', consignmentId: 'C-RB-1', chargeMinor: 6_000, pickedUpAt: clock }))!;
    expect(first.created).toBe(true);
    // The courier re-books the parcel under a new consignment after pickup: the order is billed once, so no second call.
    const again = (await enqueueErpShipment(deps(), { storeId: storeA, orderId: o.orderId, courier: 'PATHAO', consignmentId: 'C-RB-2', chargeMinor: 6_000, pickedUpAt: clock }))!;
    expect([again.created, again.pushId]).toEqual([false, first.pushId]);
    expect(await t.prisma.erpPush.count({ where: { storeId: storeA, referenceId: o.orderId, documentType: 'shipment.create' } })).toBe(1);
    // The ERP's answer comes without billedAt: the shop never guesses the bill date (the books match per day).
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const res = await world.fetch(input as string, init as never);
      if (!String(input).endsWith('/shipments')) return res;
      const body = (await res.json()) as Record<string, unknown>;
      return new Response(JSON.stringify({ ...body, billedAt: null }), { status: res.status, headers: res.headers });
    }) as typeof fetch;
    try {
      expect((await relayErpPushes(deps(), { storeId: storeA })).sent).toBe(1);
    } finally {
      globalThis.fetch = world.fetch as typeof fetch;
    }
    let eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: o.orderId }))!;
    expect([eo.billedAt, !!eo.shipmentSentAt, eo.consignmentId]).toEqual([null, true, 'C-RB-1']);
    expect((await pushOf(storeA, o.orderId, 'shipment.create')).lastError).toBe(BILLED_AT_MISSING);
    // The order check reads the ERP's copy of the order and keeps the ERP's own bill date.
    await checkErpOrders(deps(), { storeId: storeA });
    eo = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: o.orderId }))!;
    expect(eo.billedAt?.toISOString().slice(0, 10)).toBe((world.v6().getOrder(o.ext).answer as { billedAt: string }).billedAt);
  });

  it('CN-029 §16: one store never touches the other — the same order number in store B is its own order, lines and hold', async () => {
    const ob = order(storeB, [{ sku: 'POLO-NAVY-M', unit: 650 }], { externalOrderId: a1.ext });
    await enqueueOrderPush(deps(), ob.input);
    expect((await relayErpPushes(deps(), { storeId: storeB })).sent).toBe(1);
    const eb = (await erpOrderOf(t.prisma, { storeId: storeB, orderId: ob.orderId }))!;
    const ea = (await erpOrderOf(t.prisma, { storeId: storeA, orderId: a1.orderId }))!;
    expect(eb.linkId).not.toBe(ea.linkId);
    expect(eb.externalOrderId).toBe(ea.externalOrderId);
    // Store A's ERP says the line is short (a made-up event for store A's order number): store B's line never moves.
    const before = await t.prisma.erpOrderLine.findMany({ where: { erpOrderId: eb.id }, select: { state: true } });
    world.v6().emit('order.line.short', { externalOrderId: a1.ext, lineId: `${a1.ext}-1`, sku: 'POLO-NAVY-M', reason: 'RETURN_PIECE_FAILED_CHECK' });
    await deliverAll();
    expect(await t.prisma.erpOrderLine.findMany({ where: { erpOrderId: eb.id }, select: { state: true } })).toEqual(before);
    // A store A view of store B's order: nothing.
    expect(await erpOrderView(deps(), { actor: SYSTEM, storeId: storeA }, ob.orderId)).toBeNull();
    // Store B on hold pauses store B only.
    world.v6('SAMPLE-CO-2').hold('PAYMENT_OVERDUE');
    expect(await checkErpOrders(deps(), { storeId: storeB })).toMatchObject({ status: 'ok', onHold: true });
    expect((await erpCheckoutPaused(deps(), storeB)).paused).toBe(true);
    expect((await erpCheckoutPaused(deps(), storeA)).paused).toBe(false);
    world.v6('SAMPLE-CO-2').release();
    await deliverAll('SAMPLE-CO-2');
    expect((await erpCheckoutPaused(deps(), storeB)).paused).toBe(false);
  });

  it('a v5 store gets none of it: no hold pause, no order check, no shipment, no delivery result', async () => {
    overrides.set(`erp.model@${storeB}`, 'v5');
    expect(await checkErpOrders(deps(), { storeId: storeB })).toMatchObject({ status: 'skipped', reason: 'ERP_MODEL_V5' });
    expect(await enqueueErpShipment(deps(), { storeId: storeB, orderId: randomUUID(), courier: 'PATHAO', consignmentId: 'C-X', chargeMinor: null, pickedUpAt: clock })).toBeNull();
    expect(await enqueueErpDelivery(deps(), { storeId: storeB, orderId: randomUUID(), outcome: 'DELIVERED', courier: 'PATHAO', consignmentId: 'C-X', collectedMinor: 0, at: clock })).toBeNull();
    expect(await erpHoldNotice(deps(), storeB)).toBeNull();
    overrides.set(`erp.model@${storeB}`, 'v6');
  });
});
