// S24 · PR 462 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): `assignStyleVariant` against the
// actual `PhotoshootStyleTrial` table — cohort gating, deterministic re-bucketing, the unique-index idempotency,
// store scoping — and `styleTallies` against real `CartItem`/`Order`/`OrderItem`/`ReturnRecord`/`ReturnItem` rows.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { assignStyleVariant, styleTallies, type PilotCohort } from './styleAbTest';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 462 · live style A/B — assignment and tallies (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let reader: Who;
  let nobody: Who;
  const deps: PhotoshootDeps = { db: undefined as never };

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_style_ab');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    (deps as { db: unknown }).db = t.prisma;
    const role = await createRole(t.prisma, SYSTEM, { key: 't462-reader', nameEn: 'reader', nameBn: 'reader', permissions: ['photoshoot.read'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't462-reader@example.com', displayName: 'reader', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    reader = { actor: { staffUserId: u.id }, storeId: S };
    // A staff user created with no role assignment at all — zero permissions in this store, for the "refused" case.
    const unassigned = await t.prisma.staffUser.create({ data: { email: 't462-noperm@example.com', displayName: 'no permissions', passwordHash: 'not-a-login' } });
    nobody = { actor: { staffUserId: unassigned.id }, storeId: S };
  });

  afterAll(async () => t.drop());

  async function product(storeId = S) {
    return t.prisma.product.create({ data: { storeId, slug: `test-462-${randomUUID()}`, nameEn: 'Test product' } });
  }

  it('a product outside the cohort is never bucketed, and nothing is written', async () => {
    const p = await product();
    const cohort: PilotCohort = { productIds: [], splitPercent: 50 };
    const a = await assignStyleVariant(deps, cohort, { storeId: S, productId: p.id, visitorId: 'visitor-1' });
    expect(a).toEqual({ inTest: false, variant: null });
    expect(await t.prisma.photoshootStyleTrial.count({ where: { storeId: S, productId: p.id } })).toBe(0);
  });

  it('a pilot product buckets the visitor once and keeps the same answer on every later ask', async () => {
    const p = await product();
    const cohort: PilotCohort = { productIds: [p.id], splitPercent: 50 };
    const first = await assignStyleVariant(deps, cohort, { storeId: S, productId: p.id, visitorId: 'visitor-2' });
    expect(first.inTest).toBe(true);
    expect(['ON_MODEL', 'FLAT_LAY']).toContain(first.variant);
    for (let i = 0; i < 5; i++) {
      const again = await assignStyleVariant(deps, cohort, { storeId: S, productId: p.id, visitorId: 'visitor-2' });
      expect(again).toEqual(first);
    }
    expect(await t.prisma.photoshootStyleTrial.count({ where: { storeId: S, productId: p.id, visitorId: 'visitor-2' } })).toBe(1);
  });

  it('two different visitors on the same pilot product can land on different sides, each one row', async () => {
    const p = await product();
    const cohort: PilotCohort = { productIds: [p.id], splitPercent: 50 };
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add((await assignStyleVariant(deps, cohort, { storeId: S, productId: p.id, visitorId: `visitor-many-${i}` })).variant!);
    expect(seen.size).toBe(2);
    expect(await t.prisma.photoshootStyleTrial.count({ where: { storeId: S, productId: p.id } })).toBe(40);
  });

  it('a concurrent double-ask for the very first view never throws, and still leaves exactly one row', async () => {
    const p = await product();
    const cohort: PilotCohort = { productIds: [p.id], splitPercent: 50 };
    const [a, b] = await Promise.all([
      assignStyleVariant(deps, cohort, { storeId: S, productId: p.id, visitorId: 'visitor-race' }),
      assignStyleVariant(deps, cohort, { storeId: S, productId: p.id, visitorId: 'visitor-race' }),
    ]);
    expect(a).toEqual(b);
    expect(await t.prisma.photoshootStyleTrial.count({ where: { storeId: S, productId: p.id, visitorId: 'visitor-race' } })).toBe(1);
  });

  it('a staff user with no photoshoot.read is refused by styleTallies', async () => {
    const p = await product();
    await expect(styleTallies(deps, nobody, { productIds: [p.id] })).rejects.toThrow();
  });

  it('tallies add-to-bag, order and return activity per variant, only after the trial, only that product', async () => {
    const p = await product();
    const variant = await t.prisma.productVariant.create({ data: { storeId: S, productId: p.id, sku: `T462-${randomUUID()}` } });
    const otherVariant = await t.prisma.productVariant.create({ data: { storeId: S, productId: (await product()).id, sku: `T462-OTHER-${randomUUID()}` } });

    const trialOnModel = await t.prisma.photoshootStyleTrial.create({ data: { storeId: S, productId: p.id, visitorId: 'v-onmodel', variant: 'ON_MODEL' } });
    const trialFlatLay = await t.prisma.photoshootStyleTrial.create({ data: { storeId: S, productId: p.id, visitorId: 'v-flatlay', variant: 'FLAT_LAY' } });

    // on-model visitor: adds to the bag, orders, and the order later gets a return against this product
    const cart = await t.prisma.cart.create({ data: { storeId: S, visitorId: 'v-onmodel' } });
    await t.prisma.cartItem.create({ data: { storeId: S, cartId: cart.id, variantId: variant.id, quantity: 1, unitPriceMinor: 1000 } });
    const order = await t.prisma.order.create({ data: { storeId: S, number: `T462-${randomUUID()}`, source: 'WEBSITE', currency: 'BDT', subtotalMinor: 1000, totalMinor: 1000, idempotencyKey: randomUUID(), visitorId: 'v-onmodel' } });
    const orderItem = await t.prisma.orderItem.create({ data: { storeId: S, orderId: order.id, variantId: variant.id, productId: p.id, sku: variant.sku, productName: 'Test product', quantity: 1, unitPriceMinor: 1000, lineTotalMinor: 1000 } });
    const ret = await t.prisma.returnRecord.create({ data: { storeId: S, orderId: order.id, kind: 'RETURNED' } });
    await t.prisma.returnItem.create({ data: { storeId: S, returnId: ret.id, orderItemId: orderItem.id, quantity: 1 } });

    // flat-lay visitor: only adds to the bag, never orders
    const cart2 = await t.prisma.cart.create({ data: { storeId: S, visitorId: 'v-flatlay' } });
    await t.prisma.cartItem.create({ data: { storeId: S, cartId: cart2.id, variantId: variant.id, quantity: 1, unitPriceMinor: 1000 } });

    // noise: activity for a DIFFERENT product, and a DRAFT order (never placed) — neither should count
    const cart3 = await t.prisma.cart.create({ data: { storeId: S, visitorId: 'v-onmodel' } });
    await t.prisma.cartItem.create({ data: { storeId: S, cartId: cart3.id, variantId: otherVariant.id, quantity: 1, unitPriceMinor: 1000 } });
    await t.prisma.order.create({ data: { storeId: S, number: `T462-draft-${randomUUID()}`, status: 'DRAFT', source: 'WEBSITE', currency: 'BDT', subtotalMinor: 500, totalMinor: 500, idempotencyKey: randomUUID(), visitorId: 'v-flatlay' } });

    const out = await styleTallies(deps, reader, { productIds: [p.id] });
    expect(out.onModel).toEqual({ n: 1, addedToBag: 1, ordered: 1, returned: 1 });
    expect(out.flatLay).toEqual({ n: 1, addedToBag: 1, ordered: 0, returned: 0 });

    void trialOnModel;
    void trialFlatLay;
  });

  it('never tallies another store’s trials', async () => {
    const p = await product(other);
    await t.prisma.photoshootStyleTrial.create({ data: { storeId: other, productId: p.id, visitorId: 'v-other-store', variant: 'ON_MODEL' } });
    const out = await styleTallies(deps, reader, { productIds: [p.id] });
    expect(out.onModel.n).toBe(0);
    expect(out.flatLay.n).toBe(0);
  });
});
