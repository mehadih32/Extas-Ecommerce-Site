// PR 131 — test servers only (EXTAS_SHOP_TEST_PAGES=1, and only while the SMS sender is the mock): POST
// /api/account/try signs this browser in as the sample customer, so the device gate and the journeys measure My account
// with something in it: the sample customer (made once, with two sample orders of the sample catalogue — one open, one
// delivered, so PR 65's "Rate & review" has a real line to sit on; never the
// owner's data: the number is in the unallocated +88010 range, the order number is the test server's own) gets a session
// like any sign-in, without the code's rate limits (the gate opens every page on every device). The real door, the
// SMS code, has its own tests (packages/accounts login.db.test.ts) and the journeys.
// Follow-up 301: POST /api/account/try-history also gives him one page more than a full page of older delivered sample
// orders (`account.lists.orders` + 1, TRY-H…), so the gate measures My orders with "Newer" / "Older" on every size.
import { setting, type AccountsDeps } from '@extas/accounts';
import { securityPolicy, startCustomerSession, type RequestContext } from '@extas/auth';

/** The sample account's number (the +88010 range is unallocated: never anyone's). */
export const TRY_ACCOUNT_PHONE = '+8801000000131'; // hardcode-ok: sample data, the unallocated +88010 range, test servers only
/** The sample account's open order. */
export const TRY_ORDER_NUMBER = 'TRY-131'; // hardcode-ok: sample data, test servers only
/** PR 65: his delivered order, the one that can be reviewed ("Rate & review" on its line). */
export const TRY_DELIVERED_ORDER_NUMBER = 'TRY-65'; // hardcode-ok: sample data, test servers only

/** Follow-up 301: the older sample orders' numbers start with this (TRY-H1, TRY-H2 …). */
export const TRY_HISTORY_PREFIX = 'TRY-H'; // hardcode-ok: sample data, test servers only

const SAMPLE_NAME = 'Sample Customer'; // hardcode-ok: sample data, test servers only

/** Whether the try door is open here: a test server whose SMS sender is the mock. */
export async function tryOpen(a: AccountsDeps, storeId: number): Promise<boolean> {
  if (process.env.EXTAS_SHOP_TEST_PAGES !== '1') return false;
  const sms = await a.sms?.(storeId);
  return !!sms && sms.mode === 'MOCK';
}

/** Makes the sample customer and his sample order (once), then a session for him. */
export async function trySignIn(a: AccountsDeps, input: { storeId: number }, ctx: RequestContext): Promise<{ token: string; expiresAt: Date }> {
  const { storeId } = input;
  // stored as it is: the +88010 range is not a mobile prefix, which is the point (it can never be anyone's)
  const phone = TRY_ACCOUNT_PHONE;
  // two gate pages filling at once on a fresh database make him once: the upsert, and when Prisma runs it as a read then
  // an insert (not ON CONFLICT; CI's app client did) the loser's unique error is the winner's row, read back
  const where = { storeId_phone: { storeId, phone } };
  const customer = await a.db.customer
    .upsert({ where, create: { storeId, phone, name: SAMPLE_NAME }, update: {}, select: { id: true } })
    .catch(async (e: unknown) => {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      return a.db.customer.findUniqueOrThrow({ where, select: { id: true } });
    });
  // PR 131: his open order; PR 65: a second, delivered order, so "Rate & review" is on a real line for the gate
  const orders = [
    { number: TRY_ORDER_NUMBER, delivered: false },
    { number: TRY_DELIVERED_ORDER_NUMBER, delivered: true },
  ] as const;
  for (const o of orders) {
    const had = await a.db.order.findUnique({ where: { storeId_number: { storeId, number: o.number } }, select: { id: true } });
    if (had) continue;
    const v = await a.db.productVariant.findFirst({
      where: { storeId, archivedAt: null, active: true, priceMinor: { gt: 0 }, product: { status: 'PUBLISHED', archivedAt: null } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, sku: true, priceMinor: true, size: { select: { label: true } }, product: { select: { id: true, nameEn: true } }, colour: { select: { nameEn: true } } },
    });
    if (!v?.priceMinor) continue;
    const now = new Date();
    const price = v.priceMinor;
    await a.db.order
      .create({
        data: {
          storeId,
          number: o.number,
          customerId: customer.id,
          status: o.delivered ? 'DELIVERED' : 'CONFIRMED',
          source: 'WEBSITE',
          currency: 'BDT',
          placedAt: now,
          confirmedAt: now,
          ...(o.delivered ? { deliveredAt: now } : {}),
          customerName: SAMPLE_NAME,
          phone,
          shippingAddressText: 'House 1, Road 1, Sample Area', // hardcode-ok: sample data, test servers only
          subtotalMinor: price,
          totalMinor: price,
          codAmountMinor: o.delivered ? 0 : price,
          paymentMethod: 'COD',
          idempotencyKey: `try:${o.number}`,
          items: {
            create: [{ storeId, variantId: v.id, productId: v.product.id, sku: v.sku, productName: v.product.nameEn, colourName: v.colour?.nameEn ?? null, sizeLabel: v.size?.label ?? null, quantity: 1, unitPriceMinor: price, lineTotalMinor: price }],
          },
        },
      })
      // the same race on the sample order: the other fill made it first (unique store + number), which is all we need
      .catch((e: unknown) => {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      });
  }
  const policy = await securityPolicy(a.settings, { storeId });
  return startCustomerSession({ db: a.db, policy, now: a.now }, { storeId, customerId: customer.id, deviceLabel: 'try' }, ctx);
}

