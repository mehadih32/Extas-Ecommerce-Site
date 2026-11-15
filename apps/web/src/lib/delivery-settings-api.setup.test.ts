// S28 · PR 803 — Couriers › Setup saves, checked on the server (no database: the courier table and the settings are stubbed):
// a courier that is switched off (or archived, or not this store's) can never be made the default; the backup must be a
// courier that is on and not the default; the per-courier setup may only name this store's couriers; a stale version is refused.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@extas/auth', () => ({ audit: vi.fn(async () => undefined), requirePermission: vi.fn(async () => undefined) }));

import { DeliverySettingsError, saveDeliverySetting } from './delivery-settings-api';

const ON = '3f0c2a52-6a5b-4a5f-9a53-2f4d8f0a1b11';
const OFF = '4a1d3b63-7b6c-4b6a-8b64-3a5e9a1b2c22';
const OTHER = '5b2e4c74-8c7d-4c7b-9c75-4b6f0b2c3d33';
const versionOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/** Courier accounts of this store: ON is on, OFF is switched off; OTHER does not exist. */
function deps(values: Record<string, unknown>) {
  const set = vi.fn(async () => undefined);
  const rows = [
    { id: ON, enabled: true, archivedAt: null },
    { id: OFF, enabled: false, archivedAt: null },
  ];
  const match = (where: { id?: string | { in: string[] }; enabled?: boolean; archivedAt?: null }) =>
    rows.filter((r) => (where.id === undefined ? true : typeof where.id === 'string' ? r.id === where.id : where.id.in.includes(r.id)) && (where.enabled === undefined || r.enabled === where.enabled) && r.archivedAt === null);
  return {
    set,
    d: {
      db: { courierAccount: { findFirst: async ({ where }: { where: never }) => match(where)[0] ?? null, findMany: async ({ where }: { where: never }) => match(where) } },
      resolver: { value: async (k: string) => values[k] ?? {}, set },
    } as never,
  };
}
const who = { actor: { staffUserId: 's1' }, ctx: {} } as never;
const refused = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof DeliverySettingsError ? e : null;
  }
  return null;
};

describe('Make default (delivery.couriers)', () => {
  const before = { defaultCourierId: '' };
  const put = (id: string) => ({ key: 'delivery.couriers', version: versionOf(before), value: { defaultCourierId: id } });
  it('refuses a courier that is switched off, and one that is not this store\'s', async () => {
    const { d, set } = deps({ 'delivery.couriers': before });
    const off = await refused(saveDeliverySetting(d, who, put(OFF)));
    expect(off?.code).toBe('INVALID_INPUT');
    expect(off?.details).toEqual(['defaultCourierId']);
    expect((await refused(saveDeliverySetting(d, who, put(OTHER))))?.code).toBe('INVALID_INPUT');
    expect(set).not.toHaveBeenCalled();
  });
  it('accepts a courier that is on', async () => {
    const { d, set } = deps({ 'delivery.couriers': before });
    await refused(saveDeliverySetting(d, who, put(ON)));
    expect(set).toHaveBeenCalledTimes(1);
  });
});

describe('Alerts and backup courier (fulfilment.courierWatch)', () => {
  const before = { stuckAlert: false, stuckHours: 48, backupCourierId: '' };
  const put = (v: object) => ({ key: 'fulfilment.courierWatch', version: versionOf(before), value: { ...before, ...v } });
  it('takes the stuck hours; the backup must be on and not the default', async () => {
    const a = deps({ 'fulfilment.courierWatch': before, 'delivery.couriers': { defaultCourierId: ON } });
    await saveDeliverySetting(a.d, who, put({ stuckHours: 24 }));
    expect(a.set).toHaveBeenCalledTimes(1);
    expect((await refused(saveDeliverySetting(a.d, who, put({ backupCourierId: OFF }))))?.details).toEqual(['backupCourierId']);
    expect((await refused(saveDeliverySetting(a.d, who, put({ backupCourierId: ON }))))?.details).toEqual(['backupCourierId']);
  });
});

describe('Courier setup (delivery.courier.setup)', () => {
  const before = { couriers: {} };
  const entry = { pickupPlace: 'Warehouse', pickupTime: '17:00', minPayoutMinor: 500000, payDays: 3 };
  const put = (couriers: object, version = versionOf(before)) => ({ key: 'delivery.courier.setup', version, value: { couriers } });
  it('saves entries for this store\'s couriers, refuses others and a stale version', async () => {
    const { d, set } = deps({ 'delivery.courier.setup': before });
    await saveDeliverySetting(d, who, put({ [ON]: entry }));
    expect(set).toHaveBeenCalledTimes(1);
    expect((await refused(saveDeliverySetting(d, who, put({ [OTHER]: entry }))))?.details).toEqual(['couriers']);
    expect((await refused(saveDeliverySetting(d, who, put({ [ON]: entry }, 'old'))))?.code).toBe('STALE');
  });
});
