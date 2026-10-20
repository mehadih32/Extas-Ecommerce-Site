// PR 194, 497, 498 — the ERP adapter against the practice ERP (no network, no database): the contract's endpoints,
// cursor paging and `updatedSince`, the company coming from the key, the error surface (401, 409, 429 with
// Retry-After, 5xx, a dropped connection, a slow answer, a broken body), request signing, and the adapter's three modes.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AdapterError,
  allAdapters,
  createErpHttpClient,
  erpCodeForStatus,
  ErpError,
  extasErp,
  MockErpWorld,
  mockErp,
  retryAfterMs,
  signErpBody,
  toErpError,
  verifyErpSignature,
  type AdapterContext,
  type ErpApi,
  type ExtasErpConfig,
} from '../src';

const BASE = 'https://erp.example.test';
const T0 = new Date('2026-10-20T06:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

function client(world: MockErpWorld, key = world.defaultKey): ErpApi {
  return createErpHttpClient({ baseUrl: BASE, apiKey: key, provider: 'extasErp', fetch: world.fetch });
}

async function errOf(p: Promise<unknown>): Promise<ErpError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErpError) return e;
    throw e;
  }
  throw new Error('expected an ErpError');
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ErpError ? e.code : `other: ${String(e)}`;
  }
}

describe('practice ERP + HTTP client (PR 498)', () => {
  it('health names the company of the key, never one from the request', async () => {
    const w = new MockErpWorld();
    expect(await client(w).health()).toEqual({ companyId: 'SAMPLE-CO-1', companyName: 'Sample company one', integrationName: 'Sample website', warehouseId: 'SAMPLE-WH-1' });
    expect((await client(w, w.keyFor('SAMPLE-CO-2')).health()).companyId).toBe('SAMPLE-CO-2');
    expect(w.calls.at(-1)).toMatchObject({ method: 'GET', path: '/health', companyId: 'SAMPLE-CO-2', status: 200 });
  });

  it('a wrong key is AUTH (not worth retrying) and the key never shows in the error', async () => {
    const w = new MockErpWorld();
    const bad = randomBytes(12).toString('hex');
    const err = await errOf(client(w, bad).health());
    expect(err).toBeInstanceOf(ErpError);
    expect(err.code).toBe('AUTH');
    expect(err.status).toBe(401);
    expect(err.erpCode).toBe('UNAUTHORIZED');
    expect(err.retryable).toBe(false);
    expect(err.message).not.toContain(bad);
  });

  it('stock per SKU per warehouse, paged by cursor in a stable order, filtered by updatedSince and warehouse', async () => {
    const w = new MockErpWorld();
    for (let i = 0; i < 5; i++) w.setStock(`SKU-${i}`, 'SAMPLE-WH-1', { onHand: 10 + i, reserved: 2, updatedAt: at(i) });
    w.setStock('SKU-0', 'SAMPLE-WH-2', { onHand: 1, updatedAt: at(9) });
    const api = client(w);

    const p1 = await api.stock({ limit: 2 });
    expect(p1.items.map((r) => r.sku)).toEqual(['SKU-0', 'SKU-1']);
    expect(p1.items[0]).toEqual({ sku: 'SKU-0', warehouseId: 'SAMPLE-WH-1', onHand: 10, reserved: 2, available: 8, updatedAt: at(0) });
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await api.stock({ limit: 2, cursor: p1.nextCursor });
    const p3 = await api.stock({ limit: 2, cursor: p2.nextCursor });
    expect([...p2.items, ...p3.items].map((r) => `${r.sku}@${r.warehouseId}`)).toEqual(['SKU-2@SAMPLE-WH-1', 'SKU-3@SAMPLE-WH-1', 'SKU-4@SAMPLE-WH-1', 'SKU-0@SAMPLE-WH-2']);
    expect(p3.nextCursor).toBeNull();

    expect((await api.stock({ limit: 50, updatedSince: at(3) })).items.map((r) => r.sku)).toEqual(['SKU-3', 'SKU-4', 'SKU-0']);
    expect((await api.stock({ limit: 50, warehouseId: 'SAMPLE-WH-2' })).items).toHaveLength(1);
    expect(w.calls.find((c) => c.query.warehouseId)?.query).toMatchObject({ warehouseId: 'SAMPLE-WH-2', limit: '50' });
  });

  it('one SKU live, in every warehouse; an unknown SKU is NOT_FOUND', async () => {
    const w = new MockErpWorld();
    w.setStock('POLO-NAVY-M', 'SAMPLE-WH-1', { onHand: 4, reserved: 1, updatedAt: at(0) });
    w.setStock('POLO-NAVY-M', 'SAMPLE-WH-2', { onHand: 2, updatedAt: at(1) });
    const rows = await client(w).stockForSku('POLO-NAVY-M');
    expect(rows.map((r) => [r.warehouseId, r.available])).toEqual([['SAMPLE-WH-1', 3], ['SAMPLE-WH-2', 2]]);
    expect(await codeOf(client(w).stockForSku('NOPE'))).toBe('NOT_FOUND');
  });

  it('variants with style, colour and size; prices stay as the ERP sent them', async () => {
    const w = new MockErpWorld();
    w.setVariant({ sku: 'POLO-NAVY-M', barcode: '2000000000017', styleCode: 'POLO', styleName: 'Sample polo', color: 'Navy', size: 'M', retailPrice: '1250.00', avgCost: '610.5', updatedAt: at(2) });
    const page = await client(w).variants({ limit: 10 });
    expect(page.items[0]).toMatchObject({ sku: 'POLO-NAVY-M', color: 'Navy', size: 'M', retailPrice: '1250.00', avgCost: '610.5', active: true, updatedAt: at(2) });
    expect(page.rejected).toEqual([]);
  });

  it('a row that breaks the contract is rejected on its own; the rest of the page counts', async () => {
    const w = new MockErpWorld();
    w.failNext({ path: '/stock', rawBody: JSON.stringify({ items: [{ sku: 'A', warehouseId: 'W', onHand: 1, reserved: 0, available: 1, updatedAt: T0.toISOString() }, { sku: '', warehouseId: 'W', onHand: 'x' }], nextCursor: null }) });
    const page = await client(w).stock({ limit: 10 });
    expect(page.items.map((r) => r.sku)).toEqual(['A']);
    expect(page.rejected).toHaveLength(1);
    expect(page.rejected[0]!.index).toBe(1);
  });

  it('error surface: each failure has a stable code and says whether another try may help', async () => {
    const w = new MockErpWorld();
    const api = client(w);
    w.failNext({ status: 503 });
    const e503 = await errOf(api.health());
    expect([e503.code, e503.status, e503.retryable]).toEqual(['SERVER', 503, true]);

    w.failNext({ status: 429, retryAfterSeconds: 7 });
    const e429 = await errOf(api.health());
    expect([e429.code, e429.retryAfterMs, e429.retryable]).toEqual(['RATE_LIMITED', 7000, true]);

    w.failNext({ status: 409 });
    expect(await codeOf(api.health())).toBe('CONFLICT');
    w.failNext({ status: 422 });
    expect(await codeOf(api.health())).toBe('INVALID_REQUEST');
    w.failNext({ network: true });
    const net = await errOf(api.health());
    expect([net.code, net.retryable]).toEqual(['NETWORK', true]);
    w.failNext({ rawBody: 'not json' });
    expect(await codeOf(api.health())).toBe('BAD_RESPONSE');
    w.failNext({ rawBody: '{"companyName": ""}' });
    expect(await codeOf(api.health())).toBe('BAD_RESPONSE');
    w.failNext({ delayMs: 500 });
    const slow = await errOf(api.health({ timeoutMs: 20 }));
    expect([slow.code, slow.retryable]).toEqual(['TIMEOUT', true]);
    // After the switched-on failures, the ERP answers again.
    expect(await codeOf(api.health())).toBe('ok');
  });

  it('a failure can be limited to one path and repeated', async () => {
    const w = new MockErpWorld();
    w.failNext({ path: '/stock', status: 500, times: 2 });
    const api = client(w);
    expect(await codeOf(api.health())).toBe('ok');
    expect(await codeOf(api.stock({ limit: 1 }))).toBe('SERVER');
    expect(await codeOf(api.stock({ limit: 1 }))).toBe('SERVER');
    expect(await codeOf(api.stock({ limit: 1 }))).toBe('ok');
  });

  it('status codes, Retry-After and unknown errors map as documented', () => {
    expect([401, 403, 404, 409, 429, 400, 500, 502].map(erpCodeForStatus)).toEqual(['AUTH', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED', 'INVALID_REQUEST', 'SERVER', 'SERVER']);
    expect(retryAfterMs('3')).toBe(3000);
    expect(retryAfterMs(new Date(T0.getTime() + 2000).toUTCString(), T0.getTime())).toBe(2000);
    expect(retryAfterMs('soon')).toBeNull();
    expect(toErpError(new AdapterError('the key "apiKey" is not entered yet')).code).toBe('NOT_CONFIGURED');
    expect(toErpError(new Error('boom')).code).toBe('NETWORK');
  });
});

describe('request signing (PR 194, contract: HMAC of the raw body + timestamp, 5 minutes)', () => {
  const secret = randomBytes(16).toString('hex');
  const body = JSON.stringify({ event: 'stock.changed', sku: 'A', available: 3 });
  const now = T0.getTime();

  it('a signed body verifies; any change, an old timestamp or a wrong secret does not', () => {
    const sig = signErpBody(secret, body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    const ok = { secret, rawBody: body, signature: sig, timestamp: String(Math.floor(now / 1000)), maxAgeSeconds: 300, now };
    expect(verifyErpSignature(ok)).toEqual({ ok: true });
    expect(verifyErpSignature({ ...ok, timestamp: T0.toISOString() })).toEqual({ ok: true });
    expect(verifyErpSignature({ ...ok, rawBody: body.replace('3', '4') })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyErpSignature({ ...ok, secret: secret + 'x' })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyErpSignature({ ...ok, timestamp: String(Math.floor(now / 1000) - 301) })).toEqual({ ok: false, reason: 'stale' });
    expect(verifyErpSignature({ ...ok, signature: null })).toEqual({ ok: false, reason: 'missing' });
    expect(verifyErpSignature({ ...ok, signature: 'md5=abc' })).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('the ERP adapter (PR 497, 498)', () => {
  const ctx = (mode: 'MOCK' | 'LIVE', secrets: Record<string, string> = {}, config: ExtasErpConfig = { baseUrl: BASE }): AdapterContext<ExtasErpConfig> => ({
    mode,
    config,
    storeId: 1,
    secret: async (f) => secrets[f] ?? null,
  });

  it('is registered with the adapters, with mock / sandbox / live, its key and webhook secret', () => {
    expect(allAdapters).toContain(extasErp);
    expect(extasErp.kind).toBe('ERP');
    expect(extasErp.modes).toEqual(['SANDBOX', 'LIVE']);
    expect([...extasErp.secrets]).toEqual(['apiKey', 'webhookSecret']);
    expect(extasErp.configSchema.safeParse({ baseUrl: 'http://erp.example.test' }).success).toBe(false);
    expect(extasErp.configSchema.safeParse({ baseUrl: BASE }).success).toBe(true);
  });

  it('MOCK needs no address or key and talks to the practice ERP; its test passes', async () => {
    mockErp().reset();
    const api = await extasErp.mock(ctx('MOCK'));
    expect(await extasErp.test(api, ctx('MOCK'))).toEqual({ ok: true, message: 'Sample company one · Sample website (SAMPLE-CO-1)' });
  });

  it('LIVE refuses without a key, and uses the saved address and key', async () => {
    await expect(extasErp.create(ctx('LIVE'))).rejects.toThrow(/apiKey/);
    const w = mockErp();
    w.reset();
    const key = randomBytes(16).toString('hex');
    w.acceptKey(key, 'SAMPLE-CO-2');
    const real = globalThis.fetch;
    globalThis.fetch = ((input: string, init: RequestInit) => {
      expect(String(input).startsWith(`${BASE}/api/v1/ecommerce/`)).toBe(true);
      return w.fetch(input, init);
    }) as typeof fetch;
    try {
      const api = await extasErp.create(ctx('LIVE', { apiKey: key, webhookSecret: 'unused-here' }));
      expect((await api.health()).companyId).toBe('SAMPLE-CO-2');
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe('documents to the ERP (PR 199, 200: SalesOrder as a document, Idempotency-Key on every write)', () => {
  const order = (ext: string, qty = 1) => ({
    type: 'order.create' as const,
    body: {
      channel: 'WEBSITE' as const,
      status: 'CONFIRMED' as const,
      externalOrderId: ext,
      customerName: 'Sample Customer',
      customerPhone: '01700000000',
      shippingAddress: 'Sample road 1',
      items: [{ sku: 'DOC-SKU', quantity: qty, unitPrice: '100.00', discount: '0.00' }],
      shippingFee: '0.00',
      codAmount: '100.00',
      paymentMethod: 'COD',
      note: null,
    },
  });

  it('a push without a key is refused before anything is sent', async () => {
    const w = new MockErpWorld();
    expect(await codeOf(client(w).push(order('S-1'), { idempotencyKey: '' }))).toBe('INVALID_REQUEST');
    expect(w.calls).toHaveLength(0);
  });

  it('a SalesOrder reserves its stock in the ERP once; the same key again replays the first answer', async () => {
    const w = new MockErpWorld();
    w.setStock('DOC-SKU', 'SAMPLE-WH-1', { onHand: 3, updatedAt: at(0) });
    const api = client(w);
    expect(await api.push(order('S-1', 2), { idempotencyKey: 'order:1:create' })).toMatchObject({ erpId: 'SAMPLE-SO-1', status: 201, replayed: false });
    expect(await api.push(order('S-1', 2), { idempotencyKey: 'order:1:create' })).toMatchObject({ erpId: 'SAMPLE-SO-1', status: 201, replayed: true });
    expect(w.stockOf('DOC-SKU', 'SAMPLE-WH-1')).toEqual({ onHand: 3, reserved: 2 });
    expect(w.orders()).toHaveLength(1);
    expect(w.calls.at(-1)).toMatchObject({ method: 'POST', path: '/orders', status: 201 });
  });

  it('the same key with another body is refused; a new key for the same order is a duplicate', async () => {
    const w = new MockErpWorld();
    w.setStock('DOC-SKU', 'SAMPLE-WH-1', { onHand: 5, updatedAt: at(0) });
    const api = client(w);
    await api.push(order('S-1', 1), { idempotencyKey: 'k1' });
    const mismatch = await errOf(api.push(order('S-1', 2), { idempotencyKey: 'k1' }));
    expect([mismatch.code, mismatch.status, mismatch.erpCode]).toEqual(['INVALID_REQUEST', 422, 'IDEMPOTENCY_MISMATCH']);
    const dup = await errOf(api.push(order('S-1', 1), { idempotencyKey: 'k2' }));
    expect([dup.code, dup.erpCode, dup.retryable]).toEqual(['CONFLICT', 'DUPLICATE_EXTERNAL_ORDER', false]);
    expect(w.stockOf('DOC-SKU', 'SAMPLE-WH-1')).toEqual({ onHand: 5, reserved: 1 });
  });

  it('short stock is a 409 naming the SKU, and nothing is reserved', async () => {
    const w = new MockErpWorld();
    w.setStock('DOC-SKU', 'SAMPLE-WH-1', { onHand: 1, updatedAt: at(0) });
    const err = await errOf(client(w).push(order('S-9', 2), { idempotencyKey: 'k9' }));
    expect([err.code, err.erpCode]).toEqual(['CONFLICT', 'STOCK_SHORT']);
    expect(w.stockOf('DOC-SKU', 'SAMPLE-WH-1')).toEqual({ onHand: 1, reserved: 0 });
  });

  it('a lost answer (dropped or timed out) is safe to send again with the same key: applied once', async () => {
    const w = new MockErpWorld();
    w.setStock('DOC-SKU', 'SAMPLE-WH-1', { onHand: 4, updatedAt: at(0) });
    const api = client(w);
    w.failNext({ path: '/orders', lose: 'network' });
    expect(await codeOf(api.push(order('S-2'), { idempotencyKey: 'k2' }))).toBe('NETWORK');
    w.failNext({ path: '/orders', lose: 'timeout', delayMs: 200 });
    expect(await codeOf(api.push(order('S-2'), { idempotencyKey: 'k2', timeoutMs: 20 }))).toBe('TIMEOUT');
    expect(await api.push(order('S-2'), { idempotencyKey: 'k2' })).toMatchObject({ erpId: 'SAMPLE-SO-1', replayed: true });
    expect(w.stockOf('DOC-SKU', 'SAMPLE-WH-1')).toEqual({ onHand: 4, reserved: 1 });
  });

  it('status changes: cancelled lets the reservation go, delivered takes the stock out', async () => {
    const w = new MockErpWorld();
    w.setStock('DOC-SKU', 'SAMPLE-WH-1', { onHand: 4, updatedAt: at(0) });
    const api = client(w);
    await api.push(order('S-3', 2), { idempotencyKey: 'c3' });
    await api.push(order('S-4', 1), { idempotencyKey: 'c4' });
    expect(await api.push({ type: 'order.status', externalOrderId: 'S-3', body: { status: 'CANCELLED' } }, { idempotencyKey: 's3' })).toMatchObject({ status: 200, replayed: false });
    await api.push({ type: 'order.status', externalOrderId: 'S-4', body: { status: 'DELIVERED' } }, { idempotencyKey: 's4' });
    expect(w.stockOf('DOC-SKU', 'SAMPLE-WH-1')).toEqual({ onHand: 3, reserved: 0 });
    expect(w.calls.at(-1)).toMatchObject({ method: 'PATCH', path: '/orders/S-4' });
    expect(await codeOf(api.push({ type: 'order.status', externalOrderId: 'NOPE', body: { status: 'PACKED' } }, { idempotencyKey: 's5' }))).toBe('NOT_FOUND');
  });
});
