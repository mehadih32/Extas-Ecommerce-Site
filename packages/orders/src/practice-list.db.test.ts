// S28 · PR 706 (CN-049) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the order list and its tab counts
// show practice orders only while practice mode is on, with the row marked; off (as shipped), they are left out.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { listOrders } from './list';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('the order list and practice mode (PR 706)', () => {
  let f: OrdersFixture;
  let base = 0;
  const order = (number: string, isPractice: boolean) =>
    f.t.prisma.order.create({
      data: {
        storeId: f.S,
        number,
        status: 'PLACED',
        source: 'WEBSITE',
        currency: 'BDT',
        subtotalMinor: 1000,
        totalMinor: 1000,
        idempotencyKey: `k-${number}`,
        isPractice,
      },
    });

  beforeAll(async () => {
    f = await setUpOrders('practice-list');
    await order('EX-LIST-1', false);
    await order('P-LIST-1', true);
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped: the practice order is not listed or counted', async () => {
    const r = await listOrders(f.deps(), f.staff, {});
    const mine = r.rows.map((x) => x.number).filter((n) => n.endsWith('-LIST-1'));
    expect(mine).toEqual(['EX-LIST-1']);
    expect(r.rows.some((x) => x.isPractice)).toBe(false);
    base = r.counts.all;
  });

  it('on: it is listed and counted, and its row says it is practice', async () => {
    f.overrides.set('practice.enabled', { on: true });
    const r = await listOrders(f.deps(), f.staff, {});
    expect(
      r.rows
        .filter((x) => x.number.endsWith('-LIST-1'))
        .map((x) => [x.number, !!x.isPractice])
        .sort(),
    ).toEqual([
      ['EX-LIST-1', false],
      ['P-LIST-1', true],
    ]);
    expect(r.counts.all).toBe(base + 1);
  });
});
