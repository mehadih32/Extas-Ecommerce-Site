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
  | 'CONFLICT';

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
        return 409;
      default:
        return 400;
    }
  }
}

export const isBooksError = (e: unknown): e is BooksError => e instanceof BooksError;
