// PR 214 follow-up (CN-014 g; SIM-F-019) — Eid order-by dates, with no database: safe in the admin's browser code and
// in the storefront. Everything it needs comes in as an `EidConfig` (the `rules.eid.*` settings, eid-service.ts reads
// them) and the store's time zone; nothing is written here and no number or word is fixed in code.
//
// What it answers, for a customer's place (his delivery band, and his district when the address settled one):
//   off      the switch is off, there is no Eid day, or Eid has passed — say nothing;
//   none     no date was set for this place — promise nothing;
//   open     he can still order by `orderBy` (the district's own date wins over its band's) for delivery before Eid;
//   closed   his date has passed and Eid has not: the "may arrive after Eid" line (SIM-F-019: never the normal promise)
//            and, only when the owner switched pre-order on AND set its advance, the pre-order offer.
// Pre-order money (CN-018 answer 6): the advance is a fixed amount or a percentage of the order's total. The customer
// pays `advance` now and `due` = total − advance on delivery (lessons: every amount in customer copy is the amount
// due); an advance above the total is capped at the total, so `due` is never negative.
import { formatValue, langOf, type TextContext } from './text';

export interface LocalText {
  en: string;
  bn: string;
}

export interface EidConfig {
  enabled: boolean;
  /** Eid day, `YYYY-MM-DD`; null until the owner sets it. */
  eidDate: string | null;
  bandDates: { band: string; orderBy: string }[] | null;
  districtDates: { district: string; orderBy: string }[] | null;
  /** `HH:MM`: the last minute of the order-by day that still counts (store time zone). */
  cutoffTime: string;
  /** The banner shows from this many days before a place's order-by date. */
  showDaysBefore: number;
  bannerText: LocalText;
  lateText: LocalText;
  preorderEnabled: boolean | null;
  preorderAdvanceMinor: number | null;
  /** The advance is a fixed amount (`preorderAdvanceMinor`) or a share of the total (`preorderAdvancePercent`). */
  preorderAdvanceType: 'fixed' | 'percent';
  preorderAdvancePercent: number | null;
  /** At checkout, with the order's total: {advance} now and {due} on delivery. */
  preorderText: LocalText;
  /** On the shop-wide banner, with no order yet: {advance} only. */
  preorderBannerText: LocalText;
}

export interface EidPlace {
  /** The delivery band key the address settled (DeliveryBand.key). */
  band?: string | null;
  /** The district's gazetteer code, when the address settled one. */
  district?: string | null;
}

export interface PreorderOffer {
  /** The advance in money; null for a percentage advance when no total was given (the banner says the percentage). */
  advanceMinor: number | null;
  /** The percentage, for a percentage advance; null for a fixed one. */
  percent: number | null;
  /** What the customer pays on delivery: total − advance (never below 0). Null when no total was given. */
  dueMinor: number | null;
}

export type EidStatus =
  | { state: 'off' }
  | { state: 'none' }
  | { state: 'open'; orderBy: string; source: 'district' | 'band'; daysLeft: number }
  | { state: 'closed'; orderBy: string; source: 'district' | 'band'; preorder: PreorderOffer | null };

export type EidIssue =
  | 'EID_DATE_MISSING'
  | 'NO_DATES'
  | 'DATE_AFTER_EID'
  | 'UNKNOWN_BAND'
  | 'UNKNOWN_DISTRICT'
  | 'PREORDER_NO_ADVANCE'
  /** The banner words would not say the date (the promise needs it). */
  | 'BANNER_NEEDS_DATE'
  /** The pre-order words at checkout must say both the advance and the amount due on delivery. */
  | 'PREORDER_TEXT_NEEDS_AMOUNTS'
  /** The pre-order words on the banner must say the advance. */
  | 'PREORDER_BANNER_NEEDS_ADVANCE';

/** The store-local day and minute of an instant: `YYYY-MM-DD`, `HH:MM`. */
export function localParts(now: Date, timeZone: string): { day: string; time: string } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** The place's order-by date: the district's own date first, else its band's; null when neither is set. */
export function orderByFor(config: EidConfig, place: EidPlace): { orderBy: string; source: 'district' | 'band' } | null {
  const d = place.district ? config.districtDates?.find((r) => r.district === place.district) : undefined;
  if (d) return { orderBy: d.orderBy, source: 'district' };
  const b = place.band ? config.bandDates?.find((r) => r.band === place.band) : undefined;
  return b ? { orderBy: b.orderBy, source: 'band' } : null;
}

