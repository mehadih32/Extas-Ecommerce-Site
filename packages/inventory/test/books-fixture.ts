// CN-028 · PR 615, 616 — the PostgreSQL set-up the books tests share (never imported by app code): a throwaway database
// with the real migrations, two sample stores that each speak ERP contract v6 through their OWN connection, key and
// webhook secret (CN-029 §16: one store = one ERP company, SAMPLE-CO-1 and SAMPLE-CO-2 of the practice ERP), the practice
// ERP behind LIVE connections (its fetch replaces the network), and helpers that write the shop's own records the way
// PR 610–612 write them (an order with its pieces, a courier result, a return list). Every key, secret and amount is a
// made-up test value; the clock is fixed and moved by the tests.
import { randomBytes, randomUUID } from 'node:crypto';
import { allAdapters, createConnections, createErpHttpClient, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, mockErp, type ErpApi, type ErpDocument, type ErpOrderLineV6 } from '@extas/adapters';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { applyErpEvents, createWarehouse, openErpLink, receiveErpWebhook, type SettingsReader, type WebhookDeps, type Who } from '../src';

export type World = ReturnType<typeof mockErp>;

export interface BooksFixture {
  t: TestDatabase;
  world: World;
  storeA: number;
  storeB: number;
  clock: { now: Date };
  overrides: Map<string, unknown>;
  deps: () => WebhookDeps;
  /** The store's open ERP link (made on first use, as the pull makes it). */
  linkOf: (storeId: number) => Promise<{ id: string; storeId: number }>;
  /** The practice ERP's company of a store. */
  company: (storeId: number) => string;
  /** Pushes a document to the practice ERP with the store's own key (the ERP side of a test). */
  push: (storeId: number, doc: ErpDocument) => Promise<unknown>;
  /** The store's v6 events not yet taken, delivered as signed webhooks (and applied); `drop` loses them instead. */
  deliverAll: (storeId: number, opts?: { drop?: boolean; twice?: boolean }) => Promise<number>;
  line: (lineId: string, sku: string, customerPrice: number) => ErpOrderLineV6;
  /** ERP side: an order placed and shipped (billed by the ERP). */
  placeAndShip: (storeId: number, ext: string, lines: ErpOrderLineV6[]) => Promise<void>;
  /** Shop side, as PR 610/611 write it: the order, its pieces at their shop prices, billed when the parcel left. */
  shopOrder: (storeId: number, ext: string, pieces: { lineId: string; sku: string; shopPrice: number }[], billedAt: Date | null) => Promise<string>;
  /** Shop side, as PR 611 writes it: a courier result. */
  shopDelivery: (storeId: number, ext: string, outcome: 'DELIVERED' | 'PARTIAL' | 'RETURNED', at: Date, opts?: { kept?: string[]; answerKept?: string[]; identification?: string }) => Promise<string>;
  /** Shop side, as PR 612 writes it: a return list with one parcel per order. */
  shopHandBack: (storeId: number, returnListId: string, handedBackAt: string, parcels: { ext: string; received: number; result?: string }[]) => Promise<void>;
  /** A staff member holding exactly these permissions in a store (or every store). */
  staff: (perms: string[], storeId: number | null, label: string) => Promise<Actor>;
  /** An owner (the seeded owner role, every store). */
  owner: (label: string) => Promise<Actor>;
  who: (actor: Actor, storeId: number) => Who;
  setV6: (storeId: number, on?: boolean) => void;
}

const BASE = 'https://erp.example.test';

