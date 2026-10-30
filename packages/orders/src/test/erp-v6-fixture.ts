// CN-028 · PR 612–614 test fixture (never imported by app code): the orders fixture on ERP contract v6. Two stores,
// each with its own ERP connection, its own made-up key in the vault under its own store id and its own practice ERP
// company (CN-029 §16: SAMPLE-CO-1 for store A, SAMPLE-CO-2 for store B); the practice ERP's fetch replaces the
// network. `shipped()` places an order through the real checkout and confirms it: in v6 PR 610 writes the order's
// ErpOrder and one ErpOrderLine per piece and its relay sends it; the courier's pickup goes by PR 611's
// `enqueueErpShipment`, and every courier result by its `enqueueErpDelivery` (the ERP delivery result the exchange
// window counts from). Nothing here writes those rows itself. Every value is a made-up test value.
import { randomBytes, randomUUID } from 'node:crypto';
import { allAdapters, createConnections, createErpHttpClient, mockErp, type ErpApi, type ErpDocument } from '@extas/adapters';
import { createRole, SYSTEM } from '@extas/auth';
import { enqueueErpDelivery, enqueueErpShipment, erpOrderLinesOf, erpOrderOf, openErpLink, relayErpPushes, type InventoryDeps, type SettingsReader } from '@extas/inventory';
import type { Key, Value } from '@extas/settings';
import { ORDER_PERMISSIONS, type OrdersDeps, type Who } from '../context';
import { confirmOrder, orderStep } from '../commands';
import { systemBy } from '../service';
import { setUpOrders, type OrdersFixture } from '../testing';

const BASE = 'https://erp.example.test';

export interface ShippedOrder {
  orderId: string;
  number: string;
  /** The ERP's order id for it (the shop's order number, as PR 610 sends it). */
  ext: string;
  consignmentId: string;
  /** One ERP line per piece, in order: `${ext}-1`, `${ext}-2`, … (none in v5: the order went as a v5 document). */
  lineIds: string[];
  /** Its ErpOrder row (empty in v5). */
  erpOrderId: string;
}

export interface ErpFixture extends OrdersFixture {
  B: number;
  staffB: Who;
  world: ReturnType<typeof mockErp>;
  /** `${key}@${storeId}` → value (a per-store setting for this test). */
  perStore: Map<string, unknown>;
  v6: (storeId?: number) => void;
  /** The orders deps with the ERP connections (the admin's). */
  erpDeps: () => OrdersDeps;
  inv: () => InventoryDeps;
  courierId: string;
  /** The store's own ERP client, to act as the courier and the ERP would (deliveries, the owner's checks). */
  erp: (storeId?: number) => ErpApi;
  push: (doc: ErpDocument, storeId?: number) => Promise<unknown>;
  sku: (variantId: string) => Promise<string>;
  /** Placed, confirmed, sent to the ERP and handed to the courier (its consignment). */
  shipped: (name: string, lines?: { variantId: string; quantity?: number }[]) => Promise<ShippedOrder>;
  /** The courier marks the parcel delivered (PR 611's delivery result to the ERP and the shop's order step). */
  delivered: (o: ShippedOrder) => Promise<void>;
  /** The courier brings the parcel back (refused at the door). */
  returned: (o: ShippedOrder) => Promise<void>;
  /** Only the ERP hears the courier's result (PR 611), at the fixture's clock; `kept`: the lines of a PARTIAL. */
  courierResult: (orderId: string, outcome: 'DELIVERED' | 'PARTIAL' | 'RETURNED', kept?: string[]) => Promise<void>;
  /** PR 610's relay: every document of the store's outbox that is due goes to its ERP now. */
  relay: (storeId?: number) => Promise<unknown>;
  linkId: (storeId?: number) => Promise<string>;
  restore: () => void;
}

