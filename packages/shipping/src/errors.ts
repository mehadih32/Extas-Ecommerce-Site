// One error type for every refusal of the shipping service. The `code` is stable; the admin turns it into words from
// its messages files. `data` carries what a screen needs with the refusal.
export type ShippingErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  /** A courier account of that provider and name exists already. */
  | 'DUPLICATE'
  /** No courier adapter has that provider key. */
  | 'UNKNOWN_PROVIDER'
  /** The courier account is switched off or archived: nothing is booked with it. */
  | 'COURIER_OFF'
  /** The parcel is not in a state this action applies to (`data.status`). */
  | 'NOT_ACTIVE'
  /** PR 176: only a failed booking, or one whose answer was lost, is tried again (`data.status`). */
  | 'NOT_RETRYABLE'
  /** PR 176 (SIM-F-007): a gift to be delivered on or after a day is not booked before its booking day (`data.bookFrom`). */
  | 'GIFT_DATE'
  /** PR 176: the order has no receiver name, mobile number or address the courier can use (`details`). */
  | 'NO_RECEIVER'
  /** PR 176: more orders in one press than the owner's "per press" (`data.max`). */
  | 'TOO_MANY'
  /** PR 554: this courier publishes no place list (Steadfast reads the address itself): nothing to sync. */
  | 'NO_ZONE_LIST'
  /** PR 179: a sticker cannot be printed now — not booked, picked up already, its COD or receiver changed (`data.refused`). */
  | 'NOT_PRINTABLE';

export class ShippingError extends Error {
  readonly code: ShippingErrorCode;
  readonly details: string[];
  readonly data: Record<string, unknown> | undefined;

  constructor(code: ShippingErrorCode, message: string, details: string[] = [], data?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = 'ShippingError';
    this.code = code;
    this.details = details;
    this.data = data;
  }

  /** HTTP status for the APIs (§7.1: 400 validation, 404, 409 state conflicts, 422 business rule). */
  get status(): number {
    switch (this.code) {
      case 'INVALID_INPUT':
      case 'UNKNOWN_PROVIDER':
        return 400;
      case 'NOT_FOUND':
        return 404;
      case 'COURIER_OFF':
      case 'GIFT_DATE':
      case 'NO_RECEIVER':
      case 'TOO_MANY':
      case 'NO_ZONE_LIST':
        return 422;
      default:
        return 409;
    }
  }
}

export const isShippingError = (e: unknown): e is ShippingError => e instanceof ShippingError;
