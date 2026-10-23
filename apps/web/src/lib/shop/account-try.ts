// PR 131 — test servers only (EXTAS_SHOP_TEST_PAGES=1, and only while the SMS sender is the mock): POST
// /api/account/try signs this browser in as the sample customer, so the device gate and the journeys measure My account
// with something in it: the sample customer (made once, with one sample order of the sample catalogue; never the
// owner's data: the number is in the unallocated +88010 range, the order number is the test server's own) gets a session
// like any sign-in, without the code's rate limits (the gate opens every page on every device). The real door, the
// SMS code, has its own tests (packages/accounts login.db.test.ts) and the journeys.
import type { AccountsDeps } from '@extas/accounts';
import { securityPolicy, startCustomerSession, type RequestContext } from '@extas/auth';

/** The sample account's number (the +88010 range is unallocated: never anyone's). */
export const TRY_ACCOUNT_PHONE = '+8801000000131'; // hardcode-ok: sample data, the unallocated +88010 range, test servers only
/** The sample account's one order. */
export const TRY_ORDER_NUMBER = 'TRY-131'; // hardcode-ok: sample data, test servers only

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
  const had = await a.db.order.findUnique({ where: { storeId_number: { storeId, number: TRY_ORDER_NUMBER } }, select: { id: true } });
  if (!had) {
    const v = await a.db.productVariant.findFirst({
      where: { storeId, archivedAt: null, active: true, priceMinor: { gt: 0 }, product: { status: 'PUBLISHED', archivedAt: null } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, sku: true, priceMinor: true, size: { select: { label: true } }, product: { select: { id: true, nameEn: true } }, colour: { select: { nameEn: true } } },
    });
    if (v?.priceMinor) {
      const now = new Date();
      const price = v.priceMinor;
      await a.db.order
        .create({
        data: {
          storeId,
          number: TRY_ORDER_NUMBER,
          customerId: customer.id,
          status: 'CONFIRMED',
          source: 'WEBSITE',
          currency: 'BDT',
          placedAt: now,
          confirmedAt: now,
          customerName: SAMPLE_NAME,
          phone,
          shippingAddressText: 'House 1, Road 1, Sample Area', // hardcode-ok: sample data, test servers only
          subtotalMinor: price,
          totalMinor: price,
          codAmountMinor: price,
          paymentMethod: 'COD',
          idempotencyKey: `try:${TRY_ORDER_NUMBER}`,
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
  }
  const policy = await securityPolicy(a.settings, { storeId });
  return startCustomerSession({ db: a.db, policy, now: a.now }, { storeId, customerId: customer.id, deviceLabel: 'try' }, ctx);
}
