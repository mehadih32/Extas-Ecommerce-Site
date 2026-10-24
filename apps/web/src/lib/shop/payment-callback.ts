// S07 · PR 170 — GET|POST /api/payments/callback/<provider>: where a payment gateway sends the customer's browser back
// (and, for gateways that do, calls the shop itself). No session and no cookie decide anything: the callback proves
// itself with the signature of the address we gave the gateway, and what it claims is checked with the gateway
// (@extas/payments `receiveCallback`; a repeat is one payment, a forged one is stored and never processed). The
// browser then goes on: the thank-you page once paid, the payment page otherwise (it shows "failed, try again" or
// "still waiting"). A callback that proves nothing gets a plain 400.
import type { PaymentsDeps } from '@extas/payments';
import { receiveCallback } from '@extas/payments';
import { callbackNext, langOf } from './checkout-api';

/** The callback's fields: the query, and a form or JSON body for a POST. Long or odd values are dropped. */
async function paramsOf(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    if (typeof v === 'string' && k.length <= 40 && v.length <= 500 && Object.keys(out).length < 40) out[k] = v;
  };
  for (const [k, v] of new URL(request.url).searchParams.entries()) put(k, v);
  if (request.method.toUpperCase() === 'POST') {
    const type = request.headers.get('content-type') ?? '';
    const text = (await request.text()).slice(0, 16_384);
    if (type.includes('application/json')) {
      try {
        const j = JSON.parse(text) as Record<string, unknown>;
        if (j && typeof j === 'object') for (const [k, v] of Object.entries(j)) put(k, v);
      } catch {
        // not JSON: the query alone decides
      }
    } else for (const [k, v] of new URLSearchParams(text).entries()) put(k, v);
  }
  return out;
}

const noStore = { 'cache-control': 'no-store' };

export async function paymentCallbackHandler(request: Request, provider: string, deps: PaymentsDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'POST') return Response.json({ ok: false, code: 'METHOD' }, { status: 405, headers: noStore });
  if (!deps) return Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503, headers: noStore });
  const params = await paramsOf(request);
  try {
    const r = await receiveCallback(deps, { provider, params });
    if (r.code === 'INVALID' || !r.number) return Response.json({ ok: false, code: 'INVALID' }, { status: 400, headers: noStore });
    const to = new URL(callbackNext(langOf(params.lang), r.status, r.number), request.url);
    return new Response(null, { status: 303, headers: { location: to.pathname, ...noStore } });
  } catch (e) {
    console.error(`[payment callback] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return Response.json({ ok: false, code: 'SERVER_ERROR' }, { status: 500, headers: noStore });
  }
}
