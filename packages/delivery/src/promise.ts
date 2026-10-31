// SIM-F-048 · PR 550 follow-up — the delivery promise per district (`delivery.promise.districts`, off as shipped): a
// district the owner gave its own hours promises those instead of its band's, wherever the band's hours are shown or
// counted for one place — the checkout (resolveLine), the thank-you and order pages (@extas/checkout orderReceipt)
// and the order cards' late flag (@extas/accounts). A place with no district, or a district with no row, keeps its
// band's hours. Reads only; nothing here changes a charge, a price or Cash on Delivery.
import type { PrismaClient } from '@extas/db/client';
import { eidConfig, holidayConfig } from '@extas/rules';
import { eidStatus, holidayStatus, localParts } from '@extas/rules/pure';
import type { DistrictPromiseSettings, Key, Value } from '@extas/settings';

/** The settings reader the promise clock needs (any of the packages' readers). */
interface RulesSettings {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

/** A promise in hours, as a band holds it. */
export interface PromiseHours {
  hoursMin: number | null;
  hoursMax: number | null;
}

/** The district's own hours when the setting is on and has its row; else the band's, unchanged. */
export function districtHours<T extends PromiseHours>(config: DistrictPromiseSettings, district: string | null | undefined, band: T): T {
  if (!config.enabled || !district) return band;
  const row = config.rows.find((r) => r.district === district);
  return row ? { ...band, hoursMin: row.hoursMin, hoursMax: row.hoursMax } : band;
}

interface Deps {
  db: Pick<PrismaClient, 'geoArea'>;
  settings: { value(key: 'delivery.promise.districts', target: { storeId: number }): Promise<DistrictPromiseSettings> };
}

/**
 * The district code of each gazetteer place given (itself when it is a district, else the district above it), only
 * when the store's setting is on with rows — otherwise an empty map and no read. With the config, for districtHours.
 */
export async function districtPromises(deps: Deps, storeId: number, areaIds: readonly (string | null | undefined)[]): Promise<{ config: DistrictPromiseSettings; districtOf: Map<string, string> }> {
  const config = await deps.settings.value('delivery.promise.districts', { storeId });
  if (!config.enabled || !config.rows.length) return { config, districtOf: new Map() };
  return { config, districtOf: await districtCodesOf(deps.db, areaIds) };
}

/** The district code of each gazetteer place given (itself when it is a district, else the district above it). */
export async function districtCodesOf(db: Pick<PrismaClient, 'geoArea'>, areaIds: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const districtOf = new Map<string, string>();
  const ids = [...new Set(areaIds.filter((a): a is string => !!a))];
  if (!ids.length) return districtOf;
  const areas = await db.geoArea.findMany({ where: { id: { in: ids } }, select: { id: true, level: true, code: true, ancestorIds: true } });
  const above = [...new Set(areas.filter((a) => a.level !== 'DISTRICT').flatMap((a) => a.ancestorIds))];
  const districts = above.length ? await db.geoArea.findMany({ where: { id: { in: above }, level: 'DISTRICT' }, select: { id: true, code: true } }) : [];
  const codeOf = new Map(districts.map((d) => [d.id, d.code]));
  for (const a of areas) {
    const code = a.level === 'DISTRICT' ? a.code : (a.ancestorIds.map((x) => codeOf.get(x)).find((c) => !!c) ?? null);
    if (code) districtOf.set(a.id, code);
  }
  return districtOf;
}

// ---------------------------------------------------------------------------------------------------------------------
// Review R3 (customer M2, M3) — the one promise clock. Everything that says "late" (the staff Late list and the courier's
// `shipment.late` that starts the late apology, the apology credit's candidates, the courier report, the customer's
// order cards and order page) asks this, the same promise the checkout gave: the district's own hours (above), counted
// from when the order was placed — or, for an order placed during the owner's holiday break (`delivery.holiday`, PR
// 193), from the day the shop ships again; an order placed past its place's Eid date ("may arrive after Eid") has no
// hours promise, so it is never late. Reads only.
// ---------------------------------------------------------------------------------------------------------------------

/** One order as the clock reads it: when it was placed, its gazetteer place and its band (null: no band). */
export interface ClockOrder {
  id: string;
  placedAt: Date;
  areaId: string | null;
  band: { key: string; hoursMin: number | null; hoursMax: number | null } | null;
}

/** The promise an order was given. */
export interface OrderPromise {
  hoursMin: number | null;
  hoursMax: number | null;
  /** When the hours count from: the placing, or the first day after the holiday break it was placed in. */
  from: Date;
  /** Placed past its place's Eid date: the checkout said "may arrive after Eid" instead of hours. */
  afterEid: boolean;
}

interface ClockDeps {
  db: Pick<PrismaClient, 'geoArea'>;
  settings: RulesSettings;
}

/** Midnight of `day` (`YYYY-MM-DD`) in the store's time zone. */
export function zonedMidnight(day: string, timeZone: string): Date {
  const guess = Date.parse(`${day}T00:00:00Z`);
  const p = localParts(new Date(guess), timeZone);
  const shown = Date.parse(`${p.day}T${p.time}:00Z`);
  return new Date(guess - (shown - guess));
}

/** The promise of each order given, by its id (see the section header). */
export async function orderPromises(deps: ClockDeps, storeId: number, orders: readonly ClockOrder[]): Promise<Map<string, OrderPromise>> {
  const out = new Map<string, OrderPromise>();
  if (!orders.length) return out;
  const [promise, holiday, eid, timeZone] = await Promise.all([
    districtPromises(deps, storeId, orders.map((o) => o.areaId)),
    holidayConfig(deps, storeId),
    eidConfig(deps, storeId),
    deps.settings.value('store.timeZone', { storeId }),
  ]);
  // the Eid date of a district (only read while the owner's Eid dates are on and have district rows)
  const eidDistrict = eid.enabled && !!eid.districtDates?.length ? (promise.districtOf.size ? promise.districtOf : await districtCodesOf(deps.db, orders.map((o) => o.areaId))) : new Map<string, string>();
  for (const o of orders) {
    const district = o.areaId ? (promise.districtOf.get(o.areaId) ?? null) : null;
    const hours = o.band ? districtHours(promise.config, district, { hoursMin: o.band.hoursMin, hoursMax: o.band.hoursMax }) : { hoursMin: null, hoursMax: null };
    const h = holidayStatus(holiday, o.placedAt, timeZone);
    const from = h.state === 'on' ? zonedMidnight(h.resume, timeZone) : o.placedAt;
    const afterEid = !!o.band && eidStatus(eid, { band: o.band.key, district: o.areaId ? (eidDistrict.get(o.areaId) ?? null) : null }, o.placedAt, timeZone).state === 'closed';
    out.set(o.id, { hoursMin: hours.hoursMin, hoursMax: hours.hoursMax, from, afterEid });
  }
  return out;
}

/** When a promise was due (null: none in hours — no band hours, or "may arrive after Eid"). */
export function promiseDueBy(p: OrderPromise | undefined): Date | null {
  if (!p || p.afterEid || p.hoursMax === null || p.hoursMax <= 0) return null;
  return new Date(p.from.getTime() + p.hoursMax * HOUR_MS);
}

const HOUR_MS = 3_600_000;
