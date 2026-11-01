// One error type for every refusal of the customers service. The `code` is stable; the admin turns it into words from
// its messages files (`cus.err.<code>`). `data` carries what a screen needs with the refusal (the survivor to merge into).
export type CustomersErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  /** PR 284: a profile cannot be merged with itself. */
  | 'SAME_PROFILE'
  /** PR 284: this profile was merged into another already (`data.survivorId`): merge with that one instead. */
  | 'ALREADY_MERGED'
  /** PR 284: other profiles are merged into this one (`data.members`): it can only be the one that stays. */
  | 'HAS_MERGED'
  /** PR 284: an erased or archived profile is never merged. */
  | 'NOT_ACTIVE'
  /** PR 284: the owner's merge rules ask for a short note. */
  | 'NOTE_REQUIRED'
  /** PR 284: this decision was undone already (`data.undoneAt`). */
  | 'ALREADY_UNDONE'
  /** PR 284: the profile moved on since this merge (merged again elsewhere): it is not this merge's to undo. */
  | 'MOVED_ON'
  /** PR 284: the same Idempotency-Key with a different request. */
  | 'KEY_REUSED'
  /** PR 382: erasure requests are switched off (`privacy.erasureRequests`). */
  | 'SWITCHED_OFF'
  /** PR 382: only the owner carries out an erasure. */
  | 'OWNER_ONLY'
  /** PR 382: the confirmation word was not typed exactly. */
  | 'CONFIRM_MISMATCH'
  /** PR 382: an order of the person is still on its way (`data.open`). */
  | 'OPEN_ORDERS'
  /** PR 382: a request for this person is waiting already (`data.requestId`). */
  | 'ALREADY_REQUESTED'
  /** PR 382: the request is done or cancelled (`data.status`). */
  | 'NOT_WAITING'
  /** PR 287: another live segment already has this name. */
  | 'NAME_TAKEN'
  /** PR 287: the store keeps the owner's most segments already, or a segment has the most conditions. */
  | 'LIMIT_REACHED'
  /** PR 287: someone saved this segment since the page was opened; reload it. */
  | 'STALE'
  /** PR 293: the AI writer did not answer, or gave nothing usable. */
  | 'AI_UNAVAILABLE';

export class CustomersError extends Error {
  readonly code: CustomersErrorCode;
  readonly details: string[];
  readonly data: Record<string, unknown> | undefined;

  constructor(code: CustomersErrorCode, message: string, details: string[] = [], data?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = 'CustomersError';
    this.code = code;
    this.details = details;
    this.data = data;
  }

  /** HTTP status for the APIs (§7.1: 400 validation, 404, 409 state conflicts, 422 business rule). */
  get status(): number {
    switch (this.code) {
      case 'INVALID_INPUT':
        return 400;
      case 'NOT_FOUND':
        return 404;
      case 'SAME_PROFILE':
      case 'NOTE_REQUIRED':
      case 'NOT_ACTIVE':
      case 'CONFIRM_MISMATCH':
      case 'OPEN_ORDERS':
      case 'LIMIT_REACHED':
        return 422;
      case 'AI_UNAVAILABLE':
        return 503;
      case 'OWNER_ONLY':
      case 'SWITCHED_OFF':
        return 403;
      default:
        return 409;
    }
  }
}

export const isCustomersError = (e: unknown): e is CustomersError => e instanceof CustomersError;
