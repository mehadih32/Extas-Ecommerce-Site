// PR 196 — POST /api/erp/webhook: the ERP's `stock.changed` and `variant.changed` messages (docs/ERP-API-CONTRACT.md),
// and (PR 608, `erp.model` v6) every v6 event, kept once in the permanent ERP event ledger.
// No session and no cookie: the message proves itself with its signature (X-Extas-Signature, X-Extas-Timestamp) made
// with the webhook secret the owner typed into Keys & connections (the vault). With no secret in the vault, every
// request is refused. A verified event is stored once (WebhookEvent) and answered 202; the background worker applies
// it (PR 6, job `erp.webhook.process`). Answers: `{ ok, code, eventId? }`, never a reason a sender could learn from
// beyond the code; p3 review: every 401 is one code, and a request without a well-formed signature is answered before
// anything is built or read (lib/erp-webhook.ts). Every check, setting and status is in @extas/inventory webhook.ts.
import { erpWebhookRoute } from '@/lib/erp-webhook';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return erpWebhookRoute(request);
}
