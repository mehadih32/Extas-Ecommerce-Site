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
  /** CN-029 §16: in contract v6 this ERP company is already linked to another store (one store = one ERP company). */
  | 'SHARED_COMPANY'
  /** The ERP call failed after its tries (PR 194); details carry the ERP error code. */
  | 'ERP_ERROR'
  /** Not enough free pieces in the shared pool for a hold (PR 197/198); details name each short SKU and what is free. */
  | 'OUT_OF_STOCK'
  /** The same idempotency key came with a different document (PR 200): a changed document needs its own key. */
  | 'IDEMPOTENCY_MISMATCH'
  /** A stock count line differs and has no reason yet (PR 203); details name the lines. */
  | 'REASON_REQUIRED'
  /** The location already has a stock count going on (PR 203). */
  | 'AUDIT_OPEN'
  /** The order has an open packing card (a shortage, follow-up 16): a person decides it before booking. */
  | 'SHORTAGE_OPEN'
  /** PR 609: the practice ERP's data is never saved as real products (import by style code). */
  | 'ERP_ON_PRACTICE'
  /** PR 609: the style has colours the shop's colour list does not know; details name them (add them first). */
  | 'COLOUR_MISSING'
  /** PR 609: the ERP has no SKU of this style the shop can import. */
  | 'NOTHING_TO_IMPORT'
  /** PR 609 (qa-gate): import by style code needs the store on ERP contract v6 (register row 609). */
  | 'ERP_V5'
  /** PR 609 (qa-gate): SKUs of the style sit in products the import may not take over; details name the SKUs. */
  | 'SKU_IN_OTHER_PRODUCT'
  /** PR 609 (qa-gate): rows the shop cannot take as the ERP sent them; details name the SKU and why. */
  | 'ROW_NOT_ACCEPTED'
  /** CN-028 · PR 617, 618: the store's books with the ERP start at the switch-over (contract v6 and its own ERP link). */
  | 'BOOKS_NOT_LINKED'
  /** CN-028 · PR 618: the day or month is no longer open in the books (past `books.resend.days`, or its month closed). */
  | 'BOOKS_DAY_CLOSED';

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
      case 'SHARED_COMPANY':
      case 'OUT_OF_STOCK':
      case 'IDEMPOTENCY_MISMATCH':
      case 'REASON_REQUIRED':
      case 'AUDIT_OPEN':
      case 'SHORTAGE_OPEN':
      case 'ERP_ON_PRACTICE':
      case 'COLOUR_MISSING':
      case 'NOTHING_TO_IMPORT':
      case 'ERP_V5':
      case 'SKU_IN_OTHER_PRODUCT':
      case 'ROW_NOT_ACCEPTED':
      case 'BOOKS_NOT_LINKED':
      case 'BOOKS_DAY_CLOSED':
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
