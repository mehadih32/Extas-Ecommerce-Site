// PR 141, 152 — how the order screens send a command (client-safe: the browser runs it). Every command goes through
// the existing admin API (lib/orders-api.ts, §9.10) with the order's `version` ([ver]) and an `Idempotency-Key` (§7.7:
// a repeat of the same click gets the first answer, so a double tap never runs a command twice). A refusal comes back
// as its stable code; the screen says it in words from messages/admin-orders.<lang>.json (`orders.err.<CODE>`), and a
// STALE answer makes the screen read the order again and say so.

/** The command routes of one order (after /api/admin/orders/:id/). */
export const COMMAND_PATHS = {
  confirm: 'confirm',
  hold: 'hold',
  release: 'release',
  cancel: 'cancel',
  approveCancelRequest: 'cancel-request/approve',
  refuseCancelRequest: 'cancel-request/refuse',
  cancelAfterBooking: 'cancel-after-booking',
  courierCancel: 'courier-cancel',
  flags: 'flags',
  notes: 'notes',
  // PR 142: the team's edit (the full dialog, and "Correct phone")
  edit: 'edit',
} as const;
export type CommandId = keyof typeof COMMAND_PATHS;

/** The refusals the screens have their own words for; anything else is `other`. */
export const KNOWN_ERRORS = [
  'STALE',
  'ILLEGAL_TRANSITION',
  'BOOKED',
  'NOT_BOOKED',
  'CANCEL_PENDING',
  'NO_CANCEL_PENDING',
  'CANCEL_REQUESTED',
  'NO_CANCEL_REQUEST',
  'IN_REVIEW',
  'ADVANCE_SHORT',
  'REASON_REQUIRED',
  'INVALID_INPUT',
  'NOT_FOUND',
  'NOT_MERGEABLE',
  'IDEMPOTENCY_MISMATCH',
  'NOTHING_CHANGED',
  'BAD_PHONE',
  'NOT_SAME_PIECE',
  'PRICE_DIFFERS',
  'OFFER_ON_ORDER',
  'LAST_LINE',
  'OUT_OF_STOCK',
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'network',
] as const;

/** The message key of a refusal. */
export function errorKey(code: string): string {
  return (KNOWN_ERRORS as readonly string[]).includes(code) ? `orders.err.${code}` : 'orders.err.other';
}

export type CommandAnswer = { ok: true; body: Record<string, unknown> } | { ok: false; code: string; status: number };

/** A fresh idempotency key (one per dialog: a retry of the same dialog sends the same key). */
export function newKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The address of a command (or a review decision, or the merge). */
export const commandUrl = (orderId: string, id: CommandId) => `/api/admin/orders/${orderId}/${COMMAND_PATHS[id]}`;
export const reviewUrl = (alertId: string) => `/api/admin/orders/reviews/${alertId}`;

/** POSTs one command; never throws (a lost connection is the `network` refusal). */
export async function send(url: string, body: Record<string, unknown>, key: string, fetchImpl: typeof fetch = fetch): Promise<CommandAnswer> {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && json.ok === true) return { ok: true, body: json };
    return { ok: false, code: typeof json.error === 'string' ? json.error : 'other', status: res.status };
  } catch {
    return { ok: false, code: 'network', status: 0 };
  }
}

/** The refund requests a command recorded (a paid order's cancel: requests only, no money moved). */
export function refundRequestsOf(answer: CommandAnswer): number {
  if (!answer.ok) return 0;
  const r = answer.body.result as { refundRequestIds?: unknown } | undefined;
  return Array.isArray(r?.refundRequestIds) ? r.refundRequestIds.length : 0;
}