/**
 * Follow-up 301 — older delivered sample orders for the signed-in sample customer (after `trySignIn`), one page more than
 * a full one (`account.lists.orders` + 1), a day apart and older than his two sample orders, so those stay on the first
 * page. Made once (two fills at once: the loser's unique error is the winner's row); test servers only, like the rest.
 */
export async function tryHistoryOrders(a: AccountsDeps, storeId: number): Promise<void> {
  const customer = await a.db.customer.findUnique({ where: { storeId_phone: { storeId, phone: TRY_ACCOUNT_PHONE } }, select: { id: true } });
  if (!customer) return;
  const { orders: perPage } = await setting(a, storeId, 'account.lists');
  const numbers = Array.from({ length: perPage + 1 }, (_, i) => `${TRY_HISTORY_PREFIX}${i + 1}`);
  const had = new Set((await a.db.order.findMany({ where: { storeId, number: { in: numbers } }, select: { number: true } })).map((o) => o.number));
  if (had.size === numbers.length) return;
  const v = await a.db.productVariant.findFirst({
    where: { storeId, archivedAt: null, active: true, priceMinor: { gt: 0 }, product: { status: 'PUBLISHED', archivedAt: null } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, sku: true, priceMinor: true, size: { select: { label: true } }, product: { select: { id: true, nameEn: true } }, colour: { select: { nameEn: true } } },
  });
  if (!v?.priceMinor) return;
  const price = v.priceMinor;
  const now = (a.now?.() ?? new Date()).getTime();
  for (const [i, number] of numbers.entries()) {
    if (had.has(number)) continue;
    const at = new Date(now - (i + 2) * 86_400_000);
    await a.db.order
      .create({
        data: {
          storeId,
          number,
          customerId: customer.id,
          status: 'DELIVERED',
          source: 'WEBSITE',
          currency: 'BDT',
          placedAt: at,
          confirmedAt: at,
          deliveredAt: at,
          customerName: SAMPLE_NAME,
          phone: TRY_ACCOUNT_PHONE,
          shippingAddressText: 'House 1, Road 1, Sample Area', // hardcode-ok: sample data, test servers only
          subtotalMinor: price,
          totalMinor: price,
          codAmountMinor: 0, // hardcode-ok: sample data, a delivered sample order owes nothing at the door
          paymentMethod: 'COD',
          idempotencyKey: `try:${number}`,
          items: {
            create: [{ storeId, variantId: v.id, productId: v.product.id, sku: v.sku, productName: v.product.nameEn, colourName: v.colour?.nameEn ?? null, sizeLabel: v.size?.label ?? null, quantity: 1, unitPriceMinor: price, lineTotalMinor: price }],
          },
        },
      })
      .catch((e: unknown) => {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      });
  }
}
