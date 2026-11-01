// S22 · PR 429 (Blueprint B4.6) — a product link sent from a support chat, opened in the shop. The product page sees the
// link's `r=` reference and its beacon (components/shop/SupportRefBeacon) posts it here; this notes the share's first
// click (@extas/support openShare: a line in the chat's log) and keeps the reference in this browser for
// `support.catalogue.creditDays`, so an order placed from it is credited to the chat and the employee (the checkout
// reads the cookie: lib/shop/checkout-api.ts → @extas/checkout support-credit.ts). Same site only; an unknown
// reference, or products in the chat switched off, keeps nothing. The latest link opened wins. Always 204.
import { openShare, type SupportDeps } from '@extas/support';
import { adminDeps, fail, sameOrigin } from '../admin-auth';
import { bagCookie } from './bag-model';
import { SUPPORT_REF_COOKIE, supportRefOf } from './support-ref-model';

/** The largest body (one reference). */
export const SUPPORT_REF_BODY_MAX = 256; // hardcode-ok: a body-size guard, not a business number

type Deps = Pick<SupportDeps, 'db' | 'settings' | 'now'>;

const quiet = (e: unknown) => console.warn(`support-ref: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);

export async function supportRefHandler(request: Request, storeId: number, deps: Deps | null = defaultDeps()): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > SUPPORT_REF_BODY_MAX) return fail(413, 'TOO_LARGE');
  const headers = new Headers({ 'cache-control': 'no-store' });
  if (!deps) return new Response(null, { status: 204, headers });
  try {
    const text = await request.text();
    if (text.length > SUPPORT_REF_BODY_MAX) return fail(413, 'TOO_LARGE');
    const b = JSON.parse(text) as { r?: unknown };
    const ref = typeof b.r === 'string' ? supportRefOf(b.r) : null;
    const kept = ref ? await openShare(deps, storeId, ref) : null;
    if (ref && kept) headers.append('set-cookie', bagCookie(SUPPORT_REF_COOKIE, ref, kept.days));
  } catch (e) {
    quiet(e);
  }
  return new Response(null, { status: 204, headers });
}

function defaultDeps(): Deps | null {
  const d = adminDeps();
  return d ? { db: d.db, settings: d.resolver } : null;
}
