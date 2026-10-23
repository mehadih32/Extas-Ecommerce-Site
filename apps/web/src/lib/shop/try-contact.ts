// Follow-up 59 — test servers only (EXTAS_SHOP_TEST_PAGES=1): a browser that asked for it (the cookie below, set by
// POST /api/shop/try-contact) sees the shop as if the store's WhatsApp number and hotline were filled in, so the device
// gate measures the header, the phone menu and the footer with them (CI's sample database has no contact: it is the
// owner's data). The number is the sample customer's, in the unallocated +88010 range — never anyone's.
import { cookies } from 'next/headers';
import { fail, json, sameOrigin } from '../admin-auth';

export const TRY_CONTACT_COOKIE = 'extas_try_contact';
/** The sample customer's number (packages/seed sample-catalogue.json; try-contact.test.ts keeps the two the same). */
export const TRY_CONTACT_NUMBER = '+8801000000001'; // hardcode-ok: sample data, the unallocated +88010 range, test servers only

const testPagesOn = () => process.env.EXTAS_SHOP_TEST_PAGES === '1';

/** The sample number to draw with, or null (always null on the live shop: the cookie is not even read there). */
export async function tryContactNumber(): Promise<string | null> {
  if (!testPagesOn()) return null;
  return (await cookies()).get(TRY_CONTACT_COOKIE)?.value === '1' ? TRY_CONTACT_NUMBER : null;
}

/** POST /api/shop/try-contact — test servers only: this browser draws the shop with the sample contact. */
export function tryContactHandler(request: Request): Response {
  if (!testPagesOn()) return fail(404, 'not-found');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  return json({ ok: true }, { headers: { 'set-cookie': `${TRY_CONTACT_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600` } });
}
