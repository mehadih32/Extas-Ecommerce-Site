// CN-028 (PR 607–610) on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): the shop speaking ERP contract v6 behind the setting `erp.model`. The ERP is the practice
// ERP behind a LIVE connection (its fetch replaces the network); every key and secret is made up here, and the clock
// is fixed at 23 Oct 2026.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allAdapters, createConnections, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, mockErp } from '@extas/adapters';
import { SYSTEM, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createColour, createProduct, createSize, createVariant, type CatalogueDeps } from '@extas/catalogue';
import { registry, type Key, type Value } from '@extas/settings';
import {
  createWarehouse,
  enqueueOrderStatus,
  enqueueReturnPush,
  erpModelOf,
  processErpWebhook,
  pushCounts,
  receiveErpWebhook,
  relayErpPushes,
  RETIRED_V6,
  type SettingsReader,
  type WebhookDeps,
} from '../src';

const T0 = new Date('2026-10-23T04:00:00Z');
const BASE = 'https://erp.example.test';

describe.skipIf(!HAS_TEST_DB)('CN-028 on PostgreSQL: ERP contract v6', () => {
  let t: TestDatabase;
  let storeA = 0;
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
  let connections: ReturnType<typeof createConnections>;
  const deps = (): WebhookDeps => ({ db: t.prisma, settings, connections, now: () => clock, sleep: async () => {}, random: () => 0.5 });
  const catDeps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const world = mockErp();
  const realFetch = globalThis.fetch;
  const secret = randomBytes(24).toString('hex');
  const v: Record<string, string> = {};
  const v6 = () => overrides.set(`erp.model@${storeA}`, 'v6');

  beforeAll(async () => {
    t = await createTestDatabase('erpv6');
    [storeA] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string) => vaultValues.get(name) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    await createWarehouse(deps(), { actor: SYSTEM, storeId: storeA }, { code: 'WH-A', name: 'Sample warehouse A', erpWarehouseId: 'SAMPLE-WH-1' });
    const navy = (await createColour(catDeps(), { actor: SYSTEM, storeId: storeA }, { nameEn: 'Navy', hex: '1b2a4a' })).colour;
    const m = await createSize(catDeps(), { actor: SYSTEM, storeId: storeA }, { label: 'M' });
    const tee = await createProduct(catDeps(), { actor: SYSTEM, storeId: storeA }, { nameEn: 'Sample Tee', erpStyleCode: 'TEE' });
    v['TEE-NAVY-M'] = (await createVariant(catDeps(), { actor: SYSTEM, storeId: storeA }, { sku: 'TEE-NAVY-M', productId: tee.id, colourId: navy.id, sizeId: m.id, barcode: 'BC-TEE-M' })).id;

    world.reset();
    world.now = () => clock;
    const key = randomBytes(16).toString('hex');
    vaultValues.set('extasErp.apiKey', key);
    vaultValues.set('extasErp.webhookSecret', secret);
    world.acceptKey(key, 'SAMPLE-CO-1');
    globalThis.fetch = world.fetch as typeof fetch;
    await t.prisma.integration.create({ data: { storeId: null, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } });
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 4 });
    world.setVariant({ sku: 'TEE-NAVY-M', barcode: 'BC-TEE-M', styleCode: 'TEE', retailPrice: '1250.50', avgCost: '610.125' });
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await t?.drop();
  });
  beforeEach(() => {
    clock = new Date(clock.getTime() + 60_000);
  });

  // ---- PR 607 · the switch and the retired calls ---------------------------------------------------------------------

  it('PR 607: every store speaks v5 until the switch; the switch is per store', async () => {
    expect(registry['erp.model'].default).toBe('v5');
    expect(await erpModelOf(deps(), storeA)).toBe('v5');
  });

  it('PR 607: a return queued before the switch is never sent after it: it becomes RETIRED, kept for the record', async () => {
    const r = await enqueueReturnPush(deps(), { storeId: storeA, returnId: randomUUID(), orderId: randomUUID(), externalOrderId: 'SAMPLE-R1', reason: 'size', items: [{ sku: 'TEE-NAVY-M', quantity: 1 }], version: 1 });
    expect(r.status).toBe('PENDING');
    v6();
    const out = await relayErpPushes(deps());
    expect(out.retired).toBe(1);
    expect(out.sent).toBe(0);
    const row = await t.prisma.erpPush.findUniqueOrThrow({ where: { id: r.pushId } });
    expect([row.status, row.lastError, row.attempts]).toEqual(['RETIRED', RETIRED_V6, 0]);
    // A second run leaves it alone, and the row is still there (nothing deleted).
    expect((await relayErpPushes(deps())).retired).toBe(0);
    expect((await pushCounts(t.prisma, storeA)).retired).toBe(1);
  });

  it('PR 607: in v6 a delivered or returned status and a return are written RETIRED at once; a cancel still goes', async () => {
    v6();
    const orderId = randomUUID();
    const delivered = await enqueueOrderStatus(deps(), { storeId: storeA, orderId, externalOrderId: 'SAMPLE-1', status: 'DELIVERED' });
    const returned = await enqueueOrderStatus(deps(), { storeId: storeA, orderId, externalOrderId: 'SAMPLE-1', status: 'RETURNED' });
    const cancelled = await enqueueOrderStatus(deps(), { storeId: storeA, orderId, externalOrderId: 'SAMPLE-1', status: 'CANCELLED' });
    const ret = await enqueueReturnPush(deps(), { storeId: storeA, returnId: randomUUID(), orderId, externalOrderId: 'SAMPLE-1', reason: 'size', items: [{ sku: 'TEE-NAVY-M', quantity: 1 }], version: 0 });
    expect([delivered.status, returned.status, cancelled.status, ret.status]).toEqual(['RETIRED', 'RETIRED', 'PENDING', 'RETIRED']);
    const row = await t.prisma.erpPush.findUniqueOrThrow({ where: { id: delivered.pushId } });
    expect(row.lastError).toBe(RETIRED_V6);
  });

  it('PR 607: in v6 a variant.changed never reads the ERP retail price or average cost; v5 still does', async () => {
    const headers = (w: { headers: Record<string, string> }) => ({ signature: w.headers[ERP_SIGNATURE_HEADER] ?? null, timestamp: w.headers[ERP_TIMESTAMP_HEADER] ?? null, idempotencyKey: null });
    const apply = async () => {
      const w = world.variantChangedWebhook(secret, 'TEE-NAVY-M');
      const r = await receiveErpWebhook(deps(), { rawBody: w.body, ...headers(w) });
      expect(r.status).toBe(202);
      expect((await processErpWebhook(deps(), r.eventId!)).status).toBe('processed');
      return t.prisma.productVariant.findUniqueOrThrow({ where: { id: v['TEE-NAVY-M'] }, select: { barcode: true, erpRetailPriceMinor: true, avgCostMinor: true } });
    };
    overrides.delete(`erp.model@${storeA}`);
    expect(await apply()).toEqual({ barcode: 'BC-TEE-M', erpRetailPriceMinor: 125050, avgCostMinor: 61013 });
    v6();
    clock = new Date(clock.getTime() + 60_000);
    world.setVariant({ sku: 'TEE-NAVY-M', barcode: 'BC-TEE-M2', styleCode: 'TEE', retailPrice: '9999.00', avgCost: '1.00' });
    expect(await apply()).toEqual({ barcode: 'BC-TEE-M2', erpRetailPriceMinor: 125050, avgCostMinor: 61013 });
  });
});
