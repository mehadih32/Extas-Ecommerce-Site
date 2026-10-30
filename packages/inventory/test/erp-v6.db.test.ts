// CN-028 (PR 607, 608) on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): the shop speaking ERP contract v6 behind the setting `erp.model`. The ERP is the practice
// ERP behind LIVE connections (its fetch replaces the network); every key and secret is made up here, and the clock
// is fixed at 23 Oct 2026. CN-029 §16: one store = one ERP company — store A and store B each have their own
// connection, their own key (practice companies SAMPLE-CO-1 and SAMPLE-CO-2) and their own webhook and signing
// secrets in the vault under the store's id; nothing of one ever reaches the other.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allAdapters,
  createConnections,
  createErpHttpClient,
  ERP_SIGNATURE_HEADER,
  ERP_TIMESTAMP_HEADER,
  mockErp,
  signedErpWebhook,
  type ErpApi,
  type ErpDocument,
  type ErpOrderLineV6,
} from '@extas/adapters';
import { SYSTEM, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createColour, createProduct, createSize, createVariant, type CatalogueDeps } from '@extas/catalogue';
import { registry, type Key, type Value } from '@extas/settings';
import {
  applyErpEvents,
  createWarehouse,
  enqueueOrderStatus,
  erpEventCounts,
  erpEventProblems,
  inventorySchedule,
  pullErpEvents,
  runInventoryJob,
  enqueueReturnPush,
  erpModelOf,
  processErpWebhook,
  pushCounts,
  receiveErpWebhook,
  relayErpPushes,
  resolveErp,
  RETIRED_V6,
  type SettingsReader,
  type WebhookDeps,
} from '../src';

const T0 = new Date('2026-10-23T04:00:00Z');
const BASE = 'https://erp.example.test';

