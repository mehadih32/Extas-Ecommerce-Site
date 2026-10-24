// PR 185 (S08; Blueprint B1.8) — the exchange engine without a database: the four replacement tiers, the window, the
// per-item limit and the money box. The service (exchange.ts) reads the facts and the owner's settings and asks these
// functions, so the rule is written once and tested on every edge.
//
// Tiers, strictly in order (the customer cannot skip one): 1 the same product and colour in the needed size, 2 the
// same product in other colours, 3 the same category in that size (the same collection first), 4 other categories —
// only when the category has nothing. "The needed size" is the same measurement: the same size key. The first enabled
// tier with a piece in stock is the only one offered. A piece in an excluded category is never offered.
//
// The money box: a dearer piece → the difference plus the exchange delivery charge are collected as Cash on Delivery on
// the linked exchange order; a cheaper piece → the difference is a wallet credit (a REQUEST, recorded only after the old
// piece passes QC), the charge is still collected; the same price → the charge only; our mistake (defect, damage, wrong
// item) → nothing to pay. Nothing here moves money.

/** Why a customer may exchange (the Smart Rules exchange rule uses the same codes). No colour change, no "didn't like it". */
export const EXCHANGE_REASON_CODES = ['size', 'defect', 'damage', 'wrong'] as const;
export type ExchangeReason = (typeof EXCHANGE_REASON_CODES)[number];

/** Our mistake: the exchange is free (B1.8) and never counts against the customer. */
export const OUR_MISTAKE_REASONS: ReadonlySet<ExchangeReason> = new Set(['defect', 'damage', 'wrong']);
export const isOurMistake = (r: ExchangeReason): boolean => OUR_MISTAKE_REASONS.has(r);

export type ExchangeTier = 1 | 2 | 3 | 4;
export const EXCHANGE_TIERS: readonly ExchangeTier[] = [1, 2, 3, 4];

export interface TierSettings {
  sameColour: boolean;
  otherColours: boolean;
  sameCategory: boolean;
  collectionFirst: boolean;
  otherCategories: boolean;
  maxOptions: number;
}

/** The piece coming back, as the tiers read it. */
export interface OriginalPiece {
  productId: string;
  colourId: string | null;
  categoryIds: readonly string[];
  collectionIds: readonly string[];
}

/** A piece that might go out instead. */
export interface Candidate {
  variantId: string;
  productId: string;
  colourId: string | null;
  sizeKey: string | null;
  categoryIds: readonly string[];
  collectionIds: readonly string[];
  /** Pieces that can be sold now. */
  sellable: number;
  /** In a category the exchange policy excludes. */
  excluded: boolean;
  sortOrder?: number;
}

/** Which tier a candidate is in for this original piece. */
export function tierOf(o: OriginalPiece, c: Pick<Candidate, 'productId' | 'colourId' | 'categoryIds'>): ExchangeTier {
  if (c.productId === o.productId) return c.colourId === o.colourId ? 1 : 2;
  return c.categoryIds.some((x) => o.categoryIds.includes(x)) ? 3 : 4;
}

const tierOn = (cfg: TierSettings, t: ExchangeTier) => (t === 1 ? cfg.sameColour : t === 2 ? cfg.otherColours : t === 3 ? cfg.sameCategory : cfg.otherCategories);

export interface TierOffer<C extends Candidate = Candidate> {
  /** The tier offered (null: nothing in any enabled tier). */
  tier: ExchangeTier | null;
  options: C[];
}

/**
 * The pieces offered for one original piece in the needed size: the first enabled tier with stock, capped. Tier 3 lists
 * the pieces that share a collection with the original first when the owner says so.
 */
