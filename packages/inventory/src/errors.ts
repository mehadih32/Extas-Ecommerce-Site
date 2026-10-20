// One error type for every refusal of the inventory package. The `code` is stable: the admin API sends it and the
// admin screens turn it into text from their messages file; the package itself writes no visible text.
export type InventoryErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  /** A warehouse or location code is already used (warehouse codes are unique; location codes per warehouse). */
  | 'CODE_TAKEN'
  /** Another warehouse is already linked to this ERP warehouse. */
  | 'ERP_WAREHOUSE_TAKEN'
  /** A location (or a warehouse's locations) still holds stock: it cannot be archived or change kind. */
  | 'LOCATION_HAS_STOCK'
  /** The last damaged bin of a warehouse cannot be archived or turned into another kind (PR 201). */
  | 'DAMAGED_BIN_REQUIRED'
  /** The warehouse is archived. */
  | 'PARENT_ARCHIVED'
  /** The store's ERP mode is "no ERP" (PR 499): the action needs an ERP. */
  | 'ERP_NOT_CONNECTED'
  /** An ERP is chosen but cannot be used: its connection is gone or no adapter for it exists in code (PR 499). */
  | 'ERP_UNAVAILABLE'
  /** The key belongs to another ERP company than the one this store is mapped to (PR 196): nothing is synced. */
  | 'COMPANY_MISMATCH'
  /** The ERP call failed after its tries (PR 194); details carry the ERP error code. */
  | 'ERP_ERROR';

export class InventoryError extends Error {
  readonly code: InventoryErrorCode;
  readonly details: string[];

  constructor(code: InventoryErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'InventoryError';
    this.code = code;
    this.details = details;
  }

  /** HTTP status for the admin API. */
  get status(): number {
    switch (this.code) {
      case 'NOT_FOUND':
        return 404;
      case 'CONFLICT':
      case 'CODE_TAKEN':
      case 'ERP_WAREHOUSE_TAKEN':
      case 'LOCATION_HAS_STOCK':
      case 'DAMAGED_BIN_REQUIRED':
      case 'ERP_NOT_CONNECTED':
      case 'COMPANY_MISMATCH':
        return 409;
      case 'ERP_UNAVAILABLE':
      case 'ERP_ERROR':
        return 502;
      default:
        return 400;
    }
  }
}

export const isInventoryError = (e: unknown): e is InventoryError => e instanceof InventoryError;
