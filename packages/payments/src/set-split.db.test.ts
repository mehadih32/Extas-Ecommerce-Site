// CN-018 (4) · PR 89 follow-up (SIM-F-051, follow-up 330) on a real PostgreSQL (throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): a partial delivery that splits a set, with the owner's `combos.split` off (pro rata as
// before), a Fixed set (refused: kept or returned whole), and a Flexible set on its own price, with the delivery charge
// its kept part owes under the free-delivery limit. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { recordDoorOutcome } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const ON = { enabled: true, defaultMode: 'FLEXIBLE', priceRule: 'PRO_RATA', chargeUnderFreeLimit: false };

describe.skipIf(!HAS_TEST_DB)('CN-018 (4) · a split set at the door', () => {
  let f: PaymentsFixture;
  let n = 0;
  const key = () => `split-key-${(n += 1).toString().padStart(4, '0')}`;

  /** An order of a two-piece set (own prices 100,000 + 100,000, set price 160,000) and a loose piece of 50,000. */
  async function setOrder(number: string, set: { splitMode?: string | null; splitPriceRule?: string | null } = {}, deliveryChargeMinor = 6_000) {
    const combo = await f.t.prisma.combo.create({ data: { storeId: f.A, slug: `set-${number.toLowerCase()}`, nameEn: `Set ${number}`, type: 'FIXED_SET', pieceCount: 2, setPriceMinor: 160_000, splitMode: set.splitMode ?? null, splitPriceRule: set.splitPriceRule ?? null } });
    const o = await f.order({ number, lines: [80_000, 80_000, 50_000], deliveryChargeMinor });
    const items = await f.t.prisma.orderItem.findMany({ where: { orderId: o.id }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    for (const i of items.slice(0, 2)) await f.t.prisma.orderItem.update({ where: { id: i.id }, data: { comboId: combo.id, comboGroupKey: `g-${number}`, unitPriceMinor: 100_000, discountMinor: 20_000 } });
    return { order: o, set: items.slice(0, 2).map((i) => i.id), loose: items[2]!.id };
  }
  const partial = (orderId: string, kept: string[], deps = f.deps()) => recordDoorOutcome(deps, f.staff, orderId, { outcome: 'PARTIAL', keptItemIds: kept, collectedMinor: 0 }, { idempotencyKey: key() });

  beforeAll(async () => {
    f = await setUpPayments('payments_split');
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped: a split set is priced pro rata, even when the set says Fixed', async () => {
    f.overrides.delete('combos.split');
    const s = await setOrder('S-1001', { splitMode: 'FIXED' });
    // kept: one set piece (80,000 of 210,000 goods) + the delivery charge
    expect(await partial(s.order.id, [s.set[0]!])).toMatchObject({ expectedMinor: 80_000 + 6_000, state: 'PENDING_APPROVAL' });
  });

  it('a Fixed set is kept or returned whole: a split is refused and nothing is written; returning it whole is fine', async () => {
    f.overrides.set('combos.split', { ...ON, defaultMode: 'FIXED' });
    const s = await setOrder('S-1002');
    const before = await f.t.prisma.codCollection.count();
    const e = await recordDoorOutcome(f.deps(), f.staff, s.order.id, { outcome: 'PARTIAL', keptItemIds: [s.set[0]!, s.loose], collectedMinor: 0 }, { idempotencyKey: key() }).catch((x: unknown) => x as { code: string; data: unknown });
    expect(e).toMatchObject({ code: 'SET_FIXED', data: { sets: ['Set S-1002'] } });
    expect(await f.t.prisma.codCollection.count()).toBe(before);
    // the whole set comes back, the loose piece stays
    expect(await partial(s.order.id, [s.loose])).toMatchObject({ expectedMinor: 50_000 + 6_000 });
  });

  it('the set’s own Flexible wins over the store’s Fixed; on its own price the kept piece loses the set saving', async () => {
    f.overrides.set('combos.split', { ...ON, defaultMode: 'FIXED' });
    const s = await setOrder('S-1003', { splitMode: 'FLEXIBLE', splitPriceRule: 'OWN_PRICE' });
    expect(await partial(s.order.id, [s.set[0]!])).toMatchObject({ expectedMinor: 100_000 + 6_000 });
    f.overrides.set('combos.split', { ...ON, priceRule: 'OWN_PRICE' });
    const t = await setOrder('S-1004', { splitPriceRule: 'PRO_RATA' });
    expect(await partial(t.order.id, [t.set[0]!])).toMatchObject({ expectedMinor: 80_000 + 6_000 });
  });

  it('a free-delivery order whose kept part falls under the limit owes the charge only with the switch on (never above the due)', async () => {
    const hook = { keptChargeMinor: async () => 6_000 };
    f.overrides.set('combos.split', { ...ON, chargeUnderFreeLimit: false });
    const a = await setOrder('S-1005', {}, 0);
    expect(await partial(a.order.id, [a.set[0]!], f.deps({ door: hook }))).toMatchObject({ expectedMinor: 80_000 });
    f.overrides.set('combos.split', { ...ON, chargeUnderFreeLimit: true });
    const b = await setOrder('S-1006', {}, 0);
    expect(await partial(b.order.id, [b.set[0]!], f.deps({ door: hook }))).toMatchObject({ expectedMinor: 86_000 });
    // a split that keeps no set piece apart (the set returned whole) adds nothing
    const c = await setOrder('S-1007', {}, 0);
    expect(await partial(c.order.id, [c.loose], f.deps({ door: hook }))).toMatchObject({ expectedMinor: 50_000 });
    // an order that paid its delivery charge is never asked for it again
    const d = await setOrder('S-1008', {}, 6_000);
    expect(await partial(d.order.id, [d.set[0]!], f.deps({ door: hook }))).toMatchObject({ expectedMinor: 86_000 });
    expect(await code(partial(d.order.id, [d.set[1]!]))).toBe('ALREADY_RECORDED');
  });
});
