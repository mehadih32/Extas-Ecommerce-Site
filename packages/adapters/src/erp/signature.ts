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

/**
 * PR 620 (qa-gate 30 Oct): whether the two headers can be a signature at all, without any secret: both given, the
 * signature `sha256=<64 hex>`, the timestamp seconds, milliseconds or an ISO date. Lets a caller refuse a call that
 * can never verify before it reads a store, a setting or the vault. Given the allowed age and the clock, a timestamp
 * further from it than that is refused too ('stale'), still without any secret.
 */
export function erpSignatureShape(signature: string | null | undefined, timestamp: string | null | undefined, age?: { maxAgeSeconds: number; now: number }): SignatureCheck {
  if (!signature || !timestamp) return { ok: false, reason: 'missing' };
  const at = parseTimestamp(timestamp);
  if (at === null || !signature.startsWith(PREFIX) || !/^[0-9a-f]{64}$/i.test(signature.slice(PREFIX.length))) return { ok: false, reason: 'malformed' };
  if (age && Math.abs(age.now - at) > age.maxAgeSeconds * 1000) return { ok: false, reason: 'stale' };
  return { ok: true };
}

export function verifyErpSignature(input: {
  secret: string;
  rawBody: string | Uint8Array;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  maxAgeSeconds: number;
  now?: number;
}): SignatureCheck {
  const shape = erpSignatureShape(input.signature, input.timestamp);
  if (!shape.ok) return shape;
  const at = parseTimestamp(input.timestamp!)!;
  const now = input.now ?? Date.now();
  if (Math.abs(now - at) > input.maxAgeSeconds * 1000) return { ok: false, reason: 'stale' };
  const want = Buffer.from(signErpBody(input.secret, input.rawBody).slice(PREFIX.length), 'hex');
  const got = Buffer.from(input.signature!.slice(PREFIX.length), 'hex');
  return want.length === got.length && timingSafeEqual(want, got) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

// ---- PR 620 (CN-028, docs/erp/site-changes-v6.md §2.7) · the ERP's own calls to the shop ----------------------------
// `GET {site}/erp-api/top-products` and `GET {site}/erp-api/customers` have no body, so the ERP signs the request itself:
// `METHOD\nPATH?QUERY\nTIMESTAMP` (the path with its query exactly as sent; no `?` when there is no query), with the same
// two headers. A signature then works only for that exact request and that moment. Constant-time, and refused when the
// timestamp is more than the allowed age from the shop's clock, either way.

/** The text the ERP signs for a call without a body. */
export function erpRequestText(method: string, pathAndQuery: string, timestamp: string): string {
  return `${method.toUpperCase()}\n${pathAndQuery}\n${timestamp}`;
}

/** The signature of one call: `sha256=<HMAC-SHA256 of the request text, hex>`. */
export function signErpRequest(secret: string, method: string, pathAndQuery: string, timestamp: string): string {
  return signErpBody(secret, erpRequestText(method, pathAndQuery, timestamp));
}

/** Checks one call's signature (the same reasons as `verifyErpSignature`; the timestamp is part of the signed text). */
export function verifyErpRequest(input: {
  secret: string;
  method: string;
  pathAndQuery: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  maxAgeSeconds: number;
  now?: number;
}): SignatureCheck {
  if (!input.timestamp) return { ok: false, reason: 'missing' };
  return verifyErpSignature({ secret: input.secret, rawBody: erpRequestText(input.method, input.pathAndQuery, input.timestamp), signature: input.signature, timestamp: input.timestamp, maxAgeSeconds: input.maxAgeSeconds, now: input.now });
}

/** A signed call as the ERP makes it (for tests and the practice ERP): its two headers, the timestamp in seconds. */
export function signedErpSiteCall(secret: string, method: string, pathAndQuery: string, now: Date = new Date()): { headers: Record<string, string> } {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return { headers: { [ERP_SIGNATURE_HEADER]: signErpRequest(secret, method, pathAndQuery, timestamp), [ERP_TIMESTAMP_HEADER]: timestamp } };
}
