// S13 · PR 532 follow-up (664) — the order's server event ids, shared with a browser pixel for de-duplication.
//
// - The shop sends every order event from its own server (PR 257, 258, 532) under ids it makes from the order number
//   (`purchase-<n>`, `confirmed-<n>`, `delivered-<n>`, `shipped-<n>`, `returned-<n>`, `qualified-<n>`). A pixel the
//   owner adds in the browser (through a tag manager) can only be matched with them when it fires the same event under
//   the same id; until now no page said which ids those are.
// - While `ads.conversionFeed.shareIds` is on (off as it ships) and tracking is on, the thank-you page carries one inert
//   data block (`<script type="application/json" id="extas-event-ids">`, no code runs) listing, for each ticked
//   platform, every event the server will send for this order with the platform's own event name and the id. A tag
//   reads it and fires its event under that id; the platform then counts the two once.
// - Only the order number (already in the page's address) and event names; never a name, phone, e-mail or amount.
import { GOOGLE_EVENT, META_EVENT, TIKTOK_EVENT, type AdEventName, type AdPlatform } from '@extas/adapters';
import { tickedPlatforms, type ConversionFeedSettings, type DeliveredPurchaseSettings, type TrackingSettings } from '@extas/settings';
import { settingsResolver } from '../settings';
import { adNameOf, generousOn, records, recordsFeed, recordsStep, type FeedTrackingEvent, type OrderTrackingEvent } from './model';
import { stepEventId } from './orders';

/** The element id of the data block (a tag manager reads it). */
export const SHARED_IDS_ELEMENT = 'extas-event-ids';

const NAMES: Record<AdPlatform, Record<AdEventName, string>> = { meta: META_EVENT, google: GOOGLE_EVENT, tiktok: TIKTOK_EVENT };

export interface SharedIds {
  order: string;
  /** Per ticked platform: each server event of this order as {name: the platform's event name, id}. */
  events: Partial<Record<AdPlatform, { name: string; id: string }[]>>;
}

/** The ids the server will use for this order, per ticked platform (pure); null while sharing is off. */
export function sharedIds(number: string, s: { t: TrackingSettings; dp: DeliveredPurchaseSettings; feed: ConversionFeedSettings }): SharedIds | null {
  if (!s.feed.shareIds || !s.t.on) return null;
  const means = s.dp.on ? s.dp.purchaseMeans : 'placed';
  const steps: ('purchase' | OrderTrackingEvent | FeedTrackingEvent)[] = [
    ...(records(s.t, 'purchase') ? (['purchase'] as const) : []),
    ...(['confirmed', 'delivered'] as const).filter((e) => recordsStep(s.t, s.dp, e)),
    ...(['shipped', 'returned', 'qualified'] as const).filter((e) => recordsFeed(s.t, s.dp, s.feed, e)),
  ];
  const events: SharedIds['events'] = {};
  for (const p of tickedPlatforms(s.t)) {
    const generous = generousOn(s.dp, s.feed, p);
    // the qualified sale goes only to a generous platform
    const list = steps.filter((e) => e !== 'qualified' || generous).map((e) => ({ name: NAMES[p][adNameOf(e, means, generous)], id: e === 'purchase' ? `purchase-${number.replace(/[^A-Za-z0-9_.:-]/g, '-')}` : stepEventId(e, number) }));
    if (list.length) events[p] = list;
  }
  return Object.keys(events).length ? { order: number, events } : null;
}

/** The thank-you page's block for this order (null: sharing off, no database, or a slow settings read). */
export async function orderSharedIds(storeId: number, number: string): Promise<SharedIds | null> {
  const r = settingsResolver();
  if (!r) return null;
  try {
    const at = { storeId };
    const [t, dp, feed] = await Promise.all([r.value('ads.tracking', at), r.value('ads.deliveredPurchase', at), r.value('ads.conversionFeed', at)]);
    return sharedIds(number, { t, dp, feed });
  } catch {
    return null;
  }
}
