// PR 65 — what the order page needs to offer "Rate & review" (demo 60-account.js `ord_revHTML`): the shop's own rules
// for writing a review, what this customer has written on this order already, and — only while the owner has switched
// the photo perk on with his own amount — what an approved photo review is worth, in his own words.
//
// Nobody but the signed-in customer whose order it is gets the box: a guest's order (this browser placed it, but no
// account) has no wallet and no name to come back to, so it is not offered one. Without a database, or when a read is
// slow, the box is simply not offered — the page never guesses.
import { reviewChance, type ReviewState } from '@extas/catalogue';
import { accountDeps, signedIn } from './account';
import type { ShopContext } from './context';
import { readPageSettings } from './context';
import { settingsTimeoutMs, withTimeout } from '../settings';

export interface OrderReviewBox {
  /** The review form may be offered on this order (delivered, in time, reviews on). */
  ask: boolean;
  /** What he has written already, by order line. */
  reviewed: Record<string, ReviewState>;
  /** Which questions the shop asks, and the photo's own limits. */
  askFit: boolean;
  askBody: boolean;
  bodyMax: number;
  photos: boolean;
  photoMaxMb: number;
  /** What an approved photo review is worth here, in poisha (null: the owner has not switched the perk on). */
  rewardMinor: number | null;
}

export async function orderReviewBox(c: Pick<ShopContext, 'storeId'>, orderNumber: string): Promise<OrderReviewBox | null> {
  const deps = accountDeps();
  const me = await signedIn();
  if (!deps || !me) return null;
  try {
    return await withTimeout(
      (async () => {
        const s = await readPageSettings(['reviews.submit', 'reviews.photoReward'] as const, c.storeId);
        const submit = s['reviews.submit'];
        const reward = s['reviews.photoReward'];
        if (!submit.enabled) return null;
        const chance = await reviewChance({ db: deps.db, settings: deps.settings, ...(deps.now ? { now: deps.now } : {}) }, { storeId: c.storeId, customerId: me.customer.id, orderNumber });
        if (chance.why === 'not-found') return null;
        const reviewed: Record<string, ReviewState> = {};
        for (const l of chance.lines) if (l.reviewed) reviewed[l.orderItemId] = l.reviewed;
        return {
          ask: chance.can,
          reviewed,
          askFit: submit.askFit,
          askBody: submit.askBody,
          bodyMax: submit.bodyMax,
          photos: submit.photos.enabled,
          photoMaxMb: submit.photos.maxMb,
          rewardMinor: reward.enabled && reward.amountMinor && reward.amountMinor > 0 ? reward.amountMinor : null,
        };
      })(),
      settingsTimeoutMs() * 3,
    );
  } catch (e) {
    console.warn(`shop: the review box is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}