export function exchangeOffer<C extends Candidate>(cfg: TierSettings, o: OriginalPiece, neededSizeKey: string | null, quantity: number, candidates: readonly C[]): TierOffer<C> {
  const fit = candidates.filter((c) => !c.excluded && c.sellable >= quantity && c.sizeKey === neededSizeKey);
  for (const t of EXCHANGE_TIERS) {
    if (!tierOn(cfg, t)) continue;
    const here = fit.filter((c) => tierOf(o, c) === t);
    if (!here.length) continue;
    const shares = (c: C) => (c.collectionIds.some((x) => o.collectionIds.includes(x)) ? 0 : 1);
    const sorted = [...here].sort((a, b) => (t === 3 && cfg.collectionFirst ? shares(a) - shares(b) : 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.variantId.localeCompare(b.variantId));
    return { tier: t, options: sorted.slice(0, cfg.maxOptions) };
  }
  return { tier: null, options: [] };
}

// ---------------------------------------------------------------------------------------------------------------------
// The window: hours from the courier's delivered mark (never a hard-coded number; the rule or the policy setting)
// ---------------------------------------------------------------------------------------------------------------------

export type ExchangeWindow = { state: 'OPEN'; endsAt: Date; hoursLeft: number } | { state: 'CLOSED'; endsAt: Date } | { state: 'UNKNOWN' };

/** Open until `windowHours` after delivery; UNKNOWN when the delivered mark is missing (a person checks the courier). */
export function exchangeWindow(deliveredAt: Date | null, windowHours: number, now: Date): ExchangeWindow {
  if (!deliveredAt) return { state: 'UNKNOWN' };
  const endsAt = new Date(deliveredAt.getTime() + windowHours * 3_600_000);
  const left = endsAt.getTime() - now.getTime();
  return left > 0 ? { state: 'OPEN', endsAt, hoursLeft: Math.ceil(left / 3_600_000) } : { state: 'CLOSED', endsAt };
}

/** Exchanges per item: null = no limit. */
export const perItemLeft = (limit: number | null, used: number): number | null => (limit === null ? null : Math.max(0, limit - used));

// ---------------------------------------------------------------------------------------------------------------------
// The money box
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Who pays the exchange delivery charge, and why (PR 185, 190): SET — the customer, for his own size choice; NOT_SET —
 * no charge figure yet (nothing is collected; the owner types it in); FREE_OUR_MISTAKE; WAIVED — staff, with a logged
 * reason; CLAIM_ACCEPTED — his "your mistake" claim approved; ONE_TRIP — the one-trip swap's own price; STORE — the
 * owner's rule says the shop pays.
 */
export const CHARGE_STATES = ['SET', 'NOT_SET', 'FREE_OUR_MISTAKE', 'WAIVED', 'CLAIM_ACCEPTED', 'ONE_TRIP', 'STORE'] as const;
export type ChargeState = (typeof CHARGE_STATES)[number];

export interface SwapLine {
  oldUnitMinor: number;
  newUnitMinor: number;
  quantity: number;
}

export interface ChargeFacts {
  ourMistake: boolean;
  /** The exchange delivery charge for the order's band (null: not set). */
  chargeMinor: number | null;
}

export interface MoneyBox {
  /** Σ (new − old) × quantity: positive when the new pieces cost more. */
  differenceMinor: number;
  /** What the dearer pieces add (collected as Cash on Delivery). */
  owedMinor: number;
  /** What the cheaper pieces leave over (a wallet credit after QC). */
  creditMinor: number;
  /** The delivery charge the customer pays. */
  chargeMinor: number;
  chargeState: ChargeState;
  /** What the rider collects at the door for the new parcel. */
  codMinor: number;
  /** What the old pieces count for on the new order (never more than the new pieces; all of them for our mistake). */
  coveredMinor: number;
}

/**
 * The money box of an exchange, piece by piece (no netting between pieces): each dearer piece adds its difference to
 * what is collected, each cheaper piece adds its difference to the wallet credit.
 */
export function moneyBox(lines: readonly SwapLine[], c: ChargeFacts): MoneyBox {
  for (const l of lines) if (![l.oldUnitMinor, l.newUnitMinor, l.quantity].every((n) => Number.isInteger(n) && n >= 0)) throw new Error('money box: amounts and quantities are whole and not negative');
  const sum = (f: (l: SwapLine) => number) => lines.reduce((s, l) => s + f(l) * l.quantity, 0);
  const differenceMinor = sum((l) => l.newUnitMinor - l.oldUnitMinor);
  const creditMinor = sum((l) => Math.max(0, l.oldUnitMinor - l.newUnitMinor));
  if (c.ourMistake) return { differenceMinor, owedMinor: 0, creditMinor, chargeMinor: 0, chargeState: 'FREE_OUR_MISTAKE', codMinor: 0, coveredMinor: sum((l) => l.newUnitMinor) }; // hardcode-ok: our mistake is free, nothing is collected (a neutral zero)
  const owedMinor = sum((l) => Math.max(0, l.newUnitMinor - l.oldUnitMinor));
  const chargeState: ChargeState = c.chargeMinor === null ? 'NOT_SET' : 'SET';
  const chargeMinor = c.chargeMinor ?? 0;
  return { differenceMinor, owedMinor, creditMinor, chargeMinor, chargeState, codMinor: owedMinor + chargeMinor, coveredMinor: sum((l) => Math.min(l.oldUnitMinor, l.newUnitMinor)) };
}

/** What one swapped piece puts on the new order: its price, what the old piece covers, and the rest (owed). */
export function lineOnNewOrder(l: SwapLine, ourMistake: boolean): { unitPriceMinor: number; discountMinor: number; lineTotalMinor: number } {
  const gross = l.newUnitMinor * l.quantity;
  const covered = ourMistake ? gross : Math.min(l.oldUnitMinor, l.newUnitMinor) * l.quantity;
  return { unitPriceMinor: l.newUnitMinor, discountMinor: covered, lineTotalMinor: gross - covered };
}
