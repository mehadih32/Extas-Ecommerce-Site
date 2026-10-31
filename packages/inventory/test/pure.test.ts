// S09 pure logic (no database): backoff, the ERP-absent behaviour table, sellable stock and the inventory settings'
// own refusals. The database half is inventory.db.test.ts.
import { describe, expect, it } from 'vitest';
import { ErpError, type ErpApi } from '@extas/adapters';
import { defaultLocationsSchema, inventorySettings, sellableKindsSchema } from '@extas/settings';
import {
  allocate,
  assertNoJournal,
  backoffDelay,
  behaviourOf,
  canonical,
  compareStock,
  damagedUnits,
  decimalToMinor,
  ERP_DEPENDENT_PATHS,
  ErpCallFailed,
  errorCode,
  errorText,
  healthLevel,
  InventoryError,
  isLockConflict,
  lowStockDecision,
  minorToDecimal,
  poolsOf,
  pushBackoffMs,
  pushKey,
  salesOrderDocument,
  sellableUnits,
  sharedSellable,
  orderPushInput,
  type ErpLink,
  type ErpSetup,
  type PoolRow,
} from '../src';

const setup = { storeId: 1, mode: 'EXTAS_ERP', integrationId: null, erpCompanyId: null, erpWarehouseId: null } as unknown as ErpSetup;
const api = {} as ErpApi;
const links = {
  none: { state: 'none', setup },
  unavailable: { state: 'unavailable', setup, code: 'ADAPTER_MISSING', reason: 'x' },
  mock: { state: 'mock', setup, api, provider: 'extasErp', adapterMode: 'MOCK', integrationId: null, stockEnabled: false },
  mockStock: { state: 'mock', setup, api, provider: 'extasErp', adapterMode: 'MOCK', integrationId: null, stockEnabled: true },
  connected: { state: 'connected', setup, api, provider: 'extasErp', adapterMode: 'LIVE', integrationId: 'i', stockEnabled: true },
} satisfies Record<string, ErpLink>;

describe('PR 194 · backoff', () => {
  const p = { baseMs: 100, maxMs: 1000, jitter: false };
  it('doubles from the base and stops at the cap', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, p))).toEqual([100, 200, 400, 800, 1000, 1000]);
  });
  it('jitter picks a point in the upper half of the pause', () => {
    const j = { ...p, jitter: true };
    expect(backoffDelay(3, j, () => 0)).toBe(200);
    expect(backoffDelay(3, j, () => 0.5)).toBe(300);
    expect(backoffDelay(3, j, () => 0.999)).toBeLessThanOrEqual(400);
  });
  it('Retry-After is a floor, but never past the cap', () => {
    expect(backoffDelay(1, p, Math.random, 700)).toBe(700);
    expect(backoffDelay(1, p, Math.random, 50)).toBe(100);
    expect(backoffDelay(1, p, Math.random, 60_000)).toBe(1000);
  });
});

describe('PR 499 · what every ERP-dependent path does in each state', () => {
  it('no ERP never fails a path: it skips, uses the shop copy or refuses only the admin check', () => {
    for (const path of Object.keys(ERP_DEPENDENT_PATHS) as (keyof typeof ERP_DEPENDENT_PATHS)[]) {
      expect(['skip', 'mirror', 'refuse']).toContain(behaviourOf(path, links.none));
      expect(behaviourOf(path, links.none)).not.toBe('fail');
    }
  });
  it('the practice ERP never feeds real stock unless switched on, and holds documents', () => {
    expect(behaviourOf('stock.pull', links.mock)).toBe('skip');
    expect(behaviourOf('stock.liveCheck', links.mock)).toBe('mirror');
    expect(behaviourOf('stock.pull', links.mockStock)).toBe('run');
    expect(behaviourOf('stock.liveCheck', links.mockStock)).toBe('run');
    expect(behaviourOf('documents.push', links.mockStock)).toBe('hold');
    expect(behaviourOf('company.verify', links.mockStock)).toBe('practice');
  });
  it('an unusable ERP fails the pull visibly, keeps the checkout on the copy and holds documents', () => {
    expect([behaviourOf('stock.pull', links.unavailable), behaviourOf('stock.liveCheck', links.unavailable), behaviourOf('documents.push', links.unavailable)]).toEqual(['fail', 'mirror', 'hold']);
  });
  it('a real connection runs everything', () => {
    for (const path of Object.keys(ERP_DEPENDENT_PATHS) as (keyof typeof ERP_DEPENDENT_PATHS)[]) expect(['run', 'send']).toContain(behaviourOf(path, links.connected));
  });
});

