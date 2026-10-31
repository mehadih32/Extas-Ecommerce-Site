// Follow-ups 260, 261 (PR 143, 146) — test servers only (EXTAS_SHOP_TEST_PAGES=1, and only while the SMS sender is the
// mock): POST /api/account/try-cards lets the device gate, Lighthouse and the journeys measure the order page with the
// customer's edit card and the two-size question in it. It signs this browser in as the sample customer (the same door
// as /api/account/try), makes one more sample order (TRY-146: two neighbouring sizes of one piece in one colour, new),
// runs the two-size check on it, and sets a cookie under which the order page and the account API read the two
// switches as on (`orders.edit.customer`, `orders.twoSize`; both off by default) — nothing is written to the store's
// settings. Sample data only: the number is the test server's own and the phone is in the unallocated +88010 range.
// On the live shop the door answers 404 and the cookie is never read.
// S08 · PR 186: the same cookie also reads the account's exchange as on (`orders.exchange.account`, off by default), so
// the gate measures the order page's exchange buttons and the exchange page itself on the sample delivered order.
import { cookies } from 'next/headers';
import type { AccountsDeps } from '@extas/accounts';
import { twoSizeCheck, type OrdersDeps } from '@extas/orders';
import type { Key, Value } from '@extas/settings';
import { readCookie } from '../admin-auth';
import { TRY_ACCOUNT_PHONE } from './account-try';

export const TRY_CARDS_COOKIE = 'extas_try_cards';
/** The sample order with two sizes of one piece (test servers only). */
export const TRY_TWO_SIZE_ORDER = 'TRY-146'; // hardcode-ok: sample data, test servers only

const SAMPLE_NAME = 'Sample Customer'; // hardcode-ok: sample data, test servers only
const testPagesOn = () => process.env.EXTAS_SHOP_TEST_PAGES === '1';

/** Whether the page being drawn asked for the cards (always false on the live shop: the cookie is not even read). */
export async function tryCardsOn(): Promise<boolean> {
  if (!testPagesOn()) return false;
  return (await cookies()).get(TRY_CARDS_COOKIE)?.value === '1';
}

/** The same for an API request. */
export function tryCardsOnRequest(request: Request): boolean {
  return testPagesOn() && readCookie(request, TRY_CARDS_COOKIE) === '1';
}

/** The cookie the fill sets (an hour, this site only). */
export const tryCardsCookie = (): string => `${TRY_CARDS_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600`;

/** The settings as they are, with the customer's edit, the two-size question and the account's exchange on (test servers only). */
export function cardsTrialSettings<S extends AccountsDeps['settings']>(settings: S): S {
  return {
    ...settings,
    async value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>> {
      const v = await settings.value(key, opts);
      if (key === 'orders.edit.customer') return { ...(v as Value<'orders.edit.customer'>), enabled: true } as Value<K>;
      if (key === 'orders.twoSize') return { ...(v as Value<'orders.twoSize'>), enabled: true, askCustomer: true } as Value<K>;
      if (key === 'orders.exchange.account') return { ...(v as Value<'orders.exchange.account'>), enabled: true } as Value<K>;
      return v;
    },
  } as S;
}

/**
 * The sample customer's order with two neighbouring sizes of one piece in one colour (made once), checked by the
 * two-size check as the checkout does right after placing. Returns false when the sample catalogue has no such piece.
 */
export async function tryTwoSizeOrder(a: AccountsDeps, storeId: number): Promise<boolean> {
  const customer = await a.db.customer.findUnique({ where: { storeId_phone: { storeId, phone: TRY_ACCOUNT_PHONE } }, select: { id: true } });
  if (!customer) return false;
  let order = await a.db.order.findUnique({ where: { storeId_number: { storeId, number: TRY_TWO_SIZE_ORDER } }, select: { id: true } });
  if (!order) {
    const vs = await a.db.productVariant.findMany({
      where: { storeId, archivedAt: null, active: true, priceMinor: { gt: 0 }, sizeId: { not: null }, product: { status: 'PUBLISHED', archivedAt: null } },
      orderBy: [{ createdAt: 'asc' }],
      take: 400,
      select: { id: true, sku: true, priceMinor: true, productId: true, colourId: true, size: { select: { id: true, label: true, sortOrder: true, archivedAt: true } }, product: { select: { nameEn: true } }, colour: { select: { nameEn: true } } },
    });
    // two sizes next to each other in the piece's own size list (the bag's grouping), in one colour, at one price
    const pair = (() => {
      for (const pid of new Set(vs.map((v) => v.productId))) {
        const mine = vs.filter((v) => v.productId === pid && v.size && !v.size.archivedAt);
        const order = [...new Map(mine.map((v) => [v.size!.id, v.size!])).values()].sort((x, y) => x.sortOrder - y.sortOrder).map((s) => s.id);
        for (const v of mine) {
          const next = order[order.indexOf(v.size!.id) + 1];
          const w = mine.find((x) => x.colourId === v.colourId && x.size!.id === next && x.priceMinor === v.priceMinor);
          if (w) return [v, w] as const;
        }
      }
      return null;
    })();
    if (!pair) return false;
    const price = pair[0].priceMinor!;
    const now = new Date();
    order = await a.db.order
      .create({
        data: {
          storeId,
          number: TRY_TWO_SIZE_ORDER,
          customerId: customer.id,
          status: 'PLACED',
          source: 'WEBSITE',
          currency: 'BDT',
          placedAt: now,
          customerName: SAMPLE_NAME,
          phone: TRY_ACCOUNT_PHONE,
          shippingAddressText: 'House 1, Road 1, Sample Area', // hardcode-ok: sample data, test servers only
          subtotalMinor: price * 2,
          totalMinor: price * 2,
          codAmountMinor: price * 2,
          paymentMethod: 'COD',
          idempotencyKey: `try:${TRY_TWO_SIZE_ORDER}`,
          items: {
            create: pair.map((v, i) => ({
              storeId,
              variantId: v.id,
              productId: v.productId,
              sku: v.sku,
              productName: v.product.nameEn,
              colourName: v.colour?.nameEn ?? null,
              sizeLabel: v.size?.label ?? null,
              quantity: 1,
              unitPriceMinor: price,
              lineTotalMinor: price,
              createdAt: new Date(now.getTime() + i),
            })),
          },
        },
        select: { id: true },
      })
      // two fills at once: the other made it first (unique store + number), which is all we need
      .catch(async (e: unknown) => {
        if ((e as { code?: string }).code !== 'P2002') throw e;
        return a.db.order.findUniqueOrThrow({ where: { storeId_number: { storeId, number: TRY_TWO_SIZE_ORDER } }, select: { id: true } });
      });
  }
  // the check runs once per order (a second fill finds it checked and changes nothing)
  const od: OrdersDeps = { db: a.db, settings: cardsTrialSettings(a.settings), ...(a.now ? { now: a.now } : {}) };
  await twoSizeCheck(od, { storeId, orderId: order.id });
  return true;
}
