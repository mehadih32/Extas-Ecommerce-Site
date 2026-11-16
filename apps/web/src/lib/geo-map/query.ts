// S29 · PR 752 (CN-054) — what Reports › Geography map asks for, made safe. The page and the API read the same query:
//   period=day|month|sixMonths|year|custom  with from= and to= (a day, or a custom range)   — the report period bar (PR 689)
//   level=division|district|upazila|area    parent=<area id> (a drill-down)    category=<id> (or cat=)  product=<id>
//   channel= pay= courier= cust=   the order-level slices of PR 756 (only the ones the setting `slices` shows count)
//   compare=off|previous|lastYear|custom    with cfrom= and cto= for custom
// Anything unknown falls back to the setting's opening choices (`reports.geoMap`), never to a guess: the longest period
// is the existing `costs.report` limit (never a second one), a period never reaches past today, a reversed one is turned
// round, and each change is named in `notes` so the page can say what it did. Pure: no database, no clock (the caller
// gives today).
import {
  slicesFromSearch,
  type GeoSlices as OrderSlices,
} from "@extas/metrics";
import {
  GEO_COMPARES,
  GEO_LEVELS,
  GEO_PERIODS,
  type GeoCompare,
  type GeoLevel,
  type GeoPeriod,
} from "@extas/metrics/geo-types";
import { parseReportQuery, type ReportLimits } from "../cost-report";

export interface GeoMapDefaults {
  defaultPeriod: Exclude<GeoPeriod, 'custom'>;
  compareDefault: boolean;
}

export interface GeoMapQuery {
  period: GeoPeriod;
  days: { from: string; to: string };
  level: GeoLevel;
  parentAreaId: string | null;
  compare: GeoCompare;
  /** The caller's own compare days (only for `custom`). */
  compareDays: { from: string; to: string } | null;
  categoryId: string | null;
  productId: string | null;
  /** PR 756: the order-level slices (?channel= &pay= &courier= &cust=); the server drops the ones the setting hides. */
  slices: Pick<
    OrderSlices,
    "channel" | "paymentType" | "courierId" | "customerType"
  >;
  notes: ("future" | "swapped" | "tooLong" | "badCompare")[];
}

type Sp = Record<string, string | string[] | undefined>;
const one = (sp: Sp, k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isDay = (s: unknown): s is string => typeof s === 'string' && YMD.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The first day of "6 months": six calendar months back, the day after (a 6-month window ending today). */
export function sixMonthsFrom(today: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const back = new Date(Date.UTC(y, m - 1 - 6, d));
  // 31 Aug − 6 months = 31 Feb: the last day of the shorter month
  const back2 = back.getUTCMonth() !== (((m - 1 - 6) % 12) + 12) % 12 ? new Date(Date.UTC(y, m - 6, 0)) : back;
  return addDays(back2.toISOString().slice(0, 10), 1);
}

/** The days of a period preset, `today` being the store's own date. */
export function periodDays(period: GeoPeriod, today: string, from?: string, to?: string): { from: string; to: string } {
  if (period === 'custom' && isDay(from) && isDay(to)) return { from, to };
  if (period === 'day') {
    const d = isDay(from) ? from : today;
    return { from: d, to: d };
  }
  if (period === 'sixMonths') return { from: sixMonthsFrom(today), to: today };
  if (period === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/** The query of the page or the API, made safe. */
export function parseGeoMapQuery(sp: Sp, today: string, limits: ReportLimits, defaults: GeoMapDefaults): GeoMapQuery {
  const asked = GEO_PERIODS.find((p) => p === one(sp, 'period'));
  const period: GeoPeriod = asked ?? (isDay(one(sp, 'from')) && isDay(one(sp, 'to')) ? 'custom' : defaults.defaultPeriod);
  const raw = periodDays(period, today, one(sp, 'from'), one(sp, 'to'));
  const parsed = parseReportQuery({ from: raw.from, to: raw.to }, today, limits);
  const days = { from: parsed.q.from, to: parsed.q.to };
  const notes: GeoMapQuery['notes'] = parsed.notes.filter((n): n is 'future' | 'swapped' | 'tooLong' => n !== 'byMonth');

  const level = GEO_LEVELS.find((l) => l === one(sp, 'level')) ?? 'district';
  const parent = one(sp, 'parent');
  const parentAreaId = parent && UUID.test(parent) ? parent.toLowerCase() : null;
  const id = (v: string | undefined) => (v && UUID.test(v) ? v.toLowerCase() : null);

  let compare: GeoCompare = GEO_COMPARES.find((c) => c === one(sp, 'compare')) ?? (defaults.compareDefault ? 'previous' : 'off');
  let compareDays: GeoMapQuery['compareDays'] = null;
  if (compare === 'custom') {
    const cf = one(sp, 'cfrom');
    const ct = one(sp, 'cto');
    if (isDay(cf) && isDay(ct)) {
      const [from, to] = cf <= ct ? [cf, ct] : [ct, cf];
      compareDays = { from, to: to > today ? today : to };
      if (compareDays.from > compareDays.to) compareDays = { from: compareDays.to, to: compareDays.to };
    } else {
      compare = 'previous';
      notes.push('badCompare');
    }
  }
  return {
    period,
    days,
    level,
    parentAreaId,
    compare,
    compareDays,
    categoryId: id(one(sp, "category") ?? one(sp, "cat")),
    productId: id(one(sp, "product")),
    slices: orderSlices(sp),
    notes,
  };
}

/** The order-level slices of an address (the category and product are read apart). */
function orderSlices(sp: Sp): GeoMapQuery["slices"] {
  const { channel, paymentType, courierId, customerType } =
    slicesFromSearch(sp);
  return {
    ...(channel ? { channel } : {}),
    ...(paymentType ? { paymentType } : {}),
    ...(courierId ? { courierId } : {}),
    ...(customerType ? { customerType } : {}),
  };
}