describe('PR 195/201 · sellable stock', () => {
  const lv = (kind: 'WAREHOUSE' | 'SHOWROOM' | 'IN_TRANSIT' | 'DAMAGED', available: number, cartReserved = 0, onHand = available, archived = false) => ({
    available,
    cartReserved,
    onHand,
    location: { kind, archivedAt: archived ? new Date() : null, warehouse: { archivedAt: null } },
  });
  it('counts only live sellable kinds, takes the shop holds off and never goes below zero per location', () => {
    const levels = [lv('WAREHOUSE', 5, 1), lv('WAREHOUSE', 1, 3), lv('SHOWROOM', 4), lv('DAMAGED', 9), lv('WAREHOUSE', 7, 0, 7, true)];
    expect(sellableUnits(levels, new Set(['WAREHOUSE']))).toBe(4);
    expect(sellableUnits(levels, new Set(['WAREHOUSE', 'SHOWROOM']))).toBe(8);
    expect(damagedUnits(levels)).toBe(9);
  });
});

describe('S09 settings', () => {
  it('the damaged bin can never be made sellable; default locations need distinct codes', () => {
    expect(sellableKindsSchema.safeParse(['WAREHOUSE', 'DAMAGED']).success).toBe(false);
    expect(sellableKindsSchema.safeParse(['WAREHOUSE', 'WAREHOUSE']).success).toBe(false);
    expect(sellableKindsSchema.safeParse(['WAREHOUSE', 'SHOWROOM']).success).toBe(true);
    expect(defaultLocationsSchema.safeParse([{ code: 'main', kind: 'WAREHOUSE', name: 'a' }, { code: 'main', kind: 'DAMAGED', name: 'b' }]).success).toBe(false);
    expect(defaultLocationsSchema.safeParse([{ code: 'Main Stock', kind: 'WAREHOUSE', name: 'a' }]).success).toBe(false);
  });
  it('every S09 key is at registry version 10, (PR 197–207) 11 or (PR 196 webhooks) 22, and its default passes its own schema', () => {
    for (const [key, s] of Object.entries(inventorySettings)) {
      // review R2 (M1): the unpaid order's hold limit came later (registry version 121)
      expect(key === 'inventory.reservation.unpaidHoldHours' ? [121] : [10, 11, 22], key).toContain(s.version);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
    }
    expect(inventorySettings['inventory.reservation.holdMinutes'].version).toBe(11);
    // review R2 (M1): its default is the order hold's default; 0 keeps the pieces while the order is open
    expect(inventorySettings['inventory.reservation.unpaidHoldHours'].default).toBe(inventorySettings['inventory.reservation.convertedHoldHours'].default);
    expect(inventorySettings['inventory.reservation.unpaidHoldHours'].schema.safeParse(0).success).toBe(true);
    expect(Object.entries(inventorySettings).filter(([, s]) => s.version === 22).map(([k]) => k).sort()).toEqual(['erp.webhook.batchSize', 'erp.webhook.dedupeHours', 'erp.webhook.enabled', 'erp.webhook.maxBodyKb']);
  });
});

