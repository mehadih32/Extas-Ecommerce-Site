// PR 552 — address autocomplete: type-ahead over the gazetteer, the one prefix matcher of places.ts (Bengali, English and
// the Banglish people type: Gabtali = Gabtoli, Sreepur = Sripur, Bogra = Bogura; prefix only, never fuzzy scoring).
// Every row carries what tells it apart and what it costs — the district (or division) and the band's charge — so a
// customer about to pick the wrong Gabtoli sees "বগুড়া · ১৩০৳" and stops. A place that holds more than one band ("Dhaka"
// district) shows no charge: picking it does not settle the band, the resolver asks. An off band shows no charge
// either. Reads only the gazetteer and the bands — never a customer.
import { z } from 'zod';
import type { BandMap } from './bands';
import { placeView, type PlaceView } from './bands-admin';
import { assertStore, loadBandMap, type DeliveryDeps } from './context';
import type { GeoEntry } from './gazetteer';
import { DeliveryError } from './errors';
import { matchPlaces } from './places';
import { bandOut, type BandOut } from './resolve-service';
import { normalize } from './text';

export interface Suggestion {
  place: PlaceView;
  /** The name that matched (an alias or a local spelling when that is what was typed). */
  matched: string;
  /** The band this place is charged as; null when the place holds several bands (picking it does not settle one). */
  band: BandOut | null;
}

export interface SuggestView {
  /** Off: the checkout shows a plain address box (setting delivery.suggest.enabled). */
  enabled: boolean;
  /** Fewer letters than delivery.suggest.minChars: nothing yet. */
  rows: Suggestion[];
}

/** One row: the place, the name that matched, and its one band — or none when the place spans several. */
export function suggestionOf(map: BandMap, entry: GeoEntry, matched: string): Suggestion {
  const span = map.spanOf(entry);
  const answer = map.bandOf(entry);
  return { place: placeView(map.gazetteer, entry), matched, band: span.size === 1 && answer ? bandOut(map, answer.charged) : null };
}

/** The suggestions for what a customer has typed so far, in one store. */
export async function suggestPlaces(deps: DeliveryDeps, storeId: number, input: unknown): Promise<SuggestView> {
  await assertStore(deps, storeId);
  const [enabled, minChars, limit, maxChars] = await Promise.all([
    deps.settings.value('delivery.suggest.enabled', { storeId }),
    deps.settings.value('delivery.suggest.minChars', { storeId }),
    deps.settings.value('delivery.suggest.limit', { storeId }),
    deps.settings.value('delivery.resolver.maxChars', { storeId }),
  ]);
  const r = z
    .object({ q: z.string().max(maxChars) })
    .strict()
    .safeParse(input ?? {});
  if (!r.success)
    throw new DeliveryError(
      'INVALID_INPUT',
      'the search is not valid',
      r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`),
    );
  if (!enabled) return { enabled: false, rows: [] };
  const q = normalize(r.data.q);
  if ([...q].length < minChars) return { enabled: true, rows: [] };
  const map = await loadBandMap(deps, storeId);
  return { enabled: true, rows: matchPlaces(map.gazetteer, q, limit).map((m) => suggestionOf(map, m.entry, m.name)) };
}
