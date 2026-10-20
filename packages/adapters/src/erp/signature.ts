// PR 194 — request signing of the ERP ↔ shop API contract: both directions sign the raw body,
// `X-Extas-Signature: sha256=<HMAC-SHA256 of the raw body, hex>` with the integration's webhook secret, plus
// `X-Extas-Timestamp`; a request older than the allowed age is refused (contract: 5 minutes, the setting
// `erp.webhook.maxAgeSeconds`). The ERP → shop webhooks (PR 205/206) verify with `verifyErpSignature`; the order pushes
// (PR 199) sign with `signErpBody`. Comparison is constant-time.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ERP_SIGNATURE_HEADER = 'x-extas-signature';
export const ERP_TIMESTAMP_HEADER = 'x-extas-timestamp';
const PREFIX = 'sha256=';

export function signErpBody(secret: string, rawBody: string | Uint8Array): string {
  return PREFIX + createHmac('sha256', secret).update(rawBody).digest('hex');
}

export type SignatureCheck = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' };

/** The timestamp is seconds or milliseconds since the epoch, or an ISO date. */
function parseTimestamp(v: string): number | null {
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return n < 1e12 ? n * 1000 : n;
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function verifyErpSignature(input: {
  secret: string;
  rawBody: string | Uint8Array;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  maxAgeSeconds: number;
  now?: number;
}): SignatureCheck {
  if (!input.signature || !input.timestamp) return { ok: false, reason: 'missing' };
  const at = parseTimestamp(input.timestamp);
  if (at === null || !input.signature.startsWith(PREFIX) || !/^[0-9a-f]{64}$/i.test(input.signature.slice(PREFIX.length))) return { ok: false, reason: 'malformed' };
  const now = input.now ?? Date.now();
  if (Math.abs(now - at) > input.maxAgeSeconds * 1000) return { ok: false, reason: 'stale' };
  const want = Buffer.from(signErpBody(input.secret, input.rawBody).slice(PREFIX.length), 'hex');
  const got = Buffer.from(input.signature.slice(PREFIX.length), 'hex');
  return want.length === got.length && timingSafeEqual(want, got) ? { ok: true } : { ok: false, reason: 'mismatch' };
}
