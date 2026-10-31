// PR 292 — /api/whatsapp/webhook: the WhatsApp Business Platform's messages to the shop (Meta's Cloud API webhook).
// No session and no cookie, and the site's password gate lets this one path through (infra/stack/caddy/auth-block.sh):
// - GET is Meta's handshake: the challenge goes back only when the verify token is the one the owner typed into Keys &
//   connections (the vault).
// - POST proves itself with its signature (X-Hub-Signature-256, made with the app secret in the vault). With no secret,
//   every post is refused. A verified post's receipts and replies are recorded (@extas/messages whatsapp.ts).
// A body over `messages.whatsapp.webhookMaxBodyKb` is refused before it is read. Answers: `{ ok, code }`.
// PR 426: a verified post's customer messages go on to the Support inbox too, to the store's WhatsApp channel with that
// phone number id (lib/support-connect; a number not added in Support, or switched off, takes nothing).
import { createConnections, messageAdapters, WHATSAPP_SIGNATURE_HEADER, type Connections } from '@extas/adapters';
import { receiveWhatsAppWebhook, sendersFrom, verifyWhatsAppWebhook, whatsappWebhookMaxBytes, type WhatsAppWebhookDeps } from '@extas/messages';
import * as sp from '@extas/support';
import { adminDeps } from '@/lib/admin-auth';
import { whatsappToSupport } from '@/lib/support-connect';

export const dynamic = 'force-dynamic';

const holder = globalThis as unknown as { __whatsappWebhookConnections?: { connections: Connections; at: number; ttlMs: number } };

/** One connection layer for this process, so the secrets are read from the vault once per cache period, not per message. */
async function depsFor(deps: NonNullable<ReturnType<typeof adminDeps>>): Promise<WhatsAppWebhookDeps> {
  const now = Date.now();
  let hit = holder.__whatsappWebhookConnections;
  if (!hit || now - hit.at >= hit.ttlMs) {
    const [testSeconds, cacheSeconds] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
    const connections = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: messageAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
    hit = { connections, at: now, ttlMs: cacheSeconds * 1000 };
    holder.__whatsappWebhookConnections = hit;
  }
  return {
    db: deps.db,
    settings: deps.resolver,
    sender: sendersFrom(hit.connections),
    connections: hit.connections,
    now: deps.now,
    onInbound: (storeId, inbound) => sp.receiveFromChannel({ db: deps.db, settings: deps.resolver, now: deps.now }, storeId, 'whatsapp', whatsappToSupport(inbound)),
  };
}

const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const fault = (e: unknown) => {
  console.error(`[whatsapp webhook] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  return answer(500, { ok: false, code: 'SERVER_ERROR' });
};

export async function GET(request: Request): Promise<Response> {
  const deps = adminDeps();
  if (!deps) return answer(503, { ok: false, code: 'UNAVAILABLE' });
  const q = new URL(request.url).searchParams;
  try {
    const r = await verifyWhatsAppWebhook(await depsFor(deps), { mode: q.get('hub.mode'), token: q.get('hub.verify_token'), challenge: q.get('hub.challenge') });
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
    const length = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > (await whatsappWebhookMaxBytes({ settings: deps.resolver }))) return answer(413, { ok: false, code: 'TOO_LARGE' });
    const rawBody = await request.text();
    const r = await receiveWhatsAppWebhook(await depsFor(deps), { rawBody, signature: request.headers.get(WHATSAPP_SIGNATURE_HEADER) });
    return answer(r.status, { ok: r.status < 300, code: r.code });
  } catch (e) {
    return fault(e);
  }
}
