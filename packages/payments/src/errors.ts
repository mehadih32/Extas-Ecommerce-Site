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
  | 'CONFIRM_REQUIRED';

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
        return 409;
      default:
        return 422;
    }
  }
}

export const isPaymentsError = (e: unknown): e is PaymentsError => e instanceof PaymentsError;
