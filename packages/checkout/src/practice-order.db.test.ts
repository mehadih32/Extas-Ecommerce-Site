// PR 725 (CN-049, 15 Nov 2026) — practice products in the checkout, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): an order made only of practice products is a practice order (flagged, tied to no real
// customer, no coupon or consent written), an order of real products is untouched by the rule, and a bag that mixes the
// two is refused with PRACTICE_MIXED and makes no order. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { placeOrder, type PlaceInput } from './place';
import { practiceKindOf } from './practice';
import { checkoutQuote } from './quote';
import { setUpCheckout, type CheckoutFixture } from './testing';

const FORM = { name: 'Practice Tester', phone: '01700000725', address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' };

describe.skipIf(!HAS_TEST_DB)('practice products in the checkout (PR 725)', () => {
  let f: CheckoutFixture;
  let practiceVariant = '';
  let realVariant = '';
  let practiceProduct = '';
  let realProduct = '';

  beforeAll(async () => {
    f = await setUpCheckout('practice-order');
    f.overrides.set('payment.cod.enabled', true);
    await f.priceBand('dhaka-city', 8_000);
    const db = f.t.prisma;
    const shirt = f.variant('oxford-cotton-shirt', 'sky', 'M');
    practiceVariant = shirt.id;
    practiceProduct = (await db.productVariant.findUniqueOrThrow({ where: { id: shirt.id }, select: { productId: true } })).productId;
    const other = await db.productVariant.findFirstOrThrow({ where: { storeId: f.S, active: true, archivedAt: null, productId: { not: practiceProduct }, product: { status: 'PUBLISHED' } }, select: { id: true, productId: true } });
    realVariant = other.id;
    realProduct = other.productId;
    await db.stockLevel.updateMany({ where: { variantId: { in: [practiceVariant, realVariant] } }, data: { onHand: 200, available: 200 } });
    // the one product is a practice product (an insert-time flag; the database only forbids switching it on a real row later, so it is set before any order)
    await db.$executeRawUnsafe(`ALTER TABLE "Product" DISABLE TRIGGER "Product_practice_fixed"`);
    await db.product.update({ where: { id: practiceProduct }, data: { isPractice: true } });
    await db.$executeRawUnsafe(`ALTER TABLE "Product" ENABLE TRIGGER "Product_practice_fixed"`);
  }, 180_000);
  afterAll(async () => {
    await f?.t.drop();
  });

  async function bagOf(name: string, variantIds: string[], phone: string) {
    const bag = await f.bag(name, variantIds.map((variantId) => ({ variantId })));
    const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: bag.cartId, lang: 'en', customerId: null, address: { line: FORM.address, confirmed: null }, payment: null, details: { name: FORM.name, phone } });
    const input: PlaceInput = { idempotencyKey: randomUUID(), lang: 'en', form: { ...FORM, phone }, confirmed: null, payment: null, fingerprint: q.fingerprint };
    return { ...bag, place: () => placeOrder(f.deps(), { storeId: f.S, visitorId: bag.visitorId, customerId: null, ip: '192.0.2.725', input }) };
  }

  it('says whether a set of products is practice, real or mixed', async () => {
    const db = f.t.prisma;
    expect(await practiceKindOf(db, f.S, [practiceProduct])).toBe('practice');
    expect(await practiceKindOf(db, f.S, [realProduct])).toBe('real');
    expect(await practiceKindOf(db, f.S, [practiceProduct, realProduct])).toBe('mixed');
    expect(await practiceKindOf(db, f.S, [practiceProduct, null])).toBe('mixed');
    expect(await practiceKindOf(db, f.S, [])).toBe('real');
  });

  it('an order of practice products only is a practice order: flagged, no customer, no consent', async () => {
    const b = await bagOf('practice-only', [practiceVariant], '01700000726');
    const r = await b.place();
    expect(r.practice).toBe(true);
    const o = await f.t.prisma.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { events: true } });
    expect(o.isPractice).toBe(true);
    expect(o.customerId).toBeNull();
    expect(o.events.some((e) => (e.data as { practice?: boolean } | null)?.practice === true)).toBe(true);
    expect(await f.t.prisma.consentRecord.count({ where: { orderId: o.id } })).toBe(0);
  });

  it('an order of real products only is a real order, as before', async () => {
    const b = await bagOf('real-only', [realVariant], '01700000727');
    const r = await b.place();
    expect(r.practice).toBeUndefined();
    expect((await f.t.prisma.order.findUniqueOrThrow({ where: { id: r.orderId } })).isPractice).toBe(false);
  });

  it('a bag that mixes practice and real products is refused and makes no order', async () => {
    const before = await f.t.prisma.order.count({ where: { storeId: f.S } });
    const b = await bagOf('mixed', [practiceVariant, realVariant], '01700000728');
    await expect(b.place()).rejects.toMatchObject({ code: 'PRACTICE_MIXED' });
    expect(await f.t.prisma.order.count({ where: { storeId: f.S } })).toBe(before);
    // the bag is still open: nothing was held or converted
    expect(await f.t.prisma.cart.count({ where: { id: b.cartId, status: 'ACTIVE' } })).toBe(1);
  });
});
