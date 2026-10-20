// One error type for every refusal of the delivery package. The `code` is stable: the API sends it and the screens
// turn it into text from their messages file; the package itself writes no visible text.
export type DeliveryErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  /** Switching a band on needs its charge in the same change: a band never goes live on a charge nobody typed. */
  | 'CHARGE_REQUIRED'
  /** The sub-area mode belongs to the sub-area band only. */
  | 'MODE_NOT_ALLOWED'
  /** PR 553: a charge was asked for from something that is not a resolved gazetteer place or the customer's choice. */
  | 'UNRESOLVED'
  /** Too many phone look-ups from one place in a short time (PR 555). */
  | 'RATE_LIMITED';

export class DeliveryError extends Error {
  readonly code: DeliveryErrorCode;
  readonly details: string[];

  constructor(code: DeliveryErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'DeliveryError';
    this.code = code;
    this.details = details;
  }

  /** HTTP status for the API. */
  get status(): number {
    switch (this.code) {
      case 'NOT_FOUND':
        return 404;
      case 'CHARGE_REQUIRED':
      case 'MODE_NOT_ALLOWED':
      case 'UNRESOLVED':
        return 409;
      case 'RATE_LIMITED':
        return 429;
      default:
        return 400;
    }
  }
}

export const isDeliveryError = (e: unknown): e is DeliveryError => e instanceof DeliveryError;
