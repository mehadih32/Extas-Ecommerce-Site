// S08 · PR 193 — what the storefront says about WHEN an order comes, from two owner switches (both off as shipped):
// Eid order-by dates (eid.ts, `rules.eid.*`, CN-014 g) and holiday mode (holiday.ts, `delivery.holiday`, B1.14).
// Read-only, no permission (the customer's own view), texts in the store's language or `locale`.
//
// - storefrontBanner: the shop-wide lines for home and bag — the Eid order-by chips (or, once every date passed, the
//   pre-order line) and the holiday notice.
// - checkoutEta: for one place (the band the address settled, and its gazetteer place for a district's own date) the
//   lines that REPLACE the usual hours promise — "ships from …" during the break, "may arrive after Eid" past the
//   place's date (SIM-F-019: never the normal promise then) — and the pre-order offer, which exists only while the
//   owner switched pre-order on with its advance (CN-018; `rules.approve`). The checkout takes that advance through its
//   existing advance path (PR 560), never a new way to take money.
// - PR 281 · festiveFor: the live festive Smart Rules' words for a place (festive.ts), only while Marketing › Festive
//   cut-off is on (`marketing.festiveCutoff`, off as shipped) and that place is ticked; checkoutEta adds, for the
//   settled band, the "after" words of a festive rule already past that band's time in place of the usual promise.
import { eidConfig, storefrontEid } from './eid-service';
import { eidStatus, lateLine, preorderLine, preorderOffer, type EidConfig } from './eid';
import { holidayNotice, holidayPromise, holidayStatus, type HolidayConfig } from './holiday';
import { nowOf, setting, textContext, type RulesDeps } from './context';
import { cachedActiveRules, othersByKey } from './core';
import { festiveLinesOf, type FestiveLine } from './festive';
import { scopeFacts } from './facts';
import { inScope, resolutionOrder } from './match';
import type { FestiveCutoffPlace } from '@extas/settings';
import type { TextContext } from './text';

type Deps = Pick<RulesDeps, 'db' | 'settings' | 'now'>;

/** The store's holiday setting as the engine reads it. */
export const holidayConfig = (deps: Pick<RulesDeps, 'settings'>, storeId: number): Promise<HolidayConfig> => setting(deps, storeId, 'delivery.holiday');

/** The shop-wide lines (home, bag): Eid order-by dates or the pre-order line, then the holiday notice. Empty: nothing. */
export async function storefrontBanner(deps: Deps, storeId: number, opts: { locale?: string } = {}): Promise<string[]> {
  const [eid, holiday, ctx] = await Promise.all([storefrontEid(deps, storeId, { locale: opts.locale }), holidayConfig(deps, storeId), textContext(deps, storeId, opts.locale)]);
  const notice = holidayNotice(holiday, holidayStatus(holiday, nowOf(deps), ctx.timeZone), ctx);
  return [...(eid.banner ?? []), ...(notice ? [notice] : [])];
}

/** Where each shop place reads its festive rules from (a rule's placements: the home page is `announcement`). */
const FESTIVE_PLACEMENT: Record<FestiveCutoffPlace, string> = { home: 'announcement', product: 'product', checkout: 'checkout' };

/**
 * PR 281 — the live festive rules' lines for one shop place, while the switch is on and the place ticked (else empty).
 * `band` null: the address is not known (every band counts); `want` 'closed': only the lines past the band's time;
 * `productId`: only the rules whose scope covers that product (a product page).
 */
export async function festiveFor(
  deps: Deps,
  storeId: number,
  opts: { place: FestiveCutoffPlace; band?: string | null; locale?: string; at?: Date; want?: 'open' | 'closed' | 'both'; productId?: string },
): Promise<FestiveLine[]> {
  const set = await setting(deps, storeId, 'marketing.festiveCutoff');
  if (!set.enabled || !set.places[opts.place]) return [];
  const [rules, ctx] = await Promise.all([cachedActiveRules(deps, storeId), textContext(deps, storeId, opts.locale)]);
  const facts = opts.productId ? (await scopeFacts(deps.db, storeId, [opts.productId])).get(opts.productId) : undefined;
  if (opts.productId && !facts) return [];
  const sorted = rules.filter((r) => !facts || inScope(r.scope, facts)).sort(resolutionOrder);
  return festiveLinesOf(sorted, { placement: FESTIVE_PLACEMENT[opts.place], band: opts.band ?? null, now: opts.at ?? nowOf(deps), want: opts.want }, ctx, othersByKey(rules));
}

