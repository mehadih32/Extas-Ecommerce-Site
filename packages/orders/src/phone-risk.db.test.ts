// S06 · PR 559 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the phone-entry risk check. Off as shipped
// (nobody asked, nothing kept, no look-up counted); on, every connected courier check is asked once in the background
// and its answer kept for `cacheHours`; a fresh answer is not asked again; a slow, failing or nonsense check is let go
// within the time budget (the customer passes); past the look-up limit nobody is asked. The kept answers are read newest
// per courier, never once expired. SIM-F-015 (the required acceptance test): the checkout's own look no longer sees only
// the number — a refuser under a NEW number on the same device is flagged by the owner's pattern, the number alone is not;
// a courier's kept answer flags too. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { riskSettings } from '@extas/settings';
import { checkoutFlag, courierFactsOf, PHONE_RISK_LOOKUP_EVENT, phoneRiskCheck, type CourierFraudSource } from './index';
import { setUpOrders, TEST_FORM, type OrdersFixture } from './testing';

const ON = { enabled: true, budgetMs: 300, cacheHours: 24 };
const DEVICE = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';

describe.skipIf(!HAS_TEST_DB)('PR 559 · the phone-entry risk check (PostgreSQL)', () => {
  let f: OrdersFixture;
  const calls: string[] = [];
  const source = (provider: string, answer: () => Promise<{ delivered: number; cancelled: number }>): CourierFraudSource => ({
    provider,
    check: async (phone) => {
      calls.push(`${provider}:${phone}`);
      return answer();
    },
  });
  const steadfast = source('steadfast', async () => ({ delivered: 1, cancelled: 4 }));
  const pathao = source('pathao', async () => ({ delivered: 6, cancelled: 0 }));
  const run = (phone: string, sources: CourierFraudSource[], ip = '192.0.2.59') => phoneRiskCheck(f.ordersDeps(), { storeId: f.S, ip }, { phone }, sources);

  beforeAll(async () => {
    f = await setUpOrders('phone-risk');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as shipped: nobody is asked, nothing is kept, no look-up is counted', async () => {
    expect(await run('01700000559', [steadfast])).toEqual({ enabled: false, answered: [], fresh: [], passed: [] });
    expect(calls).toEqual([]);
    expect(await f.t.prisma.courierFraudCheck.count()).toBe(0);
    expect(await f.t.prisma.securityEvent.count({ where: { kind: PHONE_RISK_LOOKUP_EVENT } })).toBe(0);
  });

  it('on: every courier check is asked once and kept for cacheHours; a fresh answer is not asked again', async () => {
    f.overrides.set('checkout.phoneRisk', ON);
    const r = await run('01700000559', [steadfast, pathao]);
    expect(r.answered.sort()).toEqual(['pathao', 'steadfast']);
    expect(calls).toEqual(expect.arrayContaining(['steadfast:+8801700000559', 'pathao:+8801700000559']));
    const kept = await f.t.prisma.courierFraudCheck.findMany({ where: { phone: '+8801700000559' }, orderBy: { provider: 'asc' } });
    expect(kept.map((k) => [k.provider, k.deliveredCount, k.cancelledCount, k.ok])).toEqual([
      ['pathao', 6, 0, true],
      ['steadfast', 1, 4, true],
    ]);
    expect(kept[0]!.expiresAt.getTime() - kept[0]!.checkedAt.getTime()).toBe(24 * 3_600_000);
    calls.length = 0;
    expect(await run('+8801700000559', [steadfast, pathao])).toMatchObject({ answered: [], fresh: expect.arrayContaining(['steadfast', 'pathao']) });
    expect(calls).toEqual([]);
  });

  it('a slow, failing or nonsense check is let go within the budget; nothing of it is kept', async () => {
    const slow = source('slow', () => new Promise(() => undefined));
    const broken = source('broken', async () => {
      throw new Error('courier down');
    });
    const silly = source('silly', async () => ({ delivered: -1, cancelled: 2 }));
    const t0 = Date.now();
    const r = await run('01700000560', [slow, broken, silly]);
    expect(Date.now() - t0).toBeLessThan(3_000);
    expect(r.passed.sort()).toEqual(['broken', 'silly', 'slow']);
    expect(await f.t.prisma.courierFraudCheck.count({ where: { phone: '+8801700000560' } })).toBe(0);
  });

  it('past the look-up limit nobody is asked (the form is never stopped)', async () => {
    f.overrides.set('delivery.phoneFirst.rateLimit', 1);
    calls.length = 0;
    await run('01700000561', [steadfast], '192.0.2.61');
    const r = await run('01700000562', [steadfast], '192.0.2.61');
    expect(r).toMatchObject({ answered: [], passed: ['steadfast'] });
    expect(calls).toEqual(['steadfast:+8801700000561']);
    f.overrides.delete('delivery.phoneFirst.rateLimit');
  });

  it('the kept answers: newest per courier, any form of the number, never once expired', async () => {
    const at = f.clock.now;
    await f.t.prisma.courierFraudCheck.create({ data: { storeId: f.S, phone: '+8801700000559', provider: 'steadfast', deliveredCount: 9, cancelledCount: 9, ok: true, checkedAt: new Date(at.getTime() - 3_600_000), expiresAt: new Date(at.getTime() + 3_600_000) } });
    await f.t.prisma.courierFraudCheck.create({ data: { storeId: f.S, phone: '+8801700000559', provider: 'redx', deliveredCount: 0, cancelledCount: 9, ok: true, checkedAt: new Date(at.getTime() - 48 * 3_600_000), expiresAt: new Date(at.getTime() - 3_600_000) } });
    const facts = await courierFactsOf(f.ordersDeps(), f.S, '01700000559', at);
    expect(facts.sort((a, b) => a.provider.localeCompare(b.provider))).toEqual([
      { provider: 'pathao', delivered: 6, cancelled: 0 },
      { provider: 'steadfast', delivered: 1, cancelled: 4 },
    ]);
  });

  describe('SIM-F-015: the checkout look sees more than the number', () => {
    let layerId: string;
    beforeAll(async () => {
      const layer = await f.t.prisma.checkoutParameterLayer.create({
        data: { storeId: f.S, name: 'Pattern layer', position: 1, enabled: true, conditions: { minScore: null, bands: [], signals: ['pattern'] }, requirement: 'DELIVERY_CHARGE' },
      });
      layerId = layer.id;
      f.overrides.set('checkout.advance', { enabled: true, maxLayers: 5 });
      // five parcels refused at the door under one number, from one device
      for (let i = 0; i < 5; i++) {
        const o = await f.place(`refused-${i}`, { phone: '01800000559', lines: [{ variantId: f.v.skyM }] });
        await f.t.prisma.order.update({ where: { id: o.orderId }, data: { status: 'RETURNED', deviceId: DEVICE } });
      }
    });
    const look = (phone: string, more: { deviceId?: string | null } = {}) =>
      checkoutFlag(f.ordersDeps(), { storeId: f.S, phone, areaId: null, resolved: true, placeSure: true, totalMinor: 150_000, pieces: 1, name: TEST_FORM.name, addressText: null, ...more });

    it('the pattern off (as shipped): nobody is flagged by it', async () => {
      expect(riskSettings['risk.signals'].default.pattern.enabled).toBe(false);
      expect(await look('+8801800000559')).toBeNull();
    });

    it('on: the refuser under a NEW number on the same device is flagged; the new number alone is not', async () => {
      f.overrides.set('risk.signals', { ...riskSettings['risk.signals'].default, pattern: { ...riskSettings['risk.signals'].default.pattern, enabled: true } });
      expect(await look('+8801800000559')).toMatchObject({ layerId, requirement: 'DELIVERY_CHARGE' });
      expect(await look('+8801900000559')).toBeNull();
      expect(await look('+8801900000559', { deviceId: DEVICE })).toMatchObject({ layerId });
    });

    it("a courier's kept answer flags a number the shop has never seen; a slow check that kept nothing passes", async () => {
      expect(await look('+8801700000559')).toMatchObject({ layerId });
      expect(await look('+8801700000560')).toBeNull();
    });
  });
});