describe('PR 194 · the error surface', () => {
  it('one line with the ERP code, the status and the tries; never a stack', () => {
    const e = new ErpCallFailed(new ErpError('SERVER', 'busy', { status: 503 }), 4);
    expect(errorText(e)).toBe('SERVER 503: busy (4 tries)');
    expect(errorCode(e)).toBe('SERVER');
    expect(errorText(new ErpError('TIMEOUT', 'slow'))).toBe('TIMEOUT: slow');
    expect(errorCode(new InventoryError('COMPANY_MISMATCH', 'x'))).toBe('COMPANY_MISMATCH');
    expect(errorText(new Error('boom\n  at x'))).toBe('INTERNAL: boom');
  });
});

const row = (over: Partial<PoolRow>): PoolRow => ({
  id: 'r',
  variantId: 'v',
  locationId: 'L1',
  available: 0,
  cartReserved: 0,
  erpUpdatedAt: null,
  sku: 'S',
  storeId: 1,
  kind: 'WAREHOUSE',
  live: true,
  ...over,
});

describe('PR 197/198 · the shared pool', () => {
  it('one SKU in one location is one pool over every store; the freshest row gives the number', () => {
    const t1 = new Date('2026-10-20T06:00:00Z');
    const t2 = new Date('2026-10-20T06:05:00Z');
    const pools = poolsOf([
      row({ id: 'a', storeId: 1, available: 5, erpUpdatedAt: t1 }),
      row({ id: 'b', storeId: 2, available: 3, erpUpdatedAt: t2 }),
      row({ id: 'c', storeId: 3, available: 9, erpUpdatedAt: null }),
      row({ id: 'd', storeId: 1, locationId: 'L2', available: 2, erpUpdatedAt: t1 }),
    ]);
    expect(pools.size).toBe(2);
    const [p1, p2] = [...pools.values()];
    expect([p1!.available, p1!.rows.length, p2!.available]).toEqual([3, 3, 2]);
  });
  it('a tie on time takes the smaller number (never sell what may be gone)', () => {
    const t = new Date('2026-10-20T06:00:00Z');
    expect([...poolsOf([row({ id: 'a', available: 4, erpUpdatedAt: t }), row({ id: 'b', storeId: 2, available: 1, erpUpdatedAt: t })]).values()][0]!.available).toBe(1);
  });
  it('allocation takes the most free location first and is all or nothing', () => {
    expect(allocate([{ locationId: 'B', free: 1 }, { locationId: 'A', free: 3 }], 2)).toEqual({ allocations: [{ locationId: 'A', quantity: 2 }], free: 4 });
    expect(allocate([{ locationId: 'B', free: 2 }, { locationId: 'A', free: 2 }], 3)).toEqual({ allocations: [{ locationId: 'A', quantity: 2 }, { locationId: 'B', quantity: 1 }], free: 4 });
    expect(allocate([{ locationId: 'A', free: 1 }, { locationId: 'B', free: 0 }], 2)).toEqual({ allocations: null, free: 1 });
    expect(allocate([], 1)).toEqual({ allocations: null, free: 0 });
  });
  it('deadlocks and write conflicts are tried again; other errors are not', () => {
    expect(isLockConflict({ code: 'P2034' })).toBe(true);
    expect(isLockConflict(new Error('ERROR: deadlock detected (40P01)'))).toBe(true);
    expect(isLockConflict(new Error('could not serialize access due to concurrent update'))).toBe(true);
    expect(isLockConflict(new Error('unique constraint'))).toBe(false);
  });
});

