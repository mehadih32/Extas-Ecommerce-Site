// CN-020 (3) · SIM-F-046 — test servers only (EXTAS_SHOP_TEST_PAGES=1): POST /api/shop/try-callme lets the device gate
// measure the checkout with its "Call me" card, which shows only to a customer who struggles while the owner's switch
// is on. It fills this browser's bag with the sample items (the same fill as /api/bag/try) and sets a cookie under
// which the checkout offers the card after one refused Confirm. Nothing is written anywhere: a tap on the card still
// goes to the real call-back door, which keeps the owner's switch. On the live shop the door answers 404 and the
// cookie is never read.
import { cookies } from 'next/headers';
import { fail } from '../admin-auth';
import { testPagesOn, tryFillHandler } from './bag-api';
import { bagApiDeps } from './bag-deps';

export const TRY_CALLME_COOKIE = 'extas_try_callme';

/** Whether this browser asked to see the "Call me" card (always false on the live shop). */
export async function tryCallMeOn(): Promise<boolean> {
  if (!testPagesOn()) return false;
  return (await cookies()).get(TRY_CALLME_COOKIE)?.value === '1';
}

/** POST /api/shop/try-callme — test servers only: the sample bag, and this browser's checkout offers "Call me". */
export async function tryCallMeHandler(request: Request): Promise<Response> {
  if (!testPagesOn()) return fail(404, 'not-found');
  const r = await tryFillHandler(request, bagApiDeps());
  if (!r.ok) return r;
  const headers = new Headers(r.headers);
  headers.append('set-cookie', `${TRY_CALLME_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600`);
  return new Response(r.body, { status: r.status, headers });
}
