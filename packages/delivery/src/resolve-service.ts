// PR 551 — the resolver as a service: the checkout (S04) and the admin's "Try an address" box send a finished line and
// get either the band (with its charge when the band is on) or the question to ask. Reads only: no person, no audit.
// The answer carries the owner's figures for the band and the place's name — nothing about any customer.
import { z } from 'zod';
import type { BandMap, BandRole, BandRow } from './bands';
import { allow, assertStore, loadBandMap, type DeliveryDeps, type Who } from './context';
import { DeliveryError } from './errors';
import { placeView, type PlaceView } from './bands-admin';
import { resolveAddress, type AskReason, type Resolution, type ResolverOptions } from './resolver';

/** A band as the customer sees it: the charge only while the band is on (an off band has no charge yet). */
export interface BandOut {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  role: BandRole;
  priced: boolean;
  chargeMinor: number | null;
  hoursMin: number | null;
  hoursMax: number | null;
}

export type ResolveView =
  | { status: 'resolved'; area: PlaceView | null; band: BandOut; via: 'line' | 'saved' | 'choice'; placeSure: boolean; clues: string[] }
  | { status: 'ask'; reason: AskReason; options: { band: BandOut; places: PlaceView[] }[]; clues: string[] };

export function bandOut(map: BandMap, b: BandRow): BandOut {
  return { id: b.id, key: b.key, nameEn: b.nameEn, nameBn: b.nameBn, role: map.roleOf(b), priced: b.enabled, chargeMinor: b.enabled ? b.chargeMinor : null, hoursMin: b.hoursMin, hoursMax: b.hoursMax };
}

export function viewOf(map: BandMap, r: Resolution): ResolveView {
  const g = map.gazetteer;
  if (r.status === 'resolved') {
    const e = g.get(r.areaId);
    return { status: 'resolved', area: e ? placeView(g, e) : null, band: bandOut(map, r.band), via: r.via, placeSure: r.placeSure, clues: r.clues };
  }
  return { status: 'ask', reason: r.reason, options: r.options.map((o) => ({ band: bandOut(map, o.band), places: o.places.map((p) => placeView(g, p)) })), clues: r.clues };
}

/** How the resolver reads a line in this store (settings delivery.resolver.*). */
export async function resolverOptions(deps: DeliveryDeps, storeId: number): Promise<ResolverOptions & { maxChars: number }> {
  const [minKeyChars, numberLabels, maxChars] = await Promise.all([
    deps.settings.value('delivery.resolver.minKeyChars'),
    deps.settings.value('delivery.resolver.numberLabels'),
    deps.settings.value('delivery.resolver.maxChars', { storeId }),
  ]);
  return { minKeyChars, numberLabels, maxChars };
}

/** When the checkout's address field counts as finished (the screen's settle controller reads these). */
export async function settleTimings(deps: DeliveryDeps, storeId: number): Promise<{ settleMs: number; minWords: number }> {
  const [settleMs, minWords] = await Promise.all([deps.settings.value('delivery.resolver.settleMs', { storeId }), deps.settings.value('delivery.resolver.minWords', { storeId })]);
  return { settleMs, minWords };
}

const id = z.string().trim().min(1).max(64);

/** Reads one finished line for a store: the band, or the question to ask. */
export async function resolveLine(deps: DeliveryDeps, storeId: number, input: unknown): Promise<ResolveView> {
  await assertStore(deps, storeId);
  const opts = await resolverOptions(deps, storeId);
  const schema = z
    .object({
      line: z.string().max(opts.maxChars),
      savedAreaId: id.nullable().optional(),
      confirmed: z.object({ bandId: id, areaId: id.nullable().optional() }).strict().nullable().optional(),
    })
    .strict();
  const r = schema.safeParse(input ?? {});
  if (!r.success)
    throw new DeliveryError(
      'INVALID_INPUT',
      'the address is not valid',
      r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`),
    );
  const map = await loadBandMap(deps, storeId);
  return viewOf(map, resolveAddress(map, r.data.line, opts, { savedAreaId: r.data.savedAreaId, confirmed: r.data.confirmed }));
}

/** The admin's "Try an address" box: the same read, as the owner (needs `delivery.read`). */
export async function tryAddress(deps: DeliveryDeps, who: Who, input: unknown): Promise<ResolveView> {
  await allow(deps, who, 'delivery.read');
  return resolveLine(deps, who.storeId, input);
}
