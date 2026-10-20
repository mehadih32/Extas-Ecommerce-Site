// S09 pure logic (no database): backoff, the ERP-absent behaviour table, sellable stock and the inventory settings'
// own refusals. The database half is inventory.db.test.ts.
import { describe, expect, it } from 'vitest';
import { ErpError, type ErpApi } from '@extas/adapters';
import { defaultLocationsSchema, inventorySettings, sellableKindsSchema } from '@extas/settings';
import { backoffDelay, behaviourOf, damagedUnits, ERP_DEPENDENT_PATHS, ErpCallFailed, errorCode, errorText, InventoryError, sellableUnits, type ErpLink, type ErpSetup } from '../src';

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
  it('every S09 key is at registry version 10 and its default passes its own schema', () => {
    for (const [key, s] of Object.entries(inventorySettings)) {
      expect([key, s.version]).toEqual([key, 10]);
      expect(s.schema.safeParse(s.default).success).toBe(true);
    }
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
