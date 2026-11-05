// S22 · PR 624 (CN-034) — POST /api/shop/support-tap: one tap on the shop's Messenger, WhatsApp or call button, sent by
// the shop's listener (components/shop/SupportTaps, drawn only while the Messenger button's counting is on) as
// `{ ch, place }`. Counted by day, channel and place (@extas/support recordSupportTap, which checks the switch again);
// numbers only, nothing about the visitor is read or kept. Same site only, size-capped, counted per address by the
// proxy; always 204.
import { recordSupportTap, type SupportDeps } from '@extas/support';
import { adminDeps, fail, sameOrigin } from '../admin-auth';

/** The largest body (two short words). */
export const SUPPORT_TAP_BODY_MAX = 128; // hardcode-ok: a body-size guard, not a business number

type Deps = Pick<SupportDeps, 'db' | 'settings' | 'now'>;

const quiet = (e: unknown) => console.warn(`support-tap: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);

export async function supportTapHandler(request: Request, storeId: number, deps: Deps | null = defaultDeps()): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > SUPPORT_TAP_BODY_MAX) return fail(413, 'TOO_LARGE');
  const headers = new Headers({ 'cache-control': 'no-store' });
  if (!deps) return new Response(null, { status: 204, headers });
  try {
    const text = await request.text();
    if (text.length > SUPPORT_TAP_BODY_MAX) return fail(413, 'TOO_LARGE');
    await recordSupportTap(deps, storeId, JSON.parse(text));
  } catch (e) {
    quiet(e);
  }
  return new Response(null, { status: 204, headers });
}

function defaultDeps(): Deps | null {
  const d = adminDeps();
  return d ? { db: d.db, settings: d.resolver } : null;
}
