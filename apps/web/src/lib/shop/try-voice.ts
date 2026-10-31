// CN-020 (4) · SIM-F-047 — test servers only (EXTAS_SHOP_TEST_PAGES=1): POST /api/shop/try-voice lets the device gate
// measure the checkout with the address box's mic, which shows only while the owner's switch is on. It fills this
// browser's bag with the sample items (the same fill as /api/bag/try) and sets a cookie under which the checkout draws
// the mic. Nothing is written anywhere: a recording still goes to the real voice door, which keeps the owner's switch.
// On the live shop the door answers 404 and the cookie is never read.
import { cookies } from 'next/headers';
import { fail } from '../admin-auth';
import { testPagesOn, tryFillHandler } from './bag-api';
import { bagApiDeps } from './bag-deps';

export const TRY_VOICE_COOKIE = 'extas_try_voice';

/** Whether this browser asked to see the mic (always false on the live shop). */
export async function tryVoiceOn(): Promise<boolean> {
  if (!testPagesOn()) return false;
  return (await cookies()).get(TRY_VOICE_COOKIE)?.value === '1';
}

/** POST /api/shop/try-voice — test servers only: the sample bag, and this browser's checkout draws the mic. */
export async function tryVoiceHandler(request: Request): Promise<Response> {
  if (!testPagesOn()) return fail(404, 'not-found');
  const r = await tryFillHandler(request, bagApiDeps());
  if (!r.ok) return r;
  const headers = new Headers(r.headers);
  headers.append('set-cookie', `${TRY_VOICE_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600`);
  return new Response(r.body, { status: r.status, headers });
}