export async function setUpErpOrders(label: string): Promise<ErpFixture> {
  const f = await setUpOrders(label);
  const p = f.t.prisma;
  const base = f.deps().settings;
  const perStore = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K, opts?: { storeId?: number | null }): Promise<Value<K>> {
      const sk = `${key}@${opts?.storeId ?? '-'}`;
      if (perStore.has(sk)) return perStore.get(sk) as Value<K>;
      return base.value(key, opts as { storeId?: number });
    },
  } as SettingsReader;

  const B = (await p.store.create({ data: { slug: `erp-b-${label}`.replace(/_/g, '-'), name: 'Sample store B', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
  const roleB = await createRole(p, SYSTEM, { key: 'test-orders-b', nameEn: 'orders b', nameBn: 'orders b', permissions: [...ORDER_PERMISSIONS] });
  const ub = await p.staffUser.create({ data: { email: 'orders-b@example.com', displayName: 'Store B staff', passwordHash: 'not-a-login' } });
  await p.staffRoleAssignment.create({ data: { staffUserId: ub.id, roleId: roleB.id, storeId: B } });

  const world = mockErp();
  world.reset();
  world.now = () => f.clock.now;
  const vault = new Map<string, string>();
  const keys = new Map<number, string>();
  for (const [store, company] of [[f.S, 'SAMPLE-CO-1'], [B, 'SAMPLE-CO-2']] as const) {
    const key = randomBytes(16).toString('hex');
    keys.set(store, key);
    vault.set(`${store}:extasErp.apiKey`, key);
    vault.set(`${store}:extasErp.webhookSecret`, randomBytes(24).toString('hex'));
    vault.set(`${store}:extasErp.signingSecret`, randomBytes(24).toString('hex'));
    world.acceptKey(key, company);
    await p.integration.create({ data: { storeId: store, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } });
  }
  const realFetch = globalThis.fetch;
  globalThis.fetch = world.fetch as typeof fetch;
  const connections = createConnections({ db: p, vault: { get: async (name: string, scope?: { storeId?: number | null }) => vault.get(`${scope?.storeId ?? '-'}:${name}`) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
  const inv = (): InventoryDeps => ({ db: p, settings, connections, now: () => f.clock.now, sleep: async () => {}, random: () => 0.5 });
  const erpDeps = (): OrdersDeps => ({ db: p, settings, inventory: inv(), now: () => f.clock.now });

  // The shop's sample SKUs in the practice ERP, with shop prices and stock in its first warehouse.
  const skus = await p.productVariant.findMany({ where: { id: { in: Object.values(f.v) } }, select: { sku: true } });
  for (const { sku } of skus) {
    world.setVariant({ sku, styleCode: sku.split('-')[0] ?? sku, styleName: 'Sample style', shopPrice: 900, grade: 'A' });
    world.setStock(sku, 'SAMPLE-WH-1', { onHand: 10 });
    world.setVariant({ sku, styleCode: sku.split('-')[0] ?? sku, styleName: 'Sample style', shopPrice: 900, grade: 'A' }, 'SAMPLE-CO-2');
    world.setStock(sku, 'SAMPLE-WH-3', { onHand: 10 }, 'SAMPLE-CO-2');
  }
  const courierId = (await p.courierAccount.create({ data: { storeId: f.S, providerKey: 'pathao', name: 'Test courier', enabled: true } })).id;
  const integrationOf = async (storeId: number) => (await p.integration.findFirstOrThrow({ where: { storeId, kind: 'ERP' }, select: { id: true } })).id;
  const linkId = async (storeId = f.S) => (await openErpLink(p, storeId, await integrationOf(storeId))).id;
  const erp = (storeId = f.S) => createErpHttpClient({ baseUrl: BASE, apiKey: keys.get(storeId)!, provider: 'extasErp', fetch: world.fetch as typeof fetch }) as ErpApi;
  let n = 0;
  const push = (doc: ErpDocument, storeId = f.S) => erp(storeId).push(doc, { idempotencyKey: `fixture-${++n}` });
  const by = systemBy('test');
  const relay = (storeId = f.S) => relayErpPushes(inv(), { storeId });
  // PR 611: one courier result to the ERP (the shipment's consignment, nothing collected), then the relay
  const courierResult = async (orderId: string, outcome: 'DELIVERED' | 'PARTIAL' | 'RETURNED', kept?: string[]) => {
    const s = await p.shipment.findFirst({ where: { storeId: f.S, orderId }, orderBy: { createdAt: 'desc' }, select: { consignmentId: true } });
    const mark = kept ? { keptLineIds: kept, discountGivenMinor: 0, phoneConfirmed: false, note: null, markedById: null } : null;
    await enqueueErpDelivery(inv(), { storeId: f.S, orderId, outcome, courier: 'PATHAO', consignmentId: s?.consignmentId ?? null, collectedMinor: 0, at: f.clock.now, mark });
    await relay();
  };
  const sku = async (id: string) => (await p.productVariant.findUniqueOrThrow({ where: { id }, select: { sku: true } })).sku;

  const fx: ErpFixture = {
    ...f,
    B,
    staffB: { actor: { staffUserId: ub.id }, storeId: B },
    world,
    perStore,
    v6: (storeId = f.S) => perStore.set(`erp.model@${storeId}`, 'v6'),
    erpDeps,
    inv,
    courierId,
    erp,
    push,
    sku,
    linkId,
    restore: () => {
      globalThis.fetch = realFetch;
    },
    relay,
    courierResult,
    async shipped(name, lines) {
      const o = await f.place(name, lines ? { lines } : {});
      // PR 610: in v6 the confirm writes the ErpOrder and its lines; the relay sends the order to the store's ERP
      await confirmOrder(erpDeps(), f.staff, o.orderId);
      await relay();
      const eo = await erpOrderOf(p, { storeId: f.S, orderId: o.orderId });
      const lineIds = eo ? (await erpOrderLinesOf(p, eo.id)).map((l) => l.lineId) : [];
      const consignmentId = `C-${o.number}-${randomUUID().slice(0, 6)}`;
      const r = { storeId: f.S, orderId: o.orderId };
      await orderStep(erpDeps(), r, by, 'pack');
      await p.shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, consignmentId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
      await orderStep(erpDeps(), r, by, 'handover');
      // PR 611: the courier's pickup sends the shipment (the ERP's bill)
      await enqueueErpShipment(inv(), { storeId: f.S, orderId: o.orderId, courier: 'PATHAO', consignmentId, chargeMinor: 6_000, pickedUpAt: f.clock.now });
      await relay();
      return { orderId: o.orderId, number: o.number, ext: eo?.externalOrderId ?? o.number, consignmentId, lineIds, erpOrderId: eo?.id ?? '' };
    },
    async delivered(o) {
      await courierResult(o.orderId, 'DELIVERED');
      await orderStep(erpDeps(), { storeId: f.S, orderId: o.orderId }, by, 'delivered');
    },
    async returned(o) {
      await courierResult(o.orderId, 'RETURNED');
      await orderStep(erpDeps(), { storeId: f.S, orderId: o.orderId }, by, 'returned');
    },
  };
  return fx;
}
