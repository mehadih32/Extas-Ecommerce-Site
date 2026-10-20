// One error type for every refusal of the catalogue package. The `code` is stable: the admin API sends it and the admin
// screens (PR 21) turn it into text from their messages file; the package itself writes no visible text.
export type CatalogueErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  /** The SKU belongs to another variant (the ERP SKU is the key: one SKU, one variant, PR 19). */
  | 'SKU_TAKEN'
  /** The SKU belonged to a retired variant: a retired SKU is never reused for another garment (Bhandari B02). */
  | 'SKU_RETIRED'
  /** The SKU does not match the `catalogue.skuPattern` setting. */
  | 'SKU_FORMAT'
  /** The product already has a variant in that colour and size. */
  | 'VARIANT_EXISTS'
  /** The link (slug) is used by another product, category or an old link that forwards elsewhere. */
  | 'SLUG_TAKEN'
  /** The category link is one of `catalogue.reservedSlugs`. */
  | 'SLUG_RESERVED'
  /** Moving the category would put it inside itself. */
  | 'CATEGORY_CYCLE'
  /** The tree would be deeper than `catalogue.categoryMaxDepth`. */
  | 'CATEGORY_TOO_DEEP'
  /** A category with live sub-categories or products cannot be archived; move them first. */
  | 'CATEGORY_NOT_EMPTY'
  /** The parent (category, garment type …) is archived. */
  | 'PARENT_ARCHIVED'
  /** A colour still used by a live variant cannot be archived or taken off the product. */
  | 'COLOUR_IN_USE'
  /** A colour name or synonym already names another colour in the dictionary. */
  | 'NAME_TAKEN'
  /** A referenced value is not in its dictionary (colour family, fibre, care instruction …). */
  | 'UNKNOWN_KEY'
  /** The bulk change differs from the preview the person saw (someone changed a product meanwhile). */
  | 'PREVIEW_CHANGED'
  /** More changes than `naming.bulkMaxChanges` in one go. */
  | 'TOO_MANY_CHANGES'
  /** The publish checklist has blocking items left (PR 26, 35): details name the failing checks. */
  | 'CHECKLIST_FAILED'
  /** A size chart still set as a category's default or a product's own chart cannot be archived (PR 28). */
  | 'CHART_IN_USE'
  /** The chart's garment type is not the category's or product's (PR 27). */
  | 'GARMENT_TYPE_MISMATCH'
  /** The CSV file cannot be read: no header, a missing key column, too big, too many rows (PR 34). */
  | 'CSV_INVALID'
  /** Setting a price needs the `catalogue.prices` permission (CLAUDE.md rule 6). */
  | 'PRICES_NOT_ALLOWED';

export class CatalogueError extends Error {
  readonly code: CatalogueErrorCode;
  readonly details: string[];

  constructor(code: CatalogueErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'CatalogueError';
    this.code = code;
    this.details = details;
  }

  /** HTTP status for the admin API. */
  get status(): number {
    switch (this.code) {
      case 'NOT_FOUND':
        return 404;
      case 'CONFLICT':
      case 'SKU_TAKEN':
      case 'SKU_RETIRED':
      case 'VARIANT_EXISTS':
      case 'SLUG_TAKEN':
      case 'CATEGORY_NOT_EMPTY':
      case 'COLOUR_IN_USE':
      case 'NAME_TAKEN':
      case 'PREVIEW_CHANGED':
      case 'CHECKLIST_FAILED':
      case 'CHART_IN_USE':
        return 409;
      case 'PRICES_NOT_ALLOWED':
        return 403;
      default:
        return 400;
    }
  }
}

export const isCatalogueError = (e: unknown): e is CatalogueError => e instanceof CatalogueError;
