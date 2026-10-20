// One error type for every refusal of the combos package. The `code` is stable: the admin API sends it and the admin
// screens turn it into text from their messages file; the package itself writes no visible text. `details` name the
// fields or the issues (`CODE@position`).
export type CombosErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  /** A combo link (slug) or a rule key is already used in this store. */
  | 'SLUG_TAKEN'
  /** Saved over by someone else since it was opened (version check). */
  | 'STALE'
  /** Setting or changing a price is the owner's decision (CLAUDE.md rule 6): it needs `combos.prices`. */
  | 'OWNER_OK_REQUIRED'
  /** It cannot go on sale as it is: details name every reason (NO_PRICE, NO_PIECES, NO_PAIRS, PIECE_NO_PRICE@n …). */
  | 'NOT_READY'
  /** A rule's key cannot change: its link is shared. */
  | 'KEY_FIXED'
  /** A set that cannot go in the bag as picked: details are the validation issues (PR 101). */
  | 'SET_INVALID'
  /** The bag is not there, not this store's or no longer open. */
  | 'CART_NOT_OPEN'
  /** A piece has no photo in its colour, so the set photo cannot be made (details: the positions). */
  | 'NO_PIECE_PHOTO'
  /** The set photo needs the storage adapter, which the caller did not pass. */
  | 'NO_STORAGE';

export class CombosError extends Error {
  readonly code: CombosErrorCode;
  readonly details: string[];

  constructor(code: CombosErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'CombosError';
    this.code = code;
    this.details = details;
  }

  /** HTTP status for the admin API. */
  get status(): number {
    switch (this.code) {
      case 'NOT_FOUND':
        return 404;
      case 'OWNER_OK_REQUIRED':
        return 403;
      case 'SLUG_TAKEN':
      case 'STALE':
      case 'NOT_READY':
      case 'KEY_FIXED':
      case 'SET_INVALID':
      case 'CART_NOT_OPEN':
      case 'NO_PIECE_PHOTO':
        return 409;
      case 'NO_STORAGE':
        return 503;
      default:
        return 400;
    }
  }
}

export const isCombosError = (e: unknown): e is CombosError => e instanceof CombosError;
