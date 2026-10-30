// CN-029 Phase 3 qa-gate I3 (PR 610) — test servers only (EXTAS_SHOP_TEST_PAGES=1): POST /api/shop/try-pause lets the
// device gate measure the bag and the checkout with their "not taking new orders" line, which shows only while the
// ERP holds a v6 store's account. It fills this browser's bag with the sample items (the same fill as /api/bag/try)
// and sets a cookie under which the bag and the checkout DRAW the line; nothing is written anywhere, and Confirm is
// still decided by the real rule (the trial never pauses or places anything). On the live shop the door answers 404
// and the cookie is never read.
import { cookies } from 'next/headers';
import { fail, readCookie } from '../admin-auth';
import { testPagesOn, tryFillHandler } from './bag-api';
import { bagApiDeps } from './bag-deps';

export const TRY_PAUSE_COOKIE = 'extas_try_pause';

/** Whether this browser asked to see the pause line (always false on the live shop). */
export async function tryPauseOn(): Promise<boolean> {
  if (!testPagesOn()) return false;
  return (await cookies()).get(TRY_PAUSE_COOKIE)?.value === '1';
}

/** The same, for an API request. */
export function tryPauseOnRequest(request: Request): boolean {
  return testPagesOn() && readCookie(request, TRY_PAUSE_COOKIE) === '1';
}

/** POST /api/shop/try-pause — test servers only: the sample bag, and this browser sees the pause line. */
export async function tryPauseHandler(request: Request): Promise<Response> {
  if (!testPagesOn()) return fail(404, 'not-found');
  const r = await tryFillHandler(request, bagApiDeps());
  if (!r.ok) return r;
  const headers = new Headers(r.headers);
  headers.append('set-cookie', `${TRY_PAUSE_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600`);
  return new Response(r.body, { status: r.status, headers });
}