/** One place, as the checkout settled it: its band key and its gazetteer place (null when the customer chose the band). */
export interface EtaPlace {
  band: string;
  areaId: string | null;
}

export interface PreorderAsk {
  /** Paid now, through the checkout's advance (bKash, Nagad, card). */
  advanceMinor: number;
  /** Paid on delivery. */
  restMinor: number;
  /** "Pre-order: ৳300 now, ৳1,200 on delivery …" in the customer's language (null when the words cannot be filled). */
  line: string | null;
}

export interface CheckoutEta {
  /** The lines shown in place of the usual hours promise; empty: the usual promise stands. */
  lines: string[];
  /** Pre-order is offered here now: its advance and line for what is due. Null: no pre-order (the default). */
  preorder: ((dueMinor: number) => PreorderAsk | null) | null;
}

/** The district's gazetteer code for a place (the place itself, or the district above it); only read when needed. */
async function districtOf(deps: Deps, areaId: string): Promise<string | null> {
  const a = await deps.db.geoArea.findUnique({ where: { id: areaId }, select: { level: true, code: true, ancestorIds: true } });
  if (!a) return null;
  if (a.level === 'DISTRICT') return a.code;
  const d = a.ancestorIds.length ? await deps.db.geoArea.findFirst({ where: { id: { in: a.ancestorIds }, level: 'DISTRICT' }, select: { code: true } }) : null;
  return d?.code ?? null;
}

/** The pre-order offer as amounts and words, for an amount due. */
function preorderAsk(config: EidConfig, ctx: TextContext): (dueMinor: number) => PreorderAsk | null {
  return (dueMinor) => {
    const offer = preorderOffer(config, dueMinor);
    if (!offer || offer.advanceMinor === null || offer.dueMinor === null || offer.advanceMinor <= 0) return null;
    return { advanceMinor: offer.advanceMinor, restMinor: offer.dueMinor, line: preorderLine(config, offer, ctx) };
  };
}

/**
 * What the checkout (and the thank-you page, with `at` = when the order was placed) says about when the order comes.
 * Without a place only the holiday counts (the Eid date belongs to a place).
 */
export async function checkoutEta(deps: Deps, storeId: number, opts: { place?: EtaPlace | null; locale?: string; at?: Date } = {}): Promise<CheckoutEta> {
  const [config, holiday, ctx] = await Promise.all([eidConfig(deps, storeId), holidayConfig(deps, storeId), textContext(deps, storeId, opts.locale)]);
  const now = opts.at ?? nowOf(deps);
  const lines: string[] = [];
  const promise = holidayPromise(holiday, holidayStatus(holiday, now, ctx.timeZone), ctx);
  if (promise) lines.push(promise);
  let preorder: CheckoutEta['preorder'] = null;
  if (opts.place) {
    const wantsDistrict = !!config.districtDates?.length && !!opts.place.areaId && config.enabled;
    const district = wantsDistrict ? await districtOf(deps, opts.place.areaId!) : null;
    const status = eidStatus(config, { band: opts.place.band, district }, now, ctx.timeZone);
    if (status.state === 'closed') {
      lines.push(lateLine(config, ctx));
      if (status.preorder) preorder = preorderAsk(config, ctx);
    }
    // PR 281: a festive rule already past this band's last order time says its "after" words instead of the promise
    const festive = await festiveFor(deps, storeId, { place: 'checkout', band: opts.place.band, locale: opts.locale, at: now, want: 'closed' });
    for (const f of festive) if (!lines.includes(f.text)) lines.push(f.text);
  }
  return { lines, preorder };
}
