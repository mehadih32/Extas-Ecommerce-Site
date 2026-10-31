// S22 · PR 426 — the shop's live chat API (Blueprint B4.2), for the chat button (components/shop/LiveChat). Off as it
// ships (`support.liveChat.enabled`); while off, a read answers `on: false` and a message is refused.
//
//   GET   /api/shop/support-chat     {on, pollSeconds, maxChars, lines} this browser's chat (none without its cookie)
//   POST  /api/shop/support-chat     {text, name?, requestKey} a message into the Support inbox; the first one gives the
//                                    browser its chat cookie (httpOnly, Secure, Lax; `support.liveChat.cookieDays`)
// A POST must come from the shop's own pages (the cross-site check) and is held to `perMinute` (@extas/support).
import * as sp from '@extas/support';
import { body, errorResponse, fail, json, readCookie, sameOrigin, type AdminDeps } from '../admin-auth';
import { LIVE_CHAT_CHANNEL_NAME } from '../support-api';
import { shopStoreId } from './store-id';

/** The chat cookie (its value is the visitor's token; only its hash is stored). */
export const CHAT_COOKIE = 'extas_chat';
/** The longest body read (a message is at most `maxChars`, 4000 at most). */
const BODY_MAX = 32 * 1024; // hardcode-ok: technical request-size cap in bytes, far above the settings' longest message

const chatCookie = (token: string, days: number): string => `${CHAT_COOKIE}=${token}; Path=/api/shop/support-chat; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86_400}`;

export async function supportChatHandler(request: Request, deps: AdminDeps | null, storeId: number = shopStoreId()): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  const cd = { db: deps.db, settings: deps.resolver, now: deps.now };
  const had = readCookie(request, CHAT_COOKIE);
  const token = sp.isVisitorToken(had) ? had : null;
  try {
    if (m === 'GET') {
      const th = await sp.liveChatThread(cd, storeId, token ?? '');
      return json({ ok: true, on: th.state.on, pollSeconds: th.state.pollSeconds, maxChars: th.state.maxChars, lines: th.lines });
    }
    if (!sameOrigin(request)) return fail(403, 'cross-site-request');
    if (Number(request.headers.get('content-length') ?? '0') > BODY_MAX) return fail(413, 'TOO_LARGE');
    const visitor = token ?? sp.newVisitorToken();
    const r = await sp.postLiveChat(cd, storeId, visitor, await body(request), LIVE_CHAT_CHANNEL_NAME);
    const headers = new Headers();
    if (!token) headers.append('set-cookie', chatCookie(visitor, (await deps.resolver.value('support.liveChat', { storeId })).cookieDays));
    return json({ ok: true, duplicate: r.duplicate }, { status: r.duplicate ? 200 : 201, headers });
  } catch (e) {
    if (e instanceof sp.LiveChatError) return json({ ok: false, error: e.code, ...(e.data ? { data: e.data } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}
