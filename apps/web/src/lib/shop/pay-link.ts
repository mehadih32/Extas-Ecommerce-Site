// S06 · PR 542 — the advance pay link on the shop's side (`/pay/<token>` and `/bn/pay/<token>`; @extas/payments
// advance-link.ts). The customer opens it from the SMS or WhatsApp a person sent from the order: no login and no cookie
// decide anything — the token alone finds the payment, and the page shows only the order number and the amount.
//
// POST /api/pay/link {token, action, lang}: "Pay" on a real gateway (`start`: its hosted session, our signed callback),
// or the test page's answers (`approve`, `fail`: only while test payments are on and no real gateway is connected) and
// "Try again" (`retry`: a new try with the same token). Same site only, a small body. Money is never taken from what the
// browser says: the gateway's own answer, or the test page while it is allowed, through the one outcome writer.
import { isPaymentsError, linkPayAction, linkPayView, startLinkPayment, type LinkPayView, type PaymentsDeps } from '@extas/payments';
import { body, errorResponse, fail, json, sameOrigin } from '../admin-auth';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { callbackBaseUrl, shopPaymentsDeps } from '../payments-gateway';
import { keysOf, SHOP_DICTS } from './dict';
import { hrefIn, isShopLang, type ShopLang } from './lang';
import { ROUTES } from './routes';
import type { ShopContext } from './context';

/** The largest request body the pay link takes (a token, an action, a language). */
export const PAY_LINK_BODY_MAX = 1_024;
export const PAY_LINK_URL = '/api/pay/link';

/** The link's page, or null (no such link, no database, or it did not answer in time). */
export async function currentPayLink(token: string): Promise<LinkPayView | null> {
  const deps = await shopPaymentsDeps();
  if (!deps) return null;
  try {
    return await withTimeout(linkPayView(deps, token), settingsTimeoutMs() * 4);
  } catch (e) {
    console.warn(`shop: the pay link is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/** Every `paylink.*` word in the page's language (the owner's words win), for the client part. */
export function payLinkWords(c: Pick<ShopContext, 't' | 'vars' | 'lang'>): Record<string, string> {
  return Object.fromEntries(keysOf(SHOP_DICTS[c.lang]).filter((k) => k.startsWith('paylink.')).map((k) => [k.slice('paylink.'.length), c.t(k, c.vars)]));
}

const langOf = (v: unknown): ShopLang => (isShopLang(v) ? v : 'en');

export interface PayLinkApiDeps {
  payments: () => Promise<PaymentsDeps | null>;
  callbackBase: (request: Request, provider: string, lang: string) => string;
}

export const payLinkApiDeps = (): PayLinkApiDeps => ({ payments: shopPaymentsDeps, callbackBase: callbackBaseUrl });

export async function payLinkHandler(request: Request, deps: PayLinkApiDeps): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > PAY_LINK_BODY_MAX) return fail(413, 'TOO_LARGE');
  const pd = await deps.payments();
  if (!pd) return fail(503, 'database-not-configured');
  try {
    const b = (await body(request)) as Record<string, unknown>;
    const { lang: rawLang, ...input } = b;
    const lang = langOf(rawLang);
    const token = typeof input.token === 'string' ? input.token : '';
    const here = hrefIn(lang, ROUTES.payLink(token));
    if (input.action === 'start') {
      const v = await linkPayView(pd, token);
      if (!v) return fail(404, 'NOT_FOUND', ['token']);
      const s = await startLinkPayment(pd, { token, callbackBaseUrl: deps.callbackBase(request, v.provider ?? '', lang) });
      return json({ ok: true, status: 'PENDING', next: s.redirectUrl });
    }
    const r = await linkPayAction(pd, input);
    return json({ ok: true, status: r.status, next: here });
  } catch (e) {
    if (isPaymentsError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}
