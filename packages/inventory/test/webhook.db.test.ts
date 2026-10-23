// PR 196 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the ERP → shop webhooks end to end — refused without a secret, refused unsigned, wrong or stale, stored once, applied
// once by the worker's function, out-of-order changes ignored, the poll afterwards adding nothing, and the practice ERP
// never touching stock unless its stock switch is on. The ERP is the practice ERP behind a LIVE connection; every key
// and secret is made up here.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allAdapters, createConnections, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, mockErp, signedErpWebhook, signErpBody } from '@extas/adapters';
import { SYSTEM, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createColour, createProduct, createSize, createVariant, type CatalogueDeps } from '@extas/catalogue';
import { registry, type Key, type Value } from '@extas/settings';
import { createWarehouse, processErpWebhook, pullStock, receiveErpWebhook, waitingErpWebhooks, type SettingsReader, type WebhookDeps, type WebhookRequest } from '../src';

const T0 = new Date('2026-10-22T06:00:00Z');
const BASE = 'https://erp.example.test';

describe.skipIf(!HAS_TEST_DB)('PR 196 on PostgreSQL: ERP webhooks', () => {
  let t: TestDatabase;
  let storeA = 0;
  let clock = T0;
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
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
  let integrationId = '';
  let mainA = '';
  const vA: Record<string, string> = {};

  const request = (w: { body: string; headers: Record<string, string> }, over: Partial<WebhookRequest> = {}): WebhookRequest => ({
    rawBody: w.body,
    signature: w.headers[ERP_SIGNATURE_HEADER] ?? null,
    timestamp: w.headers[ERP_TIMESTAMP_HEADER] ?? null,
    idempotencyKey: null,
    ...over,
  });
  const receive = (w: { body: string; headers: Record<string, string> }, over: Partial<WebhookRequest> = {}) => receiveErpWebhook(deps(), request(w, over));
  const level = async (sku: string) => t.prisma.stockLevel.findFirst({ where: { variantId: vA[sku], locationId: mainA }, select: { onHand: true, available: true, erpUpdatedAt: true } });
  const movements = (sku: string) => t.prisma.stockMovement.findMany({ where: { variantId: vA[sku] }, select: { delta: true, referenceType: true, referenceId: true } });
  const event = (id: string) => t.prisma.webhookEvent.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    t = await createTestDatabase('webhook');
    [storeA] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string) => vaultValues.get(name) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    const wa = await createWarehouse(deps(), { actor: SYSTEM, storeId: storeA! }, { code: 'WH-A', name: 'Sample warehouse A', erpWarehouseId: 'SAMPLE-WH-1' });
    mainA = wa.locations.find((l) => l.code === 'main')!.id;
    const navy = (await createColour(catDeps(), { actor: SYSTEM, storeId: storeA! }, { nameEn: 'Navy', hex: '1b2a4a' })).colour;
    const m = await createSize(catDeps(), { actor: SYSTEM, storeId: storeA! }, { label: 'M' });
    const tee = await createProduct(catDeps(), { actor: SYSTEM, storeId: storeA! }, { nameEn: 'Sample Tee', erpStyleCode: 'TEE' });
    vA['TEE-NAVY-M'] = (await createVariant(catDeps(), { actor: SYSTEM, storeId: storeA! }, { sku: 'TEE-NAVY-M', productId: tee.id, colourId: navy.id, sizeId: m.id, barcode: 'BC-TEE-M' })).id;

    world.reset();
    world.now = () => clock;
    const key = randomBytes(16).toString('hex');
    vaultValues.set('extasErp.apiKey', key);
    world.acceptKey(key, 'SAMPLE-CO-1');
    globalThis.fetch = world.fetch as typeof fetch;
    integrationId = (await t.prisma.integration.create({ data: { storeId: null, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } })).id;
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 4 });
    world.setVariant({ sku: 'TEE-NAVY-M', barcode: 'BC-TEE-M', styleCode: 'TEE', retailPrice: '1250.50', avgCost: '610.125' });
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await t?.drop();
  });
  beforeEach(() => {
    overrides.clear();
  });

  it('refuses every request while no webhook secret is in the vault — even a correctly shaped one', async () => {
    const w = world.stockChangedWebhook('a-secret-the-shop-does-not-have', 'TEE-NAVY-M', 'SAMPLE-WH-1');
    expect(await receive(w)).toEqual({ status: 401, code: 'NO_SECRET' });
    expect(await t.prisma.webhookEvent.count()).toBe(0);
  });

  it('refuses unsigned, wrongly signed and stale messages and stores none of them', async () => {
    vaultValues.set('extasErp.webhookSecret', secret);
    const w = world.stockChangedWebhook(secret, 'TEE-NAVY-M', 'SAMPLE-WH-1');
    expect(await receive(w, { signature: null, timestamp: null })).toEqual({ status: 401, code: 'UNSIGNED' });
    expect(await receive(world.stockChangedWebhook('not-the-secret', 'TEE-NAVY-M', 'SAMPLE-WH-1'))).toEqual({ status: 401, code: 'BAD_SIGNATURE' });
    // The same body with a changed byte no longer matches its signature.
    expect(await receive(w, { rawBody: w.body.replace('"onHand":4', '"onHand":40') })).toEqual({ status: 401, code: 'BAD_SIGNATURE' });
    // Signed long ago (older than erp.webhook.maxAgeSeconds): a replay.
    const maxAge = registry['erp.webhook.maxAgeSeconds'].default as number;
    advance((maxAge + 1) * 1000);
    expect(await receive(w)).toEqual({ status: 401, code: 'STALE' });
    expect(await t.prisma.webhookEvent.count()).toBe(0);
  });

  it('refuses everything while switched off, and a body over the size limit unread', async () => {
    const w = world.stockChangedWebhook(secret, 'TEE-NAVY-M', 'SAMPLE-WH-1');
    overrides.set('erp.webhook.enabled', false);
    expect(await receive(w)).toEqual({ status: 503, code: 'OFF' });
    overrides.clear();
    overrides.set('erp.webhook.maxBodyKb', 1);
    const big = signedErpWebhook(secret, { id: 'evt_big', type: 'stock.changed', data: { pad: 'x'.repeat(2048) } }, clock);
    expect(await receive(big)).toEqual({ status: 413, code: 'TOO_LARGE' });
    expect(await t.prisma.webhookEvent.count()).toBe(0);
  });

  it('stores a signed stock.changed once (a retry is the same event), and the worker applies it once', async () => {
    advance(60_000);
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 4 });
    const w = world.stockChangedWebhook(secret, 'TEE-NAVY-M', 'SAMPLE-WH-1', { id: 'evt_stock_1' });
    const first = await receive(w);
    expect(first).toMatchObject({ status: 202, code: 'ACCEPTED' });
    const again = await receive(w);
    expect(again).toEqual({ status: 200, code: 'DUPLICATE', eventId: first.eventId });
    const row = await event(first.eventId!);
    expect([row.source, row.eventType, row.idempotencyKey, row.status, row.signatureValid]).toEqual(['erp', 'stock.changed', 'evt_stock_1', 'RECEIVED', true]);
    expect((row.payload as { integrationId: string }).integrationId).toBe(integrationId);
    expect(await waitingErpWebhooks(deps())).toEqual([first.eventId]);

    // Both sample stores use the one installation-wide connection; only store A sells this SKU.
    const done = await processErpWebhook(deps(), first.eventId!);
    expect(done).toMatchObject({ status: 'processed', reason: null, stores: 2, applied: 1, movements: 1 });
    expect((await event(first.eventId!)).status).toBe('PROCESSED');
    expect(await level('TEE-NAVY-M')).toMatchObject({ onHand: 4, available: 4 });
    expect(await movements('TEE-NAVY-M')).toEqual([{ delta: 4, referenceType: 'WebhookEvent', referenceId: first.eventId }]);
    expect(await waitingErpWebhooks(deps())).toEqual([]);

    // Run again (a retried job): nothing changes.
    expect(await processErpWebhook(deps(), first.eventId!)).toMatchObject({ status: 'already', reason: 'PROCESSED' });
    // The poll afterwards sees the same ERP state: no second movement.
    expect(await pullStock(deps(), { storeId: storeA })).toMatchObject({ status: 'succeeded' });
    expect(await movements('TEE-NAVY-M')).toHaveLength(1);
  });

  it('ignores a late, older change: a "5" from before never overwrites the newer "2"', async () => {
    const older = clock;
    advance(60_000);
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 2 });
    const newer = await receive(world.stockChangedWebhook(secret, 'TEE-NAVY-M', 'SAMPLE-WH-1'));
    expect((await processErpWebhook(deps(), newer.eventId!)).status).toBe('processed');
    // The older message arrives last (sent before, delayed on the way).
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 5, updatedAt: new Date(older.getTime() + 1) });
    const late = await receive(world.stockChangedWebhook(secret, 'TEE-NAVY-M', 'SAMPLE-WH-1'));
    const r = await processErpWebhook(deps(), late.eventId!);
    expect(r).toMatchObject({ status: 'ignored', stale: 1, movements: 0 });
    expect(r.reason).toMatch(/^OUT_OF_ORDER/);
    const ev = await event(late.eventId!);
    expect([ev.status, ev.error?.startsWith('OUT_OF_ORDER')]).toEqual(['IGNORED', true]);
    expect(await level('TEE-NAVY-M')).toMatchObject({ onHand: 2 });
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 2, updatedAt: clock });
  });

  it('logs unknown types as ignored, a broken event as failed, and needs an event id', async () => {
    const odd = await receive(signedErpWebhook(secret, { id: 'evt_odd', type: 'order.shipped', data: {} }, clock));
    expect(odd).toMatchObject({ status: 202, code: 'IGNORED_TYPE' });
    expect([(await event(odd.eventId!)).status, (await event(odd.eventId!)).error]).toEqual(['IGNORED', 'UNKNOWN_TYPE: order.shipped']);
    const broken = await receive(signedErpWebhook(secret, { id: 'evt_broken', type: 'stock.changed', data: { sku: 'TEE-NAVY-M' } }, clock));
    expect(broken).toMatchObject({ status: 400, code: 'BAD_PAYLOAD' });
    expect((await event(broken.eventId!)).status).toBe('FAILED');
    // No id in the body and no Idempotency-Key: refused. With the header, it is the id.
    const noId = signedErpWebhook(secret, { type: 'order.shipped', data: {} }, clock);
    expect(await receive(noId)).toEqual({ status: 400, code: 'NO_EVENT_ID' });
    expect(await receive(noId, { idempotencyKey: 'idem-1' })).toMatchObject({ status: 202, code: 'IGNORED_TYPE' });
    const notJson = signedErpWebhook(secret, { id: 'x', type: 'y', data: {} }, clock);
    const raw = 'not json';
    expect(await receive(notJson, { rawBody: raw, signature: signErpBody(secret, raw) })).toEqual({ status: 400, code: 'BAD_JSON' });
    // None of these is waiting for the worker.
    expect(await waitingErpWebhooks(deps())).toEqual([]);
  });

  it('treats an id seen before the dedupe window as a new event, and keeps the old row', async () => {
    overrides.set('erp.webhook.dedupeHours', 1);
    advance(2 * 3_600_000);
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 3 });
    const r = await receive(world.stockChangedWebhook(secret, 'TEE-NAVY-M', 'SAMPLE-WH-1', { id: 'evt_stock_1' }));
    expect(r).toMatchObject({ status: 202, code: 'ACCEPTED' });
    expect((await event(r.eventId!)).idempotencyKey).toBe(`evt_stock_1@${clock.toISOString()}`);
    expect(await t.prisma.webhookEvent.count({ where: { idempotencyKey: { startsWith: 'evt_stock_1' } } })).toBe(2);
    // Within the (short) window again: a duplicate of the new one.
    expect(await receive(world.stockChangedWebhook(secret, 'TEE-NAVY-M', 'SAMPLE-WH-1', { id: 'evt_stock_1' }))).toEqual({ status: 200, code: 'DUPLICATE', eventId: r.eventId });
    expect((await processErpWebhook(deps(), r.eventId!)).status).toBe('processed');
    expect(await level('TEE-NAVY-M')).toMatchObject({ onHand: 3 });
  });

  it('variant.changed refreshes the ERP mirror (never the sale price); an older change is ignored', async () => {
    advance(60_000);
    world.setVariant({ sku: 'TEE-NAVY-M', barcode: 'BC-TEE-M2', styleCode: 'TEE', retailPrice: '1250.50', avgCost: '610.125' });
    const before = await t.prisma.productVariant.findUniqueOrThrow({ where: { id: vA['TEE-NAVY-M'] }, select: { priceMinor: true } });
    const r = await receive(world.variantChangedWebhook(secret, 'TEE-NAVY-M'));
    expect(await processErpWebhook(deps(), r.eventId!)).toMatchObject({ status: 'processed', applied: 1 });
    const after = await t.prisma.productVariant.findUniqueOrThrow({ where: { id: vA['TEE-NAVY-M'] }, select: { barcode: true, erpRetailPriceMinor: true, avgCostMinor: true, erpUpdatedAt: true, priceMinor: true } });
    expect([after.barcode, after.erpRetailPriceMinor, after.avgCostMinor, after.erpUpdatedAt?.toISOString(), after.priceMinor]).toEqual(['BC-TEE-M2', 125050, 61013, clock.toISOString(), before.priceMinor]);

    const old = signedErpWebhook(secret, { id: 'evt_variant_old', type: 'variant.changed', data: { sku: 'TEE-NAVY-M', barcode: 'BC-OLD', updatedAt: new Date(clock.getTime() - 3_600_000).toISOString() } }, clock);
    const o = await receive(old);
    expect(await processErpWebhook(deps(), o.eventId!)).toMatchObject({ status: 'ignored', stale: 1 });
    expect((await t.prisma.productVariant.findUniqueOrThrow({ where: { id: vA['TEE-NAVY-M'] }, select: { barcode: true } })).barcode).toBe('BC-TEE-M2');

    const unknown = await receive(signedErpWebhook(secret, { id: 'evt_unknown_sku', type: 'variant.changed', data: { sku: 'NOT-IN-SHOP', updatedAt: clock.toISOString() } }, clock));
    expect(await processErpWebhook(deps(), unknown.eventId!)).toMatchObject({ status: 'ignored', reason: 'UNKNOWN_SKU' });
  });

  it('on the practice ERP, a webhook reaches stock only with the practice stock switch on', async () => {
    await t.prisma.integration.update({ where: { id: integrationId }, data: { mode: 'MOCK' } });
    connections.forget();
    advance(60_000);
    world.setStock('TEE-NAVY-M', 'SAMPLE-WH-1', { onHand: 9 });
    const r = await receive(world.stockChangedWebhook(secret, 'TEE-NAVY-M', 'SAMPLE-WH-1'));
    expect(r.code).toBe('ACCEPTED');
    expect(await processErpWebhook(deps(), r.eventId!)).toMatchObject({ status: 'ignored', reason: 'ERP_ON_PRACTICE' });
    expect(await level('TEE-NAVY-M')).toMatchObject({ onHand: 3 });

    overrides.set('erp.mock.stockEnabled', true);
    const r2 = await receive(world.stockChangedWebhook(secret, 'TEE-NAVY-M', 'SAMPLE-WH-1'));
    expect(await processErpWebhook(deps(), r2.eventId!)).toMatchObject({ status: 'processed', applied: 1 });
    expect(await level('TEE-NAVY-M')).toMatchObject({ onHand: 9 });
    await t.prisma.integration.update({ where: { id: integrationId }, data: { mode: 'LIVE' } });
    connections.forget();
  });

  it('lists waiting events oldest first, at most a batch, and only within the window', async () => {
    overrides.set('erp.webhook.batchSize', 2);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      advance(1000);
      ids.push((await receive(signedErpWebhook(secret, { id: `evt_wait_${i}`, type: 'stock.changed', data: { sku: 'TEE-NAVY-M', warehouseId: 'SAMPLE-WH-1', onHand: 9, reserved: 0, available: 9, updatedAt: clock.toISOString() } }, clock))).eventId!);
    }
    expect(await waitingErpWebhooks(deps())).toEqual(ids.slice(0, 2));
    overrides.set('erp.webhook.dedupeHours', 1);
    advance(2 * 3_600_000);
    expect(await waitingErpWebhooks(deps())).toEqual([]);
  });
});
