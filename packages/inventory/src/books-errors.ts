// CN-028 · PR 615, 616 — one error type for every refusal of Retail's ERP account, the pipeline stock and the books
// match. The `code` is stable: the admin API sends it and the Money → Books pages turn it into words from their own
// messages file (`books.err.<code>`); the package itself writes no visible text. (Kept apart from InventoryError so the
// five Phase 1 lanes never edit one shared list of codes.)
export type BooksErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  /** The store does not speak ERP contract v6 yet (`erp.model` is v5): the books start at the switch. */
  | 'NOT_V6'
  /** The store has no ERP link of its own yet (it opens with the first pull). */
  | 'NO_LINK'
  /** Already done, once and for good (an opening balance, a reversal of a record). */
  | 'ALREADY'
  | 'CONFLICT'
  // ---- PR 616 ----
  /** This difference is not fixed by a correction (a tie, a summary or a moved history is found again from the books). */
  | 'NOT_ADJUSTABLE'
  /** A month closes only when every day matched (`books.close.requireMatched`): `details` names the days. */
  | 'NOT_MATCHED'
  /** A month closes only with its fixed costs in. */
  | 'FIXED_COSTS_MISSING'
  /** The month (or year) has not ended yet. */
  | 'MONTH_NOT_ENDED'
  /** No day of the books falls in that month (or year): there is nothing to close. */
  | 'NOTHING_TO_CLOSE'
  /** qa-gate: a run of the books is going on for this store (one at a time); try again in a few minutes. */
  | 'BUSY';

export class BooksError extends Error {
  readonly code: BooksErrorCode;
  readonly details: string[];

  constructor(code: BooksErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'BooksError';
    this.code = code;
    this.details = details;
  }

  /** HTTP status for the admin API. */
  get status(): number {
    switch (this.code) {
      case 'NOT_FOUND':
        return 404;
      case 'NOT_V6':
      case 'NO_LINK':
      case 'ALREADY':
      case 'CONFLICT':
      case 'NOT_ADJUSTABLE':
      case 'NOT_MATCHED':
      case 'FIXED_COSTS_MISSING':
      case 'MONTH_NOT_ENDED':
      case 'NOTHING_TO_CLOSE':
      case 'BUSY':
        return 409;
      default:
        return 400;
    }
  }
}

export const isBooksError = (e: unknown): e is BooksError => e instanceof BooksError;
