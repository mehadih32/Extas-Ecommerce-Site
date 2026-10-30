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
  | 'PRICES_NOT_ALLOWED'
  /** Import from a link is switched off in this store (`catalogue.linkImport.enabled`, PR 33). */
  | 'LINK_IMPORT_OFF'
  /** The link's site is not in `catalogue.linkImport.allowedHosts`, or it is not a plain http(s) address (PR 33). */
  | 'HOST_NOT_ALLOWED'
  /** The page could not be read: details carry the reader's reason (TIMEOUT, TOO_BIG, NOT_HTML, BLOCKED_ADDRESS …). */
  | 'PAGE_UNREADABLE'
  /** "Tell me when it is back" is switched off, or the channel is not offered (PR 36). */
  | 'INTEREST_OFF'
  /** The product can be bought now: there is nothing to wait for (PR 36). */
  | 'NOT_OUT_OF_STOCK'
  /** Too many requests from one phone or e-mail today (`catalogue.ghost.interest.maxPerContactPerDay`). */
  | 'TOO_MANY_REQUESTS'
  /** Writing reviews is switched off in this store (`reviews.submit.enabled`, PR 65). */
  | 'REVIEWS_OFF'
  /** Only a delivered order can be reviewed (`reviews.submit.onlyDelivered`, PR 65). */
  | 'NOT_DELIVERED'
  /** The time for reviewing that order has passed (`reviews.submit.withinDays`, PR 65). */
  | 'TOO_LATE'
  /** PR 609: the price is below the lowest margin over the buying price (`catalogue.floor.minMarginPercent`). */
  | 'BELOW_FLOOR';

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
      case 'NOT_OUT_OF_STOCK':
      case 'BELOW_FLOOR':
        return 409;
      case 'PRICES_NOT_ALLOWED':
      case 'LINK_IMPORT_OFF':
      case 'INTEREST_OFF':
      case 'REVIEWS_OFF':
      case 'NOT_DELIVERED':
      case 'TOO_LATE':
        return 403;
      case 'PAGE_UNREADABLE':
        // Not 502: the proxy in front would show its own error page instead of the answer.
        return 422;
      case 'TOO_MANY_REQUESTS':
        return 429;
      default:
        return 400;
    }
  }
}

export const isCatalogueError = (e: unknown): e is CatalogueError => e instanceof CatalogueError;
