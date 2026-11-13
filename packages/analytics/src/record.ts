// @extas/analytics — S15 · PR 338. Writes one validated event into `AnalyticsEvent` (packages/db schema, reserved
// `@stage S15 · PR 338`) — the shop's own database, nothing else, no outside service. The pure catalogue (events.ts)
// decides what is accepted; this file only stores it. Read by the per-page funnels (PR 339), the report section
// (PR 340) and the digests (PR 341); the AI commentary agent (PR 333) only ever explains what is already here —
// D5.3's own rule, "the AI explains; it never invents a number."
import type { Prisma, PrismaClient } from '@extas/db/client';
import { normalizeAnalyticsEvent, type AnalyticsEventName, type AnalyticsPropValue } from './events';

export interface AnalyticsDeps {
  db: PrismaClient;
  now?: () => Date;
}

export interface RawAnalyticsEventInput {
  name: unknown;
  pageType?: unknown;
  productId?: unknown;
  categoryId?: unknown;
  comboId?: unknown;
  sourceButton?: unknown;
  props?: unknown;
  /** ISO time the browser says the event happened; clamped against the server's own clock (`clampOccurredAt`). */
  occurredAt?: unknown;
}

export interface RecordAnalyticsEventInput extends RawAnalyticsEventInput {
  storeId: number;
  /** The browser's own anonymous id (the shop's existing visitor cookie, `visitorId()` in lib/shop/bag.ts — the
   *  same concept the bag, wishlist and orders already read; this layer mints no cookie of its own). */
  visitorId: string;
  sessionId?: string | null;
  customerId?: string | null;
  isLoggedIn: boolean;
}

export interface RecordedAnalyticsEvent {
  id: string;
  name: AnalyticsEventName;
}

/**
 * Records one shopper event. Returns `null` for a payload the catalogue does not recognise (an unknown name, or not
 * an object at all) rather than throwing — a caller never has to special-case a bad or stale client payload; it just
 * does not get stored (`events.ts`'s own "tracking can fail, the shop cannot").
 */
export async function recordAnalyticsEvent(deps: AnalyticsDeps, input: RecordAnalyticsEventInput): Promise<RecordedAnalyticsEvent | null> {
  const now = deps.now ? deps.now() : new Date();
  const e = normalizeAnalyticsEvent(input, now);
  if (!e) return null;
  const row = await deps.db.analyticsEvent.create({
    data: {
      storeId: input.storeId,
      name: e.name,
      visitorId: input.visitorId,
      sessionId: input.sessionId ?? null,
      customerId: input.customerId ?? null,
      isLoggedIn: input.isLoggedIn,
      pageType: e.pageType,
      productId: e.productId,
      categoryId: e.categoryId,
      comboId: e.comboId,
      sourceButton: e.sourceButton,
      props: (e.props ?? undefined) as Prisma.InputJsonValue | undefined,
      occurredAt: e.occurredAt,
    },
    select: { id: true },
  });
  return { id: row.id, name: e.name };
}

/** The props shape helper, re-exported so a caller building `props` by hand (a server-side hook, not a browser
 *  payload) gets the same type the catalogue stores. */
export type { AnalyticsPropValue };
