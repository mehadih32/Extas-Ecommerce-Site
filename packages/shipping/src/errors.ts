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
  | 'NOT_ACTIVE';

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
        return 422;
      default:
        return 409;
    }
  }
}

export const isShippingError = (e: unknown): e is ShippingError => e instanceof ShippingError;