export async function setUpBooks(label: string): Promise<BooksFixture> {
  const t = await createTestDatabase(label);
  const [storeA, storeB] = await seedSampleStores(t.prisma);
  await syncAuth(t.prisma);
  const clock = { now: new Date('2026-11-02T04:00:00Z') };
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
  const connections = createConnections({
    db: t.prisma,
    vault: { get: async (name: string, scope?: { storeId?: number | null }) => vaultValues.get(vaultKey(name, scope?.storeId ?? null)) ?? null },
    adapters: allAdapters,
    secretCacheMs: 0,
    testTimeoutMs: 5_000,
  });
  const deps = (): WebhookDeps => ({ db: t.prisma, settings, connections, now: () => clock.now, sleep: async () => {}, random: () => 0.5 });
  const world = mockErp();
  world.reset();
  world.now = () => clock.now;
  globalThis.fetch = world.fetch as typeof fetch;

  const keys = new Map<number, string>();
  const secrets = new Map<number, string>();
  const companies = new Map<number, string>([
    [storeA, 'SAMPLE-CO-1'],
    [storeB, 'SAMPLE-CO-2'],
  ]);
  const whs = new Map<number, string>([
    [storeA, 'SAMPLE-WH-1'],
    [storeB, 'SAMPLE-WH-3'],
  ]);
  for (const store of [storeA, storeB]) {
    const key = randomBytes(16).toString('hex');
    const hook = randomBytes(24).toString('hex');
    keys.set(store, key);
    secrets.set(store, hook);
    vaultValues.set(vaultKey('extasErp.apiKey', store), key);
    vaultValues.set(vaultKey('extasErp.webhookSecret', store), hook);
    vaultValues.set(vaultKey('extasErp.signingSecret', store), randomBytes(24).toString('hex'));
    world.acceptKey(key, companies.get(store));
    await t.prisma.integration.create({ data: { storeId: store, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } });
    for (const [sku, price] of [['POLO-NAVY-M', 650], ['POLO-NAVY-L', 700], ['POLO-BLACK-XL', 650], ['TEE-WHITE-M', 450]] as const) {
      world.setVariant({ sku, styleCode: 'POLO', styleName: 'Sample polo', color: 'NAVY', size: 'M', shopPrice: price, grade: 'A' }, companies.get(store));
      world.setStock(sku, whs.get(store)!, { onHand: 50 }, companies.get(store));
    }
  }
  await createWarehouse(deps(), { actor: SYSTEM, storeId: storeA }, { code: 'WH-A', name: 'Sample warehouse A', erpWarehouseId: 'SAMPLE-WH-1' });

  const erp = (storeId: number) => createErpHttpClient({ baseUrl: BASE, apiKey: keys.get(storeId)!, provider: 'extasErp', fetch: world.fetch as typeof fetch }) as ErpApi;
  let keyN = 0;
  const push = (storeId: number, doc: ErpDocument) => erp(storeId).push(doc, { idempotencyKey: `sample-${storeId}-${++keyN}` });
  const line = (lineId: string, sku: string, customerPrice: number): ErpOrderLineV6 => ({ lineId, sku, quantity: 1, grade: 'A', unitPrice: `${customerPrice}.00`, discount: '0.00', customerPrice, comboId: null });
  const linkOf = async (storeId: number) => {
    const integ = await t.prisma.integration.findFirstOrThrow({ where: { storeId, kind: 'ERP' }, select: { id: true } });
    const l = await openErpLink(t.prisma, storeId, integ.id);
    return { id: l.id, storeId: l.storeId };
  };
  const tz = 'Asia/Dhaka';
  const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const date = (d: string) => new Date(`${d}T00:00:00Z`);
  void dayOf;

  let staffN = 0;
  const fx: BooksFixture = {
    t,
    world,
    storeA,
    storeB,
    clock,
    overrides,
    deps,
    linkOf,
    company: (s) => companies.get(s)!,
    push,
    async deliverAll(storeId, opts = {}) {
      const hooks = world.v6Webhooks(secrets.get(storeId)!, companies.get(storeId));
      if (opts.drop) return hooks.length;
      for (const w of hooks) {
        for (let i = 0; i < (opts.twice ? 2 : 1); i++) {
          const r = await receiveErpWebhook(deps(), { rawBody: w.body, signature: w.headers[ERP_SIGNATURE_HEADER] ?? null, timestamp: w.headers[ERP_TIMESTAMP_HEADER] ?? null, idempotencyKey: null, deliveryId: w.headers['x-extas-delivery'] ?? null });
          if (r.status >= 300) throw new Error(`webhook refused: ${r.status} ${r.code}`);
        }
      }
      await applyErpEvents(deps());
      return hooks.length;
    },
    line,
    async placeAndShip(storeId, ext, lines) {
      await push(storeId, { type: 'order.create', body: { channel: 'WEBSITE', status: 'CONFIRMED', externalOrderId: ext, customerName: 'Sample customer', customerPhone: '01700000000', shippingAddress: 'Sample address', paymentMethod: 'COD', note: null, items: lines, deliveryCharge: 0, advancePaid: 0 } } as ErpDocument);
      await push(storeId, { type: 'shipment.create', body: { externalOrderId: ext, courier: 'PATHAO', consignmentId: `C-${ext}`, charge: '60.00', pickedUpAt: clock.now.toISOString() } } as ErpDocument);
    },
    async shopOrder(storeId, ext, pieces, billedAt) {
      const link = await linkOf(storeId);
      const total = pieces.reduce((s, p) => s + p.shopPrice * 100, 0);
      const o = await t.prisma.erpOrder.create({
        data: { storeId, linkId: link.id, orderId: randomUUID(), externalOrderId: ext, erpTotalMinor: BigInt(total), acceptedAt: clock.now, consignmentId: `C-${ext}`, courier: 'PATHAO', pickedUpAt: billedAt, shipmentSentAt: billedAt, billedAt },
      });
      for (const p of pieces) {
        await t.prisma.erpOrderLine.create({ data: { storeId, erpOrderId: o.id, lineId: p.lineId, sku: p.sku, customerPriceMinor: p.shopPrice * 150, shopPriceMinor: p.shopPrice * 100 } });
      }
      return o.id;
    },
    async shopDelivery(storeId, ext, outcome, at, opts = {}) {
      const link = await linkOf(storeId);
      const o = await t.prisma.erpOrder.findUniqueOrThrow({ where: { linkId_externalOrderId: { linkId: link.id, externalOrderId: ext } } });
      const r = await t.prisma.erpDeliveryResult.create({
        data: {
          storeId,
          erpOrderId: o.id,
          outcome,
          courier: 'PATHAO',
          consignmentId: o.consignmentId,
          at,
          keptLineIds: opts.kept ?? [],
          sentAt: at,
          answer: opts.answerKept || opts.identification ? { externalOrderId: ext, status: outcome, identification: opts.identification ?? 'GREEN', keptLines: opts.answerKept ?? [], returnedLines: [] } : undefined,
        },
      });
      return r.id;
    },
    async shopHandBack(storeId, returnListId, handedBackAt, parcels) {
      const link = await linkOf(storeId);
      const list = await t.prisma.erpReturnList.create({ data: { storeId, linkId: link.id, returnListId, courier: 'PATHAO', handedBackAt: date(handedBackAt), status: 'ACCEPTED', sentAt: clock.now } });
      for (const p of parcels) {
        await t.prisma.erpReturnListParcel.create({ data: { storeId, returnListId: list.id, externalOrderId: p.ext, consignmentId: `C-${p.ext}`, receivedCount: p.received, result: p.result ?? 'IN_RETURN_STOCK' } });
      }
    },
    async staff(perms, storeId, label) {
      const n = ++staffN;
      const role = await createRole(t.prisma, SYSTEM, { key: `test-books-${label.toLowerCase()}-${n}`, nameEn: label, nameBn: label, permissions: perms as never });
      const u = await t.prisma.staffUser.create({ data: { email: `books-${label.toLowerCase()}-${n}@example.com`, displayName: `Books ${label}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId } });
      return { staffUserId: u.id };
    },
    async owner(label) {
      const role = await t.prisma.role.findUniqueOrThrow({ where: { key: 'owner' } });
      const u = await t.prisma.staffUser.create({ data: { email: `owner-${label}-${++staffN}@example.com`, displayName: `Owner ${label}`, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: null } });
      return { staffUserId: u.id };
    },
    who: (actor, storeId) => ({ actor, storeId }),
    setV6(storeId, on = true) {
      overrides.set(`erp.model@${storeId}`, on ? 'v6' : 'v5');
    },
  };
  fx.setV6(storeA);
  fx.setV6(storeB);
  return fx;
}

/** A business date as the database keeps it. */
export const day = (d: string) => new Date(`${d}T00:00:00Z`);