/** Is the advance for the chosen kind set (a fixed amount of at least 1, or a percentage of 1–100)? */
export function hasAdvance(config: EidConfig): boolean {
  if (config.preorderAdvanceType === 'percent') return !!config.preorderAdvancePercent && config.preorderAdvancePercent >= 1 && config.preorderAdvancePercent <= 100;
  return !!config.preorderAdvanceMinor && config.preorderAdvanceMinor >= 1;
}

/** Pre-order is offered only when the owner switched it on and set its advance (both are his, CN-018 answer 6). */
export function preorderOffer(config: EidConfig, totalMinor?: number | null): PreorderOffer | null {
  if (config.preorderEnabled !== true || !hasAdvance(config)) return null;
  const percent = config.preorderAdvanceType === 'percent' ? config.preorderAdvancePercent! : null;
  if (totalMinor === undefined || totalMinor === null) return { advanceMinor: percent === null ? config.preorderAdvanceMinor : null, percent, dueMinor: null };
  const total = Math.max(0, totalMinor);
  const wanted = percent === null ? config.preorderAdvanceMinor! : Math.round((total * percent) / 100);
  const advanceMinor = Math.min(wanted, total);
  return { advanceMinor, percent, dueMinor: total - advanceMinor };
}

/** Is the whole feature live now (switched on, an Eid day set, and that day not passed)? */
export function eidLive(config: EidConfig, now: Date, timeZone: string): boolean {
  if (!config.enabled || !config.eidDate) return false;
  return localParts(now, timeZone).day <= config.eidDate;
}

/** What to tell a customer at this place now (checkout, bag, thank-you page). `totalMinor` prices a pre-order. */
export function eidStatus(config: EidConfig, place: EidPlace, now: Date, timeZone: string, totalMinor?: number | null): EidStatus {
  if (!eidLive(config, now, timeZone)) return { state: 'off' };
  const by = orderByFor(config, place);
  if (!by) return { state: 'none' };
  const { day, time } = localParts(now, timeZone);
  const open = day < by.orderBy || (day === by.orderBy && time <= config.cutoffTime);
  if (open) return { state: 'open', ...by, daysLeft: daysBetween(day, by.orderBy) };
  return { state: 'closed', ...by, preorder: preorderOffer(config, totalMinor) };
}

export interface EidBannerBand {
  band: string;
  orderBy: string;
  daysLeft: number;
}

export type EidBanner =
  | { kind: 'dates'; bands: EidBannerBand[] }
  | { kind: 'preorder'; offer: PreorderOffer };

/**
 * The shop-wide banner (home, bag): one chip per band whose date is still open and within `showDaysBefore`; once every
 * band's date has passed, the pre-order line (only when pre-order is on with its advance); otherwise nothing.
 */
export function eidBanner(config: EidConfig, now: Date, timeZone: string): EidBanner | null {
  if (!eidLive(config, now, timeZone)) return null;
  const rows = config.bandDates ?? [];
  if (!rows.length) return null;
  const { day, time } = localParts(now, timeZone);
  const isOpen = (orderBy: string) => day < orderBy || (day === orderBy && time <= config.cutoffTime);
  const open = rows.filter((r) => isOpen(r.orderBy));
  if (open.length) {
    const bands = open
      .map((r) => ({ band: r.band, orderBy: r.orderBy, daysLeft: daysBetween(day, r.orderBy) }))
      .filter((b) => b.daysLeft <= config.showDaysBefore)
      .sort((a, b) => b.orderBy.localeCompare(a.orderBy));
    return bands.length ? { kind: 'dates', bands } : null;
  }
  const offer = preorderOffer(config);
  return offer ? { kind: 'preorder', offer } : null;
}