describe.skipIf(!HAS_TEST_DB)('CN-028 on PostgreSQL: ERP contract v6', () => {
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
  /** The vault, per store: `<storeId>:<name>` (`-:<name>` for an installation-wide key). */
  const vaultValues = new Map<string, string>();
  const vaultKey = (name: string, storeId: number | null) => `${storeId ?? '-'}:${name}`;
  let connections: ReturnType<typeof createConnections>;
  const deps = (): WebhookDeps => ({ db: t.prisma, settings, connections, now: () => clock, sleep: async () => {}, random: () => 0.5 });
  const catDeps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const world = mockErp();
  const realFetch = globalThis.fetch;
  const secret = randomBytes(24).toString('hex');
  const secretB = randomBytes(24).toString('hex');
  const v: Record<string, string> = {};
  const v6 = () => overrides.set(`erp.model@${storeA}`, 'v6');
  let erpKey = '';
  let erpKeyB = '';
  let integrationId = '';
  let integrationB = '';
  /** The shop's side of the practice ERP (the HTTP client the adapter uses), to drive orders, deliveries and returns. */
  const erp = () => createErpHttpClient({ baseUrl: BASE, apiKey: erpKey, provider: 'extasErp', fetch: world.fetch as typeof fetch }) as ErpApi;
  let keyN = 0;
  const push = (doc: ErpDocument) => erp().push(doc, { idempotencyKey: `sample-${++keyN}` });
  const line = (lineId: string, sku: string, customerPrice: number): ErpOrderLineV6 => ({ lineId, sku, quantity: 1, grade: 'A', unitPrice: `${customerPrice}.00`, discount: '0.00', customerPrice, comboId: null });
  const placeReturned = async (ext: string, lines: ErpOrderLineV6[]) => {
    await push({ type: 'order.create', body: { channel: 'WEBSITE', status: 'CONFIRMED', externalOrderId: ext, customerName: 'Sample customer', customerPhone: '01700000000', shippingAddress: 'Sample address', paymentMethod: 'COD', note: null, items: lines, deliveryCharge: 0, advancePaid: 0 } });
    await push({ type: 'shipment.create', body: { externalOrderId: ext, courier: 'PATHAO', consignmentId: `C-${ext}`, charge: '60.00', pickedUpAt: '2026-10-23T12:00:00+06:00' } });
    await push({ type: 'order.delivery', externalOrderId: ext, body: { status: 'RETURNED', courier: 'PATHAO', consignmentId: `C-${ext}`, collected: 0, at: '2026-10-23T15:40:00+06:00' } });
    await push({ type: 'returnList.create', body: { returnListId: `RL-${ext}`, courier: 'PATHAO', handedBackAt: '2026-10-24', parcels: [{ consignmentId: `C-${ext}`, externalOrderId: ext, receivedCount: lines.length }] } });
  };
  const deliver = (w: { body: string; headers: Record<string, string> }) =>
    receiveErpWebhook(deps(), { rawBody: w.body, signature: w.headers[ERP_SIGNATURE_HEADER] ?? null, timestamp: w.headers[ERP_TIMESTAMP_HEADER] ?? null, idempotencyKey: null, deliveryId: w.headers['x-extas-delivery'] ?? null });

  beforeAll(async () => {
    t = await createTestDatabase('erpv6');
    [storeA, storeB] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    connections = createConnections({ db: t.prisma, vault: { get: async (name: string, scope?: { storeId?: number | null }) => vaultValues.get(vaultKey(name, scope?.storeId ?? null)) ?? null }, adapters: allAdapters, secretCacheMs: 0, testTimeoutMs: 5_000 });
    await createWarehouse(deps(), { actor: SYSTEM, storeId: storeA }, { code: 'WH-A', name: 'Sample warehouse A', erpWarehouseId: 'SAMPLE-WH-1' });
    const navy = (await createColour(catDeps(), { actor: SYSTEM, storeId: storeA }, { nameEn: 'Navy', hex: '1b2a4a' })).colour;
    const m = await createSize(catDeps(), { actor: SYSTEM, storeId: storeA }, { label: 'M' });
    const tee = await createProduct(catDeps(), { actor: SYSTEM, storeId: storeA }, { nameEn: 'Sample Tee', erpStyleCode: 'TEE' });
    v['TEE-NAVY-M'] = (await createVariant(catDeps(), { actor: SYSTEM, storeId: storeA }, { sku: 'TEE-NAVY-M', productId: tee.id, colourId: navy.id, sizeId: m.id, barcode: 'BC-TEE-M' })).id;

    world.reset();
    world.now = () => clock;
    // One key, one webhook secret and one signing secret per store, each in the vault under the store's id.
    erpKey = randomBytes(16).toString('hex');
    erpKeyB = randomBytes(16).toString('hex');
    for (const [store, key, hook] of [[storeA, erpKey, secret], [storeB, erpKeyB, secretB]] as const) {
      vaultValues.set(vaultKey('extasErp.apiKey', store), key);
      vaultValues.set(vaultKey('extasErp.webhookSecret', store), hook);
      vaultValues.set(vaultKey('extasErp.signingSecret', store), randomBytes(24).toString('hex'));
    }
    world.acceptKey(erpKey, 'SAMPLE-CO-1');
    world.acceptKey(erpKeyB, 'SAMPLE-CO-2');
    globalThis.fetch = world.fetch as typeof fetch;
    for (const [sku, price] of [['POLO-NAVY-M', 650], ['POLO-NAVY-L', 700], ['POLO-BLACK-XL', 650]] as const) {
      world.setVariant({ sku, styleCode: 'POLO', styleName: 'Sample polo', color: 'NAVY', size: 'M', shopPrice: price, grade: 'A' });
      world.setStock(sku, 'SAMPLE-WH-1', { onHand: 10 });
      // Store B's own ERP company has the same sample styles in its own warehouse.
      world.setVariant({ sku, styleCode: 'POLO', styleName: 'Sample polo', color: 'NAVY', size: 'M', shopPrice: price, grade: 'A' }, 'SAMPLE-CO-2');
      world.setStock(sku, 'SAMPLE-WH-3', { onHand: 10 }, 'SAMPLE-CO-2');
    }
    const connection = (storeId: number) => ({ storeId, kind: 'ERP' as const, provider: 'extasErp', name: 'extasErp', mode: 'LIVE' as const, enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] });
    integrationId = (await t.prisma.integration.create({ data: connection(storeA) })).id;
    integrationB = (await t.prisma.integration.create({ data: connection(storeB) })).id;
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

  it('PR 607: every store speaks v5 until the switch; the switch is per store, one way, and needs the owner', async () => {
    // Unset (null) is v5. Switching retires the v5 documents still queued, which cannot be undone: owner's OK only.
    expect(registry['erp.model'].default).toBeNull();
    expect(registry['erp.model'].requiresOwnerOk).toBe(true);
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

  // ---- PR 608 · the ERP event ledger -------------------------------------------------------------------------------

  it('PR 608: in v5 a v6 event is logged IGNORED as before and never reaches the ledger', async () => {
    overrides.set(`erp.model@${storeA}`, 'v5');
    world.v6().hold('PRACTICE');
    const [w] = world.v6Webhooks(secret);
    expect(await deliver(w!)).toMatchObject({ status: 202, code: 'IGNORED_TYPE' });
    expect(await t.prisma.erpEvent.count()).toBe(0);
    v6();
  });

  it('PR 608: every v6 event is kept once by its eventId, forever: a retry days later is the same event', async () => {
    world.v6().release();
    const [w] = world.v6Webhooks(secret);
    const first = await deliver(w!);
    expect(first).toMatchObject({ status: 202, code: 'ACCEPTED' });
    const row = await t.prisma.erpEvent.findUniqueOrThrow({ where: { id: first.eventId! } });
    expect([row.type, row.eventId, row.storeId, row.source, row.status, row.integrationId, row.businessDate?.toISOString().slice(0, 10)]).toEqual(['account.released', w!.id, storeA, 'WEBHOOK', 'RECEIVED', integrationId, '2026-10-23']);
    // Four days on (past the 72-hour window of PR 196), signed again as the ERP retries: still the same event.
    clock = new Date(clock.getTime() + 4 * 86_400_000);
    const again = signedErpWebhook(secret, JSON.parse(w!.body), clock);
    expect(await deliver({ body: again.body, headers: { ...again.headers, 'x-extas-delivery': w!.id } })).toEqual({ status: 200, code: 'DUPLICATE', eventId: first.eventId });
    expect(await t.prisma.erpEvent.count({ where: { eventId: w!.id } })).toBe(1);
    // ~~stored: 1 / STORED~~ — Updated 30 Oct 2026 (PR 610): `account.released` now has its handler (the held
    // orders go again), so it is APPLIED; an event without a handler is still only STORED.
    expect(await applyErpEvents(deps())).toMatchObject({ seen: 1, applied: 1 });
    expect((await t.prisma.erpEvent.findUniqueOrThrow({ where: { id: first.eventId! } })).status).toBe('APPLIED');
    // Applying again changes nothing.
    expect(await applyErpEvents(deps())).toMatchObject({ seen: 0 });
  });

  it("PR 608: a broken v6 event from the store's own ERP is kept FAILED in its ledger (health panel) and answered 202", async () => {
    const w = signedErpWebhook(secret, { id: 'evt_broken', type: 'return.piece.decided', data: { externalOrderId: 'SAMPLE-1', lineId: 'L1', decision: 'MAYBE' } } as never, clock);
    const r = await deliver(w);
    expect(r).toMatchObject({ status: 202, code: 'KEPT_FAILED' });
    const row = await t.prisma.erpEvent.findUniqueOrThrow({ where: { id: r.eventId! } });
    expect([row.storeId, row.status, row.type, row.source]).toEqual([storeA, 'FAILED', 'return.piece.decided', 'WEBHOOK']);
    // Kept under its own key, never in the slot of the eventId it claims (a valid copy may still come).
    expect(row.eventId).toBe(`broken:${row.rawBodyHash!.slice(0, 40)}`);
    expect(row.error).toMatch(/^BAD_PAYLOAD \(eventId evt_broken\): /);
    expect(row.rawBodyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await t.prisma.erpEvent.count({ where: { eventId: 'evt_broken' } })).toBe(0);
    // Sent again: still one row, never applied; the health panel counts it.
    expect(await deliver(signedErpWebhook(secret, JSON.parse(w.body), clock))).toMatchObject({ status: 202, code: 'KEPT_FAILED', eventId: r.eventId });
    expect(await t.prisma.erpEvent.count({ where: { error: { contains: 'evt_broken' } } })).toBe(1);
    expect((await applyErpEvents(deps())).seen).toBe(0);
    expect((await erpEventProblems(t.prisma, storeA)).failed).toBe(1);
  });

  it('PR 608: a known eventId with another body is never applied: it is flagged on the stored event and on health', async () => {
    const ev = { eventId: 'evt_sample_body', type: 'account.released', occurredAt: clock.toISOString(), date: '2026-10-27', data: {} };
    const sign = (e: Record<string, unknown>) => {
      const w = signedErpWebhook(secret, e as never, clock);
      return { body: w.body, headers: { ...w.headers, 'x-extas-delivery': String(e.eventId) } };
    };
    const first = await deliver(sign(ev));
    expect(first).toMatchObject({ status: 202, code: 'ACCEPTED' });
    // The same body again (keys in another order) is a plain repeat.
    expect(await deliver(sign({ data: {}, date: ev.date, occurredAt: ev.occurredAt, type: ev.type, eventId: ev.eventId }))).toEqual({ status: 200, code: 'DUPLICATE', eventId: first.eventId });
    // Another body under the same eventId: kept apart, counted, the stored body unchanged.
    expect(await deliver(sign({ ...ev, type: 'account.hold', data: { reason: 'PRACTICE' } }))).toEqual({ status: 202, code: 'BODY_CHANGED', eventId: first.eventId });
    const row = await t.prisma.erpEvent.findUniqueOrThrow({ where: { id: first.eventId! } });
    expect([row.type, row.conflictCount, row.conflictHash === row.bodyHash, row.conflictAt?.getTime()]).toEqual(['account.released', 1, false, clock.getTime()]);
    expect(row.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await erpEventProblems(t.prisma, storeA)).conflicts).toBe(1);
    await applyErpEvents(deps());
    // ~~STORED~~ — Updated 30 Oct 2026 (PR 610): the stored body (`account.released`) has its handler now.
    expect((await t.prisma.erpEvent.findUniqueOrThrow({ where: { id: first.eventId! } })).status).toBe('APPLIED');
  });

  it('PR 608: returns by webhook and by pull are one ledger; a missing piece becomes one courier claim; a reversal marks it REVERSED', async () => {
    const before = await t.prisma.erpEvent.count();
    await placeReturned('WEB-31', [line('WEB-31-1', 'POLO-NAVY-M', 850), line('WEB-31-2', 'POLO-NAVY-L', 1190), line('WEB-31-3', 'POLO-BLACK-XL', 980)]);
    const practice = world.v6();
    practice.decidePiece('WEB-31', 'WEB-31-1', 'APPROVED');
    const [missing] = practice.decidePiece('WEB-31', 'WEB-31-3', 'DECLINED', 'PIECE_MISSING');
    const hooks = world.v6Webhooks(secret);
    // The approval's webhook is lost on the way; every other one arrives.
    const lost = hooks.find((h) => h.body.includes('"decision":"APPROVED"'))!;
    for (const h of hooks) if (h !== lost) expect((await deliver(h)).status).toBe(202);
    expect(await t.prisma.erpEvent.count({ where: { eventId: lost.id } })).toBe(0);

    // The pull brings the lost one in, and finds the others already there.
    const pulled = await pullErpEvents(deps(), { storeId: storeA });
    expect(pulled).toMatchObject({ status: 'ok', complete: true, newEvents: 1, claims: 1 });
    expect(pulled.events).toBeGreaterThan(pulled.newEvents);
    const approved = await t.prisma.erpEvent.findFirstOrThrow({ where: { eventId: lost.id } });
    expect([approved.source, approved.moneyEvent, approved.externalOrderId]).toEqual(['PULL', true, 'WEB-31']);
    // A second pull adds nothing new.
    expect(await pullErpEvents(deps(), { storeId: storeA })).toMatchObject({ status: 'ok', newEvents: 0 });

    await applyErpEvents(deps());
    const claims = await t.prisma.erpClaim.findMany({ where: { storeId: storeA } });
    expect(claims.map((c) => [c.externalOrderId, c.lineId, c.reason, c.status, c.consignmentId, c.valueMinor, c.eventId])).toEqual([['WEB-31', 'WEB-31-3', 'PIECE_MISSING', 'OPEN', 'C-WEB-31', 65000n, missing!.eventId]]);
    expect(await t.prisma.erpEvent.count()).toBeGreaterThan(before);

    // The owner finds the piece after all: the ERP reverses the decision with a new event.
    const rev = practice.reverseDecision(missing!.eventId, 'APPROVED');
    for (const h of world.v6Webhooks(secret)) await deliver(h);
    expect(await applyErpEvents(deps())).toMatchObject({ reversed: 1 });
    expect((await t.prisma.erpClaim.findFirstOrThrow({ where: { lineId: 'WEB-31-3' } })).status).toBe('REVERSED');
    expect((await t.prisma.erpEvent.findFirstOrThrow({ where: { eventId: missing!.eventId } })).reversedBy).toBe(rev.eventId);
    expect((await t.prisma.erpEvent.findFirstOrThrow({ where: { eventId: rev.eventId } })).moneyEvent).toBe(true);
  });

  it('PR 608: a correction that arrives before its original waits for it, then both are applied once', async () => {
    const original = { eventId: 'evt_sample_original', type: 'return.piece.decided', occurredAt: clock.toISOString(), date: '2026-10-27', data: { externalOrderId: 'WEB-31', lineId: 'WEB-31-2', decision: 'DECLINED', reason: 'PARCEL_MISSING', credit: 0 } };
    const correction = { eventId: 'evt_sample_correction', type: 'return.piece.decided', occurredAt: clock.toISOString(), date: '2026-10-27', reverses: original.eventId, data: { externalOrderId: 'WEB-31', lineId: 'WEB-31-2', decision: 'APPROVED', credit: 700 } };
    const sign = (ev: { eventId: string }) => {
      const w = signedErpWebhook(secret, ev as never, clock);
      return { body: w.body, headers: { ...w.headers, 'x-extas-delivery': ev.eventId } };
    };
    expect((await deliver(sign(correction))).status).toBe(202);
    expect(await applyErpEvents(deps())).toMatchObject({ waiting: 1, applied: 0 });
    expect((await t.prisma.erpEvent.findFirstOrThrow({ where: { eventId: correction.eventId } })).status).toBe('WAITING_ORIGINAL');
    expect((await deliver(sign(original))).status).toBe(202);
    const r = await applyErpEvents(deps());
    expect(r).toMatchObject({ reversed: 1, waiting: 0 });
    const rows = await t.prisma.erpEvent.findMany({ where: { eventId: { in: [original.eventId, correction.eventId] } }, orderBy: { eventId: 'desc' } });
    expect(rows.map((x) => [x.eventId, x.status, x.reversedBy])).toEqual([
      ['evt_sample_original', 'APPLIED', correction.eventId],
      ['evt_sample_correction', 'STORED', null],
    ]);
    // The claim the original made is kept, marked REVERSED.
    expect((await t.prisma.erpClaim.findFirstOrThrow({ where: { lineId: 'WEB-31-2' } })).status).toBe('REVERSED');
    expect(await applyErpEvents(deps())).toMatchObject({ seen: 0 });
    const counts = await erpEventCounts(t.prisma, { storeId: storeA });
    expect(counts.WAITING_ORIGINAL + counts.RECEIVED).toBe(0);
    // Only the broken event of the test above is FAILED.
    expect(counts.FAILED).toBe(1);
  });

  const signA = (ev: Record<string, unknown>) => {
    const w = signedErpWebhook(secret, ev as never, clock);
    return { body: w.body, headers: { ...w.headers, 'x-extas-delivery': String(ev.eventId) } };
  };
  const decided = (eventId: string, lineId: string, decision: string, extra: Record<string, unknown> = {}) => ({
    eventId,
    type: 'return.piece.decided',
    occurredAt: clock.toISOString(),
    date: '2026-10-27',
    data: { externalOrderId: 'WEB-41', lineId, decision, ...(decision === 'DECLINED' ? { reason: 'PIECE_MISSING' } : { credit: 650 }) },
    ...extra,
  });

  it('PR 608: a correction undoes only what was applied: a STORED original is marked, its claim untouched', async () => {
    const link = await t.prisma.erpStoreLink.findFirstOrThrow({ where: { storeId: storeA, endedAt: null } });
    // An approval is STORED (it changes nothing here). A claim that happens to carry its eventId must not be touched.
    expect((await deliver(signA(decided('evt_sample_stored', 'WEB-41-1', 'APPROVED')))).status).toBe(202);
    expect(await applyErpEvents(deps())).toMatchObject({ stored: 1 });
    await t.prisma.erpClaim.create({ data: { storeId: storeA, linkId: link.id, integrationId, externalOrderId: 'WEB-41', lineId: 'WEB-41-1', reason: 'PARCEL_MISSING', source: 'PULL', eventId: 'evt_sample_stored' } });
    expect((await deliver(signA(decided('evt_sample_stored_fix', 'WEB-41-1', 'DECLINED', { reverses: 'evt_sample_stored' })))).status).toBe(202);
    expect(await applyErpEvents(deps())).toMatchObject({ reversed: 1, applied: 1 });
    expect((await t.prisma.erpEvent.findFirstOrThrow({ where: { eventId: 'evt_sample_stored' } })).reversedBy).toBe('evt_sample_stored_fix');
    expect((await t.prisma.erpClaim.findFirstOrThrow({ where: { linkId: link.id, lineId: 'WEB-41-1', eventId: 'evt_sample_stored' } })).status).toBe('OPEN');
  });

  it('PR 608: a correction of a FAILED original undoes nothing and waits; after `erp.events.correctionWaitHours` it is FAILED', async () => {
    // The original could not be applied (FAILED after its tries); its correction must not mark or undo anything.
    expect((await deliver(signA(decided('evt_sample_bad_orig', 'WEB-41-2', 'DECLINED')))).status).toBe(202);
    await t.prisma.erpEvent.updateMany({ where: { eventId: 'evt_sample_bad_orig' }, data: { status: 'FAILED', error: 'sample: failed after its tries' } });
    expect((await deliver(signA(decided('evt_sample_bad_fix', 'WEB-41-2', 'APPROVED', { reverses: 'evt_sample_bad_orig' })))).status).toBe(202);
    expect(await applyErpEvents(deps())).toMatchObject({ reversed: 0, applied: 0, waiting: 1 });
    const fix = await t.prisma.erpEvent.findFirstOrThrow({ where: { eventId: 'evt_sample_bad_fix' } });
    expect([fix.status, fix.error?.startsWith('ORIGINAL_FAILED')]).toEqual(['WAITING_ORIGINAL', true]);
    expect((await t.prisma.erpEvent.findFirstOrThrow({ where: { eventId: 'evt_sample_bad_orig' } })).reversedBy).toBeNull();
    // Still waiting just before the wait ends; FAILED after it, on the health panel.
    const wait = registry['erp.events.correctionWaitHours'].default as number;
    clock = new Date(fix.receivedAt.getTime() + wait * 3_600_000 - 60_000);
    expect(await applyErpEvents(deps())).toMatchObject({ failed: 0 });
    const before = (await erpEventProblems(t.prisma, storeA)).failed;
    clock = new Date(fix.receivedAt.getTime() + wait * 3_600_000 + 60_000);
    expect(await applyErpEvents(deps())).toMatchObject({ failed: 1 });
    const after = await t.prisma.erpEvent.findUniqueOrThrow({ where: { id: fix.id } });
    expect([after.status, after.error?.startsWith('ORIGINAL_NEVER_CAME')]).toEqual(['FAILED', true]);
    expect((await erpEventProblems(t.prisma, storeA)).failed).toBe(before + 1);
  });

  it('PR 608: a broken webhook never takes its eventId: the valid copy by pull is stored and applied, the broken row stays on health', async () => {
    await placeReturned('WEB-B1', [line('WEB-B1-1', 'POLO-NAVY-M', 850)]);
    const practice = world.v6();
    const [ev] = practice.decidePiece('WEB-B1', 'WEB-B1-1', 'DECLINED', 'PIECE_MISSING');
    const hook = world.v6Webhooks(secret).find((h) => h.id === ev!.eventId)!;
    // The webhook arrives broken on the way (an unknown decision): kept FAILED, answered 202.
    const body = JSON.parse(hook.body) as { data: Record<string, unknown> };
    body.data.decision = 'MAYBE';
    const broken = await deliver(signA(body as never));
    expect(broken).toMatchObject({ status: 202, code: 'KEPT_FAILED' });
    expect(await t.prisma.erpEvent.count({ where: { storeId: storeA, eventId: ev!.eventId } })).toBe(0);
    // The hourly pull brings the valid copy: it takes the real slot, as new, and is applied.
    expect(await pullErpEvents(deps(), { storeId: storeA })).toMatchObject({ status: 'ok' });
    const real = await t.prisma.erpEvent.findFirstOrThrow({ where: { storeId: storeA, eventId: ev!.eventId } });
    expect([real.source, real.conflictCount]).toEqual(['PULL', 0]);
    await applyErpEvents(deps());
    expect((await t.prisma.erpEvent.findUniqueOrThrow({ where: { id: real.id } })).status).toBe('APPLIED');
    expect((await t.prisma.erpClaim.findFirstOrThrow({ where: { storeId: storeA, lineId: 'WEB-B1-1' } })).eventId).toBe(ev!.eventId);
    // The broken row is still there, FAILED, naming the eventId it claimed, and on the health panel.
    const kept = await t.prisma.erpEvent.findUniqueOrThrow({ where: { id: broken.eventId! } });
    expect([kept.status, kept.eventId.startsWith('broken:'), kept.error?.includes(ev!.eventId)]).toEqual(['FAILED', true, true]);
    expect((await erpEventProblems(t.prisma, storeA)).failed).toBeGreaterThanOrEqual(1);
  });

  it('PR 608: corrections waiting for their original never hold up new events, whatever the batch size', async () => {
    overrides.set('erp.events.applyBatch', 1);
    try {
      // Two corrections whose originals have not come, then a new event.
      for (const n of [1, 2]) expect((await deliver(signA(decided(`evt_sample_early_${n}`, `WEB-41-${n + 2}`, 'APPROVED', { reverses: `evt_sample_later_${n}` })))).status).toBe(202);
      // One at a time (batch 1): each run takes the oldest new event; the waiting one is looked at apart.
      expect(await applyErpEvents(deps())).toMatchObject({ waiting: 1 });
      expect(await applyErpEvents(deps())).toMatchObject({ waiting: 2 });
      clock = new Date(clock.getTime() + 60_000);
      expect((await deliver(signA(decided('evt_sample_new', 'WEB-41-9', 'APPROVED')))).status).toBe(202);
      expect(await applyErpEvents(deps())).toMatchObject({ stored: 1 });
      expect((await t.prisma.erpEvent.findFirstOrThrow({ where: { eventId: 'evt_sample_new' } })).status).toBe('STORED');
      // The original of one comes: that correction applies, the other keeps waiting.
      expect((await deliver(signA(decided('evt_sample_later_1', 'WEB-41-3', 'DECLINED')))).status).toBe(202);
      overrides.set('erp.events.applyBatch', 10);
      const r = await applyErpEvents(deps());
      expect(r).toMatchObject({ reversed: 1, waiting: 1 });
      const rows = await t.prisma.erpEvent.findMany({ where: { eventId: { startsWith: 'evt_sample_early_' } }, orderBy: { eventId: 'asc' } });
      expect(rows.map((x) => x.status)).toEqual(['STORED', 'WAITING_ORIGINAL']);
    } finally {
      overrides.delete('erp.events.applyBatch');
    }
  });

  it('PR 608: a ready correction is applied even behind more older waiting corrections than one batch', async () => {
    overrides.set('erp.events.applyBatch', 2);
    try {
      // Three older corrections whose originals never come, then one whose original does.
      for (const n of [1, 2, 3]) expect((await deliver(signA(decided(`evt_sample_lone_${n}`, `WEB-41-${n + 20}`, 'APPROVED', { reverses: `evt_sample_never_${n}` })))).status).toBe(202);
      await applyErpEvents(deps());
      await applyErpEvents(deps());
      clock = new Date(clock.getTime() + 60_000);
      expect((await deliver(signA(decided('evt_sample_ready_fix', 'WEB-41-30', 'APPROVED', { reverses: 'evt_sample_ready_orig' })))).status).toBe(202);
      await applyErpEvents(deps());
      expect((await t.prisma.erpEvent.count({ where: { eventId: { startsWith: 'evt_sample_lone_' }, status: 'WAITING_ORIGINAL' } }))).toBe(3);
      expect((await deliver(signA(decided('evt_sample_ready_orig', 'WEB-41-30', 'DECLINED')))).status).toBe(202);
      // The original is applied as a new event; its correction is found at once, not after the three expire.
      expect(await applyErpEvents(deps())).toMatchObject({ reversed: 1 });
      expect((await t.prisma.erpEvent.findFirstOrThrow({ where: { eventId: 'evt_sample_ready_fix' } })).status).toBe('STORED');
    } finally {
      overrides.delete('erp.events.applyBatch');
    }
  });

  it('PR 608: a pull stopped by `erp.sync.maxPagesPerRun` carries on from its cursor next run, so no event is skipped', async () => {
    await placeReturned('WEB-P1', [line('WEB-P1-1', 'POLO-NAVY-M', 850)]);
    await placeReturned('WEB-P2', [line('WEB-P2-1', 'POLO-NAVY-L', 1190)]);
    const practice = world.v6();
    const ids = [...practice.decidePiece('WEB-P1', 'WEB-P1-1', 'APPROVED'), ...practice.decidePiece('WEB-P2', 'WEB-P2-1', 'APPROVED')].map((e) => e.eventId);
    practice.takeEvents(); // every webhook is lost: only the pull can bring them in
    overrides.set('erp.sync.pageSize', 1);
    overrides.set('erp.sync.maxPagesPerRun', 1);
    // The ERP lists out of order: the first item of the first page says it changed far in the future.
    const inner = globalThis.fetch;
    let firstPage = true;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await inner(input, init);
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (!url.pathname.endsWith('/returns') || url.searchParams.get('cursor') || !firstPage) return res;
      firstPage = false;
      const body = (await res.json()) as { items: { updatedAt: string }[] };
      if (body.items[0]) body.items[0].updatedAt = '2027-06-01T00:00:00.000Z';
      return new Response(JSON.stringify(body), { status: res.status, headers: res.headers });
    }) as typeof fetch;
    try {
      let runs = 0;
      let r;
      do {
        r = await pullErpEvents(deps(), { storeId: storeA });
        expect(r.status).toBe('ok');
        runs++;
      } while (!r.complete && runs < 20);
      expect(r.complete).toBe(true);
      expect(runs).toBeGreaterThan(1);
      expect(firstPage).toBe(false);
      const kept = await t.prisma.erpEvent.findMany({ where: { storeId: storeA, eventId: { in: ids } } });
      expect(kept.map((k) => k.eventId).sort()).toEqual([...ids].sort());
      const state = await t.prisma.erpSyncState.findUniqueOrThrow({ where: { storeId_resource: { storeId: storeA, resource: 'events.returns' } } });
      expect(state.cursor).toBeNull();
    } finally {
      globalThis.fetch = inner;
      overrides.delete('erp.sync.pageSize');
      overrides.delete('erp.sync.maxPagesPerRun');
      // Back from the made-up future date, for the tests below.
      await t.prisma.erpSyncState.update({ where: { storeId_resource: { storeId: storeA, resource: 'events.returns' } }, data: { updatedSince: clock, cursor: null } });
    }
    await applyErpEvents(deps());
  });

  it('PR 608: the pull and the apply are scheduled only for stores that speak v6, and run as inventory jobs', async () => {
    const plan = await inventorySchedule(deps());
    const pull = plan.find((e) => e.jobs.some((j) => j.name === 'inventory.erp.pullEvents'));
    expect(pull?.everyMs).toBe((registry['erp.events.pullMinutes'].default as number) * 60_000);
    expect(pull?.jobs).toEqual([{ name: 'inventory.erp.pullEvents', storeId: storeA }]);
    expect(plan.some((e) => e.jobs.some((j) => j.name === 'inventory.erp.applyEvents'))).toBe(true);
    expect(await runInventoryJob(deps(), { name: 'inventory.erp.pullEvents', storeId: storeA })).toMatchObject({ status: 'ok' });
    expect(await runInventoryJob(deps(), { name: 'inventory.erp.applyEvents' })).toMatchObject({ failed: 0 });
    overrides.set(`erp.model@${storeA}`, 'v5');
    const v5plan = await inventorySchedule(deps());
    expect(v5plan.flatMap((e) => e.jobs).filter((j) => j.name === 'inventory.erp.pullEvents' || j.name === 'inventory.erp.applyEvents')).toEqual([]);
    expect(await pullErpEvents(deps(), { storeId: storeA })).toMatchObject({ status: 'skipped', reason: 'ERP_MODEL_V5' });
    v6();
  });

  // ---- CN-029 §16 (PR 607, 608) · one ERP link per store -----------------------------------------------------------

  const bothV6 = () => {
    v6();
    overrides.set(`erp.model@${storeB}`, 'v6');
  };
  const signedFor = (hook: string, ev: Record<string, unknown>) => {
    const w = signedErpWebhook(hook, ev as never, clock);
    return { body: w.body, headers: { ...w.headers, 'x-extas-delivery': String(ev.eventId) } };
  };

  it("CN-029 §16: a call made with store A's key reads and writes only store A's ERP company, and B's only B's", async () => {
    bothV6();
    const [a, b] = [await resolveErp(deps(), storeA), await resolveErp(deps(), storeB)];
    if (a.state !== 'connected' || b.state !== 'connected') throw new Error(`expected both connected, got ${a.state} / ${b.state}`);
    expect([a.integrationId, b.integrationId]).toEqual([integrationId, integrationB]);
    // A writes an order: it is in company A only.
    world.calls.length = 0;
    await a.api.push({ type: 'order.create', body: { channel: 'WEBSITE', status: 'CONFIRMED', externalOrderId: 'XS-A-1', customerName: 'Sample customer', customerPhone: '01700000000', shippingAddress: 'Sample address', paymentMethod: 'COD', note: null, items: [line('XS-A-1-1', 'POLO-NAVY-M', 850)], deliveryCharge: 0, advancePaid: 0 } }, { idempotencyKey: 'sample-cross-1' });
    expect([...world.v6('SAMPLE-CO-1').orders.keys()]).toContain('XS-A-1');
    expect([...world.v6('SAMPLE-CO-2').orders.keys()]).not.toContain('XS-A-1');
    expect(new Set(world.calls.map((c) => c.companyId))).toEqual(new Set(['SAMPLE-CO-1']));
    // B's account is on hold; A reading its own account never sees B's.
    world.v6('SAMPLE-CO-2').hold('PRACTICE');
    expect((await a.api.v6!.account()).hold.onHold).toBe(false);
    expect((await b.api.v6!.account()).hold.onHold).toBe(true);
    world.v6('SAMPLE-CO-2').release();
    world.v6('SAMPLE-CO-2').takeEvents();
    world.v6('SAMPLE-CO-1').takeEvents();
  });

  it("CN-029 §16: a webhook signed with store A's secret is kept for store A only, even when it names a store B order", async () => {
    bothV6();
    const ev = { eventId: 'evt_sample_cross_1', type: 'return.piece.decided', occurredAt: clock.toISOString(), date: '2026-10-27', data: { externalOrderId: 'WEB-B-9', lineId: 'WEB-B-9-1', decision: 'DECLINED', reason: 'PIECE_MISSING' } };
    const before = await t.prisma.erpEvent.count({ where: { storeId: storeB } });
    expect((await deliver(signedFor(secret, ev))).status).toBe(202);
    const rows = await t.prisma.erpEvent.findMany({ where: { eventId: ev.eventId } });
    expect(rows.map((r) => [r.storeId, r.integrationId])).toEqual([[storeA, integrationId]]);
    await applyErpEvents(deps());
    expect(await t.prisma.erpClaim.count({ where: { storeId: storeB } })).toBe(0);
    expect(await t.prisma.erpEvent.count({ where: { storeId: storeB } })).toBe(before);
    // The same event id from store B's own ERP company is B's own event, on B's own link: two ledgers, never one.
    expect((await deliver(signedFor(secretB, ev))).status).toBe(202);
    const both = await t.prisma.erpEvent.findMany({ where: { eventId: ev.eventId }, orderBy: { storeId: 'asc' }, include: { link: true } });
    expect(both.map((r) => [r.storeId, r.integrationId, r.link.storeId])).toEqual([[storeA, integrationId, storeA], [storeB, integrationB, storeB]].sort((x, y) => (x[0] as number) - (y[0] as number)));
    expect(both[0]!.linkId).not.toBe(both[1]!.linkId);
  });

  it("CN-029 §16: store A's pull never brings in store B's events", async () => {
    bothV6();
    // A returned order in company B, decided there.
    const erpB = createErpHttpClient({ baseUrl: BASE, apiKey: erpKeyB, provider: 'extasErp', fetch: world.fetch as typeof fetch }) as ErpApi;
    const pushB = (doc: ErpDocument) => erpB.push(doc, { idempotencyKey: `sample-b-${++keyN}` });
    await pushB({ type: 'order.create', body: { channel: 'WEBSITE', status: 'CONFIRMED', externalOrderId: 'WEB-B-2', customerName: 'Sample customer', customerPhone: '01700000000', shippingAddress: 'Sample address', paymentMethod: 'COD', note: null, items: [line('WEB-B-2-1', 'POLO-NAVY-M', 850)], deliveryCharge: 0, advancePaid: 0 } });
    await pushB({ type: 'shipment.create', body: { externalOrderId: 'WEB-B-2', courier: 'PATHAO', consignmentId: 'C-WEB-B-2', charge: '60.00', pickedUpAt: '2026-10-23T12:00:00+06:00' } });
    await pushB({ type: 'order.delivery', externalOrderId: 'WEB-B-2', body: { status: 'RETURNED', courier: 'PATHAO', consignmentId: 'C-WEB-B-2', collected: 0, at: '2026-10-23T15:40:00+06:00' } });
    await pushB({ type: 'returnList.create', body: { returnListId: 'RL-WEB-B-2', courier: 'PATHAO', handedBackAt: '2026-10-24', parcels: [{ consignmentId: 'C-WEB-B-2', externalOrderId: 'WEB-B-2', receivedCount: 1 }] } });
    world.v6('SAMPLE-CO-2').decidePiece('WEB-B-2', 'WEB-B-2-1', 'APPROVED');
    expect(await pullErpEvents(deps(), { storeId: storeA })).toMatchObject({ status: 'ok' });
    expect(await t.prisma.erpEvent.count({ where: { externalOrderId: 'WEB-B-2' } })).toBe(0);
    expect(await pullErpEvents(deps(), { storeId: storeB })).toMatchObject({ status: 'ok' });
    const rows = await t.prisma.erpEvent.findMany({ where: { externalOrderId: 'WEB-B-2' } });
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.storeId))).toEqual(new Set([storeB]));
    world.v6('SAMPLE-CO-2').takeEvents();
  });

  it('CN-029 §16: two stores with the same webhook secret cannot be told apart, so a v6 event is refused', async () => {
    bothV6();
    vaultValues.set(vaultKey('extasErp.webhookSecret', storeB), secret);
    try {
      const ev = { eventId: 'evt_sample_shared_secret', type: 'account.released', occurredAt: clock.toISOString(), date: '2026-10-27', data: {} };
      expect(await deliver(signedFor(secret, ev))).toEqual({ status: 401, code: 'SHARED_SECRET' });
      expect(await t.prisma.erpEvent.count({ where: { eventId: ev.eventId } })).toBe(0);
    } finally {
      vaultValues.set(vaultKey('extasErp.webhookSecret', storeB), secretB);
    }
  });

  it('CN-029 §16: a store with only a shared ERP connection keeps working in v5 and is refused in v6 (SHARED_LINK)', async () => {
    const storeC = (await t.prisma.store.create({ data: { slug: 'sample-c', name: 'Sample store C', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
    const sharedSecret = randomBytes(24).toString('hex');
    const sharedKey = randomBytes(16).toString('hex');
    vaultValues.set(vaultKey('extasErp.apiKey', null), sharedKey);
    vaultValues.set(vaultKey('extasErp.webhookSecret', null), sharedSecret);
    world.acceptKey(sharedKey, 'SAMPLE-CO-1');
    const shared = await t.prisma.integration.create({ data: { storeId: null, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } });
    try {
      // v5: the installation-wide connection serves the store, as before.
      expect(await resolveErp(deps(), storeC)).toMatchObject({ state: 'connected', integrationId: shared.id });
      // v6: refused, the store needs its own connection; nothing is pulled, and stores A and B are not touched.
      overrides.set(`erp.model@${storeC}`, 'v6');
      expect(await resolveErp(deps(), storeC)).toMatchObject({ state: 'unavailable', code: 'SHARED_LINK' });
      expect(await pullErpEvents(deps(), { storeId: storeC })).toMatchObject({ status: 'failed' });
      expect(await resolveErp(deps(), storeA)).toMatchObject({ state: 'connected', integrationId });
      // A v6 event signed with the shared secret never reaches any v6 ledger.
      const ev = { eventId: 'evt_sample_shared_link', type: 'account.hold', occurredAt: clock.toISOString(), date: '2026-10-27', data: { reason: 'PRACTICE' } };
      expect(await deliver(signedFor(sharedSecret, ev))).toMatchObject({ status: 202, code: 'IGNORED_TYPE' });
      expect(await t.prisma.erpEvent.count({ where: { eventId: ev.eventId } })).toBe(0);
      expect(await t.prisma.erpStoreLink.count({ where: { storeId: storeC } })).toBe(0);
    } finally {
      await t.prisma.integration.update({ where: { id: shared.id }, data: { enabled: false, archivedAt: clock } });
      overrides.delete(`erp.model@${storeC}`);
    }
  });

  it("CN-029 §16: store D typed with store A's key is refused (SHARED_COMPANY): no link, nothing learned, A untouched", async () => {
    const storeD = (await t.prisma.store.create({ data: { slug: 'sample-d', name: 'Sample store D', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
    vaultValues.set(vaultKey('extasErp.apiKey', storeD), erpKey);
    vaultValues.set(vaultKey('extasErp.webhookSecret', storeD), randomBytes(24).toString('hex'));
    const own = await t.prisma.integration.create({ data: { storeId: storeD, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'LIVE', enabled: true, config: { baseUrl: BASE }, secretNames: ['extasErp.apiKey', 'extasErp.webhookSecret'] } });
    overrides.set(`erp.model@${storeD}`, 'v6');
    try {
      // A's open link holds A's company (filled from GET /health by A's pulls).
      expect((await t.prisma.erpStoreLink.findFirstOrThrow({ where: { storeId: storeA, endedAt: null } })).erpCompanyId).toBe('SAMPLE-CO-1');
      const r = await pullErpEvents(deps(), { storeId: storeD });
      expect(r).toMatchObject({ status: 'failed', error: { code: 'SHARED_COMPANY' } });
      expect(await t.prisma.erpStoreLink.count({ where: { storeId: storeD } })).toBe(0);
      expect((await t.prisma.store.findUniqueOrThrow({ where: { id: storeD } })).erpCompanyId).toBeNull();
      // Mapped by hand to A's company, the guard refuses it before any call.
      await t.prisma.store.update({ where: { id: storeD }, data: { erpCompanyId: 'SAMPLE-CO-1' } });
      expect(await resolveErp(deps(), storeD)).toMatchObject({ state: 'unavailable', code: 'SHARED_COMPANY' });
      // In v5 nothing changes for the store (the rule is v6's).
      overrides.set(`erp.model@${storeD}`, 'v5');
      expect(await resolveErp(deps(), storeD)).toMatchObject({ state: 'connected', integrationId: own.id });
      expect(await resolveErp(deps(), storeA)).toMatchObject({ state: 'connected', integrationId });
    } finally {
      await t.prisma.integration.update({ where: { id: own.id }, data: { enabled: false, archivedAt: clock } });
      overrides.delete(`erp.model@${storeD}`);
    }
  });

  it('CN-029 §16: each store has one open ERP link, made on first use, holding no secret', async () => {
    const links = await t.prisma.erpStoreLink.findMany({ where: { storeId: { in: [storeA, storeB] } }, orderBy: { storeId: 'asc' } });
    expect(links.map((l) => [l.storeId, l.epoch, l.integrationId, l.erpCompanyId, l.endedAt])).toEqual([[storeA, 1, integrationId, 'SAMPLE-CO-1', null], [storeB, 1, integrationB, 'SAMPLE-CO-2', null]]);
    // Every event of a store hangs on that store's own link.
    for (const l of links) expect(await t.prisma.erpEvent.count({ where: { linkId: l.id, storeId: { not: l.storeId } } })).toBe(0);
  });

  it('CN-029 §16: no key or secret is ever written to the database, a log line or the practice ERP`s call log', async () => {
    const secrets = [...vaultValues.values()];
    const tables = await Promise.all([
      t.prisma.erpEvent.findMany(),
      t.prisma.erpClaim.findMany(),
      t.prisma.erpStoreLink.findMany(),
      t.prisma.webhookEvent.findMany(),
      t.prisma.erpSyncRun.findMany(),
      t.prisma.erpSyncState.findMany(),
      t.prisma.erpPush.findMany(),
      t.prisma.integration.findMany(),
      t.prisma.integrationTestRun.findMany(),
      t.prisma.auditLog.findMany(),
    ]);
    const big = (_k: string, x: unknown) => (typeof x === 'bigint' ? x.toString() : x);
    const text = JSON.stringify(tables, big) + JSON.stringify(world.calls);
    for (const s of secrets) expect(text.includes(s), 'a secret was written down').toBe(false);
    // A refused key: the error the shop sees and logs never carries the key.
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      world.revokeKey(erpKey);
      bothV6();
      const r = await pullErpEvents(deps(), { storeId: storeA });
      expect(r.status).toBe('failed');
      const logged = JSON.stringify(spies.map((s) => s.mock.calls), big) + JSON.stringify(r) + JSON.stringify(await t.prisma.erpSyncRun.findMany()) + JSON.stringify(await t.prisma.erpSyncState.findMany());
      for (const s of secrets) expect(logged.includes(s), 'a secret was logged').toBe(false);
    } finally {
      world.acceptKey(erpKey, 'SAMPLE-CO-1');
      for (const s of spies) s.mockRestore();
    }
  });
});
