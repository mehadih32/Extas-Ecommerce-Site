// PR 196 — the ERP → shop webhooks of the API contract (docs/ERP-API-CONTRACT.md, "ERP → shop webhooks"): what one
// event looks like, how it is read, and how a sender signs it (the practice ERP's test events, and the real ERP's
// side of the contract). The shop's receiver (@extas/inventory webhook.ts) verifies the signature with
// `verifyErpSignature` before it reads anything here.
//
// One event per request, JSON:
//   { "id": "<event id, unique per ERP integration>", "type": "stock.changed" | "variant.changed",
//     "occurredAt": "<ISO time, optional>", "data": { … one stock row or one variant row, as the GET endpoints … } }
// `stock.changed` data: sku, warehouseId, onHand, reserved, available, updatedAt (as GET /stock).
// `variant.changed` data: sku, barcode, styleCode, styleName, color, size, retailPrice, avgCost, active, updatedAt
// (as GET /catalog/variants). The event id may instead come in the `Idempotency-Key` header.
import { z } from 'zod';
import type { ErpStockRow, ErpVariantRow } from './contract';
import { erpStockRowSchema, erpVariantRowSchema } from './http-client';
import { ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, signErpBody } from './signature';

export const ERP_WEBHOOK_TYPES = ['stock.changed', 'variant.changed'] as const;
export type ErpWebhookType = (typeof ERP_WEBHOOK_TYPES)[number];

export type ErpWebhookEvent =
  | { id: string | null; type: 'stock.changed'; occurredAt: Date | null; data: ErpStockRow }
  | { id: string | null; type: 'variant.changed'; occurredAt: Date | null; data: ErpVariantRow };

const envelope = z.object({
  id: z.union([z.string().trim().min(1).max(200), z.number()]).transform(String).nullish().transform((v) => v ?? null),
  type: z.string().min(1).max(100),
  occurredAt: z.iso.datetime({ offset: true }).nullish().transform((v) => (v ? new Date(v) : null)),
  data: z.unknown(),
});

export type ErpWebhookParse =
  | { ok: true; event: ErpWebhookEvent }
  /** A well-formed event of a type the shop does not handle (kept, answered, ignored). */
  | { ok: false; reason: 'UNKNOWN_TYPE'; id: string | null; type: string }
  | { ok: false; reason: 'BAD_PAYLOAD'; id: string | null; type: string | null; detail: string };

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || '(event)'}: ${i.message}`).join('; ').slice(0, 300);

/** Reads one event from its JSON value (already parsed). Never throws. */
export function parseErpWebhookEvent(body: unknown): ErpWebhookParse {
  const env = envelope.safeParse(body);
  if (!env.success) return { ok: false, reason: 'BAD_PAYLOAD', id: null, type: null, detail: issues(env.error) };
  const { id, type, occurredAt, data } = env.data;
  if (type === 'stock.changed') {
    const r = erpStockRowSchema.safeParse(data);
    return r.success ? { ok: true, event: { id, type, occurredAt, data: r.data } } : { ok: false, reason: 'BAD_PAYLOAD', id, type, detail: issues(r.error) };
  }
  if (type === 'variant.changed') {
    const r = erpVariantRowSchema.safeParse(data);
    return r.success ? { ok: true, event: { id, type, occurredAt, data: r.data } } : { ok: false, reason: 'BAD_PAYLOAD', id, type, detail: issues(r.error) };
  }
  return { ok: false, reason: 'UNKNOWN_TYPE', id, type };
}

/** A signed webhook request as the ERP sends it: the raw body and its two headers (timestamp in seconds). */
export function signedErpWebhook(secret: string, event: { id?: string; type: string; occurredAt?: string; data: unknown }, now: Date = new Date()): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(event);
  return {
    body,
    headers: {
      'content-type': 'application/json',
      [ERP_SIGNATURE_HEADER]: signErpBody(secret, body),
      [ERP_TIMESTAMP_HEADER]: String(Math.floor(now.getTime() / 1000)),
    },
  };
}