/** Why the feature cannot be switched on as it is (empty = it can). Bands and districts are checked when given. */
export function eidIssues(config: EidConfig, known: { bands?: readonly string[]; districts?: readonly string[] } = {}): EidIssue[] {
  const out = new Set<EidIssue>();
  if (!config.eidDate) out.add('EID_DATE_MISSING');
  const all = [...(config.bandDates ?? []).map((r) => r.orderBy), ...(config.districtDates ?? []).map((r) => r.orderBy)];
  if (!all.length) out.add('NO_DATES');
  if (config.eidDate && all.some((d) => d > config.eidDate!)) out.add('DATE_AFTER_EID');
  if (known.bands && (config.bandDates ?? []).some((r) => !known.bands!.includes(r.band))) out.add('UNKNOWN_BAND');
  if (known.districts && (config.districtDates ?? []).some((r) => !known.districts!.includes(r.district))) out.add('UNKNOWN_DISTRICT');
  if (config.preorderEnabled === true && !hasAdvance(config)) out.add('PREORDER_NO_ADVANCE');
  const has = (t: LocalText, token: string) => t.en.includes(`{${token}}`) && t.bn.includes(`{${token}}`);
  if (!has(config.bannerText, 'date')) out.add('BANNER_NEEDS_DATE');
  if (!has(config.preorderText, 'advance') || !has(config.preorderText, 'due')) out.add('PREORDER_TEXT_NEEDS_AMOUNTS');
  if (!has(config.preorderBannerText, 'advance')) out.add('PREORDER_BANNER_NEEDS_ADVANCE');
  return [...out];
}

/** Fills `{token}`s; a token with no value stays visible (the admin's check refuses such a text before it shows). */
export function fillEidText(text: string, values: Record<string, string>): string {
  return text.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (m, k: string) => (k in values ? values[k]! : m));
}

/** The `{token}`s a text may use, per text. */
export const EID_TEXT_TOKENS = { bannerText: ['band', 'date'], lateText: ['eid'], preorderText: ['advance', 'due', 'eid'], preorderBannerText: ['advance', 'eid'] } as const;

/** Tokens in a text that it may not use. */
export function unknownTokens(text: string, allowed: readonly string[]): string[] {
  return [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1]!).filter((t) => !allowed.includes(t));
}

/** A calendar day as customers read it ("6 Mar" / "৬ মার্চ"), in the store's language. */
export function formatDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${day}T00:00:00Z`));
}

const textIn = (t: LocalText, ctx: TextContext) => (langOf(ctx.locale) === 'bn' ? t.bn : t.en);

/** `{eid}` as the Eid day; with no Eid day the token stays visible (only the admin's preview can show that: the shop is off). */
const eidToken = (config: EidConfig, ctx: TextContext): Record<string, string> => (config.eidDate ? { eid: formatDay(config.eidDate, ctx.locale) } : {});

/** Band names as the shop shows them, per band key (from Delivery › bands). */
export type BandNames = Record<string, LocalText>;

/** The advance as customers read it: the money, or the percentage when no total is known yet. */
export function advanceText(offer: PreorderOffer, ctx: TextContext): string {
  if (offer.advanceMinor !== null) return formatValue('money', offer.advanceMinor, ctx) ?? '';
  return offer.percent !== null ? (formatValue('percent', offer.percent, ctx) ?? '') : '';
}

/** The banner as one line per band ("Order by 6 Mar for Dhaka city …"), or the pre-order line. */
export function eidBannerLines(config: EidConfig, banner: EidBanner, ctx: TextContext, names: BandNames = {}): string[] {
  if (banner.kind === 'preorder') return [fillEidText(textIn(config.preorderBannerText, ctx), { advance: advanceText(banner.offer, ctx), ...eidToken(config, ctx) })];
  return banner.bands.map((b) => fillEidText(textIn(config.bannerText, ctx), { band: names[b.band] ? textIn(names[b.band]!, ctx) : b.band, date: formatDay(b.orderBy, ctx.locale) }));
}

/** "May arrive after Eid" for a place past its date (SIM-F-019). */
export function lateLine(config: EidConfig, ctx: TextContext): string {
  return fillEidText(textIn(config.lateText, ctx), eidToken(config, ctx));
}

/**
 * The pre-order offer at checkout: the advance now and the amount due on delivery (never the order total). Needs the
 * order's total (an offer without one has no due amount, so it gives no line rather than a line with a gap).
 */
export function preorderLine(config: EidConfig, offer: PreorderOffer, ctx: TextContext): string | null {
  if (offer.dueMinor === null || offer.advanceMinor === null) return null;
  const money = (v: number) => formatValue('money', v, ctx) ?? '';
  return fillEidText(textIn(config.preorderText, ctx), { advance: money(offer.advanceMinor), due: money(offer.dueMinor), ...eidToken(config, ctx) });
}