describe('PR 202 · low stock on the shared number', () => {
  it('counted once per SKU over pools, holds taken off, damaged and archived places left out', () => {
    const rows = [
      row({ id: 'a', sku: 'X', storeId: 1, available: 3, cartReserved: 1 }),
      row({ id: 'b', sku: 'X', storeId: 2, available: 3, cartReserved: 1 }),
      row({ id: 'c', sku: 'X', locationId: 'L2', available: 2 }),
      row({ id: 'd', sku: 'X', locationId: 'BIN', kind: 'DAMAGED', available: 7 }),
      row({ id: 'e', sku: 'X', locationId: 'OLD', available: 7, live: false }),
    ];
    expect(sharedSellable(rows, new Set(['WAREHOUSE'])).get('X')).toBe(4);
  });
  it('at or below the threshold is low', () => {
    expect([lowStockDecision(2, 2), lowStockDecision(3, 2), lowStockDecision(0, 0)]).toEqual([true, false, true]);
  });
});

describe('PR 199/200 · the order document', () => {
  const input = orderPushInput.parse({
    storeId: 1,
    orderId: '0192f0a0-0000-7000-8000-000000000001',
    externalOrderId: 'EX-1001',
    customerName: 'Sample Customer',
    customerPhone: '01700000000',
    shippingAddress: 'Sample road 1',
    items: [{ sku: 'S-1', quantity: 2, unitPriceMinor: 150050, discountMinor: 5 }],
    shippingFeeMinor: 6000,
    codAmountMinor: 306095,
    paymentMethod: 'COD',
  });
  it('amounts go out as decimal text with the currency’s own decimals', () => {
    expect([minorToDecimal(150050, 2), minorToDecimal(5, 2), minorToDecimal(0, 2), minorToDecimal(-120, 2), minorToDecimal(42, 0)]).toEqual(['1500.50', '0.05', '0.00', '-1.20', '42']);
    expect(() => minorToDecimal(1.5, 2)).toThrow(InventoryError);
  });
  it('the SalesOrder is a document (channel WEBSITE, CONFIRMED), never journal lines, and the same input gives the same document', () => {
    const doc = salesOrderDocument(input, 2);
    expect(doc).toMatchObject({ type: 'order.create', body: { channel: 'WEBSITE', status: 'CONFIRMED', externalOrderId: 'EX-1001', shippingFee: '60.00', codAmount: '3060.95', items: [{ sku: 'S-1', quantity: 2, unitPrice: '1500.50', discount: '0.05' }] } });
    expect(canonical(salesOrderDocument(input, 2))).toBe(canonical(doc));
    expect(() => assertNoJournal(doc)).not.toThrow();
    expect(() => assertNoJournal({ ...doc, body: { ...(doc as { body: object }).body, journalLines: [] } } as never)).toThrow(/journal/);
  });
  it('the idempotency key names the order and what is done to it — never a time', () => {
    const id = '0192f0a0-0000-7000-8000-000000000001';
    expect(pushKey('order.create', id)).toBe(`order:${id}:create`);
    expect(pushKey('order.create', id, { revision: 2 })).toBe(`order:${id}:create:r2`);
    expect(pushKey('order.status', id, { status: 'CANCELLED' })).toBe(`order:${id}:status:CANCELLED`);
  });
  it('canonical JSON ignores key order', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: null }] })).toBe(canonical({ a: [{ c: null, d: 2 }], b: 1 }));
  });
  it('the relay waits base × 2^(n−1) seconds, at most the cap', () => {
    expect([1, 2, 3, 4, 10].map((n) => pushBackoffMs(n, 60, 300))).toEqual([60_000, 120_000, 240_000, 300_000, 300_000]);
  });
});

describe('PR 205 · the health verdict', () => {
  const f = { link: 'connected' as const, lastPullFailed: false, late: false, dead: 0, failed: 0 };
  it('most serious first', () => {
    expect(healthLevel({ ...f, link: 'none', dead: 3 })).toBe('off');
    expect(healthLevel({ ...f, link: 'unavailable' })).toBe('down');
    expect(healthLevel({ ...f, dead: 1, lastPullFailed: true })).toBe('down');
    expect(healthLevel({ ...f, lastPullFailed: true, late: true })).toBe('failing');
    expect(healthLevel({ ...f, failed: 1 })).toBe('failing');
    expect(healthLevel({ ...f, link: 'mock', late: true })).toBe('practice');
    expect(healthLevel({ ...f, late: true })).toBe('late');
    expect(healthLevel(f)).toBe('ok');
  });
});

