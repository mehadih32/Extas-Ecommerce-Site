// S28 · PR 670 — Courier 360 › Money on a real PostgreSQL (throwaway database; skipped without TEST_DATABASE_ADMIN_URL):
// the cash a courier holds, its statements with a month's total, and the statement lines that do not match and are not
// resolved yet (a resolved one leaves the list). Read only, `payments.view`; another store's courier does not exist. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { courierMoney, importSettlement, recordDoorOutcome, resolveLine } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const DAY = 86_400_000;

describe.skipIf(!HAS_TEST_DB)('PR 670 · Courier 360 Money', () => {
  let f: PaymentsFixture;
  beforeAll(async () => {
    f = await setUpPayments('payments_670');
  });
  afterAll(async () => f?.t.drop());

  it('shows the cash held, the statement with its month, and the open lines; a resolved line leaves', async () => {
    const c = await f.courier('Money courier');
    const o1 = await f.order({ number: 'M-1001', lines: [100_000] }); // hardcode-ok: test fixture, a made-up price
    await f.shipment(o1.id, { courierAccountId: c.id, consignmentId: 'MC-1', status: 'DELIVERED', chargeMinor: 6_000, deliveredAt: new Date(Date.now() - 2 * DAY) });
    await recordDoorOutcome(f.deps(), f.staff, o1.id, { outcome: 'DELIVERED', collectedMinor: 100_000 }, { idempotencyKey: 'money-key-0001' });
    const o2 = await f.order({ number: 'M-1002', lines: [100_000] }); // hardcode-ok: test fixture, a made-up price
    await f.shipment(o2.id, { courierAccountId: c.id, consignmentId: 'MC-2', status: 'DELIVERED', chargeMinor: 6_000, deliveredAt: new Date(Date.now() - 3 * DAY) });

    // before any statement: both parcels are cash the courier holds; nothing listed
    const before = await courierMoney(f.deps(), f.viewer, c.id);
    expect(before.position).toMatchObject({ withCourierParcels: 2, withCourierMinor: 200_000 });
    expect(before.statements).toEqual([]);
    expect(before.open).toEqual([]);
    expect(before.openCount).toBe(0);

    const s = await importSettlement(f.deps(), f.staff, {
      courierAccountId: c.id,
      reference: 'STM-670',
      lines: [
        { consignmentId: 'MC-1', codMinor: 100_000, chargeMinor: 6_000, status: 'delivered' },
        { consignmentId: 'MC-404', codMinor: 50_000, chargeMinor: 6_000, status: 'delivered' },
      ],
    });
    const after = await courierMoney(f.deps(), f.viewer, c.id);
    expect(after.statements).toHaveLength(1);
    expect(after.statements[0]).toMatchObject({ reference: 'STM-670', lines: 2, mismatched: 1 });
    expect(after.month.statements).toBe(1);
    expect(after.month.totalCodMinor).toBe(after.statements[0]!.totalCodMinor);
    expect(after.openCount).toBe(1);
    expect(after.open[0]).toMatchObject({ consignmentId: 'MC-404', matchState: 'MISMATCH', reasonCode: 'UNKNOWN_PARCEL' });
    // MC-1 was paid: only MC-2 is still held
    expect(after.position).toMatchObject({ withCourierParcels: 1, withCourierMinor: 100_000 });

    // a month with no statement says so
    expect((await courierMoney(f.deps(), f.viewer, c.id, { month: '2001-01' })).month).toMatchObject({ ym: '2001-01', statements: 0, totalCodMinor: 0 });

    // a person resolves the line: it leaves the list
    await resolveLine(f.deps(), f.staff, s.lines[1]!.id, { note: 'an old parcel, checked with the courier' });
    const done = await courierMoney(f.deps(), f.viewer, c.id);
    expect(done.open).toEqual([]);
    expect(done.openCount).toBe(0);
  });

  it('is refused without payments.view and for a courier of another store', async () => {
    const c = await f.courier('Other courier');
    expect(await code(courierMoney(f.deps(), { ...f.viewer, actor: { staffUserId: '00000000-0000-4000-8000-000000000001' } }, c.id))).toBe('FORBIDDEN');
    expect(await code(courierMoney(f.deps(), { ...f.viewer, storeId: f.B }, c.id))).toBe('FORBIDDEN');
    expect(await code(courierMoney(f.deps(), f.viewer, '00000000-0000-4000-8000-000000000000'))).toBe('NOT_FOUND');
    expect(await code(courierMoney(f.deps(), f.viewer, 'not-an-id'))).toBe('NOT_FOUND');
  });
});
