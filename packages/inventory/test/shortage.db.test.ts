// Follow-up 16 (PR 195, 197, 203; CN-017 SIM-F-006) on a real PostgreSQL: an ERP sync takes the last pieces away under
// open orders. The shared balance shows −1 (never 0), every open order waiting to be packed with that SKU gets one
// shortage card, booking is refused until a person decides, the decision is recorded (never carried out here), and a
// card never closes by itself. Every value is a made-up test value. Skipped without TEST_DATABASE_ADMIN_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allAdapters, createConnections } from '@extas/adapters';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createColour, createProduct, createSize, createVariant, type CatalogueDeps } from '@extas/catalogue';
import { registry, type Key, type Value } from '@extas/settings';
import {
  assertBookable,
  bookingBlockers,
  createWarehouse,
  decideShortage,
  evaluateLowStock,
  evaluateShortages,
  listLowStock,
  listShortages,
  runInventoryJob,
  stockGrid,
  variantStock,
  type InventoryDeps,
  type SettingsReader,
  type Who,
} from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const SKU = 'SAMPLE-SKY-S';
const OTHER = 'SAMPLE-SKY-M';

describe.skipIf(!HAS_TEST_DB)('shortage cards on PostgreSQL (follow-up 16, SIM-F-006)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let main = '';
  let viewer: Actor;
  let decider: Actor;
  const settings: SettingsReader = { value: async <K extends Key>(key: K) => registry[key].default as Value<K> };
  let connections: ReturnType<typeof createConnections>;
  const deps = (): InventoryDeps => ({ db: t.prisma, settings, connections, sleep: async () => {} });
  const sys = (s: number): Who => ({ actor: SYSTEM, storeId: s });
  const variants: Record<number, Record<string, string>> = {};
  const productOf: Record<number, string> = {};
  const orders: Record<string, string> = {};
  const lines: Record<string, string> = {};

  async function order(name: string, storeId: number, status: 'PLACED' | 'CONFIRMED' | 'PACKED' | 'DELIVERED', items: { sku: string; q: number; removed?: boolean }[]) {
    const o = await t.prisma.order.create({
      data: { storeId, number: `SAMPLE-${name}`, source: 'WEBSITE', currency: 'BDT', status, subtotalMinor: 1000, totalMinor: 1000, paymentMethod: 'COD', idempotencyKey: `short-${name}` },
    });
    orders[name] = o.id;
    for (const [i, it] of items.entries()) {
      const row = await t.prisma.orderItem.create({
        data: { storeId, orderId: o.id, variantId: variants[storeId]![it.sku]!, productId: productOf[storeId]!, sku: it.sku, productName: 'Sample panjabi', quantity: it.q, unitPriceMinor: 1000, lineTotalMinor: 1000 * it.q, status: it.removed ? 'REMOVED' : 'ACTIVE' },
      });
      lines[`${name}:${i}`] = row.id;
    }
  }
  /** What the ERP says now, on every store's row of the pool. */
  const erpSays = (sku: string, available: number) =>
    t.prisma.stockLevel.updateMany({ where: { variant: { sku }, locationId: main }, data: { available, onHand: Math.max(available, 0), erpUpdatedAt: new Date() } });

  beforeAll(async () => {
    t = await createTestDatabase('shortage');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async () => null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    const staff = async (email: string, perms: ('inventory.read' | 'inventory.audit')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: null } });
      return { staffUserId: u.id };
    };
    viewer = await staff('viewer@example.com', ['inventory.read']);
    decider = await staff('packer@example.com', ['inventory.read', 'inventory.audit']);
    main = (await createWarehouse(deps(), sys(A), { code: 'WH-S', name: 'Sample warehouse' })).locations.find((l) => l.code === 'main')!.id;
    const cat = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => new Date() });
    for (const s of [A, B]) {
      const sky = (await createColour(cat(), sys(s), { nameEn: 'Sky', hex: '87ceeb' })).colour;
      const small = await createSize(cat(), sys(s), { label: 'S' });
      const medium = await createSize(cat(), sys(s), { label: 'M' });
      const p = await createProduct(cat(), sys(s), { nameEn: 'Sample panjabi', erpStyleCode: 'PNJ' });
      productOf[s] = p.id;
      variants[s] = {
        [SKU]: (await createVariant(cat(), sys(s), { sku: SKU, productId: p.id, colourId: sky.id, sizeId: small.id })).id,
        [OTHER]: (await createVariant(cat(), sys(s), { sku: OTHER, productId: p.id, colourId: sky.id, sizeId: medium.id })).id,
      };
      for (const sku of [SKU, OTHER]) await t.prisma.stockLevel.create({ data: { variantId: variants[s]![sku]!, locationId: main, onHand: 1, available: 1, erpUpdatedAt: new Date() } });
    }
    // Open orders holding the SKU in two stores, one already packed, one with the line taken out, one of another SKU.
    await order('A1', A, 'PLACED', [{ sku: SKU, q: 1 }]);
    await order('B1', B, 'CONFIRMED', [{ sku: SKU, q: 1 }]);
    await order('A2', A, 'PACKED', [{ sku: SKU, q: 1 }]);
    await order('A3', A, 'PLACED', [{ sku: SKU, q: 1, removed: true }]);
    await order('A4', A, 'PLACED', [{ sku: OTHER, q: 1 }]);
  });

  afterAll(async () => {
    await t?.drop();
  });

  it('while the balance is not below zero there is no card', async () => {
    expect(await evaluateShortages(deps())).toMatchObject({ short: 0, raised: 0, open: 0 });
    await assertBookable(t.prisma, A, orders.A1!);
  });

  it('an ERP sync takes the pieces away: −1 is shown as −1, never 0', async () => {
    await erpSays(SKU, -1);
    const s = await variantStock(deps(), { actor: viewer, storeId: A }, { sku: SKU });
    expect(s).toMatchObject({ sellable: 0, balance: -1 });
    const grid = await stockGrid(deps(), { actor: viewer, storeId: A }, productOf[A]!);
    expect(grid.cells.find((c) => c.sku === SKU)).toMatchObject({ sellable: 0, balance: -1 });
    expect(grid.totals).toMatchObject({ sellable: 1, short: 1 });
    await evaluateLowStock(deps(), { skus: [SKU] });
    const low = await listLowStock(deps(), { actor: viewer, storeId: A });
    expect(low.items.find((i) => i.sku === SKU)?.available).toBe(-1);
  });

  it('every open order waiting to be packed with that SKU gets one card; packed, removed and other lines do not', async () => {
    expect(await evaluateShortages(deps(), { skus: [SKU, OTHER] })).toMatchObject({ short: 1, raised: 2, open: 2 });
    const cards = await t.prisma.packingIssue.findMany({ where: { kind: 'SHORTAGE' } });
    expect(cards.map((c) => c.orderItemId).sort()).toEqual([lines['A1:0']!, lines['B1:0']!].sort());
    expect(cards.find((c) => c.orderItemId === lines['B1:0'])?.storeId).toBe(B);
    // Again: no second card for the same line (also when two runs come at once).
    const [x, y] = await Promise.all([evaluateShortages(deps()), evaluateShortages(deps())]);
    expect(x.raised + y.raised).toBe(0);
    expect(await t.prisma.packingIssue.count({ where: { kind: 'SHORTAGE' } })).toBe(2);
  });

  it('booking is refused while a card is open; the store sees its own cards and every SKU below zero', async () => {
    expect(await code(assertBookable(t.prisma, A, orders.A1!))).toBe('SHORTAGE_OPEN');
    expect(await bookingBlockers(t.prisma, A, orders.A1!)).toEqual([{ issueId: expect.any(String), orderItemId: lines['A1:0'], kind: 'SHORTAGE' }]);
    await assertBookable(t.prisma, A, orders.A2!);
    await assertBookable(t.prisma, A, orders.A4!);
    const list = await listShortages(deps(), { actor: viewer, storeId: A });
    expect(list.cards).toEqual([expect.objectContaining({ orderNumber: 'SAMPLE-A1', sku: SKU, quantity: 1, balance: -1, decision: null, productName: { en: 'Sample panjabi', bn: null } })]);
    expect(list.negatives).toEqual([{ sku: SKU, balance: -1 }]);
  });

  it('a person decides (with the permission); the decision is recorded and audited, and booking may go on', async () => {
    const card = (await listShortages(deps(), { actor: viewer, storeId: A })).cards[0]!;
    expect(await code(decideShortage(deps(), { actor: viewer, storeId: A }, card.id, { decision: 'SWAP_SIZE' }))).toBe('FORBIDDEN');
    expect(await code(decideShortage(deps(), { actor: decider, storeId: A }, card.id, { decision: 'GUESS' }))).toBe('INVALID_INPUT');
    expect(await code(decideShortage(deps(), { actor: decider, storeId: B }, card.id, { decision: 'SWAP_SIZE' }))).toBe('NOT_FOUND');
    const done = await decideShortage(deps(), { actor: decider, storeId: A }, card.id, { decision: 'SWAP_SIZE', note: 'Customer agreed to M' });
    expect(done).toMatchObject({ decision: 'SWAP_SIZE', decidedAt: expect.any(String) });
    expect(await code(decideShortage(deps(), { actor: decider, storeId: A }, card.id, { decision: 'CANCEL_LINE' }))).toBe('CONFLICT');
    await assertBookable(t.prisma, A, orders.A1!);
    expect(await t.prisma.auditLog.count({ where: { action: 'inventory.shortage.decide', entityId: card.id } })).toBe(1);
    // The order itself is untouched: the decision is carried out by the order flow, never here.
    expect((await t.prisma.orderItem.findUniqueOrThrow({ where: { id: lines['A1:0']! } })).status).toBe('ACTIVE');
  });

  it('stock coming back never closes a card by itself; the sweep job raises cards too', async () => {
    await erpSays(SKU, 5);
    const run = await runInventoryJob(deps(), { name: 'inventory.lowStock.evaluate' });
    expect(run).toMatchObject({ shortage: { short: 0, raised: 0, open: 1 } });
    expect(await code(assertBookable(t.prisma, B, orders.B1!))).toBe('SHORTAGE_OPEN');
    // Short again, with a new open order: the new line gets a card; A1's line was decided already (the order flow
    // carries the decision out) and B1's card is still open, so neither gets a second one.
    await order('A5', A, 'PLACED', [{ sku: SKU, q: 2 }]);
    await erpSays(SKU, -2);
    expect(await runInventoryJob(deps(), { name: 'inventory.lowStock.evaluate' })).toMatchObject({ shortage: { short: 1, raised: 1, open: 2 } });
    // "The piece was found" closes a card without deciding the line, so a later shortage raises it again.
    const b1 = (await listShortages(deps(), { actor: viewer, storeId: B })).cards[0]!;
    await decideShortage(deps(), { actor: decider, storeId: B }, b1.id, { decision: 'STOCK_FOUND' });
    expect(await evaluateShortages(deps(), { skus: [SKU] })).toMatchObject({ raised: 1, open: 2 });
  });
});
