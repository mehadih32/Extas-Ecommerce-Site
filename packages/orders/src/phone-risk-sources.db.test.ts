// S06 · PR 567 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the multi-courier fraud data through the
// adapters (@extas/adapters fraud-check, on their practice sources with made-up sample answers — never a real courier).
// SIM-F-015, the required acceptance test: two sources answer for one number — Steadfast's own check 10 delivered and 1
// cancelled, an aggregator 2 delivered and 8 cancelled — each answer is kept on its own, and the owner's pattern draws the
// maximum (the aggregator's 80 % failed share flags; a sum, 9 of 21, would not). One source alone with a good record never
// flags; a refuser under a new number on the same device is flagged with the courier answers in place. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMockFraudCheck, type FraudCheckApi } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { riskSettings } from '@extas/settings';
import { checkoutFlag, courierFactsOf, phoneRiskCheck, type CourierFraudSource } from './index';
import { setUpOrders, TEST_FORM, type OrdersFixture } from './testing';

const ON = { enabled: true, budgetMs: 500, cacheHours: 24 };
const DEVICE = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const BOTH = '01700000567'; // hardcode-ok: a made-up test number both sources know
const GOOD = '01700000568'; // hardcode-ok: a made-up test number only Steadfast knows, with a good record

/** One adapter's check as the phone-entry check asks it (as apps/web lib/shop/courier-fraud.ts wires it). */
const sourceOf = (api: FraudCheckApi): CourierFraudSource => ({ provider: api.source, check: (phone, signal) => api.check(phone, signal) });

describe.skipIf(!HAS_TEST_DB)('PR 567 · several courier fraud checks through the adapters (PostgreSQL)', () => {
  let f: OrdersFixture;
  let layerId: string;
  const steadfast = sourceOf(createMockFraudCheck('steadfast', { [BOTH]: { delivered: 10, cancelled: 1 }, [GOOD]: { delivered: 10, cancelled: 1 } }));
  const aggregator = sourceOf(createMockFraudCheck('aggregator', { [BOTH]: { delivered: 2, cancelled: 8 } }));
  const run = (phone: string, sources: CourierFraudSource[]) => phoneRiskCheck(f.ordersDeps(), { storeId: f.S, ip: '192.0.2.67' }, { phone }, sources);
  const look = (phone: string, more: { deviceId?: string | null } = {}) =>
    checkoutFlag(f.ordersDeps(), { storeId: f.S, phone, areaId: null, resolved: true, placeSure: true, totalMinor: 150_000, pieces: 1, name: TEST_FORM.name, addressText: null, ...more });

  beforeAll(async () => {
    f = await setUpOrders('phone-risk-sources');
    const layer = await f.t.prisma.checkoutParameterLayer.create({
      data: { storeId: f.S, name: 'Pattern layer', position: 1, enabled: true, conditions: { minScore: null, bands: [], signals: ['pattern'] }, requirement: 'DELIVERY_CHARGE' },
    });
    layerId = layer.id;
    f.overrides.set('checkout.advance', { enabled: true, maxLayers: 5 });
    f.overrides.set('checkout.phoneRisk', ON);
    f.overrides.set('risk.signals', { ...riskSettings['risk.signals'].default, pattern: { ...riskSettings['risk.signals'].default.pattern, enabled: true } });
    // five parcels refused at the door under one number, from one device
    for (let i = 0; i < 5; i++) {
      const o = await f.place(`refused-567-${i}`, { phone: '01800000567', lines: [{ variantId: f.v.skyM }] });
      await f.t.prisma.order.update({ where: { id: o.orderId }, data: { status: 'RETURNED', deviceId: DEVICE } });
    }
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('both sources are asked and each answer is kept on its own', async () => {
    const r = await run(BOTH, [steadfast, aggregator]);
    expect(r.answered.sort()).toEqual(['aggregator', 'steadfast']);
    const facts = await courierFactsOf(f.ordersDeps(), f.S, BOTH, f.clock.now);
    expect(facts.sort((a, b) => a.provider.localeCompare(b.provider))).toEqual([
      { provider: 'aggregator', delivered: 2, cancelled: 8 },
      { provider: 'steadfast', delivered: 10, cancelled: 1 },
    ]);
  });

  it('SIM-F-015: the maximum counts — the source with the highest failed share flags the number', async () => {
    // a sum (12 delivered, 9 cancelled: 43 %) would stay under the 80 % default; the aggregator's own 80 % does not
    expect(riskSettings['risk.signals'].default.pattern.failPct).toBe(80);
    expect(await look(`+88${BOTH}`)).toMatchObject({ layerId, requirement: 'DELIVERY_CHARGE' });
  });

  it('one source with a good record never flags; a source that knows nothing adds nothing', async () => {
    const r = await run(GOOD, [steadfast, aggregator]);
    expect(r.answered.sort()).toEqual(['aggregator', 'steadfast']);
    expect(await look(`+88${GOOD}`)).toBeNull();
  });

  it('the refuser under a new number on the same device is flagged; the new number alone is not', async () => {
    await run('01900000567', [steadfast, aggregator]);
    expect(await look('+8801900000567')).toBeNull();
    expect(await look('+8801900000567', { deviceId: DEVICE })).toMatchObject({ layerId });
  });
});
