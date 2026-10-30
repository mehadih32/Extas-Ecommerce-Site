// PR 196, 608 — POST /api/erp/webhook, the route's own half (app/api/erp/webhook/route.ts): every check, setting and
// status is in @extas/inventory webhook.ts. p3 review (owner rule: unsigned or stale ERP calls are refused before any
// database read; refusals are counted and rate-limited):
// - The two signature headers are looked at first (`erpWebhookRequestRefusal`): no or a malformed signature or
//   timestamp, or an address already past its refusals this minute while no store secret is known yet, is answered at
//   once. No connection is built and no setting, table or vault is read for it.
// - The body is read as a stream and stopped at `erp.webhook.maxBodyKb` (a chunked body has no Content-Length, so the
//   header alone can never be trusted): a longer one is 413, never read to its end.
// - Every 401 is answered with one code, UNAUTHORIZED, whatever the reason (no secret yet, unsigned, wrong, stale, a
//   secret two stores share), so a sender learns nothing about the shop's secrets. The reasons are counted on the shop
//   only (the guard's summary row `erp.webhook.refused`).
// - The sender's address for the per-address cut-off is ~~Cloudflare's CF-Connecting-IP, then the proxy's~~ Caddy's
//   own answer in CF-Connecting-IP (`requestContext`; round 2: Caddy believes Cloudflare's header only from
//   Cloudflare's ranges and overwrites it, so a caller cannot choose it). IPv6 is counted by /64.
import { allAdapters, createConnections, ERP_DELIVERY_HEADER, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, type Connections } from '@extas/adapters';
import { erpWebhookGuard, erpWebhookRequestRefusal, receiveErpWebhook, type ErpSiteGuard, type WebhookAnswer, type WebhookDeps } from '@extas/inventory';
import { adminDeps, requestContext } from './admin-auth';

const holder = globalThis as unknown as { __erpWebhookConnections?: { connections: Connections; at: number; ttlMs: number } };

/** The app's own deps: one connection layer for this process, so the secret is read from the vault once per cache period. */
export async function erpWebhookDeps(): Promise<WebhookDeps | null> {
  const deps = adminDeps();
  if (!deps) return null;
  const now = Date.now();
  let hit = holder.__erpWebhookConnections;
  if (!hit || now - hit.at >= hit.ttlMs) {
    const [testSeconds, cacheSeconds] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
    const connections = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: allAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
    hit = holder.__erpWebhookConnections = { connections, at: now, ttlMs: cacheSeconds * 1000 };
  }
  return { db: deps.db, settings: deps.resolver, connections: hit.connections, now: deps.now };
}

const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** The answer a sender sees: every 401 the same (the reason stays on the shop). */
export const publicAnswer = (r: Pick<WebhookAnswer, 'status' | 'code' | 'eventId'>): Response =>
  r.status === 401 ? answer(401, { ok: false, code: 'UNAUTHORIZED' }) : answer(r.status, { ok: r.status < 300, code: r.code, ...(r.eventId ? { eventId: r.eventId } : {}) });

/** The body as text, read at most `maxBytes` (+1 to know it is longer): null when it is longer. */
export async function readCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export interface ErpWebhookRouteOptions {
  /** Builds the deps (the app's own unless a test gives them); called only once the headers pass. */
  deps?: () => Promise<WebhookDeps | null>;
  guard?: ErpSiteGuard;
}

/** The whole route. */
export async function erpWebhookRoute(request: Request, opts: ErpWebhookRouteOptions = {}): Promise<Response> {
  const guard = opts.guard ?? erpWebhookGuard();
  const head = { signature: request.headers.get(ERP_SIGNATURE_HEADER), timestamp: request.headers.get(ERP_TIMESTAMP_HEADER), address: requestContext(request).ip };
  const early = erpWebhookRequestRefusal(head, new Date(), guard);
  if (early) return publicAnswer(early);
  try {
    const deps = await (opts.deps ?? erpWebhookDeps)();
    if (!deps) return answer(503, { ok: false, code: 'UNAVAILABLE' });
    const maxBytes = (await deps.settings.value('erp.webhook.maxBodyKb')) * 1024;
    // A body far beyond the limit by its own header is refused unread; any other is read only up to the limit.
    const length = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > maxBytes) return answer(413, { ok: false, code: 'TOO_LARGE' });
    const rawBody = await readCapped(request, maxBytes);
    if (rawBody === null) return answer(413, { ok: false, code: 'TOO_LARGE' });
    const r = await receiveErpWebhook(
      deps,
      {
        rawBody,
        ...head,
        idempotencyKey: request.headers.get('idempotency-key'),
        // PR 608: a v6 event repeats its eventId in X-Extas-Delivery (PR 607: it may only repeat it).
        deliveryId: request.headers.get(ERP_DELIVERY_HEADER),
      },
      guard,
    );
    return publicAnswer(r);
  } catch (e) {
    console.error(`[erp webhook] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return answer(500, { ok: false, code: 'SERVER_ERROR' });
  }
}