describe('PR 207 · the reconciliation', () => {
  const t = new Date('2026-10-20T06:00:00Z');
  const locations = new Map([['WH-1', { locationId: 'L1' }]]);
  const erp = (sku: string, onHand: number, reserved = 0, warehouseId = 'WH-1') => ({ sku, warehouseId, onHand, reserved, available: onHand - reserved, updatedAt: t });
  const shop = (sku: string, onHand: number, reserved = 0, locationId = 'L1') => ({ sku, locationId, onHand, reserved, available: onHand - reserved, erpUpdatedAt: t });
  it('names each kind of difference; unknown SKUs and unlinked warehouses are counted, not differences', () => {
    const r = compareStock(
      [erp('A', 5), erp('B', 3), erp('C', 4, 1), erp('D', 2), erp('NEW', 9), erp('A', 1, 0, 'WH-9'), erp('Z', 0)],
      [shop('A', 5), shop('B', 2), shop('C', 4, 0), shop('E', 6), shop('F', 0)],
      locations,
      new Set(['A', 'B', 'C', 'D', 'E', 'F', 'Z']),
      true,
    );
    expect(r.mismatches.map((m) => [m.kind, m.sku])).toEqual([
      ['ON_HAND_DIFFERS', 'B'],
      ['RESERVED_DIFFERS', 'C'],
      ['MISSING_IN_SHOP', 'D'],
      ['MISSING_IN_ERP', 'E'],
    ]);
    expect([r.matched, r.unknownSku, r.unmappedWarehouse]).toEqual([2, 1, 1]);
  });
  it('a read cut short never claims the ERP is missing a row', () => {
    expect(compareStock([], [shop('E', 6)], locations, new Set(['E']), false).mismatches).toEqual([]);
  });
});

describe('PR 204, 206, 207 · the new ERP-dependent paths', () => {
  it('re-sync refuses without an ERP and waits on the practice ERP until its stock is on; the check never fails for want of one', () => {
    expect([behaviourOf('stock.resync', links.none), behaviourOf('stock.resync', links.unavailable), behaviourOf('stock.resync', links.mock), behaviourOf('stock.resync', links.mockStock)]).toEqual(['refuse', 'refuse', 'skip', 'run']);
    expect([behaviourOf('stock.reconcile', links.none), behaviourOf('stock.reconcile', links.unavailable), behaviourOf('stock.reconcile', links.mock)]).toEqual(['skip', 'fail', 'skip']);
    expect([behaviourOf('variants.discover', links.none), behaviourOf('variants.discover', links.mock)]).toEqual(['skip', 'practice']);
  });
});

describe('PR 196 · ERP webhooks', () => {
  it('turns an ERP decimal into minor units, rounding half up at the last digit of the currency', () => {
    expect(['1250.50', '1250.5', '1250', '610.125', '610.124', '0.005', '-3.335', ' 7.1 '].map((t) => decimalToMinor(t, 2))).toEqual([125050, 125050, 125000, 61013, 61012, 1, -334, 710]);
    expect([decimalToMinor('12.5', 0), decimalToMinor('12.4', 0), decimalToMinor('1.2345', 3)]).toEqual([13, 12, 1235]);
    expect([decimalToMinor(null, 2), decimalToMinor('', 2), decimalToMinor('1e3', 2), decimalToMinor('1.2.3', 2)]).toEqual([null, null, null, null]);
  });

  it('a webhook is applied only with a real ERP, or on the practice ERP with its stock switched on', () => {
    expect(['none', 'unavailable', 'mock', 'mockStock', 'connected'].map((k) => behaviourOf('webhook.apply', links[k as keyof typeof links]))).toEqual(['skip', 'skip', 'skip', 'run', 'run']);
  });
});
