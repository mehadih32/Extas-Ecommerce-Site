// PR 553 — the charge accuracy guard. The delivery charge is never computed from free text: the only way to a charge is
// a ResolvedArea, and the only way to a ResolvedArea is the resolver's sure answer (a gazetteer place, or the band the
// customer picked himself when he was asked). A ResolvedArea cannot be written by hand — it is checked against the
// ones this module minted — so a typed line, a client's figure or an object put together elsewhere gets UNRESOLVED,
// never a charge. Unresolved means ask, never guess. The order (S04) calls quoteLine on the server and keeps its
// answer; it never takes a charge from the browser.
import type { BandMap } from './bands';
import { assertStore, loadBandMap, type DeliveryDeps } from './context';
import { DeliveryError } from './errors';
import { resolveAddress, type Resolution } from './resolver';
import { bandOut, parseLineInput, resolverOptions, viewOf, withDistrictPromise, type BandOut, type ResolveView } from './resolve-service';

declare const resolved: unique symbol;

/** A place (or the customer's own band choice) the resolver settled — the only thing a charge is read from. */
export interface ResolvedArea {
  readonly [resolved]: true;
  readonly storeId: number;
  /** The gazetteer place; null only when the customer chose the band himself. */
  readonly areaId: string | null;
  readonly bandId: string;
  readonly via: 'line' | 'saved' | 'choice';
}

const minted = new WeakSet<object>();

/** True only for a ResolvedArea this module made from a resolver answer. */
export const isResolvedArea = (v: unknown): v is ResolvedArea => typeof v === 'object' && v !== null && minted.has(v);

/** The ResolvedArea of a sure resolver answer; null for a question (ask the customer, never guess). */
export function resolvedAreaOf(storeId: number, r: Resolution): ResolvedArea | null {
  if (r.status !== 'resolved') return null;
  const area = Object.freeze({ storeId, areaId: r.areaId, bandId: r.band.id, via: r.via }) as unknown as ResolvedArea;
  minted.add(area);
  return area;
}

export type Quote =
  /** The charge of the band the place is charged as (the owner's figure). */
  | { kind: 'charge'; band: BandOut; chargeMinor: number }
  /** The band is off: no charge exists yet — checkout says so and does not take the order on a made-up figure. */
  | { kind: 'not-set'; band: BandOut };

/** The charge for a resolved place, from the band map of the same store. Anything else is refused (UNRESOLVED). */
export function quoteDelivery(map: BandMap, storeId: number, area: unknown): Quote {
  if (!isResolvedArea(area)) throw new DeliveryError('UNRESOLVED', 'a delivery charge needs a resolved place', ['area']);
  if (area.storeId !== storeId) throw new DeliveryError('UNRESOLVED', 'the place was resolved for another store', ['storeId']);
  const band = map.bandById(area.bandId);
  if (!band) throw new DeliveryError('UNRESOLVED', 'the band of this place is gone', ['bandId']);
  const charged = map.chargedBand(band);
  const out = bandOut(map, charged);
  return charged.enabled ? { kind: 'charge', band: out, chargeMinor: charged.chargeMinor } : { kind: 'not-set', band: out };
}

export type LineQuote = { status: 'resolved'; read: ResolveView; area: ResolvedArea; quote: Quote } | { status: 'ask'; read: ResolveView };

/** The server's own read of a finished address: the question to ask, or the place and its charge (the order keeps it). */
export async function quoteLine(deps: DeliveryDeps, storeId: number, input: unknown): Promise<LineQuote> {
  await assertStore(deps, storeId);
  const opts = await resolverOptions(deps, storeId);
  const data = parseLineInput(input, opts.maxChars);
  const [map, promise] = await Promise.all([loadBandMap(deps, storeId), deps.settings.value('delivery.promise.districts', { storeId })]);
  const res = resolveAddress(map, data.line, opts, { savedAreaId: data.savedAreaId, confirmed: data.confirmed });
  // SIM-F-048: the district's own promise, when the owner set one (off as shipped)
  const read = withDistrictPromise(map, promise, viewOf(map, res));
  const area = resolvedAreaOf(storeId, res);
  return area ? { status: 'resolved', read, area, quote: quoteDelivery(map, storeId, area) } : { status: 'ask', read };
}
