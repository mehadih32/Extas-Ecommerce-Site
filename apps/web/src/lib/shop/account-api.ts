// PR 130 — the account's public API (same site only, small bodies). The page sends what the customer typed; the answers
// carry stable codes the page turns into words (`account.err.*`). No answer says whether a number has an account.
//
//   POST /api/account/code       {phone, lang}              → {phone, resendSeconds, length, mock}   a sign-in code by SMS
//   POST /api/account/login      {phone, code, next?}       → {next}                                 signed in (cookie)
//                                {phone, password, next?}   → {next} | {step: 'code', …}             a new device: the code too
//   POST /api/account/logout                                → {next}
//   POST /api/account/password   {current?, next}           → {}                                     Profile: set or change it
//   POST /api/account/test-code  {phone}                    → {code}   test servers only (EXTAS_SHOP_TEST_PAGES=1, mock SMS)
//
// The session cookie is `__Host-extas_c`, the device cookie `__Host-extas_dev` (lib/shop/account.ts). Follow-up 71: a
// sign-in brings this browser's wishlist hearts into the account (lib/shop/wishlist.ts mergeWishes).
import { askForCode, isAccountError, normalPhone, setOwnPassword, signInWithCode, signInWithPassword, signOut, type AccountsDeps } from '@extas/accounts';
import { mockSmsOutbox } from '@extas/adapters';
import type { RequestContext } from '@extas/auth';
import { body, errorResponse, fail, json, readCookie, requestContext, sameOrigin } from '../admin-auth';
import { BAG_COOKIE } from './bag-model';
import { mergeWishes, visitorOf } from './wishlist';
import { accountCookie, CUSTOMER_COOKIE, clearAccountCookie, customerOfRequest, DEVICE_COOKIE, newDeviceToken } from './account';
import { hrefIn, isShopLang, type ShopLang } from './lang';
import { ROUTES } from './routes';

/** The largest request body the account API takes. */
export const ACCOUNT_BODY_MAX = 4_096;

export interface AccountApiDeps {
  accounts: AccountsDeps;
  storeId: number;
  /** The shop's name for the SMS ({store}). */
  storeName: () => Promise<string>;
}

const langOf = (v: unknown): ShopLang => (isShopLang(v) ? v : 'en');
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** Where to go after signing in: a shop page of this site (never back to the login page), else My account. */
export function safeNext(raw: unknown, lang: ShopLang): string {
  const v = typeof raw === 'string' ? raw : '';
  const ok = /^\/(?!\/)[A-Za-z0-9\-._~%/?=&]*$/.test(v) && !v.includes('/account/login') && v.length <= 300;
  return ok ? v : hrefIn(lang, ROUTES.account);
}

/** A refusal in the account's own codes (with when to try again, or tries left). */
export function accountRefusal(e: unknown): Response {
  if (isAccountError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ?? {}) }, { status: e.status });
  return errorResponse(e);
}

function ctxOf(request: Request): RequestContext {
  return { ...requestContext(request), source: 'shop-account' };
}

/** Follow-up 71 — this browser's hearts join the account at sign-in (a failure never stops the sign-in). */
async function joinWishlist(request: Request, deps: AccountApiDeps, customerId: string): Promise<void> {
  const visitor = visitorOf(readCookie(request, BAG_COOKIE));
  if (!visitor) return;
  try {
    await mergeWishes({ db: deps.accounts.db, settings: deps.accounts.settings, storeId: deps.storeId, now: deps.accounts.now }, visitor, customerId);
  } catch (e) {
    console.warn(`shop: the wishlist did not join the account (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
  }
}

/** The session and device cookies after a sign-in (the device cookie lasts as long as a device stays known). */
async function signedInHeaders(deps: AccountApiDeps, token: string, expiresAt: Date, device: string): Promise<Headers> {
  const { deviceDays } = await deps.accounts.settings.value('account.login', { storeId: deps.storeId });
  const h = new Headers();
  h.append('set-cookie', accountCookie(CUSTOMER_COOKIE, token, expiresAt));
  h.append('set-cookie', accountCookie(DEVICE_COOKIE, device, new Date(Date.now() + deviceDays * 86_400_000)));
  return h;
}

/** POST /api/account/<action>. */
export async function accountHandler(request: Request, deps: AccountApiDeps | null, action: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > ACCOUNT_BODY_MAX) return fail(413, 'TOO_LARGE');
  const a = deps.accounts;
  try {
    const b = await body(request);
    const lang = langOf(b.lang);
    switch (action) {
      case 'code': {
        const sent = await askForCode(a, { storeId: deps.storeId, phone: text(b.phone, 40), lang, storeName: await deps.storeName() }, ctxOf(request));
        return json({ ok: true, phone: sent.phone, resendSeconds: sent.resendSeconds, length: sent.length, mock: sent.mock });
      }
      case 'login': {
        const device = readCookie(request, DEVICE_COOKIE) ?? newDeviceToken();
        const next = safeNext(b.next, lang);
        if (typeof b.password === 'string' && b.password) {
          const r = await signInWithPassword(a, { storeId: deps.storeId, phone: text(b.phone, 40), password: text(b.password, 512), deviceToken: device, lang, storeName: await deps.storeName() }, ctxOf(request));
          if (r.kind === 'code') return json({ ok: true, step: 'code', phone: r.sent.phone, resendSeconds: r.sent.resendSeconds, length: r.sent.length, mock: r.sent.mock });
          await joinWishlist(request, deps, r.session.customerId);
          return json({ ok: true, next }, { headers: await signedInHeaders(deps, r.session.token, r.session.expiresAt, device) });
        }
        const s = await signInWithCode(a, { storeId: deps.storeId, phone: text(b.phone, 40), code: text(b.code, 16), deviceToken: device }, ctxOf(request));
        await joinWishlist(request, deps, s.customerId);
        return json({ ok: true, next }, { headers: await signedInHeaders(deps, s.token, s.expiresAt, device) });
      }
      case 'logout': {
        await signOut(a, readCookie(request, CUSTOMER_COOKIE), deps.storeId);
        const h = new Headers();
        h.append('set-cookie', clearAccountCookie(CUSTOMER_COOKIE));
        return json({ ok: true, next: hrefIn(lang, ROUTES.home) }, { headers: h });
      }
      case 'password': {
        const auth = await customerOfRequest(request, a, deps.storeId);
        if (!auth) return fail(401, 'SIGNED_OUT');
        await setOwnPassword(a, auth, { current: text(b.current, 512) || null, next: text(b.next, 512) }, ctxOf(request));
        return json({ ok: true });
      }
      case 'test-code': {
        // CI only: the newest code the mock "sent" to a number. Never on staging or production, never a real SMS.
        if (process.env.EXTAS_SHOP_TEST_PAGES !== '1') return fail(404, 'not-found');
        const sms = await a.sms?.(deps.storeId);
        if (!sms || sms.mode !== 'MOCK') return fail(404, 'not-found');
        const m = mockSmsOutbox.lastTo(normalPhone(text(b.phone, 40)).e164);
        return json({ ok: true, code: m?.text.match(/\d{4,8}/)?.[0] ?? null });
      }
      default:
        return fail(404, 'not-found');
    }
  } catch (e) {
    return accountRefusal(e);
  }
}
