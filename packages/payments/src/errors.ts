// One error type for every refusal of the payments service. The `code` is stable; the admin and the shop turn it into
// words from their messages files. `data` carries what the screen needs with the refusal (the amount due, the payment).
export type PaymentsErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  /** A move the payment model does not allow (a closed payment opened again, a derived state set by hand). */
  | 'ILLEGAL_PAYMENT_MOVE'
  | 'DERIVED_STATE'
  /** The same idempotency key was sent with a different request. */
  | 'IDEMPOTENCY_MISMATCH'
  /** Recording money received outside the checkout is switched off (`payments.manual`), or this method is not on its list. */
  | 'MANUAL_OFF'
  | 'METHOD_NOT_ALLOWED'
  /** More than the order's amount due (`data.dueMinor`); nothing is recorded. */
  | 'OVER_DUE'
  /** Nothing is due on this order. */
  | 'NOTHING_DUE'
  /** This transaction reference is already recorded for another payment (`data.paymentId`). */
  | 'DUPLICATE_REFERENCE'
  /** The order is cancelled: money is not recorded against it here. */
  | 'ORDER_CLOSED'
  /** The person did not confirm the amount ([confirm], F-040). */
  | 'CONFIRM_REQUIRED'
  /** PR 166: the parcel already has its closing door outcome, or the line is already resolved (`data`: which one). */
  | 'ALREADY_RECORDED'
  /** PR 166: the door record is not waiting for a decision, or the line has nothing to resolve. */
  | 'NOT_PENDING'
  /** PR 170: the payment is not open any more (`data.status`). */
  | 'NOT_OPEN'
  /** PR 170: the practice gateway is switched off (`payments.testPayments`) and no real one is connected. */
  | 'TEST_PAYMENTS_OFF'
  /** PR 170: the payment gateway did not answer (try again later; nothing was charged by us). */
  | 'GATEWAY_ERROR'
  /** PR 171: changing a wallet by hand is switched off (`payments.wallet.manual`). */
  | 'WALLET_OFF'
  /** PR 171: the apology credit is switched off (`payments.wallet.apology`). */
  | 'APOLOGY_OFF'
  /** PR 171: a debit would take the wallet below zero (`data.balanceMinor`). */
  | 'INSUFFICIENT_BALANCE'
  /** PR 171: more than the owner's limit (`data.limitMinor`). */
  | 'OVER_LIMIT'
  /** PR 171: this entry is not put right by a reversal (money spent or refunded), or it was reversed already. */
  | 'NOT_REVERSIBLE'
  /** PR 171: the order has no customer, so there is no wallet. */
  | 'NO_CUSTOMER'
  /** PR 171: the wallet is not active (frozen or closed). */
  | 'WALLET_CLOSED'
  /** PR 171: the order did not come late enough for the owner's rule. */
  | 'NOT_LATE'
  /** PR 171: the owner has not set the amount this needs yet. */
  | 'NOT_CONFIGURED'
  /** PR 172: the owner's refund rules do not allow this refund (`data.rule`: AFTER_DELIVERY, ORDER_STATE, RTO_NOT_RETURNED). */
  | 'REFUND_NOT_ALLOWED'
  /** PR 172: more than is left to refund on this order (`data.roomMinor`). */
  | 'OVER_REFUNDABLE'
  /** PR 172 (four eyes): the person who asked this refund may not decide it. */
  | 'SAME_PERSON'
  /** PR 173: partial payment is switched off (`payments.partial`). */
  | 'PARTIAL_OFF'
  /** PR 173: more than the owner's cap on an advance (`data.capMinor`). */
  | 'OVER_CAP'
  /** PR 173: less than the smallest advance the owner set (`data.minMinor`). */
  | 'BELOW_MIN'
  /** PR 173: this order cannot take an advance (not Cash on Delivery, or past packing; `data.status`). */
  | 'ADVANCE_NOT_ALLOWED'
  /** PR 192: the owner's switch for this is off (`data.setting`: delivery.courier.claims, support.riderIssues …). */
  | 'FEATURE_OFF'
  /** PR 192: a rider issue needs at least one photo of proof (`support.riderIssues.proofRequired`). */
  | 'PROOF_REQUIRED'
  /** PR 192: the customer paid no more than the parcel asked (`data.dueMinor`): there is no extra to claim. */
  | 'NO_EXTRA'
  /** PR 192: this parcel already has an open claim of this kind, or an open rider issue (`data.id`). */
  | 'ALREADY_OPEN'
  /** PR 192: this parcel's records do not show it lost or damaged (`data.status`). */
  | 'NOT_CLAIMABLE'
  /** CN-018 (4): a Fixed set is kept or returned whole; this would split it (`data.sets`: the sets' names). */
  | 'SET_FIXED';

export class PaymentsError extends Error {
  readonly code: PaymentsErrorCode;
  readonly details: string[];
  readonly data: Record<string, unknown> | undefined;

  constructor(code: PaymentsErrorCode, message: string, details: string[] = [], data?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = 'PaymentsError';
    this.code = code;
    this.details = details;
    this.data = data;
  }

  /** HTTP status for the APIs (§7.1: 400 validation, 404, 409 conflicts, 422 business rule). */
  get status(): number {
    switch (this.code) {
      case 'INVALID_INPUT':
      case 'CONFIRM_REQUIRED':
        return 400;
      case 'NOT_FOUND':
        return 404;
      case 'ILLEGAL_PAYMENT_MOVE':
      case 'DERIVED_STATE':
      case 'IDEMPOTENCY_MISMATCH':
      case 'DUPLICATE_REFERENCE':
      case 'ALREADY_RECORDED':
      case 'NOT_PENDING':
      case 'NOT_OPEN':
      case 'TEST_PAYMENTS_OFF':
      case 'SAME_PERSON':
      case 'ALREADY_OPEN':
        return 409;
      case 'GATEWAY_ERROR':
        return 502;
      default:
        return 422;
    }
  }
}

export const isPaymentsError = (e: unknown): e is PaymentsError => e instanceof PaymentsError;
