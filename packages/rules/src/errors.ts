// One error type for every refusal of the rules package. The `code` is stable: the admin API sends it and the admin
// screens turn it into text from their messages file; the package itself writes no visible text.
export type RulesErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  /** A rule or notice key is already used in this store. */
  | 'KEY_TAKEN'
  /** The rule cannot go live as it is: details name every blocking issue (`CODE@where:subject`). */
  | 'RULE_INCOMPLETE'
  /** The change moves money (a charge, a price, a discount, COD): it needs the owner's OK (CLAUDE.md rule 6). */
  | 'OWNER_OK_REQUIRED'
  /** A live rule cannot be archived: pause it first. */
  | 'RULE_ACTIVE'
  /** The rule is archived: restore it first. */
  | 'RULE_ARCHIVED'
  /** There is no saved draft to publish or discard. */
  | 'NOTHING_TO_PUBLISH'
  /** The draft was saved over by someone else since it was opened (version check). */
  | 'STALE_DRAFT'
  /** The key or kind of a rule cannot change (texts elsewhere quote it by key). */
  | 'KEY_FIXED'
  /** The notice cannot be switched on: details name every reason (an arrival pop-up, no frequency cap …). */
  | 'NOTICE_INVALID'
  /** A coupon code that does not match `rules.coupons.codePattern`. */
  | 'COUPON_CODE_INVALID'
  /** The coupon's rule is not a discount rule that asks for a coupon. */
  | 'COUPON_RULE_INVALID'
  /** The coupon cannot be used now (details: OFF, NOT_STARTED, ENDED, USED_UP, PER_CUSTOMER, MEMBERS_ONLY, GUESTS_ONLY, RULE_NOT_LIVE, UNKNOWN). */
  | 'COUPON_NOT_USABLE'
  /** The conflict cannot be fixed automatically (not a text drift, or the text no longer has the stale number). */
  | 'CANNOT_FIX'
  /** Eid order-by dates cannot be on as they are: details name every reason (no Eid day, no date, a date after Eid …). */
  | 'EID_INVALID';

export class RulesError extends Error {
  readonly code: RulesErrorCode;
  readonly details: string[];

  constructor(code: RulesErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'RulesError';
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
      case 'CONFLICT':
      case 'KEY_TAKEN':
      case 'RULE_INCOMPLETE':
      case 'RULE_ACTIVE':
      case 'RULE_ARCHIVED':
      case 'NOTHING_TO_PUBLISH':
      case 'STALE_DRAFT':
      case 'KEY_FIXED':
      case 'NOTICE_INVALID':
      case 'COUPON_NOT_USABLE':
      case 'CANNOT_FIX':
      case 'EID_INVALID':
        return 409;
      default:
        return 400;
    }
  }
}

export const isRulesError = (e: unknown): e is RulesError => e instanceof RulesError;
