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
  | 'RATE_LIMITED'
  /** PR 555: the full saved address needs a login or a confirmed one-time code; a bare number opens the area only. */
  | 'PROOF_REQUIRED'
  /** PR 502: a place of that name is already under the same parent (details: its id). */
  | 'DUPLICATE_PLACE'
  /** PR 502: only two places of the same level are merged (two spellings of one place). */
  | 'LEVEL_MISMATCH'
  /** PR 502: the two places sit in different bands on the owner's list; move one first, then merge. */
  | 'BAND_CONFLICT';

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
      case 'DUPLICATE_PLACE':
      case 'LEVEL_MISMATCH':
      case 'BAND_CONFLICT':
        return 409;
      case 'RATE_LIMITED':
        return 429;
      case 'PROOF_REQUIRED':
        return 403;
      default:
        return 400;
    }
  }
}

export const isDeliveryError = (e: unknown): e is DeliveryError => e instanceof DeliveryError;
