// S09 wave 1 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): one global hold over three stores with row locking (PR 197/198), orders to the ERP as
// documents through an idempotent outbox (PR 199/200), low-stock alerts on the shared number (PR 202), the stock count
// by barcode (PR 203), the publishing queue following ERP stock (PR 204), the sync health panel (PR 205), manual
// re-sync (PR 206) and the movement report with the ERP reconciliation (PR 207).
// The ERP is the practice ERP behind a LIVE connection (its fetch replaces the network); keys are made up here.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allAdapters, createConnections, mockErp } from '@extas/adapters';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createColour, createProduct, createSize, createVariant, productReadiness, type CatalogueDeps } from '@extas/catalogue';
import { registry, type Key, type Value } from '@extas/settings';
import {
  cancelStockAudit,
  completeStockAudit,
  convertCart,
  createWarehouse,
  enqueueOrderPush,
  enqueueOrderStatus,
  evaluateLowStock,
  getStockAudit,
  holdCart,
  holdSummary,
  inventorySchedule,
  listErpPushes,
  listLowStock,
  listStockAudits,
  newErpStyles,
  pullStock,
  reconcileWithErp,
  relayErpPushes,
  releaseCart,
  resyncProduct,
  resyncStock,
  retryErpPushes,
  reviewStockAudit,
  runInventoryJob,
  scanStockAudit,
  setAuditLineReason,
  startStockAudit,
  stockMovementReport,
  stockQueue,
  sweepReservations,
  syncHealth,
  type InventoryDeps,
  type OrderPushInput,
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
async function details(p: Promise<unknown>): Promise<string[]> {
  try {
    await p;
    return [];
  } catch (e) {
    return (e as { details?: string[] }).details ?? [String(e)];
  }
}

const T0 = new Date('2026-10-20T06:00:00Z');
const BASE = 'https://erp.example.test';
const STORES = ['A', 'B', 'C'] as const;

describe.skipIf(!HAS_TEST_DB)('S09 wave 1 on PostgreSQL: holds, documents, alerts, counts, health', () => {
  let t: TestDatabase;
  const store: Record<(typeof STORES)[number], number> = { A: 0, B: 0, C: 0 };
  let clock = T0;
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      if (overrides.has(sk)) return overrides.get(sk) as Value<K>;
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const vaultValues = new Map<string, string>();
  let connections: ReturnType<typeof createConnections>;
  const deps = (extra: Partial<InventoryDeps> = {}): InventoryDeps => ({ db: t.prisma, settings, connections, now: () => clock, sleep: async () => {}, random: () => 0.5, ...extra });
  const catDeps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const sys = (s: number = store.A): Who => ({ actor: SYSTEM, storeId: s });
  const world = mockErp();
  const realFetch = globalThis.fetch;
  /** v[store][sku] = variant id. */
  const v: Record<string, Record<string, string>> = {};
  const products: Record<string, Record<string, string>> = {};
  let mainA = '';
  let mainB = '';
  let viewer: Actor;
  let syncer: Actor;
  let auditor: Actor;
  let storeAuditor: Actor;

  const cart = async (storeId: number, lastActivityAt = clock) => (await t.prisma.cart.create({ data: { storeId, visitorId: `sample-${randomUUID()}`, lastActivityAt } })).id;
  const levels = (sku: string, locationId = mainA) => t.prisma.stockLevel.findMany({ where: { variant: { sku }, locationId }, orderBy: { variant: { storeId: 'asc' } }, select: { cartReserved: true, available: true, onHand: true, reserved: true } });
  const inStock = async (sku: string) => (await t.prisma.productVariant.findMany({ where: { sku }, orderBy: { storeId: 'asc' }, select: { inStock: true } })).map((x) => x.inStock);
  const order = (storeId: number, sku: string, quantity: number, over: Partial<OrderPushInput> = {}): OrderPushInput => ({
    storeId,
    orderId: randomUUID(),
    externalOrderId: `SAMPLE-${randomBytes(3).toString('hex').toUpperCase()}`,
    customerName: 'Sample Customer',
    customerPhone: '01700000000',
    shippingAddress: 'Sample road 1, Sample town',
    items: [{ sku, quantity, unitPriceMinor: 150_000 }],
    codAmountMinor: 150_000 * quantity,
    paymentMethod: 'COD',
    ...over,
  });

  beforeAll(async () => {
    t = await createTestDatabase('stockflow');
    [store.A, store.B] = await seedSampleStores(t.prisma);
    store.C = (await t.prisma.store.create({ data: { slug: 'sample-c', name: 'Sample store C', defaultLocale: 'bn-BD', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string) => vaultValues.get(name) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    const staff = async (email: string, perms: ('inventory.read' | 'inventory.sync' | 'inventory.audit')[], storeId: number | null) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId } });
      return { staffUserId: u.id };
    };
    viewer = await staff('viewer@example.com', ['inventory.read'], store.A);
    syncer = await staff('syncer@example.com', ['inventory.read', 'inventory.sync'], store.A);
    auditor = await staff('auditor@example.com', ['inventory.read', 'inventory.audit'], null);
    storeAuditor = await staff('storeauditor@example.com', ['inventory.read', 'inventory.audit'], store.A);

    // One shared warehouse pair for every store (A4.4), linked to the practice ERP's warehouses.
    const wa = await createWarehouse(deps(), sys(), { code: 'WH-A', name: 'Sample warehouse A', erpWarehouseId: 'SAMPLE-WH-1' });
    const wb = await createWarehouse(deps(), sys(), { code: 'WH-B', name: 'Sample warehouse B', erpWarehouseId: 'SAMPLE-WH-2' });
    mainA = wa.locations.find((l) => l.code === 'main')!.id;
    mainB = wb.locations.find((l) => l.code === 'main')!.id;

    // The same sample items in all three stores (each store has its own variant rows for the same ERP SKU).
    for (const s of STORES) {
      const id = store[s];
      v[s] = {};
      products[s] = {};
      const navy = (await createColour(catDeps(), sys(id), { nameEn: 'Navy', hex: '1b2a4a' })).colour;
      const m = await createSize(catDeps(), sys(id), { label: 'M' });
      const l = await createSize(catDeps(), sys(id), { label: 'L' });
      const tee = await createProduct(catDeps(), sys(id), { nameEn: 'Sample Tee', erpStyleCode: 'TEE' });
      const cap = await createProduct(catDeps(), sys(id), { nameEn: 'Sample Cap', erpStyleCode: 'CAP' });
      const scarf = await createProduct(catDeps(), sys(id), { nameEn: 'Sample Scarf', erpStyleCode: 'SCARF' });
      products[s] = { tee: tee.id, cap: cap.id, scarf: scarf.id };
      v[s]['TEE-NAVY-M'] = (await createVariant(catDeps(), sys(id), { sku: 'TEE-NAVY-M', productId: tee.id, colourId: navy.id, sizeId: m.id, barcode: 'BC-TEE-M' })).id;
      v[s]['TEE-NAVY-L'] = (await createVariant(catDeps(), sys(id), { sku: 'TEE-NAVY-L', productId: tee.id, colourId: navy.id, sizeId: l.id, barcode: 'BC-TEE-L' })).id;
      v[s]['CAP-NAVY-M'] = (await createVariant(catDeps(), sys(id), { sku: 'CAP-NAVY-M', productId: cap.id, colourId: navy.id, sizeId: m.id })).id;
      v[s]['SCARF-NAVY-M'] = (await createVariant(catDeps(), sys(id), { sku: 'SCARF-NAVY-M', productId: scarf.id, colourId: navy.id, sizeId: m.id })).id;
    }

    // One LIVE connection for the installation; its "network" is the practice ERP.
    world.reset();
    world.now = () => clock;
    const key = randomBytes(16).toString('hex');
    vaultValues.set('extasErp.apiKey', key);
    world.acceptKey(key, 'SAMPLE-CO-1');
    globalThis.fetch = world.fetch as typeof fetch;
    await t.prisma.integration.create({ data: { storeId: null, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } });

    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 1 });
    world.setStock('TEE-NAVY-L', 'SAMPLE-WH-1', { onHand: 5 });
    world.setStock('TEE-NAVY-L', 'SAMPLE-WH-2', { onHand: 2 });
    world.setStock('CAP-NAVY-M', 'SAMPLE-WH-1', { onHand: 3 });
    world.setStock('NEWSTYLE-RED-M', 'SAMPLE-WH-1', { onHand: 4 });
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await t?.drop();
  });

  // ---- the first pull fills every store's mirror; PR 202 raises one alert, not three ---------------------------------

  it('PR 195 + 202: each store pulls the same ERP stock; the last piece raises one low-stock alert, not three', async () => {
    for (const s of STORES) expect(await pullStock(deps(), { storeId: store[s] })).toMatchObject({ status: 'succeeded', adapterMode: 'LIVE', unknownSku: 1 });
    expect((await levels('TEE-NAVY-M')).map((l) => l.available)).toEqual([1, 1, 1]);
    expect(await inStock('TEE-NAVY-M')).toEqual([true, true, true]);
    const open = await t.prisma.lowStockAlert.findMany({ where: { resolvedAt: null } });
    // TEE-NAVY-M (1 ≤ 2) is low; on the lowest store's variant, once. The scarf has no stock row: never "low".
    expect(open.map((a) => [a.variantId, a.available, a.threshold])).toEqual([[v.A!['TEE-NAVY-M'], 1, 2]]);
    // A threshold of its own for one SKU (setting), then back: raised, then resolved — the row stays.
    overrides.set('inventory.lowStock.skuThresholds', { 'CAP-NAVY-M': 5 });
    expect(await evaluateLowStock(deps())).toMatchObject({ raised: 1, open: 2 });
    overrides.delete('inventory.lowStock.skuThresholds');
    expect(await evaluateLowStock(deps())).toMatchObject({ raised: 0, resolved: 1, open: 1 });
    expect(await t.prisma.lowStockAlert.count()).toBe(2);
    const list = await listLowStock(deps(), { actor: viewer, storeId: store.A });
    expect(list.items.map((i) => [i.sku, i.available, i.productName.en])).toEqual([['TEE-NAVY-M', 1, 'Sample Tee']]);
    overrides.set('inventory.lowStock.enabled', false);
    expect(await evaluateLowStock(deps())).toMatchObject({ checked: 0 });
    overrides.delete('inventory.lowStock.enabled');
  });

  // ---- PR 197/198 · one global hold, row locking ---------------------------------------------------------------------

  it('PR 198: fifteen buyers on three stores race for the last piece; exactly one gets it', async () => {
    const carts = await Promise.all(STORES.flatMap((s) => [0, 1, 2, 3, 4].map(async () => ({ s, id: await cart(store[s]) }))));
    const results = await Promise.allSettled(carts.map((c) => holdCart(deps(), { storeId: store[c.s], cartId: c.id, lines: [{ variantId: v[c.s]!['TEE-NAVY-M']!, quantity: 1 }] })));
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(14);
    for (const r of lost) expect([r.reason.code, r.reason.details]).toEqual(['OUT_OF_STOCK', ['TEE-NAVY-M:0']]);
    expect(await t.prisma.stockReservation.count({ where: { status: 'ACTIVE', variantId: { in: STORES.map((s) => v[s]!['TEE-NAVY-M']!) } } })).toBe(1);
    // The hold shows on every store at once: held on all three rows, sold out on all three sites.
    expect((await levels('TEE-NAVY-M')).map((l) => l.cartReserved)).toEqual([1, 1, 1]);
    expect(await inStock('TEE-NAVY-M')).toEqual([false, false, false]);
  });

  it('PR 198: a second checkout waits on the row lock of the first, then sees its hold', async () => {
    let entered!: () => void;
    const inLock = new Promise<void>((r) => (entered = r));
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const first = holdCart(deps({ hooks: { afterPoolLock: async () => (entered(), gate) } }), { storeId: store.A, cartId: await cart(store.A), lines: [{ variantId: v.A!['CAP-NAVY-M']!, quantity: 3 }] });
    await inLock;
    let secondDone = false;
    const second = holdCart(deps(), { storeId: store.B, cartId: await cart(store.B), lines: [{ variantId: v.B!['CAP-NAVY-M']!, quantity: 1 }] }).finally(() => {
      secondDone = true;
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(secondDone).toBe(false);
    open();
    const r1 = await first;
    expect(r1.lines).toEqual([{ variantId: v.A!['CAP-NAVY-M'], sku: 'CAP-NAVY-M', quantity: 3, locations: [{ locationId: mainA, quantity: 3 }] }]);
    expect(await details(second)).toEqual(['CAP-NAVY-M:0']);
    expect(await releaseCart(deps(), { storeId: store.A, cartId: r1.cartId })).toEqual({ released: 1 });
    expect((await levels('CAP-NAVY-M')).map((l) => l.cartReserved)).toEqual([0, 0, 0]);
    expect(await inStock('CAP-NAVY-M')).toEqual([true, true, true]);
  });

  it('PR 197: holding again replaces the bag’s hold — bigger takes more, smaller lets go; refusals change nothing', async () => {
    const id = await cart(store.C);
    const vid = v.C!['TEE-NAVY-L']!;
    const h1 = await holdCart(deps(), { storeId: store.C, cartId: id, lines: [{ variantId: vid, quantity: 4 }] });
    expect(h1.lines[0]!.locations).toEqual([{ locationId: mainA, quantity: 4 }]);
    const h2 = await holdCart(deps(), { storeId: store.C, cartId: id, lines: [{ variantId: vid, quantity: 6 }], signedIn: true });
    expect(h2.lines[0]!.locations).toEqual([{ locationId: mainA, quantity: 4 }, { locationId: mainB, quantity: 2 }]);
    expect(new Date(h2.expiresAt!).getTime() - clock.getTime()).toBe(20 * 60_000);
    expect(await details(holdCart(deps(), { storeId: store.A, cartId: await cart(store.A), lines: [{ variantId: v.A!['TEE-NAVY-L']!, quantity: 2 }] }))).toEqual(['TEE-NAVY-L:1']);
    const h3 = await holdCart(deps(), { storeId: store.C, cartId: id, lines: [{ variantId: vid, quantity: 1 }] });
    expect([h3.released, h3.lines[0]!.quantity]).toEqual([2, 1]);
    expect((await levels('TEE-NAVY-L')).map((l) => l.cartReserved)).toEqual([1, 1, 1]);
    expect((await holdCart(deps(), { storeId: store.C, cartId: id, lines: [] })).lines).toEqual([]);
    expect((await levels('TEE-NAVY-L')).map((l) => l.cartReserved)).toEqual([0, 0, 0]);
    // Limits and refusals.
    expect(await code(holdCart(deps(), { storeId: store.C, cartId: id, lines: [{ variantId: vid, quantity: 21 }] }))).toBe('INVALID_INPUT');
    expect(await code(holdCart(deps(), { storeId: store.C, cartId: id, lines: [{ variantId: v.A!['TEE-NAVY-L']!, quantity: 1 }] }))).toBe('INVALID_INPUT');
    expect(await code(holdCart(deps(), { storeId: store.A, cartId: id, lines: [] }))).toBe('NOT_FOUND');
    await t.prisma.cart.update({ where: { id }, data: { status: 'MERGED' } });
    expect(await code(holdCart(deps(), { storeId: store.C, cartId: id, lines: [{ variantId: vid, quantity: 1 }] }))).toBe('CONFLICT');
  });

  it('PR 197: the abandon timer lets go of idle bags and expired holds (minutes from settings); nothing is deleted', async () => {
    // The race winner's hold from above is still there; a bag idle past `abandonMinutes` goes first.
    const idle = await cart(store.B, new Date(clock.getTime() - 16 * 60_000));
    await holdCart(deps(), { storeId: store.B, cartId: idle, lines: [{ variantId: v.B!['TEE-NAVY-L']!, quantity: 1 }] });
    expect(await sweepReservations(deps())).toMatchObject({ expired: 0, abandoned: 1 });
    expect((await levels('TEE-NAVY-L')).map((l) => l.cartReserved)).toEqual([0, 0, 0]);
    advance(15 * 60_000 + 1);
    const swept = await sweepReservations(deps());
    expect(swept.expired).toBeGreaterThanOrEqual(1);
    expect((await levels('TEE-NAVY-M')).map((l) => l.cartReserved)).toEqual([0, 0, 0]);
    expect(await inStock('TEE-NAVY-M')).toEqual([true, true, true]);
    expect(await t.prisma.stockReservation.count({ where: { status: { in: ['RELEASED', 'EXPIRED'] }, releasedAt: { not: null } } })).toBeGreaterThanOrEqual(5);
    expect(await runInventoryJob(deps(), { name: 'inventory.reservations.release' })).toEqual({ expired: 0, abandoned: 0, ordersTimedOut: 0, rowsChanged: 0 });
  });

  // ---- PR 203 · the stock count ---------------------------------------------------------------------------------------

  it('PR 203: count by barcode or SKU, review against the mirror, a reason for every difference — stock never moves', async () => {
    expect(await code(startStockAudit(deps(), { actor: viewer, storeId: store.A }, { locationId: mainA }))).toBe('FORBIDDEN');
    expect(await code(startStockAudit(deps(), { actor: storeAuditor, storeId: store.A }, { locationId: mainA }))).toBe('FORBIDDEN');
    const who = { actor: auditor, storeId: store.A };
    const a = await startStockAudit(deps(), who, { locationId: mainA });
    expect(await code(startStockAudit(deps(), who, { locationId: mainA }))).toBe('AUDIT_OPEN');
    const movementsBefore = await t.prisma.stockMovement.count();
    await scanStockAudit(deps(), who, a.id, { code: 'BC-TEE-M' });
    expect((await scanStockAudit(deps(), who, a.id, { code: 'BC-TEE-M' })).counted).toBe(2);
    expect((await scanStockAudit(deps(), who, a.id, { code: 'TEE-NAVY-L', quantity: 4 })).known).toBe(true);
    expect((await scanStockAudit(deps(), who, a.id, { code: 'ZZ-UNKNOWN' })).known).toBe(false);
    expect(await code(scanStockAudit(deps(), who, a.id, { code: 'BC-TEE-M', quantity: 501 }))).toBe('INVALID_INPUT');
    expect(await code(completeStockAudit(deps(), who, a.id))).toBe('CONFLICT');

    const r = await reviewStockAudit(deps(), who, a.id);
    expect(r.status).toBe('REVIEW');
    expect(r.lines.map((l) => [l.sku ?? l.barcode, l.expected, l.counted, l.variance])).toEqual([
      ['TEE-NAVY-M', 1, 2, 1],
      ['TEE-NAVY-L', 5, 4, -1],
      ['ZZ-UNKNOWN', 0, 1, 1],
      ['CAP-NAVY-M', 3, 0, -3],
    ]);
    expect(r.totals).toMatchObject({ lines: 4, differing: 4, withoutReason: 4, over: 2, short: 4, unknown: 1 });
    expect(await details(completeStockAudit(deps(), who, a.id))).toHaveLength(4);
    expect(await code(setAuditLineReason(deps(), who, r.lines[0]!.id, { reason: 'because' }))).toBe('INVALID_INPUT');
    for (const [i, reason] of (['miscount', 'miscount', 'wrong-label', 'missing'] as const).entries()) await setAuditLineReason(deps(), who, r.lines[i]!.id, { reason });
    const done = await completeStockAudit(deps(), who, a.id);
    expect([done.status, done.completedAt, done.totals.withoutReason]).toEqual(['COMPLETED', clock.toISOString(), 0]);
    // The count records; the stock stays the ERP's.
    expect(await t.prisma.stockMovement.count()).toBe(movementsBefore);
    expect((await levels('TEE-NAVY-L')).map((l) => l.onHand)).toEqual([5, 5, 5]);
    expect(await code(scanStockAudit(deps(), who, a.id, { code: 'BC-TEE-M' }))).toBe('CONFLICT');
    expect((await getStockAudit(deps(), { actor: viewer, storeId: store.A }, a.id)).lines).toHaveLength(4);
    // A new count can start; a cancelled one stays as a row.
    const b = await startStockAudit(deps(), who, { locationId: mainA });
    expect((await cancelStockAudit(deps(), who, b.id)).status).toBe('CANCELLED');
    expect((await listStockAudits(deps(), { actor: viewer, storeId: store.A })).map((x) => x.status)).toEqual(['CANCELLED', 'COMPLETED']);
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'stock.audit.' } } })).toBe(9);
  });

  // ---- PR 199/200 · orders to the ERP --------------------------------------------------------------------------------

  it('PR 197 + 199: a confirmed order’s hold counts until the ERP shows the order, then lets go — never counted twice', async () => {
    const bag = await cart(store.A);
    await holdCart(deps(), { storeId: store.A, cartId: bag, lines: [{ variantId: v.A!['TEE-NAVY-L']!, quantity: 2 }] });
    const o = order(store.A, 'TEE-NAVY-L', 2);
    expect(await convertCart(deps(), { storeId: store.A, cartId: bag, orderId: o.orderId })).toEqual({ converted: 1, units: 2 });
    expect((await holdSummary(t.prisma, clock)).orders).toEqual({ holds: 1, units: 2 });
    const q = await enqueueOrderPush(deps(), o);
    expect([q.status, q.created]).toEqual(['PENDING', true]);
    expect(await enqueueOrderPush(deps(), o)).toEqual({ ...q, created: false });
    expect(await code(enqueueOrderPush(deps(), { ...o, items: [{ sku: 'TEE-NAVY-L', quantity: 3, unitPriceMinor: 150_000 }] }))).toBe('IDEMPOTENCY_MISMATCH');
    const row = await t.prisma.erpPush.findUniqueOrThrow({ where: { id: q.pushId } });
    expect(JSON.stringify(row.requestBody)).not.toMatch(/journal|ledger|debit|credit/i);
    expect(row.idempotencyKey).toBe(`order:${o.orderId}:create`);

    expect(await relayErpPushes(deps())).toMatchObject({ sent: 1, replayed: 0, retrying: 0 });
    const sent = await t.prisma.erpPush.findUniqueOrThrow({ where: { id: q.pushId } });
    expect([sent.status, sent.erpId, sent.attempts, sent.sentAt?.toISOString()]).toEqual(['SENT', 'SAMPLE-SO-1', 1, clock.toISOString()]);
    expect(world.stockOf('TEE-NAVY-L', 'SAMPLE-WH-1')).toEqual({ onHand: 5, reserved: 2 });
    // Until the shop has read the ERP's new number, its own order hold keeps the pieces off sale.
    expect((await levels('TEE-NAVY-L')).map((l) => [l.available, l.cartReserved])).toEqual([[5, 2], [5, 2], [5, 2]]);
    await pullStock(deps(), { storeId: store.A });
    // Now the ERP's reserved counts the order: the shop's hold lets go (3 free, not 1).
    expect((await levels('TEE-NAVY-L')).map((l) => [l.available, l.cartReserved])).toEqual([[3, 0], [5, 0], [5, 0]]);
    expect(await t.prisma.stockReservation.count({ where: { orderId: o.orderId, status: 'CONVERTED', releasedAt: { not: null } } })).toBe(1);
    for (const s of ['B', 'C'] as const) await pullStock(deps(), { storeId: store[s] });
    expect((await levels('TEE-NAVY-L')).map((l) => l.available)).toEqual([3, 3, 3]);
  });

  it('PR 200: an answer lost to a dropped line or a timeout is sent again with the same key — the ERP applies it once', async () => {
    const lost = await enqueueOrderPush(deps(), order(store.A, 'TEE-NAVY-L', 1));
    world.failNext({ path: '/orders', lose: 'network' });
    expect(await relayErpPushes(deps())).toMatchObject({ sent: 0, retrying: 1 });
    expect(world.stockOf('TEE-NAVY-L', 'SAMPLE-WH-1')).toEqual({ onHand: 5, reserved: 3 });
    const waiting = await t.prisma.erpPush.findUniqueOrThrow({ where: { id: lost.pushId } });
    expect([waiting.status, waiting.attempts, waiting.nextAttemptAt?.getTime()]).toEqual(['PENDING', 1, clock.getTime() + 60_000]);
    expect(waiting.lastError).toMatch(/^NETWORK/);
    const calls = world.calls.length;
    expect(await relayErpPushes(deps())).toMatchObject({ sent: 0, stores: 0 });
    expect(world.calls.length).toBe(calls);
    advance(60_000);
    expect(await relayErpPushes(deps())).toMatchObject({ sent: 1, replayed: 1 });
    expect(world.stockOf('TEE-NAVY-L', 'SAMPLE-WH-1')).toEqual({ onHand: 5, reserved: 3 });

    overrides.set('erp.sync.requestTimeoutSeconds', 1);
    const slow = await enqueueOrderPush(deps(), order(store.A, 'TEE-NAVY-L', 1));
    world.failNext({ path: '/orders', lose: 'timeout', delayMs: 1_500 });
    expect(await relayErpPushes(deps())).toMatchObject({ sent: 0, retrying: 1 });
    expect((await t.prisma.erpPush.findUniqueOrThrow({ where: { id: slow.pushId } })).lastError).toMatch(/^TIMEOUT/);
    expect(world.stockOf('TEE-NAVY-L', 'SAMPLE-WH-1')).toEqual({ onHand: 5, reserved: 4 });
    advance(60_000);
    expect(await relayErpPushes(deps())).toMatchObject({ sent: 1, replayed: 1 });
    overrides.delete('erp.sync.requestTimeoutSeconds');
    expect(world.stockOf('TEE-NAVY-L', 'SAMPLE-WH-1')).toEqual({ onHand: 5, reserved: 4 });
    expect(world.orders()).toHaveLength(3);
  });

  it('PR 199: a status waits for its order; a refused order is FAILED at once; repeated failures end DEAD and can be sent again', async () => {
    const ghost = await enqueueOrderStatus(deps(), { storeId: store.A, orderId: randomUUID(), externalOrderId: 'SAMPLE-NOPE', status: 'CANCELLED' });
    expect((await relayErpPushes(deps())).waiting).toBe(1);
    expect((await t.prisma.erpPush.findUniqueOrThrow({ where: { id: ghost.pushId } })).attempts).toBe(0);

    const short = await enqueueOrderPush(deps(), order(store.A, 'CAP-NAVY-M', 10));
    expect(await relayErpPushes(deps())).toMatchObject({ failed: 1 });
    const failed = await t.prisma.erpPush.findUniqueOrThrow({ where: { id: short.pushId } });
    expect([failed.status, failed.responseStatus]).toEqual(['FAILED', 409]);

    overrides.set('erp.push.maxAttempts', 2);
    const flaky = await enqueueOrderPush(deps(), order(store.A, 'TEE-NAVY-M', 1));
    world.failNext({ path: '/orders', status: 503, times: 2 });
    expect(await relayErpPushes(deps())).toMatchObject({ retrying: 1 });
    advance(60_000);
    expect(await relayErpPushes(deps())).toMatchObject({ dead: 1 });
    overrides.delete('erp.push.maxAttempts');
    expect((await t.prisma.erpPush.findUniqueOrThrow({ where: { id: flaky.pushId } })).status).toBe('DEAD');

    expect(await code(retryErpPushes(deps(), { actor: viewer, storeId: store.A }, { all: true }))).toBe('FORBIDDEN');
    expect(await code(retryErpPushes(deps(), { actor: syncer, storeId: store.A }, {}))).toBe('INVALID_INPUT');
    expect(await retryErpPushes(deps(), { actor: syncer, storeId: store.A }, { ids: [flaky.pushId] })).toEqual({ queued: 1 });
    expect(await relayErpPushes(deps())).toMatchObject({ sent: 1 });
    // Sent again by hand, the refused order gets the ERP's first answer again (same key): still FAILED, nothing reserved.
    expect(await retryErpPushes(deps(), { actor: syncer, storeId: store.A }, { all: true })).toEqual({ queued: 1 });
    expect(await relayErpPushes(deps())).toMatchObject({ failed: 1 });
    expect(world.stockOf('CAP-NAVY-M', 'SAMPLE-WH-1')).toEqual({ onHand: 3, reserved: 0 });
    expect(await t.prisma.auditLog.count({ where: { action: 'erp.push.retry' } })).toBe(2);
    const list = await listErpPushes(deps(), { actor: viewer, storeId: store.A }, { status: ['FAILED', 'PENDING'] });
    expect(list.counts).toMatchObject({ pending: 1, failed: 1, dead: 0, sent: 4 });
    expect(list.items.map((i) => i.status).sort()).toEqual(['FAILED', 'PENDING']);
  });

  it('PR 499: with no ERP a document is SKIPPED_NO_ERP; on the practice ERP it waits and goes once a real ERP is there', async () => {
    overrides.set(`erp.defaultMode@${store.C}`, 'NONE');
    const none = await enqueueOrderPush(deps(), order(store.C, 'TEE-NAVY-L', 1));
    expect(none.status).toBe('SKIPPED_NO_ERP');
    overrides.delete(`erp.defaultMode@${store.C}`);
    const before = await enqueueOrderPush(deps(), order(store.C, 'TEE-NAVY-L', 1));
    expect(before.status).toBe('PENDING');
    overrides.set(`erp.defaultMode@${store.C}`, 'NONE');
    expect(await relayErpPushes(deps(), { storeId: store.C })).toMatchObject({ skipped: 1 });
    overrides.delete(`erp.defaultMode@${store.C}`);

    const practice = await t.prisma.integration.create({ data: { storeId: store.B, kind: 'ERP', provider: 'extasErp', name: 'extasErp practice', mode: 'MOCK', enabled: true } });
    const held = await enqueueOrderPush(deps(), order(store.B, 'TEE-NAVY-L', 1));
    expect(await relayErpPushes(deps(), { storeId: store.B })).toMatchObject({ waiting: 1, sent: 0 });
    expect((await t.prisma.erpPush.findUniqueOrThrow({ where: { id: held.pushId } })).attempts).toBe(0);
    await t.prisma.integration.update({ where: { id: practice.id }, data: { archivedAt: clock } });
    expect(await relayErpPushes(deps(), { storeId: store.B })).toMatchObject({ sent: 1 });
    expect(await runInventoryJob(deps(), { name: 'inventory.erp.pushDocuments' })).toMatchObject({ sent: 0 });
  });

  // ---- PR 204 · the publishing queue follows ERP stock -------------------------------------------------------------

  it('PR 204: the sellable-stock check (a setting) follows the ERP; a pull re-runs the checklist of products whose stock changed', async () => {
    overrides.set('catalogue.publish.checks', { ...registry['catalogue.publish.checks'].default, sellableStock: 'warn' });
    const who = { actor: SYSTEM, storeId: store.A };
    expect((await productReadiness(catDeps(), who, products.A!.scarf!)).reminders).toContain('sellableStock');
    expect((await productReadiness(catDeps(), who, products.A!.tee!)).reminders).not.toContain('sellableStock');
    world.setStock('SCARF-NAVY-M', 'SAMPLE-WH-1', { onHand: 2 });
    const r = await pullStock(deps(), { storeId: store.A });
    expect(r.productsRechecked).toBeGreaterThanOrEqual(1);
    const stored = (await t.prisma.product.findUniqueOrThrow({ where: { id: products.A!.scarf! } })).healthIssues as { checks?: { key: string; ok: boolean }[] } | null;
    expect(stored?.checks?.find((k) => k.key === 'sellableStock')?.ok).toBe(true);
    expect((await productReadiness(catDeps(), who, products.A!.scarf!)).reminders).not.toContain('sellableStock');
    overrides.delete('catalogue.publish.checks');

    const q = await stockQueue(deps(), { actor: viewer, storeId: store.A });
    const scarf = q.items.find((i) => i.productId === products.A!.scarf);
    expect(scarf?.sellable).toBe(2);
    expect(q.items.findIndex((i) => i.sellable === 0)).not.toBe(0);

    world.setVariant({ sku: 'NEWSTYLE-RED-M', styleCode: 'NEWSTYLE', styleName: 'Sample new style', color: 'Red', size: 'M' });
    const styles = await newErpStyles(deps(), { actor: viewer, storeId: store.A });
    expect(styles.state).toBe('run');
    expect(styles.styles.find((s) => s.styleCode === 'NEWSTYLE')?.skus).toEqual([{ sku: 'NEWSTYLE-RED-M', color: 'Red', size: 'M' }]);
    expect(styles.styles.flatMap((s) => s.skus.map((x) => x.sku))).not.toContain('TEE-NAVY-M');
  });

  // ---- PR 206 · manual re-sync -----------------------------------------------------------------------------------------

  it('PR 206: re-sync all or one product, by permission, audited; no ERP answers ERP_NOT_CONNECTED', async () => {
    expect(await code(resyncStock(deps(), { actor: viewer, storeId: store.A }))).toBe('FORBIDDEN');
    expect(await resyncStock(deps(), { actor: syncer, storeId: store.A }, { full: true })).toMatchObject({ status: 'succeeded', complete: true });
    advance(60_000);
    world.adjustStock('CAP-NAVY-M', 'SAMPLE-WH-1', { onHand: 2 });
    const one = await resyncProduct(deps(), { actor: syncer, storeId: store.A }, { productId: products.A!.cap! });
    expect(one).toMatchObject({ status: 'succeeded', skus: 1, applied: 1, movements: 1 });
    expect((await levels('CAP-NAVY-M')).map((l) => l.onHand)).toEqual([5, 3, 3]);
    expect(await t.prisma.erpSyncRun.count({ where: { kind: 'stock.resyncProduct', status: 'SUCCEEDED' } })).toBe(1);
    // The same again changes nothing (the movement key comes from the ERP's own state).
    expect(await resyncProduct(deps(), { actor: syncer, storeId: store.A }, { sku: 'CAP-NAVY-M' })).toMatchObject({ applied: 0, movements: 0 });
    expect(await code(resyncProduct(deps(), { actor: syncer, storeId: store.A }, { sku: 'NO-SUCH' }))).toBe('NOT_FOUND');
    expect(await code(resyncProduct(deps(), { actor: syncer, storeId: store.A }, {}))).toBe('INVALID_INPUT');
    overrides.set(`erp.defaultMode@${store.A}`, 'NONE');
    expect(await code(resyncStock(deps(), { actor: syncer, storeId: store.A }))).toBe('ERP_NOT_CONNECTED');
    expect(await code(resyncProduct(deps(), { actor: syncer, storeId: store.A }, { sku: 'CAP-NAVY-M' }))).toBe('ERP_NOT_CONNECTED');
    overrides.delete(`erp.defaultMode@${store.A}`);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['erp.resync', 'erp.resync.product'] } } })).toBe(3);
  });

  // ---- PR 207 · the movement report and the reconciliation ---------------------------------------------------------

  it('PR 207: movements in and out per variant and location; the ledger adds up to the mirror, a gap is shown', async () => {
    // Ledger rows carry the database's own time, not the test clock.
    const range = { from: new Date(Date.now() - 86_400_000).toISOString(), to: new Date(Date.now() + 3_600_000).toISOString() };
    const r = await stockMovementReport(deps(), { actor: viewer, storeId: store.A }, range);
    const cap = r.rows.find((x) => x.sku === 'CAP-NAVY-M' && x.locationId === mainA)!;
    expect(cap).toMatchObject({ opening: 0, in: 5, out: 0, net: 5, closing: 5, movements: 2, onHandNow: 5, ledgerMatches: true });
    expect(r.totals.mismatched).toBe(0);
    expect(r.rows.every((x) => x.variantId && v.A![x.sku] === x.variantId)).toBe(true);
    // Something changed the mirror without a movement: the report says so.
    await t.prisma.stockLevel.updateMany({ where: { variantId: v.A!['TEE-NAVY-M'], locationId: mainA }, data: { onHand: 7 } });
    const after = await stockMovementReport(deps(), { actor: viewer, storeId: store.A }, { ...range, sku: 'TEE-NAVY-M' });
    expect(after.rows.map((x) => [x.sku, x.ledgerMatches, x.onHandNow])).toEqual([['TEE-NAVY-M', false, 7]]);
    overrides.set('inventory.report.maxRows', 1);
    expect((await stockMovementReport(deps(), { actor: viewer, storeId: store.A }, range)).truncated).toBe(true);
    overrides.delete('inventory.report.maxRows');
    expect(await code(stockMovementReport(deps(), { actor: viewer, storeId: store.A }, { from: range.to, to: range.from }))).toBe('INVALID_INPUT');
  });

  it('PR 207: the reconciliation names every difference with the ERP and changes nothing', async () => {
    expect(await code(reconcileWithErp(deps(), { actor: viewer, storeId: store.A }))).toBe('FORBIDDEN');
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-2', { onHand: 2 });
    const before = await t.prisma.stockLevel.findMany({ orderBy: { id: 'asc' } });
    const r = await reconcileWithErp(deps(), { actor: syncer, storeId: store.A });
    expect(r.status).toBe('succeeded');
    expect(r.counts).toEqual({ MISSING_IN_SHOP: 1, MISSING_IN_ERP: 0, ON_HAND_DIFFERS: 1, RESERVED_DIFFERS: 0 });
    expect(r.mismatches.map((m) => `${m.kind} ${m.sku} ${m.erpWarehouseId}`).sort()).toEqual(['MISSING_IN_SHOP TEE-NAVY-M SAMPLE-WH-2', 'ON_HAND_DIFFERS TEE-NAVY-M SAMPLE-WH-1']);
    expect(r.unknownSku).toBeGreaterThanOrEqual(1);
    expect(await t.prisma.stockLevel.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    const run = await t.prisma.erpSyncRun.findUniqueOrThrow({ where: { id: r.runId! } });
    expect([run.kind, run.status, run.error]).toEqual(['stock.reconcile', 'SUCCEEDED', 'MISSING_IN_SHOP ×1 · ON_HAND_DIFFERS ×1']);
    // A re-sync fixes what the check found.
    await resyncProduct(deps(), { actor: syncer, storeId: store.A }, { sku: 'TEE-NAVY-M' });
    expect((await reconcileWithErp(deps(), { actor: syncer, storeId: store.A })).counts).toEqual({ MISSING_IN_SHOP: 0, MISSING_IN_ERP: 0, ON_HAND_DIFFERS: 0, RESERVED_DIFFERS: 0 });
    overrides.set(`erp.defaultMode@${store.C}`, 'NONE');
    expect(await runInventoryJob(deps(), { name: 'inventory.erp.reconcile', storeId: store.C })).toMatchObject({ status: 'skipped', reason: 'ERP_NONE' });
    overrides.delete(`erp.defaultMode@${store.C}`);
  });

  // ---- PR 205 · the health panel ---------------------------------------------------------------------------------------

  it('PR 205: the health panel reads runs, documents, holds and alerts without calling the ERP', async () => {
    const calls = world.calls.length;
    const h = await syncHealth(deps(), { actor: viewer, storeId: store.A });
    expect(world.calls.length).toBe(calls);
    expect(h.link).toMatchObject({ state: 'connected', adapterMode: 'LIVE', erpCompanyId: 'SAMPLE-CO-1' });
    expect(h.pushes).toMatchObject({ pending: 1, failed: 1 });
    expect(h.level).toBe('failing');
    expect(h.recentRuns.length).toBeLessThanOrEqual(10);
    expect(h.recentRuns[0]!.kind).toBe('stock.reconcile');
    expect(h.stock).toMatchObject({ late: false, pollMinutes: 5, lateAfterMinutes: 30 });
    expect(h.lowStockOpen).toBeGreaterThanOrEqual(0);
    advance(31 * 60_000);
    const late = await syncHealth(deps(), { actor: viewer, storeId: store.A });
    expect(late.stock.late).toBe(true);
    overrides.set(`erp.defaultMode@${store.A}`, 'NONE');
    expect((await syncHealth(deps(), { actor: viewer, storeId: store.A })).level).toBe('off');
    overrides.delete(`erp.defaultMode@${store.A}`);
    expect(await code(syncHealth(deps(), { actor: storeAuditor, storeId: store.B }))).toBe('FORBIDDEN');
  });

  it('jobs: every interval of the timetable comes from settings', async () => {
    const plan = await inventorySchedule(deps());
    expect(plan.map((p) => [p.everyMs, p.jobs.map((j) => j.name)[0]])).toEqual([
      [5 * 60_000, 'inventory.erp.pullStock'],
      [60_000, 'inventory.reservations.release'],
      [10_000, 'inventory.erp.pushDocuments'],
      [60 * 60_000, 'inventory.lowStock.evaluate'],
      [24 * 3_600_000, 'inventory.erp.reconcile'],
    ]);
    expect(plan[0]!.jobs).toHaveLength(3);
    overrides.set('inventory.reservation.sweepSeconds', 30);
    expect((await inventorySchedule(deps()))[1]!.everyMs).toBe(30_000);
    overrides.delete('inventory.reservation.sweepSeconds');
    expect(await runInventoryJob(deps(), { name: 'inventory.lowStock.evaluate' })).toMatchObject({ raised: expect.any(Number) });
  });
});
