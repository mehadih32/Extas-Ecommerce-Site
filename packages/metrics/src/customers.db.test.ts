// PR 284, 285 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): a customer's lifetime value is Sales (delivered only) beside Ordered value, over his merged
// profiles and his numbers; a guest gift to his number is not his; an order matched twice counts once; another store's
// orders never count. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@extas/db/client';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { customerFiguresSql, customerKpis } from './customers';

const PHONE_A = '+8801700000284'; // hardcode-ok: made-up test numbers
const PHONE_B = '+8801700000285'; // hardcode-ok: made-up test numbers

describe.skipIf(!HAS_TEST_DB)('customer figures on PostgreSQL (PR 284, 285)', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  let a = '';
  let b = '';

  async function order(o: { status: 'PLACED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'DRAFT'; total: number; customerId?: string | null; phone?: string; gift?: boolean; store?: number; archived?: boolean; placed?: Date }) {
    n += 1;
    const placed = o.placed ?? new Date(Date.UTC(2026, 9, 1 + n));
    await t.prisma.order.create({
      data: {
        storeId: o.store ?? S,
        number: `C284-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status: o.status,
        placedAt: placed,
        deliveredAt: o.status === 'DELIVERED' ? placed : null,
        subtotalMinor: o.total - 1_000,
        discountMinor: 0,
        deliveryChargeMinor: 1_000,
        totalMinor: o.total,
        paymentMethod: 'COD',
        customerId: o.customerId ?? null,
        phone: o.phone ?? null,
        isGift: o.gift ?? false,
        idempotencyKey: `c284-${n}`,
        archivedAt: o.archived ? placed : null,
      },
    });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-customers');
    [S, O] = await seedSampleStores(t.prisma);
    a = (await t.prisma.customer.create({ data: { storeId: S, phone: PHONE_A, name: 'Sample A' } })).id;
    b = (await t.prisma.customer.create({ data: { storeId: S, phone: PHONE_B, name: 'Sample B', mergedIntoId: a } })).id;
    await order({ status: 'DELIVERED', total: 10_000, customerId: a, phone: PHONE_A });
    await order({ status: 'PLACED', total: 4_000, customerId: a, phone: PHONE_A });
    await order({ status: 'DELIVERED', total: 6_000, customerId: b, phone: PHONE_B });
    await order({ status: 'RETURNED', total: 3_000, customerId: b, phone: PHONE_B });
    // a guest order with his number (no account) is his; a guest gift to his number is the receiver's, not his
    await order({ status: 'DELIVERED', total: 2_000, customerId: null, phone: PHONE_A });
    await order({ status: 'DELIVERED', total: 50_000, customerId: null, phone: PHONE_A, gift: true });
    // never counted: a draft, an archived order, another store's order with the same number
    await order({ status: 'DRAFT', total: 99_000, customerId: a, phone: PHONE_A });
    await order({ status: 'DELIVERED', total: 99_000, customerId: a, phone: PHONE_A, archived: true });
    await order({ status: 'DELIVERED', total: 99_000, customerId: null, phone: PHONE_A, store: O });
  });
  afterAll(async () => t?.drop());

  it('the survivor with his merged profile and his numbers: Sales is delivered only, Ordered value every placed order', async () => {
    const k = (await customerKpis(t.prisma, S, [{ key: 'x', customerIds: [a, b], phones: [PHONE_A, PHONE_B] }])).get('x')!;
    expect(k.sales).toEqual({ orders: 3, valueMinor: 18_000, itemsMinor: 15_000, deliveryMinor: 3_000 });
    expect(k.ordered).toEqual({ orders: 5, valueMinor: 25_000, itemsMinor: 20_000, deliveryMinor: 5_000 });
    expect(k.firstOrderAt).toBeInstanceOf(Date);
    expect(k.lastOrderAt!.getTime()).toBeGreaterThan(k.firstOrderAt!.getTime());
  });

  it('one profile alone, and a person with no order gets the empty pair', async () => {
    const m = await customerKpis(t.prisma, S, [
      { key: 'b', customerIds: [b], phones: [PHONE_B] },
      { key: 'none', customerIds: [], phones: ['+8801700000999'] },
    ]);
    expect(m.get('b')!.sales.valueMinor).toBe(6_000);
    expect(m.get('b')!.ordered.orders).toBe(2);
    expect(m.get('none')!.sales.orders).toBe(0);
    expect(m.get('none')!.lastOrderAt).toBeNull();
  });

  it('the list subquery groups by whatever key the people query gives (a merged profile under its survivor)', async () => {
    const people = Prisma.sql`SELECT COALESCE(c."mergedIntoId", c."id")::text AS k, c."id" AS cid, c."phone" AS phone FROM "Customer" c WHERE c."storeId" = ${S}`;
    const rows = await t.prisma.$queryRaw<{ k: string; sales_value: bigint }[]>(customerFiguresSql(S, people));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.k).toBe(a);
    expect(Number(rows[0]!.sales_value)).toBe(18_000);
  });
});
