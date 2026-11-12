// S23 · PR 443 — /api/social-comments/instagram: the linked Instagram Business account's own webhook subscription
// (`object: "instagram"`, fields `comments` and `messages`), into the Support inbox's own `instagram` channel. No
// session and no cookie, and the site's password gate lets this one path through, same as the other social routes:
// - GET is Meta's handshake: the challenge goes back only when the verify token is the one the owner typed into Keys
//   & connections (the `instagramEngagement` connection's vault).
// - POST proves itself with its signature (the same X-Hub-Signature-256 HMAC as Messenger and WhatsApp, made with the
//   app secret in the vault). With no secret, every post is refused. A verified post's comments and Direct messages
//   go to the account's channel in Support (lib/support-connect); a comment is marked public so nobody mistakes it
//   for private. Nothing here replies: see social-engagement/index.ts's header note on today's honest scope.
// A body over `support.channels.webhookMaxBodyKb` is refused before it is read. Answers: `{ ok, code }`.
import { SOCIAL_ENGAGEMENT_SIGNATURE_HEADER } from '@extas/adapters';
import { adminDeps } from '@/lib/admin-auth';
import { readCapped } from '@/lib/erp-webhook';
import { receiveInstagramWebhook, socialEngagementWebhookMaxBytes, supportConnections, verifyInstagramWebhook, type MessengerWebhookDeps } from '@/lib/support-connect';
import { supportPushWiring } from '@/lib/support-push';

export const dynamic = 'force-dynamic';

async function depsFor(deps: NonNullable<ReturnType<typeof adminDeps>>): Promise<MessengerWebhookDeps> {
  return { db: deps.db, settings: deps.resolver, connections: await supportConnections(deps), now: deps.now, push: supportPushWiring(deps) };
}

const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const fault = (e: unknown) => {
  console.error(`[instagram webhook] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  return answer(500, { ok: false, code: 'SERVER_ERROR' });
};

export async function GET(request: Request): Promise<Response> {
  const deps = adminDeps();
  if (!deps) return answer(503, { ok: false, code: 'UNAVAILABLE' });
  const q = new URL(request.url).searchParams;
  try {
    const r = await verifyInstagramWebhook(await depsFor(deps), { mode: q.get('hub.mode'), token: q.get('hub.verify_token'), challenge: q.get('hub.challenge') });
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    return fault(e);
  }
}

export async function POST(request: Request): Promise<Response> {
  const deps = adminDeps();
  if (!deps) return answer(503, { ok: false, code: 'UNAVAILABLE' });
  try {
    const maxBytes = await socialEngagementWebhookMaxBytes(deps.resolver);
    const length = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > maxBytes) return answer(413, { ok: false, code: 'TOO_LARGE' });
    const rawBody = await readCapped(request, maxBytes);
    if (rawBody === null) return answer(413, { ok: false, code: 'TOO_LARGE' });
    const r = await receiveInstagramWebhook(await depsFor(deps), { rawBody, signature: request.headers.get(SOCIAL_ENGAGEMENT_SIGNATURE_HEADER) });
    return answer(r.status, { ok: r.status < 300, code: r.code });
  } catch (e) {
    return fault(e);
  }
}
