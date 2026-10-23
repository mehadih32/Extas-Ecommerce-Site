// PR 128 — test servers only (EXTAS_SHOP_TEST_PAGES=1): POST /api/shop/try-look lets the device gate and the journeys
// measure the thank-you page with "Complete your look" in it. It makes one sample Cash on Delivery order (TRY-128) of a
// product that a running sample combo pairs with another piece, gives this browser the sample visitor that order
// belongs to, and sets a cookie under which the thank-you page draws the block as if the owner had "Complete your
// look" and "Add to this parcel" on (nothing is written to the store's settings). Sample data only, never the
// owner's: the number is the test server's own and the phone is in the unallocated +88010 range. On the live shop the
// door answers 404 and the cookie is never read.
import { cookies } from 'next/headers';
import { getPrisma } from '@extas/db/client';
import { fail, json, sameOrigin } from '../admin-auth';
import { BAG_COOKIE, bagCookie } from './bag-model';
import { shopStoreId } from './context';

export const TRY_LOOK_COOKIE = 'extas_try_look';
/** The sample order's number (test servers only). */
export const TRY_LOOK_ORDER = 'TRY-128'; // hardcode-ok: sample data, test servers only
/** The sample visitor the sample order belongs to (the bag cookie's shape; never a real visitor's). */
export const TRY_LOOK_VISITOR = 'try-look-sample-visitor-0000128'; // hardcode-ok: sample data, test servers only
const TRY_LOOK_PHONE = '+8801000000128'; // hardcode-ok: sample data, the unallocated +88010 range, test servers only
const SAMPLE_NAME = 'Sample Customer'; // hardcode-ok: sample data, test servers only

const testPagesOn = () => process.env.EXTAS_SHOP_TEST_PAGES === '1';

/** Whether this browser asked to see the look block (always false on the live shop). */
export async function tryLookOn(): Promise<boolean> {
  if (!testPagesOn()) return false;
  return (await cookies()).get(TRY_LOOK_COOKIE)?.value === '1';
}

/** The sample order (made once): the first piece of a running combo that pairs two products. */
async function sampleOrder(storeId: number): Promise<boolean> {
  const db = getPrisma();
  if (await db.order.findUnique({ where: { storeId_number: { storeId, number: TRY_LOOK_ORDER } }, select: { id: true } })) return true;
  const combos = await db.combo.findMany({
    where: { storeId, status: 'RUNNING', archivedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { items: { where: { archivedAt: null, productId: { not: null } }, orderBy: { position: 'asc' }, select: { productId: true } } },
    take: 50,
  });
  const pick = combos.find((c) => new Set(c.items.map((i) => i.productId)).size > 1)?.items[0]?.productId;
  if (!pick) return false;
  const v = await db.productVariant.findFirst({
    where: { storeId, productId: pick, archivedAt: null, active: true, priceMinor: { gt: 0 }, product: { status: 'PUBLISHED', archivedAt: null } },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, sku: true, priceMinor: true, size: { select: { label: true } }, product: { select: { id: true, nameEn: true } }, colour: { select: { nameEn: true } } },
  });
  if (!v?.priceMinor) return false;
  const price = v.priceMinor;
  // The gate opens the English and Bengali pages at once: the second fill's create meets the first's order (P2002).
  await db.order.create({
    data: {
      storeId,
      number: TRY_LOOK_ORDER,
      visitorId: TRY_LOOK_VISITOR,
      status: 'PLACED',
      source: 'WEBSITE',
      currency: 'BDT',
      placedAt: new Date(),
      customerName: SAMPLE_NAME,
      phone: TRY_LOOK_PHONE,
      shippingAddressText: 'House 1, Road 1, Sample Area', // hardcode-ok: sample data, test servers only
      subtotalMinor: price,
      totalMinor: price,
      codAmountMinor: price,
      paymentMethod: 'COD',
      idempotencyKey: `try:${TRY_LOOK_ORDER}`,
      items: {
        create: [{ storeId, variantId: v.id, productId: v.product.id, sku: v.sku, productName: v.product.nameEn, colourName: v.colour?.nameEn ?? null, sizeLabel: v.size?.label ?? null, quantity: 1, unitPriceMinor: price, lineTotalMinor: price }],
      },
    },
  }).catch((e: unknown) => {
    if ((e as { code?: string }).code !== 'P2002') throw e;
  });
  return true;
}

/** POST /api/shop/try-look — test servers only: this browser opens /checkout/thanks/TRY-128 with the look block. */
export async function tryLookHandler(request: Request): Promise<Response> {
  if (!testPagesOn() || !process.env.DATABASE_URL) return fail(404, 'not-found');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (!(await sampleOrder(shopStoreId()))) return fail(409, 'no-sample-combo');
  const headers = new Headers();
  headers.append('set-cookie', `${TRY_LOOK_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600`);
  headers.append('set-cookie', bagCookie(BAG_COOKIE, TRY_LOOK_VISITOR, 1));
  return json({ ok: true, number: TRY_LOOK_ORDER }, { headers });
}
