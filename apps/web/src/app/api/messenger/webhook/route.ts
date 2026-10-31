// PR 426 — /api/messenger/webhook: Facebook Messenger's messages to the shop's Page (Meta's webhook), into the Support
// inbox. No session and no cookie, and the site's password gate lets this one path through (infra/stack/caddy/
// auth-block.sh):
// - GET is Meta's handshake: the challenge goes back only when the verify token is the one the owner typed into Keys &
//   connections (the vault).
// - POST proves itself with its signature (MESSENGER_SIGNATURE_HEADER, made with the app secret in the vault). With no
//   secret, every post is refused. A verified post's messages go to the Page's channel in Support (lib/support-connect).
// A body over `support.channels.webhookMaxBodyKb` is refused before it is read. Answers: `{ ok, code }`.
import { MESSENGER_SIGNATURE_HEADER } from '@extas/adapters';
import { adminDeps } from '@/lib/admin-auth';
import { readCapped } from '@/lib/erp-webhook';
import { messengerWebhookMaxBytes, receiveMessengerWebhook, supportConnections, verifyMessengerWebhook, type MessengerWebhookDeps } from '@/lib/support-connect';

export const dynamic = 'force-dynamic';

async function depsFor(deps: NonNullable<ReturnType<typeof adminDeps>>): Promise<MessengerWebhookDeps> {
  return { db: deps.db, settings: deps.resolver, connections: await supportConnections(deps), now: deps.now };
}

const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const fault = (e: unknown) => {
  console.error(`[messenger webhook] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  return answer(500, { ok: false, code: 'SERVER_ERROR' });
};

export async function GET(request: Request): Promise<Response> {
  const deps = adminDeps();
  if (!deps) return answer(503, { ok: false, code: 'UNAVAILABLE' });
  const q = new URL(request.url).searchParams;
  try {
    const r = await verifyMessengerWebhook(await depsFor(deps), { mode: q.get('hub.mode'), token: q.get('hub.verify_token'), challenge: q.get('hub.challenge') });
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    return fault(e);
  }
}

export async function POST(request: Request): Promise<Response> {
  const deps = adminDeps();
  if (!deps) return answer(503, { ok: false, code: 'UNAVAILABLE' });
  try {
    // a body far beyond the limit is refused before it is read (the exact limit is checked on the text again)
    const maxBytes = await messengerWebhookMaxBytes(deps.resolver);
    const length = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > maxBytes) return answer(413, { ok: false, code: 'TOO_LARGE' });
    // Review R1 (security m2): a chunked body has no Content-Length, so the body is read as a stream and stopped at the
    // limit (never read to its end into memory).
    const rawBody = await readCapped(request, maxBytes);
    if (rawBody === null) return answer(413, { ok: false, code: 'TOO_LARGE' });
    const r = await receiveMessengerWebhook(await depsFor(deps), { rawBody, signature: request.headers.get(MESSENGER_SIGNATURE_HEADER) });
    return answer(r.status, { ok: r.status < 300, code: r.code });
  } catch (e) {
    return fault(e);
  }
}
