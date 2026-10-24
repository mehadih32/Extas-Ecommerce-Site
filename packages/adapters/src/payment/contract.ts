// PR 167 — the payment gateway contract (BACKEND-ARCHITECTURE §7.5), one shape for every gateway: bKash now, Nagad and
// the card/bank gateway later (PR 168, 169). The payments service (@extas/payments) talks only to this interface; which
// gateway runs is the owner's connection in "Keys & connections", and until its key is entered and its Test passes the
// gateway runs on its mock (A1.3).
//
// - `initiate`: a gateway session for one payment row (an order, an advance, an exchange difference). The payment's own
//   idempotency key is sent as the gateway's invoice/reference, so a repeat never makes a second session there.
// - `readCallback`: the cheap first look at a callback (the customer's browser coming back, or an IPN): the shop signs
//   its own callback address with the connection's key, so a forged or altered address is refused before any work.
//   What a callback *claims* is never trusted: `confirm` then asks the gateway itself (bKash: execute, then the status
//   query), and only that answer is written (§7.5 "never trust the redirect").
// - `query`: the gateway's answer for a session, to recover unknown outcomes (a timeout, a callback that never came;
//   PR 170's sweep).
// - Refunds: PR 172 records refunds that a person pays out by hand (bKash send-money, a bank transfer) after the owner's
//   approval, so no `refund` call is here and nothing in the shop can move money out; a gateway's own refund API joins
//   behind the owner's approval later (PROGRESS follow-up 421). Statements (`fetchStatement`, PR 174) join with theirs.
// - Card data never touches the shop: every gateway is a hosted page.
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface InitiateInput {
  /** Our Payment row's id; it comes back in the signed callback address. */
  paymentId: string;
  /** The payment's idempotency key: the gateway's invoice number, so a repeat is the same session. */
  idempotencyKey: string;
  /** The order's number, shown to the customer on the gateway's page. */
  orderNumber: string;
  amountMinor: number;
  currency: string;
  /** Who pays, as the gateway shows it (the customer's phone or the order number); never a secret. */
  payerReference: string;
  /** Our callback address for this gateway, without its query (the adapter adds the signed `pid` and `sig`). */
  callbackBaseUrl: string;
}

export interface InitiateResult {
  /** The gateway's id of the session (bKash `paymentID`). */
  providerRef: string;
  /** Where the customer's browser goes to pay. */
  redirectUrl: string;
  expiresAt: Date | null;
}

/** What a callback claims, as the gateway words it (bKash `status`). */
export type CallbackClaim = 'success' | 'failure' | 'cancel';

export interface CallbackInput {
  /** The callback's query parameters (and, for a POST, its form fields). */
  params: Record<string, string>;
}

export type CallbackRead =
  | { ok: true; paymentId: string; providerRef: string; claim: CallbackClaim; eventKey: string }
  | { ok: false; reason: 'missing' | 'malformed' | 'mismatch' };

export type GatewayState = 'PAID' | 'FAILED' | 'CANCELLED' | 'PENDING';

export interface GatewayOutcome {
  state: GatewayState;
  providerRef: string;
  /** The gateway's transaction id of the money (bKash `trxID`); null until paid. */
  providerTrxId: string | null;
  /** What the gateway says came in, in minor units; null when it does not say. */
  amountMinor: number | null;
  currency: string | null;
  /** The gateway's own code of a failure (bKash `statusCode`), for the payment row. */
  failureCode: string | null;
}

export interface PaymentGateway {
  readonly provider: string;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  readCallback(input: CallbackInput): CallbackRead;
  confirm(read: Extract<CallbackRead, { ok: true }>): Promise<GatewayOutcome>;
  query(providerRef: string): Promise<GatewayOutcome>;
}

export type PaymentGatewayErrorCode = 'NOT_CONFIGURED' | 'REJECTED' | 'UNREACHABLE' | 'BAD_ANSWER';

/** A gateway call that did not get an answer we can use; `retryable` says whether another try may help. */
export class PaymentGatewayError extends Error {
  readonly code: PaymentGatewayErrorCode;
  readonly retryable: boolean;
  constructor(code: PaymentGatewayErrorCode, message: string, retryable = false) {
    super(`${code}: ${message}`);
    this.name = 'PaymentGatewayError';
    this.code = code;
    this.retryable = retryable;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The signed callback address (shared by every gateway)
// ---------------------------------------------------------------------------------------------------------------------

const sigOf = (key: string, provider: string, paymentId: string) => createHmac('sha256', key).update(`${provider}:${paymentId}`).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Our callback address for one payment: `<base>?pid=<paymentId>&sig=<HMAC of provider:paymentId>`. */
export function signedCallbackUrl(key: string, provider: string, base: string, paymentId: string): string {
  const u = new URL(base);
  u.searchParams.set('pid', paymentId);
  u.searchParams.set('sig', sigOf(key, provider, paymentId));
  return u.toString();
}

/** Checks the `pid` and `sig` of a callback (constant time). */
export function checkCallbackSignature(key: string, provider: string, params: Record<string, string>): { ok: true; paymentId: string } | { ok: false; reason: 'missing' | 'malformed' | 'mismatch' } {
  const pid = params.pid;
  const sig = params.sig;
  if (!pid || !sig) return { ok: false, reason: 'missing' };
  if (!UUID.test(pid) || !/^[0-9a-f]{64}$/i.test(sig)) return { ok: false, reason: 'malformed' };
  const want = Buffer.from(sigOf(key, provider, pid), 'hex');
  const got = Buffer.from(sig, 'hex');
  return want.length === got.length && timingSafeEqual(want, got) ? { ok: true, paymentId: pid } : { ok: false, reason: 'mismatch' };
}

export const CALLBACK_CLAIMS: readonly CallbackClaim[] = ['success', 'failure', 'cancel'];
