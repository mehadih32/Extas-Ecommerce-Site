// S29 · PR 754 (CN-054) — Reports › Geography map, the period compare as the screen shows it. The figures come from
// `geoByArea` (it fills `previous` and `delta` of every row); this file is what the screen needs around them, with no
// database: which days the earlier period is (so the screen can name it), the plain difference and per cent change of
// a figure, and the two-sided colour step of the "Change" figure (never the colour alone: the number is always beside
// it). An area that has no figure in one period counts as zero there (the plan, section 4), never as "new" or "gone".
import type { GeoAreaFigures, GeoAreaRow, GeoCompare, GeoDays } from '@extas/metrics';

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DAY = 86_400_000;

/** A store day (YYYY-MM-DD) as UTC midnight; null when it is not a real day. */
function parseDay(day: string): number | null {
  const m = DAY.exec(day);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? t : null;
}
const text = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The days in a period, both ends included; 0 when the period is not two real days in order. */
export function dayCount(days: GeoDays): number {
  const a = parseDay(days.from);
  const b = parseDay(days.to);
  return a === null || b === null || b < a ? 0 : Math.round((b - a) / MS_DAY) + 1;
}

/** The same calendar day one year earlier (29 Feb becomes 28 Feb). */
function yearBefore(t: number): number {
  const d = new Date(t);
  const y = d.getUTCFullYear() - 1;
  const last = new Date(Date.UTC(y, d.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(y, d.getUTCMonth(), Math.min(d.getUTCDate(), last));
}

/**
 * The days the earlier column covers: `previous` = the same number of days straight before the period, `lastYear` =
 * the same dates a year earlier, `custom` = the two days the person typed (null when they are not real days in order),
 * `off` = none.
 */
export function compareRange(days: GeoDays, mode: GeoCompare, custom?: GeoDays | null): GeoDays | null {
  const n = dayCount(days);
  if (mode === 'off' || n === 0) return null;
  const from = parseDay(days.from)!;
  const to = parseDay(days.to)!;
  if (mode === 'previous') return { from: text(from - n * MS_DAY), to: text(from - MS_DAY) };
  if (mode === 'lastYear') return { from: text(yearBefore(from)), to: text(yearBefore(to)) };
  return custom && dayCount(custom) > 0 ? { from: custom.from, to: custom.to } : null;
}

/** current − previous; null when either side is not known. */
export const diffOf = (now: number | null, before: number | null): number | null => (now === null || before === null ? null : now - before);

/** The change in per cent of the earlier figure; null when the earlier one is 0 or unknown (no division by nothing). */
export function percentChange(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

/** The figure "Change" colours the map by: sales when the viewer may see money, else orders. */
export function changeOf(row: Pick<GeoAreaRow, 'delta'>, moneyHidden: boolean): number | null {
  if (!row.delta) return null;
  return moneyHidden || row.delta.salesMinor === null ? row.delta.orders : row.delta.salesMinor;
}

/**
 * The two-sided colour step of a change: 0 for no change, +1…+steps for a rise, −1…−steps for a fall, by the size of the
 * change against the biggest change on the map (`maxAbs`). A step never rounds a real change down to 0.
 */
export function changeStep(change: number | null, maxAbs: number, steps: number): number {
  if (change === null || change === 0 || !(maxAbs > 0) || steps < 1) return 0;
  const k = Math.max(1, Math.min(steps, Math.ceil((Math.abs(change) / maxAbs) * steps)));
  return change > 0 ? k : -k;
}

/** The biggest absolute change over the rows that have one (0 when none has). */
export function maxChange(rows: readonly Pick<GeoAreaRow, 'delta'>[], moneyHidden: boolean): number {
  return rows.reduce((m, r) => Math.max(m, Math.abs(changeOf(r, moneyHidden) ?? 0)), 0);
}

/** The class the map and the table give a change: `geo-up-3`, `geo-down-1`, `geo-flat` (the colours are tokens in the CSS). */
export const changeClass = (step: number): string => (step === 0 ? 'geo-flat' : step > 0 ? `geo-up-${step}` : `geo-down-${-step}`);

/**
 * Is a rise good news or bad news? Orders, sales and delivered are good when they rise; returned and the return rate are
 * good when they fall. The colour of the Change figure follows sales or orders (good when up); the panel's own lines
 * use this to say which way is good.
 */
export const GOOD_WHEN = { orders: 'up', sales: 'up', delivered: 'up', returned: 'down', returnRate: 'down' } as const satisfies Record<string, 'up' | 'down'>;
export type PanelKey = keyof typeof GOOD_WHEN;

/** An area that has no figure in the earlier period counts as zero there. */
export const ZERO_FIGURES: GeoAreaFigures = { orders: 0, delivered: 0, salesMinor: 0, pieces: 0, returned: 0, returnRate: null };

/** The earlier figures to show: the row's own, or zeros when compare is on and the area had nothing; null when compare is off. */
export function earlier(previous: GeoAreaFigures | null, compareOn: boolean, moneyHidden: boolean): GeoAreaFigures | null {
  if (!compareOn) return null;
  return previous ?? { ...ZERO_FIGURES, salesMinor: moneyHidden ? null : 0 };
}

// ---- the compare choice in the screen's address (?compare=previous|lastYear|custom&cfrom=…&cto=…) ----

export const COMPARE_MODES: readonly GeoCompare[] = ['off', 'previous', 'lastYear', 'custom'];
type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/**
 * The compare choice from the address. No `compare` in the address means the setting's own default (`compareDefault`):
 * "previous" when it is on, "off" when it is not. A custom choice without two real days in order falls back to off.
 */
export function compareFromSearch(sp: Search, compareDefault: boolean): { mode: GeoCompare; custom: GeoDays | null } {
  const asked = first(sp.compare);
  const mode = (COMPARE_MODES as readonly string[]).includes(asked ?? '') ? (asked as GeoCompare) : compareDefault ? 'previous' : 'off';
  if (mode !== 'custom') return { mode, custom: null };
  const custom = { from: first(sp.cfrom) ?? '', to: first(sp.cto) ?? '' };
  return dayCount(custom) > 0 ? { mode, custom } : { mode: 'off', custom: null };
}

/** The address parts of a compare choice. `off` is written out (so it beats a default that is on). */
export function compareParams(mode: GeoCompare, custom?: GeoDays | null): Record<string, string> {
  if (mode === 'custom' && custom && dayCount(custom) > 0) return { compare: 'custom', cfrom: custom.from, cto: custom.to };
  return { compare: mode === 'custom' ? 'off' : mode };
}
