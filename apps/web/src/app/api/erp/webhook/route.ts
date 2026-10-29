// PR 196 — POST /api/erp/webhook: the ERP's `stock.changed` and `variant.changed` messages (docs/ERP-API-CONTRACT.md),
// and (PR 608, `erp.model` v6) every v6 event, kept once in the permanent ERP event ledger.
// No session and no cookie: the message proves itself with its signature (X-Extas-Signature, X-Extas-Timestamp) made
// with the webhook secret the owner typed into Keys & connections (the vault). With no secret in the vault, every
// request is refused. A verified event is stored once (WebhookEvent) and answered 202; the background worker applies
// it (PR 6, job `erp.webhook.process`). Answers: `{ ok, code, eventId? }`, never a reason a sender could learn from
// beyond the code. Every check, setting and status is in @extas/inventory webhook.ts.
import { allAdapters, createConnections, ERP_DELIVERY_HEADER, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, type Connections } from '@extas/adapters';
import { receiveErpWebhook } from '@extas/inventory';
import { adminDeps } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const holder = globalThis as unknown as { __erpWebhookConnections?: { connections: Connections; at: number; ttlMs: number } };

/** One connection layer for this process, so the secret is read from the vault once per cache period, not per message. */
async function connectionsFor(deps: NonNullable<ReturnType<typeof adminDeps>>): Promise<Connections> {
  const now = Date.now();
  const hit = holder.__erpWebhookConnections;
  if (hit && now - hit.at < hit.ttlMs) return hit.connections;
  const [testSeconds, cacheSeconds] = await Promise.all([
    deps.resolver.value('system.integrationTestTimeoutSeconds'),
    deps.resolver.value('system.integrationKeyCacheSeconds'),
  ]);
  const connections = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: allAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 });
  holder.__erpWebhookConnections = { connections, at: now, ttlMs: cacheSeconds * 1000 };
  return connections;
}

const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  const deps = adminDeps();
  if (!deps) return answer(503, { ok: false, code: 'UNAVAILABLE' });
  // A body far beyond any limit is refused before it is read (the exact limit is checked on the text below).
  const length = Number(request.headers.get('content-length') ?? '0');
  const maxKb = await deps.resolver.value('erp.webhook.maxBodyKb');
  if (Number.isFinite(length) && length > maxKb * 1024) return answer(413, { ok: false, code: 'TOO_LARGE' });
  try {
    const rawBody = await request.text();
    const r = await receiveErpWebhook(
      { db: deps.db, settings: deps.resolver, connections: await connectionsFor(deps), now: deps.now },
      {
        rawBody,
        signature: request.headers.get(ERP_SIGNATURE_HEADER),
        timestamp: request.headers.get(ERP_TIMESTAMP_HEADER),
        idempotencyKey: request.headers.get('idempotency-key'),
        // PR 608: a v6 event repeats its eventId in X-Extas-Delivery.
        deliveryId: request.headers.get(ERP_DELIVERY_HEADER),
      },
    );
    return answer(r.status, { ok: r.status < 300, code: r.code, ...(r.eventId ? { eventId: r.eventId } : {}) });
  } catch (e) {
    console.error(`[erp webhook] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return answer(500, { ok: false, code: 'SERVER_ERROR' });
  }
}
